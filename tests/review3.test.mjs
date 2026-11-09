// Fixes from the third code review (version 1.3.13):
// 1. a rent revision and new monthly charges recorded for different months no
//    longer undo each other (each rent entry stores rent and charges together);
// 2. a lease paid in advance every 3 or 6 months owes the whole period from
//    its payment date, not one month at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { changeRentFrom, ledger, nextPayment, rentAt, rentCallBalance } from '../js/calc.js';
import { undoRegRent } from '../js/charges.js';
import { rentReceived } from '../js/tax.js';

const amounts = (rents) => rents.map((r) => [r.from, r.rent, r.charges, r.reason]);
const base = { startDate: '2024-01-01', rents: [{ from: '2024-01', rent: 80000, charges: 5000, reason: 'initial' }] };
const withRents = (rents) => ({ ...base, rents });

test('revision after new charges planned for a later month: the revised rent goes on', () => {
  // The reconciliation set 75 € of charges from January; the revision then applies from December.
  const reg = changeRentFrom(base, '2027-01', { charges: 7500 }, { reason: 'regularization', regYear: 2025 });
  const out = changeRentFrom(withRents(reg), '2026-12', { rent: 81256 }, { reason: 'indexation' });
  assert.deepEqual(amounts(out), [
    ['2024-01', 80000, 5000, 'initial'],
    ['2026-12', 81256, 5000, 'indexation'],
    ['2027-01', 81256, 7500, 'regularization'],
  ]);
  assert.equal(out[2].regYear, 2025);
  // the lease given in is not changed
  assert.deepEqual(amounts(base.rents), [['2024-01', 80000, 5000, 'initial']]);
});

test('new charges after a revision planned for a later month: the new charges go on', () => {
  const rev = changeRentFrom(base, '2027-02', { rent: 81256 }, { reason: 'indexation' });
  const out = changeRentFrom(withRents(rev), '2027-01', { charges: 7500 }, { reason: 'regularization', regYear: 2025 });
  assert.deepEqual(amounts(out), [
    ['2024-01', 80000, 5000, 'initial'],
    ['2027-01', 80000, 7500, 'regularization'],
    ['2027-02', 81256, 7500, 'indexation'],
  ]);
});

test('revision and new charges in the same month: both are kept', () => {
  const reg = changeRentFrom(base, '2026-12', { charges: 7500 }, { reason: 'regularization', regYear: 2025 });
  const out = changeRentFrom(withRents(reg), '2026-12', { rent: 81256 }, { reason: 'indexation' });
  assert.deepEqual(amounts(out), [['2024-01', 80000, 5000, 'initial'], ['2026-12', 81256, 7500, 'indexation']]);
  // and the other way round
  const rev = changeRentFrom(base, '2026-12', { rent: 81256 }, { reason: 'indexation' });
  const out2 = changeRentFrom(withRents(rev), '2026-12', { charges: 7500 }, { reason: 'regularization', regYear: 2025 });
  assert.deepEqual(amounts(out2), [['2024-01', 80000, 5000, 'initial'], ['2026-12', 81256, 7500, 'regularization']]);
});

test('a later entry that set its own amount keeps it, and what follows it too', () => {
  const rents = [
    ...base.rents,
    { from: '2027-03', rent: 85000, charges: 5000, reason: 'manual' }, // its own rent
    { from: '2027-06', rent: 85000, charges: 6000, reason: 'manual' },
  ];
  const out = changeRentFrom(withRents(rents), '2026-12', { rent: 81256 }, { reason: 'indexation' });
  assert.deepEqual(amounts(out).slice(1), [
    ['2026-12', 81256, 5000, 'indexation'],
    ['2027-03', 85000, 5000, 'manual'],
    ['2027-06', 85000, 6000, 'manual'],
  ]);
  // "Change rent" with both amounts: only the one that really changes is carried forward
  const both = changeRentFrom(withRents(rents), '2026-12', { rent: 80000, charges: 5500 }, { reason: 'manual' });
  assert.deepEqual(amounts(both).slice(1), [
    ['2026-12', 80000, 5500, 'manual'],
    ['2027-03', 85000, 5500, 'manual'],
    ['2027-06', 85000, 6000, 'manual'],
  ]);
  // a lease without any rent yet
  assert.deepEqual(amounts(changeRentFrom({ startDate: '2026-01-01' }, '2026-01', { rent: 50000, charges: 0 }, { reason: 'manual' })),
    [['2026-01', 50000, 0, 'manual']]);
});

