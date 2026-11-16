// Moteur statistique : chaque résultat est comparé à scipy / statsmodels (test/make-stats-goldens.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chi2Sf, fSf, normInv, ptukey, qtukey, tCdf, tInv } from '../src/lib/stats/dist.js';
import { dagostino, describe, shapiroWilk } from '../src/lib/stats/core.js';
import {
  anova1, anovaRM, friedman, kruskalWallis, mannWhitney, multipleComparisons, tTest, tTestOne, tTestPaired, welchAnova, wilcoxon,
} from '../src/lib/stats/tests.js';
import { fitModel, linearRegression, pearson, spearman } from '../src/lib/stats/regression.js';
import { anova2 } from '../src/lib/stats/anova2.js';
import { chiSquare, fisherExact, twoByTwo } from '../src/lib/stats/contingency.js';
import { kaplanMeier, logRank } from '../src/lib/stats/survival.js';
import { mean, variance } from '../src/lib/stats/core.js';

const G = JSON.parse(readFileSync(new URL('./fixtures/stats/goldens.json', import.meta.url)));
/** Écart relatif (ou absolu sous 1e-12) inférieur à tol. */
const close = (got, exp, tol, what) => {
  const err = Math.abs(got - exp) / Math.max(Math.abs(exp), 1e-12);
  assert.ok(err <= tol || Math.abs(got - exp) < 1e-12, `${what} : ${got} au lieu de ${exp} (écart relatif ${err.toExponential(2)})`);
};

test('lois : Student, Fisher, χ², normale, étendue studentisée', () => {
  for (const [t, df, p] of G.dist.tcdf) close(tCdf(t, df), p, 1e-10, `tcdf(${t}, ${df})`);
  for (const [p, df, t] of G.dist.tinv) close(tInv(p, df), t, 1e-9, `tinv(${p}, ${df})`);
  for (const [f, a, b, p] of G.dist.fsf) close(fSf(f, a, b), p, 1e-10, `fsf(${f})`);
  for (const [x, k, p] of G.dist.chi2sf) close(chi2Sf(x, k), p, 1e-10, `chi2sf(${x})`);
  for (const [p, z] of G.dist.norminv) close(normInv(p), z, 1e-12, `norminv(${p})`);
  for (const [q, k, df, p] of G.dist.ptukey) close(ptukey(q, k, df), p, 1e-8, `ptukey(${q}, ${k}, ${df})`);
  for (const [p, k, df, q] of G.dist.qtukey) close(qtukey(p, k, df), q, 1e-7, `qtukey(${p}, ${k}, ${df})`);
});

test('statistiques descriptives (centiles à la façon de Prism)', () => {
  const d = describe(G.describe.data);
  close(d.mean, G.describe.mean, 1e-12, 'moyenne');
  close(d.sd, G.describe.sd, 1e-12, 'écart-type');
  close(d.sem, G.describe.sem, 1e-12, 'SEM');
  close(d.median, G.describe.median, 1e-12, 'médiane');
  close(d.q1, G.describe.q1, 1e-12, 'Q1');
  close(d.q3, G.describe.q3, 1e-12, 'Q3');
  close(d.skewness, G.describe.skew, 1e-10, 'asymétrie');
  close(d.kurtosis, G.describe.kurt, 1e-10, 'aplatissement');
  close(d.ciLow, G.describe.ci[0], 1e-10, 'IC bas');
  close(d.ciHigh, G.describe.ci[1], 1e-10, 'IC haut');
});

test('normalité : Shapiro-Wilk (n = 3 à 50) et D’Agostino-Pearson', () => {
  for (const s of G.shapiro) {
    const r = shapiroWilk(s.data);
    close(r.w, s.w, 1e-6, `W (n = ${s.data.length})`);
    close(r.p, s.p, 1e-5, `p (n = ${s.data.length})`);
  }
  for (const s of G.normaltest) {
    const r = dagostino(s.data);
    close(r.k2, s.k2, 1e-9, 'K²');
    close(r.p, s.p, 1e-9, 'p');
  }
});

