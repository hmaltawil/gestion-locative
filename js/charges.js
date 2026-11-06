// Yearly charges reconciliation and tenant departure (deposit return).

import { addMonths, addYears, daysBetween, daysInMonth, periodOf } from './util.js';
import { dueForPeriod, currentRent } from './calc.js';

function isLeap(y) {
  return daysInMonth(y, 2) === 29;
}

// Days the lease covers within a calendar year.
export function occupancyDays(lease, year) {
  const from = lease.startDate > `${year}-01-01` ? lease.startDate : `${year}-01-01`;
  const end = lease.endDate && lease.endDate < `${year}-12-31` ? lease.endDate : `${year}-12-31`;
  if (end < from) return 0;
  return daysBetween(from, end) + 1;
}

// Charges advances billed to the tenant for that year (pro-rated months included).
export function provisionsForYear(lease, year) {
  let total = 0;
  for (let p = `${year}-01`; p <= `${year}-12`; p = addMonths(p, 1)) {
    if (p < periodOf(lease.startDate)) continue;
    if (lease.endDate && p > periodOf(lease.endDate)) continue;
    total += dueForPeriod(lease, p).charges;
  }
  return total;
}

// Recoverable expenses recorded for the property in that year.
export const RECOVERABLE_CATEGORIES = ['recoverable', 'teom'];
export function recoverableExpenses(state, propertyId, year) {
  return state.expenses
    .filter((e) => e.propertyId === propertyId && e.date.startsWith(String(year)) && RECOVERABLE_CATEGORIES.includes(e.category))
    .map((e) => ({ label: e.description || e.category, amount: e.amount, expenseId: e.id, category: e.category }));
}

// lines: [{ label, amount }] = actual recoverable charges for the whole property.
export function regularization(lease, year, lines) {
  const yearDays = isLeap(year) ? 366 : 365;
  const days = occupancyDays(lease, year);
  const actualTotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const share = days / yearDays;
  const tenantShare = Math.round(actualTotal * share);
  const provisions = provisionsForYear(lease, year);
  return {
    year,
    days,
    yearDays,
    share,
    actualTotal,
    tenantShare,
    provisions,
    balance: tenantShare - provisions, // > 0: tenant owes; < 0: refund
    suggestedMonthly: Math.round(actualTotal / 12),
  };
}

// ---------- departure ----------
// Article 22 of the law of 6 July 1989: deposit back within 1 month if the
// move-out inventory matches the move-in one, 2 months otherwise; 10 % of the
// monthly rent (excl. charges) per started month of delay.
export function depositDeadline(keysDate, inventoryMatches) {
  return addMonthsToDate(keysDate, inventoryMatches ? 1 : 2);
}

function addMonthsToDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  const day = Math.min(d, daysInMonth(ny, nm));
  return `${ny}-${String(nm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function lateMonths(deadline, when) {
  if (when <= deadline) return 0;
  let n = 0;
  let cursor = deadline;
  while (cursor < when) { n++; cursor = addMonthsToDate(deadline, n); }
  return n;
}

// dep: { keysDate, inventoryMatches, deductions: [{label, amount}], retention }
export function departureStatement(lease, led, dep, today) {
  const deposit = Number(lease.deposit) || 0;
  const arrears = Math.max(0, led.owed - led.credit);
  const credit = Math.max(0, led.credit - led.owed);
  const deductions = (dep.deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const maxRetention = Math.round(deposit * 0.2);
  const retention = Math.min(Math.max(0, Number(dep.retention) || 0), maxRetention);
  const net = deposit + credit - arrears - deductions - retention;
  const keysDate = dep.keysDate || lease.endDate || today;
  const deadline = depositDeadline(keysDate, dep.inventoryMatches !== false);
  const returnedOn = dep.returnedOn || null;
  const late = lateMonths(deadline, returnedOn || today);
  const rent = currentRent(lease, lease.endDate || today).rent;
  // The penalty is added to the deposit still owed to the tenant, so there is
  // none when nothing is left to return.
  const refund = Math.max(0, net);
  const penalty = refund > 0 ? late * Math.round(rent * 0.1) : 0;
  return {
    deposit,
    arrears,
    credit,
    deductions,
    retention,
    maxRetention,
    refund, // from the tenant's account: deposit + overpayment - what is owed
    penalty,
    toReturn: refund + penalty,
    stillOwed: Math.max(0, -net),
    keysDate,
    deadline,
    lateMonths: late,
  };
}

// What is booked on the tenant's account once the deposit is returned:
// deductions become charges, the deposit (less any amount held back) is
// applied to the account, and the money sent back from the account is a
// refund. The account then ends at zero, or at what the tenant still owes.
// The late penalty is the landlord's own cost, so it is not booked here.
export function depositSettlement(st, deductions, keysDate, date) {
  const adjustments = [];
  for (const d of deductions || []) {
    const amount = Number(d.amount) || 0;
    if (amount > 0) adjustments.push({ date: keysDate, label: d.label || 'Retenue sur dépôt', amount, kind: 'deduction' });
  }
  if (st.refund > 0) adjustments.push({ date, label: 'Restitution du dépôt de garantie', amount: st.refund, kind: 'refund' });
  const applied = st.deposit - st.retention;
  const payment = applied > 0 ? { amount: applied, date, method: 'deposit', note: 'Dépôt de garantie imputé sur le compte' } : null;
  return { adjustments, payment };
}

// Other leases of the same property that run at the same time as this one
// during the year (then the charges entered must be this tenant's share only).
export function overlappingLeases(leases, lease, year) {
  const span = (l) => {
    const from = !l.startDate || l.startDate < `${year}-01-01` ? `${year}-01-01` : l.startDate;
    const to = l.endDate && l.endDate < `${year}-12-31` ? l.endDate : `${year}-12-31`;
    return [from, to];
  };
  const [a1, a2] = span(lease);
  if (a2 < a1) return [];
  return leases.filter((o) => {
    if (o.id === lease.id || o.propertyId !== lease.propertyId) return false;
    const [b1, b2] = span(o);
    return b1 <= b2 && b1 <= a2 && a1 <= b2;
  });
}

// Unfurnished lease by a private landlord: 3-year terms, renewed tacitly.
// A landlord's notice must reach the tenant at least 6 months before the term ends.
export function nextTermEnd(lease, today) {
  let end = addYears(lease.startDate, 3);
  end = shiftDay(end, -1);
  while (end < today) end = addYears(end, 3);
  return { termEnd: end, noticeBy: addMonthsToDate(end, -6) };
}

function shiftDay(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export { addMonthsToDate };
