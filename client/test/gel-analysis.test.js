// Moteur d'analyse de gel : vérifié sur des gels synthétiques dont les quantités sont connues.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { synthGel } from './gel-synth.js';
import { detectLanes, detectPolarity, prepareImage } from '../src/lib/gel/raster.js';
import { autoAssign, fitCalibration, formatSize, sizeAxis } from '../src/lib/gel/calibration.js';
import { stoichiometry } from '../src/lib/gel/quant.js';
import { proteinMass, proteinsOf, translate } from '../src/lib/gel/protein.js';
import { buildSummary, computeProfiles, computeResults, guessLadder, newAnalysis } from '../src/lib/gel/model.js';

const near = (got, exp, tol, what) => assert.ok(Math.abs(got - exp) <= tol, `${what} : ${got} au lieu de ${exp} (± ${tol})`);
const lane = (id, x, extra = {}) => ({ id, name: id, xTop: x, xBot: x, role: 'sample', ...extra });

function analyse(img, patch = {}) {
  const state = { ...newAnalysis(patch.mode ?? 'protein'), laneWidth: 20, ...patch };
  const profiles = computeProfiles(img, state);
  return { state, profiles, results: computeResults(profiles, state, { bits: 16 }) };
}

test('pourcentages exacts, et indépendants du contraste d’affichage', () => {
  const img = synthGel({ lanes: [{ x: 200, bands: [{ y: 120, amount: 100 }, { y: 250, amount: 60 }, { y: 380, amount: 20 }] }], noise: 150 });
  const a = analyse(img, { lanes: [lane('A', 200)] });
  const pct = a.results.lanes[0].bands.map((b) => b.percent);
  assert.equal(pct.length, 3);
  near(pct[0], 55.6, 1.5, 'bande 1');
  near(pct[1], 33.3, 1.5, 'bande 2');
  near(pct[2], 11.1, 1.5, 'bande 3');
  // Les réglages d'affichage ne sont pas des entrées du calcul
  const b = analyse(img, { lanes: [lane('A', 200)], display: { low: 30000, high: 40000, invert: true, colormap: 'gray' } });
  assert.deepEqual(b.results.lanes[0].bands.map((x) => x.percent), pct);
});

test('sens des bandes détecté : Coomassie (sombres) et fluorescence (claires) donnent les mêmes proportions', () => {
  const bands = [{ y: 150, amount: 80 }, { y: 320, amount: 40 }];
  const dark = synthGel({ lanes: [{ x: 200, bands }], polarity: 'dark' });
  const light = synthGel({ lanes: [{ x: 200, bands }], polarity: 'light' });
  assert.equal(detectPolarity(dark), 'dark');
  assert.equal(detectPolarity(light), 'light');
  const pd = analyse(dark, { lanes: [lane('A', 200)] }).results.lanes[0].bands.map((b) => b.percent);
  const pl = analyse(light, { lanes: [lane('A', 200)] }).results.lanes[0].bands.map((b) => b.percent);
  near(pd[0], 66.7, 1, 'sombre');
  near(pl[0], 66.7, 1, 'claire');
});

test('détection automatique des pistes', () => {
  const xs = [40, 85, 130, 175, 220, 265, 310, 355];
  const img = synthGel({ lanes: xs.map((x, i) => ({ x, bands: [{ y: 100 + i * 5, amount: 60 }, { y: 300, amount: 30 + i * 10 }] })), laneWidth: 28, noise: 100 });
  const found = detectLanes(img);
  assert.equal(found.lanes.length, xs.length);
  found.lanes.forEach((x, i) => near(x, xs[i], 3, `piste ${i + 1}`));
  assert.ok(found.width >= 12 && found.width <= 30, `largeur ${found.width}`);
});

