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
// Payments are applied oldest-first: first to the opening balance, then to
// each month in order. This handles late, partial and catch-up payments.
export function ledger(lease, allPayments, today) {
  const currentP = periodOf(today);
  const startP = firstTrackedPeriod(lease);
  let endP = currentP;
  if (lease.endDate && periodOf(lease.endDate) < endP) endP = periodOf(lease.endDate);

  const debts = [];
  const opening = Number(lease.openingBalance) || 0;
  if (opening > 0) {
    debts.push({ kind: 'opening', total: opening, paid: 0, dueDate: lease.trackFrom ? `${lease.trackFrom}-01` : lease.startDate, paidDate: null });
  }
  const rows = [];
  if (startP) {
    for (let p = startP; p <= endP; p = addMonths(p, 1)) {
      const d = dueForPeriod(lease, p);
      const row = { ...d, kind: 'period', dueDate: dueDateFor(lease, p), paid: 0, paidDate: null };
      rows.push(row);
      debts.push(row);
    }
  }

  const payments = allPayments
    .filter((x) => x.leaseId === lease.id)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id))));
  const pool = payments.map((x) => ({ date: x.date, left: Number(x.amount) || 0 }));
  if (opening < 0) pool.unshift({ date: lease.trackFrom ? `${lease.trackFrom}-01` : lease.startDate, left: -opening });

  let i = 0;
  for (const pay of pool) {
    while (pay.left > 0 && i < debts.length) {
      const debt = debts[i];
      const need = debt.total - debt.paid;
      if (need <= 0) { debt.paidDate = debt.paidDate || pay.date; i++; continue; }
      const take = Math.min(need, pay.left);
      debt.paid += take;
      pay.left -= take;
      if (debt.paid >= debt.total) { debt.paidDate = pay.date; i++; }
    }
  }
  const credit = pool.reduce((s, p) => s + p.left, 0);

  let overdue = 0;
  let owed = 0;
  for (const d of debts) {
    const rest = d.total - d.paid;
    if (d.kind === 'period') {
      if (d.total <= 0 || rest <= 0) d.status = 'paid';
      else if (today <= d.dueDate) d.status = d.paid > 0 ? 'partial' : 'upcoming';
      else d.status = d.paid > 0 ? 'partial' : 'unpaid';
      d.late = rest > 0 && today > d.dueDate;
    }
    owed += rest;
    if (rest > 0 && today > d.dueDate) overdue += rest;
  }
  const lateRows = rows.filter((r) => r.late);
  return {
    rows,
    opening: debts.find((d) => d.kind === 'opening') || null,
    owed,
    overdue,
    credit,
    balance: owed - credit,
    lateRows,
    payments,
  };
}

// Status of the yearly rent revision (article 17-1 of the law of 6 July 1989).
// The increase cannot exceed the one-year change of the IRL for the quarter
// named in the lease. Properties rated F or G (DPE) cannot be increased.
export function revisionAnniversary(lease, today) {
  const mmdd = lease.revisionDate || (lease.startDate || today).slice(5);
  const y = Number(today.slice(0, 4));
  let a = addYears(`${y}-${mmdd}`, 0);
  if (a > today) a = addYears(a, -1);
  return a;
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
  const newRent = Math.round((cur.rent * latest.value) / oldValue);
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
  const received = state.payments
    .filter((x) => periodOf(x.date) === p)
    .reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return { period: p, due, received, overdue, items };
}

export function periodRange(fromP, toP) {
  const out = [];
  for (let p = fromP; p <= toP; p = addMonths(p, 1)) out.push(p);
  return out;
}

export { lastDayOfPeriod };
