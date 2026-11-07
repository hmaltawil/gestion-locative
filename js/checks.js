// Checks on what is typed in, before it is saved. Pure functions, tested in
// tests/checks.test.mjs. Each returns { error, warnings }:
// - error: the app refuses, with a message;
// - warnings: the app asks first, one question per warning.
// Messages are the i18n keys 'chk_<key>'. Params are raw values the screen
// formats: `date` (YYYY-MM-DD), `month` (YYYY-MM), and cents for
// amount, owed, rent, max, from, to, expected, diff.

import { addDays, addYears, periodOf } from './util.js';
import { currentRent, firstTrackedPeriod, frequencyOf, ledger, sortedRents } from './calc.js';

const ok = (warnings = []) => ({ error: null, warnings });
const refuse = (key, params = {}) => ({ error: { key, params }, warnings: [] });
const changed = (existing, key, value) => !existing || existing[key] !== value;

export const MAX_DOC_BYTES = 15e6; // one attached file (15 Mo)
export const MIN_PASSPHRASE = 12; // the only protection of the GitHub copy if the token leaks

// A payment typed in by hand.
export function checkPayment(lease, payments, { date, amount }, today) {
  const w = [];
  // A receipt proves payment: record money once it has arrived.
  if (date > today) w.push({ key: 'paymentFuture', params: { date } });
  // Before tracking started, it is usually already in "owed at that date".
  const first = firstTrackedPeriod(lease);
  if (first && date < `${first}-01`) w.push({ key: 'paymentBeforeTracking', params: { date, month: first } });
  // Far more than owed plus two payments (months, or periods of 3 or 6 months):
  // probably a typing mistake (65000 for 650).
  const cur = currentRent(lease, today);
  const rent = (cur.rent + cur.charges) * frequencyOf(lease);
  const led = ledger(lease, payments, today);
  const owed = Math.max(0, led.owed - led.credit);
  if (rent > 0 && amount > owed + 2 * rent) w.push({ key: 'paymentTooMuch', params: { amount, owed, rent } });
  return ok(w);
}

// Law "Climat et résilience" (metropolitan France): from these dates a home
// with this energy rating is not "decent", so it can't be let under a new
// lease or renewed.
export const DPE_BAN = { G: '2025-01-01', F: '2028-01-01', E: '2034-01-01' };
export function dpeBanned(dpe, date) {
  return !!(DPE_BAN[dpe] && date >= DPE_BAN[dpe]);
}

// The lease form. `existing` is the lease before the edit (null for a new one),
// so a value that was already there is not questioned again on every edit.
export function checkLease(f, today, existing = null, property = null) {
  if ([f.rent, f.charges, f.deposit].some((v) => typeof v === 'number' && v < 0)) return refuse('negativeAmount');
  const w = [];
  if (f.startDate && changed(existing, 'startDate', f.startDate)) {
    if (f.startDate > addYears(today, 1)) w.push({ key: 'startFarFuture', params: { date: f.startDate } });
    if (f.startDate < '1980-01-01') w.push({ key: 'startVeryOld', params: { date: f.startDate } });
  }
  if (f.insuranceUntil && changed(existing, 'insuranceUntil', f.insuranceUntil)) w.push(...checkInsurance(f.insuranceUntil, today).warnings);
  if (f.lastRevision && f.lastRevision > today && changed(existing, 'lastRevision', f.lastRevision)) {
    w.push({ key: 'lastRevisionFuture', params: { date: f.lastRevision } });
  }
  // Unfurnished lease: the deposit is at most one month's rent excluding charges.
  if (f.rent > 0 && f.deposit > f.rent && changed(existing, 'deposit', f.deposit)) w.push({ key: 'depositAboveCap', params: { max: f.rent } });
  // Unfurnished lease: fixed charges only in a flat-share (article 8-1).
  if (f.chargesType === 'forfait' && changed(existing, 'chargesType', 'forfait')) w.push({ key: 'forfaitColocation' });
  // A new lease (or a move to another property) on a home that can no longer be let.
  const dpe = property && property.dpe;
  if (f.startDate && dpeBanned(dpe, f.startDate) && (changed(existing, 'startDate', f.startDate) || changed(existing, 'propertyId', f.propertyId))) {
    w.push({ key: 'dpeIndecent', params: { dpe, date: DPE_BAN[dpe] } });
  }
  return ok(w);
}