test('étalonnage log-linéaire : taille d’une bande inconnue', () => {
  // Migration : y = 450 − 160 × log10(kDa)
  const ladder = [250, 130, 100, 70, 55, 35, 25, 15, 10];
  const y = (kDa) => 450 - 160 * Math.log10(kDa);
  const img = synthGel({ lanes: [{ x: 100, bands: ladder.map((k) => ({ y: y(k), amount: 40, sigma: 3 })) }, { x: 250, bands: [{ y: y(42), amount: 60, sigma: 3 }] }] });
  const base = analyse(img, { lanes: [lane('M', 100, { role: 'ladder' }), lane('S', 250)] });
  const ladderApexes = base.profiles.lanes[0].bands.map((b) => b.apex);
  const points = autoAssign(ladderApexes, ladder);
  assert.equal(points.length, ladder.length);
  const state = { ...base.state, calibration: { ladder: { name: 'test', bands: ladder.map((size) => ({ size })) }, laneId: 'M', points, method: 'linear' } };
  const results = computeResults(base.profiles, state, { bits: 16 });
  assert.ok(results.calibration.r2 > 0.999);
  near(results.lanes[1].bands[0].size, 42, 0.8, 'taille estimée');
  assert.equal(formatSize(results.lanes[1].bands[0].size, 'kDa'), '42 kDa');
});

test('attribution automatique : bande du haut sortie du gel, front de migration détecté en trop', () => {
  const sizes = [250, 130, 100, 70, 55, 35, 25, 15, 10];
  const pos = (k) => 450 - 160 * Math.log10(k);
  const detected = [...sizes.slice(1).map(pos), 470]; // 250 absent, front de migration à 470
  const pairs = autoAssign(detected, sizes);
  assert.deepEqual(pairs.map((p) => p.size), sizes.slice(1));
});

test('ADN : interpolation entre marqueurs exacte aux marqueurs, fidèle entre eux', () => {
  // Migration sigmoïde en log(pb), typique de l'agarose
  const y = (bp) => 60 + 420 / (1 + Math.exp(2.2 * (Math.log10(bp) - 3.2)));
  const ladder = [10000, 8000, 6000, 5000, 4000, 3000, 2000, 1500, 1000, 500];
  const cal = fitCalibration(ladder.map((size) => ({ size, pos: y(size) })), 'interp');
  for (const s of ladder) near(cal.sizeAt(y(s)), s, s * 1e-9, `marqueur ${s}`);
  near(cal.sizeAt(y(2500)), 2500, 2500 * 0.03, 'fragment de 2,5 kb');
  near(cal.posAt(1500), y(1500), 0.01, 'position inverse');
  assert.equal(formatSize(2500, 'pb'), '2,5 kb');
  assert.equal(formatSize(750, 'pb'), '750 pb');
});

test('correction de courbure : une même bande a la même taille au centre et au bord', () => {
  const ladder = [100, 70, 50, 35, 25];
  const y = (k) => 450 - 180 * Math.log10(k);
  const mk = (x) => ({ x, bands: ladder.map((k) => ({ y: y(k), amount: 40, sigma: 3 })) });
  const img = synthGel({ width: 420, lanes: [mk(30), { x: 210, bands: [{ y: y(60), amount: 50, sigma: 3 }] }, { x: 390, bands: [{ y: y(60), amount: 50, sigma: 3 }] }], smile: 18 });
  const lanes = [lane('M', 30, { role: 'ladder' }), lane('C', 210), lane('B', 390)];
  const measure = (warp) => {
    const base = analyse(img, { lanes, warp });
    const points = autoAssign(base.profiles.lanes[0].bands.map((b) => b.apex), ladder);
    const results = computeResults(base.profiles, { ...base.state, calibration: { ladder: { name: 't' }, laneId: 'M', points, method: 'linear' } }, {});
    return [results.lanes[1].bands[0].size, results.lanes[2].bands[0].size];
  };
  const [center] = measure([]);
  assert.ok(Math.abs(center / 60 - 1) > 0.1, 'sans correction, la courbure fausse la taille au centre');
  // Deux courbes d'iso-migration tracées le long de deux bandes du marqueur prolongées
  const curve = (k) => ({ id: String(k), points: [0, 105, 210, 315, 419].map((x) => ({ x, y: y(k) + 18 * ((x - 209.5) / 209.5) ** 2 })) });
  const [c2, b2] = measure([curve(100), curve(25)]);
  near(c2, 60, 1.5, 'centre corrigé');
  near(b2, 60, 1.5, 'bord corrigé');
});

