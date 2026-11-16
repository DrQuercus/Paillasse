// Encart de calcul : validation, rendu imprimable et texte de recherche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcSummary, cleanCalcNode } from '../src/lib/calc.js';
import { renderDoc } from '../src/lib/render.js';
import { docToPlainText } from '../src/lib/doc.js';

const summary = {
  title: 'Pesée',
  label: 'Stock NaCl <5 M>',
  formula: 'm = C × V × M',
  inputs: [{ label: 'Produit', value: 'NaCl (M = 58,44 g/mol)' }, { label: 'Concentration voulue', value: '5 M' }],
  results: [{ label: 'Masse à peser', value: '29,22 g', main: true }],
  notes: ['Dissoudre dans un volume inférieur, puis compléter au volume final.'],
};
const node = { type: 'labCalc', attrs: { kind: 'molarity', params: { mw: '58,44' }, summary } };

test('rendu imprimable : résumé échappé, résultat principal en évidence', () => {
  const html = renderDoc({ type: 'doc', content: [node] });
  assert.match(html, /<section class="calc">/);
  assert.match(html, /Stock NaCl &lt;5 M&gt;/);
  assert.match(html, /<div class="main"><dt>Masse à peser<\/dt><dd>29,22 g<\/dd><\/div>/);
  assert.match(html, /m = C × V × M/);
});

test('rendu d’un tableau (tampon, master mix) et d’un résumé abîmé', () => {
  const html = renderDoc({ type: 'doc', content: [{ type: 'labCalc', attrs: { summary: { ...summary, table: { columns: ['Composant', 'À ajouter'], rows: [['Tris', '788 mg']] } } } }] });
  assert.match(html, /<th>Composant<\/th><th>À ajouter<\/th>/);
  assert.match(html, /<td>Tris<\/td><td>788 mg<\/td>/);
  assert.doesNotThrow(() => renderDoc({ type: 'doc', content: [{ type: 'labCalc', attrs: { summary: 'n’importe quoi' } }] }));
  assert.equal(calcSummary(null).title, 'Calcul');
});

test('texte brut : le calcul est trouvé par la recherche', () => {
  const text = docToPlainText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Préparation' }] }, node] });
  assert.match(text, /Pesée : Stock NaCl <5 M>/);
  assert.match(text, /Masse à peser : 29,22 g/);
});

test('ajout depuis la page Calculs : seul un calcul complet est accepté', () => {
  const clean = cleanCalcNode(node);
  assert.equal(clean.attrs.kind, 'molarity');
  assert.deepEqual(clean.attrs.params, { mw: '58,44' });
  assert.equal(clean.attrs.summary.results[0].main, true);
  assert.throws(() => cleanCalcNode({ type: 'image', attrs: {} }), /encart de calcul/);
  assert.throws(() => cleanCalcNode({ ...node, attrs: { ...node.attrs, kind: '<script>' } }), /invalide/);
  assert.throws(() => cleanCalcNode({ ...node, attrs: { ...node.attrs, summary: { ...summary, results: [] } } }), /manquant/);
});
