// Unités, lecture des nombres saisis et mise en forme des résultats (en français).
// Sans dépendance à React : utilisé par les calculateurs, l'interface et les tests.

/** Concentrations : chaque unité appartient à une dimension ; on ne compare que des unités de même dimension. */
export const CONC_UNITS = {
  M: { dim: 'molar', f: 1 },
  mM: { dim: 'molar', f: 1e-3 },
  'µM': { dim: 'molar', f: 1e-6 },
  nM: { dim: 'molar', f: 1e-9 },
  'g/L': { dim: 'mass', f: 1 },
  'mg/mL': { dim: 'mass', f: 1 },
  'mg/L': { dim: 'mass', f: 1e-3 },
  'µg/mL': { dim: 'mass', f: 1e-3 },
  'ng/µL': { dim: 'mass', f: 1e-3 },
  '% (m/v)': { dim: 'mass', f: 10 }, // 1 % = 1 g pour 100 mL
  '% (v/v)': { dim: 'vv', f: 1 },
  X: { dim: 'x', f: 1 },
};
export const MOLAR_UNITS = ['M', 'mM', 'µM', 'nM'];
export const MASS_CONC_UNITS = ['g/L', 'mg/mL', 'mg/L', 'µg/mL', 'ng/µL', '% (m/v)'];
export const ALL_CONC_UNITS = Object.keys(CONC_UNITS);

export const VOLUME_UNITS = { L: 1, mL: 1e-3, 'µL': 1e-6 };
export const MASS_UNITS = { kg: 1e3, g: 1, mg: 1e-3, 'µg': 1e-6, ng: 1e-9, pg: 1e-12 };
export const AMOUNT_UNITS = { mol: 1, mmol: 1e-3, 'µmol': 1e-6, nmol: 1e-9, pmol: 1e-12, fmol: 1e-15 };
const MOLAR_OUT = { M: 1, mM: 1e-3, 'µM': 1e-6, nM: 1e-9, pM: 1e-12 };
const MASS_CONC_OUT = { 'g/L': 1, 'mg/L': 1e-3, 'µg/L': 1e-6 };

const DIM_LABELS = { molar: 'molaire', mass: 'massique', vv: 'en % (v/v)', x: 'en X' };
export const dimLabel = (dim) => DIM_LABELS[dim] ?? dim;

/**
 * Lit un nombre saisi à la main : virgule ou point décimal, espaces ignorés, notation 1e-3 acceptée.
 * Renvoie NaN si la saisie est vide ou n'est pas un nombre.
 */
export function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const s = String(value ?? '').trim().replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return NaN;
  return Number(s);
}

const SUPERSCRIPT = { '-': '⁻', '+': '', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

/** Nombre en français, 4 chiffres significatifs par défaut (0,2922 ; 21 130 ; 1,5 × 10⁻⁶). */
export function formatNumber(x, digits = 4) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs >= 1e7 || abs < 1e-3) {
    const [mantissa, exponent] = x.toExponential(digits - 1).split('e');
    const m = Number(mantissa).toLocaleString('fr-FR', { maximumFractionDigits: 20 });
    return `${m} × 10${[...String(Number(exponent))].map((c) => SUPERSCRIPT[c]).join('')}`;
  }
  return Number(x.toPrecision(digits)).toLocaleString('fr-FR', { maximumFractionDigits: 20 });
}

/**
 * Choisit l'unité la plus lisible pour une valeur exprimée dans l'unité de base :
 * la plus grande unité dans laquelle la valeur vaut au moins 1 (0,2922 g → 292,2 mg).
 */
export function autoUnit(base, units) {
  const entries = Object.entries(units).sort((a, b) => b[1] - a[1]);
  const abs = Math.abs(base);
  for (const [unit, f] of entries) {
    if (abs / f >= 0.9995) return { value: base / f, unit };
  }
  const [unit, f] = entries.at(-1);
  return { value: base / f, unit };
}

/** Écho d'une valeur saisie, telle quelle mais à la française (0.5 → 0,5 ; 25000 → 25 000). */
export function echoNumber(v) {
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-6 || abs >= 1e9)) return formatNumber(v, 6);
  return v.toLocaleString('fr-FR', { maximumFractionDigits: 20 });
}

export const formatQty = (value, unit, digits) => `${formatNumber(value, digits)} ${unit}`;
export const formatMass = (grams) => { const q = autoUnit(grams, MASS_UNITS); return formatQty(q.value, q.unit); };
export const formatVolume = (litres) => { const q = autoUnit(litres, VOLUME_UNITS); return formatQty(q.value, q.unit); };
export const formatAmount = (mol) => { const q = autoUnit(mol, AMOUNT_UNITS); return formatQty(q.value, q.unit); };
export const formatMolar = (molPerL) => { const q = autoUnit(molPerL, MOLAR_OUT); return formatQty(q.value, q.unit); };
export const formatMassConc = (gPerL) => { const q = autoUnit(gPerL, MASS_CONC_OUT); return formatQty(q.value, q.unit); };

/** Quantité saisie { v: '500', u: 'mM' } → valeur dans l'unité de base (NaN si incomplète). */
export function readConc(q) {
  const unit = CONC_UNITS[q?.u];
  const v = parseNumber(q?.v);
  if (!unit || !Number.isFinite(v)) return null;
  return { value: v * unit.f, dim: unit.dim, text: `${echoNumber(v)} ${q.u}` };
}

export function readVolume(q) {
  const f = VOLUME_UNITS[q?.u];
  const v = parseNumber(q?.v);
  if (!f || !Number.isFinite(v)) return null;
  return { value: v * f, text: `${echoNumber(v)} ${q.u}` };
}

export function readMass(q) {
  const f = MASS_UNITS[q?.u];
  const v = parseNumber(q?.v);
  if (!f || !Number.isFinite(v)) return null;
  return { value: v * f, text: `${echoNumber(v)} ${q.u}` };
}

export function readAmount(q) {
  const f = AMOUNT_UNITS[q?.u];
  const v = parseNumber(q?.v);
  if (!f || !Number.isFinite(v)) return null;
  return { value: v * f, text: `${echoNumber(v)} ${q.u}` };
}

/** Comparaison insensible à la casse et aux accents (« uree » trouve « Urée »). */
export const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
