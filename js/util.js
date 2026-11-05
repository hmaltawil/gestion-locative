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

export function comparePeriods(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
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

// Accepts "1234.5", "1 234,50", "1234,5 €". Returns cents or null.
export function parseMoney(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/[\s  €]/g, '');
  if (s === '') return null;
  if (s.includes(',') && s.includes('.')) {
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
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
