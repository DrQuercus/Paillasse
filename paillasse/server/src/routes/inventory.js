// Stockage des échantillons : appareils, étagères, racks, boîtes et tubes (voir migrations/010_storage.sql).
import { Router } from 'express';
import { assertEntry, assertProject, assertSequence, visibleProjectIds } from '../lib/access.js';
import { query, tx } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import {
  CAPACITY, CAP_COLORS, GRIDBOX_FORMATS, GRID_SCREENING, SAMPLE_TYPES, SLOTTED, UNIT_KINDS, boxMap, canContain, capOf,
  cleanSample, cleanUnit, freePositions, hasPositions, isInside, locationText, positionLabel, quickLayout, unitLabel, unitPath,
} from '../lib/inventory.js';
import { canonicalize } from '../lib/hash.js';
import { escapeHtml } from '../lib/render.js';

const router = Router();

// Seuils de la liste « À surveiller »
const OUT_TOO_LONG_HOURS = 2;
const THAW_LIMIT = 3;
const EXPIRING_DAYS = 30;
const FULL_RATIO = 0.9;

const UNIT_COLUMNS = 'id, parent_id, kind, name, temperature, style, rows, cols, color, notes, sort, format, slot, capacity';

async function loadUnits(db) {
  const { rows } = await db.query(`SELECT ${UNIT_COLUMNS} FROM storage_units WHERE NOT archived ORDER BY sort, lower(name)`);
  return { list: rows, byId: new Map(rows.map((u) => [u.id, u])) };
}

const SAMPLE_SELECT = `
  SELECT s.*, o.display_name AS owner_name, q.code AS sequence_code, q.name AS sequence_name, q.project_id AS sequence_project_id,
         e.title AS entry_title, e.project_id AS entry_project_id, p.name AS project_name
  FROM samples s
  LEFT JOIN users o ON o.id = s.owner_id
  LEFT JOIN sequences q ON q.id = s.sequence_id
  LEFT JOIN entries e ON e.id = s.entry_id
  LEFT JOIN projects p ON p.id = s.project_id`;

// Le stockage est commun au labo ; seuls le titre d'une entrée, le nom d'une séquence et le nom d'un projet
// privés sont masqués
const withLocation = (byId, visible = null) => (s) => {
  const path = s.unit_id ? unitPath(byId, s.unit_id) : [];
  const privateEntry = visible && s.entry_id && !visible.has(s.entry_project_id);
  const privateSequence = visible && s.sequence_id && s.sequence_project_id && !visible.has(s.sequence_project_id);
  const privateProject = visible && s.project_id && !visible.has(s.project_id);
  return {
    ...s,
    ...(privateEntry ? { entry_title: 'entrée d’un projet privé', entry_private: true } : {}),
    ...(privateSequence ? { sequence_name: 'séquence d’un projet privé', sequence_private: true } : {}),
    ...(privateProject ? { project_name: 'projet privé', project_private: true } : {}),
    position: positionLabel(path.at(-1), s.row, s.col),
    location: locationText(path, s.row, s.col),
    path: path.map((u) => ({ id: u.id, kind: u.kind, name: u.name, temperature: u.temperature, slot: u.slot, format: u.format })),
  };
};

/** Première case libre d'un canister (niveau) ou d'un puck (case), ou null s'il est plein. */
async function freeSlot(db, parent, exceptId = null) {
  const { rows } = await db.query(
    'SELECT slot FROM storage_units WHERE parent_id = $1 AND NOT archived AND slot IS NOT NULL AND id IS DISTINCT FROM $2',
    [parent.id, exceptId],
  );
  const taken = new Set(rows.map((r) => r.slot));
  for (let k = 1; k <= (parent.capacity ?? 0); k += 1) if (!taken.has(k)) return k;
  return null;
}

const slotTaken = (err, parent, slot) => {
  if (err.code === '23505') return new HttpError(409, `${unitLabel(parent)} : ${UNIT_KINDS[parent.kind].slotWord} ${slot} déjà occupé${parent.kind === 'puck' ? 'e' : ''}.`);
  return err;
};

const event = (db, sampleId, kind, detail, userId) => db.query(
  'INSERT INTO sample_events (sample_id, kind, detail, created_by) VALUES ($1, $2, $3, $4)',
  [sampleId, kind, detail, userId],
);

// --- Vue d'ensemble : tous les contenants, leurs comptes et la mini-carte des boîtes -------------------

