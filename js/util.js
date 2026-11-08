// Small helpers shared by the whole app. Pure functions, no DOM access.
// Money is stored as integer cents. Dates are 'YYYY-MM-DD' strings and
// rent periods are 'YYYY-MM' strings, so there are no time-zone surprises.

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function periodOf(dateStr) {
  return dateStr.slice(0, 7);
}

export function splitPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  return { y, m };
}

export function addMonths(period, n) {
  const { y, m } = splitPeriod(period);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad2((idx % 12) + 1)}`;
}

export function daysInMonth(y, m) {
  return new Date(y, m, 0).getDate();
}

export function lastDayOfPeriod(period) {
  const { y, m } = splitPeriod(period);
  return `${period}-${pad2(daysInMonth(y, m))}`;
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + n));
}

export function addYears(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 29 February becomes 28 February in non-leap years.
  const day = Math.min(d, daysInMonth(y + n, m));
  return `${y + n}-${pad2(m)}-${pad2(day)}`;
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

const MONTHS = {
  fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

export function fmtPeriod(period, lang = 'fr') {
  const { y, m } = splitPeriod(period);
  return `${MONTHS[lang][m - 1]} ${y}`;
}

export function fmtPeriodCap(period, lang = 'fr') {
  const s = fmtPeriod(period, lang);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// 123456 -> "1 234,56 €". Uses plain spaces so the text also works in PDFs.
export function fmtMoney(cents, { symbol = true } = {}) {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = pad2(abs % 100);
  const grouped = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${neg ? '-' : ''}${grouped},${rest}${symbol ? ' €' : ''}`;
}

// Accepts "1234.5", "1 234,50", "1234,5 €", "1.200" (= 1 200 €). Returns cents or null.
export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/[\s\u00a0\u202f€]/g, '');
  if (s === '') return null;
  if (/^-?[1-9]\d{0,2}([.,]\d{3})+$/.test(s) && !(s.includes(',') && s.includes('.'))) {
    // "1.200", "12,500", "1.234.567": a euro amount never has 3 decimals, so
    // these are thousands separators (1.200 typed for a 1 200 € deposit).
    s = s.replace(/[.,]/g, '');
  } else if (s.includes(',') && s.includes('.')) {
    // "1.234,56" or "1,234.56": the last separator is the decimal one.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

// Cents -> "1234,56" for an input field.
export function moneyInput(cents) {
  if (cents === null || cents === undefined || cents === '') return '';
  return fmtMoney(cents, { symbol: false }).replace(/ /g, '');
}

export function uid() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

export function slug(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

// ---------- Amounts in French words (for the guarantor agreement) ----------
const UNITS_FR = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze',
  'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS_FR = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function below100(n) {
  if (n < 20) return UNITS_FR[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 7 || t === 9) {
    if (t === 7 && u === 1) return 'soixante et onze';
    return `${TENS_FR[t]}-${UNITS_FR[10 + u]}`;
  }
  if (u === 0) return t === 8 ? 'quatre-vingts' : TENS_FR[t];
  if (u === 1 && t !== 8) return `${TENS_FR[t]} et un`;
  return `${TENS_FR[t]}-${UNITS_FR[u]}`;
}

// final = nothing (or "millions") follows, so "cents"/"vingts" keep their s.
function below1000(n, final) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = '';
  if (h) s = `${h > 1 ? UNITS_FR[h] + ' ' : ''}cent${h > 1 && r === 0 && final ? 's' : ''}`;
  if (r) {
    let w = below100(r);
    if (!final && w === 'quatre-vingts') w = 'quatre-vingt';
    s += (s ? ' ' : '') + w;
  }
  return s;
}

export function numberToFrench(n) {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'zéro';
  const parts = [];
  const m = Math.floor(n / 1e6);
  const th = Math.floor(n / 1000) % 1000;
  const rest = n % 1000;
  if (m) parts.push(`${below1000(m, true)} million${m > 1 ? 's' : ''}`);
  if (th) parts.push(th === 1 ? 'mille' : `${below1000(th, false)} mille`);
  if (rest) parts.push(below1000(rest, true));
  return parts.join(' ');
}

export function amountInFrench(cents) {
  const euros = Math.floor(Math.abs(cents) / 100);
  const c = Math.abs(cents) % 100;
  const exactMillion = euros > 0 && euros % 1e6 === 0;
  let s = `${numberToFrench(euros)} ${exactMillion ? "d'euros" : euros > 1 ? 'euros' : 'euro'}`;
  if (c) s += ` et ${numberToFrench(c)} centime${c > 1 ? 's' : ''}`;
  return s;
}

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// ---------- text that the PDF fonts can show ----------
// jsPDF's built-in fonts only know the Windows-1252 characters (all French
// letters, € and typographic quotes). Other letters would print as garbage
// ("Łukasz" -> "Aukasz"), so they are replaced by the closest letter:
// "Łukasz Wójcik" -> "Lukasz Wójcik", "Nguyễn" -> "Nguyên", "Şahin" -> "Sahin".
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const PDF_REPLACE = {
  'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'Ħ': 'H', 'ħ': 'h', 'ı': 'i', 'Ŀ': 'L', 'ŀ': 'l', 'Ŧ': 'T', 'ŧ': 't',
  'Ĳ': 'IJ', 'ĳ': 'ij', 'ŉ': 'n', 'ſ': 's', 'Ə': 'E', 'ə': 'e', 'Ŋ': 'N', 'ŋ': 'n', 'ĸ': 'k',
  '\u202f': ' ', '\u2009': ' ', '\u2007': ' ', '−': '-', '‐': '-', '‑': '-', '→': '->', '≤': '<=', '≥': '>=',
};

function pdfSafe(ch) {
  const c = ch.codePointAt(0);
  return ch === '\n' || (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.has(ch);
}

export function pdfText(s) {
  let out = '';
  for (const ch of String(s ?? '').normalize('NFC')) {
    if (pdfSafe(ch)) { out += ch; continue; }
    if (ch === '\t') { out += ' '; continue; }
    if (PDF_REPLACE[ch] !== undefined) { out += PDF_REPLACE[ch]; continue; }
    // Drop accents one at a time until the letter can be shown ("ễ" -> "ê" -> "e").
    let d = ch.normalize('NFD');
    while (d.length > 1 && !pdfSafe(d.normalize('NFC'))) d = d.slice(0, -1);
    const r = d.normalize('NFC');
    out += pdfSafe(r) ? r : /\p{M}/u.test(ch) ? '' : '?';
  }
  return out;
}

export function normalizeText(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
