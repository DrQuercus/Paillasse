import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { EMPTY_DOC, isDoc } from '../lib/doc.js';
import {
  isModified, libraryTemplate, templateHash, templateOutline, templateTools,
} from '../lib/templates.js';

const router = Router();

const cleanCategory = (value) => String(value ?? '').trim().slice(0, 60);

/** Ce que la galerie affiche d'un modèle (sans le contenu complet). */
const card = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  category: row.category,
  slug: row.slug,
  builtin: Boolean(row.slug),
  modified: isModified(row),
  outline: templateOutline(row.content),
  tools: templateTools(row.content),
  archived: row.archived,
  updated_at: row.updated_at,
});

const full = (row) => ({ ...row, builtin: Boolean(row.slug), modified: isModified(row) });

router.get('/', async (req, res) => {
  const archived = req.query.archived === 'true';
  const { rows } = await query(
    `SELECT id, name, description, category, slug, seed_hash, content, archived, updated_at FROM templates
     WHERE archived = $1 ORDER BY lower(name)`,
    [archived],
  );
  res.json(rows.map(card));
});

router.get('/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM templates WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Modèle');
  res.json(full(rows[0]));
});

router.post('/', async (req, res) => {
  const b = req.body ?? {};
  let name = String(b.name ?? '').trim();
  let description = String(b.description ?? '');
  let category = cleanCategory(b.category);
  let content = EMPTY_DOC;
  if (b.from_entry_id) {
    const { rows } = await query('SELECT content FROM entries WHERE id = $1', [b.from_entry_id]);
    if (!rows[0]) throw notFound('Entrée');
    content = rows[0].content;
  } else if (b.from_template_id) {
    // Copie d'un modèle (de base ou du labo) : la copie appartient au labo
    const { rows } = await query('SELECT * FROM templates WHERE id = $1', [b.from_template_id]);
    if (!rows[0]) throw notFound('Modèle');
    content = rows[0].content;
    name ||= `${rows[0].name} (copie)`;
    description ||= rows[0].description;
    category ||= rows[0].category;
  } else if (b.content !== undefined) {
    if (!isDoc(b.content)) throw new HttpError(400, 'Contenu invalide.');
    content = b.content;
  }
  if (!name) throw new HttpError(400, 'Le modèle doit avoir un nom.');
  const { rows } = await query(
    `INSERT INTO templates (name, description, category, content, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
    [name, description, category, JSON.stringify(content), req.user.id],
  );
  res.status(201).json(full(rows[0]));
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
       category = COALESCE($5, category),
       updated_by = $6,
       updated_at = now()
     WHERE id = $1 AND NOT archived RETURNING *`,
    [req.params.id, name, b.description ?? null, b.content ? JSON.stringify(b.content) : null,
      b.category === undefined ? null : cleanCategory(b.category), req.user.id],
  );
  if (!rows[0]) throw notFound('Modèle');
  res.json(full(rows[0]));
});

// Modèle de base modifié : revenir à la version livrée avec Paillasse (qui suivra de nouveau les mises à jour)
router.post('/:id/reset', async (req, res) => {
  const { rows: [row] } = await query('SELECT slug FROM templates WHERE id = $1', [req.params.id]);
  if (!row) throw notFound('Modèle');
  const t = row.slug && libraryTemplate(row.slug);
  if (!t) throw new HttpError(400, 'Ce modèle n’est pas un modèle de base.');
  const { rows } = await query(
    `UPDATE templates SET name = $2, description = $3, category = $4, content = $5, seed_hash = $6,
       updated_by = $7, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [req.params.id, t.name, t.description, t.category, JSON.stringify(t.content), templateHash(t), req.user.id],
  );
  res.json(full(rows[0]));
});

router.post('/:id/restore', async (req, res) => {
  const { rowCount } = await query('UPDATE templates SET archived = false, updated_at = now() WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Modèle');
  res.json({ ok: true });
});

// Les modèles ne sont pas des données du cahier : on les archive simplement
router.delete('/:id', async (req, res) => {
  const { rowCount } = await query('UPDATE templates SET archived = true, updated_at = now() WHERE id = $1', [req.params.id]);
  if (!rowCount) throw notFound('Modèle');
  res.json({ ok: true });
});

export default router;
