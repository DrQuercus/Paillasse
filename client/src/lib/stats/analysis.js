// Analyse d'un jeu de données : choix du test, calcul, résultats présentés comme dans Prism
// (sections de libellés et valeurs, tableaux), comparaisons pour les étoiles du graphique,
// courbes ajustées et courbes de survie pour le tracé.

import { formatNumber } from '../calc/units.js';
import { describe, dagostino, mean, shapiroWilk } from './core.js';
import {
  anova1, anovaRM, dunn, dunnFriedman, friedman, gamesHowell, kruskalWallis, mannWhitney, multipleComparisons,
  tTest, tTestOne, tTestPaired, welchAnova, wilcoxon,
} from './tests.js';
import { MODELS, fitModel, linearRegression, pearson, spearman } from './regression.js';
import { anova2, anova2Comparisons } from './anova2.js';
import { chiSquare, fisherExact, twoByTwo } from './contingency.js';
import { kaplanMeier, logRank } from './survival.js';
import {
  KINDS, columnValues, filledColumns, groupedCells, num, pairedMatrix, survivalGroups, xyPoints,
} from './model.js';

// --- Mise en forme -------------------------------------------------------------------------------------------

export const f4 = (v) => formatNumber(v, 4);
export const pText = (p) => (!Number.isFinite(p) ? '—' : p < 0.0001 ? '< 0,0001' : p > 0.9999 ? '> 0,9999' : p.toFixed(4).replace('.', ','));
export const pEq = (p) => (p < 0.0001 ? 'P < 0,0001' : `P = ${pText(p)}`);

/** Étoiles : seuils classiques (0,05 / 0,01 / 0,001 / 0,0001) ou ceux de Prism (« GP »). */
export function stars(p, style = 'classic') {
  if (!Number.isFinite(p)) return '';
  if (style === 'gp') return p < 0.0001 ? '****' : p <= 0.0002 ? '***' : p <= 0.0021 ? '**' : p <= 0.0332 ? '*' : 'ns';
  return p < 0.0001 ? '****' : p < 0.001 ? '***' : p < 0.01 ? '**' : p < 0.05 ? '*' : 'ns';
}
const yesNo = (p) => (p < 0.05 ? 'Oui' : 'Non');
const ci = (lo, hi) => `${f4(lo)} à ${f4(hi)}`;

export const ANALYSES = {
  column: {
    auto: 'Automatique (selon le nombre de colonnes)',
    describe: 'Statistiques descriptives et normalité',
    compare2: 'Comparer deux colonnes (test t, Mann-Whitney…)',
    compareN: 'Comparer trois colonnes ou plus (ANOVA…)',
    onesample: 'Comparer à une valeur théorique',
  },
  xy: {
    linear: 'Régression linéaire',
    nonlinear: 'Régression non linéaire (ajustement de courbe)',
    correlation: 'Corrélation',
  },
  grouped: { anova2: 'ANOVA à deux facteurs' },
  contingency: { contingency: 'Tableau de contingence (χ², Fisher)' },
  survival: { survival: 'Survie (Kaplan-Meier, log-rank)' },
};

export const POSTHOC = {
  tukey: 'Tukey (toutes les paires)',
  dunnett: 'Dunnett (contre un témoin)',
  sidak: 'Šidák (toutes les paires)',
  bonferroni: 'Bonferroni (toutes les paires)',
  fisher: 'Sans correction (LSD de Fisher)',
  none: 'Aucune comparaison',
};

/** Type d'analyse effectif (« automatique » selon le nombre de colonnes remplies). */
export function resolvedType(ds) {
  const t = ds.analysis.type;
  if (ds.kind !== 'column' || t !== 'auto') return t;
  const n = filledColumns(ds).length;
  return n >= 3 ? 'compareN' : n === 2 ? 'compare2' : 'describe';
}

/** Lance l'analyse choisie. Renvoie { title, method, sections, comparisons, fits, km, warnings } ou { error }. */
export function analyze(ds) {
  try {
    const type = resolvedType(ds);
    const fn = RUNNERS[type];
    if (!fn) return { error: 'Analyse inconnue.' };
    const res = fn(ds);
    return { type, title: ANALYSES[ds.kind]?.[type] ?? type, warnings: [], comparisons: [], ...res };
  } catch (err) {
    return { error: `Calcul impossible : ${err.message}` };
  }
}

// --- Colonnes ---------------------------------------------------------------------------------------------------

