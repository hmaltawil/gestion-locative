import {
  addMonths, addYears, esc, fmtDate, fmtMoney, fmtPeriod, fmtPeriodCap, moneyInput, parseMoney,
  periodOf, todayStr, uid, addDays,
} from './util.js';
import {
  correctRent, currentRent, dueDateFor, firstTrackedPeriod, indexationStatus, isActive, ledger, monthOverview, nextPayment, rentAt,
  rentCallBalance, rentEntryToCorrect, sortedRents,
} from './calc.js';
import { fetchInseeIrl, fmtIrlKey, irlKey, irlTable, latestIrlKey } from './irl.js';
import {
  allFileIds, askPersistentStorage, backupBlob, deleteFile, deleteSnapshot, emptyState, getFile, getSnapshot, listSnapshots,
  loadSecrets, loadState, normalize, parseBackup, putFile, putSnapshot, restoreFiles, saveSecrets, saveState,
} from './store.js';
import { counts as snapCounts, expiredTrash, needsDaily, toPrune } from './snapshots.js';
import { decryptBytes, decryptJson, encryptBytes, encryptJson, newKeySession } from './crypto.js';
import {
  DATA_PATH, SyncError, VERSIONS_PER_PAGE, checkRepo, docPath, getSha, listVersions, parseRepo, putFile as ghPut, readFile,
} from './sync.js';
import {
  deliver, departurePdf, depositReceiptPdf, formalNoticePdf, guarantorPdf, indexationPdf, newPdf, receiptPdf, regularizationPdf,
  reminderPdf, rentCallPdf, rentCertificatePdf, shareFile, taxSummaryPdf,
} from './docs.js';
import { guessMapping, isHousingAidLabel, knownLabels, manualDuplicates, parseCsv, suggestLease, toTransactions } from './bank.js';
import { departureStatement, depositSettlement, overlappingLeases, recoverableExpenses, regularization } from './charges.js';
import { LINE_2044, taxSummary, yearCsv } from './tax.js';
import { buildIcs, deadlines, defaultExpiry } from './deadlines.js';
import { anonymize } from './support.js';
import { setLang, t } from './i18n.js';

export const APP_VERSION = '1.3.6';

let state = emptyState();
const root = document.getElementById('app');
const today = () => todayStr();

// ---------------------------------------------------------------- data

async function persist() {
  try {
    await saveState(state);
  } catch (e) {
    toast(t('saveError'), 'error');
  }
}

function commit(fn) {
  fn(state);
  persist();
  render();
  afterChange();
}

const byId = (list, id) => list.find((x) => x.id === id);
const prop = (id) => byId(state.properties, id);
const leaseOf = (id) => byId(state.leases, id);

function propName(p) {
  return p ? (p.name || p.address || t('unnamedProperty')) : t('unknownProperty');
}

function tenantsLabel(lease) {
  const n = (lease.tenants || []).map((x) => x.name).filter(Boolean);
  return n.length ? n.join(' & ') : t('noTenantName');
}

function leasesFor(propertyId) {
  return state.leases.filter((l) => l.propertyId === propertyId);
}

function activeLeaseFor(propertyId) {
  return leasesFor(propertyId).find((l) => isActive(l, today()) && l.startDate <= addDays(today(), 60));
}

// ---------------------------------------------------------------- tiny UI kit

const ICONS = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/>',
  check: '<path d="M5 12.5 10 17 19 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  stack: '<path d="M8 3h9l3 3v12H8z"/><path d="M5 6v15h11"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  clip: '<path d="M20 11.5 12.2 19.3a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-7.8 7.8a1.7 1.7 0 0 1-2.4-2.4l7.1-7.1"/>',
};

function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

function page({ title, back, action, body }) {
  return `
    <header class="topbar">
      <div class="topbar-side">${back ? `<a class="icon-btn" href="${back}" aria-label="${esc(t('back'))}">${icon('back')}</a>` : ''}</div>
      <h1>${esc(title)}</h1>
      <div class="topbar-side right">${action || ''}</div>
    </header>
    <main class="content">${body}</main>`;
}

function addBtn(href) {
  return `<a class="icon-btn" href="${href}" aria-label="${esc(t('add'))}">${icon('plus')}</a>`;
}

const STATUS_CLASS = { paid: 'ok', partial: 'warn', unpaid: 'bad', upcoming: 'muted', late: 'bad' };
function pill(status, text) {
  return `<span class="pill ${STATUS_CLASS[status] || 'muted'}">${esc(text || t('status_' + status))}</span>`;
}

function field(label, input, hint) {
  return `<label class="field"><span class="label">${esc(label)}</span>${input}${hint ? `<span class="hint">${esc(hint)}</span>` : ''}</label>`;
}

function input(name, value = '', attrs = '') {
  return `<input name="${name}" value="${esc(value)}" ${attrs}>`;
}

function moneyField(label, name, cents, hint, attrs = '') {
  return field(label, `<div class="money-input"><input name="${name}" inputmode="decimal" value="${esc(moneyInput(cents))}" ${attrs}><span>€</span></div>`, hint);
}

function select(name, options, value, attrs = '') {
  return `<select name="${name}" ${attrs}>${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
}

function empty(text, cta) {
  return `<div class="empty"><p>${esc(text)}</p>${cta || ''}</div>`;
}

let toastTimer = null;
function toast(msg, kind = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast show ' + kind;
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, 2800);
}

// Bottom sheet used for quick forms and document pickers.
function openSheet(title, html, onMount) {
  closeSheet();
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.id = 'sheet';
  wrap.innerHTML = `<div class="sheet-backdrop" data-action="closeSheet"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button type="button" class="link" data-action="closeSheet">${esc(t('close'))}</button></div>
      <div class="sheet-body">${html}</div>
    </section>`;
  document.body.appendChild(wrap);
  document.body.classList.add('sheet-open');
  if (onMount) onMount(wrap);
}

function closeSheet() {
  const el = document.getElementById('sheet');
  if (el) el.remove();
  document.body.classList.remove('sheet-open');
}

// ---------------------------------------------------------------- router

function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  return { name: parts[0] || 'home', id: parts[1], query: new URLSearchParams(query) };
}

const TABS = [
  ['home', 'home', 'tabHome'],
  ['properties', 'building', 'tabProperties'],
  ['leases', 'key', 'tabLeases'],
  ['expenses', 'receipt', 'tabExpenses'],
  ['settings', 'gear', 'tabSettings'],
];
const TAB_OF = {
  home: 'home', properties: 'properties', property: 'properties', 'property-edit': 'properties',
  leases: 'leases', lease: 'leases', 'lease-new': 'leases', 'lease-edit': 'leases',
  expenses: 'expenses', 'expense-new': 'expenses', 'expense-edit': 'expenses', settings: 'settings',
  batch: 'home', import: 'home', deadlines: 'home', tax: 'expenses', regularize: 'leases', departure: 'leases',
};

function tabbar(active) {
  return `<nav class="tabbar">${TABS.map(([name, ic, label]) => `
    <a href="#/${name === 'home' ? '' : name}" class="${active === name ? 'active' : ''}">${icon(ic)}<span>${esc(t(label))}</span></a>`).join('')}</nav>`;
}

function render() {
  const r = route();
  const views = {
    home: viewHome,
    properties: viewProperties,
    property: viewProperty,
    'property-edit': viewPropertyForm,
    leases: viewLeases,
    lease: viewLease,
    'lease-new': viewLeaseForm,
    'lease-edit': viewLeaseForm,
    expenses: viewExpenses,
    'expense-new': viewExpenseForm,
    'expense-edit': viewExpenseForm,
    settings: viewSettings,
    batch: viewBatch,
    import: viewImport,
    deadlines: viewDeadlines,
    tax: viewTax,
    regularize: viewRegularize,
    departure: viewDeparture,
  };
  const view = views[r.name] || viewHome;
  const scroll = root.dataset.route === location.hash ? window.scrollY : 0;
  root.innerHTML = (isViewer() ? `<div class="support-bar">${esc(t('supportBar'))}</div>` : '') + view(r) + tabbar(TAB_OF[r.name] || 'home');
  root.dataset.route = location.hash;
  window.scrollTo(0, scroll);
  mountAfterRender(r);
}

// ---------------------------------------------------------------- home

function needsBackup() {
  if (!state.leases.length && !state.properties.length) return false;
  if (isViewer()) return false;
  const weekAgo = addDays(today(), -7);
  const m = gh() ? syncMeta() : null;
  if (m && m.lastOk && m.lastOk.slice(0, 10) >= weekAgo) return false; // the GitHub backup is working
  const last = state.settings.lastBackup;
  return !last || last < weekAgo;
}

function viewHome() {
  const td = today();
  if (!state.properties.length) {
    return page({
      title: t('appName'),
      body: `
        <section class="card welcome">
          <h2>${esc(t('welcomeTitle'))}</h2>
          <p>${esc(t('welcomeText'))}</p>
          <ol class="steps">
            <li><a href="#/settings">${esc(t('step1'))}</a></li>
            <li><a href="#/property-edit/new">${esc(t('step2'))}</a></li>
            <li>${esc(t('step3'))}</li>
          </ol>
        </section>
        <section class="card">
          <h3>${esc(t('restoreTitle'))}</h3>
          <p class="muted">${esc(t('restoreHint'))}</p>
          <button class="btn secondary" data-action="restore">${esc(t('restoreBtn'))}</button>
        </section>`,
    });
  }
  const ov = monthOverview(state, td);
  const table = irlTable(state);
  const revisions = state.leases
    .map((l) => ({ l, info: indexationStatus(l, prop(l.propertyId), table, td) }))
    .filter((x) => x.info && x.info.state === 'due');

  const order = (it) => (it.ledger.overdue > 0 ? 0 : it.row && it.row.status !== 'paid' ? 1 : 2);
  const items = [...ov.items].sort((a, b) => order(a) - order(b) || propName(prop(a.lease.propertyId)).localeCompare(propName(prop(b.lease.propertyId))));

  // Every row: status on top and amount below, then the action, so the
  // columns line up from one tenant to the next.
  const list = items.map(({ lease, ledger: led, row }) => {
    let status;
    let amount = '';
    if (led.overdue > 0) {
      status = pill('late');
      amount = `<span class="amount bad">${fmtMoney(led.overdue)}</span>`;
    } else if (row) {
      status = pill(row.status);
      amount = `<span class="amount">${fmtMoney(row.status === 'paid' ? row.total : row.total - row.paid)}</span>`;
    } else status = pill('upcoming', t('notStarted'));
    const showPay = led.owed > 0;
    return `<li class="row">
      <a class="row-main" href="#/lease/${lease.id}">
        <strong>${esc(tenantsLabel(lease))}</strong>
        <span class="muted">${esc(propName(prop(lease.propertyId)))}</span>
      </a>
      <div class="row-side">${status}${amount}</div>
      ${showPay ? `<button class="btn small" data-action="pay" data-lease="${lease.id}">${esc(t('recordPaymentShort'))}</button>` : `<span class="done">${icon('check')}</span>`}
    </li>`;
  }).join('');

  return page({
    title: fmtPeriodCap(ov.period, state.settings.lang),
    body: `
      ${safetyBanners()}
      ${needsBackup() ? `<div class="banner warn"><span>${esc(state.settings.lastBackup ? t('backupOld', { date: fmtDate(state.settings.lastBackup) }) : t('backupNever'))}</span><button class="btn small" data-action="backup">${esc(t('backupNow'))}</button></div>` : ''}
      ${!state.settings.landlord.name ? `<a class="banner" href="#/settings">${esc(t('missingLandlord'))}</a>` : ''}
      <div class="tiles">
        <div class="tile"><span class="tile-label">${esc(t('dueThisMonth'))}</span><span class="tile-value">${fmtMoney(ov.due)}</span></div>
        <div class="tile"><span class="tile-label">${esc(t('receivedThisMonth'))}</span><span class="tile-value">${fmtMoney(ov.received)}</span></div>
        <div class="tile ${ov.overdue > 0 ? 'bad' : ''}"><span class="tile-label">${esc(t('overdueTotal'))}</span><span class="tile-value">${fmtMoney(ov.overdue)}</span></div>
      </div>
      ${quickLinks()}
      ${homeDeadlines()}
      ${revisions.length ? `<section class="card"><h3>${esc(t('revisionsDue'))}</h3><ul class="list plain">${revisions.map(({ l, info }) => `
        <li><a class="row-link" href="#/lease/${l.id}"><span><strong>${esc(tenantsLabel(l))}</strong><br><span class="muted">${esc(t('revisionLine', { from: fmtMoney(info.currentRent), to: fmtMoney(info.newRent), pct: info.pct.toFixed(2) }))}</span></span>${icon('chevron')}</a></li>`).join('')}</ul></section>` : ''}
      <section class="card flush">
        <h3 class="pad">${esc(t('thisMonthRents'))}</h3>
        ${items.length ? `<ul class="list cols">${list}</ul>` : empty(t('noActiveLeases'), `<a class="btn" href="#/lease-new">${esc(t('addLease'))}</a>`)}
      </section>`,
  });
}

// ---------------------------------------------------------------- properties

const PROPERTY_TYPES = ['apartment', 'house', 'parking', 'commercial', 'other'];

function viewProperties() {
  const list = [...state.properties].sort((a, b) => propName(a).localeCompare(propName(b)));
  return page({
    title: t('tabProperties'),
    action: addBtn('#/property-edit/new'),
    body: list.length ? `<section class="card flush"><ul class="list">${list.map((p) => {
      const l = activeLeaseFor(p.id);
      return `<li><a class="row-link" href="#/property/${p.id}">
        <span><strong>${esc(propName(p))}</strong><br><span class="muted">${esc(t('ptype_' + (p.type || 'other')))}${p.city ? ' · ' + esc(p.city) : ''}</span></span>
        <span class="row-end">${l ? `<span class="muted small">${esc(tenantsLabel(l))}</span>` : pill('upcoming', t('vacant'))}${icon('chevron')}</span>
      </a></li>`;
    }).join('')}</ul></section>` : empty(t('noProperties'), `<a class="btn" href="#/property-edit/new">${esc(t('addProperty'))}</a>`),
  });
}

function viewProperty(r) {
  const p = prop(r.id);
  if (!p) return notFound();
  const leases = leasesFor(p.id).sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  const addr = [p.address, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return page({
    title: propName(p),
    back: '#/properties',
    action: `<a class="link" href="#/property-edit/${p.id}">${esc(t('edit'))}</a>`,
    body: `
      <section class="card">
        <dl class="facts">
          <dt>${esc(t('type'))}</dt><dd>${esc(t('ptype_' + (p.type || 'other')))}</dd>
          <dt>${esc(t('address'))}</dt><dd>${esc(addr || '—')}</dd>
          ${p.surface ? `<dt>${esc(t('surface'))}</dt><dd>${esc(p.surface)} m²</dd>` : ''}
          <dt>${esc(t('dpe'))}</dt><dd>${esc(p.dpe || t('unknown'))}</dd>
          ${p.notes ? `<dt>${esc(t('notes'))}</dt><dd class="pre">${esc(p.notes)}</dd>` : ''}
        </dl>
        ${p.dpe === 'F' || p.dpe === 'G' ? `<p class="note warn">${esc(t('dpeFrozen'))}</p>` : ''}
      </section>
      <section class="card flush">
        <div class="card-head pad"><h3>${esc(t('leases'))}</h3><a class="btn small" href="#/lease-new?property=${p.id}">${esc(t('newLease'))}</a></div>
        ${leases.length ? `<ul class="list">${leases.map((l) => `<li><a class="row-link" href="#/lease/${l.id}">
          <span><strong>${esc(tenantsLabel(l))}</strong><br><span class="muted">${esc(t('since', { date: fmtDate(l.startDate) }))}${l.endDate ? ' · ' + esc(t('until', { date: fmtDate(l.endDate) })) : ''}</span></span>
          <span class="row-end">${isActive(l, today()) ? pill('paid', t('active')) : pill('upcoming', t('ended'))}${icon('chevron')}</span></a></li>`).join('')}</ul>` : empty(t('noLeaseHere'))}
      </section>
      ${diagnosticsSection(p)}
      ${docsSection('property', p.id)}
      <button class="btn danger ghost" data-action="deleteProperty" data-id="${p.id}">${esc(t('deleteProperty'))}</button>`,
  });
}

function viewPropertyForm(r) {
  const isNew = r.id === 'new';
  const p = isNew ? { type: 'apartment' } : prop(r.id);
  if (!p) return notFound();
  return page({
    title: isNew ? t('addProperty') : t('editProperty'),
    back: isNew ? '#/properties' : `#/property/${p.id}`,
    body: `<form class="card form" data-form="property" data-id="${isNew ? '' : p.id}">
      ${field(t('propertyName'), input('name', p.name, `required placeholder="${esc(t('propertyNamePh'))}"`))}
      ${field(t('type'), select('type', PROPERTY_TYPES.map((x) => [x, t('ptype_' + x)]), p.type))}
      ${field(t('address'), input('address', p.address, 'autocomplete="street-address"'))}
      <div class="grid2">
        ${field(t('postalCode'), input('postalCode', p.postalCode, 'inputmode="numeric"'))}
        ${field(t('city'), input('city', p.city))}
      </div>
      <div class="grid2">
        ${field(t('surface'), input('surface', p.surface, 'inputmode="decimal"'))}
        ${field(t('dpe'), select('dpe', [['', t('unknown')], ...'ABCDEFG'.split('').map((x) => [x, x])], p.dpe || ''))}
      </div>
      ${field(t('notes'), `<textarea name="notes" rows="3">${esc(p.notes || '')}</textarea>`)}
      <button class="btn block" type="submit">${esc(t('save'))}</button>
    </form>`,
  });
}

// ---------------------------------------------------------------- leases

function viewLeases(r) {
  const showEnded = r.query.get('ended') === '1';
  const td = today();
  const list = state.leases
    .filter((l) => (showEnded ? !isActive(l, td) : isActive(l, td)))
    .sort((a, b) => propName(prop(a.propertyId)).localeCompare(propName(prop(b.propertyId))));
  return page({
    title: t('tabLeases'),
    action: addBtn('#/lease-new'),
    body: `
      <div class="segmented">
        <a href="#/leases" class="${showEnded ? '' : 'active'}">${esc(t('active'))}</a>
        <a href="#/leases?ended=1" class="${showEnded ? 'active' : ''}">${esc(t('ended'))}</a>
      </div>
      ${list.length ? `<section class="card flush"><ul class="list">${list.map((l) => {
        const led = ledger(l, state.payments, td);
        const cur = currentRent(l, td);
        const st = led.overdue > 0 ? pill('late', t('lateAmount', { amount: fmtMoney(led.overdue) })) : led.credit > 0 ? pill('paid', t('creditAmount', { amount: fmtMoney(led.credit) })) : pill('paid', t('upToDate'));
        return `<li><a class="row-link" href="#/lease/${l.id}">
          <span><strong>${esc(tenantsLabel(l))}</strong><br><span class="muted">${esc(propName(prop(l.propertyId)))} · ${fmtMoney(cur.rent + cur.charges)}</span></span>
          <span class="row-end">${st}${icon('chevron')}</span></a></li>`;
      }).join('')}</ul></section>` : empty(showEnded ? t('noEndedLeases') : t('noActiveLeases'), showEnded ? '' : `<a class="btn" href="#/lease-new">${esc(t('addLease'))}</a>`)}`,
  });
}

