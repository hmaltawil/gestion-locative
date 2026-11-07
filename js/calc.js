// Rent calculations: what is due, what was paid, what is late, indexation.
// Pure functions so they can be tested in Node (see tests/).

import {
  addMonths, addYears, daysInMonth, lastDayOfPeriod, pad2, periodOf, splitPeriod,
} from './util.js';
import { irlKey, latestForQuarter } from './irl.js';

export function isActive(lease, today) {
  return !lease.endDate || lease.endDate >= today;
}

export function sortedRents(lease) {
  return [...(lease.rents || [])].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

// Rent and charges in force for a period ('YYYY-MM').
export function rentAt(lease, period) {
  const rents = sortedRents(lease);
  if (!rents.length) return { rent: 0, charges: 0, from: period };
  let cur = rents[0];
  for (const r of rents) if (r.from <= period) cur = r;
  return cur;
}

export function currentRent(lease, today) {
  return rentAt(lease, periodOf(today));
}

// The rent entry the lease form edits: the one in force today (or on the last
// day of an ended lease). Correcting it fixes a typing mistake; a real change
// from a given month is a new entry ("Change rent").
export function rentEntryToCorrect(lease, today) {
  if (!(lease.rents || []).length) return null;
  const day = lease.endDate && lease.endDate < today ? lease.endDate : today;
  return rentAt(lease, periodOf(day));
}

// The lease's rents with that entry's amounts replaced; the rest of the
// history (earlier amounts, revisions, later changes) is kept.
export function correctRent(lease, today, rent, charges) {
  const entry = rentEntryToCorrect(lease, today);
  const fixed = entry ? { ...entry, rent, charges } : { from: periodOf(lease.startDate), rent, charges, reason: 'initial' };
  return [...sortedRents(lease).filter((r) => r.from !== fixed.from), fixed]
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

// Amount due for one month, pro-rated for the first and last month.
export function dueForPeriod(lease, period) {
  const r = rentAt(lease, period);
  const { y, m } = splitPeriod(period);
  const dim = daysInMonth(y, m);
  let from = 1;
  let to = dim;
  if (lease.startDate && periodOf(lease.startDate) === period) from = Number(lease.startDate.slice(8, 10));
  if (lease.endDate && periodOf(lease.endDate) === period) to = Number(lease.endDate.slice(8, 10));
  const days = Math.max(0, to - from + 1);
  const full = days === dim;
  const factor = days / dim;
  const rent = full ? r.rent : Math.round(r.rent * factor);
  const charges = full ? r.charges : Math.round(r.charges * factor);
  return {
    period,
    rent,
    charges,
    total: rent + charges,
    fromDate: `${period}-${pad2(from)}`,
    toDate: `${period}-${pad2(to)}`,
    prorata: full ? null : { days, dim },
  };
}

export function dueDateFor(lease, period) {
  const { y, m } = splitPeriod(period);
  const day = Math.min(Number(lease.paymentDay) || 1, daysInMonth(y, m));
  const d = `${period}-${pad2(day)}`;
  return lease.startDate && d < lease.startDate ? lease.startDate : d;
}

export function firstTrackedPeriod(lease) {
  const start = lease.startDate ? periodOf(lease.startDate) : lease.trackFrom;
  if (lease.trackFrom && lease.trackFrom > start) return lease.trackFrom;
  return start;
}

// Full account of a lease up to the current month.
// Payments are applied oldest-first: to the opening balance, each month and
// any one-off charge, in order of due date. This handles late, partial and
// catch-up payments. Each debt keeps its allocations (date, amount) so the
// tax summary can tell when the money was actually received.
const KIND_ORDER = { opening: 0, period: 1, adjustment: 2 };

export function ledger(lease, allPayments, today) {
  const currentP = periodOf(today);
  const startP = firstTrackedPeriod(lease);
  let endP = currentP;
  if (lease.endDate && periodOf(lease.endDate) < endP) endP = periodOf(lease.endDate);
  const trackStart = lease.trackFrom ? `${lease.trackFrom}-01` : lease.startDate;

  const debts = [];
  const opening = Number(lease.openingBalance) || 0;
  if (opening > 0) {
    debts.push({ kind: 'opening', label: 'opening', total: opening, paid: 0, dueDate: trackStart, paidDate: null, allocations: [] });
  }
  const rows = [];
  if (startP) {
    for (let p = startP; p <= endP; p = addMonths(p, 1)) {
      const d = dueForPeriod(lease, p);
      const row = { ...d, kind: 'period', dueDate: dueDateFor(lease, p), paid: 0, paidDate: null, allocations: [] };
      rows.push(row);
      debts.push(row);
    }
  }
  const pool = [];
  const adjustments = [];
  for (const a of lease.adjustments || []) {
    const amount = Number(a.amount) || 0;
    if (amount > 0) {
      const debt = { ...a, kind: 'adjustment', adjKind: a.kind, total: amount, paid: 0, dueDate: a.date, paidDate: null, allocations: [] };
      debts.push(debt);
      adjustments.push(debt);
    } else if (amount < 0) {
      // A refund from the charges reconciliation gives back charges, not rent;
      // the tax summary needs to know (see tax.js).
      pool.push({ date: a.date, left: -amount, real: false, charges: a.kind === 'regularization', source: 'credit' });
      adjustments.push({ ...a, kind: 'adjustment', adjKind: a.kind, total: amount, paid: 0, credit: true });
    }
  }
  debts.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : KIND_ORDER[a.kind] - KIND_ORDER[b.kind]));

  const payments = allPayments
    .filter((x) => x.leaseId === lease.id)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id))));
  for (const x of payments) pool.push({ date: x.date, left: Number(x.amount) || 0, real: true, method: x.method, source: payerOf(x) });
  if (opening < 0) pool.push({ date: trackStart, left: -opening, real: false, source: 'opening' });
  pool.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let i = 0;
  for (const pay of pool) {
    while (pay.left > 0 && i < debts.length) {
      const debt = debts[i];
      const need = debt.total - debt.paid;
      if (need <= 0) { debt.paidDate = debt.paidDate || pay.date; i++; continue; }
      const take = Math.min(need, pay.left);
      debt.paid += take;
      pay.left -= take;
      debt.allocations.push({ date: pay.date, amount: take, real: pay.real, source: pay.source, ...(pay.charges ? { charges: true } : {}) });
      if (debt.paid >= debt.total) { debt.paidDate = pay.date; i++; }
    }
  }
  const credit = pool.reduce((s, p) => s + p.left, 0);
  const unallocated = pool.filter((p) => p.real && p.left > 0).map((p) => ({ date: p.date, amount: p.left }));

  let overdue = 0;
  let owed = 0;
  for (const d of debts) {
    const rest = d.total - d.paid;
    if (d.total <= 0 || rest <= 0) d.status = 'paid';
    else if (today <= d.dueDate) d.status = d.paid > 0 ? 'partial' : 'upcoming';
    else d.status = d.paid > 0 ? 'partial' : 'unpaid';
    d.late = rest > 0 && today > d.dueDate;
    owed += rest;
    if (d.late) overdue += rest;
  }
  return {
    rows,
    debts,
    adjustments,
    opening: debts.find((d) => d.kind === 'opening') || null,
    owed,
    overdue,
    credit,
    unallocated,
    balance: owed - credit,
    lateRows: rows.filter((r) => r.late),
    lateItems: debts.filter((d) => d.late),
    payments,
  };
}

