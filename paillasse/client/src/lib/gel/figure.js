// Graphiques des figures de gel, en SVG (fond blanc, prêts à imprimer ou à publier).
// Fonctions pures : le même SVG sert à l'aperçu, au PNG inséré dans l'entrée et au téléchargement.

import { formatNumber } from '../calc/units.js';
import { formatSize, sizeAxis } from './calibration.js';
import { laneName } from './model.js';

// Couleurs distinguables par les daltoniens (Okabe et Ito)
export const LANE_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#F0E442'];
const FONT = 'Helvetica, Arial, sans-serif';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f1 = (x) => Math.round(x * 10) / 10;

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = 0; v <= max * 1.0001; v += step) ticks.push(v);
  return ticks;
}

function svgOpen(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}">`
    + `<rect width="${w}" height="${h}" fill="#ffffff"/>`;
}

/**
 * Profils de migration superposés. Axe horizontal : migration (haut du gel à gauche),
 * gradué en tailles si le gel est étalonné.
 */
export function profilesSvg(state, profiles, results, { width = 900, height = 380 } = {}) {
  const opts = state.figure?.profiles ?? {};
  const ids = opts.lanes ?? results.sampleLanes.map((l) => l.id);
  const lanes = results.lanes.filter((l) => ids.includes(l.id));
  const pad = { t: 24, r: 20, b: 52, l: 62 };
  const pw = width - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const n = profiles.length;
  let max = 0;
  for (const l of lanes) for (let i = 0; i < n; i += 1) max = Math.max(max, l.profile[i] - l.baseline[i]);
  max = max > 0 ? max * 1.12 : 1;
  const xs = (i) => pad.l + (i / Math.max(1, n - 1)) * pw;
  const ys = (v) => pad.t + ph - (Math.max(0, v) / max) * ph;
  let out = svgOpen(width, height);
  // Axes et graduations
  out += `<line x1="${pad.l}" y1="${pad.t + ph}" x2="${pad.l + pw}" y2="${pad.t + ph}" stroke="#222"/>`;
  out += `<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ph}" stroke="#222"/>`;
  for (const v of niceTicks(max / 1.12)) {
    out += `<line x1="${pad.l - 4}" x2="${pad.l}" y1="${f1(ys(v))}" y2="${f1(ys(v))}" stroke="#222"/>`;
    out += `<text x="${pad.l - 7}" y="${f1(ys(v) + 4)}" font-size="11" text-anchor="end" fill="#222">${esc(formatNumber(v, 3))}</text>`;
  }
  const cal = results.calibration;
  if (cal && opts.axis !== 'position') {
    const sizes = (state.calibration.ladder?.bands ?? []).map((b) => b.size).sort((a, b) => b - a);
    const axis = sizeAxis(sizes, results.unit);
    let lastX = -Infinity;
    for (const size of sizes) {
      const p = cal.posAt(size);
      if (p < 0 || p > n - 1) continue;
      out += `<line x1="${f1(xs(p))}" x2="${f1(xs(p))}" y1="${pad.t + ph}" y2="${pad.t + ph + 4}" stroke="#222"/>`;
      // Marqueurs serrés en haut du gel : une étiquette sur deux plutôt qu'un chevauchement
      if (xs(p) - lastX < 24) continue;
      lastX = xs(p);
      out += `<text x="${f1(xs(p))}" y="${pad.t + ph + 17}" font-size="11" text-anchor="middle" fill="#222">${esc(axis.label(size))}</text>`;
    }
    out += `<text x="${pad.l + pw / 2}" y="${height - 12}" font-size="12" text-anchor="middle" fill="#222">Taille (${axis.unit}) — migration de gauche à droite</text>`;
  } else {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) {
      out += `<text x="${f1(xs(f * (n - 1)))}" y="${pad.t + ph + 17}" font-size="11" text-anchor="middle" fill="#222">${Math.round(f * 100)} %</text>`;
    }
    out += `<text x="${pad.l + pw / 2}" y="${height - 12}" font-size="12" text-anchor="middle" fill="#222">Distance de migration (% de la zone)</text>`;
  }
  out += `<text x="16" y="${pad.t + ph / 2}" font-size="12" text-anchor="middle" fill="#222" transform="rotate(-90 16 ${pad.t + ph / 2})">Signal au-dessus du fond (u.a.)</text>`;
  // Courbes (signal au-dessus du fond), aires des bandes en transparence
  lanes.forEach((l, k) => {
    const col = LANE_COLORS[k % LANE_COLORS.length];
    if (opts.areas !== false) {
      for (const b of l.bands) {
        let d = `M${f1(xs(b.left))},${f1(ys(0))}`;
        for (let i = b.left; i <= b.right; i += 1) d += `L${f1(xs(i))},${f1(ys(l.profile[i] - l.baseline[i]))}`;
        d += `L${f1(xs(b.right))},${f1(ys(0))}Z`;
        out += `<path d="${d}" fill="${col}" fill-opacity="0.16" stroke="none"/>`;
      }
    }
    let d = '';
    for (let i = 0; i < n; i += 1) d += `${i ? 'L' : 'M'}${f1(xs(i))},${f1(ys(l.profile[i] - l.baseline[i]))}`;
    out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
    if (opts.labels !== false && lanes.length <= 3) {
      for (const b of l.bands) {
        const label = b.size ? formatSize(b.size, results.unit) : '';
        if (!label) continue;
        out += `<text x="${f1(xs(b.apex))}" y="${f1(Math.max(pad.t + 10, ys(l.profile[b.apex] - l.baseline[b.apex]) - 6))}" font-size="10" text-anchor="middle" fill="${col}">${esc(label)}</text>`;
      }
    }
  });
  // Légende
  lanes.forEach((l, k) => {
    const x = pad.l + pw - 150;
    const y = pad.t + 8 + k * 16;
    out += `<line x1="${x}" x2="${x + 18}" y1="${y}" y2="${y}" stroke="${LANE_COLORS[k % LANE_COLORS.length]}" stroke-width="2.5"/>`;
    out += `<text x="${x + 24}" y="${y + 4}" font-size="11" fill="#222">Piste ${esc(laneName(l, state.lanes.findIndex((x2) => x2.id === l.id)))}</text>`;
  });
  return `${out}</svg>`;
}

