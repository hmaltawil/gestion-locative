const { chromium } = require('playwright');
const OUT = require('path').join(require('os').tmpdir(), 'gl-e2e-backup');
require('fs').mkdirSync(OUT, { recursive: true });

// ---------- fake GitHub (shared by both "phones") ----------
const repo = { private: true, files: new Map(), commits: [], puts: [] };
let n = 0;
function github(who) { return async (route) => {
  const req = route.request();
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS' };
  const reply = (status, body, raw) => route.fulfill({ status, headers: { ...cors, 'Content-Type': raw ? 'text/plain' : 'application/json' }, body: raw ? body : JSON.stringify(body) });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (req.headers().authorization !== 'Bearer tok-123') return reply(401, { message: 'Bad credentials' });
  const u = new URL(req.url());
  const p = u.pathname;
  if (p === '/repos/me/backup') return reply(200, { private: repo.private, default_branch: 'main' });
  if (p === '/repos/me/backup/commits') {
    const path = u.searchParams.get('path');
    const per = Number(u.searchParams.get('per_page') || 30);
    const pg = Number(u.searchParams.get('page') || 1);
    const list = repo.commits.filter((c) => c.path === path).slice().reverse().slice((pg - 1) * per, pg * per);
    return reply(200, list.map((c) => ({ sha: c.sha, commit: { committer: { date: c.date }, message: c.message } })));
  }
  const m = /^\/repos\/me\/backup\/contents\/(.+)$/.exec(p);
  if (m) {
    const path = decodeURIComponent(m[1]);
    if (req.method() === 'GET') {
      const ref = u.searchParams.get('ref');
      const f = ref ? repo.commits.find((c) => c.sha === ref && c.path === path) : repo.files.get(path);
      if (!f) return reply(404, { message: 'Not Found' });
      if ((req.headers().accept || '').includes('raw')) return reply(200, f.text, true);
      return reply(200, { sha: f.fileSha });
    }
    if (req.method() === 'PUT') {
      const b = JSON.parse(req.postData());
      const cur = repo.files.get(path);
      if (cur && b.sha !== cur.fileSha) return reply(409, { message: 'sha mismatch' });
      if (!cur && b.sha) return reply(422, { message: 'sha given for new file' });
      const text = Buffer.from(b.content, 'base64').toString('utf8');
      n++;
      const f = { text, fileSha: `f${n}` };
      repo.files.set(path, f);
      repo.commits.push({ sha: `c${n}`, path, text, date: new Date(Date.now() + n * 1000).toISOString(), message: b.message, fileSha: f.fileSha });
      repo.puts.push({ path, message: b.message, text, who });
      return reply(cur ? 200 : 201, { content: { sha: f.fileSha } });
    }
  }
  return reply(404, { message: 'Not Found' });
}; }

async function phone(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'en-GB' });
  await ctx.route('https://api.github.com/**', github(name));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'DELETE' : undefined));
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); };
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('.welcome');
  return { ctx, page, errors, nav };
}

