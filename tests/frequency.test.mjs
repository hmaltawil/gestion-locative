// Payment frequency (version 1.3.11): rent paid every 1, 3 or 6 months, at the
// start of each period (in advance) or at its end (in arrears).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  billingPeriod, dueDateFor, dueInMonth, frequencyOf, ledger, nextPayment, periodReceipt, rentCallBalance, timingOf,
} from '../js/calc.js';
import { checkPayment } from '../js/checks.js';
import { rentReceived } from '../js/tax.js';
import { normalize } from '../js/store.js';

const monthly = { id: 'L', startDate: '2025-10-01', paymentDay: 5, rents: [{ from: '2025-10', rent: 80000, charges: 5000 }], adjustments: [] };
const quarterly = { ...monthly, frequency: 3, periodAnchor: '2026-01' }; // calendar quarters
const arrears = { ...quarterly, payTiming: 'arrears' };
const pay = (date, amount, id = date) => ({ id, leaseId: 'L', date, amount });

test('defaults: monthly, in advance', () => {
  assert.equal(frequencyOf(monthly), 1);
  assert.equal(timingOf(monthly), 'advance');
  assert.equal(frequencyOf({ frequency: 4 }), 1);
  assert.deepEqual(billingPeriod(monthly, '2026-02'), { start: '2026-02', end: '2026-02', months: ['2026-02'] });
  assert.equal(dueDateFor(monthly, '2026-02'), '2026-02-05');
});

