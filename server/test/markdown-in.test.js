// Markdown → document de l'éditeur (écriture par une IA ou un script) : npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDoc, markdownToBlocks, markdownToDoc } from '../src/lib/markdownIn.js';
import { docToMarkdown } from '../src/lib/markdown.js';

const t = (text, ...marks) => ({ type: 'text', text, ...(marks.length ? { marks: marks.map((m) => (typeof m === 'string' ? { type: m } : m)) } : {}) });
const p = (...content) => ({ type: 'paragraph', ...(content.length ? { content } : {}) });
const blocks = (md) => markdownToBlocks(md);
const link = (href) => ({ type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow', class: null } });
const FILE = '/api/files/0b6423a3-d199-4f66-bc48-c4ba5705d649';

test('titres, paragraphes, retours à la ligne', () => {
  assert.deepEqual(blocks('# Titre\n\n## Sous-titre ##\nTexte\nsuite'), [
    { type: 'heading', attrs: { level: 1 }, content: [t('Titre')] },
    { type: 'heading', attrs: { level: 2 }, content: [t('Sous-titre')] },
    p(t('Texte suite')),
  ]);
  assert.deepEqual(blocks('a  \nb\\\nc'), [p(t('a'), { type: 'hardBreak' }, t('b'), { type: 'hardBreak' }, t('c'))]);
  assert.deepEqual(blocks('Titre\n===\n\nAutre\n---'), [
    { type: 'heading', attrs: { level: 1 }, content: [t('Titre')] },
    { type: 'heading', attrs: { level: 2 }, content: [t('Autre')] },
  ]);
  assert.deepEqual(blocks('#pas un titre'), [p(t('#pas un titre'))]);
});

test('emphases à la manière de CommonMark', () => {
  assert.deepEqual(blocks('**gras** *italique* ~~barré~~ `code`'), [p(t('gras', 'bold'), t(' '), t('italique', 'italic'), t(' '), t('barré', 'strike'), t(' '), t('code', 'code'))]);
  assert.deepEqual(blocks('***les deux***'), [p(t('les deux', 'bold', 'italic'))]);
  assert.deepEqual(blocks('**gras *et italique***'), [p(t('gras ', 'bold'), t('et italique', 'bold', 'italic'))]);
  assert.deepEqual(blocks('*a **b** c*'), [p(t('a ', 'italic'), t('b', 'bold', 'italic'), t(' c', 'italic'))]);
  // Soulignés au milieu d'un mot, astérisques isolés : du texte
  assert.deepEqual(blocks('snake_case_name, 5 * 3 = 15, **'), [p(t('snake_case_name, 5 * 3 = 15, **'))]);
  assert.deepEqual(blocks('\\*pas en italique\\*'), [p(t('*pas en italique*'))]);
  assert.deepEqual(blocks('`a **b** c` et ``x ` y``'), [p(t('a **b** c', 'code'), t(' et '), t('x ` y', 'code'))]);
  assert.deepEqual(blocks('~5 min'), [p(t('~5 min'))]);
});

test('liens, adresses nues, HTML en ligne de l’export', () => {
  assert.deepEqual(blocks('[NCBI](https://www.ncbi.nlm.nih.gov "titre") et <https://exemple.org>'), [
    p(t('NCBI', link('https://www.ncbi.nlm.nih.gov')), t(' et '), t('https://exemple.org', link('https://exemple.org'))),
  ]);
  assert.deepEqual(blocks('voir https://exemple.org/a?b=1.'), [p(t('voir '), t('https://exemple.org/a?b=1', link('https://exemple.org/a?b=1')), t('.'))]);
  // Adresse dangereuse : le texte reste, pas le lien
  assert.deepEqual(blocks('[clic](javascript:alert(1))'), [p(t('clic'))]);
  assert.deepEqual(blocks('H<sub>2</sub>O x<sup>2</sup> <u>a</u> <mark>b</mark> c<br>d'), [
    p(t('H'), t('2', 'subscript'), t('O x'), t('2', 'superscript'), t(' '), t('a', 'underline'), t(' '), t('b', 'highlight'), t(' c'), { type: 'hardBreak' }, t('d')),
  ]);
  assert.deepEqual(blocks('**[gras lien](/entries/1)**'), [p(t('gras lien', 'bold', link('/entries/1')))]);
});

test('images : pièce jointe ou adresse web, en bloc ; les autres sont réduites à leur texte', () => {
  assert.deepEqual(blocks(`Avant\n![Gel SDS](${FILE})\nAprès`), [
    p(t('Avant')),
    { type: 'image', attrs: { src: FILE, alt: 'Gel SDS', title: null } },
    p(t('Après')),
  ]);
  assert.deepEqual(blocks('![x](data:image/png;base64,AAAA)'), [p(t('x'))]);
  assert.deepEqual(markdownToBlocks(`![a](${FILE})`, { images: false }), [p(t('a'))]);
});

test('listes : imbriquées, numérotées, à cocher, paresseuses', () => {
  assert.deepEqual(blocks('- Culture\n  1. Inoculer\n  2. Incuber\n- Récolte'), [
    { type: 'bulletList', content: [
      { type: 'listItem', content: [p(t('Culture')), { type: 'orderedList', attrs: { start: 1 }, content: [
        { type: 'listItem', content: [p(t('Inoculer'))] },
        { type: 'listItem', content: [p(t('Incuber'))] },
      ] }] },
      { type: 'listItem', content: [p(t('Récolte'))] },
    ] },
  ]);
  assert.deepEqual(blocks('3) trois\n4) quatre'), [
    { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('trois'))] }, { type: 'listItem', content: [p(t('quatre'))] }] },
  ]);
  assert.deepEqual(blocks('- [x] fait\n- [ ] à faire\n  - [ ] sous-tâche'), [
    { type: 'taskList', content: [
      { type: 'taskItem', attrs: { checked: true }, content: [p(t('fait'))] },
      { type: 'taskItem', attrs: { checked: false }, content: [p(t('à faire')), { type: 'taskList', content: [
        { type: 'taskItem', attrs: { checked: false }, content: [p(t('sous-tâche'))] },
      ] }] },
    ] },
  ]);
  // Liste mixte : les cases restent en texte
  assert.deepEqual(blocks('- [x] fait\n- autre'), [
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('[x] fait'))] }, { type: 'listItem', content: [p(t('autre'))] }] },
  ]);
  // Deux paragraphes dans un élément ; continuation paresseuse
  assert.deepEqual(blocks('- un\nsuite\n\n  deux\n- trois'), [
    { type: 'bulletList', content: [
      { type: 'listItem', content: [p(t('un suite')), p(t('deux'))] },
      { type: 'listItem', content: [p(t('trois'))] },
    ] },
  ]);
  // Élément qui commence par un bloc de code : paragraphe vide d'abord (schéma de l'éditeur)
  const [list] = blocks('- ```\n  code\n  ```');
  assert.equal(list.content[0].content[0].type, 'paragraph');
  assert.equal(list.content[0].content[1].type, 'codeBlock');
});

