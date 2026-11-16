// Générateur de graphiques (SVG pur, fond blanc) : le même SVG sert à l'aperçu, au PNG inséré
// dans l'entrée et au téléchargement. Les réglages sont dans ds.graph.

import { formatNumber } from '../calc/units.js';
import { describe, mean, percentile, sd } from './core.js';
import { tInv } from './dist.js';
import { stars as starsOf } from './analysis.js';
import { KINDS, columnValues, filledColumns, groupedCells, num, survivalGroups } from './model.js';

export const PALETTES = {
  color: { label: 'Couleurs', colors: ['#0072B2', '#D55E00', '#009E73', '#CC79A7', '#E69F00', '#56B4E9', '#000000', '#F0E442'] },
  vivid: { label: 'Vives', colors: ['#E64B35', '#4DBBD5', '#00A087', '#3C5488', '#F39B7F', '#8491B4', '#91D1C2', '#7E6148'] },
  pastel: { label: 'Pastel', colors: ['#8DA0CB', '#FC8D62', '#66C2A5', '#E78AC3', '#A6D854', '#FFD92F', '#E5C494', '#B3B3B3'] },
  gray: { label: 'Gris', colors: ['#333333', '#8C8C8C', '#BDBDBD', '#5E5E5E', '#A6A6A6', '#D9D9D9'] },
  black: { label: 'Noir', colors: ['#111111'] },
};
export const FONTS = { sans: 'Helvetica, Arial, sans-serif', serif: '"Times New Roman", Times, serif' };
export const PLOT_TYPES = {
  column: { scatter: 'Nuage de points', bar: 'Barres', box: 'Boîtes à moustaches', violin: 'Violons', meanerr: 'Moyenne et barres d’erreur' },
  xy: { xy: 'Points et courbe' },
  grouped: { groupedBar: 'Barres groupées', groupedDots: 'Points groupés', line: 'Courbes (moyennes reliées)' },
  contingency: { stacked: 'Barres empilées', grouped: 'Barres côte à côte' },
  survival: { km: 'Courbes de survie' },
};
export const ERRORS = { sd: 'Écart-type', sem: 'Erreur type (SEM)', ci: 'IC 95 %', range: 'Étendue (min – max)', iqr: 'Écart interquartile', none: 'Aucune' };
const MARKERS = ['circle', 'square', 'triangle', 'diamond', 'down', 'circleOpen', 'squareOpen'];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f1 = (x) => Math.round(x * 10) / 10;
const textW = (s, size) => String(s).length * size * 0.55;
const lighten = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * (1 - a));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix).map((c) => c.toString(16).padStart(2, '0')).join('')}`;
};

/** Graduations « rondes » entre lo et hi. */
function niceTicks(lo, hi, count = 5) {
  const span = hi - lo;
  if (!(span > 0)) return { ticks: [lo], lo, hi: lo + 1 };
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const a = Math.floor(lo / step + 1e-9) * step;
  const b = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = a; v <= b + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { ticks, lo: a, hi: b };
}

function tickLabel(v) {
  const abs = Math.abs(v);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-3)) return formatNumber(v, 3);
  return Number(v.toPrecision(12)).toLocaleString('fr-FR', { maximumFractionDigits: 6 });
}

/** Centre et barres d'erreur d'une série de valeurs. */
export function spread(values, { center = 'mean', error = 'sd' } = {}) {
  const d = describe(values);
  const c = center === 'median' ? d.median : d.mean;
  let lo = c;
  let hi = c;
  if (d.n > 1) {
    if (error === 'sd') { lo = c - d.sd; hi = c + d.sd; }
    else if (error === 'sem') { lo = c - d.sem; hi = c + d.sem; }
    else if (error === 'ci') { const h = tInv(0.975, d.n - 1) * d.sem; lo = c - h; hi = c + h; }
  }
  if (error === 'range') { lo = d.min; hi = d.max; }
  if (error === 'iqr') { lo = d.q1; hi = d.q3; }
  return { c, lo, hi, d };
}

/** Disposition « essaim » : points de même hauteur écartés latéralement sans se chevaucher. */
function beeswarm(ys, diameter, maxHalf) {
  const order = ys.map((y, i) => [y, i]).sort((a, b) => a[0] - b[0]);
  const placed = [];
  const xs = new Array(ys.length).fill(0);
  for (const [y, i] of order) {
    let best = 0;
    for (let k = 0; k < 400; k += 1) {
      const dx = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * diameter * 0.5;
      if (placed.every((p) => Math.hypot(p.x - dx, p.y - y) >= diameter * 0.98)) { best = dx; break; }
    }
    xs[i] = best;
    placed.push({ x: best, y });
  }
  const widest = Math.max(1e-9, ...xs.map(Math.abs));
  const k = widest > maxHalf ? maxHalf / widest : 1;
  return xs.map((x) => x * k);
}

function marker(shape, x, y, r, color, fill) {
  const s = `stroke="${color}" stroke-width="${f1(Math.max(1, r / 3))}"`;
  const fl = fill ?? color;
  switch (shape) {
    case 'square': return `<rect x="${f1(x - r * 0.85)}" y="${f1(y - r * 0.85)}" width="${f1(r * 1.7)}" height="${f1(r * 1.7)}" fill="${fl}" ${s}/>`;
    case 'squareOpen': return `<rect x="${f1(x - r * 0.85)}" y="${f1(y - r * 0.85)}" width="${f1(r * 1.7)}" height="${f1(r * 1.7)}" fill="#fff" ${s}/>`;
    case 'triangle': return `<path d="M${f1(x)},${f1(y - r * 1.1)}L${f1(x + r)},${f1(y + r * 0.75)}L${f1(x - r)},${f1(y + r * 0.75)}Z" fill="${fl}" ${s}/>`;
    case 'down': return `<path d="M${f1(x)},${f1(y + r * 1.1)}L${f1(x + r)},${f1(y - r * 0.75)}L${f1(x - r)},${f1(y - r * 0.75)}Z" fill="${fl}" ${s}/>`;
    case 'diamond': return `<path d="M${f1(x)},${f1(y - r * 1.2)}L${f1(x + r)},${f1(y)}L${f1(x)},${f1(y + r * 1.2)}L${f1(x - r)},${f1(y)}Z" fill="${fl}" ${s}/>`;
    case 'circleOpen': return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="#fff" ${s}/>`;
    default: return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${fl}" ${s}/>`;
  }
}

