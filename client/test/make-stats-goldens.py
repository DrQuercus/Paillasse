"""Valeurs de référence du moteur statistique, calculées par scipy et statsmodels.

    pip install scipy statsmodels
    python3 client/test/make-stats-goldens.py

Écrit client/test/fixtures/stats/goldens.json, lu par client/test/stats.test.js.
"""
import json
import math
import os

import numpy as np
from scipy import stats, optimize
import statsmodels.api as sm
import statsmodels.formula.api as smf
from statsmodels.stats.oneway import anova_oneway
from statsmodels.stats.anova import AnovaRM
from statsmodels.duration.survfunc import SurvfuncRight, survdiff

rng = np.random.default_rng(20260924)
out = {}


def r(a):
    return [round(float(v), 6) for v in a]


# --- Lois ---------------------------------------------------------------------------------------------
out['dist'] = {
    'tcdf': [[t, df, stats.t.cdf(t, df)] for t, df in [(-3.2, 4), (0.7, 11), (2.228, 10), (5.1, 2), (-1.1, 250)]],
    'tinv': [[p, df, stats.t.ppf(p, df)] for p, df in [(0.975, 3), (0.995, 12), (0.9, 1), (0.975, 1000)]],
    'fsf': [[f, a, b, stats.f.sf(f, a, b)] for f, a, b in [(3.5, 2, 15), (0.8, 4, 30), (12.0, 1, 5), (2.1, 3, 120)]],
    'chi2sf': [[x, k, stats.chi2.sf(x, k)] for x, k in [(3.84, 1), (11.3, 3), (0.5, 2), (40.0, 10)]],
    'norminv': [[p, stats.norm.ppf(p)] for p in [1e-10, 0.001, 0.2, 0.5, 0.9, 0.999999]],
    'ptukey': [[q, k, df, stats.studentized_range.cdf(q, k, df)] for q, k, df in [(3.5, 4, 20), (2.0, 3, 5), (4.8, 6, 12), (3.1, 2, 60), (5.5, 10, 30)]],
    'qtukey': [[p, k, df, stats.studentized_range.ppf(p, k, df)] for p, k, df in [(0.95, 3, 12), (0.95, 5, 25), (0.99, 4, 8)]],
}

# --- Descriptifs et normalité ------------------------------------------------------------------------
A = r(rng.normal(12, 3, 10))
out['describe'] = {
    'data': A,
    'mean': float(np.mean(A)), 'sd': float(np.std(A, ddof=1)), 'sem': float(stats.sem(A)),
    'median': float(np.median(A)),
    'q1': float(np.percentile(A, 25, method='weibull')), 'q3': float(np.percentile(A, 75, method='weibull')),
    'skew': float(stats.skew(A, bias=False)), 'kurt': float(stats.kurtosis(A, bias=False)),
    'ci': list(stats.t.interval(0.95, len(A) - 1, loc=np.mean(A), scale=stats.sem(A))),
}
out['shapiro'] = []
for n in [3, 4, 5, 7, 8, 11, 12, 20, 50]:
    x = r(rng.normal(0, 1, n) if n % 2 else rng.exponential(1, n))
    w, p = stats.shapiro(x)
    out['shapiro'].append({'data': x, 'w': float(w), 'p': float(p)})
out['normaltest'] = []
for n in [20, 35]:
    x = r(rng.gamma(2, 1, n))
    k2, p = stats.normaltest(x)
    out['normaltest'].append({'data': x, 'k2': float(k2), 'p': float(p)})

# --- Tests t et non paramétriques -------------------------------------------------------------------------
g1 = r(rng.normal(10, 2, 8))
g2 = r(rng.normal(12.5, 3, 11))
tt = stats.ttest_ind(g1, g2)
tw = stats.ttest_ind(g1, g2, equal_var=False)
before = r(rng.normal(20, 4, 9))
after = r(np.array(before) + rng.normal(1.5, 1.2, 9))
tp = stats.ttest_rel(before, after)
t1 = stats.ttest_1samp(g1, 9.0)
out['ttest'] = {
    'a': g1, 'b': g2, 'before': before, 'after': after,
    'student': {'t': float(tt.statistic), 'p': float(tt.pvalue), 'ci': list(tt.confidence_interval())},
    'welch': {'t': float(tw.statistic), 'p': float(tw.pvalue), 'df': float(tw.df), 'ci': list(tw.confidence_interval())},
    'paired': {'t': float(tp.statistic), 'p': float(tp.pvalue), 'ci': list(tp.confidence_interval())},
    'one': {'t': float(t1.statistic), 'p': float(t1.pvalue), 'ci': list(t1.confidence_interval())},
}
# Le test t de scipy calcule a − b ; Paillasse calcule b − a (second groupe moins premier)
s1 = [3.1, 4.7, 2.2, 5.9, 6.4]
s2 = [7.3, 8.8, 5.5, 9.1, 10.2, 6.6, 4.1]
tied1 = [1, 2, 2, 3, 3, 3, 4, 5, 6, 6]
tied2 = [3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 9]
big1 = r(rng.normal(0, 1, 20))
big2 = r(rng.normal(0.8, 1, 25))
out['mannwhitney'] = [
    {'a': s1, 'b': s2, 'p': float(stats.mannwhitneyu(s1, s2, method='exact').pvalue), 'u': float(stats.mannwhitneyu(s1, s2).statistic)},
    {'a': tied1, 'b': tied2, 'p': float(stats.mannwhitneyu(tied1, tied2, method='asymptotic', use_continuity=True).pvalue)},
    {'a': big1, 'b': big2, 'p': float(stats.mannwhitneyu(big1, big2, method='exact').pvalue)},
]
d_exact = [0.8, -1.3, 2.1, 3.4, -0.4, 1.9, 2.7, 0.2, 4.1]
d_ties = [1, 2, 2, -1, 3, 3, 3, 0, 4, -2, 5, 1]
out['wilcoxon'] = [
    {'d': d_exact, 'p': float(stats.wilcoxon(d_exact, method='exact').pvalue)},
    {'d': d_ties, 'p': float(stats.wilcoxon(d_ties, zero_method='wilcox', correction=False, method='approx').pvalue)},
]

