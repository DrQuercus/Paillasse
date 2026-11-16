// Amorces : cohérence des positions renvoyées avec la séquence (primer3 requis, sinon tests ignorés).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapGene } from '../src/lib/seq/snapgene.js';
import { revcomp } from '../src/lib/seq/enzymes.js';
import { analyzeOligos, designExact, designFlanking, primer3Available } from '../src/lib/seq/primer3.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const have = await primer3Available();
const plasmid = parseSnapGene(fs.readFileSync(path.join(dir, '1790229557510_3_KOYukD_pUC57_pVegOperon.dna')));
const seq = plasmid.sequence.toUpperCase();
const n = seq.length;
const site = (p) => {
  let s = '';
  for (let i = 0; i < p.length; i += 1) s += seq[(p.start + i) % n];
  return p.strand === 1 ? s : revcomp(s);
};

test('analyse : Tm de LR20_YukE_F calculé par primer3', { skip: !have && 'primer3 absent' }, async () => {
  const [a] = await analyzeOligos(['ATGGCAGGATTAATTCGTGTC']);
  assert.ok(a.tm > 50 && a.tm < 62, `Tm ${a.tm}`);
  assert.equal(a.gc, 42.9);
});

test("bornes exactes : amorces collées aux extrémités de YukE (2336-2630)", { skip: !have && 'primer3 absent' }, async () => {
  const r = await designExact(seq, true, 2336, 2629);
  const f = r.forward[0];
  const rv = r.reverse[0];
  assert.equal(f.start, 2336);
  assert.equal(rv.end, 2629);
  assert.equal(site(f), f.sequence, 'amorce sens = brin supérieur');
  assert.equal(site(rv), rv.sequence, 'amorce antisens = complément inverse');
  assert.ok(f.sequence.startsWith('ATGGCAGGATTAATTCGTG'));
});

test('primer3 libre : positions ramenées dans le repère du plasmide, y compris à cheval sur l’origine', { skip: !have && 'primer3 absent' }, async () => {
  for (const [start, end] of [[2336, 2629], [n - 150, 120]]) {
    const r = await designFlanking(seq, true, start, end);
    assert.ok(r.pairs.length > 0, r.explain);
    for (const p of r.pairs) {
      assert.equal(site(p.forward), p.forward.sequence);
      assert.equal(site(p.reverse), p.reverse.sequence);
    }
  }
});
