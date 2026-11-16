// Outils pour les documents ProseMirror/TipTap (JSON)
import { calcToText } from './calc.js';
import { gelToText } from './gel.js';
import { statToText } from './stat.js';
import { sampleRefText } from './inventory.js';

export const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

const BLOCK_TYPES = new Set([
  'paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'taskItem',
  'tableRow', 'horizontalRule',
]);

export function isDoc(value) {
  return value && typeof value === 'object' && value.type === 'doc' && Array.isArray(value.content ?? []);
}

/** Texte brut d'un document, pour la recherche plein texte. */
export function docToPlainText(doc) {
  const out = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'text') out.push(node.text ?? '');
    else if (node.type === 'hardBreak') out.push('\n');
    else if (node.type === 'image') out.push(node.attrs?.alt ? ` ${node.attrs.alt} ` : '');
    else if (node.type === 'sequenceRef') out.push(`\n${node.attrs?.code ?? ''} ${node.attrs?.name ?? ''}\n`);
    else if (node.type === 'labCalc') out.push(`\n${calcToText(node.attrs?.summary)}\n`);
    else if (node.type === 'gelFigure') out.push(`\n${gelToText(node.attrs)}\n`);
    else if (node.type === 'statFigure') out.push(`\n${statToText(node.attrs)}\n`);
    else if (node.type === 'sampleRef') out.push(`\n${sampleRefText(node.attrs)}\n`);
    else if (node.type === 'tableCell' || node.type === 'tableHeader') {
      (node.content ?? []).forEach(walk);
      out.push('\t');
      return;
    }
    (node.content ?? []).forEach(walk);
    if (BLOCK_TYPES.has(node.type)) out.push('\n');
  };
  walk(doc);
  return out.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/** Identifiants des pièces jointes référencées dans un document (/api/files/<id>). */
export function referencedFileIds(doc) {
  const ids = new Set();
  const re = /\/api\/files\/([0-9a-f-]{36})/g;
  const json = JSON.stringify(doc);
  for (const m of json.matchAll(re)) ids.add(m[1]);
  return ids;
}
