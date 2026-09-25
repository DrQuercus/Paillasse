// Petits constructeurs de documents TipTap (JSON) pour écrire les modèles lisiblement.
// Le résultat est un document ordinaire : le serveur l'enregistre tel quel dans la table templates.

import { runCalculator } from '../calc/calculators.js';

const text = (value, marks) => ({ type: 'text', text: value, ...(marks ? { marks } : {}) });
const inline = (parts) => parts.filter((x) => x !== '' && x != null).map((x) => (typeof x === 'string' ? text(x) : x));

export const b = (value) => text(value, [{ type: 'bold' }]);
export const i = (value) => text(value, [{ type: 'italic' }]);

export function p(...parts) {
  const content = inline(parts);
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

export const h2 = (value) => ({ type: 'heading', attrs: { level: 2 }, content: [text(value)] });
export const h3 = (value) => ({ type: 'heading', attrs: { level: 3 }, content: [text(value)] });

const item = (type, value, extra) => ({ type, ...(extra ? { attrs: extra } : {}), content: [Array.isArray(value) ? p(...value) : p(value)] });
export const ul = (...items) => ({ type: 'bulletList', content: items.map((x) => item('listItem', x)) });
export const ol = (...items) => ({ type: 'orderedList', attrs: { start: 1 }, content: items.map((x) => item('listItem', x)) });
/** Étapes à cocher pendant la manip. */
export const tasks = (...items) => ({ type: 'taskList', content: items.map((x) => item('taskItem', x, { checked: false })) });

const cell = (type, value) => ({ type, content: [Array.isArray(value) ? p(...value) : p(value)] });

/** Tableau avec une ligne d'en-tête. */
export function table(header, rows) {
  return {
    type: 'table',
    content: [
      { type: 'tableRow', content: header.map((c) => cell('tableHeader', c)) },
      ...rows.map((r) => {
        if (r.length !== header.length) throw new Error(`Ligne de ${r.length} cellules pour ${header.length} colonnes : ${JSON.stringify(r)}`);
        return { type: 'tableRow', content: r.map((c) => cell('tableCell', c)) };
      }),
    ],
  };
}

/** n lignes vides (la première colonne peut être numérotée). */
export const blank = (n, cols, numbered = false) => Array.from({ length: n }, (_, k) => Array.from({ length: cols }, (__, j) => (numbered && j === 0 ? String(k + 1) : '')));

/** Fiche « libellé : valeur » : libellés en en-tête de ligne, valeurs à compléter. */
export function fiche(pairs) {
  return {
    type: 'table',
    content: pairs.map(([label, value = '']) => ({ type: 'tableRow', content: [cell('tableHeader', label), cell('tableCell', value)] })),
  };
}

/** Encart de calcul pré-rempli : le résumé est calculé ici, comme lors d'une insertion à la main. */
export function calc(kind, params) {
  const r = runCalculator(kind, params);
  if (!r.ok) throw new Error(`Calcul ${kind} invalide dans un modèle : ${r.message ?? 'incomplet'}`);
  return { type: 'labCalc', attrs: { kind, params, summary: r.summary } };
}

/**
 * Emplacement à remplir dans l'entrée : un clic ouvre l'outil (figure de gel, graphique, calcul,
 * photo ou fichier, séquence) et le résultat prend sa place. Invisible à l'impression.
 */
export function slot(id, tool, label, hint = '', preset = null) {
  return { type: 'templateSlot', attrs: { id, tool, label, hint, preset } };
}

// --- Jeux de données préparés pour les emplacements « graphique » -----------------------------------

const fr = (x) => String(x).replace('.', ',');

/** Tableau XY : X donnés, Y (réplicats) à saisir. */
export function xyDataset({ title, xTitle, yTitle, xs, series = ['Y'], replicates = 3, analysis = {}, graph = {} }) {
  const columns = series.map((name, k) => ({ id: `s${k + 1}`, name }));
  return {
    v: 1, kind: 'xy', title, xTitle, replicates,
    columns,
    rows: xs.map((x, k) => ({ id: `r${k + 1}`, x: fr(x), label: '', v: Object.fromEntries(columns.map((c) => [c.id, Array(replicates).fill('')])) })),
    analysis, graph: { yTitle, ...graph },
  };
}

/** Tableau en colonnes : une colonne par groupe, valeurs à saisir. */
export function columnDataset({ title, groups, rows = 6, analysis = {}, graph = {} }) {
  const columns = groups.map((name, k) => ({ id: `g${k + 1}`, name }));
  return {
    v: 1, kind: 'column', title, xTitle: '', replicates: 1,
    columns,
    rows: Array.from({ length: rows }, (_, k) => ({ id: `r${k + 1}`, x: '', label: '', v: Object.fromEntries(columns.map((c) => [c.id, ['']])) })),
    analysis, graph,
  };
}
