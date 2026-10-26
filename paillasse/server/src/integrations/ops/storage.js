// Stockage des échantillons : vue d'ensemble, contenu d'une boîte, recherche de tubes, fiche et historique,
// alertes ; ranger, modifier, déplacer, sortir, remettre, jeter des tubes.
import { query } from '../../db.js';
import { HttpError, notFound } from '../../lib/errors.js';
import {
  CAP_COLORS, SAMPLE_TYPES, UNIT_KINDS, hasPositions, locationText, parsePos, positionLabel, unitLabel, unitPath,
} from '../../lib/inventory.js';
import {
  getSample, getUnit, loadUnits, moveSamples, sampleAction, searchSamples, storageOverview, storeSamples, updateSample, watchList,
} from '../../routes/inventory.js';
import { define } from '../registry.js';
import { bool, date, int, list, oneOf, params, str, uuid } from '../schema.js';
import { compact, isoDate, isoTime, sampleIdOf, sequenceIdOf, webUrl } from './common.js';

const GROUP = 'Stockage';
const TYPES = Object.keys(SAMPLE_TYPES);
const typeHelp = Object.entries(SAMPLE_TYPES).map(([k, v]) => `${k} (${v.label})`).join(', ');
const sampleRef = (description = 'Tube : identifiant (uuid) ou code (ECH-0001).') => str(description, { minLength: 1, maxLength: 60 });

const sampleView = (ctx, s) => compact({
  id: s.id, code: s.code, name: s.name, type: s.type, type_label: SAMPLE_TYPES[s.type]?.label,
  location: s.location, position: s.position, status: s.status === 'out' ? 'sorti du froid' : s.archived ? 'jeté' : 'rangé',
  out_since: isoTime(s.out_since), concentration: s.concentration, volume: s.volume, aliquot: s.aliquot,
  frozen_on: isoDate(s.frozen_on), expires_on: isoDate(s.expires_on), thaw_count: s.thaw_count || undefined,
  cap_color: s.cap_color, owner: s.owner_name, project: s.project_name,
  sequence: s.sequence_id ? { id: s.sequence_id, code: s.sequence_code, name: s.sequence_name } : undefined,
  entry: s.entry_id ? { id: s.entry_id, title: s.entry_title } : undefined,
  notes: s.notes, details: s.details && Object.keys(s.details).length ? s.details : undefined,
  url: webUrl(ctx, `/storage?sample=${s.id}`),
});

define({
  name: 'storage_overview',
  title: 'Vue d’ensemble du stockage',
  group: GROUP,
  scope: 'read',
  http: { method: 'GET', path: '/storage' },
  description: 'Appareils et contenants du stockage (congélateurs, réfrigérateurs, cuves d’azote, étagères, racks, tiroirs, boîtes, '
    + 'sacs, canisters, pucks, boîtes à grilles) avec leur chemin, leur température, le nombre de tubes et la place libre. '
    + 'Filtres : type de contenant, contenant parent, nom.',
  input: params({
    kind: oneOf(Object.keys(UNIT_KINDS), `Type de contenant : ${Object.keys(UNIT_KINDS).join(', ')}.`),
    parent_id: uuid('Seulement les contenants rangés directement dans celui-ci.'),
    query: str('Mot du nom du contenant.', { maxLength: 100 }),
    limit: int('Nombre de contenants (1 à 1000).', { minimum: 1, maximum: 1000, default: 300 }),
  }),
  async handler(a) {
    const { units, loose } = await storageOverview();
    const byId = new Map(units.map((u) => [u.id, u]));
    const q = a.query?.toLowerCase();
    const picked = units.filter((u) => (!a.kind || u.kind === a.kind) && (!a.parent_id || u.parent_id === a.parent_id)
      && (!q || unitLabel(u).toLowerCase().includes(q)));
    return {
      count: picked.length,
      tubes_outside_storage: loose,
      units: picked.slice(0, a.limit).map((u) => compact({
        id: u.id, kind: u.kind, kind_label: UNIT_KINDS[u.kind]?.label, name: unitLabel(u), path: locationText(unitPath(byId, u.id)),
        parent_id: u.parent_id, temperature: u.temperature ?? undefined,
        tubes: UNIT_KINDS[u.kind]?.holdsSamples ? u.count : undefined,
        capacity: hasPositions(u) ? u.rows * u.cols : undefined,
        free: hasPositions(u) ? u.rows * u.cols - u.count : undefined,
        out: u.out || undefined,
      })),
      truncated: picked.length > a.limit || undefined,
    };
  },
});

