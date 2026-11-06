const { chromium, devices } = require('playwright');
const OUT = require('path').join(require('os').tmpdir(), 'gl-e2e-core');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, acceptDownloads: true, locale: 'en-GB' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('dialog', (d) => d.accept());
  const shot = (n) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
  const base = 'http://localhost:8080/';
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(150); };
  await page.goto(base);
  await page.waitForSelector('.welcome');
  await shot('01-welcome');

  // landlord
  await nav('#/settings');
  await page.fill('form[data-form=landlord] [name=name]', 'Marie Dupont');
  await page.fill('form[data-form=landlord] [name=address]', '12 rue des Lilas');
  await page.fill('form[data-form=landlord] [name=postalCode]', '69003');
  await page.fill('form[data-form=landlord] [name=city]', 'Lyon');
  await page.click('form[data-form=landlord] button[type=submit]');
  // signature: no pad on the page itself (scrolling past it used to leave marks)
  console.log('signature pad on the settings page:', await page.locator('#app #sigpad').count());
  await page.click('[data-action=sigOpen]');
  await page.waitForSelector('#sheet #sigpad');
  await page.waitForTimeout(300);
  const c = await page.$('#sheet #sigpad'); const b = await c.boundingBox();
  await page.mouse.move(b.x + 20, b.y + 50); await page.mouse.down();
  for (let i = 0; i < 20; i++) await page.mouse.move(b.x + 20 + i * 12, b.y + 50 + Math.sin(i) * 20);
  await page.mouse.up();
  await page.click('#sheet [data-action=sigSave]');
  await page.waitForSelector('#app .sig-preview');
  console.log('signature saved, sheet closed:', (await page.locator('#sheet').count()) === 0);
  await shot('02-settings');

  // property
  await nav('#/property-edit/new');
  await page.fill('[name=name]', 'Appartement Gambetta');
  await page.fill('[name=address]', '5 cours Gambetta');
  await page.fill('[name=postalCode]', '69007');
  await page.fill('[name=city]', 'Lyon');
  await page.selectOption('[name=dpe]', 'D');
  await page.click('button[type=submit]');
  await page.waitForURL(/#\/property\//);
  await page.click('text=New lease');
  await page.waitForSelector('form[data-form=lease]');
  await page.fill('[name=tenant_name]', 'Jean Martin');
  await page.fill('[name=tenant_email]', 'jean@example.com');
  await page.fill('[name=startDate]', '2023-09-01');
  await page.fill('[name=rent]', '750');
  await page.fill('[name=charges]', '60');
  await page.fill('[name=paymentDay]', '5');
  await page.selectOption('[name=irlQuarter]', '2');
  await page.selectOption('[name=irlYear]', '2025');
  await page.fill('[name=lastRevision]', '2025-09-01');
  await page.fill('[name=trackFrom]', '2026-09');
  await page.fill('[name=openingBalance]', '0');
  await shot('03-lease-form');
  await page.click('form[data-form=lease] button[type=submit]');
  await page.waitForURL(/#\/lease\//);
  // payment for september + october
  await page.click('.card [data-action=pay]');
  await page.fill('#sheet [name=amount]', '1620');
  await page.fill('#sheet [name=date]', '2026-10-04');
  await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/04-payment-sheet.png' });
  await page.click('#sheet button[type=submit]');
  await shot('05-lease');

  // second property + lease late
  await nav('#/property-edit/new');
  await page.fill('[name=name]', 'Studio Croix-Rousse');
  await page.fill('[name=address]', '18 rue d\'Austerlitz');
  await page.fill('[name=postalCode]', '69004');
  await page.fill('[name=city]', 'Lyon');
  await page.selectOption('[name=dpe]', 'F');
  await page.click('button[type=submit]');
  await page.waitForURL(/#\/property\//);
  await page.click('text=New lease');
  await page.fill('[name=tenant_name]', 'Sophie Bernard');
  await page.click('[data-action=addTenantRow]');
  await page.locator('[name=tenant_name]').nth(1).fill('Luc Petit');
  await page.fill('[name=startDate]', '2026-08-16');
  await page.fill('[name=rent]', '502,50'); // typing mistake, corrected below
  await page.fill('[name=charges]', '40');
  await page.click('form[data-form=lease] button[type=submit]');
  await page.waitForURL(/#\/lease\//);
  // correct the rent from the lease's edit form (the confirmation is accepted)
  await page.click('.topbar a.link');
  await page.waitForSelector('form[data-form=lease] [name=rent]');
  console.log('edit form shows the rent:', await page.inputValue('form[data-form=lease] [name=rent]'));
  await page.fill('form[data-form=lease] [name=rent]', '520,50');
  await page.click('form[data-form=lease] button[type=submit]');
  await page.waitForURL(/#\/lease\//);
  await page.waitForTimeout(200);
  const corrected = await page.textContent('.subtitle');
  console.log('after correcting:', corrected.replace(/\s+/g, ' ').trim());
  if (!corrected.includes('520,50')) throw new Error('rent not corrected: ' + corrected);
  console.log('rent history entries:', await page.locator('.list.compact li').count());

  await nav('#/');
  await page.waitForSelector('.tiles');
  await shot('06-home');

  // PDFs from first lease
  await nav('#/leases');
  await page.click('text=Jean Martin');
  const dl = async (fn, name) => {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), fn()]);
    await d.saveAs(`${OUT}/${name}`);
  };
  await dl(() => page.click('[data-action=receipt][data-period="2026-09"]'), 'quittance.pdf');
  await page.click('[data-action=indexation]');
  await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/07-indexation.png' });
  await dl(() => page.click('[data-action=indexationLetter]'), 'revision.pdf');
  await page.click('#sheet button[type=submit]');
  await shot('08-lease-after-revision');
  await page.click('[data-action=rentCall]');
  await dl(() => page.click('#sheet button[type=submit]'), 'avis.pdf');
  await page.click('#sheet [data-action=closeSheet] >> nth=1');

  // late lease docs
  await nav('#/leases');
  await page.click('text=Sophie Bernard');
  await shot('09-late-lease');
  await dl(() => page.click('[data-action=reminder]'), 'relance.pdf');
  await dl(() => page.click('[data-action=notice]'), 'mise-en-demeure.pdf');
  // partial payment then partial receipt
  // the CAF pays 200 € of the housing benefit straight to the landlord
  await page.click('.card [data-action=pay]');
  await page.fill('#sheet [name=amount]', '200');
  await page.selectOption('#sheet [name=method]', 'caf');
  await page.click('#sheet button[type=submit]');
  await dl(() => page.click('[data-action=receipt][data-period="2026-08"]'), 'recu-partiel.pdf');
  {
    const text = require('child_process').execFileSync('pdftotext', [OUT + '/recu-partiel.pdf', '-']).toString().replace(/\s+/g, ' ');
    const said = /reçu de la CAF \(aide au logement versée directement au bailleur\), pour le compte de Sophie Bernard et Luc Petit/.test(text) && /versé par la CAF/.test(text);
    console.log('partial receipt says the CAF paid:', said);
    if (!said) throw new Error('receipt does not say who paid: ' + text.slice(0, 400));
  }

  // expenses
  await nav('#/expense-new');
  await page.fill('input[name=description]', 'Taxe foncière 2026');
  await page.fill('[name=amount]', '1 230,00');
  await page.selectOption('[name=category]', 'propertyTax');
  await page.click('button[type=submit]');
  await page.waitForURL(/#\/expenses/);
  await shot('10-expenses');

  // backup
  await nav('#/settings');
  // one tap when the file is ready, otherwise the two-step panel
  await page.waitForTimeout(1500);
  {
    const dlp = page.waitForEvent('download', { timeout: 10000 });
    await page.click('.card [data-action=backup]');
    const sheet = await page.waitForSelector('[data-action=backupSave]', { timeout: 1500 }).catch(() => null);
    if (sheet) await page.click('[data-action=backupSave]');
    await (await dlp).saveAs((typeof OUT !== 'undefined' ? OUT : __dirname) + '/backup.json');
  }

  // a lease with nothing late, and no end date: "Reminder" explains why instead of doing nothing
  await nav('#/lease-new');
  await page.fill('[name=tenant_name]', 'Paul Durand');
  const next = new Date(); next.setMonth(next.getMonth() + 1, 1);
  await page.fill('[name=startDate]', next.toISOString().slice(0, 10));
  await page.fill('[name=rent]', '600');
  await page.click('form[data-form=lease] button[type=submit]');
  await page.waitForURL(/#\/lease\//);
  await page.click('[data-action=reminder]');
  await page.waitForSelector('#sheet');
  console.log('reminder with nothing late:', (await page.textContent('#sheet .sheet-body p')).trim().slice(0, 90));
  if (!(await page.locator('#sheet [data-action=rentCall]').count())) throw new Error('no rent call offered');
  await page.click('#sheet .sheet-head [data-action=closeSheet]');
  await page.click('.topbar a.link');
  await page.waitForSelector('form[data-form=lease] [name=openingBalance]');
  console.log('edit form shows the start of tracking:', await page.inputValue('form[data-form=lease] [name=trackFrom]'));

  // French UI
  await nav('#/settings');
  await page.click('[data-action=lang][data-lang=fr]');
  await nav('#/');
  await page.waitForSelector('.tiles');
  await shot('11-home-fr');

  // reload persists
  await page.reload();
  await page.waitForSelector('.tiles');
  const count = await page.locator('.list .row').count();
  console.log('rows after reload', count);
  // dark mode
  await page.emulateMedia({ colorScheme: 'dark' });
  await nav('#/leases'); await page.click('text=Jean Martin');
  await shot('12-lease-dark');
  console.log('ERRORS:', JSON.stringify(errors, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
