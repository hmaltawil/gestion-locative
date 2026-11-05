// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptBytes, decryptJson, encryptBytes, encryptJson, newKeySession } from '../js/crypto.js';
import { counts, expiredTrash, needsDaily, toPrune } from '../js/snapshots.js';
import { DATA_PATH, checkRepo, docPath, getSha, listVersions, parseRepo, putFile, readFile, SyncError } from '../js/sync.js';

test('encryption round trip, wrong passphrase refused', async () => {
  const data = { leases: [{ id: 'L1', tenants: [{ name: 'Jean Martin' }] }], note: 'éàü €' };
  const env = await encryptJson(data, 'correct horse battery staple');
  assert.ok(!env.includes('Jean'), 'plain text must not appear');
  const parsed = JSON.parse(env);
  assert.equal(parsed.format, 'gestion-locative-encrypted');
  assert.equal(parsed.cipher, 'AES-GCM');
  assert.deepEqual(await decryptJson(env, 'correct horse battery staple'), data);
  await assert.rejects(decryptJson(env, 'wrong passphrase'), /wrong-passphrase/);
  await assert.rejects(decryptJson('{"hello":1}', 'x'), /not-encrypted/);
});

test('one key session encrypts several files with different IVs', async () => {
  const s = await newKeySession('pass phrase 123');
  const a = await encryptBytes(new Uint8Array([1, 2, 3]), 'pass phrase 123', s);
  const b = await encryptBytes(new Uint8Array([1, 2, 3]), 'pass phrase 123', s);
  assert.notEqual(JSON.parse(a).iv, JSON.parse(b).iv);
  assert.equal(JSON.parse(a).kdf.salt, JSON.parse(b).kdf.salt);
  assert.deepEqual([...await decryptBytes(b, 'pass phrase 123')], [1, 2, 3]);
});

test('snapshots: one daily per day for 14 days, 10 latest event snapshots', () => {
  const snaps = [];
  for (let i = 0; i < 20; i++) {
    const day = `2026-10-${String(i + 1).padStart(2, '0')}`;
    snaps.push({ id: `d${i}`, reason: 'daily', day, at: `${day}T08:00:00Z` });
  }
  snaps.push({ id: 'dup', reason: 'daily', day: '2026-10-20', at: '2026-10-20T07:00:00Z' });
  for (let i = 0; i < 12; i++) snaps.push({ id: `e${i}`, reason: 'import', day: '2026-10-20', at: `2026-10-20T${10 + i}:00:00Z` });
  const gone = new Set(toPrune(snaps, '2026-10-20'));
  // days 1..6 are older than 14 days (7..20 kept)
  for (let i = 0; i < 6; i++) assert.ok(gone.has(`d${i}`), `d${i}`);
  for (let i = 6; i < 20; i++) assert.ok(!gone.has(`d${i}`), `d${i}`);
  assert.ok(gone.has('dup'));
  assert.equal([...gone].filter((id) => id.startsWith('e')).length, 2);
  assert.ok(needsDaily(snaps, '2026-10-21'));
  assert.ok(!needsDaily(snaps, '2026-10-20'));
});

test('snapshot counts and trash expiry', () => {
  const st = { properties: [1, 2], leases: [1], payments: [1, 2, 3], expenses: [], documents: [1] };
  assert.deepEqual(counts(st), { p: 2, l: 1, pay: 3, e: 0, d: 1 });
  const trash = [{ id: 'a', deletedOn: '2026-10-01' }, { id: 'b', deletedOn: '2026-10-25' }];
  assert.deepEqual(expiredTrash(trash, '2026-11-05').map((t) => t.id), ['a']);
});

test('repository names', () => {
  assert.equal(parseRepo('hmaltawil/locatif-backup'), 'hmaltawil/locatif-backup');
  assert.equal(parseRepo('https://github.com/hmaltawil/locatif-backup.git'), 'hmaltawil/locatif-backup');
  assert.equal(parseRepo('https://github.com/hmaltawil/locatif-backup/'), 'hmaltawil/locatif-backup');
  assert.equal(parseRepo('not a repo'), null);
});

