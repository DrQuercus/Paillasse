import { Router } from 'express';
import { query, tx } from '../db.js';
import { assertEntry, assertProject, visibleProjects } from '../lib/access.js';
import { HttpError, notFound } from '../lib/errors.js';
import { EMPTY_DOC, docToPlainText, isDoc } from '../lib/doc.js';
import { createVersion, verifyEntry } from '../lib/versions.js';
import { renderEntryPage } from '../lib/render.js';
import { safeFileName } from '../lib/markdown.js';
import { entryFileBase, markdownOnServer, markdownWithFiles, originOf, sendZip, setDownload } from '../lib/markdownExport.js';
import { cleanCalcNode } from '../lib/calc.js';
import { cleanGelNode, gelAttachmentIds } from '../lib/gel.js';
import { cleanStatNode, statAttachmentIds } from '../lib/stat.js';
import { emit, projectAudience } from '../integrations/events.js';

const router = Router();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale du serveur
const frDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR');

const ENTRY_COLUMNS = `e.id, e.project_id, e.parent_entry_id, e.title, e.entry_date, e.status, e.content,
  e.revision, e.version_count, e.last_version_hash, e.locked_at, e.archived,
  e.created_at, e.updated_at, p.name AS project_name, p.color AS project_color,
  cu.display_name AS created_by_name, lu.display_name AS locked_by_name`;

/** viewer : le compte qui regarde ; les addenda et l'entrée parente d'un autre projet invisible sont tus. */
export async function loadEntry(id, viewer = null, db = { query }) {
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
  const seen = viewer && !viewer.is_admin ? `AND project_id IN ${visibleProjects('$2')}` : 'AND $2::uuid IS NULL';
  const [{ rows: addenda }, { rows: parent }] = await Promise.all([
    db.query(
      `SELECT id, title, entry_date, status FROM entries
       WHERE parent_entry_id = $1 AND NOT archived ${seen} ORDER BY created_at`,
      [id, viewer && !viewer.is_admin ? viewer.id : null],
    ),
    entry.parent_entry_id
      ? db.query(`SELECT id, title, entry_date, status FROM entries WHERE id = $1 ${seen}`, [entry.parent_entry_id, viewer && !viewer.is_admin ? viewer.id : null])
      : { rows: [] },
  ]);
  return { ...entry, addenda, parent: parent[0] ?? null };
}

// Liste chronologique (journal : projets visibles) ou d'un projet (droit de lecture vérifié)
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const projectId = req.query.project_id || null;
  if (projectId) await assertProject(req.user, projectId);
  const { rows } = await query(
    `SELECT e.id, e.title, e.entry_date, e.status, e.project_id, e.parent_entry_id,
            e.version_count, e.created_at, e.updated_at,
            p.name AS project_name, p.color AS project_color,
            left(e.plain_text, 220) AS excerpt
     FROM entries e JOIN projects p ON p.id = e.project_id
     WHERE NOT e.archived AND ($1::uuid IS NULL OR e.project_id = $1)
       AND ($1::uuid IS NOT NULL OR e.project_id IN ${visibleProjects('$4')})
     ORDER BY e.entry_date DESC, e.created_at DESC
     LIMIT $2 OFFSET $3`,
    [projectId, limit, offset, req.user.id],
  );
  res.json(rows);
});

/** Nœuds d'un document, sans le paragraphe vide qui le termine souvent. */
const blocksOf = (doc) => {
  const blocks = [...(isDoc(doc) ? doc.content ?? [] : [])];
  const last = blocks.at(-1);
  if (last?.type === 'paragraph' && !last.content?.length) blocks.pop();
  return blocks;
};

/**
 * Nouvelle entrée dans un projet : vide, depuis un modèle, et/ou avec des blocs ajoutés à la fin (blocks : nœuds
 * TipTap, par exemple tirés d'un texte Markdown). Renvoie { id, role }.
 */
