// Off-site backup to a private GitHub repository, through GitHub's REST API.
// Only encrypted files are sent (see crypto.js). Every upload is a commit, so
// GitHub keeps every version.
// cfg: { repo: 'owner/name', token, fetch? } (fetch can be replaced in tests)

import { bytesToB64 } from './crypto.js';

const API = 'https://api.github.com';
export const DATA_PATH = 'backup/data.json.enc';
export const docPath = (id) => `backup/docs/${id}.enc`;

export class SyncError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

// Accepts "owner/name" or a GitHub address.
export function parseRepo(input) {
  const s = String(input || '').trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const m = /^(?:https?:\/\/github\.com\/)?([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(s);
  return m ? `${m[1]}/${m[2]}` : null;
}

function encPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function gh(cfg, method, path, body, accept) {
  const f = cfg.fetch || globalThis.fetch;
  let res;
  try {
    res = await f(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch (e) {
    throw new SyncError('network');
  }
  if (res.status === 401) throw new SyncError('bad-token', 401);
  return res;
}

// Checks the token can see the repository and that it is private.
export async function checkRepo(cfg) {
  const res = await gh(cfg, 'GET', `/repos/${cfg.repo}`);
  if (res.status === 404 || res.status === 403) throw new SyncError('not-found', res.status);
  if (!res.ok) throw new SyncError('unknown', res.status);
  const j = await res.json();
  if (!j.private) throw new SyncError('public-repo');
  return { private: true, defaultBranch: j.default_branch || null };
}

export async function getSha(cfg, path) {
  const res = await gh(cfg, 'GET', `/repos/${cfg.repo}/contents/${encPath(path)}`);
  if (res.status === 404) return null;
  if (res.status === 403) throw new SyncError('no-access', 403);
  if (!res.ok) throw new SyncError('unknown', res.status);
  const j = await res.json();
  return j.sha || null;
}

// Creates or replaces a file. Returns the new file sha.
// When the file changed on GitHub since `sha` (or already exists):
// - by default the current version is replaced (documents never change, so
//   replacing one is harmless);
// - with opts.refuseConflicts, a version saved by another device is never
//   replaced: SyncError('conflict') is thrown instead. A version saved by this
//   device (its commit message contains opts.tag) is still replaced: that
//   happens when GitHub saved our last upload but the answer was lost.
export async function putFile(cfg, path, text, message, sha, opts = {}) {
  const send = (s) => gh(cfg, 'PUT', `/repos/${cfg.repo}/contents/${encPath(path)}`, {
    message,
    content: bytesToB64(new TextEncoder().encode(text)),
    ...(s ? { sha: s } : {}),
  });
  let res = await send(sha);
  if (res.status === 409 || res.status === 422) {
    if (opts.refuseConflicts) {
      const [last] = await listVersions(cfg, path, { perPage: 1 });
      const ours = opts.tag && last && String(last.message || '').includes(opts.tag);
      if (!ours) throw new SyncError('conflict', res.status);
    }
    const current = await getSha(cfg, path);
    res = await send(current);
  }
  if (res.status === 403 || res.status === 404) throw new SyncError('no-write', res.status);
  if (res.status === 413) throw new SyncError('too-large', 413);
  if (!res.ok) throw new SyncError('unknown', res.status);
  const j = await res.json();
  return (j.content && j.content.sha) || null;
}

// Versions of a file, newest first: [{ sha, date, message }].
// One page at a time (page 1 = newest); a full page means there may be more.
export const VERSIONS_PER_PAGE = 50;
export async function listVersions(cfg, path = DATA_PATH, { page = 1, perPage = VERSIONS_PER_PAGE } = {}) {
  const res = await gh(cfg, 'GET', `/repos/${cfg.repo}/commits?path=${encodeURIComponent(path)}&per_page=${perPage}&page=${page}`);
  if (res.status === 404 || res.status === 409) return []; // 409: empty repository
  if (!res.ok) throw new SyncError('unknown', res.status);
  const j = await res.json();
  return j.map((c) => ({ sha: c.sha, date: c.commit && (c.commit.committer || c.commit.author || {}).date, message: c.commit && c.commit.message }));
}

// File content as text (null if it doesn't exist).
export async function readFile(cfg, path, ref) {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const res = await gh(cfg, 'GET', `/repos/${cfg.repo}/contents/${encPath(path)}${q}`, null, 'application/vnd.github.raw+json');
  if (res.status === 404) return null;
  if (!res.ok) throw new SyncError('unknown', res.status);
  return res.text();
}
