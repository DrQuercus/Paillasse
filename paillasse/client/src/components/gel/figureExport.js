// Production de la figure : panneaux en PNG (joints à l'entrée, dérivés de l'image d'origine),
// tableau et notes en texte, état complet de l'analyse. C'est ce qui est scellé avec la version.
import { buildSummary } from '../../lib/gel/model.js';
import { calibrationSvg, profilesSvg, standardSvg } from '../../lib/gel/figure.js';
import { canvasToBlob, drawGelFigure, svgToPng } from '../../lib/gel/render.js';
import { MODES } from '../../lib/gel/model.js';

const slug = (s) => String(s || 'gel').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-|-$/g, '').slice(0, 50).toLowerCase() || 'gel';

const PANEL_NAMES = { gel: 'gel', profiles: 'profils', calibration: 'etalonnage', standards: 'gamme' };
const PANEL_ALT = { gel: 'Gel', profiles: 'Profils de migration', calibration: 'Courbe d’étalonnage', standards: 'Gamme étalon' };

/** Rend les panneaux choisis dans le configurateur. */
export async function renderFigure({ state, img, profiles, results }) {
  const p = state.figure.panels;
  const summary = buildSummary(state, results);
  const panels = [];
  if (p.gel) {
    const canvas = drawGelFigure(img, state, profiles, results);
    panels.push({ panel: 'gel', blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height });
  }
  if (p.profiles && results.lanes.length) {
    const svg = profilesSvg(state, profiles, results);
    panels.push({ panel: 'profiles', svg, ...(await svgToPng(svg)) });
  }
  if (p.calibration && results.calibration) {
    const svg = calibrationSvg(state, profiles, results);
    panels.push({ panel: 'calibration', svg, ...(await svgToPng(svg)) });
  }
  if (p.standards && results.standard) {
    const svg = standardSvg(state, results, { unit: MODES[state.mode].amountUnit });
    panels.push({ panel: 'standards', svg, ...(await svgToPng(svg)) });
  }
  const base = slug(summary.title);
  for (const x of panels) {
    x.filename = `${base}_${PANEL_NAMES[x.panel]}.png`;
    x.alt = `${PANEL_ALT[x.panel]} — ${summary.title}`;
  }
  return { panels, summary: p.table ? summary : { ...summary, table: null } };
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