router.get('/', async (_req, res) => {
  const { list } = await loadUnits({ query });
  const { rows: samples } = await query('SELECT unit_id, row, col, cap_color, type, status FROM samples WHERE NOT archived AND unit_id IS NOT NULL');
  const byUnit = new Map();
  for (const s of samples) {
    if (!byUnit.has(s.unit_id)) byUnit.set(s.unit_id, []);
    byUnit.get(s.unit_id).push(s);
  }
  const units = list.map((u) => {
    const own = byUnit.get(u.id) ?? [];
    return {
      ...u,
      count: own.length,
      out: own.filter((s) => s.status === 'out').length,
      grids: own.filter((s) => s.type === 'grid').length,
      ...(hasPositions(u) ? { map: boxMap(u, own) } : {}),
    };
  });
  const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM samples WHERE NOT archived AND unit_id IS NULL');
  res.json({ units, loose: n });
});

// --- Contenants ------------------------------------------------------------------------------------------

router.get('/units/:id', async (req, res) => {
  const { byId } = await loadUnits({ query });
  const unit = byId.get(req.params.id);
  if (!unit) throw notFound('Contenant');
  let samples = [];
  if (UNIT_KINDS[unit.kind].holdsSamples) {
    const { rows } = await query(`${SAMPLE_SELECT} WHERE s.unit_id = $1 AND NOT s.archived ORDER BY s.row NULLS LAST, s.col, s.created_at`, [unit.id]);
    samples = rows.map(withLocation(byId, await visibleProjectIds(req.user.id)));
  }
  res.json({ unit, path: unitPath(byId, unit.id), samples });
});

