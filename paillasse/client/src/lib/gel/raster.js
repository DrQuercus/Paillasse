// Image de travail d'un gel : intensités brutes (jamais les réglages d'affichage), transformations,
// statistiques, sens des bandes et détection automatique des pistes.
//
// Une image = { data: Float32Array, width, height, maxValue } (maxValue : valeur de saturation du capteur).

import { findPeaks } from './profile.js';

/** Quartiles et extrêmes, sur un échantillon de pixels (rapide même sur 12 Mpx). */
export function imageStats(img) {
  const { data } = img;
  const step = Math.max(1, Math.floor(data.length / 200_000));
  const sample = [];
  for (let i = 0; i < data.length; i += step) sample.push(data[i]);
  sample.sort((a, b) => a - b);
  const q = (f) => sample[Math.min(sample.length - 1, Math.max(0, Math.round(f * (sample.length - 1))))];
  const low = img.maxValue * 0.002;
  const high = img.maxValue * 0.998;
  let clippedLow = 0;
  let clippedHigh = 0;
  for (const v of sample) {
    if (v <= low) clippedLow += 1;
    else if (v >= high) clippedHigh += 1;
  }
  return {
    min: sample[0], max: sample.at(-1), p01: q(0.01), p99: q(0.99), median: q(0.5),
    clippedLow: clippedLow / sample.length, clippedHigh: clippedHigh / sample.length,
  };
}

/**
 * Sens des bandes : « dark » = bandes sombres sur fond clair (Coomassie, argent, photo inversée),
 * « light » = bandes claires sur fond sombre (fluorescence, chimiluminescence, BET/SYBR sous UV).
 * Le fond occupe l'essentiel du gel : il est du côté de la médiane.
 */
export function detectPolarity(img) {
  const s = imageStats(img);
  return s.median - s.p01 > s.p99 - s.median ? 'dark' : 'light';
}

function rot90(img, quarter) {
  const q = ((quarter % 4) + 4) % 4;
  if (!q) return img;
  const { data, width: w, height: h } = img;
  const nw = q % 2 ? h : w;
  const nh = q % 2 ? w : h;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let nx;
      let ny;
      if (q === 1) { nx = h - 1 - y; ny = x; } // sens horaire
      else if (q === 2) { nx = w - 1 - x; ny = h - 1 - y; } else { nx = y; ny = w - 1 - x; }
      out[ny * nw + nx] = data[y * w + x];
    }
  }
  return { ...img, data: out, width: nw, height: nh };
}

function flip(img, horizontal) {
  const { data, width: w, height: h } = img;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      out[y * w + x] = horizontal ? data[y * w + (w - 1 - x)] : data[(h - 1 - y) * w + x];
    }
  }
  return { ...img, data: out };
}

/** Échantillonnage bilinéaire (bords : valeur de fond). */
export function sampleAt(img, x, y, fill = 0) {
  const { data, width: w, height: h } = img;
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return fill;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = data[y0 * w + x0] * (1 - fx) + data[y0 * w + x1] * fx;
  const b = data[y1 * w + x0] * (1 - fx) + data[y1 * w + x1] * fx;
  return a * (1 - fy) + b * fy;
}

/** Rotation fine autour du centre, mêmes dimensions ; les coins découverts prennent la valeur du fond. */
function rotate(img, degrees) {
  if (!degrees) return img;
  const { width: w, height: h } = img;
  const fill = imageStats(img).median;
  const a = (-degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      out[y * w + x] = sampleAt(img, cx + dx * cos - dy * sin, cy + dx * sin + dy * cos, fill);
    }
  }
  return { ...img, data: out };
}

function crop(img, rect) {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const w = Math.min(img.width - x0, Math.round(rect.w));
  const h = Math.min(img.height - y0, Math.round(rect.h));
  if (w < 8 || h < 8) return img;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) out.set(img.data.subarray((y0 + y) * img.width + x0, (y0 + y) * img.width + x0 + w), y * w);
  return { ...img, data: out, width: w, height: h };
}

/**
 * Image de travail : quart de tour, miroirs, redressement fin puis rognage, dans cet ordre.
 * L'original n'est jamais modifié.
 */
export function prepareImage(source, prep = {}) {
  let img = rot90(source, Math.round((prep.rotate90 ?? 0) / 90));
  if (prep.flipH) img = flip(img, true);
  if (prep.flipV) img = flip(img, false);
  if (prep.angle) img = rotate(img, prep.angle);
  if (prep.crop) img = crop(img, prep.crop);
  return img;
}

/** Dimensions après les transformations géométriques qui précèdent le rognage. */
export function preparedSize(source, prep = {}) {
  const quarter = Math.round((prep.rotate90 ?? 0) / 90) % 2 !== 0;
  return quarter ? { width: source.height, height: source.width } : { width: source.width, height: source.height };
}

/** Intensité convertie en signal proportionnel à la quantité (bandes = valeurs hautes). */
export function signalFn(img, polarity, mode = 'linear') {
  const max = img.maxValue || 1;
  if (polarity === 'dark') {
    if (mode === 'od') return (v) => Math.log10(max / Math.max(v, max * 1e-4));
    return (v) => max - v;
  }
  return (v) => v;
}

function smoothArray(a, win) {
  const h = Math.floor(win / 2);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) {
    let s = 0;
    let n = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(a.length - 1, i + h); j += 1) { s += a[j]; n += 1; }
    out[i] = s / n;
  }
  return out;
}

/**
 * Pistes détectées automatiquement. Chaque colonne est notée par le contraste de ses bandes
 * (écart-type du signal le long de la migration) plutôt que par la quantité de matériel :
 * une piste à une seule bande (élution, gamme) ou à bandes faibles (lavage) compte autant
 * qu'un lysat. Le peigne espaçant régulièrement les puits, on cherche ensuite une grille
 * régulière (période par autocorrélation), recalée piste par piste.
 */
