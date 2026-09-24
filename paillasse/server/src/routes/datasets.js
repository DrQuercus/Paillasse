import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { KINDS, cleanDataset } from '../lib/stat.js';

// Jeux de données de l'outil Statistiques. Modifiables librement (brouillons de travail) ;
// ce qui est scellé, c'est la copie insérée dans une entrée.
const router = Router();
const COLUMNS = `d.id, d.title, d.kind, d.project_id, p.name AS project_name, d.revision, d.archived,
  d.created_at, d.updated_at, cu.display_name AS created_by_name, uu.display_name AS updated_by_name`;
const FROM = `FROM datasets d LEFT JOIN projects p ON p.id = d.project_id
  LEFT JOIN users cu ON cu.id = d.created_by LEFT JOIN users uu ON uu.id = d.updated_by`;
const UUID = /^[0-9a-f-]{36}$/;
const projectOf = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (!UUID.test(String(v))) throw new HttpError(400, 'Projet invalide.');
  return String(v);
};

async function load(id, withData = true) {
  const { rows } = await query(`SELECT ${COLUMNS}${withData ? ', d.data' : ''} ${FROM} WHERE d.id = $1`, [id]);
  if (!rows[0]) throw notFound('Jeu de données');
  return rows[0];
}

// Liste (sans les données), du plus récent au plus ancien ; recherche dans le titre
router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const { rows } = await query(
    `SELECT ${COLUMNS},
       jsonb_array_length(d.data->'rows') AS row_count, jsonb_array_length(d.data->'columns') AS column_count
     ${FROM}
     WHERE ($1 OR NOT d.archived) AND ($2 = '' OR d.title ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR d.kind = $3)
     ORDER BY d.updated_at DESC LIMIT 300`,
    [req.query.archived === 'true', q, KINDS.includes(req.query.kind) ? req.query.kind : null],
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  res.json(await load(req.params.id));
});

router.post('/', async (req, res) => {
  const data = cleanDataset(req.body?.data);
  const { rows } = await query(
    `INSERT INTO datasets (title, kind, data, project_id, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
    [data.title, data.kind, JSON.stringify(data), projectOf(req.body?.project_id), req.user.id],
  );
  res.status(201).json(await load(rows[0].id));
});

// Enregistrement : révision attendue, sinon conflit (modifié dans un autre onglet)
router.put('/:id', async (req, res) => {
  const data = cleanDataset(req.body?.data);
  const revision = Number(req.body?.revision);
  const params = [req.params.id, data.title, data.kind, JSON.stringify(data), req.user.id, Number.isInteger(revision) ? revision : null];
  let sql = `UPDATE datasets SET title = $2, kind = $3, data = $4, updated_by = $5, updated_at = now(), revision = revision + 1`;
  if (req.body?.project_id !== undefined) {
    params.push(projectOf(req.body.project_id));
    sql += `, project_id = $${params.length}`;
  }
  sql += ' WHERE id = $1 AND NOT archived AND ($6::int IS NULL OR revision = $6) RETURNING revision, updated_at';
  const { rows } = await query(sql, params);
  if (!rows[0]) {
    const { rows: cur } = await query('SELECT revision, archived FROM datasets WHERE id = $1', [req.params.id]);
    if (!cur[0]) throw notFound('Jeu de données');
    if (cur[0].archived) throw new HttpError(409, 'Ce jeu de données est archivé.');
    return res.status(409).json({ code: 'conflict', revision: cur[0].revision, error: 'Ce jeu de données a été modifié ailleurs (autre onglet ?). Rechargez-le avant de continuer.' });
  }
  return res.json(rows[0]);
});

router.post('/:id/archive', async (req, res) => {
  const { rowCount } = await query(
    'UPDATE datasets SET archived = $2, updated_by = $3, updated_at = now() WHERE id = $1',
    [req.params.id, req.body?.archived !== false, req.user.id],
  );
  if (!rowCount) throw notFound('Jeu de données');
  res.json(await load(req.params.id, false));
});

export default router;