function describeRun(ds) {
  const cols = filledColumns(ds);
  if (!cols.length) return { error: 'Saisissez des valeurs dans au moins une colonne.' };
  const d = cols.map((c) => describe(columnValues(ds, c.id)));
  const sw = cols.map((c) => shapiroWilk(columnValues(ds, c.id)));
  const dk = cols.map((c) => dagostino(columnValues(ds, c.id)));
  const line = (label, fn) => [label, ...d.map((x, i) => fn(x, i))];
  return {
    method: 'Statistiques descriptives ; normalité par les tests de Shapiro-Wilk et de D’Agostino-Pearson.',
    sections: [
      {
        title: 'Statistiques descriptives',
        table: {
          columns: ['', ...cols.map((c) => c.name)],
          rows: [
            line('Nombre de valeurs', (x) => String(x.n)),
            line('Moyenne', (x) => f4(x.mean)),
            line('Écart-type', (x) => f4(x.sd)),
            line('Erreur type (SEM)', (x) => f4(x.sem)),
            line('IC 95 % de la moyenne', (x) => (x.n > 1 ? ci(x.ciLow, x.ciHigh) : '—')),
            line('Minimum', (x) => f4(x.min)),
            line('25e centile', (x) => f4(x.q1)),
            line('Médiane', (x) => f4(x.median)),
            line('75e centile', (x) => f4(x.q3)),
            line('Maximum', (x) => f4(x.max)),
            line('Coefficient de variation', (x) => (Number.isFinite(x.cv) ? `${formatNumber(x.cv, 3)} %` : '—')),
            line('Moyenne géométrique', (x) => f4(x.geomean)),
            line('Asymétrie', (x) => f4(x.skewness)),
            line('Aplatissement', (x) => f4(x.kurtosis)),
          ],
        },
      },
      {
        title: 'Normalité',
        table: {
          columns: ['', ...cols.map((c) => c.name)],
          rows: [
            ['Shapiro-Wilk : W', ...sw.map((s) => (s ? f4(s.w) : 'n < 3'))],
            ['Shapiro-Wilk : P', ...sw.map((s) => (s ? pText(s.p) : '—'))],
            ['Distribution normale (α = 0,05) ?', ...sw.map((s) => (s ? (s.p >= 0.05 ? 'Oui' : 'Non') : '—'))],
            ['D’Agostino-Pearson : K²', ...dk.map((s) => (s ? f4(s.k2) : 'n < 8'))],
            ['D’Agostino-Pearson : P', ...dk.map((s) => (s ? pText(s.p) : '—'))],
          ],
        },
      },
    ],
  };
}

function pickColumns(ds, count) {
  const filled = filledColumns(ds);
  const chosen = (ds.analysis.cols ?? []).map((id) => filled.find((c) => c.id === id)).filter(Boolean);
  return chosen.length >= Math.min(count, 2) ? chosen : filled;
}