export async function createEntry(user, { project_id: projectId, title, entry_date: entryDate, template_id: templateId, blocks = [] }) {
  if (!projectId) throw new HttpError(400, 'Choisissez un projet.');
  const role = await assertProject(user, projectId, { write: true });
  let content = EMPTY_DOC;
  if (templateId) {
    const { rows } = await query('SELECT content FROM templates WHERE id = $1', [templateId]);
    if (!rows[0]) throw notFound('Modèle');
    content = rows[0].content;
  }
  if (blocks.length) content = { type: 'doc', content: [...blocksOf(content), ...blocks, { type: 'paragraph' }] };
  const cleanTitle = String(title ?? '').trim().slice(0, 500) || 'Sans titre';
  const date = DATE.test(entryDate) ? entryDate : today();
  const id = await tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO entries (project_id, title, entry_date, content, plain_text, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [projectId, cleanTitle, date, JSON.stringify(content), docToPlainText(content), user.id],
    );
    await emit(db, { type: 'entry.created', id: rows[0].id, projectId, actor: user, data: { title: cleanTitle, entry_date: date } });
    return rows[0].id;
  });
  return { id, role };
}

router.post('/', async (req, res) => {
  const { id, role } = await createEntry(req.user, req.body ?? {});
  res.status(201).json({ ...(await loadEntry(id, req.user)), role });
});

router.get('/:id', async (req, res) => {
  const role = await assertEntry(req.user, req.params.id);
  res.json({ ...(await loadEntry(req.params.id, req.user)), role });
});

