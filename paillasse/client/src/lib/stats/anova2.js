// ANOVA à deux facteurs (tableau groupé : lignes = facteur A, colonnes = facteur B, réplicats).
// Sommes des carrés de type III par régression (codage des effets), comme Prism : valable pour
// des effectifs inégaux. Sans réplicats, modèle additif (interaction non testable).

import { fSf, ptukey, qtukey, tInv, tP2 } from './dist.js';
import { mean } from './core.js';

/** Somme des carrés résiduelle de y ≈ X·b (QR de Householder), et rang de X. */
function residualSS(X, y) {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const A = X.map((r) => [...r]);
  const b = [...y];
  let rank = 0;
  for (let c = 0; c < p && rank < n; c += 1) {
    let norm = 0;
    for (let r = rank; r < n; r += 1) norm += A[r][c] ** 2;
    norm = Math.sqrt(norm);
    if (norm < 1e-10) continue; // colonne dépendante des précédentes
    const alpha = A[rank][c] > 0 ? -norm : norm;
    const v = new Array(n).fill(0);
    for (let r = rank; r < n; r += 1) v[r] = A[r][c];
    v[rank] -= alpha;
    let vv = 0;
    for (let r = rank; r < n; r += 1) vv += v[r] * v[r];
    if (vv < 1e-300) { rank += 1; continue; }
    for (let cc = c; cc < p; cc += 1) {
      let d = 0;
      for (let r = rank; r < n; r += 1) d += v[r] * A[r][cc];
      const k = (2 * d) / vv;
      for (let r = rank; r < n; r += 1) A[r][cc] -= k * v[r];
    }
    let d = 0;
    for (let r = rank; r < n; r += 1) d += v[r] * b[r];
    const k = (2 * d) / vv;
    for (let r = rank; r < n; r += 1) b[r] -= k * v[r];
    rank += 1;
  }
  let rss = 0;
  for (let r = rank; r < n; r += 1) rss += b[r] * b[r];
  return { rss, rank };
}

/** Codage des effets : niveau l < dernier → +1, dernier → −1. */
const effect = (level, count) => Array.from({ length: count - 1 }, (_, l) => (level === l ? 1 : level === count - 1 ? -1 : 0));

/**
 * cells[i][j] = valeurs de la ligne i (facteur A) et de la colonne j (facteur B).
 * Renvoie les trois effets (interaction, lignes, colonnes), l'erreur résiduelle, les moyennes.
 */
export function anova2(cells) {
  const r = cells.length;
  const c = cells[0].length;
  const obs = [];
  cells.forEach((row, i) => row.forEach((vals, j) => vals.forEach((v) => obs.push({ i, j, v }))));
  const N = obs.length;
  const counts = cells.map((row) => row.map((vals) => vals.length));
  const replicated = counts.some((row) => row.some((n) => n > 1));
  const empty = counts.some((row) => row.some((n) => n === 0));
  if (replicated && empty) return { error: 'Chaque combinaison ligne × colonne doit avoir au moins une valeur.' };
  const interaction = replicated;
  const cols = (o, parts) => {
    const a = effect(o.i, r);
    const b = effect(o.j, c);
    const row = [1];
    if (parts.a) row.push(...a);
    if (parts.b) row.push(...b);
    if (parts.ab) for (const x of a) for (const y of b) row.push(x * y);
    return row;
  };
  const y = obs.map((o) => o.v);
  const full = { a: true, b: true, ab: interaction };
  const fit = residualSS(obs.map((o) => cols(o, full)), y);
  const dfE = N - fit.rank;
  if (dfE <= 0) return { error: 'Pas assez de valeurs pour estimer l’erreur résiduelle.' };
  const mse = fit.rss / dfE;
  const test = (without, df) => {
    const ss = residualSS(obs.map((o) => cols(o, { ...full, [without]: false })), y).rss - fit.rss;
    const F = ss / df / mse;
    return { ss, df, ms: ss / df, F, p: fSf(F, df, dfE) };
  };
  const my = mean(y);
  const sst = y.reduce((t, v) => t + (v - my) ** 2, 0);
  const rows = test('a', r - 1);
  const columns = test('b', c - 1);
  const inter = interaction ? test('ab', (r - 1) * (c - 1)) : null;
  const pct = (ss) => (ss / sst) * 100;
  return {
    rows: { ...rows, pct: pct(rows.ss) },
    columns: { ...columns, pct: pct(columns.ss) },
    interaction: inter ? { ...inter, pct: pct(inter.ss) } : null,
    residual: { ss: fit.rss, df: dfE, ms: mse },
    N, sst, mse, dfE, interactionTested: interaction,
    means: cells.map((row) => row.map((vals) => (vals.length ? mean(vals) : NaN))),
    counts,
  };
}

/**
 * Comparaisons après l'ANOVA à deux facteurs : colonnes comparées dans chaque ligne (within = 'rows')
 * ou lignes dans chaque colonne ('columns'). Une seule famille de comparaisons : Šidák, Bonferroni,
 * Tukey (famille = chaque ligne) ou sans correction.
 */
export function anova2Comparisons(res, { within = 'rows', method = 'sidak' } = {}) {
  const { means, counts, mse, dfE } = res;
  const r = means.length;
  const c = means[0].length;
  const outer = within === 'rows' ? r : c;
  const inner = within === 'rows' ? c : r;
  const at = (o, k) => (within === 'rows' ? [o, k] : [k, o]);
  const list = [];
  for (let o = 0; o < outer; o += 1) for (let a = 0; a < inner; a += 1) for (let b = a + 1; b < inner; b += 1) list.push([o, a, b]);
  const m = list.length;
  const perFamily = (inner * (inner - 1)) / 2;
  let crit;
  if (method === 'tukey') crit = qtukey(0.95, inner, dfE) / Math.SQRT2;
  else if (method === 'sidak') crit = tInv(1 - (1 - 0.95 ** (1 / m)) / 2, dfE);
  else if (method === 'bonferroni') crit = tInv(1 - 0.05 / (2 * m), dfE);
  else crit = tInv(0.975, dfE);
  return list.map(([o, a, b]) => {
    const [ia, ja] = at(o, a);
    const [ib, jb] = at(o, b);
    const diff = means[ib][jb] - means[ia][ja];
    const se = Math.sqrt(mse * (1 / counts[ia][ja] + 1 / counts[ib][jb]));
    const t = diff / se;
    const raw = tP2(t, dfE);
    let p;
    if (method === 'tukey') p = 1 - ptukey(Math.abs(t) * Math.SQRT2, inner, dfE);
    else if (method === 'sidak') p = 1 - (1 - raw) ** m;
    else if (method === 'bonferroni') p = Math.min(1, raw * m);
    else p = raw;
    return { outer: o, a, b, diff, se, t, pRaw: raw, p: Math.max(0, Math.min(1, p)), ciLow: diff - crit * se, ciHigh: diff + crit * se, family: method === 'tukey' ? perFamily : m };
  });
}
