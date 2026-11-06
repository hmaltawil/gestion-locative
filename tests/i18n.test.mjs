// Run with: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { _dicts } from '../js/i18n.js';

test('French and English have exactly the same phrases', () => {
  const fr = Object.keys(_dicts.fr);
  const en = Object.keys(_dicts.en);
  assert.deepEqual(fr.filter((k) => !en.includes(k)), [], 'missing in English');
  assert.deepEqual(en.filter((k) => !fr.includes(k)), [], 'missing in French');
});

test("every t('key') used in the screens exists", () => {
  const src = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  // keys built at run time, like t('status_' + x), are skipped
  const used = [...src.matchAll(/(?<![\w.])t\('([A-Za-z0-9_-]+)'(?!\s*\+)/g)].map((m) => m[1]);
  const missing = used.filter((k) => !(k in _dicts.fr));
  assert.deepEqual([...new Set(missing)], []);
});
