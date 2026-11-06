// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { dueForPeriod, dueDateFor, indexationStatus, ledger, rentAt } from '../js/calc.js';
import { IRL_BUILTIN, parseInseeXml, latestForQuarter } from '../js/irl.js';
import { addMonths, addYears, fmtMoney, parseMoney } from '../js/util.js';

const base = {
  id: 'L1',
  propertyId: 'P1',
  startDate: '2026-01-01',
  paymentDay: 5,
  rents: [{ from: '2026-01', rent: 80000, charges: 5000 }],
  trackFrom: '2026-01',
  openingBalance: 0,
};

test('money parsing and formatting', () => {
  assert.equal(parseMoney('850'), 85000);
  assert.equal(parseMoney('1 234,56'), 123456);
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('1,234.56'), 123456);
  assert.equal(parseMoney('12,5 €'), 1250);
  assert.equal(parseMoney('-20'), -2000);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(fmtMoney(123456), '1 234,56 €');
  assert.equal(fmtMoney(-500), '-5,00 €');
  assert.equal(fmtMoney(5), '0,05 €');
});

test('date helpers', () => {
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addYears('2024-02-29', 1), '2025-02-28');
});

test('pro rata first and last month', () => {
  const l = { ...base, startDate: '2026-01-16', endDate: '2026-03-10' };
  const jan = dueForPeriod(l, '2026-01'); // 16 of 31 days
  assert.equal(jan.rent, Math.round(80000 * 16 / 31));
  assert.equal(jan.charges, Math.round(5000 * 16 / 31));
  assert.deepEqual(jan.prorata, { days: 16, dim: 31 });
  assert.equal(dueForPeriod(l, '2026-02').total, 85000);
  const mar = dueForPeriod(l, '2026-03');
  assert.equal(mar.rent, Math.round(80000 * 10 / 31));
  assert.equal(dueDateFor(l, '2026-01'), '2026-01-16');
  assert.equal(dueDateFor(l, '2026-02'), '2026-02-05');
});

test('rent changes apply from their month', () => {
  const l = { ...base, rents: [...base.rents, { from: '2026-07', rent: 82000, charges: 5000 }] };
  assert.equal(rentAt(l, '2026-06').rent, 80000);
  assert.equal(rentAt(l, '2026-07').rent, 82000);
  assert.equal(rentAt(l, '2027-01').rent, 82000);
});

test('ledger: payments clear oldest months first', () => {
  const pays = [
    { id: 'a', leaseId: 'L1', date: '2026-01-05', amount: 85000 },
    { id: 'b', leaseId: 'L1', date: '2026-02-10', amount: 40000 },
    { id: 'c', leaseId: 'L1', date: '2026-03-20', amount: 100000 },
  ];
  const led = ledger(base, pays, '2026-04-02');
  const st = Object.fromEntries(led.rows.map((r) => [r.period, [r.status, r.paid]]));
  assert.deepEqual(st['2026-01'], ['paid', 85000]);
  assert.deepEqual(st['2026-02'], ['paid', 85000]);
  assert.deepEqual(st['2026-03'], ['partial', 85000 - 30000]);
  assert.deepEqual(st['2026-04'], ['upcoming', 0]);
  assert.equal(led.rows.find((r) => r.period === '2026-02').paidDate, '2026-03-20');
  assert.equal(led.overdue, 30000);
  assert.equal(led.owed, 30000 + 85000);
  assert.equal(led.credit, 0);
});

test('ledger: overdue only after the payment day', () => {
  const led1 = ledger(base, [], '2026-01-05');
  assert.equal(led1.overdue, 0);
  assert.equal(led1.rows[0].status, 'upcoming');
  const led2 = ledger(base, [], '2026-01-06');
  assert.equal(led2.overdue, 85000);
  assert.equal(led2.rows[0].status, 'unpaid');
  assert.equal(led2.lateRows.length, 1);
});

test('ledger: opening balance and advance payments', () => {
  const l = { ...base, startDate: '2020-05-01', trackFrom: '2026-01', openingBalance: 20000 };
  const led = ledger(l, [{ id: 'a', leaseId: 'L1', date: '2026-01-03', amount: 85000 }], '2026-01-10');
  assert.equal(led.rows[0].period, '2026-01');
  assert.equal(led.opening.paid, 20000);
  assert.equal(led.rows[0].paid, 65000);
  assert.equal(led.overdue, 20000);

  const credit = ledger(base, [{ id: 'a', leaseId: 'L1', date: '2026-01-03', amount: 100000 }], '2026-01-10');
  assert.equal(credit.credit, 15000);
  assert.equal(credit.balance, -15000);

  const neg = ledger({ ...base, openingBalance: -5000 }, [{ id: 'a', leaseId: 'L1', date: '2026-01-03', amount: 80000 }], '2026-01-10');
  assert.equal(neg.rows[0].status, 'paid');
});

test('ledger ignores other leases and stops at the end date', () => {
  const l = { ...base, endDate: '2026-02-28' };
  const led = ledger(l, [{ id: 'x', leaseId: 'OTHER', date: '2026-01-03', amount: 85000 }], '2026-06-01');
  assert.equal(led.rows.length, 2);
  assert.equal(led.overdue, 170000);
});

test('IRL table and INSEE parsing', () => {
  assert.equal(IRL_BUILTIN['2025-Q2'], 146.68);
  const xml = '<Obs TIME_PERIOD="2026-Q3" OBS_VALUE="148.06" OBS_STATUS="A"/><Obs TIME_PERIOD="2026-Q2" OBS_VALUE="148.37"/>';
  assert.deepEqual(parseInseeXml(xml), { '2026-Q3': 148.06, '2026-Q2': 148.37 });
  assert.equal(latestForQuarter(IRL_BUILTIN, 2).key, '2026-Q2');
});