test('western blot : normalisation par le contrôle de charge et une piste de référence', () => {
  // Cible ×1, ×2, ×4 ; dépôts inégaux (contrôle de charge 1, 0,5, 1,5)
  const load = [1, 0.5, 1.5];
  const target = [1, 2, 4];
  const xs = [80, 200, 320];
  const img = synthGel({ polarity: 'light', lanes: xs.map((x, i) => ({ x, bands: [{ y: 150, amount: 20 * target[i] * load[i] }, { y: 350, amount: 60 * load[i] }] })) });
  const base = analyse(img, { mode: 'western', lanes: xs.map((x, i) => lane(`L${i}`, x)) });
  const g = base.profiles.lanes[0].bands;
  const state = { ...base.state, quant: { ...base.state.quant, values: 'normalized', referenceLane: 'L0', loadingControl: { pos: g[1].apex } } };
  const r = computeResults(base.profiles, state, {});
  const targetRow = r.rows.find((row) => !row.isLoadingControl);
  targetRow.cells.forEach((c, i) => near(c.value, target[i], 0.06 * target[i], `piste ${i + 1}`));
  const summary = buildSummary(state, r);
  assert.deepEqual(summary.table.columns, ['Bande', 'L0', 'L1', 'L2']);
  assert.match(summary.table.rows.find((row) => row[0].includes('contrôle de charge'))[0], /contrôle de charge/);
  // Bandes nommées (sans marqueur : « Bande 1 », « Bande 2 » par défaut)
  assert.deepEqual(r.rows.map((row) => row.label), ['Bande 1', 'Bande 2']);
  const named = computeResults(base.profiles, { ...state, bandNames: [{ pos: g[0].apex + 2, name: 'p-ERK' }, { pos: g[1].apex, name: ' GAPDH ' }] }, {});
  assert.deepEqual(named.rows.map((row) => row.label), ['p-ERK', 'GAPDH']);
  assert.equal(buildSummary(state, named).table.rows[1][0], 'GAPDH (contrôle de charge)');
});

test('marqueur repéré à ses nombreuses bandes, au bord du gel', () => {
  const ladder = { bands: [60, 110, 160, 210, 260, 310, 360].map((y) => ({ y, amount: 40 })) };
  const few = (y) => ({ bands: [{ y, amount: 80 }] });
  const xs = [50, 130, 210, 290];
  const at = (spec) => synthGel({ width: 340, lanes: spec.map((l, i) => ({ x: xs[i], ...l })) });
  const lanes = xs.map((x, i) => lane(`L${i}`, x));
  const state = { ...newAnalysis('protein'), laneWidth: 20 };
  assert.equal(guessLadder(at([ladder, few(200), few(220), few(240)]), state, lanes, 20), 0);
  assert.equal(guessLadder(at([few(200), few(220), few(240), ladder]), state, lanes, 20), 3);
  assert.equal(guessLadder(at([few(200), few(220), few(240), few(260)]), state, lanes, 20), null, 'western sans marqueur');
});

test('gamme étalon de BSA : quantité d’une bande inconnue', () => {
  const amounts = [0.5, 1, 2];
  const xs = [60, 150, 240, 330];
  const img = synthGel({ lanes: [...amounts.map((a, i) => ({ x: xs[i], bands: [{ y: 250, amount: 40 * a }] })), { x: 330, bands: [{ y: 250, amount: 40 * 1.5 }] }] });
  const base = analyse(img, { lanes: xs.map((x, i) => lane(`L${i}`, x)) });
  const state = {
    ...base.state,
    quant: { ...base.state.quant, values: 'amount', standards: { source: 'group', group: { pos: base.profiles.lanes[0].bands[0].apex }, amounts: { L0: '0,5', L1: '1', L2: '2' } } },
  };
  const r = computeResults(base.profiles, state, {});
  assert.ok(r.standard.r2 > 0.99);
  near(r.rows[0].cells[3].value, 1.5, 0.05, 'quantité estimée (µg)');
  assert.equal(r.rows[0].cells[3].outOfRange, false);
});