function compare2Run(ds) {
  const cols = pickColumns(ds, 2).slice(0, 2);
  if (cols.length < 2) return { error: 'Il faut deux colonnes remplies.' };
  const [A, B] = cols;
  const { paired, parametric, welch } = ds.analysis;
  const a = columnValues(ds, A.id);
  const b = columnValues(ds, B.id);
  const warnings = [];
  let sections;
  let p;
  let method;
  if (paired) {
    const m = pairedMatrix(ds, [A.id, B.id]);
    if (m.length < 3) return { error: 'Il faut au moins trois lignes complètes (paires).' };
    const x = m.map((r) => r[0]);
    const y = m.map((r) => r[1]);
    if (m.length < Math.max(a.length, b.length)) warnings.push('Lignes incomplètes ignorées : chaque paire doit avoir ses deux valeurs.');
    if (parametric) {
      const r = tTestPaired(x, y);
      p = r.p;
      method = 'Test t apparié (bilatéral).';
      sections = [
        { title: 'Test t apparié', rows: [['Valeur de P', pText(r.p)], ['Résumé', stars(r.p)], ['Différence significative (P < 0,05) ?', yesNo(r.p)], ['t, ddl', `t = ${f4(Math.abs(r.t))}, ddl = ${r.df}`], ['Nombre de paires', String(m.length)]] },
        { title: 'Ampleur de la différence', rows: [[`Moyenne des différences (${B.name} − ${A.name})`, f4(r.diff)], ['Erreur type', f4(r.se)], ['IC 95 %', ci(r.ciLow, r.ciHigh)], ['R²', f4(r.r2)]] },
        { title: 'Efficacité de l’appariement', rows: [['Coefficient de corrélation r', f4(r.pairing)]] },
      ];
    } else {
      const r = wilcoxon(y.map((v, i) => v - x[i]));
      p = r.p;
      method = `Test des rangs signés de Wilcoxon (bilatéral, ${r.exact ? 'P exact' : 'approximation normale'}).`;
      sections = [
        { title: 'Test de Wilcoxon', rows: [['Valeur de P', pText(r.p)], ['P exact ou approché', r.exact ? 'Exact' : 'Approché'], ['Résumé', stars(r.p)], ['Différence significative (P < 0,05) ?', yesNo(r.p)], ['Somme des rangs positifs, négatifs', `${f4(r.wPlus)}, ${f4(-r.wMinus)}`], ['Paires, dont différences nulles', `${m.length}, ${r.zeros}`]] },
        { title: 'Ampleur de la différence', rows: [[`Médiane des différences (${B.name} − ${A.name})`, f4(r.median)]] },
      ];
    }
  } else if (parametric) {
    const r = tTest(a, b, { welch });
    p = r.p;
    method = welch ? 'Test t de Welch (variances inégales, bilatéral).' : 'Test t de Student non apparié (bilatéral).';
    if (!welch && r.fTest.p < 0.05) warnings.push('Les variances diffèrent (test F, P < 0,05) : le test de Welch est plus sûr.');
    sections = [
      { title: welch ? 'Test t de Welch' : 'Test t non apparié', rows: [['Valeur de P', pText(r.p)], ['Résumé', stars(r.p)], ['Différence significative (P < 0,05) ?', yesNo(r.p)], ['t, ddl', `t = ${f4(Math.abs(r.t))}, ddl = ${f4(r.df)}`]] },
      { title: 'Ampleur de la différence', rows: [[`Moyenne de ${A.name}`, f4(mean(a))], [`Moyenne de ${B.name}`, f4(mean(b))], [`Différence (${B.name} − ${A.name})`, `${f4(r.diff)} ± ${f4(r.se)}`], ['IC 95 % de la différence', ci(r.ciLow, r.ciHigh)], ['R² (taille d’effet)', f4(r.r2)]] },
      { title: 'Comparaison des variances', rows: [['F, ddl', `F = ${f4(r.fTest.f)}, ddl = ${r.fTest.df1}, ${r.fTest.df2}`], ['Valeur de P', pText(r.fTest.p)], ['Variances différentes (P < 0,05) ?', yesNo(r.fTest.p)]] },
    ];
  } else {
    const r = mannWhitney(a, b);
    p = r.p;
    method = `Test de Mann-Whitney (bilatéral, ${r.exact ? 'P exact' : 'approximation normale'}).`;
    sections = [
      { title: 'Test de Mann-Whitney', rows: [['Valeur de P', pText(r.p)], ['P exact ou approché', r.exact ? 'Exact' : 'Approché'], ['Résumé', stars(r.p)], ['Différence significative (P < 0,05) ?', yesNo(r.p)], [`Somme des rangs : ${A.name}, ${B.name}`, `${f4(r.sumRanks[0])}, ${f4(r.sumRanks[1])}`], ['U de Mann-Whitney', f4(r.u)]] },
      { title: 'Ampleur de la différence', rows: [[`Médiane de ${A.name}`, f4(r.medianA)], [`Médiane de ${B.name}`, f4(r.medianB)], ['Différence des médianes', f4(r.diff)]] },
    ];
  }
  const n = cols.map((c) => columnValues(ds, c.id).length);
  if (Math.min(...n) < 3) warnings.push('Moins de trois valeurs dans une colonne : le test a très peu de puissance.');
  return { method, sections, comparisons: [{ a: A.id, b: B.id, p }], warnings };
}

