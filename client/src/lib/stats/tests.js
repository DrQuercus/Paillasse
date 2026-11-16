// Comparaison de groupes : tests t, non paramétriques, ANOVA à un facteur et comparaisons multiples.
// Chaque fonction reçoit des tableaux de nombres (valeurs manquantes déjà retirées) et renvoie des
// nombres ; la mise en forme est faite par report.js.

import { chi2Sf, fSf, normSf, pdunnett, ptukey, qdunnett, qtukey, tInv, tP2 } from './dist.js';
import { mean, ranks, sum, variance } from './core.js';

const ss = (a, m = mean(a)) => a.reduce((t, v) => t + (v - m) ** 2, 0);

// --- Tests t -------------------------------------------------------------------------------------------

/** Test t non apparié (Student, variances égales) ou de Welch. */
export function tTest(a, b, { welch = false } = {}) {
  const n1 = a.length;
  const n2 = b.length;
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = variance(a);
  const v2 = variance(b);
  const diff = m2 - m1;
  let se;
  let df;
  if (welch) {
    se = Math.sqrt(v1 / n1 + v2 / n2);
    df = (v1 / n1 + v2 / n2) ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1));
  } else {
    df = n1 + n2 - 2;
    const sp = ((n1 - 1) * v1 + (n2 - 1) * v2) / df;
    se = Math.sqrt(sp * (1 / n1 + 1 / n2));
  }
  const t = diff / se;
  const q = tInv(0.975, df);
  // Comparaison des variances (test F), comme Prism l'indique avec le test t
  const f = Math.max(v1, v2) / Math.min(v1, v2);
  const fDf = v1 >= v2 ? [n1 - 1, n2 - 1] : [n2 - 1, n1 - 1];
  return {
    t, df, p: tP2(t, df), diff, se, ciLow: diff - q * se, ciHigh: diff + q * se,
    r2: (t * t) / (t * t + df),
    fTest: { f, df1: fDf[0], df2: fDf[1], p: Math.min(1, 2 * fSf(f, fDf[0], fDf[1])) },
  };
}

/** Test t apparié (différences b − a, ligne à ligne). */
export function tTestPaired(a, b) {
  const d = a.map((v, i) => b[i] - v);
  const r = tTestOne(d, 0);
  const pairsCorrelation = pearsonR(a, b);
  return { ...r, diff: r.mean, pairs: d.length, pairing: pairsCorrelation };
}

/** Test t sur un échantillon (moyenne comparée à une valeur théorique). */
export function tTestOne(a, mu = 0) {
  const n = a.length;
  const m = mean(a);
  const se = Math.sqrt(variance(a) / n);
  const df = n - 1;
  const t = (m - mu) / se;
  const q = tInv(0.975, df);
  return { t, df, p: tP2(t, df), mean: m, diff: m - mu, se, ciLow: m - mu - q * se, ciHigh: m - mu + q * se, r2: (t * t) / (t * t + df) };
}

