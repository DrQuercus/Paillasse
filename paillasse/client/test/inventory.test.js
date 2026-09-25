// Stockage côté interface : copie conforme des règles du serveur, arbre, collage depuis Excel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildTree, capText, decodeCell, parseBoxGrid, readPasted, tempTheme } from '../src/lib/inventory.js';

test('inventory-core.js est la copie conforme de server/src/lib/inventory.js', () => {
  const client = fs.readFileSync(new URL('../src/lib/inventory-core.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../../server/src/lib/inventory.js', import.meta.url), 'utf8');
  assert.equal(client, server);
});

test('ambiance selon la température', () => {
  assert.equal(tempTheme(-196), 'ln2');
  assert.equal(tempTheme(-80), 'ultra');
  assert.equal(tempTheme(-20), 'freezer');
  assert.equal(tempTheme(4), 'fridge');
  assert.equal(tempTheme(22), 'ambient');
});

test('arbre : totaux cumulés (tubes, places, boîtes)', () => {
  const t = buildTree([
    { id: 'f', parent_id: null, kind: 'freezer', count: 0 },
    { id: 's', parent_id: 'f', kind: 'shelf', count: 0 },
    { id: 'b1', parent_id: 's', kind: 'box', rows: 9, cols: 9, count: 10, out: 1 },
    { id: 'b2', parent_id: 'f', kind: 'box', rows: 10, cols: 10, count: 5, out: 0 },
    { id: 'g', parent_id: 's', kind: 'bag', count: 3, out: 0 },
  ]);
  assert.deepEqual(t.totals('f'), { tubes: 18, out: 1, capacity: 181, placed: 15, boxes: 3 });
  assert.deepEqual(t.children('s').map((u) => u.id), ['b1', 'g']);
});

test('bouchons : nom court et mini-carte', () => {
  assert.equal(capText({ name: 'pUC19-GFP miniprep' }), 'pUC19');
  assert.equal(capText({ name: 'Streptavidine HRP' }), 'Strept');
  assert.deepEqual(decodeCell('E'), { color: 'blue', out: true });
  assert.equal(decodeCell('.'), null);
});

test('plan de boîte collé depuis Excel : en-têtes reconnus, lignes vides gardées', () => {
  const grid = parseBoxGrid('\t1\t2\t3\nA\tpUC19\t\tpET28a\nB\t\t\t\nC\tGFP\t\t');
  assert.deepEqual(grid, [['pUC19', '', 'pET28a'], ['', '', ''], ['GFP', '', '']]);
  const box = { rows: 9, cols: 9 };
  assert.deepEqual(readPasted('A1\tpUC19\t250 ng/µL\nC5;GFP', box).map((t) => [t.row, t.col, t.name]), [[0, 0, 'pUC19'], [2, 4, 'GFP']]);
  assert.equal(readPasted('x\ty\n\t\tz', box).length, 3);
});