function compareNRun(ds) {
  const cols = pickColumns(ds, 3);
  if (cols.length < 2) return { error: 'Il faut au moins deux colonnes remplies.' };
  const { paired, parametric, welch, posthoc } = ds.analysis;
  const control = cols.findIndex((c) => c.id === ds.analysis.control) >= 0 ? cols.findIndex((c) => c.id === ds.analysis.control) : 0;
  const names = cols.map((c) => c.name);
  const groups = cols.map((c) => columnValues(ds, c.id));
  const warnings = [];
  let sections;
  let comps = [];
  let method;
  const compTable = (list, withCi = true) => ({
    title: 'Comparaisons multiples',
    table: {
      columns: ['Comparaison', 'Différence', ...(withCi ? ['IC 95 %'] : []), 'P ajusté', 'Résumé'],
      // Convention de Prism : « A vs B », différence = A − B
      rows: list.map((c) => [`${names[c.i]} vs ${names[c.j]}`, f4(-c.diff), ...(withCi ? [ci(-c.ciHigh, -c.ciLow)] : []), pText(c.p), stars(c.p)]),
    },
  });
  if (paired) {
    const m = pairedMatrix(ds, cols.map((c) => c.id));
    if (m.length < 3) return { error: 'Mesures répétées : il faut au moins trois lignes complètes.' };
    if (m.length < Math.max(...groups.map((g) => g.length))) warnings.push('Lignes incomplètes ignorées (mesures répétées).');
    if (parametric) {
      const r = anovaRM(m);
      method = 'ANOVA à mesures répétées, correction de Geisser-Greenhouse.';
      sections = [
        { title: 'ANOVA à mesures répétées', rows: [['Valeur de P (Geisser-Greenhouse)', pText(r.pGG)], ['Résumé', stars(r.pGG)], ['Moyennes significativement différentes (P < 0,05) ?', yesNo(r.pGG)], ['F, ddl', `F = ${f4(r.F)}, ddl = ${f4(r.df1 * r.epsilon)}, ${f4(r.df2 * r.epsilon)}`], ['ε de Geisser-Greenhouse', f4(r.epsilon)], ['P sans correction', pText(r.p)], ['R²', f4(r.r2)]] },
        { title: 'Efficacité de l’appariement', rows: [['F, ddl', `F = ${f4(r.matching.F)}, ddl = ${r.matching.df1}, ${r.matching.df2}`], ['Valeur de P', pText(r.matching.p)]] },
      ];
      if (posthoc !== 'none') {
        comps = multipleComparisons({ means: cols.map((_, j) => mean(m.map((row) => row[j]))), ns: cols.map(() => m.length), mse: r.msErr, df: r.df2 }, { method: posthoc, control });
        sections.push(compTable(comps));
      }
    } else {
      const r = friedman(m);
      method = 'Test de Friedman ; comparaisons de Dunn.';
      sections = [{ title: 'Test de Friedman', rows: [['Valeur de P', pText(r.p)], ['Résumé', stars(r.p)], ['Médianes significativement différentes (P < 0,05) ?', yesNo(r.p)], ['Statistique de Friedman', f4(r.Q)], ['Nombre de lignes', String(r.n)]] }];
      if (posthoc !== 'none') {
        comps = dunnFriedman(r, { control: posthoc === 'dunnett' ? control : null });
        sections.push({ title: 'Comparaisons de Dunn', table: { columns: ['Comparaison', 'Écart des sommes de rangs', 'P ajusté', 'Résumé'], rows: comps.map((c) => [`${names[c.i]} vs ${names[c.j]}`, f4(-c.diff), pText(c.p), stars(c.p)]) } });
      }
    }
  } else if (parametric) {
    const r = anova1(groups);
    if (welch) {
      const w = welchAnova(groups);
      method = 'ANOVA de Welch (variances inégales) ; comparaisons de Games-Howell.';
      sections = [{ title: 'ANOVA de Welch', rows: [['Valeur de P', pText(w.p)], ['Résumé', stars(w.p)], ['Moyennes significativement différentes (P < 0,05) ?', yesNo(w.p)], ['F de Welch, ddl', `F = ${f4(w.F)}, ddl = ${w.dfb}, ${f4(w.dfw)}`]] }];
      if (posthoc !== 'none') {
        comps = gamesHowell(groups);
        sections.push(compTable(comps));
      }
    } else {
      method = `ANOVA ordinaire à un facteur${posthoc !== 'none' ? ` ; comparaisons multiples : ${POSTHOC[posthoc].split(' (')[0]}` : ''}.`;
      sections = [
        { title: 'ANOVA', rows: [['Valeur de P', pText(r.p)], ['Résumé', stars(r.p)], ['Moyennes significativement différentes (P < 0,05) ?', yesNo(r.p)], ['F, ddl', `F = ${f4(r.F)}, ddl = ${r.dfb}, ${r.dfw}`], ['R²', f4(r.r2)]] },
        {
          title: 'Table de l’ANOVA',
          table: {
            columns: ['Source', 'SC', 'ddl', 'CM', 'F, P'],
            rows: [
              ['Traitement (entre colonnes)', f4(r.ssb), String(r.dfb), f4(r.msb), `F = ${f4(r.F)} ; ${pEq(r.p)}`],
              ['Résidus (dans les colonnes)', f4(r.ssw), String(r.dfw), f4(r.msw), ''],
              ['Total', f4(r.sst), String(r.dfb + r.dfw), '', ''],
            ],
          },
        },
        { title: 'Égalité des écarts-types', rows: [['Brown-Forsythe : F, P', `F = ${f4(r.brownForsythe.F)} ; ${pEq(r.brownForsythe.p)}`], ['Bartlett : χ², P', `${f4(r.bartlett.stat)} ; ${pEq(r.bartlett.p)}`]] },
      ];
      if (r.brownForsythe.p < 0.05) warnings.push('Les écarts-types diffèrent (Brown-Forsythe, P < 0,05) : envisagez l’ANOVA de Welch.');
      if (posthoc !== 'none') {
        comps = multipleComparisons({ means: groups.map(mean), ns: groups.map((g) => g.length), mse: r.msw, df: r.dfw }, { method: posthoc, control });
        sections.push(compTable(comps));
      }
    }
  } else {
    const r = kruskalWallis(groups);
    method = 'Test de Kruskal-Wallis ; comparaisons de Dunn.';
    sections = [{ title: 'Test de Kruskal-Wallis', rows: [['Valeur de P', pText(r.p)], ['Résumé', stars(r.p)], ['Médianes significativement différentes (P < 0,05) ?', yesNo(r.p)], ['Statistique de Kruskal-Wallis (H)', f4(r.H)], ['Rangs moyens', r.meanRanks.map((m, i) => `${names[i]} : ${f4(m)}`).join(' ; ')]] }];
    if (posthoc !== 'none') {
      comps = dunn(r, groups.map((g) => g.length), { control: posthoc === 'dunnett' ? control : null });
      sections.push({ title: 'Comparaisons de Dunn', table: { columns: ['Comparaison', 'Écart des rangs moyens', 'P ajusté', 'Résumé'], rows: comps.map((c) => [`${names[c.i]} vs ${names[c.j]}`, f4(-c.diff), pText(c.p), stars(c.p)]) } });
    }
  }
  if (Math.min(...groups.map((g) => g.length)) < 2) return { error: 'Chaque colonne doit contenir au moins deux valeurs.' };
  return { method, sections, comparisons: comps.map((c) => ({ a: cols[c.i].id, b: cols[c.j].id, p: c.p })), warnings };
}