function pearsonR(x, y) {
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

// --- Tests non paramétriques ----------------------------------------------------------------------------

/**
 * Loi exacte de U de Mann-Whitney (sans ex æquo) : P(U = u), u = 0..mn. Récurrence
 * f(i, j, u) = f(i − 1, j, u − j) + f(i, j − 1, u), faite d'additions seulement (aucune perte
 * de précision même quand le nombre de combinaisons dépasse 2^53).
 */
function mwuDistribution(m, n) {
  let prev = Array.from({ length: n + 1 }, () => Float64Array.of(1));
  for (let i = 1; i <= m; i += 1) {
    const cur = [Float64Array.of(1)];
    for (let j = 1; j <= n; j += 1) {
      const a = new Float64Array(i * j + 1);
      const up = prev[j];
      for (let u = 0; u < up.length; u += 1) a[u + j] += up[u];
      const left = cur[j - 1];
      for (let u = 0; u < left.length; u += 1) a[u] += left[u];
      cur.push(a);
    }
    prev = cur;
  }
  const c = prev[n];
  const total = sum(c);
  return c.map((v) => v / total);
}

/** Test de Mann-Whitney : p exact sans ex æquo (effectif total ≤ 60), sinon approximation normale. */
export function mannWhitney(a, b) {
  const n1 = a.length;
  const n2 = b.length;
  const { ranks: r, ties } = ranks([...a, ...b]);
  const r1 = sum(r.slice(0, n1));
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const medianA = median(a);
  const medianB = median(b);
  if (!ties && n1 + n2 <= 60) {
    const dist = mwuDistribution(n1, n2);
    let cdf = 0;
    for (let k = 0; k <= Math.round(u); k += 1) cdf += dist[k];
    return { u, u1, u2, sumRanks: [r1, sum(r.slice(n1))], p: Math.min(1, 2 * cdf), exact: true, medianA, medianB, diff: medianB - medianA };
  }
  const mu = (n1 * n2) / 2;
  const n = n1 + n2;
  const sigma = Math.sqrt(((n1 * n2) / 12) * (n + 1 - ties / (n * (n - 1))));
  const z = (Math.abs(u1 - mu) - 0.5) / sigma;
  return { u, u1, u2, sumRanks: [r1, sum(r.slice(n1))], z, p: Math.min(1, 2 * normSf(Math.max(0, z))), exact: false, medianA, medianB, diff: medianB - medianA };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Loi exacte de W+ (rangs signés, sans ex æquo) : P(W+ = w). */
function signedRankDistribution(n) {
  const max = (n * (n + 1)) / 2;
  let c = new Float64Array(max + 1);
  c[0] = 1;
  for (let k = 1; k <= n; k += 1) {
    const next = Float64Array.from(c);
    for (let w = k; w <= max; w += 1) next[w] += c[w - k];
    c = next;
  }
  const total = 2 ** n;
  return c.map((v) => v / total);
}

/** Test des rangs signés de Wilcoxon (différences nulles écartées). */
export function wilcoxon(d) {
  const x = d.filter((v) => v !== 0);
  const n = x.length;
  const zeros = d.length - n;
  if (!n) return { n, zeros, wPlus: 0, wMinus: 0, p: 1, exact: true };
  const { ranks: r, ties } = ranks(x.map(Math.abs));
  let wPlus = 0;
  for (let i = 0; i < n; i += 1) if (x[i] > 0) wPlus += r[i];
  const wMinus = (n * (n + 1)) / 2 - wPlus;
  if (!ties && n <= 50) {
    const dist = signedRankDistribution(n);
    const w = Math.min(wPlus, wMinus);
    let cdf = 0;
    for (let k = 0; k <= Math.round(w); k += 1) cdf += dist[k];
    return { n, zeros, wPlus, wMinus, p: Math.min(1, 2 * cdf), exact: true, median: median(d) };
  }
  const mu = (n * (n + 1)) / 4;
  const sigma = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 24 - ties / 48);
  const z = (wPlus - mu) / sigma;
  return { n, zeros, wPlus, wMinus, z, p: Math.min(1, 2 * normSf(Math.abs(z))), exact: false, median: median(d) };
}

// --- ANOVA à un facteur -----------------------------------------------------------------------------------

/** ANOVA ordinaire (variances égales). groups = [[valeurs], …]. */
export function anova1(groups) {
  const all = groups.flat();
  const N = all.length;
  const k = groups.length;
  const grand = mean(all);
  const ssb = sum(groups.map((g) => g.length * (mean(g) - grand) ** 2));
  const ssw = sum(groups.map((g) => ss(g)));
  const dfb = k - 1;
  const dfw = N - k;
  const msb = ssb / dfb;
  const msw = ssw / dfw;
  const F = msb / msw;
  return {
    F, dfb, dfw, p: fSf(F, dfb, dfw), ssb, ssw, sst: ssb + ssw, msb, msw, r2: ssb / (ssb + ssw),
    brownForsythe: brownForsythe(groups), bartlett: bartlett(groups),
  };
}

/** Brown-Forsythe : égalité des variances, écarts à la médiane (Levene centré sur la médiane). */
export function brownForsythe(groups) {
  const dev = groups.map((g) => { const m = median(g); return g.map((v) => Math.abs(v - m)); });
  const all = dev.flat();
  const N = all.length;
  const k = groups.length;
  const grand = mean(all);
  const ssb = sum(dev.map((g) => g.length * (mean(g) - grand) ** 2));
  const ssw = sum(dev.map((g) => ss(g)));
  const F = (ssb / (k - 1)) / (ssw / (N - k));
  return { F, df1: k - 1, df2: N - k, p: fSf(F, k - 1, N - k) };
}

/** Test de Bartlett (égalité des variances, sensible à la normalité). */
export function bartlett(groups) {
  const k = groups.length;
  const N = sum(groups.map((g) => g.length));
  const vars = groups.map(variance);
  const sp = sum(groups.map((g, i) => (g.length - 1) * vars[i])) / (N - k);
  const num = (N - k) * Math.log(sp) - sum(groups.map((g, i) => (g.length - 1) * Math.log(vars[i])));
  const den = 1 + (1 / (3 * (k - 1))) * (sum(groups.map((g) => 1 / (g.length - 1))) - 1 / (N - k));
  const stat = num / den;
  return { stat, df: k - 1, p: chi2Sf(stat, k - 1) };
}

/** ANOVA de Welch (variances inégales). */
export function welchAnova(groups) {
  const k = groups.length;
  const w = groups.map((g) => g.length / variance(g));
  const W = sum(w);
  const means = groups.map(mean);
  const mw = sum(w.map((x, i) => x * means[i])) / W;
  const A = sum(w.map((x, i) => x * (means[i] - mw) ** 2)) / (k - 1);
  const lam = sum(groups.map((g, i) => (1 - w[i] / W) ** 2 / (g.length - 1)));
  const B = 1 + ((2 * (k - 2)) / (k * k - 1)) * lam;
  const F = A / B;
  const df2 = (k * k - 1) / (3 * lam);
  return { F, dfb: k - 1, dfw: df2, p: fSf(F, k - 1, df2) };
}

/**
 * ANOVA à mesures répétées : matrix[sujet][traitement], sujets complets. Correction de
 * Geisser-Greenhouse (ε) pour l'hypothèse de sphéricité.
 */
export function anovaRM(matrix) {
  const n = matrix.length;
  const k = matrix[0].length;
  const all = matrix.flat();
  const grand = mean(all);
  const colMeans = Array.from({ length: k }, (_, j) => mean(matrix.map((r) => r[j])));
  const rowMeans = matrix.map(mean);
  const sst = ss(all, grand);
  const ssTreat = n * sum(colMeans.map((m) => (m - grand) ** 2));
  const ssSubj = k * sum(rowMeans.map((m) => (m - grand) ** 2));
  const ssErr = sst - ssTreat - ssSubj;
  const df1 = k - 1;
  const df2 = (n - 1) * (k - 1);
  const F = (ssTreat / df1) / (ssErr / df2);
  // ε de Geisser-Greenhouse : matrice de covariance des traitements, doublement centrée
  const cov = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => {
    let s = 0;
    for (const r of matrix) s += (r[i] - colMeans[i]) * (r[j] - colMeans[j]);
    return s / (n - 1);
  }));
  const rowAvg = cov.map(mean);
  const all2 = mean(rowAvg);
  const dc = cov.map((r, i) => r.map((v, j) => v - rowAvg[i] - rowAvg[j] + all2));
  let tr = 0;
  let sq = 0;
  for (let i = 0; i < k; i += 1) { tr += dc[i][i]; for (let j = 0; j < k; j += 1) sq += dc[i][j] ** 2; }
  const eps = Math.min(1, Math.max(1 / (k - 1), (tr * tr) / ((k - 1) * sq)));
  const ssbSubjF = (ssSubj / (n - 1)) / (ssErr / df2);
  return {
    F, df1, df2, p: fSf(F, df1, df2), epsilon: eps, pGG: fSf(F, df1 * eps, df2 * eps),
    ssTreat, ssSubj, ssErr, msErr: ssErr / df2, r2: ssTreat / (ssTreat + ssErr),
    matching: { F: ssbSubjF, df1: n - 1, df2, p: fSf(ssbSubjF, n - 1, df2) },
  };
}

