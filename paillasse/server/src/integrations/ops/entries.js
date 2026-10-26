// Opérations sur les entrées du cahier : lire (Markdown), versions figées, intégrité, fichiers joints ;
// écrire : créer, compléter, renommer, figer, verrouiller, addendum, joindre un fichier.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { query } from '../../db.js';
import { config } from '../../config.js';
import { assertEntry, assertProject, visibleProjects } from '../../lib/access.js';
import { docToPlainText } from '../../lib/doc.js';
import { HttpError, notFound } from '../../lib/errors.js';
import { markdownToBlocks } from '../../lib/markdownIn.js';
import { markdownOnServer } from '../../lib/markdownExport.js';
import { blobPath, tmpDir } from '../../lib/storage.js';
import { verifyEntry } from '../../lib/versions.js';
import {
  appendBlocks, createAddendum, createEntry, findVersion, freezeEntryVersion, loadEntry, lockEntry,
} from '../../routes/entries.js';
import { addAttachment } from '../../routes/attachments.js';
import { emit, projectAudience } from '../events.js';
import { define } from '../registry.js';
import { bool, date, int, oneOf, params, str, uuid } from '../schema.js';
import { compact, isoDate, isoTime, page, webUrl } from './common.js';

const GROUP = 'Entrées';
const MAX_MARKDOWN = 200_000;
const markdownParam = (description) => str(description, { maxLength: MAX_MARKDOWN, trim: false });

const entryCard = (ctx, e) => compact({
  id: e.id,
  title: e.title,
  date: isoDate(e.entry_date),
  status: e.status,
  project: { id: e.project_id, name: e.project_name },
  author: e.author ?? e.created_by_name,
  versions: e.version_count,
  addendum_of: e.parent_entry_id,
  updated_at: isoTime(e.updated_at),
  excerpt: e.excerpt,
  url: webUrl(ctx, `/entries/${e.id}`),
});

const fileCard = (ctx, a) => compact({
  id: a.id, filename: a.filename, mime_type: a.mime_type, size_bytes: Number(a.size_bytes), sha256: a.sha256,
  created_at: isoTime(a.created_at), derived_from: a.derived_from, url: webUrl(ctx, `/api/files/${a.id}`),
});