// A tiny fake GitHub for the sync functions.
function fakeGitHub({ isPrivate = true, token = 'good' } = {}) {
  const files = new Map();
  const commits = [];
  const calls = [];
  const json = (status, body) => ({ status, ok: status < 300, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  const fetch = async (url, opt) => {
    calls.push({ url, method: opt.method, headers: opt.headers, body: opt.body && JSON.parse(opt.body) });
    if (opt.headers.Authorization !== `Bearer ${token}`) return json(401, {});
    const u = new URL(url);
    const p = u.pathname;
    if (p === '/repos/me/backup') return json(200, { private: isPrivate, default_branch: 'main' });
    if (p === '/repos/me/backup/commits') {
      const path = u.searchParams.get('path');
      return json(200, commits.filter((c) => c.path === path).reverse().map((c) => ({ sha: c.sha, commit: { committer: { date: c.date }, message: c.message } })));
    }
    const m = /^\/repos\/me\/backup\/contents\/(.+)$/.exec(p);
    if (m) {
      const path = decodeURIComponent(m[1]);
      if (opt.method === 'GET') {
        const ref = u.searchParams.get('ref');
        const f = ref ? commits.find((c) => c.sha === ref && c.path === path) : files.get(path);
        if (!f) return json(404, {});
        if (opt.headers.Accept.includes('raw')) return json(200, f.text);
        return json(200, { sha: f.fileSha });
      }
      if (opt.method === 'PUT') {
        const b = JSON.parse(opt.body);
        const cur = files.get(path);
        if (cur && b.sha !== cur.fileSha) return json(409, {});
        if (!cur && b.sha) return json(422, {});
        const text = Buffer.from(b.content, 'base64').toString('utf8');
        const n = commits.length + 1;
        const f = { text, fileSha: `f${n}` };
        files.set(path, f);
        commits.push({ sha: `c${n}`, path, text, date: `2026-11-05T10:0${n}:00Z`, message: b.message, fileSha: f.fileSha });
        return json(cur ? 200 : 201, { content: { sha: f.fileSha } });
      }
    }
    return json(404, {});
  };
  return { fetch, files, commits, calls };
}

test('sync: repository check refuses public repositories and bad tokens', async () => {
  const pub = fakeGitHub({ isPrivate: false });
  await assert.rejects(checkRepo({ repo: 'me/backup', token: 'good', fetch: pub.fetch }), (e) => e instanceof SyncError && e.code === 'public-repo');
  const priv = fakeGitHub();
  await assert.rejects(checkRepo({ repo: 'me/backup', token: 'bad', fetch: priv.fetch }), (e) => e.code === 'bad-token');
  await assert.rejects(checkRepo({ repo: 'me/other', token: 'good', fetch: priv.fetch }), (e) => e.code === 'not-found');
  assert.deepEqual(await checkRepo({ repo: 'me/backup', token: 'good', fetch: priv.fetch }), { private: true, defaultBranch: 'main' });
});

test('sync: upload, update with stale sha, versions and reading an old version', async () => {
  const gh = fakeGitHub();
  const cfg = { repo: 'me/backup', token: 'good', fetch: gh.fetch };
  assert.equal(await getSha(cfg, DATA_PATH), null);
  const s1 = await putFile(cfg, DATA_PATH, 'v1', 'Sauvegarde 1');
  assert.equal(s1, 'f1');
  const put = gh.calls.find((c) => c.method === 'PUT');
  assert.equal(Buffer.from(put.body.content, 'base64').toString(), 'v1');
  assert.equal(put.headers.Authorization, 'Bearer good');
  // stale sha: the function refetches and retries
  const s2 = await putFile(cfg, DATA_PATH, 'v2', 'Sauvegarde 2', 'stale');
  assert.equal(s2, 'f2');
  // a document that already exists is replaced, not refused
  await putFile(cfg, docPath('abc'), 'doc', 'Doc');
  await putFile(cfg, docPath('abc'), 'doc2', 'Doc again');
  assert.equal(await readFile(cfg, docPath('abc')), 'doc2');
  const versions = await listVersions(cfg);
  assert.deepEqual(versions.map((v) => v.message), ['Sauvegarde 2', 'Sauvegarde 1']);
  assert.equal(await readFile(cfg, DATA_PATH, versions[1].sha), 'v1');
  assert.equal(await readFile(cfg, 'backup/missing.enc'), null);
});