/** Densité (noyau gaussien, largeur de Silverman), évaluée entre le minimum et le maximum. */
function kde(values, steps = 60) {
  const n = values.length;
  const s = [...values].sort((a, b) => a - b);
  const iqr = percentile(s, 0.75) - percentile(s, 0.25);
  const h = 0.9 * Math.min(sd(values) || 1, iqr / 1.34 || sd(values) || 1) * n ** -0.2 || 1;
  const lo = s[0];
  const hi = s[n - 1];
  const out = [];
  for (let k = 0; k <= steps; k += 1) {
    const y = lo + ((hi - lo) * k) / steps;
    let d = 0;
    for (const v of values) d += Math.exp(-0.5 * ((y - v) / h) ** 2);
    out.push([y, d / (n * h * Math.sqrt(2 * Math.PI))]);
  }
  return out;
}

/** Crochets de significativité, empilés sans chevauchement (données en unités de l'axe Y). */
function placeBrackets(list, tops, step, gap) {
  const placed = [];
  const sorted = [...list].sort((a, b) => (a.j - a.i) - (b.j - b.i) || a.i - b.i);
  for (const b of sorted) {
    let y = Math.max(...tops.slice(b.i, b.j + 1)) + gap;
    for (const p of placed) if (p.i <= b.j && b.i <= p.j) y = Math.max(y, p.y + step);
    placed.push({ ...b, y });
  }
  return placed;
}

/**
 * Construit le graphique. res = résultat de analyze() (étoiles, courbes ajustées, survie).
 * Renvoie { svg, width, height }.
 */
export function renderPlot(ds, res) {
  const g = ds.graph;
  const width = Math.max(260, Math.min(2000, Number(g.width) || 520));
  const height = Math.max(200, Math.min(2000, Number(g.height) || 400));
  const fs = Math.max(8, Math.min(32, Number(g.fontSize) || 14));
  const small = f1(fs * 0.86);
  const lw = Math.max(0.5, Math.min(6, Number(g.lineWidth) || 1.5));
  const font = FONTS[g.font] ?? FONTS.sans;
  const pal = (PALETTES[g.palette] ?? PALETTES.color).colors;
  const colorOf = (id, i) => g.colors?.[id] || pal[i % pal.length];
  const kind = ds.kind;
  const ctx = { ds, res, g, width, height, fs, small, lw, font, colorOf };
  let body;
  if (kind === 'column') body = columnPlot(ctx);
  else if (kind === 'xy') body = xyPlot(ctx);
  else if (kind === 'grouped') body = groupedPlot(ctx);
  else if (kind === 'contingency') body = contingencyPlot(ctx);
  else body = survivalPlot(ctx);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(font)}">`
    + `<rect width="${width}" height="${height}" fill="#ffffff"/>${body}</svg>`;
  return { svg, width, height };
}

// --- Cadre commun : marges, axe Y, titre, légende ---------------------------------------------------------------

