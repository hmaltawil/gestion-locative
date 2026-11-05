// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { ledger } from '../js/calc.js';
import { amountInFrench, numberToFrench } from '../js/util.js';
import { guessMapping, knownLabels, labelKey, parseBankAmount, parseBankDate, parseCsv, suggestLease, toTransactions } from '../js/bank.js';
import { departureStatement, lateMonths, nextTermEnd, occupancyDays, provisionsForYear, regularization } from '../js/charges.js';
import { rentReceived, taxSummary, yearCsv } from '../js/tax.js';
import { buildIcs, deadlines } from '../js/deadlines.js';

const lease = {
  id: 'L1', propertyId: 'P1', startDate: '2025-01-01', paymentDay: 5, chargesType: 'provision',
  rents: [{ from: '2025-01', rent: 80000, charges: 5000 }], trackFrom: '2025-01', openingBalance: 0,
  tenants: [{ name: 'Jean Martin' }], deposit: 80000, adjustments: [],
};

test('numbers in French words', () => {
  const cases = {
    0: 'zéro', 1: 'un', 16: 'seize', 17: 'dix-sept', 21: 'vingt et un', 22: 'vingt-deux', 70: 'soixante-dix',
    71: 'soixante et onze', 72: 'soixante-douze', 80: 'quatre-vingts', 81: 'quatre-vingt-un', 91: 'quatre-vingt-onze',
    99: 'quatre-vingt-dix-neuf', 100: 'cent', 101: 'cent un', 200: 'deux cents', 201: 'deux cent un', 280: 'deux cent quatre-vingts',
    1000: 'mille', 1810: 'mille huit cent dix', 2000: 'deux mille', 80000: 'quatre-vingt mille', 200000: 'deux cent mille',
    1000000: 'un million', 2500000: 'deux millions cinq cent mille',
  };
  for (const [n, w] of Object.entries(cases)) assert.equal(numberToFrench(Number(n)), w, n);
  assert.equal(amountInFrench(181050), 'mille huit cent dix euros et cinquante centimes');
  assert.equal(amountInFrench(100), 'un euro');
  assert.equal(amountInFrench(2916000), 'vingt-neuf mille cent soixante euros');
});

test('ledger: one-off charges and credits', () => {
  const l = { ...lease, adjustments: [
    { id: 'a', date: '2025-02-15', label: 'Régularisation', amount: 12000, kind: 'regularization' },
    { id: 'b', date: '2025-03-01', label: 'Avoir', amount: -5000, kind: 'other' },
  ] };
  const pays = [{ id: 'p1', leaseId: 'L1', date: '2025-01-05', amount: 85000 }, { id: 'p2', leaseId: 'L1', date: '2025-02-05', amount: 85000 }];
  const led = ledger(l, pays, '2025-03-10');
  // Jan, Feb paid; regularization (120) partly paid by the 50 credit; March unpaid
  const adj = led.adjustments.find((x) => x.id === 'a');
  assert.equal(adj.paid, 5000);
  assert.equal(led.overdue, 7000 + 85000);
  assert.equal(led.lateItems.length, 2);
});

test('bank CSV: French export with preamble, debit/credit columns', () => {
  const csv = [
    'Compte courant;FR76 XXXX',
    'Solde au 31/10/2026;12 345,67',
    '',
    'Date opération;Date valeur;Libellé;Débit;Crédit',
    '03/10/2026;03/10/2026;VIR SEPA RECU /DE M JEAN MARTIN /MOTIF LOYER OCT;;850,00',
    '04/10/2026;04/10/2026;"PRLV SEPA EDF; facture";62,30;',
    '05/10/2026;05/10/2026;VIR INST RECU DE SOPHIE BERNARD;;560,50',
    '05/10/2026;05/10/2026;VIR INST RECU DE SOPHIE BERNARD;;560,50',
  ].join('\r\n');
  const { delimiter, rows } = parseCsv(csv);
  assert.equal(delimiter, ';');
  const map = guessMapping(rows);
  assert.equal(map.headerRow, 2); // blank lines are dropped
  assert.deepEqual([map.date, map.label, map.debit, map.credit], [0, 2, 3, 4]);
  const txs = toTransactions(rows, map);
  assert.equal(txs.length, 4);
  assert.deepEqual(txs.map((t) => t.amount), [85000, -6230, 56050, 56050]);
  assert.equal(txs[1].label, 'PRLV SEPA EDF; facture');
  assert.notEqual(txs[2].fp, txs[3].fp);
});