function viewLease(r) {
  const l = leaseOf(r.id);
  if (!l) return notFound();
  const td = today();
  const p = prop(l.propertyId);
  const led = ledger(l, state.payments, td);
  const cur = currentRent(l, td);
  const info = indexationStatus(l, p, irlTable(state), td);
  const showAll = r.query.get('all') === '1';
  const rows = [...led.rows].reverse();
  const shown = showAll ? rows : rows.slice(0, 12);
  const lang = state.settings.lang;

  let balance;
  if (led.overdue > 0) balance = `<div class="balance bad"><span>${esc(t('overdue'))}</span><strong>${fmtMoney(led.overdue)}</strong></div>`;
  else if (led.owed > 0) balance = `<div class="balance"><span>${esc(t('dueSoon'))}</span><strong>${fmtMoney(led.owed)}</strong></div>`;
  else if (led.credit > 0) balance = `<div class="balance ok"><span>${esc(t('credit'))}</span><strong>${fmtMoney(led.credit)}</strong></div>`;
  else balance = `<div class="balance ok"><span>${esc(t('upToDate'))}</span><strong>${icon('check')}</strong></div>`;

  let revision = '';
  if (info) {
    if (info.state === 'due') {
      revision = `<section class="card accent"><h3>${esc(t('revisionDueTitle'))}</h3>
        <p>${esc(t('revisionDueText', { date: fmtDate(info.anniversary), from: fmtMoney(info.currentRent), to: fmtMoney(info.newRent), pct: info.pct.toFixed(2) }))}</p>
        <p class="muted small">${esc(t('revisionDeadline', { date: fmtDate(info.deadline) }))}</p>
        <button class="btn" data-action="indexation" data-lease="${l.id}">${esc(t('reviewRevision'))}</button></section>`;
    } else if (info.state === 'blocked') {
      revision = `<p class="note warn">${esc(t('dpeFrozen'))}</p>`;
    } else if (info.state === 'waiting') {
      revision = `<p class="note">${esc(t('revisionWaiting', { date: fmtDate(info.anniversary) }))}</p>`;
    }
  }

  const ledgerList = shown.map((row) => `<li class="row">
      <div class="row-main"><strong>${esc(fmtPeriodCap(row.period, lang))}</strong>
        <span class="muted">${fmtMoney(row.total)}${row.prorata ? ' · ' + esc(t('prorata')) : ''}${row.paid > 0 && row.paid < row.total ? ' · ' + esc(t('paidAmount', { amount: fmtMoney(row.paid) })) : ''}</span></div>
      <div class="row-side">${pill(row.late ? (row.paid > 0 ? 'partial' : 'late') : row.status, row.late && row.paid === 0 ? t('status_late') : undefined)}</div>
      ${row.paid > 0 ? `<button class="icon-btn" data-action="receipt" data-lease="${l.id}" data-period="${row.period}" aria-label="${esc(t('receipt'))}">${icon('doc')}</button>` : '<span class="icon-btn-space"></span>'}
    </li>`).join('');

  const payments = [...led.payments].reverse();
  return page({
    title: tenantsLabel(l),
    back: '#/leases',
    action: `<a class="link" href="#/lease-edit/${l.id}">${esc(t('edit'))}</a>`,
    body: `
      <p class="subtitle"><a href="#/property/${p ? p.id : ''}">${esc(propName(p))}</a> · ${fmtMoney(cur.rent)} + ${fmtMoney(cur.charges)} ${esc(t('chargesShort'))}</p>
      ${!isActive(l, td) ? `<p class="note">${esc(t('leaseEndedOn', { date: fmtDate(l.endDate) }))}</p>` : ''}
      <section class="card">
        ${balance}
        <button class="btn block" data-action="pay" data-lease="${l.id}">${esc(t('recordPayment'))}</button>
      </section>
      <div class="actions">
        <button class="action" data-action="rentCall" data-lease="${l.id}">${icon('doc')}<span>${esc(t('rentCall'))}</span></button>
        <button class="action" data-action="receiptPicker" data-lease="${l.id}">${icon('receipt')}<span>${esc(t('receipt'))}</span></button>
        <button class="action${led.overdue > 0 ? '' : ' unavailable'}" data-action="reminder" data-lease="${l.id}">${icon('doc')}<span>${esc(t('reminder'))}</span></button>
        <button class="action${led.overdue > 0 ? '' : ' unavailable'}" data-action="notice" data-lease="${l.id}">${icon('doc')}<span>${esc(t('formalNotice'))}</span></button>
        <button class="action" data-action="letters" data-lease="${l.id}">${icon('stack')}<span>${esc(t('otherLetters'))}</span></button>
        ${l.chargesType !== 'forfait' ? `<a class="action" href="#/regularize/${l.id}">${icon('chart')}<span>${esc(t('regShort'))}</span></a>` : ''}
        <a class="action" href="#/departure/${l.id}">${icon('key')}<span>${esc(t('departureShort'))}</span></a>
      </div>
      ${revision}
      <section class="card flush">
        <h3 class="pad">${esc(t('monthByMonth'))}</h3>
        ${led.opening ? `<p class="pad muted small">${esc(t('openingLine', { amount: fmtMoney(led.opening.total), paid: fmtMoney(led.opening.paid) }))}</p>` : ''}
        ${shown.length ? `<ul class="list cols">${ledgerList}</ul>` : empty(t('noPeriodsYet'))}
        ${!showAll && rows.length > 12 ? `<a class="more" href="#/lease/${l.id}?all=1">${esc(t('showAll', { n: rows.length }))}</a>` : ''}
      </section>
      ${adjustmentsSection(l, led)}
      <section class="card flush">
        <h3 class="pad">${esc(t('payments'))}</h3>
        ${payments.length ? `<ul class="list">${payments.map((x) => `<li class="row">
          <div class="row-main"><strong>${fmtMoney(x.amount)}</strong><span class="muted">${fmtDate(x.date)}${x.method ? ' · ' + esc(t('method_' + x.method)) : ''}${x.note ? ' · ' + esc(x.note) : ''}</span></div>
          <button class="link danger" data-action="deletePayment" data-id="${x.id}">${esc(t('delete'))}</button></li>`).join('')}</ul>` : empty(t('noPayments'))}
      </section>
      <section class="card">
        <div class="card-head"><h3>${esc(t('leaseDetails'))}</h3><button class="btn small secondary" data-action="changeRent" data-lease="${l.id}">${esc(t('changeRent'))}</button></div>
        <dl class="facts">
          <dt>${esc(t('startDate'))}</dt><dd>${fmtDate(l.startDate)}</dd>
          ${l.endDate ? `<dt>${esc(t('endDate'))}</dt><dd>${fmtDate(l.endDate)}</dd>` : ''}
          <dt>${esc(t('paymentDay'))}</dt><dd>${esc(t('dayOfMonth', { day: l.paymentDay || 1 }))}</dd>
          <dt>${esc(t('chargesType'))}</dt><dd>${esc(t(l.chargesType === 'forfait' ? 'chargesForfait' : 'chargesProvision'))}</dd>
          ${l.deposit ? `<dt>${esc(t('deposit'))}</dt><dd>${fmtMoney(l.deposit)}</dd>` : ''}
          ${l.guarantor ? `<dt>${esc(t('guarantor'))}</dt><dd>${esc(l.guarantor)}</dd>` : ''}
          <dt>${esc(t('insuranceUntil'))}</dt><dd>${l.insuranceUntil ? fmtDate(l.insuranceUntil) : `<button class="link" data-action="insuranceUpdate" data-lease="${l.id}">${esc(t('setDate'))}</button>`}</dd>
          <dt>${esc(t('irlRef'))}</dt><dd>${l.irl && l.irl.quarter ? esc(t('irlRefValue', { q: l.irl.quarter, key: fmtIrlKey(l.irl.key, lang), value: l.irl.value })) : esc(t('none'))}</dd>
          ${l.lastRevision ? `<dt>${esc(t('lastRevision'))}</dt><dd>${fmtDate(l.lastRevision)}</dd>` : ''}
          ${(l.tenants || []).map((x) => `<dt>${esc(t('tenant'))}</dt><dd>${esc(x.name)}${x.email ? `<br><a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}${x.phone ? `<br><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : ''}</dd>`).join('')}
          ${l.notes ? `<dt>${esc(t('notes'))}</dt><dd class="pre">${esc(l.notes)}</dd>` : ''}
        </dl>
        <h4>${esc(t('rentHistory'))}</h4>
        <ul class="list plain compact">${sortedRents(l).reverse().map((x) => `<li><span>${esc(t('fromPeriod', { period: fmtPeriod(x.from, lang) }))}</span><span>${fmtMoney(x.rent)} + ${fmtMoney(x.charges)}${x.reason === 'indexation' ? ' · IRL' : ''}</span></li>`).join('')}</ul>
      </section>
      ${docsSection('lease', l.id)}
      <div class="danger-zone">
        <button class="btn danger ghost" data-action="deleteLease" data-id="${l.id}">${esc(t('deleteLease'))}</button>
      </div>`,
  });
}

function tenantRow(i, x = {}) {
  return `<div class="tenant-row" data-tenant>
    ${field(i === 0 ? t('tenantName') : t('coTenantName'), input('tenant_name', x.name, i === 0 ? 'required' : ''))}
    <div class="grid2">
      ${field(t('email'), input('tenant_email', x.email, 'type="email" autocomplete="off"'))}
      ${field(t('phone'), input('tenant_phone', x.phone, 'type="tel"'))}
    </div>
  </div>`;
}

function viewLeaseForm(r) {
  const isNew = r.name === 'lease-new';
  const td = today();
  const l = isNew
    ? { propertyId: r.query.get('property') || (state.properties[0] && state.properties[0].id), tenants: [{}], paymentDay: 1, chargesType: 'provision' }
    : leaseOf(r.id);
  if (!l) return notFound();
  if (!state.properties.length) {
    return page({ title: t('addLease'), back: '#/leases', body: empty(t('needPropertyFirst'), `<a class="btn" href="#/property-edit/new">${esc(t('addProperty'))}</a>`) });
  }
  const table = irlTable(state);
  const latest = latestIrlKey(table);
  const years = [];
  for (let y = Number(latest.slice(0, 4)); y >= 2015; y--) years.push([y, y]);
  // Editing an existing lease: its rent and charges in force today.
  const entry = isNew ? null : rentEntryToCorrect(l, td);
  const irlQ = l.irl ? l.irl.quarter : '';
  const irlY = l.irl && l.irl.key ? l.irl.key.slice(0, 4) : '';
  return page({
    title: isNew ? t('addLease') : t('editLease'),
    back: isNew ? '#/leases' : `#/lease/${l.id}`,
    body: `<form class="form" data-form="lease" data-id="${isNew ? '' : l.id}">
      <section class="card">
        <h3>${esc(t('propertyAndTenants'))}</h3>
        ${field(t('property'), select('propertyId', state.properties.map((p) => [p.id, propName(p)]), l.propertyId, 'required'))}
        <div id="tenants">${(l.tenants && l.tenants.length ? l.tenants : [{}]).map((x, i) => tenantRow(i, x)).join('')}</div>
        <button type="button" class="link" data-action="addTenantRow">+ ${esc(t('addCoTenant'))}</button>
        ${field(t('guarantor'), input('guarantor', l.guarantor, `placeholder="${esc(t('guarantorPh'))}"`))}
        ${field(t('insuranceUntil'), input('insuranceUntil', l.insuranceUntil, 'type="date"'), t('insuranceHint'))}
      </section>
      <section class="card">
        <h3>${esc(t('datesAndRent'))}</h3>
        <div class="grid2">
          ${field(t('startDate'), input('startDate', l.startDate, `type="date" required${isNew ? ' data-change="leaseStart"' : ''}`))}
          ${field(t('endDate'), input('endDate', l.endDate, 'type="date"'), t('endDateHint'))}
        </div>
        <div class="grid2">
          ${moneyField(t('rentHC'), 'rent', entry ? entry.rent : null, '', 'required')}
          ${moneyField(t('charges'), 'charges', entry ? entry.charges : 0)}
        </div>
        ${entry ? `<p class="hint">${esc(t('rentCorrectHint', { from: fmtPeriod(entry.from, state.settings.lang) }))}</p>` : ''}
        ${field(t('chargesType'), select('chargesType', [['provision', t('chargesProvision')], ['forfait', t('chargesForfait')]], l.chargesType))}
        <div class="grid2">
          ${field(t('paymentDay'), input('paymentDay', l.paymentDay || 1, 'type="number" min="1" max="28" inputmode="numeric"'))}
          ${moneyField(t('deposit'), 'deposit', l.deposit)}
        </div>
        <p class="hint">${esc(t('depositHint'))}</p>
      </section>
      <section class="card">
        <h3>${esc(t('revisionSection'))}</h3>
        <p class="hint">${esc(t('irlHint'))}</p>
        <div class="grid2">
          ${field(t('irlQuarter'), select('irlQuarter', [['', t('noRevision')], ['1', t('quarterN', { n: 1 })], ['2', t('quarterN', { n: 2 })], ['3', t('quarterN', { n: 3 })], ['4', t('quarterN', { n: 4 })]], irlQ))}
          ${field(t('irlYear'), select('irlYear', [['', '—'], ...years], irlY))}
        </div>
        <div class="grid2">
          ${field(t('revisionDate'), input('revisionDate', l.revisionDate ? `${td.slice(0, 4)}-${l.revisionDate}` : '', 'type="date"'), t('revisionDateHint'))}
          ${field(t('lastRevision'), input('lastRevision', l.lastRevision, 'type="date"'), t('lastRevisionHint'))}
        </div>
      </section>
      <section class="card">
        <h3>${esc(t('trackingSection'))}</h3>
        <p class="hint">${esc(t('trackingHint'))}</p>
        <div class="grid2">
          ${field(t('trackFrom'), input('trackFrom', isNew ? '' : (l.trackFrom || periodOf(l.startDate)), 'type="month"'))}
          ${moneyField(t('openingBalance'), 'openingBalance', isNew ? 0 : (Number(l.openingBalance) || 0), t('openingBalanceHint'))}
        </div>
      </section>
      <section class="card">
        ${field(t('notes'), `<textarea name="notes" rows="3">${esc(l.notes || '')}</textarea>`)}
      </section>
      <button class="btn block" type="submit">${esc(t('save'))}</button>
    </form>`,
  });
}

// ---------------------------------------------------------------- expenses

export const EXPENSE_CATEGORIES = ['management', 'insurance', 'works', 'propertyTax', 'teom', 'condo', 'loanInterest', 'loanInsurance', 'recoverable', 'other'];
const LINE_LABELS_FR = {
  221: "Frais d'administration et de gestion", 222: 'Autres frais de gestion (20 € par local)', 223: "Primes d'assurance",
  224: "Dépenses de réparation, d'entretien et d'amélioration", 227: 'Taxes foncières (hors TEOM)',
  229: 'Provisions pour charges de copropriété', 230: "Régularisation des provisions de copropriété déduites l'année précédente",
  250: "Intérêts et frais d'emprunt",
};

function viewExpenses(r) {
  const td = today();
  const year = r.query.get('year') || td.slice(0, 4);
  const pid = r.query.get('property') || '';
  const years = new Set([td.slice(0, 4), ...state.expenses.map((e) => e.date.slice(0, 4))]);
  const list = state.expenses
    .filter((e) => e.date.startsWith(year) && (!pid || e.propertyId === pid))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const totals = {};
  let total = 0;
  for (const e of list) { totals[e.category] = (totals[e.category] || 0) + e.amount; total += e.amount; }
  return page({
    title: t('tabExpenses'),
    action: addBtn(`#/expense-new${pid ? '?property=' + pid : ''}`),
    body: `
      <div class="filters">
        ${select('year', [...years].sort().reverse().map((y) => [y, y]), year, 'data-change="expenseYear"')}
        ${select('property', [['', t('allProperties')], ...state.properties.map((p) => [p.id, propName(p)])], pid, 'data-change="expenseProperty"')}
      </div>
      <section class="card">
        <div class="card-head"><h3>${esc(t('totalForYear', { year }))}</h3><strong>${fmtMoney(total)}</strong></div>
        ${Object.keys(totals).length ? `<ul class="list plain compact">${EXPENSE_CATEGORIES.filter((c) => totals[c]).map((c) => `<li><span>${esc(t('cat_' + c))}${LINE_2044[c] ? ` <span class="muted small">(${esc(t('line'))} ${LINE_2044[c]})</span>` : ''}</span><span>${fmtMoney(totals[c])}</span></li>`).join('')}</ul>
        <p class="hint">${esc(t('line2044Hint'))}</p>` : `<p class="muted">${esc(t('noExpensesYear'))}</p>`}
      </section>
      ${list.length ? `<section class="card flush"><ul class="list">${list.map((e) => `<li><a class="row-link" href="#/expense-edit/${e.id}">
        <span><strong>${esc(e.description || t('cat_' + e.category))}</strong><br><span class="muted">${fmtDate(e.date)} · ${esc(e.propertyId ? propName(prop(e.propertyId)) : t('general'))} · ${esc(t('cat_' + e.category))}</span></span>
        <span class="row-end"><span class="amount">${fmtMoney(e.amount)}</span>${icon('chevron')}</span></a></li>`).join('')}</ul></section>` : ''}`,
  });
}

function viewExpenseForm(r) {
  const isNew = r.name === 'expense-new';
  const e = isNew ? { date: today(), propertyId: r.query.get('property') || '', category: 'works' } : byId(state.expenses, r.id);
  if (!e) return notFound();
  return page({
    title: isNew ? t('addExpense') : t('editExpense'),
    back: '#/expenses',
    body: `<form class="card form" data-form="expense" data-id="${isNew ? '' : e.id}">
      ${field(t('description'), input('description', e.description, `placeholder="${esc(t('expenseDescPh'))}"`))}
      <div class="grid2">
        ${moneyField(t('amount'), 'amount', e.amount, '', 'required')}
        ${field(t('date'), input('date', e.date, 'type="date" required'))}
      </div>
      ${field(t('category'), select('category', EXPENSE_CATEGORIES.map((c) => [c, t('cat_' + c) + (LINE_2044[c] ? ` (${t('line')} ${LINE_2044[c]})` : '')]), e.category))}
      ${field(t('property'), select('propertyId', [['', t('general')], ...state.properties.map((p) => [p.id, propName(p)])], e.propertyId || ''))}
      <button class="btn block" type="submit">${esc(t('save'))}</button>
      ${isNew ? '' : `<button type="button" class="btn danger ghost block" data-action="deleteExpense" data-id="${e.id}">${esc(t('delete'))}</button>`}
    </form>
    ${isNew ? `<p class="hint">${esc(t('attachAfterSave'))}</p>` : docsSection('expense', e.id)}`,
  });
}

