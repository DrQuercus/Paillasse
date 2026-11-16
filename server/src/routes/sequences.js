import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { assertProject, assertSequence, visibleProjects } from '../lib/access.js';
import { HttpError, notFound } from '../lib/errors.js';
import { canonicalize, sha256, sha256File } from '../lib/hash.js';
import { blobPath, storeBlob, tmpDir } from '../lib/storage.js';
import { gcPercent, normalizeSequenceData } from '../lib/seq/model.js';
import { parseSnapGene } from '../lib/seq/snapgene.js';
import { parseGenbank } from '../lib/seq/genbank-read.js';
import { toGenbank } from '../lib/seq/genbank.js';
import { parseFasta, toFasta } from '../lib/seq/fasta.js';
import { cutterSummary, digest } from '../lib/seq/enzymes.js';
import { designExact, designFlanking } from '../lib/seq/primer3.js';
import { simulatePcr } from '../lib/seq/pcr.js';
import { emit } from '../integrations/events.js';

const router = Router();
const upload = multer({ dest: tmpDir, limits: { fileSize: 100 * 1024 * 1024, files: 30 } });
const utf8Name = (name) => {
  const fixed = Buffer.from(name, 'latin1').toString('utf8');
  return fixed.includes('\uFFFD') ? name : fixed;
};

