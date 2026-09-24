import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { blobPath, storeBlob, tmpDir } from '../lib/storage.js';

const router = Router();
const upload = multer({ dest: tmpDir, limits: { fileSize: config.maxUploadMb * 1024 * 1024 } });

// Busboy décode les noms de fichiers en latin1 : on les repasse en UTF-8
const fixName = (name) => {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('\uFFFD') ? name : utf8;
};

const COLUMNS = 'id, sha256, filename, mime_type, size_bytes, created_at, derived_from, edit_params';

/** Champs facultatifs d'une image retouchée : original et paramètres de retouche. */
async function readDerivation(body) {
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
  if (derivedFrom) {
    const { rows } = await query('SELECT id FROM attachments WHERE id = $1', [derivedFrom]);
    if (!rows[0]) throw notFound('Image d\'origine');
  }
  return { derivedFrom, editParams };
}

router.post('/entries/:id/attachments', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw new HttpError(400, 'Aucun fichier reçu (champ « file »).');
  try {
    const { rows: [entry] } = await query('SELECT status FROM entries WHERE id = $1', [req.params.id]);
    if (!entry) throw notFound('Entrée');
    if (entry.status === 'locked') throw new HttpError(409, 'Entrée verrouillée : ajoutez le fichier dans un addendum.');
    const { derivedFrom, editParams } = await readDerivation(req.body);
    const sha = await storeBlob(file.path);
    const { rows } = await query(
      `INSERT INTO attachments
         (entry_id, sha256, filename, mime_type, size_bytes, created_by, created_at, derived_from, edit_params)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${COLUMNS}`,
      [req.params.id, sha, fixName(file.originalname).slice(0, 255),
        file.mimetype || 'application/octet-stream', file.size, req.user.id, new Date().toISOString(),
        derivedFrom, editParams ? JSON.stringify(editParams) : null],
    );
    res.status(201).json(rows[0]);
  } finally {
    fs.promises.unlink(file.path).catch(() => {}); // déjà déplacé dans le cas normal
  }
});

router.get('/entries/:id/attachments', async (req, res) => {
  const { rows } = await query(
    `SELECT ${COLUMNS} FROM attachments WHERE entry_id = $1 ORDER BY created_at`,
    [req.params.id],
  );
  res.json(rows);
});

router.get('/attachments/:id', async (req, res) => {
  const { rows } = await query(`SELECT entry_id, ${COLUMNS} FROM attachments WHERE id = $1`, [req.params.id]);
  if (!rows[0]) throw notFound('Fichier');
  res.json(rows[0]);
});

// Types qui pourraient exécuter du code s'ils étaient ouverts dans le navigateur
const RISKY = /html|svg|xml|javascript|ecmascript/i;

router.get('/files/:id', async (req, res) => {
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
