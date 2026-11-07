// Fixes from the 7 Nov 2026 code review (version 1.3.9).
import test from 'node:test';
import assert from 'node:assert/strict';
import { ledger } from '../js/calc.js';
import { departureStatement, depositSettlement } from '../js/charges.js';
import { checkDepositReturned } from '../js/checks.js';

const baseLease = {
  id: 'L', startDate: '2024-01-01', deposit: 80000, paymentDay: 1,
  rents: [{ from: '2024-01', rent: 80000, charges: 5000 }],
};
const paidTo = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, leaseId: 'L', date: `2026-${String(i + 1).padStart(2, '0')}-02`, amount: 85000 }));

test('early move-out: rent stays due until the lease end, the deposit deadline runs from the keys', () => {
  // Notice ends 31 October, keys back 30 September, rent paid to September.
  const lease = { ...baseLease, trackFrom: '2026-01', endDate: '2026-10-31' };
  const led = ledger(lease, paidTo(9), '2026-11-07');
  const st = departureStatement(lease, led, { keysDate: '2026-09-30', inventoryMatches: true }, '2026-11-07');
  assert.equal(st.arrears, 85000); // October is still owed
  assert.equal(st.deadline, '2026-10-30'); // one month after the keys
  assert.equal(st.refund, 0); // the 800 € deposit doesn't cover October's 850 €
  assert.equal(st.stillOwed, 5000);
});

test('deposit returned: the amount actually sent back is what the account books', () => {
  const lease = { ...baseLease, trackFrom: '2026-01', endDate: '2026-09-30' };
  const pays = paidTo(9);
  const led = ledger(lease, pays, '2026-10-10');
  const st = departureStatement(lease, led, { keysDate: '2026-09-30', deductions: [{ label: 'Peinture', amount: 10000 }] }, '2026-10-10');
  assert.equal(st.toReturn, 70000);
  // Same amount as the statement: account ends at zero.
  const same = depositSettlement(st, [{ label: 'Peinture', amount: 10000 }], '2026-09-30', '2026-10-10', 70000);
  const after = (s) => ledger({ ...lease, adjustments: s.adjustments }, [...pays, { id: 'dep', leaseId: 'L', ...s.payment }], '2026-10-10');
  assert.equal(after(same).balance, 0);
  // 50 € less sent back: the tenant is still owed 50 €.
  const less = depositSettlement(st, [{ label: 'Peinture', amount: 10000 }], '2026-09-30', '2026-10-10', 65000);
  assert.equal(after(less).balance, -5000);
  // Default (no amount given) keeps the statement's figure.
  assert.deepEqual(depositSettlement(st, [{ label: 'Peinture', amount: 10000 }], '2026-09-30', '2026-10-10'), same);
});

test('deposit returned: a different amount asks first, a negative one is refused', () => {
  const st = { toReturn: 70000, penalty: 0 };
  assert.deepEqual(checkDepositReturned(st, 70000).warnings, []);
  assert.equal(checkDepositReturned(st, 65000).warnings[0].key, 'depositReturnedLess');
  assert.equal(checkDepositReturned(st, 65000).warnings[0].params.diff, 5000);
  assert.equal(checkDepositReturned(st, 75000).warnings[0].key, 'depositReturnedMore');
  assert.equal(checkDepositReturned(st, -1).error.key, 'negativeAmount');
});

test('rent revision never goes above the legal maximum, even by a cent', async () => {
  const { indexationStatus } = await import('../js/calc.js');
  const { IRL_BUILTIN } = await import('../js/irl.js');
  for (let rent = 30000; rent < 160000; rent += 7) {
    const lease = { id: 'L', startDate: '2020-01-15', revisionDate: '01-15', irl: { quarter: 2, key: '2025-Q2', value: 146.68 }, rents: [{ from: '2020-01', rent, charges: 0 }] };
    const info = indexationStatus(lease, { dpe: 'C' }, IRL_BUILTIN, '2026-11-07');
    const cap = (rent * 148.37) / 146.68;
    assert.ok(info.newRent <= cap + 1e-6, `${rent}: ${info.newRent} > ${cap}`);
    assert.ok(info.newRent > cap - 1, `${rent}: ${info.newRent} too low`);
  }
  // An exact result stays exact (no loss to floating point).
  const exact = { id: 'L', startDate: '2020-01-15', revisionDate: '01-15', irl: { quarter: 1, key: '2025-Q1', value: 100 }, rents: [{ from: '2020-01', rent: 100000, charges: 0 }] };
  const info = indexationStatus(exact, null, { '2025-Q1': 100, '2026-Q1': 103.5 }, '2026-11-07');
  assert.equal(info.newRent, 103500);
});

