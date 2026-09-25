import crypto from 'node:crypto';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { assertProject, projectRole } from '../lib/access.js';
import { HttpError, notFound } from '../lib/errors.js';
import { blobPath, storeBlob, tmpDir } from '../lib/storage.js';
import { hashPassword, sessionUser, verifyPassword } from '../auth.js';

const upload = multer({ dest: tmpDir, limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });
const COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'white'];
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;
const NOTE_COLUMNS = `id, x, y, width, color, text, image_id, rotation, z, author_name, updated_by_name, created_at, updated_at`;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function bounded(value, min, max, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `Valeur invalide pour ${label}.`);
  return Math.min(Math.max(n, min), max);
}

async function bump(db, projectId) {
  await db.query('UPDATE projects SET board_revision = board_revision + 1 WHERE id = $1', [projectId]);
}

async function checkImage(db, projectId, imageId) {
  const { rows } = await db.query('SELECT id FROM board_images WHERE id = $1 AND project_id = $2', [imageId, projectId]);
  if (!rows[0]) throw new HttpError(400, 'Image inconnue sur ce tableau.');
  return imageId;
}

/**
 * Routes d'un tableau. Le même routeur sert aux membres du projet (connectés)
 * et aux invités d'un lien partagé ; seule la façon de résoudre le projet change.
 * resolve(req) → { projectId, canEdit, actor: { userId, name } }
 */