(async () => {
  const { decryptJson, decryptBytes } = await import(require('url').pathToFileURL(require('path').join(__dirname, '../../js/crypto.js')).href);
  const browser = await chromium.launch();
  const A = await phone(browser, 'phoneA');
  const { page, nav } = A;
  const log = (...a) => console.log(...a);

  // data: property, lease, payment, document
  await nav('#/property-edit/new');
  await page.fill('[name=name]', 'Appartement Gambetta'); await page.click('button[type=submit]'); await page.waitForURL(/#\/property\//);
  await page.click('[data-action=docAdd]');
  await page.setInputFiles('#sheet input[type=file]', __dirname + '/photo.png');
  await page.click('#sheet button[type=submit]');
  await page.waitForSelector('[data-action=docOpen]');
  await page.click('text=New lease');
  await page.fill('[name=tenant_name]', 'Jean Martin'); await page.fill('[name=startDate]', '2024-09-01'); await page.fill('[name=rent]', '750');
  await page.click('form[data-form=lease] button[type=submit]'); await page.waitForURL(/#\/lease\//);
  await page.click('.card [data-action=pay]'); await page.fill('#sheet [name=amount]', '750'); await page.click('#sheet button[type=submit]');
  await page.waitForTimeout(500);

  // snapshots: a daily copy exists
  await nav('#/settings');
  await page.waitForSelector('#snap-list .row');
  log('snapshots after first data:', await page.locator('#snap-list .row').count(), '-', (await page.textContent('#snap-list .row')).replace(/\s+/g, ' ').trim().slice(0, 60));

  // wrong token / public repo are refused
  await page.fill('form[data-form=ghConnect] [name=repo]', 'https://github.com/me/backup');
  await page.fill('form[data-form=ghConnect] [name=token]', 'wrong');
  await page.fill('form[data-form=ghConnect] [name=passphrase]', 'cheval batterie agrafe correct');
  await page.fill('form[data-form=ghConnect] [name=passphrase2]', 'cheval batterie agrafe correct');
  await page.click('form[data-form=ghConnect] button[type=submit]');
  await page.waitForTimeout(600);
  log('wrong token toast:', await page.textContent('#toast'));
  repo.private = false;
  await page.fill('form[data-form=ghConnect] [name=token]', 'tok-123');
  await page.click('form[data-form=ghConnect] button[type=submit]');
  await page.waitForTimeout(600);
  log('public repo toast:', await page.textContent('#toast'));
  repo.private = true;

  // connect for real
  await page.fill('form[data-form=ghConnect] [name=tokenExpires]', '2027-11-01');
  await page.click('form[data-form=ghConnect] button[type=submit]');
  await page.waitForFunction(() => /Last automatic backup/.test((document.getElementById('sync-status') || {}).textContent || ''), null, { timeout: 15000 });
  log('status:', (await page.textContent('#sync-status')).replace(/\s+/g, ' ').trim());
  log('uploaded files:', [...repo.files.keys()].join(', '));
  const dataText = repo.files.get('backup/data.json.enc').text;
  log('plain text visible on GitHub?', /Jean|Gambetta/.test(dataText) || repo.puts.some((x) => /Jean|Gambetta/.test(x.text)));
  const decoded = await decryptJson(dataText, 'cheval batterie agrafe correct');
  log('decrypted on GitHub side with passphrase:', decoded.state.leases[0].tenants[0].name, '| payments', decoded.state.payments.length);
  await page.screenshot({ path: OUT + '/settings-connected.png', fullPage: true });

  // a change is backed up automatically (debounced ~8s)
  const before = repo.puts.length;
  await nav('#/expense-new');
  await page.fill('input[name=description]', 'Plombier'); await page.fill('[name=amount]', '120');
  await page.click('button[type=submit]');
  await page.waitForFunction((b) => b, null, { timeout: 100 }).catch(() => {});
  const t0 = Date.now();
  while (repo.puts.length === before && Date.now() - t0 < 20000) await page.waitForTimeout(500);
  log('auto backup after change:', repo.puts.length > before, `(${Math.round((Date.now() - t0) / 1000)} s)`, repo.puts[repo.puts.length - 1].message);
  log('expense in latest backup:', (await decryptJson(repo.files.get('backup/data.json.enc').text, 'cheval batterie agrafe correct')).state.expenses.length);

  // deletion makes a snapshot, restore brings the lease back
  await nav('#/leases'); await page.click('text=Jean Martin');
  await page.click('[data-action=deleteLease]');
  await page.waitForURL(/#\/leases/);
  log('leases after delete:', await page.evaluate(() => document.querySelectorAll('.list .row-link').length));
  await nav('#/settings');
  await page.waitForSelector('#snap-list .row');
  log('latest snapshot:', (await page.textContent('#snap-list .row')).replace(/\s+/g, ' ').trim().slice(0, 50));
  await page.click('#snap-list [data-action=snapRestore] >> nth=0');
  await page.waitForTimeout(800);
  await nav('#/leases');
  log('leases after snapshot restore:', await page.locator('.list .row-link').count());

  // one-tap manual backup
  await nav('#/settings');
  await page.waitForTimeout(1500);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('.card [data-action=backup]')]);
  log('one-tap backup downloaded:', dl.suggestedFilename(), '| sheet opened:', await page.locator('#sheet').count());

  // ---------- second phone restores from GitHub ----------
  const B = await phone(browser, 'phoneB');
  await B.nav('#/settings');
  await B.page.fill('form[data-form=ghConnect] [name=repo]', 'me/backup');
  await B.page.fill('form[data-form=ghConnect] [name=token]', 'tok-123');
  await B.page.fill('form[data-form=ghConnect] [name=passphrase]', 'cheval batterie agrafe correct');
  await B.page.fill('form[data-form=ghConnect] [name=passphrase2]', 'cheval batterie agrafe correct');
  const putsBefore = repo.puts.length;
  await B.page.click('form[data-form=ghConnect] button[type=submit]');
  await B.page.waitForSelector('#sheet [data-action=ghRestoreVersion]', { timeout: 10000 });
  log('phone B sees versions:', await B.page.locator('#sheet [data-action=ghRestoreVersion]').count(), '| note:', (await B.page.textContent('#sheet .note')).slice(0, 45));
  await B.page.waitForTimeout(9000);
  log('empty phone B did not overwrite the backup:', !repo.puts.slice(putsBefore).some((x) => x.who === 'phoneB'), '| uploads during wait by:', JSON.stringify(repo.puts.slice(putsBefore).map((x) => x.who)));
  await B.page.screenshot({ path: OUT + '/phoneB-versions.png' });
  await B.page.click('#sheet [data-action=ghRestoreVersion] >> nth=0');
  await B.page.waitForSelector('.tiles', { timeout: 15000 });
  await B.nav('#/properties'); await B.page.click('text=Appartement Gambetta');
  await B.page.click('[data-action=docOpen]');
  await B.page.waitForSelector('.doc-preview', { timeout: 5000 });
  log('phone B restored data and document photo: ok');

  // wrong passphrase on a third phone
  const C = await phone(browser, 'phoneC');
  await C.nav('#/settings');
  await C.page.fill('form[data-form=ghConnect] [name=repo]', 'me/backup');
  await C.page.fill('form[data-form=ghConnect] [name=token]', 'tok-123');
  await C.page.fill('form[data-form=ghConnect] [name=passphrase]', 'not the right phrase');
  await C.page.fill('form[data-form=ghConnect] [name=passphrase2]', 'not the right phrase');
  await C.page.click('form[data-form=ghConnect] button[type=submit]');
  await C.page.waitForSelector('#sheet [data-action=ghRestoreVersion]', { timeout: 10000 });
  await C.page.click('#sheet [data-action=ghRestoreVersion] >> nth=0');
  await C.page.waitForTimeout(2000);
  log('wrong passphrase toast:', await C.page.textContent('#toast'));

  // wipe, then restore the "before erasing" snapshot
  const markWipe = repo.puts.length;
  await nav('#/settings');
  await page.click('[data-action=wipe]');
  await page.waitForSelector('.welcome');
  await nav('#/settings');
  await page.waitForSelector('#snap-list .row');
  await page.click('#snap-list [data-action=snapRestore] >> nth=0');
  await page.waitForTimeout(800);
  await nav('#/properties'); await page.click('text=Appartement Gambetta');
  await page.click('[data-action=docOpen]');
  await page.waitForSelector('.doc-preview', { timeout: 5000 });
  log('after wipe + snapshot restore, document still opens: ok');

  // ---------- two "main phones": the one that is behind stops instead of overwriting ----------
  const waitPut = async (who, from) => {
    const t0 = Date.now();
    while (!repo.puts.slice(from).some((x) => x.who === who && x.path === 'backup/data.json.enc') && Date.now() - t0 < 25000) await page.waitForTimeout(500);
    return repo.puts.slice(from).some((x) => x.who === who && x.path === 'backup/data.json.enc');
  };
  log('phone A saved after the snapshot restore:', await waitPut('phoneA', markWipe));
  await B.nav('#/settings'); await B.page.click('[data-action=ghRestore]');
  await B.page.waitForSelector('#sheet [data-action=ghRestoreVersion]', { timeout: 10000 });
  await B.page.click('#sheet [data-action=ghRestoreVersion] >> nth=0');
  await B.page.waitForSelector('.tiles', { timeout: 15000 });
  let mark = repo.puts.length;
  await B.nav('#/expense-new');
  await B.page.fill('input[name=description]', 'Serrurier'); await B.page.fill('[name=amount]', '90');
  await B.page.click('button[type=submit]');
  log('phone B saved its change:', await waitPut('phoneB', mark));
  const latest = repo.files.get('backup/data.json.enc').text;
  mark = repo.puts.length;
  await nav('#/expense-new');
  await page.fill('input[name=description]', 'Peintre'); await page.fill('[name=amount]', '300');
  await page.click('button[type=submit]');
  await nav('#/settings');
  await page.waitForSelector('[data-action=syncForce]', { timeout: 25000 });
  log('phone A, behind, did not overwrite:', repo.files.get('backup/data.json.enc').text === latest && !repo.puts.slice(mark).some((x) => x.who === 'phoneA' && x.path === 'backup/data.json.enc'));
  log('phone A status:', (await page.textContent('#sync-status')).replace(/\s+/g, ' ').trim().slice(0, 70));
  await nav('#/');
  log('home banner:', (await page.textContent('.banner.warn')).trim().slice(0, 60));
  await nav('#/settings');
  await page.click('[data-action=syncForce]');
  log('after "save anyway", phone A saved:', await waitPut('phoneA', mark));
  if (repo.files.get('backup/data.json.enc').text === latest) throw new Error('save anyway did not save');

  log('ERRORS:', JSON.stringify([...A.errors, ...B.errors, ...C.errors].filter((e) => !/Failed to load resource: the server responded with a status of (401|404|409)/.test(e))));
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