/** Kruskal-Wallis (correction des ex æquo, approximation du χ²). */
export function kruskalWallis(groups) {
  const all = groups.flat();
  const N = all.length;
  const { ranks: r, ties } = ranks(all);
  let offset = 0;
  const rankSums = groups.map((g) => { const s = sum(r.slice(offset, offset + g.length)); offset += g.length; return s; });
  let H = (12 / (N * (N + 1))) * sum(rankSums.map((R, i) => (R * R) / groups[i].length)) - 3 * (N + 1);
  const c = 1 - ties / (N ** 3 - N);
  if (c > 0) H /= c;
  return { H, df: groups.length - 1, p: chi2Sf(H, groups.length - 1), rankSums, meanRanks: rankSums.map((R, i) => R / groups[i].length), ranks: r, ties, N };
}

/** Test de Friedman (mesures répétées non paramétrique) : matrix[sujet][traitement]. */
export function friedman(matrix) {
  const n = matrix.length;
  const k = matrix[0].length;
  const rankSums = new Array(k).fill(0);
  let ties = 0;
  for (const row of matrix) {
    const { ranks: r, ties: t } = ranks(row);
    r.forEach((v, j) => { rankSums[j] += v; });
    ties += t;
  }
  let Q = (12 / (n * k * (k + 1))) * sum(rankSums.map((R) => R * R)) - 3 * n * (k + 1);
  const c = 1 - ties / (n * k * (k * k - 1));
  if (c > 0) Q /= c;
  return { Q, df: k - 1, p: chi2Sf(Q, k - 1), rankSums, n, k };
}

// --- Comparaisons multiples -------------------------------------------------------------------------------------

/** Toutes les paires (i < j). */
export const allPairs = (k) => {
  const out = [];
  for (let i = 0; i < k; i += 1) for (let j = i + 1; j < k; j += 1) out.push([i, j]);
  return out;
};