// Sauvegarde automatique de la copie de travail (brouillon uniquement)
router.put('/:id', async (req, res) => {
  const b = req.body ?? {};
  if (!Number.isInteger(b.revision)) throw new HttpError(400, 'Révision manquante.');
  if (b.content !== undefined && !isDoc(b.content)) throw new HttpError(400, 'Contenu invalide.');
  if (b.entry_date !== undefined && !DATE.test(b.entry_date)) throw new HttpError(400, 'Date invalide.');
  const title = b.title === undefined ? null : String(b.title).trim() || 'Sans titre';
  await assertEntry(req.user, req.params.id, { write: true });
  if (b.project_id) await assertProject(req.user, b.project_id, { write: true });
  // Entrée changée de projet : ceux qui voyaient l'ancien projet l'apprennent (événement entry.moved)
  const { rows: [before] } = await query('SELECT project_id, title FROM entries WHERE id = $1', [req.params.id]);
  const moved = b.project_id && before && b.project_id !== before.project_id;
  const oldAudience = moved ? await projectAudience(null, before.project_id) : null;

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
  if (rows[0]) {
    const newTitle = title ?? before?.title ?? '';
    if (moved) {
      await emit(null, { type: 'entry.moved', id: req.params.id, projectId: before.project_id, audience: oldAudience, actor: req.user, data: { title: newTitle } });
    }
    await emit(null, { type: 'entry.updated', id: req.params.id, projectId: b.project_id || before?.project_id, actor: req.user, data: { title: newTitle, revision: rows[0].revision } });
    return res.json(rows[0]);
  }

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

/**
 * Ajoute des blocs à la fin d'un brouillon (le paragraphe vide final est remplacé, pas laissé au-dessus).
 * check(db, nodes) : vérification supplémentaire dans la transaction. Renvoie { revision, updated_at }.
 */
export async function appendBlocks(user, entryId, nodes, { check = null, lockedMessage = 'Entrée verrouillée : ajoutez-le dans un addendum.' } = {}) {
  await assertEntry(user, entryId, { write: true });
  return tx(async (db) => {
    const { rows: [entry] } = await db.query('SELECT status, content, title, project_id FROM entries WHERE id = $1 FOR UPDATE', [entryId]);
    if (!entry) throw notFound('Entrée');
    if (entry.status === 'locked') throw new HttpError(409, lockedMessage);
    if (check) await check(db, nodes);
    const content = { type: 'doc', content: [...blocksOf(entry.content), ...nodes, { type: 'paragraph' }] };
    const { rows } = await db.query(
      `UPDATE entries SET content = $2, plain_text = $3, revision = revision + 1, updated_at = now()
       WHERE id = $1 RETURNING revision, updated_at`,
      [entryId, JSON.stringify(content), docToPlainText(content)],
    );
    await emit(db, { type: 'entry.updated', id: entryId, projectId: entry.project_id, actor: user, data: { title: entry.title, revision: rows[0].revision } });
    return rows[0];
  });
}

// Ajoute un encart à la fin d'un brouillon : calcul (page Calculs), figure de gel (page Gels)
// ou graphique et statistiques (page Statistiques).
// Un onglet ouvert sur l'entrée verra le conflit de révision et proposera de recharger.
router.post('/:id/blocks', async (req, res) => {
  const type = req.body?.node?.type;
  const node = type === 'gelFigure' ? cleanGelNode(req.body.node) : type === 'statFigure' ? cleanStatNode(req.body.node) : cleanCalcNode(req.body?.node);
  const result = await appendBlocks(req.user, req.params.id, [node], {
    async check(db) {
      if (node.type !== 'gelFigure' && node.type !== 'statFigure') return;
      // Les images (et l'original d'un gel) doivent être des pièces jointes de cette entrée (scellées avec elle)
      const ids = node.type === 'gelFigure' ? gelAttachmentIds(node.attrs) : statAttachmentIds(node.attrs);
      const { rows } = await db.query('SELECT id FROM attachments WHERE entry_id = $1 AND id = ANY($2::uuid[])', [req.params.id, ids]);
      if (rows.length !== ids.length) throw new HttpError(400, 'Les images de la figure doivent être jointes à cette entrée.');
    },
  });
  res.status(201).json(result);
});

// Révision courante, pour qu'une page ouverte voie qu'on a modifié l'entrée ailleurs (outil connecté, autre onglet)
router.get('/:id/revision', async (req, res) => {
  await assertEntry(req.user, req.params.id);
  const { rows: [e] } = await query('SELECT revision, status, version_count, updated_at FROM entries WHERE id = $1', [req.params.id]);
  if (!e) throw notFound('Entrée');
  res.json(e);
});

router.get('/:id/versions', async (req, res) => {
  await assertEntry(req.user, req.params.id);
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
  await assertEntry(req.user, req.params.id);
  const { rows } = await query(
    `SELECT v.*, u.display_name AS author
     FROM entry_versions v JOIN users u ON u.id = v.created_by
     WHERE v.entry_id = $1 AND v.version_number = $2`,
    [req.params.id, Number(req.params.number)],
  );
  if (!rows[0]) throw notFound('Version');
  res.json(rows[0]);
});

/** Fige une version de la copie de travail (sans rien faire si rien n'a changé et sans note). */
export async function freezeEntryVersion(user, entryId, note = '') {
  await assertEntry(user, entryId, { write: true });
  return tx(async (db) => {
    const result = await createVersion(db, entryId, user.id, { note });
    if (!result.unchanged) {
      const { rows: [e] } = await db.query('SELECT project_id, title FROM entries WHERE id = $1', [entryId]);
      await emit(db, {
        type: 'entry.version_created', id: entryId, projectId: e.project_id, actor: user,
        data: { title: e.title, version_number: result.version.version_number, hash: result.version.hash, note: result.version.note },
      });
    }
    return result;
  });
}

/** Verrouille (signe) une entrée : version de verrouillage, puis plus aucune modification possible. */
export async function lockEntry(user, entryId, note = '') {
  const role = await assertEntry(user, entryId, { write: true });
  await tx(async (db) => {
    const { version } = await createVersion(db, entryId, user.id, { kind: 'lock', note });
    const { rows: [e] } = await db.query(
      `UPDATE entries SET status = 'locked', locked_at = now(), locked_by = $2, updated_at = now()
       WHERE id = $1 RETURNING project_id, title`,
      [entryId, user.id],
    );
    await emit(db, {
      type: 'entry.locked', id: entryId, projectId: e.project_id, actor: user,
      data: { title: e.title, version_number: version.version_number, hash: version.hash },
    });
  });
  return role;
}

/** Addendum d'une entrée (verrouillée en général) : nouvelle entrée liée, avec éventuellement des blocs. */
export async function createAddendum(user, parentId, blocks = []) {
  const role = await assertEntry(user, parentId, { write: true });
  const parent = await loadEntry(parentId, user);
  const content = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', marks: [{ type: 'italic' }], text: `Complément à l'entrée « ${parent.title} » du ${frDate(parent.entry_date)}.` }],
      },
      ...blocks,
      { type: 'paragraph' },
    ],
  };
  const title = `Addendum : ${parent.title}`;
  const id = await tx(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO entries (project_id, parent_entry_id, title, entry_date, content, plain_text, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [parent.project_id, parent.id, title, today(), JSON.stringify(content), docToPlainText(content), user.id],
    );
    await emit(db, { type: 'entry.created', id: rows[0].id, projectId: parent.project_id, actor: user, data: { title, parent_entry_id: parent.id } });
    return rows[0].id;
  });
  return { id, role };
}

router.post('/:id/versions', async (req, res) => {
  const result = await freezeEntryVersion(req.user, req.params.id, req.body?.note ?? '');
  res.status(result.unchanged ? 200 : 201).json(result);
});

router.post('/:id/lock', async (req, res) => {
  const role = await lockEntry(req.user, req.params.id, req.body?.note ?? '');
  res.json({ ...(await loadEntry(req.params.id, req.user)), role });
});

router.post('/:id/addendum', async (req, res) => {
  const { id, role } = await createAddendum(req.user, req.params.id);
  res.status(201).json({ ...(await loadEntry(id, req.user)), role });
});

// Archive un brouillon créé par erreur (il reste dans la base et dans les exports)
router.post('/:id/archive', async (req, res) => {
  await assertEntry(req.user, req.params.id, { write: true });
  const { rows } = await query(
    `UPDATE entries SET archived = true, updated_at = now() WHERE id = $1 AND status = 'draft' RETURNING project_id, title`,
    [req.params.id],
  );
  if (!rows[0]) throw new HttpError(409, 'Seuls les brouillons peuvent être archivés.');
  await emit(null, { type: 'entry.archived', id: req.params.id, projectId: rows[0].project_id, actor: req.user, data: { title: rows[0].title } });
  res.json({ ok: true });
});

router.get('/:id/verify', async (req, res) => {
  await assertEntry(req.user, req.params.id);
  res.json(await verifyEntry({ query }, req.params.id));
});

/** Version demandée (?version=N ou last) ; sans version : la copie de travail. */
export async function findVersion(entry, wanted) {
  const n = wanted === 'last' ? entry.version_count : Number(wanted);
  if (!(n > 0)) return null;
  const { rows } = await query(
    `SELECT v.*, u.display_name AS author FROM entry_versions v JOIN users u ON u.id = v.created_by
     WHERE v.entry_id = $1 AND v.version_number = $2`,
    [entry.id, n],
  );
  if (!rows[0]) throw notFound('Version');
  return rows[0];
}

// Page imprimable (Fichier > Imprimer > Enregistrer en PDF)
router.get('/:id/print', async (req, res) => {
  await assertEntry(req.user, req.params.id);
  const entry = await loadEntry(req.params.id, req.user);
  const version = await findVersion(entry, req.query.version);
  res.type('html').send(renderEntryPage({
    entry,
    project: { name: entry.project_name },
    version,
    author: version?.author,
    printButton: true,
  }));
});

// Markdown : .md seul (fichiers laissés sur le serveur) ou, avec ?files=1, zip avec les fichiers joints.
// Une version figée n'emporte que les fichiers qui existaient quand elle a été figée.
router.get('/:id/markdown', async (req, res) => {
  await assertEntry(req.user, req.params.id);
  const entry = await loadEntry(req.params.id, req.user);
  const version = await findVersion(entry, req.query.version);
  const { rows: attachments } = await query(
    `SELECT id, sha256, filename, size_bytes, created_at FROM attachments
     WHERE entry_id = $1 AND ($2::timestamptz IS NULL OR created_at <= $2) ORDER BY created_at`,
    [entry.id, version?.created_at ?? null],
  );
  const data = { entry, project: { name: entry.project_name }, version, author: version?.author, attachments, origin: originOf(req) };
  const base = entryFileBase(version ?? entry) + (version ? ` (v${version.version_number})` : '');
  if (req.query.files !== '1') {
    setDownload(res, `${base}.md`, 'text/markdown; charset=utf-8');
    res.send(markdownOnServer(data));
    return;
  }
  const { md, files } = markdownWithFiles(data);
  await sendZip(res, `${safeFileName(base)}.zip`, (zip, addFile) => {
    zip.append(md, { name: `${base}/${base}.md` });
    for (const f of files) addFile(f.path, `${base}/fichiers/${f.name}`);
  });
});

export default router;
