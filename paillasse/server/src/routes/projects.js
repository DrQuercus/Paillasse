import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';

const router = Router();
const COLOR = /^#[0-9a-fA-F]{6}$/;
// Colonnes publiques : jamais le mot de passe ni le jeton du tableau partagé
const PUBLIC = `id, name, description, color, archived, created_at, updated_at,
  (board_share_token IS NOT NULL) AS board_shared`;

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.name, p.description, p.color, p.archived, p.created_at,
            (p.board_share_token IS NOT NULL) AS board_shared,
            count(e.id)::int AS entry_count, max(e.entry_date) AS last_entry_date
     FROM projects p LEFT JOIN entries e ON e.project_id = p.id AND NOT e.archived
     WHERE $1 OR NOT p.archived
     GROUP BY p.id ORDER BY p.archived, lower(p.name)`,
    [req.query.archived === 'true'],
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`SELECT ${PUBLIC} FROM projects WHERE id = $1`, [req.params.id]);
  if (!rows[0]) throw notFound('Projet');
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new HttpError(400, 'Le projet doit avoir un nom.');
  const color = COLOR.test(req.body?.color) ? req.body.color : '#2449C7';
  const { rows } = await query(
    `INSERT INTO projects (name, description, color, created_by) VALUES ($1, $2, $3, $4) RETURNING ${PUBLIC}`,
    [name, String(req.body?.description ?? ''), color, req.user.id],
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const b = req.body ?? {};
  const name = b.name === undefined ? null : String(b.name).trim();
  if (name === '') throw new HttpError(400, 'Le projet doit avoir un nom.');
  if (b.color !== undefined && !COLOR.test(b.color)) throw new HttpError(400, 'Couleur invalide.');
  const { rows } = await query(
    `UPDATE projects SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       color = COALESCE($4, color),
       archived = COALESCE($5, archived),
       updated_at = now()
     WHERE id = $1 RETURNING ${PUBLIC}`,
    [req.params.id, name, b.description ?? null, b.color ?? null, typeof b.archived === 'boolean' ? b.archived : null],
  );
  if (!rows[0]) throw notFound('Projet');
  res.json(rows[0]);
});

export default router;