test('periods: from the chosen month, cut to the lease', () => {
  assert.deepEqual(billingPeriod(quarterly, '2026-02').months, ['2026-01', '2026-02', '2026-03']);
  assert.deepEqual(billingPeriod(quarterly, '2025-11'), { start: '2025-10', end: '2025-12', months: ['2025-10', '2025-11', '2025-12'] });
  // no anchor: periods start with the lease
  assert.deepEqual(billingPeriod({ ...monthly, frequency: 3, startDate: '2025-09-15' }, '2025-12').months, ['2025-12', '2026-01', '2026-02']);
  // first and last periods cut to the lease's months
  assert.equal(billingPeriod({ ...quarterly, startDate: '2025-11-15' }, '2025-11').start, '2025-11');
  assert.equal(billingPeriod({ ...quarterly, endDate: '2026-02-15' }, '2026-01').end, '2026-02');
  assert.deepEqual(billingPeriod({ ...quarterly, frequency: 6 }, '2026-08').months, ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
});

test('payment dates: start of the period, or the month after it', () => {
  assert.equal(dueDateFor(quarterly, '2026-03'), '2026-01-05');
  assert.equal(dueDateFor(arrears, '2026-01'), '2026-04-05');
  assert.equal(dueDateFor({ ...monthly, payTiming: 'arrears' }, '2026-02'), '2026-03-05');
});

test('paid at the end of the quarter: not late before the payment date', () => {
  const before = ledger({ ...arrears, startDate: '2026-01-01' }, [], '2026-03-20');
  assert.equal(before.overdue, 0);
  assert.deepEqual(before.rows.map((r) => r.status), ['upcoming', 'upcoming', 'upcoming']);
  // the quarter before (October to December, due 5 January) is late by then
  assert.equal(ledger(arrears, [], '2026-03-20').overdue, 255000);
  const after = ledger({ ...arrears, startDate: '2026-01-01' }, [], '2026-04-06');
  assert.equal(after.overdue, 255000);
  assert.ok(after.rows.slice(0, 3).every((r) => r.late));
});

test('paid at the start of the quarter: one payment covers the 3 months, one receipt for the quarter', () => {
  const lease = { ...quarterly, startDate: '2026-01-01' };
  const pays = [pay('2026-01-02', 255000)];
  const led = ledger(lease, pays, '2026-01-10');
  assert.equal(led.overdue, 0);
  assert.equal(led.credit, 170000); // February and March, paid ahead
  const r = periodReceipt(lease, pays, '2026-01', '2026-01-10');
  assert.equal(r.status, 'paid');
  assert.equal(r.months, 3);
  assert.equal(r.total, 255000);
  assert.equal(r.paid, 255000);
  assert.equal(r.fromDate, '2026-01-01');
  assert.equal(r.toDate, '2026-03-31');
  assert.equal(r.paidDate, '2026-01-02');
  assert.equal(r.rent, 240000);
  // any month of the quarter gives the same receipt
  assert.equal(periodReceipt(lease, pays, '2026-03', '2026-01-10').period, '2026-01');
  // part paid: a partial receipt
  const part = periodReceipt(lease, [pay('2026-01-02', 100000)], '2026-01', '2026-01-10');
  assert.equal(part.status, 'partial');
  assert.equal(part.paid, 100000);
  // a monthly lease: the month itself, as before
  const m = periodReceipt({ ...monthly, startDate: '2026-01-01' }, [pay('2026-01-02', 85000)], '2026-01', '2026-01-10');
  assert.equal(m.months, 1);
  assert.equal(m.toDate, '2026-01-31');
  assert.equal(m.paid, 85000);
});

test('a lease ending mid-quarter: the last receipt covers its last months only', () => {
  const lease = { ...quarterly, startDate: '2026-01-01', endDate: '2026-02-14' };
  const r = periodReceipt(lease, [pay('2026-01-02', 125000)], '2026-01', '2026-03-01');
  assert.equal(r.months, 2);
  assert.equal(r.toDate, '2026-02-14');
  assert.equal(r.total, 85000 + Math.round(80000 * 14 / 28) + Math.round(5000 * 14 / 28));
});

test('rent call for a quarter: the 3 months, due at the start', () => {
  const lease = { ...quarterly, startDate: '2026-01-01' };
  const call = rentCallBalance(lease, [pay('2026-01-02', 255000)], '2026-05', '2026-03-20');
  assert.equal(call.due.period, '2026-04');
  assert.equal(call.due.periodEnd, '2026-06');
  assert.equal(call.due.months, 3);
  assert.equal(call.due.total, 255000);
  assert.equal(call.due.dueDate, '2026-04-05');
  assert.equal(call.total, 255000);
  // a monthly lease: unchanged
  const m = rentCallBalance({ ...monthly, startDate: '2026-01-01' }, [], '2026-02', '2026-01-20');
  assert.equal(m.due.months, 1);
  assert.equal(m.due.total, 85000);
});

test('what is due next: the whole next period', () => {
  const lease = { ...quarterly, startDate: '2026-01-01' };
  // Quarter paid: next is April to June, the advance already belongs to February and March.
  const next = nextPayment(lease, [pay('2026-01-02', 255000)], '2026-01-10');
  assert.deepEqual(next, { kind: 'period', period: '2026-04', periodEnd: '2026-06', label: '', amount: 255000, dueDate: '2026-04-05' });
  // In arrears, in February: the current quarter, due in April.
  const nextA = nextPayment({ ...arrears, startDate: '2026-01-01' }, [], '2026-02-10');
  assert.deepEqual(nextA, { kind: 'period', period: '2026-01', periodEnd: '2026-03', label: '', amount: 255000, dueDate: '2026-04-05' });
});

test('expected this month (home screen): the whole period in the month it is due', () => {
  const lease = { ...quarterly, startDate: '2026-01-01' };
  assert.equal(dueInMonth(lease, '2026-01'), 255000);
  assert.equal(dueInMonth(lease, '2026-02'), 0);
  assert.equal(dueInMonth({ ...arrears, startDate: '2026-01-01' }, '2026-04'), 255000);
  assert.equal(dueInMonth({ ...arrears, startDate: '2026-01-01' }, '2026-03'), 0);
  assert.equal(dueInMonth({ ...monthly, startDate: '2026-01-01' }, '2026-02'), 85000);
  assert.equal(dueInMonth({ ...monthly, startDate: '2026-03-01' }, '2026-02'), 0);
});

test('one whole period paid at once is never "far more than owed"', () => {
  const lease = { ...quarterly, startDate: '2026-01-01' };
  const keys = (r) => r.warnings.map((w) => w.key);
  assert.deepEqual(keys(checkPayment(lease, [], { date: '2026-01-02', amount: 255000 }, '2026-01-02')), []);
  assert.deepEqual(keys(checkPayment({ ...lease, frequency: 6 }, [], { date: '2026-01-02', amount: 510000 }, '2026-01-02')), []);
  assert.deepEqual(keys(checkPayment({ ...monthly, startDate: '2026-01-01' }, [], { date: '2026-01-02', amount: 510000 }, '2026-01-02')), ['paymentTooMuch']);
});

test('tax: a quarter paid in December counts in December\'s year', () => {
  const lease = { ...monthly, frequency: 3, periodAnchor: '2025-10' };
  const pays = [pay('2025-10-02', 255000, 'a'), pay('2025-12-28', 255000, 'b')];
  assert.equal(rentReceived(lease, pays, 2025, '2026-02-01').rent, 6 * 80000);
  assert.equal(rentReceived(lease, pays, 2026, '2026-02-01').rent, 0);
});

test('cleaning: payment frequency fields', () => {
  const s = normalize({ settings: {}, leases: [
    { id: 'a', startDate: '2025-01-01', frequency: '3', payTiming: 'arrears', periodAnchor: '2025-01' },
    { id: 'b', startDate: '2025-01-01', frequency: 4, payTiming: '<x>', periodAnchor: 'bad' },
    { id: 'c', startDate: '2025-01-01' },
  ] });
  assert.deepEqual([s.leases[0].frequency, s.leases[0].payTiming, s.leases[0].periodAnchor], [3, 'arrears', '2025-01']);
  assert.deepEqual([s.leases[1].frequency, s.leases[1].payTiming, s.leases[1].periodAnchor], [1, 'advance', null]);
  assert.ok(!('frequency' in s.leases[2])); // monthly by default, nothing added
});
