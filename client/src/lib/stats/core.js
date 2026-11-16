// Statistiques descriptives, rangs et tests de normalité.

import { chi2Sf, normCdf, normInv, tInv } from './dist.js';

export const sum = (a) => a.reduce((t, v) => t + v, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);

/** Variance d'échantillon (n − 1). */
export function variance(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return s / (a.length - 1);
}
export const sd = (a) => Math.sqrt(variance(a));

/**
 * Centile à la façon de Prism (et du manuel NIST) : rang p(n + 1), interpolé entre les deux
 * valeurs voisines, borné aux extrêmes.
 */
export function percentile(sorted, p) {
  const n = sorted.length;
  if (!n) return NaN;
  const r = p * (n + 1);
  if (r <= 1) return sorted[0];
  if (r >= n) return sorted[n - 1];
  const k = Math.floor(r);
  return sorted[k - 1] + (r - k) * (sorted[k] - sorted[k - 1]);
}

/** Rangs moyens (ex æquo : rang moyen) et correction des ex æquo Σ(t³ − t). */
export function ranks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(values.length);
  let ties = 0;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j += 1;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) r[idx[k][1]] = avg;
    const t = j - i + 1;
    if (t > 1) ties += t ** 3 - t;
    i = j + 1;
  }
  return { ranks: r, ties };
}

/** Statistiques descriptives d'une colonne. */
export function describe(values) {
  const a = values.filter(Number.isFinite);
  const n = a.length;
  const s = [...a].sort((x, y) => x - y);
  const m = mean(a);
  const v = variance(a);
  const dev = Math.sqrt(v);
  const sem = dev / Math.sqrt(n);
  const tq = n > 1 ? tInv(0.975, n - 1) : NaN;
  let g1 = NaN;
  let g2 = NaN;
  if (n > 2) {
    let m2 = 0;
    let m3 = 0;
    let m4 = 0;
    for (const x of a) { const d = x - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
    m2 /= n; m3 /= n; m4 /= n;
    // Asymétrie et aplatissement corrigés du biais (comme Prism et Excel)
    g1 = (Math.sqrt(n * (n - 1)) / (n - 2)) * (m3 / m2 ** 1.5);
    if (n > 3) g2 = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * (m4 / (m2 * m2)) - 3 * (n - 1));
  }
  const positive = a.every((x) => x > 0);
  return {
    n,
    mean: m,
    sd: dev,
    sem,
    ciLow: m - tq * sem,
    ciHigh: m + tq * sem,
    min: s[0],
    q1: percentile(s, 0.25),
    median: percentile(s, 0.5),
    q3: percentile(s, 0.75),
    max: s[n - 1],
    range: s[n - 1] - s[0],
    cv: (dev / m) * 100,
    geomean: positive && n ? Math.exp(mean(a.map(Math.log))) : NaN,
    skewness: g1,
    kurtosis: g2,
    sum: sum(a),
  };
}

// --- Normalité ---------------------------------------------------------------------------------------

const poly = (c, x) => c.reduceRight((t, v) => t * x + v, 0);

/**
 * Test de Shapiro-Wilk (algorithme AS R94 de Royston, celui de R et de scipy). 3 ≤ n ≤ 5000.
 */
