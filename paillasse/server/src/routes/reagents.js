import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';

// Produits chimiques et réactifs utilisés par les calculs (masse molaire, concentrations usuelles).
// Un calcul inséré dans une entrée garde sa propre copie des valeurs : modifier un produit n'y change rien.
const router = Router();
const COLUMNS = `r.id, r.name, r.formula, r.mw, r.category, r.stock_conc, r.working_conc, r.notes, r.archived,
  r.created_at, r.updated_at, cu.display_name AS created_by_name, uu.display_name AS updated_by_name`;

const text = (value, max, label) => {
  const s = String(value ?? '').trim();
  if (s.length > max) throw new HttpError(400, `${label} : ${max} caractères au plus.`);
  return s;
};

function readReagent(b, partial = false) {
  const out = {};
  if (!partial || b.name !== undefined) {
    out.name = text(b.name, 200, 'Nom');
    if (!out.name) throw new HttpError(400, 'Le produit doit avoir un nom.');
  }
  if (!partial || b.mw !== undefined) {
    const raw = String(b.mw ?? '').trim().replace(',', '.');
    const mw = raw === '' ? null : Number(raw);
    if (mw !== null && !(Number.isFinite(mw) && mw > 0 && mw < 1e8)) throw new HttpError(400, 'Masse molaire invalide (nombre positif en g/mol).');
    out.mw = mw;
  }
  for (const [key, max, label] of [['formula', 200, 'Formule'], ['category', 80, 'Catégorie'],
    ['stock_conc', 200, 'Solution mère'], ['working_conc', 200, "Concentration d'usage"], ['notes', 2000, 'Notes']]) {
    if (!partial || b[key] !== undefined) out[key] = text(b[key], max, label);
  }
  return out;
}

const duplicate = (err) => {
  if (err.code === '23505') throw new HttpError(409, 'Un produit porte déjà ce nom.');
  throw err;
};

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM reagents r
     LEFT JOIN users cu ON cu.id = r.created_by LEFT JOIN users uu ON uu.id = r.updated_by
     WHERE $1 OR NOT r.archived
     ORDER BY lower(r.name)`,
    [req.query.archived === 'true'],
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const r = readReagent(req.body ?? {});
  const { rows } = await query(
    `INSERT INTO reagents (name, formula, mw, category, stock_conc, working_conc, notes, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) RETURNING id`,
    [r.name, r.formula, r.mw, r.category, r.stock_conc, r.working_conc, r.notes, req.user.id],
  ).catch(duplicate);
  res.status(201).json(await load(rows[0].id));
});

router.put('/:id', async (req, res) => {
  const r = readReagent(req.body ?? {}, true);
  const keys = Object.keys(r);
  if (!keys.length) throw new HttpError(400, 'Rien à modifier.');
  const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
  const { rowCount } = await query(
    `UPDATE reagents SET ${sets}, updated_by = $2, updated_at = now() WHERE id = $1 AND NOT archived`,
    [req.params.id, req.user.id, ...keys.map((k) => r[k])],
  ).catch(duplicate);
  if (!rowCount) throw notFound('Produit');
  res.json(await load(req.params.id));
});

// Rien ne s'efface : un produit retiré est archivé (et peut être rétabli)
router.post('/:id/archive', async (req, res) => {
  const archived = req.body?.archived !== false;
  const { rowCount } = await query(
    'UPDATE reagents SET archived = $2, updated_by = $3, updated_at = now() WHERE id = $1',
    [req.params.id, archived, req.user.id],
  ).catch(duplicate);
  if (!rowCount) throw notFound('Produit');
  res.json(await load(req.params.id));
});

async function load(id) {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM reagents r
     LEFT JOIN users cu ON cu.id = r.created_by LEFT JOIN users uu ON uu.id = r.updated_by
     WHERE r.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('Produit');
  return rows[0];
}

export default router;
