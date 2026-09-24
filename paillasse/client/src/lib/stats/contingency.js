// Tableaux de contingence : χ² d'indépendance, test exact de Fisher (2 × 2), risque relatif, rapport de cotes.

import { chi2Sf, lgamma, normInv } from './dist.js';

/** χ² de Pearson (correction de Yates possible pour un tableau 2 × 2). */
export function chiSquare(table, { yates = false } = {}) {
  const r = table.length;
  const c = table[0].length;
  const rowT = table.map((row) => row.reduce((a, b) => a + b, 0));
  const colT = table[0].map((_, j) => table.reduce((a, row) => a + row[j], 0));
  const N = rowT.reduce((a, b) => a + b, 0);
  const expected = table.map((row, i) => row.map((_, j) => (rowT[i] * colT[j]) / N));
  let chi2 = 0;
  const correct = yates && r === 2 && c === 2;
  for (let i = 0; i < r; i += 1) {
    for (let j = 0; j < c; j += 1) {
      const e = expected[i][j];
      if (e === 0) continue;
      const d = Math.abs(table[i][j] - e);
      const dd = correct ? Math.max(0, d - 0.5) : d;
      chi2 += (dd * dd) / e;
    }
  }
  const df = (r - 1) * (c - 1);
  const small = expected.flat().filter((e) => e < 5).length;
  return { chi2, df, p: chi2Sf(chi2, df), expected, N, yates: correct, smallExpected: small, cells: r * c };
}

const lfact = (n) => lgamma(n + 1);

/** Test exact de Fisher, 2 × 2 : p bilatéral = somme des tableaux aussi ou moins probables. */
export function fisherExact([[a, b], [c, d]]) {
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const N = r1 + r2;
  const base = lfact(r1) + lfact(r2) + lfact(c1) + lfact(N - c1) - lfact(N);
  const prob = (x) => Math.exp(base - lfact(x) - lfact(r1 - x) - lfact(c1 - x) - lfact(r2 - c1 + x));
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(r1, c1);
  const pObs = prob(a);
  let two = 0;
  let less = 0;
  let greater = 0;
  for (let x = lo; x <= hi; x += 1) {
    const p = prob(x);
    if (p <= pObs * (1 + 1e-7)) two += p;
    if (x <= a) less += p;
    if (x >= a) greater += p;
  }
  return { p: Math.min(1, two), pLess: Math.min(1, less), pGreater: Math.min(1, greater) };
}

/**
 * Risque relatif (lignes = groupes, 1re colonne = événement) et rapport de cotes, IC à 95 %
 * par les méthodes logarithmiques (Katz, Woolf) ; 0,5 ajouté aux cases si l'une est nulle.
 */
export function twoByTwo([[a0, b0], [c0, d0]]) {
  const zero = [a0, b0, c0, d0].some((v) => v === 0);
  const [a, b, c, d] = zero ? [a0 + 0.5, b0 + 0.5, c0 + 0.5, d0 + 0.5] : [a0, b0, c0, d0];
  const z = normInv(0.975);
  const rr = (a / (a + b)) / (c / (c + d));
  const seRr = Math.sqrt(b / (a * (a + b)) + d / (c * (c + d)));
  const or = (a * d) / (b * c);
  const seOr = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  const p1 = a0 / (a0 + b0);
  const p2 = c0 / (c0 + d0);
  return {
    rr, rrCi: [rr * Math.exp(-z * seRr), rr * Math.exp(z * seRr)],
    or, orCi: [or * Math.exp(-z * seOr), or * Math.exp(z * seOr)],
    p1, p2, diff: p1 - p2, corrected: zero,
  };
}
