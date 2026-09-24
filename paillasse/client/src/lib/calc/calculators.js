// Calculateurs de paillasse (repris de LabHelper v3, vérifiés et complétés).
//
// Chaque calculateur transforme des paramètres saisis (chaînes de caractères, telles que tapées)
// en un « résumé » : ce qui est affiché, inséré dans une entrée du cahier et scellé avec elle.
//
//   summary = {
//     title:   'Pesée',                         nom du calcul
//     label:   'Stock NaCl 5 M',                libellé libre (facultatif)
//     formula: 'm = C × V × M',
//     inputs:  [{ label, value }],              données saisies
//     results: [{ label, value, main? }],       résultats, déjà mis en forme
//     table:   { columns: [], rows: [[]] },     détail éventuel (tampon, master mix, milieu)
//     notes:   [texte],
//   }
//
// Le résumé ne contient que du texte déjà mis en forme : le serveur l'affiche (impression, export)
// sans refaire le calcul, et une entrée verrouillée garde exactement les valeurs utilisées ce jour-là.

import {
  CONC_UNITS, MASS_UNITS, VOLUME_UNITS, dimLabel, echoNumber, formatAmount, formatMass, formatMassConc,
  formatMolar, formatNumber, formatVolume, parseNumber, readAmount, readConc, readMass, readVolume,
} from './units.js';
import { MEDIA } from './media.js';

// Masse moyenne d'une paire de bases (sel de sodium) et d'un nucléotide simple brin
export const DNA_MW = { ds: 660, ss: 330 };
// RCF = 1,118 × 10⁻⁵ × r (cm) × rpm², soit 1,118 × 10⁻⁶ avec le rayon en mm
export const RCF_FACTOR_MM = 1.118e-6;
const AVOGADRO = 6.02214076e23;

const ok = (summary) => ({ ok: true, summary });
const incomplete = () => ({ ok: false, message: null });
const fail = (message) => ({ ok: false, message });
const positive = (x) => Number.isFinite(x) && x > 0;
const cleanLabel = (s) => String(s ?? '').trim().slice(0, 200);

function reagentText(name, formula, mw) {
  const parts = [name?.trim() || 'Produit'];
  if (formula?.trim() && formula.trim() !== name?.trim()) parts.push(formula.trim());
  return `${parts.join(', ')}${positive(mw) ? ` (M = ${echoNumber(mw)} g/mol)` : ''}`;
}

// --- Pesée et molarité ---------------------------------------------------------------

const molarity = {
  kind: 'molarity',
  name: 'Pesée et molarité',
  short: 'Molarité',
  description: 'Masse à peser pour une concentration donnée, ou concentration obtenue à partir d’une pesée.',
  defaults: () => ({
    label: '', mode: 'mass', reagent: '', formula: '', mw: '',
    conc: { v: '', u: 'mM' }, vol: { v: '', u: 'mL' }, mass: { v: '', u: 'mg' },
  }),
  compute(p) {
    const mw = parseNumber(p.mw);
    const vol = readVolume(p.vol);
    const product = { label: 'Produit', value: reagentText(p.reagent, p.formula, mw) };
    if (p.mode === 'conc') {
      const mass = readMass(p.mass);
      if (!vol || !mass) return incomplete();
      if (!positive(vol.value) || !positive(mass.value)) return fail('La masse et le volume doivent être positifs.');
      const gPerL = mass.value / vol.value;
      const results = [];
      if (positive(mw)) results.push({ label: 'Concentration molaire', value: formatMolar(gPerL / mw), main: true });
      results.push({ label: 'Concentration massique', value: formatMassConc(gPerL), main: !positive(mw) });
      return ok({
        title: 'Concentration d’une solution',
        formula: positive(mw) ? 'C = m / (M × V)' : 'C = m / V',
        inputs: [product, { label: 'Masse pesée', value: mass.text }, { label: 'Volume final', value: vol.text }],
        results,
      });
    }
    const conc = readConc(p.conc);
    if (!conc || !vol) return incomplete();
    if (!positive(conc.value) || !positive(vol.value)) return fail('La concentration et le volume doivent être positifs.');
    let grams;
    let formula;
    if (conc.dim === 'molar') {
      if (!positive(mw)) return Number.isFinite(mw) ? fail('La masse molaire doit être positive.') : incomplete();
      grams = conc.value * vol.value * mw;
      formula = 'm = C × V × M';
    } else if (conc.dim === 'mass') {
      grams = conc.value * vol.value;
      formula = 'm = C × V';
    } else {
      return fail(`Une concentration ${dimLabel(conc.dim)} ne se pèse pas : utilisez le calcul de dilution.`);
    }
    return ok({
      title: 'Pesée',
      formula,
      inputs: [product, { label: 'Concentration voulue', value: conc.text }, { label: 'Volume final', value: vol.text }],
      results: [{ label: 'Masse à peser', value: formatMass(grams), main: true }],
      notes: ['Dissoudre dans un volume inférieur, puis compléter au volume final.'],
    });
  },
};

