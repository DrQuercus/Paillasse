// Graphique et statistiques dans une entrée : validation, rendu imprimable, texte de recherche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanDataset, cleanStatNode, statAttachmentIds } from '../src/lib/stat.js';
import { renderDoc } from '../src/lib/render.js';
import { docToPlainText } from '../src/lib/doc.js';

const img = '/api/files/5b6423a3-d199-4f66-bc48-c4ba5705d649';
const dataset = { v: 1, kind: 'column', title: 'Activité', columns: [{ id: 'a', name: 'Témoin' }, { id: 'b', name: 'Traité' }], rows: [{ id: 'r1', v: { a: ['1'], b: ['2'] } }] };
const node = {
  type: 'statFigure',
  attrs: {
    dataset,
    images: [{ src: img, width: 520, height: 400, alt: 'Graphique <A>' }, { src: 'javascript:alert(1)' }],
    summary: {
      title: 'Activité', kind: 'Colonnes', analysis: 'Comparer deux colonnes', method: 'Test t de Student non apparié (bilatéral).',
      sections: [
        { title: 'Test t non apparié', rows: [['Valeur de P', '0,0123'], ['Résumé', '*']] },
        { title: 'Comparaisons', table: { columns: ['Comparaison', 'P'], rows: [['Traité vs Témoin', '0,0123']] } },
      ],
      warnings: ['Moins de trois valeurs'],
    },
    width: 50,
  },
};

test('validation : image servie par Paillasse, jeu de données de forme connue', () => {
  const clean = cleanStatNode(node);
  assert.equal(clean.attrs.images.length, 1);
  assert.deepEqual(statAttachmentIds(clean.attrs), ['5b6423a3-d199-4f66-bc48-c4ba5705d649']);
  assert.equal(clean.attrs.width, 50);
  assert.throws(() => cleanStatNode({ ...node, attrs: { ...node.attrs, images: [] } }), /pas de graphique/);
  assert.throws(() => cleanDataset({ ...dataset, kind: 'camembert' }), /inconnu/);
  assert.throws(() => cleanDataset({ ...dataset, rows: new Array(10001).fill({}) }), /trop de lignes/);
});

test('rendu imprimable : graphique, méthode, résultats échappés', () => {
  const html = renderDoc({ type: 'doc', content: [cleanStatNode(node)] }, { rewriteUrl: (u) => u.replace('/api/files/', '../files/') });
  assert.match(html, /<figure class="statfig">/);
  assert.match(html, /<img src="\.\.\/files\/5b6423a3[^"]*" alt="Graphique &lt;A&gt;" style="width:50%">/);
  assert.match(html, /<th>Valeur de P<\/th><td>0,0123<\/td>/);
  assert.match(html, /<td>Traité vs Témoin<\/td>/);
  assert.match(html, /⚠ Moins de trois valeurs/);
});

test('recherche : titre, test et valeurs de P', () => {
  const text = docToPlainText({ type: 'doc', content: [cleanStatNode(node)] });
  assert.match(text, /Activité — Colonnes — Comparer deux colonnes/);
  assert.match(text, /Test t de Student/);
  assert.match(text, /Valeur de P : 0,0123/);
});
