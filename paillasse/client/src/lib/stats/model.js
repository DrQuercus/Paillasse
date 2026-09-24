// Jeux de données de l'outil Statistiques : cinq types de tableaux, comme Prism.
//
// Un jeu de données est du JSON : il est enregistré sur le serveur (page Statistiques) et copié
// dans l'encart inséré dans une entrée (scellé avec elle). Les cellules gardent le texte saisi
// (virgule décimale acceptée) ; les nombres sont lus au moment du calcul.

import { parseNumber } from '../calc/units.js';

export const KINDS = {
  column: {
    label: 'Colonnes',
    long: 'Groupes à comparer : une colonne par groupe, une valeur par ligne',
    hint: 'Tests t, Mann-Whitney, ANOVA, Kruskal-Wallis, statistiques descriptives.',
    replicates: false, x: false, labels: true, columnWord: 'Groupe',
  },
  xy: {
    label: 'XY',
    long: 'Une variable X et une ou plusieurs séries Y, avec réplicats',
    hint: 'Régression linéaire ou non linéaire (dose-réponse, Michaelis-Menten…), corrélation, courbe étalon.',
    replicates: true, x: true, labels: false, columnWord: 'Série',
  },
  grouped: {
    label: 'Groupé',
    long: 'Deux facteurs : lignes × colonnes, avec réplicats',
    hint: 'ANOVA à deux facteurs, comparaisons dans chaque ligne ; barres groupées.',
    replicates: true, x: false, labels: true, columnWord: 'Colonne',
  },
  contingency: {
    label: 'Contingence',
    long: 'Effectifs : groupes en lignes, issues en colonnes',
    hint: 'χ², test exact de Fisher, risque relatif, rapport de cotes.',
    replicates: false, x: false, labels: true, columnWord: 'Issue',
  },
  survival: {
    label: 'Survie',
    long: 'Temps en X ; pour chaque groupe, 1 = événement, 0 = censuré',
    hint: 'Courbes de Kaplan-Meier, médianes, test du log-rank.',
    replicates: false, x: true, labels: false, columnWord: 'Groupe',
  },
};

let counter = 0;
export const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Nombre lu dans une cellule (virgule, espaces, signe moins typographique) ; NaN si vide. */
export const num = (s) => parseNumber(String(s ?? '').replace(/−/g, '-'));

const col = (name) => ({ id: newId(), name });
const row = (cols, values = [], extra = {}) => ({
  id: newId(), x: '', label: '', ...extra,
  v: Object.fromEntries(cols.map((c, i) => [c.id, (Array.isArray(values[i]) ? values[i] : [values[i] ?? '']).map((x) => (x === undefined || x === null ? '' : String(x).replace('.', ',')))])),
});

export function defaultGraph(kind) {
  return {
    type: { column: 'scatter', xy: 'xy', grouped: 'groupedBar', contingency: 'stacked', survival: 'km' }[kind],
    title: '', xTitle: '', yTitle: '',
    error: kind === 'grouped' ? 'sem' : 'sd',
    center: 'mean',
    points: true, pointSize: 6, connect: false,
    yMin: '', yMax: '', yLog: false, xLog: false,
    palette: 'color', colors: {}, fill: 'light',
    width: 520, height: 400, fontSize: 14, font: 'sans', lineWidth: 1.5,
    legend: 'right', xAngle: 0,
    stars: 'significant', starStyle: 'stars', thresholds: 'classic',
    showFit: true, showBand: false, whiskers: 'tukey', percent: true, censorTicks: true,
  };
}

export function defaultAnalysis(kind) {
  return {
    type: { column: 'auto', xy: 'linear', grouped: 'anova2', contingency: 'contingency', survival: 'survival' }[kind],
    parametric: true, paired: false, welch: false, posthoc: 'tukey', control: null, hypothetical: '0',
    model: 'dose4', logX: 'auto', correlation: 'pearson', unknowns: '',
    within: 'rows', method: 'sidak', yates: false, cols: null,
  };
}

/** Tableau vide : quelques lignes et colonnes, prêtes à être remplies ou collées depuis Excel. */
export function newDataset(kind = 'column') {
  const k = KINDS[kind];
  const n = kind === 'contingency' ? 2 : 3;
  const columns = Array.from({ length: n }, (_, i) => col(kind === 'contingency' ? ['Issue A', 'Issue B'][i] : `${k.columnWord} ${String.fromCharCode(65 + i)}`));
  const rows = Array.from({ length: kind === 'contingency' ? 2 : 8 }, (_, i) => row(columns, [], { label: kind === 'contingency' ? `Groupe ${i + 1}` : kind === 'grouped' ? `Ligne ${i + 1}` : '' }));
  return {
    v: 1, kind, title: '',
    xTitle: kind === 'survival' ? 'Temps' : kind === 'xy' ? 'X' : '',
    replicates: k.replicates ? 3 : 1,
    columns, rows,
    analysis: defaultAnalysis(kind),
    graph: defaultGraph(kind),
  };
}

