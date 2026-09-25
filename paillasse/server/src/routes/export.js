import fs from 'node:fs';
import { Router } from 'express';
import { ZipArchive } from 'archiver';
import { query } from '../db.js';
import { visibleProjectIds } from '../lib/access.js';
import { renderEntryPage } from '../lib/render.js';
import { blobPath } from '../lib/storage.js';
import { toGenbank } from '../lib/seq/genbank.js';
import { SAMPLE_TYPES, locationText, positionLabel, unitPath } from '../lib/inventory.js';

const router = Router();

const slug = (s) =>
  String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 60).toLowerCase() || 'entree';

const README = `Export Paillasse
================

data.json      Les données : projets, modèles, entrées, versions figées
               (avec leurs empreintes SHA-256 chaînées) et pièces jointes.
               Export personnel : vos projets et ceux où vous avez accepté une invitation,
               plus ce qui appartient à tout le labo (champ scope = "visible").
               Export complet depuis la page Maintenance : tout (scope = "all").
entries/       Chaque entrée en HTML autonome, lisible dans n'importe quel navigateur.
               Une entrée verrouillée est rendue depuis sa version de verrouillage.
files/         Les pièces jointes, nommées <id>_<nom d'origine>.
               Leur SHA-256 figure dans data.json (champ attachments[].sha256).
               Une image retouchée est un fichier à part : derived_from désigne
               l'original (toujours présent) et edit_params liste les retouches.

sequences/     Chaque séquence du registre en GenBank (copie de travail), ses versions
               figées (versions/) et les fichiers importés d'origine (originaux/).
               Données complètes au format paillasse-seq/1 dans data.json (rubrique sequences).
tableaux/      Les images des tableaux de post-it (post-it et fils dans data.json, rubrique boards).
stockage.csv   Chaque tube en place : code, nom, emplacement complet (appareil › étagère › rack › boîte › position).

Vérifier un fichier :  sha256sum files/<fichier>
`;

/** Tubes en place, au format CSV (séparateur ; et BOM : Excel l'ouvre tel quel). */
export function storageCsv(units, samples) {
  const byId = new Map(units.map((u) => [u.id, u]));
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Code', 'Nom', 'Type', 'Emplacement', 'Position', 'Concentration', 'Volume', 'Aliquot', 'Congelé le', 'Périme le', 'Décongélations', 'Sorti du froid'];
  const rows = samples.filter((s) => !s.archived).map((s) => [
    s.code, s.name, SAMPLE_TYPES[s.type]?.label ?? s.type, s.unit_id ? locationText(unitPath(byId, s.unit_id)) : '', positionLabel(byId.get(s.unit_id), s.row, s.col),
    s.concentration, s.volume, s.aliquot, s.frozen_on ?? '', s.expires_on ?? '', s.thaw_count, s.status === 'out' ? 'oui' : '',
  ]);
  return `\uFEFF${[head, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}\r\n`;
}

