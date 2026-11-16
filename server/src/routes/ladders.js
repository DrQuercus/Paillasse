import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { emit } from '../integrations/events.js';

// Marqueurs de taille des gels. Une figure insérée dans le cahier garde sa propre copie
// du marqueur utilisé : modifier ou archiver un marqueur ne change aucune entrée.
const router = Router();
const COLUMNS = `l.id, l.name, l.kind, l.bands, l.load, l.supplier, l.reference, l.notes, l.archived,
  l.created_at, l.updated_at, cu.display_name AS created_by_name, uu.display_name AS updated_by_name`;
const FROM = 'FROM ladders l LEFT JOIN users cu ON cu.id = l.created_by LEFT JOIN users uu ON uu.id = l.updated_by';

const num = (v) => (v === '' || v === null || v === undefined ? null : Number(String(v).replace(',', '.')));
const text = (v, max, label) => {
  const s = String(v ?? '').trim();
  if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus.`);
  return s;
};

function readLadder(b, partial = false) {
  const out = {};
  if (!partial || b.name !== undefined) {
    out.name = text(b.name, 200, 'Nom');
    if (!out.name) throw new HttpError(400, 'Le marqueur doit avoir un nom.');
  }
  if (!partial || b.kind !== undefined) {
    if (!['protein', 'dna'].includes(b.kind)) throw new HttpError(400, 'Type de marqueur : protéines ou ADN.');
    out.kind = b.kind;
  }
  if (!partial || b.bands !== undefined) {
    if (!Array.isArray(b.bands) || b.bands.length < 2 || b.bands.length > 60) throw new HttpError(400, 'Indiquez entre 2 et 60 bandes.');
    const bands = b.bands.map((x) => {
      const size = num(x?.size);
      const mass = num(x?.mass);
      if (!(size > 0 && size < 1e7)) throw new HttpError(400, 'Taille de bande invalide.');
      if (mass !== null && !(mass >= 0 && mass < 1e7)) throw new HttpError(400, 'Masse de bande invalide.');
      return mass !== null ? { size, mass } : { size };
    }).sort((a, c) => c.size - a.size);
    if (new Set(bands.map((x) => x.size)).size !== bands.length) throw new HttpError(400, 'Deux bandes ont la même taille.');
    out.bands = JSON.stringify(bands);
  }
  if (!partial || b.load !== undefined) {
    const load = num(b.load);
    if (load !== null && !(load > 0)) throw new HttpError(400, 'Quantité déposée invalide.');
    out.load = load;
  }
  for (const [key, max, label] of [['supplier', 200, 'Fournisseur'], ['reference', 100, 'Référence'], ['notes', 2000, 'Notes']]) {
    if (!partial || b[key] !== undefined) out[key] = text(b[key], max, label);
  }
  return out;
}

const duplicate = (err) => {
  if (err.code === '23505') throw new HttpError(409, 'Un marqueur porte déjà ce nom.');
  throw err;
};

async function load(id) {
  const { rows } = await query(`SELECT ${COLUMNS} ${FROM} WHERE l.id = $1`, [id]);
  if (!rows[0]) throw notFound('Marqueur');
  return rows[0];
}

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT ${COLUMNS} ${FROM} WHERE ($1 OR NOT l.archived) AND ($2::text IS NULL OR l.kind = $2) ORDER BY l.kind DESC, lower(l.name)`,
    [req.query.archived === 'true', ['protein', 'dna'].includes(req.query.kind) ? req.query.kind : null],
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const l = readLadder(req.body ?? {});
  const { rows } = await query(
    `INSERT INTO ladders (name, kind, bands, load, supplier, reference, notes, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
    [l.name, l.kind, l.bands, l.load, l.supplier, l.reference, l.notes, req.user.id],
  ).catch(duplicate);
  await emit(null, { type: 'ladder.created', id: rows[0].id, actor: req.user, data: { title: l.name, kind: l.kind } });
  res.status(201).json(await load(rows[0].id));
});

router.put('/:id', async (req, res) => {
  const l = readLadder(req.body ?? {}, true);
  const keys = Object.keys(l);
  if (!keys.length) throw new HttpError(400, 'Rien à modifier.');
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
  const { rowCount } = await query(
    `UPDATE ladders SET ${sets}, updated_by = $2, updated_at = now() WHERE id = $1 AND NOT archived`,
    [req.params.id, req.user.id, ...keys.map((k) => l[k])],
  ).catch(duplicate);
  if (!rowCount) throw notFound('Marqueur');
  const updated = await load(req.params.id);
  await emit(null, { type: 'ladder.updated', id: updated.id, actor: req.user, data: { title: updated.name, kind: updated.kind } });
  res.json(updated);
});

router.post('/:id/archive', async (req, res) => {
  const { rowCount } = await query(
    'UPDATE ladders SET archived = $2, updated_by = $3, updated_at = now() WHERE id = $1',
    [req.params.id, req.body?.archived !== false, req.user.id],
  ).catch(duplicate);
  if (!rowCount) throw notFound('Marqueur');
  const updated = await load(req.params.id);
  await emit(null, { type: 'ladder.updated', id: updated.id, actor: req.user, data: { title: updated.name, kind: updated.kind, archived: updated.archived } });
  res.json(updated);
});

export default router;
