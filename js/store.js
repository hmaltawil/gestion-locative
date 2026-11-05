// Saves all the app's data on the device (IndexedDB), plus backup and restore.
// 'kv' holds the app state as one JSON object; 'files' holds attached documents.

const DB_NAME = 'gestion-locative';
const STORE = 'kv';
const FILES = 'files';
const KEY = 'state';
export const DATA_VERSION = 2;

export function emptyState() {
  const lang = (globalThis.navigator && (navigator.language || 'fr').toLowerCase().startsWith('fr')) ? 'fr' : 'en';
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
    reminders: [],
    documents: [],
    sent: {},
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise = null;
function db() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    const req = fn(store);
    if (req) req.onsuccess = () => { result = req.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function loadState() {
  const raw = await tx(STORE, 'readonly', (s) => s.get(KEY));
  return raw ? normalize(raw) : emptyState();
}

export function saveState(state) {
  return tx(STORE, 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(state)), KEY));
}

// ---------- attached documents ----------
// Stored as { name, type, data: ArrayBuffer } (ArrayBuffer is the most
// reliable thing to keep in Safari's IndexedDB).
export function putFile(id, file) {
  return tx(FILES, 'readwrite', (s) => s.put(file, id));
}

export function getFile(id) {
  return tx(FILES, 'readonly', (s) => s.get(id));
}

export function deleteFile(id) {
  return tx(FILES, 'readwrite', (s) => s.delete(id));
}

export async function allFileIds() {
  return (await tx(FILES, 'readonly', (s) => s.getAllKeys())) || [];
}

export async function clearFiles() {
  return tx(FILES, 'readwrite', (s) => s.clear());
}

// Fills in anything missing so older data and backups keep working.
export function normalize(raw) {
  const base = emptyState();
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(raw.settings || {}) };
  s.settings.landlord = { ...base.settings.landlord, ...((raw.settings || {}).landlord || {}) };
  for (const k of ['properties', 'leases', 'payments', 'expenses', 'reminders', 'documents']) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.irl || typeof s.irl !== 'object') s.irl = {};
  if (!s.sent || typeof s.sent !== 'object') s.sent = {};
  for (const l of s.leases) {
    if (!Array.isArray(l.adjustments)) l.adjustments = [];
    if (!l.regularizations || typeof l.regularizations !== 'object') l.regularizations = {};
  }
  for (const p of s.properties) if (!Array.isArray(p.diagnostics)) p.diagnostics = [];
  s.version = DATA_VERSION;
  return s;
}

export async function askPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* not supported */ }
  return false;
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(bin);
}

function base64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// One JSON file with the data and, optionally, every attached document.
export async function backupBlob(state, withFiles = true) {
  const files = {};
  if (withFiles) {
    for (const d of state.documents) {
      const f = await getFile(d.id);
      if (f) files[d.id] = { name: f.name, type: f.type, data: bufToBase64(f.data) };
    }
  }
  const data = { app: 'gestion-locative', exportedAt: new Date().toISOString(), ...state, files };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export function parseBackup(text) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.leases) || !raw.settings) {
    throw new Error('not a backup');
  }
  const files = raw.files || {};
  delete raw.app;
  delete raw.exportedAt;
  delete raw.files;
  return { state: normalize(raw), files };
}

export async function restoreFiles(files) {
  await clearFiles();
  for (const [id, f] of Object.entries(files)) {
    await putFile(id, { name: f.name, type: f.type, data: base64ToBuf(f.data) });
  }
}
