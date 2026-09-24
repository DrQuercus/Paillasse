// Production de la figure : panneaux en PNG (joints à l'entrée, dérivés de l'image d'origine),
// tableau et notes en texte, état complet de l'analyse. C'est ce qui est scellé avec la version.
import { MODES, buildSummary } from '../../lib/gel/model.js';
import { calibrationSvg, panelLetter, profilesSvg, standardSvg } from '../../lib/gel/figure.js';
import { canvasToBlob, drawGelFigure, svgToPng } from '../../lib/gel/render.js';

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
      const canvas = drawGelFigure(img, state, profiles, results, { letter });
      panels.push({ panel, blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height });
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

export function download(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
