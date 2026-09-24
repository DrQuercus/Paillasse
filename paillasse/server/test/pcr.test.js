// PCR virtuelle : produits comparés à pydna (fixtures/pcr.golden.json, voir make-pcr-goldens.py),
// puis reconstitution de deux constructions réelles du labo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapGene } from '../src/lib/seq/snapgene.js';
import { normalizeSequenceData } from '../src/lib/seq/model.js';
import { simulatePcr } from '../src/lib/seq/pcr.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (f) => {
  const d = parseSnapGene(fs.readFileSync(path.join(dir, f)), f);
  return { ...normalizeSequenceData(d), name: d.name };
};
const cases = JSON.parse(fs.readFileSync(path.join(dir, 'pcr.golden.json'), 'utf8'));
const templates = new Map();
const template = (f) => {
  if (!templates.has(f)) templates.set(f, read(f));
  return templates.get(f);
};

test(`produits identiques à pydna sur les ${cases.length} combinaisons d'amorces des fichiers réels`, () => {
  const problems = [];
  for (const c of cases) {
    const r = simulatePcr(template(c.file), { name: c.forward, bases: c.forward_bases }, { name: c.reverse, bases: c.reverse_bases });
    const product = r.products[0];
    if (!product) {
      problems.push(`${c.file} ${c.forward} × ${c.reverse} : aucun produit (pydna : ${c.length} pb)`);
      continue;
    }
    if (product.sequence !== c.sequence) {
      problems.push(`${c.file} ${c.forward} × ${c.reverse} : ${product.length} pb au lieu de ${c.length} pb`);
    }
  }
  assert.deepEqual(problems, []);
});

test('mutagenèse dirigée : LR19 sur DegU sauvage introduit bien la mutation A35T', () => {
  const wt = read('DegU_WT.dna');
  const mutant = read('DegU32_Hy_.dna');
  const lr19 = wt.primers.find((p) => p.name.startsWith('LR19'));
  const lr18 = wt.primers.find((p) => p.name.startsWith('LR18'));
  const r = simulatePcr(wt, lr19, lr18);
  const product = r.products[0];
  assert.equal(r.products.length, 1);
  // La base mutée vient de l'amorce, pas de la matrice
  assert.equal(product.mismatches.length, 1);
  assert.equal(product.mismatches[0].position, 1034);
  assert.equal(product.sequence[34], 'T', "35e base du produit mutée en T");
  assert.equal(wt.sequence[1034].toUpperCase(), 'A', 'la matrice porte encore le A');
  // Le produit correspond à la construction finale du labo
  assert.ok(mutant.sequence.toUpperCase().includes(product.sequence.slice(0, 39)), 'début retrouvé dans DegU32(Hy)');
  const degU = product.features.find((f) => f.name === 'DegU');
  assert.ok(degU, 'annotation DegU reportée sur le produit');
  assert.equal(degU.segments[0].start, 0, "DegU commence au début du produit");
});

test("report des annotations : positions décalées, annotation tronquée signalée", () => {
  const plasmid = read('1790229557109_3_KOYukD_pUC57_pVegOperon.dna'.replace('7109', '7510'));
  const lr20 = plasmid.primers.find((p) => p.name.startsWith('LR20'));
  const rev = { name: 'rev', bases: 'TTATCCGCGGATTTGATTTGC' };
  const { products: [p] } = simulatePcr(plasmid, lr20, rev);
  const yukE = p.features.find((f) => f.name === 'YukE');
  assert.equal(yukE.segments[0].start, 0);
  assert.equal(yukE.segments[0].end, p.length - 1);
  const up = p.features.find((f) => f.name === 'up');
  assert.ok(up.notes.note?.some((x) => /tronquée/.test(x)), '« up » dépasse le produit et est signalée');
});

test('queue 5′ : le produit est plus long que la région amplifiée', () => {
  const plasmid = read('1790229557510_3_KOYukD_pUC57_pVegOperon.dna');
  const lr23 = plasmid.primers.find((p) => p.name.startsWith('LR23')); // 73 nt dont 11 de queue
  const lr26 = plasmid.primers.find((p) => p.name.startsWith('LR26'));
  const { products: [p] } = simulatePcr(plasmid, lr23, lr26);
  assert.equal(p.length, p.region.length + p.forward.tailLength + p.reverse.tailLength);
  assert.ok(p.sequence.startsWith(lr23.bases.toUpperCase()));
});

test('matrice circulaire : produit qui passe par l’origine', () => {
  const plasmid = read('1790229557510_3_KOYukD_pUC57_pVegOperon.dna');
  const n = plasmid.sequence.length;
  const fwd = { name: 'F', bases: plasmid.sequence.slice(n - 60, n - 35).toUpperCase() };
  const revBases = plasmid.sequence.slice(40, 65).toUpperCase();
  const rc = [...revBases].reverse().map((c) => ({ A: 'T', C: 'G', G: 'C', T: 'A' })[c]).join('');
  const { products: [p] } = simulatePcr(plasmid, fwd, { name: 'R', bases: rc });
  assert.equal(p.region.wrapsOrigin, true);
  assert.equal(p.length, 60 - 35 + 65 - 40 + 35 + 40 - 0 - 60 + 60); // 25 + 35 + 40 - 35 + ... vérifié ci-dessous
  assert.equal(p.length, 125);
  assert.equal(p.sequence.slice(0, 25), fwd.bases);
});

test('amorces inversées : aucun produit, message explicite', () => {
  const wt = read('DegU_WT.dna');
  const lr17 = wt.primers.find((p) => p.name.startsWith('LR17'));
  const r = simulatePcr(wt, { name: 'inversée', bases: lr17.bases }, { name: 'inversée2', bases: lr17.bases });
  assert.equal(r.products.length, 0);
  assert.ok(r.warnings.some((w) => w.level === 'error'));
});
