import { Router } from 'express';
import { query, tx } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { EMPTY_DOC, docToPlainText, isDoc } from '../lib/doc.js';
import { createVersion, verifyEntry } from '../lib/versions.js';
import { renderEntryPage } from '../lib/render.js';

const router = Router();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale du serveur
const frDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR');

const ENTRY_COLUMNS = `e.id, e.project_id, e.parent_entry_id, e.title, e.entry_date, e.status, e.content,
  e.revision, e.version_count, e.last_version_hash, e.locked_at, e.archived,
  e.created_at, e.updated_at, p.name AS project_name, p.color AS project_color,
  cu.display_name AS created_by_name, lu.display_name AS locked_by_name`;

async function loadEntry(id, db = { query }) {
  const { rows } = await db.query(
    `SELECT ${ENTRY_COLUMNS}
     FROM entries e
     JOIN projects p ON p.id = e.project_id
     JOIN users cu ON cu.id = e.created_by
     LEFT JOIN users lu ON lu.id = e.locked_by
     WHERE e.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('Entrée');
  const entry = rows[0];
  const [{ rows: addenda }, { rows: parent }] = await Promise.all([
    db.query(
      `SELECT id, title, entry_date, status FROM entries
       WHERE parent_entry_id = $1 AND NOT archived ORDER BY created_at`,
      [id],
    ),
    entry.parent_entry_id
      ? db.query('SELECT id, title, entry_date, status FROM entries WHERE id = $1', [entry.parent_entry_id])
      : { rows: [] },
  ]);
  return { ...entry, addenda, parent: parent[0] ?? null };
}

// Liste chronologique (journal) ou par projet
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const { rows } = await query(
    `SELECT e.id, e.title, e.entry_date, e.status, e.project_id, e.parent_entry_id,
            e.version_count, e.created_at, e.updated_at,
            p.name AS project_name, p.color AS project_color,
            left(e.plain_text, 220) AS excerpt
     FROM entries e JOIN projects p ON p.id = e.project_id
     WHERE NOT e.archived AND ($1::uuid IS NULL OR e.project_id = $1)
     ORDER BY e.entry_date DESC, e.created_at DESC
     LIMIT $2 OFFSET $3`,
    [req.query.project_id || null, limit, offset],
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const b = req.body ?? {};
  if (!b.project_id) throw new HttpError(400, 'Choisissez un projet.');
  const title = String(b.title ?? '').trim() || 'Sans titre';
  const entryDate = DATE.test(b.entry_date) ? b.entry_date : today();
  let content = EMPTY_DOC;
  if (b.template_id) {
    const { rows } = await query('SELECT content FROM templates WHERE id = $1', [b.template_id]);
    if (!rows[0]) throw notFound('Modèle');
    content = rows[0].content;
  }
  const { rows } = await query(
    `INSERT INTO entries (project_id, title, entry_date, content, plain_text, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [b.project_id, title, entryDate, JSON.stringify(content), docToPlainText(content), req.user.id],
  );
  res.status(201).json(await loadEntry(rows[0].id));
});

router.get('/:id', async (req, res) => {
  res.json(await loadEntry(req.params.id));
});

// Sauvegarde automatique de la copie de travail (brouillon uniquement)
router.put('/:id', async (req, res) => {
  const b = req.body ?? {};
  if (!Number.isInteger(b.revision)) throw new HttpError(400, 'Révision manquante.');
  if (b.content !== undefined && !isDoc(b.content)) throw new HttpError(400, 'Contenu invalide.');
  if (b.entry_date !== undefined && !DATE.test(b.entry_date)) throw new HttpError(400, 'Date invalide.');
  const title = b.title === undefined ? null : String(b.title).trim() || 'Sans titre';

  const { rows } = await query(
    `UPDATE entries SET
       title = COALESCE($2, title),
       entry_date = COALESCE($3::date, entry_date),
       content = COALESCE($4::jsonb, content),
       plain_text = COALESCE($5, plain_text),
       project_id = COALESCE($6::uuid, project_id),
       revision = revision + 1,
       updated_at = now()
     WHERE id = $1 AND status = 'draft' AND revision = $7
     RETURNING revision, updated_at`,
    [
      req.params.id, title, b.entry_date ?? null,
      b.content ? JSON.stringify(b.content) : null,
      b.content ? docToPlainText(b.content) : null,
      b.project_id ?? null, b.revision,
    ],
  );
  if (rows[0]) return res.json(rows[0]);

  const { rows: current } = await query('SELECT status, revision FROM entries WHERE id = $1', [req.params.id]);
  if (!current[0]) throw notFound('Entrée');
  if (current[0].status === 'locked') {
    return res.status(409).json({ code: 'locked', error: 'Cette entrée est verrouillée.' });
  }
  res.status(409).json({
    code: 'conflict',
    revision: current[0].revision,
    error: "Cette entrée a été modifiée ailleurs (autre onglet ?). Rechargez-la avant de continuer.",
  });
});

