// Fixes from the third code review (version 1.3.13), through the real screens:
// 1. a charges reconciliation and a rent revision recorded one after the other
//    (in different months, then in the same month) both stay in force, and
//    undoing the reconciliation gives the old charges back without losing the revision;
// 2. a lease paid in advance every 3 months and not paid owes the whole
//    quarter at once, on its page and in the reminder letter.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = require('path').join(require('os').tmpdir(), 'gl-e2e-review3');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const fail = (m) => { throw new Error(m); };
const errors = [];

const today = new Date();
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const lastYear = today.getFullYear() - 1;
const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
const q = ym(qStart);
const prevQ = ym(new Date(qStart.getFullYear(), qStart.getMonth() - 3, 1));

const backup = () => ({
  app: 'gestion-locative', version: 3, settings: { lang: 'en', landlord: { name: 'Owner', city: 'Lyon' } },
  properties: [{ id: 'P1', name: 'Flat', address: '1 rue X', postalCode: '69001', city: 'Lyon', dpe: 'C' }],
  leases: [
    // Monthly, 800 + 50, revision due (index of the 3rd quarter, last used: 2025).
    { id: 'L1', propertyId: 'P1', tenants: [{ name: 'Monthly Tenant' }], startDate: '2024-01-01', trackFrom: ym(today), paymentDay: 1, chargesType: 'provision',
      irl: { quarter: 3, key: '2025-Q3', value: 145.77 }, insuranceUntil: `${today.getFullYear() + 1}-06-01`,
      rents: [{ from: '2024-01', rent: 80000, charges: 5000, reason: 'initial' }], adjustments: [] },
    // Paid at the start of each calendar quarter; the previous quarter is paid, this one is not.
    { id: 'L2', propertyId: 'P1', tenants: [{ name: 'Quarterly Tenant' }], startDate: `${prevQ}-01`, trackFrom: prevQ, paymentDay: 1, chargesType: 'provision',
      frequency: 3, payTiming: 'advance', periodAnchor: q, insuranceUntil: `${today.getFullYear() + 1}-06-01`,
      rents: [{ from: prevQ, rent: 80000, charges: 5000, reason: 'initial' }], adjustments: [] },
  ],
  payments: [{ id: 'q1', leaseId: 'L2', date: `${prevQ}-01`, amount: 255000, method: 'transfer' }],
  // 900 € of recoverable charges last year against 600 € of advances: 75 € a month suggested.
  expenses: [{ id: 'E1', propertyId: 'P1', date: `${lastYear}-06-01`, amount: 90000, category: 'recoverable', description: 'Charges' }],
  reminders: [], documents: [], sent: {}, files: {},
});

const readState = (page) => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('gestion-locative');
  r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('state'); g.onsuccess = () => res(g.result); };
}));
const rentsOf = async (page) => (await readState(page)).leases.find((l) => l.id === 'L1').rents
  .slice().sort((a, b) => (a.from < b.from ? -1 : 1));
const show = (rents) => rents.map((r) => `${r.from}: ${r.rent / 100} + ${r.charges / 100} (${r.reason})`).join(' | ');

async function fresh(browser) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'en-GB' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('.welcome');
  fs.writeFileSync(`${OUT}/backup.json`, JSON.stringify(backup()));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action=restore]')]);
  await chooser.setFiles(`${OUT}/backup.json`);
  await page.waitForTimeout(800);
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(300); };
  return { ctx, page, nav };
}

async function reconcile(page, nav, from) {
  await nav(`#/regularize/L1?year=${lastYear}`);
  if (from) { await page.fill('[name=newFrom]', from); await page.dispatchEvent('[name=newFrom]', 'change'); await page.waitForTimeout(200); }
  const month = await page.inputValue('[name=newFrom]');
  await page.click('form[data-form=regApply] button[type=submit]');
  await page.waitForTimeout(400);
  return month;
}

async function revise(page) {
  await page.click('[data-action=indexation]');
  await page.waitForTimeout(300);
  const month = await page.inputValue('#sheet [name=applyFrom]');
  await page.click('#sheet form[data-form=indexation] button[type=submit]');
  await page.waitForTimeout(400);
  return month;
}