// Tenants renew their home insurance every year.
export function checkInsurance(until, today) {
  return ok(until > addDays(addYears(today, 1), 90) ? [{ key: 'insuranceFarFuture', params: { date: until } }] : []);
}

// "Change rent": a new rent or charges amount from a given month.
export function checkRentChange(lease, property, { from, rent, charges }, today) {
  if (!from) return refuse('monthMissing');
  if (rent < 0 || charges < 0) return refuse('negativeAmount');
  if (lease.startDate && from < periodOf(lease.startDate)) return refuse('changeBeforeStart', { month: periodOf(lease.startDate) });
  const rents = sortedRents(lease);
  const before = rents.filter((r) => r.from < from).pop() || rents[0] || { rent: 0, charges: 0 };
  const up = rent > before.rent;
  // Properties rated F or G: no rent increase at all (law "Climat et résilience").
  if (up && property && (property.dpe === 'F' || property.dpe === 'G')) return refuse('dpeFrozenChange');
  const w = [];
  // An increase is never backdated.
  if (from < periodOf(today) && rent + charges > before.rent + before.charges) w.push({ key: 'changeBackdated', params: { month: from } });
  // Mid-lease, the rent itself goes up only through the yearly revision (or a works clause).
  if (up) w.push({ key: 'rentIncrease', params: { from: before.rent, to: rent } });
  return ok(w);
}

// The yearly revision applies from the first due date after the request, never earlier.
export function checkRevisionFrom(info, applyFrom) {
  if (!applyFrom) return refuse('monthMissing');
  if (applyFrom < info.applyFrom) return refuse('revisionBackdated', { month: info.applyFrom });
  return ok();
}

// Dates that should not be in the future: an expense (it would count in a
// later tax year), a diagnostic report (its expiry would move years ahead),
// a deposit marked as returned.
export function checkNotFuture(kind, date, today) {
  return ok(date && date > today ? [{ key: `${kind}Future`, params: { date } }] : []);
}

// The amount actually sent back when the deposit is returned, compared with the
// statement (st from departureStatement in charges.js, penalty included).
export function checkDepositReturned(st, amount) {
  if (amount < 0) return refuse('negativeAmount');
  if (amount === st.toReturn) return ok();
  const key = amount < st.toReturn ? 'depositReturnedLess' : 'depositReturnedMore';
  return ok([{ key, params: { amount, expected: st.toReturn, diff: Math.abs(amount - st.toReturn) } }]);
}

export function checkGuarantor({ maxAmount }) {
  return maxAmount > 0 ? ok() : refuse('guarantorZero');
}

// The formal notice says reminders were sent: was one made in the app since
// the oldest amount still late fell due? (sent['reminder:<leaseId>'] = date)
export function reminderSentSinceLate(lease, led, sent) {
  const oldest = (led.lateItems || []).map((d) => d.dueDate).filter(Boolean).sort()[0];
  const last = (sent || {})[`reminder:${lease.id}`];
  return !!(oldest && last && last >= oldest);
}

// The data about to go to GitHub has lost more than half of the leases,
// payments or properties of the last backup (after an erase or a mass deletion).
// counts: { p, l, pay } from snapshots.js
export function backupShrinks(prev, now) {
  if (!prev || !now) return false;
  const lost = (k, min) => (prev[k] || 0) >= min && (now[k] || 0) < prev[k] / 2;
  return lost('l', 2) || lost('p', 2) || lost('pay', 10);
}
