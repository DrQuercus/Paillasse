// Export Markdown : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docToMarkdown, entryToMarkdown, escapeMd, safeFileName } from '../src/lib/markdown.js';
import { attachmentName, uniqueName } from '../src/lib/markdownExport.js';

const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((m) => (typeof m === 'string' ? { type: m } : m)) } : {}) });
const p = (...content) => ({ type: 'paragraph', content });
const md = (...content) => docToMarkdown({ type: 'doc', content });
const FILE = '/api/files/0b6423a3-d199-4f66-bc48-c4ba5705d649';

test('marques : gras, italique, code, barré, lien ; HTML en ligne pour le reste', () => {
  assert.equal(md(p(t('Tampon '), t('Tris', 'bold'), t(' '), t('pH', 'italic'), t(' H'), t('2', 'subscript'), t('O'))), 'Tampon **Tris** *pH* H<sub>2</sub>O');
  assert.equal(md(p(t('a `b`', 'code'))), '`` a `b` ``');
  assert.equal(md(p(t('vieux', 'strike'), t(' '), t('fluo', 'highlight'), t(' '), t('ici', { type: 'link', attrs: { href: 'https://exemple.org/a b' } }))),
    '~~vieux~~ <mark>fluo</mark> [ici](https://exemple.org/a%20b)');
  // Espaces de bord hors des délimiteurs, sinon Markdown ne met rien en gras
  assert.equal(md(p(t('gras ', 'bold'), t('suite'))), '**gras** suite');
});

test('échappement : le texte reste du texte', () => {
  assert.equal(escapeMd('5 * 3 _x_ [a] <b> a|b'), '5 \\* 3 \\_x\\_ \\[a\\] \\<b\\> a\\|b');
  assert.equal(md(p(t('# pas un titre'))), '\\# pas un titre');
  assert.equal(md(p(t('- pas une liste'))), '\\- pas une liste');
  assert.equal(md(p(t('12. pas numéroté'))), '12\\. pas numéroté');
  assert.equal(md(p(t('> pas une citation'))), '\\> pas une citation');
  assert.equal(md(p(t('---'))), '\\---');
  assert.equal(md(p(t('a'), { type: 'hardBreak' }, t('b'))), 'a\\\nb');
});

test('listes imbriquées, cases à cocher, listes voisines séparées', () => {
  const out = md(
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Culture')), { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('Inoculer'))] }] }] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('fait'))] }, { type: 'taskItem', attrs: { checked: false }, content: [p(t('à faire'))] }] },
  );
  assert.equal(out, '- Culture\n  3. Inoculer\n\n<!-- -->\n\n- [x] fait\n- [ ] à faire');
});

test('tableau GFM : en-tête, barre verticale échappée, retours à la ligne, cellule fusionnée', () => {
  const cell = (type, text, attrs) => ({ type, ...(attrs ? { attrs } : {}), content: text.map((x) => p(t(x))) });
  const out = md({ type: 'table', content: [
    { type: 'tableRow', content: [cell('tableHeader', ['Tube']), cell('tableHeader', ['DO'])] },
    { type: 'tableRow', content: [cell('tableCell', ['A | B']), cell('tableCell', ['0,6', '0,61'])] },
    { type: 'tableRow', content: [cell('tableCell', ['fusion'], { colspan: 2 })] },
  ] });
  assert.equal(out, '| Tube | DO |\n| --- | --- |\n| A \\| B | 0,6<br>0,61 |\n| fusion |  |');
});

test('code, image (lien réécrit), encarts et emplacement vide', () => {
  assert.equal(md({ type: 'codeBlock', attrs: { language: 'python' }, content: [t('x = "```"')] }), '````python\nx = "```"\n````');
  assert.equal(docToMarkdown({ type: 'doc', content: [{ type: 'image', attrs: { src: FILE, alt: 'gel' } }] }, { rewriteUrl: (u) => u.replace('/api/files/', 'fichiers/mon gel ') }),
    '![gel](fichiers/mon%20gel%200b6423a3-d199-4f66-bc48-c4ba5705d649)\n*gel*');
  const calc = md({ type: 'labCalc', attrs: { summary: { title: 'Dilution', inputs: [{ label: 'C1', value: '5 M' }], results: [{ label: 'V1', value: '10 mL', main: true }] } } });
  assert.equal(calc, '> **Dilution**\n>\n> - C1 : 5 M\n>\n> - V1 : **10 mL**');
  assert.match(md({ type: 'sequenceRef', attrs: { code: 'SEQ-0001', name: 'pUC19', version: 2, length: 2686, circular: true } }), /^\*\*Séquence SEQ-0001\*\* « pUC19 », version 2 \(2\s686 pb, circulaire\)$/);
  assert.match(md({ type: 'sampleRef', attrs: { samples: [{ code: 'ECH-0001', name: 'pUC19', location: 'Boîte 1 › A1' }] } }), /> \| ECH-0001 \| pUC19 \| Boîte 1 › A1 \|/);
  assert.equal(md({ type: 'templateSlot', attrs: {} }), '');
});

test('fichier complet : propriétés YAML, pièces jointes, empreinte de la version', () => {
  const entry = { title: 'Gel "SDS"', entry_date: '2026-09-25', status: 'locked', created_by_name: 'Rosalind', project_name: 'Photo 51' };
  const version = { version_number: 3, kind: 'lock', created_at: '2026-09-25T10:00:00Z', hash: 'ab'.repeat(32), prev_hash: 'cd'.repeat(32), title: 'Gel "SDS"', entry_date: '2026-09-25', content: { type: 'doc', content: [p(t('Bandes nettes.'))] } };
  const out = entryToMarkdown({
    entry, version, author: 'Rosalind', attachments: [{ id: 'x', filename: 'gel 1.tif', size_bytes: 2048, sha256: 'ef'.repeat(32) }],
    fileLink: () => 'fichiers/gel 1.tif',
  });
  assert.match(out, /^---\ntitre: "Gel \\"SDS\\""\ndate: 2026-09-25\nprojet: "Photo 51"\nauteur: "Rosalind"\nstatut: verrouillée\nversion: 3\n/);
  assert.match(out, /\n# Gel "SDS"\n/);
  assert.match(out, /\nBandes nettes\.\n/);
  assert.match(out, /- \[gel 1\.tif\]\(fichiers\/gel%201\.tif\) — 2 Ko, SHA-256 `efef/);
  assert.match(out, /Version 3 \(verrouillage\), figée le .* par Rosalind\./);
  assert.match(out, new RegExp(`Empreinte SHA-256 : \`${'ab'.repeat(32)}\``));
  const draft = entryToMarkdown({ entry: { ...entry, status: 'draft', content: { type: 'doc', content: [] } } });
  assert.match(draft, /version: "copie de travail"/);
  assert.match(draft, /Copie de travail, non figée/);
});

test('noms de fichiers sûrs et uniques', () => {
  assert.equal(safeFileName('Gel: SDS / 12 % ?'), 'Gel SDS 12 %');
  assert.equal(safeFileName('..'), 'sans-titre');
  assert.equal(attachmentName({ id: '0b6423a3-d199', filename: 'mesures:été.CSV' }), '0b6423a3 mesures été.CSV');
  const used = new Set();
  assert.deepEqual([uniqueName(used, 'a'), uniqueName(used, 'A'), uniqueName(used, 'a')], ['a', 'A (2)', 'a (3)']);
});
