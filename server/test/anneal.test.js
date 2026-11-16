// Moteur d'hybridation comparé aux sites que SnapGene a lui-même enregistrés dans les fichiers
// (fixtures/*.primers.json, extraits par make-goldens.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapGene } from '../src/lib/seq/snapgene.js';
import { findAnnealingSites } from '../src/lib/seq/anneal.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.primers.json'));

for (const file of files) {
  const golden = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  if (!golden.primers.length) continue;
  const dna = parseSnapGene(fs.readFileSync(path.join(dir, file.replace('.primers.json', '.dna'))));

  test(`${file.replace('.primers.json', '')} : sites d'hybridation identiques à SnapGene`, () => {
    const problems = [];
    for (const p of golden.primers) {
      const ours = findAnnealingSites(dna.sequence, dna.circular, p.bases);
      for (const ref of p.sites) {
        const found = ours.find((s) => s.strand === ref.strand && s.threePrimeEnd === ref.three_prime_end);
        if (!found) {
          problems.push(`${p.name} : site ${ref.strand > 0 ? '+' : '-'}${ref.three_prime_end} non trouvé (trouvés : ${ours.map((s) => `${s.strand > 0 ? '+' : '-'}${s.threePrimeEnd}`).join(', ') || 'aucun'})`);
          continue;
        }
        // SnapGene affiche en plus des îlots appariés dans la queue 5′ : on compare la partie 3′ hybridée
        const main = ref.components.filter((c) => c.range).pop().bases.toUpperCase();
        if (!found.annealed.endsWith(main) && !main.endsWith(found.annealed)) {
          problems.push(`${p.name} : partie hybridée ${found.annealed} au lieu de ${main}`);
        }
        if (Math.abs(found.tm - ref.tm) > 6) problems.push(`${p.name} : Tm ${found.tm} au lieu de ${ref.tm}`);
      }
    }
    assert.deepEqual(problems, []);
  });
}

test('LR19 mutagène sur DegU sauvage : un mésappariement, le reste apparié', () => {
  const wt = parseSnapGene(fs.readFileSync(path.join(dir, 'DegU_WT.dna')));
  const lr19 = wt.primers.find((p) => p.name.startsWith('LR19'));
  const [site] = findAnnealingSites(wt.sequence, wt.circular, lr19.bases);
  assert.equal(site.strand, 1);
  assert.equal(site.annealedLength, 39, 'toute l’amorce s’hybride');
  assert.equal(site.mismatches.length, 1);
  assert.equal(site.mismatches[0].position, 1034, 'mésappariement à la position du A muté en T');
  assert.equal(site.mismatches[0].primerBase, 'T');
  assert.equal(site.continuous, 34);
  assert.equal(site.tailLength, 0);
});

test('amorce à queue 5′ : la queue est hors de l’empreinte', () => {
  const plasmid = parseSnapGene(fs.readFileSync(path.join(dir, '1790229557510_3_KOYukD_pUC57_pVegOperon.dna')));
  const lr23 = plasmid.primers.find((p) => p.name.startsWith('LR23'));
  const sites = findAnnealingSites(plasmid.sequence, plasmid.circular, lr23.bases);
  assert.equal(sites.length, 1);
  assert.equal(sites[0].tailLength + sites[0].annealedLength, lr23.bases.length);
});

test('matrice circulaire : site à cheval sur l’origine', () => {
  // séquence non répétitive (sinon plusieurs sites possibles)
  let seed = 7;
  const seq = Array.from({ length: 300 }, () => {
    seed = (seed * 48271) % 2147483647; // reste dans les entiers exacts de JavaScript
    return 'ACGT'[seed % 4];
  }).join('');
  const primer = seq.slice(-14) + seq.slice(0, 12); // 26 nt à cheval sur l'origine
  const [site] = findAnnealingSites(seq, true, primer);
  assert.equal(site.annealedLength, 26);
  assert.equal(site.start, seq.length - 14);
  assert.equal(site.threePrimeEnd, 11);
  assert.equal(site.wrapsOrigin, true);
  // Sur la même séquence en linéaire, seule la partie 3′ s'hybride, le reste pend hors de la molécule
  const linear = findAnnealingSites(seq, false, primer);
  assert.equal(linear.length, 1);
  assert.equal(linear[0].annealedLength, 12);
  assert.equal(linear[0].start, 0);
  assert.equal(linear[0].wrapsOrigin, false);
});

test('extrémité 3′ mal appariée : aucune élongation possible, donc aucun site', () => {
  const seq = 'ACGTTGCATTACGGATCCAGGTACCGGATTACAGGCTTAAGCCATGACTGCAATTGCCATGGTCAGCTAGCTTAA';
  const primer = `${seq.slice(20, 44)}AAA`; // trois bases surnuméraires en 3′
  assert.equal(findAnnealingSites(seq, false, primer).length, 0);
});