function oneSampleRun(ds) {
  const mu = num(ds.analysis.hypothetical);
  if (!Number.isFinite(mu)) return { error: 'Indiquez la valeur théorique.' };
  const cols = filledColumns(ds);
  if (!cols.length) return { error: 'Saisissez des valeurs.' };
  const rows = cols.map((c) => {
    const v = columnValues(ds, c.id);
    if (ds.analysis.parametric) {
      const r = tTestOne(v, mu);
      return [c.name, f4(r.mean), `${f4(r.diff)} (${ci(r.ciLow, r.ciHigh)})`, `t = ${f4(Math.abs(r.t))}, ddl = ${r.df}`, pText(r.p), stars(r.p)];
    }
    const r = wilcoxon(v.map((x) => x - mu));
    return [c.name, f4(r.median + mu), f4(r.median), `W+ = ${f4(r.wPlus)}`, pText(r.p), stars(r.p)];
  });
  return {
    method: `${ds.analysis.parametric ? 'Test t sur un échantillon' : 'Test des rangs signés de Wilcoxon'}, valeur théorique ${f4(mu)} (bilatéral).`,
    sections: [{
      title: `Comparaison à ${f4(mu)}`,
      table: { columns: ['Colonne', ds.analysis.parametric ? 'Moyenne' : 'Médiane', ds.analysis.parametric ? 'Écart (IC 95 %)' : 'Écart', 'Statistique', 'P', 'Résumé'], rows },
    }],
  };
}

// --- XY -------------------------------------------------------------------------------------------------------

const series = (ds) => ds.columns.map((c) => ({ col: c, pts: xyPoints(ds, c.id) })).filter((s) => s.pts.length);
const unknownsOf = (ds) => String(ds.analysis.unknowns ?? '').split(/[;\s]+/).map(num).filter(Number.isFinite);

function linearRun(ds) {
  const all = series(ds);
  if (!all.length) return { error: 'Saisissez des X et des Y.' };
  const fits = [];
  const table = [];
  const interp = [];
  const unknowns = unknownsOf(ds);
  for (const { col, pts } of all) {
    if (pts.length < 3) continue;
    const r = linearRegression(pts.map((p) => p[0]), pts.map((p) => p[1]));
    fits.push({ colId: col.id, predict: r.predict, band: r.band, logX: false });
    table.push([col.name, `${f4(r.slope)} ± ${f4(r.seSlope)}`, ci(r.slopeCi[0], r.slopeCi[1]), `${f4(r.intercept)} ± ${f4(r.seIntercept)}`, f4(r.r2), pText(r.p), stars(r.p), f4(r.syx)]);
    for (const y of unknowns) interp.push([col.name, f4(y), f4(r.inverse(y))]);
  }
  if (!fits.length) return { error: 'Il faut au moins trois points par série.' };
  const sections = [
    { title: 'Ajustement (moindres carrés)', table: { columns: ['Série', 'Pente ± SE', 'IC 95 % de la pente', 'Ordonnée à l’origine ± SE', 'R²', 'P (pente ≠ 0)', 'Résumé', 'Sy.x'], rows: table } },
  ];
  if (interp.length) sections.push({ title: 'Inconnues lues sur la droite', table: { columns: ['Série', 'Y mesuré', 'X interpolé'], rows: interp } });
  return { method: 'Régression linéaire par moindres carrés ; chaque réplicat compte comme un point.', sections, fits };
}

