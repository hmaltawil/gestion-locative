// Version 1.3.14: on the screens that are redrawn while they are filled in
// (charges reconciliation, departure), a tap made right after typing is not
// lost: the button acts on the first tap, with what was just typed, and a tap
// on the next field leaves that field ready to type in. Real presses are used
// (mouse, then finger), not page.click's helpers or dispatched events.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = require('path').join(require('os').tmpdir(), 'gl-e2e-taps');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const fail = (m) => { throw new Error(m); };
const errors = [];
const today = new Date();
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const lastYear = today.getFullYear() - 1;

const backup = {
  app: 'gestion-locative', version: 3, settings: { lang: 'en', landlord: { name: 'Owner', city: 'Lyon' } },
  properties: [{ id: 'P1', name: 'Flat', address: '1 rue X', postalCode: '69001', city: 'Lyon', dpe: 'C' }],
  leases: [{ id: 'L1', propertyId: 'P1', tenants: [{ name: 'Test Tenant' }], startDate: '2024-01-01', trackFrom: ym(today), paymentDay: 1, chargesType: 'provision', deposit: 80000,
    insuranceUntil: `${today.getFullYear() + 1}-06-01`, rents: [{ from: '2024-01', rent: 80000, charges: 5000, reason: 'initial' }], adjustments: [] }],
  payments: [], expenses: [{ id: 'E1', propertyId: 'P1', date: `${lastYear}-06-01`, amount: 90000, category: 'recoverable', description: 'Charges' }],
  reminders: [], documents: [], sent: {}, files: {},
};

const readLease = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('gestion-locative');
  r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('state'); g.onsuccess = () => res(g.result.leases[0]); };
}));

async function run(browser, how) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'en-GB', hasTouch: how === 'finger' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('.welcome');
  fs.writeFileSync(`${OUT}/backup.json`, JSON.stringify(backup));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action=restore]')]);
  await chooser.setFiles(`${OUT}/backup.json`);
  await page.waitForTimeout(800);
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(300); };
  // One real press in the middle of an element, as a person does it.
  const press = async (selector) => {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    const b = await el.boundingBox();
    if (how === 'finger') await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
    else { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(120); await page.mouse.up(); }
    await page.waitForTimeout(250);
  };
  const focused = () => page.evaluate(() => { const a = document.activeElement; return a && a.dataset ? `${a.dataset.change || ''}:${a.dataset.f || ''}` : ''; });

  // Charges reconciliation: label, then the amount, then "Apply", one press each.
  await nav(`#/regularize/L1?year=${lastYear}`);
  await press('.line-edit input[data-f=label]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Water');
  await press('.line-edit input[data-f=amount]');
  const inAmount = await focused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('1200');
  await press('form[data-form=regApply] button[type=submit]');
  const reg = ((await readLease(page)).regularizations || {})[lastYear];
  log(`${how}, reconciliation: field in use after tapping the amount:`, inAmount, '| applied on the first press:', !!reg, '| charges taken:', reg && reg.actual / 100);
  if (inAmount !== 'regLine:amount') fail(`${how}: the amount field was not ready to type in`);
  if (!reg || reg.actual !== 120000) fail(`${how}: "Apply" was lost or ignored the amount just typed`);

  // Departure: a deduction typed, then "End the lease" on the first press.
  await nav('#/departure/L1');
  await press('[data-action=depDedAdd]');
  await press('.line-edit input[data-change=depDed][data-f=label]');
  await page.keyboard.type('Paint');
  await press('.line-edit input[data-change=depDed][data-f=amount]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('120');
  await press('[data-action=depSave]');
  let dep = (await readLease(page)).departure;
  log(`${how}, departure: saved on the first press:`, !!dep, '| deduction:', dep && JSON.stringify(dep.deductions));
  if (!dep || !dep.deductions[0] || dep.deductions[0].label !== 'Paint' || dep.deductions[0].amount !== 12000) fail(`${how}: the departure was not saved with the deduction just typed`);
  // Once saved, each field is saved as it changes: still no lost press.
  await press('.line-edit input[data-change=depDed][data-f=amount]');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('150');
  await press('[data-action=depDedAdd]');
  dep = (await readLease(page)).departure;
  const lines = await page.locator('.line-edit input[data-change=depDed][data-f=label]').count();
  log(`${how}, departure saved: new amount kept:`, dep.deductions[0].amount / 100, '| second line added on the first press:', lines === 2);
  if (dep.deductions[0].amount !== 15000 || lines !== 2) fail(`${how}: a press after typing was lost on the saved departure`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await run(browser, 'mouse');
  await run(browser, 'finger');
  log('ERRORS:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