test('citations, code, traits, tableaux, commentaires, propriétés YAML', () => {
  assert.deepEqual(blocks('> **Note** : sur glace\nsuite paresseuse\n\n> > imbriquée'), [
    { type: 'blockquote', content: [p(t('Note', 'bold'), t(' : sur glace suite paresseuse'))] },
    { type: 'blockquote', content: [{ type: 'blockquote', content: [p(t('imbriquée'))] }] },
  ]);
  assert.deepEqual(blocks('````python\nx = "```"\n````'), [{ type: 'codeBlock', attrs: { language: 'python' }, content: [t('x = "```"')] }]);
  assert.deepEqual(blocks('```\n```'), [{ type: 'codeBlock', attrs: { language: null } }]);
  assert.deepEqual(blocks('a\n\n***\n\n- - -'), [p(t('a')), { type: 'horizontalRule' }, { type: 'horizontalRule' }]);
  const cell = (type, ...content) => ({ type, attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [content.length ? p(...content) : p()] });
  assert.deepEqual(blocks('| Tube | DO |\n|:--|--:|\n| A \\| B | **0,6**<br>0,61 |\n| seul |'), [
    { type: 'table', content: [
      { type: 'tableRow', content: [cell('tableHeader', t('Tube')), cell('tableHeader', t('DO'))] },
      { type: 'tableRow', content: [cell('tableCell', t('A | B')), cell('tableCell', t('0,6', 'bold'), { type: 'hardBreak' }, t('0,61'))] },
      { type: 'tableRow', content: [cell('tableCell', t('seul')), cell('tableCell')] },
    ] },
  ]);
  assert.deepEqual(blocks('---\ntitre: "x"\ndate: 2026-10-26\n---\n\n# Corps\n<!-- -->\n- a'), [
    { type: 'heading', attrs: { level: 1 }, content: [t('Corps')] },
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('a'))] }] },
  ]);
  assert.deepEqual(markdownToDoc(''), { type: 'doc', content: [p()] });
});

