// Saves all the app's data on the device (IndexedDB), plus backup and restore.
// 'kv' holds the app state as one JSON object (and, under a separate key, the
// off-site backup settings, which never go into backups or snapshots);
// 'files' holds attached documents; 'snapshots' holds automatic copies.

import { todayStr } from './util.js';

const DB_NAME = 'gestion-locative';
const STORE = 'kv';
const FILES = 'files';
const SNAPS = 'snapshots';
const KEY = 'state';
const SECRETS_KEY = 'secrets';
export const DATA_VERSION = 3;

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
      theme: 'light', // 'light' (default), 'dark' or 'auto' (follows the iPhone)
    },
    irl: {},
    properties: [],
    leases: [],
    payments: [],
    expenses: [],
    reminders: [],
    documents: [],
    trash: [], // deleted documents: files kept 15 days so a snapshot can bring them back
    sent: {},
    tax: {}, // per year, figures entered on the tax screen: { '2026': { line230 } }
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
      if (!db.objectStoreNames.contains(SNAPS)) db.createObjectStore(SNAPS, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      // Let a newer version of the app upgrade the database if one is open.
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
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

// ---------- snapshots (automatic copies kept on the device) ----------
// { id, at: ISO date-time, day: 'YYYY-MM-DD', reason, counts, state }
export function putSnapshot(snap) {
  return tx(SNAPS, 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(snap))));
}

export async function listSnapshots() {
  const all = (await tx(SNAPS, 'readonly', (s) => s.getAll())) || [];
  return all.sort((a, b) => (a.at < b.at ? 1 : -1));
}

export function getSnapshot(id) {
  return tx(SNAPS, 'readonly', (s) => s.get(id));
}

export function deleteSnapshot(id) {
  return tx(SNAPS, 'readwrite', (s) => s.delete(id));
}

// Everything on this device: the data and GitHub settings ('kv'), the
// attached documents and the automatic copies.
export async function eraseDeviceData() {
  await tx(STORE, 'readwrite', (s) => s.clear());
  await tx(FILES, 'readwrite', (s) => s.clear());
  await tx(SNAPS, 'readwrite', (s) => s.clear());
}

// ---------- off-site backup settings (never part of the app data) ----------
export async function loadSecrets() {
  return (await tx(STORE, 'readonly', (s) => s.get(SECRETS_KEY))) || {};
}

export function saveSecrets(secrets) {
  return tx(STORE, 'readwrite', (s) => s.put(JSON.parse(JSON.stringify(secrets)), SECRETS_KEY));
}

// ---------- cleaning what is read back ----------
// Everything the app reads (its own storage, a backup file, a GitHub backup, an
// automatic copy) goes through normalize(). Some values are put on screen as
// they are (ids, dates, months, the signature), so they must look exactly like
// what the app itself writes: a crafted file must never be able to slip code in.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cleanId = (v) => String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
const cleanDate = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const cleanMonth = (v) => (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? v : null);
const cleanNum = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);
const cleanText = (v) => (v === null || v === undefined ? '' : String(v));
const cleanSignature = (v) => (typeof v === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null);
const objects = (v) => (Array.isArray(v) ? v.filter(isObj) : []);

function cleanDates(o, keys) {
  for (const k of keys) if (k in o) o[k] = cleanDate(o[k]);
}

