// Température de fusion (Tm) par la méthode des plus proches voisins.
// Paramètres unifiés SantaLucia 1998, correction de sel comme primer3.
// Sert à filtrer les sites d'hybridation : un appel à primer3 par site candidat serait trop lent.
// Vérifié contre primer3 dans test/tm.test.js.

const NN = {
  AA: [-7.9, -22.2], TT: [-7.9, -22.2],
  AT: [-7.2, -20.4], TA: [-7.2, -21.3],
  CA: [-8.5, -22.7], TG: [-8.5, -22.7],
  GT: [-8.4, -22.4], AC: [-8.4, -22.4],
  CT: [-7.8, -21.0], AG: [-7.8, -21.0],
  GA: [-8.2, -22.2], TC: [-8.2, -22.2],
  CG: [-10.6, -27.2], GC: [-9.8, -24.4],
  GG: [-8.0, -19.9], CC: [-8.0, -19.9],
};
const INIT_GC = [0.1, -2.8];
const INIT_AT = [2.3, 4.1];
const R = 1.987; // cal/(mol·K)

export const DEFAULT_CONDITIONS = { monovalent_mM: 50, divalent_mM: 1.5, dntp_mM: 0.6, oligo_nM: 50 };

/** Concentration en sel monovalent équivalente (von Ahsen 2001, comme primer3). */
function saltEquivalent({ monovalent_mM: mono, divalent_mM: div, dntp_mM: dntp }) {
  const free = Math.max(0, div - dntp); // le Mg²⁺ chélaté par les dNTP ne compte pas
  return (mono + 120 * Math.sqrt(free)) / 1000; // mol/L
}

/**
 * Tm d'un duplex parfait (°C). Renvoie null si la séquence contient autre chose que A, C, G ou T,
 * ou si elle fait moins de deux bases.
 */
export function meltingTemp(sequence, conditions = DEFAULT_CONDITIONS) {
  const s = String(sequence).toUpperCase();
  if (s.length < 2 || /[^ACGT]/.test(s)) return null;
  let dh = 0;
  let ds = 0;
  for (let i = 0; i < s.length - 1; i += 1) {
    const [h, e] = NN[s.slice(i, i + 2)];
    dh += h;
    ds += e;
  }
  for (const base of [s[0], s[s.length - 1]]) {
    const [h, e] = base === 'G' || base === 'C' ? INIT_GC : INIT_AT;
    dh += h;
    ds += e;
  }
  const salt = saltEquivalent(conditions);
  ds += 0.368 * (s.length - 1) * Math.log(salt);
  const ct = (conditions.oligo_nM ?? 50) * 1e-9;
  const tm = (dh * 1000) / (ds + R * Math.log(ct / 4)) - 273.15;
  return Math.round(tm * 10) / 10;
}

/**
 * Tm approché d'un duplex comportant des mésappariements : les paires mal appariées
 * n'apportent aucune stabilité (approximation prudente, qui sous-estime légèrement).
 * `pairs` : chaîne de la longueur du duplex, '|' pour une paire appariée, ' ' sinon.
 */
export function meltingTempWithMismatches(sequence, pairs, conditions = DEFAULT_CONDITIONS) {
  const s = String(sequence).toUpperCase();
  if (s.length < 2 || /[^ACGT]/.test(s)) return null;
  let dh = 0;
  let ds = 0;
  for (let i = 0; i < s.length - 1; i += 1) {
    if (pairs[i] !== '|' || pairs[i + 1] !== '|') continue; // au moins une base non appariée
    const [h, e] = NN[s.slice(i, i + 2)];
    dh += h;
    ds += e;
  }
  const first = pairs.indexOf('|');
  const last = pairs.lastIndexOf('|');
  if (first < 0 || dh === 0) return null;
  for (const base of [s[first], s[last]]) {
    const [h, e] = base === 'G' || base === 'C' ? INIT_GC : INIT_AT;
    dh += h;
    ds += e;
  }
  const matched = [...pairs].filter((c) => c === '|').length;
  ds += 0.368 * Math.max(1, matched - 1) * Math.log(saltEquivalent(conditions));
  const ct = (conditions.oligo_nM ?? 50) * 1e-9;
  const tm = (dh * 1000) / (ds + R * Math.log(ct / 4)) - 273.15;
  return Math.round(tm * 10) / 10;
}
