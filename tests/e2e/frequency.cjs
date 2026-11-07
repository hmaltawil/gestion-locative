// Payment frequency (version 1.3.11): an existing lease switched to quarterly
// payments in its edit form, one payment for the quarter, then the receipt,
// the receipt list, the rent call and the monthly send cover the whole quarter.
// A second lease paid at the end of each quarter is not late before its date.
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = require('path').join(require('os').tmpdir(), 'gl-e2e-frequency');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'en-GB' });
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); };
  const log = (...a) => console.log(...a);
  const fail = (m) => { throw new Error(m); };

  // Today's quarter, so the test works whatever the date.
  const today = new Date();
  const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const qStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  const q = ym(qStart);
  const prevQ = ym(new Date(qStart.getFullYear(), qStart.getMonth() - 3, 1));
  const nextQ = ym(new Date(qStart.getFullYear(), qStart.getMonth() + 3, 1));
  const lastDay = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
  const dd = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  await page.goto('http://localhost:8080/');
  await page.waitForSelector('.welcome');
  const lease = (id, name, extra = {}) => ({ id, propertyId: 'P1', tenants: [{ name, email: `${id}@example.com` }], startDate: `${prevQ}-01`, trackFrom: prevQ, paymentDay: 1, chargesType: 'provision', deposit: 80000, rents: [{ from: prevQ, rent: 80000, charges: 5000, reason: 'initial' }], adjustments: [], ...extra });
  const backup = {
    app: 'gestion-locative', version: 3, settings: { lang: 'en', landlord: { name: 'Owner', city: 'Lyon' } },
    properties: [{ id: 'P1', name: 'Flat', address: '1 rue X', postalCode: '69001', city: 'Lyon', dpe: 'C' }],
    leases: [lease('L1', 'Quarterly Tenant'), lease('L2', 'Arrears Tenant', { frequency: 3, payTiming: 'arrears', periodAnchor: q, startDate: `${q}-01`, trackFrom: q, rents: [{ from: q, rent: 80000, charges: 5000 }] })],
    // L1 paid the previous quarter month by month
    payments: [0, 1, 2].map((i) => ({ id: `m${i}`, leaseId: 'L1', date: `${ym(new Date(qStart.getFullYear(), qStart.getMonth() - 3 + i, 1))}-01`, amount: 85000, method: 'transfer' })),
    expenses: [], reminders: [], documents: [], sent: {}, files: {},
  };
  fs.writeFileSync(`${OUT}/backup.json`, JSON.stringify(backup));
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action=restore]')]);
  await chooser.setFiles(`${OUT}/backup.json`);
  await page.waitForTimeout(800);

  // 1. Edit the existing lease: quarterly, in advance, calendar quarters.
  await nav('#/lease-edit/L1');
  log('period field hidden while monthly:', await page.$eval('[data-freq-only]', (e) => e.hidden));
  await page.selectOption('[name=frequency]', '3');
  await page.dispatchEvent('[name=frequency]', 'change');
  log('period field shown when quarterly:', !(await page.$eval('[data-freq-only]', (e) => e.hidden)));
  await page.fill('[name=periodAnchor]', `${today.getFullYear()}-01`);
  await page.click('form[data-form=lease] button[type=submit]');
  await page.waitForTimeout(400);
  const terms = await page.$$eval('dl.facts dd', (d) => d.map((x) => x.textContent).find((x) => /Quarterly/.test(x)));
  log('lease page:', terms);
  if (!terms || !terms.includes('current period')) fail('payment terms missing on the lease page');

  // 2. One payment for the quarter: no "far more than owed" question.
  dialogs.length = 0;
  await page.click('.card [data-action=pay]');
  await page.fill('#sheet [name=amount]', '2550');
  await page.fill('#sheet [name=date]', `${q}-01`);
  await page.click('#sheet button[type=submit]');
  await page.waitForTimeout(300);
  log('questions asked for one quarter:', dialogs.length, dialogs.map((x) => x.slice(0, 40)));
  if (dialogs.some((x) => /much more/.test(x))) fail('a quarter payment was questioned');
  const balance = (await page.textContent('.card .balance')).replace(/\s+/g, ' ').trim();
  log('balance after the quarter payment:', balance);
  if (/Overdue/.test(balance)) fail('the quarter shows as overdue');

  // 3. The receipt covers the whole quarter.
  const receiptButtons = await page.$$eval('[data-action=receipt][data-period]', (b) => b.map((x) => x.dataset.period));
  log('receipt buttons on months:', receiptButtons.join(', '));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(`[data-action=receipt][data-period="${q}"]`)]);
  const pdfPath = `${OUT}/${dl.suggestedFilename()}`;
  await dl.saveAs(pdfPath);
  const pdf = fs.readFileSync(pdfPath, 'latin1');
  const period = `${dd(qStart)} au ${dd(lastDay)}`;
  log('receipt file:', dl.suggestedFilename(), '| period', period, ':', pdf.includes(period), '| "paiement trimestriel":', pdf.includes('paiement trimestriel'), '| "3 mois":', pdf.includes('3 mois'));
  if (!pdf.includes(period) || !pdf.includes('paiement trimestriel') || !pdf.includes('3 mois')) fail('the receipt does not cover the quarter');

  // 4. Receipt list and rent call offer whole quarters.
  await page.click('[data-action=receiptPicker]');
  const picks = await page.$$eval('#sheet .row-main strong', (s) => s.map((x) => x.textContent));
  log('receipt list:', picks.join(' | '));
  await page.click('#sheet .sheet-head [data-action=closeSheet]');
  await page.click('.actions [data-action=rentCall]');
  const calls = await page.$$eval('#sheet select[name=period] option', (o) => o.map((x) => x.textContent));
  log('rent call periods:', calls.join(' | '));
  if (!calls.some((x) => x.includes('–'))) fail('the rent call does not offer quarters');
  const [dl2] = await Promise.all([page.waitForEvent('download'), (async () => { await page.selectOption('#sheet select[name=period]', nextQ); await page.click('#sheet button[type=submit]'); })()]);
  const call = fs.readFileSync(await dl2.path(), 'latin1');
  log('rent call file:', dl2.suggestedFilename(), '| "Loyer trimestriel":', call.includes('Loyer trimestriel'));
  if (!call.includes('Loyer trimestriel')) fail('the rent call does not cover the quarter');

  // 5. Monthly send: the quarter's first month has the receipt, the other months point to it.
  await nav(`#/batch?type=receipt&period=${q}`);
  const first = (await page.textContent('.list.cols')).replace(/\s+/g, ' ');
  log('monthly send, first month:', first.includes('Quarterly Tenant') && /Paid|Send/.test(first));
  const mid = ym(new Date(qStart.getFullYear(), qStart.getMonth() + 1, 1));
  await nav(`#/batch?type=receipt&period=${mid}`);
  const second = (await page.textContent('.list.cols')).replace(/\s+/g, ' ');
  log('monthly send, second month:', /Paid with/.test(second));
  if (!/Paid with/.test(second)) fail('the second month of the quarter should point to the quarter');

  // 6. Paid at the end of the quarter: not late before its date.
  await nav('#/lease/L2');
  const arrearsBalance = (await page.textContent('.card .balance')).replace(/\s+/g, ' ').trim();
  log('lease paid at the end of each quarter:', arrearsBalance);
  if (/Overdue/.test(arrearsBalance)) fail('a lease paid in arrears shows as overdue');

  await page.screenshot({ path: `${OUT}/lease.png`, fullPage: true });
  log('ERRORS:', errors);
  await browser.close();
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