// --- Dilution --------------------------------------------------------------------------

function dilutionFactor(c1, c2) {
  const f = c1 / c2;
  if (Math.abs(f - Math.round(f)) < 1e-9 * f) return `1/${Math.round(f).toLocaleString('fr-FR')}`;
  return `1/${formatNumber(f)}`;
}

const dilution = {
  kind: 'dilution',
  name: 'Dilution',
  short: 'Dilution',
  description: 'Volume de solution mère à prélever : C₁ × V₁ = C₂ × V₂.',
  defaults: () => ({ label: '', product: '', c1: { v: '', u: 'mM' }, c2: { v: '', u: 'µM' }, v2: { v: '', u: 'mL' } }),
  compute(p) {
    const c1 = readConc(p.c1);
    const c2 = readConc(p.c2);
    const v2 = readVolume(p.v2);
    if (!c1 || !c2 || !v2) return incomplete();
    if (!positive(c1.value) || !positive(c2.value) || !positive(v2.value)) return fail('Les concentrations et le volume doivent être positifs.');
    if (c1.dim !== c2.dim) {
      return fail(`Concentration ${dimLabel(c1.dim)} d’un côté, ${dimLabel(c2.dim)} de l’autre : choisissez des unités comparables (ou convertissez d’abord avec le calcul de pesée).`);
    }
    if (c2.value > c1.value) return fail('La concentration finale dépasse celle de la solution mère.');
    const v1 = (c2.value * v2.value) / c1.value;
    const inputs = [];
    if (p.product?.trim()) inputs.push({ label: 'Produit', value: p.product.trim() });
    inputs.push(
      { label: 'Solution mère (C₁)', value: c1.text },
      { label: 'Concentration finale (C₂)', value: c2.text },
      { label: 'Volume final (V₂)', value: v2.text },
    );
    return ok({
      title: 'Dilution',
      formula: 'V₁ = C₂ × V₂ / C₁',
      inputs,
      results: [
        { label: 'Solution mère à prélever (V₁)', value: formatVolume(v1), main: true },
        { label: 'Diluant à ajouter', value: formatVolume(v2.value - v1) },
        { label: 'Facteur de dilution', value: dilutionFactor(c1.value, c2.value) },
      ],
    });
  },
};

// --- Solution à plusieurs composants (tampons) -------------------------------------------

export const newComponent = (id) => ({ id, name: '', mw: '', source: 'powder', conc: { v: '', u: 'mM' }, stock: { v: '', u: 'M' } });