test('tests t : Student, Welch, apparié, un échantillon', () => {
  const T = G.ttest;
  const s = tTest(T.a, T.b);
  close(-s.t, T.student.t, 1e-10, 't Student');
  close(s.p, T.student.p, 1e-9, 'p Student');
  close(-s.ciHigh, T.student.ci[0], 1e-9, 'IC Student');
  const w = tTest(T.a, T.b, { welch: true });
  close(-w.t, T.welch.t, 1e-10, 't Welch');
  close(w.df, T.welch.df, 1e-10, 'ddl Welch');
  close(w.p, T.welch.p, 1e-9, 'p Welch');
  close(-w.ciLow, T.welch.ci[1], 1e-9, 'IC Welch');
  const p = tTestPaired(T.before, T.after);
  close(-p.t, T.paired.t, 1e-10, 't apparié');
  close(p.p, T.paired.p, 1e-9, 'p apparié');
  close(-p.ciHigh, T.paired.ci[0], 1e-9, 'IC apparié');
  const o = tTestOne(T.a, 9);
  close(o.t, T.one.t, 1e-10, 't un échantillon');
  close(o.p, T.one.p, 1e-9, 'p un échantillon');
  close(o.ciLow + 9, T.one.ci[0], 1e-9, 'IC un échantillon');
});

test('non paramétriques : Mann-Whitney (exact, ex æquo, n = 45) et Wilcoxon (exact, ex æquo)', () => {
  const [small, tied, big] = G.mannwhitney;
  const a = mannWhitney(small.a, small.b);
  assert.equal(a.exact, true);
  close(a.p, small.p, 1e-10, 'p exact');
  close(Math.max(a.u1, a.u2) === small.u ? small.u : a.u1, small.u, 1e-12, 'U');
  const b = mannWhitney(tied.a, tied.b);
  assert.equal(b.exact, false);
  close(b.p, tied.p, 1e-10, 'p avec ex æquo');
  close(mannWhitney(big.a, big.b).p, big.p, 1e-9, 'p exact, 45 valeurs');
  const [ex, ti] = G.wilcoxon;
  const w1 = wilcoxon(ex.d);
  assert.equal(w1.exact, true);
  close(w1.p, ex.p, 1e-10, 'Wilcoxon exact');
  const w2 = wilcoxon(ti.d);
  assert.equal(w2.exact, false);
  close(w2.p, ti.p, 1e-10, 'Wilcoxon avec ex æquo et zéro');
});

test('ANOVA à un facteur, variances, Welch, Kruskal-Wallis', () => {
  const A = G.anova1;
  const r = anova1(A.groups);
  close(r.F, A.F, 1e-10, 'F');
  close(r.p, A.p, 1e-9, 'p');
  close(r.brownForsythe.p, A.levene, 1e-9, 'Brown-Forsythe');
  close(r.bartlett.p, A.bartlett, 1e-9, 'Bartlett');
  const w = welchAnova(A.groups);
  close(w.F, A.welch.F, 1e-10, 'F de Welch');
  close(w.dfw, A.welch.df2, 1e-10, 'ddl de Welch');
  close(w.p, A.welch.p, 1e-9, 'p de Welch');
  const kw = kruskalWallis(A.groups);
  close(kw.H, A.kruskal.H, 1e-10, 'H');
  close(kw.p, A.kruskal.p, 1e-9, 'p Kruskal-Wallis');
});

test('comparaisons multiples : Tukey et Dunnett (IC compris)', () => {
  const A = G.anova1;
  const r = anova1(A.groups);
  const stats = { means: A.groups.map(mean), ns: A.groups.map((g) => g.length), mse: r.msw, df: r.dfw };
  for (const c of multipleComparisons(stats, { method: 'tukey' })) {
    close(c.p, A.tukey.p[c.i][c.j], 2e-6, `Tukey p ${c.i}-${c.j}`);
    // scipy : IC de moyenne i − moyenne j ; ici moyenne j − moyenne i
    close(c.ciLow, -A.tukey.hi[c.i][c.j], 1e-6, `Tukey IC ${c.i}-${c.j}`);
  }
  multipleComparisons(stats, { method: 'dunnett', control: 0 }).forEach((c, k) => {
    // scipy intègre la loi multivariée par Monte-Carlo quasi aléatoire : quelques 1e-4 d'écart
    assert.ok(Math.abs(c.p - A.dunnett.p[k]) < 2e-3, `Dunnett p ${k} : ${c.p} au lieu de ${A.dunnett.p[k]}`);
    assert.ok(Math.abs(c.ciLow - A.dunnett.lo[k]) < 2e-2 * Math.max(1, Math.abs(A.dunnett.lo[k])), `Dunnett IC ${k}`);
  });
});

test('mesures répétées : ANOVA (ε de Geisser-Greenhouse) et Friedman', () => {
  const R = G.rm;
  const r = anovaRM(R.matrix);
  close(r.F, R.F, 1e-10, 'F');
  close(r.p, R.p, 1e-9, 'p');
  close(r.epsilon, R.epsilon, 1e-10, 'ε');
  const f = friedman(R.matrix);
  close(f.Q, R.friedman.Q, 1e-10, 'Q de Friedman');
  close(f.p, R.friedman.p, 1e-9, 'p de Friedman');
});

