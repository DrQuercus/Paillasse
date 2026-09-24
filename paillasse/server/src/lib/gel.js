// Figure de gel dans une entrée (nœud TipTap « gelFigure »).
//
// L'analyse est faite dans le navigateur (client/src/lib/gel). Le nœud garde :
//   analysis  l'état complet de l'analyse (pistes, réglages, étalonnage…) et la référence
//             de l'image d'origine, jointe à l'entrée et jamais modifiée ;
//   images    les panneaux rendus (gel, profils, courbes), joints à l'entrée : { panel, src, width, height, alt } ;
//   summary   le tableau des bandes et les notes, en texte, scellés avec la version.
// Le serveur ne refait pas l'analyse : il vérifie la forme du nœud, et que les images appartiennent
// bien à l'entrée, puis sait l'afficher (impression, export) et l'indexer (recherche).

import { HttpError } from './errors.js';

export const PANELS = ['gel', 'profiles', 'calibration', 'standards'];
export const gelLayout = (v) => (['row', 'grid'].includes(v) ? v : 'column');

/** Largeur d'affichage de chaque panneau (% de la figure), tous à la même échelle (voir client/src/lib/gel/layout.js). */
export function panelWidths(widths, layout = 'column') {
  const w = widths.map((x) => Math.max(1, Number(x) || 1));
  if (!w.length) return [];
  let ref;
  if (layout === 'row') ref = w.reduce((a, b) => a + b, 0);
  else if (layout === 'grid') {
    ref = 0;
    for (let i = 0; i < w.length; i += 2) ref = Math.max(ref, w[i] + (w[i + 1] ?? 0));
  } else ref = Math.max(...w);
  return w.map((x) => Math.round((x / ref) * 1000) / 10);
}
const FILE_URL = /^\/api\/files\/([0-9a-f-]{36})$/;
const UUID = /^[0-9a-f-]{36}$/;
const str = (v, max) => String(v ?? '').slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

/** Résumé sûr (chaînes et listes bornées). Tolère un résumé absent ou abîmé. */
export function gelSummary(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const table = s.table && typeof s.table === 'object' && Array.isArray(s.table.columns)
    ? {
      columns: list(s.table.columns, 40).map((c) => str(c, 200)),
      rows: list(s.table.rows, 200).map((r) => list(r, 40).map((c) => str(c, 200))),
    }
    : null;
  return {
    title: str(s.title, 300) || 'Figure de gel',
    mode: str(s.mode, 100),
    lanes: list(s.lanes, 60).map((l) => str(l, 100)),
    table,
    notes: list(s.notes, 60).map((n) => str(n, 1000)),
  };
}

export function gelImages(raw) {
  return list(raw, 6)
    .filter((i) => i && FILE_URL.test(String(i.src ?? '')))
    .map((i) => ({
      panel: PANELS.includes(i.panel) ? i.panel : 'gel',
      src: String(i.src),
      width: Math.max(1, Math.min(20000, Number(i.width) || 1)),
      height: Math.max(1, Math.min(20000, Number(i.height) || 1)),
      alt: str(i.alt, 300),
    }));
}

/** Pièces jointes auxquelles renvoie une figure (images et image d'origine). */
export function gelAttachmentIds(attrs) {
  const ids = gelImages(attrs?.images).map((i) => FILE_URL.exec(i.src)[1]);
  const source = attrs?.analysis?.source?.attachmentId;
  if (source) ids.push(String(source));
  return [...new Set(ids)];
}

/** Vérifie un nœud envoyé par le client (insertion depuis la page Gels). */
export function cleanGelNode(node) {
  const a = node?.attrs ?? {};
  const analysis = a.analysis && typeof a.analysis === 'object' && !Array.isArray(a.analysis) ? a.analysis : null;
  if (!analysis) throw new HttpError(400, 'Analyse du gel manquante.');
  if (JSON.stringify(analysis).length > 600_000) throw new HttpError(400, 'Analyse du gel trop volumineuse.');
  const source = analysis.source?.attachmentId;
  if (source !== undefined && source !== null && !UUID.test(String(source))) throw new HttpError(400, 'Image d’origine invalide.');
  const images = gelImages(a.images);
  if (!images.length) throw new HttpError(400, 'La figure ne contient aucune image.');
  return {
    type: 'gelFigure',
    attrs: {
      analysis,
      images,
      summary: gelSummary(a.summary),
      layout: gelLayout(a.layout),
      width: [25, 50, 75, 100].includes(Number(a.width)) ? Number(a.width) : 100,
    },
  };
}

/** Texte brut pour la recherche : titre, pistes, tableau et notes. */
export function gelToText(attrs) {
  const s = gelSummary(attrs?.summary);
  const lines = [[s.title, s.mode].filter(Boolean).join(' — ')];
  if (s.lanes.length) lines.push(`Pistes : ${s.lanes.join(', ')}`);
  if (s.table) for (const row of s.table.rows) lines.push(row.join(' ; '));
  lines.push(...s.notes);
  return lines.join('\n');
}
