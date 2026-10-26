import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { query } from '../db.js';
import { assertAttachment, assertEntry } from '../lib/access.js';
import { HttpError, notFound } from '../lib/errors.js';
import { blobPath, storeBlob, tmpDir } from '../lib/storage.js';
import { emit } from '../integrations/events.js';

const router = Router();
const upload = multer({ dest: tmpDir, limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });

// Busboy décode les noms de fichiers en latin1 : on les repasse en UTF-8
const fixName = (name) => {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('\uFFFD') ? name : utf8;
};

const COLUMNS = 'id, sha256, filename, mime_type, size_bytes, created_at, derived_from, edit_params';

/** Champs facultatifs d'une image retouchée : original et paramètres de retouche. */
async function readDerivation(body, user) {
  const derivedFrom = body?.derived_from || null;
  let editParams = null;
  if (body?.edit_params) {
    if (String(body.edit_params).length > 20_000) throw new HttpError(400, 'Paramètres de retouche trop volumineux.');
    try {
      editParams = JSON.parse(body.edit_params);
    } catch {
      throw new HttpError(400, 'Paramètres de retouche illisibles.');
    }
  }
  // L'original d'une image retouchée : une pièce jointe que ce compte peut voir
  if (derivedFrom) await assertAttachment(user, derivedFrom);
  return { derivedFrom, editParams };
}

/**
 * Joint un fichier (déjà écrit dans le dossier temporaire) à un brouillon. file : { path, filename, mimetype, size }.
 * Le fichier temporaire est déplacé dans le stockage, ou effacé en cas d'erreur.
 */
export async function addAttachment(user, entryId, file, { derivedFrom = null, editParams = null } = {}) {
  try {
    await assertEntry(user, entryId, { write: true });
    const { rows: [entry] } = await query('SELECT status, project_id, title FROM entries WHERE id = $1', [entryId]);
    if (!entry) throw notFound('Entrée');
    if (entry.status === 'locked') throw new HttpError(409, 'Entrée verrouillée : ajoutez le fichier dans un addendum.');
    if (derivedFrom) await assertAttachment(user, derivedFrom);
    const sha = await storeBlob(file.path);
    const { rows } = await query(
      `INSERT INTO attachments
         (entry_id, sha256, filename, mime_type, size_bytes, created_by, created_at, derived_from, edit_params)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [entryId, sha, String(file.filename).slice(0, 255),
        file.mimetype || 'application/octet-stream', file.size, user.id, new Date().toISOString(),
        derivedFrom, editParams ? JSON.stringify(editParams) : null],
    );
    await emit(null, {
      type: 'attachment.created', id: rows[0].id, projectId: entry.project_id, actor: user,
      data: { title: rows[0].filename, entry_id: entryId, entry_title: entry.title, mime_type: rows[0].mime_type, size_bytes: Number(rows[0].size_bytes) },
    });
    return rows[0];
  } finally {
    fs.promises.unlink(file.path).catch(() => {}); // déjà déplacé dans le cas normal
  }
}

router.post('/entries/:id/attachments', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Aucun fichier reçu (champ « file »).');
  let derivation;
  try {
    derivation = await readDerivation(req.body, req.user);
  } catch (err) {
    fs.promises.unlink(file.path).catch(() => {});
    throw err;
  }
  const row = await addAttachment(req.user, req.params.id, {
    path: file.path, filename: fixName(file.originalname), mimetype: file.mimetype, size: file.size,
  }, derivation);
  res.status(201).json(row);
});

router.get('/entries/:id/attachments', async (req, res) => {
  await assertEntry(req.user, req.params.id);
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM attachments WHERE entry_id = $1 ORDER BY created_at`,
    [req.params.id],
  );
  res.json(rows);
});

router.get('/attachments/:id', async (req, res) => {
  await assertAttachment(req.user, req.params.id);
  const { rows } = await query(`SELECT entry_id, ${COLUMNS} FROM attachments WHERE id = $1`, [req.params.id]);
  if (!rows[0]) throw notFound('Fichier');
  res.json(rows[0]);
});

// Types qui pourraient exécuter du code s'ils étaient ouverts dans le navigateur
const RISKY = /html|svg|xml|javascript|ecmascript/i;

router.get('/files/:id', async (req, res) => {
  await assertAttachment(req.user, req.params.id);
  const { rows } = await query('SELECT sha256, filename, mime_type FROM attachments WHERE id = $1', [req.params.id]);
  const f = rows[0];
  if (!f) throw notFound('Fichier');
  const risky = RISKY.test(f.mime_type);
  const download = risky || req.query.download === '1';
  res.set({
    'Content-Type': risky ? 'application/octet-stream' : f.mime_type,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  if (risky) res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.sendFile(blobPath(f.sha256));
});

export default router;