// What the tenant has to pay next, when nothing is late: the oldest item still
// owed, or else the next month's rent. Null for an ended lease with nothing owed.
// { kind: 'period' | 'opening' | 'adjustment', period, label, amount, dueDate }
export function nextPayment(lease, payments, today) {
  const led = ledger(lease, payments, today);
  const open = led.debts.find((d) => d.total - d.paid > 0);
  if (open) return { kind: open.kind, period: open.period || null, label: open.label || '', amount: open.total - open.paid, dueDate: open.dueDate };
  if (!isActive(lease, today)) return null;
  let p = addMonths(periodOf(today), 1);
  const first = firstTrackedPeriod(lease);
  if (first && first > p) p = first;
  if (lease.endDate && p > periodOf(lease.endDate)) return null;
  const due = dueForPeriod(lease, p);
  // An advance already paid covers part of it.
  const amount = Math.max(0, due.total - led.credit);
  return { kind: 'period', period: p, label: '', amount, dueDate: dueDateFor(lease, p) };
}

// Who a payment came from, for receipts: the tenant, the CAF paying the housing
// benefit straight to the landlord, or the deposit applied at a departure.
export function payerOf(payment) {
  if (payment.method === 'caf') return 'caf';
  if (payment.method === 'deposit') return 'deposit';
  return 'tenant';
}

