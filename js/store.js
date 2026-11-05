// Saves all the app's data on the device (IndexedDB), plus backup and restore.

const DB_NAME = 'gestion-locative';
const STORE = 'kv';
const KEY = 'state';
export const DATA_VERSION = 1;

export function emptyState() {
  const lang = (navigator.language || 'fr').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  return {
    version: DATA_VERSION,
    settings: {
      lang,
      landlord: { name: '', address: '', postalCode: '', city: '', email: '', phone: '' },
      signature: null,
      lastBackup: null,
      irlUpdated: null,
    },
    irl: {},
    properties: [],
    leases: [],
    payments: [],
    expenses: [],
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function loadState() {
  const d = await db();
  const raw = await new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return raw ? normalize(raw) : emptyState();
}

export async function saveState(state) {
  const d = await db();
  await new Promise((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(JSON.parse(JSON.stringify(state)), KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// Fills in anything missing so older backups keep working.
export function normalize(raw) {
  const base = emptyState();
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.settings.landlord = { ...base.settings.landlord, ...((raw.settings || {}).landlord || {}) };
  for (const k of ['properties', 'leases', 'payments', 'expenses']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.irl || typeof s.irl !== 'object') s.irl = {};
  s.version = DATA_VERSION;
  return s;
}

export async function askPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* not supported */ }
  return false;
}

export function backupBlob(state) {
  const data = { app: 'gestion-locative', exportedAt: new Date().toISOString(), ...state };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export function parseBackup(text) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.leases) || !raw.settings) {
    throw new Error('not a backup');
  }
  delete raw.app;
  delete raw.exportedAt;
  return normalize(raw);
}