function boardRouter(resolve) {
  const r = Router({ mergeParams: true });

  r.use(async (req, _res, next) => {
    req.board = await resolve(req);
    next();
  });
  const requireEdit = (req, _res, next) => {
    if (!req.board.canEdit) throw new HttpError(403, 'Ce tableau est partagé en lecture seule.');
    next();
  };

  r.get('/', async (req, res) => {
    const pid = req.board.projectId;
    const [{ rows: [p] }, { rows: notes }, { rows: links }] = await Promise.all([
      query('SELECT name, board_revision FROM projects WHERE id = $1', [pid]),
      query(`SELECT ${NOTE_COLUMNS} FROM board_notes WHERE project_id = $1 AND deleted_at IS NULL ORDER BY z, created_at`, [pid]),
      query('SELECT id, from_note, to_note FROM board_links WHERE project_id = $1 AND deleted_at IS NULL', [pid]),
    ]);
    res.json({ title: p.name, revision: p.board_revision, can_edit: req.board.canEdit, notes, links });
  });

  // Appelé toutes les quelques secondes par chaque navigateur ouvert sur le tableau
  r.get('/revision', async (req, res) => {
    const { rows } = await query('SELECT board_revision FROM projects WHERE id = $1', [req.board.projectId]);
    res.json({ revision: rows[0].board_revision });
  });

  r.post('/notes', requireEdit, async (req, res) => {
    const b = req.body ?? {};
    const { projectId, actor } = req.board;
    if (b.color !== undefined && !COLORS.includes(b.color)) throw new HttpError(400, 'Couleur inconnue.');
    const note = await tx(async (db) => {
      const { rows: [{ z }] } = await db.query(
        'SELECT coalesce(max(z), 0) + 1 AS z FROM board_notes WHERE project_id = $1 AND deleted_at IS NULL',
        [projectId],
      );
      const imageId = b.image_id ? await checkImage(db, projectId, b.image_id) : null;
      const { rows } = await db.query(
        `INSERT INTO board_notes (project_id, x, y, width, color, text, image_id, rotation, z, created_by, author_name, updated_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11) RETURNING ${NOTE_COLUMNS}`,
        [projectId, bounded(b.x ?? 100, 0, 20000, 'x'), bounded(b.y ?? 100, 0, 20000, 'y'),
          bounded(b.width ?? 220, 140, 520, 'la largeur'), b.color ?? 'yellow', String(b.text ?? '').slice(0, 5000),
          imageId, bounded(b.rotation ?? 0, -6, 6, 'la rotation'), z, actor.userId, actor.name],
      );
      await bump(db, projectId);
      return rows[0];
    });
    res.status(201).json(note);
  });

  r.patch('/notes/:noteId', requireEdit, async (req, res) => {
    const b = req.body ?? {};
    const { projectId, actor } = req.board;
    const note = await tx(async (db) => {
      const sets = [];
      const values = [];
      const set = (column, value) => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (b.x !== undefined) set('x', bounded(b.x, 0, 20000, 'x'));
      if (b.y !== undefined) set('y', bounded(b.y, 0, 20000, 'y'));
      if (b.width !== undefined) set('width', bounded(b.width, 140, 520, 'la largeur'));
      if (b.z !== undefined) set('z', Math.round(bounded(b.z, 0, 1e9, 'la profondeur')));
      if (b.text !== undefined) set('text', String(b.text).slice(0, 5000));
      if (b.color !== undefined) {
        if (!COLORS.includes(b.color)) throw new HttpError(400, 'Couleur inconnue.');
        set('color', b.color);
      }
      if ('image_id' in b) set('image_id', b.image_id ? await checkImage(db, projectId, b.image_id) : null);
      if (!sets.length) throw new HttpError(400, 'Rien à modifier.');
      // Un simple déplacement ne change pas le « modifié par »
      if (b.text !== undefined || b.color !== undefined || 'image_id' in b) {
        set('updated_by_name', actor.name);
        sets.push('updated_at = now()');
      }
      values.push(req.params.noteId, projectId);
      const { rows } = await db.query(
        `UPDATE board_notes SET ${sets.join(', ')}
         WHERE id = $${values.length - 1} AND project_id = $${values.length} AND deleted_at IS NULL
         RETURNING ${NOTE_COLUMNS}`,
        values,
      );
      if (!rows[0]) throw notFound('Post-it');
      await bump(db, projectId);
      return rows[0];
    });
    res.json(note);
  });

  r.delete('/notes/:noteId', requireEdit, async (req, res) => {
    const { projectId } = req.board;
    await tx(async (db) => {
      const { rowCount } = await db.query(
        'UPDATE board_notes SET deleted_at = now() WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL',
        [req.params.noteId, projectId],
      );
      if (!rowCount) throw notFound('Post-it');
      await db.query(
        `UPDATE board_links SET deleted_at = now()
         WHERE project_id = $1 AND (from_note = $2 OR to_note = $2) AND deleted_at IS NULL`,
        [projectId, req.params.noteId],
      );
      await bump(db, projectId);
    });
    res.json({ ok: true });
  });

  r.post('/links', requireEdit, async (req, res) => {
    const { projectId } = req.board;
    const { from_note: from, to_note: to } = req.body ?? {};
    if (!from || !to || from === to) throw new HttpError(400, 'Choisissez deux post-it différents.');
    const link = await tx(async (db) => {
      const { rows: notes } = await db.query(
        'SELECT id FROM board_notes WHERE project_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL',
        [projectId, [from, to]],
      );
      if (notes.length !== 2) throw notFound('Post-it');
      const { rows: existing } = await db.query(
        `SELECT id, from_note, to_note FROM board_links
         WHERE project_id = $1 AND deleted_at IS NULL
           AND ((from_note = $2 AND to_note = $3) OR (from_note = $3 AND to_note = $2))`,
        [projectId, from, to],
      );
      if (existing[0]) return existing[0];
      const { rows } = await db.query(
        'INSERT INTO board_links (project_id, from_note, to_note) VALUES ($1, $2, $3) RETURNING id, from_note, to_note',
        [projectId, from, to],
      );
      await bump(db, projectId);
      return rows[0];
    });
    res.status(201).json(link);
  });

  r.delete('/links/:linkId', requireEdit, async (req, res) => {
    const { projectId } = req.board;
    await tx(async (db) => {
      const { rowCount } = await db.query(
        'UPDATE board_links SET deleted_at = now() WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL',
        [req.params.linkId, projectId],
      );
      if (!rowCount) throw notFound('Fil');
      await bump(db, projectId);
    });
    res.json({ ok: true });
  });

  r.post('/images', requireEdit, upload.single('file'), async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, 'Aucune image reçue.');
    try {
      if (!IMAGE_TYPES.test(file.mimetype)) throw new HttpError(400, 'Format non affichable : PNG, JPEG, GIF ou WebP.');
      const sha = await storeBlob(file.path);
      const name = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const { rows } = await query(
        `INSERT INTO board_images (project_id, sha256, filename, mime_type, size_bytes, uploaded_by, uploaded_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, filename, mime_type`,
        [req.board.projectId, sha, (name.includes('\uFFFD') ? file.originalname : name).slice(0, 255),
          file.mimetype, file.size, req.board.actor.userId, req.board.actor.name],
      );
      res.status(201).json(rows[0]);
    } finally {
      fs.promises.unlink(file.path).catch(() => {});
    }
  });

  r.get('/images/:imageId', async (req, res) => {
    const { rows } = await query(
      'SELECT sha256, mime_type FROM board_images WHERE id = $1 AND project_id = $2',
      [req.params.imageId, req.board.projectId],
    );
    if (!rows[0]) throw notFound('Image');
    res.set({
      'Content-Type': rows[0].mime_type,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
    res.sendFile(blobPath(rows[0].sha256));
  });

  return r;
}

// ---------------------------------------------------------------------------
// Membres du projet (connectés) : /api/projects/:projectId/board
// ---------------------------------------------------------------------------

export const ownerBoard = Router({ mergeParams: true });

/** Le projet, si le compte y a accès ; owner : seul le propriétaire gère le lien partagé. */
async function ownerProject(req, opts) {
  const role = await assertProject(req.user, req.params.projectId, opts);
  const { rows } = await query('SELECT id, board_share_token, board_share_mode, board_share_password_hash FROM projects WHERE id = $1', [req.params.projectId]);
  if (!rows[0]) throw notFound('Projet');
  return { ...rows[0], role };
}

const shareInfo = (p) => ({
  enabled: Boolean(p.board_share_token),
  token: p.board_share_token,
  mode: p.board_share_mode,
  has_password: Boolean(p.board_share_password_hash),
});

ownerBoard.get('/share', async (req, res) => res.json(shareInfo(await ownerProject(req))));

ownerBoard.put('/share', async (req, res) => {
  const p = await ownerProject(req, { owner: true });
  const b = req.body ?? {};
  let result;
  if (!b.enabled) {
    ({ rows: [result] } = await query(
      `UPDATE projects SET board_share_token = NULL, board_share_password_hash = NULL,
         board_share_version = board_share_version + 1 WHERE id = $1 RETURNING *`,
      [p.id],
    ));
  } else {
    const password = String(b.password ?? '');
    if (!password && !p.board_share_password_hash) throw new HttpError(400, 'Choisissez un mot de passe pour le lien.');
    if (password && password.length < 4) throw new HttpError(400, 'Mot de passe trop court (4 caractères minimum).');
    const mode = b.mode === 'read' ? 'read' : 'edit';
    const token = !p.board_share_token || b.regenerate ? crypto.randomBytes(18).toString('base64url') : p.board_share_token;
    const reset = Boolean(password) || Boolean(b.regenerate); // les invités devront se reconnecter
    ({ rows: [result] } = await query(
      `UPDATE projects SET board_share_token = $2, board_share_mode = $3,
         board_share_password_hash = COALESCE($4, board_share_password_hash),
         board_share_version = board_share_version + $5
       WHERE id = $1 RETURNING *`,
      [p.id, token, mode, password ? hashPassword(password) : null, reset ? 1 : 0],
    ));
  }
  res.json(shareInfo(result));
});

ownerBoard.use(boardRouter(async (req) => {
  const p = await ownerProject(req);
  // Un administrateur qui n'est pas membre regarde sans toucher
  return { projectId: p.id, canEdit: p.role !== 'admin', actor: { userId: req.user.id, name: req.user.display_name } };
}));

// ---------------------------------------------------------------------------
// Invités d'un lien partagé : /api/shared/:token (sans compte, mot de passe commun)
// ---------------------------------------------------------------------------

export const sharedBoard = Router({ mergeParams: true });

async function sharedProject(token) {
  const { rows } = await query(
    `SELECT id, name, board_share_mode, board_share_password_hash, board_share_version
     FROM projects WHERE board_share_token = $1 AND NOT archived`,
    [String(token)],
  );
  if (!rows[0]) throw new HttpError(404, 'Ce lien de tableau est désactivé ou incorrect.');
  return rows[0];
}

const guestCookieName = (token) => `paillasse_board_${token.slice(0, 12)}`;
const guestSignature = (token, version, expires) =>
  crypto.createHmac('sha256', config.sessionSecret).update(`board:${token}:${version}:${expires}`).digest('base64url');

async function sharedAccess(req, p) {
  // Les membres connectés n'ont pas besoin du mot de passe ; les autres comptes sont des invités comme les autres
  const user = await sessionUser(req);
  if (user && await projectRole(user.id, p.id)) return { userId: user.id, name: user.display_name, member: true };
  const token = req.params.token;
  const [expires, signature] = String(req.cookies?.[guestCookieName(token)] ?? '').split('.');
  if (!expires || !signature || Date.now() > Number(expires)) return null;
  const expected = guestSignature(token, p.board_share_version, expires);
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  let name = 'Invité';
  try {
    name = decodeURIComponent(req.get('x-paillasse-guest') ?? '').trim().slice(0, 40) || 'Invité';
  } catch { /* nom mal encodé : on garde « Invité » */ }
  return { userId: null, name, member: false };
}

sharedBoard.get('/', async (req, res) => {
  const p = await sharedProject(req.params.token);
  res.json({ title: p.name, mode: p.board_share_mode, authorized: Boolean(await sharedAccess(req, p)) });
});

sharedBoard.post('/login', async (req, res) => {
  const p = await sharedProject(req.params.token);
  if (!p.board_share_password_hash || !verifyPassword(String(req.body?.password ?? ''), p.board_share_password_hash)) {
    await pause(800);
    throw new HttpError(401, 'Mot de passe incorrect.');
  }
  const expires = Date.now() + 30 * 86_400_000;
  const token = req.params.token;
  res.cookie(guestCookieName(token), `${expires}.${guestSignature(token, p.board_share_version, expires)}`, {
    httpOnly: true, sameSite: 'lax', secure: config.secureCookies, expires: new Date(expires), path: `/api/shared/${token}`,
  });
  res.json({ ok: true });
});

sharedBoard.use('/board', boardRouter(async (req) => {
  const p = await sharedProject(req.params.token);
  const actor = await sharedAccess(req, p);
  if (!actor) throw new HttpError(401, 'Mot de passe requis.');
  return { projectId: p.id, canEdit: actor.member || p.board_share_mode === 'edit', actor };
}));
