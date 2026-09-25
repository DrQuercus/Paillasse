// Stockage : positions, places libres, chemins, validation, aménagement rapide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  boxMap, canContain, cleanSample, cleanUnit, freePositions, isInside, locationText, parsePos, posLabel, quickLayout, unitPath,
} from '../src/lib/inventory.js';

test('positions : A1 en haut à gauche, lecture et écriture', () => {
  assert.equal(posLabel(0, 0), 'A1');
  assert.equal(posLabel(8, 8), 'I9');
  assert.equal(posLabel(null, null), '');
  assert.deepEqual(parsePos('c5'), { row: 2, col: 4 });
  assert.deepEqual(parsePos(' J 10 '), { row: 9, col: 9 });
  assert.equal(parsePos('5C'), null);
});

test('places libres : ordre de lecture depuis la case cliquée, puis retour au début', () => {
  const occupied = new Set(['0,1', '0,2']);
  assert.deepEqual(freePositions({ rows: 2, cols: 3 }, occupied, 3), [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 1, col: 1 }]);
  assert.deepEqual(freePositions({ rows: 2, cols: 3 }, occupied, 3, { row: 1, col: 2 }), [{ row: 1, col: 2 }, { row: 0, col: 0 }, { row: 1, col: 0 }]);
  assert.equal(freePositions({ rows: 1, cols: 3 }, occupied, 5).length, 1);
});

test('qui peut contenir quoi', () => {
  assert.ok(canContain(null, 'freezer'));
  assert.ok(canContain('room', 'tank'));
  assert.ok(canContain('freezer', 'shelf'));
  assert.ok(canContain('tank', 'rack'));
  assert.ok(!canContain('tank', 'shelf'));
  assert.ok(!canContain('box', 'box'));
  assert.ok(!canContain(null, 'box'));
});

test('chemin, texte de l’emplacement et cycles', () => {
  const units = [
    { id: 'r', parent_id: null, kind: 'room', name: 'Salle 204' },
    { id: 'f', parent_id: 'r', kind: 'freezer', name: 'Thor', temperature: -80 },
    { id: 's', parent_id: 'f', kind: 'shelf', name: 'Étagère 2' },
    { id: 'b', parent_id: 's', kind: 'box', name: 'Plasmides', rows: 9, cols: 9 },
  ];
  const byId = new Map(units.map((u) => [u.id, u]));
  assert.deepEqual(unitPath(byId, 'b').map((u) => u.id), ['r', 'f', 's', 'b']);
  assert.equal(locationText(unitPath(byId, 'b'), 2, 4), 'Salle 204 › −80 °C Thor › Étagère 2 › Plasmides › C5');
  assert.ok(isInside(byId, 'b', 'f'));
  assert.ok(!isInside(byId, 'f', 'b'));
});

test('mini-carte : couleur du bouchon (ou du type), majuscule si sorti', () => {
  const map = boxMap({ rows: 1, cols: 4 }, [
    { row: 0, col: 0, type: 'plasmid', cap_color: '' },
    { row: 0, col: 2, type: 'plasmid', cap_color: 'red', status: 'out' },
  ]);
  assert.equal(map, 'e.A.');
});

test('saisies nettoyées', () => {
  assert.equal(cleanSample({}).error, 'Donnez un nom à l’échantillon.');
  const { fields } = cleanSample({ name: '  pUC19 ', type: 'bidule', cap_color: 'fuchsia', frozen_on: '2026-13-45', thaw_count: '-3', owner_id: 'x' });
  assert.equal(fields.name, 'pUC19');
  assert.equal(fields.type, 'other');
  assert.equal(fields.cap_color, '');
  assert.equal(fields.frozen_on, null);
  assert.equal(fields.thaw_count, 0);
  assert.equal(fields.owner_id, null);
  assert.deepEqual(Object.keys(cleanSample({ volume: '20 µL' }, { partial: true }).fields), ['volume']);
  assert.match(cleanUnit({ name: 'B', rows: 40, cols: 9 }, { kind: 'box' }).error, /1 à 26/);
  assert.equal(cleanUnit({ name: 'Thor', temperature: '−80' }).fields.temperature, -80);
});

test('aménagement rapide : étagères × racks × boîtes, tours pour une cuve', () => {
  const plan = quickLayout({ shelves: 5, racks: 4, boxes: 5 }, 'freezer');
  assert.equal(plan.filter((p) => p.kind === 'shelf').length, 5);
  assert.equal(plan.filter((p) => p.kind === 'rack').length, 20);
  assert.equal(plan.filter((p) => p.kind === 'box').length, 100);
  const keys = new Set(plan.map((p) => p.key));
  assert.ok(plan.every((p) => !p.parentKey || keys.has(p.parentKey)));
  const tank = quickLayout({ shelves: 3, racks: 6, boxes: 4, rows: 10, cols: 10 }, 'tank');
  assert.equal(tank.filter((p) => p.kind === 'shelf').length, 0);
  assert.equal(tank.find((p) => p.kind === 'rack').name, 'Tour A');
  assert.equal(tank.find((p) => p.kind === 'box').rows, 10);
});

test('export : stockage.csv lisible dans un tableur', async () => {
  const { storageCsv } = await import('../src/routes/export.js');
  const units = [{ id: 'f', parent_id: null, kind: 'freezer', name: 'Thor', temperature: -80 }, { id: 'b', parent_id: 'f', kind: 'box', name: 'Boîte "1"', rows: 9, cols: 9 }];
  const csv = storageCsv(units, [
    { code: 'ECH-0001', name: 'pUC19', type: 'plasmid', unit_id: 'b', row: 2, col: 4, thaw_count: 1, status: 'out', archived: false },
    { code: 'ECH-0002', name: 'jeté', type: 'other', unit_id: 'b', row: 0, col: 0, thaw_count: 0, archived: true },
  ]);
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(lines[1], /"ECH-0001";"pUC19";"Plasmide";"−80 °C Thor › Boîte ""1""";"C5"/);
  assert.match(lines[1], /"oui"$/);
});
