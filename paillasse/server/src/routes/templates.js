import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { EMPTY_DOC, isDoc } from '../lib/doc.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, name, description, updated_at FROM templates
     WHERE NOT archived ORDER BY lower(name)`,
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Modèle');
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const b = req.body ?? {};
  const name = String(b.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Le modèle doit avoir un nom.');
  let content = EMPTY_DOC;
  if (b.from_entry_id) {
    const { rows } = await query('SELECT content FROM entries WHERE id = $1', [b.from_entry_id]);
    if (!rows[0]) throw notFound('Entrée');
    content = rows[0].content;
  } else if (b.content !== undefined) {
    if (!isDoc(b.content)) throw new HttpError(400, 'Contenu invalide.');
    content = b.content;
  }
  const { rows } = await query(
    `INSERT INTO templates (name, description, content, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, String(b.description ?? ''), JSON.stringify(content), req.user.id],
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const b = req.body ?? {};
  if (b.content !== undefined && !isDoc(b.content)) throw new HttpError(400, 'Contenu invalide.');
  const name = b.name === undefined ? null : String(b.name).trim();
  if (name === '') throw new HttpError(400, 'Le modèle doit avoir un nom.');
  const { rows } = await query(
    `UPDATE templates SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       content = COALESCE($4, content),
       updated_at = now()
     WHERE id = $1 AND NOT archived RETURNING *`,
    [req.params.id, name, b.description ?? null, b.content ? JSON.stringify(b.content) : null],
  );
  if (!rows[0]) throw notFound('Modèle');
  res.json(rows[0]);
});

// Les modèles ne sont pas des données du cahier : on les archive simplement
router.delete('/:id', async (req, res) => {
  const { rowCount } = await query('UPDATE templates SET archived = true WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Modèle');
  res.json({ ok: true });
});

export default router;
