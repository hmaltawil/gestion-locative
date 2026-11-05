// Upcoming dates a landlord must not miss, plus calendar (.ics) export.
// Items carry an i18n key and params; the screen translates them.

import { addDays, addYears, periodOf } from './util.js';
import { indexationStatus, isActive, ledger } from './calc.js';
import { irlTable } from './irl.js';
import { addMonthsToDate, nextTermEnd, occupancyDays, departureStatement } from './charges.js';

export const DIAGNOSTICS = {
  dpe: { years: 10 },
  electricity: { years: 6 },
  gas: { years: 6 },
  erp: { months: 6 },
  lead: { years: 0 },
  asbestos: { years: 0 },
  surface: { years: 0 },
  other: { years: 0 },
};

export function defaultExpiry(type, date) {
  const d = DIAGNOSTICS[type] || DIAGNOSTICS.other;
  if (!date) return '';
  if (d.months) return addMonthsToDate(date, d.months);
  return d.years ? addYears(date, d.years) : '';
}

function names(lease) {
  return (lease.tenants || []).map((t) => t.name).filter(Boolean).join(' & ') || '—';
}

export function deadlines(state, today, horizonDays = 400) {
  const until = addDays(today, horizonDays);
  const items = [];
  const push = (it) => { if (it.date && it.date <= until) items.push(it); };
  const table = irlTable(state);
  const propOf = (id) => state.properties.find((p) => p.id === id);
  const propName = (id) => { const p = propOf(id); return p ? p.name || p.address : ''; };

  for (const l of state.leases) {
    const active = isActive(l, today);
    const href = `#/lease/${l.id}`;
    const base = { leaseId: l.id, propertyId: l.propertyId, href, who: names(l), where: propName(l.propertyId) };
    if (active) {
      const info = indexationStatus(l, propOf(l.propertyId), table, today);
      if (info && info.state === 'due') push({ ...base, id: `rev-${l.id}-${info.anniversary}`, kind: 'revision', date: info.anniversary, key: 'dl_revisionDue' });
      else if (info && info.state === 'waiting') push({ ...base, id: `rev-${l.id}-${info.anniversary}`, kind: 'revision', date: info.anniversary, key: 'dl_revisionWaiting', info: true });
      else if (info && info.next && info.state !== 'blocked') push({ ...base, id: `rev-${l.id}-${info.next}`, kind: 'revision', date: info.next, key: 'dl_revision' });

      if (l.insuranceUntil) push({ ...base, id: `ins-${l.id}-${l.insuranceUntil}`, kind: 'insurance', date: l.insuranceUntil, key: 'dl_insurance' });
      else push({ ...base, id: `ins-${l.id}-missing`, kind: 'insurance', date: today, key: 'dl_insuranceMissing', soft: true });

      if (l.startDate) {
        const t = nextTermEnd(l, today);
        if (t.noticeBy >= today) push({ ...base, id: `term-${l.id}-${t.termEnd}`, kind: 'term', date: t.noticeBy, key: 'dl_termNotice', params: { end: t.termEnd }, info: true });
        else push({ ...base, id: `term-${l.id}-${t.termEnd}`, kind: 'term', date: t.termEnd, key: 'dl_termEnd', info: true });
      }
    }
    // Charges reconciliation for last year.
    const y = Number(today.slice(0, 4)) - 1;
    if (l.chargesType !== 'forfait' && l.startDate <= `${y}-12-31` && occupancyDays(l, y) > 0 && !(l.regularizations && l.regularizations[y])) {
      push({ ...base, id: `reg-${l.id}-${y}`, kind: 'regularization', date: `${y + 1}-12-31`, key: 'dl_regularization', params: { year: y }, href: `#/regularize/${l.id}?year=${y}` });
    }
    // Deposit return after the tenant left.
    if (l.endDate && l.endDate <= addDays(today, 60) && (Number(l.deposit) || 0) > 0 && !(l.departure && l.departure.returnedOn)) {
      const dep = l.departure || {};
      const st = departureStatement(l, ledger(l, state.payments, today), dep, today);
      push({ ...base, id: `dep-${l.id}`, kind: 'deposit', date: st.deadline, key: 'dl_deposit', href: `#/departure/${l.id}` });
    }
  }

  for (const p of state.properties) {
    for (const d of p.diagnostics || []) {
      if (!d.expiry) continue;
      push({ id: `diag-${p.id}-${d.id}-${d.expiry}`, kind: 'diagnostic', date: d.expiry, key: 'dl_diagnostic', params: { type: d.type }, propertyId: p.id, href: `#/property/${p.id}`, where: p.name || p.address, who: '' });
    }
  }

  for (const r of state.reminders || []) {
    if (r.done) continue;
    push({ id: `rem-${r.id}-${r.date}`, kind: 'custom', date: r.date, title: r.title, reminderId: r.id, repeat: r.repeat, href: '#/deadlines', who: '', where: r.propertyId ? propName(r.propertyId) : '' });
  }

  for (const it of items) {
    it.overdue = it.date < today && !it.info;
    it.soon = !it.overdue && it.date <= addDays(today, 30);
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// ---------- calendar export ----------
function icsText(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Lines longer than 75 bytes are folded (RFC 5545), counting UTF-8 bytes.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n');
}

// events: [{ uid, date: 'YYYY-MM-DD', title, description }]
export function buildIcs(events, stamp) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//gestion-locative//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    const d = e.date.replace(/-/g, '');
    const next = addDays(e.date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@gestion-locative`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
      fold(`SUMMARY:${icsText(e.title)}`));
    if (e.description) lines.push(fold(`DESCRIPTION:${icsText(e.description)}`));
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsText(e.title)}`), 'TRIGGER:-P7D', 'END:VALARM');
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${icsText(e.title)}`), 'TRIGGER:PT9H', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map((l) => (l.includes('\r\n') ? l : fold(l))).join('\r\n') + '\r\n';
}

export { periodOf };