function frame(ctx, { yLo, yHi, yLog = false, zeroBase = false, categories = null, legend = [], note = '', xTitleDefault = '' }) {
  const { g, width, height, fs, small, lw } = ctx;
  // Échelle Y (linéaire ou logarithmique)
  let lo = yLo;
  let hi = yHi;
  const userMin = num(g.yMin);
  const userMax = num(g.yMax);
  let ticks;
  if (yLog) {
    lo = Number.isFinite(userMin) && userMin > 0 ? Math.log10(userMin) : Math.floor(Math.log10(Math.max(1e-12, lo)));
    hi = Number.isFinite(userMax) && userMax > 0 ? Math.log10(userMax) : Math.ceil(Math.log10(Math.max(1e-12, hi)));
    if (hi <= lo) hi = lo + 1;
    ticks = [];
    for (let e = Math.ceil(lo); e <= Math.floor(hi); e += 1) ticks.push(e);
  } else {
    if (zeroBase) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
    const nt = niceTicks(Number.isFinite(userMin) ? userMin : lo, Number.isFinite(userMax) ? userMax : hi, Math.max(3, Math.round(height / 80)));
    lo = Number.isFinite(userMin) ? userMin : nt.lo;
    hi = Number.isFinite(userMax) ? userMax : nt.hi;
    ticks = nt.ticks.filter((t) => t >= lo - 1e-9 && t <= hi + 1e-9);
  }
  const tickText = (t) => (yLog ? (Math.abs(t) <= 3 ? tickLabel(10 ** t) : `10^${t}`) : tickLabel(t));
  const yLabelW = Math.max(...ticks.map((t) => textW(tickText(t), small)), textW('0', small));
  const titleH = g.title ? fs * 1.35 + 8 : 0;
  const legendItems = legend.filter(Boolean);
  // Note (p du log-rank…) : sous la légende, ou seule à droite quand il n'y a pas de légende
  const legendMode = legendItems.length ? g.legend : note ? 'right' : 'none';
  const itemsW = legendItems.length ? Math.max(...legendItems.map((l) => textW(l.name, small))) + 34 : 0;
  const noteW = note ? textW(note, small) + 18 : 0;
  const legendW = legendMode === 'right' ? Math.max(itemsW, noteW) : 0;
  const legendH = legendMode === 'top' ? small + 12 : 0;
  // Libellés de l'axe X (catégories), éventuellement inclinés
  const angle = Number(g.xAngle) || 0;
  const catW = categories ? Math.max(0, ...categories.map((c) => textW(c, fs))) : 0;
  const xLabelH = categories
    ? (angle === 0 ? fs + 8 : angle === 90 ? catW + 10 : catW * 0.72 + fs * 0.7 + 8)
    : small + 8;
  const xTitle = g.xTitle || xTitleDefault;
  const pad = {
    t: 10 + titleH + legendH,
    l: 14 + (g.yTitle ? fs + 10 : 0) + yLabelW + 8,
    r: Math.max(12 + legendW, categories ? 12 : small * 2.4),
    b: 8 + xLabelH + (xTitle ? fs + 10 : 0),
  };
  const pw = width - pad.l - pad.r;
  const ph = height - pad.t - pad.b;
  const Y = (v) => {
    const t = yLog ? Math.log10(Math.max(v, 1e-300)) : v;
    return pad.t + ph - ((t - lo) / (hi - lo)) * ph;
  };
  let out = '';
  if (g.title) out += `<text x="${f1(pad.l + pw / 2)}" y="${f1(8 + fs * 1.1)}" font-size="${f1(fs * 1.15)}" font-weight="bold" text-anchor="middle" fill="#111">${esc(g.title)}</text>`;
  // Axe Y
  out += `<line x1="${f1(pad.l)}" x2="${f1(pad.l)}" y1="${f1(pad.t)}" y2="${f1(pad.t + ph)}" stroke="#111" stroke-width="${lw}"/>`;
  for (const t of ticks) {
    const y = pad.t + ph - ((t - lo) / (hi - lo)) * ph;
    out += `<line x1="${f1(pad.l - 5)}" x2="${f1(pad.l)}" y1="${f1(y)}" y2="${f1(y)}" stroke="#111" stroke-width="${lw}"/>`;
    out += yLog && Math.abs(t) > 3
      ? `<text x="${f1(pad.l - 8)}" y="${f1(y + small * 0.35)}" font-size="${small}" text-anchor="end" fill="#111">10<tspan dy="${f1(-small * 0.4)}" font-size="${f1(small * 0.75)}">${t}</tspan></text>`
      : `<text x="${f1(pad.l - 8)}" y="${f1(y + small * 0.35)}" font-size="${small}" text-anchor="end" fill="#111">${esc(tickText(t))}</text>`;
    if (yLog && t < Math.floor(hi)) {
      for (let m = 2; m < 10; m += 1) {
        const ym = pad.t + ph - ((t + Math.log10(m) - lo) / (hi - lo)) * ph;
        out += `<line x1="${f1(pad.l - 3)}" x2="${f1(pad.l)}" y1="${f1(ym)}" y2="${f1(ym)}" stroke="#111" stroke-width="${f1(lw * 0.7)}"/>`;
      }
    }
  }
  if (g.yTitle) {
    const cy = pad.t + ph / 2;
    out += `<text x="${f1(14 + fs * 0.8)}" y="${f1(cy)}" font-size="${fs}" text-anchor="middle" fill="#111" transform="rotate(-90 ${f1(14 + fs * 0.8)} ${f1(cy)})">${esc(g.yTitle)}</text>`;
  }
  if (xTitle) out += `<text x="${f1(pad.l + pw / 2)}" y="${f1(height - 10)}" font-size="${fs}" text-anchor="middle" fill="#111">${esc(xTitle)}</text>`;
  // Légende
  const item = (l, x, y) => {
    let s = '';
    if (l.line) s += `<line x1="${f1(x)}" x2="${f1(x + 22)}" y1="${f1(y)}" y2="${f1(y)}" stroke="${l.color}" stroke-width="${lw + 0.5}"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''}/>`;
    if (l.box) s += `<rect x="${f1(x + 4)}" y="${f1(y - small * 0.45)}" width="${f1(small * 0.9)}" height="${f1(small * 0.9)}" fill="${l.fill ?? l.color}" stroke="${l.color}" stroke-width="${lw}"/>`;
    if (l.marker) s += marker(l.marker, x + 11, y, Math.max(3, small * 0.35), l.color, l.fill);
    return `${s}<text x="${f1(x + 28)}" y="${f1(y + small * 0.35)}" font-size="${small}" fill="#111">${esc(l.name)}</text>`;
  };
  const noteText = (x, y) => `<text x="${f1(x)}" y="${f1(y + small * 0.35)}" font-size="${small}" fill="#111">${esc(note)}</text>`;
  const n = legendItems.length;
  if (legendMode === 'right') {
    legendItems.forEach((l, k) => { out += item(l, pad.l + pw + 18, pad.t + 8 + k * (small + 8)); });
    if (note) out += noteText(pad.l + pw + 18, pad.t + 8 + n * (small + 8) + (n ? small * 0.5 : 0));
  } else if (legendMode === 'top') {
    let x = pad.l;
    for (const l of legendItems) { out += item(l, x, 10 + titleH + small * 0.6); x += textW(l.name, small) + 44; }
    if (note) out += noteText(x, 10 + titleH + small * 0.6);
  } else if (legendMode === 'inside') {
    const w = Math.max(itemsW + 2, noteW - 8);
    const rows = n + (note ? 1 : 0);
    out += `<rect x="${f1(pad.l + pw - w - 4)}" y="${f1(pad.t + 2)}" width="${f1(w)}" height="${f1(rows * (small + 8) + 6)}" fill="#fff" fill-opacity="0.9"/>`;
    legendItems.forEach((l, k) => { out += item(l, pad.l + pw - w + 2, pad.t + 12 + k * (small + 8)); });
    if (note) out += noteText(pad.l + pw - w + 2, pad.t + 12 + n * (small + 8));
  }
  return { out, pad, pw, ph, Y, lo, hi, yLog };
}

