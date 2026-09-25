// Stockage des échantillons, côté interface : règles partagées avec le serveur (inventory-core.js,
// copie conforme de server/src/lib/inventory.js vérifiée par les tests) et aides d'affichage.
export * from './inventory-core.js';
import { CAP_COLORS, SAMPLE_TYPES, UNIT_KINDS, parsePos } from './inventory-core.js';

// Teintes des bouchons, proches des inserts de couleur des cryotubes
export const CAP_HEX = {
  red: '#E5484D', orange: '#F76B15', yellow: '#FFC53D', green: '#30A46C', blue: '#0090FF',
  purple: '#8E4EC6', pink: '#E93D82', white: '#F4F4F5', grey: '#8B8D98', black: '#1C2024',
};
export const CAP_LABELS = {
  red: 'rouge', orange: 'orange', yellow: 'jaune', green: 'vert', blue: 'bleu',
  purple: 'violet', pink: 'rose', white: 'blanc', grey: 'gris', black: 'noir',
};
export const capColor = (s) => (CAP_COLORS.includes(s?.cap_color) ? s.cap_color : SAMPLE_TYPES[s?.type]?.cap ?? 'white');
/** Couleur du texte lisible sur un bouchon. */
export const capInk = (color) => (['white', 'yellow', 'orange'].includes(color) ? '#1C2024' : '#fff');
/** Lettre de mini-carte → { color, out } ; null si la place est libre. */
export function decodeCell(ch) {
  if (!ch || ch === '.') return null;
  const lower = ch.toLowerCase();
  return { color: CAP_COLORS[lower.charCodeAt(0) - 97] ?? 'white', out: ch !== lower };
}

/** Ambiance de l'appareil selon sa température. */
export function tempTheme(t) {
  const v = Number(t);
  if (!Number.isFinite(v)) return 'ambient';
  if (v <= -150) return 'ln2';
  if (v <= -50) return 'ultra';
  if (v < 0) return 'freezer';
  if (v <= 10) return 'fridge';
  return 'ambient';
}
export const THEME_LABELS = { ln2: 'Azote liquide', ultra: 'Ultra-congélateur', freezer: 'Congélateur', fridge: 'Réfrigérateur', ambient: 'Température ambiante' };

/** Arbre des contenants : enfants, et totaux cumulés (tubes, places, boîtes) de chaque contenant. */
export function buildTree(units) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const children = new Map();
  for (const u of units) {
    const key = u.parent_id && byId.has(u.parent_id) ? u.parent_id : null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(u);
  }
  const totals = new Map();
  const walk = (u) => {
    const t = { tubes: u.count ?? 0, out: u.out ?? 0, capacity: u.kind === 'box' ? u.rows * u.cols : 0, placed: u.kind === 'box' ? u.count ?? 0 : 0, boxes: u.kind === 'box' || u.kind === 'bag' ? 1 : 0 };
    for (const c of children.get(u.id) ?? []) {
      const ct = walk(c);
      t.tubes += ct.tubes; t.out += ct.out; t.capacity += ct.capacity; t.placed += ct.placed; t.boxes += ct.boxes;
    }
    totals.set(u.id, t);
    return t;
  };
  for (const u of children.get(null) ?? []) walk(u);
  return { byId, children: (id) => children.get(id ?? null) ?? [], totals: (id) => totals.get(id) ?? { tubes: 0, out: 0, capacity: 0, placed: 0, boxes: 0 } };
}

export const isAppliance = (u) => Boolean(UNIT_KINDS[u?.kind]?.appliance);
export const holdsSamples = (u) => Boolean(UNIT_KINDS[u?.kind]?.holdsSamples);

/** Nom court d'un tube, pour l'écrire sur son bouchon (premier mot, 6 caractères au plus). */
export function capText(s, max = 6) {
  const name = String(s?.name ?? '').trim();
  const word = name.split(/[\s_\-/,]+/).find(Boolean) ?? '';
  return word.slice(0, max) || String(s?.code ?? '').slice(-3);
}

/** « à l’instant », « depuis 3 h » */
export function since(date) {
  const a = ago(date);
  return a === 'à l’instant' ? a : a.replace('il y a', 'depuis');
}

/** « il y a 3 h », « il y a 2 j » */
export function ago(date) {
  const ms = Date.now() - new Date(date).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}

/** Tableau collé depuis Excel (plan de boîte) → grille de noms, sans les en-têtes 1…n et A…. */
export function parseBoxGrid(text) {
  let grid = String(text ?? '').replace(/\r/g, '').split('\n').filter((l, i, a) => l.trim() || i < a.length - 1)
    .map((l) => l.split(l.includes('\t') ? '\t' : ';').map((c) => c.trim()));
  while (grid.length && grid.at(-1).every((c) => !c)) grid.pop();
  if (!grid.length) return [];
  const isHeaderRow = (r) => r.filter(Boolean).length > 1 && r.filter(Boolean).every((c) => /^\d+$/.test(c));
  if (isHeaderRow(grid[0])) grid = grid.slice(1);
  const firstIsLetters = grid.length > 0 && grid.every((r, i) => !r[0] || r[0].toUpperCase() === String.fromCharCode(65 + i));
  if (firstIsLetters && grid.some((r) => r[0])) grid = grid.map((r) => r.slice(1));
  return grid;
}

/**
 * Deux formes acceptées :
 * - le plan de la boîte tel qu'on le tient dans Excel (une case = un tube, en-têtes 1…n et A… facultatifs) ;
 * - une liste « position ↹ nom (↹ concentration ↹ volume) », une ligne par tube.
 */
export function readPasted(text, box) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').map((l) => l.split(l.includes('\t') ? '\t' : ';').map((c) => c.trim())).filter((r) => r.some(Boolean));
  const asList = lines.length > 0 && lines.every((r) => parsePos(r[0]) && r.length >= 2);
  if (asList) {
    return lines.map((r) => ({ ...parsePos(r[0]), name: r[1], concentration: r[2] ?? '', volume: r[3] ?? '' })).filter((t) => t.name);
  }
  const grid = parseBoxGrid(text);
  const out = [];
  grid.forEach((row, r) => row.forEach((name, c) => { if (name) out.push({ row: r, col: c, name }); }));
  return out.map((t) => ({ ...t, outside: t.row >= box.rows || t.col >= box.cols }));
}
