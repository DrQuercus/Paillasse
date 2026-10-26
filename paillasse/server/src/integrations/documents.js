// Export « documents » : tout ce qu'un compte voit, un document par objet, pour l'indexer dans une IA locale
// (recherche sémantique, RAG) ou un autre outil. Un document = { id, type, title, url, updated_at, text, metadata }.
// Le texte est en Markdown (entrées, modèles) ou en texte structuré (séquences, tubes, jeux de données, projets).
import { query } from '../db.js';
import { visibleProjectIds, visibleProjects } from '../lib/access.js';
import { HttpError } from '../lib/errors.js';
import { docToMarkdown } from '../lib/markdown.js';
import { markdownOnServer } from '../lib/markdownExport.js';
import { SAMPLE_TYPES } from '../lib/inventory.js';
import { gcPercent, segmentLength } from '../lib/seq/model.js';
import { KIND_LABELS } from '../lib/stat.js';
import { SAMPLE_SELECT, loadUnits, withLocation } from '../routes/inventory.js';
import { lastEventId } from './events.js';

export const DOCUMENT_TYPES = ['entries', 'sequences', 'samples', 'datasets', 'templates', 'projects'];
const BATCH = 100;
const frontMatter = /^---\n[\s\S]*?\n---\n+/;
const iso = (d) => (d ? new Date(d).toISOString() : null);
const day = (d) => (d ? (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toLocaleDateString('sv-SE')) : null);

/** Lit une table par lots (ordre stable updated_at, id), sans tout charger en mémoire. */
async function* batches(sql, params) {
  let after = null;
  for (;;) {
    const { rows } = await query(
      `${sql} AND ($${params.length + 1}::timestamptz IS NULL OR (x.updated_at, x.id) > ($${params.length + 1}::timestamptz, $${params.length + 2}::uuid))
       ORDER BY x.updated_at, x.id LIMIT ${BATCH}`,
      [...params, after?.updated_at ?? null, after?.id ?? null],
    );
    if (!rows.length) return;
    yield rows;
    if (rows.length < BATCH) return;
    after = rows.at(-1);
  }
}

async function* entryDocs(user, since, origin) {
  const sql = `SELECT x.*, p.name AS project_name, u.display_name AS created_by_name, lu.display_name AS locked_by_name,
                      par.id AS parent_id, par.title AS parent_title, par.entry_date AS parent_date
               FROM entries x JOIN projects p ON p.id = x.project_id JOIN users u ON u.id = x.created_by
               LEFT JOIN users lu ON lu.id = x.locked_by
               LEFT JOIN entries par ON par.id = x.parent_entry_id AND par.project_id IN ${visibleProjects('$1')}
               WHERE NOT x.archived AND x.project_id IN ${visibleProjects('$1')} AND ($2::timestamptz IS NULL OR x.updated_at >= $2)`;
  for await (const rows of batches(sql, [user.id, since])) {
    const { rows: files } = await query(
      'SELECT id, entry_id, sha256, filename, size_bytes, created_at FROM attachments WHERE entry_id = ANY($1) ORDER BY created_at',
      [rows.map((e) => e.id)],
    );
    for (const e of rows) {
      const attachments = files.filter((f) => f.entry_id === e.id);
      const entry = { ...e, parent: e.parent_id ? { title: e.parent_title, entry_date: e.parent_date } : null };
      const md = markdownOnServer({ entry, project: { name: e.project_name }, attachments, origin });
      yield {
        id: e.id, type: 'entry', title: e.title, url: `${origin}/entries/${e.id}`, created_at: iso(e.created_at), updated_at: iso(e.updated_at),
        text: md.replace(frontMatter, ''),
        metadata: {
          date: day(e.entry_date), project: e.project_name, project_id: e.project_id, author: e.created_by_name,
          status: e.status === 'locked' ? 'verrouillée' : 'brouillon', versions: e.version_count, locked_at: iso(e.locked_at),
          locked_by: e.locked_by_name ?? null, addendum_of: e.parent_entry_id, attachments: attachments.length,
        },
      };
    }
  }
}