/** Axe X de catégories (noms de colonnes ou de lignes). */
function categoryAxis(ctx, fr, cats, xs) {
  const { g, fs, lw } = ctx;
  const { pad, pw, ph } = fr;
  const angle = Number(g.xAngle) || 0;
  let out = `<line x1="${f1(pad.l)}" x2="${f1(pad.l + pw)}" y1="${f1(pad.t + ph)}" y2="${f1(pad.t + ph)}" stroke="#111" stroke-width="${lw}"/>`;
  cats.forEach((c, i) => {
    const x = xs[i];
    const y = pad.t + ph + 6;
    out += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${f1(pad.t + ph)}" y2="${f1(pad.t + ph + 5)}" stroke="#111" stroke-width="${lw}"/>`;
    if (angle === 0) out += `<text x="${f1(x)}" y="${f1(y + fs)}" font-size="${fs}" text-anchor="middle" fill="#111">${esc(c)}</text>`;
    else out += `<text x="${f1(x)}" y="${f1(y + fs * 0.4)}" font-size="${fs}" text-anchor="end" fill="#111" transform="rotate(${-angle} ${f1(x)} ${f1(y + fs * 0.4)})">${esc(c)}</text>`;
  });
  return out;
}

function errorBar(x, lo, hi, cap, color, lw) {
  if (!(Math.abs(hi - lo) > 0.5)) return '';
  return `<line x1="${f1(x)}" x2="${f1(x)}" y1="${f1(lo)}" y2="${f1(hi)}" stroke="${color}" stroke-width="${lw}"/>`
    + `<line x1="${f1(x - cap)}" x2="${f1(x + cap)}" y1="${f1(lo)}" y2="${f1(lo)}" stroke="${color}" stroke-width="${lw}"/>`
    + `<line x1="${f1(x - cap)}" x2="${f1(x + cap)}" y1="${f1(hi)}" y2="${f1(hi)}" stroke="${color}" stroke-width="${lw}"/>`;
}

function bracketsSvg(ctx, fr, placed, xs) {
  const { g, fs, lw } = ctx;
  let out = '';
  for (const b of placed) {
    const y = fr.Y(b.y);
    const x1 = xs[b.i] + 3;
    const x2 = xs[b.j] - 3;
    const label = g.starStyle === 'p' ? (b.p < 0.0001 ? 'P < 0,0001' : `P = ${b.p.toFixed(4).replace('.', ',')}`) : starsOf(b.p, g.thresholds);
    out += `<path d="M${f1(x1)},${f1(y + fs * 0.45)}L${f1(x1)},${f1(y)}L${f1(x2)},${f1(y)}L${f1(x2)},${f1(y + fs * 0.45)}" fill="none" stroke="#111" stroke-width="${f1(lw * 0.8)}"/>`;
    out += `<text x="${f1((x1 + x2) / 2)}" y="${f1(y - 4)}" font-size="${f1(label === 'ns' || g.starStyle === 'p' ? fs * 0.8 : fs * 1.05)}" text-anchor="middle" fill="#111">${esc(label)}</text>`;
  }
  return out;
}

/**
 * Cadre et crochets : les crochets sont espacés en pixels (hauteur du texte), l'axe Y est
 * agrandi jusqu'à les contenir (deux ou trois passes, l'arrondi des graduations changeant l'échelle).
 * sets = [{ pairs, tops }] (un jeu par groupe de barres).
 */
function withBrackets(ctx, opts, sets) {
  const { fs } = ctx;
  let hiExt = opts.yHi;
  let fr = frame(ctx, opts);
  let placed = sets.map(() => []);
  if (opts.yLog || !sets.some((st) => st.pairs.length)) return { fr, placed };
  for (let pass = 0; pass < 4; pass += 1) {
    const u = (fr.hi - fr.lo) / fr.ph;
    placed = sets.map((st) => placeBrackets(st.pairs, st.tops, fs * 1.75 * u, fs * 0.8 * u));
    const need = Math.max(...placed.flat().map((b) => b.y + fs * 1.4 * u));
    if (need <= fr.hi || Number.isFinite(num(ctx.g.yMax))) break;
    hiExt = Math.max(hiExt, need);
    fr = frame(ctx, { ...opts, yHi: hiExt });
  }
  return { fr, placed };
}

const wantBracket = (g, p) => g.stars !== 'none' && Number.isFinite(p) && (g.stars === 'all' || p < 0.05);

// --- Colonnes --------------------------------------------------------------------------------------------------