function correlationRun(ds) {
  const all = series(ds);
  const spear = ds.analysis.correlation === 'spearman';
  const rows = all.filter((s) => s.pts.length >= 3).map(({ col, pts }) => {
    const x = pts.map((p) => p[0]);
    const y = pts.map((p) => p[1]);
    if (spear) { const r = spearman(x, y); return [col.name, f4(r.rho), '—', String(r.n), pText(r.p), stars(r.p)]; }
    const r = pearson(x, y);
    return [col.name, f4(r.r), ci(r.ci[0], r.ci[1]), String(r.n), pText(r.p), stars(r.p)];
  });
  if (!rows.length) return { error: 'Il faut au moins trois points (X, Y).' };
  return {
    method: spear ? 'Corrélation de Spearman (rangs), P bilatéral.' : 'Corrélation de Pearson, IC 95 % par la transformation de Fisher, P bilatéral.',
    sections: [{ title: 'Corrélation', table: { columns: ['Série', spear ? 'ρ de Spearman' : 'r de Pearson', 'IC 95 %', 'Paires', 'P', 'Résumé'], rows } }],
  };
}

/** Faut-il passer X en log10 pour un modèle dose-réponse ? (concentrations positives, sur plusieurs décades) */
export function logXApplied(ds) {
  const model = MODELS[ds.analysis.model];
  if (!model?.logX) return false;
  if (ds.analysis.logX === 'yes') return true;
  if (ds.analysis.logX === 'no') return false;
  const xs = ds.rows.map((r) => num(r.x)).filter(Number.isFinite);
  return xs.length > 1 && xs.every((x) => x > 0) && Math.max(...xs) / Math.min(...xs) >= 50;
}

function nonlinearRun(ds) {
  const model = MODELS[ds.analysis.model];
  if (!model) return { error: 'Choisissez un modèle.' };
  const logX = logXApplied(ds);
  const all = series(ds);
  if (!all.length) return { error: 'Saisissez des X et des Y.' };
  const fits = [];
  const warnings = [];
  const unknowns = unknownsOf(ds);
  const columns = ['Paramètre', ...all.map((s) => s.col.name)];
  const results = all.map(({ col, pts }) => {
    const x = pts.map((p) => (logX ? Math.log10(p[0]) : p[0]));
    const r = fitModel(ds.analysis.model, x, pts.map((p) => p[1]));
    if (r.error) { warnings.push(`${col.name} : ${r.error}`); return null; }
    if (!r.converged) warnings.push(`${col.name} : l’ajustement n’a pas convergé.`);
    if (r.ambiguous) warnings.push(`${col.name} : ajustement ambigu (paramètres mal déterminés par les données).`);
    fits.push({ colId: col.id, predict: r.predict, logX });
    return { col, r };
  });
  const ok = results.filter(Boolean);
  if (!ok.length) return { error: warnings[0] ?? 'Ajustement impossible.', warnings };
  const cell = (fn) => results.map((x) => (x ? fn(x.r) : '—'));
  const rows = [];
  model.params.forEach((name, j) => {
    rows.push([name, ...cell((r) => f4(r.params[j]))]);
    rows.push([`   erreur type`, ...cell((r) => f4(r.se[j]))]);
    rows.push([`   IC 95 %`, ...cell((r) => ci(r.ci[j][0], r.ci[j][1]))]);
  });
  const derivedNames = ok[0].r.derived.map((d) => d.name);
  derivedNames.forEach((name, j) => rows.push([name, ...cell((r) => `${f4(r.derived[j].value)}${r.derived[j].ci ? ` (IC 95 % ${ci(r.derived[j].ci[0], r.derived[j].ci[1])})` : ''}`)]));
  rows.push(['R²', ...cell((r) => f4(r.r2))], ['Sy.x', ...cell((r) => f4(r.syx))], ['Somme des carrés', ...cell((r) => f4(r.ss))], ['Points, ddl', ...cell((r) => `${r.n}, ${r.df}`)]);
  const sections = [{ title: 'Ajustement', table: { columns, rows } }];
  if (unknowns.length && model.inverse) {
    const interp = [];
    for (const { col, r } of ok) {
      for (const y of unknowns) {
        const xi = r.inverse(y);
        interp.push([col.name, f4(y), Number.isFinite(xi) ? f4(logX ? 10 ** xi : xi) : 'hors de la courbe']);
      }
    }
    sections.push({ title: 'Inconnues lues sur la courbe', table: { columns: ['Série', 'Y mesuré', logX ? 'X interpolé (concentration)' : 'X interpolé'], rows: interp } });
  }
  return {
    method: `${model.label} : ${model.equation}${logX ? ' (X = log10 de la concentration)' : ''}. Moindres carrés, erreurs types asymptotiques.`,
    sections, fits, warnings,
  };
}

// --- Groupé ---------------------------------------------------------------------------------------------------