/** Exemples tout prêts, pour essayer chaque type de tableau. */
export function exampleDataset(kind) {
  const ds = newDataset(kind);
  if (kind === 'column') {
    ds.title = 'Activité enzymatique selon le traitement';
    ds.columns = ['Témoin', 'Inhibiteur A', 'Inhibiteur B', 'A + B'].map(col);
    const data = [[12.1, 7.9, 9.8, 4.2], [13.4, 8.8, 10.5, 5.1], [11.2, 7.1, 11.9, 3.8], [12.8, 9.6, 10.1, 4.9], [14.0, 8.2, 9.2, 5.6], [12.5, 7.5, 10.8, 4.4]];
    ds.rows = data.map((r) => row(ds.columns, r));
    ds.graph.yTitle = 'Activité (µmol/min/mg)';
  } else if (kind === 'xy') {
    ds.title = 'Courbe dose-réponse';
    ds.xTitle = 'Concentration (nM)';
    ds.columns = [col('Agoniste')];
    const conc = [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000];
    const reps = [[4, 6, 5], [8, 11, 9], [19, 22, 17], [41, 38, 45], [66, 70, 63], [85, 88, 83], [94, 97, 92], [98, 96, 99], [99, 101, 97]];
    ds.rows = conc.map((x, i) => row(ds.columns, [reps[i]], { x: String(x).replace('.', ',') }));
    ds.analysis.type = 'nonlinear';
    ds.analysis.model = 'dose4';
    ds.graph.xLog = true;
    ds.graph.error = 'sem';
    ds.graph.yTitle = 'Réponse (% du maximum)';
  } else if (kind === 'grouped') {
    ds.title = 'Expression selon le génotype et le temps';
    ds.columns = ['Sauvage', 'Mutant'].map(col);
    const times = ['0 h', '2 h', '6 h', '24 h'];
    const wt = [[1.0, 1.1, 0.9], [2.3, 2.6, 2.1], [4.1, 3.8, 4.5], [2.2, 2.0, 2.5]];
    const mut = [[1.0, 0.9, 1.2], [1.4, 1.6, 1.3], [1.9, 2.2, 1.7], [1.5, 1.3, 1.6]];
    ds.rows = times.map((t, i) => row(ds.columns, [wt[i], mut[i]], { label: t }));
    ds.rowTitle = 'Temps';
    ds.colTitle = 'Génotype';
    ds.graph.yTitle = 'Expression relative';
  } else if (kind === 'contingency') {
    ds.title = 'Transformation selon le plasmide';
    ds.columns = ['Colonies bleues', 'Colonies blanches'].map(col);
    ds.rows = [row(ds.columns, [12, 88], { label: 'pUC19' }), row(ds.columns, [41, 59], { label: 'pUC19 + insert' })];
  } else if (kind === 'survival') {
    ds.title = 'Survie des souris';
    ds.xTitle = 'Jours';
    ds.columns = ['Placebo', 'Traitement'].map(col);
    const a = [[3, 1], [5, 1], [6, 1], [8, 1], [10, 0], [11, 1], [14, 1], [15, 1], [20, 0], [22, 1]];
    const b = [[6, 1], [9, 1], [12, 0], [15, 1], [18, 1], [21, 0], [25, 1], [28, 0], [30, 0], [30, 0]];
    ds.rows = [
      ...a.map(([t, e]) => row(ds.columns, [e, ''], { x: String(t) })),
      ...b.map(([t, e]) => row(ds.columns, ['', e], { x: String(t) })),
    ];
    ds.graph.yTitle = 'Survie (%)';
  }
  return ds;
}

// --- Lecture des données ------------------------------------------------------------------------------

/** Valeurs d'une colonne (tous réplicats, toutes lignes), nombres seulement. */
export function columnValues(ds, colId) {
  const out = [];
  for (const r of ds.rows) for (const s of r.v?.[colId] ?? []) { const v = num(s); if (Number.isFinite(v)) out.push(v); }
  return out;
}

/** Colonnes qui contiennent au moins une valeur. */
export const filledColumns = (ds) => ds.columns.filter((c) => columnValues(ds, c.id).length > 0);

/** Paires alignées ligne à ligne (tests appariés) : lignes complètes seulement. */
export function pairedMatrix(ds, colIds) {
  const out = [];
  for (const r of ds.rows) {
    const vals = colIds.map((id) => num(r.v?.[id]?.[0]));
    if (vals.every(Number.isFinite)) out.push(vals);
  }
  return out;
}

/** XY : points (x, y) d'une série, chaque réplicat étant un point. */
export function xyPoints(ds, colId) {
  const pts = [];
  for (const r of ds.rows) {
    const x = num(r.x);
    if (!Number.isFinite(x)) continue;
    for (const s of r.v?.[colId] ?? []) { const y = num(s); if (Number.isFinite(y)) pts.push([x, y]); }
  }
  return pts;
}