// ---------------------------------------------------------------- settings

function viewSettings() {
  const s = state.settings;
  const L = s.landlord;
  const table = irlTable(state);
  const latest = latestIrlKey(table);
  const recent = Object.keys(table).sort().reverse().slice(0, 4);
  return page({
    title: t('tabSettings'),
    body: `
      <section class="card">
        <h3>${esc(t('language'))}</h3>
        <div class="segmented">
          <button type="button" data-action="lang" data-lang="fr" class="${s.lang === 'fr' ? 'active' : ''}">Français</button>
          <button type="button" data-action="lang" data-lang="en" class="${s.lang === 'en' ? 'active' : ''}">English</button>
        </div>
        <p class="hint">${esc(t('docsAlwaysFrench'))}</p>
      </section>
      <section class="card">
        <h3>${esc(t('appearance'))}</h3>
        <div class="segmented">
          ${['light', 'dark', 'auto'].map((x) => `<button type="button" data-action="theme" data-theme="${x}" class="${(s.theme || 'light') === x ? 'active' : ''}">${esc(t('theme_' + x))}</button>`).join('')}
        </div>
        <p class="hint">${esc(t('themeHint'))}</p>
      </section>
      <form class="card form" data-form="landlord">
        <h3>${esc(t('landlordTitle'))}</h3>
        <p class="hint">${esc(t('landlordHint'))}</p>
        ${field(t('fullName'), input('name', L.name, 'autocomplete="name"'))}
        ${field(t('address'), input('address', L.address, 'autocomplete="street-address"'))}
        <div class="grid2">
          ${field(t('postalCode'), input('postalCode', L.postalCode, 'inputmode="numeric"'))}
          ${field(t('city'), input('city', L.city))}
        </div>
        <div class="grid2">
          ${field(t('email'), input('email', L.email, 'type="email"'))}
          ${field(t('phone'), input('phone', L.phone, 'type="tel"'))}
        </div>
        <button class="btn block" type="submit">${esc(t('save'))}</button>
      </form>
      <section class="card">
        <h3>${esc(t('signature'))}</h3>
        <p class="hint">${esc(t('signatureCardHint'))}</p>
        ${s.signature ? `<img class="sig-preview" src="${s.signature}" alt="${esc(t('signature'))}">` : `<p class="muted">${esc(t('noSignature'))}</p>`}
        <div class="btn-row">
          <button class="btn secondary" type="button" data-action="sigOpen">${esc(t(s.signature ? 'changeSignature' : 'addSignature'))}</button>
          ${s.signature ? `<button class="btn ghost danger" type="button" data-action="sigRemove">${esc(t('remove'))}</button>` : ''}
        </div>
      </section>
      <section class="card">
        <h3>${esc(t('irlTitle'))}</h3>
        <ul class="list plain compact">${recent.map((k) => `<li><span>${esc(fmtIrlKey(k, s.lang))}</span><span>${table[k].toFixed(2).replace('.', ',')}</span></li>`).join('')}</ul>
        <p class="hint">${esc(t('irlLatest', { key: fmtIrlKey(latest, s.lang) }))}${s.irlUpdated ? ' ' + esc(t('irlUpdatedOn', { date: fmtDate(s.irlUpdated) })) : ''}</p>
        <button class="btn secondary" data-action="irlUpdate">${esc(t('irlUpdate'))}</button>
      </section>
      ${githubCard()}
      <section class="card">
        <h3>${esc(t('backupTitle'))}</h3>
        <p class="hint">${esc(t('backupHint'))}</p>
        <p>${esc(s.lastBackup ? t('lastBackup', { date: fmtDate(s.lastBackup) }) : t('backupNever'))}</p>
        <div class="btn-row">
          <button class="btn" data-action="backup">${esc(t('backupNow'))}</button>
          <button class="btn secondary" data-action="restore">${esc(t('restoreBtn'))}</button>
        </div>
        <p class="hint">${esc(t('dataCounts', { p: state.properties.length, l: state.leases.length, pay: state.payments.length, e: state.expenses.length }))} · ${esc(t('docCount', { n: state.documents.length }))}</p>
      </section>
      ${snapshotsCard()}
      ${handoverCard()}
      <section class="card">
        <h3>${esc(t('about'))}</h3>
        <p class="hint">${esc(t('aboutText', { v: APP_VERSION }))}</p>
        <button class="btn danger ghost" data-action="wipe">${esc(t('wipe'))}</button>
      </section>`,
  });
}

function notFound() {
  return page({ title: t('notFound'), back: '#/', body: empty(t('notFoundText'), `<a class="btn" href="#/">${esc(t('tabHome'))}</a>`) });
}

// ================================================================ v1.1 features
// Screens that are not saved as they are edited keep their draft here.
const sessions = { import: null, reg: {}, dep: {} };

function quickLinks() {
  return `<div class="quick">
    <a class="quick-item" href="#/batch">${icon('stack')}<span>${esc(t('qBatch'))}</span></a>
    <a class="quick-item" href="#/import">${icon('bank')}<span>${esc(t('qImport'))}</span></a>
    <a class="quick-item" href="#/deadlines">${icon('calendar')}<span>${esc(t('qDeadlines'))}</span></a>
    <a class="quick-item" href="#/tax">${icon('chart')}<span>${esc(t('qTax'))}</span></a>
  </div>`;
}

// ---------- deadlines ----------
function dlTitle(it) {
  if (it.kind === 'custom') return it.title || t('reminder');
  const params = { ...(it.params || {}) };
  if (params.end) params.end = fmtDate(params.end);
  if (params.type) params.type = t('diag_' + params.type);
  return t(it.key, params);
}

function dlSub(it) {
  return [it.who && it.who !== '—' ? it.who : '', it.where].filter(Boolean).join(' · ');
}

function dlRow(it) {
  const cls = it.overdue ? 'bad' : it.soon ? 'warn' : 'muted';
  const when = it.soft ? '' : `<span class="pill ${cls}">${fmtDate(it.date)}</span>`;
  let acts = '';
  if (it.kind === 'insurance') acts = `<button class="btn small secondary" data-action="insuranceUpdate" data-lease="${it.leaseId}">${esc(t('update'))}</button>`;
  if (it.kind === 'custom') acts = `<button class="btn small secondary" data-action="reminderDone" data-id="${it.reminderId}">${esc(t('done'))}</button>`;
  return `<li class="row">
    <a class="row-main" href="${it.href}"><strong class="wrap">${esc(dlTitle(it))}</strong><span class="muted">${esc(dlSub(it))}</span></a>
    <div class="row-side">${when}</div>${acts || '<span></span>'}
  </li>`;
}

function homeDeadlines() {
  const items = deadlines(state, today())
    .filter((i) => !i.soft && (i.overdue || i.soon) && i.key !== 'dl_revisionDue')
    .slice(0, 5);
  if (!items.length) return '';
  return `<section class="card flush"><div class="card-head pad"><h3>${esc(t('upcomingDeadlines'))}</h3><a class="small" href="#/deadlines">${esc(t('seeAll'))}</a></div>
    <ul class="list cols">${items.map(dlRow).join('')}</ul></section>`;
}

function viewDeadlines() {
  const items = deadlines(state, today());
  const groups = [
    ['dlOverdue', items.filter((i) => i.overdue && !i.soft)],
    ['dlSoon', items.filter((i) => i.soon && !i.soft)],
    ['dlLater', items.filter((i) => !i.overdue && !i.soon && !i.soft)],
    ['dlSetup', items.filter((i) => i.soft)],
  ];
  const custom = (state.reminders || []).filter((r) => !r.done);
  return page({
    title: t('qDeadlines'),
    back: '#/',
    body: `
      <div class="btn-row spaced">
        <button class="btn secondary" data-action="addReminder">${icon('plus')} ${esc(t('addReminder'))}</button>
        <button class="btn secondary" data-action="exportIcs">${icon('calendar')} ${esc(t('addToCalendar'))}</button>
      </div>
      <p class="hint">${esc(t('icsHint'))}</p>
      ${groups.filter(([, list]) => list.length).map(([k, list]) => `<section class="card flush"><h3 class="pad">${esc(t(k))}</h3><ul class="list cols">${list.map(dlRow).join('')}</ul></section>`).join('') || empty(t('noDeadlines'))}
      ${custom.length ? `<section class="card flush"><h3 class="pad">${esc(t('myReminders'))}</h3><ul class="list">${custom.map((r) => `<li class="row">
        <div class="row-main"><strong>${esc(r.title)}</strong><span class="muted">${fmtDate(r.date)}${r.repeat === 'yearly' ? ' · ' + esc(t('everyYear')) : ''}</span></div>
        <button class="link danger" data-action="reminderDelete" data-id="${r.id}">${esc(t('delete'))}</button></li>`).join('')}</ul></section>` : ''}`,
  });
}

function nextOccurrence(mmdd) {
  const td = today();
  let d = `${td.slice(0, 4)}-${mmdd}`;
  if (d < td) d = addYears(d, 1);
  return d;
}

function reminderSheet() {
  const presets = [
    [t('presetPropertyTax'), nextOccurrence('10-15')],
    [t('presetTaxReturn'), nextOccurrence('05-20')],
    [t('presetInsurance'), ''],
  ];
  openSheet(t('addReminder'), `<form class="form" data-form="reminder">
    <div class="chips">${presets.map(([title, date]) => `<button type="button" class="chip" data-action="fillReminder" data-title="${esc(title)}" data-date="${date}">${esc(title)}</button>`).join('')}</div>
    ${field(t('title'), input('title', '', 'required'))}
    ${field(t('date'), input('date', '', 'type="date" required'))}
    ${field(t('property'), select('propertyId', [['', t('general')], ...state.properties.map((p) => [p.id, propName(p)])], ''))}
    <label class="check"><input type="checkbox" name="yearly" checked> ${esc(t('everyYear'))}</label>
    <button class="btn block" type="submit">${esc(t('save'))}</button>
  </form>`);
}

function insuranceSheet(leaseId) {
  const l = leaseOf(leaseId);
  const base = l.insuranceUntil && l.insuranceUntil > today() ? l.insuranceUntil : today();
  openSheet(t('insuranceTitle'), `<form class="form" data-form="insurance" data-lease="${l.id}">
    <p class="muted">${esc(tenantsLabel(l))}</p>
    <p class="hint">${esc(t('insuranceHint'))}</p>
    ${field(t('insuranceUntil'), input('until', addYears(base, l.insuranceUntil ? 1 : 0), 'type="date" required'))}
    <button class="btn block" type="submit">${esc(t('save'))}</button>
  </form>`);
}

// ---------- monthly batch ----------
function batchDoc(type, l, period, into) {
  if (type === 'rentCall') return rentCallPdf(state, l, rentCallBalance(l, state.payments, period, today()), into);
  const row = ledger(l, state.payments, today()).rows.find((x) => x.period === period);
  return row && row.paid > 0 ? receiptPdf(state, l, row, into) : null;
}

function leasesInPeriod(period) {
  return state.leases
    .filter((l) => periodOf(l.startDate) <= period && (!l.endDate || periodOf(l.endDate) >= period))
    .sort((a, b) => propName(prop(a.propertyId)).localeCompare(propName(prop(b.propertyId))));
}

function viewBatch(r) {
  const td = today();
  const cur = periodOf(td);
  const type = r.query.get('type') === 'rentCall' ? 'rentCall' : 'receipt';
  const def = type === 'receipt' ? cur : (Number(td.slice(8)) >= 15 ? addMonths(cur, 1) : cur);
  const period = r.query.get('period') || def;
  const options = [-3, -2, -1, 0, 1].map((n) => addMonths(cur, n));
  if (!options.includes(period)) options.push(period);
  const lang = state.settings.lang;
  const list = leasesInPeriod(period);
  let ready = 0;
  const rows = list.map((l) => {
    const key = `${type}:${l.id}:${period}`;
    const sent = state.sent[key];
    let status = '';
    let btn = '';
    if (type === 'receipt') {
      const row = ledger(l, state.payments, td).rows.find((x) => x.period === period);
      if (!row) status = pill('upcoming', t('notTracked'));
      else if (row.paid >= row.total && row.total > 0) { status = pill('paid'); btn = 'send'; ready++; }
      else if (row.paid > 0) { status = pill('partial'); btn = 'partial'; }
      else status = pill(row.late ? 'late' : 'unpaid', row.late ? t('status_late') : undefined);
    } else { btn = 'send'; ready++; }
    const email = (l.tenants || []).map((x) => x.email).filter(Boolean)[0];
    return `<li class="row">
      <div class="row-main"><strong>${esc(tenantsLabel(l))}</strong><span class="muted">${esc(propName(prop(l.propertyId)))}${email ? '' : ' · ' + esc(t('noEmailShort'))}</span>
      ${sent ? `<span class="ok-text small">${icon('check', 'tiny')} ${esc(t('sentOn', { date: fmtDate(sent) }))}</span>` : ''}</div>
      <div class="row-side">${status}</div>
      ${btn ? `<button class="btn small${sent ? ' secondary' : ''}" data-action="batchSend" data-type="${type}" data-lease="${l.id}" data-period="${period}">${esc(btn === 'partial' ? t('partialShort') : t('send'))}</button>` : '<span class="icon-btn-space"></span>'}
    </li>`;
  }).join('');
  return page({
    title: t('qBatch'),
    back: '#/',
    body: `
      <div class="segmented">
        <a href="#/batch?type=receipt&period=${period}" class="${type === 'receipt' ? 'active' : ''}">${esc(t('receipts'))}</a>
        <a href="#/batch?type=rentCall&period=${addMonths(cur, Number(td.slice(8)) >= 15 ? 1 : 0)}" class="${type === 'rentCall' ? 'active' : ''}">${esc(t('rentCalls'))}</a>
      </div>
      <div class="filters one">${select('period', options.sort().map((p) => [p, fmtPeriodCap(p, lang)]), period, `data-change="batchPeriod" data-type="${type}"`)}</div>
      <p class="hint">${esc(t('batchHint'))}</p>
      <section class="card flush">${list.length ? `<ul class="list cols">${rows}</ul>` : empty(t('noActiveLeases'))}</section>
      ${ready ? `<button class="btn block secondary" data-action="batchAll" data-type="${type}" data-period="${period}">${icon('doc')} ${esc(t('allInOne', { n: ready }))}</button>` : ''}`,
  });
}

