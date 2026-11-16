// Survie : courbes de Kaplan-Meier, test du log-rank (Mantel-Cox) et de Gehan-Breslow-Wilcoxon.

import { chi2Sf, normInv } from './dist.js';

/**
 * Kaplan-Meier. times et events (1 = événement, 0 = censuré) de même longueur.
 * Renvoie les marches { t, atRisk, events, censored, s, se } (erreur type de Greenwood) et la médiane.
 */
export function kaplanMeier(times, events) {
  const obs = times.map((t, i) => ({ t, e: events[i] ? 1 : 0 })).sort((a, b) => a.t - b.t);
  const n = obs.length;
  const steps = [];
  let s = 1;
  let greenwood = 0;
  let atRisk = n;
  let i = 0;
  while (i < n) {
    const t = obs[i].t;
    let d = 0;
    let cens = 0;
    while (i < n && obs[i].t === t) { if (obs[i].e) d += 1; else cens += 1; i += 1; }
    if (d > 0) {
      s *= 1 - d / atRisk;
      if (atRisk > d) greenwood += d / (atRisk * (atRisk - d));
    }
    steps.push({ t, atRisk, events: d, censored: cens, s, se: s * Math.sqrt(greenwood) });
    atRisk -= d + cens;
  }
  const hit = steps.find((st) => st.s <= 0.5 + 1e-12);
  return {
    n,
    events: obs.filter((o) => o.e).length,
    steps,
    median: hit ? hit.t : null,
    censoredTimes: obs.filter((o) => !o.e).map((o) => o.t),
  };
}

/** Inverse d'une petite matrice symétrique (Gauss-Jordan). */
function invert(M) {
  const n = M.length;
  const A = M.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c += 1) {
    let p = c;
    for (let r = c + 1; r < n; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return null;
    [A[c], A[p]] = [A[p], A[c]];
    const pv = A[c][c];
    for (let k = 0; k < 2 * n; k += 1) A[c][k] /= pv;
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue;
      const f = A[r][c];
      for (let k = 0; k < 2 * n; k += 1) A[r][k] -= f * A[c][k];
    }
  }
  return A.map((row) => row.slice(n));
}

/**
 * Comparaison de courbes de survie : log-rank (poids 1) ou Gehan-Breslow-Wilcoxon (poids = nombre
 * à risque). groups = [{ times, events }]. Pour deux groupes : rapport des risques (méthode log-rank).
 */
export function logRank(groups, { weight = 'logrank' } = {}) {
  const k = groups.length;
  const all = groups.flatMap((g, gi) => g.times.map((t, i) => ({ t, e: g.events[i] ? 1 : 0, g: gi })));
  const times = [...new Set(all.filter((o) => o.e).map((o) => o.t))].sort((a, b) => a - b);
  const O = new Array(k).fill(0);
  const E = new Array(k).fill(0);
  const U = new Array(k).fill(0);
  const V = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const t of times) {
    const nj = groups.map((_, gi) => all.filter((o) => o.g === gi && o.t >= t).length);
    const dj = groups.map((_, gi) => all.filter((o) => o.g === gi && o.t === t && o.e).length);
    const n = nj.reduce((a, b) => a + b, 0);
    const d = dj.reduce((a, b) => a + b, 0);
    if (n < 1) continue;
    const w = weight === 'gehan' ? n : 1;
    for (let a = 0; a < k; a += 1) {
      const e = (d * nj[a]) / n;
      O[a] += dj[a];
      E[a] += e;
      U[a] += w * (dj[a] - e);
      if (n > 1) {
        for (let b = 0; b < k; b += 1) {
          V[a][b] += w * w * ((d * (n - d)) / (n - 1)) * (nj[a] / n) * ((a === b ? 1 : 0) - nj[b] / n);
        }
      }
    }
  }
  // Statistique sur k − 1 groupes (la matrice complète est singulière)
  const Vr = V.slice(0, k - 1).map((row) => row.slice(0, k - 1));
  const inv = invert(Vr);
  let chi2 = 0;
  if (inv) for (let a = 0; a < k - 1; a += 1) for (let b = 0; b < k - 1; b += 1) chi2 += U[a] * inv[a][b] * U[b];
  const res = { chi2, df: k - 1, p: chi2Sf(chi2, k - 1), observed: O, expected: E };
  if (k === 2 && weight === 'logrank') {
    const hr = (O[0] / E[0]) / (O[1] / E[1]);
    const se = Math.sqrt(1 / E[0] + 1 / E[1]);
    const z = normInv(0.975);
    res.hazardRatio = { hr, ci: [hr * Math.exp(-z * se), hr * Math.exp(z * se)] };
  }
  return res;
}
