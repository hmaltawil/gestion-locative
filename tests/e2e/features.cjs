const { chromium } = require('playwright');
const OUT = require('path').join(require('os').tmpdir(), 'gl-e2e-features');
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, acceptDownloads: true, locale: 'en-GB' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
  page.on('dialog', (d) => d.type() === 'prompt' ? d.accept('DELETE') : d.accept());
  const shot = (n, full = true) => page.waitForTimeout(350).then(() => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full }));
  const base = 'http://localhost:8080/';
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(200); };
  const dl = async (fn, name) => {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), fn()]);
    await d.saveAs(`${OUT}/${name}`);
    return name;
  };
  const chooser = async (fn, files) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), fn()]);
    await fc.setFiles(files);
  };
  const step = (s) => console.log('STEP', s);

  await page.goto(base);
  await page.waitForSelector('.welcome');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(800);
  step('setup');
  await nav('#/settings');
  await page.fill('form[data-form=landlord] [name=name]', 'Marie Dupont');
  await page.fill('form[data-form=landlord] [name=address]', '12 rue des Lilas');
  await page.fill('form[data-form=landlord] [name=postalCode]', '69003');
  await page.fill('form[data-form=landlord] [name=city]', 'Lyon');
  await page.click('form[data-form=landlord] button[type=submit]');
  for (const [name, addr, pc, dpe] of [['Appartement Gambetta', '5 cours Gambetta', '69007', 'D'], ['Studio Croix-Rousse', "18 rue d'Austerlitz", '69004', 'E']]) {
    await nav('#/property-edit/new');
    await page.fill('[name=name]', name); await page.fill('[name=address]', addr);
    await page.fill('[name=postalCode]', pc); await page.fill('[name=city]', 'Lyon'); await page.selectOption('[name=dpe]', dpe);
    await page.click('button[type=submit]'); await page.waitForURL(/#\/property\//);
  }
  const addLease = async (propIndex, o) => {
    await nav('#/lease-new');
    await page.selectOption('[name=propertyId]', { index: propIndex });
    await page.fill('[name=tenant_name]', o.name);
    if (o.email) await page.fill('[name=tenant_email]', o.email);
    await page.fill('[name=startDate]', o.start);
    await page.fill('[name=rent]', o.rent); await page.fill('[name=charges]', o.charges);
    await page.fill('[name=paymentDay]', '5');
    if (o.deposit) await page.fill('[name=deposit]', o.deposit);
    if (o.track) await page.fill('[name=trackFrom]', o.track);
    if (o.ins) await page.fill('[name=insuranceUntil]', o.ins);
    await page.click('form[data-form=lease] button[type=submit]'); await page.waitForURL(/#\/lease\//);
  };
  await addLease(0, { name: 'Jean Martin', email: 'jean@example.com', start: '2023-09-01', rent: '750', charges: '60', deposit: '750', track: '2025-01', ins: '2026-10-01' });
  await addLease(1, { name: 'Sophie Bernard', email: 'sophie@example.com', start: '2026-08-16', rent: '520,50', charges: '40', deposit: '520,50' });
  // Jean pays Jan 2025 .. Oct 2026 in one go (22 x 810)
  await nav('#/leases'); await page.click('text=Jean Martin');
  await page.click('.card [data-action=pay]');
  await page.fill('#sheet [name=amount]', String(22 * 810));
  await page.fill('#sheet [name=date]', '2026-10-04');
  await page.click('#sheet button[type=submit]');

  step('home');
  await nav('#/');
  await shot('01-home');

  step('bank import');
  await nav('#/import');
  await chooser(() => page.click('[data-action=importPick]'), __dirname + '/bank.csv');
  await page.waitForSelector('.imp-list');
  await shot('02-import');
  const checked = await page.$$eval('.imp-list input[type=checkbox]', (els) => els.map((e) => e.checked));
  console.log('import ticks', JSON.stringify(checked));
  await page.click('[data-action=importApply]');
  await page.waitForTimeout(300);
  // second import of same file: all duplicates
  await nav('#/import');
  await chooser(() => page.click('[data-action=importPick]'), __dirname + '/bank.csv');
  await page.waitForSelector('.imp-list');
  console.log('dups', await page.locator('.imp-row.dup').count());
  await page.click('[data-action=importReset]');

  step('batch');
  await nav('#/batch?type=receipt&period=2026-11');
  await shot('03-batch');
  await dl(() => page.click('[data-action=batchSend] >> nth=0'), 'batch-one.pdf');
  await dl(() => page.click('[data-action=batchAll]'), 'batch-all.pdf');
  await page.waitForTimeout(300);
  await shot('03b-batch-sent');
  await nav('#/batch?type=rentCall&period=2026-12');
  await dl(() => page.click('[data-action=batchAll]'), 'batch-calls.pdf');

  step('expenses + regularization');
  for (const [desc, amount, cat, date] of [['Eau 2025', '500', 'recoverable', '2025-12-10'], ['TEOM 2025', '180', 'teom', '2025-10-15'], ['Taxe foncière 2026', '1100', 'propertyTax', '2026-10-15'], ['Plombier', '240', 'works', '2026-03-02']]) {
    await nav('#/expense-new');
    await page.fill('input[name=description]', desc); await page.fill('[name=amount]', amount);
    await page.fill('[name=date]', date);
    await page.selectOption('[name=category]', cat); await page.selectOption('form [name=propertyId]', { index: 1 });
    await page.click('button[type=submit]'); await page.waitForURL(/#\/expenses/);
  }
  await nav('#/leases'); await page.click('text=Jean Martin');
  await page.click('a.action[href^="#/regularize"]');
  await page.waitForSelector('form[data-form=regApply]');
  await shot('04-regularize');
  await dl(() => page.click('[data-action=regLetter]'), 'regularisation.pdf');
  await page.click('form[data-form=regApply] button[type=submit]');
  await page.waitForURL(/#\/lease\//);
  await shot('05-lease-after-reg');

  step('letters');
  await page.click('[data-action=letters]');
  await dl(() => page.click('form[data-form=letterCert] button[type=submit]'), 'attestation.pdf');
  await dl(() => page.click('form[data-form=letterDeposit] button[type=submit]'), 'recu-depot.pdf');
  await page.fill('form[data-form=letterGuarantor] [name=name]', 'Paul Martin');
  await page.fill('form[data-form=letterGuarantor] [name=address]', '3 place Bellecour, 69002 Lyon');
  await dl(() => page.click('form[data-form=letterGuarantor] button[type=submit]'), 'caution.pdf');
  await page.click('#sheet .sheet-head [data-action=closeSheet]');

  step('departure');
  await nav('#/leases'); await page.click('text=Sophie Bernard');
  await page.click('a.action[href^="#/departure"]');
  await page.fill('[data-f=keysDate]', '2026-11-04');
  await page.dispatchEvent('[data-f=keysDate]', 'change');
  await page.click('[data-action=depDedAdd]');
  await page.fill('[data-change=depDed][data-f=label]', 'Trou dans le mur');
  await page.dispatchEvent('[data-change=depDed][data-f=label]', 'change');
  await page.fill('[data-change=depDed][data-f=amount]', '80');
  await page.dispatchEvent('[data-change=depDed][data-f=amount]', 'change');
  await page.click('[data-action=depSave]');
  await shot('06-departure');
  await dl(() => page.click('[data-action=depPdf]'), 'depart.pdf');
  await page.click('[data-action=depReturned]');
  await page.click('#sheet button[type=submit]');
  await page.waitForTimeout(300);
  await shot('07-departure-done');
  console.log('after return:', (await page.textContent('.balance')).replace(/\s+/g, ' ').trim(), '| inputs disabled:', await page.$eval('fieldset', (f) => f.disabled));

  step('property: diagnostics + documents');
  await nav('#/properties'); await page.click('text=Appartement Gambetta');
  await page.click('[data-action=diagAdd]');
  await page.selectOption('#sheet [name=type]', 'gas');
  await page.fill('#sheet [name=date]', '2021-01-10');
  await page.dispatchEvent('#sheet [name=date]', 'change');
  console.log('gas expiry', await page.inputValue('#sheet [name=expiry]'));
  await page.click('#sheet button[type=submit]');
  await page.click('[data-action=docAdd]');
  await page.setInputFiles('#sheet input[type=file]', __dirname + '/photo.png');
  await page.click('#sheet button[type=submit]');
  await page.waitForSelector('[data-action=docOpen]');
  await page.click('[data-action=docOpen]');
  await page.waitForSelector('.doc-preview');
  await shot('08-doc-preview', false);
  await page.click('#sheet .sheet-head [data-action=closeSheet]');
  await shot('09-property');

  step('tax');
  await nav('#/tax?year=2026');
  await shot('10-tax');
  await dl(() => page.click('[data-action=taxPdf]'), 'impots.pdf');
  await dl(() => page.click('[data-action=taxCsv]'), 'comptes.csv');

  step('deadlines');
  await nav('#/deadlines');
  await page.click('[data-action=addReminder]');
  await page.click('#sheet [data-action=fillReminder] >> nth=0');
  await page.click('#sheet button[type=submit]');
  await shot('11-deadlines');
  await page.click('[data-action=exportIcs]');
  await page.waitForSelector('#sheet [data-action=icsShare]');
  await dl(() => page.click('#sheet [data-action=icsShare]'), 'echeances.ics');
  await page.click('#sheet .sheet-head [data-action=closeSheet]');

  step('backup / wipe / restore');
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
  await page.click('[data-action=wipe]');
  await page.waitForSelector('.welcome');
  await chooser(() => page.click('.welcome ~ .card [data-action=restore]'), OUT + '/backup.json');
  await page.waitForSelector('.tiles');
  await nav('#/properties'); await page.click('text=Appartement Gambetta');
  await page.click('[data-action=docOpen]');
  await page.waitForSelector('.doc-preview');
  console.log('doc after restore ok');

  step('french');
  await page.click('#sheet .sheet-head [data-action=closeSheet]');
  await nav('#/settings');
  await page.click('[data-action=lang][data-lang=fr]');
  await nav('#/'); await shot('12-home-fr');
  await nav('#/deadlines'); await shot('13-deadlines-fr');
  console.log('ERRORS:', JSON.stringify(errors, null, 1));
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n').slice(0, 6).join('\n')); process.exit(1); });
