// Profils de migration, fond, bandes et aires.
//
// Tout est calculé sur les intensités brutes de l'image de travail (jamais sur l'affichage) :
// contraste et luminosité n'ont aucun effet sur les aires. Positions le long d'une piste :
// indice dans la zone de migration (0 = haut de la zone), en coordonnées corrigées de la courbure.

import { sampleAt, signalFn } from './raster.js';

/** Abscisse d'une piste (éventuellement inclinée) à la ligne y. */
export function laneX(lane, y, region) {
  const span = region.bottom - region.top || 1;
  const f = Math.max(0, Math.min(1, (y - region.top) / span));
  return lane.xTop + (lane.xBot - lane.xTop) * f;
}

// --- Courbure (« smile ») : courbes d'iso-migration tracées à travers le gel ----------------------

function fitCurve(points) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (pts.length < 2) return null;
  if (pts.length >= 3) {
    const q = quadraticFit(pts.map((p) => p.x), pts.map((p) => p.y));
    if (q) return (x) => q.a * x * x + q.b * x + q.c;
  }
  const [p0, p1] = [pts[0], pts.at(-1)];
  const slope = p1.x !== p0.x ? (p1.y - p0.y) / (p1.x - p0.x) : 0;
  return (x) => p0.y + slope * (x - p0.x);
}

export function quadraticFit(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  let s1 = 0; let s2 = 0; let s3 = 0; let s4 = 0; let t0 = 0; let t1 = 0; let t2 = 0;
  for (let i = 0; i < n; i += 1) {
    const x = xs[i]; const y = ys[i]; const x2 = x * x;
    s1 += x; s2 += x2; s3 += x2 * x; s4 += x2 * x2; t0 += y; t1 += x * y; t2 += x2 * y;
  }
  const m = [[n, s1, s2, t0], [s1, s2, s3, t1], [s2, s3, s4, t2]];
  for (let c = 0; c < 3; c += 1) {
    let p = c;
    for (let r = c + 1; r < 3; r += 1) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    [m[c], m[p]] = [m[p], m[c]];
    if (Math.abs(m[c][c]) < 1e-12) return null;
    for (let r = 0; r < 3; r += 1) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      for (let k = c; k < 4; k += 1) m[r][k] -= f * m[c][k];
    }
  }
  return { c: m[0][3] / m[0][0], b: m[1][3] / m[1][1], a: m[2][3] / m[2][2] };
}

/**
 * Correction de courbure : à partir d'au moins deux courbes d'iso-migration, renvoie
 * rawY(x, y) — la ligne de l'image à lire, à l'abscisse x, pour la position « idéale » y
 * (celle qu'aurait la bande au centre du gel). Sans courbes : identité.
 */
export function makeWarp(curves, width) {
  const fitted = (curves ?? []).map((c) => fitCurve(c.points ?? [])).filter(Boolean);
  if (fitted.length < 2) return null;
  const xRef = (width - 1) / 2;
  return (x, y) => {
    const e = fitted.map((f) => ({ ideal: f(xRef), raw: f(x) })).sort((a, b) => a.ideal - b.ideal);
    let i = 0;
    while (i < e.length - 2 && y > e[i + 1].ideal) i += 1;
    const a = e[i];
    const b = e[i + 1];
    const d = b.ideal - a.ideal;
    if (Math.abs(d) < 1e-9) return y - a.ideal + a.raw;
    return a.raw + ((y - a.ideal) / d) * (b.raw - a.raw);
  };
}

