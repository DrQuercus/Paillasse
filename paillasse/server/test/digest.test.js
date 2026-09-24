// Digestion virtuelle : sites de coupure comparés à Bio.Restriction (références : make-goldens.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapGene } from '../src/lib/seq/snapgene.js';
import { ENZYMES, digest, findCuts, getEnzyme } from '../src/lib/seq/enzymes.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.dna'));

for (const file of files) {
  test(`${file} : coupures identiques à Biopython pour ${ENZYMES.length} enzymes`, () => {
    const d = parseSnapGene(fs.readFileSync(path.join(dir, file)), file);
    const golden = JSON.parse(fs.readFileSync(path.join(dir, file.replace('.dna', '.cuts.json')), 'utf8'));
    const n = d.sequence.length;
    const diffs = [];
    for (const e of ENZYMES) {
      // Biopython donne la première base après la coupure, en base 1
      const ours = findCuts(d.sequence, d.circular, e).map((c) => (c.top === 0 && d.circular ? n : c.top) + 1).sort((a, b) => a - b);
      // Biopython compte une coupure par site reconnu : deux sites en orientation opposée qui coupent
      // exactement au même endroit y figurent deux fois, alors que l'ADN n'est coupé qu'une fois.
      const ref = [...new Set(golden[e.name] ?? [])].sort((a, b) => a - b);
      if (JSON.stringify(ours) !== JSON.stringify(ref)) diffs.push(`${e.name} (${ours.length} coupures au lieu de ${ref.length})`);
    }
    assert.deepEqual(diffs, []);
  });
}

test('digestion : les fragments recouvrent exactement la molécule', () => {
  for (const file of files) {
    const d = parseSnapGene(fs.readFileSync(path.join(dir, file)), file);
    for (const set of [['EcoRI'], ['EcoRI', 'HindIII'], ['BsaI'], ['PvuII', 'NdeI', 'XhoI']]) {
      const r = digest(d.sequence, d.circular, set);
      assert.equal(r.fragments.reduce((s, f) => s + f.length, 0), d.sequence.length, `${file} ${set}`);
    }
  }
});

test('extrémités sortantes : EcoRI 5′ AATT, KpnI 3′ GTAC, EcoRV franche, BsaI hors site', () => {
  const seq = 'AAAAGAATTCAAAAGGTACCAAAAGATATCAAAAGGTCTCAGCTTAAAAAAAAA';
  const r = digest(seq, false, ['EcoRI', 'KpnI', 'EcoRV', 'BsaI']);
  const at = (name) => r.cuts.flatMap((c) => c.enzymes).find((x) => x.enzyme === name);
  assert.deepEqual(at('EcoRI'), { enzyme: 'EcoRI', type: "5'", bases: 'AATT' });
  assert.deepEqual(at('KpnI'), { enzyme: 'KpnI', type: "3'", bases: 'GTAC' });
  assert.deepEqual(at('EcoRV'), { enzyme: 'EcoRV', type: 'franche', bases: '' });
  assert.deepEqual(at('BsaI'), { enzyme: 'BsaI', type: "5'", bases: 'GCTT' });
});

test('plasmide circulaire : une coupure le linéarise, aucune le laisse non coupé', () => {
  const plasmid = 'GAATTC' + 'A'.repeat(994);
  assert.equal(digest(plasmid, true, ['EcoRI']).fragments[0].length, 1000);
  assert.equal(digest(plasmid, true, ['HindIII']).fragments[0].uncut, true);
  assert.ok(getEnzyme('ecori'));
});
