// Régressions : linéaire, corrélations, ajustement non linéaire (Levenberg-Marquardt), interpolation.

import { normInv, tInv, tP2 } from './dist.js';
import { mean, ranks } from './core.js';

/** Régression linéaire par moindres carrés (chaque réplicat compte comme un point, comme Prism). */
export function linearRegression(x, y) {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const ssRes = Math.max(0, syy - slope * sxy);
  const df = n - 2;
  const syx = Math.sqrt(ssRes / df);
  const seSlope = syx / Math.sqrt(sxx);
  const seIntercept = syx * Math.sqrt(1 / n + (mx * mx) / sxx);
  const q = tInv(0.975, df);
  const t = slope / seSlope;
  return {
    n, slope, intercept, seSlope, seIntercept, df, syx, ssRes,
    slopeCi: [slope - q * seSlope, slope + q * seSlope],
    interceptCi: [intercept - q * seIntercept, intercept + q * seIntercept],
    r2: syy > 0 ? (sxy * sxy) / (sxx * syy) : 1,
    t, p: tP2(t, df),
    xIntercept: -intercept / slope,
    predict: (x0) => intercept + slope * x0,
    /** Bande de confiance à 95 % de la droite (moyenne prédite). */
    band: (x0) => q * syx * Math.sqrt(1 / n + (x0 - mx) ** 2 / sxx),
    inverse: (y0) => (y0 - intercept) / slope,
  };
}

/** Corrélation de Pearson : r, p (t à n − 2 ddl), IC à 95 % par la transformation de Fisher. */
export function pearson(x, y) {
  const n = x.length;
  const mx = mean(x);
  const my = mean(y);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (x[i] - mx) ** 2;
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) ** 2;
  }
  const r = Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
  const df = n - 2;
  const t = (r * Math.sqrt(df)) / Math.sqrt(Math.max(1e-300, 1 - r * r));
  const z = Math.atanh(r);
  const h = normInv(0.975) / Math.sqrt(n - 3);
  return { n, r, r2: r * r, t, df, p: Math.abs(r) === 1 ? 0 : tP2(t, df), ci: n > 3 ? [Math.tanh(z - h), Math.tanh(z + h)] : [NaN, NaN] };
}

/** Corrélation de Spearman (Pearson sur les rangs), p par la loi t. */
export function spearman(x, y) {
  const r = pearson(ranks(x).ranks, ranks(y).ranks);
  return { n: r.n, rho: r.r, t: r.t, df: r.df, p: r.p };
}

// --- Ajustement non linéaire -------------------------------------------------------------------------

const LN2 = Math.LN2;
const minOf = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);
const maxOf = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
/** x du point dont l'y est le plus proche d'une cible. */
const xAtY = (x, y, target) => x[y.reduce((best, v, i) => (Math.abs(v - target) < Math.abs(y[best] - target) ? i : best), 0)];

/**
 * Modèles courants au labo. X des modèles dose-réponse = log10(concentration) : l'analyse
 * propose de transformer des concentrations en log.
 */
