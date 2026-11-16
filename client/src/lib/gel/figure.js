// Graphiques des figures de gel, en SVG (fond blanc, prêts à imprimer ou à publier).
// Fonctions pures : le même SVG sert à l'aperçu, au PNG inséré dans l'entrée et au téléchargement.
// La mise en page (police, taille du texte, épaisseur des traits, légende…) vient de state.figure.

import { formatNumber } from '../calc/units.js';
import { formatSize, sizeAxis } from './calibration.js';
import { laneName } from './model.js';

// Couleurs distinguables par les daltoniens (Okabe et Ito)
export const LANE_COLORS = ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#F0E442'];
// En niveaux de gris, les courbes se distinguent par leurs tirets
const DASHES = ['', '7 4', '2 3', '10 3 2 3', '4 4', '1 3', '12 4', '6 2 2 2'];

export const FONTS = {
  sans: { label: 'Sans empattement', css: 'Helvetica, Arial, sans-serif' },
  serif: { label: 'Avec empattement', css: '"Times New Roman", Times, serif' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f1 = (x) => Math.round(x * 10) / 10;
const clamp = (v, lo, hi, d) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : d);
// Largeur approximative d'un texte (sans police chargée : moyenne des caractères latins)
const textW = (s, size) => String(s).length * size * 0.56;

/** Style commun des panneaux de la figure. */
export function figureStyle(state) {
  const s = state?.figure?.style ?? {};
  const size = clamp(s.fontSize, 8, 32, 14);
  return {
    font: (FONTS[s.font] ?? FONTS.sans).css,
    size,
    small: f1(size * 0.86),
    tiny: f1(size * 0.76),
    line: clamp(s.lineWidth, 0.5, 6, 1.6),
    letters: Boolean(s.letters),
    gray: s.colors === 'gray',
  };
}

/** Style de l'interface (graphiques de l'atelier) : indépendant des réglages de la figure. */
export const UI_STYLE = { font: 'system-ui, sans-serif', size: 12, small: 11, tiny: 10, line: 1.5, letters: false, gray: false };

export const laneColor = (st, k) => (st.gray ? '#111111' : LANE_COLORS[k % LANE_COLORS.length]);
export const laneDash = (st, k) => (st.gray ? DASHES[k % DASHES.length] : '');
export const panelLetter = (i) => String.fromCharCode(65 + i);

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = 0; v <= max * 1.0001; v += step) ticks.push(v);
  return ticks;
}

function svgOpen(w, h, st, letter) {
  let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" font-family="${esc(st.font)}">`
    + `<rect width="${Math.round(w)}" height="${Math.round(h)}" fill="#ffffff"/>`;
  if (letter) out += `<text x="6" y="${f1(st.size * 1.35)}" font-size="${f1(st.size * 1.35)}" font-weight="bold" fill="#111">${esc(letter)}</text>`;
  return out;
}

const letterSpace = (st, letter) => (letter ? st.size * 1.5 : 0);

/**
 * Valeurs tracées pour une piste : signal au-dessus du fond, éventuellement lissé et normalisé
 * (max = 1, ou aire totale = 100 pour comparer des pistes inégalement chargées).
 */
export function traceOf(lane, { normalize = 'none', smooth = false } = {}) {
  const src = smooth ? lane.smoothed : lane.profile;
  const n = src.length;
  const v = new Float32Array(n);
  let max = 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    v[i] = Math.max(0, src[i] - lane.baseline[i]);
    if (v[i] > max) max = v[i];
    sum += v[i];
  }
  const k = normalize === 'max' ? (max > 0 ? 1 / max : 1) : normalize === 'area' ? (sum > 0 ? 100 / sum : 1) : 1;
  if (k !== 1) for (let i = 0; i < n; i += 1) v[i] *= k;
  return { v, max: max * k };
}

export const NORMALIZE_LABELS = {
  none: 'Signal au-dessus du fond (u.a.)',
  max: 'Signal normalisé (maximum = 1)',
  area: 'Signal normalisé (aire totale = 100)',
};

/**
 * Profils de migration, superposés ou empilés. Axe horizontal : migration (haut du gel à gauche),
 * gradué en tailles si le gel est étalonné.
 */