test('gamme étalon sans bande choisie : la bande présente dans les pistes de gamme est prise', () => {
  const xs = [60, 150, 240, 330];
  // Contaminant à y = 120 dans l'échantillon seulement : il ne doit pas servir de gamme
  const img = synthGel({ lanes: [...[0.5, 1, 2].map((a, i) => ({ x: xs[i], bands: [{ y: 250, amount: 40 * a }] })), { x: 330, bands: [{ y: 120, amount: 90 }, { y: 250, amount: 60 }] }] });
  const base = analyse(img, { lanes: xs.map((x, i) => lane(`L${i}`, x)) });
  const quant = { ...base.state.quant, values: 'amount', standards: { source: 'group', group: null, amounts: { L0: '0,5', L1: '1', L2: '2', L3: '' } } };
  const r = computeResults(base.profiles, { ...base.state, quant }, {});
  assert.equal(r.standardAuto, true);
  near(r.standardGroup.pos, 250, 6, 'bande de gamme');
  assert.equal(r.standard.n, 3, 'la piste laissée vide n’est pas un point');
  near(r.rows.find((x) => x.group === r.standardGroup).cells[3].value, 1.5, 0.05, 'quantité estimée (µg)');
  // Bande choisie absente d'une piste de gamme : signalé
  const wrong = { ...quant, standards: { ...quant.standards, group: { pos: r.rows.find((x) => x.group !== r.standardGroup).group.pos } } };
  assert.match(computeResults(base.profiles, { ...base.state, quant: wrong }, {}).warnings.join(' '), /non détectée dans les pistes L0, L1, L2/);
});

test('bande saturée signalée', () => {
  const img = synthGel({ lanes: [{ x: 200, bands: [{ y: 200, amount: 900 }, { y: 350, amount: 50 }] }] });
  const r = analyse(img, { lanes: [lane('A', 200)] }).results;
  assert.equal(r.lanes[0].bands[0].saturated, true);
  assert.equal(r.lanes[0].bands[1].saturated, false);
  assert.ok(r.warnings.some((w) => /saturée/.test(w)));
});

test('bandes ajoutées et retirées à la main', () => {
  const img = synthGel({ lanes: [{ x: 200, bands: [{ y: 150, amount: 80 }, { y: 300, amount: 3 }] }], noise: 50 });
  const auto = analyse(img, { lanes: [lane('A', 200)], detection: { sensitivity: 0.2, background: 'rollingball' } });
  assert.equal(auto.results.lanes[0].bands.length, 1, 'la bande faible n’est pas détectée à faible sensibilité');
  const edited = analyse(img, { lanes: [lane('A', 200)], detection: { sensitivity: 0.2, background: 'rollingball' }, edits: { A: { added: [298], removed: [150] } } });
  const bands = edited.results.lanes[0].bands;
  assert.equal(bands.length, 1);
  near(bands[0].apex, 300, 2, 'bande ajoutée recalée sur son sommet');
});

test('préparation : quart de tour et rognage', () => {
  const img = synthGel({ width: 60, height: 40, lanes: [] });
  img.data[0] = 1; // coin haut gauche
  const r = prepareImage(img, { rotate90: 90 });
  assert.equal(r.width, 40);
  assert.equal(r.height, 60);
  assert.equal(r.data[39], 1, 'le coin haut gauche passe en haut à droite');
  const c = prepareImage(img, { crop: { x: 10, y: 5, w: 20, h: 15 } });
  assert.equal(c.width, 20);
  assert.equal(c.height, 15);
});

test('stœchiométrie : 1 : 1,5 devient 2 : 3', () => {
  const st = stoichiometry([{ size: 50, area: 100 }, { size: 25, area: 75 }]);
  assert.deepEqual(st.integers, [2, 3]);
  assert.deepEqual(stoichiometry([{ size: 60, area: 120 }, { size: 30, area: 60 }]).integers, [1, 1]);
  // Digestion d'un plasmide : 1 : 1,14 mesuré reste 1 : 1 (pas « 5 : 6 »)
  assert.deepEqual(stoichiometry([{ size: 1920, area: 576 }, { size: 745, area: 255 }]).integers, [1, 1]);
});

test('axe des tailles : une seule unité', () => {
  const dna = sizeAxis([10000, 3000, 500], 'pb');
  assert.equal(dna.unit, 'kb');
  assert.deepEqual([10000, 1500, 500].map(dna.label), ['10', '1,5', '0,5']);
  assert.deepEqual([250, 3.5].map(sizeAxis([250, 3.5], 'kDa').label), ['250', '3,5']);
  assert.equal(sizeAxis([700, 100], 'pb').unit, 'pb');
});