export const MODELS = {
  dose4: {
    label: 'Dose-réponse, 4 paramètres (pente variable)',
    equation: 'Y = Bas + (Haut − Bas) / (1 + 10^((LogEC50 − X) × Pente de Hill))',
    params: ['Bas', 'Haut', 'LogEC50', 'Pente de Hill'],
    logX: true,
    f: (x, [b, t, c, h]) => b + (t - b) / (1 + 10 ** ((c - x) * h)),
    guess(x, y) {
      const lo = minOf(y);
      const hi = maxOf(y);
      const increasing = mean(y.filter((_, i) => x[i] > mean(x))) >= mean(y.filter((_, i) => x[i] <= mean(x)));
      return [lo, hi, xAtY(x, y, (lo + hi) / 2), increasing ? 1 : -1];
    },
    derived: (p) => [{ name: 'EC50', value: 10 ** p[2], fromLog: 2 }],
    inverse: (y0, [b, t, c, h]) => c - Math.log10((t - b) / (y0 - b) - 1) / h,
  },
  dose3: {
    label: 'Dose-réponse, 3 paramètres (pente de Hill = 1)',
    equation: 'Y = Bas + (Haut − Bas) / (1 + 10^(LogEC50 − X))',
    params: ['Bas', 'Haut', 'LogEC50'],
    logX: true,
    f: (x, [b, t, c]) => b + (t - b) / (1 + 10 ** (c - x)),
    guess(x, y) { const lo = minOf(y); const hi = maxOf(y); return [lo, hi, xAtY(x, y, (lo + hi) / 2)]; },
    derived: (p) => [{ name: 'EC50', value: 10 ** p[2], fromLog: 2 }],
    inverse: (y0, [b, t, c]) => c - Math.log10((t - b) / (y0 - b) - 1),
  },
  mm: {
    label: 'Michaelis-Menten',
    equation: 'Y = Vmax × X / (Km + X)',
    params: ['Vmax', 'Km'],
    f: (x, [v, k]) => (v * x) / (k + x),
    guess(x, y) { const v = maxOf(y) * 1.1; return [v, Math.max(1e-9, xAtY(x, y, v / 2))]; },
    inverse: (y0, [v, k]) => (y0 * k) / (v - y0),
  },
  hill: {
    label: 'Liaison spécifique avec pente de Hill',
    equation: 'Y = Bmax × X^h / (Kd^h + X^h)',
    params: ['Bmax', 'Kd', 'h'],
    f: (x, [bm, kd, h]) => (bm * Math.max(0, x) ** h) / (kd ** h + Math.max(0, x) ** h),
    guess(x, y) { const b = maxOf(y) * 1.1; return [b, Math.max(1e-9, xAtY(x, y, b / 2)), 1]; },
    inverse: (y0, [bm, kd, h]) => kd * (y0 / (bm - y0)) ** (1 / h),
  },
  decay1: {
    label: 'Décroissance exponentielle (une phase)',
    equation: 'Y = (Y0 − Plateau) × exp(−K × X) + Plateau',
    params: ['Y0', 'Plateau', 'K'],
    f: (x, [y0, pl, k]) => (y0 - pl) * Math.exp(-k * x) + pl,
    guess(x, y) { const span = maxOf(x) - minOf(x) || 1; return [y[x.indexOf(minOf(x))], y[x.indexOf(maxOf(x))], 3 / span]; },
    derived: (p) => [{ name: 'Demi-vie', value: LN2 / p[2] }, { name: 'Tau', value: 1 / p[2] }],
    inverse: (y0, [a, pl, k]) => -Math.log((y0 - pl) / (a - pl)) / k,
  },
  assoc1: {
    label: 'Association exponentielle (une phase)',
    equation: 'Y = Y0 + (Plateau − Y0) × (1 − exp(−K × X))',
    params: ['Y0', 'Plateau', 'K'],
    f: (x, [y0, pl, k]) => y0 + (pl - y0) * (1 - Math.exp(-k * x)),
    guess(x, y) { const span = maxOf(x) - minOf(x) || 1; return [y[x.indexOf(minOf(x))], y[x.indexOf(maxOf(x))], 3 / span]; },
    derived: (p) => [{ name: 'Demi-temps', value: LN2 / p[2] }],
    inverse: (y0, [a, pl, k]) => -Math.log(1 - (y0 - a) / (pl - a)) / k,
  },
  growth: {
    label: 'Croissance exponentielle',
    equation: 'Y = Y0 × exp(K × X)',
    params: ['Y0', 'K'],
    f: (x, [y0, k]) => y0 * Math.exp(k * x),
    guess(x, y) {
      const pos = x.map((v, i) => [v, y[i]]).filter(([, v]) => v > 0);
      const r = pos.length > 1 ? linearRegression(pos.map((p) => p[0]), pos.map((p) => Math.log(p[1]))) : null;
      return r ? [Math.exp(r.intercept), r.slope] : [maxOf(y), 0.1];
    },
    derived: (p) => [{ name: 'Temps de doublement', value: LN2 / p[1] }],
    inverse: (y0, [a, k]) => Math.log(y0 / a) / k,
  },
  poly2: {
    label: 'Polynôme de degré 2',
    equation: 'Y = B0 + B1 × X + B2 × X²',
    params: ['B0', 'B1', 'B2'],
    f: (x, [b0, b1, b2]) => b0 + b1 * x + b2 * x * x,
    guess(x, y) { const r = linearRegression(x, y); return [r.intercept, r.slope, 0]; },
    inverse: null,
  },
};