# --- ANOVA à un facteur et comparaisons ------------------------------------------------------------------------
G = [r(rng.normal(m, s, n)) for m, s, n in [(10, 2, 6), (12, 2.5, 7), (15, 2, 5), (11, 3, 8)]]
fo = stats.f_oneway(*G)
tk = stats.tukey_hsd(*G)
tk_ci = tk.confidence_interval(0.95)
dn = stats.dunnett(*G[1:], control=G[0])
dn_ci = dn.confidence_interval(0.95)
welch = anova_oneway(G, use_var='unequal', welch_correction=True)
out['anova1'] = {
    'groups': G,
    'F': float(fo.statistic), 'p': float(fo.pvalue),
    'levene': float(stats.levene(*G, center='median').pvalue),
    'bartlett': float(stats.bartlett(*G).pvalue),
    'welch': {'F': float(welch.statistic), 'p': float(welch.pvalue), 'df2': float(welch.df[1])},
    # tukey_hsd : pvalue[i][j] et IC de moyenne i − moyenne j
    'tukey': {'p': np.asarray(tk.pvalue).tolist(), 'lo': np.asarray(tk_ci.low).tolist(), 'hi': np.asarray(tk_ci.high).tolist()},
    'dunnett': {'p': np.asarray(dn.pvalue).tolist(), 'lo': np.asarray(dn_ci.low).tolist(), 'hi': np.asarray(dn_ci.high).tolist()},
    'kruskal': {'H': float(stats.kruskal(*G).statistic), 'p': float(stats.kruskal(*G).pvalue)},
}
# Mesures répétées : 8 sujets × 4 temps
subj = rng.normal(0, 2, 8)
M = [[round(float(20 + s + t * 1.5 + rng.normal(0, 1.2)), 3) for t in range(4)] for s in subj]
long = [{'subj': i, 'cond': j, 'y': M[i][j]} for i in range(8) for j in range(4)]
import pandas as pd  # noqa: E402
df = pd.DataFrame(long)
rm = AnovaRM(df, 'y', 'subj', within=['cond']).fit().anova_table
X = np.array(M)
S = np.cov(X, rowvar=False)
k = S.shape[0]
Cm = np.eye(k) - np.ones((k, k)) / k
Sd = Cm @ S @ Cm
eps = np.trace(Sd) ** 2 / ((k - 1) * np.sum(Sd ** 2))
fr = stats.friedmanchisquare(*[X[:, j] for j in range(4)])
out['rm'] = {
    'matrix': M,
    'F': float(rm['F Value'].iloc[0]), 'p': float(rm['Pr > F'].iloc[0]), 'epsilon': float(eps),
    'friedman': {'Q': float(fr.statistic), 'p': float(fr.pvalue)},
}

# --- Régressions ---------------------------------------------------------------------------------------------------
x = r(np.linspace(0, 10, 12))
y = r(2.5 * np.array(x) + 4 + rng.normal(0, 1.5, 12))
lr = stats.linregress(x, y)
pr = stats.pearsonr(x, y)
out['linear'] = {
    'x': x, 'y': y, 'slope': float(lr.slope), 'intercept': float(lr.intercept), 'r': float(lr.rvalue),
    'p': float(lr.pvalue), 'seSlope': float(lr.stderr), 'seIntercept': float(lr.intercept_stderr),
    'pearsonCi': list(pr.confidence_interval()),
    'spearman': {'rho': float(stats.spearmanr(x, y).statistic), 'p': float(stats.spearmanr(x, y).pvalue)},
}


def fit(name, f, xs, p0, true):
    ys = r(np.array([f(v, *true) for v in xs]) + rng.normal(0, 0.03 * (max(abs(np.array([f(v, *true) for v in xs]))) or 1), len(xs)))
    popt, pcov = optimize.curve_fit(f, xs, ys, p0=p0, maxfev=20000)
    return {'model': name, 'x': list(xs), 'y': ys, 'params': popt.tolist(), 'se': np.sqrt(np.diag(pcov)).tolist()}


