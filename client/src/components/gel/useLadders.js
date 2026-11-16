import { useEffect, useState } from 'react';
import { api } from '../../api.js';

// Marqueurs de taille, chargés une fois et partagés (rechargés après une modification).
let cache = null;
const listeners = new Set();

export function loadLadders(force = false) {
  if (!cache || force) {
    cache = api.get('/ladders').catch((err) => {
      cache = null;
      throw err;
    });
    cache.then((list) => listeners.forEach((fn) => fn(list)), () => {});
  }
  return cache;
}

export default function useLadders() {
  const [list, setList] = useState(null);
  useEffect(() => {
    listeners.add(setList);
    loadLadders().then(setList).catch(() => setList([]));
    return () => listeners.delete(setList);
  }, []);
  return list;
}

/** Copie figée d'un marqueur, gardée dans l'analyse (et donc scellée avec la figure). */
export const ladderSnapshot = (l) => ({
  id: l.id, name: l.name, kind: l.kind, bands: l.bands.map((b) => ({ ...b })), load: l.load ?? null,
});
