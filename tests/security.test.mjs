// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { normalize, parseBackup } from '../js/store.js';

test('security rule: the theme script in index.html matches its hash', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)[1];
  const hash = createHash('sha256').update(script, 'utf8').digest('base64');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  assert.ok(csp.includes(`'sha256-${hash}'`), 'update the sha256 in the Content-Security-Policy after changing the theme script');
  assert.ok(!/unsafe-eval|script-src[^;]*unsafe-inline/.test(csp));
  assert.ok(/connect-src 'self' https:\/\/api\.github\.com https:\/\/bdm\.insee\.fr;/.test(csp));
});

test('a crafted backup cannot slip code into the screens', () => {
  const evil = '" onerror="alert(1)';
  const raw = JSON.stringify({
    app: 'gestion-locative',
    settings: { lang: '<b>', signature: 'x' + evil, landlord: { name: 'Marie' }, lastBackup: '2026<' },
    properties: [{ id: 'P1' + evil, name: 'Flat', dpe: '<x>', diagnostics: [{ id: 'd' + evil, date: '2021-01-10', expiry: evil }] }],
    leases: [{ id: 'L1' + evil, propertyId: 'P1' + evil, tenants: [{ name: 'Jean' }], startDate: '2026-01-01' + evil, endDate: evil, trackFrom: evil,
      revisionDate: evil, paymentDay: evil, deposit: evil, rents: [{ from: '2026-01', rent: '60000', charges: 5000 }, { from: evil, rent: 1, charges: 0 }],
      adjustments: [{ id: 'a' + evil, date: evil, amount: '100' }], irl: { quarter: 2, key: evil, value: 140 }, departure: { keysDate: evil } }],
    payments: [{ id: 'x' + evil, leaseId: 'L1' + evil, date: '2026-01-05', amount: 65000 }, { id: 'y', leaseId: 'L1', date: evil, amount: 1 }],
    expenses: [{ id: 'e', propertyId: 'P1' + evil, date: '2026-02-01', amount: 100, category: 'works' }],
    reminders: [{ id: 'r' + evil, title: 'ok', date: evil }],
    documents: [{ id: 'doc' + evil, ownerId: 'L1' + evil, name: 'a.pdf', date: evil }],
    irl: { '2026-Q1': 146.6, [evil]: 1 },
    sent: { 'receipt:L1:2026-01': evil },
  });
  const { state } = parseBackup(raw);
  // the values put on screen as they are: ids, dates, months, the signature, the language
  const raws = [state.settings.signature, state.settings.lang, ...Object.keys(state.irl), ...Object.values(state.sent)];
  for (const p of state.properties) raws.push(p.id, p.dpe, ...p.diagnostics.flatMap((d) => [d.id, d.date, d.expiry]));
  for (const l of state.leases) raws.push(l.id, l.propertyId, l.startDate, l.endDate, l.trackFrom, l.revisionDate, l.irl && l.irl.key,
    ...l.rents.map((r) => r.from), ...l.adjustments.flatMap((a) => [a.id, a.date]), l.departure && l.departure.keysDate);
  for (const x of [...state.payments, ...state.expenses, ...state.reminders, ...state.documents]) raws.push(x.id, x.date, x.leaseId, x.propertyId, x.ownerId);
  for (const v of raws) assert.ok(v === null || v === undefined || !/[<>"'&\s=]/.test(String(v)), String(v));
  // ids and references are cleaned the same way, so the data still fits together
  assert.equal(state.leases[0].id, state.payments[0].leaseId);
  assert.equal(state.leases[0].propertyId, state.properties[0].id);
  assert.equal(state.documents[0].ownerId, state.leases[0].id);
  assert.equal(state.payments.length, 1); // the one with a broken date is dropped
  assert.equal(state.leases[0].rents.length, 1);
  assert.equal(state.leases[0].rents[0].rent, 60000);
  assert.equal(state.leases[0].paymentDay, 1);
  assert.equal(state.settings.signature, null);
  assert.equal(state.settings.lang, 'fr');
});

test('cleaning keeps everything the app itself writes', () => {
  const good = {
    settings: { lang: 'en', signature: 'data:image/png;base64,iVBORw0KGgo=', landlord: { name: 'M' }, lastBackup: '2026-11-01' },
    properties: [{ id: 'a1b2c3d4-0000-4000-8000-000000000001', dpe: 'D', diagnostics: [{ id: 'id-k2x-ab12', type: 'gas', date: '2021-01-10', expiry: '2027-01-10' }] }],
    leases: [{ id: 'id-lx1', propertyId: 'a1b2c3d4-0000-4000-8000-000000000001', tenants: [{ name: 'Jean "Jo" <Martin>' }], startDate: '2024-01-01', endDate: null, trackFrom: '2026-11', revisionDate: '01-15',
      lastRevision: '2026-01-15', insuranceUntil: '2027-01-01', paymentDay: 5, deposit: 60000, openingBalance: -1000,
      rents: [{ from: '2024-01', rent: 60000, charges: 5000, reason: 'initial' }], adjustments: [], irl: { quarter: 3, key: '2025-Q3', value: 145.77 }, regularizations: {} }],
    payments: [{ id: 'p1', leaseId: 'id-lx1', date: '2026-11-02', amount: 65000, method: 'caf' }],
    expenses: [], reminders: [], documents: [], trash: [], irl: { '2026-Q3': 148.06 }, sent: { 'receipt:id-lx1:2026-11': '2026-11-03' }, tax: { 2026: { line230: 3000 } },
  };
  const s = normalize(JSON.parse(JSON.stringify(good)));
  assert.deepEqual(s.leases[0], { ...good.leases[0] });
  assert.deepEqual(s.payments, good.payments);
  assert.equal(s.settings.signature, good.settings.signature);
  assert.deepEqual(s.sent, good.sent);
  assert.deepEqual(s.irl, good.irl);
  assert.deepEqual(s.properties[0].diagnostics, good.properties[0].diagnostics);
});
