import {
  addMonths, esc, fmtDate, fmtMoney, fmtPeriod, fmtPeriodCap, moneyInput, parseMoney,
  periodOf, todayStr, uid, addDays,
} from './util.js';
import {
  currentRent, dueForPeriod, dueDateFor, indexationStatus, isActive, ledger, monthOverview, sortedRents,
} from './calc.js';
import { fetchInseeIrl, fmtIrlKey, irlKey, irlTable, latestIrlKey } from './irl.js';
import { askPersistentStorage, backupBlob, emptyState, loadState, parseBackup, saveState } from './store.js';
import {
  deliver, formalNoticePdf, indexationPdf, receiptPdf, reminderPdf, rentCallPdf, shareFile,
} from './docs.js';
import { setLang, t } from './i18n.js';

export const APP_VERSION = '1.0.0';

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
  };
  const view = views[r.name] || viewHome;
  const scroll = root.dataset.route === location.hash ? window.scrollY : 0;
  root.innerHTML = view(r) + tabbar(TAB_OF[r.name] || 'home');
  root.dataset.route = location.hash;
  window.scrollTo(0, scroll);
  mountAfterRender(r);
}

// ---------------------------------------------------------------- home

function needsBackup() {
  if (!state.leases.length && !state.properties.length) return false;
  const last = state.settings.lastBackup;
  return !last || last < addDays(today(), -7);
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

  const list = items.map(({ lease, ledger: led, row }) => {
    let status;
    let amount = '';
    if (led.overdue > 0) { status = pill('late', t('lateAmount', { amount: fmtMoney(led.overdue) })); }
    else if (row) {
      status = pill(row.status);
      amount = row.status === 'paid' ? fmtMoney(row.total) : fmtMoney(row.total - row.paid);
    } else status = pill('upcoming', t('notStarted'));
    const showPay = led.owed > 0;
    return `<li class="row">
      <a class="row-main" href="#/lease/${lease.id}">
        <strong>${esc(tenantsLabel(lease))}</strong>
        <span class="muted">${esc(propName(prop(lease.propertyId)))}</span>
      </a>
      <div class="row-side">${status}${amount ? `<span class="amount">${amount}</span>` : ''}</div>
      ${showPay ? `<button class="btn small" data-action="pay" data-lease="${lease.id}">${esc(t('recordPaymentShort'))}</button>` : `<span class="done">${icon('check')}</span>`}
    </li>`;
  }).join('');

  return page({
    title: fmtPeriodCap(ov.period, state.settings.lang),
    body: `
      ${needsBackup() ? `<div class="banner warn"><span>${esc(state.settings.lastBackup ? t('backupOld', { date: fmtDate(state.settings.lastBackup) }) : t('backupNever'))}</span><button class="btn small" data-action="backup">${esc(t('backupNow'))}</button></div>` : ''}
      ${!state.settings.landlord.name ? `<a class="banner" href="#/settings">${esc(t('missingLandlord'))}</a>` : ''}
      <div class="tiles">
        <div class="tile"><span class="tile-label">${esc(t('dueThisMonth'))}</span><span class="tile-value">${fmtMoney(ov.due)}</span></div>
        <div class="tile"><span class="tile-label">${esc(t('receivedThisMonth'))}</span><span class="tile-value">${fmtMoney(ov.received)}</span></div>
        <div class="tile ${ov.overdue > 0 ? 'bad' : ''}"><span class="tile-label">${esc(t('overdueTotal'))}</span><span class="tile-value">${fmtMoney(ov.overdue)}</span></div>
      </div>
      ${revisions.length ? `<section class="card"><h3>${esc(t('revisionsDue'))}</h3><ul class="list plain">${revisions.map(({ l, info }) => `
        <li><a class="row-link" href="#/lease/${l.id}"><span><strong>${esc(tenantsLabel(l))}</strong><br><span class="muted">${esc(t('revisionLine', { from: fmtMoney(info.currentRent), to: fmtMoney(info.newRent), pct: info.pct.toFixed(2) }))}</span></span>${icon('chevron')}</a></li>`).join('')}</ul></section>` : ''}
      <section class="card flush">
        <h3 class="pad">${esc(t('thisMonthRents'))}</h3>
        ${items.length ? `<ul class="list">${list}</ul>` : empty(t('noActiveLeases'), `<a class="btn" href="#/lease-new">${esc(t('addLease'))}</a>`)}
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
        <button class="action" data-action="reminder" data-lease="${l.id}" ${led.overdue > 0 ? '' : 'disabled'}>${icon('doc')}<span>${esc(t('reminder'))}</span></button>
        <button class="action" data-action="notice" data-lease="${l.id}" ${led.overdue > 0 ? '' : 'disabled'}>${icon('doc')}<span>${esc(t('formalNotice'))}</span></button>
      </div>
      ${revision}
      <section class="card flush">
        <h3 class="pad">${esc(t('monthByMonth'))}</h3>
        ${led.opening ? `<p class="pad muted small">${esc(t('openingLine', { amount: fmtMoney(led.opening.total), paid: fmtMoney(led.opening.paid) }))}</p>` : ''}
        ${shown.length ? `<ul class="list">${ledgerList}</ul>` : empty(t('noPeriodsYet'))}
        ${!showAll && rows.length > 12 ? `<a class="more" href="#/lease/${l.id}?all=1">${esc(t('showAll', { n: rows.length }))}</a>` : ''}
      </section>
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
          <dt>${esc(t('irlRef'))}</dt><dd>${l.irl && l.irl.quarter ? esc(t('irlRefValue', { q: l.irl.quarter, key: fmtIrlKey(l.irl.key, lang), value: l.irl.value })) : esc(t('none'))}</dd>
          ${l.lastRevision ? `<dt>${esc(t('lastRevision'))}</dt><dd>${fmtDate(l.lastRevision)}</dd>` : ''}
          ${(l.tenants || []).map((x) => `<dt>${esc(t('tenant'))}</dt><dd>${esc(x.name)}${x.email ? `<br><a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}${x.phone ? `<br><a href="tel:${esc(x.phone)}">${esc(x.phone)}</a>` : ''}</dd>`).join('')}
          ${l.notes ? `<dt>${esc(t('notes'))}</dt><dd class="pre">${esc(l.notes)}</dd>` : ''}
        </dl>
        <h4>${esc(t('rentHistory'))}</h4>
        <ul class="list plain compact">${sortedRents(l).reverse().map((x) => `<li><span>${esc(t('fromPeriod', { period: fmtPeriod(x.from, lang) }))}</span><span>${fmtMoney(x.rent)} + ${fmtMoney(x.charges)}${x.reason === 'indexation' ? ' · IRL' : ''}</span></li>`).join('')}</ul>
      </section>
      <div class="danger-zone">
        ${isActive(l, td) ? `<button class="btn ghost" data-action="endLease" data-lease="${l.id}">${esc(t('endLease'))}</button>` : ''}
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
      </section>
      <section class="card">
        <h3>${esc(t('datesAndRent'))}</h3>
        <div class="grid2">
          ${field(t('startDate'), input('startDate', l.startDate, `type="date" required${isNew ? ' data-change="leaseStart"' : ''}`))}
          ${field(t('endDate'), input('endDate', l.endDate, 'type="date"'), t('endDateHint'))}
        </div>
        ${isNew ? `<div class="grid2">
          ${moneyField(t('rentHC'), 'rent', null, '', 'required')}
          ${moneyField(t('charges'), 'charges', 0)}
        </div>` : `<p class="hint">${esc(t('rentEditHint'))}</p>`}
        <div class="grid2">
          ${field(t('chargesType'), select('chargesType', [['provision', t('chargesProvision')], ['forfait', t('chargesForfait')]], l.chargesType))}
          ${field(t('paymentDay'), input('paymentDay', l.paymentDay || 1, 'type="number" min="1" max="28" inputmode="numeric"'))}
        </div>
        ${moneyField(t('deposit'), 'deposit', l.deposit)}
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
      ${isNew ? `<section class="card">
        <h3>${esc(t('trackingSection'))}</h3>
        <p class="hint">${esc(t('trackingHint'))}</p>
        <div class="grid2">
          ${field(t('trackFrom'), input('trackFrom', '', 'type="month"'))}
          ${moneyField(t('openingBalance'), 'openingBalance', 0, t('openingBalanceHint'))}
        </div>
      </section>` : ''}
      <section class="card">
        ${field(t('notes'), `<textarea name="notes" rows="3">${esc(l.notes || '')}</textarea>`)}
      </section>
      <button class="btn block" type="submit">${esc(t('save'))}</button>
    </form>`,
  });
}

// ---------------------------------------------------------------- expenses

export const EXPENSE_CATEGORIES = ['management', 'insurance', 'works', 'propertyTax', 'condo', 'loanInterest', 'loanInsurance', 'recoverable', 'other'];
export const LINE_2044 = { management: '221', insurance: '223', works: '224', propertyTax: '227', condo: '229', loanInterest: '250', loanInsurance: '250' };

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
    </form>`,
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
        <p class="hint">${esc(t('signatureHint'))}</p>
        ${s.signature ? `<img class="sig-preview" src="${s.signature}" alt="">` : ''}
        <canvas id="sigpad" class="sigpad" width="600" height="220"></canvas>
        <div class="btn-row">
          <button class="btn secondary" type="button" data-action="sigClear">${esc(t('clear'))}</button>
          <button class="btn" type="button" data-action="sigSave">${esc(t('saveSignature'))}</button>
          ${s.signature ? `<button class="btn ghost danger" type="button" data-action="sigRemove">${esc(t('remove'))}</button>` : ''}
        </div>
      </section>
      <section class="card">
        <h3>${esc(t('irlTitle'))}</h3>
        <ul class="list plain compact">${recent.map((k) => `<li><span>${esc(fmtIrlKey(k, s.lang))}</span><span>${table[k].toFixed(2).replace('.', ',')}</span></li>`).join('')}</ul>
        <p class="hint">${esc(t('irlLatest', { key: fmtIrlKey(latest, s.lang) }))}${s.irlUpdated ? ' ' + esc(t('irlUpdatedOn', { date: fmtDate(s.irlUpdated) })) : ''}</p>
        <button class="btn secondary" data-action="irlUpdate">${esc(t('irlUpdate'))}</button>
      </section>
      <section class="card">
        <h3>${esc(t('backupTitle'))}</h3>
        <p class="hint">${esc(t('backupHint'))}</p>
        <p>${esc(s.lastBackup ? t('lastBackup', { date: fmtDate(s.lastBackup) }) : t('backupNever'))}</p>
        <div class="btn-row">
          <button class="btn" data-action="backup">${esc(t('backupNow'))}</button>
          <button class="btn secondary" data-action="restore">${esc(t('restoreBtn'))}</button>
        </div>
        <p class="hint">${esc(t('dataCounts', { p: state.properties.length, l: state.leases.length, pay: state.payments.length, e: state.expenses.length }))}</p>
      </section>
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

// ---------------------------------------------------------------- after render (canvas etc.)

function mountAfterRender(r) {
  if (r.name === 'settings') mountSignaturePad();
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
    await deliver(build());
  } catch (e) {
    console.error(e);
    toast(t('pdfError'), 'error');
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
    makePdf(() => reminderPdf(state, l, ledger(l, state.payments, today())));
  },
  notice: (d) => {
    const l = leaseOf(d.lease);
    makePdf(() => formalNoticePdf(state, l, ledger(l, state.payments, today())));
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
  deleteProperty: (d) => {
    const n = leasesFor(d.id).length;
    if (!confirm(n ? t('confirmDeletePropertyLeases', { n }) : t('confirmDeleteProperty'))) return;
    const leaseIds = new Set(leasesFor(d.id).map((l) => l.id));
    commit((s) => {
      s.properties = s.properties.filter((x) => x.id !== d.id);
      s.leases = s.leases.filter((l) => !leaseIds.has(l.id));
      s.payments = s.payments.filter((x) => !leaseIds.has(x.leaseId));
      s.expenses = s.expenses.map((e) => (e.propertyId === d.id ? { ...e, propertyId: '' } : e));
    });
    location.hash = '#/properties';
  },
  deleteLease: (d) => {
    if (!confirm(t('confirmDeleteLease'))) return;
    commit((s) => {
      s.leases = s.leases.filter((x) => x.id !== d.id);
      s.payments = s.payments.filter((x) => x.leaseId !== d.id);
    });
    location.hash = '#/leases';
  },
  deleteExpense: (d) => {
    if (!confirm(t('confirmDeleteExpense'))) return;
    commit((s) => { s.expenses = s.expenses.filter((x) => x.id !== d.id); });
    location.hash = '#/expenses';
  },
  lang: (d) => {
    commit((s) => { s.settings.lang = d.lang; });
    setLang(d.lang);
    document.documentElement.lang = d.lang;
    render();
  },
  sigClear: () => { const c = document.getElementById('sigpad'); c.getContext('2d').clearRect(0, 0, c.width, c.height); sigDirty = false; },
  sigSave: () => {
    if (!sigDirty) { toast(t('signatureEmpty')); return; }
    const data = document.getElementById('sigpad').toDataURL('image/png');
    commit((s) => { s.settings.signature = data; });
    toast(t('saved'));
  },
  sigRemove: () => commit((s) => { s.settings.signature = null; }),
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
    const res = await shareFile(backupBlob(state), name, 'application/json');
    if (res !== 'cancelled') {
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
        const next = parseBackup(await file.text());
        const msg = t('confirmRestore', { p: next.properties.length, l: next.leases.length, pay: next.payments.length });
        if (!confirm(msg)) return;
        state = next;
        setLang(state.settings.lang);
        await persist();
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
    const lang = state.settings.lang;
    state = emptyState();
    state.settings.lang = lang;
    await persist();
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
      notes: f.get('notes').trim(),
    };
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
    const period = f.get('period');
    const due = { ...dueForPeriod(l, period), dueDate: dueDateFor(l, period) };
    let previous = 0;
    if (f.get('withBalance')) {
      const led = ledger(l, state.payments, today());
      for (const r of led.rows) if (r.period < period) previous += r.total - r.paid;
      if (led.opening) previous += led.opening.total - led.opening.paid;
      previous -= led.credit;
    }
    makePdf(() => rentCallPdf(state, l, due, Math.max(0, previous)));
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
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    const offer = (worker) => {
      const bar = document.createElement('div');
      bar.className = 'update-bar';
      bar.innerHTML = `<span>${esc(t('updateReady'))}</span><button class="btn small">${esc(t('reload'))}</button>`;
      bar.querySelector('button').onclick = () => worker.postMessage('skipWaiting');
      document.body.appendChild(bar);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
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

async function boot() {
  try {
    state = await loadState();
  } catch (e) {
    root.innerHTML = `<div class="empty"><p>${esc('Storage unavailable / Stockage indisponible.')}</p></div>`;
    return;
  }
  setLang(state.settings.lang);
  document.documentElement.lang = state.settings.lang;
  render();
  askPersistentStorage();
  registerServiceWorker();
}

boot();