const solution = {
  kind: 'solution',
  name: 'Tampon ou solution',
  short: 'Tampon',
  description: 'Recette d’une solution à plusieurs composants, en poudre ou à partir de solutions mères.',
  defaults: () => ({
    label: '',
    vol: { v: '100', u: 'mL' },
    items: [
      { ...newComponent('a'), name: 'Tris-HCl', mw: '157,6', conc: { v: '50', u: 'mM' } },
      { ...newComponent('b'), name: 'NaCl', mw: '58,44', conc: { v: '150', u: 'mM' } },
    ],
  }),
  compute(p) {
    const vol = readVolume(p.vol);
    if (!vol) return incomplete();
    if (!positive(vol.value)) return fail('Le volume final doit être positif.');
    const rows = [];
    let stockVolume = 0;
    let complete = true;
    for (const item of p.items ?? []) {
      const name = item.name?.trim() ?? '';
      const conc = readConc(item.conc);
      if (!name && !String(item.conc?.v ?? '').trim()) continue; // ligne vide
      const label = name || 'Composant sans nom';
      if (!conc) {
        complete = false;
        continue;
      }
      if (!positive(conc.value)) return fail(`${label} : la concentration doit être positive.`);
      if (item.source === 'stock') {
        const stock = readConc(item.stock);
        if (!stock) {
          complete = false;
          continue;
        }
        if (!positive(stock.value)) return fail(`${label} : la concentration de la solution mère doit être positive.`);
        if (stock.dim !== conc.dim) return fail(`${label} : solution mère et concentration finale ne sont pas dans des unités comparables.`);
        if (stock.value < conc.value) return fail(`${label} : la solution mère est moins concentrée que la solution finale.`);
        const v = (conc.value * vol.value) / stock.value;
        stockVolume += v;
        rows.push([label, conc.text, `${formatVolume(v)} de solution à ${stock.text}`]);
      } else {
        const mw = parseNumber(item.mw);
        let grams;
        if (conc.dim === 'molar') {
          if (!positive(mw)) {
            if (Number.isFinite(mw)) return fail(`${label} : la masse molaire doit être positive.`);
            complete = false;
            continue;
          }
          grams = conc.value * vol.value * mw;
        } else if (conc.dim === 'mass') {
          grams = conc.value * vol.value;
        } else {
          return fail(`${label} : une concentration ${dimLabel(conc.dim)} s’obtient à partir d’une solution mère.`);
        }
        rows.push([`${label}${positive(mw) && conc.dim === 'molar' ? ` (${echoNumber(mw)} g/mol)` : ''}`, conc.text, `${formatMass(grams)} à peser`]);
      }
    }
    if (!complete || !rows.length) return incomplete();
    const water = vol.value - stockVolume;
    if (water < -1e-12) return fail('Les solutions mères dépassent à elles seules le volume final.');
    return ok({
      title: 'Préparation d’une solution',
      formula: 'poudre : m = C × V × M ; solution mère : V = C × V_final / C_mère',
      inputs: [{ label: 'Volume final', value: vol.text }],
      table: { columns: ['Composant', 'Concentration finale', 'À ajouter'], rows },
      results: [
        { label: 'Compléter avec de l’eau jusqu’à', value: vol.text, main: true },
        ...(stockVolume > 0 ? [{ label: 'Eau à ajouter, hors volume des poudres', value: formatVolume(water) }] : []),
      ],
    });
  },
};

// --- Milieux de culture ------------------------------------------------------------------

const SCALED_UNIT = { 'g/L': ['g', 1], 'mg/L': ['g', 1e-3], 'mL/L': ['mL', 1] };

export function hasAgar(medium) {
  return medium.components.some((c) => /agar|phytagel/i.test(c.name));
}

const medium = {
  kind: 'medium',
  name: 'Milieu de culture',
  short: 'Milieux',
  description: `${MEDIA.length} recettes (bactéries, levures, champignons, plantes), à l’échelle du volume voulu.`,
  defaults: () => ({ label: '', medium: MEDIA[0].name, vol: { v: '500', u: 'mL' }, agar: false }),
  compute(p) {
    const m = MEDIA.find((x) => x.name === p.medium);
    if (!m) return fail('Milieu inconnu : choisissez-en un dans la liste.');
    const vol = readVolume(p.vol);
    if (!vol) return incomplete();
    if (!positive(vol.value)) return fail('Le volume final doit être positif.');
    const components = [...m.components];
    if (p.agar && !hasAgar(m)) components.push({ name: 'Agar (milieu solide)', qty: '15', unit: 'g/L' });
    const rows = components.map((c) => {
      const q = parseNumber(c.qty);
      const perLitre = Number.isFinite(q) ? `${echoNumber(q)} ${c.unit}` : c.qty;
      const scale = SCALED_UNIT[c.unit];
      if (!Number.isFinite(q) || !scale) return [c.name, perLitre, c.qty];
      const amount = q * scale[1] * vol.value; // vol en litres
      return [c.name, perLitre, scale[0] === 'g' ? formatMass(amount) : formatVolume(amount * 1e-3)];
    });
    return ok({
      title: `Milieu ${m.name}`,
      formula: 'quantité = quantité pour 1 L × volume (L)',
      inputs: [{ label: 'Milieu', value: `${m.name} (${m.category.toLowerCase()})` }, { label: 'Volume final', value: vol.text }],
      table: { columns: ['Composant', 'Pour 1 L', `Pour ${vol.text}`], rows },
      results: [
        { label: 'Compléter avec de l’eau jusqu’à', value: vol.text, main: true },
        { label: 'Ajuster le pH à', value: m.ph },
      ],
      notes: ['Stérilisation selon la recette (en général 15 min à 121 °C) ; antibiotiques et additifs thermolabiles après refroidissement.'],
    });
  },
};

