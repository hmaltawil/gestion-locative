// Bank statement import: reads a CSV export from any French bank, then
// suggests which lease each incoming transfer belongs to.

import { daysBetween, daysInMonth, normalizeText, parseMoney, pad2 } from './util.js';

// ---------- CSV ----------
export function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30);
  let best = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map((l) => splitLine(l, d).length);
    const common = mode(counts);
    const score = common > 1 ? counts.filter((c) => c === common).length * common : 0;
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

function mode(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  let best = 0;
  let bestN = 0;
  for (const [k, n] of m) if (n > bestN || (n === bestN && k > best)) { best = k; bestN = n; }
  return best;
}

function splitLine(line, d) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

export function parseCsv(text, delimiter) {
  const d = delimiter || detectDelimiter(text);
  // Join lines broken inside quotes.
  const rows = [];
  let buf = '';
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    buf = buf ? buf + '\n' + line : line;
    if ((buf.match(/"/g) || []).length % 2 === 0) {
      if (buf.trim()) rows.push(splitLine(buf, d));
      buf = '';
    }
  }
  if (buf.trim()) rows.push(splitLine(buf, d));
  return { delimiter: d, rows };
}

// ---------- dates & amounts ----------
function validDate(y, mo, d) {
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return `${y}-${pad2(mo)}-${pad2(d)}`;
}

export function parseBankDate(s) {
  s = String(s || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return validDate(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

// Accepts "650,00", "-650,00", "+650,00 EUR", "EUR 650,00", "650,00-",
// "(650,00)" and the typographic minus sign.
export function parseBankAmount(s) {
  if (s === undefined || s === null) return null;
  let clean = String(s).trim().replace(/[\u2212\u2012\u2013]/g, '-')
    .replace(/^(EUR|€)\s*/i, '').replace(/\s*(EUR|€)$/i, '').trim();
  let neg = false;
  if (/^\(.*\)$/.test(clean)) { neg = true; clean = clean.slice(1, -1).trim(); }
  if (/-$/.test(clean)) { neg = true; clean = clean.slice(0, -1).trim(); }
  clean = clean.replace(/^\+/, '');
  if (!clean) return null;
  const v = parseMoney(clean);
  if (v === null) return null;
  return neg ? -Math.abs(v) : v;
}

// ---------- columns ----------
const RX = {
  date: /date/i,
  valueDate: /valeur|value/i,
  bookedDate: /complet|comptab|book/i, // Revolut "Completed Date", "Date comptable"
  state: /^(state|statut|status|état|etat)$/i,
  label: /libell|descri|label|intitul|d[ée]tail|motif|nature|op[ée]ration|wording|payee/i,
  amount: /montant|amount|somme/i,
  debit: /d[ée]bit/i,
  credit: /cr[ée]dit/i,
};

// Finds the header row and guesses which column is which.
export function guessMapping(rows) {
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const cells = rows[r];
    const map = { headerRow: r, date: -1, label: -1, amount: -1, debit: -1, credit: -1 };
    cells.forEach((c, i) => {
      if (RX.date.test(c) && !RX.valueDate.test(c) && map.date < 0) map.date = i;
      else if (RX.debit.test(c) && map.debit < 0) map.debit = i;
      else if (RX.credit.test(c) && map.credit < 0) map.credit = i;
      else if (RX.amount.test(c) && map.amount < 0) map.amount = i;
      else if (RX.label.test(c) && map.label < 0) map.label = i;
    });
    if (map.date < 0) cells.forEach((c, i) => { if (RX.date.test(c) && map.date < 0) map.date = i; });
    // When there are several dates, the booked one is the reliable one.
    const booked = cells.findIndex((c) => RX.date.test(c) && RX.bookedDate.test(c));
    if (booked >= 0) map.date = booked;
    map.state = cells.findIndex((c) => RX.state.test(c.trim()));
    if (map.date >= 0 && (map.amount >= 0 || map.credit >= 0)) {
      if (map.label < 0) map.label = cells.findIndex((_, i) => ![map.date, map.amount, map.debit, map.credit].includes(i));
      return map;
    }
  }
  // No header: guess from the data itself.
  const sample = rows.find((row) => row.some((c) => parseBankDate(c)));
  if (!sample) return null;
  const map = { headerRow: -1, date: sample.findIndex((c) => parseBankDate(c)), label: -1, amount: -1, debit: -1, credit: -1 };
  sample.forEach((c, i) => {
    if (i === map.date) return;
    if (map.amount < 0 && /\d/.test(c) && parseBankAmount(c) !== null && !parseBankDate(c)) map.amount = i;
    else if (map.label < 0 && /[A-Za-z]/.test(c)) map.label = i;
  });
  return map;
}

// Rows -> transactions { date, label, amount (cents, positive = money in), fp }.
// Lines that never reached the account (Revolut and others mark them).
const SKIP_STATES = /pending|declined|reverted|failed|cancel|annul|refus|en attente/i;

export function toTransactions(rows, map) {
  const out = [];
  const seen = new Map();
  const startRow = map.headerRow + 1;
  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    const date = parseBankDate(row[map.date]);
    if (!date) continue;
    if (map.state >= 0 && SKIP_STATES.test(String(row[map.state] || ''))) continue;
    let amount = null;
    if (map.amount >= 0) amount = parseBankAmount(row[map.amount]);
    if (amount === null && (map.credit >= 0 || map.debit >= 0)) {
      const cr = map.credit >= 0 ? parseBankAmount(row[map.credit]) : null;
      const db = map.debit >= 0 ? parseBankAmount(row[map.debit]) : null;
      if (cr) amount = Math.abs(cr);
      else if (db) amount = -Math.abs(db);
    }
    if (amount === null || amount === 0) continue;
    const label = (map.label >= 0 ? row[map.label] : '') || '';
    const base = `${date}|${amount}|${normalizeText(label)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    out.push({ date, label: label.replace(/\s+/g, ' ').trim(), amount, fp: n > 1 ? `${base}#${n}` : base });
  }
  return out;
}

// ---------- matching ----------
const NOISE = new Set(['VIR', 'VIREMENT', 'SEPA', 'RECU', 'RECUS', 'INST', 'INSTANTANE', 'DE', 'DU', 'DES', 'LA', 'LE', 'LES',
  'MR', 'MME', 'MLLE', 'M', 'ET', 'OU', 'REF', 'MOTIF', 'FAVEUR', 'PRLV', 'PAIEMENT', 'LOYER', 'LOYERS', 'CHARGES',
  'FROM', 'TRANSFER', 'POUR', 'PAR', 'EN', 'AU', 'AUX', 'VIRT', 'CPT', 'COMPTE', 'EMIS', 'EMETTEUR', 'BENEF', 'NOTPROVIDED']);

export function labelKey(label) {
  return normalizeText(label)
    .split(' ')
    .filter((w) => w.length > 2 && !/\d/.test(w) && !NOISE.has(w))
    .join(' ');
}

function nameTokens(lease) {
  const words = new Set();
  for (const t of lease.tenants || []) {
    for (const w of normalizeText(t.name).split(' ')) if (w.length >= 3 && !NOISE.has(w)) words.add(w);
  }
  return [...words];
}

// candidates: [{ lease, monthTotal, owed }]; known: { labelKey: leaseId } from earlier imports.
export function scoreMatch(tx, cand, known) {
  let score = 0;
  const reasons = [];
  const text = ' ' + normalizeText(tx.label) + ' ';
  const hits = nameTokens(cand.lease).filter((w) => text.includes(' ' + w + ' '));
  if (hits.length) { score += Math.min(2, hits.length) * 40; reasons.push('name'); }
  const key = labelKey(tx.label);
  if (key && known[key] === cand.lease.id) { score += 60; reasons.push('history'); }
  if (tx.amount === cand.monthTotal) { score += 30; reasons.push('amount'); }
  else if (cand.owed > 0 && tx.amount === cand.owed) { score += 25; reasons.push('owed'); }
  else if (cand.monthTotal && Math.abs(tx.amount - cand.monthTotal) <= cand.monthTotal * 0.02) { score += 8; }
  return { score, reasons };
}

export function suggestLease(tx, candidates, known) {
  let best = null;
  for (const c of candidates) {
    const s = scoreMatch(tx, c, known);
    if (!best || s.score > best.score) best = { leaseId: c.lease.id, ...s };
  }
  if (!best || best.score < 30) return { leaseId: '', score: best ? best.score : 0, reasons: [] };
  return best;
}

// Payments typed in by hand that an incoming bank line probably repeats: same
// amount, at most `days` days apart, and the same lease when one is suggested.
// Each payment explains one line at most. Returns { fp: payment }.
export function manualDuplicates(txs, payments, suggested = {}, days = 7) {
  const manual = payments.filter((p) => !p.bankRef && p.method !== 'deposit');
  const used = new Set();
  const out = {};
  for (const tx of txs) {
    if (tx.amount <= 0) continue;
    const leaseId = suggested[tx.fp];
    const hit = manual.find((p) => !used.has(p.id) && p.amount === tx.amount
      && (!leaseId || p.leaseId === leaseId) && Math.abs(daysBetween(p.date, tx.date)) <= days);
    if (hit) { used.add(hit.id); out[tx.fp] = hit; }
  }
  return out;
}

// A transfer from the CAF (or the MSA): housing benefit paid straight to the
// landlord, so receipts can say who paid.
export function isHousingAidLabel(label) {
  return /(^| )(CAF|MSA|CNAF|APL)( |$)|ALLOC(ATION)? LOG/.test(normalizeText(label));
}

// Labels already used for a lease in earlier imports.
export function knownLabels(payments) {
  const known = {};
  for (const p of payments) if (p.bankLabel) { const k = labelKey(p.bankLabel); if (k) known[k] = p.leaseId; }
  return known;
}