function columnPlot(ctx) {
  const { ds, res, g, lw, colorOf } = ctx;
  const cols = filledColumns(ds);
  if (!cols.length) return empty(ctx, 'Saisissez des valeurs pour voir le graphique.');
  const data = cols.map((c) => columnValues(ds, c.id));
  const type = g.type;
  const center = type === 'box' || type === 'violin' ? 'median' : g.center;
  const stats = data.map((v) => spread(v, { center, error: g.error }));
  const lo = Math.min(...data.flat(), ...stats.map((s) => s.lo));
  const hi = Math.max(...data.flat(), ...stats.map((s) => s.hi));
  // Comme Prism : l'axe Y part de 0 (sauf échelle log ou Y min imposé)
  const zeroBase = !g.yLog;
  // Crochets de significativité au-dessus de chaque colonne
  const tops = cols.map((_, i) => Math.max(...data[i], stats[i].hi));
  const idx = Object.fromEntries(cols.map((c, i) => [c.id, i]));
  const pairs = (res?.comparisons ?? []).filter((c) => idx[c.a] !== undefined && idx[c.b] !== undefined && wantBracket(g, c.p))
    .map((c) => ({ i: Math.min(idx[c.a], idx[c.b]), j: Math.max(idx[c.a], idx[c.b]), p: c.p }));
  const { fr, placed } = withBrackets(ctx, { yLo: lo, yHi: hi, yLog: g.yLog, zeroBase, categories: cols.map((c) => c.name) }, [{ pairs, tops }]);
  const { pad, pw, Y } = fr;
  const band = pw / cols.length;
  const xs = cols.map((_, i) => pad.l + band * (i + 0.5));
  const r = Math.max(1.5, Number(g.pointSize) / 2 || 3);
  const half = Math.min(band * 0.32, 60);
  let out = fr.out;
  cols.forEach((c, i) => {
    const color = colorOf(c.id, i);
    const s = stats[i];
    const x = xs[i];
    const fill = g.fill === 'solid' ? color : g.fill === 'none' ? '#fff' : lighten(color, 0.3);
    if (type === 'bar') {
      const base = Y(g.yLog ? 10 ** fr.lo : 0);
      const yTop = Y(s.c);
      out += `<rect x="${f1(x - half)}" y="${f1(Math.min(base, yTop))}" width="${f1(half * 2)}" height="${f1(Math.abs(base - yTop))}" fill="${fill}" stroke="${color}" stroke-width="${lw}"/>`;
    }
    if (type === 'box') {
      const d = s.d;
      const sorted = [...data[i]].sort((a, b) => a - b);
      const iqr = d.q3 - d.q1;
      let wLo = d.min;
      let wHi = d.max;
      if (g.whiskers === 'tukey') {
        wLo = sorted.find((v) => v >= d.q1 - 1.5 * iqr);
        wHi = [...sorted].reverse().find((v) => v <= d.q3 + 1.5 * iqr);
      } else if (g.whiskers === 'p10') { wLo = percentile(sorted, 0.1); wHi = percentile(sorted, 0.9); }
      out += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${f1(Y(wLo))}" y2="${f1(Y(d.q1))}" stroke="${color}" stroke-width="${lw}"/><line x1="${f1(x)}" x2="${f1(x)}" y1="${f1(Y(d.q3))}" y2="${f1(Y(wHi))}" stroke="${color}" stroke-width="${lw}"/>`;
      out += `<line x1="${f1(x - half * 0.5)}" x2="${f1(x + half * 0.5)}" y1="${f1(Y(wLo))}" y2="${f1(Y(wLo))}" stroke="${color}" stroke-width="${lw}"/><line x1="${f1(x - half * 0.5)}" x2="${f1(x + half * 0.5)}" y1="${f1(Y(wHi))}" y2="${f1(Y(wHi))}" stroke="${color}" stroke-width="${lw}"/>`;
      out += `<rect x="${f1(x - half)}" y="${f1(Y(d.q3))}" width="${f1(half * 2)}" height="${f1(Math.max(0.5, Y(d.q1) - Y(d.q3)))}" fill="${fill}" stroke="${color}" stroke-width="${lw}"/>`;
      out += `<line x1="${f1(x - half)}" x2="${f1(x + half)}" y1="${f1(Y(d.median))}" y2="${f1(Y(d.median))}" stroke="${color}" stroke-width="${f1(lw * 1.6)}"/>`;
      if (g.whiskers === 'tukey' && !g.points) {
        for (const v of sorted) if (v < wLo || v > wHi) out += marker('circleOpen', x, Y(v), r, color);
      }
    }
    if (type === 'violin') {
      const dens = kde(data[i]);
      const maxD = Math.max(...dens.map((d) => d[1])) || 1;
      const w = (d) => (d / maxD) * half * 1.3;
      let path = `M${f1(x)},${f1(Y(dens[0][0]))}`;
      for (const [y, d] of dens) path += `L${f1(x + w(d))},${f1(Y(y))}`;
      for (let k = dens.length - 1; k >= 0; k -= 1) path += `L${f1(x - w(dens[k][1]))},${f1(Y(dens[k][0]))}`;
      out += `<path d="${path}Z" fill="${fill}" stroke="${color}" stroke-width="${lw}"/>`;
      const at = (v) => { let best = dens[0]; for (const dd of dens) if (Math.abs(dd[0] - v) < Math.abs(best[0] - v)) best = dd; return w(best[1]); };
      const d = s.d;
      out += `<line x1="${f1(x - at(d.median))}" x2="${f1(x + at(d.median))}" y1="${f1(Y(d.median))}" y2="${f1(Y(d.median))}" stroke="${color}" stroke-width="${f1(lw * 1.6)}" stroke-dasharray="6 3"/>`;
      for (const q of [d.q1, d.q3]) out += `<line x1="${f1(x - at(q))}" x2="${f1(x + at(q))}" y1="${f1(Y(q))}" y2="${f1(Y(q))}" stroke="${color}" stroke-width="${lw}" stroke-dasharray="2 3"/>`;
    }
    // Points individuels
    if (g.points || type === 'scatter') {
      const ys = data[i].map(Y);
      const dx = beeswarm(ys, r * 2.1, type === 'bar' || type === 'box' || type === 'violin' ? half * 0.8 : half * 1.2);
      const pc = type === 'bar' && g.fill === 'solid' ? '#111' : color;
      ys.forEach((y, k) => { out += marker(MARKERS[0], x + dx[k], y, r, pc, type === 'scatter' ? pc : '#fff'); });
    }
    // Centre et barres d'erreur
    if (type === 'scatter' || type === 'meanerr' || type === 'bar') {
      const ec = type === 'bar' && g.fill === 'solid' ? '#111' : type === 'scatter' ? '#111' : color;
      if (g.error !== 'none') out += errorBar(x, Y(s.lo), Y(s.hi), half * 0.35, ec, lw);
      if (type === 'scatter') out += `<line x1="${f1(x - half * 0.75)}" x2="${f1(x + half * 0.75)}" y1="${f1(Y(s.c))}" y2="${f1(Y(s.c))}" stroke="#111" stroke-width="${f1(lw * 1.5)}"/>`;
      if (type === 'meanerr') out += marker('square', x, Y(s.c), r * 1.2, color);
    }
  });
  out += categoryAxis(ctx, fr, cols.map((c) => c.name), xs);
  out += bracketsSvg(ctx, fr, placed[0], xs);
  return out;
}

// --- XY ---------------------------------------------------------------------------------------------------------

