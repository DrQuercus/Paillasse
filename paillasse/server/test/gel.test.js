// Figure de gel : validation, rendu imprimable (et export), texte de recherche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanGelNode, gelAttachmentIds } from '../src/lib/gel.js';
import { renderDoc } from '../src/lib/render.js';
import { docToPlainText } from '../src/lib/doc.js';

const img = '/api/files/0b6423a3-d199-4f66-bc48-c4ba5705d649';
const orig = '9c1e2b3a-0000-4f66-bc48-c4ba5705d649';
const node = {
  type: 'gelFigure',
  attrs: {
    analysis: { v: 1, mode: 'protein', source: { attachmentId: orig, filename: 'gel.tif' }, lanes: [] },
    images: [{ panel: 'gel', src: img, width: 800, height: 600, alt: 'Gel <IP>' }, { panel: 'profiles', src: 'https://ailleurs.example/x.png' }],
    summary: {
      title: 'Purification de DegU', mode: 'Protéines (SDS-PAGE)', lanes: ['M (marqueur)', 'Input', 'Élution'],
      table: { columns: ['Bande', 'Input', 'Élution'], rows: [['28 kDa', '12 %', '91 %']] },
      notes: ['Valeurs : % de la piste (pureté).'],
    },
    layout: 'row',
    width: 75,
  },
};

test('validation : seules les images servies par Paillasse sont gardées', () => {
  const clean = cleanGelNode(node);
  assert.equal(clean.attrs.images.length, 1);
  assert.equal(clean.attrs.images[0].src, img);
  assert.deepEqual(gelAttachmentIds(clean.attrs), ['0b6423a3-d199-4f66-bc48-c4ba5705d649', orig]);
  assert.throws(() => cleanGelNode({ type: 'gelFigure', attrs: { ...node.attrs, images: [] } }), /aucune image/);
  assert.throws(() => cleanGelNode({ type: 'gelFigure', attrs: { ...node.attrs, analysis: null } }), /manquante/);
});

test('rendu imprimable et export : images réécrites, tableau, notes', () => {
  const html = renderDoc({ type: 'doc', content: [cleanGelNode(node)] }, { rewriteUrl: (u) => u.replace('/api/files/', '../files/') });
  assert.match(html, /<figure class="gelfig gelfig-row" style="width:75%">/);
  assert.match(html, /<img src="\.\.\/files\/0b6423a3/);
  assert.match(html, /alt="Gel &lt;IP&gt;"/);
  assert.match(html, /<td>91 %<\/td>/);
});

test('texte de recherche', () => {
  const text = docToPlainText({ type: 'doc', content: [node] });
  assert.match(text, /Purification de DegU — Protéines/);
  assert.match(text, /28 kDa ; 12 % ; 91 %/);
});