function anova2Run(ds) {
  const { rows, cells } = groupedCells(ds);
  if (rows.length < 2 || ds.columns.length < 2) return { error: 'Il faut au moins deux lignes et deux colonnes remplies.' };
  const r = anova2(cells);
  if (r.error) return { error: r.error };
  const rowWord = ds.rowTitle || 'Facteur ligne';
  const colWord = ds.colTitle || 'Facteur colonne';
  const src = [];
  if (r.interaction) src.push(['Interaction', `${formatNumber(r.interaction.pct, 3)} %`, f4(r.interaction.ss), String(r.interaction.df), f4(r.interaction.ms), `F = ${f4(r.interaction.F)} ; ${pEq(r.interaction.p)}`, stars(r.interaction.p)]);
  src.push([rowWord, `${formatNumber(r.rows.pct, 3)} %`, f4(r.rows.ss), String(r.rows.df), f4(r.rows.ms), `F = ${f4(r.rows.F)} ; ${pEq(r.rows.p)}`, stars(r.rows.p)]);
  src.push([colWord, `${formatNumber(r.columns.pct, 3)} %`, f4(r.columns.ss), String(r.columns.df), f4(r.columns.ms), `F = ${f4(r.columns.F)} ; ${pEq(r.columns.p)}`, stars(r.columns.p)]);
  src.push(['Résidus', '', f4(r.residual.ss), String(r.residual.df), f4(r.residual.ms), '', '']);
  const sections = [{ title: 'ANOVA à deux facteurs (sommes des carrés de type III)', table: { columns: ['Source', '% de la variation', 'SC', 'ddl', 'CM', 'F, P', 'Résumé'], rows: src } }];
  const warnings = [];
  if (!r.interactionTested) warnings.push('Une seule valeur par case : l’interaction ne peut pas être testée (modèle additif).');
  let comparisons = [];
  if (ds.analysis.within !== 'none') {
    const comps = anova2Comparisons(r, { within: ds.analysis.within, method: ds.analysis.method });
    const label = (c) => (ds.analysis.within === 'rows'
      ? [rows[c.outer].label || `Ligne ${c.outer + 1}`, `${ds.columns[c.a].name} vs ${ds.columns[c.b].name}`]
      : [ds.columns[c.outer].name, `${rows[c.a].label || `Ligne ${c.a + 1}`} vs ${rows[c.b].label || `Ligne ${c.b + 1}`}`]);
    sections.push({
      title: `Comparaisons ${ds.analysis.within === 'rows' ? 'dans chaque ligne' : 'dans chaque colonne'} (${{ sidak: 'Šidák', tukey: 'Tukey', bonferroni: 'Bonferroni', fisher: 'sans correction' }[ds.analysis.method]})`,
      table: { columns: [ds.analysis.within === 'rows' ? 'Ligne' : 'Colonne', 'Comparaison', 'Différence', 'IC 95 %', 'P ajusté', 'Résumé'], rows: comps.map((c) => [...label(c), f4(-c.diff), ci(-c.ciHigh, -c.ciLow), pText(c.p), stars(c.p)]) },
    });
    comparisons = comps.map((c) => (ds.analysis.within === 'rows'
      ? { row: rows[c.outer].id, a: ds.columns[c.a].id, b: ds.columns[c.b].id, p: c.p }
      : { col: ds.columns[c.outer].id, a: rows[c.a].id, b: rows[c.b].id, p: c.p }));
  }
  return { method: 'ANOVA à deux facteurs, sommes des carrés de type III (régression, codage des effets).', sections, comparisons, warnings };
}

// --- Contingence ------------------------------------------------------------------------------------------------

