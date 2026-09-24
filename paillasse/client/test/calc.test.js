// Calculateurs de paillasse : valeurs vérifiées à la main (et contre les calculateurs des fournisseurs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CALCULATORS, getCalculator, runCalculator, summaryToText } from '../src/lib/calc/calculators.js';
import { autoUnit, formatNumber, parseNumber, MASS_UNITS } from '../src/lib/calc/units.js';
import { MEDIA } from '../src/lib/calc/media.js';

const run = (kind, patch) => runCalculator(kind, { ...getCalculator(kind).defaults(), ...patch });
const result = (r, label) => r.summary.results.find((x) => x.label === label)?.value;
const main = (r) => r.summary.results.find((x) => x.main)?.value;
const nnbsp = (s) => s.replace(/ /g, ' '); // espace fine insécable des milliers

test('lecture des nombres : virgule, espaces, notation scientifique', () => {
  assert.equal(parseNumber('0,5'), 0.5);
  assert.equal(parseNumber(' 1 000,25 '), 1000.25);
  assert.equal(parseNumber('1e-3'), 0.001);
  assert.ok(Number.isNaN(parseNumber('')));
  assert.ok(Number.isNaN(parseNumber('12 mg')));
  assert.ok(Number.isNaN(parseNumber('1,2,3')));
});

test('mise en forme : 4 chiffres significatifs, à la française', () => {
  assert.equal(formatNumber(0.29224), '0,2922');
  assert.equal(nnbsp(formatNumber(21130.4)), '21 130');
  assert.equal(formatNumber(1.5e-6), '1,5 × 10⁻⁶');
  assert.equal(formatNumber(1.825e10, 3), '1,83 × 10¹⁰');
  assert.deepEqual(autoUnit(0.2922, MASS_UNITS), { value: 292.2, unit: 'mg' });
  assert.equal(autoUnit(0.99999, MASS_UNITS).unit, 'g', 'pas de « 1 000 mg »');
});

test('pesée : NaCl 500 mM, 100 mL', () => {
  const r = run('molarity', { reagent: 'NaCl', mw: '58,44', conc: { v: '500', u: 'mM' }, vol: { v: '100', u: 'mL' } });
  assert.ok(r.ok);
  assert.equal(main(r), '2,922 g');
  assert.equal(r.summary.inputs[0].value, 'NaCl (M = 58,44 g/mol)');
  assert.equal(r.summary.formula, 'm = C × V × M');
});

test('pesée : concentration massique (ampicilline 100 mg/mL, 10 mL), sans masse molaire', () => {
  const r = run('molarity', { reagent: 'Ampicilline', conc: { v: '100', u: 'mg/mL' }, vol: { v: '10', u: 'mL' } });
  assert.equal(main(r), '1 g');
  assert.equal(run('molarity', { conc: { v: '2', u: '% (m/v)' }, vol: { v: '50', u: 'mL' } }).summary.results[0].value, '1 g');
});

test('pesée : erreurs et saisie incomplète', () => {
  assert.deepEqual(run('molarity', { mw: '', conc: { v: '1', u: 'M' }, vol: { v: '1', u: 'L' } }), { ok: false, message: null });
  assert.match(run('molarity', { mw: '-3', conc: { v: '1', u: 'M' }, vol: { v: '1', u: 'L' } }).message, /positive/);
  assert.match(run('molarity', { conc: { v: '10', u: 'X' }, vol: { v: '1', u: 'L' } }).message, /dilution/);
});

test('concentration obtenue à partir d’une pesée', () => {
  const r = run('molarity', { mode: 'conc', mw: '58.44', mass: { v: '2.922', u: 'g' }, vol: { v: '100', u: 'mL' } });
  assert.equal(result(r, 'Concentration molaire'), '500 mM');
  assert.equal(result(r, 'Concentration massique'), '29,22 g/L');
});

test('dilution C1V1 = C2V2', () => {
  const r = run('dilution', { c1: { v: '1', u: 'M' }, c2: { v: '10', u: 'mM' }, v2: { v: '50', u: 'mL' } });
  assert.equal(main(r), '500 µL');
  assert.equal(result(r, 'Diluant à ajouter'), '49,5 mL');
  assert.equal(result(r, 'Facteur de dilution'), '1/100');
  // Unités massiques et X
  assert.equal(main(run('dilution', { c1: { v: '100', u: 'mg/mL' }, c2: { v: '100', u: 'µg/mL' }, v2: { v: '200', u: 'mL' } })), '200 µL');
  assert.equal(main(run('dilution', { c1: { v: '10', u: 'X' }, c2: { v: '1', u: 'X' }, v2: { v: '1', u: 'L' } })), '100 mL');
});

test('dilution : unités incompatibles, concentration finale trop forte', () => {
  assert.match(run('dilution', { c1: { v: '1', u: 'M' }, c2: { v: '1', u: 'mg/mL' }, v2: { v: '1', u: 'mL' } }).message, /comparables/);
  assert.match(run('dilution', { c1: { v: '1', u: 'mM' }, c2: { v: '2', u: 'mM' }, v2: { v: '1', u: 'mL' } }).message, /dépasse/);
});