/**
 * Comparaisons après une ANOVA ordinaire (ou à mesures répétées) : Tukey (toutes les paires),
 * Dunnett (chaque groupe contre un témoin), Šidák, Bonferroni ou sans correction (LSD de Fisher).
 * stats = { means, ns, mse, df } ; pairs = [[i, j]] ; diff = moyenne j − moyenne i.
 */
export function multipleComparisons({ means, ns, mse, df }, { method = 'tukey', pairs, control = 0 }) {
  const k = means.length;
  const list = method === 'dunnett'
    ? means.map((_, i) => i).filter((i) => i !== control).map((i) => [control, i])
    : pairs ?? allPairs(k);
  const m = list.length;
  const se = (i, j) => Math.sqrt(mse * (1 / ns[i] + 1 / ns[j]));
  let crit;
  if (method === 'tukey') crit = qtukey(0.95, k, df) / Math.SQRT2;
  else if (method === 'dunnett') crit = qdunnett(0.95, list.map(([, i]) => 1 / Math.sqrt(1 + ns[control] / ns[i])), df);
  else if (method === 'sidak') crit = tInv(1 - (1 - (1 - 0.05) ** (1 / m)) / 2, df);
  else if (method === 'bonferroni') crit = tInv(1 - 0.05 / (2 * m), df);
  else crit = tInv(0.975, df);
  const lambdas = method === 'dunnett' ? list.map(([, i]) => 1 / Math.sqrt(1 + ns[control] / ns[i])) : null;
  return list.map(([i, j]) => {
    const diff = means[j] - means[i];
    const s = se(i, j);
    const t = diff / s;
    const raw = tP2(t, df);
    let p;
    if (method === 'tukey') p = 1 - ptukey(Math.abs(t) * Math.SQRT2, k, df);
    else if (method === 'dunnett') p = 1 - pdunnett(Math.abs(t), lambdas, df);
    else if (method === 'sidak') p = 1 - (1 - raw) ** m;
    else if (method === 'bonferroni') p = Math.min(1, raw * m);
    else p = raw;
    return { i, j, diff, se: s, t, q: method === 'tukey' ? Math.abs(t) * Math.SQRT2 : null, pRaw: raw, p: Math.max(0, Math.min(1, p)), ciLow: diff - crit * s, ciHigh: diff + crit * s };
  });
}

/** Games-Howell : paires après une ANOVA de Welch (variances inégales). */
export function gamesHowell(groups, pairs) {
  const k = groups.length;
  const means = groups.map(mean);
  const vars = groups.map(variance);
  const ns = groups.map((g) => g.length);
  return (pairs ?? allPairs(k)).map(([i, j]) => {
    const a = vars[i] / ns[i];
    const b = vars[j] / ns[j];
    const se = Math.sqrt(a + b);
    const df = (a + b) ** 2 / (a * a / (ns[i] - 1) + b * b / (ns[j] - 1));
    const diff = means[j] - means[i];
    const q = (Math.abs(diff) / se) * Math.SQRT2;
    const crit = qtukey(0.95, k, df) / Math.SQRT2;
    return { i, j, diff, se, df, q, p: Math.max(0, Math.min(1, 1 - ptukey(q, k, df))), ciLow: diff - crit * se, ciHigh: diff + crit * se };
  });
}

/**
 * Test de Dunn après Kruskal-Wallis (ou Friedman) : écarts de rangs moyens, p multiplié par le
 * nombre de comparaisons (comme Prism).
 */
export function dunn(kw, ns, { pairs, control = null } = {}) {
  const k = ns.length;
  const list = control !== null && control !== undefined
    ? ns.map((_, i) => i).filter((i) => i !== control).map((i) => [control, i])
    : pairs ?? allPairs(k);
  const m = list.length;
  const N = kw.N;
  const base = (N * (N + 1)) / 12 - kw.ties / (12 * (N - 1));
  return list.map(([i, j]) => {
    const diff = kw.meanRanks[j] - kw.meanRanks[i];
    const z = diff / Math.sqrt(base * (1 / ns[i] + 1 / ns[j]));
    const raw = 2 * normSf(Math.abs(z));
    return { i, j, diff, z, pRaw: raw, p: Math.min(1, raw * m) };
  });
}

/** Dunn après Friedman : écarts de sommes de rangs. */
export function dunnFriedman(fr, { pairs, control = null } = {}) {
  const { k, n } = fr;
  const list = control !== null && control !== undefined
    ? Array.from({ length: k }, (_, i) => i).filter((i) => i !== control).map((i) => [control, i])
    : pairs ?? allPairs(k);
  const m = list.length;
  const se = Math.sqrt((n * k * (k + 1)) / 6);
  return list.map(([i, j]) => {
    const diff = fr.rankSums[j] - fr.rankSums[i];
    const z = diff / se;
    const raw = 2 * normSf(Math.abs(z));
    return { i, j, diff, z, pRaw: raw, p: Math.min(1, raw * m) };
  });
}
