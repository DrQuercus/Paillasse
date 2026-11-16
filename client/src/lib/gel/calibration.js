// Étalonnage des tailles : log10(taille) en fonction de la position de migration.
//
// Trois méthodes : interpolation entre marqueurs voisins (recommandée pour l'ADN, dont la migration
// n'est pas log-linéaire sur toute la gamme), régression linéaire, polynôme de degré 2.
// Les positions sont celles des profils (corrigées de l'inclinaison et de la courbure), si bien
// que marqueur et échantillons sont mesurés dans le même repère.

import { quadraticFit } from './profile.js';

export const FIT_METHODS = {
  interp: 'Interpolation entre marqueurs',
  linear: 'Régression linéaire',
  quadratic: 'Polynôme de degré 2',
};

function linearFit(xs, ys) {
  const n = xs.length;
  let sx = 0; let sy = 0; let sxx = 0; let sxy = 0;
  for (let i = 0; i < n; i += 1) { sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i]; }
  const d = n * sxx - sx * sx;
  const slope = d ? (n * sxy - sx * sy) / d : 0;
  return { slope, intercept: (sy - slope * sx) / n };
}

const r2Of = (ys, pred) => {
  const m = ys.reduce((a, b) => a + b, 0) / ys.length;
  let tot = 0;
  let res = 0;
  ys.forEach((y, i) => { tot += (y - m) ** 2; res += (y - pred[i]) ** 2; });
  return tot ? 1 - res / tot : 1;
};

/**
 * points = [{ pos, size }] (au moins deux). Renvoie { sizeAt(pos), posAt(size), r2, residuals, method }.
 * r2 et residuals portent sur log10(taille) ; pour l'interpolation, r2 est celui de la droite (indicatif).
 */
export function fitCalibration(points, method = 'linear') {
  const pts = points.filter((p) => Number.isFinite(p.pos) && p.size > 0).sort((a, b) => a.pos - b.pos);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => p.pos);
  const ys = pts.map((p) => Math.log10(p.size));
  let logAt;
  let used = method;
  if (method === 'quadratic' && pts.length >= 3) {
    const q = quadraticFit(xs, ys);
    logAt = q ? (x) => q.a * x * x + q.b * x + q.c : null;
  }
  if (method === 'interp') {
    logAt = (x) => {
      let i = 0;
      while (i < xs.length - 2 && x > xs[i + 1]) i += 1;
      const d = xs[i + 1] - xs[i];
      return d ? ys[i] + ((x - xs[i]) / d) * (ys[i + 1] - ys[i]) : ys[i];
    };
  }
  if (!logAt) {
    const l = linearFit(xs, ys);
    logAt = (x) => l.slope * x + l.intercept;
    used = 'linear';
  }
  const l = linearFit(xs, ys);
  const pred = used === 'interp' ? xs.map((x) => l.slope * x + l.intercept) : xs.map(logAt);
  const r2 = r2Of(ys, pred);
  const sizeAt = (pos) => 10 ** logAt(pos);
  const span = xs.at(-1) - xs[0] || 1;
  const posAt = (size) => {
    const target = Math.log10(size);
    let lo = xs[0] - span;
    let hi = xs.at(-1) + span;
    const decreasing = logAt(hi) < logAt(lo);
    for (let k = 0; k < 60; k += 1) {
      const mid = (lo + hi) / 2;
      if ((logAt(mid) > target) === decreasing) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return {
    method: used,
    sizeAt,
    posAt,
    r2,
    range: [xs[0], xs.at(-1)],
    points: pts.map((p, i) => ({ ...p, fitted: sizeAt(p.pos), error: (sizeAt(p.pos) / p.size - 1) * 100, logResidual: ys[i] - pred[i] })),
  };
}

/**
 * Attribution automatique des bandes du marqueur : décalage entre bandes détectées (haut → bas)
 * et tailles attendues (grande → petite) qui aligne le plus de bandes avec la meilleure courbe.
 * Résiste à une bande manquante en bout de gel ou à un front de migration détecté en trop.
 */
export function autoAssign(positions, sizes) {
  const pos = [...positions].sort((a, b) => a - b);
  const sz = [...sizes].sort((a, b) => b - a);
  if (!pos.length || !sz.length) return [];
  let best = null;
  for (let offset = -(pos.length - 1); offset <= sz.length - 1; offset += 1) {
    const pairs = [];
    for (let i = 0; i < pos.length; i += 1) {
      const j = i + offset;
      if (j >= 0 && j < sz.length) pairs.push({ pos: pos[i], size: sz[j] });
    }
    if (pairs.length < Math.min(3, pos.length, sz.length)) continue;
    let rmse = 0;
    if (pairs.length >= 3) {
      const xs = pairs.map((p) => p.pos);
      const ys = pairs.map((p) => Math.log10(p.size));
      const q = quadraticFit(xs, ys);
      if (q) rmse = Math.sqrt(xs.reduce((t, x, i) => t + (q.a * x * x + q.b * x + q.c - ys[i]) ** 2, 0) / xs.length);
    }
    const score = pairs.length - 40 * rmse;
    if (!best || score > best.score) best = { score, pairs };
  }
  return best ? best.pairs : [];
}

/** Taille lisible : « 55 kDa », « 1,5 kb », « 750 pb ». */
export function formatSize(size, unit) {
  if (!Number.isFinite(size)) return '—';
  if (unit === 'pb') {
    if (size >= 1000) return `${Number((size / 1000).toPrecision(3)).toLocaleString('fr-FR')} kb`;
    return `${Math.round(size).toLocaleString('fr-FR')} pb`;
  }
  // Une taille apparente n'est pas plus précise que quelques % : 2 chiffres sous 100 kDa, 3 au-delà
  const digits = size >= 100 ? 3 : 2;
  return `${Number(size.toPrecision(digits)).toLocaleString('fr-FR')} kDa`;
}

/** Axe de tailles dans une seule unité : kb dès que le marqueur dépasse 1 000 pb (0,5 ; 1 ; 10). */
export function sizeAxis(sizes, unit) {
  if (unit === 'pb' && Math.max(...sizes, 0) >= 1000) return { unit: 'kb', label: (x) => Number((x / 1000).toPrecision(3)).toLocaleString('fr-FR') };
  return { unit, label: (x) => formatSize(x, unit).replace(/ (kDa|pb|kb)$/, '') };
}
