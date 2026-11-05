// Encryption for off-site backups, done on the phone before anything leaves it.
// AES-256-GCM with a key derived from the passphrase (PBKDF2-SHA-256).
// Uses the browser's built-in Web Crypto (also available in Node for tests).

const ITERATIONS = 310000;
const FORMAT = 'gestion-locative-encrypted';

function subtle() {
  return globalThis.crypto.subtle;
}

export function bytesToB64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < u8.length; i += step) bin += String.fromCharCode.apply(null, u8.subarray(i, i + step));
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

const keyCache = new Map();

async function deriveKey(passphrase, salt, iterations = ITERATIONS) {
  const id = `${iterations}:${bytesToB64(salt)}:${passphrase}`;
  if (keyCache.has(id)) return keyCache.get(id);
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  keyCache.set(id, key);
  return key;
}

// One salt per backup run, so the slow key derivation happens once per run.
export async function newKeySession(passphrase) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, salt);
  return { key, salt };
}

// bytes -> envelope text (JSON), safe to store anywhere.
export async function encryptBytes(bytes, passphrase, session) {
  const s = session || await newKeySession(passphrase);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: 'AES-GCM', iv }, s.key, bytes);
  return JSON.stringify({
    format: FORMAT,
    v: 1,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: bytesToB64(s.salt) },
    cipher: 'AES-GCM',
    iv: bytesToB64(iv),
    data: bytesToB64(new Uint8Array(data)),
  });
}

export async function decryptBytes(envelopeText, passphrase) {
  let env;
  try { env = JSON.parse(envelopeText); } catch (e) { throw new Error('not-encrypted'); }
  if (!env || env.format !== FORMAT) throw new Error('not-encrypted');
  const key = await deriveKey(passphrase, b64ToBytes(env.kdf.salt), env.kdf.iterations);
  try {
    const out = await subtle().decrypt({ name: 'AES-GCM', iv: b64ToBytes(env.iv) }, key, b64ToBytes(env.data));
    return new Uint8Array(out);
  } catch (e) {
    throw new Error('wrong-passphrase');
  }
}

export async function encryptJson(obj, passphrase, session) {
  return encryptBytes(new TextEncoder().encode(JSON.stringify(obj)), passphrase, session);
}

export async function decryptJson(envelopeText, passphrase) {
  return JSON.parse(new TextDecoder().decode(await decryptBytes(envelopeText, passphrase)));
}
