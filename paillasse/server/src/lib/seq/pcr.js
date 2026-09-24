// PCR virtuelle : produit d'amplification, report des annotations, avertissements.
//
// Le produit reprend les amorces entières (queues 5′ comprises) et la matrice entre leurs
// empreintes : c'est ainsi qu'une amorce mutagène impose sa base au produit.
//
//   5′ [queue][----- amorce sens -----]················>
//      ~~~~~~~~~~~~~~~~~ matrice ~~~~~~~~~~~~~~~~~~~~~~
//                  <················[--- amorce antisens ---][queue] 5′

import { HttpError } from '../errors.js';
import { newId } from './model.js';
import { findAnnealingSites, revcomp } from './anneal.js';
import { meltingTemp } from './tm.js';

export const MAX_PRODUCT = 50_000;

/** Longueur d'un intervalle inclus, éventuellement à cheval sur l'origine. */
const spanLength = (start, end, n) => (start <= end ? end - start + 1 : n - start + end + 1);
/** `length` bases à partir de `start`, en faisant le tour si nécessaire. */
const sliceFrom = (seq, start, length) => {
  if (length <= 0) return '';
  const n = seq.length;
  const from = ((start % n) + n) % n;
  return from + length <= n ? seq.slice(from, from + length) : seq.slice(from) + seq.slice(0, from + length - n);
};

/**
 * Reporte les annotations de la matrice sur le produit.
 * `offset` : position, dans le produit, de la base `regionStart` de la matrice.
 * Une annotation à cheval sur les bornes est conservée et marquée partielle.
 */
export function transferFeatures(features, { regionStart, regionLength, offset, templateLength, productLength }) {
  const n = templateLength;
  const inRegion = (p) => {
    const d = ((p - regionStart) % n + n) % n;
    return d < regionLength ? d : null;
  };
  const out = [];
  for (const f of features) {
    const segments = [];
    let clipped = false;
    for (const seg of f.segments) {
      const len = spanLength(seg.start, seg.end, n);
      const positions = [];
      for (let i = 0; i < len; i += 1) {
        const d = inRegion((seg.start + i) % n);
        positions.push(d === null ? null : d + offset);
      }
      const kept = positions.filter((p) => p !== null);
      if (!kept.length) {
        clipped = true;
        continue;
      }
      if (kept.length !== positions.length) clipped = true;
      // Les positions conservées sont contiguës (la région est un intervalle)
      segments.push({ start: Math.min(...kept), end: Math.max(...kept), ...(seg.name ? { name: seg.name } : {}) });
    }
    if (!segments.length) continue;
    if (segments.some((s) => s.start < 0 || s.end >= productLength)) continue;
    const notes = { ...f.notes };
    if (clipped) notes.note = [...(notes.note ?? []), 'Annotation tronquée par la PCR'];
    out.push({ ...f, id: newId(), segments, notes });
  }
  return out;
}

/** Amorce d'entrée : { name, bases } ; on accepte aussi une amorce du registre. */
function cleanPrimer(p, label) {
  const bases = String(p?.bases ?? '').replace(/\s+/g, '').toUpperCase();
  if (!/^[ACGTURYSWKMBDHVN]+$/.test(bases)) throw new HttpError(400, `${label} : séquence d'amorce invalide.`);
  if (bases.length < 10) throw new HttpError(400, `${label} : amorce trop courte (10 bases minimum).`);
  return { name: String(p?.name ?? label).slice(0, 200), bases };
}

/**
 * Simule une PCR. Renvoie les produits possibles (du plus vraisemblable au moins vraisemblable)
 * et les sites d'hybridation de chaque amorce, avec les avertissements associés.
 */
