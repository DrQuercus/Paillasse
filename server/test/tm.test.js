// Tm interne (plus proches voisins) comparé à primer3 sur les amorces réelles des fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapGene } from '../src/lib/seq/snapgene.js';
import { meltingTemp } from '../src/lib/seq/tm.js';
import { analyzeOligos, primer3Available } from '../src/lib/seq/primer3.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const have = await primer3Available();

test('Tm interne proche de primer3 (moins de 1,5 °C d’écart)', { skip: !have && 'primer3 absent' }, async () => {
  const oligos = new Set();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.dna'))) {
    for (const p of parseSnapGene(fs.readFileSync(path.join(dir, file)), file).primers) {
      const b = p.bases.toUpperCase();
      if (b.length >= 15 && b.length <= 36 && !/[^ACGT]/.test(b)) oligos.add(b);
    }
  }
  const list = [...oligos];
  assert.ok(list.length >= 10, `${list.length} amorces testées`);
  const ref = await analyzeOligos(list);
  const diffs = list.map((o, i) => ({ o, ours: meltingTemp(o), p3: ref[i].tm })).map((d) => ({ ...d, delta: Math.abs(d.ours - d.p3) }));
  const worst = diffs.sort((a, b) => b.delta - a.delta)[0];
  assert.ok(worst.delta <= 1.5, `écart max ${worst.delta} °C sur ${worst.o} (${worst.ours} contre ${worst.p3})`);
});
