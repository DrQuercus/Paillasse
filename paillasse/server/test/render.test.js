// Tests rapides : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoc, renderEntryPage } from '../src/lib/render.js';
import { canonicalize } from '../src/lib/hash.js';
import { docToPlainText } from '../src/lib/doc.js';

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Voir ', marks: [] }, { type: 'text', text: 'le lien', marks: [{ type: 'link', attrs: { href: '/api/files/0b6423a3-d199-4f66-bc48-c4ba5705d649' } }] }] },
    { type: 'image', attrs: { src: '/api/files/0b6423a3-d199-4f66-bc48-c4ba5705d649', alt: 'gel <SDS>', size: 50 } },
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', attrs: { colspan: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] }] }] },
  ],
};

test('rendu avec image et lien, sans option (page imprimable)', () => {
  const html = renderDoc(doc);
  assert.match(html, /<img style="width:50%" src="\/api\/files\//);
  assert.match(html, /<a href="\/api\/files\//);
  assert.match(html, /alt="gel &lt;SDS&gt;"/);
  assert.match(html, /<th colspan="2">/);
});

test('rendu avec rewriteUrl explicitement indéfini', () => {
  assert.doesNotThrow(() => renderDoc(doc, { rewriteUrl: undefined }));
});

test('réécriture des liens pour l\'export', () => {
  const html = renderDoc(doc, { rewriteUrl: (u) => u.replace('/api/files/', '../files/') });
  assert.match(html, /src="\.\.\/files\//);
});

test('page complète d\'une version', () => {
  const html = renderEntryPage({
    entry: { title: 'T', entry_date: '2026-09-23', content: doc },
    project: { name: 'P' },
    version: { version_number: 2, kind: 'lock', note: '', title: 'T', entry_date: '2026-09-23', content: doc, created_at: new Date(), hash: 'abc', prev_hash: 'def' },
    author: 'Louis',
    printButton: true,
  });
  assert.match(html, /Version 2 \(verrouillage\)/);
  assert.match(html, /<img/);
});

test('JSON canonique indépendant de l\'ordre des clés', () => {
  assert.equal(canonicalize({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } }), canonicalize({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
});

test('texte brut pour la recherche', () => {
  assert.match(docToPlainText(doc), /Voir le lien/);
});

test('bloc séquence : rendu imprimable et texte de recherche', () => {
  const d = { type: 'doc', content: [{ type: 'sequenceRef', attrs: { sequenceId: 'x', code: 'SEQ-0002', name: 'KOYukD <pUC57>', version: 3, length: 5177, circular: true } }] };
  assert.match(renderDoc(d), /SEQ-0002<\/strong> « KOYukD &lt;pUC57&gt; », version 3 \(5\u202f177 pb|SEQ-0002<\/strong> « KOYukD &lt;pUC57&gt; », version 3/);
  assert.match(docToPlainText(d), /SEQ-0002 KOYukD/);
});