define({
  name: 'list_entries',
  title: 'Lister les entrées',
  group: GROUP,
  scope: 'read',
  essential: true,
  http: { method: 'GET', path: '/entries' },
  description: 'Liste les entrées du cahier (projets visibles), de la plus récente à la plus ancienne. Filtres : projet, statut '
    + '(draft = brouillon, locked = verrouillée/signée), période (dates d’expérience), mot du titre ou du texte. '
    + 'Renvoie identifiant, titre, date, projet, auteur et un extrait ; lire une entrée avec get_entry.',
  input: params({
    project_id: uuid('Projet (voir list_projects). Sans : tous les projets visibles.'),
    status: oneOf(['draft', 'locked'], 'draft (brouillon) ou locked (verrouillée).'),
    since: date('Date d’expérience minimale (AAAA-MM-JJ).'),
    until: date('Date d’expérience maximale (AAAA-MM-JJ).'),
    query: str('Mot ou expression cherchés dans le titre et le texte (pour une recherche classée par pertinence : search).', { maxLength: 200 }),
    include_archived: bool('Inclure les brouillons archivés.', { default: false }),
    limit: int('Nombre d’entrées (1 à 100).', { minimum: 1, maximum: 100, default: 25 }),
    offset: int('Décalage pour la page suivante.', { minimum: 0, default: 0 }),
  }),
  async handler(a, ctx) {
    const values = [ctx.user.id];
    const where = [`e.project_id IN ${visibleProjects('$1')}`];
    if (a.project_id) {
      await assertProject(ctx.user, a.project_id);
      values.push(a.project_id);
      where.push(`e.project_id = $${values.length}`);
    }
    if (!a.include_archived) where.push('NOT e.archived');
    if (a.status) { values.push(a.status); where.push(`e.status = $${values.length}`); }
    if (a.since) { values.push(a.since); where.push(`e.entry_date >= $${values.length}`); }
    if (a.until) { values.push(a.until); where.push(`e.entry_date <= $${values.length}`); }
    if (a.query) {
      values.push(`%${a.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where.push(`(e.title ILIKE $${values.length} OR e.plain_text ILIKE $${values.length})`);
    }
    values.push(a.limit + 1, a.offset);
    const { rows } = await query(
      `SELECT e.id, e.title, e.entry_date, e.status, e.project_id, p.name AS project_name, e.parent_entry_id,
              e.version_count, e.updated_at, u.display_name AS author, left(e.plain_text, 240) AS excerpt
       FROM entries e JOIN projects p ON p.id = e.project_id JOIN users u ON u.id = e.created_by
       WHERE ${where.join(' AND ')}
       ORDER BY e.entry_date DESC, e.created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const { items, next_offset } = page(rows, a.limit, a.offset);
    return { entries: items.map((e) => entryCard(ctx, e)), next_offset };
  },
});

define({
  name: 'get_entry',
  title: 'Lire une entrée',
  group: GROUP,
  scope: 'read',
  essential: true,
  http: { method: 'GET', path: '/entries/{entry_id}' },
  description: 'Lit une entrée : propriétés (titre, date, projet, auteur, statut, versions) et contenu en Markdown (tableaux, '
    + 'calculs, figures de gel, résultats statistiques et tubes cités compris), ou en texte brut, ou en JSON de l’éditeur. '
    + 'version : numéro d’une version figée, ou « last » ; sans : la copie de travail.',
  input: params({
    entry_id: uuid('Identifiant de l’entrée.'),
    version: str('Numéro de version figée, ou « last » (dernière). Sans : copie de travail.', { pattern: '^(\\d{1,6}|last)$', patternHint: 'un numéro ou « last ».' }),
    format: oneOf(['markdown', 'text', 'json'], 'markdown (par défaut), text (texte brut) ou json (document de l’éditeur).', { default: 'markdown' }),
  }, ['entry_id']),
  async handler(a, ctx) {
    await assertEntry(ctx.user, a.entry_id);
    const entry = await loadEntry(a.entry_id, ctx.user);
    const version = a.version ? await findVersion(entry, a.version) : null;
    const { rows: attachments } = await query(
      `SELECT id, sha256, filename, mime_type, size_bytes, created_at, derived_from FROM attachments
       WHERE entry_id = $1 AND ($2::timestamptz IS NULL OR created_at <= $2) ORDER BY created_at`,
      [entry.id, version?.created_at ?? null],
    );
    const source = version ?? entry;
    const out = {
      ...entryCard(ctx, { ...entry, author: entry.created_by_name }),
      title: source.title,
      date: isoDate(source.entry_date),
      locked_at: isoTime(entry.locked_at),
      locked_by: entry.locked_by_name,
      revision: entry.revision,
      parent: entry.parent ? { id: entry.parent.id, title: entry.parent.title } : undefined,
      addenda: entry.addenda?.map((x) => ({ id: x.id, title: x.title, date: isoDate(x.entry_date) })),
      version: version ? { number: version.version_number, kind: version.kind, note: version.note, created_at: isoTime(version.created_at), author: version.author, hash: version.hash } : undefined,
      attachments: attachments.map((f) => fileCard(ctx, f)),
    };
    if (a.format === 'json') out.content = source.content;
    else if (a.format === 'text') out.text = docToPlainText(source.content);
    else {
      out.markdown = markdownOnServer({
        entry, project: { name: entry.project_name }, version, author: version?.author, attachments, origin: ctx.origin ?? '',
      });
    }
    return compact(out);
  },
  text: (r) => (r.markdown ? `${r.markdown}\n\n(identifiant : ${r.id} ; statut : ${r.status} ; adresse : ${r.url})` : null),
});

define({
  name: 'list_entry_versions',
  title: 'Versions d’une entrée',
  group: GROUP,
  scope: 'read',
  http: { method: 'GET', path: '/entries/{entry_id}/versions' },
  description: 'Liste les versions figées d’une entrée (numéro, date, auteur, note, empreinte SHA-256 chaînée). '
    + 'Une version figée ne change plus ; la version de verrouillage (kind = lock) signe l’entrée.',
  input: params({ entry_id: uuid('Identifiant de l’entrée.') }, ['entry_id']),
  async handler(a, ctx) {
    await assertEntry(ctx.user, a.entry_id);
    const { rows } = await query(
      `SELECT v.version_number, v.kind, v.note, v.title, v.created_at, v.hash, v.prev_hash, u.display_name AS author
       FROM entry_versions v JOIN users u ON u.id = v.created_by WHERE v.entry_id = $1 ORDER BY v.version_number DESC`,
      [a.entry_id],
    );
    return { versions: rows.map((v) => compact({ ...v, created_at: isoTime(v.created_at) })) };
  },
});

define({
  name: 'verify_entry',
  title: 'Vérifier l’intégrité d’une entrée',
  group: GROUP,
  scope: 'read',
  http: { method: 'GET', path: '/entries/{entry_id}/verify' },
  description: 'Recalcule la chaîne d’empreintes des versions figées d’une entrée et relit ses fichiers joints : '
    + 'ok = true si rien n’a été altéré depuis qu’elles ont été figées.',
  input: params({ entry_id: uuid('Identifiant de l’entrée.') }, ['entry_id']),
  async handler(a, ctx) {
    await assertEntry(ctx.user, a.entry_id);
    return verifyEntry({ query }, a.entry_id);
  },
});

define({
  name: 'list_attachments',
  title: 'Fichiers joints d’une entrée',
  group: GROUP,
  scope: 'read',
  http: { method: 'GET', path: '/entries/{entry_id}/attachments' },
  description: 'Liste les fichiers joints à une entrée (nom, type, taille, SHA-256, adresse de téléchargement). '
    + 'Lire un fichier texte ou voir une image : get_attachment.',
  input: params({ entry_id: uuid('Identifiant de l’entrée.') }, ['entry_id']),
  async handler(a, ctx) {
    await assertEntry(ctx.user, a.entry_id);
    const { rows } = await query(
      'SELECT id, sha256, filename, mime_type, size_bytes, created_at, derived_from FROM attachments WHERE entry_id = $1 ORDER BY created_at',
      [a.entry_id],
    );
    return { attachments: rows.map((f) => fileCard(ctx, f)) };
  },
});

const TEXT_TYPES = /^(text\/|application\/(json|xml|csv|x-ndjson|x-yaml|yaml|x-fasta|x-genbank))/i;
const TEXT_EXT = /\.(txt|csv|tsv|json|md|markdown|fa|fasta|fna|faa|gb|gbk|genbank|ab1\.txt|log|xml|yaml|yml|seq|pdb|cif)$/i;
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)$/i;
const MAX_TEXT = 512 * 1024;
const MAX_IMAGE = 4 * 1024 * 1024;

define({
  name: 'get_attachment',
  title: 'Lire un fichier joint',
  group: GROUP,
  scope: 'read',
  http: { method: 'GET', path: '/attachments/{attachment_id}' },
  description: 'Lit un fichier joint : propriétés, et son contenu s’il est en texte (CSV, TXT, JSON, FASTA, GenBank…, 512 Ko au plus) '
    + 'ou une image (PNG, JPEG, GIF, WebP de 4 Mo au plus, montrée telle quelle à une IA qui voit les images). '
    + 'Les autres fichiers se téléchargent à l’adresse url (avec le jeton).',
  input: params({
    attachment_id: uuid('Identifiant du fichier joint.'),
    include_content: bool('Joindre le contenu (texte ou image).', { default: true }),
  }, ['attachment_id']),
  async handler(a, ctx) {
    const { rows: [f] } = await query(
      `SELECT a.id, a.entry_id, a.sha256, a.filename, a.mime_type, a.size_bytes, a.created_at, a.derived_from, e.project_id
       FROM attachments a JOIN entries e ON e.id = a.entry_id WHERE a.id = $1`,
      [a.attachment_id],
    );
    if (!f) throw notFound('Fichier');
    await assertProject(ctx.user, f.project_id);
    const out = { ...fileCard(ctx, f), entry_id: f.entry_id };
    if (!a.include_content) return out;
    const size = Number(f.size_bytes);
    if ((TEXT_TYPES.test(f.mime_type) || TEXT_EXT.test(f.filename)) && size <= MAX_TEXT) {
      out.content_text = await fs.promises.readFile(blobPath(f.sha256), 'utf8');
    } else if (IMAGE_TYPES.test(f.mime_type) && size <= MAX_IMAGE) {
      out.image = { mime_type: f.mime_type.toLowerCase().replace('jpg', 'jpeg'), base64: (await fs.promises.readFile(blobPath(f.sha256))).toString('base64') };
    } else {
      out.note = 'Contenu non joint (fichier binaire ou trop gros) : téléchargez-le à l’adresse url avec le jeton.';
    }
    return out;
  },
  text: (r) => {
    const { image, content_text: content, ...meta } = r;
    return `${JSON.stringify({ ...meta, ...(image ? { image: `${image.mime_type}, montrée ci-dessous` } : {}) })}${content ? `\n\n--- contenu de ${r.filename} ---\n${content}` : ''}`;
  },
  content: (r) => (r.image ? [{ type: 'image', data: r.image.base64, mimeType: r.image.mime_type }] : []),
});

// --- Écriture ------------------------------------------------------------------------------------------------

const markdownHelp = 'Markdown : titres (#), **gras**, *italique*, listes (- ou 1.), cases à cocher (- [ ] / - [x]), tableaux | a | b |, '
  + 'citations (>), blocs de code (```), liens [texte](https://…), images ![légende](/api/files/<id> d’un fichier joint).';

define({
  name: 'create_entry',
  title: 'Créer une entrée',
  group: GROUP,
  scope: 'write',
  essential: true,
  http: { method: 'POST', path: '/entries' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: `Crée une entrée (brouillon) dans un projet, vide, depuis un modèle (template_id, voir list_templates) et/ou avec un `
    + `contenu en Markdown ajouté à la fin. ${markdownHelp} Renvoie l’identifiant et l’adresse de l’entrée.`,
  input: params({
    project_id: uuid('Projet où ranger l’entrée (list_projects).'),
    title: str('Titre de l’entrée.', { minLength: 1, maxLength: 500 }),
    entry_date: date('Date de l’expérience (AAAA-MM-JJ). Par défaut : aujourd’hui.'),
    content_markdown: markdownParam('Contenu en Markdown.'),
    template_id: uuid('Modèle de départ (list_templates).'),
  }, ['project_id', 'title']),
  async handler(a, ctx) {
    const blocks = a.content_markdown ? markdownToBlocks(a.content_markdown) : [];
    const { id } = await createEntry(ctx.user, { ...a, blocks });
    const e = await loadEntry(id, ctx.user);
    return compact({ id, title: e.title, date: isoDate(e.entry_date), project: { id: e.project_id, name: e.project_name }, status: e.status, revision: e.revision, url: webUrl(ctx, `/entries/${id}`) });
  },
});

define({
  name: 'append_to_entry',
  title: 'Compléter une entrée',
  group: GROUP,
  scope: 'write',
  essential: true,
  http: { method: 'POST', path: '/entries/{entry_id}/append' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: `Ajoute du contenu en Markdown à la fin d’un brouillon (le reste n’est pas touché : encarts, figures, tableaux). `
    + `Une entrée verrouillée ne change plus : utiliser create_addendum. ${markdownHelp}`,
  input: params({
    entry_id: uuid('Identifiant de l’entrée (brouillon).'),
    content_markdown: markdownParam('Contenu à ajouter, en Markdown.'),
  }, ['entry_id', 'content_markdown']),
  async handler(a, ctx) {
    const blocks = markdownToBlocks(a.content_markdown);
    if (!blocks.length) throw new HttpError(400, 'Rien à ajouter : le Markdown est vide.');
    const r = await appendBlocks(ctx.user, a.entry_id, blocks, {
      lockedMessage: 'Entrée verrouillée (signée) : elle ne change plus. Ajoutez plutôt un addendum (create_addendum).',
    });
    return { entry_id: a.entry_id, appended_blocks: blocks.length, revision: r.revision, updated_at: isoTime(r.updated_at), url: webUrl(ctx, `/entries/${a.entry_id}`) };
  },
});

define({
  name: 'update_entry',
  title: 'Renommer, redater ou déplacer une entrée',
  group: GROUP,
  scope: 'write',
  http: { method: 'PATCH', path: '/entries/{entry_id}' },
  annotations: { destructiveHint: false, idempotentHint: true },
  description: 'Change le titre, la date d’expérience ou le projet d’un brouillon (pas son contenu : append_to_entry). '
    + 'Une entrée verrouillée ne change plus.',
  input: params({
    entry_id: uuid('Identifiant de l’entrée (brouillon).'),
    title: str('Nouveau titre.', { minLength: 1, maxLength: 500 }),
    entry_date: date('Nouvelle date d’expérience (AAAA-MM-JJ).'),
    project_id: uuid('Nouveau projet (où vous pouvez écrire).'),
  }, ['entry_id']),
  async handler(a, ctx) {
    await assertEntry(ctx.user, a.entry_id, { write: true });
    if (a.project_id) await assertProject(ctx.user, a.project_id, { write: true });
    const { rows: [before] } = await query('SELECT project_id, title, status FROM entries WHERE id = $1', [a.entry_id]);
    if (before.status === 'locked') throw new HttpError(409, 'Entrée verrouillée (signée) : elle ne change plus.');
    const moved = a.project_id && a.project_id !== before.project_id;
    const oldAudience = moved ? await projectAudience(null, before.project_id) : null;
    const { rows: [e] } = await query(
      `UPDATE entries SET title = COALESCE($2, title), entry_date = COALESCE($3::date, entry_date), project_id = COALESCE($4::uuid, project_id),
         revision = revision + 1, updated_at = now()
       WHERE id = $1 AND status = 'draft' RETURNING id, title, entry_date, project_id, revision`,
      [a.entry_id, a.title ?? null, a.entry_date ?? null, a.project_id ?? null],
    );
    if (!e) throw new HttpError(409, 'Entrée verrouillée (signée) : elle ne change plus.');
    if (moved) await emit(null, { type: 'entry.moved', id: e.id, projectId: before.project_id, audience: oldAudience, actor: ctx.user, data: { title: e.title } });
    await emit(null, { type: 'entry.updated', id: e.id, projectId: e.project_id, actor: ctx.user, data: { title: e.title, revision: e.revision } });
    return { id: e.id, title: e.title, date: isoDate(e.entry_date), project_id: e.project_id, revision: e.revision, url: webUrl(ctx, `/entries/${e.id}`) };
  },
});

define({
  name: 'freeze_entry_version',
  title: 'Figer une version',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/entries/{entry_id}/versions' },
  annotations: { destructiveHint: false, idempotentHint: true },
  description: 'Fige l’état actuel d’un brouillon dans une version datée et scellée (empreinte SHA-256 chaînée). '
    + 'Sans changement depuis la dernière version et sans note, rien n’est créé.',
  input: params({
    entry_id: uuid('Identifiant de l’entrée.'),
    note: str('Note de version (ex. « après élution »).', { maxLength: 500 }),
  }, ['entry_id']),
  async handler(a, ctx) {
    const r = await freezeEntryVersion(ctx.user, a.entry_id, a.note ?? '');
    return { unchanged: r.unchanged, version: compact({ number: r.version.version_number, created_at: isoTime(r.version.created_at), hash: r.version.hash, note: r.version.note }) };
  },
});

define({
  name: 'lock_entry',
  title: 'Verrouiller (signer) une entrée',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/entries/{entry_id}/lock' },
  annotations: { destructiveHint: true, idempotentHint: false },
  description: 'IRRÉVERSIBLE : fige une dernière version et verrouille l’entrée, qui ne pourra plus jamais être modifiée '
    + '(seulement complétée par des addenda). Ne le faire que si l’utilisateur l’a demandé explicitement ; confirm doit valoir true.',
  input: params({
    entry_id: uuid('Identifiant de l’entrée.'),
    confirm: { type: 'boolean', const: true, description: 'Doit valoir true : l’utilisateur a demandé le verrouillage.' },
    note: str('Note de la version de verrouillage.', { maxLength: 500 }),
  }, ['entry_id', 'confirm']),
  async handler(a, ctx) {
    await lockEntry(ctx.user, a.entry_id, a.note ?? '');
    const e = await loadEntry(a.entry_id, ctx.user);
    return { id: e.id, status: e.status, locked_at: isoTime(e.locked_at), versions: e.version_count, url: webUrl(ctx, `/entries/${e.id}`) };
  },
});

define({
  name: 'create_addendum',
  title: 'Ajouter un addendum',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/entries/{entry_id}/addendum' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: `Crée un addendum (nouvelle entrée liée, datée d’aujourd’hui) pour compléter ou corriger une entrée, en particulier `
    + `une entrée verrouillée, avec un contenu en Markdown. ${markdownHelp}`,
  input: params({
    entry_id: uuid('Entrée à compléter.'),
    content_markdown: markdownParam('Contenu de l’addendum, en Markdown.'),
  }, ['entry_id']),
  async handler(a, ctx) {
    const blocks = a.content_markdown ? markdownToBlocks(a.content_markdown) : [];
    const { id } = await createAddendum(ctx.user, a.entry_id, blocks);
    const e = await loadEntry(id, ctx.user);
    return { id, title: e.title, date: isoDate(e.entry_date), addendum_of: a.entry_id, url: webUrl(ctx, `/entries/${id}`) };
  },
});

const MIME_BY_EXT = {
  csv: 'text/csv', tsv: 'text/tab-separated-values', txt: 'text/plain', md: 'text/markdown', json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', fasta: 'text/plain', fa: 'text/plain', gb: 'text/plain', gbk: 'text/plain',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  tif: 'image/tiff', tiff: 'image/tiff', zip: 'application/zip',
};
const DISPLAYABLE = /^image\/(png|jpe?g|gif|webp)$/i;

define({
  name: 'add_attachment',
  title: 'Joindre un fichier',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/entries/{entry_id}/attachments' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: 'Joint un fichier à un brouillon : texte (content_text : CSV, résultats, script…) ou binaire en base64 (content_base64 : '
    + 'image, PDF…), 20 Mo au plus. insert = true l’ajoute aussi à la fin du contenu (image affichée, ou lien vers le fichier).',
  input: params({
    entry_id: uuid('Identifiant de l’entrée (brouillon).'),
    filename: str('Nom du fichier, avec son extension (ex. resultats.csv).', { minLength: 1, maxLength: 255 }),
    content_text: str('Contenu texte du fichier.', { maxLength: 20_000_000, trim: false }),
    content_base64: str('Contenu binaire encodé en base64.', { maxLength: 28_000_000 }),
    mime_type: str('Type MIME (deviné d’après l’extension sinon).', { maxLength: 120 }),
    insert: bool('Ajouter aussi le fichier à la fin du contenu de l’entrée.', { default: false }),
  }, ['entry_id', 'filename']),
  async handler(a, ctx) {
    if ((a.content_text === undefined) === (a.content_base64 === undefined)) {
      throw new HttpError(400, 'Donnez le contenu du fichier : content_text (texte) ou content_base64 (binaire), l’un des deux.');
    }
    const data = a.content_text !== undefined ? Buffer.from(a.content_text, 'utf8') : Buffer.from(a.content_base64.replace(/^data:[^,]*,/, ''), 'base64');
    const max = Math.min(config.maxUploadMb, 20) * 1024 * 1024;
    if (!data.length) throw new HttpError(400, 'Fichier vide.');
    if (data.length > max) throw new HttpError(413, `Fichier trop volumineux (${Math.round(max / 1048576)} Mo au plus par cette voie).`);
    const filename = path.basename(a.filename.replace(/\\/g, '/')).replace(/[\u0000-\u001f]/g, '') || 'fichier';
    const ext = /\.([^.]+)$/.exec(filename)?.[1]?.toLowerCase();
    const mimetype = a.mime_type || MIME_BY_EXT[ext] || (a.content_text !== undefined ? 'text/plain' : 'application/octet-stream');
    const tmp = path.join(tmpDir, `api-${crypto.randomUUID()}`);
    await fs.promises.writeFile(tmp, data);
    const att = await addAttachment(ctx.user, a.entry_id, { path: tmp, filename, mimetype, size: data.length });
    let inserted = false;
    if (a.insert) {
      const src = `/api/files/${att.id}`;
      const node = DISPLAYABLE.test(mimetype)
        ? { type: 'image', attrs: { src, alt: filename, title: null } }
        : { type: 'paragraph', content: [{ type: 'text', text: filename, marks: [{ type: 'link', attrs: { href: src, target: '_blank', rel: 'noopener noreferrer nofollow', class: null } }] }] };
      await appendBlocks(ctx.user, a.entry_id, [node]);
      inserted = true;
    }
    return { ...fileCard(ctx, att), entry_id: a.entry_id, inserted };
  },
});