test('protéine attendue : traduction et masse moyenne', () => {
  assert.equal(translate('ATGGCTTAAGGG'), 'MA');
  // Ubiquitine humaine : 8 564,8 Da (masse moyenne)
  near(proteinMass('MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG'), 8564.8, 0.5, 'ubiquitine');
  // CDS sur le brin complémentaire, lu depuis le registre
  const cds = 'ATGCATCATCACCATCACCATTAA'; // M H H H H H H stop
  const rc = [...cds].reverse().map((c) => ({ A: 'T', T: 'A', G: 'C', C: 'G' })[c]).join('');
  const seq = { sequence: `GG${rc}CC`, features: [{ id: 'f', name: 'His6', type: 'CDS', strand: -1, segments: [{ start: 2, end: 2 + rc.length - 1 }] }] };
  const [p] = proteinsOf(seq);
  assert.equal(p.protein, 'MHHHHHH');
});

test('graphiques de la figure : SVG bien formés, graduations en tailles', async () => {
  const { profilesSvg, calibrationSvg, standardSvg } = await import('../src/lib/gel/figure.js');
  const ladder = [100, 70, 50, 35, 25];
  const y = (k) => 450 - 180 * Math.log10(k);
  const img = synthGel({ lanes: [{ x: 100, bands: ladder.map((k) => ({ y: y(k), amount: 40, sigma: 3 })) }, { x: 250, bands: [{ y: y(60), amount: 50, sigma: 3 }] }] });
  const base = analyse(img, { lanes: [lane('M', 100, { role: 'ladder' }), lane('S', 250, { name: 'IP <anti-GFP>' })] });
  const points = autoAssign(base.profiles.lanes[0].bands.map((b) => b.apex), ladder);
  const state = { ...base.state, calibration: { ladder: { name: 't', bands: ladder.map((size) => ({ size })) }, laneId: 'M', points, method: 'linear' } };
  const results = computeResults(base.profiles, state, {});
  const svg = profilesSvg(state, base.profiles, results);
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, />70</, 'graduation à 70 kDa');
  assert.match(svg, /IP &lt;anti-GFP&gt;/, 'nom de piste échappé');
  assert.equal((svg.match(/<svg/g) ?? []).length, (svg.match(/<\/svg>/g) ?? []).length);
  assert.match(calibrationSvg(state, base.profiles, results), /R² = /);
  assert.equal(standardSvg(state, results), null, 'pas de gamme, pas de graphique');
});

test('détection des pistes : pistes à une seule bande ou presque vides comprises', () => {
  const xs = [50, 110, 170, 230, 290, 350];
  const img = synthGel({
    width: 400,
    lanes: [
      { x: xs[0], bands: [100, 150, 200, 250, 300, 350, 400].map((y) => ({ y, amount: 60 })) }, // lysat : beaucoup de bandes
      { x: xs[1], bands: [{ y: 260, amount: 150 }] }, // élution : une bande
      { x: xs[2], bands: [{ y: 200, amount: 1.5 }] }, // lavage : presque vide
      { x: xs[3], bands: [{ y: 220, amount: 40 }] },
      { x: xs[4], bands: [{ y: 220, amount: 80 }] },
      { x: xs[5], bands: [150, 250, 350].map((y) => ({ y, amount: 50 })) },
    ],
    laneWidth: 34,
    noise: 120,
  });
  const found = detectLanes(img);
  assert.equal(found.lanes.length, xs.length);
  found.lanes.forEach((x, i) => near(x, xs[i], 4, `piste ${i + 1}`));
});

test('bornes d’intégration réglées à la main : l’aire suit, les autres bandes non', () => {
  const img = synthGel({ lanes: [{ x: 200, bands: [{ y: 150, amount: 60 }, { y: 300, amount: 60 }] }] });
  const base = analyse(img, { lanes: [lane('A', 200)] });
  const [b1, b2] = base.profiles.lanes[0].bands;
  const narrow = { ...base.state, edits: { A: { bounds: [{ apex: b1.apex, left: b1.apex - 3, right: b1.apex + 3 }] } } };
  const p = computeProfiles(img, narrow);
  const [n1, n2] = p.lanes[0].bands;
  assert.equal(n1.manual, true);
  assert.equal(n1.left, b1.apex - 3);
  assert.ok(n1.area < b1.area * 0.8, 'bande rétrécie : aire plus petite');
  near(n2.area, b2.area, b2.area * 0.02, 'l’autre bande ne change pas');
});

