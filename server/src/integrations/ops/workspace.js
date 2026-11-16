// Vue d'ensemble du cahier : qui je suis, projets, recherche dans tout le cahier, activité récente,
// flux de changements (synchronisation d'un index, d'une IA, d'un tableur).
import { query } from '../../db.js';
import { assertProject, visibleProjects } from '../../lib/access.js';
import { loadProject, listProjects, createProject, members } from '../../routes/projects.js';
import { searchEntries } from '../../routes/search.js';
import { listSequences } from '../../routes/sequences.js';
import { searchSamples } from '../../routes/inventory.js';
import { listDatasets } from '../../routes/datasets.js';
import { EVENT_TYPES, eventView, visibleEvent } from '../events.js';
import { unlinkedMessage } from '../assistant.js';
import { define } from '../registry.js';
import { bool, int, list, oneOf, params, str, uuid } from '../schema.js';
import { compact, isoDate, isoTime, webUrl } from './common.js';

const PKG_VERSION = '0.1.0';

define({
  name: 'whoami',
  title: 'Qui suis-je',
  group: 'Cahier',
  scope: 'read',
  http: { method: 'GET', path: '/me' },
  allowUnlinked: true,
  description: 'Qui est la personne pour Paillasse : son compte, ce que l’accès lui permet (lecture seule, ou lecture et écriture), '
    + 'ses projets, et des conseils. À appeler en premier pour s’orienter, ou quand elle demande à quoi elle a accès.',
  input: params({}),
  async handler(_a, ctx) {
    if (!ctx.user) {
      return { linked: false, assistant_account: compact({ email: ctx.assistant?.email, name: ctx.assistant?.name }), message: unlinkedMessage(ctx.assistant) };
    }
    const projects = await listProjects(ctx.user);
    const { rows: [counts] } = await query(
      `SELECT (SELECT count(*) FROM entries WHERE NOT archived AND project_id IN ${visibleProjects('$1')})::int AS entries,
              (SELECT count(*) FROM sequences WHERE NOT archived AND (project_id IS NULL OR project_id IN ${visibleProjects('$1')}))::int AS sequences,
              (SELECT count(*) FROM samples WHERE NOT archived)::int AS samples`,
      [ctx.user.id],
    );
    return {
      user: { id: ctx.user.id, username: ctx.user.username, name: ctx.user.display_name },
      access: ctx.token
        ? { via: ctx.token.kind === 'assistant' ? 'assistant' : 'jeton', token: ctx.token.name, scope: ctx.token.scope === 'write' ? 'lecture et écriture' : 'lecture seule' }
        : { via: 'session' },
      server: { name: 'Paillasse', kind: 'cahier de laboratoire électronique', version: PKG_VERSION, url: webUrl(ctx, '/') },
      counts: { projects: projects.length, ...counts },
      projects: projects.map((p) => ({ id: p.id, name: p.name, role: p.role, entries: p.entry_count })),
      tips: [
        'search cherche dans tout le cahier (entrées, séquences, tubes, jeux de données, modèles, projets).',
        'get_entry renvoie une entrée en Markdown, prête à résumer ou citer ; donnez son adresse (url) à l’utilisateur.',
        'Les entrées verrouillées ne changent plus : on les complète par un addendum (create_addendum).',
        'Les codes SEQ-0001 (séquences) et ECH-0001 (tubes) servent d’identifiants partout.',
      ],
    };
  },
});

// --- Projets ---------------------------------------------------------------------------------------------------

define({
  name: 'list_projects',
  title: 'Lister les projets',
  group: 'Projets',
  scope: 'read',
  http: { method: 'GET', path: '/projects' },
  description: 'Liste les projets visibles (les vôtres et ceux où vous avez accepté une invitation) avec leur nombre d’entrées '
    + 'et la date de la dernière.',
  input: params({ include_archived: bool('Inclure les projets archivés.', { default: false }) }),
  async handler(a, ctx) {
    const rows = await listProjects(ctx.user, { archived: a.include_archived });
    return {
      projects: rows.map((p) => compact({
        id: p.id, name: p.name, description: p.description, archived: p.archived || undefined, role: p.role, owner: p.owner_name,
        members: p.member_count, entries: p.entry_count, last_entry_date: isoDate(p.last_entry_date), url: webUrl(ctx, `/projects/${p.id}`),
      })),
    };
  },
});