define({
  name: 'get_storage_unit',
  title: 'Contenu d’un contenant',
  group: GROUP,
  scope: 'read',
  http: { method: 'GET', path: '/storage/units/{unit_id}' },
  description: 'Un contenant : chemin complet, et pour une boîte ou un sac, les tubes qu’il contient (position, code, nom) et '
    + 'les positions libres ; pour les autres, les contenants rangés dedans.',
  input: params({ unit_id: uuid('Identifiant du contenant.') }, ['unit_id']),
  async handler(a, ctx) {
    const { unit, path, samples } = await getUnit(ctx.user, a.unit_id);
    const { list: all } = await loadUnits();
    const children = all.filter((u) => u.parent_id === unit.id);
    let free;
    if (hasPositions(unit)) {
      const taken = new Set(samples.map((s) => `${s.row},${s.col}`));
      free = [];
      for (let r = 0; r < unit.rows; r += 1) for (let c = 0; c < unit.cols; c += 1) if (!taken.has(`${r},${c}`)) free.push(positionLabel(unit, r, c));
    }
    return compact({
      id: unit.id, kind: unit.kind, kind_label: UNIT_KINDS[unit.kind]?.label, name: unitLabel(unit), path: locationText(path),
      temperature: unit.temperature ?? undefined, notes: unit.notes,
      size: hasPositions(unit) ? `${unit.rows} × ${unit.cols}` : undefined,
      tubes: UNIT_KINDS[unit.kind]?.holdsSamples ? samples.map((s) => compact({ position: s.position, code: s.code, name: s.name, id: s.id, status: s.status === 'out' ? 'sorti' : undefined })) : undefined,
      free_positions: free ? (free.length > 40 ? [...free.slice(0, 40), `… (${free.length} libres)`] : free) : undefined,
      free_count: free?.length,
      contains: children.map((u) => ({ id: u.id, kind: u.kind, name: unitLabel(u) })),
      url: webUrl(ctx, `/storage/${unit.id}`),
    });
  },
});

define({
  name: 'find_samples',
  title: 'Chercher des tubes',
  group: GROUP,
  scope: 'read',
  essential: true,
  http: { method: 'GET', path: '/samples' },
  description: 'Cherche des tubes rangés (pas les jetés) : par texte (nom, code, notes, concentration, code ou nom de la séquence liée), '
    + `type, séquence, entrée, contenant, ou statut (out = sorti du froid). Renvoie l’emplacement complet. Types : ${typeHelp}.`,
  input: params({
    query: str('Texte cherché.', { maxLength: 200 }),
    type: oneOf(TYPES, 'Type de tube.'),
    sequence_id: str('Séquence liée : uuid ou code SEQ-0001.', { maxLength: 60 }),
    entry_id: uuid('Entrée liée.'),
    unit_id: uuid('Contenant (boîte, sac).'),
    status: oneOf(['stored', 'out'], 'stored (rangés) ou out (sortis du froid).'),
    limit: int('Nombre de tubes (1 à 200).', { minimum: 1, maximum: 200, default: 25 }),
    offset: int('Décalage pour la page suivante.', { minimum: 0, default: 0 }),
  }),
  async handler(a, ctx) {
    const rows = await searchSamples(ctx.user, {
      q: a.query, type: a.type, sequence: a.sequence_id ? await sequenceIdOf(a.sequence_id) : undefined,
      entry: a.entry_id, unit: a.unit_id, status: a.status, limit: a.limit + 1, offset: a.offset,
    });
    const more = rows.length > a.limit;
    return { samples: rows.slice(0, a.limit).map((s) => sampleView(ctx, s)), next_offset: more ? a.offset + a.limit : null };
  },
});

define({
  name: 'get_sample',
  title: 'Fiche d’un tube',
  group: GROUP,
  scope: 'read',
  essential: true,
  http: { method: 'GET', path: '/samples/{sample_id}' },
  description: 'Fiche d’un tube : emplacement complet, contenu, concentration, volume, dates, décongélations, liens (séquence, '
    + 'entrée, projet) et historique de tous les gestes (rangé, déplacé, sorti, remis…).',
  input: params({ sample_id: sampleRef() }, ['sample_id']),
  async handler(a, ctx) {
    const s = await getSample(ctx.user, await sampleIdOf(a.sample_id));
    return { ...sampleView(ctx, s), history: s.events.map((e) => compact({ at: isoTime(e.created_at), kind: e.kind, detail: e.detail, by: e.author })) };
  },
});

