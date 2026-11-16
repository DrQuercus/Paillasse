// Recherche des sites d'hybridation d'une amorce sur une matrice.
//
// Modèle et réglages par défaut repris de SnapGene (paramètres lus dans ses propres fichiers :
// minContinuousMatchLen=10, allowMismatch=1, minMeltingTemperature=40) : alignement sans insertion
// ni délétion, ancré sur l'extrémité 3′ de l'amorce et prolongé vers le 5′ en tolérant des
// mésappariements. Ce qui dépasse en 5′ est une queue, qui se retrouve dans le produit de PCR.
//
// Coordonnées : positions de la matrice, base 0, bornes incluses. Pour une amorce antisens,
// start est l'extrémité 3′ (la plus à gauche) et end l'extrémité 5′.

import { DEFAULT_CONDITIONS, meltingTempWithMismatches } from './tm.js';

const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', U: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N' };
export const revcomp = (s) => [...s.toUpperCase()].reverse().map((c) => COMP[c] ?? 'N').join('');

export const ANNEAL_DEFAULTS = {
  minContinuousMatch: 10, // plus longue portion appariée sans interruption
  minTm: 40,              // Tm de la partie hybridée (°C)
  threePrimeMatch: 3,     // bases appariées exigées à l'extrémité 3′ (sinon pas d'élongation)
  maxMismatches: 6,
};

// Correspondance en tenant compte des codes IUPAC dégénérés de la matrice
const SETS = { A: 'A', C: 'C', G: 'G', T: 'T', U: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
const matches = (primerBase, templateBase) => {
  const t = SETS[templateBase];
  const p = SETS[primerBase];
  return Boolean(t && p && [...p].every((c) => t.includes(c)));
};

/** Toutes les occurrences exactes d'un motif (chevauchements compris). */
function* occurrences(text, pattern, limit) {
  let i = text.indexOf(pattern);
  while (i >= 0 && i < limit) {
    yield i;
    i = text.indexOf(pattern, i + 1);
  }
}

/**
 * Sites d'hybridation d'une amorce sur une matrice.
 * Renvoie, pour chaque site : brin, empreinte, bases hybridées, mésappariements, queue 5′, Tm.
 */
export function findAnnealingSites(sequence, circular, primerBases, options = {}) {
  const o = { ...ANNEAL_DEFAULTS, ...options, conditions: { ...DEFAULT_CONDITIONS, ...(options.conditions ?? {}) } };
  const primer = String(primerBases).toUpperCase().replace(/\s+/g, '');
  const seq = String(sequence).toUpperCase();
  const n = seq.length;
  const m = primer.length;
  if (m < o.minContinuousMatch || n < o.minContinuousMatch) return [];

  const sites = [];
  for (const strand of [1, -1]) {
    // Texte lu dans le sens de l'amorce : brin supérieur, ou son complément inverse
    const base = strand === 1 ? seq : revcomp(seq);
    // Séquence circulaire : on prolonge pour trouver les sites qui passent par l'origine
    const text = circular ? base + base.slice(0, Math.min(m, n) - 1) : base;
    const seen = new Set();

    for (let j = 0; j + o.minContinuousMatch <= m; j += 1) {
      const seed = primer.slice(j, j + o.minContinuousMatch);
      if (/[^ACGT]/.test(seed)) continue;
      for (const t of occurrences(text, seed, circular ? n : text.length)) {
        const end3 = t + (m - 1 - j); // position, dans le texte, de la base 3′ de l'amorce
        if (end3 >= text.length || seen.has(end3)) continue;
        seen.add(end3);
        const site = alignAt(primer, text, end3, o);
        if (site) sites.push(toTemplateCoords(site, strand, n, circular, primer, text));
      }
    }
  }
  // Un même site peut être trouvé par plusieurs amorces d'un mélange : on trie du plus stable au moins stable
  return sites.sort((a, b) => b.tm - a.tm || a.start - b.start);
}

/** Alignement ancré en 3′, prolongé vers le 5′ tant que l'appariement reste crédible. */
function alignAt(primer, text, end3, o) {
  const m = primer.length;
  const pairs = [];
  let mismatches = 0;
  let consecutive = 0;
  let k = 0;
  for (; k < m; k += 1) {
    const ti = end3 - k;
    if (ti < 0) break; // l'amorce dépasse du début d'une matrice linéaire
    const ok = matches(primer[m - 1 - k], text[ti]);
    if (ok) {
      consecutive = 0;
    } else {
      if (k < o.threePrimeMatch) return null; // 3′ mal apparié : pas d'élongation
      consecutive += 1;
      mismatches += 1;
      if (consecutive >= 2 || mismatches > o.maxMismatches) break;
    }
    pairs.push(ok);
  }
  while (pairs.length && !pairs[pairs.length - 1]) pairs.pop(); // l'hybridation commence sur une base appariée
  const annealedLen = pairs.length;
  if (annealedLen < o.minContinuousMatch) return null;

  let best = 0;
  let run = 0;
  for (const ok of pairs) {
    run = ok ? run + 1 : 0;
    best = Math.max(best, run);
  }
  if (best < o.minContinuousMatch) return null;

  const annealed = primer.slice(m - annealedLen);
  const pattern = pairs.slice().reverse().map((ok) => (ok ? '|' : ' ')).join('');
  const tm = meltingTempWithMismatches(annealed, pattern, o.conditions);
  if (tm === null || tm < o.minTm) return null;

  return {
    end3,
    annealedLen,
    annealed,
    pattern,
    tm,
    continuous: best,
    mismatchCount: annealedLen - best === 0 ? 0 : [...pattern].filter((c) => c === ' ').length,
    tail: primer.slice(0, m - annealedLen),
  };
}

/** Repositionne un site trouvé dans le texte de lecture vers les coordonnées de la matrice. */
function toTemplateCoords(site, strand, n, circular, primer, text) {
  const wrap = (x) => ((x % n) + n) % n;
  // Dans le texte de lecture : l'hybridation occupe [end3 - annealedLen + 1 .. end3]
  const readStart = site.end3 - site.annealedLen + 1;
  const readEnd = site.end3;
  const toTop = (x) => (strand === 1 ? wrap(x) : wrap(n - 1 - x));
  // Quel que soit le brin, l'extrémité 3′ de l'amorce est la dernière base lue
  const fivePrimeEnd = toTop(readStart);
  const threePrimeEnd = toTop(readEnd);
  const [start, end] = strand === 1 ? [fivePrimeEnd, threePrimeEnd] : [threePrimeEnd, fivePrimeEnd];
  const mismatches = [];
  [...site.pattern].forEach((c, i) => {
    if (c === ' ') {
      const readPos = readStart + i;
      // templateBase : la base que l'amorce « voit », donc lue sur le brin qu'elle apparie
      mismatches.push({ position: toTop(readPos), primerBase: site.annealed[i], templateBase: text[readPos], offset: i });
    }
  });
  return {
    strand,
    start,
    end,
    threePrimeEnd,
    fivePrimeEnd,
    annealed: site.annealed,
    pattern: site.pattern,
    annealedLength: site.annealedLen,
    tail: site.tail,
    tailLength: site.tail.length,
    primerLength: primer.length,
    tm: site.tm,
    continuous: site.continuous,
    mismatches,
    perfect: site.mismatchCount === 0 && site.annealedLen === primer.length,
    wrapsOrigin: circular && (strand === 1 ? start > end : end < start),
  };
}