define({
  name: 'get_project',
  title: 'Détail d’un projet',
  group: 'Projets',
  scope: 'read',
  http: { method: 'GET', path: '/projects/{project_id}' },
  description: 'Détail d’un projet : description, propriétaire et membres, nombre d’entrées (brouillons, verrouillées), '
    + 'séquences et jeux de données rattachés, dernières entrées.',
  input: params({ project_id: uuid('Identifiant du projet.') }, ['project_id']),
  async handler(a, ctx) {
    const p = await loadProject(a.project_id, ctx.user);
    const [team, { rows: [c] }, { rows: recent }] = await Promise.all([
      members(p.id),
      query(
        `SELECT count(*) FILTER (WHERE NOT archived)::int AS entries,
                count(*) FILTER (WHERE NOT archived AND status = 'draft')::int AS drafts,
                count(*) FILTER (WHERE status = 'locked')::int AS locked,
                (SELECT count(*) FROM sequences WHERE project_id = $1 AND NOT archived)::int AS sequences,
                (SELECT count(*) FROM datasets WHERE project_id = $1 AND NOT archived)::int AS datasets
         FROM entries WHERE project_id = $1`,
        [p.id],
      ),
      query(
        `SELECT id, title, entry_date, status FROM entries WHERE project_id = $1 AND NOT archived
         ORDER BY entry_date DESC, created_at DESC LIMIT 10`,
        [p.id],
      ),
    ]);
    return compact({
      id: p.id, name: p.name, description: p.description, archived: p.archived || undefined, role: p.role, owner: p.owner_name,
      members: team.filter((m) => m.status !== 'declined').map((m) => ({ name: m.display_name, status: m.status })),
      counts: c,
      recent_entries: recent.map((e) => ({ id: e.id, title: e.title, date: isoDate(e.entry_date), status: e.status, url: webUrl(ctx, `/entries/${e.id}`) })),
      url: webUrl(ctx, `/projects/${p.id}`),
    });
  },
});

