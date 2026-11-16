// Export Markdown : un fichier .md seul (liens vers le serveur) ou un zip avec les fichiers joints à côté
// (liens relatifs : le dossier s'ouvre tel quel dans Obsidian ou n'importe quel éditeur Markdown).
import fs from 'node:fs';
import { ZipArchive } from 'archiver';
import { blobPath } from './storage.js';
import { entryToMarkdown, safeFileName } from './markdown.js';

const FILE_REF = /^\/api\/files\/([0-9a-f-]{36})/;

/** Nom d'un fichier joint dans le zip : début de son identifiant (unicité) puis son nom d'origine. */
export function attachmentName(a) {
  const dot = a.filename.lastIndexOf('.');
  const ext = dot > 0 ? a.filename.slice(dot + 1).replace(/[^\w]/g, '').slice(0, 12) : '';
  const base = safeFileName(dot > 0 ? a.filename.slice(0, dot) : a.filename, 'fichier');
  return `${a.id.slice(0, 8)} ${base}${ext ? `.${ext}` : ''}`;
}

/** Nom d'une entrée : date puis titre (tri chronologique dans un dossier). */
export const entryFileBase = (source) => `${source.entry_date} ${safeFileName(source.title)}`;

/** .md seul : les fichiers restent sur le serveur (il faut être connecté pour les ouvrir). */
export function markdownOnServer({ origin, ...data }) {
  const rewriteUrl = (u) => (FILE_REF.test(u) ? origin + u : u);
  return entryToMarkdown({ ...data, rewriteUrl, fileLink: (a) => `${origin}/api/files/${a.id}` });
}

/**
 * .md accompagné de ses fichiers (dossier prefix, relatif au .md). Un fichier d'une autre entrée cité dans le
 * contenu reste un lien vers le serveur.
 */
export function markdownWithFiles({ origin, prefix = 'fichiers/', attachments = [], ...data }) {
  const local = new Map(attachments.map((a) => [a.id, attachmentName(a)]));
  const rewriteUrl = (u) => {
    const m = FILE_REF.exec(u);
    if (!m) return u;
    return local.has(m[1]) ? prefix + local.get(m[1]) : origin + u;
  };
  const md = entryToMarkdown({ ...data, attachments, rewriteUrl, fileLink: (a) => prefix + local.get(a.id) });
  return { md, files: attachments.map((a) => ({ path: blobPath(a.sha256), name: local.get(a.id) })) };
}

/** Téléchargement sous ce nom, accents compris (filename* en UTF-8, repli ASCII pour les vieux navigateurs). */
export function setDownload(res, name, type) {
  const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]|["\\]/g, '_');
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  res.set('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`);
  res.type(type);
}

/** Envoie un zip construit par fill(archive, addFile). */
export async function sendZip(res, filename, fill) {
  setDownload(res, filename, 'application/zip');
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('warning', (err) => console.warn('Export Markdown :', err.message));
  archive.on('error', (err) => {
    console.error('Export Markdown interrompu :', err);
    res.destroy(err);
  });
  archive.pipe(res);
  const added = new Set();
  const addFile = (path, name) => {
    if (added.has(name) || !fs.existsSync(path)) return;
    added.add(name);
    archive.file(path, { name });
  };
  await fill(archive, addFile);
  await archive.finalize();
}

/** Nom unique dans un dossier (deux entrées du même jour au même titre). */
export function uniqueName(used, base) {
  let name = base;
  for (let k = 2; used.has(name.toLowerCase()); k += 1) name = `${base} (${k})`;
  used.add(name.toLowerCase());
  return name;
}

/** Adresse du serveur vue par le navigateur, pour les liens d'un .md seul. */
export const originOf = (req) => `${req.protocol}://${req.get('host')}`;