const COMPLEMENT = { A: 'T', T: 'A', G: 'C', C: 'G', U: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N' };
export const revcomp = (s) => [...s.toUpperCase()].reverse().map((c) => COMPLEMENT[c] ?? 'N').join('');

/** Reconnaît le format par le contenu (et l'extension en appoint). */
export function parseAny(buf, filename) {
  if (buf.length > 13 && buf[0] === 0x09 && buf.subarray(5, 13).toString('ascii') === 'SnapGene') {
    return [parseSnapGene(buf, filename)];
  }
  const text = buf.toString('utf8');
  const head = text.trimStart();
  if (head.startsWith('LOCUS')) return parseGenbank(text);
  if (head.startsWith('>')) return parseFasta(text, filename);
  if (/^[ACGTURYSWKMBDHVN\s\d]+$/i.test(head) && /[ACGT]/i.test(head)) {
    return [{ name: filename.replace(/\.[^.]+$/, ''), description: '', sequence: head.replace(/[\s\d]/g, ''), circular: false, features: [], primers: [] }];
  }
  throw new HttpError(400, 'Format non reconnu (SnapGene .dna, GenBank ou FASTA attendus).');
}

/** Insère une séquence (dans une transaction) et note l'événement. user : { id, display_name }. */
async function insertSequence(db, parsed, user, projectId, origin = null) {
  const data = normalizeSequenceData(parsed);
  const { rows } = await db.query(
    `INSERT INTO sequences (name, description, project_id, sequence, circular, features, primers, length, created_by, origin)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, code, name, length, circular`,
    [String(parsed.name || 'Sans nom').slice(0, 300), String(parsed.description ?? '').slice(0, 10000), projectId || null,
      data.sequence, data.circular, JSON.stringify(data.features), JSON.stringify(data.primers), data.sequence.length, user.id,
      origin ? JSON.stringify(origin) : null],
  );
  const s = rows[0];
  await emit(db, { type: 'sequence.created', id: s.id, projectId: projectId || null, actor: user, data: { title: s.name, code: s.code, length: s.length, circular: s.circular } });
  return s;
}

// --- Droits ----------------------------------------------------------------------
// Une séquence rattachée à un projet suit ses droits ; sans projet, elle est à tout le labo.
// Écrire : modifier, archiver, figer une version, enregistrer un produit de PCR (fige la matrice).

const WRITES = /^\/[^/]+(\/(archive|versions|pcr\/create))?$/;

router.param('id', (req, _res, next, id) => {
  const write = (req.method === 'PUT' && WRITES.test(req.path)) || (req.method === 'POST' && WRITES.test(req.path) && req.path.includes('/', 1));
  assertSequence(req.user, id, { write }).then((role) => { req.sequenceRole = role; next(); }, next);
});

// --- Registre -------------------------------------------------------------------

/** Registre : recherche par nom, code, description ou bases (8 au moins, les deux brins). */
export async function listSequences(user, { q: rawQ = '', project_id: projectId = null, limit = 500, offset = 0 } = {}) {
  if (projectId) await assertProject(user, projectId);
  const q = String(rawQ ?? '').trim();
  const bases = q.replace(/\s+/g, '');
  const isDna = bases.length >= 8 && /^[ACGTURYSWKMBDHVN]+$/i.test(bases);
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { rows } = await query(
    `SELECT s.id, s.code, s.name, s.description, s.length, s.circular, s.version_count, s.updated_at, s.project_id,
            jsonb_array_length(s.features) AS feature_count, jsonb_array_length(s.primers) AS primer_count,
            p.name AS project_name, p.color AS project_color,
            ($4 AND (strpos(upper(s.sequence), $5) > 0 OR strpos(upper(s.sequence), $6) > 0)) AS sequence_match
     FROM sequences s LEFT JOIN projects p ON p.id = s.project_id
     WHERE NOT s.archived
       AND ($1 = '' OR s.name ILIKE $2 OR s.code ILIKE $2 OR s.description ILIKE $2
            OR ($4 AND (strpos(upper(s.sequence), $5) > 0 OR strpos(upper(s.sequence), $6) > 0)))
       AND ($3::uuid IS NULL OR s.project_id = $3)
       AND ($3::uuid IS NOT NULL OR s.project_id IS NULL OR s.project_id IN ${visibleProjects('$7')})
     ORDER BY s.updated_at DESC
     LIMIT $8 OFFSET $9`,
    [q, like, projectId || null, isDna, bases.toUpperCase(), isDna ? revcomp(bases) : '', user.id,
      Math.min(500, Math.max(1, Number(limit) || 500)), Math.max(0, Math.trunc(Number(offset) || 0))],
  );
  return rows;
}

router.get('/', async (req, res) => res.json(await listSequences(req.user, req.query)));

// Import de fichiers : .dna, .gb/.gbk, .fa/.fasta (plusieurs à la fois)
router.post('/import', upload.array('files', 30), async (req, res) => {
  try {
    await assertProject(req.user, req.body?.project_id || null, { write: true });
  } catch (err) {
    for (const file of req.files ?? []) fs.promises.unlink(file.path).catch(() => {});
    throw err;
  }
  const created = [];
  const errors = [];
  for (const file of req.files ?? []) {
    const filename = utf8Name(file.originalname);
    try {
      const records = parseAny(await fs.promises.readFile(file.path), filename);
      const sha = await storeBlob(file.path);
      await tx(async (db) => {
        for (const rec of records) {
          const seq = await insertSequence(db, rec.name ? rec : { ...rec, name: filename }, req.user, req.body?.project_id);
          await db.query(
            `INSERT INTO sequence_files (sequence_id, sha256, filename, mime_type, size_bytes, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [seq.id, sha, filename.slice(0, 255), file.mimetype || 'application/octet-stream', file.size, req.user.id],
          );
          created.push(seq);
        }
      });
    } catch (err) {
      errors.push({ filename, error: err.expose ? err.message : `Erreur inattendue : ${err.message}` });
    } finally {
      fs.promises.unlink(file.path).catch(() => {});
    }
  }
  res.status(created.length ? 201 : 400).json({ created, errors });
});

/** Création depuis un texte collé (brut, FASTA ou GenBank ; plusieurs enregistrements possibles) ou vide. */
export async function createSequences(user, b = {}) {
  await assertProject(user, b.project_id || null, { write: true });
  const text = String(b.text ?? '').trim();
  const records = text ? parseAny(Buffer.from(text), b.name || 'Nouvelle séquence') : [{ sequence: '', features: [], primers: [] }];
  return tx(async (db) => {
    const out = [];
    for (const rec of records) {
      out.push(await insertSequence(db, {
        ...rec,
        name: (records.length === 1 && b.name?.trim()) || rec.name || b.name?.trim() || 'Nouvelle séquence',
        description: b.description ?? rec.description,
        circular: b.circular ?? rec.circular ?? false,
      }, user, b.project_id));
    }
    return out;
  });
}

// Création : séquence collée (brute, FASTA ou GenBank) ou vide
router.post('/', async (req, res) => {
  const created = await createSequences(req.user, req.body ?? {});
  res.status(201).json({ created, errors: [] });
});

// --- Une séquence ----------------------------------------------------------------

export async function loadSequence(id) {
  const { rows } = await query(
    `SELECT s.*, p.name AS project_name, p.color AS project_color, u.display_name AS created_by_name
     FROM sequences s JOIN users u ON u.id = s.created_by LEFT JOIN projects p ON p.id = s.project_id
     WHERE s.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('Séquence');
  const s = rows[0];
  const { rows: files } = await query(
    'SELECT id, filename, size_bytes, created_at FROM sequence_files WHERE sequence_id = $1 ORDER BY created_at',
    [id],
  );
  return { ...s, gc_percent: gcPercent(s.sequence), files };
}

router.get('/:id', async (req, res) => res.json({ ...await loadSequence(req.params.id), role: req.sequenceRole }));

router.put('/:id', async (req, res) => {
  const b = req.body ?? {};
  if (!Number.isInteger(b.revision)) throw new HttpError(400, 'Révision manquante.');
  if (b.project_id) await assertProject(req.user, b.project_id, { write: true });
  const data = b.data ? normalizeSequenceData(b.data) : null;
  const name = b.name === undefined ? null : String(b.name).trim().slice(0, 300) || 'Sans nom';
  const { rows } = await query(
    `UPDATE sequences SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       project_id = CASE WHEN $4::boolean THEN $5::uuid ELSE project_id END,
       sequence = COALESCE($6, sequence),
       circular = COALESCE($7, circular),
       features = COALESCE($8::jsonb, features),
       primers = COALESCE($9::jsonb, primers),
       length = COALESCE($10, length),
       revision = revision + 1,
       updated_at = now()
     WHERE id = $1 AND revision = $11 AND NOT archived
     RETURNING revision, updated_at, length`,
    [req.params.id, name, b.description ?? null, 'project_id' in b, b.project_id || null,
      data?.sequence ?? null, data ? data.circular : null,
      data ? JSON.stringify(data.features) : null, data ? JSON.stringify(data.primers) : null,
      data ? data.sequence.length : null, b.revision],
  );
  if (rows[0]) {
    const { rows: [s] } = await query('SELECT project_id, name, code FROM sequences WHERE id = $1', [req.params.id]);
    await emit(null, { type: 'sequence.updated', id: req.params.id, projectId: s.project_id, actor: req.user, data: { title: s.name, code: s.code, revision: rows[0].revision } });
    return res.json(rows[0]);
  }
  const { rows: cur } = await query('SELECT revision, archived FROM sequences WHERE id = $1', [req.params.id]);
  if (!cur[0]) throw notFound('Séquence');
  res.status(409).json({ code: 'conflict', revision: cur[0].revision, error: 'Séquence modifiée ailleurs (autre onglet ?). Rechargez la page.' });
});

router.post('/:id/archive', async (req, res) => {
  const { rows } = await query('UPDATE sequences SET archived = true, updated_at = now() WHERE id = $1 RETURNING project_id, name, code', [req.params.id]);
  if (!rows[0]) throw notFound('Séquence');
  await emit(null, { type: 'sequence.archived', id: req.params.id, projectId: rows[0].project_id, actor: req.user, data: { title: rows[0].name, code: rows[0].code } });
  res.json({ ok: true });
});

// --- Versions figées, chaînées par empreinte --------------------------------------

const sealed = (v) => ({
  sequence_id: v.sequence_id, version_number: v.version_number, note: v.note, name: v.name, description: v.description,
  sequence: v.sequence, circular: v.circular, features: v.features, primers: v.primers,
  created_by: v.created_by, created_at: v.created_at,
});
const chain = (prev, content) => sha256(`${prev ?? 'GENESIS'}:${content}`);
const sameData = (a, b) => canonicalize([a.name, a.sequence, a.circular, a.features, a.primers])
  === canonicalize([b.name, b.sequence, b.circular, b.features, b.primers]);

/** Fige l'état actuel d'une séquence dans une nouvelle version. Renvoie son numéro. */
async function freezeVersion(db, s, user, note = '') {
  const v = {
    sequence_id: s.id, version_number: s.version_count + 1, note, name: s.name, description: s.description,
    sequence: s.sequence, circular: s.circular, features: s.features, primers: s.primers,
    created_by: user.id, created_at: new Date().toISOString(),
  };
  const contentHash = sha256(canonicalize(sealed(v)));
  const hash = chain(s.last_version_hash, contentHash);
  await db.query(
    `INSERT INTO sequence_versions (sequence_id, version_number, note, name, description, sequence, circular,
       features, primers, created_by, created_at, content_hash, prev_hash, hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [v.sequence_id, v.version_number, note, v.name, v.description, v.sequence, v.circular,
      JSON.stringify(v.features), JSON.stringify(v.primers), v.created_by, v.created_at, contentHash, s.last_version_hash, hash],
  );
  await db.query('UPDATE sequences SET version_count = $2, last_version_hash = $3 WHERE id = $1', [s.id, v.version_number, hash]);
  await emit(db, { type: 'sequence.version_created', id: s.id, projectId: s.project_id, actor: user, data: { title: s.name, code: s.code, version_number: v.version_number, hash, note } });
  return v.version_number;
}

/** Fige une version d'une séquence (rien si rien n'a changé et sans note). */
export async function freezeSequenceVersion(user, id, noteText = '') {
  const note = String(noteText ?? '').slice(0, 500);
  await assertSequence(user, id, { write: true });
  return tx(async (db) => {
    const { rows: [s] } = await db.query('SELECT * FROM sequences WHERE id = $1 FOR UPDATE', [id]);
    if (!s) throw notFound('Séquence');
    if (s.version_count > 0) {
      const { rows: [last] } = await db.query(
        'SELECT * FROM sequence_versions WHERE sequence_id = $1 ORDER BY version_number DESC LIMIT 1', [s.id],
      );
      if (!note && sameData(last, s)) return { unchanged: true, version: { version_number: last.version_number, hash: last.hash } };
    }
    const v = {
      sequence_id: s.id, version_number: s.version_count + 1, note, name: s.name, description: s.description,
      sequence: s.sequence, circular: s.circular, features: s.features, primers: s.primers,
      created_by: user.id, created_at: new Date().toISOString(),
    };
    const contentHash = sha256(canonicalize(sealed(v)));
    const hash = chain(s.last_version_hash, contentHash);
    await db.query(
      `INSERT INTO sequence_versions (sequence_id, version_number, note, name, description, sequence, circular,
         features, primers, created_by, created_at, content_hash, prev_hash, hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [v.sequence_id, v.version_number, note, v.name, v.description, v.sequence, v.circular,
        JSON.stringify(v.features), JSON.stringify(v.primers), v.created_by, v.created_at, contentHash, s.last_version_hash, hash],
    );
    await db.query('UPDATE sequences SET version_count = $2, last_version_hash = $3 WHERE id = $1', [s.id, v.version_number, hash]);
    await emit(db, { type: 'sequence.version_created', id: s.id, projectId: s.project_id, actor: user, data: { title: s.name, code: s.code, version_number: v.version_number, hash, note } });
    return { unchanged: false, version: { version_number: v.version_number, hash, created_at: v.created_at, note } };
  });
}

router.post('/:id/versions', async (req, res) => {
  const result = await freezeSequenceVersion(req.user, req.params.id, req.body?.note);
  res.status(result.unchanged ? 200 : 201).json(result);
});

router.get('/:id/versions', async (req, res) => {
  const { rows } = await query(
    `SELECT v.version_number, v.note, v.name, length(v.sequence) AS length, v.created_at, v.hash, u.display_name AS author
     FROM sequence_versions v JOIN users u ON u.id = v.created_by
     WHERE v.sequence_id = $1 ORDER BY v.version_number DESC`,
    [req.params.id],
  );
  res.json(rows);
});

export async function loadVersion(id, n) {
  const { rows } = await query(
    `SELECT v.*, s.code, u.display_name AS author FROM sequence_versions v
     JOIN sequences s ON s.id = v.sequence_id JOIN users u ON u.id = v.created_by
     WHERE v.sequence_id = $1 AND v.version_number = $2`,
    [id, Number(n)],
  );
  if (!rows[0]) throw notFound('Version');
  return rows[0];
}

router.get('/:id/versions/:n', async (req, res) => res.json(await loadVersion(req.params.id, req.params.n)));

/** Recalcule la chaîne d'empreintes d'une séquence et relit ses fichiers d'origine. */
export async function verifySequence(id) {
  const s = await loadSequence(id);
  const { rows: versions } = await query('SELECT * FROM sequence_versions WHERE sequence_id = $1 ORDER BY version_number', [s.id]);
  const issues = [];
  let prev = null;
  for (const v of versions) {
    const label = `Version ${v.version_number}`;
    if (v.version_number !== (prev ? prev.version_number + 1 : 1)) issues.push(`${label} : numérotation discontinue.`);
    const contentHash = sha256(canonicalize(sealed({ ...v, created_at: v.created_at.toISOString() })));
    if (contentHash !== v.content_hash) issues.push(`${label} : le contenu ne correspond plus à son empreinte.`);
    if ((v.prev_hash ?? null) !== (prev?.hash ?? null)) issues.push(`${label} : lien rompu avec la version précédente.`);
    if (chain(prev?.hash ?? null, contentHash) !== v.hash) issues.push(`${label} : empreinte de chaîne invalide.`);
    prev = v;
  }
  if ((prev?.hash ?? null) !== (s.last_version_hash ?? null)) issues.push('La dernière empreinte enregistrée ne correspond pas à la chaîne.');
  for (const f of s.files) {
    const { rows: [row] } = await query('SELECT sha256 FROM sequence_files WHERE id = $1', [f.id]);
    const p = blobPath(row.sha256);
    if (!fs.existsSync(p)) issues.push(`Fichier d'origine « ${f.filename} » absent du stockage.`);
    else if ((await sha256File(p)) !== row.sha256) issues.push(`Fichier d'origine « ${f.filename} » modifié sur le disque.`);
  }
  return { ok: !issues.length, version_count: versions.length, last_hash: prev?.hash ?? null, issues, checked_at: new Date().toISOString() };
}

router.get('/:id/verify', async (req, res) => res.json(await verifySequence(req.params.id)));

// --- Export ------------------------------------------------------------------------

router.get('/:id/export', async (req, res) => {
  const s = req.query.version ? await loadVersion(req.params.id, req.query.version) : await loadSequence(req.params.id);
  const code = s.code;
  const base = `${code}_${s.name}`.replace(/[^\w.-]+/g, '_').slice(0, 120);
  const suffix = req.query.version ? `_v${req.query.version}` : '';
  if (req.query.format === 'fasta') {
    res.attachment(`${base}${suffix}.fasta`).type('text/plain');
    return res.send(toFasta(`${code}_${s.name}`, s.sequence, s.description));
  }
  res.attachment(`${base}${suffix}.gb`).type('text/plain');
  res.send(toGenbank({ ...s, description: s.description || s.name }));
});

// --- Outils : digestion virtuelle, amorces -------------------------------------------

/** Données sur lesquelles travaille un outil : copie de travail, ou version figée (?version=n). */
async function toolData(req) {
  const v = req.query.version ?? req.body?.version;
  const s = v ? await loadVersion(req.params.id, v) : await loadSequence(req.params.id);
  return { sequence: s.sequence, circular: s.circular };
}

const position = (value, n, label) => {
  const x = Number(value);
  if (!Number.isInteger(x) || x < 0 || x >= n) throw new HttpError(400, `Position ${label} invalide.`);
  return x;
};

router.get('/:id/cutters', async (req, res) => {
  const d = await toolData(req);
  res.json({ length: d.sequence.length, circular: d.circular, enzymes: cutterSummary(d.sequence, d.circular) });
});

router.post('/:id/digest', async (req, res) => {
  const d = await toolData(req);
  const names = [...new Set((req.body?.enzymes ?? []).map(String))].slice(0, 20);
  res.json(digest(d.sequence, d.circular, names));
});

router.post('/:id/primers/design', async (req, res) => {
  const d = await toolData(req);
  const b = req.body ?? {};
  const n = d.sequence.length;
  const start = position(b.start, n, 'de début');
  const end = position(b.end, n, 'de fin');
  if (start > end && !d.circular) throw new HttpError(400, 'La région passe par l’origine alors que la séquence est linéaire.');
  const targetTm = Math.min(Math.max(Number(b.targetTm) || 60, 45), 75);
  if (b.mode === 'flanking') {
    return res.json(await designFlanking(d.sequence, d.circular, start, end, {
      targetTm, productMin: Number(b.productMin) || undefined, productMax: Number(b.productMax) || undefined,
    }));
  }
  res.json(await designExact(d.sequence, d.circular, start, end, { targetTm }));
});

// --- PCR virtuelle -----------------------------------------------------------------

function pcrPrimers(body) {
  const pick = (p, label) => {
    if (!p) throw new HttpError(400, `${label} manquante.`);
    return { name: String(p.name ?? label).slice(0, 200), bases: String(p.bases ?? '') };
  };
  return [pick(body?.forward, 'Amorce sens'), pick(body?.reverse, 'Amorce antisens')];
}

/** Version allégée d'un produit : la séquence complète n'est renvoyée qu'une fois. */
export const productSummary = (p) => ({
  length: p.length,
  region: p.region,
  offset: p.offset,
  feature_count: p.features.length,
  mismatches: p.mismatches,
  forward: { start: p.forward.start, end: p.forward.end, three_prime_end: p.forward.threePrimeEnd, tm: p.forward.tm, annealed_length: p.forward.annealedLength, tail_length: p.forward.tailLength, mismatches: p.forward.mismatches.length },
  reverse: { start: p.reverse.start, end: p.reverse.end, three_prime_end: p.reverse.threePrimeEnd, tm: p.reverse.tm, annealed_length: p.reverse.annealedLength, tail_length: p.reverse.tailLength, mismatches: p.reverse.mismatches.length },
});

router.post('/:id/pcr', async (req, res) => {
  const source = req.body?.version ? await loadVersion(req.params.id, req.body.version) : await loadSequence(req.params.id);
  const [forward, reverse] = pcrPrimers(req.body);
  const r = simulatePcr(source, forward, reverse);
  res.json({
    template: { code: source.code, name: source.name, length: source.sequence.length, circular: source.circular },
    forward: r.forwardPrimer, reverse: r.reversePrimer, swapped: r.swapped,
    warnings: r.warnings,
    annealing_temperatures: r.annealingTemperatures,
    forward_sites: r.forwardSites.length,
    reverse_sites: r.reverseSites.length,
    products: r.products.map(productSummary),
    sequence: r.products[0]?.sequence ?? null,
  });
});

/** Enregistre un produit de PCR comme nouvelle séquence, en gardant sa recette. */
router.post('/:id/pcr/create', async (req, res) => {
  if (req.body?.project_id) await assertProject(req.user, req.body.project_id, { write: true });
  const [forward, reverse] = pcrPrimers(req.body);
  const index = Number(req.body?.product_index) || 0;
  const created = await tx(async (db) => {
    const { rows: [s] } = await db.query('SELECT * FROM sequences WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (!s) throw notFound('Séquence');
    // La recette doit pointer vers un état précis de la matrice : on fige une version si besoin
    let version = s.version_count;
    const { rows: [last] } = await db.query(
      'SELECT * FROM sequence_versions WHERE sequence_id = $1 ORDER BY version_number DESC LIMIT 1', [s.id],
    );
    if (!last || !sameData(last, s)) {
      version = await freezeVersion(db, s, req.user, 'avant PCR virtuelle');
    }
    const r = simulatePcr(s, forward, reverse);
    const product = r.products[index];
    if (!product) throw new HttpError(400, "Ce produit de PCR n'existe plus : relancez la simulation.");
    const origin = {
      method: 'pcr',
      created_at: new Date().toISOString(),
      template: { sequence_id: s.id, code: s.code, name: s.name, version },
      primers: [
        { name: r.forwardPrimer.name, bases: r.forwardPrimer.bases, strand: 1, tm: product.forward.tm, tail_length: product.forward.tailLength },
        { name: r.reversePrimer.name, bases: r.reversePrimer.bases, strand: -1, tm: product.reverse.tm, tail_length: product.reverse.tailLength },
      ],
      region: { start: product.region.start, end: product.region.end, length: product.region.length, wraps_origin: product.region.wrapsOrigin },
      mismatches: product.mismatches,
      product_length: product.length,
    };
    return insertSequence(db, {
      name: String(req.body?.name ?? '').trim().slice(0, 300) || `${s.name} (PCR ${r.forwardPrimer.name} × ${r.reversePrimer.name})`,
      description: `Produit de PCR sur ${s.code} ${s.name} (version ${version}), amorces ${r.forwardPrimer.name} et ${r.reversePrimer.name}.`,
      sequence: product.sequence,
      circular: false,
      features: product.features,
      primers: product.primers,
    }, req.user, req.body?.project_id ?? s.project_id, origin);
  });
  res.status(201).json(created);
});

router.get('/:id/files/:fileId', async (req, res) => {
  const { rows } = await query('SELECT * FROM sequence_files WHERE id = $1 AND sequence_id = $2', [req.params.fileId, req.params.id]);
  if (!rows[0]) throw notFound('Fichier');
  res.attachment(rows[0].filename);
  res.sendFile(blobPath(rows[0].sha256));
});

export default router;
