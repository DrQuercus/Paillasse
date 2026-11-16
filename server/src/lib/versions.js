import { canonicalize, sha256, sha256File } from './hash.js';
import { HttpError, notFound } from './errors.js';
import { blobPath } from './storage.js';
import fs from 'node:fs';

const GENESIS = 'GENESIS';

/** Pièces jointes de l'entrée existant à l'instant t (même requête à l'écriture et à la vérification). */
async function attachmentsAt(db, entryId, at) {
  const { rows } = await db.query(
    `SELECT id, sha256, filename, derived_from, edit_params FROM attachments
     WHERE entry_id = $1 AND created_at <= $2 ORDER BY id`,
    [entryId, at],
  );
  // L'origine et les retouches ne figurent que pour les images retouchées :
  // les empreintes des versions antérieures à cette fonctionnalité restent identiques.
  return rows.map(({ derived_from: from, edit_params: params, ...a }) =>
    (from ? { ...a, derived_from: from, edit_params: params } : a));
}

/** Ce qui est scellé dans une version. Toute modification de l'un de ces champs casse le hash. */
function sealedPayload(v, attachments) {
  return {
    entry_id: v.entry_id,
    version_number: v.version_number,
    kind: v.kind,
    note: v.note,
    title: v.title,
    entry_date: v.entry_date,
    content: v.content,
    plain_text: v.plain_text,
    created_by: v.created_by,
    created_at: v.created_at,
    attachments,
  };
}

const chainHash = (prevHash, contentHash) => sha256(`${prevHash ?? GENESIS}:${contentHash}`);

export const sameContent = (a, b) =>
  canonicalize({ t: a.title, d: a.entry_date, c: a.content }) ===
  canonicalize({ t: b.title, d: b.entry_date, c: b.content });

/**
 * Fige la copie de travail d'une entrée dans une nouvelle version.
 * À appeler dans une transaction (db = client de transaction).
 */
export async function createVersion(db, entryId, userId, { note = '', kind = 'manual' } = {}) {
  const { rows: [entry] } = await db.query('SELECT * FROM entries WHERE id = $1 FOR UPDATE', [entryId]);
  if (!entry) throw notFound('Entrée');
  if (entry.status === 'locked') throw new HttpError(409, 'Cette entrée est verrouillée.');

  if (kind === 'manual' && entry.version_count > 0) {
    const { rows: [last] } = await db.query(
      `SELECT id, version_number, title, entry_date, content, hash, created_at
       FROM entry_versions WHERE entry_id = $1 ORDER BY version_number DESC LIMIT 1`,
      [entryId],
    );
    if (last && !note && sameContent(last, entry)) return { unchanged: true, version: last };
  }

  const createdAt = new Date().toISOString();
  const version = {
    entry_id: entry.id,
    version_number: entry.version_count + 1,
    kind,
    note: String(note).slice(0, 500),
    title: entry.title,
    entry_date: entry.entry_date,
    content: entry.content,
    plain_text: entry.plain_text,
    created_by: userId,
    created_at: createdAt,
  };
  const attachments = await attachmentsAt(db, entryId, createdAt);
  const contentHash = sha256(canonicalize(sealedPayload(version, attachments)));
  const prevHash = entry.last_version_hash;
  const hash = chainHash(prevHash, contentHash);

  const { rows: [inserted] } = await db.query(
    `INSERT INTO entry_versions
       (entry_id, version_number, kind, note, title, entry_date, content, plain_text,
        created_by, created_at, content_hash, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id, version_number, kind, note, title, created_at, hash`,
    [version.entry_id, version.version_number, kind, version.note, version.title, version.entry_date,
      JSON.stringify(version.content), version.plain_text, userId, createdAt, contentHash, prevHash, hash],
  );
  await db.query(
    'UPDATE entries SET version_count = $2, last_version_hash = $3 WHERE id = $1',
    [entryId, version.version_number, hash],
  );
  return { unchanged: false, version: inserted };
}

/** Recalcule toute la chaîne de l'entrée et relit les fichiers sur disque. */
export async function verifyEntry(db, entryId) {
  const { rows: [entry] } = await db.query('SELECT * FROM entries WHERE id = $1', [entryId]);
  if (!entry) throw notFound('Entrée');
  const { rows: versions } = await db.query(
    'SELECT * FROM entry_versions WHERE entry_id = $1 ORDER BY version_number',
    [entryId],
  );

  const issues = [];
  let prev = null;
  for (const v of versions) {
    const label = `Version ${v.version_number}`;
    const expectedNumber = prev ? prev.version_number + 1 : 1;
    if (v.version_number !== expectedNumber) issues.push(`${label} : numérotation discontinue (attendu ${expectedNumber}).`);

    const createdAt = v.created_at.toISOString();
    const attachments = await attachmentsAt(db, entryId, createdAt);
    const contentHash = sha256(canonicalize(sealedPayload({ ...v, created_at: createdAt }, attachments)));
    if (contentHash !== v.content_hash) issues.push(`${label} : le contenu ne correspond plus à son empreinte.`);

    const expectedPrev = prev?.hash ?? null;
    if ((v.prev_hash ?? null) !== expectedPrev) issues.push(`${label} : lien rompu avec la version précédente.`);
    if (chainHash(expectedPrev, contentHash) !== v.hash) issues.push(`${label} : empreinte de chaîne invalide.`);
    prev = v;
  }

  if ((prev?.hash ?? null) !== (entry.last_version_hash ?? null)) {
    issues.push("La dernière empreinte enregistrée sur l'entrée ne correspond pas à la chaîne.");
  }
  if (entry.status === 'locked') {
    if (!prev || prev.kind !== 'lock') issues.push('Entrée verrouillée sans version de verrouillage.');
    else if (!sameContent(prev, entry)) issues.push("Le contenu affiché diffère de la version verrouillée.");
  }

  const { rows: files } = await db.query(
    'SELECT id, sha256, filename FROM attachments WHERE entry_id = $1 ORDER BY created_at',
    [entryId],
  );
  for (const f of files) {
    const p = blobPath(f.sha256);
    if (!fs.existsSync(p)) {
      issues.push(`Fichier « ${f.filename} » absent du stockage.`);
      continue;
    }
    if ((await sha256File(p)) !== f.sha256) issues.push(`Fichier « ${f.filename} » modifié sur le disque.`);
  }

  return {
    ok: issues.length === 0,
    checked_at: new Date().toISOString(),
    version_count: versions.length,
    file_count: files.length,
    last_hash: prev?.hash ?? null,
    issues,
  };
}