test('régression linéaire et corrélations', () => {
  const L = G.linear;
  const r = linearRegression(L.x, L.y);
  close(r.slope, L.slope, 1e-12, 'pente');
  close(r.intercept, L.intercept, 1e-12, 'ordonnée à l’origine');
  close(r.seSlope, L.seSlope, 1e-10, 'SE pente');
  close(r.seIntercept, L.seIntercept, 1e-10, 'SE ordonnée');
  close(r.p, L.p, 1e-8, 'p pente');
  close(Math.sqrt(r.r2), L.r, 1e-12, 'r');
  const p = pearson(L.x, L.y);
  close(p.ci[0], L.pearsonCi[0], 1e-9, 'IC de r');
  const s = spearman(L.x, L.y);
  close(s.rho, L.spearman.rho, 1e-12, 'rho');
  close(s.p, L.spearman.p, 1e-9, 'p Spearman');
});

test('régression non linéaire : dose-réponse 4PL, Michaelis-Menten, décroissance', () => {
  for (const g of G.nonlinear) {
    const r = fitModel(g.model, g.x, g.y);
    assert.ok(r.converged, `${g.model} a convergé`);
    g.params.forEach((v, j) => close(r.params[j], v, 1e-5, `${g.model} paramètre ${j}`));
    g.se.forEach((v, j) => close(r.se[j], v, 2e-4, `${g.model} SE ${j}`));
  }
});

test('ANOVA à deux facteurs, type III (équilibrée et déséquilibrée)', () => {
  for (const g of G.anova2) {
    const r = anova2(g.cells);
    close(r.mse, g.mse, 1e-10, 'carré moyen résiduel');
    assert.equal(r.dfE, g.dfE);
    for (const k of ['rows', 'columns', 'interaction']) {
      close(r[k].F, g[k].F, 1e-8, `F ${k}`);
      close(r[k].p, g[k].p, 1e-8, `p ${k}`);
    }
  }
});

test('contingence : χ² (avec et sans Yates), Fisher, rapport de cotes, risque relatif', () => {
  const C = G.contingency;
  close(chiSquare(C.t22, { yates: true }).p, C.chi22_yates, 1e-10, 'χ² Yates');
  close(chiSquare(C.t22).p, C.chi22, 1e-10, 'χ² 2 × 2');
  close(chiSquare(C.t23).p, C.chi23, 1e-10, 'χ² 2 × 3');
  close(fisherExact(C.t22).p, C.fisher, 1e-10, 'Fisher');
  const t = twoByTwo(C.t22);
  close(t.or, C.or, 1e-12, 'OR');
  close(t.orCi[0], C.orCi[0], 1e-9, 'IC OR');
  close(t.rr, C.rr, 1e-12, 'RR');
  close(t.rrCi[1], C.rrCi[1], 1e-9, 'IC RR');
});

test('survie : Kaplan-Meier (Greenwood), log-rank à 2 et 3 groupes, Gehan-Breslow', () => {
  const S = G.survival;
  const km = kaplanMeier(S.g1.times, S.g1.events);
  const steps = km.steps.filter((s) => s.events > 0);
  S.km1.times.forEach((t, i) => {
    assert.equal(steps[i].t, t);
    close(steps[i].s, S.km1.prob[i], 1e-12, `S(${t})`);
    close(steps[i].se, S.km1.se[i], 1e-10, `SE(${t})`);
  });
  const two = logRank([S.g1, S.g2]);
  close(two.chi2, S.logrank2.chi2, 1e-9, 'χ² log-rank');
  close(two.p, S.logrank2.p, 1e-9, 'p log-rank');
  const three = logRank([S.g1, S.g2, S.g3]);
  close(three.chi2, S.logrank3.chi2, 1e-9, 'χ² log-rank à 3 groupes');
  close(three.p, S.logrank3.p, 1e-9, 'p log-rank à 3 groupes');
  const gb = logRank([S.g1, S.g2], { weight: 'gehan' });
  close(gb.chi2, S.gehan2.chi2, 1e-9, 'χ² Gehan-Breslow');
});

test('garde-fous : variance d’une seule valeur, ajustement impossible', () => {
  assert.ok(Number.isNaN(variance([3])));
  assert.match(fitModel('dose4', [1, 2, 3], [1, 2, 3]).error, /plus de 4 points/);
});
