// Outil Statistiques : jeux de données (page Statistiques) et encart « graphique et statistiques »
// dans une entrée (nœud TipTap « statFigure »).
//
// Les calculs sont faits dans le navigateur (client/src/lib/stats). L'encart garde :
//   dataset  la copie du jeu de données (tableau, réglages de l'analyse et du graphique) ;
//   images   le graphique rendu, joint à l'entrée : [{ src, width, height, alt }] ;
//   summary  les résultats en texte (sections de libellés et valeurs, tableaux), scellés avec la version.
// Le serveur vérifie la forme, que l'image appartient à l'entrée, et sait l'afficher et l'indexer.

import { HttpError } from './errors.js';

export const KINDS = ['column', 'xy', 'grouped', 'contingency', 'survival'];
export const KIND_LABELS = { column: 'Colonnes', xy: 'XY', grouped: 'Groupé', contingency: 'Contingence', survival: 'Survie' };
const FILE_URL = /^\/api\/files\/([0-9a-f-]{36})$/;
const str = (v, max) => String(v ?? '').slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/** Jeu de données : type connu, forme attendue, taille raisonnable. */
export function cleanDataset(raw) {
  const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!d) throw new HttpError(400, 'Jeu de données manquant.');
  if (!KINDS.includes(d.kind)) throw new HttpError(400, 'Type de tableau inconnu.');
  if (!Array.isArray(d.columns) || !d.columns.length || d.columns.length > 200) throw new HttpError(400, 'Le tableau doit avoir entre 1 et 200 colonnes.');
  if (!Array.isArray(d.rows) || d.rows.length > 10000) throw new HttpError(400, 'Le tableau a trop de lignes (10 000 au plus).');
  const json = JSON.stringify(d);
  if (json.length > 3_000_000) throw new HttpError(400, 'Jeu de données trop volumineux.');
  return { ...d, title: str(d.title, 300) };
}

/** Résumé sûr (chaînes et listes bornées). Tolère un résumé absent ou abîmé. */
export function statSummary(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const cellList = (row) => list(row, 60).map((c) => str(c, 400));
  return {
    title: str(s.title, 300) || 'Graphique',
    kind: str(s.kind, 60),
    analysis: s.analysis ? str(s.analysis, 200) : null,
    method: str(s.method, 1000),
    sections: list(s.sections, 30).map((sec) => ({
      title: str(sec?.title, 300),
      ...(sec?.table && Array.isArray(sec.table.columns)
        ? { table: { columns: cellList(sec.table.columns), rows: list(sec.table.rows, 500).map(cellList) } }
        : { rows: list(sec?.rows, 100).map((r) => [str(r?.[0], 300), str(r?.[1], 400)]) }),
    })),
    warnings: list(s.warnings, 20).map((w) => str(w, 500)),
    error: s.error ? str(s.error, 500) : null,
  };
}

export function statImages(raw) {
  return list(raw, 4)
    .filter((i) => i && FILE_URL.test(String(i.src ?? '')))
    .map((i) => ({
      src: String(i.src),
      width: Math.max(1, Math.min(20000, Number(i.width) || 1)),
      height: Math.max(1, Math.min(20000, Number(i.height) || 1)),
      alt: str(i.alt, 300),
    }));
}

export const statAttachmentIds = (attrs) => [...new Set(statImages(attrs?.images).map((i) => FILE_URL.exec(i.src)[1]))];

/** Vérifie un nœud envoyé par le client (insertion depuis la page Statistiques). */
export function cleanStatNode(node) {
  const a = node?.attrs ?? {};
  const images = statImages(a.images);
  if (!images.length) throw new HttpError(400, 'L’encart ne contient pas de graphique.');
  return {
    type: 'statFigure',
    attrs: {
      dataset: cleanDataset(a.dataset),
      images,
      summary: statSummary(a.summary),
      width: [25, 50, 75, 100].includes(Number(a.width)) ? Number(a.width) : 75,
    },
  };
}

/** Texte brut pour la recherche : titre, analyse, méthode, résultats. */
export function statToText(attrs) {
  const s = statSummary(attrs?.summary);
  const lines = [[s.title, s.kind, s.analysis].filter(Boolean).join(' — ')];
  if (s.method) lines.push(s.method);
  for (const sec of s.sections) {
    lines.push(sec.title);
    if (sec.table) for (const row of [sec.table.columns, ...sec.table.rows]) lines.push(row.join(' ; '));
    else for (const [k, v] of sec.rows) lines.push(`${k} : ${v}`);
  }
  lines.push(...s.warnings);
  return lines.join('\n');
}