// --- Master mix -------------------------------------------------------------------------

export const newMixItem = (id, name = '', vol = '', perTube = false) => ({ id, name, vol, perTube });

const mastermix = {
  kind: 'mastermix',
  name: 'Master mix',
  short: 'Master mix',
  description: 'Volumes d’un mélange réactionnel pour N réactions, avec une marge de pipetage.',
  defaults: () => ({
    label: '',
    reactions: '8',
    surplus: '10',
    items: [
      newMixItem('a', 'Tampon 10X', '5'),
      newMixItem('b', 'dNTP 10 mM', '1'),
      newMixItem('c', 'Amorce sens 10 µM', '1'),
      newMixItem('d', 'Amorce antisens 10 µM', '1'),
      newMixItem('e', 'Polymérase', '0,5'),
      newMixItem('f', 'Eau sans nucléase', '40,5'),
      newMixItem('g', 'Matrice', '1', true),
    ],
  }),
  compute(p) {
    const n = parseNumber(p.reactions);
    const surplus = parseNumber(p.surplus || '0');
    if (!Number.isFinite(n)) return incomplete();
    if (!Number.isInteger(n) || n < 1) return fail('Le nombre de réactions doit être un entier positif.');
    if (!Number.isFinite(surplus) || surplus < 0 || surplus > 100) return fail('La marge doit être comprise entre 0 et 100 %.');
    const factor = n * (1 + surplus / 100);
    const rows = [];
    let perReaction = 0;
    let inMix = 0;
    let complete = true;
    for (const item of p.items ?? []) {
      const name = item.name?.trim() ?? '';
      const v = parseNumber(item.vol);
      if (!name && !String(item.vol ?? '').trim()) continue;
      if (!Number.isFinite(v)) {
        complete = false;
        continue;
      }
      if (v < 0) return fail(`${name || 'Composant'} : volume négatif.`);
      perReaction += v;
      if (!item.perTube) inMix += v;
      rows.push([name || 'Composant sans nom', `${echoNumber(v)} µL`, item.perTube ? 'dans chaque tube' : `${formatNumber(v * factor)} µL`]);
    }
    if (!complete || !rows.length) return incomplete();
    const perTube = (p.items ?? []).filter((i) => i.perTube && Number.isFinite(parseNumber(i.vol)));
    return ok({
      title: 'Master mix',
      formula: `volume du mix = volume par réaction × ${n} réactions × (1 + ${echoNumber(surplus)} %)`,
      inputs: [{ label: 'Réactions', value: `${n}` }, { label: 'Marge de pipetage', value: `${echoNumber(surplus)} % (soit ${formatNumber(factor)} réactions)` }],
      table: { columns: ['Composant', 'Par réaction', `Mix (× ${formatNumber(factor)})`], rows },
      results: [
        { label: 'Mix à préparer', value: `${formatNumber(inMix * factor)} µL`, main: true },
        { label: 'À distribuer par tube', value: `${formatNumber(inMix)} µL de mix${perTube.length ? ` + ${perTube.map((i) => `${echoNumber(parseNumber(i.vol))} µL de ${i.name?.trim() || 'composant'}`).join(' + ')}` : ''}` },
        { label: 'Volume par réaction', value: `${formatNumber(perReaction)} µL` },
      ],
    });
  },
};

// --- ADN : masse, moles, concentration ------------------------------------------------------