async function* sequenceDocs(user, since, origin) {
  const sql = `SELECT x.*, p.name AS project_name FROM sequences x LEFT JOIN projects p ON p.id = x.project_id
               WHERE NOT x.archived AND (x.project_id IS NULL OR x.project_id IN ${visibleProjects('$1')}) AND ($2::timestamptz IS NULL OR x.updated_at >= $2)`;
  for await (const rows of batches(sql, [user.id, since])) {
    for (const s of rows) {
      const n = s.sequence.length;
      const lines = [`# ${s.code} ${s.name}`, ''];
      if (s.description) lines.push(s.description, '');
      lines.push(`Longueur : ${n} pb, ${s.circular ? 'circulaire' : 'linéaire'}, GC ${gcPercent(s.sequence)} %.${s.project_name ? ` Projet : ${s.project_name}.` : ''}`);
      if (s.origin?.method === 'pcr') lines.push('', `Obtenue par PCR sur ${s.origin.template?.code} ${s.origin.template?.name} (version ${s.origin.template?.version}), amorces ${(s.origin.primers ?? []).map((p) => p.name).join(' et ')}.`);
      if (s.features?.length) {
        lines.push('', '## Annotations', '');
        for (const f of s.features.slice(0, 300)) {
          const segs = f.segments ?? [];
          const len = segs.reduce((t, x) => t + segmentLength(x, n), 0);
          lines.push(`- ${f.name || '(sans nom)'} (${f.type}) ${segs.length ? `${segs[0].start + 1}..${segs.at(-1).end + 1}` : ''} ${f.strand === -1 ? 'brin −' : f.strand === 1 ? 'brin +' : ''}, ${len} pb`.replace(/\s+,/, ','));
        }
      }
      if (s.primers?.length) {
        lines.push('', '## Amorces', '');
        for (const p of s.primers.slice(0, 200)) lines.push(`- ${p.name || '(sans nom)'} : ${p.bases}`);
      }
      yield {
        id: s.id, type: 'sequence', title: `${s.code} ${s.name}`, url: `${origin}/sequences/${s.id}`, created_at: iso(s.created_at), updated_at: iso(s.updated_at),
        text: lines.join('\n'),
        metadata: { code: s.code, name: s.name, length: n, circular: s.circular, project: s.project_name ?? null, project_id: s.project_id, versions: s.version_count },
      };
    }
  }
}

async function* sampleDocs(user, since, origin) {
  const { byId } = await loadUnits();
  const visible = await visibleProjectIds(user.id);
  const located = withLocation(byId, visible);
  const sql = `${SAMPLE_SELECT.replace('FROM samples s', 'FROM samples x').replace(/\bs\./g, 'x.')} WHERE NOT x.archived AND ($1::timestamptz IS NULL OR x.updated_at >= $1)`;
  for await (const rows of batches(sql, [since])) {
    for (const raw of rows) {
      const s = located(raw);
      const facts = [
        ['Type', SAMPLE_TYPES[s.type]?.label ?? s.type], ['Emplacement', s.location || 'hors stockage'],
        ['Statut', s.status === 'out' ? 'sorti du froid' : 'rangé'], ['Concentration', s.concentration], ['Volume', s.volume],
        ['Aliquot', s.aliquot], ['Congelé le', day(s.frozen_on)], ['Périme le', day(s.expires_on)],
        ['Décongélations', s.thaw_count || null], ['Propriétaire', s.owner_name], ['Projet', s.project_name],
        ['Séquence', s.sequence_id ? `${s.sequence_code ?? ''} ${s.sequence_name ?? ''}`.trim() : null],
        ['Entrée', s.entry_id ? s.entry_title : null], ['Notes', s.notes],
      ].filter(([, v]) => v !== null && v !== undefined && v !== '');
      yield {
        id: s.id, type: 'sample', title: `${s.code} ${s.name}`, url: `${origin}/storage?sample=${s.id}`, created_at: iso(s.created_at), updated_at: iso(s.updated_at),
        text: [`# ${s.code} ${s.name}`, '', ...facts.map(([k, v]) => `- ${k} : ${v}`)].join('\n'),
        metadata: { code: s.code, sample_type: s.type, location: s.location, position: s.position, status: s.status },
      };
    }
  }
}

async function* datasetDocs(user, since, origin) {
  const sql = `SELECT x.*, p.name AS project_name FROM datasets x LEFT JOIN projects p ON p.id = x.project_id
               WHERE NOT x.archived AND (x.project_id IS NULL OR x.project_id IN ${visibleProjects('$1')}) AND ($2::timestamptz IS NULL OR x.updated_at >= $2)`;
  for await (const rows of batches(sql, [user.id, since])) {
    for (const d of rows) {
      const cols = d.data?.columns ?? [];
      const head = ['', ...cols.map((c) => c.name)];
      const body = (d.data?.rows ?? []).slice(0, 2000).map((r) => [r.label || r.x || '', ...cols.map((c) => (r.v?.[c.id] ?? []).filter((x) => x !== '').join(' / '))]);
      yield {
        id: d.id, type: 'dataset', title: d.title || 'Sans titre', url: `${origin}/stats/${d.id}`, created_at: iso(d.created_at), updated_at: iso(d.updated_at),
        text: [`# ${d.title || 'Sans titre'}`, '', `Tableau ${KIND_LABELS[d.kind] ?? d.kind}${d.project_name ? `, projet ${d.project_name}` : ''}.`, '',
          ...[head, ...body].map((r) => r.join(' ; '))].join('\n'),
        metadata: { kind: d.kind, project: d.project_name ?? null, project_id: d.project_id, rows: (d.data?.rows ?? []).length, columns: cols.length },
      };
    }
  }
}