export function shapiroWilk(values) {
  const x = values.filter(Number.isFinite).sort((a, b) => a - b);
  const n = x.length;
  if (n < 3) return null;
  const nn2 = Math.floor(n / 2);
  const a = new Array(nn2 + 1).fill(0);
  const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
  const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
  if (n === 3) {
    a[1] = Math.SQRT1_2;
  } else {
    const an25 = n + 0.25;
    let summ2 = 0;
    for (let i = 1; i <= nn2; i += 1) {
      a[i] = normInv((i - 0.375) / an25);
      summ2 += a[i] * a[i];
    }
    summ2 *= 2;
    const ssumm2 = Math.sqrt(summ2);
    const rsn = 1 / Math.sqrt(n);
    const a1 = poly(c1, rsn) - a[1] / ssumm2;
    let i1;
    let fac;
    if (n > 5) {
      i1 = 3;
      const a2 = -a[2] / ssumm2 + poly(c2, rsn);
      fac = Math.sqrt((summ2 - 2 * a[1] * a[1] - 2 * a[2] * a[2]) / (1 - 2 * a1 * a1 - 2 * a2 * a2));
      a[2] = a2;
    } else {
      i1 = 2;
      fac = Math.sqrt((summ2 - 2 * a[1] * a[1]) / (1 - 2 * a1 * a1));
    }
    a[1] = a1;
    for (let i = i1; i <= nn2; i += 1) a[i] /= -fac;
  }
  const range = x[n - 1] - x[0];
  if (range < 1e-19) return null;
  let num = 0;
  for (let i = 1; i <= nn2; i += 1) num += a[i] * (x[n - i] - x[i - 1]);
  const m = mean(x);
  let ss = 0;
  for (const v of x) ss += (v - m) ** 2;
  const w = Math.min(1, (num * num) / ss);
  let p;
  if (n === 3) {
    p = Math.max(0, (6 / Math.PI) * (Math.asin(Math.sqrt(w)) - Math.asin(Math.sqrt(0.75))));
  } else {
    const w1 = 1 - w;
    let y = Math.log(w1);
    let mu;
    let sigma;
    if (n <= 11) {
      const gamma = poly([-2.273, 0.459], n);
      if (y >= gamma) return { w, p: 1e-99 };
      y = -Math.log(gamma - y);
      mu = poly([0.544, -0.39978, 0.025054, -6.714e-4], n);
      sigma = Math.exp(poly([1.3822, -0.77857, 0.062767, -0.0020322], n));
    } else {
      const xx = Math.log(n);
      mu = poly([-1.5861, -0.31082, -0.083751, 0.0038915], xx);
      sigma = Math.exp(poly([-0.4803, -0.082676, 0.0030302], xx));
    }
    p = 1 - normCdf((y - mu) / sigma);
  }
  return { w, p };
}

/** Test omnibus K² de D'Agostino-Pearson (asymétrie et aplatissement), n ≥ 8. */
export function dagostino(values) {
  const x = values.filter(Number.isFinite);
  const n = x.length;
  if (n < 8) return null;
  const m = mean(x);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of x) { const d = v - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= n; m3 /= n; m4 /= n;
  if (m2 === 0) return null;
  // Asymétrie
  const b1 = m3 / m2 ** 1.5;
  let y = b1 * Math.sqrt(((n + 1) * (n + 3)) / (6 * (n - 2)));
  const beta2 = (3 * (n * n + 27 * n - 70) * (n + 1) * (n + 3)) / ((n - 2) * (n + 5) * (n + 7) * (n + 9));
  const w2 = -1 + Math.sqrt(2 * (beta2 - 1));
  const delta = 1 / Math.sqrt(0.5 * Math.log(w2));
  const alpha = Math.sqrt(2 / (w2 - 1));
  if (y === 0) y = 1;
  const zs = delta * Math.log(y / alpha + Math.sqrt((y / alpha) ** 2 + 1));
  // Aplatissement
  const b2 = m4 / (m2 * m2);
  const e = (3 * (n - 1)) / (n + 1);
  const varb2 = (24 * n * (n - 2) * (n - 3)) / ((n + 1) ** 2 * (n + 3) * (n + 5));
  const xk = (b2 - e) / Math.sqrt(varb2);
  const sqrtbeta1 = ((6 * (n * n - 5 * n + 2)) / ((n + 7) * (n + 9))) * Math.sqrt((6 * (n + 3) * (n + 5)) / (n * (n - 2) * (n - 3)));
  const A = 6 + (8 / sqrtbeta1) * (2 / sqrtbeta1 + Math.sqrt(1 + 4 / (sqrtbeta1 * sqrtbeta1)));
  const term1 = 1 - 2 / (9 * A);
  const denom = 1 + xk * Math.sqrt(2 / (A - 4));
  const term2 = Math.sign(denom) * Math.cbrt((1 - 2 / A) / Math.abs(denom));
  const zk = (term1 - term2) / Math.sqrt(2 / (9 * A));
  const k2 = zs * zs + zk * zk;
  return { k2, p: chi2Sf(k2, 2), zSkew: zs, zKurt: zk };
}
