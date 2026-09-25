// Stockage des échantillons : ce qui peut contenir quoi, positions (A1…), chemins, validation des saisies.
// Partagé par les routes /api/inventory ; le client en garde une copie (client/src/lib/inventory.js),
// vérifiée identique par les tests.

export const UNIT_KINDS = {
  room: { label: 'Pièce', children: ['freezer', 'fridge', 'tank', 'cabinet'] },
  freezer: { label: 'Congélateur', appliance: true, temperature: -80, children: ['shelf', 'rack', 'box', 'bag'] },
  fridge: { label: 'Réfrigérateur', appliance: true, temperature: 4, children: ['shelf', 'rack', 'box', 'bag'] },
  tank: { label: 'Cuve d’azote liquide', appliance: true, temperature: -196, children: ['rack', 'box', 'bag'] },
  cabinet: { label: 'Armoire', appliance: true, temperature: 20, children: ['shelf', 'rack', 'box', 'bag'] },
  shelf: { label: 'Étagère', children: ['rack', 'box', 'bag'] },
  rack: { label: 'Rack', children: ['box', 'bag'] },
  box: { label: 'Boîte', holdsSamples: true, children: [] },
  bag: { label: 'Sac', holdsSamples: true, children: [] },
};
export const ROOT_CHILDREN = ['room', 'freezer', 'fridge', 'tank', 'cabinet'];

export const canContain = (parentKind, kind) => (parentKind ? UNIT_KINDS[parentKind]?.children.includes(kind) : ROOT_CHILDREN.includes(kind)) ?? false;

export const SAMPLE_TYPES = {
  plasmid: { label: 'Plasmide', cap: 'blue' },
  strain: { label: 'Souche (glycérol)', cap: 'green' },
  cells: { label: 'Cellules', cap: 'pink' },
  protein: { label: 'Protéine', cap: 'orange' },
  antibody: { label: 'Anticorps', cap: 'purple' },
  dna: { label: 'ADN (PCR, digestion…)', cap: 'yellow' },
  rna: { label: 'ARN, ADNc', cap: 'red' },
  oligo: { label: 'Amorce, oligo', cap: 'grey' },
  tissue: { label: 'Tissu, sérum, lysat', cap: 'black' },
  reagent: { label: 'Réactif, tampon', cap: 'white' },
  other: { label: 'Autre', cap: 'white' },
};

// Couleurs de bouchons (inserts de cryotubes) ; une lettre chacune pour les mini-cartes des boîtes
export const CAP_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'white', 'grey', 'black'];
export const capOf = (s) => (CAP_COLORS.includes(s.cap_color) ? s.cap_color : SAMPLE_TYPES[s.type]?.cap ?? 'white');
export const capCode = (color) => String.fromCharCode(97 + Math.max(0, CAP_COLORS.indexOf(color)));

/**
 * Mini-carte d'une boîte : une lettre par position, ligne par ligne. « . » vide, a–j couleur du bouchon,
 * majuscule si le tube est sorti (sa place l'attend).
 */
export function boxMap(unit, samples) {
  const cells = Array(unit.rows * unit.cols).fill('.');
  for (const s of samples) {
    if (s.row == null || s.row >= unit.rows || s.col >= unit.cols) continue;
    const c = capCode(capOf(s));
    cells[s.row * unit.cols + s.col] = s.status === 'out' ? c.toUpperCase() : c;
  }
  return cells.join('');
}

export const rowLetter = (row) => String.fromCharCode(65 + row);
export const posLabel = (row, col) => (row == null || col == null ? '' : `${rowLetter(row)}${col + 1}`);

/** « c5 », « C 5 » → { row: 2, col: 4 } ; null si illisible. */
export function parsePos(text) {
  const m = /^\s*([A-Za-z])\s*0*(\d{1,2})\s*$/.exec(String(text ?? ''));
  if (!m) return null;
  return { row: m[1].toUpperCase().charCodeAt(0) - 65, col: Number(m[2]) - 1 };
}

/**
 * n positions libres dans l'ordre de lecture (A1, A2… B1…), à partir de start et en revenant au début
 * si besoin. occupied : Set de « ligne,colonne ». Renvoie moins de n positions si la boîte est pleine.
 */
