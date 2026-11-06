// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ledger } from '../js/calc.js';
import {
  backupShrinks, checkGuarantor, checkInsurance, checkLease, checkNotFuture, checkPayment, checkRentChange, checkRevisionFrom, reminderSentSinceLate,
} from '../js/checks.js';
import { _dicts } from '../js/i18n.js';

const today = '2026-11-06';
const lease = { id: 'L', startDate: '2023-01-01', trackFrom: '2026-10', paymentDay: 5, rents: [{ from: '2023-01', rent: 60000, charges: 5000 }], adjustments: [] };
const keys = (r) => r.warnings.map((w) => w.key);

test('payment: future date, before tracking, far too much', () => {
  assert.deepEqual(keys(checkPayment(lease, [], { date: '2026-11-05', amount: 65000 }, today)), []);
  assert.deepEqual(keys(checkPayment(lease, [], { date: '2026-12-05', amount: 65000 }, today)), ['paymentFuture']);
  assert.deepEqual(keys(checkPayment(lease, [], { date: '2026-09-30', amount: 65000 }, today)), ['paymentBeforeTracking']);
  // owed: October and November (1300) + two months (1300): up to 2600 is fine
  assert.deepEqual(keys(checkPayment(lease, [], { date: today, amount: 260000 }, today)), []);
  const big = checkPayment(lease, [], { date: today, amount: 6500000 }, today);
  assert.deepEqual(keys(big), ['paymentTooMuch']);
  assert.deepEqual(big.warnings[0].params, { amount: 6500000, owed: 130000, rent: 65000 });
});

test('lease form: negative amounts, mistyped years, far dates, deposit cap', () => {
  const f = { startDate: '2026-01-01', rent: 60000, charges: 5000, deposit: 60000, insuranceUntil: '2027-01-01', lastRevision: null };
  assert.deepEqual(checkLease(f, today), { error: null, warnings: [] });
  for (const k of ['rent', 'charges', 'deposit']) assert.equal(checkLease({ ...f, [k]: -1 }, today).error.key, 'negativeAmount');
  assert.deepEqual(keys(checkLease({ ...f, startDate: '2062-01-01' }, today)), ['startFarFuture']);
  assert.deepEqual(keys(checkLease({ ...f, startDate: '1026-01-01' }, today)), ['startVeryOld']);
  assert.deepEqual(keys(checkLease({ ...f, insuranceUntil: '2062-01-01' }, today)), ['insuranceFarFuture']);
  assert.deepEqual(keys(checkLease({ ...f, lastRevision: '2027-01-01' }, today)), ['lastRevisionFuture']);
  assert.deepEqual(keys(checkLease({ ...f, deposit: 120000 }, today)), ['depositAboveCap']);
  // editing a lease: values already there are not questioned again
  const existing = { ...f, startDate: '1979-06-01', deposit: 120000 };
  assert.deepEqual(keys(checkLease({ ...f, startDate: '1979-06-01', deposit: 120000 }, today, existing)), []);
  assert.deepEqual(keys(checkInsurance('2027-11-06', today)), []);
});

test('change rent: F/G frozen, backdated, increase, before the start', () => {
  const prop = { dpe: 'D' };
  assert.equal(checkRentChange(lease, prop, { from: '', rent: 1, charges: 0 }, today).error.key, 'monthMissing');
  assert.equal(checkRentChange(lease, prop, { from: '2022-06', rent: 60000, charges: 5000 }, today).error.key, 'changeBeforeStart');
  assert.equal(checkRentChange(lease, prop, { from: '2026-12', rent: -1, charges: 0 }, today).error.key, 'negativeAmount');
  // new charges advance, from next month: nothing to ask
  assert.deepEqual(checkRentChange(lease, prop, { from: '2026-12', rent: 60000, charges: 6000 }, today), { error: null, warnings: [] });
  // more charges, backdated: asks
  assert.deepEqual(keys(checkRentChange(lease, prop, { from: '2026-09', rent: 60000, charges: 6000 }, today)), ['changeBackdated']);
  // rent up, from next month: asks (only the yearly revision normally)
  assert.deepEqual(keys(checkRentChange(lease, prop, { from: '2026-12', rent: 61000, charges: 5000 }, today)), ['rentIncrease']);
  // rent down, even backdated: fine
  assert.deepEqual(keys(checkRentChange(lease, prop, { from: '2026-09', rent: 59000, charges: 5000 }, today)), []);
  // F or G: no increase at all; lowering stays possible
  for (const dpe of ['F', 'G']) {
    assert.equal(checkRentChange(lease, { dpe }, { from: '2026-12', rent: 61000, charges: 5000 }, today).error.key, 'dpeFrozenChange');
    assert.equal(checkRentChange(lease, { dpe }, { from: '2026-12', rent: 59000, charges: 5000 }, today).error, null);
  }
});

test('revision: never backdated', () => {
  const info = { applyFrom: '2026-12' };
  assert.equal(checkRevisionFrom(info, '2026-11').error.key, 'revisionBackdated');
  assert.equal(checkRevisionFrom(info, '2026-12').error, null);
  assert.equal(checkRevisionFrom(info, '2027-01').error, null);
});

test('dates that should not be in the future; guarantor; formal notice; backup', () => {
  for (const kind of ['expense', 'diagnostic', 'depositReturned']) {
    assert.deepEqual(keys(checkNotFuture(kind, '2026-12-01', today)), [`${kind}Future`]);
    assert.deepEqual(keys(checkNotFuture(kind, today, today)), []);
  }
  assert.equal(checkGuarantor({ maxAmount: 0 }).error.key, 'guarantorZero');
  assert.equal(checkGuarantor({ maxAmount: 100 }).error, null);
  const led = ledger(lease, [], today); // October and November late
  assert.equal(reminderSentSinceLate(lease, led, {}), false);
  assert.equal(reminderSentSinceLate(lease, led, { 'reminder:L': '2026-09-20' }), false); // before October fell due
  assert.equal(reminderSentSinceLate(lease, led, { 'reminder:L': '2026-10-15' }), true);
  assert.equal(backupShrinks({ p: 15, l: 15, pay: 300 }, { p: 15, l: 14, pay: 290 }), false);
  assert.equal(backupShrinks({ p: 15, l: 15, pay: 300 }, { p: 1, l: 0, pay: 0 }), true);
  assert.equal(backupShrinks({ p: 1, l: 1, pay: 3 }, { p: 1, l: 0, pay: 0 }), false); // too small to judge
  assert.equal(backupShrinks(undefined, { p: 1, l: 1, pay: 0 }), false);
});

test('every message a check can show exists in French and English', () => {
  const src = readFileSync(new URL('../js/checks.js', import.meta.url), 'utf8');
  const found = new Set([...src.matchAll(/key: '(\w+)'/g), ...src.matchAll(/refuse\('(\w+)'/g)].map((m) => m[1]));
  for (const kind of ['expense', 'diagnostic', 'depositReturned']) found.add(`${kind}Future`);
  assert.ok(found.size >= 18, [...found].join());
  for (const k of found) for (const lang of ['fr', 'en']) assert.ok(_dicts[lang][`chk_${k}`], `${lang}: chk_${k}`);
});
