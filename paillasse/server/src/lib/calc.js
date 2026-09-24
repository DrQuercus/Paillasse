// Encart de calcul dans une entrée (nœud TipTap « labCalc »).
//
// Le calcul est fait dans le navigateur (client/src/lib/calc) ; le nœud en garde les paramètres saisis
// et un résumé déjà mis en forme, scellé avec la version de l'entrée. Le serveur ne recalcule rien :
// il vérifie la forme du résumé et sait l'afficher (impression, export) et l'indexer (recherche).
//
//   { type: 'labCalc', attrs: { kind: 'molarity', params: { … }, summary: {
//       title, label?, formula, inputs: [{ label, value }], results: [{ label, value, main? }],
//       table?: { columns: [], rows: [[]] }, notes?: [] } } }

import { HttpError } from './errors.js';

const str = (v, max) => String(v ?? '').slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const pair = (x) => ({ label: str(x?.label, 300), value: str(x?.value, 1000) });

/** Résumé d'un calcul, sous une forme sûre (chaînes bornées, listes bornées). Tolère un résumé absent. */
export function calcSummary(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const table = s.table && typeof s.table === 'object' && Array.isArray(s.table.columns)
    ? {
      columns: list(s.table.columns, 8).map((c) => str(c, 200)),
      rows: list(s.table.rows, 300).map((r) => list(r, 8).map((c) => str(c, 1000))),
    }
    : null;
  return {
    title: str(s.title, 300) || 'Calcul',
    label: str(s.label, 300),
    formula: str(s.formula, 500),
    inputs: list(s.inputs, 60).map(pair),
    results: list(s.results, 30).map((x) => ({ ...pair(x), main: Boolean(x?.main) })),
    table,
    notes: list(s.notes, 20).map((n) => str(n, 2000)),
  };
}

/** Vérifie un nœud envoyé par le client (ajout d'un calcul à une entrée depuis la page Calculs). */
export function cleanCalcNode(node) {
  if (!node || typeof node !== 'object' || node.type !== 'labCalc') {
    throw new HttpError(400, 'Seul un encart de calcul peut être ajouté ainsi.');
  }
  const a = node.attrs ?? {};
  const kind = String(a.kind ?? '');
  if (!/^[a-z]{1,30}$/.test(kind)) throw new HttpError(400, 'Type de calcul invalide.');
  const params = a.params && typeof a.params === 'object' && !Array.isArray(a.params) ? a.params : {};
  if (JSON.stringify(params).length > 50_000) throw new HttpError(400, 'Paramètres de calcul trop volumineux.');
  if (!a.summary || typeof a.summary !== 'object' || !Array.isArray(a.summary.results) || !a.summary.results.length) {
    throw new HttpError(400, 'Résultat du calcul manquant.');
  }
  return { type: 'labCalc', attrs: { kind, params, summary: calcSummary(a.summary) } };
}

/** Texte brut d'un calcul, pour la recherche plein texte (« NaCl » retrouve l'entrée où on l'a pesé). */
export function calcToText(raw) {
  const s = calcSummary(raw);
  const lines = [[s.title, s.label].filter(Boolean).join(' : ')];
  for (const i of s.inputs) lines.push(`${i.label} : ${i.value}`);
  if (s.table) for (const row of s.table.rows) lines.push(row.join(' ; '));
  for (const r of s.results) lines.push(`${r.label} : ${r.value}`);
  return lines.join('\n');
}