(async () => {
  const browser = await chromium.launch();

  // 1a. Reconciliation first (new charges from its suggested month), then the revision (its suggested month, earlier).
  {
    const { ctx, page, nav } = await fresh(browser);
    const chargesFrom = await reconcile(page, nav);
    const rentFrom = await revise(page);
    const rents = await rentsOf(page);
    log(`charges from ${chargesFrom}, revision from ${rentFrom}:`, show(rents));
    const last = rents[rents.length - 1];
    const revised = rents.find((r) => r.reason === 'indexation');
    if (!(chargesFrom > rentFrom)) fail('expected the new charges to start after the revision');
    if (!revised || revised.rent <= 80000) fail('no revised rent recorded');
    if (last.from !== chargesFrom || last.rent !== revised.rent || last.charges !== 7500) fail('the revised rent or the new charges are lost in the last entry');
    // "Change rent" opens on next month's amounts and follows the chosen month.
    await page.click('[data-action=changeRent]');
    await page.fill('#sheet [name=from]', chargesFrom);
    await page.dispatchEvent('#sheet [name=from]', 'change');
    const shown = `${await page.inputValue('#sheet [name=rent]')} + ${await page.inputValue('#sheet [name=charges]')}`;
    log(`"Change rent" for ${chargesFrom} shows:`, shown);
    if (shown !== `${(revised.rent / 100).toFixed(2).replace('.', ',')} + 75,00`) fail('"Change rent" does not show the amounts of the chosen month');
    await ctx.close();
  }

  // 1b. Both from the same month, then the reconciliation undone.
  {
    const { ctx, page, nav } = await fresh(browser);
    await nav('#/lease/L1');
    await page.click('[data-action=indexation]');
    await page.waitForTimeout(300);
    const month = await page.inputValue('#sheet [name=applyFrom]');
    await page.click('#sheet .sheet-head [data-action=closeSheet]');
    await reconcile(page, nav, month);
    await revise(page);
    let rents = await rentsOf(page);
    log(`both from ${month}:`, show(rents));
    let last = rents[rents.length - 1];
    if (rents.length !== 2 || last.rent <= 80000 || last.charges !== 7500) fail('revision and new charges in the same month: one of them is lost');
    const revisedRent = last.rent;
    await nav(`#/regularize/L1?year=${lastYear}`);
    await page.click('[data-action=regUndo]');
    await page.waitForTimeout(400);
    rents = await rentsOf(page);
    last = rents[rents.length - 1];
    log('after undoing the reconciliation:', show(rents));
    if (last.rent !== revisedRent || last.charges !== 5000) fail('undoing the reconciliation should give back 50 € of charges and keep the revised rent');
    await ctx.close();
  }

  // 2. The unpaid quarter is owed in full, and the reminder asks for it.
  {
    const { ctx, page, nav } = await fresh(browser);
    await nav('#/lease/L2');
    const balance = (await page.textContent('.card .balance')).replace(/\s+/g, ' ').trim();
    log('quarterly lease, quarter not paid:', balance);
    if (!balance.includes('2 550,00')) fail('the whole quarter should be owed');
    const late = today.getDate() > 1 || today.getMonth() % 3 !== 0; // not late on the payment day itself
    if (late) {
      if (!/Overdue/.test(balance)) fail('the quarter should be overdue');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.actions [data-action=reminder]')]);
      const pdfPath = `${OUT}/${dl.suggestedFilename()}`;
      await dl.saveAs(pdfPath);
      const pdf = fs.readFileSync(pdfPath, 'latin1');
      const months = (pdf.match(/850,00/g) || []).length;
      log('reminder file:', dl.suggestedFilename(), '| total 2 550,00:', pdf.includes('2 550,00'), '| amounts of 850,00:', months);
      if (!pdf.includes('2 550,00') || months < 6) fail('the reminder should list the three months of the quarter');
    }
    await page.screenshot({ path: `${OUT}/quarter.png`, fullPage: true });
    await ctx.close();
  }

  log('ERRORS:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