router.get('/:id/versions', async (req, res) => {
  const { rows } = await query(
    `SELECT v.id, v.version_number, v.kind, v.note, v.title, v.created_at, v.hash, v.prev_hash,
            u.display_name AS author
     FROM entry_versions v JOIN users u ON u.id = v.created_by
     WHERE v.entry_id = $1 ORDER BY v.version_number DESC`,
    [req.params.id],
  );
  res.json(rows);
});

router.get('/:id/versions/:number', async (req, res) => {
  const { rows } = await query(
    `SELECT v.*, u.display_name AS author
     FROM entry_versions v JOIN users u ON u.id = v.created_by
     WHERE v.entry_id = $1 AND v.version_number = $2`,
    [req.params.id, Number(req.params.number)],
  );
  if (!rows[0]) throw notFound('Version');
  res.json(rows[0]);
});

router.post('/:id/versions', async (req, res) => {
  const result = await tx((db) => createVersion(db, req.params.id, req.user.id, { note: req.body?.note ?? '' }));
  res.status(result.unchanged ? 200 : 201).json(result);
});

router.post('/:id/lock', async (req, res) => {
  await tx(async (db) => {
    await createVersion(db, req.params.id, req.user.id, { kind: 'lock', note: req.body?.note ?? '' });
    await db.query(
      `UPDATE entries SET status = 'locked', locked_at = now(), locked_by = $2, updated_at = now()
       WHERE id = $1`,
      [req.params.id, req.user.id],
    );
  });
  res.json(await loadEntry(req.params.id));
});

router.post('/:id/addendum', async (req, res) => {
  const parent = await loadEntry(req.params.id);
  const content = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'italic' }], text: `Complément à l'entrée « ${parent.title} » du ${frDate(parent.entry_date)}.` }],
      },
      { type: 'paragraph' },
    ],
  };
  const { rows } = await query(
    `INSERT INTO entries (project_id, parent_entry_id, title, entry_date, content, plain_text, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [parent.project_id, parent.id, `Addendum : ${parent.title}`, today(),
      JSON.stringify(content), docToPlainText(content), req.user.id],
  );
  res.status(201).json(await loadEntry(rows[0].id));
});

// Archive un brouillon créé par erreur (il reste dans la base et dans les exports)
router.post('/:id/archive', async (req, res) => {
  const { rowCount } = await query(
    `UPDATE entries SET archived = true, updated_at = now() WHERE id = $1 AND status = 'draft'`,
    [req.params.id],
  );
  if (!rowCount) throw new HttpError(409, 'Seuls les brouillons peuvent être archivés.');
  res.json({ ok: true });
});

router.get('/:id/verify', async (req, res) => {
  res.json(await verifyEntry({ query }, req.params.id));
});

// Page imprimable (Fichier > Imprimer > Enregistrer en PDF)
router.get('/:id/print', async (req, res) => {
  const entry = await loadEntry(req.params.id);
  let version = null;
  const n = req.query.version === 'last' ? entry.version_count : Number(req.query.version);
  if (n > 0) {
    const { rows } = await query(
      `SELECT v.*, u.display_name AS author FROM entry_versions v JOIN users u ON u.id = v.created_by
       WHERE v.entry_id = $1 AND v.version_number = $2`,
      [entry.id, n],
    );
    if (!rows[0]) throw notFound('Version');
    version = rows[0];
  }
  res.type('html').send(renderEntryPage({
    entry,
    project: { name: entry.project_name },
    version,
    author: version?.author,
    printButton: true,
  }));
});

export default router;
