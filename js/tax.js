// Summary for the French tax form 2044 (unfurnished rentals, "régime réel").
// Rents are counted when they were received (cash basis), excluding charges.
// This is a guide: check every figure against that year's 2044 instructions.

import { ledger, rentAt, isActive } from './calc.js';
import { occupancyDays } from './charges.js';

export const LINE_2044 = {
  management: '221', insurance: '223', works: '224', propertyTax: '227', condo: '229', loanInterest: '250', loanInsurance: '250',
};
export const MICRO_FONCIER_LIMIT = 1500000; // 15 000 € of gross rents
export const FLAT_FEE_PER_PROPERTY = 2000; // line 222: 20 € per property

function inYear(date, year) {
  return date && date.startsWith(String(year));
}

// Rent (excl. charges) received in the year for one lease, by allocation date.
export function rentReceived(lease, payments, year, today) {
  const led = ledger(lease, payments, today);
  let rent = 0;
  let charges = 0;
  for (const d of led.debts) {
    if (d.kind === 'adjustment') continue;
    for (const a of d.allocations) {
      if (!a.real || !inYear(a.date, year)) continue;
      let ratio;
      if (d.kind === 'period') ratio = d.total ? d.rent / d.total : 1;
      else {
        const r = rentAt(lease, lease.trackFrom || lease.startDate.slice(0, 7));
        ratio = r.rent + r.charges ? r.rent / (r.rent + r.charges) : 1;
      }
      const part = Math.round(a.amount * ratio);
      rent += part;
      charges += a.amount - part;
    }
  }
  // Money received in advance is taxable when received.
  for (const u of led.unallocated) {
    if (!inYear(u.date, year)) continue;
    const r = rentAt(lease, u.date.slice(0, 7));
    const ratio = r.rent + r.charges ? r.rent / (r.rent + r.charges) : 1;
    const part = Math.round(u.amount * ratio);
    rent += part;
    charges += u.amount - part;
  }
  return { rent, charges };
}

export function taxSummary(state, year, today) {
  const props = state.properties.map((p) => {
    const leases = state.leases.filter((l) => l.propertyId === p.id);
    let rent = 0;
    let charges = 0;
    for (const l of leases) {
      const r = rentReceived(l, state.payments, year, today);
      rent += r.rent;
      charges += r.charges;
    }
    const rented = leases.some((l) => l.startDate <= `${year}-12-31` && occupancyDays(l, year) > 0);
    const lines = {};
    for (const e of state.expenses) {
      if (e.propertyId !== p.id || !inYear(e.date, year)) continue;
      const line = LINE_2044[e.category];
      if (line) lines[line] = (lines[line] || 0) + e.amount;
    }
    return { property: p, rent, charges, rented, lines };
  });
  const general = {};
  for (const e of state.expenses) {
    if (e.propertyId || !inYear(e.date, year)) continue;
    const line = LINE_2044[e.category];
    if (line) general[line] = (general[line] || 0) + e.amount;
  }
  const notDeductible = state.expenses
    .filter((e) => inYear(e.date, year) && !LINE_2044[e.category])
    .reduce((s, e) => s + e.amount, 0);

  const lines = {};
  const add = (k, v) => { if (v) lines[k] = (lines[k] || 0) + v; };
  for (const p of props) for (const [k, v] of Object.entries(p.lines)) add(k, v);
  for (const [k, v] of Object.entries(general)) add(k, v);
  const rentedCount = props.filter((p) => p.rented || p.rent > 0).length;
  add('222', rentedCount * FLAT_FEE_PER_PROPERTY);
  const gross = props.reduce((s, p) => s + p.rent, 0);
  lines['211'] = gross;
  lines['215'] = gross;
  const expenses = ['221', '222', '223', '224', '225', '226', '227', '228', '229', '230'].reduce((s, k) => s + (lines[k] || 0), 0);
  lines['240'] = expenses;
  const interest = lines['250'] || 0;
  const result = gross - expenses - interest;
  return {
    year,
    properties: props,
    general,
    lines,
    gross,
    expenses,
    interest,
    result,
    rentedCount,
    notDeductible,
    chargesReceived: props.reduce((s, p) => s + p.charges, 0),
    microEligible: gross <= MICRO_FONCIER_LIMIT,
    microTaxable: Math.round(gross * 0.7),
    activeLeases: state.leases.filter((l) => isActive(l, `${year}-12-31`)).length,
  };
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function euros(cents) {
  return (cents / 100).toFixed(2).replace('.', ',');
}

// Every payment and expense of the year, for an accountant (opens in Excel/Numbers).
export function yearCsv(state, year) {
  const propName = (id) => { const p = state.properties.find((x) => x.id === id); return p ? p.name || p.address : ''; };
  const rows = [['Date', 'Type', 'Bien', 'Locataire / description', 'Catégorie', 'Ligne 2044', 'Montant (EUR)']];
  for (const pay of state.payments) {
    if (!inYear(pay.date, year)) continue;
    const l = state.leases.find((x) => x.id === pay.leaseId);
    const who = l ? (l.tenants || []).map((t) => t.name).join(' & ') : '';
    rows.push([pay.date, 'Encaissement', l ? propName(l.propertyId) : '', who, pay.method || '', '', euros(pay.amount)]);
  }
  for (const e of state.expenses) {
    if (!inYear(e.date, year)) continue;
    rows.push([e.date, 'Dépense', e.propertyId ? propName(e.propertyId) : 'Général', e.description || '', e.category, LINE_2044[e.category] || '', euros(-e.amount)]);
  }
  const [head, ...body] = rows;
  body.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return '\uFEFF' + [head, ...body].map((r) => r.map(csvCell).join(';')).join('\r\n');
}