// ---------- bank import ----------
async function readText(file) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch (e) {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function importCandidates() {
  const td = today();
  return state.leases
    .filter((l) => isActive(l, addDays(td, -120)))
    .map((l) => {
      const cur = currentRent(l, td);
      return { lease: l, monthTotal: cur.rent + cur.charges, owed: ledger(l, state.payments, td).owed };
    });
}

function rebuildImport() {
  const s = sessions.import;
  s.txs = toTransactions(s.rows, s.map);
  const known = knownLabels(state.payments);
  const cands = importCandidates();
  const done = new Set(state.payments.map((p) => p.bankRef).filter(Boolean));
  const fresh = [];
  for (const tx of s.txs) {
    if (tx.amount <= 0 || s.choices[tx.fp]) continue;
    const dup = done.has(tx.fp);
    const sug = suggestLease(tx, cands, known);
    s.choices[tx.fp] = { leaseId: sug.leaseId, on: !dup && sug.score >= 50, dup, score: sug.score };
    if (!dup) fresh.push(tx);
  }
  // A payment already typed in by hand: suggest the line, but leave it unticked.
  const suggested = Object.fromEntries(fresh.map((tx) => [tx.fp, s.choices[tx.fp].leaseId]));
  const manual = manualDuplicates(fresh, state.payments, suggested);
  for (const [fp, p] of Object.entries(manual)) {
    const c = s.choices[fp];
    c.maybe = { date: p.date, leaseId: p.leaseId };
    c.on = false;
    if (!c.leaseId) c.leaseId = p.leaseId;
  }
}

function viewImport() {
  const s = sessions.import;
  if (!s) {
    return page({
      title: t('qImport'),
      back: '#/',
      body: `<section class="card">
        <h3>${esc(t('importTitle'))}</h3>
        <p>${esc(t('importIntro'))}</p>
        <p class="hint">${esc(t('importPrivacy'))}</p>
        <button class="btn block" data-action="importPick">${esc(t('chooseCsv'))}</button>
      </section>`,
    });
  }
  const header = s.map.headerRow >= 0 ? s.rows[s.map.headerRow] : (s.rows[0] || []).map((_, i) => `${t('column')} ${i + 1}`);
  const colOpts = [['-1', '—'], ...header.map((h, i) => [String(i), `${i + 1}. ${h || t('column') + ' ' + (i + 1)}`.slice(0, 40)])];
  const credits = s.txs.filter((x) => x.amount > 0);
  const debits = s.txs.length - credits.length;
  const leaseOpts = [['', t('ignore')], ...state.leases.map((l) => [l.id, `${tenantsLabel(l)} · ${propName(prop(l.propertyId))}`])];
  let nOn = 0;
  let sum = 0;
  const rows = credits.map((tx) => {
    const c = s.choices[tx.fp] || {};
    if (c.on && c.leaseId && !c.dup) { nOn++; sum += tx.amount; }
    return `<li class="imp-row${c.dup ? ' dup' : ''}">
      <label class="imp-check"><input type="checkbox" data-change="impToggle" data-fp="${esc(tx.fp)}" ${c.on && !c.dup ? 'checked' : ''} ${c.dup ? 'disabled' : ''}></label>
      <div class="imp-main">
        <div class="imp-top"><strong>${fmtMoney(tx.amount)}${isHousingAidLabel(tx.label) ? ` <span class="pill">${esc(t('method_caf'))}</span>` : ''}</strong><span class="muted small">${fmtDate(tx.date)}</span></div>
        <div class="muted small imp-label">${esc(tx.label)}</div>
        ${c.dup ? `<span class="pill muted">${esc(t('alreadyImported'))}</span>` : select('lease', leaseOpts, c.leaseId || '', `data-change="impLease" data-fp="${esc(tx.fp)}"`)}
        ${c.maybe ? `<p class="note warn small">${esc(t('importMaybeDup', { date: fmtDate(c.maybe.date), who: tenantsLabel(leaseOf(c.maybe.leaseId) || {}) }))}</p>` : ''}
      </div>
    </li>`;
  }).join('');
  return page({
    title: t('qImport'),
    back: '#/',
    body: `
      <section class="card">
        <div class="card-head"><h3>${esc(s.fileName)}</h3><button class="link" data-action="importReset">${esc(t('otherFile'))}</button></div>
        <p class="hint">${esc(t('importFound', { n: s.txs.length, c: credits.length, d: debits }))}</p>
        <details ${s.txs.length ? '' : 'open'}><summary>${esc(t('columns'))}</summary>
          <div class="grid2">
            ${field(t('colDate'), select('date', colOpts, s.map.date, 'data-change="impMap" data-k="date"'))}
            ${field(t('colLabel'), select('label', colOpts, s.map.label, 'data-change="impMap" data-k="label"'))}
            ${field(t('colAmount'), select('amount', colOpts, s.map.amount, 'data-change="impMap" data-k="amount"'))}
            ${field(t('colCredit'), select('credit', colOpts, s.map.credit, 'data-change="impMap" data-k="credit"'))}
            ${field(t('colDebit'), select('debit', colOpts, s.map.debit, 'data-change="impMap" data-k="debit"'))}
            ${field(t('headerRow'), select('headerRow', [['-1', t('none')], ...s.rows.slice(0, 15).map((row, i) => [String(i), `${i + 1}. ${row.join(' | ')}`.slice(0, 40)])], s.map.headerRow, 'data-change="impMap" data-k="headerRow"'))}
          </div>
        </details>
      </section>
      ${credits.length && !credits.some((x) => (s.choices[x.fp] || {}).leaseId) ? `<p class="note">${esc(t('importNoMatch', { n: credits.length }))}</p>` : ''}
      ${credits.length ? `<p class="hint">${esc(t('importMatchHint'))}</p><section class="card flush"><ul class="list imp-list">${rows}</ul></section>` : empty(t('importNothing'))}
      ${nOn ? `<div class="sticky-cta"><button class="btn block" data-action="importApply">${esc(t('importApply', { n: nOn, amount: fmtMoney(sum) }))}</button></div>` : ''}`,
  });
}

// ---------- charges reconciliation ----------
function firstDueAfter(l, date) {
  let p = periodOf(date);
  if (dueDateFor(l, p) < date) p = addMonths(p, 1);
  return dueDateFor(l, p);
}

function viewRegularize(r) {
  const l = leaseOf(r.id);
  if (!l) return notFound();
  const td = today();
  const year = Number(r.query.get('year') || Number(td.slice(0, 4)) - 1);
  const key = `${l.id}:${year}`;
  if (!sessions.reg[key]) {
    sessions.reg[key] = {
      lines: recoverableExpenses(state, l.propertyId, year).map((x) => ({ label: x.label, amount: x.amount })),
      dueDate: firstDueAfter(l, addDays(td, 30)),
      updateProvision: isActive(l, td),
    };
  }
  const ses = sessions.reg[key];
  const reg = regularization(l, year, ses.lines);
  if (ses.newMonthly === undefined) ses.newMonthly = reg.suggestedMonthly;
  const done = l.regularizations && l.regularizations[year];
  const years = [];
  for (let y = Number(td.slice(0, 4)); y >= Number(l.startDate.slice(0, 4)); y--) years.push([y, y]);
  const cur = currentRent(l, td);
  let balance;
  if (reg.balance > 0) balance = `<div class="balance bad"><span>${esc(t('tenantOwes'))}</span><strong>${fmtMoney(reg.balance)}</strong></div>`;
  else if (reg.balance < 0) balance = `<div class="balance ok"><span>${esc(t('refundTenant'))}</span><strong>${fmtMoney(-reg.balance)}</strong></div>`;
  else balance = `<div class="balance"><span>${esc(t('balanced'))}</span><strong>${fmtMoney(0)}</strong></div>`;
  return page({
    title: t('regTitle'),
    back: `#/lease/${l.id}`,
    body: `
      <p class="subtitle">${esc(tenantsLabel(l))} · ${esc(propName(prop(l.propertyId)))}</p>
      ${l.chargesType === 'forfait' ? `<p class="note warn">${esc(t('regForfait'))}</p>` : ''}
      ${overlappingLeases(state.leases, l, year).length ? `<p class="note warn">${esc(t('regOverlap', { year }))}</p>` : ''}
      ${done ? `<div class="note ok">${esc(t('regDone', { date: fmtDate(done.date), amount: fmtMoney(done.balance) }))} <button class="link danger" data-action="regUndo" data-lease="${l.id}" data-year="${year}">${esc(t('undo'))}</button></div>` : ''}
      <div class="filters one">${select('year', years, year, `data-change="regYear" data-lease="${l.id}"`)}</div>
      <section class="card">
        <div class="card-head"><h3>${esc(t('actualCharges', { year }))}</h3><button class="link" data-action="regReload" data-key="${key}">${esc(t('reloadExpenses'))}</button></div>
        <p class="hint">${esc(t('regLinesHint'))}</p>
        ${ses.lines.map((x, i) => `<div class="line-edit">
          <input value="${esc(x.label)}" placeholder="${esc(t('label'))}" data-change="regLine" data-key="${key}" data-i="${i}" data-f="label">
          <div class="money-input"><input inputmode="decimal" value="${esc(moneyInput(x.amount))}" data-change="regLine" data-key="${key}" data-i="${i}" data-f="amount"><span>€</span></div>
          <button class="icon-btn danger-text" data-action="regLineDel" data-key="${key}" data-i="${i}" aria-label="${esc(t('delete'))}">×</button>
        </div>`).join('')}
        <button class="link" data-action="regLineAdd" data-key="${key}">+ ${esc(t('addLine'))}</button>
      </section>
      <section class="card">
        <dl class="facts">
          <dt>${esc(t('totalActual'))}</dt><dd>${fmtMoney(reg.actualTotal)}</dd>
          ${reg.share < 1 ? `<dt>${esc(t('occupancy'))}</dt><dd>${esc(t('daysOf', { d: reg.days, n: reg.yearDays }))}</dd><dt>${esc(t('tenantShare'))}</dt><dd>${fmtMoney(reg.tenantShare)}</dd>` : ''}
          <dt>${esc(t('provisionsBilled'))}</dt><dd>${fmtMoney(reg.provisions)}</dd>
        </dl>
        <div class="spacer"></div>
        ${balance}
      </section>
      <form class="card form" data-form="regApply" data-lease="${l.id}" data-year="${year}" data-key="${key}">
        ${reg.balance !== 0 ? field(reg.balance > 0 ? t('payBy') : t('creditOn'), input('dueDate', ses.dueDate, `type="date" required data-change="regOpt" data-key="${key}" data-f="dueDate"`)) : ''}
        ${isActive(l, td) ? `<label class="check"><input type="checkbox" name="updateProvision" ${ses.updateProvision ? 'checked' : ''} data-change="regOpt" data-key="${key}" data-f="updateProvision"> ${esc(t('updateProvision', { cur: fmtMoney(cur.charges) }))}</label>
        ${ses.updateProvision ? `<div class="grid2">${moneyField(t('newMonthlyCharges'), 'newMonthly', ses.newMonthly, '', `data-change="regOpt" data-key="${key}" data-f="newMonthly"`)}${field(t('fromMonth'), input('newFrom', ses.newFrom || periodOf(ses.dueDate), `type="month" data-change="regOpt" data-key="${key}" data-f="newFrom"`))}</div>` : ''}` : ''}
        <div class="btn-row">
          <button type="button" class="btn secondary" data-action="regLetter" data-lease="${l.id}" data-year="${year}" data-key="${key}">${icon('doc')} ${esc(t('letterPdf'))}</button>
          <button type="submit" class="btn" ${done ? 'disabled' : ''}>${esc(t('regApply'))}</button>
        </div>
        <p class="hint">${esc(t('regLegal'))}</p>
      </form>`,
  });
}

// ---------- departure ----------
function departureSession(l) {
  if (!sessions.dep[l.id]) {
    const dep = l.departure || {};
    sessions.dep[l.id] = {
      keysDate: dep.keysDate || l.endDate || today(),
      inventoryMatches: dep.inventoryMatches !== false,
      deductions: (dep.deductions || []).map((x) => ({ ...x })),
      retention: dep.retention || 0,
      newAddress: dep.newAddress || '',
    };
  }
  return sessions.dep[l.id];
}

function departureData(l) {
  const ses = departureSession(l);
  const tmp = { ...l, endDate: ses.keysDate };
  const led = ledger(tmp, state.payments, today());
  // Once the deposit is returned the ledger already includes the deductions,
  // so show the statement as it was at that moment.
  if (l.departure && l.departure.returnedOn && l.departure.statement) return { ses, tmp, led, st: l.departure.statement };
  const st = departureStatement(tmp, led, { ...ses, returnedOn: l.departure && l.departure.returnedOn }, today());
  return { ses, tmp, led, st };
}

function viewDeparture(r) {
  const l = leaseOf(r.id);
  if (!l) return notFound();
  const td = today();
  const { ses, st } = departureData(l);
  const dep = l.departure || {};
  const saved = l.endDate && l.endDate === ses.keysDate && dep.keysDate;
  const returned = dep.returnedOn;
  return page({
    title: t('departureTitle'),
    back: `#/lease/${l.id}`,
    body: `
      <p class="subtitle">${esc(tenantsLabel(l))} · ${esc(propName(prop(l.propertyId)))}</p>
      ${returned ? `<div class="note ok">${esc(t('depositReturnedOn', { date: fmtDate(returned), amount: fmtMoney(dep.returnedAmount || 0) }))}</div>` : ''}
      <fieldset class="card form" ${returned ? 'disabled' : ''}>
        <h3>${esc(t('moveOut'))}</h3>
        ${field(t('keysDate'), input('keysDate', ses.keysDate, `type="date" data-change="depField" data-lease="${l.id}" data-f="keysDate"`), t('keysDateHint'))}
        <label class="check"><input type="checkbox" ${ses.inventoryMatches ? 'checked' : ''} data-change="depField" data-lease="${l.id}" data-f="inventoryMatches"> ${esc(t('inventoryMatches'))}</label>
        ${field(t('newAddress'), input('newAddress', ses.newAddress, `data-change="depField" data-lease="${l.id}" data-f="newAddress"`))}
        ${saved ? '' : `<button class="btn block" data-action="depSave" data-lease="${l.id}">${esc(t('endLeaseOn', { date: fmtDate(ses.keysDate) }))}</button>`}
      </fieldset>
      <fieldset class="card" ${returned ? 'disabled' : ''}>
        <h3>${esc(t('deductions'))}</h3>
        <p class="hint">${esc(t('deductionsHint'))}</p>
        ${ses.deductions.map((x, i) => `<div class="line-edit">
          <input value="${esc(x.label)}" placeholder="${esc(t('label'))}" data-change="depDed" data-lease="${l.id}" data-i="${i}" data-f="label">
          <div class="money-input"><input inputmode="decimal" value="${esc(moneyInput(x.amount))}" data-change="depDed" data-lease="${l.id}" data-i="${i}" data-f="amount"><span>€</span></div>
          <button class="icon-btn danger-text" data-action="depDedDel" data-lease="${l.id}" data-i="${i}" aria-label="${esc(t('delete'))}">×</button>
        </div>`).join('')}
        <button class="link" data-action="depDedAdd" data-lease="${l.id}">+ ${esc(t('addDeduction'))}</button>
        <div class="spacer"></div>
        ${moneyField(t('retention'), 'retention', ses.retention, t('retentionHint', { max: fmtMoney(st.maxRetention) }), `data-change="depField" data-lease="${l.id}" data-f="retention"`)}
      </fieldset>
      <section class="card">
        <h3>${esc(t('statement'))}</h3>
        <dl class="facts">
          <dt>${esc(t('deposit'))}</dt><dd>${fmtMoney(st.deposit)}</dd>
          ${st.credit ? `<dt>${esc(t('credit'))}</dt><dd>+ ${fmtMoney(st.credit)}</dd>` : ''}
          <dt>${esc(t('arrears'))}</dt><dd>- ${fmtMoney(st.arrears)}</dd>
          <dt>${esc(t('deductions'))}</dt><dd>- ${fmtMoney(st.deductions)}</dd>
          ${st.retention ? `<dt>${esc(t('retentionShort'))}</dt><dd>- ${fmtMoney(st.retention)}</dd>` : ''}
          ${st.penalty ? `<dt>${esc(t('penaltyShort'))}</dt><dd>+ ${fmtMoney(st.penalty)}</dd>` : ''}
        </dl>
        <div class="spacer"></div>
        ${st.stillOwed > 0 ? `<div class="balance bad"><span>${esc(t('tenantStillOwes'))}</span><strong>${fmtMoney(st.stillOwed)}</strong></div>` : `<div class="balance ok"><span>${esc(t('toReturn'))}</span><strong>${fmtMoney(st.toReturn)}</strong></div>`}
        <p class="${!returned && td > st.deadline ? 'note warn' : 'hint'}">${esc(t('depositDeadline', { date: fmtDate(st.deadline), months: ses.inventoryMatches ? 1 : 2 }))}${!returned && st.penalty ? ' ' + esc(t('latePenalty', { n: st.lateMonths, amount: fmtMoney(st.penalty) })) : ''}</p>
        ${ses.keysDate > td ? `<p class="hint">${esc(t('futureDepartureHint'))}</p>` : ''}
        <div class="btn-row">
          <button class="btn secondary" data-action="depPdf" data-lease="${l.id}">${icon('doc')} ${esc(t('statementPdf'))}</button>
          ${saved && !returned ? `<button class="btn" data-action="depReturned" data-lease="${l.id}">${esc(t('markReturned'))}</button>` : ''}
        </div>
      </section>`,
  });
}

function depReturnedSheet(leaseId) {
  const l = leaseOf(leaseId);
  const { st } = departureData(l);
  openSheet(t('markReturned'), `<form class="form" data-form="depReturned" data-lease="${l.id}">
    <p class="hint">${esc(t('markReturnedHint'))}</p>
    ${st.penalty ? `<p class="note warn">${esc(t('returnIncludesPenalty', { amount: fmtMoney(st.penalty) }))}</p>` : ''}
    <div class="grid2">
      ${field(t('date'), input('date', today(), 'type="date" required'))}
      ${moneyField(t('amountReturned'), 'amount', st.toReturn)}
    </div>
    <button class="btn block" type="submit">${esc(t('save'))}</button>
  </form>`);
}

// ---------- tax summary ----------
function viewTax(r) {
  const td = today();
  const defYear = Number(td.slice(5, 7)) <= 6 ? Number(td.slice(0, 4)) - 1 : Number(td.slice(0, 4));
  const year = Number(r.query.get('year') || defYear);
  const years = new Set([Number(td.slice(0, 4)), Number(td.slice(0, 4)) - 1]);
  for (const p of state.payments) years.add(Number(p.date.slice(0, 4)));
  for (const e of state.expenses) years.add(Number(e.date.slice(0, 4)));
  const s = taxSummary(state, year, td);
  const L = (k) => t('l' + k);
  const lineRow = (k, strong) => (s.lines[k] ? `<li><span>${strong ? '<strong>' : ''}${k} · ${esc(L(k))}${strong ? '</strong>' : ''}</span><span>${strong ? '<strong>' : ''}${fmtMoney(s.lines[k])}${strong ? '</strong>' : ''}</span></li>` : '');
  return page({
    title: t('qTax'),
    back: '#/',
    body: `
      <div class="filters one">${select('year', [...years].sort().reverse().map((y) => [y, y]), year, 'data-change="taxYear"')}</div>
      <section class="card">
        <h3>${esc(t('taxTitle', { year }))}</h3>
        <ul class="list plain compact">
          ${lineRow('211', true)}
          ${['221', '222', '223', '224', '227', '229'].map((k) => lineRow(k)).join('')}
          ${s.lines['230'] ? `<li><span>230 · ${esc(L('230'))}</span><span>- ${fmtMoney(s.lines['230'])}</span></li>` : ''}
          <li><span><strong>240 · ${esc(L('240'))}</strong></span><span><strong>${fmtMoney(s.expenses)}</strong></span></li>
          ${lineRow('250')}
          <li class="total"><span><strong>${esc(s.result >= 0 ? t('resultProfit') : t('resultDeficit'))}</strong></span><span><strong>${fmtMoney(s.result)}</strong></span></li>
        </ul>
        <p class="note">${esc(s.microEligible ? t('microYes', { amount: fmtMoney(s.microTaxable) }) : t('microNo'))}</p>
        ${s.notDeductible ? `<p class="hint">${esc(t('notDeductible', { amount: fmtMoney(s.notDeductible) }))}</p>` : ''}
        <p class="hint">${esc(t('taxHint'))}</p>
      </section>
      <form class="card form" data-form="taxLine230" data-year="${year}">
        <h3>${esc(t('line230Title'))}</h3>
        <p class="hint">${esc(t('line230Hint', { prev: year - 1 }))}</p>
        ${moneyField(t('line230Amount'), 'line230', ((state.tax || {})[year] || {}).line230 || 0)}
        <button class="btn secondary block" type="submit">${esc(t('save'))}</button>
      </form>
      <section class="card flush"><h3 class="pad">${esc(t('byProperty'))}</h3><ul class="list">${s.properties.map((p) => `<li class="row">
        <div class="row-main"><strong>${esc(propName(p.property))}</strong><span class="muted small">${esc(t('chargesReceived', { amount: fmtMoney(p.charges) }))}</span></div>
        <span class="amount">${fmtMoney(p.rent)}</span></li>`).join('')}</ul></section>
      <div class="btn-row">
        <button class="btn" data-action="taxPdf" data-year="${year}">${icon('doc')} ${esc(t('summaryPdf'))}</button>
        <button class="btn secondary" data-action="taxCsv" data-year="${year}">${esc(t('exportCsv'))}</button>
      </div>`,
  });
}

// ---------- attached documents ----------
const DOC_CATEGORIES = ['lease', 'inventory', 'diagnostic', 'insurance', 'identity', 'invoice', 'photo', 'other'];

function fmtSize(n) {
  if (n > 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' Mo';
  return Math.max(1, Math.round(n / 1e3)) + ' ko';
}

function docsSection(ownerType, ownerId) {
  const list = state.documents.filter((d) => d.ownerType === ownerType && d.ownerId === ownerId)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return `<section class="card flush">
    <div class="card-head pad"><h3>${esc(t('documents'))}</h3><button class="btn small secondary" data-action="docAdd" data-type="${ownerType}" data-owner="${ownerId}">${icon('clip')} ${esc(t('add'))}</button></div>
    ${list.length ? `<ul class="list">${list.map((d) => `<li class="row">
      <button class="row-main as-link" data-action="docOpen" data-id="${d.id}"><strong>${esc(d.name)}</strong><span class="muted small">${esc(t('doccat_' + d.category))} · ${fmtDate(d.date)} · ${fmtSize(d.size)}</span></button>
      <button class="link danger" data-action="docDelete" data-id="${d.id}">${esc(t('delete'))}</button></li>`).join('')}</ul>` : `<p class="pad muted small pb">${esc(t('noDocuments'))}</p>`}
  </section>`;
}

function docAddSheet(ownerType, ownerId) {
  const def = ownerType === 'expense' ? 'invoice' : ownerType === 'lease' ? 'lease' : 'diagnostic';
  openSheet(t('addDocument'), `<form class="form" data-form="docAdd" data-type="${ownerType}" data-owner="${ownerId}">
    ${field(t('category'), select('category', DOC_CATEGORIES.map((c) => [c, t('doccat_' + c)]), def))}
    ${field(t('files'), '<input type="file" name="files" multiple accept="image/*,application/pdf" required>')}
    <p class="hint">${esc(t('docHint'))}</p>
    <button class="btn block" type="submit">${esc(t('save'))}</button>
  </form>`);
}

// Photos are resized so 15 properties' worth of documents stays small.
async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.82));
    if (blob && blob.size < file.size) return { blob, type: 'image/jpeg', name: file.name.replace(/\.[^.]+$/, '') + '.jpg' };
  } catch (e) { /* keep the original */ }
  return { blob: file, type: file.type, name: file.name };
}