function xyPlot(ctx) {
  const { ds, res, g, lw, small, colorOf } = ctx;
  const reps = ds.replicates || 1;
  const series = ds.columns.map((c, i) => {
    const pts = [];
    for (const r of ds.rows) {
      const x = num(r.x);
      if (!Number.isFinite(x) || (g.xLog && x <= 0)) continue;
      const ys = (r.v?.[c.id] ?? []).slice(0, reps).map(num).filter(Number.isFinite);
      if (ys.length) pts.push({ x, ys });
    }
    return { c, i, pts };
  }).filter((s) => s.pts.length);
  if (!series.length) return empty(ctx, 'Saisissez des X et des Y pour voir le graphique.');
  const xsAll = series.flatMap((s) => s.pts.map((p) => p.x));
  const tx = (x) => (g.xLog ? Math.log10(x) : x);
  let xLo = Math.min(...xsAll.map(tx));
  let xHi = Math.max(...xsAll.map(tx));
  const xNice = g.xLog ? { lo: Math.floor(xLo), hi: Math.ceil(xHi) } : niceTicks(xLo, xHi, 5);
  if (g.xLog && xNice.hi === xNice.lo) xNice.hi += 1;
  xLo = xNice.lo;
  xHi = xNice.hi;
  // Moyennes ± erreur, ou tous les réplicats
  const summary = series.map((s) => s.pts.map((p) => {
    if (g.error === 'none' || p.ys.length < 2) return { x: p.x, points: p.ys };
    const sp = spread(p.ys, { center: g.center, error: g.error });
    return { x: p.x, c: sp.c, lo: sp.lo, hi: sp.hi };
  }));
  const fits = (res?.fits ?? []).filter(() => g.showFit !== false);
  const curve = (fit) => {
    const out = [];
    for (let k = 0; k <= 200; k += 1) {
      const t = xLo + ((xHi - xLo) * k) / 200;
      const x = g.xLog ? 10 ** t : t;
      const xin = fit.logX ? Math.log10(x) : x;
      const y = fit.predict(xin);
      if (Number.isFinite(y)) out.push([t, y, fit.band ? fit.band(xin) : 0]);
    }
    return out;
  };
  const curves = fits.map((f) => ({ f, pts: curve(f) }));
  const ysAll = [
    ...summary.flat().flatMap((p) => (p.points ? p.points : [p.lo, p.hi])),
    ...curves.flatMap((c) => c.pts.map((p) => p[1])),
  ].filter((v) => Number.isFinite(v) && (!g.yLog || v > 0));
  const fr = frame(ctx, {
    yLo: Math.min(...ysAll), yHi: Math.max(...ysAll), yLog: g.yLog,
    legend: g.legend === 'none' || series.length < 2 ? [] : series.map((s) => ({ name: s.c.name, color: colorOf(s.c.id, s.i), marker: MARKERS[s.i % MARKERS.length], line: g.connect || fits.length > 0 })),
    xTitleDefault: ds.xTitle || '',
  });
  const { pad, pw, ph, Y } = fr;
  const X = (x) => pad.l + ((tx(x) - xLo) / (xHi - xLo)) * pw;
  const Xt = (t) => pad.l + ((t - xLo) / (xHi - xLo)) * pw;
  let out = fr.out;
  // Axe X numérique
  out += `<line x1="${f1(pad.l)}" x2="${f1(pad.l + pw)}" y1="${f1(pad.t + ph)}" y2="${f1(pad.t + ph)}" stroke="#111" stroke-width="${lw}"/>`;
  const xticks = g.xLog ? Array.from({ length: xHi - xLo + 1 }, (_, k) => xLo + k) : niceTicks(xLo, xHi, Math.max(3, Math.round(pw / 90))).ticks;
  for (const t of xticks) {
    const x = Xt(t);
    out += `<line x1="${f1(x)}" x2="${f1(x)}" y1="${f1(pad.t + ph)}" y2="${f1(pad.t + ph + 5)}" stroke="#111" stroke-width="${lw}"/>`;
    const label = g.xLog ? (Math.abs(t) <= 3 ? tickLabel(10 ** t) : `10^${t}`) : tickLabel(t);
    out += g.xLog && Math.abs(t) > 3
      ? `<text x="${f1(x)}" y="${f1(pad.t + ph + 8 + small)}" font-size="${small}" text-anchor="middle" fill="#111">10<tspan dy="${f1(-small * 0.4)}" font-size="${f1(small * 0.75)}">${t}</tspan></text>`
      : `<text x="${f1(x)}" y="${f1(pad.t + ph + 8 + small)}" font-size="${small}" text-anchor="middle" fill="#111">${esc(label)}</text>`;
    if (g.xLog && t < xHi) for (let m = 2; m < 10; m += 1) { const xm = Xt(t + Math.log10(m)); out += `<line x1="${f1(xm)}" x2="${f1(xm)}" y1="${f1(pad.t + ph)}" y2="${f1(pad.t + ph + 3)}" stroke="#111" stroke-width="${f1(lw * 0.7)}"/>`; }
  }
  const r = Math.max(1.5, Number(g.pointSize) / 2 || 3);
  // Courbes ajustées (et bande de confiance)
  for (const { f, pts } of curves) {
    const s = series.find((x) => x.c.id === f.colId);
    if (!s || !pts.length) continue;
    const color = colorOf(s.c.id, s.i);
    if (g.showBand && f.band) {
      let d = '';
      pts.forEach(([t, y, b], k) => { d += `${k ? 'L' : 'M'}${f1(Xt(t))},${f1(Y(y + b))}`; });
      for (let k = pts.length - 1; k >= 0; k -= 1) d += `L${f1(Xt(pts[k][0]))},${f1(Y(pts[k][1] - pts[k][2]))}`;
      out += `<path d="${d}Z" fill="${color}" fill-opacity="0.12" stroke="none"/>`;
    }
    let d = '';
    pts.forEach(([t, y], k) => { d += `${k ? 'L' : 'M'}${f1(Xt(t))},${f1(Y(y))}`; });
    out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${lw}"/>`;
  }
  summary.forEach((pts, si) => {
    const s = series[si];
    const color = colorOf(s.c.id, s.i);
    const shape = MARKERS[s.i % MARKERS.length];
    if (g.connect) {
      const means = pts.map((p) => [X(p.x), Y(p.points ? mean(p.points) : p.c)]).sort((a, b) => a[0] - b[0]);
      out += `<path d="${means.map(([x, y], k) => `${k ? 'L' : 'M'}${f1(x)},${f1(y)}`).join('')}" fill="none" stroke="${color}" stroke-width="${lw}"/>`;
    }
    for (const p of pts) {
      if (p.points) for (const y of p.points) out += marker(shape, X(p.x), Y(y), r, color);
      else {
        out += errorBar(X(p.x), Y(p.lo), Y(p.hi), r * 1.2, color, lw);
        out += marker(shape, X(p.x), Y(p.c), r, color);
      }
    }
  });
  return out;
}

