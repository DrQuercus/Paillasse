// Tests du lecteur SnapGene, de la validation et de l'export GenBank.
// Les références (fixtures/*.biopython.json) viennent de Biopython : voir make-goldens.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapGene } from '../src/lib/seq/snapgene.js';
import { normalizeSequenceData } from '../src/lib/seq/model.js';
import { locationString, toGenbank } from '../src/lib/seq/genbank.js';
import { parseFasta } from '../src/lib/seq/fasta.js';
import { parseGenbank } from '../src/lib/seq/genbank-read.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.dna'));
const clean = (v) => (typeof v === 'string' ? v.replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : v);

/** Représentation commune : ce qu'on compare à Biopython. */
function asBiopython(d) {
  const n = d.sequence.length;
  const parts = (segs) => segs.flatMap((s) => (s.start <= s.end ? [[s.start, s.end + 1]] : [[s.start, n], [0, s.end + 1]]))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return [
    ...d.features.map((f) => ({
      type: f.type, label: clean(f.name), strand: f.strand === 0 ? 1 : f.strand, parts: parts(f.segments),
      qualifiers: Object.fromEntries(Object.entries(f.notes).filter(([k]) => k !== 'label').map(([k, v]) => [k, v.map(clean)])),
    })),
    ...d.primers.flatMap((p) => p.sites.map((s) => ({
      type: 'primer_bind', label: clean(p.name), strand: s.strand, parts: parts([s]), qualifiers: {},
    }))),
  ];
}

test('il y a des fichiers de référence', () => assert.ok(files.length >= 4));

for (const file of files) {
  test(`SnapGene ${file} : identique à Biopython`, () => {
    const golden = JSON.parse(fs.readFileSync(path.join(dir, file.replace('.dna', '.biopython.json')), 'utf8'));
    const d = normalizeSequenceData(parseSnapGene(fs.readFileSync(path.join(dir, file)), file));
    assert.equal(d.sequence, golden.sequence);
    assert.equal(d.circular, golden.topology === 'circular');
    const ours = asBiopython(d);
    assert.equal(ours.length, golden.features.length, "nombre d'annotations et de sites d'amorces");
    ours.forEach((f, i) => assert.deepEqual(f, golden.features[i], `annotation ${i} (${f.label})`));
  });

  test(`GenBank ${file} : export puis relecture sans perte`, () => {
    const d = normalizeSequenceData(parseSnapGene(fs.readFileSync(path.join(dir, file)), file));
    const back = normalizeSequenceData(parseGenbank(toGenbank({ ...d, name: 'essai' }))[0]);
    assert.equal(back.sequence.toUpperCase(), d.sequence.toUpperCase());
    assert.equal(back.circular, d.circular);
    const strip = (x) => asBiopython(x).map(({ qualifiers, ...rest }) => rest);
    // Les amorces redeviennent des annotations primer_bind : on compare positions, brins, noms, types
    const key = (f) => `${f.type}|${f.label}|${f.strand}|${JSON.stringify(f.parts)}`;
    assert.deepEqual(strip(back).map(key).sort(), strip(d).map(key).sort());
    // Qualificatifs des annotations conservés à l'identique
    for (const f of d.features) {
      // (les noms de segments, propres à SnapGene, n'existent pas en GenBank : on compare les positions)
      const pos = (segs) => JSON.stringify(segs.map(({ start, end }) => [start, end]));
      const g = back.features.find((x) => x.name === f.name && pos(x.segments) === pos(f.segments));
      assert.ok(g, `annotation ${f.name} retrouvée`);
      for (const [k, v] of Object.entries(f.notes)) assert.deepEqual(g.notes[k], v, `${f.name} /${k}`);
    }
  });
}

test("positions GenBank : origine, brin -, jointures, base unique", () => {
  assert.equal(locationString([{ start: 0, end: 9 }], 1, 100), '1..10');
  assert.equal(locationString([{ start: 4, end: 4 }], 1, 100), '5');
  assert.equal(locationString([{ start: 95, end: 4 }], -1, 100), 'complement(join(96..100,1..5))');
  assert.equal(locationString([{ start: 10, end: 19 }, { start: 30, end: 39 }], 1, 100), 'join(11..20,31..40)');
});

test('validation : refuse les positions incohérentes et les caractères inconnus', () => {
  const base = { sequence: 'ACGTACGTAC', circular: false, primers: [] };
  assert.throws(() => normalizeSequenceData({ ...base, features: [{ name: 'x', segments: [{ start: 2, end: 12 }] }] }), /hors de la séquence/);
  assert.throws(() => normalizeSequenceData({ ...base, features: [{ name: 'x', segments: [{ start: 8, end: 2 }] }] }), /linéaire/);
  assert.throws(() => normalizeSequenceData({ ...base, sequence: 'ACGTZ', features: [] }), /« Z »/);
  const ok = normalizeSequenceData({ ...base, circular: true, features: [{ name: 'ori', segments: [{ start: 8, end: 2 }] }] });
  assert.equal(ok.features[0].strand, 0);
});

test('FASTA : plusieurs enregistrements, lignes multiples', () => {
  const recs = parseFasta('>seq1 premier\nACGT\nACGT\n>seq2\nGGCC\n');
  assert.deepEqual(recs.map((r) => [r.name, r.sequence, r.description]), [['seq1', 'ACGTACGT', 'premier'], ['seq2', 'GGCC', '']]);
});
