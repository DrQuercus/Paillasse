// Événements : ce qui change dans le cahier, pour les outils extérieurs (flux /api/v1/changes, webhooks).
// Une ligne par geste (entrée créée, version figée, tube déplacé…), écrite par la route qui le fait, dans sa
// transaction quand il y en a une. Les suppressions (administrateur) sont notées par la base elle-même
// (migration 016). Rien de confidentiel dans un événement : un type, un objet, un titre ; l'outil relit l'objet
// avec ses propres droits.
import { query } from '../db.js';
import { visibleProjects } from '../lib/access.js';

/** Types d'événements, par famille (libellés de la page Intégrations et de la documentation). */
export const EVENT_TYPES = {
  'project.created': 'Projet créé',
  'project.updated': 'Projet modifié (nom, description, archivage)',
  'project.deleted': 'Projet supprimé',
  'entry.created': 'Entrée créée (ou addendum)',
  'entry.updated': 'Entrée modifiée (regroupé : envoyé après 30 s sans modification)',
  'entry.version_created': 'Version figée d’une entrée',
  'entry.locked': 'Entrée verrouillée (signée)',
  'entry.archived': 'Entrée archivée',
  'entry.moved': 'Entrée déplacée vers un autre projet',
  'entry.deleted': 'Entrée supprimée',
  'attachment.created': 'Fichier joint à une entrée',
  'sequence.created': 'Séquence ajoutée au registre',
  'sequence.updated': 'Séquence modifiée (regroupé)',
  'sequence.version_created': 'Version figée d’une séquence',
  'sequence.archived': 'Séquence archivée',
  'sequence.deleted': 'Séquence supprimée',
  'sample.created': 'Tube rangé',
  'sample.updated': 'Tube modifié',
  'sample.moved': 'Tube déplacé',
  'sample.out': 'Tube sorti du froid',
  'sample.back': 'Tube remis en place',
  'sample.thawed': 'Décongélation notée',
  'sample.discarded': 'Tube jeté ou épuisé',
  'sample.restored': 'Tube remis en service',
  'sample.deleted': 'Tube supprimé',
  'storage_unit.created': 'Contenant ajouté (appareil, étagère, rack, boîte…)',
  'storage_unit.updated': 'Contenant modifié ou déplacé',
  'storage_unit.archived': 'Contenant retiré',
  'storage_unit.deleted': 'Contenant supprimé',
  'dataset.created': 'Jeu de données statistiques créé',
  'dataset.updated': 'Jeu de données modifié (regroupé)',
  'dataset.archived': 'Jeu de données archivé',
  'dataset.deleted': 'Jeu de données supprimé',
  'template.created': 'Modèle créé',
  'template.updated': 'Modèle modifié',
  'template.archived': 'Modèle archivé',
  'template.deleted': 'Modèle supprimé',
  'reagent.created': 'Produit ajouté',
  'reagent.updated': 'Produit modifié',
  'reagent.deleted': 'Produit supprimé',
  'ladder.created': 'Marqueur de taille ajouté',
  'ladder.updated': 'Marqueur de taille modifié',
  'ladder.deleted': 'Marqueur de taille supprimé',
};

export const EVENT_GROUPS = {
  project: 'Projets', entry: 'Entrées', attachment: 'Fichiers joints', sequence: 'Séquences', sample: 'Tubes',
  storage_unit: 'Contenants du stockage', dataset: 'Statistiques', template: 'Modèles', reagent: 'Produits', ladder: 'Marqueurs',
};

/** Événements fréquents regroupés : un webhook attend que l'objet ne change plus depuis 30 s. */
export const DEBOUNCED = new Set(['entry.updated', 'sequence.updated', 'dataset.updated']);
export const DEBOUNCE_SECONDS = 30;

/** Le type correspond-il au filtre (liste vide = tout ; « entry.* » = une famille) ? */
export function typeMatches(filters, type) {
  if (!filters?.length) return true;
  return filters.some((f) => f === type || (f.endsWith('.*') && type.startsWith(f.slice(0, -1))));
}

// Ordre des événements : leurs numéros sont pris sous un verrou tenu jusqu'à la validation (écriture groupée juste
// avant le COMMIT pour une transaction). Un numéro n'est donc jamais visible avant un numéro plus petit : un lecteur
// (flux de changements, webhooks) qui a vu l'événement n a vu tous ceux d'avant, et son curseur peut avancer sans
// rien sauter. Les suppressions, notées par la base, passent par le même verrou (migration 016).
const EVENT_LOCK = 727275;
const COLUMNS = '(type, object_type, object_id, project_id, audience, actor_id, actor_name, data)';
const pendingByTx = new WeakMap(); // transaction (client.beforeCommit) → événements à écrire

