const { chromium } = require('playwright');
const OUT = require('path').join(require('os').tmpdir(), 'gl-e2e-support');
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
  const fs = require('fs');
  const browser = await chromium.launch();
  const log = (...a) => console.log(...a);
  const connect = async (P, mode) => {
    await P.nav('#/settings');
    await P.page.selectOption('form[data-form=ghConnect] [name=mode]', mode);
    await P.page.fill('form[data-form=ghConnect] [name=repo]', 'me/backup');
    await P.page.fill('form[data-form=ghConnect] [name=token]', 'tok-123');
    await P.page.fill('form[data-form=ghConnect] [name=passphrase]', 'cheval batterie agrafe correct');
    await P.page.fill('form[data-form=ghConnect] [name=passphrase2]', 'cheval batterie agrafe correct');
    await P.page.click('form[data-form=ghConnect] button[type=submit]');
  };
  // main phone with data
  const A = await phone(browser, 'main');
  await A.nav('#/property-edit/new');
  await A.page.fill('[name=name]', 'Appartement Gambetta'); await A.page.click('button[type=submit]'); await A.page.waitForURL(/#\/property\//);
  await A.page.click('text=New lease');
  await A.page.fill('[name=tenant_name]', 'Jean Martin'); await A.page.fill('[name=tenant_email]', 'jean@example.fr');
  await A.page.fill('[name=startDate]', '2024-09-01'); await A.page.fill('[name=rent]', '750');
  await A.page.click('form[data-form=lease] button[type=submit]'); await A.page.waitForURL(/#\/lease\//);
  await connect(A, 'main');
  await A.page.waitForFunction(() => /Last automatic backup/.test((document.getElementById('sync-status') || {}).textContent || ''), null, { timeout: 15000 });
  log('main phone backed up:', repo.puts.filter((x) => x.who === 'main').length, 'uploads');

  // support copy on "your" device
  const S = await phone(browser, 'support');
  await connect(S, 'viewer');
  await S.page.waitForSelector('#sheet [data-action=ghRestoreVersion]', { timeout: 10000 });
  await S.page.click('#sheet [data-action=ghRestoreVersion] >> nth=0');
  await S.page.waitForSelector('.support-bar', { timeout: 10000 });
  log('support bar:', (await S.page.textContent('.support-bar')).slice(0, 40));
  await S.nav('#/leases');
  log('support copy sees lease:', (await S.page.textContent('.list')).includes('Jean Martin'));
  await S.page.screenshot({ path: OUT + '/support-copy.png' });
  // a change on the support copy is never uploaded
  await S.nav('#/expense-new'); await S.page.fill('input[name=description]', 'Test support'); await S.page.fill('[name=amount]', '10'); await S.page.click('button[type=submit]');
  await S.page.waitForTimeout(11000);
  log('support copy uploads:', repo.puts.filter((x) => x.who === 'support').length);
  // the main phone changes something; the support copy refreshes and sees it
  await A.nav('#/expense-new'); await A.page.fill('input[name=description]', 'Plombier'); await A.page.fill('[name=amount]', '120'); await A.page.click('button[type=submit]');
  const before = repo.puts.length; const t0 = Date.now();
  while (repo.puts.length === before && Date.now() - t0 < 20000) await A.page.waitForTimeout(500);
  await S.nav('#/settings');
  log('support status:', (await S.page.textContent('#sync-status')).replace(/\s+/g, ' ').trim().slice(0, 70));
  await S.page.click('[data-action=supportRefresh]');
  await S.page.waitForTimeout(2500);
  await S.nav('#/expenses');
  const exp = await S.page.textContent('.content');
  log('after refresh: main phone expense visible:', exp.includes('Plombier'), '| local test expense replaced:', !exp.includes('Test support'));
  // anonymised support file
  await S.nav('#/settings');
  const [dl] = await Promise.all([S.page.waitForEvent('download', { timeout: 8000 }), S.page.click('[data-action=supportExport]')]);
  await dl.saveAs(OUT + '/support.json');
  const txt = fs.readFileSync(OUT + '/support.json', 'utf8');
  log('anonymised file:', dl.suggestedFilename(), '| contains real names:', /Jean|Martin|Gambetta|jean@/.test(txt), '| amounts kept:', txt.includes('75000'));
  // no backup nag on the support copy
  await S.nav('#/'); log('backup banner on support copy:', await S.page.locator('[data-action=backup]').count());
  log('ERRORS:', JSON.stringify([...A.errors, ...S.errors].filter((e) => !/status of (401|404)/.test(e))));
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message.split('\n').slice(0, 4).join(' | ')); process.exit(1); });