export function freePositions({ rows, cols }, occupied, n, start = { row: 0, col: 0 }) {
  const out = [];
  const total = rows * cols;
  const first = Math.min(total - 1, Math.max(0, (start?.row ?? 0) * cols + (start?.col ?? 0)));
  for (let k = 0; k < total && out.length < n; k += 1) {
    const i = (first + k) % total;
    const row = Math.floor(i / cols);
    const col = i % cols;
    if (!occupied.has(`${row},${col}`)) out.push({ row, col });
  }
  return out;
}

/** Chemin de la racine jusqu'au contenant (inclus). */
export function unitPath(byId, id) {
  const path = [];
  const seen = new Set();
  let u = byId.get(id);
  while (u && !seen.has(u.id)) {
    seen.add(u.id);
    path.unshift(u);
    u = u.parent_id ? byId.get(u.parent_id) : null;
  }
  return path;
}

/** Vrai si candidate est id lui-même ou l'un de ses descendants (déplacer un contenant dans lui-même). */
export function isInside(byId, candidate, id) {
  return unitPath(byId, candidate).some((u) => u.id === id);
}

export const formatTemp = (t) => (t == null || !Number.isFinite(Number(t)) ? '' : `${Number(t) > 0 ? '+' : Number(t) < 0 ? '−' : ''}${Math.abs(Number(t)).toLocaleString('fr-FR')} °C`);

/** « −80 °C Thor › Étagère 2 › Boîte Plasmides › C5 » */
export function locationText(path, row = null, col = null) {
  const parts = path.map((u) => (UNIT_KINDS[u.kind]?.appliance && u.temperature != null ? `${formatTemp(u.temperature)} ${u.name}` : u.name));
  const pos = posLabel(row, col);
  if (pos) parts.push(pos);
  return parts.join(' › ');
}

// --- Validation des saisies ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const uuidOrNull = (v) => (UUID.test(String(v ?? '')) ? String(v) : null);
const dateOrNull = (v) => (DATE.test(String(v ?? '')) && !Number.isNaN(Date.parse(v)) ? String(v) : null);

export const SAMPLE_FIELDS = ['name', 'type', 'cap_color', 'concentration', 'volume', 'aliquot', 'frozen_on', 'expires_on', 'thaw_count', 'owner_id', 'project_id', 'sequence_id', 'entry_id', 'notes'];

/** Champs d'un échantillon, nettoyés ; seuls ceux présents dans body si partial. */
export function cleanSample(body, { partial = false } = {}) {
  const b = body ?? {};
  const out = {};
  const has = (k) => !partial || Object.hasOwn(b, k);
  if (has('name')) out.name = str(b.name, 200);
  if (has('type')) out.type = Object.hasOwn(SAMPLE_TYPES, b.type) ? b.type : 'other';
  if (has('cap_color')) out.cap_color = CAP_COLORS.includes(b.cap_color) ? b.cap_color : '';
  for (const k of ['concentration', 'volume', 'aliquot']) if (has(k)) out[k] = str(b[k], 80);
  if (has('notes')) out.notes = str(b.notes, 4000);
  for (const k of ['frozen_on', 'expires_on']) if (has(k)) out[k] = dateOrNull(b[k]);
  if (has('thaw_count')) out.thaw_count = Math.max(0, Math.min(999, Math.trunc(Number(b.thaw_count)) || 0));
  for (const k of ['owner_id', 'project_id', 'sequence_id', 'entry_id']) if (has(k)) out[k] = uuidOrNull(b[k]);
  if (!partial && !out.name) return { error: 'Donnez un nom à l’échantillon.' };
  if (partial && Object.hasOwn(out, 'name') && !out.name) return { error: 'Le nom ne peut pas être vide.' };
  return { fields: out };
}

export const UNIT_STYLES = ['upright', 'chest'];

