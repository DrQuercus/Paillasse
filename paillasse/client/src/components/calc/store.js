// Dernières valeurs saisies dans chaque calculateur (confort, propre à ce navigateur).
// Ce qui compte vraiment est enregistré dans les entrées du cahier, pas ici.
import { CALCULATORS, getCalculator } from '../../lib/calc/calculators.js';

const PARAMS_KEY = 'paillasse.calc.params';
const KIND_KEY = 'paillasse.calc.kind';

function read(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

function write(storage, key, value) {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch { /* stockage indisponible : sans importance */ }
}

/** Paramètres mémorisés d'un calculateur, complétés par les valeurs par défaut (champs ajoutés depuis). */
export function storedParams(kind) {
  const calc = getCalculator(kind);
  const saved = read(localStorage, PARAMS_KEY)?.[kind];
  return saved && typeof saved === 'object' ? { ...calc.defaults(), ...saved } : calc.defaults();
}

export function storeParams(kind, params) {
  const all = read(localStorage, PARAMS_KEY) ?? {};
  write(localStorage, PARAMS_KEY, { ...all, [kind]: params });
  write(localStorage, KIND_KEY, kind);
}

export function lastKind() {
  const k = read(localStorage, KIND_KEY);
  return getCalculator(k) ? k : CALCULATORS[0].kind;
}