function dnaLength(p) {
  const length = parseNumber(p.length);
  if (!Number.isFinite(length)) return null;
  return length;
}

function lengthText(p, length) {
  const unit = p.strand === 'ss' ? 'nt' : 'pb';
  const seq = p.sequence?.code ? ` (${p.sequence.code} ${p.sequence.name ?? ''})`.replace(/\s+\)$/, ')') : '';
  return `${length.toLocaleString('fr-FR')} ${unit}${seq}`;
}

const dna = {
  kind: 'dna',
  name: 'ADN : masse, moles et molarité',
  short: 'ADN',
  description: 'Conversion masse ↔ moles et ng/µL ↔ nM pour un ADN double ou simple brin.',
  defaults: () => ({
    label: '', mode: 'mass', strand: 'ds', length: '', sequence: null,
    mass: { v: '', u: 'ng' }, moles: { v: '', u: 'fmol' }, conc: { v: '', u: 'ng/µL' },
  }),
  compute(p) {
    const length = dnaLength(p);
    if (length === null) return incomplete();
    if (!Number.isInteger(length) || length < 1) return fail('La longueur doit être un nombre entier de bases.');
    const perBase = DNA_MW[p.strand] ?? DNA_MW.ds;
    const mw = length * perBase;
    const type = p.strand === 'ss' ? 'ADN simple brin' : 'ADN double brin';
    const inputs = [{ label: 'Type', value: type }, { label: 'Longueur', value: lengthText(p, length) }];
    const mwResult = { label: 'Masse molaire', value: `${formatNumber(mw)} g/mol` };
    const formulaMw = `M = longueur × ${perBase} g/mol`;
    if (p.mode === 'moles') {
      const amount = readAmount(p.moles);
      if (!amount) return incomplete();
      if (!positive(amount.value)) return fail('La quantité doit être positive.');
      return ok({
        title: 'ADN : masse pour une quantité de matière',
        formula: `m = n × M ; ${formulaMw}`,
        inputs: [...inputs, { label: 'Quantité voulue', value: amount.text }],
        results: [{ label: 'Masse', value: formatMass(amount.value * mw), main: true }, mwResult],
      });
    }
    if (p.mode === 'conc') {
      const conc = readConc(p.conc);
      if (!conc) return incomplete();
      if (conc.dim !== 'mass') return fail('Indiquez une concentration massique (ng/µL, µg/mL…).');
      if (!positive(conc.value)) return fail('La concentration doit être positive.');
      return ok({
        title: 'ADN : concentration molaire',
        formula: `C (mol/L) = C (g/L) / M ; ${formulaMw}`,
        inputs: [...inputs, { label: 'Concentration', value: conc.text }],
        results: [
          { label: 'Concentration molaire', value: formatMolar(conc.value / mw), main: true },
          { label: 'Quantité par µL', value: formatAmount((conc.value / mw) * 1e-6) },
          mwResult,
        ],
      });
    }
    const mass = readMass(p.mass);
    if (!mass) return incomplete();
    if (!positive(mass.value)) return fail('La masse doit être positive.');
    const mol = mass.value / mw;
    return ok({
      title: 'ADN : quantité de matière',
      formula: `n = m / M ; ${formulaMw}`,
      inputs: [...inputs, { label: 'Masse', value: mass.text }],
      results: [
        { label: 'Quantité', value: formatAmount(mol), main: true },
        { label: 'Molécules', value: formatNumber(mol * AVOGADRO, 3) },
        mwResult,
      ],
    });
  },
};

// --- Ligation : rapport insert / vecteur ---------------------------------------------------