test('tampon : poudres et solution mère, eau restante', () => {
  const r = run('solution', {});
  assert.ok(r.ok);
  assert.deepEqual(r.summary.table.rows.map((x) => x[2]), ['788 mg à peser', '876,6 mg à peser']);
  const withStock = run('solution', {
    vol: { v: '100', u: 'mL' },
    items: [{ id: 'g', name: 'Glycérol', source: 'stock', conc: { v: '10', u: '% (v/v)' }, stock: { v: '100', u: '% (v/v)' } }],
  });
  assert.equal(withStock.summary.table.rows[0][2], '10 mL de solution à 100 % (v/v)');
  assert.equal(result(withStock, 'Eau à ajouter, hors volume des poudres'), '90 mL');
  const tooMuch = run('solution', {
    vol: { v: '1', u: 'mL' },
    items: [{ id: 'x', name: 'A', source: 'stock', conc: { v: '600', u: 'mM' }, stock: { v: '1', u: 'M' } },
      { id: 'y', name: 'B', source: 'stock', conc: { v: '600', u: 'mM' }, stock: { v: '1', u: 'M' } }],
  });
  assert.match(tooMuch.message, /dépassent/);
});

test('milieu : LB pour 500 mL, avec agar', () => {
  const r = run('medium', { medium: 'LB (Luria-Bertani)', vol: { v: '500', u: 'mL' }, agar: true });
  assert.deepEqual(r.summary.table.rows.map((x) => x[2]), ['5 g', '2,5 g', '5 g', '7,5 g']);
  const m9 = run('medium', { medium: 'M9 minimal', vol: { v: '250', u: 'mL' } });
  assert.deepEqual(m9.summary.table.rows.find((x) => x[0] === 'Glucose (20 %)'), ['Glucose (20 %)', '20 mL/L', '5 mL']);
  assert.equal(result(m9, 'Ajuster le pH à'), '7,4');
});

test('milieux : toutes les recettes se calculent', () => {
  for (const m of MEDIA) assert.ok(run('medium', { medium: m.name }).ok, m.name);
});

test('master mix : 8 réactions + 10 %, matrice ajoutée tube par tube', () => {
  const r = run('mastermix', {});
  assert.equal(main(r), '431,2 µL');
  assert.equal(result(r, 'À distribuer par tube'), '49 µL de mix + 1 µL de Matrice');
  assert.equal(result(r, 'Volume par réaction'), '50 µL');
});

test('ADN : 100 ng d’un plasmide de 5 kb', () => {
  const r = run('dna', { length: '5000', mass: { v: '100', u: 'ng' } });
  assert.equal(main(r), '30,3 fmol');
  assert.equal(result(r, 'Molécules'), '1,82 × 10¹⁰');
  assert.equal(main(run('dna', { mode: 'conc', length: '5000', conc: { v: '150', u: 'ng/µL' } })), '45,45 nM');
  assert.equal(main(run('dna', { mode: 'moles', length: '3000', moles: { v: '50', u: 'fmol' } })), '99 ng');
  assert.equal(main(run('dna', { strand: 'ss', length: '20', mass: { v: '6.6', u: 'µg' } })), '1 nmol');
});

test('ligation : insert de 1 kb, vecteur de 3 kb, rapport 3:1', () => {
  const r = run('ligation', { vector: { length: '3000', mass: { v: '50', u: 'ng' } }, insert: { length: '1000' } });
  assert.equal(main(r), '50 ng');
  assert.equal(result(r, 'Vecteur'), '25,25 fmol');
});

test('centrifugation : rayon en mm (LabHelper se trompait d’un facteur 10)', () => {
  // Eppendorf 5424 : rotor de 84 mm, 15 000 rpm = 21 130 × g d'après le fabricant
  assert.equal(nnbsp(main(run('centrifuge', { radius: '84', rpm: '15000' }))), '21 130 × g');
  assert.equal(nnbsp(main(run('centrifuge', { mode: 'rcf', radius: '84', rcf: '21130' }))), '15 000 rpm');
});

test('chaque calculateur accepte ses valeurs par défaut et produit un texte', () => {
  for (const c of CALCULATORS) {
    const r = runCalculator(c.kind, c.defaults());
    if (r.ok) assert.ok(summaryToText(r.summary).length > 0, c.kind);
    else assert.equal(r.message, null, `${c.kind} : saisie vide = incomplet, pas une erreur`);
  }
  const labelled = run('dilution', { label: '  Stock IPTG ', c1: { v: '1', u: 'M' }, c2: { v: '1', u: 'mM' }, v2: { v: '10', u: 'mL' } });
  assert.equal(labelled.summary.label, 'Stock IPTG');
  assert.match(summaryToText(labelled.summary), /^Dilution : Stock IPTG\n/);
});