/** Résout A·x = b (petits systèmes, pivot partiel). null si singulier. */
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c += 1) {
    let piv = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-300) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k += 1) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

function inverse(A) {
  const n = A.length;
  const cols = [];
  for (let j = 0; j < n; j += 1) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const c = solve(A, e);
    if (!c) return null;
    cols.push(c);
  }
  return A.map((_, i) => cols.map((c) => c[i]));
}

/**
 * Moindres carrés non linéaires (Levenberg-Marquardt, jacobien par différences centrées).
 * Renvoie paramètres, erreurs types (covariance asymptotique), IC à 95 %, R², Sy.x.
 */
export function fitModel(modelKey, x, y, { init = null } = {}) {
  const model = MODELS[modelKey];
  const k = model.params.length;
  const n = x.length;
  if (n <= k) return { error: `Il faut plus de ${k} points pour ajuster ce modèle.` };
  const f = model.f;
  const ssOf = (p) => {
    let s = 0;
    for (let i = 0; i < n; i += 1) { const r = y[i] - f(x[i], p); s += r * r; }
    return s;
  };
  const jacobian = (p) => {
    const J = Array.from({ length: n }, () => new Array(k));
    for (let j = 0; j < k; j += 1) {
      const h = 1e-6 * Math.max(Math.abs(p[j]), 1e-3);
      const up = [...p];
      const dn = [...p];
      up[j] += h;
      dn[j] -= h;
      for (let i = 0; i < n; i += 1) J[i][j] = (f(x[i], up) - f(x[i], dn)) / (2 * h);
    }
    return J;
  };
  let p = [...(init ?? model.guess(x, y))];
  let ss = ssOf(p);
  let lambda = 1e-3;
  let converged = false;
  for (let it = 0; it < 500; it += 1) {
    const J = jacobian(p);
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const g = new Array(k).fill(0);
    for (let i = 0; i < n; i += 1) {
      const r = y[i] - f(x[i], p);
      for (let a = 0; a < k; a += 1) {
        g[a] += J[i][a] * r;
        for (let b = 0; b < k; b += 1) A[a][b] += J[i][a] * J[i][b];
      }
    }
    let improved = false;
    for (let tries = 0; tries < 30; tries += 1) {
      const M = A.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      const d = solve(M, g);
      if (!d) { lambda *= 10; continue; }
      const next = p.map((v, j) => v + d[j]);
      const ssNext = ssOf(next);
      if (Number.isFinite(ssNext) && ssNext <= ss) {
        const rel = (ss - ssNext) / Math.max(ss, 1e-300);
        const step = Math.max(...d.map((v, j) => Math.abs(v) / Math.max(Math.abs(p[j]), 1e-9)));
        p = next;
        ss = ssNext;
        lambda = Math.max(lambda / 10, 1e-12);
        improved = true;
        if (rel < 1e-14 || step < 1e-10) converged = true;
        break;
      }
      lambda *= 10;
    }
    if (!improved || converged) { converged = true; break; }
  }
  const df = n - k;
  const s2 = ss / df;
  const J = jacobian(p);
  const A = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (__, b) => {
    let t = 0;
    for (let i = 0; i < n; i += 1) t += J[i][a] * J[i][b];
    return t;
  }));
  const cov = inverse(A);
  const se = cov ? cov.map((row, j) => Math.sqrt(Math.max(0, row[j] * s2))) : p.map(() => NaN);
  const q = tInv(0.975, df);
  const my = mean(y);
  const sst = y.reduce((t, v) => t + (v - my) ** 2, 0);
  const derived = (model.derived?.(p) ?? []).map((dv) => (dv.fromLog !== undefined
    ? { ...dv, ci: [10 ** (p[dv.fromLog] - q * se[dv.fromLog]), 10 ** (p[dv.fromLog] + q * se[dv.fromLog])] }
    : dv));
  return {
    model: modelKey, params: p, se, ci: p.map((v, j) => [v - q * se[j], v + q * se[j]]),
    df, ss, syx: Math.sqrt(s2), r2: sst > 0 ? 1 - ss / sst : 1, n, converged, derived, cov,
    predict: (x0) => f(x0, p),
    inverse: model.inverse ? (y0) => model.inverse(y0, p) : null,
    ambiguous: se.some((v, j) => !Number.isFinite(v) || v > 1e6 * Math.max(1, Math.abs(p[j]))),
  };
}
