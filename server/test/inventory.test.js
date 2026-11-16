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
  // Tiroirs : rack › tiroir › boîte (−80), sur une étagère ou directement dans un appareil ; pas dans une cuve
  assert.ok(canContain('rack', 'drawer'));
  assert.ok(canContain('shelf', 'drawer'));
  assert.ok(canContain('freezer', 'drawer'));
  assert.ok(canContain('drawer', 'box'));
  assert.ok(canContain('drawer', 'bag'));
  assert.ok(!canContain('drawer', 'rack'));
  assert.ok(!canContain('drawer', 'drawer'));
  assert.ok(!canContain('tank', 'drawer'));
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

test('aménagement rapide avec tiroirs : étagère › rack › tiroir › boîte', () => {
  const plan = quickLayout({ shelves: 2, racks: 3, drawers: 4, boxes: 5 }, 'freezer');
  const count = (k) => plan.filter((p) => p.kind === k).length;
  assert.deepEqual([count('shelf'), count('rack'), count('drawer'), count('box')], [2, 6, 24, 120]);
  const byKey = new Map(plan.map((p) => [p.key, p]));
  assert.ok(plan.filter((p) => p.kind === 'drawer').every((d) => byKey.get(d.parentKey).kind === 'rack'));
  assert.ok(plan.filter((p) => p.kind === 'box').every((b) => byKey.get(b.parentKey).kind === 'drawer'));
  assert.deepEqual(plan.slice(0, 4).map((p) => p.name), ['Étagère 1', 'Rack A', 'Tiroir 1', 'Boîte 1']);
  // Sans rack : tiroirs directement dans l'appareil (congélateur −20 à tiroirs)
  const m20 = quickLayout({ drawers: 6, boxes: 6 }, 'freezer');
  assert.deepEqual([m20.filter((p) => p.kind === 'drawer').length, m20.filter((p) => p.kind === 'box').length], [6, 36]);
  assert.ok(m20.filter((p) => p.kind === 'drawer').every((d) => !d.parentKey));
  // Une cuve d'azote n'a pas de tiroirs, même demandés
  assert.equal(quickLayout({ racks: 2, drawers: 3, boxes: 2 }, 'tank').filter((p) => p.kind === 'drawer').length, 0);
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

test('cryo-EM : positions des boîtes à grilles', async () => {
  const { positionLabel, isClippedPosition, cleanUnit, GRIDBOX_FORMATS } = await import('../src/lib/inventory.js');
  const g4c4 = { kind: 'gridbox', format: 'g4c4', rows: 1, cols: 8 };
  assert.deepEqual(Array.from({ length: 8 }, (_, c) => positionLabel(g4c4, 0, c)), ['C1', 'C2', 'C3', 'C4', 'N1', 'N2', 'N3', 'N4']);
  assert.equal(positionLabel({ kind: 'gridbox', format: 'g12' }, 0, 11), '12');
  assert.ok(isClippedPosition(g4c4, 2) && !isClippedPosition(g4c4, 5));
  assert.ok(isClippedPosition({ format: 'g4c' }, 0) && !isClippedPosition({ format: 'g4' }, 0));
  assert.deepEqual(cleanUnit({ name: '7', format: 'g12' }, { kind: 'gridbox' }).fields, { name: '7', temperature: null, style: '', color: '', notes: '', format: 'g12', rows: 1, cols: 12 });
  assert.match(cleanUnit({ name: '7' }, { kind: 'gridbox' }).error, /type de boîte/);
  assert.match(cleanUnit({ name: '3', capacity: 40 }, { kind: 'puck' }).error, /1 à 16/);
  assert.equal(Object.keys(GRIDBOX_FORMATS).length, 4);
});

test('cryo-EM : chemin dewar › canister › puck (niveau) › boîte (case) › grille', async () => {
  const { locationText, unitLabel, quickLayout, cleanDetails } = await import('../src/lib/inventory.js');
  const path = [
    { kind: 'tank', name: 'Dewar 1', temperature: -196 },
    { kind: 'canister', name: '3' },
    { kind: 'puck', name: '12', slot: 2 },
    { kind: 'gridbox', name: 'A7', slot: 5, format: 'g4' },
  ];
  assert.equal(locationText(path, 0, 2), '−196 °C Dewar 1 › Canister 3 › Puck 12 (niveau 2) › Boîte A7 (case 5) › grille 3');
  assert.equal(unitLabel({ kind: 'puck', name: '12' }), 'Puck 12');
  const plan = quickLayout({ canisters: 3, pucks: 4, firstPuck: 21 }, 'tank');
  assert.deepEqual(plan.filter((p) => p.kind === 'canister').map((p) => [p.name, p.capacity]), [['1', 4], ['2', 4], ['3', 4]]);
  assert.deepEqual(plan.filter((p) => p.kind === 'puck').map((p) => p.name).slice(0, 5), ['21', '22', '23', '24', '25']);
  assert.deepEqual(plan.find((p) => p.name === '26'), { key: 'c2/p2', parentKey: 'c2', kind: 'puck', name: '26', capacity: 12, slot: 2, sort: 2 });
  assert.deepEqual(cleanDetails({ support: ' Quantifoil R1.2/1.3 Cu 300 ', screening: 'good', bidule: 'x', blot_time: '' }), { support: 'Quantifoil R1.2/1.3 Cu 300', screening: 'good' });
  assert.deepEqual(cleanDetails({ screening: 'super' }), {});
});

test('cryo-EM : encart de grilles dans une entrée', async () => {
  const { sampleRefTitle, sampleRefCount, sampleRefText } = await import('../src/lib/inventory.js');
  const grids = { action: 'stored', samples: [{ type: 'grid', code: 'ECH-0007', name: 'Apoferritine', location: 'Canister 1 › Puck 3 (niveau 1) › Boîte 17 (case 2) › grille C1' }, { type: 'grid', code: 'ECH-0008', name: 'Apoferritine' }] };
  assert.equal(sampleRefTitle(grids), 'Grilles rangées');
  assert.equal(sampleRefTitle({ ...grids, action: 'cited' }), 'Grilles utilisées');
  assert.equal(sampleRefCount(grids), '2 grilles');
  assert.match(sampleRefText(grids), /^Grilles rangées : ECH-0007 Apoferritine, Canister 1 › Puck 3/);
  const mixed = { action: 'cited', samples: [{ type: 'grid', code: 'ECH-1' }, { type: 'protein', code: 'ECH-2' }] };
  assert.equal(sampleRefTitle(mixed), 'Tubes utilisés');
  assert.equal(sampleRefCount({ samples: [{ type: 'plasmid' }] }), '1 tube');
});
