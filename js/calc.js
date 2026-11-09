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
  if (!entry) return [{ from: periodOf(lease.startDate), rent, charges, reason: 'initial' }];
  const { from, rent: _rent, charges: _charges, ...rest } = entry;
  return changeRentFrom(lease, from, { rent, charges }, rest);
}

// The lease's rents with a new amount from month `from`. `change` holds what
// changes: { rent }, { charges } or both; the other amount stays as it is in
// force that month. Each entry stores rent and charges together, so the later
// entries that only carried the old amount forward take the new one too, up
// to the first that set its own (a revision must not end when new charges
// start a month later, nor new charges when a revision does).
// `extra` is kept on the entry (reason, note, regYear).
export function changeRentFrom(lease, from, change, extra = {}) {
  const rents = sortedRents(lease).map((r) => ({ ...r }));
  const before = rents.length ? rentAt(lease, from) : { rent: 0, charges: 0 };
  const entry = { from, rent: before.rent, charges: before.charges, ...change, ...extra };
  const later = rents.filter((r) => r.from > from);
  for (const k of ['rent', 'charges']) {
    if (entry[k] === before[k]) continue;
    for (const r of later) {
      if (r[k] !== before[k]) break;
      r[k] = entry[k];
    }
  }
  return [...rents.filter((r) => r.from < from), entry, ...later];
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

// ---------- payment frequency ----------
// A lease is paid every month (default), every 3 or every 6 months, at the
// start of each period (in advance, "à échoir", default) or at its end (in
// arrears, "à terme échu"). Periods of 3 or 6 months start on
// lease.periodAnchor ('YYYY-MM'; default: the lease's first month), and
// repeat from there. The rent itself stays monthly: every month of a period
// is due on the period's payment date.
export function frequencyOf(lease) {
  const f = Number(lease && lease.frequency);
  return f === 3 || f === 6 ? f : 1;
}

export function timingOf(lease) {
  return lease && lease.payTiming === 'arrears' ? 'arrears' : 'advance';
}

function monthIndex(period) {
  const { y, m } = splitPeriod(period);
  return y * 12 + (m - 1);
}

// The months paid together with `period`: { start, end, months }, cut to the
// lease's first and last months.
export function billingPeriod(lease, period) {
  const f = frequencyOf(lease);
  if (f === 1) return { start: period, end: period, months: [period] };
  const anchor = lease.periodAnchor || (lease.startDate ? periodOf(lease.startDate) : period);
  let start = addMonths(anchor, Math.floor((monthIndex(period) - monthIndex(anchor)) / f) * f);
  let end = addMonths(start, f - 1);
  if (lease.startDate && start < periodOf(lease.startDate)) start = periodOf(lease.startDate);
  if (lease.endDate && end > periodOf(lease.endDate)) end = periodOf(lease.endDate);
  return { start, end, months: periodRange(start, end) };
}

// Payment date of a month: the payment day of the period's first month (in
// advance) or of the month after the period (in arrears), never before the
// lease starts.
export function dueDateFor(lease, period) {
  const g = billingPeriod(lease, period);
  const month = timingOf(lease) === 'arrears' ? addMonths(g.end, 1) : g.start;
  const { y, m } = splitPeriod(month);
  const day = Math.min(Number(lease.paymentDay) || 1, daysInMonth(y, m));
  const d = `${month}-${pad2(day)}`;
  return lease.startDate && d < lease.startDate ? lease.startDate : d;
}

// The amounts due for a whole period (one month for a monthly lease), added up.
export function periodDue(lease, period) {
  const g = billingPeriod(lease, period);
  const parts = g.months.map((p) => dueForPeriod(lease, p));
  if (parts.length === 1) return { ...parts[0], periodEnd: period, months: 1, dueDate: dueDateFor(lease, period) };
  const sum = (k) => parts.reduce((s, x) => s + x[k], 0);
  return {
    period: g.start,
    periodEnd: g.end,
    months: parts.length,
    rent: sum('rent'),
    charges: sum('charges'),
    total: sum('total'),
    fromDate: parts[0].fromDate,
    toDate: parts[parts.length - 1].toDate,
    prorata: null,
    dueDate: dueDateFor(lease, period),
  };
}

export function firstTrackedPeriod(lease) {
  const start = lease.startDate ? periodOf(lease.startDate) : lease.trackFrom;
  if (lease.trackFrom && lease.trackFrom > start) return lease.trackFrom;
  return start;
}

// Full account of a lease up to the current month (up to the end of the
// current period for a lease paid in advance every 3 or 6 months).
// Payments are applied oldest-first: to the opening balance, each month and
// any one-off charge, in order of due date. This handles late, partial and
// catch-up payments. Each debt keeps its allocations (date, amount) so the
// tax summary can tell when the money was actually received.
const KIND_ORDER = { opening: 0, period: 1, adjustment: 2 };

export function ledger(lease, allPayments, today) {
  const currentP = periodOf(today);
  const startP = firstTrackedPeriod(lease);
  let endP = currentP;
  // Paid in advance every 3 or 6 months: the whole period is due on its
  // payment date, so all its months count from the start, not one by one.
  if (frequencyOf(lease) > 1 && timingOf(lease) === 'advance' && startP && startP <= currentP) endP = billingPeriod(lease, currentP).end;
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

// One period's months put together, for its receipt: a full receipt only when
// every month of it is paid. The account is looked at up to the period's last
// month, so a payment made in advance for the whole period counts.
// Null when no month of the period is tracked.
export function periodReceipt(lease, payments, period, today) {
  const g = billingPeriod(lease, period);
  const lastDay = lastDayOfPeriod(g.end);
  const led = ledger(lease, payments, lastDay > today ? lastDay : today);
  const rows = led.rows.filter((r) => r.period >= g.start && r.period <= g.end);
  if (!rows.length) return null;
  if (rows.length === 1) return { ...rows[0], periodEnd: rows[0].period, months: 1 };
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  const total = sum('total');
  const paid = sum('paid');
  return {
    kind: 'period',
    period: rows[0].period,
    periodEnd: rows[rows.length - 1].period,
    months: rows.length,
    rent: sum('rent'),
    charges: sum('charges'),
    total,
    paid,
    fromDate: rows[0].fromDate,
    toDate: rows[rows.length - 1].toDate,
    prorata: null,
    dueDate: rows[0].dueDate,
    paidDate: paid >= total ? rows.map((r) => r.paidDate).filter(Boolean).sort().pop() || null : null,
    allocations: rows.flatMap((r) => r.allocations),
    status: paid >= total && total > 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
  };
}

// What the tenant has to pay next, when nothing is late: the oldest item still
// owed, or else the next month's rent. Null for an ended lease with nothing owed.
// { kind: 'period' | 'opening' | 'adjustment', period, label, amount, dueDate }
// For a lease paid every 3 or 6 months, the whole period: { period, periodEnd }.
export function nextPayment(lease, payments, today) {
  const grouped = frequencyOf(lease) > 1;
  // Paid by period: look at the account up to the end of the current period,
  // so an advance already covering it isn't counted twice.
  const curEnd = grouped ? lastDayOfPeriod(billingPeriod(lease, periodOf(today)).end) : today;
  const led = ledger(lease, payments, curEnd > today ? curEnd : today);
  const open = led.debts.find((d) => d.total - d.paid > 0);
  if (open && open.kind === 'period' && grouped) {
    const g = billingPeriod(lease, open.period);
    const amount = led.rows.filter((r) => r.period >= g.start && r.period <= g.end).reduce((s, r) => s + r.total - r.paid, 0);
    return { kind: 'period', period: g.start, periodEnd: g.end, label: '', amount, dueDate: open.dueDate };
  }
  if (open) return { kind: open.kind, period: open.period || null, periodEnd: open.period || null, label: open.label || '', amount: open.total - open.paid, dueDate: open.dueDate };
  if (!isActive(lease, today)) return null;
  let p = addMonths(grouped ? billingPeriod(lease, periodOf(today)).end : periodOf(today), 1);
  const first = firstTrackedPeriod(lease);
  if (first && first > p) p = first;
  if (lease.endDate && p > periodOf(lease.endDate)) return null;
  const due = periodDue(lease, p);
  // An advance already paid covers part of it.
  const amount = Math.max(0, due.total - led.credit);
  return { kind: 'period', period: due.period, periodEnd: due.periodEnd, label: '', amount, dueDate: due.dueDate };
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
    due += dueInMonth(lease, p);
    overdue += led.overdue;
    if (isActive(lease, today) || led.owed > 0) items.push({ lease, ledger: led, row });
  }
  // The deposit applied to the account when a tenant leaves is not new money.
  const received = state.payments
    .filter((x) => periodOf(x.date) === p && x.method !== 'deposit')
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return { period: p, due, received, overdue, items };
}

// Rent and charges whose payment date falls in month `p` (a whole period for
// a lease paid every 3 or 6 months, the month before for one paid in arrears).
export function dueInMonth(lease, p) {
  const first = firstTrackedPeriod(lease);
  if (!first) return 0;
  const last = lease.endDate ? periodOf(lease.endDate) : null;
  let total = 0;
  for (let q = addMonths(p, -6); q <= addMonths(p, 5); q = addMonths(q, 1)) {
    if (q < first || (last && q > last)) continue;
    if (periodOf(dueDateFor(lease, q)) === p) total += dueForPeriod(lease, q).total;
  }
  return total;
}

// What a rent call for `period` asks for: that month's rent and charges, less
// anything already paid towards it, plus earlier unpaid months and the opening
// balance, plus one-off charges due by the same date, less any advance.
// The lease page and the monthly send both use this, so they always agree.
// For a lease paid every 3 or 6 months, it covers the whole period holding `period`.
export function rentCallBalance(lease, payments, period, today, withBalance = true) {
  const due = periodDue(lease, period);
  if (!withBalance) return { due, paidTowards: 0, previous: 0, extras: [], credit: 0, total: due.total };
  const led = ledger(lease, payments, today);
  const paidTowards = led.rows.filter((r) => r.period >= due.period && r.period <= due.periodEnd).reduce((s, r) => s + r.paid, 0);
  let previous = 0;
  const extras = [];
  for (const d of led.debts) {
    const rest = d.total - d.paid;
    if (rest <= 0) continue;
    if (d.kind === 'period') { if (d.period < due.period) previous += rest; }
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
