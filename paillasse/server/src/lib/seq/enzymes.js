// Enzymes de restriction : sites de coupure et digestion virtuelle.
// Base : REBASE via Biopython (enzymes.json, régénérable avec scripts/make-enzymes.py).
// Résultats vérifiés contre Bio.Restriction sur des plasmides réels (test/digest.test.js).
//
// Coordonnées de coupure : nombre de bases avant la coupure, sur le brin supérieur (0 à n).
import fs from 'node:fs';

const DB = JSON.parse(fs.readFileSync(new URL('./enzymes.json', import.meta.url), 'utf8'));
export const SUPPLIERS = DB.suppliers;
export const ENZYMES = DB.enzymes;
const BY_NAME = new Map(ENZYMES.map((e) => [e.name.toLowerCase(), e]));

const IUPAC = { A: 'A', C: 'C', G: 'G', T: 'T', U: 'T', R: '[AG]', Y: '[CT]', S: '[CG]', W: '[AT]', K: '[GT]', M: '[AC]', B: '[CGT]', D: '[AGT]', H: '[ACT]', V: '[ACG]', N: '[ACGT]' };
const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', U: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N' };
export const revcomp = (s) => [...s.toUpperCase()].reverse().map((c) => COMP[c] ?? 'N').join('');

const patterns = new Map();
function pattern(site) {
  if (!patterns.has(site)) patterns.set(site, new RegExp(`(?=${[...site].map((c) => IUPAC[c]).join('')})`, 'g'));
  return patterns.get(site);
}

function* matches(text, site, limit) {
  const re = pattern(site);
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index >= limit) break;
    yield m.index;
    re.lastIndex = m.index + 1; // sites chevauchants
  }
}

export function getEnzyme(name) {
  return BY_NAME.get(String(name).toLowerCase()) ?? null;
}

/** Coupures d'une enzyme : [{ top, bottom }] (bottom = coupure du brin inférieur, même repère). */
export function findCuts(sequence, circular, enzyme) {
  const seq = sequence.toUpperCase();
  const n = seq.length;
  if (n < enzyme.size) return [];
  // Séquence circulaire : on prolonge pour trouver les sites qui chevauchent l'origine
  const text = circular ? seq + seq.slice(0, enzyme.size - 1) : seq;
  const limit = circular ? n : n - enzyme.size + 1;
  const raw = [];
  for (const p of matches(text, enzyme.site, limit)) raw.push({ top: p + enzyme.fst5, bottom: p + enzyme.size + enzyme.fst3 });
  if (!enzyme.palindromic) {
    const rc = revcomp(enzyme.site);
    for (const p of matches(text, rc, limit)) raw.push({ top: p - enzyme.fst3, bottom: p + enzyme.size - enzyme.fst5 });
  }
  const seen = new Set();
  const cuts = [];
  for (const c of raw) {
    let { top, bottom } = c;
    if (circular) {
      top = ((top % n) + n) % n;
      bottom = ((bottom % n) + n) % n;
    } else if (top <= 0 || top >= n || bottom <= 0 || bottom >= n) {
      continue; // coupure hors de la molécule linéaire
    }
    // Deux sites en orientation opposée peuvent couper le brin supérieur au même endroit
    // mais le brin inférieur à des endroits différents : ce sont bien deux coupures.
    const key = `${top}:${bottom}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cuts.push({ top, bottom });
  }
  return cuts.sort((a, b) => a.top - b.top);
}

/** Nombre de coupures de chaque enzyme (pour choisir : coupeurs uniques, doubles…). */
export function cutterSummary(sequence, circular) {
  return ENZYMES.map((e) => {
    const cuts = findCuts(sequence, circular, e);
    return { name: e.name, count: cuts.length, positions: cuts.map((c) => c.top) };
  });
}

/** Séquence de l'extrémité sortante entre les coupures des deux brins. */
function overhang(sequence, circular, top, bottom) {
  if (top === bottom) return { type: 'franche', bases: '' };
  const [a, b] = top < bottom ? [top, bottom] : [bottom, top];
  const bases = circular && b - a > sequence.length / 2 ? sequence.slice(b) + sequence.slice(0, a) : sequence.slice(a, b);
  return { type: top < bottom ? "5'" : "3'", bases: bases.toUpperCase() };
}

/**
 * Digestion virtuelle par une ou plusieurs enzymes.
 * Fragments : { start, end (inclus), length, left, right } ; left/right = enzymes et extrémités.
 */
export function digest(sequence, circular, names) {
  const n = sequence.length;
  const unknown = names.filter((x) => !getEnzyme(x));
  if (unknown.length) throw Object.assign(new Error(`Enzyme inconnue : ${unknown.join(', ')}`), { status: 400, expose: true });
  const byPos = new Map();
  for (const name of names) {
    const e = getEnzyme(name);
    for (const c of findCuts(sequence, circular, e)) {
      const list = byPos.get(c.top) ?? [];
      list.push({ enzyme: e.name, ...overhang(sequence, circular, c.top, c.bottom) });
      byPos.set(c.top, list);
    }
  }
  const positions = [...byPos.keys()].sort((a, b) => a - b);
  const cuts = positions.map((p) => ({ position: p, enzymes: byPos.get(p) }));
  const fragments = [];
  if (!positions.length) {
    fragments.push({ start: 0, end: n - 1, length: n, left: null, right: null, uncut: circular });
  } else if (!circular) {
    const bounds = [0, ...positions, n];
    for (let i = 0; i < bounds.length - 1; i += 1) {
      fragments.push({
        start: bounds[i], end: bounds[i + 1] - 1, length: bounds[i + 1] - bounds[i],
        left: i === 0 ? null : byPos.get(bounds[i]), right: i === bounds.length - 2 ? null : byPos.get(bounds[i + 1]),
      });
    }
  } else {
    positions.forEach((p, i) => {
      const next = positions[(i + 1) % positions.length];
      const length = next > p ? next - p : n - p + next;
      fragments.push({ start: p, end: (p + length - 1) % n, length, left: byPos.get(p), right: byPos.get(next) });
    });
  }
  return { length: n, circular, cuts, fragments: fragments.sort((a, b) => b.length - a.length) };
}