/** Courbe d'étalonnage : log(taille) selon la migration, marqueurs et courbe ajustée. */
export function calibrationSvg(state, profiles, results, { width = 520, height = 340 } = {}) {
  const cal = results.calibration;
  if (!cal) return null;
  const pad = { t: 22, r: 20, b: 48, l: 66 };
  const pw = width - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const n = profiles.length;
  const logs = cal.points.map((p) => Math.log10(p.size));
  const lo = Math.min(...logs) - 0.08;
  const hi = Math.max(...logs) + 0.08;
  const xs = (i) => pad.l + (i / Math.max(1, n - 1)) * pw;
  const ys = (l) => pad.t + ph - ((l - lo) / (hi - lo)) * ph;
  const axis = sizeAxis(cal.points.map((p) => p.size), results.unit);
  let out = svgOpen(width, height);
  out += `<line x1="${pad.l}" y1="${pad.t + ph}" x2="${pad.l + pw}" y2="${pad.t + ph}" stroke="#222"/><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ph}" stroke="#222"/>`;
  for (const p of cal.points) {
    const y = ys(Math.log10(p.size));
    out += `<text x="${pad.l - 7}" y="${f1(y + 4)}" font-size="11" text-anchor="end" fill="#222">${esc(axis.label(p.size))}</text>`;
  }
  let d = '';
  const [a, b] = cal.range;
  for (let k = 0; k <= 60; k += 1) {
    const x = a + ((b - a) * k) / 60;
    const l = Math.log10(cal.sizeAt(x));
    d += `${k ? 'L' : 'M'}${f1(xs(x))},${f1(ys(l))}`;
  }
  out += `<path d="${d}" fill="none" stroke="#D55E00" stroke-width="1.6" stroke-dasharray="6 3"/>`;
  for (const p of cal.points) out += `<circle cx="${f1(xs(p.pos))}" cy="${f1(ys(Math.log10(p.size)))}" r="4" fill="#0072B2"/>`;
  const method = { interp: 'interpolation', linear: 'linéaire', quadratic: 'polynôme deg. 2' }[cal.method];
  out += `<text x="${pad.l + pw}" y="${pad.t + 12}" font-size="12" text-anchor="end" fill="#222">${esc(method)}${cal.method !== 'interp' ? `, R² = ${esc(formatNumber(cal.r2, 4))}` : ''}</text>`;
  out += `<text x="${pad.l + pw / 2}" y="${height - 12}" font-size="12" text-anchor="middle" fill="#222">Migration (px)</text>`;
  out += `<text x="16" y="${pad.t + ph / 2}" font-size="12" text-anchor="middle" fill="#222" transform="rotate(-90 16 ${pad.t + ph / 2})">Taille (${axis.unit}, échelle log)</text>`;
  return `${out}</svg>`;
}

/** Gamme étalon : quantité selon l'aire. */
export function standardSvg(state, results, { width = 520, height = 340, unit = 'µg' } = {}) {
  const std = results.standard;
  if (!std) return null;
  const pts = results.standardPoints.filter((p) => p.area > 0 && p.amount > 0);
  const pad = { t: 22, r: 20, b: 48, l: 66 };
  const pw = width - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const maxA = Math.max(...pts.map((p) => p.area)) * 1.1;
  const maxQ = Math.max(...pts.map((p) => p.amount)) * 1.1;
  const xs = (a) => pad.l + (a / maxA) * pw;
  const ys = (q) => pad.t + ph - (q / maxQ) * ph;
  let out = svgOpen(width, height);
  out += `<line x1="${pad.l}" y1="${pad.t + ph}" x2="${pad.l + pw}" y2="${pad.t + ph}" stroke="#222"/><line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + ph}" stroke="#222"/>`;
  for (const q of niceTicks(maxQ / 1.1)) out += `<text x="${pad.l - 7}" y="${f1(ys(q) + 4)}" font-size="11" text-anchor="end" fill="#222">${esc(formatNumber(q, 3))}</text>`;
  out += `<line x1="${f1(xs(0))}" y1="${f1(ys(std.intercept))}" x2="${f1(xs(maxA))}" y2="${f1(ys(std.slope * maxA + std.intercept))}" stroke="#D55E00" stroke-width="1.6" stroke-dasharray="6 3"/>`;
  for (const p of pts) out += `<circle cx="${f1(xs(p.area))}" cy="${f1(ys(p.amount))}" r="4" fill="#0072B2"/>`;
  out += `<text x="${pad.l + pw}" y="${pad.t + 12}" font-size="12" text-anchor="end" fill="#222">R² = ${esc(formatNumber(std.r2, 3))}</text>`;
  out += `<text x="${pad.l + pw / 2}" y="${height - 12}" font-size="12" text-anchor="middle" fill="#222">Aire de la bande (u.a.)</text>`;
  out += `<text x="16" y="${pad.t + ph / 2}" font-size="12" text-anchor="middle" fill="#222" transform="rotate(-90 16 ${pad.t + ph / 2})">Quantité (${esc(unit)})</text>`;
  return `${out}</svg>`;
}