define({
  name: 'storage_alerts',
  title: 'Tubes à surveiller',
  group: GROUP,
  scope: 'read',
  http: { method: 'GET', path: '/storage/alerts' },
  description: 'À surveiller : tubes sortis du froid depuis trop longtemps, périmés ou bientôt périmés, trop souvent décongelés, '
    + 'et boîtes presque pleines.',
  input: params({}),
  async handler(_a, ctx) {
    const w = await watchList(ctx.user);
    const pick = (list) => list.map((s) => sampleView(ctx, s));
    return { limits: w.limits, out_too_long: pick(w.out), expired: pick(w.expired), expiring_soon: pick(w.expiring), thawed_often: pick(w.thawed), nearly_full_boxes: w.full };
  },
});

// --- Écriture ----------------------------------------------------------------------------------------------------

/** Position (« A1 », « C5 », ou « 3 » dans une boîte à grilles) → { row, col } dans ce contenant. */
async function positionIn(unitId, label) {
  const { byId } = await loadUnits();
  const unit = byId.get(unitId);
  if (!unit) throw notFound('Contenant');
  if (!hasPositions(unit)) return { unit, pos: null };
  if (label == null || label === '') return { unit, pos: null };
  let pos = null;
  if (unit.kind === 'gridbox') {
    // Boîte à grilles : 1–12, ou C1–C4 (clippées) / N1–N4 (non clippées) pour le format mixte
    const m = /^\s*(?:grille\s*)?([CN]?)\s*(\d{1,2})\s*$/i.exec(String(label));
    if (m) pos = { row: 0, col: unit.format === 'g4c4' && m[1].toUpperCase() === 'N' ? Number(m[2]) + 3 : Number(m[2]) - 1 };
  } else {
    pos = parsePos(label);
  }
  if (!pos || pos.row < 0 || pos.col < 0 || pos.row >= unit.rows || pos.col >= unit.cols) {
    throw new HttpError(400, `Position « ${label} » hors de ${unitLabel(unit)} (${unit.rows} × ${unit.cols} : A1 à ${positionLabel(unit, unit.rows - 1, unit.cols - 1)}).`);
  }
  return { unit, pos };
}

const sampleFields = {
  name: str('Nom du tube (ce qu’il contient).', { maxLength: 200 }),
  type: oneOf(TYPES, `Type : ${typeHelp}.`),
  concentration: str('Concentration (texte libre : « 250 ng/µL »).', { maxLength: 80 }),
  volume: str('Volume (« 50 µL »).', { maxLength: 80 }),
  aliquot: str('Aliquot (« 1/10 »).', { maxLength: 80 }),
  cap_color: oneOf(CAP_COLORS, 'Couleur du bouchon.'),
  frozen_on: date('Date de congélation (AAAA-MM-JJ).'),
  expires_on: date('Date de péremption (AAAA-MM-JJ).'),
  notes: str('Notes.', { maxLength: 4000 }),
  sequence_id: str('Séquence liée : uuid ou code SEQ-0001.', { maxLength: 60 }),
  entry_id: uuid('Entrée liée (où le tube a été préparé).'),
  project_id: uuid('Projet lié.'),
};

async function linkFields(a) {
  const out = { ...a };
  if (a.sequence_id) out.sequence_id = await sequenceIdOf(a.sequence_id);
  return out;
}

define({
  name: 'store_samples',
  title: 'Ranger des tubes',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/samples' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: 'Range un tube (ou count aliquots identiques) dans une boîte ou un sac (get_storage_unit pour la place libre). '
    + 'position : place exacte d’un tube seul (refusée si occupée), ou première place à partir de laquelle ranger les aliquots ; '
    + 'sans position : premières places libres. Renvoie les codes ECH-… créés et leurs emplacements.',
  input: params({
    unit_id: uuid('Boîte ou sac où ranger.'),
    count: int('Nombre d’aliquots identiques (1 à 200).', { minimum: 1, maximum: 200, default: 1 }),
    position: str('Position : A1, C5… (ou 1–12, C1/N1 dans une boîte à grilles).', { maxLength: 10 }),
    ...sampleFields,
  }, ['unit_id', 'name']),
  async handler(a, ctx) {
    const { unit, pos } = await positionIn(a.unit_id, a.position);
    if (!UNIT_KINDS[unit.kind].holdsSamples) throw new HttpError(400, `${unitLabel(unit)} ne contient pas de tubes : choisissez une boîte ou un sac.`);
    const { unit_id: unitId, count, position, ...rest } = await linkFields(a);
    const body = pos && count === 1
      ? { unit_id: unitId, items: [{ ...rest, row: pos.row, col: pos.col }] }
      : { unit_id: unitId, sample: rest, count, ...(pos ? { start: pos } : {}) };
    const created = await storeSamples(ctx.user, body);
    return {
      created: created.map((s) => ({ id: s.id, code: s.code, name: s.name, position: positionLabel(unit, s.row, s.col) || undefined, location: s.location, url: webUrl(ctx, `/storage?sample=${s.id}`) })),
    };
  },
});