test('indexation: due, computed on the one-year IRL change', () => {
  const l = {
    ...base,
    startDate: '2024-09-01',
    rents: [{ from: '2024-09', rent: 80000, charges: 5000 }],
    irl: { quarter: 2, key: '2025-Q2', value: 146.68 },
    lastRevision: '2025-09-01',
  };
  const info = indexationStatus(l, { dpe: 'D' }, IRL_BUILTIN, '2026-11-05');
  assert.equal(info.state, 'due');
  assert.equal(info.anniversary, '2026-09-01');
  assert.equal(info.oldKey, '2025-Q2');
  assert.equal(info.newKey, '2026-Q2');
  assert.equal(info.newRent, Math.round(80000 * 148.37 / 146.68));
  assert.equal(info.applyFrom, '2026-12');
  assert.equal(info.deadline, '2027-09-01');
});

test('indexation: done, waiting, blocked, first year', () => {
  const l = {
    ...base,
    startDate: '2024-09-01',
    irl: { quarter: 2, key: '2026-Q2', value: 148.37 },
    lastRevision: '2026-09-01',
  };
  assert.equal(indexationStatus(l, {}, IRL_BUILTIN, '2026-11-05').state, 'done');
  const waiting = { ...l, irl: { quarter: 3, key: '2026-Q3', value: 148.06 }, lastRevision: '2025-11-01', revisionDate: '11-01' };
  assert.equal(indexationStatus(waiting, {}, IRL_BUILTIN, '2026-11-05').state, 'waiting');
  const blocked = { ...l, lastRevision: '2025-09-01', irl: { quarter: 2, key: '2025-Q2', value: 146.68 } };
  assert.equal(indexationStatus(blocked, { dpe: 'G' }, IRL_BUILTIN, '2026-11-05').state, 'blocked');
  const young = { ...l, startDate: '2026-03-01', lastRevision: null, irl: { quarter: 2, key: '2025-Q2', value: 146.68 } };
  assert.equal(indexationStatus(young, {}, IRL_BUILTIN, '2026-11-05').state, 'notYet');
  assert.equal(indexationStatus({ ...l, irl: null }, {}, IRL_BUILTIN, '2026-11-05'), null);
});

test('PDF text: letters the PDF fonts lack are simplified, French is kept', async () => {
  const { pdfText } = await import('../js/util.js');
  assert.equal(pdfText('Hélène Françoise Œuvre « 1 234,56 € » – l’été…'), 'Hélène Françoise Œuvre « 1 234,56 € » – l’été…');
  assert.equal(pdfText('Łukasz Wójcik'), 'Lukasz Wójcik');
  assert.equal(pdfText('Şahin Yılmaz'), 'Sahin Yilmaz');
  assert.equal(pdfText('Nguyễn Thị'), 'Nguyên Thi');
  assert.equal(pdfText('Ana Dragoș\u202f12'), 'Ana Dragos 12');
  assert.equal(pdfText('e\u0301te\u0301'), 'été'); // decomposed accents
  assert.equal(pdfText('Иван'), '????');
  assert.equal(pdfText('a\nb'), 'a\nb');
});

test('month overview: the deposit applied at departure is not money received', async () => {
  const { monthOverview } = await import('../js/calc.js');
  const state = { leases: [], payments: [
    { id: 'a', leaseId: 'X', date: '2026-11-03', amount: 50000, method: 'transfer' },
    { id: 'b', leaseId: 'X', date: '2026-11-04', amount: 80000, method: 'deposit' },
  ] };
  assert.equal(monthOverview(state, '2026-11-10').received, 50000);
});

test('lease form: correcting the rent fixes the amount in force and keeps the history', async () => {
  const { correctRent, rentEntryToCorrect } = await import('../js/calc.js');
  // never changed: the one amount is corrected
  const one = { startDate: '2026-08-16', rents: [{ from: '2026-08', rent: 52050, charges: 4000, reason: 'initial' }] };
  assert.deepEqual(correctRent(one, '2026-11-06', 53000, 4000), [{ from: '2026-08', rent: 53000, charges: 4000, reason: 'initial' }]);
  // with a revision: the revised amount (in force today) is corrected, the first one kept
  const two = { startDate: '2024-01-01', rents: [
    { from: '2024-01', rent: 60000, charges: 5000, reason: 'initial' },
    { from: '2026-01', rent: 62000, charges: 5000, reason: 'indexation' },
    { from: '2027-01', rent: 62000, charges: 6000, reason: 'manual' }, // a change planned later stays
  ] };
  assert.equal(rentEntryToCorrect(two, '2026-11-06').from, '2026-01');
  assert.deepEqual(correctRent(two, '2026-11-06', 61900, 5000).map((r) => [r.from, r.rent, r.charges, r.reason]),
    [['2024-01', 60000, 5000, 'initial'], ['2026-01', 61900, 5000, 'indexation'], ['2027-01', 62000, 6000, 'manual']]);
  // a lease that ended: the amount at its end; one starting later: its first amount
  assert.equal(rentEntryToCorrect({ ...two, endDate: '2025-06-30' }, '2026-11-06').from, '2024-01');
  assert.equal(rentEntryToCorrect({ startDate: '2027-02-01', rents: [{ from: '2027-02', rent: 1, charges: 0 }] }, '2026-11-06').from, '2027-02');
});