let openBlobUrl = null;
async function docOpenSheet(id) {
  const meta = byId(state.documents, id);
  const f = await getFile(id);
  if (!meta || !f) { toast(t('docMissing'), 'error'); return; }
  const blob = new Blob([f.data], { type: f.type });
  if (openBlobUrl) URL.revokeObjectURL(openBlobUrl);
  openBlobUrl = URL.createObjectURL(blob);
  const isImg = f.type.startsWith('image/');
  openSheet(meta.name, `${isImg ? `<img class="doc-preview" src="${openBlobUrl}" alt="">` : `<p class="muted">${esc(t('pdfFile'))} · ${fmtSize(meta.size)}</p>`}
    <button class="btn block" data-action="docShare" data-id="${id}">${esc(t('openShare'))}</button>`, (wrap) => { wrap.blob = blob; });
}

// The files stay 15 days in the trash, so restoring a snapshot brings them back.
function removeDocs(predicate) {
  const gone = state.documents.filter(predicate);
  state.trash = [...(state.trash || []), ...gone.map((d) => ({ id: d.id, deletedOn: today() }))];
  state.documents = state.documents.filter((d) => !predicate(d));
}

// ---------- diagnostics ----------
const DIAG_TYPES = ['dpe', 'electricity', 'gas', 'erp', 'lead', 'asbestos', 'surface', 'other'];

function diagnosticsSection(p) {
  const td = today();
  const list = p.diagnostics || [];
  return `<section class="card flush">
    <div class="card-head pad"><h3>${esc(t('diagnostics'))}</h3><button class="btn small secondary" data-action="diagAdd" data-property="${p.id}">+ ${esc(t('add'))}</button></div>
    ${list.length ? `<ul class="list">${list.map((d) => {
      const st = !d.expiry ? pill('paid', t('noExpiry')) : d.expiry < td ? pill('late', t('expired')) : d.expiry <= addDays(td, 90) ? pill('partial', fmtDate(d.expiry)) : pill('upcoming', fmtDate(d.expiry));
      return `<li class="row"><button class="row-main as-link" data-action="diagEdit" data-property="${p.id}" data-id="${d.id}"><strong>${esc(t('diag_' + d.type))}</strong><span class="muted small">${esc(t('doneOn', { date: fmtDate(d.date) }))}</span></button><div class="row-side">${st}</div></li>`;
    }).join('')}</ul>` : `<p class="pad muted small pb">${esc(t('noDiagnostics'))}</p>`}
  </section>`;
}

function diagSheet(propertyId, diagId) {
  const p = prop(propertyId);
  const d = diagId ? (p.diagnostics || []).find((x) => x.id === diagId) : { type: 'dpe', date: '', expiry: '' };
  openSheet(diagId ? t('editDiagnostic') : t('addDiagnostic'), `<form class="form" data-form="diag" data-property="${p.id}" data-id="${diagId || ''}">
    ${field(t('type'), select('type', DIAG_TYPES.map((x) => [x, t('diag_' + x)]), d.type, 'data-change="diagAuto"'))}
    <div class="grid2">
      ${field(t('diagDate'), input('date', d.date, 'type="date" required data-change="diagAuto"'))}
      ${field(t('expiry'), input('expiry', d.expiry, 'type="date"'), t('expiryHint'))}
    </div>
    ${field(t('dpeClassIfDpe'), select('dpeClass', [['', '—'], ...'ABCDEFG'.split('').map((x) => [x, x])], p.dpe || ''))}
    <p class="hint">${esc(t('diagHint'))}</p>
    <button class="btn block" type="submit">${esc(t('save'))}</button>
    ${diagId ? `<button type="button" class="btn danger ghost block" data-action="diagDelete" data-property="${p.id}" data-id="${diagId}">${esc(t('delete'))}</button>` : ''}
  </form>`);
}

// ---------- one-off charges and credits ----------
function adjustmentsSection(l, led) {
  const items = led.adjustments;
  return `<section class="card flush">
    <div class="card-head pad"><h3>${esc(t('otherItems'))}</h3><button class="btn small secondary" data-action="adjAdd" data-lease="${l.id}">+ ${esc(t('add'))}</button></div>
    ${items.length ? `<ul class="list">${items.map((a) => `<li class="row">
      <div class="row-main"><strong>${esc(a.label || t('adj_' + (a.adjKind || 'other')))}</strong><span class="muted small">${fmtDate(a.date)} · ${esc(t('adj_' + (a.adjKind || 'other')))}</span></div>
      <div class="row-side"><span class="amount">${a.credit ? '- ' + fmtMoney(-a.total) : fmtMoney(a.total)}</span>${a.credit ? '' : pill(a.late ? 'late' : a.status)}</div>
      <button class="link danger" data-action="adjDelete" data-lease="${l.id}" data-id="${a.id}">${esc(t('delete'))}</button></li>`).join('')}</ul>` : `<p class="pad muted small pb">${esc(t('noOtherItems'))}</p>`}
  </section>`;
}

function adjSheet(leaseId) {
  openSheet(t('addOtherItem'), `<form class="form" data-form="adj" data-lease="${leaseId}">
    ${field(t('type'), select('sign', [['charge', t('adjCharge')], ['credit', t('adjCredit')]], 'charge'))}
    ${field(t('label'), input('label', '', `required placeholder="${esc(t('adjLabelPh'))}"`))}
    <div class="grid2">
      ${moneyField(t('amount'), 'amount', null, '', 'required')}
      ${field(t('date'), input('date', today(), 'type="date" required'))}
    </div>
    <button class="btn block" type="submit">${esc(t('save'))}</button>
  </form>`);
}

// ---------- other letters ----------
function lettersSheet(leaseId) {
  const l = leaseOf(leaseId);
  const led = ledger(l, state.payments, today());
  openSheet(t('otherLetters'), `
    <form class="form" data-form="letterCert" data-lease="${l.id}">
      <h3>${esc(t('rentCertificate'))}</h3>
      <p class="hint">${esc(t('rentCertificateHint'))}</p>
      <label class="check"><input type="checkbox" name="upToDate" ${led.overdue > 0 ? 'disabled' : 'checked'}> ${esc(t('certUpToDate'))}</label>
      <button class="btn block secondary" type="submit">${icon('doc')} ${esc(t('createPdf'))}</button>
    </form>
    <hr>
    <form class="form" data-form="letterDeposit" data-lease="${l.id}">
      <h3>${esc(t('depositReceipt'))}</h3>
      ${l.deposit ? field(t('receivedOn'), input('date', l.startDate, 'type="date"')) : `<p class="note warn">${esc(t('noDeposit'))}</p>`}
      <button class="btn block secondary" type="submit" ${l.deposit ? '' : 'disabled'}>${icon('doc')} ${esc(t('createPdf'))}</button>
    </form>
    <hr>
    <form class="form" data-form="letterGuarantor" data-lease="${l.id}">
      <h3>${esc(t('guarantorAgreement'))}</h3>
      <p class="hint">${esc(t('guarantorHint'))}</p>
      ${field(t('guarantorName'), input('name', (l.guarantor || '').split(',')[0], 'required'))}
      ${field(t('guarantorAddress'), input('address', (l.guarantor || '').split(',').slice(1).join(',').trim()))}
      <div class="grid2">
        ${field(t('guaranteeType'), select('solidaire', [['1', t('solidaire')], ['0', t('simple')]], '1'))}
        ${field(t('durationYears'), input('years', '3', 'type="number" min="0" max="20" inputmode="numeric"'), t('durationHint'))}
      </div>
      ${moneyField(t('maxAmount'), 'maxAmount', (currentRent(l, today()).rent + currentRent(l, today()).charges) * 36, t('maxAmountHint'))}
      <button class="btn block secondary" type="submit">${icon('doc')} ${esc(t('createPdf'))}</button>
    </form>`);
}

// ================================================================ v1.2 data safety
// Off-site backup settings live outside the app data, so they never end up in
// backups, snapshots or on GitHub: { github: { repo, token, passphrase, tokenExpires }, sync: {...} }
let secrets = {};
let commitCount = 0;
let prepared = null; // a manual backup file ready to share in one tap: { blob, count }
let lastDailyDay = null;

const gh = () => (secrets.github && secrets.github.token ? secrets.github : null);
// A "support copy" device reads the GitHub backup but never saves to it.
const isViewer = () => !!(gh() && gh().mode === 'viewer');
const syncMeta = () => (secrets.sync = secrets.sync || {});
const hasData = (s = state) => s.properties.length > 0 || s.leases.length > 0;

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Called after every change to the data.
function afterChange() {
  commitCount++;
  markDirty();
  dailySnapshot();
}

// ---------- snapshots ----------
async function takeSnapshot(reason) {
  if (!hasData()) return;
  try {
    await putSnapshot({ id: uid(), at: new Date().toISOString(), day: today(), reason, counts: snapCounts(state), state });
    const list = await listSnapshots();
    for (const id of toPrune(list, today())) await deleteSnapshot(id);
  } catch (e) {
    console.warn('snapshot failed', e);
  }
}

async function dailySnapshot() {
  const td = today();
  if (lastDailyDay === td || !hasData()) return;
  lastDailyDay = td;
  try {
    if (needsDaily(await listSnapshots(), td)) await takeSnapshot('daily');
  } catch (e) { /* ignore */ }
}

// Deleted documents keep their file 15 days; files nothing refers to are removed.
async function cleanFiles() {
  try {
    const expired = expiredTrash(state.trash, today());
    if (expired.length) {
      const ids = new Set(expired.map((x) => x.id));
      state.trash = state.trash.filter((x) => !ids.has(x.id));
      await persist();
    }
    const keep = new Set([...state.documents.map((d) => d.id), ...state.trash.map((d) => d.id)]);
    for (const snap of await listSnapshots()) for (const d of (snap.state.documents || [])) keep.add(d.id);
    for (const id of await allFileIds()) if (!keep.has(id)) await deleteFile(id);
  } catch (e) { /* ignore */ }
}

async function fillSnapshotList() {
  const box = document.getElementById('snap-list');
  if (!box) return;
  let list = [];
  try { list = await listSnapshots(); } catch (e) { /* ignore */ }
  if (!list.length) { box.innerHTML = `<p class="muted small">${esc(t('noSnapshots'))}</p>`; return; }
  box.innerHTML = `<ul class="list plain">${list.slice(0, 30).map((s) => `<li class="row tight">
    <div class="row-main"><strong>${esc(fmtDateTime(s.at))}</strong><span class="muted small">${esc(t('snap_' + s.reason))} · ${esc(t('snapCounts', s.counts || {}))}</span></div>
    <button class="btn small secondary" data-action="snapRestore" data-id="${s.id}">${esc(t('snapRestore'))}</button></li>`).join('')}</ul>`;
}

async function restoreSnapshot(id) {
  const snap = await getSnapshot(id);
  if (!snap) return;
  if (!confirm(t('confirmSnapRestore', { date: fmtDateTime(snap.at), ...snap.counts }))) return;
  await takeSnapshot('beforeRestore');
  state = normalize(snap.state);
  setLang(state.settings.lang);
  applyTheme(state.settings.theme);
  await persist();
  afterChange();
  location.hash = '#/';
  render();
  toast(t('snapRestored'));
}

// ---------- automatic encrypted backup to GitHub ----------
let syncTimer = null;
let syncing = false;
let syncAgain = false;

function markDirty() {
  if (!gh() || isViewer()) return;
  syncMeta().dirty = true;
  saveSecrets(secrets).catch(() => {});
  scheduleSync();
}

function scheduleSync(delay = 8000) {
  if (!gh()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => runSync(), delay);
}

async function runSync() {
  const g = gh();
  if (!g || g.mode === 'viewer') return;
  if (syncing) { syncAgain = true; return; }
  syncing = true;
  syncAgain = false;
  const meta = syncMeta();
  const startCount = commitCount;
  meta.lastAttempt = new Date().toISOString();
  updateSyncStatus(true);
  try {
    const cfg = { repo: g.repo, token: g.token };
    if (!hasData()) {
      // Never replace a backup with an empty phone; tell a new phone to restore instead.
      if (!meta.dataSha && await getSha(cfg, DATA_PATH)) throw new SyncError('remote-exists');
      meta.dirty = false;
      return;
    }
    // Each phone signs its saves, so it can tell its own from another phone's.
    if (!g.device) { g.device = uid().replace(/-/g, '').slice(0, 8); await saveSecrets(secrets); }
    const tag = `[${g.device}]`;
    if (meta.forceNext) meta.dataSha = await getSha(cfg, DATA_PATH);
    const session = await newKeySession(g.passphrase);
    const stamp = fmtDateTime(meta.lastAttempt);
    const uploaded = new Set(meta.uploadedDocs || []);
    for (const d of state.documents) {
      if (uploaded.has(d.id)) continue;
      const f = await getFile(d.id);
      if (!f) continue;
      const env = await encryptBytes(new Uint8Array(f.data), g.passphrase, session);
      await ghPut(cfg, docPath(d.id), env, `Document ${stamp}`);
      uploaded.add(d.id);
      meta.uploadedDocs = [...uploaded];
      await saveSecrets(secrets);
    }
    const env = await encryptJson({ app: 'gestion-locative', exportedAt: new Date().toISOString(), state }, g.passphrase, session);
    // Never replace a backup that another phone saved in the meantime.
    meta.dataSha = await ghPut(cfg, DATA_PATH, env, `Sauvegarde automatique ${stamp} ${tag}`, meta.dataSha, { refuseConflicts: true, tag });
    meta.lastOk = new Date().toISOString();
    meta.lastError = null;
    meta.forceNext = false;
    meta.dirty = commitCount !== startCount;
    if (meta.dirty) syncAgain = true;
  } catch (e) {
    console.warn('backup failed', e);
    meta.lastError = (e && e.code) || 'unknown';
  } finally {
    syncing = false;
    await saveSecrets(secrets).catch(() => {});
    updateSyncStatus(false);
    if (syncAgain) scheduleSync(3000);
  }
}

function syncStatusHtml(running) {
  if (!gh()) return '';
  const m = syncMeta();
  if (isViewer()) return `<p>${esc(m.lastRefresh ? t('supportStatus', { date: fmtDateTime(m.lastRefresh) }) : t('supportNever'))}</p>`;
  let h = `<p>${esc(m.lastOk ? t('syncLastOk', { date: fmtDateTime(m.lastOk) }) : t('syncNever'))}</p>`;
  if (running) h += `<p class="muted small">${esc(t('syncRunning'))}</p>`;
  else if (m.lastError === 'conflict') {
    h += `<p class="note warn">${esc(t('syncConflict'))}</p>
      <button class="btn small secondary" data-action="syncForce">${esc(t('syncForce'))}</button>`;
  } else if (m.lastError) h += `<p class="note warn">${esc(t('syncFailed', { reason: t('syncErr_' + m.lastError) }))}</p>`;
  return h;
}

function updateSyncStatus(running) {
  const el = document.getElementById('sync-status');
  if (el) el.innerHTML = syncStatusHtml(running);
}

function safetyBanners() {
  const g = gh();
  if (!g) return '';
  const m = syncMeta();
  let out = '';
  if (!isViewer() && m.lastError === 'conflict') {
    out += `<a class="banner warn" href="#/settings">${esc(t('syncConflictBanner'))}</a>`;
  } else if (!isViewer() && m.lastError && (!m.lastOk || m.lastOk.slice(0, 10) < addDays(today(), -2))) {
    out += `<a class="banner warn" href="#/settings">${esc(t('syncFailingBanner', { reason: t('syncErr_' + m.lastError) }))}</a>`;
  }
  if (g.tokenExpires && g.tokenExpires <= addDays(today(), 14)) {
    out += `<a class="banner warn" href="#/settings">${esc(t('tokenExpiring', { date: fmtDate(g.tokenExpires) }))}</a>`;
  }
  return out;
}

function githubCard() {
  const g = gh();
  if (g) {
    return `<section class="card">
      <h3>${esc(t('ghTitle'))}</h3>
      <p>${esc(t('ghConnectedTo', { repo: g.repo }))} · <strong>${esc(t(isViewer() ? 'ghModeViewer' : 'ghModeMain'))}</strong>${g.tokenExpires ? ` <span class="muted small">· ${esc(t('ghTokenUntil', { date: fmtDate(g.tokenExpires) }))}</span>` : ''}</p>
      <div id="sync-status">${syncStatusHtml(syncing)}</div>
      <div class="btn-row">
        ${isViewer()
          ? `<button class="btn" data-action="supportRefresh">${esc(t('supportRefresh'))}</button>`
          : `<button class="btn" data-action="syncNow">${esc(t('syncNow'))}</button>`}
        <button class="btn secondary" data-action="ghRestore">${esc(t('ghRestore'))}</button>
      </div>
      <div class="btn-row spaced-top">
        <button class="link" data-action="ghToken">${esc(t('ghChangeToken'))}</button>
        <button class="link danger" data-action="ghDisconnect">${esc(t('ghDisconnect'))}</button>
      </div>
    </section>`;
  }
  return `<section class="card">
    <h3>${esc(t('ghTitle'))}</h3>
    <p class="hint">${esc(t('ghIntro'))}</p>
    <details><summary>${esc(t('ghHowTo'))}</summary>
      <ol class="steps small">
        <li>${esc(t('ghStep1'))}</li>
        <li>${esc(t('ghStep2'))}</li>
        <li>${esc(t('ghStep3'))}</li>
        <li>${esc(t('ghStep4'))}</li>
      </ol>
    </details>
    <form class="form" data-form="ghConnect">
      ${field(t('ghMode'), select('mode', [['main', t('ghModeMain')], ['viewer', t('ghModeViewer')]], 'main'), t('ghModeHint'))}
      ${field(t('ghRepo'), input('repo', '', `required autocomplete="off" autocapitalize="off" placeholder="${esc(t('ghRepoPh'))}"`))}
      ${field(t('ghToken'), input('token', '', 'type="password" required autocomplete="off"'), t('ghTokenHint'))}
      ${field(t('ghTokenExpires'), input('tokenExpires', '', 'type="date"'), t('ghTokenExpiresHint'))}
      <div class="grid2">
        ${field(t('ghPassphrase'), input('passphrase', '', 'type="password" required autocomplete="new-password"'))}
        ${field(t('ghPassphrase2'), input('passphrase2', '', 'type="password" required autocomplete="new-password"'))}
      </div>
      <p class="note warn">${esc(t('ghPassphraseHint'))}</p>
      <button class="btn block" type="submit">${esc(t('ghConnect'))}</button>
    </form>
  </section>`;
}

