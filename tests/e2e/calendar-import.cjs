const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'en-GB' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(200); };
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('.welcome');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForSelector('.welcome');
  console.log('controlled:', await page.evaluate(() => !!navigator.serviceWorker.controller));
  // a property + lease so there are deadlines
  await nav('#/property-edit/new'); await page.fill('[name=name]', 'Flat'); await page.click('button[type=submit]'); await page.waitForURL(/#\/property\//);
  await page.click('text=New lease'); await page.fill('[name=tenant_name]', 'Jean Martin'); await page.fill('[name=startDate]', '2024-09-01');
  await page.fill('[name=rent]', '750'); await page.fill('[name=insuranceUntil]', '2027-01-15');
  await page.click('form[data-form=lease] button[type=submit]'); await page.waitForURL(/#\/lease\//);
  // calendar
  await nav('#/deadlines');
  await page.click('[data-action=exportIcs]');
  await page.waitForSelector('#sheet a.btn');
  const href = await page.getAttribute('#sheet a.btn', 'href');
  const res = await page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, type: r.headers.get('content-type'), start: (await r.text()).slice(0, 40) }; }, href);
  console.log('calendar link', href.split('?')[0], JSON.stringify(res));
  await page.screenshot({ path: require('os').tmpdir() + '/calendar-sheet.png' });
  // revolut import with no rent
  await nav('#/import');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-action=importPick]')]);
  await fc.setFiles(__dirname + '/revolut.csv');
  await page.waitForSelector('.imp-list');
  console.log('no-match note:', (await page.textContent('.content .note')).slice(0, 60));
  console.log('rows:', await page.locator('.imp-row').count(), 'import button:', await page.locator('[data-action=importApply]').count());
  await page.screenshot({ path: require('os').tmpdir() + '/import-nomatch.png' });
  console.log('ERRORS:', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n')[0]); process.exit(1); });