// --- Groupé ------------------------------------------------------------------------------------------------------

function groupedPlot(ctx) {
  const { ds, res, g, lw, colorOf } = ctx;
  const { rows, cells } = groupedCells(ds);
  if (!rows.length) return empty(ctx, 'Saisissez des valeurs pour voir le graphique.');
  const cols = ds.columns;
  const stats = cells.map((row) => row.map((v) => (v.length ? spread(v, { center: g.center, error: g.error }) : null)));
  const vals = cells.flat(2);
  const lo = Math.min(...vals, ...stats.flat().filter(Boolean).map((s) => s.lo));
  const hi = Math.max(...vals, ...stats.flat().filter(Boolean).map((s) => s.hi));
  const bars = g.type === 'groupedBar';
  // Étoiles : comparaisons dans chaque ligne (entre colonnes)
  const colIdx = Object.fromEntries(cols.map((c, i) => [c.id, i]));
  const rowIdx = Object.fromEntries(rows.map((r, i) => [r.id, i]));
  const sets = g.type === 'line' ? [] : rows.map((_, ri) => ({
    tops: cols.map((_, ci) => (stats[ri][ci] ? Math.max(stats[ri][ci].hi, ...cells[ri][ci]) : -Infinity)),
    pairs: (res?.comparisons ?? []).filter((c) => c.row !== undefined && rowIdx[c.row] === ri && wantBracket(g, c.p))
      .map((c) => ({ i: Math.min(colIdx[c.a], colIdx[c.b]), j: Math.max(colIdx[c.a], colIdx[c.b]), p: c.p })),
  }));
  const { fr, placed: byRow } = withBrackets(ctx, {
    yLo: lo, yHi: hi, yLog: g.yLog, zeroBase: !g.yLog, categories: rows.map((r, i) => r.label || `Ligne ${i + 1}`),
    legend: g.legend === 'none' ? [] : cols.map((c, i) => ({ name: c.name, color: colorOf(c.id, i), box: bars, fill: bars ? (g.fill === 'solid' ? colorOf(c.id, i) : g.fill === 'none' ? '#fff' : lighten(colorOf(c.id, i), 0.3)) : null, marker: bars ? null : MARKERS[i % MARKERS.length], line: g.type === 'line' })),
  }, sets);
  const { pad, pw, Y } = fr;
  const band = pw / rows.length;
  const centers = rows.map((_, i) => pad.l + band * (i + 0.5));
  const inner = g.type === 'line' ? 0 : (band * 0.8) / cols.length;
  const xOf = (ri, ci) => (g.type === 'line' ? centers[ri] : centers[ri] - band * 0.4 + inner * (ci + 0.5));
  const r = Math.max(1.5, Number(g.pointSize) / 2 || 3);
  let out = fr.out;
  cols.forEach((c, ci) => {
    const color = colorOf(c.id, ci);
    const fill = g.fill === 'solid' ? color : g.fill === 'none' ? '#fff' : lighten(color, 0.3);
    if (g.type === 'line') {
      const pts = rows.map((_, ri) => (stats[ri][ci] ? [xOf(ri, ci), Y(stats[ri][ci].c)] : null)).filter(Boolean);
      out += `<path d="${pts.map(([x, y], k) => `${k ? 'L' : 'M'}${f1(x)},${f1(y)}`).join('')}" fill="none" stroke="${color}" stroke-width="${lw}"/>`;
    }
    rows.forEach((_, ri) => {
      const s = stats[ri][ci];
      if (!s) return;
      const x = xOf(ri, ci);
      if (bars) {
        const base = Y(g.yLog ? 10 ** fr.lo : 0);
        out += `<rect x="${f1(x - inner * 0.42)}" y="${f1(Math.min(base, Y(s.c)))}" width="${f1(inner * 0.84)}" height="${f1(Math.abs(base - Y(s.c)))}" fill="${fill}" stroke="${color}" stroke-width="${lw}"/>`;
      }
      if (g.points && g.type !== 'line') {
        const ys = cells[ri][ci].map(Y);
        const dx = beeswarm(ys, r * 2.1, inner * 0.3);
        ys.forEach((y, k) => { out += marker(MARKERS[0], x + dx[k], y, r, bars && g.fill === 'solid' ? '#111' : color, bars ? '#fff' : color); });
      }
      if (g.error !== 'none') out += errorBar(x, Y(s.lo), Y(s.hi), Math.max(3, inner * 0.18), bars && g.fill === 'solid' ? '#111' : color, lw);
      if (g.type === 'groupedDots') out += `<line x1="${f1(x - inner * 0.35)}" x2="${f1(x + inner * 0.35)}" y1="${f1(Y(s.c))}" y2="${f1(Y(s.c))}" stroke="#111" stroke-width="${f1(lw * 1.5)}"/>`;
      if (g.type === 'line') out += marker(MARKERS[ci % MARKERS.length], x, Y(s.c), r, color);
    });
  });
  out += categoryAxis(ctx, fr, rows.map((row, i) => row.label || `Ligne ${i + 1}`), centers);
  byRow.forEach((placed, ri) => { out += bracketsSvg(ctx, fr, placed, cols.map((_, ci) => xOf(ri, ci))); });
  return out;
}

// --- Contingence -----------------------------------------------------------------------------------------------