const ligation = {
  kind: 'ligation',
  name: 'Ligation et assemblage',
  short: 'Ligation',
  description: 'Masse d’insert pour un rapport molaire insert / vecteur donné (ligation, Gibson, In-Fusion).',
  defaults: () => ({
    label: '', ratio: '3',
    vector: { length: '', mass: { v: '50', u: 'ng' }, sequence: null },
    insert: { length: '', sequence: null },
  }),
  compute(p) {
    const lv = dnaLength(p.vector ?? {});
    const li = dnaLength(p.insert ?? {});
    const mv = readMass(p.vector?.mass);
    const ratio = parseNumber(p.ratio);
    if (lv === null || li === null || !mv || !Number.isFinite(ratio)) return incomplete();
    if (!Number.isInteger(lv) || !Number.isInteger(li) || lv < 1 || li < 1) return fail('Les longueurs doivent être des nombres entiers de paires de bases.');
    if (!positive(mv.value) || !positive(ratio)) return fail('La masse de vecteur et le rapport doivent être positifs.');
    const insertMass = ratio * mv.value * (li / lv);
    const vectorMol = mv.value / (lv * DNA_MW.ds);
    return ok({
      title: 'Ligation : quantité d’insert',
      formula: 'm_insert = rapport × m_vecteur × L_insert / L_vecteur',
      inputs: [
        { label: 'Vecteur', value: `${lengthText({ ...p.vector, strand: 'ds' }, lv)}, ${mv.text}` },
        { label: 'Insert', value: lengthText({ ...p.insert, strand: 'ds' }, li) },
        { label: 'Rapport molaire insert / vecteur', value: `${echoNumber(ratio)} : 1` },
      ],
      results: [
        { label: 'Insert à ajouter', value: formatMass(insertMass), main: true },
        { label: 'Vecteur', value: formatAmount(vectorMol) },
        { label: 'Insert', value: formatAmount(vectorMol * ratio) },
      ],
    });
  },
};

// --- Centrifugation ------------------------------------------------------------------------

const centrifuge = {
  kind: 'centrifuge',
  name: 'Centrifugation',
  short: 'Centrifugation',
  description: 'Conversion entre vitesse de rotation (rpm) et accélération (× g) pour un rotor donné.',
  defaults: () => ({ label: '', mode: 'rpm', radius: '', rpm: '', rcf: '' }),
  compute(p) {
    const r = parseNumber(p.radius);
    const input = parseNumber(p.mode === 'rcf' ? p.rcf : p.rpm);
    if (!Number.isFinite(r) || !Number.isFinite(input)) return incomplete();
    if (!positive(r)) return fail('Le rayon du rotor doit être positif.');
    if (!positive(input)) return fail(p.mode === 'rcf' ? 'L’accélération doit être positive.' : 'La vitesse doit être positive.');
    const inputs = [{ label: 'Rayon du rotor', value: `${echoNumber(r)} mm` }];
    if (p.mode === 'rcf') {
      const rpm = Math.sqrt(input / (RCF_FACTOR_MM * r));
      return ok({
        title: 'Centrifugation',
        formula: 'rpm = √(RCF / (1,118 × 10⁻⁶ × r))   (r en mm)',
        inputs: [...inputs, { label: 'Accélération voulue', value: `${echoNumber(input)} × g` }],
        results: [{ label: 'Vitesse', value: `${Math.round(rpm).toLocaleString('fr-FR')} rpm`, main: true }],
      });
    }
    const rcf = RCF_FACTOR_MM * r * input * input;
    return ok({
      title: 'Centrifugation',
      formula: 'RCF = 1,118 × 10⁻⁶ × r × rpm²   (r en mm)',
      inputs: [...inputs, { label: 'Vitesse', value: `${echoNumber(input)} rpm` }],
      results: [{ label: 'Accélération', value: `${Math.round(rcf).toLocaleString('fr-FR')} × g`, main: true }],
    });
  },
};

export const CALCULATORS = [molarity, dilution, solution, medium, mastermix, dna, ligation, centrifuge];
const BY_KIND = new Map(CALCULATORS.map((c) => [c.kind, c]));
export const getCalculator = (kind) => BY_KIND.get(kind) ?? null;

/** Calcule et ajoute le libellé libre au résumé. */
export function runCalculator(kind, params) {
  const calc = getCalculator(kind);
  if (!calc) return fail('Calcul inconnu.');
  let result;
  try {
    result = calc.compute(params ?? calc.defaults());
  } catch (err) {
    console.error(err);
    return fail('Calcul impossible avec ces valeurs.');
  }
  if (!result.ok) return result;
  const label = cleanLabel(params?.label);
  return ok({ ...result.summary, ...(label ? { label } : {}) });
}

export { summaryToText } from './summary.js';
export { CONC_UNITS, MASS_UNITS, VOLUME_UNITS };
