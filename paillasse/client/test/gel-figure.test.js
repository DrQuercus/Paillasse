// Figure de gel entière (un seul fichier) et placement des étiquettes sans chevauchement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeFigureSvg, layoutPanels, wrapText } from '../src/lib/gel/compose.js';
import { spreadLabels } from '../src/lib/gel/layout.js';

const PANEL = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="M0,0L${w},${h}"/></svg>`;

test('étiquettes : écart minimal garanti, ordre gardé, bornes respectées', () => {
  const ys = [100, 104, 103, 200, 50];
  const out = spreadLabels(ys, 12);
  // Chaque étiquette reste attachée à sa valeur d'origine (même indice)
  const order = ys.map((y, i) => i).sort((a, b) => ys[a] - ys[b]);
  for (let k = 1; k < order.length; k += 1) assert.ok(out[order[k]] - out[order[k - 1]] >= 12 - 1e-9, `écart ${k}`);
  assert.equal(out[4], 50); // seule, elle ne bouge pas
  assert.equal(out[3], 200);
  // Rien ne bouge quand il y a la place
  assert.deepEqual(spreadLabels([10, 40, 90], 12), [10, 40, 90]);
  // Bornes : le groupe est repoussé vers l'intérieur
  const packed = spreadLabels([95, 96, 97], 10, 0, 100);
  assert.ok(Math.max(...packed) <= 100 && packed.every((y, i, a) => i === 0 || y - a[i - 1] >= 10));
  const low = spreadLabels([0, 1, 2], 10, 5, 100);
  assert.ok(Math.min(...low) >= 5);
  assert.deepEqual(spreadLabels([], 10), []);
});

test('mise en page des panneaux : colonne, côte à côte, grille', () => {
  const panels = [{ width: 400, height: 300 }, { width: 600, height: 200 }, { width: 500, height: 100 }];
  const col = layoutPanels(panels, 'column', 10);
  assert.deepEqual(col.boxes.map((b) => [b.x, b.y]), [[0, 0], [0, 310], [0, 520]]);
  assert.equal(col.width, 600);
  assert.equal(col.height, 620);
  const row = layoutPanels(panels, 'row', 10);
  assert.deepEqual(row.boxes.map((b) => [b.x, b.y]), [[0, 0], [410, 0], [1020, 0]]);
  assert.equal(row.width, 1520);
  assert.equal(row.height, 300);
  const grid = layoutPanels(panels, 'grid', 10);
  assert.deepEqual(grid.boxes.map((b) => [b.x, b.y]), [[0, 0], [410, 0], [0, 310]]);
  assert.equal(grid.width, 1010);
  assert.equal(grid.height, 410);
  assert.deepEqual(layoutPanels([], 'grid'), { boxes: [], width: 0, height: 0 });
});

test('découpe des notes en lignes', () => {
  const measure = (t) => t.length * 10;
  assert.deepEqual(wrapText('un deux trois quatre', 10, 90, measure), ['un deux', 'trois', 'quatre']);
  assert.deepEqual(wrapText('', 10, 90, measure), []);
  // Un mot plus long que la ligne reste entier
  assert.deepEqual(wrapText('anticonstitutionnellement ok', 10, 90, measure), ['anticonstitutionnellement', 'ok']);
});

test('figure entière : titre, panneaux vectoriels et images, tableau, notes', () => {
  const { svg, width, height } = composeFigureSvg({
    title: 'Purification <DegU> & co',
    subtitle: 'Protéines (SDS-PAGE)',
    panels: [
      { kind: 'image', href: 'data:image/png;base64,AAAA', width: 500, height: 400 },
      { kind: 'svg', svg: PANEL(600, 300), width: 600, height: 300 },
    ],
    layout: 'row',
    table: { columns: ['Bande', 'Piste 1'], rows: [['68 kDa', '0,49 µg'], ['29 kDa', '—']] },
    notes: ['Tailles : marqueur PageRuler, 9 bandes.'],
  });
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(svg.endsWith('</svg>'));
  // Texte échappé, jamais de balise injectée
  assert.ok(svg.includes('Purification &lt;DegU&gt; &amp; co'));
  assert.ok(!svg.includes('<DegU>'));
  // Panneaux côte à côte : image à gauche, graphique vectoriel imbriqué à droite
  assert.match(svg, /<image x="24" y="[\d.]+" width="500" height="400"[^>]*href="data:image\/png;base64,AAAA"/);
  assert.match(svg, /<svg x="540" y="[\d.]+" xmlns="http:\/\/www.w3.org\/2000\/svg" width="600" height="300"/);
  assert.ok(svg.includes('<path d="M0,0L600,300"/>'));
  // Largeur : panneaux + marges ; hauteur : tout y tient
  assert.equal(width, 24 + 500 + 16 + 600 + 24);
  assert.ok(height > 400 + 3 * 20);
  for (const text of ['Bande', '68 kDa', '0,49 µg', 'Tailles : marqueur PageRuler, 9 bandes.', 'Protéines (SDS-PAGE)']) {
    assert.ok(svg.includes(`>${text}</text>`), text);
  }
  // Balises équilibrées (SVG bien formé pour Inkscape / Illustrator)
  const open = (svg.match(/<svg\b/g) ?? []).length;
  assert.equal(open, (svg.match(/<\/svg>/g) ?? []).length);
  assert.equal((svg.match(/<text\b/g) ?? []).length, (svg.match(/<\/text>/g) ?? []).length);
});

test('figure entière : grille et colonne, sans tableau ni titre', () => {
  const panels = [
    { kind: 'svg', svg: PANEL(300, 200), width: 300, height: 200 },
    { kind: 'svg', svg: PANEL(300, 100), width: 300, height: 100 },
    { kind: 'svg', svg: PANEL(300, 100), width: 300, height: 100 },
  ];
  const grid = composeFigureSvg({ panels, layout: 'grid' });
  assert.equal(grid.width, 24 + 300 + 16 + 300 + 24);
  assert.match(grid.svg, /<svg x="24" y="24"/);
  assert.match(grid.svg, /<svg x="340" y="24"/);
  assert.match(grid.svg, /<svg x="24" y="240"/);
  const col = composeFigureSvg({ panels, layout: 'column' });
  // Largeur minimale lisible même pour un panneau étroit
  assert.equal(col.width, 360 + 48);
  assert.ok(col.height >= 24 + 200 + 16 + 100 + 16 + 100 + 24);
  assert.ok(!col.svg.includes('font-weight="bold"'));
});

test('redressement : les pistes tournent exactement avec l’image (rognée ou non)', async () => {
  const { prepareImage } = await import('../src/lib/gel/raster.js');
  const { newAnalysis, rotateGeometry } = await import('../src/lib/gel/model.js');
  const w = 301;
  const h = 221;
  const data = new Float32Array(w * h).fill(10);
  // Deux points brillants par piste, en haut et en bas de la zone de migration
  const cols = [70, 150, 230];
  const rows = [40, 180];
  for (const x of cols) for (const y of rows) for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) data[(y + dy) * w + x + dx] = 1000;
  const src = { width: w, height: h, data, maxValue: 1000, bits: 16 };
  const brightest = (img, near) => {
    let best = null;
    for (let y = 0; y < img.height; y += 1) {
      for (let x = 0; x < img.width; x += 1) {
        if (Math.hypot(x - near[0], y - near[1]) > 12) continue;
        const v = img.data[y * img.width + x];
        if (!best || v > best.v) best = { x, y, v };
      }
    }
    return best;
  };
  for (const crop of [null, { x: 20, y: 12, w: 260, h: 200 }]) {
    const off = crop ?? { x: 0, y: 0 };
    const state = {
      ...newAnalysis('protein'),
      prep: { ...newAnalysis('protein').prep, angle: -1, crop },
      region: { top: rows[0] - off.y, bottom: rows[1] - off.y },
      lanes: cols.map((x, i) => ({ id: `l${i}`, name: String(i), xTop: x - off.x, xBot: x - off.x, role: 'sample' })),
    };
    const size = { width: w, height: h };
    const work = crop ? { width: crop.w, height: crop.h } : size;
    // Deux redressements successifs (0 → -1°, puis -1° → 2,5°) : les rotations se composent exactement
    const at0 = rotateGeometry({ ...state, prep: { ...state.prep, angle: 0 } }, size, 0, -1, work);
    const after = rotateGeometry(at0, size, -1, 2.5, work);
    const img = prepareImage(src, { angle: 2.5, crop });
    after.lanes.forEach((lane, i) => {
      for (const y0 of rows) {
        // Point brillant attendu : là où la rotation l'a emporté
        const t = (2.5 * Math.PI) / 180;
        const dx = cols[i] - (w - 1) / 2;
        const dy = y0 - (h - 1) / 2;
        const px = (w - 1) / 2 + dx * Math.cos(t) - dy * Math.sin(t) - off.x;
        const py = (h - 1) / 2 + dx * Math.sin(t) + dy * Math.cos(t) - off.y;
        const b = brightest(img, [px, py]);
        const { top, bottom } = after.region;
        const xOnLane = lane.xTop + ((lane.xBot - lane.xTop) * (b.y - top)) / (bottom - top);
        assert.ok(Math.abs(xOnLane - b.x) <= 1.5, `piste ${i}, ${crop ? 'rognée' : 'entière'} : ${xOnLane.toFixed(1)} au lieu de ${b.x}`);
      }
    });
    assert.deepEqual(after.calibration.points, []);
  }
  // Sans changement d'angle, rien ne bouge
  const s0 = { ...newAnalysis('protein'), lanes: [{ id: 'a', xTop: 10, xBot: 12 }] };
  assert.equal(rotateGeometry(s0, { width: 100, height: 100 }, 1, 1), s0);
});