function contingencyPlot(ctx) {
  const { ds, g, lw, colorOf } = ctx;
  const rows = ds.rows.filter((r) => ds.columns.some((c) => Number.isFinite(num(r.v?.[c.id]?.[0]))));
  if (!rows.length) return empty(ctx, 'Saisissez des effectifs pour voir le graphique.');
  const table = rows.map((r) => ds.columns.map((c) => Math.max(0, num(r.v?.[c.id]?.[0]) || 0)));
  const pct = g.percent !== false;
  const values = table.map((row) => { const t = row.reduce((a, b) => a + b, 0) || 1; return row.map((v) => (pct ? (v / t) * 100 : v)); });
  const stacked = g.type === 'stacked';
  const hi = stacked ? Math.max(...values.map((row) => row.reduce((a, b) => a + b, 0))) : Math.max(...values.flat());
  const fr = frame(ctx, {
    yLo: 0, yHi: hi, zeroBase: true, categories: rows.map((r, i) => r.label || `Ligne ${i + 1}`),
    legend: g.legend === 'none' ? [] : ds.columns.map((c, i) => ({ name: c.name, color: colorOf(c.id, i), box: true, fill: g.fill === 'solid' ? colorOf(c.id, i) : lighten(colorOf(c.id, i), 0.45) })),
  });
  const { pad, pw, Y } = fr;
  const band = pw / rows.length;
  const centers = rows.map((_, i) => pad.l + band * (i + 0.5));
  let out = fr.out;
  rows.forEach((_, ri) => {
    let acc = 0;
    ds.columns.forEach((c, ci) => {
      const color = colorOf(c.id, ci);
      const fill = g.fill === 'solid' ? color : lighten(color, 0.45);
      const v = values[ri][ci];
      if (stacked) {
        const w = band * 0.5;
        out += `<rect x="${f1(centers[ri] - w / 2)}" y="${f1(Y(acc + v))}" width="${f1(w)}" height="${f1(Math.max(0, Y(acc) - Y(acc + v)))}" fill="${fill}" stroke="${color}" stroke-width="${lw}"/>`;
        acc += v;
      } else {
        const w = (band * 0.8) / ds.columns.length;
        const x = centers[ri] - band * 0.4 + w * ci;
        out += `<rect x="${f1(x + w * 0.08)}" y="${f1(Y(v))}" width="${f1(w * 0.84)}" height="${f1(Math.max(0, Y(0) - Y(v)))}" fill="${fill}" stroke="${color}" stroke-width="${lw}"/>`;
      }
    });
  });
  out += categoryAxis(ctx, fr, rows.map((r, i) => r.label || `Ligne ${i + 1}`), centers);
  return out;
}

// --- Survie -------------------------------------------------------------------------------------------------------

function survivalPlot(ctx) {
  const { ds, res, g, lw, small, colorOf } = ctx;
  const groups = survivalGroups(ds);
  const km = res?.km ?? [];
  if (!groups.length || !km.length) return empty(ctx, 'Saisissez des temps et des événements (1) ou censures (0).');
  const pct = g.percent !== false;
  const tMax = Math.max(...groups.flatMap((gr) => gr.times));
  const xt = niceTicks(0, tMax, 5);
  const comp = (res?.comparisons ?? [])[0];
  const note = comp && g.stars !== 'none' ? `P = ${comp.p < 0.0001 ? '< 0,0001' : comp.p.toFixed(4).replace('.', ',')} (log-rank)` : '';
  const fr = frame(ctx, {
    yLo: 0, yHi: pct ? 100 : 1, zeroBase: true,
    legend: g.legend === 'none' ? [] : groups.map((gr, i) => ({ name: gr.col.name, color: colorOf(gr.col.id, ds.columns.indexOf(gr.col)), line: true })),
    note,
    xTitleDefault: ds.xTitle || 'Temps',
  });
  const { pad, pw, ph, Y } = fr;
  const X = (t) => pad.l + (t / xt.hi) * pw;
  let out = fr.out;
  out += `<line x1="${f1(pad.l)}" x2="${f1(pad.l + pw)}" y1="${f1(pad.t + ph)}" y2="${f1(pad.t + ph)}" stroke="#111" stroke-width="${lw}"/>`;
  for (const t of xt.ticks) {
    out += `<line x1="${f1(X(t))}" x2="${f1(X(t))}" y1="${f1(pad.t + ph)}" y2="${f1(pad.t + ph + 5)}" stroke="#111" stroke-width="${lw}"/>`;
    out += `<text x="${f1(X(t))}" y="${f1(pad.t + ph + 8 + small)}" font-size="${small}" text-anchor="middle" fill="#111">${esc(tickLabel(t))}</text>`;
  }
  const k = pct ? 100 : 1;
  km.forEach((curve) => {
    const gi = ds.columns.findIndex((c) => c.id === curve.colId);
    const color = colorOf(curve.colId, gi);
    let s = 1;
    let d = `M${f1(X(0))},${f1(Y(k))}`;
    const ticks = [];
    for (const st of curve.steps) {
      if (st.events) { d += `L${f1(X(st.t))},${f1(Y(s * k))}L${f1(X(st.t))},${f1(Y(st.s * k))}`; s = st.s; }
      if (st.censored) ticks.push([st.t, s]);
    }
    const last = curve.steps.at(-1)?.t ?? 0;
    d += `L${f1(X(last))},${f1(Y(s * k))}`;
    out += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${lw + 0.3}"/>`;
    if (g.censorTicks !== false) {
      for (const [t, sv] of ticks) out += `<line x1="${f1(X(t))}" x2="${f1(X(t))}" y1="${f1(Y(sv * k) - 5)}" y2="${f1(Y(sv * k) + 5)}" stroke="${color}" stroke-width="${lw}"/>`;
    }
  });
  return out;
}

function empty(ctx, text) {
  return `<text x="${f1(ctx.width / 2)}" y="${f1(ctx.height / 2)}" font-size="${ctx.small}" text-anchor="middle" fill="#8792A6">${esc(text)}</text>`;
}

export const kindHasStars = (kind) => kind === 'column' || kind === 'grouped';
export { KINDS };