function snapshotsCard() {
  return `<section class="card">
    <h3>${esc(t('snapshotsTitle'))}</h3>
    <p class="hint">${esc(t('snapshotsHint'))}</p>
    <div id="snap-list"><p class="muted small">…</p></div>
  </section>`;
}

// The list of GitHub versions, a page at a time ("Show older versions").
let versionList = { intro: null, items: [], page: 0, more: false };

async function ghRestoreSheet(intro, more = false) {
  const g = gh();
  if (!g) return;
  if (!more) {
    versionList = { intro, items: [], page: 0, more: false };
    openSheet(t('ghVersions'), `<p class="muted">${esc(t('ghLoading'))}</p>`);
  }
  try {
    const page = versionList.page + 1;
    const items = await listVersions({ repo: g.repo, token: g.token }, DATA_PATH, { page });
    versionList.items.push(...items);
    versionList.page = page;
    versionList.more = items.length === VERSIONS_PER_PAGE;
  } catch (e) {
    closeSheet();
    toast(t('syncErr_' + ((e && e.code) || 'unknown')), 'error');
    return;
  }
  const versions = versionList.items;
  const box = document.querySelector('#sheet .sheet');
  const keep = more && box ? box.scrollTop : 0;
  openSheet(t('ghVersions'), `${versionList.intro ? `<p class="note">${esc(versionList.intro)}</p>` : ''}
    <p class="hint">${esc(t('ghVersionsHint'))}</p>
    ${versions.length ? `<ul class="list plain">${versions.map((v, i) => `<li class="row tight">
      <div class="row-main"><strong>${esc(fmtDateTime(v.date))}</strong><span class="muted small">${i === 0 ? esc(t('ghLatest')) : ''}</span></div>
      <button class="btn small${i === 0 ? '' : ' secondary'}" data-action="ghRestoreVersion" data-sha="${esc(v.sha)}">${esc(t('snapRestore'))}</button></li>`).join('')}</ul>` : `<p class="muted">${esc(t('ghNoVersions'))}</p>`}
    ${versionList.more ? `<button class="btn block secondary" data-action="ghOlder">${esc(t('ghOlder'))}</button>` : ''}`);
  if (keep) document.querySelector('#sheet .sheet').scrollTop = keep;
}

async function ghRestoreVersion(sha) {
  const g = gh();
  const cfg = { repo: g.repo, token: g.token };
  toast(t('ghLoading'));
  try {
    const text = await readFile(cfg, DATA_PATH, sha);
    if (!text) throw new SyncError('unknown');
    const payload = await decryptJson(text, g.passphrase);
    const next = normalize(payload.state);
    if (!confirm(t('confirmGhRestore', { date: fmtDateTime(payload.exportedAt), p: next.properties.length, l: next.leases.length, pay: next.payments.length }))) return;
    await takeSnapshot('beforeRestore');
    let missing = 0;
    for (const d of next.documents) {
      if (await getFile(d.id)) continue;
      const env = await readFile(cfg, docPath(d.id));
      if (!env) { missing++; continue; }
      const bytes = await decryptBytes(env, g.passphrase);
      await putFile(d.id, { name: d.name, type: d.type, data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    }
    state = next;
    const m = syncMeta();
    m.dataSha = await getSha(cfg, DATA_PATH);
    m.uploadedDocs = next.documents.map((d) => d.id);
    m.lastError = null;
    m.lastRefresh = new Date().toISOString();
    await saveSecrets(secrets);
    setLang(state.settings.lang);
    applyTheme(state.settings.theme);
    await persist();
    commitCount++;
    closeSheet();
    location.hash = '#/';
    render();
    toast(missing ? t('ghDocsMissing', { n: missing }) : t('ghRestored'));
  } catch (e) {
    toast(t('syncErr_' + ((e && e.code) || (e && e.message) || 'unknown')), 'error');
  }
}

function ghTokenSheet() {
  openSheet(t('ghChangeToken'), `<form class="form" data-form="ghToken">
    ${field(t('ghToken'), input('token', '', 'type="password" required autocomplete="off"'), t('ghTokenHint'))}
    ${field(t('ghTokenExpires'), input('tokenExpires', '', 'type="date"'), t('ghTokenExpiresHint'))}
    <button class="btn block" type="submit">${esc(t('save'))}</button>
  </form>`);
}

function handoverCard() {
  return `<section class="card">
    <h3>${esc(t('handoverTitle'))}</h3>
    <details><summary>${esc(t('handoverHow'))}</summary>
      <ol class="steps small">${[1, 2, 3, 4, 5, 6].map((i) => `<li>${esc(t('handover' + i))}</li>`).join('')}</ol>
    </details>
    <p class="hint">${esc(t('supportExportHint'))}</p>
    <button class="btn secondary" data-action="supportExport">${esc(t('supportExport'))}</button>
  </section>`;
}

// One tap is enough to back up when the file is already prepared.
function prepareBackup() {
  if (prepared && prepared.count === commitCount) return;
  const count = commitCount;
  backupBlob(state, true).then((blob) => { if (count === commitCount) prepared = { blob, count }; }).catch(() => {});
}

// ---------------------------------------------------------------- after render (canvas etc.)

function mountAfterRender(r) {
  if (r.name === 'settings') {
    fillSnapshotList();
    prepareBackup();
  }
  if (r.name === 'home' && needsBackup()) prepareBackup();
}

// The pad lives in its own sheet: drawn on the settings page, scrolling past
// it with a finger could leave marks.
function signatureSheet() {
  openSheet(t('signature'), `<p class="hint">${esc(t('signatureHint'))}</p>
    <canvas id="sigpad" class="sigpad" width="600" height="220"></canvas>
    <div class="btn-row">
      <button class="btn secondary" type="button" data-action="sigClear">${esc(t('clear'))}</button>
      <button class="btn" type="button" data-action="sigSave">${esc(t('saveSignature'))}</button>
    </div>`, () => mountSignaturePad());
}

let sigDirty = false;
function mountSignaturePad() {
  const c = document.getElementById('sigpad');
  if (!c) return;
  sigDirty = false;
  const ctx = c.getContext('2d');
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1b2a4a';
  let drawing = false;
  const pos = (e) => {
    const b = c.getBoundingClientRect();
    return [((e.clientX - b.left) / b.width) * c.width, ((e.clientY - b.top) / b.height) * c.height];
  };
  c.addEventListener('pointerdown', (e) => { drawing = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); });
  c.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); sigDirty = true; e.preventDefault(); });
  const stop = () => { drawing = false; };
  c.addEventListener('pointerup', stop);
  c.addEventListener('pointercancel', stop);
}

// ---------------------------------------------------------------- sheets

function paymentSheet(leaseId) {
  const l = leaseOf(leaseId);
  const td = today();
  const led = ledger(l, state.payments, td);
  const row = led.rows.find((x) => x.period === periodOf(td));
  const thisMonth = row ? row.total - row.paid : 0;
  const suggestions = [];
  if (led.owed > 0) suggestions.push([t('allOwed'), led.owed]);
  if (thisMonth > 0 && thisMonth !== led.owed) suggestions.push([t('thisMonthOnly'), thisMonth]);
  const cur = currentRent(l, td);
  if (!suggestions.length) suggestions.push([t('oneMonth'), cur.rent + cur.charges]);
  const methods = ['transfer', 'cheque', 'cash', 'directDebit', 'caf', 'other'];
  openSheet(t('recordPayment'), `<form class="form" data-form="payment" data-lease="${l.id}">
      <p class="muted">${esc(tenantsLabel(l))} · ${esc(propName(prop(l.propertyId)))}</p>
      <div class="chips">${suggestions.map(([label, v]) => `<button type="button" class="chip" data-action="fillAmount" data-value="${esc(moneyInput(v))}">${esc(label)} · ${fmtMoney(v)}</button>`).join('')}</div>
      ${moneyField(t('amount'), 'amount', suggestions[0][1], '', 'required')}
      <div class="grid2">
        ${field(t('date'), input('date', td, 'type="date" required'))}
        ${field(t('method'), select('method', methods.map((m) => [m, t('method_' + m)]), 'transfer'))}
      </div>
      ${field(t('note'), input('note', ''))}
      <p class="hint">${esc(t('fifoHint'))}</p>
      <button class="btn block" type="submit">${esc(t('save'))}</button>
    </form>`);
}

function rentCallSheet(leaseId) {
  const l = leaseOf(leaseId);
  const td = today();
  const cur = periodOf(td);
  const options = [addMonths(cur, -1), cur, addMonths(cur, 1), addMonths(cur, 2)]
    .filter((p) => p >= periodOf(l.startDate) && (!l.endDate || p <= periodOf(l.endDate)));
  const def = Number(td.slice(8)) >= 15 && options.includes(addMonths(cur, 1)) ? addMonths(cur, 1) : (options.includes(cur) ? cur : options[0]);
  openSheet(t('rentCall'), options.length ? `<form class="form" data-form="rentCall" data-lease="${l.id}">
      ${field(t('period'), select('period', options.map((p) => [p, fmtPeriodCap(p, state.settings.lang)]), def))}
      <label class="check"><input type="checkbox" name="withBalance" checked> ${esc(t('includeArrears'))}</label>
      <button class="btn block" type="submit">${icon('doc')} ${esc(t('createPdf'))}</button>
    </form>` : empty(t('noPeriodsYet')));
}

function receiptSheet(leaseId) {
  const l = leaseOf(leaseId);
  const led = ledger(l, state.payments, today());
  const rows = [...led.rows].reverse().filter((r) => r.paid > 0).slice(0, 24);
  openSheet(t('receipt'), rows.length ? `<p class="hint">${esc(t('receiptHint'))}</p><ul class="list">${rows.map((r) => `<li class="row">
      <div class="row-main"><strong>${esc(fmtPeriodCap(r.period, state.settings.lang))}</strong><span class="muted">${r.paid >= r.total ? esc(t('fullReceipt')) : esc(t('partialReceipt', { amount: fmtMoney(r.paid) }))}</span></div>
      <button class="btn small" data-action="receipt" data-lease="${l.id}" data-period="${r.period}">${icon('doc')} PDF</button></li>`).join('')}</ul>` : empty(t('noPaidPeriods')));
}

function changeRentSheet(leaseId) {
  const l = leaseOf(leaseId);
  const cur = currentRent(l, today());
  openSheet(t('changeRent'), `<form class="form" data-form="changeRent" data-lease="${l.id}">
      <p class="hint">${esc(t('changeRentHint'))}</p>
      ${field(t('fromMonth'), input('from', addMonths(periodOf(today()), 1), 'type="month" required'))}
      <div class="grid2">
        ${moneyField(t('rentHC'), 'rent', cur.rent, '', 'required')}
        ${moneyField(t('charges'), 'charges', cur.charges)}
      </div>
      ${field(t('note'), input('note', ''))}
      <button class="btn block" type="submit">${esc(t('save'))}</button>
    </form>`);
}

function indexationSheet(leaseId) {
  const l = leaseOf(leaseId);
  const info = indexationStatus(l, prop(l.propertyId), irlTable(state), today());
  if (!info || info.state !== 'due') return;
  const lang = state.settings.lang;
  openSheet(t('revisionDueTitle'), `<form class="form" data-form="indexation" data-lease="${l.id}">
      <dl class="facts">
        <dt>${esc(t('currentRentHC'))}</dt><dd>${fmtMoney(info.currentRent)}</dd>
        <dt>${esc(t('oldIndex'))}</dt><dd>${esc(fmtIrlKey(info.oldKey, lang))} : ${info.oldValue.toFixed(2)}</dd>
        <dt>${esc(t('newIndex'))}</dt><dd>${esc(fmtIrlKey(info.newKey, lang))} : ${info.newValue.toFixed(2)}</dd>
        <dt>${esc(t('newRentHC'))}</dt><dd><strong>${fmtMoney(info.newRent)}</strong> (${info.pct >= 0 ? '+' : ''}${info.pct.toFixed(2)} %)</dd>
      </dl>
      ${field(t('applyFrom'), input('applyFrom', info.applyFrom, 'type="month" required'), t('applyFromHint'))}
      <div class="btn-row">
        <button class="btn secondary" type="button" data-action="indexationLetter" data-lease="${l.id}">${icon('doc')} ${esc(t('letterPdf'))}</button>
        <button class="btn" type="submit">${esc(t('applyNewRent'))}</button>
      </div>
      <p class="hint">${esc(t('indexationHint'))}</p>
    </form>`);
}

// A reminder or formal notice can only claim money already late. Instead of a
// dead grey button, say what is due next, from when a reminder is possible,
// and offer the rent call (the letter that asks for rent before it is due).
function nothingLateSheet(l) {
  const td = today();
  const lang = state.settings.lang;
  const next = nextPayment(l, state.payments, td);
  let text;
  if (!next) text = t('nothingLateAllPaid', { name: tenantsLabel(l) });
  else {
    const what = next.kind === 'period' ? fmtPeriodCap(next.period, lang) : next.kind === 'opening' ? t('openingWhat') : (next.label || t('adj_other'));
    text = t('nothingLateNext', { name: tenantsLabel(l), what, amount: fmtMoney(next.amount), due: fmtDate(next.dueDate), from: fmtDate(addDays(next.dueDate, 1)) });
  }
  const tracked = firstTrackedPeriod(l);
  const before = tracked && l.startDate && tracked > periodOf(l.startDate);
  const canCall = isActive(l, td);
  openSheet(t('nothingLateTitle'), `<p>${esc(text)}</p>
    ${before ? `<p class="hint">${esc(t('nothingLateBefore', { month: fmtPeriod(tracked, lang) }))}</p>` : ''}
    ${canCall ? `<p class="hint">${esc(t('nothingLateRentCall'))}</p>
    <button class="btn block secondary" data-action="rentCall" data-lease="${l.id}">${icon('doc')} ${esc(t('rentCall'))}</button>` : ''}`);
}

function endLeaseSheet(leaseId) {
  openSheet(t('endLease'), `<form class="form" data-form="endLease" data-lease="${leaseId}">
      ${field(t('endDate'), input('endDate', today(), 'type="date" required'))}
      <p class="hint">${esc(t('endLeaseHint'))}</p>
      <button class="btn block" type="submit">${esc(t('save'))}</button>
    </form>`);
}

// ---------------------------------------------------------------- PDF helpers

async function makePdf(build) {
  if (!window.jspdf) { toast(t('pdfLibMissing'), 'error'); return; }
  if (!state.settings.landlord.name) toast(t('missingLandlordShort'));
  try {
    return await deliver(build());
  } catch (e) {
    console.error(e);
    toast(t('pdfError'), 'error');
    return null;
  }
}

// ---------------------------------------------------------------- actions

const actions = {
  closeSheet,
  pay: (d) => paymentSheet(d.lease),
  rentCall: (d) => rentCallSheet(d.lease),
  receiptPicker: (d) => receiptSheet(d.lease),
  changeRent: (d) => changeRentSheet(d.lease),
  indexation: (d) => indexationSheet(d.lease),
  endLease: (d) => endLeaseSheet(d.lease),
  fillAmount: (d, el) => { const f = el.closest('form'); f.elements.amount.value = d.value; },
  receipt: (d) => {
    const l = leaseOf(d.lease);
    const led = ledger(l, state.payments, today());
    const row = led.rows.find((x) => x.period === d.period);
    if (row) makePdf(() => receiptPdf(state, l, row));
  },
  reminder: (d) => {
    const l = leaseOf(d.lease);
    const led = ledger(l, state.payments, today());
    if (led.overdue <= 0) { nothingLateSheet(l); return; }
    makePdf(() => reminderPdf(state, l, led));
  },
  notice: (d) => {
    const l = leaseOf(d.lease);
    const led = ledger(l, state.payments, today());
    if (led.overdue <= 0) { nothingLateSheet(l); return; }
    makePdf(() => formalNoticePdf(state, l, led));
  },
  indexationLetter: (d, el) => {
    const l = leaseOf(d.lease);
    const info = indexationStatus(l, prop(l.propertyId), irlTable(state), today());
    const applyFrom = el.closest('form').elements.applyFrom.value || info.applyFrom;
    makePdf(() => indexationPdf(state, l, info, applyFrom));
  },
  addTenantRow: () => {
    const box = document.getElementById('tenants');
    const n = box.querySelectorAll('[data-tenant]').length;
    if (n >= 4) return;
    box.insertAdjacentHTML('beforeend', tenantRow(n));
  },
  deletePayment: (d) => {
    if (!confirm(t('confirmDeletePayment'))) return;
    commit((s) => { s.payments = s.payments.filter((x) => x.id !== d.id); });
  },
  deleteProperty: async (d) => {
    const n = leasesFor(d.id).length;
    if (!confirm(n ? t('confirmDeletePropertyLeases', { n }) : t('confirmDeleteProperty'))) return;
    const leaseIds = new Set(leasesFor(d.id).map((l) => l.id));
    await takeSnapshot('delete');
    commit((s) => {
      s.properties = s.properties.filter((x) => x.id !== d.id);
      s.leases = s.leases.filter((l) => !leaseIds.has(l.id));
      s.payments = s.payments.filter((x) => !leaseIds.has(x.leaseId));
      removeDocs((doc) => doc.ownerId === d.id || leaseIds.has(doc.ownerId));
      s.expenses = s.expenses.map((e) => (e.propertyId === d.id ? { ...e, propertyId: '' } : e));
    });
    location.hash = '#/properties';
  },
  deleteLease: async (d) => {
    if (!confirm(t('confirmDeleteLease'))) return;
    await takeSnapshot('delete');
    commit((s) => {
      s.leases = s.leases.filter((x) => x.id !== d.id);
      s.payments = s.payments.filter((x) => x.leaseId !== d.id);
      removeDocs((doc) => doc.ownerId === d.id);
    });
    location.hash = '#/leases';
  },
  deleteExpense: (d) => {
    if (!confirm(t('confirmDeleteExpense'))) return;
    commit((s) => { s.expenses = s.expenses.filter((x) => x.id !== d.id); removeDocs((doc) => doc.ownerId === d.id); });
    location.hash = '#/expenses';
  },
  theme: (d) => {
    applyTheme(d.theme);
    commit((s) => { s.settings.theme = d.theme; });
  },
  lang: (d) => {
    commit((s) => { s.settings.lang = d.lang; });
    setLang(d.lang);
    document.documentElement.lang = d.lang;
    render();
  },
  sigOpen: () => signatureSheet(),
  sigClear: () => { const c = document.getElementById('sigpad'); c.getContext('2d').clearRect(0, 0, c.width, c.height); sigDirty = false; },
  sigSave: () => {
    if (!sigDirty) { toast(t('signatureEmpty')); return; }
    const data = document.getElementById('sigpad').toDataURL('image/png');
    closeSheet();
    commit((s) => { s.settings.signature = data; });
    toast(t('saved'));
  },
  sigRemove: () => {
    if (!confirm(t('confirmRemoveSignature'))) return;
    commit((s) => { s.settings.signature = null; });
  },
  irlUpdate: async (d, el) => {
    el.disabled = true;
    try {
      const table = await fetchInseeIrl();
      const before = latestIrlKey(irlTable(state));
      commit((s) => { s.irl = { ...s.irl, ...table }; s.settings.irlUpdated = today(); });
      const after = latestIrlKey(irlTable(state));
      toast(after > before ? t('irlNew', { key: fmtIrlKey(after, state.settings.lang) }) : t('irlUpToDate'));
    } catch (e) {
      toast(t('irlFailed'), 'error');
      el.disabled = false;
    }
  },
  backup: async () => {
    const name = `gestion-locative-sauvegarde-${today()}.json`;
    if (prepared && prepared.count === commitCount) {
      // Ready in advance: the share menu opens straight away.
      const res = await shareFile(prepared.blob, name, 'application/json');
      if (res !== 'cancelled') {
        commit((s) => { s.settings.lastBackup = today(); });
        toast(t('backupDone'));
      }
      return;
    }
    const blob = await backupBlob(state, true);
    openSheet(t('backupTitle'), `<p>${esc(t('backupReady', { size: fmtSize(blob.size), n: state.documents.length }))}</p>
      <p class="hint">${esc(t('backupSaveHint'))}</p>
      <button class="btn block" data-action="backupSave">${esc(t('saveToFiles'))}</button>`, (wrap) => { wrap.blob = blob; });
  },
  backupSave: async (d, el) => {
    const wrap = el.closest('.sheet-wrap');
    const name = `gestion-locative-sauvegarde-${today()}.json`;
    const res = await shareFile(wrap.blob, name, 'application/json');
    if (res !== 'cancelled') {
      closeSheet();
      commit((s) => { s.settings.lastBackup = today(); });
      toast(t('backupDone'));
    }
  },
  restore: () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      try {
        const { state: next, files } = parseBackup(await file.text());
        if (next.anonymised && !confirm(t('confirmRestoreAnon'))) return;
        const msg = t('confirmRestore', { p: next.properties.length, l: next.leases.length, pay: next.payments.length });
        if (!confirm(msg)) return;
        await takeSnapshot('beforeRestore');
        await restoreFiles(files);
        state = next;
        setLang(state.settings.lang);
        applyTheme(state.settings.theme);
        await persist();
        afterChange();
        location.hash = '#/';
        render();
        toast(t('restoreDone'));
      } catch (e) {
        toast(t('restoreFailed'), 'error');
      }
    };
    inp.click();
  },
  wipe: async () => {
    const word = state.settings.lang === 'fr' ? 'SUPPRIMER' : 'DELETE';
    const answer = prompt(t('wipeConfirm', { word }));
    if (answer !== word) return;
    await takeSnapshot('wipe');
    const lang = state.settings.lang;
    const theme = state.settings.theme;
    // Documents go to the trash (kept 15 days) so the snapshot can still bring them back.
    const trash = [...state.trash, ...state.documents.map((doc) => ({ id: doc.id, deletedOn: today() }))];
    state = emptyState();
    state.settings.lang = lang;
    state.settings.theme = theme;
    state.trash = trash;
    await persist();
    commitCount++;
    location.hash = '#/';
    render();
  },
};