define({
  name: 'update_sample',
  title: 'Modifier un tube',
  group: GROUP,
  scope: 'write',
  http: { method: 'PATCH', path: '/samples/{sample_id}' },
  annotations: { destructiveHint: false, idempotentHint: true },
  description: 'Modifie la fiche d’un tube (nom, type, concentration, volume, dates, notes, liens…) ; seuls les champs donnés changent. '
    + 'Chaque modification est notée dans son historique.',
  input: params({
    sample_id: sampleRef(),
    ...sampleFields,
    thaw_count: int('Nombre de décongélations.', { minimum: 0, maximum: 999 }),
  }, ['sample_id']),
  async handler(a, ctx) {
    const id = await sampleIdOf(a.sample_id);
    const { sample_id: _, ...fields } = await linkFields(a);
    if (!Object.keys(fields).length) throw new HttpError(400, 'Rien à modifier : donnez au moins un champ.');
    await updateSample(ctx.user, id, fields);
    return sampleView(ctx, await getSample(ctx.user, id));
  },
});

define({
  name: 'move_sample',
  title: 'Déplacer un tube',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/samples/{sample_id}/move' },
  annotations: { destructiveHint: false, idempotentHint: true },
  description: 'Déplace un tube vers une boîte ou un sac (à une position donnée, sinon à la première place libre). '
    + 'Le déplacement est noté dans son historique.',
  input: params({
    sample_id: sampleRef(),
    unit_id: uuid('Boîte ou sac de destination.'),
    position: str('Position dans la boîte (A1…) ; sinon la première libre.', { maxLength: 10 }),
  }, ['sample_id', 'unit_id']),
  async handler(a, ctx) {
    const id = await sampleIdOf(a.sample_id);
    let { unit, pos } = await positionIn(a.unit_id, a.position);
    if (!UNIT_KINDS[unit.kind].holdsSamples) throw new HttpError(400, `${unitLabel(unit)} ne contient pas de tubes : choisissez une boîte ou un sac.`);
    if (hasPositions(unit) && !pos) {
      const { rows } = await query('SELECT row, col FROM samples WHERE unit_id = $1 AND NOT archived AND row IS NOT NULL AND id <> $2', [unit.id, id]);
      const taken = new Set(rows.map((r) => `${r.row},${r.col}`));
      for (let r = 0; r < unit.rows && !pos; r += 1) for (let c = 0; c < unit.cols && !pos; c += 1) if (!taken.has(`${r},${c}`)) pos = { row: r, col: c };
      if (!pos) throw new HttpError(409, `${unitLabel(unit)} est pleine.`);
    }
    const [moved] = await moveSamples(ctx.user, [{ id, unit_id: unit.id, row: pos?.row ?? null, col: pos?.col ?? null }]);
    return { id, code: moved.code, name: moved.name, from: moved.from, to: moved.to };
  },
});

define({
  name: 'sample_action',
  title: 'Sortir, remettre, décongeler, jeter',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/samples/action' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: 'Geste sur un ou plusieurs tubes : out (sorti du froid, sa place l’attend), back (remis en place ; thawed = true '
    + 'compte une décongélation), thaw (décongélation notée), discard (épuisé ou jeté, avec une raison), restore (remis en service).',
  input: params({
    sample_ids: list({ type: 'string', minLength: 1, maxLength: 60 }, 'Tubes : uuid ou codes ECH-0001 (1 à 100).', { minItems: 1, maxItems: 100 }),
    action: oneOf(['out', 'back', 'thaw', 'discard', 'restore'], 'out, back, thaw, discard ou restore.'),
    thawed: bool('Pour back : le tube a décongelé (compte une décongélation).', { default: false }),
    reason: str('Raison (pour discard, out).', { maxLength: 300 }),
  }, ['sample_ids', 'action']),
  async handler(a, ctx) {
    const ids = [];
    for (const ref of a.sample_ids) ids.push(await sampleIdOf(ref));
    const done = await sampleAction(ctx.user, { ids: [...new Set(ids)], action: a.action, thawed: a.thawed, reason: a.reason });
    return { done: done.map((d) => ({ code: d.code, name: d.name, detail: d.detail })), unchanged: ids.length - new Set(done.map((d) => d.id)).size };
  },
});