function contingencyRun(ds) {
  const rows = ds.rows.filter((r) => ds.columns.some((c) => Number.isFinite(num(r.v?.[c.id]?.[0]))));
  const table = rows.map((r) => ds.columns.map((c) => { const v = num(r.v?.[c.id]?.[0]); return Number.isFinite(v) ? v : 0; }));
  if (rows.length < 2 || ds.columns.length < 2) return { error: 'Il faut au moins deux lignes et deux colonnes d’effectifs.' };
  if (table.flat().some((v) => v < 0 || !Number.isInteger(v))) return { error: 'Un tableau de contingence contient des effectifs (entiers positifs), pas des moyennes ni des pourcentages.' };
  const warnings = [];
  const chi = chiSquare(table, { yates: ds.analysis.yates });
  const sections = [];
  if (table.length === 2 && table[0].length === 2) {
    const fe = fisherExact(table);
    const t = twoByTwo(table);
    sections.push({ title: 'Test exact de Fisher', rows: [['Valeur de P (bilatéral)', pText(fe.p)], ['Résumé', stars(fe.p)], ['Association significative (P < 0,05) ?', yesNo(fe.p)]] });
    sections.push({ title: `χ²${chi.yates ? ' avec correction de Yates' : ''}`, rows: [['χ², ddl', `${f4(chi.chi2)}, ${chi.df}`], ['Valeur de P', pText(chi.p)]] });
    const g1 = rows[0].label || 'Ligne 1';
    const g2 = rows[1].label || 'Ligne 2';
    const ev = ds.columns[0].name;
    sections.push({
      title: 'Ampleur de l’effet',
      rows: [
        [`Proportion « ${ev} » : ${g1}, ${g2}`, `${formatNumber(t.p1 * 100, 3)} %, ${formatNumber(t.p2 * 100, 3)} %`],
        [`Risque relatif (${g1} / ${g2})`, `${f4(t.rr)} (IC 95 % ${ci(t.rrCi[0], t.rrCi[1])})`],
        ['Rapport de cotes', `${f4(t.or)} (IC 95 % ${ci(t.orCi[0], t.orCi[1])})`],
      ],
    });
    if (t.corrected) warnings.push('Une case vaut 0 : 0,5 ajouté à chaque case pour le risque relatif et le rapport de cotes.');
  } else {
    sections.push({ title: 'χ² d’indépendance', rows: [['χ², ddl', `${f4(chi.chi2)}, ${chi.df}`], ['Valeur de P', pText(chi.p)], ['Résumé', stars(chi.p)], ['Association significative (P < 0,05) ?', yesNo(chi.p)]] });
  }
  if (chi.smallExpected > 0.2 * chi.cells) warnings.push(`${chi.smallExpected} effectif(s) théorique(s) < 5 : le χ² est approximatif${table.length === 2 && table[0].length === 2 ? ', préférez le test de Fisher' : ''}.`);
  return { method: 'Tableau de contingence : χ² de Pearson et, pour un 2 × 2, test exact de Fisher, risque relatif (Katz) et rapport de cotes (Woolf).', sections, warnings };
}

// --- Survie -------------------------------------------------------------------------------------------------

function survivalRun(ds) {
  const groups = survivalGroups(ds);
  if (!groups.length) return { error: 'Saisissez des temps (X) et, pour chaque groupe, 1 (événement) ou 0 (censuré).' };
  const km = groups.map((g) => ({ colId: g.col.id, ...kaplanMeier(g.times, g.events) }));
  const sections = [{
    title: 'Courbes de Kaplan-Meier',
    table: { columns: ['Groupe', 'Sujets', 'Événements', 'Censurés', 'Survie médiane'], rows: km.map((k, i) => [groups[i].col.name, String(k.n), String(k.events), String(k.n - k.events), k.median === null ? 'non atteinte' : f4(k.median)]) },
  }];
  const comparisons = [];
  if (groups.length >= 2) {
    const lr = logRank(groups);
    const gb = logRank(groups, { weight: 'gehan' });
    const rows = [['Log-rank (Mantel-Cox) : χ², ddl', `${f4(lr.chi2)}, ${lr.df}`], ['Valeur de P', pText(lr.p)], ['Résumé', stars(lr.p)], ['Courbes significativement différentes (P < 0,05) ?', yesNo(lr.p)], ['Gehan-Breslow-Wilcoxon : χ², P', `${f4(gb.chi2)} ; ${pEq(gb.p)}`]];
    if (lr.hazardRatio) rows.push([`Rapport des risques (${groups[0].col.name} / ${groups[1].col.name}, log-rank)`, `${f4(lr.hazardRatio.hr)} (IC 95 % ${ci(lr.hazardRatio.ci[0], lr.hazardRatio.ci[1])})`]);
    sections.push({ title: 'Comparaison des courbes', rows });
    if (groups.length === 2) comparisons.push({ a: groups[0].col.id, b: groups[1].col.id, p: lr.p });
  }
  return { method: 'Kaplan-Meier (erreur type de Greenwood) ; test du log-rank (Mantel-Cox) et de Gehan-Breslow-Wilcoxon.', sections, km, comparisons };
}

const RUNNERS = {
  describe: describeRun,
  compare2: compare2Run,
  compareN: compareNRun,
  onesample: oneSampleRun,
  linear: linearRun,
  correlation: correlationRun,
  nonlinear: nonlinearRun,
  anova2: anova2Run,
  contingency: contingencyRun,
  survival: survivalRun,
};

/** Résumé texte scellé dans l'entrée : titre, méthode, sections, avertissements. */
export function buildStatSummary(ds, res) {
  return {
    title: ds.title || 'Graphique',
    kind: KINDS[ds.kind].label,
    analysis: res.error ? null : res.title,
    method: res.method ?? '',
    sections: res.error ? [] : res.sections.map((s) => (s.table ? { title: s.title, table: s.table } : { title: s.title, rows: s.rows })),
    warnings: res.warnings ?? [],
    error: res.error ?? null,
  };
}