// ---------------------------------------------------------------- forms

function readTenants(form) {
  return [...form.querySelectorAll('[data-tenant]')].map((row) => ({
    name: row.querySelector('[name=tenant_name]').value.trim(),
    email: row.querySelector('[name=tenant_email]').value.trim(),
    phone: row.querySelector('[name=tenant_phone]').value.trim(),
  })).filter((x) => x.name || x.email || x.phone);
}

const forms = {
  property: (f, form) => {
    const id = form.dataset.id || uid();
    const data = {
      id,
      name: f.get('name').trim(),
      type: f.get('type'),
      address: f.get('address').trim(),
      postalCode: f.get('postalCode').trim(),
      city: f.get('city').trim(),
      surface: f.get('surface').trim(),
      dpe: f.get('dpe'),
      notes: f.get('notes').trim(),
    };
    commit((s) => {
      const i = s.properties.findIndex((x) => x.id === id);
      if (i >= 0) s.properties[i] = { ...s.properties[i], ...data };
      else s.properties.push(data);
    });
    toast(t('saved'));
    location.hash = `#/property/${id}`;
  },
  lease: (f, form) => {
    const id = form.dataset.id || uid();
    const existing = leaseOf(id);
    const startDate = f.get('startDate');
    const endDate = f.get('endDate') || null;
    if (endDate && endDate < startDate) { toast(t('endBeforeStart'), 'error'); return; }
    const q = f.get('irlQuarter');
    const y = f.get('irlYear');
    const table = irlTable(state);
    let irl = null;
    if (q) {
      if (!y) { toast(t('irlYearMissing'), 'error'); return; }
      const key = irlKey(y, q);
      if (!table[key]) { toast(t('irlNotFound', { key: fmtIrlKey(key, state.settings.lang) }), 'error'); return; }
      irl = { quarter: Number(q), key, value: table[key] };
    }
    const rev = f.get('revisionDate');
    const data = {
      id,
      propertyId: f.get('propertyId'),
      tenants: readTenants(form),
      guarantor: f.get('guarantor').trim(),
      startDate,
      endDate,
      chargesType: f.get('chargesType'),
      paymentDay: Math.min(28, Math.max(1, Number(f.get('paymentDay')) || 1)),
      deposit: parseMoney(f.get('deposit')) || 0,
      irl,
      revisionDate: rev ? rev.slice(5) : null,
      lastRevision: f.get('lastRevision') || null,
      insuranceUntil: f.get('insuranceUntil') || null,
      notes: f.get('notes').trim(),
    };
    // Unfurnished lease: the deposit is at most one month's rent excluding charges.
    const rentHC = parseMoney(f.get('rent'));
    if (rentHC > 0 && data.deposit > rentHC && data.deposit !== (existing && existing.deposit)
      && !confirm(t('depositAboveCap', { max: fmtMoney(rentHC) }))) return;
    // A corrected rent or charges amount (typing mistake) on an existing lease.
    let correction = null;
    if (existing) {
      if (rentHC === null) { toast(t('rentMissing'), 'error'); return; }
      const charges = parseMoney(f.get('charges')) || 0;
      const entry = rentEntryToCorrect(existing, today());
      if (!entry || entry.rent !== rentHC || entry.charges !== charges) {
        if (entry && !confirm(t('confirmRentCorrect', { from: fmtPeriod(entry.from, state.settings.lang) }))) return;
        correction = { rent: rentHC, charges };
      }
    }
    if (existing) {
      // Start of tracking and what was owed then can be fixed later too
      // (for example a debt from before the app was used).
      let tf = f.get('trackFrom') || existing.trackFrom || periodOf(startDate);
      if (tf < periodOf(startDate)) tf = periodOf(startDate);
      data.trackFrom = tf;
      data.openingBalance = parseMoney(f.get('openingBalance')) || 0;
    }
    if (!existing) {
      const rent = parseMoney(f.get('rent'));
      if (rent === null) { toast(t('rentMissing'), 'error'); return; }
      const charges = parseMoney(f.get('charges')) || 0;
      let trackFrom = f.get('trackFrom') || defaultTrackFrom(startDate);
      if (trackFrom < periodOf(startDate)) trackFrom = periodOf(startDate);
      data.rents = [{ from: periodOf(startDate), rent, charges, reason: 'initial' }];
      data.trackFrom = trackFrom;
      data.openingBalance = parseMoney(f.get('openingBalance')) || 0;
    }
    commit((s) => {
      const i = s.leases.findIndex((x) => x.id === id);
      if (i >= 0) {
        const old = s.leases[i];
        const merged = { ...old, ...data };
        // keep the first rent entry aligned with a changed start date
        const rents = sortedRents(merged);
        if (rents.length && rents[0].from > periodOf(startDate)) rents[0] = { ...rents[0], from: periodOf(startDate) };
        merged.rents = rents;
        if (merged.trackFrom && merged.trackFrom < periodOf(startDate)) merged.trackFrom = periodOf(startDate);
        if (correction) merged.rents = correctRent(merged, today(), correction.rent, correction.charges);
        s.leases[i] = merged;
      } else s.leases.push(data);
    });
    toast(t('saved'));
    location.hash = `#/lease/${id}`;
  },
  payment: (f, form) => {
    const amount = parseMoney(f.get('amount'));
    if (!amount || amount <= 0) { toast(t('amountInvalid'), 'error'); return; }
    const p = { id: uid(), leaseId: form.dataset.lease, amount, date: f.get('date') || today(), method: f.get('method'), note: f.get('note').trim() };
    closeSheet();
    commit((s) => { s.payments.push(p); });
    toast(t('paymentSaved', { amount: fmtMoney(amount) }));
  },
  rentCall: (f, form) => {
    const l = leaseOf(form.dataset.lease);
    const call = rentCallBalance(l, state.payments, f.get('period'), today(), !!f.get('withBalance'));
    makePdf(() => rentCallPdf(state, l, call));
  },
  changeRent: (f, form) => {
    const from = f.get('from');
    const rent = parseMoney(f.get('rent'));
    if (!from || rent === null) return;
    const charges = parseMoney(f.get('charges')) || 0;
    closeSheet();
    commit((s) => {
      const l = s.leases.find((x) => x.id === form.dataset.lease);
      l.rents = (l.rents || []).filter((x) => x.from !== from);
      l.rents.push({ from, rent, charges, reason: 'manual', note: f.get('note').trim() });
    });
    toast(t('saved'));
  },
  indexation: (f, form) => {
    const l = leaseOf(form.dataset.lease);
    const info = indexationStatus(l, prop(l.propertyId), irlTable(state), today());
    if (!info || info.state !== 'due') return;
    const from = f.get('applyFrom') || info.applyFrom;
    closeSheet();
    commit((s) => {
      const x = s.leases.find((y) => y.id === l.id);
      const cur = currentRent(x, today());
      x.rents = (x.rents || []).filter((r) => r.from !== from);
      x.rents.push({ from, rent: info.newRent, charges: cur.charges, reason: 'indexation', note: `IRL ${info.oldKey} → ${info.newKey}` });
      x.irl = { quarter: x.irl.quarter, key: info.newKey, value: info.newValue };
      x.lastRevision = info.anniversary;
    });
    toast(t('rentUpdated', { amount: fmtMoney(info.newRent) }));
  },
  endLease: (f, form) => {
    const endDate = f.get('endDate');
    const l = leaseOf(form.dataset.lease);
    if (endDate < l.startDate) { toast(t('endBeforeStart'), 'error'); return; }
    closeSheet();
    commit((s) => { s.leases.find((x) => x.id === l.id).endDate = endDate; });
  },
  expense: (f, form) => {
    const amount = parseMoney(f.get('amount'));
    if (amount === null) { toast(t('amountInvalid'), 'error'); return; }
    const id = form.dataset.id || uid();
    const data = { id, date: f.get('date'), amount, category: f.get('category'), propertyId: f.get('propertyId'), description: f.get('description').trim() };
    commit((s) => {
      const i = s.expenses.findIndex((x) => x.id === id);
      if (i >= 0) s.expenses[i] = data; else s.expenses.push(data);
    });
    toast(t('saved'));
    location.hash = `#/expenses?year=${data.date.slice(0, 4)}`;
  },
  taxLine230: (f, form) => {
    const year = form.dataset.year;
    const amount = parseMoney(f.get('line230')) || 0;
    commit((s) => { s.tax = { ...(s.tax || {}), [year]: { ...((s.tax || {})[year] || {}), line230: Math.max(0, amount) } }; });
    toast(t('saved'));
  },
  landlord: (f) => {
    commit((s) => {
      for (const k of ['name', 'address', 'postalCode', 'city', 'email', 'phone']) s.settings.landlord[k] = (f.get(k) || '').trim();
    });
    toast(t('saved'));
  },
};

// Recent lease: track from its first month. Older lease: from this month,
// so years of past rent don't show up as unpaid.
function defaultTrackFrom(startDate) {
  const startP = periodOf(startDate);
  const cur = periodOf(today());
  return startP >= addMonths(cur, -3) ? startP : cur;
}

const changes = {
  leaseStart: (el) => {
    const tf = el.form && el.form.elements.trackFrom;
    if (tf && el.value) tf.value = defaultTrackFrom(el.value);
  },
  expenseYear: (el) => {
    const r = route();
    const pid = r.query.get('property');
    location.hash = `#/expenses?year=${el.value}${pid ? '&property=' + pid : ''}`;
  },
  expenseProperty: (el) => {
    const r = route();
    const y = r.query.get('year') || today().slice(0, 4);
    location.hash = `#/expenses?year=${y}${el.value ? '&property=' + el.value : ''}`;
  },
};

// ---------------------------------------------------------------- v1.1 handlers

const ICS_URL = './export/echeances-locatives.ics';