test('mémoire des profils : mêmes résultats, et seule la piste déplacée est relue', async () => {
  const { createProfileCache } = await import('../src/lib/gel/model.js');
  const img = synthGel({ lanes: [80, 200, 320].map((x) => ({ x, bands: [{ y: 150, amount: 50 }, { y: 320, amount: 30 }] })) });
  const state = { ...newAnalysis('protein'), laneWidth: 20, lanes: [80, 200, 320].map((x, i) => lane(`L${i}`, x)) };
  const cache = createProfileCache();
  const a = computeProfiles(img, state, cache);
  assert.deepEqual(a.lanes.map((l) => l.bands.map((b) => b.area)), computeProfiles(img, state).lanes.map((l) => l.bands.map((b) => b.area)));
  const scans = cache.scans.size;
  const moved = { ...state, lanes: state.lanes.map((l, i) => (i === 1 ? { ...l, xTop: 203, xBot: 203 } : l)) };
  computeProfiles(img, moved, cache);
  assert.equal(cache.scans.size, scans + 1, 'une seule piste relue');
  const tuned = { ...state, detection: { ...state.detection, sensitivity: 0.8 } };
  computeProfiles(img, tuned, cache);
  assert.equal(cache.scans.size, scans + 1, 'la sensibilité ne relit pas l’image');
});

test('fond rolling ball : le calcul linéaire donne la même ouverture que le calcul direct', async () => {
  const { rollingBall, slidingExtreme } = await import('../src/lib/gel/profile.js');
  const p = Float32Array.from({ length: 400 }, (_, i) => 100 + 40 * Math.sin(i / 17) + (i % 37 === 0 ? 80 : 0) + ((i * 7919) % 13));
  const r = 15;
  const ero = p.map((_, i) => Math.min(...p.slice(Math.max(0, i - r), i + r + 1)));
  const dil = ero.map((_, i) => Math.max(...ero.slice(Math.max(0, i - r), i + r + 1)));
  assert.deepEqual(Array.from(slidingExtreme(p, r, false)), Array.from(ero), 'minimum glissant exact');
  assert.deepEqual(Array.from(slidingExtreme(ero, r, true)), Array.from(dil), 'maximum glissant exact');
  const got = rollingBall(p, r);
  // rollingBall lisse ensuite l'ouverture et la borne par le profil : on compare avant lissage via un profil plat
  const flat = rollingBall(new Float32Array(400).fill(5), r);
  assert.ok(flat.every((v) => Math.abs(v - 5) < 1e-4));
  for (let i = r; i < 400 - r; i += 1) assert.ok(got[i] <= p[i] + 1e-4, 'le fond ne dépasse jamais le profil');
  const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
  near(mean(got), mean(dil.map((v, i) => Math.min(v, p[i]))), 3, 'ouverture morphologique');
});

test('courbes normalisées : maximum 1 ou aire totale 100', async () => {
  const { traceOf, panelWidths } = await import('../src/lib/gel/figure.js');
  const img = synthGel({ lanes: [{ x: 200, bands: [{ y: 150, amount: 60 }, { y: 300, amount: 20 }] }] });
  const l = analyse(img, { lanes: [lane('A', 200)] }).profiles.lanes[0];
  near(traceOf(l, { normalize: 'max' }).max, 1, 1e-6, 'maximum');
  near(traceOf(l, { normalize: 'area' }).v.reduce((t, v) => t + v, 0), 100, 1e-3, 'aire');
  assert.deepEqual(panelWidths([1000, 500], 'row'), [66.7, 33.3]);
  assert.deepEqual(panelWidths([1000, 500]), [100, 50]);
});

test('analyse enregistrée par une version précédente : nouveaux réglages par défaut, anciens gardés', async () => {
  const { normalizeAnalysis } = await import('../src/lib/gel/model.js');
  const old = { ...newAnalysis('dna'), figure: { panels: { gel: true, profiles: false, table: true }, gel: { overlay: 'lines' }, layout: 'row', width: 75 } };
  delete old.bandNames;
  const s = normalizeAnalysis(old);
  assert.equal(s.figure.gel.overlay, 'lines');
  assert.equal(s.figure.layout, 'row');
  assert.equal(s.figure.panels.profiles, false);
  assert.equal(s.figure.style.fontSize, 14);
  assert.equal(s.figure.gel.labelAngle, 'auto');
  assert.deepEqual(s.figure.order, ['gel', 'profiles', 'calibration', 'standards']);
  assert.deepEqual(s.bandNames, []);
});
