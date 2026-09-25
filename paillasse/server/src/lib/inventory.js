// Stockage des échantillons : ce qui peut contenir quoi, positions (A1…), chemins, validation des saisies.
// Partagé par les routes /api/inventory ; le client en garde une copie (client/src/lib/inventory.js),
// vérifiée identique par les tests.

export const UNIT_KINDS = {
  room: { label: 'Pièce', children: ['freezer', 'fridge', 'tank', 'cabinet'] },
  freezer: { label: 'Congélateur', appliance: true, temperature: -80, children: ['shelf', 'rack', 'box', 'bag'] },
  fridge: { label: 'Réfrigérateur', appliance: true, temperature: 4, children: ['shelf', 'rack', 'box', 'bag'] },
  tank: { label: 'Cuve d’azote liquide', appliance: true, temperature: -196, children: ['canister', 'rack', 'box', 'bag'] },
  cabinet: { label: 'Armoire', appliance: true, temperature: 20, children: ['shelf', 'rack', 'box', 'bag'] },
  shelf: { label: 'Étagère', children: ['rack', 'box', 'bag'] },
  rack: { label: 'Rack', children: ['box', 'bag'] },
  box: { label: 'Boîte', holdsSamples: true, children: [] },
  bag: { label: 'Sac', holdsSamples: true, children: [] },
  // Cryo-EM : dewar › canister › puck › boîte à grilles › grille
  canister: { label: 'Canister', slotWord: 'niveau', children: ['puck'] },
  puck: { label: 'Puck', slotWord: 'case', children: ['gridbox'] },
  gridbox: { label: 'Boîte à grilles', holdsSamples: true, children: [] },
};

// Contenants numérotés (le nom est le numéro ou l'annotation), et ceux qui occupent une case de leur parent
export const NUMBERED = ['canister', 'puck', 'gridbox'];
export const SLOTTED = ['puck', 'gridbox'];
export const CAPACITY = { canister: { default: 5, max: 30 }, puck: { default: 12, max: 16 } };

// Boîtes à grilles : nombre de positions, et lesquelles reçoivent des grilles clippées
export const GRIDBOX_FORMATS = {
  g4: { label: '4 grilles non clippées', short: '4', size: 4, clipped: [false, false, false, false] },
  g4c: { label: '4 grilles clippées', short: '4 C', size: 4, clipped: [true, true, true, true] },
  g4c4: { label: '4 clippées + 4 non clippées', short: '4 C + 4', size: 8, clipped: [true, true, true, true, false, false, false, false] },
  g12: { label: '12 grilles', short: '12', size: 12, clipped: Array(12).fill(false) },
};

/** Contenant à positions numérotées : boîte (A1…) ou boîte à grilles (1–4, C1–C4 / N1–N4, 1–12). */
export const hasPositions = (u) => u?.kind === 'box' || u?.kind === 'gridbox';
export const isClippedPosition = (unit, col) => Boolean(GRIDBOX_FORMATS[unit?.format]?.clipped[col]);

/** Nom affiché : « Canister 3 », « Puck 12 », « Boîte 7 » ; les autres contenants gardent leur nom. */
export function unitLabel(u) {
  if (!u) return '';
  if (u.kind === 'canister') return `Canister ${u.name}`;
  if (u.kind === 'puck') return `Puck ${u.name}`;
  if (u.kind === 'gridbox') return `Boîte ${u.name}`;
  return u.name;
}
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
  grid: { label: 'Grille cryo-EM', cap: 'yellow' },
  other: { label: 'Autre', cap: 'white' },
};

