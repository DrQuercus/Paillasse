// Taille attendue d'une protéine à partir d'une séquence du registre (CDS traduit) ou collée.

const BASES = 'TCAG';
const AMINO = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const CODE = {};
for (let i = 0; i < 64; i += 1) CODE[BASES[i >> 4] + BASES[(i >> 2) & 3] + BASES[i & 3]] = AMINO[i];

const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', U: 'A', N: 'N' };
const revcomp = (s) => [...s].reverse().map((c) => COMP[c] ?? 'N').join('');

// Masses moyennes des résidus (Da), comme ExPASy ProtParam ; + une molécule d'eau par chaîne
const RESIDUE = {
  A: 71.0788, R: 156.1875, N: 114.1038, D: 115.0886, C: 103.1388, E: 129.1155, Q: 128.1307, G: 57.0519,
  H: 137.1411, I: 113.1594, L: 113.1594, K: 128.1741, M: 131.1926, F: 147.1766, P: 97.1167, S: 87.0782,
  T: 101.1051, W: 186.2132, Y: 163.1760, V: 99.1326, U: 150.0388, O: 237.3018,
};
const WATER = 18.01528;

/** Traduction (code génétique standard), jusqu'au premier codon stop. */
export function translate(dna) {
  const s = String(dna).toUpperCase().replace(/U/g, 'T').replace(/[^ACGTN]/g, '');
  let out = '';
  for (let i = 0; i + 3 <= s.length; i += 3) {
    const aa = CODE[s.slice(i, i + 3)] ?? 'X';
    if (aa === '*') break;
    out += aa;
  }
  return out;
}

/** Masse moléculaire moyenne (Da). Les résidus inconnus (X) comptent pour une masse moyenne de 110 Da. */
export function proteinMass(protein) {
  const aa = String(protein).toUpperCase().replace(/[^A-Z]/g, '');
  if (!aa.length) return 0;
  let m = WATER;
  for (const c of aa) m += RESIDUE[c] ?? 110;
  return m;
}

/** Séquence d'un CDS (segments base 0, bornes incluses, éventuellement à cheval sur l'origine). */
export function cdsSequence(sequence, feature) {
  const part = (seg) => (seg.start <= seg.end ? sequence.slice(seg.start, seg.end + 1) : sequence.slice(seg.start) + sequence.slice(0, seg.end + 1));
  const segs = [...(feature.segments ?? [])].sort((a, b) => a.start - b.start);
  let s = segs.map(part).join('').toUpperCase();
  if (feature.strand === -1) s = revcomp(s);
  return s;
}

/** Protéine attendue pour chaque CDS d'une séquence du registre : nom, longueur, masse (kDa). */
export function proteinsOf(seq) {
  return (seq.features ?? [])
    .filter((f) => /^cds$/i.test(f.type))
    .map((f) => {
      const protein = translate(cdsSequence(seq.sequence, f));
      return { id: f.id, name: f.name || 'CDS', length: protein.length, kDa: proteinMass(protein) / 1000, protein };
    })
    .filter((p) => p.length > 0);
}