export function profilesSvg(state, profiles, results, { letter = null, style = null } = {}) {
  const o = { axis: 'size', areas: true, labels: true, mode: 'overlay', normalize: 'none', smooth: false, legend: 'inside', grid: false, ...(state.figure?.profiles ?? {}) };
  const st = style ?? figureStyle(state);
  const width = clamp(o.width, 360, 1800, 900);
  const height = clamp(o.height, 180, 1000, 380);
  const ids = o.lanes ?? results.sampleLanes.map((l) => l.id);
  const lanes = results.lanes.filter((l) => ids.includes(l.id));
  const n = profiles.length;
  const stack = o.mode === 'stack' && lanes.length > 1;
  const series = lanes.map((l) => ({ lane: l, name: `Piste ${laneName(l, state.lanes.findIndex((x) => x.id === l.id))}`, ...traceOf(l, o) }));
  const top = Math.max(0, ...series.map((s) => s.max)) || 1;

  // Légende (absente en mode empilé : chaque courbe porte son nom)
  const legend = stack || !series.length ? 'none' : o.legend;
  const itemW = (s) => 30 + textW(s.name, st.small);
  const legendRight = legend === 'right' ? Math.max(...series.map(itemW)) + 16 : 0;
  const pad = {
    t: 12 + letterSpace(st, letter),
    r: 14 + legendRight,
    b: st.small + st.size + 26,
    l: stack ? Math.max(...series.map((s) => textW(s.name, st.small))) + 18 : textW('0,000', st.small) + st.size + 22,
  };
  let legendRows = [];
  if (legend === 'top') {
    const avail = width - pad.l - pad.r;
    let row = [];
    let w = 0;
    for (const s of series) {
      if (row.length && w + itemW(s) > avail) { legendRows.push(row); row = []; w = 0; }
      row.push(s);
      w += itemW(s) + 12;
    }
    if (row.length) legendRows.push(row);
    pad.t += legendRows.length * (st.small + 8) + 4;
  }
  const pw = width - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const xs = (i) => pad.l + (i / Math.max(1, n - 1)) * pw;
  // Empilé : chaque piste décalée vers le haut, la première en haut ; les courbes se chevauchent un peu
  const step = top * 0.62;
  const span = stack ? step * (series.length - 1) + top * 1.08 : top * 1.12;
  const offset = (k) => (stack ? (series.length - 1 - k) * step : 0);
  const ys = (v, k = 0) => pad.t + ph - ((Math.max(0, v) + offset(k)) / span) * ph;

  let out = svgOpen(width, height, st, letter);
  const cal = results.calibration;
  const sizeTicks = [];
  if (cal && o.axis !== 'position') {
    const sizes = (state.calibration.ladder?.bands ?? []).map((b) => b.size).sort((a, b) => b - a);
    const axis = sizeAxis(sizes, results.unit);
    let lastX = -Infinity;
    for (const size of sizes) {
      const p = cal.posAt(size);
      if (!(p >= 0 && p <= n - 1)) continue;
      const x = xs(p);
      // Marqueurs serrés en haut du gel : une étiquette sur deux plutôt qu'un chevauchement
      const text = axis.label(size);
      const show = x - lastX >= textW(text, st.small) + 6;
      if (show) lastX = x;
      sizeTicks.push({ x, text: show ? text : null });
    }
    sizeTicks.title = `Taille (${axis.unit}) — migration de gauche à droite`;
  } else {
    for (const f of [0, 0.25, 0.5, 0.75, 1]) sizeTicks.push({ x: xs(f * (n - 1)), text: `${Math.round(f * 100)} %` });
    sizeTicks.title = 'Distance de migration (% de la zone)';
  }
  const yTicks = stack ? [] : niceTicks(top);
  // Grille
  if (o.grid) {
    for (const v of yTicks) out += `<line x1="${f1(pad.l)}" x2="${f1(pad.l + pw)}" y1="${f1(ys(v))}" y2="${f1(ys(v))}" stroke="#E3E7ED" stroke-width="1"/>`;
    for (const t of sizeTicks) out += `<line x1="${f1(t.x)}" x2="${f1(t.x)}" y1="${f1(pad.t)}" y2="${f1(pad.t + ph)}" stroke="#E3E7ED" stroke-width="1"/>`;
  }
  // Axes
  out += `<line x1="${f1(pad.l)}" y1="${f1(pad.t + ph)}" x2="${f1(pad.l + pw)}" y2="${f1(pad.t + ph)}" stroke="#222"/>`;
  if (!stack) out += `<line x1="${f1(pad.l)}" y1="${f1(pad.t)}" x2="${f1(pad.l)}" y2="${f1(pad.t + ph)}" stroke="#222"/>`;
  for (const v of yTicks) {
    out += `<line x1="${f1(pad.l - 4)}" x2="${f1(pad.l)}" y1="${f1(ys(v))}" y2="${f1(ys(v))}" stroke="#222"/>`;
    out += `<text x="${f1(pad.l - 7)}" y="${f1(ys(v) + st.small * 0.35)}" font-size="${st.small}" text-anchor="end" fill="#222">${esc(formatNumber(v, 3))}</text>`;
  }
  for (const t of sizeTicks) {
    out += `<line x1="${f1(t.x)}" x2="${f1(t.x)}" y1="${f1(pad.t + ph)}" y2="${f1(pad.t + ph + 4)}" stroke="#222"/>`;
    if (t.text) out += `<text x="${f1(t.x)}" y="${f1(pad.t + ph + 6 + st.small)}" font-size="${st.small}" text-anchor="middle" fill="#222">${esc(t.text)}</text>`;
  }
  out += `<text x="${f1(pad.l + pw / 2)}" y="${f1(height - 10)}" font-size="${st.size}" text-anchor="middle" fill="#222">${esc(sizeTicks.title)}</text>`;
  if (!stack) {
    const cy = pad.t + ph / 2;
    out += `<text x="${f1(st.size + 2)}" y="${f1(cy)}" font-size="${st.size}" text-anchor="middle" fill="#222" transform="rotate(-90 ${f1(st.size + 2)} ${f1(cy)})">${esc(NORMALIZE_LABELS[o.normalize] ?? NORMALIZE_LABELS.none)}</text>`;
  }

  // Courbes, aires des bandes en transparence, tailles au-dessus des pics
  const every = Math.max(1, Math.floor(n / (pw * 2)));
  series.forEach((s, k) => {
    const col = laneColor(st, k);
    if (stack) {
      out += `<line x1="${f1(pad.l)}" x2="${f1(pad.l + pw)}" y1="${f1(ys(0, k))}" y2="${f1(ys(0, k))}" stroke="#C9D0DA" stroke-width="0.8"/>`;
      out += `<text x="${f1(pad.l - 8)}" y="${f1(ys(0, k) - 3)}" font-size="${st.small}" text-anchor="end" fill="${st.gray ? '#111' : col}">${esc(s.name)}</text>`;
    }
    if (o.areas !== false) {
      for (const b of s.lane.bands) {
        let d = `M${f1(xs(b.left))},${f1(ys(0, k))}`;
        for (let i = b.left; i <= b.right; i += 1) d += `L${f1(xs(i))},${f1(ys(s.v[i], k))}`;
        d += `L${f1(xs(b.right))},${f1(ys(0, k))}Z`;
        out += `<path d="${d}" fill="${st.gray ? '#000' : col}" fill-opacity="${st.gray ? 0.09 : 0.16}" stroke="none"/>`;
      }
    }
    let d = '';
    for (let i = 0; i < n; i += every) d += `${i ? 'L' : 'M'}${f1(xs(i))},${f1(ys(s.v[i], k))}`;
    const dash = laneDash(st, k);
    out += `<path d="${d}" fill="none" stroke="${col}" stroke-width="${st.line}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
    if (o.labels !== false && (stack || series.length <= 3)) {
      // Étiquettes qui se chevaucheraient : la suivante est omise (les bandes serrées restent lisibles)
      let lastRight = -Infinity;
      for (const b of s.lane.bands) {
        const label = b.size ? formatSize(b.size, results.unit) : '';
        if (!label) continue;
        const half = textW(label, st.tiny) / 2;
        const x = xs(b.apex);
        if (x - half < lastRight + 3) continue;
        lastRight = x + half;
        out += `<text x="${f1(x)}" y="${f1(Math.max(pad.t + st.tiny, ys(s.v[b.apex], k) - 5))}" font-size="${st.tiny}" text-anchor="middle" fill="${st.gray ? '#111' : col}">${esc(label)}</text>`;
      }
    }
  });

  // Légende
  const item = (s, k, x, y) => {
    const dash = laneDash(st, k);
    return `<line x1="${f1(x)}" x2="${f1(x + 22)}" y1="${f1(y)}" y2="${f1(y)}" stroke="${laneColor(st, k)}" stroke-width="${Math.max(2, st.line + 0.6)}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
      + `<text x="${f1(x + 28)}" y="${f1(y + st.small * 0.35)}" font-size="${st.small}" fill="#222">${esc(s.name)}</text>`;
  };
  const lh = st.small + 6;
  if (legend === 'inside' || legend === 'right') {
    const w = Math.max(...series.map(itemW));
    const x = legend === 'right' ? pad.l + pw + 16 : pad.l + pw - w - 6;
    const y0 = pad.t + 4;
    if (legend === 'inside') out += `<rect x="${f1(x - 6)}" y="${f1(y0 - 2)}" width="${f1(w + 10)}" height="${f1(series.length * lh + 6)}" fill="#fff" fill-opacity="0.85"/>`;
    series.forEach((s, k) => { out += item(s, k, x, y0 + lh / 2 + 2 + k * lh); });
  } else if (legend === 'top') {
    let idx = 0;
    legendRows.forEach((row, r) => {
      let x = pad.l;
      const y = 12 + letterSpace(st, letter) + r * (st.small + 8) + st.small / 2;
      for (const s of row) { out += item(s, idx, x, y); x += itemW(s) + 12; idx += 1; }
    });
  }
  return `${out}</svg>`;
}

/** Courbe d'étalonnage : log(taille) selon la migration, marqueurs et courbe ajustée. */
export function calibrationSvg(state, profiles, results, { width = 520, height = 340, letter = null, style = null } = {}) {
  const cal = results.calibration;
  if (!cal) return null;
  const st = style ?? figureStyle(state);
  const axis = sizeAxis(cal.points.map((p) => p.size), results.unit);
  const pad = {
    t: 14 + letterSpace(st, letter) + st.small,
    r: 16,
    b: st.small + st.size + 26,
    l: Math.max(...cal.points.map((p) => textW(axis.label(p.size), st.small))) + st.size + 22,
  };
  const pw = width - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const n = profiles.length;
  const logs = cal.points.map((p) => Math.log10(p.size));
  const lo = Math.min(...logs) - 0.08;
  const hi = Math.max(...logs) + 0.08;
  const xs = (i) => pad.l + (i / Math.max(1, n - 1)) * pw;
  const ys = (l) => pad.t + ph - ((l - lo) / (hi - lo)) * ph;
  let out = svgOpen(width, height, st, letter);
  out += `<line x1="${f1(pad.l)}" y1="${f1(pad.t + ph)}" x2="${f1(pad.l + pw)}" y2="${f1(pad.t + ph)}" stroke="#222"/><line x1="${f1(pad.l)}" y1="${f1(pad.t)}" x2="${f1(pad.l)}" y2="${f1(pad.t + ph)}" stroke="#222"/>`;
  for (const p of cal.points) {
    const y = ys(Math.log10(p.size));
    out += `<text x="${f1(pad.l - 7)}" y="${f1(y + st.small * 0.35)}" font-size="${st.small}" text-anchor="end" fill="#222">${esc(axis.label(p.size))}</text>`;
  }
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    out += `<text x="${f1(xs(f * (n - 1)))}" y="${f1(pad.t + ph + 6 + st.small)}" font-size="${st.small}" text-anchor="middle" fill="#222">${Math.round(f * (n - 1))}</text>`;
  }
  let d = '';
  const [a, b] = cal.range;
  for (let k = 0; k <= 60; k += 1) {
    const x = a + ((b - a) * k) / 60;
    d += `${k ? 'L' : 'M'}${f1(xs(x))},${f1(ys(Math.log10(cal.sizeAt(x))))}`;
  }
  const accent = st.gray ? '#111' : '#D55E00';
  out += `<path d="${d}" fill="none" stroke="${accent}" stroke-width="${st.line}" stroke-dasharray="6 3"/>`;
  for (const p of cal.points) out += `<circle cx="${f1(xs(p.pos))}" cy="${f1(ys(Math.log10(p.size)))}" r="${f1(Math.max(3, st.size * 0.3))}" fill="${st.gray ? '#111' : '#0072B2'}"/>`;
  const method = { interp: 'interpolation', linear: 'linéaire', quadratic: 'polynôme deg. 2' }[cal.method];
  out += `<text x="${f1(pad.l + pw)}" y="${f1(pad.t - 6)}" font-size="${st.small}" text-anchor="end" fill="#222">${esc(method)}${cal.method !== 'interp' ? `, R² = ${esc(formatNumber(cal.r2, 4))}` : ''}</text>`;
  out += `<text x="${f1(pad.l + pw / 2)}" y="${f1(height - 10)}" font-size="${st.size}" text-anchor="middle" fill="#222">Migration (px)</text>`;
  const cy = pad.t + ph / 2;
  out += `<text x="${f1(st.size + 2)}" y="${f1(cy)}" font-size="${st.size}" text-anchor="middle" fill="#222" transform="rotate(-90 ${f1(st.size + 2)} ${f1(cy)})">Taille (${esc(axis.unit)}, échelle log)</text>`;
  return `${out}</svg>`;
}