/** Cellules d'un tableau groupé : cells[ligne][colonne] = valeurs. Lignes vides écartées. */
export function groupedCells(ds) {
  const rows = ds.rows.filter((r) => ds.columns.some((c) => (r.v?.[c.id] ?? []).some((s) => Number.isFinite(num(s)))));
  return {
    rows,
    cells: rows.map((r) => ds.columns.map((c) => (r.v?.[c.id] ?? []).map(num).filter(Number.isFinite))),
  };
}

/** Survie : pour chaque colonne, temps (X) et événement (1) ou censure (0). */
export function survivalGroups(ds) {
  return ds.columns.map((c) => {
    const times = [];
    const events = [];
    for (const r of ds.rows) {
      const t = num(r.x);
      const e = num(r.v?.[c.id]?.[0]);
      if (Number.isFinite(t) && (e === 0 || e === 1)) { times.push(t); events.push(e); }
    }
    return { col: c, times, events };
  }).filter((g) => g.times.length);
}

// --- Collage depuis Excel ou LibreOffice -------------------------------------------------------------------

/** Texte collé (tabulations ou points-virgules) → lignes de cellules. */
export function parseClipboard(text) {
  const lines = String(text).replace(/\r/g, '').split('\n');
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.includes(';')) ? ';' : /,\d/.test(text) ? '\t' : ',';
  return lines.map((l) => l.split(sep).map((c) => c.trim()));
}

/**
 * Tableau collé entier (avec en-têtes) → nouveau contenu du jeu de données. La première ligne
 * donne les noms de colonnes si elle n'est pas numérique ; en XY et Survie, la première colonne est X ;
 * en Groupé et Contingence, la première colonne donne les noms de lignes si elle n'est pas numérique.
 */
export function tableFromGrid(ds, grid) {
  const k = KINDS[ds.kind];
  const isNum = (s) => Number.isFinite(num(s));
  let body = grid;
  let header = null;
  if (grid.length > 1 && grid[0].some((s) => s && !isNum(s))) { header = grid[0]; body = grid.slice(1); }
  const firstIsLabel = !k.x && k.labels && body.some((r) => r[0] && !isNum(r[0]));
  const lead = k.x || firstIsLabel ? 1 : 0;
  const width = Math.max(0, ...body.map((r) => r.length)) - lead;
  const reps = k.replicates ? ds.replicates : 1;
  const nCols = Math.max(1, Math.ceil(width / reps));
  const columns = Array.from({ length: nCols }, (_, i) => col(header?.[lead + i * reps] || ds.columns[i]?.name || `${k.columnWord} ${String.fromCharCode(65 + (i % 26))}`));
  const rows = body.map((cells) => {
    const r = { id: newId(), x: k.x ? cells[0] ?? '' : '', label: firstIsLabel ? cells[0] ?? '' : '', v: {} };
    columns.forEach((c, i) => { r.v[c.id] = Array.from({ length: reps }, (_, j) => cells[lead + i * reps + j] ?? ''); });
    return r;
  });
  return { ...ds, columns, rows, ...(k.x && header?.[0] ? { xTitle: header[0] } : {}) };
}

/** Tableau d'une entrée (TipTap) → jeu de données « Colonnes » (ou Groupé si la 1re colonne est un libellé). */
export function datasetFromTable(grid) {
  const body = grid.filter((r) => r.some((c) => c.trim()));
  const hasLabels = body.slice(1).some((r) => r[0] && !Number.isFinite(num(r[0]))) && body.slice(1).every((r) => r.slice(1).every((c) => !c || Number.isFinite(num(c))));
  const ds = newDataset(hasLabels ? 'grouped' : 'column');
  if (hasLabels) ds.replicates = 1;
  return tableFromGrid(ds, body);
}

/** Tableau du jeu de données en texte (CSV « ; », virgule décimale), pour l'export. */
export function datasetCsv(ds) {
  const k = KINDS[ds.kind];
  const reps = k.replicates ? ds.replicates : 1;
  const head = [...(k.x ? [ds.xTitle || 'X'] : k.labels ? [''] : []), ...ds.columns.flatMap((c) => Array.from({ length: reps }, (_, j) => (reps > 1 ? `${c.name} (${j + 1})` : c.name)))];
  const lines = ds.rows.map((r) => [...(k.x ? [r.x] : k.labels ? [r.label] : []), ...ds.columns.flatMap((c) => Array.from({ length: reps }, (_, j) => r.v?.[c.id]?.[j] ?? ''))]);
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [head, ...lines].map((l) => l.map(cell).join(';')).join('\r\n');
}

/** Garde la forme attendue même pour un jeu enregistré par une version précédente. */
export function normalizeDataset(ds) {
  const base = newDataset(KINDS[ds?.kind] ? ds.kind : 'column');
  return {
    ...base,
    ...ds,
    analysis: { ...defaultAnalysis(base.kind), ...(ds?.analysis ?? {}) },
    graph: { ...defaultGraph(base.kind), ...(ds?.graph ?? {}), colors: { ...(ds?.graph?.colors ?? {}) } },
    columns: Array.isArray(ds?.columns) && ds.columns.length ? ds.columns : base.columns,
    rows: Array.isArray(ds?.rows) ? ds.rows : base.rows,
  };
}