export function detectLanes(img, { top = 0, bottom = img.height - 1, polarity = detectPolarity(img) } = {}) {
  const { width: w, data } = img;
  const sig = signalFn(img, polarity);
  const rows = Math.max(1, bottom - top + 1);
  const step = Math.max(1, Math.floor(rows / 500));
  const n = Math.floor((bottom - top) / step) + 1;
  // Contraste vertical de chaque colonne, après retrait de la tendance (fond qui varie le long du gel)
  const col = new Float32Array(w);
  const trend = new Float32Array(n);
  for (let k = 0; k < n; k += 1) {
    const y = top + k * step;
    const line = [];
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 200))) line.push(sig(data[y * w + x]));
    line.sort((a, b) => a - b);
    trend[k] = line[Math.floor(line.length * 0.2)];
  }
  for (let x = 0; x < w; x += 1) {
    let s1 = 0;
    let s2 = 0;
    for (let k = 0; k < n; k += 1) {
      const v = sig(data[(top + k * step) * w + x]) - trend[k];
      s1 += v;
      s2 += v * v;
    }
    const mean = s1 / n;
    col[x] = Math.sqrt(Math.max(0, s2 / n - mean * mean));
  }
  const smooth = smoothArray(col, Math.max(3, Math.round(w / 80) | 1));
  const win = Math.max(5, Math.round(w / 10));
  const s = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    let m = Infinity;
    for (let j = Math.max(0, x - win); j <= Math.min(w - 1, x + win); j += 1) if (smooth[j] < m) m = smooth[j];
    s[x] = smooth[x] - m;
  }
  let max = 0;
  for (const v of s) if (v > max) max = v;
  if (max <= 0) return { lanes: [], width: Math.round(w / 12) };

  // Période des puits : premier maximum net de l'autocorrélation
  const mean = s.reduce((a, b) => a + b, 0) / w;
  const ac = (d) => { let t = 0; for (let x = 0; x + d < w; x += 1) t += (s[x] - mean) * (s[x + d] - mean); return t / (w - d); };
  const ac0 = ac(0) || 1;
  let period = 0;
  const minP = Math.max(6, Math.round(w / 40));
  const maxP = Math.round(w / 2.5);
  let prev = ac(minP - 1);
  for (let d = minP; d <= maxP; d += 1) {
    const cur = ac(d);
    const next = ac(d + 1);
    if (cur > prev && cur >= next && cur / ac0 > 0.15) { period = d; break; }
    prev = cur;
  }

  const minDist = Math.max(4, Math.round(w / 60));
  let centers;
  if (period) {
    // Grille régulière la mieux placée, puis recalage de chaque piste sur son maximum local
    let best = { score: -Infinity, offset: 0 };
    for (let o = 0; o < period; o += 1) {
      let score = 0;
      for (let x = o; x < w; x += period) score += s[x];
      if (score > best.score) best = { score, offset: o };
    }
    // Les puits du peigne se suivent : entre deux pistes visibles, une position de la grille est
    // une piste même presque vide (témoin négatif, lavage) ; aux extrémités, il faut du signal.
    const grid = [];
    for (let x = best.offset; x < w; x += period) {
      const lo = Math.max(0, Math.round(x - period / 3));
      const hi = Math.min(w - 1, Math.round(x + period / 3));
      let peak = lo;
      for (let j = lo; j <= hi; j += 1) if (s[j] > s[peak]) peak = j;
      grid.push({ x, peak, strong: s[peak] > max * 0.08 });
    }
    const first = grid.findIndex((g) => g.strong);
    const last = grid.findLastIndex((g) => g.strong);
    const kept = first < 0 ? [] : grid.slice(first, last + 1);
    const strong = kept.filter((g) => g.strong);
    const drift = strong.reduce((t, g) => t + g.peak - g.x, 0) / (strong.length || 1);
    centers = kept.map((g, i) => {
      if (g.strong) return g.peak;
      const [a, b] = [kept[i - 1], kept[i + 1]];
      return a?.strong && b?.strong ? Math.round((a.peak + b.peak) / 2) : Math.round(g.x + drift);
    });
  } else {
    centers = findPeaks(s, { minProminence: max * 0.2, minDistance: minDist }).map((p) => p.apex);
  }
  // Centre = milieu de la zone au-dessus de la mi-hauteur (le sommet d'un plateau bruité est n'importe où)
  const spans = centers.map((c) => {
    if (s[c] <= max * 0.08) return { center: c, width: null }; // piste presque vide : position de la grille
    let l = c;
    let r = c;
    while (l > 0 && s[l - 1] > s[c] / 2) l -= 1;
    while (r < w - 1 && s[r + 1] > s[c] / 2) r += 1;
    return { center: Math.round((l + r) / 2), width: r - l + 1 };
  });
  const uniq = [];
  for (const sp of spans.sort((a, b) => a.center - b.center)) if (!uniq.length || sp.center - uniq.at(-1).center >= minDist) uniq.push(sp);
  const lanes = uniq.map((x) => x.center);
  const halfWidths = uniq.map((x) => x.width).filter(Boolean).sort((a, b) => a - b);
  const spacing = lanes.slice(1).map((c, i) => c - lanes[i]).sort((a, b) => a - b);
  const medianSpacing = spacing.length ? spacing[Math.floor(spacing.length / 2)] : w / 6;
  const measured = halfWidths.length ? halfWidths[Math.floor(halfWidths.length / 2)] : medianSpacing / 2;
  const width = Math.max(3, Math.round(Math.min(measured * 0.8, medianSpacing * 0.7)));
  return { lanes, width };
}
