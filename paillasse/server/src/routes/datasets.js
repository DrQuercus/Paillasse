import { Router } from 'express';
import { query } from '../db.js';
import { assertDataset, assertProject, visibleProjects } from '../lib/access.js';
import { HttpError, notFound } from '../lib/errors.js';
import { KINDS, cleanDataset } from '../lib/stat.js';
import { emit } from '../integrations/events.js';

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

export async function loadDataset(id, withData = true) {
  const { rows } = await query(`SELECT ${COLUMNS}${withData ? ', d.data' : ''} ${FROM} WHERE d.id = $1`, [id]);
  if (!rows[0]) throw notFound('Jeu de données');
  return rows[0];
}

// Un jeu de données rattaché à un projet suit ses droits ; sans projet, il est à tout le labo
router.param('id', (req, _res, next, id) => {
  const write = req.method !== 'GET';
  assertDataset(req.user, id, { write }).then((role) => { req.datasetRole = role; next(); }, next);
});

/** Liste (sans les données), du plus récent au plus ancien ; recherche dans le titre. */
export async function listDatasets(user, { q = '', kind = null, archived = false } = {}) {
  const { rows } = await query(
    `SELECT ${COLUMNS},
       jsonb_array_length(d.data->'rows') AS row_count, jsonb_array_length(d.data->'columns') AS column_count
     ${FROM}
     WHERE ($1 OR NOT d.archived) AND ($2 = '' OR d.title ILIKE '%' || $2 || '%')
       AND ($3::text IS NULL OR d.kind = $3)
       AND (d.project_id IS NULL OR d.project_id IN ${visibleProjects('$4')})
     ORDER BY d.updated_at DESC LIMIT 300`,
    [archived === true || archived === 'true', String(q ?? '').trim(), KINDS.includes(kind) ? kind : null, user.id],
  );
  return rows;
}

router.get('/', async (req, res) => res.json(await listDatasets(req.user, req.query)));

router.get('/:id', async (req, res) => {
  res.json({ ...await loadDataset(req.params.id), role: req.datasetRole });
});

/** Nouveau jeu de données (data : forme de client/src/lib/stats/model.js). Renvoie son identifiant. */
export async function createDataset(user, rawData, rawProjectId = null) {
  const data = cleanDataset(rawData);
  const projectId = projectOf(rawProjectId);
  await assertProject(user, projectId, { write: true });
  const { rows } = await query(
    `INSERT INTO datasets (title, kind, data, project_id, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING id`,
    [data.title, data.kind, JSON.stringify(data), projectId, user.id],
  );
  await emit(null, { type: 'dataset.created', id: rows[0].id, projectId, actor: user, data: { title: data.title, kind: data.kind } });
  return rows[0].id;
}

router.post('/', async (req, res) => {
  const id = await createDataset(req.user, req.body?.data, req.body?.project_id);
  res.status(201).json(await loadDataset(id));
});

// Enregistrement : révision attendue, sinon conflit (modifié dans un autre onglet)
router.put('/:id', async (req, res) => {
  const data = cleanDataset(req.body?.data);
  const revision = Number(req.body?.revision);
  const params = [req.params.id, data.title, data.kind, JSON.stringify(data), req.user.id, Number.isInteger(revision) ? revision : null];
  let sql = `UPDATE datasets SET title = $2, kind = $3, data = $4, updated_by = $5, updated_at = now(), revision = revision + 1`;
  if (req.body?.project_id !== undefined) {
    params.push(projectOf(req.body.project_id));
    await assertProject(req.user, params.at(-1), { write: true });
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
  const { rows: [d] } = await query('SELECT project_id FROM datasets WHERE id = $1', [req.params.id]);
  await emit(null, { type: 'dataset.updated', id: req.params.id, projectId: d.project_id, actor: req.user, data: { title: data.title, kind: data.kind, revision: rows[0].revision } });
  return res.json(rows[0]);
});

router.post('/:id/archive', async (req, res) => {
  const { rowCount } = await query(
    'UPDATE datasets SET archived = $2, updated_by = $3, updated_at = now() WHERE id = $1',
    [req.params.id, req.body?.archived !== false, req.user.id],
  );
  if (!rowCount) throw notFound('Jeu de données');
  const d = await loadDataset(req.params.id, false);
  await emit(null, { type: d.archived ? 'dataset.archived' : 'dataset.updated', id: d.id, projectId: d.project_id, actor: req.user, data: { title: d.title, kind: d.kind } });
  res.json(d);
});

export default router;
