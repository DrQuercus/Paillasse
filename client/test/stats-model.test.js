// Outil Statistiques : jeux de données, collage depuis un tableur, choix de l'analyse, graphiques.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  KINDS, columnValues, datasetCsv, datasetFromTable, exampleDataset, newDataset, normalizeDataset, parseClipboard, tableFromGrid,
} from '../src/lib/stats/model.js';
import { analyze, buildStatSummary, pText, resolvedType, stars } from '../src/lib/stats/analysis.js';
import { PLOT_TYPES, renderPlot } from '../src/lib/stats/plot.js';

test('collage depuis Excel : virgule décimale, en-têtes, réplicats XY', () => {
  const grid = parseClipboard('Témoin\tTraité\r\n1,5\t2,25\r\n1,7\t2,4\r\n\t2,1\r\n');
  assert.deepEqual(grid[0], ['Témoin', 'Traité']);
  const ds = tableFromGrid(newDataset('column'), grid);
  assert.deepEqual(ds.columns.map((c) => c.name), ['Témoin', 'Traité']);
  assert.deepEqual(columnValues(ds, ds.columns[1].id), [2.25, 2.4, 2.1]);
  const xy = tableFromGrid(newDataset('xy'), parseClipboard('Dose;A;A;A\n1;10;11;9\n10;50;48;52'));
  assert.equal(xy.xTitle, 'Dose');
  assert.equal(xy.columns.length, 1);
  assert.deepEqual(xy.rows[1].v[xy.columns[0].id], ['50', '48', '52']);
});

test('tableau d’une entrée : libellés en première colonne → tableau groupé', () => {
  const ds = datasetFromTable([['', 'Sauvage', 'Mutant'], ['0 h', '1', '1,1'], ['6 h', '4,2', '2']]);
  assert.equal(ds.kind, 'grouped');
  assert.deepEqual(ds.rows.map((r) => r.label), ['0 h', '6 h']);
  const plain = datasetFromTable([['A', 'B'], ['1', '2'], ['3', '4']]);
  assert.equal(plain.kind, 'column');
  assert.match(datasetCsv(plain), /"A";"B"/);
});

test('analyse automatique selon le nombre de colonnes, étoiles et P à la façon de Prism', () => {
  const ds = exampleDataset('column');
  assert.equal(resolvedType(ds), 'compareN');
  const two = { ...ds, columns: ds.columns.slice(0, 2) };
  assert.equal(resolvedType(two), 'compare2');
  const res = analyze(two);
  assert.equal(res.comparisons.length, 1);
  assert.ok(res.comparisons[0].p < 0.001);
  assert.equal(stars(0.03), '*');
  assert.equal(stars(0.03, 'gp'), '*');
  assert.equal(stars(0.04, 'gp'), 'ns');
  assert.equal(pText(0.00002), '< 0,0001');
  assert.equal(pText(0.01234), '0,0123');
});

test('chaque exemple s’analyse et chaque type de graphique se dessine sans valeur aberrante', () => {
  for (const kind of Object.keys(KINDS)) {
    const ds = exampleDataset(kind);
    const res = analyze(ds);
    assert.ok(!res.error, `${kind} : ${res.error}`);
    assert.ok(res.sections.length > 0);
    const summary = buildStatSummary(ds, res);
    assert.equal(summary.kind, KINDS[kind].label);
    for (const type of Object.keys(PLOT_TYPES[kind])) {
      const { svg } = renderPlot({ ...ds, graph: { ...ds.graph, type } }, res);
      assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
      assert.doesNotMatch(svg, /NaN|undefined|Infinity/, `${kind}/${type}`);
    }
  }
});

test('étoiles sur le graphique : seulement les comparaisons significatives, ou aucune', () => {
  const ds = exampleDataset('column');
  const res = analyze(ds);
  const count = (graph) => (renderPlot({ ...ds, graph: { ...ds.graph, ...graph } }, res).svg.match(/\*{1,4}</g) ?? []).length;
  assert.equal(count({ stars: 'significant' }), res.comparisons.filter((c) => c.p < 0.05).length);
  assert.equal(count({ stars: 'none' }), 0);
});

test('données insuffisantes : message clair, pas d’exception', () => {
  const ds = newDataset('column');
  assert.match(analyze(ds).error, /au moins une colonne/);
  const c = newDataset('contingency');
  c.rows[0].v[c.columns[0].id] = ['2,5'];
  c.rows[1].v[c.columns[1].id] = ['3'];
  assert.match(analyze(c).error, /effectifs/);
  assert.equal(normalizeDataset({ kind: 'xy', title: 'x' }).graph.type, 'xy');
});