/** Position idéale correspondant à une ligne de l'image (inverse de la correction, par dichotomie). */
export function unwarp(warp, x, rawY, height) {
  if (!warp) return rawY;
  let lo = -height;
  let hi = 2 * height;
  const increasing = warp(x, hi) > warp(x, lo);
  for (let k = 0; k < 60; k += 1) {
    const mid = (lo + hi) / 2;
    if ((warp(x, mid) < rawY) === increasing) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// --- Profil d'une piste --------------------------------------------------------------------------

/**
 * Profil de migration : moyenne du signal sur la largeur de la piste, ligne par ligne.
 * Renvoie { profile, rows } (rows[i] = ligne de l'image lue pour la position i, pour le tracé).
 */
export function laneProfile(img, lane, { region, width, polarity, signal = 'linear', warp = null }) {
  const sig = signalFn(img, polarity, signal);
  const n = region.bottom - region.top + 1;
  const profile = new Float32Array(n);
  const hw = Math.max(0, (width - 1) / 2);
  for (let i = 0; i < n; i += 1) {
    const y = region.top + i;
    const x = laneX(lane, y, region);
    const ry = warp ? warp(x, y) : y;
    let s = 0;
    let c = 0;
    for (let dx = -hw; dx <= hw + 1e-9; dx += 1) {
      const px = x + dx;
      if (px < 0 || px > img.width - 1 || ry < 0 || ry > img.height - 1) continue;
      s += sig(sampleAt(img, px, ry));
      c += 1;
    }
    profile[i] = c ? s / c : 0;
  }
  return profile;
}

/** Lissage triangulaire (conserve l'aire). */
export function smooth(p, win) {
  const h = Math.max(1, Math.floor(win / 2));
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 1) {
    let s = 0;
    let w = 0;
    for (let j = Math.max(0, i - h); j <= Math.min(p.length - 1, i + h); j += 1) {
      const k = 1 - Math.abs(j - i) / (h + 1);
      s += p[j] * k;
      w += k;
    }
    out[i] = s / w;
  }
  return out;
}

/** Réglages qui dépendent de la longueur de la piste (et non d'un nombre de pixels fixe). */
export function defaultScales(length) {
  return {
    smoothing: Math.max(3, Math.round(length / 120) | 1),
    minDistance: Math.max(3, Math.round(length * 0.012)),
    radius: Math.max(8, Math.round(length * 0.06)),
  };
}

// --- Fond ---------------------------------------------------------------------------------------

/** « Rolling ball » : ouverture morphologique (minimum puis maximum glissants), puis léger lissage. */
export function rollingBall(p, radius) {
  const n = p.length;
  const r = Math.max(1, Math.round(radius));
  const ero = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let m = Infinity;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j += 1) if (p[j] < m) m = p[j];
    ero[i] = m;
  }
  const dil = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    let m = -Infinity;
    for (let j = Math.max(0, i - r); j <= Math.min(n - 1, i + r); j += 1) if (ero[j] > m) m = ero[j];
    dil[i] = m;
  }
  const s = smooth(dil, Math.max(3, Math.round(r / 2)));
  for (let i = 0; i < n; i += 1) s[i] = Math.min(s[i], p[i]);
  return s;
}

/** Vallée à vallée : droites entre les bornes des bandes (et non entre tous les creux du bruit). */
export function valleyBaseline(p, bands) {
  const n = p.length;
  const anchors = [{ i: 0, v: p[0] }];
  for (const b of [...bands].sort((a, c) => a.left - c.left)) {
    anchors.push({ i: b.left, v: p[b.left] }, { i: b.right, v: p[b.right] });
  }
  anchors.push({ i: n - 1, v: p[n - 1] });
  anchors.sort((a, b) => a.i - b.i);
  const base = new Float32Array(n);
  let k = 0;
  for (let i = 0; i < n; i += 1) {
    while (k < anchors.length - 2 && anchors[k + 1].i < i) k += 1;
    const a = anchors[k];
    const b = anchors[k + 1];
    const f = b.i > a.i ? (i - a.i) / (b.i - a.i) : 0;
    base[i] = Math.min(p[i], a.v + (b.v - a.v) * f);
  }
  return base;
}

export function flatBaseline(p) {
  const sorted = Array.from(p).sort((a, b) => a - b);
  const v = sorted[Math.floor(sorted.length * 0.02)] ?? 0;
  return new Float32Array(p.length).fill(v);
}

// --- Bandes -------------------------------------------------------------------------------------

/**
 * Maxima locaux assez « proéminents » : hauteur au-dessus du plus haut des deux cols qui
 * les séparent d'un sommet plus haut (ou du bord). Plus robuste que la fenêtre fixe d'origine.
 */
export function findPeaks(s, { minProminence, minDistance }) {
  const n = s.length;
  const cands = [];
  for (let i = 1; i < n - 1; i += 1) {
    if (s[i] > s[i - 1] && s[i] >= s[i + 1]) {
      let j = i;
      while (j < n - 1 && s[j + 1] === s[i]) j += 1; // plateau : on prend le milieu
      cands.push(Math.round((i + j) / 2));
      i = j;
    }
  }
  const peaks = [];
  for (const i of cands) {
    let lmin = s[i];
    let l = i - 1;
    for (; l >= 0 && s[l] <= s[i]; l -= 1) lmin = Math.min(lmin, s[l]);
    if (l < 0) lmin = Math.min(lmin, s[0]);
    let rmin = s[i];
    let r = i + 1;
    for (; r < n && s[r] <= s[i]; r += 1) rmin = Math.min(rmin, s[r]);
    const prominence = s[i] - Math.max(lmin, rmin);
    if (prominence >= minProminence) peaks.push({ apex: i, prominence });
  }
  peaks.sort((a, b) => s[b.apex] - s[a.apex]);
  const kept = [];
  for (const p of peaks) if (kept.every((k) => Math.abs(k.apex - p.apex) >= minDistance)) kept.push(p);
  return kept.sort((a, b) => a.apex - b.apex);
}

/** Sommet le plus proche d'une position (pour une bande ajoutée à la main). */
function localApex(s, pos, radius) {
  let best = Math.round(pos);
  for (let i = Math.max(0, best - radius); i <= Math.min(s.length - 1, best + radius); i += 1) if (s[i] > s[best]) best = i;
  return best;
}