// Textes typiques d'une IA : tout doit donner un document valide pour l'éditeur
const SAMPLES = [
  '# Compte rendu\n\n**Objectif** : purifier DegU-His6.\n\n## Matériel\n- Ni-NTA (2 mL)\n- Tampon A : 50 mM Tris pH 8, 300 mM NaCl\n\n## Résultats\n| Fraction | A280 |\n|---|---|\n| E1 | 0,82 |\n\n> Conclusion : protéine **pure à 95 %**.',
  '1. Préparer\n2. Lancer\n\n   ```bash\n   echo ok\n   ```\n3. Noter\n\n- [ ] vérifier\n- [x] commander',
  'Texte avec *italique non fermé et **gras** ; `code` ; [lien](https://a.b/c_(d)) ; ![img](https://exemple.org/x.png) fin.',
  '> citation\n> - liste dans citation\n> - deux\n\n---\n\nH<sub>2</sub>O<br>suite\n\n| a |\n|---|\n',
  '* puce étoile\n+ autre puce\n\n10. dix\n11. onze',
];

test('documents valides pour l’éditeur, et stables à l’aller-retour Markdown', () => {
  for (const md of SAMPLES) {
    const doc = markdownToDoc(md);
    assert.deepEqual(checkDoc(doc), [], md);
    // Exporter puis réimporter redonne le même document
    const again = markdownToDoc(docToMarkdown(doc));
    assert.deepEqual(again, doc, `aller-retour : ${md}`);
  }
});

test('un document de l’éditeur, exporté puis réimporté, revient à l’identique', () => {
  const doc = { type: 'doc', content: [
    { type: 'heading', attrs: { level: 2 }, content: [t('Gel '), t('SDS', 'bold')] },
    p(t('Tampon '), t('Tris', 'bold'), t(' pH '), t('8', 'italic'), t(' H'), t('2', 'subscript'), t('O, '), t('vieux', 'strike'), t(' '), t('ici', link('https://exemple.org/a'))),
    { type: 'bulletList', content: [{ type: 'listItem', content: [p(t('Culture')), { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [p(t('Inoculer'))] }] }] }] },
    { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [p(t('fait'))] }] },
    { type: 'blockquote', content: [p(t('cité'))] },
    { type: 'codeBlock', attrs: { language: 'python' }, content: [t('print(1)')] },
    { type: 'horizontalRule' },
    { type: 'image', attrs: { src: FILE, alt: 'gel', title: null } },
    p(t('5 * 3 _x_ [a] <b> # # - 12. fin')),
  ] };
  // (la légende que l'export écrit sous une image n'est pas reprise en double)
  assert.deepEqual(markdownToDoc(docToMarkdown(doc)), doc);
});

test('checkDoc repère un document que l’éditeur refuserait', () => {
  assert.deepEqual(checkDoc({ type: 'doc', content: [p(t('ok'))] }), []);
  assert.ok(checkDoc({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'heading', attrs: { level: 1 } }] }] }] }).length);
  assert.ok(checkDoc({ type: 'doc', content: [p({ type: 'text', text: '' })] }).length);
  assert.ok(checkDoc({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [] }] }] }).length);
  assert.ok(checkDoc({ type: 'doc', content: [{ type: 'mystere' }] }).length);
});

test('robuste : textes aléatoires et pathologiques, document toujours valide, en temps borné', () => {
  let seed = 42;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const pieces = ['*', '**', '_', '__', '~~', '`', '[', ']', '(', ')', '![', '<', '>', '|', '- ', '1. ', '> ', '# ', '```', '\n', '\n\n', '  ', '\\', 'https://a.b/c', 'mot', 'é', ' ', '- [ ] ', '<u>', '</u>', '---', '\t', '<br>'];
  for (let n = 0; n < 300; n += 1) {
    const md = Array.from({ length: 5 + rand(60) }, () => pieces[rand(pieces.length)]).join('');
    const doc = markdownToDoc(md);
    assert.deepEqual(checkDoc(doc), [], JSON.stringify(md));
  }
  const started = Date.now();
  for (const md of ['*'.repeat(20000), '['.repeat(5000) + ']'.repeat(5000), '`'.repeat(10000), '> '.repeat(2000) + 'x', '- '.repeat(500) + 'x', `${'**a '.repeat(3000)}`,
    `${'<u>'.repeat(3000)}x${'</u>'.repeat(3000)}`, `${'['.repeat(3000)}x${'](https://a.b)'.repeat(3000)}`,
    Array.from({ length: 300 }, (_, k) => `${' '.repeat(2 * k)}- x`).join('\n')]) {
    assert.deepEqual(checkDoc(markdownToDoc(md)), []);
  }
  assert.ok(Date.now() - started < 4000, `trop lent : ${Date.now() - started} ms`);
});