router.post('/units', async (req, res) => {
  const b = req.body ?? {};
  const kind = String(b.kind ?? '');
  if (!UNIT_KINDS[kind]) throw new HttpError(400, 'Type de contenant inconnu.');
  const { fields, error } = cleanUnit(b, { kind });
  if (error) throw new HttpError(400, error);
  const created = await tx(async (db) => {
    let parent = null;
    if (b.parent_id) {
      const { rows } = await db.query('SELECT id, kind, name, capacity FROM storage_units WHERE id = $1 AND NOT archived', [b.parent_id]);
      parent = rows[0];
      if (!parent) throw notFound('Contenant parent');
    }
    if (!canContain(parent?.kind ?? null, kind)) {
      throw new HttpError(400, `${UNIT_KINDS[kind].label} : ne peut pas se ranger ${parent ? `dans : ${UNIT_KINDS[parent.kind].label.toLowerCase()}` : 'directement à la racine'}.`);
    }
    // Puck dans un niveau de canister, boîte dans une case de puck : la case demandée, ou la première libre
    let slot = null;
    if (SLOTTED.includes(kind)) {
      slot = fields.slot ?? await freeSlot(db, parent);
      if (slot == null) throw new HttpError(409, `${unitLabel(parent)} est plein.`);
      if (slot > parent.capacity) throw new HttpError(400, `${unitLabel(parent)} n’a que ${parent.capacity} ${UNIT_KINDS[parent.kind].slotWord}s.`);
    }
    const temperature = UNIT_KINDS[kind].appliance ? (fields.temperature ?? UNIT_KINDS[kind].temperature) : null;
    const capacity = CAPACITY[kind] ? fields.capacity ?? CAPACITY[kind].default : null;
    const { rows: [{ next }] } = await db.query('SELECT coalesce(max(sort), 0) + 1 AS next FROM storage_units WHERE parent_id IS NOT DISTINCT FROM $1 AND NOT archived', [parent?.id ?? null]);
    let unit;
    try {
      ({ rows: [unit] } = await db.query(
        `INSERT INTO storage_units (parent_id, kind, name, temperature, style, rows, cols, color, notes, sort, format, slot, capacity, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14) RETURNING ${UNIT_COLUMNS}`,
        [parent?.id ?? null, kind, fields.name, temperature, fields.style ?? '', hasPositions({ kind }) ? fields.rows : null, hasPositions({ kind }) ? fields.cols : null,
          fields.color ?? '', fields.notes ?? '', fields.sort ?? next, fields.format ?? '', slot, capacity, req.user.id],
      ));
    } catch (err) {
      throw slotTaken(err, parent, slot);
    }
    // Aménagement rapide : étagères, racks et boîtes, ou canisters et pucks, créés d'un coup
    if (UNIT_KINDS[kind].appliance && b.layout) {
      const plan = quickLayout(b.layout, kind);
      if (plan.length > 600) throw new HttpError(400, 'Aménagement trop grand (600 contenants au plus d’un coup).');
      const ids = new Map([['', unit.id]]);
      for (const p of plan) {
        const { rows: [c] } = await db.query(
          `INSERT INTO storage_units (parent_id, kind, name, rows, cols, sort, capacity, slot, created_by, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
          [ids.get(p.parentKey ?? '') ?? unit.id, p.kind, p.name, p.rows ?? null, p.cols ?? null, p.sort, p.capacity ?? null, p.slot ?? null, req.user.id],
        );
        ids.set(p.key, c.id);
      }
    }
    return unit;
  });
  res.status(201).json(created);
});

/**
 * Modifier un contenant, le déplacer (parent_id), ou le changer de case (slot) : une case occupée par un
 * contenant du même genre donne un échange (glisser une boîte sur une autre dans un puck).
 */
router.put('/units/:id', async (req, res) => {
  const b = req.body ?? {};
  const updated = await tx(async (db) => {
    const { list, byId } = await loadUnits(db);
    const unit = byId.get(req.params.id);
    if (!unit) throw notFound('Contenant');
    const { fields, error } = cleanUnit(b, { partial: true, kind: unit.kind });
    if (error) throw new HttpError(400, error);
    if (hasPositions(unit) && (fields.rows || fields.cols)) {
      const rows = fields.rows ?? unit.rows;
      const cols = fields.cols ?? unit.cols;
      const { rows: outside } = await db.query('SELECT count(*)::int AS n FROM samples WHERE unit_id = $1 AND NOT archived AND (row >= $2 OR col >= $3)', [unit.id, rows, cols]);
      if (outside[0].n) throw new HttpError(409, `${outside[0].n} échantillon(s) seraient hors de la boîte : déplacez-les d’abord.`);
    }
    if (fields.capacity && fields.capacity < (unit.capacity ?? 0)) {
      const beyond = list.filter((u) => u.parent_id === unit.id && u.slot > fields.capacity);
      if (beyond.length) throw new HttpError(409, `${beyond.map(unitLabel).join(', ')} : au-delà de ${fields.capacity}. Déplacez-les d’abord.`);
    }
    const moving = Object.hasOwn(b, 'parent_id') && (b.parent_id ?? null) !== unit.parent_id;
    if (moving) {
      const parent = b.parent_id ? byId.get(b.parent_id) : null;
      if (b.parent_id && !parent) throw notFound('Nouveau contenant parent');
      if (!canContain(parent?.kind ?? null, unit.kind)) throw new HttpError(400, `${UNIT_KINDS[unit.kind].label} : ne peut pas aller là.`);
      if (parent && isInside(byId, parent.id, unit.id)) throw new HttpError(400, 'Un contenant ne peut pas aller dans lui-même.');
      fields.parent_id = parent?.id ?? null;
      if (!Object.hasOwn(fields, 'sort')) fields.sort = list.filter((u) => u.parent_id === fields.parent_id).length + 1;
    }
    let swap = null;
    if (SLOTTED.includes(unit.kind) && (moving || Object.hasOwn(fields, 'slot'))) {
      const parentId = moving ? fields.parent_id : unit.parent_id;
      const parent = byId.get(parentId);
      let slot = fields.slot ?? null;
      if (slot == null) slot = await freeSlot(db, parent, unit.id);
      if (slot == null) throw new HttpError(409, `${unitLabel(parent)} est plein.`);
      if (slot > parent.capacity) throw new HttpError(400, `${unitLabel(parent)} n’a que ${parent.capacity} ${UNIT_KINDS[parent.kind].slotWord}s.`);
      const occupant = list.find((u) => u.parent_id === parentId && u.slot === slot && u.id !== unit.id);
      if (occupant) {
        if (unit.slot == null || !unit.parent_id) throw new HttpError(409, `${unitLabel(parent)} : ${UNIT_KINDS[parent.kind].slotWord} ${slot} déjà occupé.`);
        // Échange : l'occupant prend la case que l'on quitte
        swap = { id: occupant.id, parent_id: unit.parent_id, slot: unit.slot };
        await db.query('UPDATE storage_units SET slot = NULL WHERE id = $1', [occupant.id]);
      }
      fields.slot = slot;
    }
    const keys = Object.keys(fields);
    if (!keys.length) return unit;
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows: [u] } = await db.query(
      `UPDATE storage_units SET ${sets}, updated_by = $${keys.length + 2}, updated_at = now() WHERE id = $1 RETURNING ${UNIT_COLUMNS}`,
      [unit.id, ...keys.map((k) => fields[k]), req.user.id],
    );
    if (swap) {
      await db.query('UPDATE storage_units SET parent_id = $2, slot = $3, updated_by = $4, updated_at = now() WHERE id = $1', [swap.id, swap.parent_id, swap.slot, req.user.id]);
    }
    return u;
  });
  res.json(updated);
});

// Un contenant se retire une fois vide (ni tube, ni sous-contenant)
router.post('/units/:id/archive', async (req, res) => {
  const { rows: [c] } = await query(
    `SELECT (SELECT count(*) FROM storage_units WHERE parent_id = $1 AND NOT archived)::int AS children,
            (SELECT count(*) FROM samples WHERE unit_id = $1 AND NOT archived)::int AS samples`,
    [req.params.id],
  );
  if (c.children || c.samples) {
    throw new HttpError(409, `Encore ${[c.children && `${c.children} contenant(s)`, c.samples && `${c.samples} tube(s)`].filter(Boolean).join(' et ')} à l’intérieur : videz-le d’abord.`);
  }
  const { rowCount } = await query('UPDATE storage_units SET archived = true, updated_by = $2, updated_at = now() WHERE id = $1', [req.params.id, req.user.id]);
  if (!rowCount) throw notFound('Contenant');
  res.json({ ok: true });
});

// Plan imprimable d'une boîte (à coller sur le couvercle) ou liste du contenu d'un sac
router.get('/units/:id/print', async (req, res) => {
  const { byId } = await loadUnits({ query });
  const unit = byId.get(req.params.id);
  if (!unit || !UNIT_KINDS[unit.kind].holdsSamples) throw notFound('Boîte');
  const { rows } = await query(`${SAMPLE_SELECT} WHERE s.unit_id = $1 AND NOT s.archived ORDER BY s.row NULLS LAST, s.col`, [unit.id]);
  const samples = rows.map(withLocation(byId, await visibleProjectIds(req.user.id)));
  res.type('html').send(renderBoxSheet(unit, unitPath(byId, unit.id), samples));
});

const CAP_HEX = { red: '#E5484D', orange: '#F76B15', yellow: '#FFC53D', green: '#30A46C', blue: '#0090FF', purple: '#8E4EC6', pink: '#E93D82', white: '#F4F4F5', grey: '#8B8D98', black: '#1C2024' };

function renderBoxSheet(unit, path, samples) {
  const at = new Map(samples.filter((s) => s.row != null).map((s) => [`${s.row},${s.col}`, s]));
  const grid = unit.kind === 'box' ? `<table class="grid"><thead><tr><th></th>${Array.from({ length: unit.cols }, (_, c) => `<th>${c + 1}</th>`).join('')}</tr></thead><tbody>${
    Array.from({ length: unit.rows }, (_, r) => `<tr><th>${String.fromCharCode(65 + r)}</th>${Array.from({ length: unit.cols }, (_, c) => {
      const s = at.get(`${r},${c}`);
      return s ? `<td><span class="cap" style="background:${CAP_HEX[capOf(s)]}"></span><b>${escapeHtml(s.name)}</b><small>${escapeHtml(s.code)}${s.aliquot ? ` · ${escapeHtml(s.aliquot)}` : ''}</small></td>` : '<td class="free"></td>';
    }).join('')}</tr>`).join('')}</tbody></table>` : '';
  const extra = (s) => (unit.kind === 'gridbox' ? [s.details?.support, s.details?.screening ? GRID_SCREENING[s.details.screening] : ''].filter(Boolean).join(' · ') : [s.concentration, s.volume].filter(Boolean).join(' · '));
  const list = samples.map((s) => `<tr><td>${escapeHtml(positionLabel(unit, s.row, s.col))}</td><td>${escapeHtml(s.code)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(SAMPLE_TYPES[s.type]?.label ?? '')}</td><td>${escapeHtml(extra(s))}</td><td>${escapeHtml(s.frozen_on ?? '')}</td><td>${escapeHtml(s.owner_name ?? '')}</td></tr>`).join('');
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${escapeHtml(unitLabel(unit))} : plan</title>
<style>
body{font:12px/1.35 system-ui,sans-serif;color:#1D2940;margin:1.2cm}
h1{font-size:18px;margin:0 0 2px}.path{color:#56627A;margin:0 0 12px}
.grid{border-collapse:collapse;table-layout:fixed;width:100%;margin-bottom:16px}
.grid th{font-size:11px;color:#56627A;width:1.6em}
.grid td{border:1px solid #9AA6B8;height:${unit.cols > 10 ? 44 : 56}px;vertical-align:top;padding:3px;overflow:hidden;word-break:break-word}
.grid td b{display:block;font-size:${unit.cols > 10 ? 8 : 9.5}px;line-height:1.15}.grid td small{color:#56627A;font-size:8px}
.grid td.free{background:repeating-linear-gradient(45deg,#fff 0 6px,#F1F4F8 6px 8px)}
.cap{display:inline-block;width:9px;height:9px;border-radius:50%;border:1px solid #0003;float:right}
.list{border-collapse:collapse;width:100%}.list td,.list th{border-bottom:1px solid #D2DAE3;padding:3px 5px;text-align:left}
.corner{font-size:11px;color:#56627A}
@media print{body{margin:.8cm}button{display:none}}
</style>
<button onclick="print()">Imprimer</button>
<h1>${escapeHtml(unitLabel(unit))}</h1>
<p class="path">${escapeHtml(locationText(path))}${unit.kind === 'box' ? ` · ${unit.rows} × ${unit.cols}` : ''}${unit.kind === 'gridbox' ? ` · ${escapeHtml(GRIDBOX_FORMATS[unit.format]?.label ?? '')}` : ''} · ${samples.length} ${unit.kind === 'gridbox' ? 'grille(s)' : 'tube(s)'} · imprimé le ${new Date().toLocaleDateString('fr-FR')}</p>
${unit.kind === 'box' ? '<p class="corner">A1 = coin coupé de la boîte, en haut à gauche.</p>' : ''}
${grid}
<table class="list"><thead><tr><th>Position</th><th>Code</th><th>Nom</th><th>Type</th><th>${unit.kind === 'gridbox' ? 'Support · criblage' : 'Conc. · volume'}</th><th>${unit.kind === 'gridbox' ? 'Vitrifiée le' : 'Congelé le'}</th><th>Propriétaire</th></tr></thead><tbody>${list}</tbody></table>
</html>`;
}

// --- Échantillons --------------------------------------------------------------------------------------

router.get('/samples', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const params = [];
  const where = ['NOT s.archived'];
  if (q) {
    params.push(`%${escaped}%`);
    const i = params.length;
    where.push(`(s.name ILIKE $${i} OR s.code ILIKE $${i} OR s.notes ILIKE $${i} OR s.concentration ILIKE $${i} OR q.code ILIKE $${i} OR q.name ILIKE $${i})`);
  }
  if (SAMPLE_TYPES[req.query.type]) { params.push(req.query.type); where.push(`s.type = $${params.length}`); }
  if (req.query.sequence) { params.push(req.query.sequence); where.push(`s.sequence_id = $${params.length}`); }
  if (req.query.entry) { params.push(req.query.entry); where.push(`s.entry_id = $${params.length}`); }
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const { rows } = await query(
    `${SAMPLE_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY (s.code ILIKE $${params.length + 1}) DESC, s.updated_at DESC LIMIT ${limit}`,
    [...params, escaped],
  );
  const { byId } = await loadUnits({ query });
  res.json(rows.map(withLocation(byId, await visibleProjectIds(req.user.id))));
});

router.get('/samples/:id', async (req, res) => {
  const { rows: [s] } = await query(`${SAMPLE_SELECT} WHERE s.id = $1`, [req.params.id]);
  if (!s) throw notFound('Échantillon');
  const { byId } = await loadUnits({ query });
  const { rows: events } = await query(
    `SELECT ev.kind, ev.detail, ev.created_at, u.display_name AS author FROM sample_events ev
     LEFT JOIN users u ON u.id = ev.created_by WHERE ev.sample_id = $1 ORDER BY ev.created_at DESC, ev.id`,
    [s.id],
  );
  res.json({ ...withLocation(byId, await visibleProjectIds(req.user.id))(s), events });
});

/**
 * Ranger des tubes dans une boîte ou un sac.
 * - { unit_id, sample: {…}, count, start: { row, col } } : count aliquots identiques, aux premières places libres ;
 * - { unit_id, items: [{ …champs, row, col }] } : tubes décrits un par un (plan de boîte collé depuis Excel).
 */
router.post('/samples', async (req, res) => {
  const b = req.body ?? {};
  for (const raw of Array.isArray(b.items) ? b.items.slice(0, 500) : [b.sample]) {
    const { fields } = cleanSample(raw);
    if (fields) await checkLinks(req.user, fields);
  }
  const created = await tx(async (db) => {
    const { byId } = await loadUnits(db);
    const unit = byId.get(b.unit_id);
    if (!unit || !UNIT_KINDS[unit.kind].holdsSamples) throw new HttpError(400, 'Choisissez une boîte ou un sac où ranger les tubes.');
    const { rows: taken } = await db.query('SELECT row, col FROM samples WHERE unit_id = $1 AND NOT archived AND row IS NOT NULL FOR UPDATE', [unit.id]);
    const occupied = new Set(taken.map((t) => `${t.row},${t.col}`));
    let items;
    if (Array.isArray(b.items)) {
      if (!b.items.length || b.items.length > 500) throw new HttpError(400, 'Entre 1 et 500 tubes à la fois.');
      items = b.items.map((it) => {
        const { fields, error } = cleanSample(it);
        if (error) throw new HttpError(400, error);
        if (hasPositions(unit) && (it.row == null || it.col == null)) throw new HttpError(400, `Position manquante pour « ${fields.name} ».`);
        return { fields, row: it.row ?? null, col: it.col ?? null };
      });
    } else {
      const { fields, error } = cleanSample(b.sample);
      if (error) throw new HttpError(400, error);
      const count = Math.trunc(Number(b.count ?? 1));
      if (!(count >= 1 && count <= 200)) throw new HttpError(400, 'Entre 1 et 200 tubes à la fois.');
      const spots = hasPositions(unit) ? freePositions(unit, occupied, count, b.start) : Array(count).fill({ row: null, col: null });
      if (spots.length < count) throw new HttpError(409, `Il ne reste que ${spots.length} place(s) libre(s) dans cette boîte.`);
      items = spots.map((p, k) => ({ fields: { ...fields, aliquot: count > 1 ? `${k + 1}/${count}` : fields.aliquot }, ...p }));
    }
    const out = [];
    for (const it of items) {
      let { row, col } = it;
      if (hasPositions(unit)) {
        row = Math.trunc(Number(row));
        col = Math.trunc(Number(col));
        if (!(row >= 0 && row < unit.rows && col >= 0 && col < unit.cols)) throw new HttpError(400, 'Position hors de la boîte.');
        if (occupied.has(`${row},${col}`)) throw new HttpError(409, `La position ${positionLabel(unit, row, col)} est déjà prise.`);
        occupied.add(`${row},${col}`);
      } else {
        row = null;
        col = null;
      }
      const f = it.fields;
      const { rows: [s] } = await db.query(
        `INSERT INTO samples (name, type, unit_id, row, col, cap_color, concentration, volume, aliquot, frozen_on, expires_on,
           thaw_count, owner_id, project_id, sequence_id, entry_id, notes, details, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::date, current_date), $11, $12, coalesce($13::uuid, $17::uuid), $14, $15, $16, $18, $19, $17, $17)
         RETURNING id, code, name, row, col`,
        [f.name, f.type, unit.id, row, col, f.cap_color, f.concentration, f.volume, f.aliquot ?? '', f.frozen_on, f.expires_on,
          f.thaw_count ?? 0, f.owner_id, f.project_id, f.sequence_id, f.entry_id, req.user.id, f.notes, JSON.stringify(f.details ?? {})],
      );
      await event(db, s.id, 'created', `Rangé : ${locationText(unitPath(byId, unit.id), row, col)}`, req.user.id);
      out.push(s);
    }
    return out;
  });
  res.status(201).json(created);
});

/** On ne rattache un tube qu'à ce que l'on peut voir. */
async function checkLinks(user, f, cur = {}) {
  if (f.project_id && f.project_id !== cur.project_id) await assertProject(user, f.project_id);
  if (f.sequence_id && f.sequence_id !== cur.sequence_id) await assertSequence(user, f.sequence_id);
  if (f.entry_id && f.entry_id !== cur.entry_id) await assertEntry(user, f.entry_id);
}

const FIELD_LABELS = {
  name: 'nom', type: 'type', cap_color: 'couleur du bouchon', concentration: 'concentration', volume: 'volume', aliquot: 'aliquot',
  frozen_on: 'date de congélation', expires_on: 'péremption', thaw_count: 'décongélations', owner_id: 'propriétaire',
  project_id: 'projet', sequence_id: 'séquence', entry_id: 'entrée', notes: 'notes', details: 'conditions',
};

// Comparaison d'une valeur saisie à celle en base (dates en texte, jsonb aux clés réordonnées)
const same = (a, b) => (a && typeof a === 'object') || (b && typeof b === 'object')
  ? canonicalize(a ?? {}) === canonicalize(b ?? {})
  : String(a ?? '') === String(b ?? '');

router.put('/samples/:id', async (req, res) => {
  const { fields, error } = cleanSample(req.body, { partial: true });
  if (error) throw new HttpError(400, error);
  const updated = await tx(async (db) => {
    const { rows: [cur] } = await db.query('SELECT * FROM samples WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!cur) throw notFound('Échantillon');
    await checkLinks(req.user, fields, cur);
    const changed = Object.keys(fields).filter((k) => !same(fields[k], cur[k]));
    if (!changed.length) return cur;
    const sets = changed.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows: [s] } = await db.query(
      `UPDATE samples SET ${sets}, updated_by = $${changed.length + 2}, updated_at = now() WHERE id = $1 RETURNING *`,
      [cur.id, ...changed.map((k) => (k === 'details' ? JSON.stringify(fields[k]) : fields[k])), req.user.id],
    );
    // Résultat de criblage d'une grille : noté à part dans l'historique
    const screening = fields.details?.screening;
    if (changed.includes('details') && screening && screening !== cur.details?.screening) {
      await event(db, cur.id, 'screened', `Criblage : ${GRID_SCREENING[screening]}`, req.user.id);
    }
    const others = changed.filter((k) => k !== 'details' || !screening || canonicalize({ ...fields.details, screening: null }) !== canonicalize({ ...cur.details, screening: null }));
    if (others.length) await event(db, cur.id, 'edited', `Modifié : ${others.map((k) => FIELD_LABELS[k]).join(', ')}`, req.user.id);
    return s;
  });
  res.json(updated);
});

/**
 * Déplacements groupés (glisser-déposer, échange de deux tubes, transfert vers une autre boîte) :
 * { moves: [{ id, unit_id, row, col }] }. Les places libérées par le lot peuvent être reprises par le lot.
 */
router.post('/samples/move', async (req, res) => {
  const moves = Array.isArray(req.body?.moves) ? req.body.moves : [];
  if (!moves.length || moves.length > 500) throw new HttpError(400, 'Rien à déplacer.');
  await tx(async (db) => {
    const { byId } = await loadUnits(db);
    const ids = moves.map((m) => m.id);
    const { rows: cur } = await db.query('SELECT id, unit_id, row, col, archived FROM samples WHERE id = ANY($1::uuid[]) FOR UPDATE', [ids]);
    if (cur.length !== new Set(ids).size || cur.some((s) => s.archived)) throw new HttpError(400, 'Tube inconnu ou déjà jeté.');
    const before = new Map(cur.map((s) => [s.id, s]));
    // On libère d'abord toutes les places du lot, puis on les réattribue : l'index unique vérifie les conflits
    await db.query('UPDATE samples SET row = NULL, col = NULL WHERE id = ANY($1::uuid[])', [ids]);
    for (const m of moves) {
      const unit = byId.get(m.unit_id);
      if (!unit || !UNIT_KINDS[unit.kind].holdsSamples) throw new HttpError(400, 'Destination : une boîte ou un sac.');
      let row = null;
      let col = null;
      if (hasPositions(unit)) {
        row = Math.trunc(Number(m.row));
        col = Math.trunc(Number(m.col));
        if (!(row >= 0 && row < unit.rows && col >= 0 && col < unit.cols)) throw new HttpError(400, 'Position hors de la boîte.');
      }
      try {
        await db.query('UPDATE samples SET unit_id = $2, row = $3, col = $4, updated_by = $5, updated_at = now() WHERE id = $1', [m.id, unit.id, row, col, req.user.id]);
      } catch (err) {
        if (err.code === '23505') throw new HttpError(409, `La position ${positionLabel(unit, row, col)} de « ${unitLabel(unit)} » est déjà prise.`);
        throw err;
      }
      const old = before.get(m.id);
      const from = old.unit_id ? locationText(unitPath(byId, old.unit_id), old.row, old.col) : 'hors stockage';
      await event(db, m.id, 'moved', `De ${from} vers ${locationText(unitPath(byId, unit.id), row, col)}`, req.user.id);
    }
  });
  res.json({ ok: true });
});

/**
 * Gestes sur un ou plusieurs tubes : { ids, action, … }
 * out (sorti du froid, sa place l'attend), back (remis ; thawed: true compte une décongélation),
 * thaw (+1 décongélation), discard (épuisé ou jeté ; reason), restore (remis en service), color (bouchon).
 */
router.post('/samples/action', async (req, res) => {
  const b = req.body ?? {};
  const ids = Array.isArray(b.ids) ? b.ids : [];
  if (!ids.length || ids.length > 500) throw new HttpError(400, 'Aucun tube choisi.');
  const reason = String(b.reason ?? '').trim().slice(0, 300);
  await tx(async (db) => {
    const { rows: cur } = await db.query('SELECT id, status, archived, thaw_count, unit_id, row, col FROM samples WHERE id = ANY($1::uuid[]) FOR UPDATE', [ids]);
    if (cur.length !== new Set(ids).size) throw notFound('Échantillon');
    for (const s of cur) {
      const set = async (sql, params, kind, detail) => {
        await db.query(`UPDATE samples SET ${sql}, updated_by = $2, updated_at = now() WHERE id = $1`, [s.id, req.user.id, ...params]);
        await event(db, s.id, kind, detail, req.user.id);
      };
      if (b.action === 'restore') {
        if (!s.archived) continue;
        try {
          await set("archived = false, status = 'stored', out_since = NULL", [], 'restored', 'Remis en service');
        } catch (err) {
          if (err.code === '23505') throw new HttpError(409, 'Sa place est prise : déplacez d’abord ce qui l’occupe.');
          throw err;
        }
        continue;
      }
      if (s.archived) throw new HttpError(400, 'Ce tube a été jeté : remettez-le en service d’abord.');
      if (b.action === 'out') {
        if (s.status !== 'out') await set("status = 'out', out_since = now()", [], 'out', reason || 'Sorti du froid');
      } else if (b.action === 'back') {
        if (s.status === 'out') {
          if (b.thawed) await set("status = 'stored', out_since = NULL, thaw_count = thaw_count + 1", [], 'back', `Remis en place, décongélation n° ${s.thaw_count + 1}`);
          else await set("status = 'stored', out_since = NULL", [], 'back', 'Remis en place (resté congelé)');
        }
      } else if (b.action === 'thaw') {
        await set('thaw_count = thaw_count + 1', [], 'thawed', `Décongélation n° ${s.thaw_count + 1}`);
      } else if (b.action === 'discard') {
        await set("archived = true, status = 'used', out_since = NULL", [], 'discarded', reason ? `Jeté : ${reason}` : 'Épuisé ou jeté');
      } else if (b.action === 'color') {
        if (!CAP_COLORS.includes(b.color) && b.color !== '') throw new HttpError(400, 'Couleur inconnue.');
        await set('cap_color = $3', [b.color], 'edited', 'Modifié : couleur du bouchon');
      } else {
        throw new HttpError(400, 'Action inconnue.');
      }
    }
  });
  res.json({ ok: true });
});

// --- À surveiller et activité récente ---------------------------------------------------------------

router.get('/watch', async (req, res) => {
  const { byId } = await loadUnits({ query });
  const visible = await visibleProjectIds(req.user.id);
  const pick = async (where, order, params = []) => {
    const { rows } = await query(`${SAMPLE_SELECT} WHERE NOT s.archived AND ${where} ORDER BY ${order} LIMIT 30`, params);
    return rows.map(withLocation(byId, visible));
  };
  const [out, expired, expiring, thawed] = await Promise.all([
    pick(`s.status = 'out' AND s.type <> 'grid' AND s.out_since < now() - make_interval(hours => ${OUT_TOO_LONG_HOURS})`, 's.out_since'),
    pick('s.expires_on < current_date', 's.expires_on'),
    pick(`s.expires_on >= current_date AND s.expires_on <= current_date + ${EXPIRING_DAYS}`, 's.expires_on'),
    pick(`s.thaw_count >= ${THAW_LIMIT}`, 's.thaw_count DESC'),
  ]);
  const { rows: counts } = await query("SELECT unit_id, count(*)::int AS n FROM samples WHERE NOT archived AND row IS NOT NULL GROUP BY unit_id");
  const full = counts
    .map((c) => ({ unit: byId.get(c.unit_id), n: c.n }))
    .filter((c) => hasPositions(c.unit) && c.n >= FULL_RATIO * c.unit.rows * c.unit.cols)
    .map((c) => ({ id: c.unit.id, name: unitLabel(c.unit), used: c.n, capacity: c.unit.rows * c.unit.cols, location: locationText(unitPath(byId, c.unit.id)) }));
  res.json({ out, expired, expiring, thawed, full, limits: { outHours: OUT_TOO_LONG_HOURS, thaw: THAW_LIMIT, expiringDays: EXPIRING_DAYS } });
});

router.get('/events', async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const { rows } = await query(
    `SELECT ev.kind, ev.detail, ev.created_at, u.display_name AS author,
            s.id AS sample_id, s.code, s.name, s.type, s.cap_color, s.details, s.unit_id, s.archived
     FROM sample_events ev JOIN samples s ON s.id = ev.sample_id LEFT JOIN users u ON u.id = ev.created_by
     ORDER BY ev.created_at DESC LIMIT ${limit}`,
  );
  res.json(rows);
});

export default router;
