// La bibliothèque de modèles installée par le serveur doit correspondre à sa source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTemplateLibrary } from '../src/lib/templates/library.js';
import { LIBRARY_FILE, serialize } from '../scripts/make-templates.mjs';
import { normalizeDataset } from '../src/lib/stats/model.js';
import { analyze } from '../src/lib/stats/analysis.js';
import { getCalculator } from '../src/lib/calc/calculators.js';
import { SAMPLE_TYPES } from '../src/lib/inventory.js';

const lib = buildTemplateLibrary();

test('server/src/lib/template-library.json est à jour (sinon : npm --prefix client run templates)', () => {
  assert.equal(fs.readFileSync(LIBRARY_FILE, 'utf8'), serialize(lib));
});

const slots = (t) => {
  const out = [];
  const walk = (n) => { if (n.type === 'templateSlot') out.push(n.attrs); (n.content ?? []).forEach(walk); };
  walk(t.content);
  return out;
};

test('emplacements « graphique » : le jeu préparé s’ouvre et attend ses valeurs', () => {
  const stats = lib.flatMap(slots).filter((s) => s.tool === 'stats');
  assert.ok(stats.length >= 3);
  for (const s of stats) {
    const ds = normalizeDataset(s.preset.dataset);
    assert.ok(ds.columns.length >= 1 && ds.rows.length >= 4, s.id);
    const res = analyze(ds);
    assert.ok(res.error, `${s.id} : un tableau vide doit demander des valeurs`);
  }
});

test('emplacements « calcul » et « gel » : préréglages connus', () => {
  for (const s of lib.flatMap(slots)) {
    if (s.tool === 'calc') assert.ok(getCalculator(s.preset.kind), s.id);
    if (s.tool === 'gel') assert.ok(['protein', 'western', 'dna'].includes(s.preset.mode), s.id);
    if (s.tool === 'samples') assert.ok(SAMPLE_TYPES[s.preset.type], s.id);
  }
});