test('bank CSV: single signed amount column, comma separated', () => {
  const csv = 'Date,Description,Amount\n2026-10-03,"Transfer from J MARTIN","850.00"\n2026-10-04,Card payment,-12.50\n';
  const { rows } = parseCsv(csv);
  const map = guessMapping(rows);
  const txs = toTransactions(rows, map);
  assert.deepEqual(txs.map((t) => [t.date, t.amount]), [['2026-10-03', 85000], ['2026-10-04', -1250]]);
});

test('bank dates and amounts', () => {
  assert.equal(parseBankDate('03/10/26'), '2026-10-03');
  assert.equal(parseBankDate('3.1.2026'), '2026-01-03');
  assert.equal(parseBankDate('2026-10-03T00:00'), '2026-10-03');
  assert.equal(parseBankDate('Libellé'), null);
  assert.equal(parseBankAmount('+1 250,00 EUR'), 125000);
  assert.equal(parseBankAmount('-62,30'), -6230);
});

test('bank matching: name, amount and previous labels', () => {
  const sophie = { id: 'L2', tenants: [{ name: 'Sophie Bernard' }] };
  const cands = [{ lease, monthTotal: 85000, owed: 85000 }, { lease: sophie, monthTotal: 56050, owed: 0 }];
  const tx = { label: 'VIR SEPA RECU /DE M JEAN MARTIN /MOTIF LOYER', amount: 85000 };
  assert.equal(suggestLease(tx, cands, {}).leaseId, 'L1');
  const caf = { label: 'VIR CAF DU RHONE 123456 ALLOC LOGEMENT', amount: 21000 };
  assert.equal(suggestLease(caf, cands, {}).leaseId, '');
  const known = knownLabels([{ leaseId: 'L2', bankLabel: 'VIR CAF DU RHONE 999 ALLOC LOGEMENT' }]);
  assert.equal(labelKey(caf.label), 'CAF RHONE ALLOC LOGEMENT');
  assert.equal(suggestLease(caf, cands, known).leaseId, 'L2');
});

test('charges reconciliation, pro-rated by occupancy', () => {
  const l = { ...lease, startDate: '2025-07-01' };
  assert.equal(occupancyDays(l, 2025), 184);
  assert.equal(provisionsForYear(l, 2025), 6 * 5000);
  const r = regularization(l, 2025, [{ label: 'Eau', amount: 48000 }, { label: 'TEOM', amount: 24000 }]);
  assert.equal(r.actualTotal, 72000);
  assert.equal(r.tenantShare, Math.round(72000 * 184 / 365));
  assert.equal(r.balance, r.tenantShare - 30000);
  assert.equal(r.suggestedMonthly, 6000);
});

test('departure: deposit statement, deadline and late penalty', () => {
  const l = { ...lease, endDate: '2025-03-15' };
  const led = ledger(l, [
    { id: 'p1', leaseId: 'L1', date: '2025-01-05', amount: 85000 },
    { id: 'p2', leaseId: 'L1', date: '2025-02-05', amount: 85000 },
  ], '2025-04-01');
  // March pro-rata 15/31 owed
  const march = Math.round(80000 * 15 / 31) + Math.round(5000 * 15 / 31);
  const st = departureStatement(l, led, { keysDate: '2025-03-15', inventoryMatches: true, deductions: [{ label: 'Peinture', amount: 10000 }], retention: 99999 }, '2025-04-01');
  assert.equal(st.arrears, march);
  assert.equal(st.retention, 16000); // capped at 20 %
  assert.equal(st.toReturn, 80000 - march - 10000 - 16000);
  assert.equal(st.deadline, '2025-04-15');
  assert.equal(st.lateMonths, 0);
  const late = departureStatement(l, led, { keysDate: '2025-03-15', inventoryMatches: false }, '2025-06-20');
  assert.equal(late.deadline, '2025-05-15');
  assert.equal(late.lateMonths, 2);
  assert.equal(late.penalty, 2 * 8000);
  assert.equal(lateMonths('2025-05-15', '2025-05-16'), 1);
});

