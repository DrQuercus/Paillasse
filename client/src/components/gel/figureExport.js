// Production de la figure : panneaux en PNG (joints à l'entrée, dérivés de l'image d'origine),
// tableau et notes en texte, état complet de l'analyse. C'est ce qui est scellé avec la version.
import { MODES, buildSummary } from '../../lib/gel/model.js';
import { FONTS, calibrationSvg, panelLetter, profilesSvg, standardSvg } from '../../lib/gel/figure.js';
import { canvasToBlob, drawGelFigure, svgToPng } from '../../lib/gel/render.js';
import { composeFigureSvg } from '../../lib/gel/compose.js';

const slug = (s) => String(s || 'gel').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '').slice(0, 50).toLowerCase() || 'gel';

const PANEL_NAMES = { gel: 'gel', profiles: 'profils', calibration: 'etalonnage', standards: 'gamme' };
const PANEL_ALT = { gel: 'Gel', profiles: 'Profils de migration', calibration: 'Courbe d’étalonnage', standards: 'Gamme étalon' };

/** Panneaux à produire, dans l'ordre choisi, avec leur lettre (A, B…) si demandée. */
export function figurePanels(state, results) {
  const f = state.figure;
  const available = {
    gel: f.panels.gel,
    profiles: f.panels.profiles && results.lanes.length > 0,
    calibration: f.panels.calibration && Boolean(results.calibration),
    standards: f.panels.standards && Boolean(results.standard),
  };
  const list = (f.order ?? Object.keys(available)).filter((k) => available[k]);
  return list.map((panel, i) => ({ panel, letter: f.style?.letters ? panelLetter(i) : null }));
}

/** SVG d'un panneau graphique (profils, étalonnage, gamme). */
export function panelSvg(panel, { state, profiles, results, letter }) {
  if (panel === 'profiles') return profilesSvg(state, profiles, results, { letter });
  if (panel === 'calibration') return calibrationSvg(state, profiles, results, { letter });
  if (panel === 'standards') return standardSvg(state, results, { unit: MODES[state.mode].amountUnit, letter });
  return null;
}

/** Rend les panneaux choisis dans le configurateur. */
export async function renderFigure({ state, img, profiles, results }) {
  const summary = buildSummary(state, results);
  const panels = [];
  for (const { panel, letter } of figurePanels(state, results)) {
    if (panel === 'gel') {
      // Deux fois plus fin que sa taille d'affichage, comme les graphiques : net à l'impression
      const canvas = drawGelFigure(img, state, profiles, results, { letter, pixelRatio: 2 });
      panels.push({ panel, blob: await canvasToBlob(canvas), width: canvas.designWidth, height: canvas.designHeight });
    } else {
      const svg = panelSvg(panel, { state, profiles, results, letter });
      const png = await svgToPng(svg, 2);
      // Taille de conception (le PNG est deux fois plus fin, pour l'écran et l'impression)
      panels.push({ panel, svg, blob: png.blob, width: Math.round(png.width / 2), height: Math.round(png.height / 2) });
    }
  }
  const base = slug(summary.title);
  for (const x of panels) {
    x.filename = `${base}_${PANEL_NAMES[x.panel]}.png`;
    x.alt = `${PANEL_ALT[x.panel]} — ${summary.title}`;
  }
  return { panels, summary: state.figure.panels.table ? summary : { ...summary, table: null } };
}

/**
 * Joint les panneaux à l'entrée et renvoie les attributs du nœud « gelFigure ».
 * upload(file, { derived_from, edit_params }) → pièce jointe ; sourceId = image d'origine (déjà jointe).
 */
export async function uploadFigure({ figure, state, upload, sourceId }) {
  const images = [];
  for (const x of figure.panels) {
    const att = await upload(new File([x.blob], x.filename, { type: 'image/png' }), {
      derived_from: sourceId,
      edit_params: { tool: 'gel', panel: x.panel },
    });
    images.push({ panel: x.panel, src: `/api/files/${att.id}`, width: x.width, height: x.height, alt: x.alt });
  }
  return {
    analysis: state,
    images,
    summary: figure.summary,
    layout: state.figure.layout,
    width: state.figure.width,
  };
}

