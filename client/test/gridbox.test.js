// Plan des boîtes à grilles : autant de logements que de positions, dans la boîte, sans chevauchement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipEars, gridboxLayout } from '../src/lib/gridbox.js';
import { GRIDBOX_FORMATS, isClippedPosition } from '../src/lib/inventory.js';

// Points du contour d'un logement (oreilles comprises)
function outline(p) {
  const pts = [];
  if (p.shape === 'diamond') {
    const v = [[p.x, p.y - p.h / 2], [p.x + p.w / 2, p.y], [p.x, p.y + p.h / 2], [p.x - p.w / 2, p.y]];
    for (let i = 0; i < 4; i += 1) for (let t = 0; t < 1; t += 0.05) pts.push([v[i][0] + (v[(i + 1) % 4][0] - v[i][0]) * t, v[i][1] + (v[(i + 1) % 4][1] - v[i][1]) * t]);
    return pts;
  }
  const ring = (x, y, r) => { for (let a = 0; a < 360; a += 5) pts.push([x + r * Math.cos((a * Math.PI) / 180), y + r * Math.sin((a * Math.PI) / 180)]); };
  ring(p.x, p.y, p.w / 2);
  if (p.shape === 'clip') for (const e of clipEars(p)) ring(e.x, e.y, e.r);
  return pts;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

for (const format of Object.keys(GRIDBOX_FORMATS)) {
  test(`boîte ${format} : ${GRIDBOX_FORMATS[format].label}`, () => {
    const L = gridboxLayout(format);
    const box = { kind: 'gridbox', format };
    assert.equal(L.spots.length, GRIDBOX_FORMATS[format].size);
    L.spots.forEach((p, c) => assert.equal(p.clipped, isClippedPosition(box, c), `position ${c + 1}`));
    const shapes = L.spots.map(outline);
    shapes.forEach((pts, i) => {
      for (const q of pts) {
        assert.ok(dist(q, [50, 50]) < 49, `logement ${i + 1} dans la boîte`);
        assert.ok(dist(q, [50, 50]) > L.screw + 1, `logement ${i + 1} loin de la vis`);
        assert.ok(dist(q, [L.notch.x, L.notch.y]) > L.notch.r, `logement ${i + 1} hors du cran`);
      }
      // Numéro gravé dans la boîte, à côté de son logement mais sans le toucher
      const lab = [L.spots[i].lab.x, L.spots[i].lab.y];
      assert.ok(dist(lab, [50, 50]) < 47.5, `numéro ${i + 1} dans la boîte`);
      shapes.forEach((other) => { for (const q of other) assert.ok(Math.abs(q[0] - lab[0]) > 2.4 || Math.abs(q[1] - lab[1]) > 1.8, `numéro ${i + 1} sur un logement`); });
    });
    // Deux logements ne se chevauchent pas (sauf les paires de clippées de la boîte hybride, creusées ensemble)
    const merged = format === 'g4c4' ? ['0-1', '2-3'] : [];
    for (let i = 0; i < shapes.length; i += 1) {
      for (let j = i + 1; j < shapes.length; j += 1) {
        if (merged.includes(`${i}-${j}`)) continue;
        const gap = Math.min(...shapes[i].flatMap((a) => shapes[j].map((b) => dist(a, b))));
        assert.ok(gap > 1, `logements ${i + 1} et ${j + 1} : ${gap.toFixed(1)}`);
      }
    }
  });
}

test('boîte hybride : clippées à gauche, non clippées à droite, de haut en bas', () => {
  const { spots } = gridboxLayout('g4c4');
  assert.ok(spots.slice(0, 4).every((p) => p.x < 40 && p.shape === 'clip'));
  assert.ok(spots.slice(4).every((p) => p.x > 60 && p.shape === 'diamond'));
  for (const half of [spots.slice(0, 4), spots.slice(4)]) assert.deepEqual(half.map((p) => p.y), [...half.map((p) => p.y)].sort((a, b) => a - b));
});

test('boîte de 12 : 1 à 8 sur le pourtour, 9 à 12 autour de la vis', () => {
  const { spots } = gridboxLayout('g12');
  const r = (p) => Math.hypot(p.x - 50, p.y - 50);
  assert.ok(spots.slice(0, 8).every((p) => r(p) > 30));
  assert.ok(spots.slice(8).every((p) => r(p) < 20));
  // Sens des aiguilles d'une montre (y vers le bas : l'angle croît)
  const angles = spots.slice(0, 8).map((p) => Math.atan2(p.y - 50, p.x - 50));
  for (let i = 1; i < 8; i += 1) assert.ok(((angles[i] - angles[i - 1] + 2 * Math.PI) % (2 * Math.PI)) < Math.PI / 2);
});