test('lease term and landlord notice date', () => {
  const t = nextTermEnd({ startDate: '2021-09-01' }, '2026-11-05');
  assert.deepEqual(t, { termEnd: '2027-08-31', noticeBy: '2027-02-28' });
});

test('tax summary: rents received excl. charges, expenses by line', () => {
  const state = {
    properties: [{ id: 'P1', name: 'Gambetta' }, { id: 'P2', name: 'Vide' }],
    leases: [lease],
    payments: [
      { id: 'p0', leaseId: 'L1', date: '2025-01-05', amount: 85000 },
      { id: 'p1', leaseId: 'L1', date: '2025-12-28', amount: 170000 }, // Dec 2025 + advance for Jan 2026
    ],
    expenses: [
      { id: 'e1', date: '2025-10-15', amount: 120000, category: 'propertyTax', propertyId: 'P1' },
      { id: 'e2', date: '2025-05-01', amount: 30000, category: 'works', propertyId: 'P1' },
      { id: 'e3', date: '2025-06-01', amount: 9000, category: 'teom', propertyId: 'P1' },
      { id: 'e4', date: '2025-03-01', amount: 50000, category: 'loanInterest', propertyId: '' },
    ],
  };
  const r = rentReceived(lease, state.payments, 2025, '2026-01-10');
  // 85 000 paid Jan + 170 000 in Dec allocated to Feb, Mar (catch-up) => all 255 000 received in 2025
  assert.equal(r.rent + r.charges, 255000);
  assert.equal(r.rent, 3 * 80000);
  const s = taxSummary(state, 2025, '2026-01-10');
  assert.equal(s.gross, 240000);
  assert.equal(s.lines['227'], 120000);
  assert.equal(s.lines['224'], 30000);
  assert.equal(s.lines['222'], 2000); // only P1 was rented
  assert.equal(s.lines['250'], 50000);
  assert.equal(s.result, 240000 - 152000 - 50000);
  assert.equal(s.notDeductible, 9000);
  assert.ok(s.microEligible);
  const csv = yearCsv(state, 2025);
  assert.ok(csv.includes('Encaissement'));
  assert.equal(csv.split('\r\n').length, 1 + 2 + 4);
});

test('deadlines and calendar file', () => {
  const state = {
    properties: [{ id: 'P1', name: 'Gambetta', diagnostics: [{ id: 'd1', type: 'gas', date: '2021-01-10', expiry: '2027-01-10' }] },
    ],
    leases: [{ ...lease, startDate: '2024-09-01', insuranceUntil: '2026-10-01', irl: { quarter: 2, key: '2025-Q2', value: 146.68 }, lastRevision: '2025-09-01' }],
    payments: [], expenses: [], irl: {},
    reminders: [{ id: 'r1', title: 'Taxe foncière', date: '2026-10-15', repeat: 'yearly' }],
  };
  const items = deadlines(state, '2026-11-05');
  const kinds = items.map((i) => i.kind);
  assert.ok(kinds.includes('revision'));
  assert.ok(kinds.includes('diagnostic'));
  assert.ok(kinds.includes('regularization'));
  const ins = items.find((i) => i.kind === 'insurance');
  assert.ok(ins.overdue);
  assert.ok(items.find((i) => i.kind === 'custom').overdue);
  const ics = buildIcs([{ uid: 'x1', date: '2027-01-10', title: 'Diagnostic gaz, Gambetta', description: 'a;b' }], '20261105T120000Z');
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20270110'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20270111'));
  assert.ok(ics.includes('SUMMARY:Diagnostic gaz\\, Gambetta'));
  assert.ok(ics.includes('DESCRIPTION:a\\;b'));
});

test('calendar lines are folded to 75 bytes', () => {
  const ics = buildIcs([{ uid: 'x'.repeat(120), date: '2027-01-10', title: 'Révision du loyer à faire – Jean Martin, Appartement Gambetta, deuxième étage', description: '' }], '20261105T120000Z');
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:Révision du loyer à faire – Jean Martin\\, Appartement Gambetta\\, deuxième étage'));
});