async function insertEvents(client, rows) {
  await client.query('SELECT pg_advisory_xact_lock($1)', [EVENT_LOCK]);
  for (let start = 0; start < rows.length; start += 1000) {
    const chunk = rows.slice(start, start + 1000);
    const values = chunk.map((_, k) => `(${Array.from({ length: 8 }, (__, j) => `$${k * 8 + j + 1}`).join(', ')})`);
    await client.query(`INSERT INTO integration_events ${COLUMNS} VALUES ${values.join(', ')}`, chunk.flat());
  }
}

/**
 * Note un événement. db : la transaction en cours (l'événement est écrit avec elle, juste avant sa validation),
 * ou null (écrit tout de suite ; une erreur est alors seulement signalée, sans faire échouer le geste déjà
 * enregistré). { type, id, projectId?, audience?, actor?, data? } ; object_type = début du type (entry, sample…).
 */
export async function emit(db, { type, id, projectId = null, audience = null, actor = null, data = {} }) {
  const row = [type, type.slice(0, type.lastIndexOf('.')), String(id), projectId, audience, actor?.id ?? null, actor?.display_name ?? '', JSON.stringify(data ?? {})];
  const hooks = db?.beforeCommit;
  if (hooks) {
    let rows = pendingByTx.get(hooks);
    if (!rows) {
      rows = [];
      pendingByTx.set(hooks, rows);
      hooks.push((client) => insertEvents(client, rows));
    }
    rows.push(row);
    return undefined;
  }
  // Hors transaction : verrou et écriture dans la même instruction
  const run = (db ?? { query }).query(
    `WITH lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(${EVENT_LOCK}))
     INSERT INTO integration_events ${COLUMNS} SELECT $1, $2, $3, $4::uuid, $5::uuid[], $6::uuid, $7, $8::jsonb FROM lock`,
    row,
  );
  if (db) return run;
  return run.catch((err) => console.warn(`Événement ${type} non noté :`, err.message));
}

/** Comptes qui voient un projet (propriétaire et membres) : audience d'un objet qui en sort. */
export async function projectAudience(db, projectId) {
  const { rows } = await (db ?? { query }).query(
    `SELECT created_by AS id FROM projects WHERE id = $1
     UNION SELECT user_id FROM project_members WHERE project_id = $1 AND status = 'accepted'`,
    [projectId],
  );
  return rows.map((r) => r.id);
}

/** Condition SQL : l'événement (alias a) est visible du compte $n. */
export const visibleEvent = (a, param) => `((${a}.audience IS NOT NULL AND ${param} = ANY(${a}.audience))
  OR (${a}.audience IS NULL AND (${a}.project_id IS NULL OR ${a}.project_id IN ${visibleProjects(param)})))`;

/** Adresses d'un objet : dans l'API et dans l'interface. */
export function objectLinks(objectType, id, origin = '') {
  const api = {
    project: `/api/v1/projects/${id}`, entry: `/api/v1/entries/${id}`, sequence: `/api/v1/sequences/${id}`,
    sample: `/api/v1/samples/${id}`, storage_unit: `/api/v1/storage/units/${id}`, dataset: `/api/v1/datasets/${id}`,
    template: `/api/v1/templates/${id}`, attachment: `/api/v1/attachments/${id}`,
  }[objectType];
  const web = {
    project: `/projects/${id}`, entry: `/entries/${id}`, sequence: `/sequences/${id}`, sample: `/storage?sample=${id}`,
    storage_unit: `/storage/${id}`, dataset: `/stats/${id}`, template: `/templates/${id}`,
  }[objectType];
  return { ...(api ? { api: origin + api } : {}), ...(web ? { web: origin + web } : {}) };
}

/** Forme publique d'un événement (flux, webhooks). */
export function eventView(e, origin = '') {
  return {
    id: Number(e.id),
    type: e.type,
    occurred_at: new Date(e.created_at).toISOString(),
    object: { type: e.object_type, id: e.object_id, ...(e.data?.title ? { title: e.data.title } : {}), ...(e.data?.code ? { code: e.data.code } : {}) },
    project_id: e.project_id ?? null,
    actor: e.actor_name ? { id: e.actor_id ?? null, name: e.actor_name } : null,
    data: e.data ?? {},
    links: objectLinks(e.object_type, e.object_id, origin),
  };
}

/** Dernier numéro d'événement (point de départ d'une synchronisation). */
export async function lastEventId() {
  const { rows } = await query('SELECT coalesce(max(id), 0)::bigint AS id FROM integration_events');
  return Number(rows[0].id);
}

/** Événements de plus de 90 jours : effacés (le flux de changements ne remonte pas plus loin). */
export async function pruneEvents(days = 90) {
  const { rowCount } = await query(`DELETE FROM integration_events WHERE created_at < now() - make_interval(days => $1)`, [days]);
  return rowCount;
}
