const { chromium } = require('playwright');
const { spawn } = require('child_process');
const SCR = process.argv[2];
const serve = (dir) => spawn('python3', ['-m', 'http.server', '8090'], { cwd: dir, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let srv = null;
let browser = null;
const log = (...a) => console.log(...a);
async function main() {
  srv = serve(SCR + '/old');
  await sleep(1000);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const nav = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(200); };
  await page.goto('http://localhost:8090/');
  await page.waitForSelector('.welcome');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await nav('#/property-edit/new');
  await page.fill('[name=name]', 'Old flat'); await page.click('button[type=submit]'); await page.waitForURL(/#\/property\//);
  await page.click('text=New lease');
  await page.fill('[name=tenant_name]', 'Old Tenant'); await page.fill('[name=startDate]', '2026-09-01');
  await page.fill('[name=rent]', '600'); await page.fill('[name=charges]', '50');
  await page.click('form[data-form=lease] button[type=submit]'); await page.waitForURL(/#\/lease\//);
  log('v1 data entered, caches:', await page.evaluate(() => caches.keys()));
  srv.kill(); await sleep(700);
  srv = serve(require('path').join(__dirname, '../..')); await sleep(1000);
  log('server now serves:', (await (await fetch('http://localhost:8090/sw.js')).text()).match(/VERSION = '[^']+'/)[0]);
  let launches = 0;
  for (; launches < 3; launches++) {
    await page.reload();
    try { await page.waitForSelector('.update-bar', { timeout: 5000 }); break; } catch (e) { /* try next launch */ }
  }
  log('update bar shown on launch', launches + 1);
  await Promise.all([page.waitForEvent('load'), page.click('.update-bar button')]);
  await nav('#/');
  try { await page.waitForSelector('.quick', { timeout: 8000 }); }
  catch (e) {
    await page.screenshot({ path: __dirname + '/upgrade-fail.png' });
    log('page errors:', JSON.stringify(errors), 'caches:', JSON.stringify(await page.evaluate(() => caches.keys())), 'html:', (await page.content()).slice(0, 300));
    throw e;
  }
  log('new version running, caches:', await page.evaluate(() => caches.keys()));
  await nav('#/leases'); await page.click('text=Old Tenant');
  await page.waitForSelector('[data-action=letters]');
  log('old lease opens in new version; adjustments section:', await page.locator('[data-action=adjAdd]').count());
  await nav('#/deadlines'); await page.waitForSelector('.btn-row');
  log('ERRORS:', JSON.stringify(errors));
}
const timer = setTimeout(() => { log('TIMEOUT'); process.exit(2); }, 120000);
main().catch((e) => { log('FAILED', e.message.split(String.fromCharCode(10))[0]); process.exitCode = 1; })
  .finally(async () => { clearTimeout(timer); if (browser) await browser.close().catch(() => {}); if (srv) srv.kill(); });
