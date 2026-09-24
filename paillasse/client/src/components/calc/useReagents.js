import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { fold } from '../../lib/calc/units.js';

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

// Liste des produits chargée une seule fois et partagée par tous les calculateurs ouverts
let cache = null;
const listeners = new Set();

export function loadReagents(force = false) {
  if (!cache || force) {
    cache = api.get('/reagents')
      .then((list) => list.sort((a, b) => collator.compare(a.name, b.name)))
      .catch((err) => {
        cache = null;
        throw err;
      });
    cache.then((list) => listeners.forEach((fn) => fn(list)), () => {});
  }
  return cache;
}

/** Produits de la base (null pendant le chargement). */
export function useReagents() {
  const [list, setList] = useState(null);
  useEffect(() => {
    listeners.add(setList);
    loadReagents().then(setList).catch(() => setList([]));
    return () => listeners.delete(setList);
  }, []);
  return list;
}

/** Recherche insensible aux accents : nom, formule ou catégorie ; les noms qui commencent par la saisie d'abord. */
export function searchReagents(list, q) {
  const needle = fold(q).trim();
  if (!list || !needle) return [];
  const scored = [];
  for (const r of list) {
    const name = fold(r.name);
    let score = -1;
    if (name.startsWith(needle)) score = 0;
    else if (name.includes(needle)) score = 1;
    else if (fold(r.formula).includes(needle)) score = 2;
    else if (fold(r.category).includes(needle)) score = 3;
    if (score >= 0) scored.push([score, r]);
  }
  return scored.sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

export const findReagent = (list, name) => list?.find((r) => fold(r.name) === fold(name).trim()) ?? null;