// What settled one month (or item), for the receipt: one line per day and payer.
// [{ date, source: 'tenant' | 'caf' | 'deposit' | 'credit' | 'opening', amount, charges? }]
export function receivedFor(debt) {
  const lines = [];
  for (const a of debt.allocations || []) {
    const source = a.source || (a.real ? 'tenant' : 'credit');
    const same = lines.find((l) => l.date === a.date && l.source === source && !!l.charges === !!a.charges);
    if (same) same.amount += a.amount;
    else lines.push({ date: a.date, source, amount: a.amount, ...(a.charges ? { charges: true } : {}) });
  }
  return lines.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

// Status of the yearly rent revision (article 17-1 of the law of 6 July 1989).
// The increase cannot exceed the one-year change of the IRL for the quarter
// named in the lease. Properties rated F or G (DPE) cannot be increased.
export function revisionAnniversary(lease, today) {
  const mmdd = lease.revisionDate || (lease.startDate || today).slice(5);
  const [mm, dd] = mmdd.split('-').map(Number);
  // Each year on its own, so 29 February stays the 29th in leap years.
  const at = (yr) => `${yr}-${pad2(mm)}-${pad2(Math.min(dd, daysInMonth(yr, mm)))}`;
  const y = Number(today.slice(0, 4));
  const a = at(y);
  return a > today ? at(y - 1) : a;
}

export function indexationStatus(lease, property, table, today) {
  if (!lease.irl || !lease.irl.quarter) return null;
  if (!isActive(lease, today)) return null;
  const a = revisionAnniversary(lease, today);
  if (!lease.startDate || a <= lease.startDate) {
    return { state: 'notYet', next: addYears(a, 1) };
  }
  const last = lease.lastRevision || lease.startDate;
  if (last >= a) return { state: 'done', anniversary: a, next: addYears(a, 1) };
  if (property && (property.dpe === 'F' || property.dpe === 'G')) {
    return { state: 'blocked', anniversary: a, next: addYears(a, 1) };
  }
  const latest = latestForQuarter(table, lease.irl.quarter);
  if (!latest || (lease.irl.key && latest.key <= lease.irl.key)) {
    return { state: 'waiting', anniversary: a, next: addYears(a, 1) };
  }
  const oldKey = irlKey(latest.year - 1, lease.irl.quarter);
  const oldValue = table[oldKey];
  if (!oldValue) return { state: 'waiting', anniversary: a, next: addYears(a, 1) };
  const cur = currentRent(lease, today);
  // The law sets a maximum, so round down to the cent (never above the cap).
  // The tiny epsilon keeps exact results exact despite floating point.
  const newRent = Math.floor((cur.rent * latest.value) / oldValue + 1e-9);
  const startFrom = a > today ? a : today;
  const applyFrom = startFrom.slice(8) === '01' ? periodOf(startFrom) : addMonths(periodOf(startFrom), 1);
  return {
    state: 'due',
    anniversary: a,
    deadline: addYears(a, 1),
    oldKey,
    oldValue,
    newKey: latest.key,
    newValue: latest.value,
    currentRent: cur.rent,
    charges: cur.charges,
    newRent,
    pct: ((latest.value / oldValue) - 1) * 100,
    applyFrom,
  };
}

// Totals across all leases for the dashboard.
export function monthOverview(state, today) {
  const p = periodOf(today);
  let due = 0;
  let overdue = 0;
  const items = [];
  for (const lease of state.leases) {
    const led = ledger(lease, state.payments, today);
    const row = led.rows.find((r) => r.period === p);
    if (row) due += row.total;
    overdue += led.overdue;
    if (isActive(lease, today) || led.owed > 0) items.push({ lease, ledger: led, row });
  }
  // The deposit applied to the account when a tenant leaves is not new money.
  const received = state.payments
    .filter((x) => periodOf(x.date) === p && x.method !== 'deposit')
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return { period: p, due, received, overdue, items };
}

// What a rent call for `period` asks for: that month's rent and charges, less
// anything already paid towards it, plus earlier unpaid months and the opening
// balance, plus one-off charges due by the same date, less any advance.
// The lease page and the monthly send both use this, so they always agree.
export function rentCallBalance(lease, payments, period, today, withBalance = true) {
  const due = { ...dueForPeriod(lease, period), dueDate: dueDateFor(lease, period) };
  if (!withBalance) return { due, paidTowards: 0, previous: 0, extras: [], credit: 0, total: due.total };
  const led = ledger(lease, payments, today);
  const row = led.rows.find((r) => r.period === period);
  const paidTowards = row ? row.paid : 0;
  let previous = 0;
  const extras = [];
  for (const d of led.debts) {
    const rest = d.total - d.paid;
    if (rest <= 0) continue;
    if (d.kind === 'period') { if (d.period < period) previous += rest; }
    else if (d.kind === 'opening') previous += rest;
    else if (d.dueDate <= due.dueDate) extras.push({ label: d.label || '', date: d.dueDate, amount: rest });
  }
  const credit = led.credit;
  const total = Math.max(0, due.total - paidTowards + previous + extras.reduce((s, x) => s + x.amount, 0) - credit);
  return { due, paidTowards, previous, extras, credit, total };
}

export function periodRange(fromP, toP) {
  const out = [];
  for (let p = fromP; p <= toP; p = addMonths(p, 1)) out.push(p);
  return out;
}

export { lastDayOfPeriod };
