// IRL: Indice de référence des loyers (INSEE series 001515333, metropolitan France).
// The table below is a built-in copy; the app can refresh it from INSEE.

export const IRL_BUILTIN = {
  '2015-Q1': 125.19, '2015-Q2': 125.25, '2015-Q3': 125.26, '2015-Q4': 125.28,
  '2016-Q1': 125.26, '2016-Q2': 125.25, '2016-Q3': 125.33, '2016-Q4': 125.5,
  '2017-Q1': 125.9, '2017-Q2': 126.19, '2017-Q3': 126.46, '2017-Q4': 126.82,
  '2018-Q1': 127.22, '2018-Q2': 127.77, '2018-Q3': 128.45, '2018-Q4': 129.03,
  '2019-Q1': 129.38, '2019-Q2': 129.72, '2019-Q3': 129.99, '2019-Q4': 130.26,
  '2020-Q1': 130.57, '2020-Q2': 130.57, '2020-Q3': 130.59, '2020-Q4': 130.52,
  '2021-Q1': 130.69, '2021-Q2': 131.12, '2021-Q3': 131.67, '2021-Q4': 132.62,
  '2022-Q1': 133.93, '2022-Q2': 135.84, '2022-Q3': 136.27, '2022-Q4': 137.26,
  '2023-Q1': 138.61, '2023-Q2': 140.59, '2023-Q3': 141.03, '2023-Q4': 142.06,
  '2024-Q1': 143.46, '2024-Q2': 145.17, '2024-Q3': 144.51, '2024-Q4': 144.64,
  '2025-Q1': 145.47, '2025-Q2': 146.68, '2025-Q3': 145.77, '2025-Q4': 145.78,
  '2026-Q1': 146.6, '2026-Q2': 148.37, '2026-Q3': 148.06,
};

export const INSEE_IRL_URL = 'https://bdm.insee.fr/series/sdmx/data/SERIES_BDM/001515333?startPeriod=2015-Q1';

// Parses INSEE's SDMX XML answer into { 'YYYY-Qn': value }.
export function parseInseeXml(xml) {
  const out = {};
  const re = /<Obs\b([^>]*)\/?>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const p = /TIME_PERIOD="(\d{4}-Q[1-4])"/.exec(attrs);
    const v = /OBS_VALUE="([\d.]+)"/.exec(attrs);
    if (p && v) out[p[1]] = parseFloat(v[1]);
  }
  return out;
}

export async function fetchInseeIrl() {
  const res = await fetch(INSEE_IRL_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const table = parseInseeXml(await res.text());
  if (Object.keys(table).length < 8) throw new Error('Unexpected answer');
  return table;
}

// Built-in values, overridden by anything stored in the user's data.
export function irlTable(state) {
  return { ...IRL_BUILTIN, ...(state.irl || {}) };
}

export function irlKey(year, quarter) {
  return `${year}-Q${quarter}`;
}

export function latestIrlKey(table) {
  return Object.keys(table).sort().pop();
}

// Most recent published value for a given quarter number (1-4).
export function latestForQuarter(table, quarter) {
  const keys = Object.keys(table).filter((k) => k.endsWith('-Q' + quarter)).sort();
  if (!keys.length) return null;
  const key = keys[keys.length - 1];
  return { key, year: Number(key.slice(0, 4)), quarter: Number(quarter), value: table[key] };
}

export function fmtIrlKey(key, lang = 'fr') {
  if (!key) return '—';
  const [y, q] = String(key).split('-Q');
  return lang === 'fr' ? `${q}${q === '1' ? 'er' : 'e'} trimestre ${y}` : `Q${q} ${y}`;
}