/** Tableau des bandes en CSV (séparateur « ; », virgule décimale : s'ouvre tel quel dans Excel en français). */
export function tableCsv(summary) {
  if (!summary.table) return '';
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [summary.table.columns, ...summary.table.rows].map((r) => r.map(cell).join(';')).join('\r\n');
}

// --- Figure entière, en un seul fichier ---------------------------------------------------------------

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('Image illisible.'));
  r.readAsDataURL(blob);
});

/** Mesure exacte des textes (police de la figure) pour la mise en page du tableau et des notes. */
function textMeasurer(font) {
  const ctx = document.createElement('canvas').getContext('2d');
  return (text, size, bold = false) => {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${font}`;
    return ctx.measureText(String(text)).width;
  };
}

/**
 * Assemble la figure : panneaux (images ou SVG), titre, tableau, notes. Renvoie le SVG complet.
 * panels = [{ blob?, svg?, width, height }] ; vector : garder les graphiques en SVG (sinon leurs PNG).
 */
async function assemble({ title, subtitle, panels, layout, table, notes, styleOf }, vector) {
  const st = styleOf ?? {};
  const font = (FONTS[st.font] ?? FONTS.sans).css;
  const parts = [];
  for (const p of panels) {
    if (vector && p.svg) parts.push({ kind: 'svg', svg: p.svg, width: p.width, height: p.height });
    else parts.push({ kind: 'image', href: await blobToDataUrl(p.blob), width: p.width, height: p.height });
  }
  return composeFigureSvg({ title, subtitle, panels: parts, layout, table, notes, font, fontSize: st.fontSize ?? 14, measure: textMeasurer(font) });
}

/** Nom de fichier de la figure, d'après son titre. */
export const figureFilename = (title, ext) => `${slug(title)}_figure.${ext}`;

/**
 * Télécharge la figure entière depuis l'atelier : format 'png' (haute définition, ×2) ou 'svg' (graphiques
 * vectoriels, gel en image : modifiable dans Inkscape ou Illustrator).
 */
export async function downloadWholeFigure({ state, img, profiles, results }, format = 'png') {
  const figure = await renderFigure({ state, img, profiles, results });
  const { summary } = figure;
  const composed = await assemble({
    title: summary.title, subtitle: summary.mode, panels: figure.panels, layout: state.figure.layout,
    table: summary.table, notes: summary.notes, styleOf: state.figure.style,
  }, true);
  if (format === 'svg') download(new Blob([composed.svg], { type: 'image/svg+xml' }), figureFilename(summary.title, 'svg'));
  // Graphiques vectoriels et gel dessiné deux fois plus fin : ×2 est net partout
  else download((await svgToPng(composed.svg, 2)).blob, figureFilename(summary.title, 'png'));
}

/**
 * Télécharge la figure entière depuis l'encart d'une entrée : ses panneaux déjà joints (PNG), son tableau
 * et ses notes, dans la disposition de l'encart.
 */
export async function downloadFigureFromEntry(attrs, format = 'png') {
  const s = attrs.summary ?? {};
  const panels = [];
  for (const im of attrs.images ?? []) {
    const r = await fetch(im.src, { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Un panneau de la figure est introuvable.');
    panels.push({ blob: await r.blob(), width: im.width, height: im.height });
  }
  const composed = await assemble({
    title: s.title ?? 'Figure de gel', subtitle: s.mode ?? '', panels, layout: attrs.layout,
    table: s.table, notes: s.notes ?? [], styleOf: attrs.analysis?.figure?.style,
  }, false);
  if (format === 'svg') download(new Blob([composed.svg], { type: 'image/svg+xml' }), figureFilename(s.title, 'svg'));
  else download((await svgToPng(composed.svg, 2)).blob, figureFilename(s.title, 'png'));
}

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