// Grilles de cryo-EM : ce qu'on en sait après le criblage
export const GRID_SCREENING = {
  todo: 'Non criblée',
  good: 'Bonne glace',
  thick: 'Glace épaisse',
  thin: 'Glace fine, trous vides',
  aggregates: 'Agrégats',
  empty: 'Pas de particules',
  broken: 'Cassée, déchirée',
  collected: 'Collectée',
};
// Conditions de préparation (samples.details) et longueur maximale de chacune
export const GRID_FIELDS = {
  support: 80, glow: 80, instrument: 80, blot_time: 20, blot_force: 20, humidity: 20, chamber_temp: 20,
  additive: 120, session: 200,
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

/** Étiquette d'une position : A1 dans une boîte, 1–4, C1–C4 / N1–N4 ou 1–12 dans une boîte à grilles. */
export function positionLabel(unit, row, col) {
  if (row == null || col == null) return '';
  if (unit?.kind === 'gridbox') {
    if (unit.format === 'g4c4') return col < 4 ? `C${col + 1}` : `N${col - 3}`;
    return String(col + 1);
  }
  return posLabel(row, col);
}

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

/**
 * « −80 °C Thor › Étagère 2 › Boîte Plasmides › C5 »,
 * « −196 °C Dewar › Canister 3 › Puck 12 (niveau 2) › Boîte 7 (case 5) › grille C2 »
 */
export function locationText(path, row = null, col = null) {
  const parts = path.map((u) => {
    if (UNIT_KINDS[u.kind]?.appliance && u.temperature != null) return `${formatTemp(u.temperature)} ${u.name}`;
    const slotWord = u.slot != null && SLOTTED.includes(u.kind) ? UNIT_KINDS[path[path.indexOf(u) - 1]?.kind]?.slotWord : null;
    return slotWord ? `${unitLabel(u)} (${slotWord} ${u.slot})` : unitLabel(u);
  });
  const leaf = path.at(-1);
  const pos = positionLabel(leaf, row, col);
  if (pos) parts.push(leaf?.kind === 'gridbox' ? `grille ${pos}` : pos);
  return parts.join(' › ');
}

// --- Validation des saisies ---------------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => String(v ?? '').trim().slice(0, max);
const uuidOrNull = (v) => (UUID.test(String(v ?? '')) ? String(v) : null);
const dateOrNull = (v) => (DATE.test(String(v ?? '')) && !Number.isNaN(Date.parse(v)) ? String(v) : null);

export const SAMPLE_FIELDS = ['name', 'type', 'cap_color', 'concentration', 'volume', 'aliquot', 'frozen_on', 'expires_on', 'thaw_count', 'owner_id', 'project_id', 'sequence_id', 'entry_id', 'notes', 'details'];

/** Conditions d'une grille (support, glow discharge, Vitrobot, criblage…), nettoyées. */
export function cleanDetails(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return {};
  const out = {};
  for (const [k, max] of Object.entries(GRID_FIELDS)) {
    const v = str(d[k], max);
    if (v) out[k] = v;
  }
  if (Object.hasOwn(GRID_SCREENING, d.screening)) out.screening = d.screening;
  return out;
}

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
  if (has('details')) out.details = cleanDetails(b.details);
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
  if (kind === 'gridbox' && has('format')) {
    const f = GRIDBOX_FORMATS[b.format];
    if (!f) return { error: 'Choisissez le type de boîte à grilles.' };
    Object.assign(out, { format: b.format, rows: 1, cols: f.size });
  }
  if (CAPACITY[kind] && has('capacity') && b.capacity !== undefined && b.capacity !== null && b.capacity !== '') {
    const v = Math.trunc(Number(b.capacity));
    if (!(v >= 1 && v <= CAPACITY[kind].max)) return { error: `${UNIT_KINDS[kind].label} : de 1 à ${CAPACITY[kind].max} ${kind === 'canister' ? 'niveaux' : 'cases'}.` };
    out.capacity = v;
  }
  if (SLOTTED.includes(kind) && Object.hasOwn(b, 'slot')) {
    const v = b.slot === null || b.slot === '' ? null : Math.trunc(Number(b.slot));
    if (v !== null && !(v >= 1 && v <= 40)) return { error: 'Case invalide.' };
    out.slot = v;
  }
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
export function quickLayout({ shelves = 0, racks = 0, boxes = 0, rows = 9, cols = 9, canisters = 0, pucks = 0, firstPuck = 1, puckSlots = 12 }, applianceKind) {
  const n = (v, max) => Math.max(0, Math.min(max, Math.trunc(Number(v)) || 0));
  // Dewar de cryo-EM : canisters numérotés 1, 2, 3…, chacun rempli de pucks numérotés à la suite
  if (applianceKind === 'tank' && n(canisters, 30)) {
    const C = n(canisters, 30);
    const P = n(pucks, CAPACITY.canister.max);
    const slots = n(puckSlots, CAPACITY.puck.max) || CAPACITY.puck.default;
    let number = Math.max(1, Math.trunc(Number(firstPuck)) || 1);
    const out = [];
    for (let c = 1; c <= C; c += 1) {
      const key = `c${c}`;
      out.push({ key, parentKey: null, kind: 'canister', name: String(c), capacity: Math.max(P, 1), sort: c });
      for (let p = 1; p <= P; p += 1) {
        out.push({ key: `${key}/p${p}`, parentKey: key, kind: 'puck', name: String(number), capacity: slots, slot: p, sort: p });
        number += 1;
      }
    }
    return out;
  }
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

/** Encart de grilles de cryo-EM seulement : « Grilles rangées », « 4 grilles ». */
export const sampleRefGrids = (attrs) => Array.isArray(attrs?.samples) && attrs.samples.length > 0 && attrs.samples.every((s) => s?.type === 'grid');
export const sampleRefTitle = (attrs) => (sampleRefGrids(attrs)
  ? (attrs?.action === 'stored' ? 'Grilles rangées' : 'Grilles utilisées')
  : (attrs?.action === 'stored' ? 'Tubes rangés' : 'Tubes utilisés'));
export function sampleRefCount(attrs) {
  const n = sampleRefList(attrs).length;
  return `${n} ${sampleRefGrids(attrs) ? 'grille' : 'tube'}${n > 1 ? 's' : ''}`;
}

/** Texte de recherche : « Tubes rangés : ECH-0012 pUC19 (1/6), Salle 204 › … › C3 ; … » */
export function sampleRefText(attrs) {
  const list = sampleRefList(attrs);
  if (!list.length) return '';
  return `${sampleRefTitle(attrs)} : ${list.map((s) => `${s.code} ${s.name}${s.aliquot ? ` (${s.aliquot})` : ''}, ${s.location}`).join(' ; ')}`;
}
