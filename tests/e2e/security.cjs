// Safety checks in the real app (version 1.3.8): a crafted backup file, the
// formal notice without a reminder, the F/G rent freeze, the size limit on
// attachments, and the GitHub backup pausing after an erase.
const { chromium } = require('playwright');
const OUT = require('path').join(require('os').tmpdir(), 'gl-e2e-security');
require('fs').mkdirSync(OUT, { recursive: true });

// A small fake GitHub (same rules as backup.cjs).
const repo = { files: new Map(), commits: [], puts: [] };
let n = 0;
async function github(route) {
  const req = route.request();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS' };
  const reply = (status, body, raw) => route.fulfill({ status, headers: { ...cors, 'Content-Type': raw ? 'text/plain' : 'application/json' }, body: raw ? body : JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  const u = new URL(req.url());
  if (u.pathname === '/repos/me/backup') return reply(200, { private: true, default_branch: 'main' });
  if (u.pathname === '/repos/me/backup/commits') {
    const list = repo.commits.filter((c) => c.path === u.searchParams.get('path')).slice().reverse().slice(0, Number(u.searchParams.get('per_page') || 30));
    return reply(200, list.map((c) => ({ sha: c.sha, commit: { committer: { date: c.date }, message: c.message } })));
  }
  const m = /^\/repos\/me\/backup\/contents\/(.+)$/.exec(u.pathname);
  if (!m) return reply(404, {});
  const path = decodeURIComponent(m[1]);
  if (req.method() === 'GET') {
    const f = repo.files.get(path);
    if (!f) return reply(404, {});
    return (req.headers().accept || '').includes('raw') ? reply(200, f.text, true) : reply(200, { sha: f.fileSha });
  }
  const b = JSON.parse(req.postData());
  const cur = repo.files.get(path);
  if (cur && b.sha !== cur.fileSha) return reply(409, {});
  if (!cur && b.sha) return reply(422, {});
  n++;
  const f = { text: Buffer.from(b.content, 'base64').toString('utf8'), fileSha: `f${n}` };
  repo.files.set(path, f);
  repo.commits.push({ sha: `c${n}`, path, date: new Date().toISOString(), message: b.message });
  repo.puts.push(path);
  return reply(cur ? 200 : 201, { content: { sha: f.fileSha } });
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'en-GB' });
  await ctx.route('https://api.github.com/**', github);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/status of (404|409|422)/.test(m.text())) errors.push(m.text()); });
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.message()); d.type() === 'prompt' ? d.accept('DELETE') : d.accept(); });
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); };
  const log = (...a) => console.log(...a);
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('.welcome');

  // 1. a crafted backup file, restored with the real "Restore a backup" button
  const evil = '" onerror="window.__ran=1" x="';
  const crafted = {
    app: 'gestion-locative',
    settings: { lang: 'en', signature: 'x' + evil, landlord: { name: 'Marie' } },
    properties: [{ id: 'P1' + evil, name: 'Flat', type: 'apartment', dpe: 'F', diagnostics: [{ id: 'g' + evil, type: 'gas', date: '2021-01-10', expiry: '2027-01-10' + evil }] }],
    leases: [{ id: 'L1' + evil, propertyId: 'P1' + evil, tenants: [{ name: 'Jean <b>Martin</b>' }], startDate: '2026-01-01', trackFrom: '2026-09', paymentDay: 5,
      chargesType: 'provision', deposit: 50000, rents: [{ from: '2026-01', rent: 50000, charges: 5000 }], adjustments: [], insuranceUntil: '2027-01-01' + evil }],
    payments: [], expenses: [], reminders: [], documents: [],
  };
  require('fs').writeFileSync(OUT + '/crafted.json', JSON.stringify(crafted));
  await nav('#/settings');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.card [data-action=restore]')]);
  await fc.setFiles(OUT + '/crafted.json');
  await page.waitForSelector('.tiles', { timeout: 10000 });
  for (const h of ['#/', '#/settings', '#/properties', '#/leases', '#/deadlines']) await nav(h);
  await page.click('text=Flat'); await page.waitForTimeout(200);
  await nav('#/leases'); await page.click('text=Jean'); await page.waitForTimeout(300);
  const ran = await page.evaluate(() => !!window.__ran);
  log('code from a crafted backup ran:', ran, '| tenant name shown as text:', await page.locator('h1', { hasText: 'Jean <b>Martin</b>' }).count() === 1);
  if (ran) throw new Error('code from a crafted backup ran');

  // 2. formal notice with no reminder made in the app: a sheet explains first
  await page.click('[data-action=notice]');
  await page.waitForSelector('#sheet');
  log('formal notice without a reminder:', (await page.textContent('#sheet h2')).trim());
  const [d1] = await Promise.all([page.waitForEvent('download'), page.click('#sheet [data-action=reminder]')]);
  log('reminder made from the sheet:', d1.suggestedFilename());
  await page.waitForTimeout(300);
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=notice]')]);
  log('formal notice after the reminder, straight away:', d2.suggestedFilename(), '| sheet:', await page.locator('#sheet').count());

  // 3. "Change rent" on an F-rated property: an increase is refused
  dialogs.length = 0;
  await page.click('[data-action=changeRent]');
  await page.fill('#sheet [name=rent]', '520');
  await page.click('#sheet button[type=submit]');
  await page.waitForTimeout(300);
  log('rent increase on an F property:', (dialogs[0] || 'not refused').slice(0, 60), '| rent kept:', (await page.textContent('.subtitle')).includes('500,00'));
  if (!/F or G/.test(dialogs[0] || '')) throw new Error('increase on an F property was not refused');
  await page.click('#sheet .sheet-head [data-action=closeSheet]');

  // 4. an attachment over 15 MB is refused
  dialogs.length = 0;
  await page.click('[data-action=docAdd]');
  await page.setInputFiles('#sheet input[type=file]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(16 * 1024 * 1024, 1) });
  await page.click('#sheet button[type=submit]');
  await page.waitForTimeout(800);
  log('16 MB attachment:', (dialogs[0] || 'accepted').slice(0, 50), '| documents:', await page.locator('[data-action=docOpen]').count());
  if (!/too large/.test(dialogs[0] || '')) throw new Error('large file not refused');

  // 5. GitHub backup pauses when a backup would lose most of the data
  await page.evaluate(async () => {
    const st = await import('/js/store.js');
    const s = await st.loadState();
    for (let i = 2; i <= 4; i++) {
      s.properties.push({ id: `P${i}`, name: `Flat ${i}`, type: 'apartment', diagnostics: [] });
      s.leases.push({ id: `L${i}`, propertyId: `P${i}`, tenants: [{ name: `T${i}` }], startDate: '2026-01-01', trackFrom: '2026-11', paymentDay: 5, rents: [{ from: '2026-01', rent: 50000, charges: 0 }], adjustments: [] });
    }
    await st.saveState(s);
  });
  await page.reload();
  await nav('#/');
  await page.waitForSelector('.tiles');
  await nav('#/settings');
  await page.fill('form[data-form=ghConnect] [name=repo]', 'me/backup');
  await page.fill('form[data-form=ghConnect] [name=token]', 'tok');
  dialogs.length = 0;
  await page.fill('form[data-form=ghConnect] [name=passphrase]', 'too short');
  await page.fill('form[data-form=ghConnect] [name=passphrase2]', 'too short');
  await page.click('form[data-form=ghConnect] button[type=submit]');
  await page.waitForTimeout(400);
  log('9-character passphrase:', (await page.textContent('#toast')).slice(0, 45));
  await page.fill('form[data-form=ghConnect] [name=passphrase]', 'cheval batterie agrafe correct');
  await page.fill('form[data-form=ghConnect] [name=passphrase2]', 'cheval batterie agrafe correct');
  await page.click('form[data-form=ghConnect] button[type=submit]');
  await page.waitForFunction(() => /Last automatic backup/.test((document.getElementById('sync-status') || {}).textContent || ''), null, { timeout: 20000 });
  log('first backup:', repo.puts.filter((p) => p.endsWith('data.json.enc')).length, 'upload');
  await page.click('[data-action=wipe]');
  await page.waitForSelector('.welcome');
  const before = repo.puts.length;
  await nav('#/property-edit/new');
  await page.fill('[name=name]', 'New start'); await page.click('button[type=submit]'); await page.waitForURL(/#\/property\//);
  await nav('#/settings');
  await page.waitForSelector('[data-action=syncForce]', { timeout: 25000 });
  log('after erasing, backup paused instead of replaced:', repo.puts.length === before, '|', (await page.textContent('#sync-status')).replace(/\s+/g, ' ').trim().slice(0, 80));
  if (repo.puts.length !== before) throw new Error('the backup was replaced after an erase');
  await nav('#/');
  log('home banner:', (await page.textContent('.banner.warn')).trim().slice(0, 50));
  await nav('#/settings');
  await page.click('[data-action=syncForce]');
  const t0 = Date.now();
  while (repo.puts.length === before && Date.now() - t0 < 20000) await page.waitForTimeout(500);
  log('"save anyway" then saved:', repo.puts.length > before);

  log('ERRORS:', JSON.stringify(errors));
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n').slice(0, 3).join(' | ')); process.exit(1); });