/** Champs d'un contenant, nettoyés. */
export function cleanUnit(body, { partial = false, kind } = {}) {
  const b = body ?? {};
  const out = {};
  const has = (k) => !partial || Object.hasOwn(b, k);
  if (has('name')) out.name = str(b.name, 120);
  if (has('temperature')) {
    const t = b.temperature === '' || b.temperature == null ? null : Number(String(b.temperature).replace(',', '.').replace('−', '-'));
    out.temperature = Number.isFinite(t) && t >= -273 && t <= 200 ? t : null;
  }
  if (has('style')) out.style = UNIT_STYLES.includes(b.style) ? b.style : '';
  if (has('color')) out.color = /^#[0-9a-f]{6}$/i.test(String(b.color ?? '')) ? b.color : '';
  if (has('notes')) out.notes = str(b.notes, 2000);
  if (has('sort') && b.sort !== undefined) out.sort = Math.trunc(Number(b.sort)) || 0;
  if (kind === 'box') {
    for (const [k, max] of [['rows', 26], ['cols', 30]]) {
      if (!has(k)) continue;
      const v = Math.trunc(Number(b[k]));
      if (!(v >= 1 && v <= max)) return { error: `Une boîte a de 1 à ${max} ${k === 'rows' ? 'lignes' : 'colonnes'}.` };
      out[k] = v;
    }
  }
  if (!partial && !out.name) return { error: 'Donnez un nom.' };
  if (partial && Object.hasOwn(out, 'name') && !out.name) return { error: 'Le nom ne peut pas être vide.' };
  return { fields: out };
}

/**
 * Aménagement rapide d'un appareil : étagères × racks × boîtes (ou tours × boîtes pour une cuve).
 * Renvoie la liste des contenants à créer, du haut vers le bas : [{ key, parentKey, kind, name, rows?, cols?, sort }].
 */
export function quickLayout({ shelves = 0, racks = 0, boxes = 0, rows = 9, cols = 9 }, applianceKind) {
  const n = (v, max) => Math.max(0, Math.min(max, Math.trunc(Number(v)) || 0));
  const S = applianceKind === 'tank' ? 0 : n(shelves, 20);
  const R = n(racks, 20);
  const B = n(boxes, 30);
  const out = [];
  const rackWord = applianceKind === 'tank' ? 'Tour' : 'Rack';
  const addBoxes = (parentKey, prefix) => {
    for (let k = 1; k <= B; k += 1) out.push({ key: `${parentKey}/b${k}`, parentKey, kind: 'box', name: `${prefix}Boîte ${k}`, rows: n(rows, 26) || 9, cols: n(cols, 30) || 9, sort: k });
  };
  const addRacks = (parentKey, prefix) => {
    if (!R) { addBoxes(parentKey, prefix); return; }
    for (let r = 1; r <= R; r += 1) {
      const key = `${parentKey}/r${r}`;
      out.push({ key, parentKey, kind: 'rack', name: `${rackWord} ${String.fromCharCode(64 + r)}`, sort: r });
      addBoxes(key, '');
    }
  };
  if (S) {
    for (let s = 1; s <= S; s += 1) {
      const key = `s${s}`;
      out.push({ key, parentKey: null, kind: 'shelf', name: `Étagère ${s}`, sort: s });
      addRacks(key, '');
    }
  } else {
    addRacks('', '');
  }
  return out;
}

// --- Encart « Tubes » d'une entrée (nœud sampleRef) -------------------------------------------------

/** Tubes cités ou rangés depuis une entrée, nettoyés (ce qui est affiché, imprimé, cherché). */
export function sampleRefList(attrs) {
  const list = Array.isArray(attrs?.samples) ? attrs.samples : [];
  return list.slice(0, 500).map((s) => ({
    code: str(s?.code, 20), name: str(s?.name, 200), aliquot: str(s?.aliquot, 20), location: str(s?.location, 400),
  }));
}

export const sampleRefTitle = (attrs) => (attrs?.action === 'stored' ? 'Tubes rangés' : 'Tubes utilisés');

/** Texte de recherche : « Tubes rangés : ECH-0012 pUC19 (1/6), Salle 204 › … › C3 ; … » */
export function sampleRefText(attrs) {
  const list = sampleRefList(attrs);
  if (!list.length) return '';
  return `${sampleRefTitle(attrs)} : ${list.map((s) => `${s.code} ${s.name}${s.aliquot ? ` (${s.aliquot})` : ''}, ${s.location}`).join(' ; ')}`;
}