test('undoing a reconciliation gives the old charges back everywhere, and keeps a revision', () => {
  // New charges from January, then a revision from February that carried them on.
  const reg = changeRentFrom(base, '2027-01', { charges: 7500 }, { reason: 'regularization', regYear: 2025 });
  const rec = { rentChange: { from: '2027-01', replaced: null, charges: 7500, before: 5000 } };
  const later = changeRentFrom(withRents(reg), '2027-02', { rent: 81256 }, { reason: 'indexation' });
  assert.deepEqual(amounts(undoRegRent(later, 2025, rec)), [['2024-01', 80000, 5000, 'initial'], ['2027-02', 81256, 5000, 'indexation']]);
  // A revision recorded in the same month took the entry's place.
  const same = changeRentFrom(withRents(reg), '2027-01', { rent: 81256 }, { reason: 'indexation' });
  assert.deepEqual(amounts(undoRegRent(same, 2025, rec)), [['2024-01', 80000, 5000, 'initial'], ['2027-01', 81256, 5000, 'indexation']]);
  // The reconciliation replaced an entry; a revision from an earlier month then raised the rent.
  const planned = [...base.rents, { from: '2027-01', rent: 80000, charges: 5500, reason: 'manual' }];
  const reg2 = changeRentFrom(withRents(planned), '2027-01', { charges: 7500 }, { reason: 'regularization', regYear: 2025 });
  const rec2 = { rentChange: { from: '2027-01', replaced: planned[1], charges: 7500, before: 5500 } };
  const rev2 = changeRentFrom(withRents(reg2), '2026-12', { rent: 81256 }, { reason: 'indexation' });
  assert.deepEqual(amounts(undoRegRent(rev2, 2025, rec2)), [
    ['2024-01', 80000, 5000, 'initial'],
    ['2026-12', 81256, 5000, 'indexation'],
    ['2027-01', 81256, 5500, 'manual'],
  ]);
  // Charges changed again by hand since then: they are not touched.
  const again = changeRentFrom(withRents(reg), '2027-04', { charges: 9000 }, { reason: 'manual' });
  assert.deepEqual(amounts(undoRegRent(again, 2025, rec)), [['2024-01', 80000, 5000, 'initial'], ['2027-04', 80000, 9000, 'manual']]);
});

// ---------- paid in advance every 3 months ----------
const quarterly = { id: 'Q', startDate: '2026-01-01', trackFrom: '2026-01', paymentDay: 5, frequency: 3, periodAnchor: '2026-01',
  rents: [{ from: '2026-01', rent: 80000, charges: 5000 }], adjustments: [] };
const pay = (date, amount) => ({ id: date, leaseId: 'Q', date, amount });
const paid3 = ['2026-01-05', '2026-04-05', '2026-07-05'].map((d) => pay(d, 255000));

test('quarter paid in advance and not paid: the whole quarter is late from its payment date', () => {
  // before the payment date: owed, not late
  const early = ledger(quarterly, paid3, '2026-10-03');
  assert.equal(early.owed, 255000);
  assert.equal(early.overdue, 0);
  // after it: the three months, in the first month already
  for (const day of ['2026-10-15', '2026-11-09', '2026-12-20']) {
    const led = ledger(quarterly, paid3, day);
    assert.equal(led.overdue, 255000, day);
    assert.deepEqual(led.lateItems.map((r) => r.period), ['2026-10', '2026-11', '2026-12'], day);
  }
  // the next quarter is not counted before it starts
  assert.equal(ledger(quarterly, paid3, '2026-12-31').rows.at(-1).period, '2026-12');
  // part paid: the rest of the quarter is late
  assert.equal(ledger(quarterly, [...paid3, pay('2026-10-06', 100000)], '2026-10-15').overdue, 155000);
  // every 6 months
  const half = { ...quarterly, frequency: 6 };
  assert.equal(ledger(half, [pay('2026-01-05', 510000)], '2026-07-10').overdue, 510000);
});

test('quarter paid in advance: the rent call, what is due next and the tax year agree', () => {
  const some = [...paid3, pay('2026-10-06', 100000)];
  const call = rentCallBalance(quarterly, some, '2026-10', '2026-10-15');
  assert.equal(call.due.total, 255000);
  assert.equal(call.paidTowards, 100000);
  assert.equal(call.previous, 0);
  assert.equal(call.credit, 0);
  assert.equal(call.total, 155000);
  // quarter paid: nothing owed, next is January
  const all = [...paid3, pay('2026-10-05', 255000)];
  const led = ledger(quarterly, all, '2026-10-15');
  assert.equal(led.owed, 0);
  assert.equal(led.credit, 0);
  const next = nextPayment(quarterly, all, '2026-10-15');
  assert.equal(next.period, '2027-01');
  assert.equal(next.amount, 255000);
  // tax: the four quarters received in 2026, rent only
  assert.equal(rentReceived(quarterly, all, 2026, '2026-10-15').rent, 4 * 240000);
});

test('quarter paid in advance: cut to the lease and to the start of tracking', () => {
  // the lease ends in November: December is never owed
  const ending = { ...quarterly, endDate: '2026-11-30' };
  const led = ledger(ending, paid3, '2026-10-15');
  assert.deepEqual(led.rows.slice(-2).map((r) => r.period), ['2026-10', '2026-11']);
  assert.equal(led.overdue, 170000);
  // tracking starts in December: nothing before, and no month counted ahead of it
  const tracked = { ...quarterly, trackFrom: '2026-12' };
  assert.equal(ledger(tracked, [], '2026-11-09').rows.length, 0);
  assert.deepEqual(ledger(tracked, [], '2026-12-09').rows.map((r) => r.period), ['2026-12']);
  // paid at the end of each quarter: unchanged, nothing late before the payment date
  const arrears = { ...quarterly, payTiming: 'arrears' };
  assert.equal(ledger(arrears, paid3, '2026-12-20').overdue, 0);
  assert.equal(ledger(arrears, paid3, '2027-01-06').overdue, 255000);
  // monthly: unchanged
  const monthly = { ...quarterly, frequency: 1 };
  assert.deepEqual(ledger(monthly, [], '2026-02-10').rows.map((r) => r.period), ['2026-01', '2026-02']);
  assert.equal(rentAt(monthly, '2026-02').rent, 80000);
});