/** Gamme étalon : quantité selon l'aire. */
export function standardSvg(state, results, { width = 520, height = 340, unit = 'µg', letter = null, style = null } = {}) {
  const std = results.standard;
  if (!std) return null;
  const st = style ?? figureStyle(state);
  const pts = results.standardPoints.filter((p) => p.area > 0 && p.amount > 0);
  const maxA = Math.max(...pts.map((p) => p.area)) * 1.1;
  const maxQ = Math.max(...pts.map((p) => p.amount)) * 1.1;
  const qTicks = niceTicks(maxQ / 1.1);
  const pad = {
    t: 14 + letterSpace(st, letter) + st.small,
    r: 16,
    b: st.small + st.size + 26,
    l: Math.max(...qTicks.map((q) => textW(formatNumber(q, 3), st.small))) + st.size + 22,
  };
  const pw = width - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const xs = (a) => pad.l + (a / maxA) * pw;
  const ys = (q) => pad.t + ph - (q / maxQ) * ph;
  let out = svgOpen(width, height, st, letter);
  out += `<line x1="${f1(pad.l)}" y1="${f1(pad.t + ph)}" x2="${f1(pad.l + pw)}" y2="${f1(pad.t + ph)}" stroke="#222"/><line x1="${f1(pad.l)}" y1="${f1(pad.t)}" x2="${f1(pad.l)}" y2="${f1(pad.t + ph)}" stroke="#222"/>`;
  for (const q of qTicks) out += `<text x="${f1(pad.l - 7)}" y="${f1(ys(q) + st.small * 0.35)}" font-size="${st.small}" text-anchor="end" fill="#222">${esc(formatNumber(q, 3))}</text>`;
  const accent = st.gray ? '#111' : '#D55E00';
  out += `<line x1="${f1(xs(0))}" y1="${f1(ys(std.intercept))}" x2="${f1(xs(maxA))}" y2="${f1(ys(std.slope * maxA + std.intercept))}" stroke="${accent}" stroke-width="${st.line}" stroke-dasharray="6 3"/>`;
  for (const p of pts) out += `<circle cx="${f1(xs(p.area))}" cy="${f1(ys(p.amount))}" r="${f1(Math.max(3, st.size * 0.3))}" fill="${st.gray ? '#111' : '#0072B2'}"/>`;
  out += `<text x="${f1(pad.l + pw)}" y="${f1(pad.t - 6)}" font-size="${st.small}" text-anchor="end" fill="#222">R² = ${esc(formatNumber(std.r2, 3))}</text>`;
  out += `<text x="${f1(pad.l + pw / 2)}" y="${f1(height - 10)}" font-size="${st.size}" text-anchor="middle" fill="#222">Aire de la bande (u.a.)</text>`;
  const cy = pad.t + ph / 2;
  out += `<text x="${f1(st.size + 2)}" y="${f1(cy)}" font-size="${st.size}" text-anchor="middle" fill="#222" transform="rotate(-90 ${f1(st.size + 2)} ${f1(cy)})">Quantité (${esc(unit)})</text>`;
  return `${out}</svg>`;
}

export { panelWidths } from './layout.js';