logx = r(np.repeat(np.linspace(-9, -5, 9), 2))
conc = r([0.5, 1, 2, 4, 8, 16, 32, 64, 128])
tt_ = r(np.linspace(0, 30, 11))
out['nonlinear'] = [
    fit('dose4', lambda x, b, t, c, h: b + (t - b) / (1 + 10 ** ((c - x) * h)), logx, [0, 100, -7, 1], [5, 98, -7.2, 1.1]),
    fit('mm', lambda x, v, km: v * x / (km + x), conc, [50, 10], [42, 9.5]),
    fit('decay1', lambda x, y0, pl, k: (y0 - pl) * np.exp(-k * x) + pl, tt_, [100, 10, 0.1], [95, 12, 0.15]),
]

# --- ANOVA à deux facteurs (type III, codage des effets) ------------------------------------------------------------
def two_way(balanced):
    rows = []
    for i in range(3):
        for j in range(2):
            n = 4 if balanced else [3, 4, 5, 2, 4, 3][i * 2 + j]
            for v in rng.normal(10 + 2 * i + 3 * j + (2.5 if (i == 2 and j == 1) else 0), 1.5, n):
                rows.append({'A': f'a{i}', 'B': f'b{j}', 'y': round(float(v), 3)})
    frame = pd.DataFrame(rows)
    model = smf.ols('y ~ C(A, Sum) * C(B, Sum)', data=frame).fit()
    tab = sm.stats.anova_lm(model, typ=3)
    cells = [[[row['y'] for row in rows if row['A'] == f'a{i}' and row['B'] == f'b{j}'] for j in range(2)] for i in range(3)]
    return {
        'cells': cells,
        'rows': {'F': float(tab.loc['C(A, Sum)', 'F']), 'p': float(tab.loc['C(A, Sum)', 'PR(>F)'])},
        'columns': {'F': float(tab.loc['C(B, Sum)', 'F']), 'p': float(tab.loc['C(B, Sum)', 'PR(>F)'])},
        'interaction': {'F': float(tab.loc['C(A, Sum):C(B, Sum)', 'F']), 'p': float(tab.loc['C(A, Sum):C(B, Sum)', 'PR(>F)'])},
        'dfE': float(model.df_resid), 'mse': float(model.mse_resid),
    }


out['anova2'] = [two_way(True), two_way(False)]

# --- Contingence ------------------------------------------------------------------------------------------------------------
t22 = [[12, 5], [3, 14]]
t23 = [[20, 15, 5], [10, 18, 22]]
tab = sm.stats.Table2x2(np.array(t22))
out['contingency'] = {
    't22': t22, 't23': t23,
    'chi22_yates': float(stats.chi2_contingency(t22, correction=True)[1]),
    'chi22': float(stats.chi2_contingency(t22, correction=False)[1]),
    'chi23': float(stats.chi2_contingency(t23)[1]),
    'fisher': float(stats.fisher_exact(t22).pvalue),
    'or': float(tab.oddsratio), 'orCi': list(tab.oddsratio_confint()),
    'rr': float(tab.riskratio), 'rrCi': list(tab.riskratio_confint()),
}

# --- Survie ---------------------------------------------------------------------------------------------------------------------
def group(scale, n):
    t = rng.exponential(scale, n)
    c = rng.uniform(0, scale * 2.5, n)
    return {'times': r(np.minimum(t, c)), 'events': [int(a <= b) for a, b in zip(t, c)]}


S1, S2, S3 = group(10, 18), group(18, 20), group(14, 15)
sf = SurvfuncRight(S1['times'], S1['events'])
lr2 = stats.logrank(stats.CensoredData(uncensored=[t for t, e in zip(S1['times'], S1['events']) if e], right=[t for t, e in zip(S1['times'], S1['events']) if not e]),
                    stats.CensoredData(uncensored=[t for t, e in zip(S2['times'], S2['events']) if e], right=[t for t, e in zip(S2['times'], S2['events']) if not e]))
all_t = S1['times'] + S2['times'] + S3['times']
all_e = S1['events'] + S2['events'] + S3['events']
grp = [0] * 18 + [1] * 20 + [2] * 15
chi3, p3 = survdiff(np.array(all_t), np.array(all_e), np.array(grp))
chig, pg = survdiff(np.array(S1['times'] + S2['times']), np.array(S1['events'] + S2['events']), np.array([0] * 18 + [1] * 20), weight_type='gb')
out['survival'] = {
    'g1': S1, 'g2': S2, 'g3': S3,
    'km1': {'times': sf.surv_times.tolist(), 'prob': sf.surv_prob.tolist(), 'se': sf.surv_prob_se.tolist()},
    'logrank2': {'p': float(lr2.pvalue), 'chi2': float(lr2.statistic) ** 2},
    'logrank3': {'chi2': float(chi3), 'p': float(p3)},
    'gehan2': {'chi2': float(chig), 'p': float(pg)},
}

path = os.path.join(os.path.dirname(__file__), 'fixtures', 'stats', 'goldens.json')
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, 'w') as f:
    json.dump(out, f, indent=1)
print('écrit', path)