async function* templateDocs(_user, since, origin) {
  const sql = `SELECT x.* FROM templates x WHERE NOT x.archived AND ($1::timestamptz IS NULL OR x.updated_at >= $1)`;
  for await (const rows of batches(sql, [since])) {
    for (const t of rows) {
      yield {
        id: t.id, type: 'template', title: t.name, url: `${origin}/templates/${t.id}`, created_at: iso(t.created_at), updated_at: iso(t.updated_at),
        text: [`# Modèle : ${t.name}`, '', t.description, '', docToMarkdown(t.content)].filter((x, k, a) => x !== '' || a[k - 1] !== '').join('\n'),
        metadata: { category: t.category, builtin: Boolean(t.slug) },
      };
    }
  }
}

async function* projectDocs(user, since, origin) {
  const sql = `SELECT x.*, u.display_name AS owner_name,
                      (SELECT count(*) FROM entries e WHERE e.project_id = x.id AND NOT e.archived)::int AS entries
               FROM projects x JOIN users u ON u.id = x.created_by
               WHERE x.id IN ${visibleProjects('$1')} AND ($2::timestamptz IS NULL OR x.updated_at >= $2)`;
  for await (const rows of batches(sql, [user.id, since])) {
    for (const p of rows) {
      yield {
        id: p.id, type: 'project', title: p.name, url: `${origin}/projects/${p.id}`, created_at: iso(p.created_at), updated_at: iso(p.updated_at),
        text: [`# Projet : ${p.name}`, '', p.description || '(sans description)', '', `Propriétaire : ${p.owner_name}. ${p.entries} entrée(s).${p.archived ? ' Archivé.' : ''}`].join('\n'),
        metadata: { owner: p.owner_name, entries: p.entries, archived: p.archived },
      };
    }
  }
}

const SOURCES = { entries: entryDocs, sequences: sequenceDocs, samples: sampleDocs, datasets: datasetDocs, templates: templateDocs, projects: projectDocs };

export async function* documents(user, { types = DOCUMENT_TYPES, since = null, origin = '' } = {}) {
  for (const t of types) yield* SOURCES[t](user, since, origin);
}

/** GET /api/v1/documents : flux NDJSON (par défaut) ou page JSON. */
export async function documentsRoute(req, res) {
  const raw = req.query.types ?? req.query.type;
  const types = raw ? [].concat(raw).flatMap((x) => String(x).split(',')).map((x) => x.trim()).filter(Boolean) : DOCUMENT_TYPES;
  const unknown = types.filter((t) => !DOCUMENT_TYPES.includes(t));
  if (unknown.length) throw new HttpError(400, `Types inconnus : ${unknown.join(', ')} (possibles : ${DOCUMENT_TYPES.join(', ')}).`);
  const since = req.query.since ? new Date(String(req.query.since)) : null;
  if (since && Number.isNaN(since.getTime())) throw new HttpError(400, 'since : date ISO attendue.');
  const origin = `${req.protocol}://${req.get('host')}`;
  // Curseur du flux de changements à reprendre après cet export (rien ne se perd entre les deux)
  const cursor = await lastEventId();
  res.set('X-Paillasse-Cursor', String(cursor));
  const docs = documents(req.user, { types, since, origin });
  if (req.query.format === 'json') {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const offset = Math.max(0, Math.trunc(Number(req.query.offset) || 0));
    const out = [];
    let k = 0;
    for await (const d of docs) {
      if (k >= offset && out.length <= limit) out.push(d);
      k += 1;
      if (out.length > limit) break;
    }
    const more = out.length > limit;
    return res.json({ documents: out.slice(0, limit), next_offset: more ? offset + limit : null, cursor });
  }
  res.type('application/x-ndjson; charset=utf-8');
  // Client parti en route : on arrête de lire la base (sans attendre un « drain » qui ne viendra pas)
  let gone = false;
  res.on('close', () => { gone = true; });
  for await (const d of docs) {
    if (gone) return;
    if (!res.write(`${JSON.stringify(d)}\n`)) {
      await new Promise((resolve) => {
        res.once('drain', resolve);
        res.once('close', resolve);
      });
    }
  }
  res.end();
}