Object.assign(actions, {
  // deadlines & reminders
  addReminder: () => reminderSheet(),
  fillReminder: (d, el) => {
    const f = el.closest('form');
    f.elements.title.value = d.title;
    if (d.date) f.elements.date.value = d.date;
  },
  reminderDone: (d) => commit((s) => {
    const r = s.reminders.find((x) => x.id === d.id);
    if (!r) return;
    if (r.repeat === 'yearly') { let next = addYears(r.date, 1); while (next < today()) next = addYears(next, 1); r.date = next; }
    else r.done = true;
  }),
  reminderDelete: (d) => {
    if (!confirm(t('confirmDelete'))) return;
    commit((s) => { s.reminders = s.reminders.filter((x) => x.id !== d.id); });
  },
  insuranceUpdate: (d) => insuranceSheet(d.lease),
  exportIcs: () => {
    const td = today();
    const items = deadlines(state, td).filter((i) => !i.soft && i.date >= td);
    if (!items.length) { toast(t('noDeadlines')); return; }
    const events = items.map((i) => ({ uid: i.id, date: i.date, title: `${dlTitle(i)}${i.who && i.who !== '—' ? ' – ' + i.who : ''}`, description: dlSub(i) }));
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const blob = new Blob([buildIcs(events, stamp)], { type: 'text/calendar' });
    // The offline cache serves this file at a normal address, so the iPhone
    // can open it like a calendar file from a website.
    const canOpen = 'caches' in window && navigator.serviceWorker && navigator.serviceWorker.controller;
    const show = (ready) => openSheet(t('addToCalendar'), `
      <p>${esc(t('icsCount', { n: events.length }))}</p>
      ${ready ? `<a class="btn block" href="${ICS_URL}?v=${Date.now()}">${icon('calendar')} ${esc(t('openInCalendar'))}</a>
      <p class="hint">${esc(t('openInCalendarHint'))}</p>` : ''}
      <button class="btn block secondary" data-action="icsShare">${esc(t('shareIcs'))}</button>
      <p class="hint">${esc(t('shareIcsHint'))}</p>`, (wrap) => { wrap.blob = blob; });
    if (!canOpen) { show(false); return; }
    caches.open('gl-export')
      .then((c) => c.put(ICS_URL, new Response(blob, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="echeances-locatives.ics"' } })))
      .then(() => show(true), () => show(false));
  },
  icsShare: (d, el) => {
    const wrap = el.closest('.sheet-wrap');
    if (wrap && wrap.blob) shareFile(wrap.blob, 'echeances-locatives.ics', 'text/calendar');
  },

  // monthly batch
  batchSend: async (d) => {
    const l = leaseOf(d.lease);
    const email = (l.tenants || []).map((x) => x.email).filter(Boolean).join(', ');
    if (email && navigator.clipboard) navigator.clipboard.writeText(email).catch(() => {});
    const built = batchDoc(d.type, l, d.period);
    if (!built) return;
    toast(email ? t('emailCopied', { email }) : t('noEmail'));
    const res = await makePdf(() => built);
    if (res && res !== 'cancelled') commit((s) => { s.sent[`${d.type}:${l.id}:${d.period}`] = today(); });
  },
  batchAll: (d) => {
    const list = leasesInPeriod(d.period);
    let doc = null;
    for (const l of list) {
      if (d.type === 'receipt') {
        const row = ledger(l, state.payments, today()).rows.find((x) => x.period === d.period);
        if (!row || row.paid < row.total || row.total <= 0) continue;
      }
      if (doc) doc.addPage(); else doc = newPdf();
      batchDoc(d.type, l, d.period, doc);
    }
    if (doc) makePdf(() => ({ doc, name: `${d.type === 'receipt' ? 'Quittances' : 'Avis-echeance'}_${d.period}.pdf` }));
  },

  // bank import
  importPick: () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.csv,.txt,text/csv,text/plain,application/vnd.ms-excel';
    inp.onchange = async () => {
      const file = inp.files && inp.files[0];
      if (!file) return;
      try {
        const text = await readText(file);
        const { rows } = parseCsv(text);
        const map = guessMapping(rows) || { headerRow: -1, date: 0, label: 1, amount: 2, debit: -1, credit: -1 };
        sessions.import = { fileName: file.name, rows, map, txs: [], choices: {} };
        rebuildImport();
        render();
      } catch (e) {
        console.error(e);
        toast(t('importFailed'), 'error');
      }
    };
    inp.click();
  },
  importReset: () => { sessions.import = null; render(); },
  importApply: async () => {
    await takeSnapshot('import');
    const s = sessions.import;
    const add = [];
    for (const tx of s.txs) {
      const c = s.choices[tx.fp];
      if (tx.amount > 0 && c && c.on && c.leaseId && !c.dup) {
        const method = isHousingAidLabel(tx.label) ? 'caf' : 'transfer';
        add.push({ id: uid(), leaseId: c.leaseId, amount: tx.amount, date: tx.date, method, note: tx.label.slice(0, 60), bankRef: tx.fp, bankLabel: tx.label });
      }
    }
    sessions.import = null;
    commit((st) => { st.payments.push(...add); });
    toast(t('importDone', { n: add.length }));
    location.hash = '#/';
  },

  // charges reconciliation
  regReload: (d) => {
    const [leaseId, year] = d.key.split(':');
    const l = leaseOf(leaseId);
    sessions.reg[d.key].lines = recoverableExpenses(state, l.propertyId, Number(year)).map((x) => ({ label: x.label, amount: x.amount }));
    render();
  },
  regLineAdd: (d) => { sessions.reg[d.key].lines.push({ label: '', amount: 0 }); render(); },
  regLineDel: (d) => { sessions.reg[d.key].lines.splice(Number(d.i), 1); render(); },
  regLetter: (d) => {
    const l = leaseOf(d.lease);
    const ses = sessions.reg[d.key];
    const reg = regularization(l, Number(d.year), ses.lines);
    makePdf(() => regularizationPdf(state, l, reg, ses.lines.filter((x) => x.amount), {
      dueDate: ses.dueDate,
      newMonthly: ses.updateProvision && isActive(l, today()) ? ses.newMonthly : null,
      newFrom: ses.newFrom || periodOf(ses.dueDate),
    }));
  },
  regUndo: (d) => {
    if (!confirm(t('confirmUndoReg'))) return;
    const y = Number(d.year);
    commit((s) => {
      const l = s.leases.find((x) => x.id === d.lease);
      l.adjustments = (l.adjustments || []).filter((a) => !(a.kind === 'regularization' && a.regYear === y));
      if (l.regularizations) delete l.regularizations[y];
    });
  },

  // departure
  depSave: (d) => {
    const l = leaseOf(d.lease);
    const ses = departureSession(l);
    if (ses.keysDate < l.startDate) { toast(t('endBeforeStart'), 'error'); return; }
    commit((s) => {
      const x = s.leases.find((y) => y.id === l.id);
      x.endDate = ses.keysDate;
      x.departure = { ...(x.departure || {}), ...ses, deductions: ses.deductions.map((z) => ({ ...z })) };
    });
    toast(t('saved'));
  },
  depDedAdd: (d) => { departureSession(leaseOf(d.lease)).deductions.push({ label: '', amount: 0 }); render(); },
  depDedDel: (d) => { departureSession(leaseOf(d.lease)).deductions.splice(Number(d.i), 1); persistDeparture(d.lease); render(); },
  depPdf: (d) => {
    const l = leaseOf(d.lease);
    const { ses, tmp, st } = departureData(l);
    makePdf(() => departurePdf(state, tmp, st, ses));
  },
  depReturned: (d) => depReturnedSheet(d.lease),

  // tax
  taxPdf: (d) => {
    const s = taxSummary(state, Number(d.year), today());
    const labels = {};
    for (const k of ['221', '222', '223', '224', '227', '229', '230', '250']) labels[k] = LINE_LABELS_FR[k];
    makePdf(() => taxSummaryPdf(state, s, labels));
  },
  taxCsv: (d) => {
    const csv = yearCsv(state, Number(d.year));
    shareFile(new Blob([csv], { type: 'text/csv' }), `comptes-locatifs-${d.year}.csv`, 'text/csv');
  },

  // documents
  docAdd: (d) => docAddSheet(d.type, d.owner),
  docOpen: (d) => { docOpenSheet(d.id); },
  docShare: (d, el) => {
    const wrap = el.closest('.sheet-wrap');
    const meta = byId(state.documents, d.id);
    if (wrap && wrap.blob && meta) shareFile(wrap.blob, meta.name, wrap.blob.type);
  },
  docDelete: (d) => {
    if (!confirm(t('confirmDelete'))) return;
    commit((s) => { removeDocs((x) => x.id === d.id); });
  },

  // diagnostics
  diagAdd: (d) => diagSheet(d.property, null),
  diagEdit: (d) => diagSheet(d.property, d.id),
  diagDelete: (d) => {
    if (!confirm(t('confirmDelete'))) return;
    closeSheet();
    commit((s) => { const p = s.properties.find((x) => x.id === d.property); p.diagnostics = p.diagnostics.filter((x) => x.id !== d.id); });
  },

  // one-off charges / credits
  adjAdd: (d) => adjSheet(d.lease),
  adjDelete: (d) => {
    if (!confirm(t('confirmDelete'))) return;
    commit((s) => { const l = s.leases.find((x) => x.id === d.lease); l.adjustments = l.adjustments.filter((a) => a.id !== d.id); });
  },

  letters: (d) => lettersSheet(d.lease),
});

function persistDeparture(leaseId) {
  const l = leaseOf(leaseId);
  if (!l.departure || !l.departure.keysDate) return; // only once the departure was saved
  const ses = departureSession(l);
  commit((s) => {
    const x = s.leases.find((y) => y.id === leaseId);
    x.departure = { ...x.departure, inventoryMatches: ses.inventoryMatches, deductions: ses.deductions.map((z) => ({ ...z })), retention: ses.retention, newAddress: ses.newAddress };
  });
}

Object.assign(forms, {
  reminder: (f) => {
    const r = { id: uid(), title: f.get('title').trim(), date: f.get('date'), repeat: f.get('yearly') ? 'yearly' : 'none', propertyId: f.get('propertyId') };
    closeSheet();
    commit((s) => { s.reminders.push(r); });
    toast(t('saved'));
  },
  insurance: (f, form) => {
    const until = f.get('until');
    closeSheet();
    commit((s) => { s.leases.find((x) => x.id === form.dataset.lease).insuranceUntil = until; });
    toast(t('saved'));
  },
  regApply: (f, form) => {
    const l = leaseOf(form.dataset.lease);
    const year = Number(form.dataset.year);
    const ses = sessions.reg[form.dataset.key];
    const reg = regularization(l, year, ses.lines);
    const dueDate = f.get('dueDate') || ses.dueDate || today();
    const update = ses.updateProvision && isActive(l, today());
    const newFrom = ses.newFrom || periodOf(dueDate);
    commit((s) => {
      const x = s.leases.find((y) => y.id === l.id);
      x.adjustments = (x.adjustments || []).filter((a) => !(a.kind === 'regularization' && a.regYear === year));
      if (reg.balance !== 0) {
        x.adjustments.push({ id: uid(), date: dueDate, label: `Régularisation des charges ${year}`, amount: reg.balance, kind: 'regularization', regYear: year });
      }
      if (update && ses.newMonthly !== null && ses.newMonthly !== undefined) {
        const r = rentAt(x, newFrom);
        x.rents = (x.rents || []).filter((y) => y.from !== newFrom);
        x.rents.push({ from: newFrom, rent: r.rent, charges: ses.newMonthly, reason: 'regularization' });
      }
      x.regularizations = { ...(x.regularizations || {}), [year]: { date: today(), balance: reg.balance, actual: reg.actualTotal, provisions: reg.provisions, tenantShare: reg.tenantShare } };
    });
    delete sessions.reg[form.dataset.key];
    toast(t('regApplied'));
    location.hash = `#/lease/${l.id}`;
  },
  depReturned: (f, form) => {
    const l = leaseOf(form.dataset.lease);
    const { ses, led, st } = departureData(l);
    const date = f.get('date') || today();
    const amount = parseMoney(f.get('amount')) || 0;
    closeSheet();
    // The penalty depends on the day the money actually went back.
    const final = departureStatement({ ...l, endDate: ses.keysDate }, led, { ...ses, returnedOn: date }, today());
    const { adjustments, payment } = depositSettlement(final, ses.deductions, ses.keysDate, date);
    commit((s) => {
      const x = s.leases.find((y) => y.id === l.id);
      x.adjustments = [...(x.adjustments || []), ...adjustments.map((a) => ({ id: uid(), ...a }))];
      if (payment) s.payments.push({ id: uid(), leaseId: x.id, ...payment });
      x.departure = { ...(x.departure || {}), ...ses, returnedOn: date, returnedAmount: amount, statement: { ...final, returnedOn: date } };
    });
    void st;
    toast(t('saved'));
  },
  docAdd: async (f, form) => {
    const files = [...form.elements.files.files];
    if (!files.length) return;
    const category = f.get('category');
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    const added = [];
    try {
      for (const file of files) {
        const c = file.type.startsWith('image/') ? await compressImage(file) : { blob: file, type: file.type || 'application/octet-stream', name: file.name };
        const data = await c.blob.arrayBuffer();
        const id = uid();
        await putFile(id, { name: c.name, type: c.type, data });
        added.push({ id, ownerType: form.dataset.type, ownerId: form.dataset.owner, name: c.name, type: c.type, size: data.byteLength, category, date: today() });
      }
    } catch (e) {
      console.error(e);
      toast(t('docSaveFailed'), 'error');
    }
    closeSheet();
    if (added.length) {
      commit((s) => { s.documents.push(...added); });
      toast(t('docsAdded', { n: added.length }));
    }
  },
  diag: (f, form) => {
    const pid = form.dataset.property;
    const id = form.dataset.id || uid();
    const d = { id, type: f.get('type'), date: f.get('date'), expiry: f.get('expiry') || '' };
    closeSheet();
    commit((s) => {
      const p = s.properties.find((x) => x.id === pid);
      p.diagnostics = (p.diagnostics || []).filter((x) => x.id !== id);
      p.diagnostics.push(d);
      if (d.type === 'dpe' && f.get('dpeClass')) p.dpe = f.get('dpeClass');
    });
  },
  adj: (f, form) => {
    const amount = parseMoney(f.get('amount'));
    if (!amount || amount <= 0) { toast(t('amountInvalid'), 'error'); return; }
    const a = { id: uid(), date: f.get('date'), label: f.get('label').trim(), amount: f.get('sign') === 'credit' ? -amount : amount, kind: 'other' };
    closeSheet();
    commit((s) => { const l = s.leases.find((x) => x.id === form.dataset.lease); l.adjustments = [...(l.adjustments || []), a]; });
  },
  letterCert: (f, form) => {
    const l = leaseOf(form.dataset.lease);
    makePdf(() => rentCertificatePdf(state, l, currentRent(l, today()), { upToDate: !!f.get('upToDate') }));
  },
  letterDeposit: (f, form) => {
    const l = leaseOf(form.dataset.lease);
    makePdf(() => depositReceiptPdf(state, l, { date: f.get('date') || l.startDate }));
  },
  letterGuarantor: (f, form) => {
    const l = leaseOf(form.dataset.lease);
    const years = Number(f.get('years')) || null;
    const g = { name: f.get('name').trim(), address: f.get('address').trim(), solidaire: f.get('solidaire') === '1', years, maxAmount: parseMoney(f.get('maxAmount')) || 0 };
    makePdf(() => guarantorPdf(state, l, g, currentRent(l, today())));
  },
});

Object.assign(changes, {
  batchPeriod: (el) => { location.hash = `#/batch?type=${el.dataset.type}&period=${el.value}`; },
  taxYear: (el) => { location.hash = `#/tax?year=${el.value}`; },
  regYear: (el) => { location.hash = `#/regularize/${el.dataset.lease}?year=${el.value}`; },
  impToggle: (el) => { const c = sessions.import.choices[el.dataset.fp]; c.on = el.checked; render(); },
  impLease: (el) => { const c = sessions.import.choices[el.dataset.fp]; c.leaseId = el.value; c.on = !!el.value; render(); },
  impMap: (el) => {
    const s = sessions.import;
    s.map[el.dataset.k] = Number(el.value);
    s.choices = {};
    rebuildImport();
    render();
  },
  regLine: (el) => {
    const line = sessions.reg[el.dataset.key].lines[Number(el.dataset.i)];
    if (el.dataset.f === 'amount') line.amount = parseMoney(el.value) || 0;
    else line.label = el.value;
    render();
  },
  regOpt: (el) => {
    const ses = sessions.reg[el.dataset.key];
    const k = el.dataset.f;
    if (k === 'updateProvision') ses.updateProvision = el.checked;
    else if (k === 'newMonthly') ses.newMonthly = parseMoney(el.value) || 0;
    else ses[k] = el.value;
    render();
  },
  depField: (el) => {
    const dl0 = leaseOf(el.dataset.lease);
    if (dl0.departure && dl0.departure.returnedOn) { render(); return; }
    const ses = departureSession(dl0);
    const k = el.dataset.f;
    if (k === 'inventoryMatches') ses.inventoryMatches = el.checked;
    else if (k === 'retention') ses.retention = parseMoney(el.value) || 0;
    else ses[k] = el.value;
    persistDeparture(el.dataset.lease);
    render();
  },
  depDed: (el) => {
    const dl0 = leaseOf(el.dataset.lease);
    if (dl0.departure && dl0.departure.returnedOn) { render(); return; }
    const line = departureSession(leaseOf(el.dataset.lease)).deductions[Number(el.dataset.i)];
    if (el.dataset.f === 'amount') line.amount = parseMoney(el.value) || 0;
    else line.label = el.value;
    persistDeparture(el.dataset.lease);
    render();
  },
  diagAuto: (el) => {
    const f = el.form;
    const exp = defaultExpiry(f.elements.type.value, f.elements.date.value);
    if (exp || el.name === 'type') f.elements.expiry.value = exp;
  },
});

// ---------------------------------------------------------------- v1.2 handlers

Object.assign(actions, {
  snapRestore: (d) => { restoreSnapshot(d.id); },
  supportExport: () => {
    const data = { app: 'gestion-locative', exportedAt: new Date().toISOString(), appVersion: APP_VERSION, ...anonymize(state), files: {} };
    shareFile(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), `gestion-locative-support-anonyme-${today()}.json`, 'application/json');
  },
  supportRefresh: async () => {
    const g = gh();
    try {
      const versions = await listVersions({ repo: g.repo, token: g.token });
      if (!versions.length) { toast(t('ghNoVersions')); return; }
      ghRestoreVersion(versions[0].sha);
    } catch (e) {
      toast(t('syncErr_' + ((e && e.code) || 'unknown')), 'error');
    }
  },
  syncNow: () => { clearTimeout(syncTimer); runSync(); },
  syncForce: () => {
    if (!confirm(t('confirmSyncForce'))) return;
    syncMeta().forceNext = true;
    clearTimeout(syncTimer);
    runSync();
  },
  ghOlder: () => { ghRestoreSheet(null, true); },
  ghRestore: () => { ghRestoreSheet(); },
  ghRestoreVersion: (d) => { ghRestoreVersion(d.sha); },
  ghToken: () => ghTokenSheet(),
  ghDisconnect: async () => {
    if (!confirm(t('confirmGhDisconnect'))) return;
    clearTimeout(syncTimer);
    secrets = {};
    await saveSecrets(secrets);
    render();
  },
});

Object.assign(forms, {
  ghConnect: async (f, form) => {
    const repo = parseRepo(f.get('repo'));
    const token = (f.get('token') || '').trim();
    const passphrase = f.get('passphrase') || '';
    if (!repo) { toast(t('ghRepoInvalid'), 'error'); return; }
    if (passphrase.length < 8) { toast(t('ghPassShort'), 'error'); return; }
    if (passphrase !== f.get('passphrase2')) { toast(t('ghPassMismatch'), 'error'); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = t('ghConnecting');
    const cfg = { repo, token };
    let remote = null;
    try {
      await checkRepo(cfg);
      remote = await getSha(cfg, DATA_PATH);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = t('ghConnect');
      toast(t('syncErr_' + ((e && e.code) || 'unknown')), 'error');
      return;
    }
    const mode = f.get('mode') === 'viewer' ? 'viewer' : 'main';
    secrets = { github: { repo, token, passphrase, tokenExpires: f.get('tokenExpires') || null, mode }, sync: {} };
    await saveSecrets(secrets);
    render();
    if (mode === 'viewer') {
      toast(t('ghViewerConnected'));
      if (remote) ghRestoreSheet(t('supportPickVersion'));
      else toast(t('ghNoVersions'));
      return;
    }
    toast(t('ghConnected'));
    if (remote && !hasData()) {
      ghRestoreSheet(t('ghRemoteFound'));
    } else if (remote) {
      if (confirm(t('ghRemoteExistsReplace'))) {
        syncMeta().dataSha = remote;
        runSync();
      } else {
        ghRestoreSheet(t('ghRemoteFound'));
      }
    } else {
      runSync();
    }
  },
  ghToken: async (f) => {
    const g = gh();
    const token = (f.get('token') || '').trim();
    try {
      await checkRepo({ repo: g.repo, token });
    } catch (e) {
      toast(t('syncErr_' + ((e && e.code) || 'unknown')), 'error');
      return;
    }
    g.token = token;
    g.tokenExpires = f.get('tokenExpires') || null;
    syncMeta().lastError = null;
    await saveSecrets(secrets);
    closeSheet();
    render();
    toast(t('ghTokenUpdated'));
    scheduleSync(1000);
  },
});

// ---------------------------------------------------------------- boot

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (fn) fn(new FormData(form), form);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) changes[el.dataset.change](el);
});

window.addEventListener('hashchange', () => { closeSheet(); render(); });

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let offered = false;
  const offer = (worker) => {
    if (offered) return;
    offered = true;
    const bar = document.createElement('div');
    bar.className = 'update-bar';
    bar.innerHTML = `<span>${esc(t('updateReady'))}</span><button class="btn small">${esc(t('reload'))}</button>`;
    bar.querySelector('button').onclick = () => worker.postMessage('skipWaiting');
    document.body.appendChild(bar);
  };
  // A new version can be found while the app starts, so watch every stage.
  const track = (w) => {
    if (!w) return;
    const check = () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w); };
    check();
    w.addEventListener('statechange', check);
  };
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    track(reg.installing);
    reg.addEventListener('updatefound', () => track(reg.installing));
    // An installed iPhone app can stay open for days: look for updates when it comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});
  // Reload only when an update replaces a running version, not on first install.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !hadController) return;
    reloaded = true;
    location.reload();
  });
}

// Light is the default. index.html applies the last choice before the page
// draws (from localStorage), so there is no dark flash; this keeps it in sync.
const THEME_COLORS = { light: '#f4f5f7', dark: '#111317' };
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme(theme) {
  const choice = ['light', 'dark', 'auto'].includes(theme) ? theme : 'light';
  const html = document.documentElement;
  if (choice === 'auto') delete html.dataset.theme;
  else html.dataset.theme = choice;
  const effective = choice === 'auto' ? (darkQuery && darkQuery.matches ? 'dark' : 'light') : choice;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[effective]);
  try { localStorage.setItem('gl-theme', choice); } catch (e) { /* private mode */ }
}

if (darkQuery && darkQuery.addEventListener) {
  darkQuery.addEventListener('change', () => { if ((state.settings.theme || 'light') === 'auto') applyTheme('auto'); });
}

async function boot() {
  try {
    state = await loadState();
  } catch (e) {
    root.innerHTML = `<div class="empty"><p>${esc('Storage unavailable / Stockage indisponible.')}</p></div>`;
    return;
  }
  setLang(state.settings.lang);
  document.documentElement.lang = state.settings.lang;
  // The theme is also saved instantly in localStorage when tapped, so it wins
  // if the app was closed before the main save finished.
  let saved = null;
  try { saved = localStorage.getItem('gl-theme'); } catch (e) { /* private mode */ }
  if (['light', 'dark', 'auto'].includes(saved) && saved !== state.settings.theme) {
    state.settings.theme = saved;
    persist();
  }
  applyTheme(state.settings.theme);
  try { secrets = await loadSecrets(); } catch (e) { secrets = {}; }
  render();
  askPersistentStorage();
  registerServiceWorker();
  // Data safety: today's snapshot, old deleted files, pending GitHub backup.
  dailySnapshot().then(cleanFiles);
  if (gh()) {
    const m = syncMeta();
    if (m.dirty || !m.lastOk) scheduleSync(4000);
  }
  document.addEventListener('visibilitychange', () => {
    // Leaving the app: send any pending change right away.
    if (document.visibilityState === 'hidden' && gh() && syncMeta().dirty) { clearTimeout(syncTimer); runSync(); }
  });
}

boot();