// Export : ne dépend pas de l'application pour être relu. Chacun exporte ce qu'il voit (ses projets, ceux où il
// est membre, ce qui est au labo) ; un administrateur peut tout exporter (?all=1, depuis la page Maintenance).
router.get('/', async (req, res) => {
  const all = Boolean(req.user.is_admin) && req.query.all === '1';
  const visible = all ? null : await visibleProjectIds(req.user.id);
  const inProject = (id) => !visible || visible.has(id);
  const [allProjects, templates, allEntries, allVersions, allAttachments, users, allNotes, allLinks, allImages,
    allSequences, allSequenceVersions, allSequenceFiles, storageUnits, samples, sampleEvents, allMembers] = await Promise.all([
    query(`SELECT id, name, description, color, archived, created_by, created_at, updated_at
           FROM projects ORDER BY created_at`),
    query('SELECT * FROM templates ORDER BY created_at'),
    query(`SELECT id, project_id, parent_entry_id, title, entry_date, status, content, plain_text,
                  revision, version_count, last_version_hash, locked_at, locked_by, archived,
                  created_by, created_at, updated_at
           FROM entries ORDER BY entry_date, created_at`),
    query('SELECT * FROM entry_versions ORDER BY entry_id, version_number'),
    query('SELECT * FROM attachments ORDER BY created_at'),
    query('SELECT id, username, display_name, created_at FROM users'),
    query('SELECT * FROM board_notes WHERE deleted_at IS NULL ORDER BY project_id, z'),
    query('SELECT id, project_id, from_note, to_note, created_at FROM board_links WHERE deleted_at IS NULL'),
    query('SELECT * FROM board_images ORDER BY created_at'),
    query('SELECT * FROM sequences ORDER BY code'),
    query('SELECT * FROM sequence_versions ORDER BY sequence_id, version_number'),
    query('SELECT * FROM sequence_files ORDER BY created_at'),
    query('SELECT * FROM storage_units ORDER BY created_at'),
    query('SELECT * FROM samples ORDER BY code'),
    query('SELECT * FROM sample_events ORDER BY sample_id, created_at'),
    query('SELECT project_id, user_id, status, invited_by, invited_at, responded_at FROM project_members ORDER BY project_id, invited_at'),
  ]).then((results) => results.map((r) => r.rows));

  const projects = allProjects.filter((p) => inProject(p.id));
  const entries = allEntries.filter((e) => inProject(e.project_id));
  const entryIds = new Set(entries.map((e) => e.id));
  const versions = allVersions.filter((v) => entryIds.has(v.entry_id));
  const attachments = allAttachments.filter((a) => entryIds.has(a.entry_id));
  const boardNotes = allNotes.filter((n) => inProject(n.project_id));
  const boardLinks = allLinks.filter((l) => inProject(l.project_id));
  const boardImages = allImages.filter((i) => inProject(i.project_id));
  const sequences = allSequences.filter((q) => !q.project_id || inProject(q.project_id));
  const sequenceIds = new Set(sequences.map((q) => q.id));
  const sequenceVersions = allSequenceVersions.filter((v) => sequenceIds.has(v.sequence_id));
  const sequenceFiles = allSequenceFiles.filter((f) => sequenceIds.has(f.sequence_id));
  const members = allMembers.filter((m) => inProject(m.project_id));

  const fileNames = new Map(attachments.map((a) => [a.id, `${a.id}_${a.filename.replace(/[/\\]/g, '_')}`]));
  const rewriteUrl = (url) => {
    const m = /^\/api\/files\/([0-9a-f-]{36})/.exec(url);
    return m && fileNames.has(m[1]) ? `../files/${encodeURIComponent(fileNames.get(m[1]))}` : url;
  };
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const lastVersion = new Map();
  for (const v of versions) lastVersion.set(v.entry_id, v);

  const stamp = new Date().toISOString().slice(0, 10);
  res.attachment(`paillasse-export-${all ? 'complet-' : ''}${stamp}.zip`);
  const archive = new ZipArchive({ zlib: { level: 6 } });
  archive.on('warning', (err) => console.warn('Export :', err.message));
  archive.on('error', (err) => {
    console.error('Export interrompu :', err);
    res.destroy(err);
  });
  archive.pipe(res);

  archive.append(README, { name: 'LISEZMOI.txt' });
  archive.append(
    JSON.stringify({
      exported_at: new Date().toISOString(), format: 'paillasse/1', scope: all ? 'all' : 'visible', exported_by: req.user.username,
      users, projects, project_members: members, templates, entries, versions, attachments,
      boards: { notes: boardNotes, links: boardLinks, images: boardImages },
      sequences: { format: 'paillasse-seq/1', working_copies: sequences, versions: sequenceVersions, original_files: sequenceFiles },
      storage: { units: storageUnits, samples, events: sampleEvents },
    }, null, 2),
    { name: 'data.json' },
  );
  // Où est chaque tube, lisible sans l'application (tableur)
  archive.append(storageCsv(storageUnits, samples), { name: 'stockage.csv' });
  for (const e of entries) {
    const version = e.status === 'locked' ? lastVersion.get(e.id) : null;
    const html = renderEntryPage({
      entry: e, project: projectById.get(e.project_id), version,
      author: version ? userById.get(version.created_by)?.display_name : null, rewriteUrl,
    });
    const archivedTag = e.archived ? '_archivee' : '';
    archive.append(html, { name: `entries/${e.entry_date}_${slug(e.title)}_${e.id.slice(0, 8)}${archivedTag}.html` });
  }
  for (const a of attachments) {
    const p = blobPath(a.sha256);
    if (fs.existsSync(p)) archive.file(p, { name: `files/${fileNames.get(a.id)}` });
  }
  // Chaque séquence en GenBank (copie de travail + chaque version figée) et ses fichiers d'origine
  for (const seq of sequences) {
    const base = `${seq.code}_${seq.name}`.replace(/[^\w.-]+/g, '_').slice(0, 100);
    archive.append(toGenbank(seq), { name: `sequences/${base}.gb` });
    for (const v of sequenceVersions.filter((x) => x.sequence_id === seq.id)) {
      archive.append(toGenbank({ ...v, description: v.description || v.name }), { name: `sequences/versions/${base}_v${v.version_number}.gb` });
    }
  }
  for (const f of sequenceFiles) {
    const p = blobPath(f.sha256);
    if (fs.existsSync(p)) archive.file(p, { name: `sequences/originaux/${f.id}_${f.filename.replace(/[/\\]/g, '_')}` });
  }
  for (const img of boardImages) {
    const p = blobPath(img.sha256);
    if (fs.existsSync(p)) archive.file(p, { name: `tableaux/${img.id}_${img.filename.replace(/[/\\]/g, '_')}` });
  }
  await archive.finalize();
});

export default router;