export function simulatePcr(template, forwardPrimer, reversePrimer, options = {}) {
  const { sequence, circular, features = [] } = template;
  const seq = sequence.toUpperCase();
  const n = seq.length;
  const fwd = cleanPrimer(forwardPrimer, 'Amorce sens');
  const rev = cleanPrimer(reversePrimer, 'Amorce antisens');
  const maxProduct = Math.min(Number(options.maxProduct) || MAX_PRODUCT, MAX_PRODUCT);

  let fwdSites = findAnnealingSites(seq, circular, fwd.bases, options);
  let revSites = findAnnealingSites(seq, circular, rev.bases, options);
  // Les deux amorces ont été données dans l'ordre inverse : on les remet dans le bon sens
  let swapped = false;
  if (!fwdSites.some((s) => s.strand === 1) && !revSites.some((s) => s.strand === -1)
      && fwdSites.some((s) => s.strand === -1) && revSites.some((s) => s.strand === 1)) {
    [fwd.name, rev.name] = [rev.name, fwd.name];
    [fwd.bases, rev.bases] = [rev.bases, fwd.bases];
    [fwdSites, revSites] = [revSites, fwdSites];
    swapped = true;
  }

  const products = [];
  for (const f of fwdSites.filter((s) => s.strand === 1)) {
    for (const r of revSites.filter((s) => s.strand === -1)) {
      // Distances parcourues par la polymérase depuis l'extrémité 5′ de l'amorce sens
      const d = (x) => (circular ? ((x - f.start) % n + n) % n : x - f.start);
      const dF3 = d(f.threePrimeEnd);
      const dR3 = d(r.threePrimeEnd);
      if (dF3 < 0 || dR3 <= dF3) continue; // amorces divergentes : aucune élongation convergente
      const middleLength = dR3 - dF3 - 1;
      const regionLength = dR3 + r.annealedLength;
      if (!circular && f.start + regionLength > n) continue; // dépasse la molécule linéaire
      if (regionLength > maxProduct) continue;

      const middle = sliceFrom(seq, f.threePrimeEnd + 1, middleLength);
      const bases = fwd.bases + middle + revcomp(rev.bases);
      products.push({
        length: bases.length,
        sequence: bases,
        region: {
          start: f.start,
          end: r.end,
          length: regionLength,
          wrapsOrigin: circular && f.start + regionLength > n,
        },
        forward: f,
        reverse: r,
        offset: f.tailLength, // position, dans le produit, de la première base de la région amplifiée
        features: transferFeatures(features, {
          regionStart: f.start, regionLength, offset: f.tailLength, templateLength: n, productLength: bases.length,
        }),
        primers: [
          { id: newId(), name: fwd.name, bases: fwd.bases, description: '', color: null, sites: [{ start: 0, end: fwd.bases.length - 1, strand: 1, annealed: f.annealed, tm: f.tm }] },
          { id: newId(), name: rev.name, bases: rev.bases, description: '', color: null, sites: [{ start: bases.length - rev.bases.length, end: bases.length - 1, strand: -1, annealed: r.annealed, tm: r.tm }] },
        ],
        mismatches: [...f.mismatches.map((x) => ({ ...x, primer: fwd.name })), ...r.mismatches.map((x) => ({ ...x, primer: rev.name }))],
      });
    }
  }
  products.sort((a, b) => b.forward.tm + b.reverse.tm - (a.forward.tm + a.reverse.tm) || a.length - b.length);

  const warnings = [];
  if (!fwdSites.length) warnings.push({ level: 'error', text: `L'amorce sens ne s'hybride nulle part sur cette matrice.` });
  if (!revSites.length) warnings.push({ level: 'error', text: `L'amorce antisens ne s'hybride nulle part sur cette matrice.` });
  if (fwdSites.length && revSites.length && !products.length) {
    warnings.push({ level: 'error', text: "Les amorces s'hybrident mais n'encadrent aucun produit (orientation inversée, ou produit trop long)." });
  }
  if (products.length > 1) warnings.push({ level: 'warn', text: `${products.length} produits possibles : les amorces s'hybrident à plusieurs endroits.` });
  for (const [label, sites] of [['sens', fwdSites], ['antisens', revSites]]) {
    if (sites.length > 1) warnings.push({ level: 'warn', text: `L'amorce ${label} s'hybride à ${sites.length} endroits (positions ${sites.map((s) => s.threePrimeEnd + 1).join(', ')}).` });
  }
  const main = products[0];
  if (main) {
    for (const m of main.mismatches) {
      warnings.push({
        level: 'info',
        text: `Position ${m.position + 1} : « ${m.primer} » impose ${m.primerBase} là où la matrice porte ${m.templateBase} — mutagenèse dirigée, ou amorce prévue pour une autre matrice.`,
      });
    }
    const delta = Math.abs(main.forward.tm - main.reverse.tm);
    if (delta > 5) warnings.push({ level: 'warn', text: `Les deux amorces ont des Tm éloignés (écart de ${delta.toFixed(1).replace('.', ',')} °C).` });
  }

  if (swapped) warnings.push({ level: 'info', text: `Les amorces ont été interverties : « ${fwd.name} » s'hybride sur le brin supérieur.` });
  return {
    products, forwardSites: fwdSites, reverseSites: revSites, warnings, swapped,
    forwardPrimer: fwd, reversePrimer: rev,
    annealingTemperatures: main ? annealingTemperatures(main) : null,
  };
}

// Températures d'hybridation conseillées. Chaque fabricant a sa propre règle : on affiche
// la sienne plutôt qu'un chiffre unique, et on rappelle qu'il s'agit d'un point de départ.
export function annealingTemperatures(product) {
  const tmF = product.forward.tm;
  const tmR = product.reverse.tm;
  const low = Math.min(tmF, tmR);
  const round = (x) => Math.round(x);
  return [
    { name: 'NEB Q5', value: round(low + 1), note: 'Tm le plus bas + 1 °C (calculateur NEB Tm)' },
    { name: 'NEB Phusion', value: round(low + 3), note: 'Tm le plus bas + 3 °C pour des amorces de plus de 20 nt' },
    { name: 'Takara PrimeSTAR', value: 55, note: 'protocole à 55 °C, ou 68 °C en deux étapes' },
    { name: 'Toyobo KOD', value: round(low - 5), note: 'Tm le plus bas − 5 °C' },
    { name: 'Thermo Phusion / Platinum', value: round(low + 3), note: 'comme Phusion : Tm le plus bas + 3 °C' },
  ];
}

export { meltingTemp };