define({
  name: 'create_project',
  title: 'Créer un projet',
  group: 'Projets',
  scope: 'write',
  http: { method: 'POST', path: '/projects' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: 'Crée un projet privé (vous seul le voyez ; le partage se fait depuis Paillasse).',
  input: params({
    name: str('Nom du projet.', { minLength: 1, maxLength: 200 }),
    description: str('Description.', { maxLength: 4000 }),
    color: str('Couleur (#RRGGBB).', { pattern: '^#[0-9a-fA-F]{6}$', patternHint: 'couleur #RRGGBB attendue.' }),
  }, ['name']),
  async handler(a, ctx) {
    const id = await createProject(ctx.user, a);
    const p = await loadProject(id, ctx.user);
    return { id, name: p.name, url: webUrl(ctx, `/projects/${id}`) };
  },
});

// --- Recherche dans tout le cahier ---------------------------------------------------------------------------

const KINDS = ['entries', 'sequences', 'samples', 'datasets', 'templates', 'projects'];

define({
  name: 'search',
  title: 'Chercher dans le cahier',
  group: 'Cahier',
  scope: 'read',
  http: { method: 'GET', path: '/search' },
  description: 'Cherche dans tout le cahier : entrées (plein texte en français, préfixes : « purif » trouve « purification »), '
    + 'séquences (nom, code, description, ou bases ACGT), tubes du stockage (nom, code, notes), jeux de données, modèles, projets. '
    + 'À employer dès que l’on cherche quelque chose du labo sans savoir où c’est. Renvoie des résultats typés avec un extrait et une adresse.',
  input: params({
    query: str('Ce que l’on cherche, ex. « purification DegU », « pET28 », « ECH-0042 ».', { minLength: 1, maxLength: 200 }),
    types: list({ type: 'string', enum: KINDS }, `Où chercher (par défaut partout) : ${KINDS.join(', ')}.`),
    limit: int('Résultats au plus par type (1 à 50).', { minimum: 1, maximum: 50, default: 10 }),
  }, ['query']),
  async handler(a, ctx) {
    const want = new Set(a.types?.length ? a.types : KINDS);
    const like = `%${a.query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const results = [];
    const tasks = [];
    if (want.has('entries')) {
      tasks.push(searchEntries(ctx.user, a.query, a.limit).then((rows) => rows.forEach((e) => results.push(compact({
        type: 'entry', id: e.id, title: e.title, date: isoDate(e.entry_date), status: e.status, project: e.project_name,
        snippet: e.snippet?.replace(/⟦|⟧/g, '**'), url: webUrl(ctx, `/entries/${e.id}`),
      })))));
    }
    if (want.has('sequences')) {
      tasks.push(listSequences(ctx.user, { q: a.query, limit: a.limit }).then((rows) => rows.forEach((s) => results.push(compact({
        type: 'sequence', id: s.id, code: s.code, title: s.name, length: s.length, circular: s.circular, project: s.project_name,
        snippet: s.description?.slice(0, 200), sequence_match: s.sequence_match || undefined, url: webUrl(ctx, `/sequences/${s.id}`),
      })))));
    }
    if (want.has('samples')) {
      tasks.push(searchSamples(ctx.user, { q: a.query, limit: a.limit }).then((rows) => rows.forEach((s) => results.push(compact({
        type: 'sample', id: s.id, code: s.code, title: s.name, sample_type: s.type, location: s.location, status: s.status,
        url: webUrl(ctx, `/storage?sample=${s.id}`),
      })))));
    }
    if (want.has('datasets')) {
      tasks.push(listDatasets(ctx.user, { q: a.query }).then((rows) => rows.slice(0, a.limit).forEach((d) => results.push(compact({
        type: 'dataset', id: d.id, title: d.title || 'Sans titre', kind: d.kind, project: d.project_name, updated_at: isoTime(d.updated_at),
        url: webUrl(ctx, `/stats/${d.id}`),
      })))));
    }
    if (want.has('templates')) {
      tasks.push(query(
        `SELECT id, name, description, category FROM templates WHERE NOT archived AND (name ILIKE $1 OR description ILIKE $1 OR category ILIKE $1)
         ORDER BY lower(name) LIMIT $2`,
        [like, a.limit],
      ).then(({ rows }) => rows.forEach((t) => results.push(compact({
        type: 'template', id: t.id, title: t.name, category: t.category, snippet: t.description?.slice(0, 200), url: webUrl(ctx, `/templates/${t.id}`),
      })))));
    }
    if (want.has('projects')) {
      tasks.push(query(
        `SELECT id, name, description FROM projects WHERE id IN ${visibleProjects('$1')} AND (name ILIKE $2 OR description ILIKE $2)
         ORDER BY lower(name) LIMIT $3`,
        [ctx.user.id, like, a.limit],
      ).then(({ rows }) => rows.forEach((p) => results.push(compact({
        type: 'project', id: p.id, title: p.name, snippet: p.description?.slice(0, 200), url: webUrl(ctx, `/projects/${p.id}`),
      })))));
    }
    await Promise.all(tasks);
    const order = ['entry', 'sequence', 'sample', 'dataset', 'template', 'project'];
    results.sort((x, y) => order.indexOf(x.type) - order.indexOf(y.type));
    return { query: a.query, count: results.length, results };
  },
});

// --- Activité et synchronisation --------------------------------------------------------------------------------

define({
  name: 'recent_activity',
  title: 'Activité récente',
  group: 'Cahier',
  scope: 'read',
  http: { method: 'GET', path: '/activity' },
  description: 'Ce qui s’est passé récemment dans le cahier (entrées créées, modifiées, verrouillées, versions, tubes rangés '
    + 'ou déplacés, séquences, jeux de données…), du plus récent au plus ancien, avec qui et quand. À employer pour « qu’est-ce '
    + 'qui a été fait cette semaine ? » ou pour un bilan.',
  input: params({
    since: { type: 'string', format: 'date-time', description: 'Depuis (date ISO, ex. 2026-10-19 ou 2026-10-19T08:00:00Z). Par défaut : 7 jours.' },
    types: list({ type: 'string', maxLength: 60 }, 'Types d’événements (entry.locked…) ou familles (entry.*, sample.*).'),
    project_id: uuid('Seulement ce projet.'),
    limit: int('Nombre d’événements (1 à 200).', { minimum: 1, maximum: 200, default: 50 }),
  }),
  async handler(a, ctx) {
    if (a.project_id) await assertProject(ctx.user, a.project_id);
    const since = a.since ? new Date(a.since) : new Date(Date.now() - 7 * 86_400_000);
    const values = [ctx.user.id, since, a.limit];
    let extra = '';
    if (a.project_id) { values.push(a.project_id); extra += ` AND e.project_id = $${values.length}`; }
    if (a.types?.length) {
      const exact = a.types.filter((t) => !t.endsWith('.*'));
      const families = a.types.filter((t) => t.endsWith('.*')).map((t) => t.slice(0, -2));
      values.push(exact, families);
      extra += ` AND (e.type = ANY($${values.length - 1}) OR e.object_type = ANY($${values.length}))`;
    }
    const { rows } = await query(
      `SELECT e.*, p.name AS project_name FROM integration_events e LEFT JOIN projects p ON p.id = e.project_id
       WHERE e.created_at >= $2 AND ${visibleEvent('e', '$1')} ${extra}
       ORDER BY e.id DESC LIMIT $3`,
      values,
    );
    return {
      since: since.toISOString(),
      events: rows.map((e) => {
        const v = eventView(e, ctx.origin ?? '');
        return compact({ at: v.occurred_at, type: v.type, label: EVENT_TYPES[v.type] ?? v.type, object: v.object, project: e.project_name, actor: v.actor?.name, data: v.data, url: v.links.web });
      }),
    };
  },
});

define({
  name: 'get_changes',
  title: 'Changements depuis un curseur (synchronisation)',
  group: 'Synchronisation',
  scope: 'read',
  http: { method: 'GET', path: '/changes' },
  description: 'Flux de synchronisation : objets modifiés depuis le curseur donné (0 au départ), regroupés par objet (le dernier '
    + 'changement de chacun), avec le curseur suivant. Un objet « deleted » ou devenu introuvable (404) est à retirer de l’index. '
    + 'Les événements sont gardés 90 jours.',
  input: params({
    cursor: int('Curseur reçu au précédent appel (0 pour tout ce qui est gardé).', { minimum: 0, default: 0 }),
    object_types: list({ type: 'string', enum: ['project', 'entry', 'attachment', 'sequence', 'sample', 'storage_unit', 'dataset', 'template', 'reagent', 'ladder'] }, 'Types d’objets suivis (par défaut tous).'),
    limit: int('Événements examinés au plus (1 à 5000).', { minimum: 1, maximum: 5000, default: 1000 }),
  }),
  async handler(a, ctx) {
    const values = [ctx.user.id, a.cursor, a.limit + 1];
    let extra = '';
    if (a.object_types?.length) { values.push(a.object_types); extra = ` AND e.object_type = ANY($${values.length})`; }
    const { rows } = await query(
      `SELECT e.* FROM integration_events e WHERE e.id > $2 AND ${visibleEvent('e', '$1')} ${extra} ORDER BY e.id LIMIT $3`,
      values,
    );
    const more = rows.length > a.limit;
    const scanned = more ? rows.slice(0, a.limit) : rows;
    // Dernier changement de chaque objet
    const latest = new Map();
    for (const e of scanned) latest.set(`${e.object_type}:${e.object_id}`, e);
    const { rows: [{ top }] } = await query('SELECT coalesce(max(id), 0)::bigint AS top FROM integration_events');
    const next = more ? Number(scanned.at(-1).id) : Math.max(a.cursor, Number(top));
    return {
      cursor: a.cursor,
      next_cursor: next,
      has_more: more,
      changes: [...latest.values()].map((e) => {
        const v = eventView(e, ctx.origin ?? '');
        return { object_type: e.object_type, object_id: e.object_id, last_event: v.type, deleted: v.type.endsWith('.deleted'), changed_at: v.occurred_at, title: v.object.title, links: v.links };
      }),
    };
  },
});