test('amounts: "1.200" is 1 200 €, decimals still work', async () => {
  const { parseMoney } = await import('../js/util.js');
  const { parseBankAmount } = await import('../js/bank.js');
  assert.equal(parseMoney('1.200'), 120000);
  assert.equal(parseMoney('1,200'), 120000);
  assert.equal(parseMoney('12.500 €'), 1250000);
  assert.equal(parseMoney('1.234.567'), 123456700);
  assert.equal(parseMoney('-1.200'), -120000);
  assert.equal(parseMoney('1.20'), 120);
  assert.equal(parseMoney('1,5'), 150);
  assert.equal(parseMoney('0,500'), 50); // not a thousands group
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('1,234.56'), 123456);
  assert.equal(parseMoney('850'), 85000);
  assert.equal(parseBankAmount('1.000-'), -100000);
});

test('cleaning: a lease without a valid start date is repaired, not left to crash the screens', async () => {
  const { normalize } = await import('../js/store.js');
  const s = normalize({ settings: {}, leases: [
    { id: 'a', startDate: 'garbage', rents: [{ from: '2025-03', rent: 100, charges: 0 }, { from: '2024-06', rent: 90, charges: 0 }] },
    { id: 'b', trackFrom: '2023-02' },
    { id: 'c' },
    { id: 'd', startDate: '2022-05-10' },
  ] });
  assert.equal(s.leases[0].startDate, '2024-06-01');
  assert.equal(s.leases[1].startDate, '2023-02-01');
  assert.match(s.leases[2].startDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(s.leases[3].startDate, '2022-05-10');
  const { provisionsForYear } = await import('../js/charges.js');
  for (const l of s.leases) provisionsForYear(l, 2025); // no longer throws
});

test('IRL reference without a year: no crash', async () => {
  const { fmtIrlKey } = await import('../js/irl.js');
  assert.equal(fmtIrlKey(null), '—');
  assert.equal(fmtIrlKey('2026-Q1', 'fr'), '1er trimestre 2026');
});

test('backup file built piece by piece reads back the same', async () => {
  const { backupBlob, parseBackup, emptyState } = await import('../js/store.js');
  const st = { ...emptyState(), properties: [{ id: 'P', name: 'Appartement "Gambetta"' }], payments: [{ id: 'x', leaseId: 'L', date: '2026-01-02', amount: 85000 }] };
  const text = await (await backupBlob(st, false)).text();
  const raw = JSON.parse(text);
  assert.equal(raw.app, 'gestion-locative');
  assert.deepEqual(raw.files, {});
  const back = parseBackup(text);
  assert.equal(back.state.properties[0].name, 'Appartement "Gambetta"');
  assert.equal(back.state.payments[0].amount, 85000);
});

test('lease term after a leap year, and from 29 February', async () => {
  const { nextTermEnd } = await import('../js/charges.js');
  assert.equal(nextTermEnd({ startDate: '2018-03-01' }, '2023-06-01').termEnd, '2024-02-29');
  assert.equal(nextTermEnd({ startDate: '2018-03-01' }, '2024-06-01').termEnd, '2027-02-28');
  assert.equal(nextTermEnd({ startDate: '2020-02-29' }, '2021-01-01').termEnd, '2023-02-28');
  assert.equal(nextTermEnd({ startDate: '2021-09-01' }, '2026-11-05').termEnd, '2027-08-31');
});

test('revision anniversary on 29 February stays the 29th in leap years', async () => {
  const { revisionAnniversary } = await import('../js/calc.js');
  assert.equal(revisionAnniversary({ revisionDate: '02-29' }, '2025-01-10'), '2024-02-29');
  assert.equal(revisionAnniversary({ revisionDate: '02-29' }, '2025-03-10'), '2025-02-28');
  assert.equal(revisionAnniversary({ revisionDate: '09-01' }, '2026-11-05'), '2026-09-01');
  assert.equal(revisionAnniversary({ revisionDate: '12-15' }, '2026-11-05'), '2025-12-15');
});

test('fixed charges and homes that can no longer be let: the lease form asks first', async () => {
  const { checkLease } = await import('../js/checks.js');
  const keys = (r) => r.warnings.map((w) => w.key);
  const f = { startDate: '2026-03-01', rent: 80000, deposit: 80000, chargesType: 'provision', propertyId: 'P' };
  assert.deepEqual(keys(checkLease(f, '2026-11-07', null, { dpe: 'D' })), []);
  assert.deepEqual(keys(checkLease({ ...f, chargesType: 'forfait' }, '2026-11-07')), ['forfaitColocation']);
  // already a forfait: not asked again on every edit
  assert.deepEqual(keys(checkLease({ ...f, chargesType: 'forfait' }, '2026-11-07', { ...f, chargesType: 'forfait' })), []);
  assert.deepEqual(keys(checkLease(f, '2026-11-07', null, { dpe: 'G' })), ['dpeIndecent']);
  assert.deepEqual(keys(checkLease(f, '2026-11-07', null, { dpe: 'F' })), []); // F only from 2028
  assert.deepEqual(keys(checkLease({ ...f, startDate: '2028-02-01' }, '2028-01-15', null, { dpe: 'F' })), ['dpeIndecent']);
  assert.deepEqual(keys(checkLease({ ...f, startDate: '2024-06-01' }, '2026-11-07', null, { dpe: 'G' })), []); // signed before 2025
  // editing an existing lease without changing its date or property: not asked again
  assert.deepEqual(keys(checkLease(f, '2026-11-07', { ...f }, { dpe: 'G' })), []);
});

test('undoing a reconciliation also takes back the new monthly charges', async () => {
  const { undoRegRent } = await import('../js/charges.js');
  const before = [{ from: '2025-01', rent: 80000, charges: 5000 }, { from: '2026-12', rent: 82000, charges: 5000, reason: 'indexation' }];
  // The reconciliation of 2025 replaced the December entry with new charges.
  const after = [{ from: '2025-01', rent: 80000, charges: 5000 }, { from: '2026-12', rent: 82000, charges: 6000, reason: 'regularization', regYear: 2025 }];
  const rec = { rentChange: { from: '2026-12', replaced: before[1] } };
  assert.deepEqual(undoRegRent(after, 2025, rec), before);
  // Without a replaced entry, the new one just goes.
  assert.deepEqual(undoRegRent([before[0], { from: '2027-01', rent: 80000, charges: 6000, reason: 'regularization', regYear: 2025 }], 2025, {}), [before[0]]);
  // Another year's change is kept.
  const other = { from: '2027-01', rent: 80000, charges: 6000, reason: 'regularization', regYear: 2026 };
  assert.deepEqual(undoRegRent([before[0], other], 2025, {}), [before[0], other]);
});

test('tax summary shows fixed charges received apart', async () => {
  const { taxSummary } = await import('../js/tax.js');
  const lease = { id: 'L', propertyId: 'P', startDate: '2025-01-01', paymentDay: 1, chargesType: 'forfait', rents: [{ from: '2025-01', rent: 80000, charges: 5000 }] };
  const payments = [{ id: 'a', leaseId: 'L', date: '2025-01-03', amount: 85000 }];
  const s = taxSummary({ properties: [{ id: 'P' }], leases: [lease], payments, expenses: [] }, 2025, '2025-02-10');
  assert.equal(s.gross, 80000);
  assert.equal(s.forfaitCharges, 5000);
});

test('accountant CSV: no formulas, French labels, deposit rows named as such', async () => {
  const { yearCsv } = await import('../js/tax.js');
  const st = {
    properties: [{ id: 'P', name: 'Appt' }],
    leases: [{ id: 'L', propertyId: 'P', tenants: [{ name: '=HYPERLINK("http://x","clic")' }] }],
    payments: [{ id: 'a', leaseId: 'L', date: '2026-02-01', amount: 85000, method: 'transfer' }, { id: 'b', leaseId: 'L', date: '2026-10-01', amount: 80000, method: 'deposit' }],
    expenses: [{ id: 'e', propertyId: 'P', date: '2026-03-01', amount: 12000, category: 'works', description: '+33 plombier' }],
  };
  const rows = yearCsv(st, 2026).replace(/^\uFEFF/, '').split('\r\n');
  assert.ok(rows[1].includes(`"'=HYPERLINK(""http://x"",""clic"")"`));
  assert.ok(rows[1].includes(';Virement;'));
  assert.ok(rows[2].includes("'+33 plombier") && rows[2].includes('Travaux') && rows[2].endsWith(';-120,00'));
  assert.ok(rows[3].startsWith('2026-10-01;Dépôt de garantie imputé;'));
});

test('encryption: new backups use 600,000 rounds, older ones open, tampered counts are refused', async () => {
  const { encryptJson, decryptJson } = await import('../js/crypto.js');
  const env = await encryptJson({ a: 1 }, 'correct horse battery');
  assert.equal(JSON.parse(env).kdf.iterations, 600000);
  assert.deepEqual(await decryptJson(env, 'correct horse battery'), { a: 1 });
  const tampered = JSON.stringify({ ...JSON.parse(env), kdf: { ...JSON.parse(env).kdf, iterations: 2 ** 31 } });
  await assert.rejects(decryptJson(tampered, 'correct horse battery'), /not-encrypted/);
});

test('offline: every app file is in the service worker list', async () => {
  const fs = await import('node:fs');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const listed = new Set([...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]));
  for (const dir of ['js', 'css', 'icons', 'vendor']) {
    for (const f of fs.readdirSync(new URL(`../${dir}/`, import.meta.url))) {
      if (/\.(js|css|png)$/.test(f)) assert.ok(listed.has(`${dir}/${f}`), `${dir}/${f} is missing from FILES in sw.js`);
    }
  }
  assert.ok(listed.has('index.html') && listed.has('manifest.webmanifest'));
});

test('encryption: a backup made before 1.3.9 (310,000 rounds) still opens', async () => {
  const { decryptJson, bytesToB64 } = await import('../js/crypto.js');
  const subtle = globalThis.crypto.subtle;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const base = await subtle.importKey('raw', new TextEncoder().encode('old passphrase 1'), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 310000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify({ old: true })));
  const env = JSON.stringify({ format: 'gestion-locative-encrypted', v: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 310000, salt: bytesToB64(salt) }, cipher: 'AES-GCM', iv: bytesToB64(iv), data: bytesToB64(new Uint8Array(data)) });
  assert.deepEqual(await decryptJson(env, 'old passphrase 1'), { old: true });
});