function cleanState(s) {
  s.settings.lang = s.settings.lang === 'en' ? 'en' : 'fr';
  s.settings.signature = cleanSignature(s.settings.signature);
  for (const k of ['lastBackup', 'irlUpdated']) s.settings[k] = cleanDate(s.settings[k]);
  for (const k of Object.keys(s.settings.landlord)) s.settings.landlord[k] = cleanText(s.settings.landlord[k]);
  s.irl = Object.fromEntries(Object.entries(s.irl).filter(([k, v]) => /^\d{4}-Q[1-4]$/.test(k) && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
  s.sent = Object.fromEntries(Object.entries(s.sent).map(([k, v]) => [k, cleanDate(v)]).filter(([, v]) => v));
  s.tax = Object.fromEntries(Object.entries(s.tax).filter(([k, v]) => /^\d{4}$/.test(k) && isObj(v)).map(([k, v]) => [k, { ...v, line230: cleanNum(v.line230) }]));

  s.properties = objects(s.properties);
  for (const p of s.properties) {
    p.id = cleanId(p.id);
    if (!['A', 'B', 'C', 'D', 'E', 'F', 'G'].includes(p.dpe)) p.dpe = '';
    p.diagnostics = objects(p.diagnostics);
    for (const d of p.diagnostics) { d.id = cleanId(d.id); d.date = cleanDate(d.date); d.expiry = cleanDate(d.expiry) || ''; }
  }
  s.leases = objects(s.leases);
  for (const l of s.leases) {
    l.id = cleanId(l.id);
    l.propertyId = cleanId(l.propertyId);
    cleanDates(l, ['startDate', 'endDate', 'insuranceUntil', 'lastRevision']);
    if ('trackFrom' in l) l.trackFrom = cleanMonth(l.trackFrom);
    if (l.revisionDate !== undefined && l.revisionDate !== null && !/^\d{2}-\d{2}$/.test(String(l.revisionDate))) l.revisionDate = null;
    l.paymentDay = Math.min(28, Math.max(1, cleanNum(l.paymentDay) || 1));
    for (const k of ['deposit', 'openingBalance']) if (k in l) l[k] = cleanNum(l[k]);
    l.tenants = objects(l.tenants);
    l.rents = objects(l.rents).filter((r) => cleanMonth(r.from)).map((r) => ({ ...r, rent: cleanNum(r.rent), charges: cleanNum(r.charges) }));
    // Every screen counts on a start date: rebuild a missing one from the
    // first rent, the start of tracking, or (last resort) today, rather than crash.
    if (!l.startDate) {
      const first = l.rents.map((r) => r.from).sort()[0] || l.trackFrom;
      l.startDate = first ? `${first}-01` : todayStr();
    }
    l.adjustments = objects(l.adjustments);
    for (const a of l.adjustments) { a.id = cleanId(a.id); a.date = cleanDate(a.date); a.amount = cleanNum(a.amount); }
    if (isObj(l.irl)) {
      const q = Number(l.irl.quarter);
      l.irl = [1, 2, 3, 4].includes(q) ? { quarter: q, key: /^\d{4}-Q[1-4]$/.test(l.irl.key) ? l.irl.key : null, value: Number(l.irl.value) || null } : null;
    } else l.irl = null;
    l.regularizations = isObj(l.regularizations) ? l.regularizations : {};
    for (const r of Object.values(l.regularizations)) if (isObj(r)) r.date = cleanDate(r.date);
    if (isObj(l.departure)) {
      cleanDates(l.departure, ['keysDate', 'returnedOn']);
      l.departure.deductions = objects(l.departure.deductions);
    } else delete l.departure;
  }
  s.payments = objects(s.payments).filter((x) => cleanDate(x.date));
  for (const x of s.payments) { x.id = cleanId(x.id); x.leaseId = cleanId(x.leaseId); x.amount = cleanNum(x.amount); }
  s.expenses = objects(s.expenses).filter((e) => cleanDate(e.date));
  for (const e of s.expenses) { e.id = cleanId(e.id); e.propertyId = e.propertyId ? cleanId(e.propertyId) : ''; e.amount = cleanNum(e.amount); }
  s.reminders = objects(s.reminders);
  for (const r of s.reminders) { r.id = cleanId(r.id); r.date = cleanDate(r.date); r.propertyId = r.propertyId ? cleanId(r.propertyId) : ''; }
  s.documents = objects(s.documents);
  for (const d of s.documents) {
    d.id = cleanId(d.id); d.ownerId = cleanId(d.ownerId); d.date = cleanDate(d.date); d.size = cleanNum(d.size);
    d.name = cleanText(d.name) || 'document'; d.type = cleanText(d.type);
  }
  s.trash = objects(s.trash);
  for (const d of s.trash) { d.id = cleanId(d.id); d.deletedOn = cleanDate(d.deletedOn); }
}

// Fills in anything missing so older data and backups keep working, and cleans it.
export function normalize(raw) {
  const base = emptyState();
  if (!isObj(raw)) raw = {};
  const s = { ...base, ...raw };
  s.settings = { ...base.settings, ...(isObj(raw.settings) ? raw.settings : {}) };
  s.settings.landlord = { ...base.settings.landlord, ...(isObj(s.settings.landlord) ? s.settings.landlord : {}) };
  for (const k of ['properties', 'leases', 'payments', 'expenses', 'reminders', 'documents', 'trash']) if (!Array.isArray(s[k])) s[k] = [];
  if (!isObj(s.irl)) s.irl = {};
  if (!isObj(s.sent)) s.sent = {};
  if (!isObj(s.tax)) s.tax = {};
  cleanState(s);
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
// The documents are added one at a time as separate pieces of the file, so
// the phone never holds every photo as one huge piece of text.
export async function backupBlob(state, withFiles = true) {
  const { files: _ignored, ...data } = state;
  const head = JSON.stringify({ app: 'gestion-locative', exportedAt: new Date().toISOString(), ...data, files: {} });
  const parts = [head.slice(0, -2)]; // ends with "files":{
  let first = true;
  if (withFiles) {
    for (const d of state.documents) {
      const f = await getFile(d.id);
      if (!f) continue;
      const meta = JSON.stringify({ name: f.name, type: f.type, data: '' }).slice(0, -2); // ends with "data":"
      parts.push(new Blob([`${first ? '' : ','}${JSON.stringify(d.id)}:${meta}`, bufToBase64(f.data), '"}']));
      first = false;
    }
  }
  parts.push('}}');
  return new Blob(parts, { type: 'application/json' });
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

// Adds the backup's files. Files that are no longer used are cleaned up at
// startup, so a snapshot taken before the restore keeps its documents.
export async function restoreFiles(files) {
  for (const [id, f] of Object.entries(files)) {
    await putFile(id, { name: f.name, type: f.type, data: base64ToBuf(f.data) });
  }
}