/** Bornes : creux entre bandes voisines, descente jusqu'au pied pour les bandes aux extrémités. */
export function bandBounds(s, apexes) {
  const n = s.length;
  const sorted = [...new Set(apexes)].sort((a, b) => a - b);
  const reach = Math.max(20, Math.round(n * 0.08));
  return sorted.map((apex, k) => {
    const side = (dir, neighbour) => {
      if (neighbour !== undefined) {
        let best = apex;
        for (let i = apex; i !== neighbour; i += dir) if (s[i] < s[best]) best = i;
        return best;
      }
      // Bande en bout de piste : descente jusqu'au pied, sans dépasser quatre demi-largeurs
      let floor = s[apex];
      for (let i = apex; i >= 0 && i < n && Math.abs(i - apex) <= reach; i += dir) floor = Math.min(floor, s[i]);
      const half = (s[apex] + floor) / 2;
      let h = apex;
      while (h + dir >= 0 && h + dir < n && s[h + dir] > half) h += dir;
      const limit = Math.max(4, 4 * (Math.abs(h - apex) + 1));
      let i = apex;
      while (i + dir >= 0 && i + dir < n && s[i + dir] <= s[i] && Math.abs(i + dir - apex) <= limit) i += dir;
      return i;
    };
    return { apex, left: side(-1, sorted[k - 1]), right: side(1, sorted[k + 1]) };
  });
}

/** Aire au-dessus du fond entre les bornes (profil brut, non lissé : l'aire est exacte). */
export function bandArea(p, base, band) {
  let a = 0;
  for (let i = band.left; i < band.right; i += 1) {
    a += (Math.max(0, p[i] - base[i]) + Math.max(0, p[i + 1] - base[i + 1])) / 2;
  }
  return a;
}

/**
 * Analyse complète d'un profil : bandes détectées, corrections manuelles, fond, aires.
 * edits = { added: [positions], removed: [positions] }.
 */
export function analyseProfile(p, { sensitivity = 0.6, minDistance, smoothing, background = 'rollingball', radius, edits } = {}) {
  const n = p.length;
  const scales = defaultScales(n);
  const s = smooth(p, smoothing ?? scales.smoothing);
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of s) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const range = hi - lo || 1;
  const threshold = 0.3 * (1 - sensitivity) ** 2 + 0.003;
  const dist = minDistance ?? scales.minDistance;
  // Un sommet collé au bord de la zone est une bande coupée (ou un artefact de bord) : non mesurable
  const edge = Math.max(3, Math.round(n * 0.012));
  let apexes = findPeaks(s, { minProminence: range * threshold, minDistance: dist }).map((pk) => pk.apex).filter((a) => a >= edge && a < n - edge);
  const tol = Math.max(2, Math.round(dist / 2));
  for (const r of edits?.removed ?? []) apexes = apexes.filter((a) => Math.abs(a - r) > tol);
  for (const a of edits?.added ?? []) {
    const apex = localApex(s, a, tol);
    if (apex >= 0 && apex < n && apexes.every((x) => Math.abs(x - apex) > 1)) apexes.push(apex);
  }
  const bands = bandBounds(s, apexes);
  let base;
  if (background === 'valley') base = valleyBaseline(s, bands);
  else if (background === 'min') base = flatBaseline(s);
  else base = rollingBall(s, radius ?? scales.radius);
  const withArea = bands.map((b) => ({ ...b, height: s[b.apex] - base[b.apex], area: bandArea(p, base, b) }));
  const total = withArea.reduce((t, b) => t + b.area, 0);
  return {
    smoothed: s,
    baseline: base,
    bands: withArea.map((b) => ({ ...b, percent: total > 0 ? (b.area / total) * 100 : 0 })),
    total,
  };
}

/**
 * Part de pixels saturés dans le rectangle d'une bande (écrêtés au noir pour des bandes sombres,
 * au blanc pour des bandes claires). Au-delà de 1 %, la bande est sous-estimée.
 */
export function saturationOf(img, lane, band, { region, width, polarity, warp }) {
  const limit = polarity === 'dark' ? img.maxValue * 0.002 : img.maxValue * 0.998;
  const hw = Math.max(0, (width - 1) / 2);
  let hit = 0;
  let count = 0;
  for (let i = band.left; i <= band.right; i += 1) {
    const y = region.top + i;
    const x = laneX(lane, y, region);
    const ry = Math.round(warp ? warp(x, y) : y);
    if (ry < 0 || ry >= img.height) continue;
    for (let px = Math.round(x - hw); px <= Math.round(x + hw); px += 1) {
      if (px < 0 || px >= img.width) continue;
      const v = img.data[ry * img.width + px];
      count += 1;
      if (polarity === 'dark' ? v <= limit : v >= limit) hit += 1;
    }
  }
  return count ? hit / count : 0;
}
