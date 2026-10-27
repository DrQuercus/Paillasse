// Suppression définitive par un administrateur : entrées, projets, séquences, stockage, jeux de données,
// produits, marqueurs, modèles, comptes. Chaque suppression a un aperçu (ce qui part, ce qui reste,
// ce qui l'empêche) et s'exécute dans une seule transaction où les garde-fous de la base sont levés
// (SET LOCAL paillasse.purge = 'on', voir la migration 013). Ce qui reste n'est jamais altéré : on supprime
// une entrée entière avec toutes ses versions, jamais une version ou un fichier d'une entrée scellée.
import { query, tx } from '../db.js';

/** Exécute fn(client) dans une transaction où la suppression administrateur est permise. */
export function withPurge(fn) {
  return tx(async (c) => {
    await c.query("SET LOCAL paillasse.purge = 'on'");
    return fn(c);
  });
}

const plural = (n, one, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;
const ids = (list) => [...new Set((Array.isArray(list) ? list : []).map(String))].filter((s) => /^[0-9a-f-]{36}$/i.test(s));
const TITLES = 15;

// --- Entrées (avec leurs addenda, versions figées et pièces jointes) -----------------------------------

async function entryClosure(db, list) {
  const { rows } = await db.query(
    `WITH RECURSIVE t(id) AS (
       SELECT id FROM entries WHERE id = ANY($1::uuid[])
       UNION SELECT e.id FROM entries e JOIN t ON e.parent_entry_id = t.id)
     SELECT id FROM t`,
    [list],
  );
  return rows.map((r) => r.id);
}

async function entriesImpact(db, list) {
  const all = await entryClosure(db, list);
  const { rows: [c] } = await db.query(
    `SELECT (SELECT count(*) FROM entries WHERE id = ANY($1))::int AS entries,
            (SELECT count(*) FROM entries WHERE id = ANY($1) AND status = 'locked')::int AS locked,
            (SELECT count(*) FROM entry_versions WHERE entry_id = ANY($1))::int AS versions,
            (SELECT count(*) FROM attachments WHERE entry_id = ANY($1))::int AS attachments,
            (SELECT coalesce(sum(size_bytes), 0) FROM attachments WHERE entry_id = ANY($1))::bigint AS bytes,
            (SELECT count(*) FROM samples WHERE entry_id = ANY($1))::int AS samples`,
    [all],
  );
  const { rows: titles } = await db.query('SELECT title FROM entries WHERE id = ANY($1) ORDER BY entry_date DESC, title LIMIT $2', [all, TITLES]);
  // Une image retouchée ailleurs à partir d'un fichier d'ici : la supprimer casserait le sceau de l'autre entrée
  const { rows: cross } = await db.query(
    `SELECT DISTINCT e.title FROM attachments a JOIN entries e ON e.id = a.entry_id
     WHERE a.derived_from IN (SELECT id FROM attachments WHERE entry_id = ANY($1)) AND NOT (a.entry_id = ANY($1))`,
    [all],
  );
  const lines = [
    `${plural(c.entries, 'entrée')}${all.length > ids(list).length ? `, dont ${plural(all.length - ids(list).length, 'addendum', 'addenda')}` : ''}${c.locked ? ` (${c.locked} verrouillée${c.locked > 1 ? 's' : ''})` : ''}`,
    c.versions && `${plural(c.versions, 'version figée', 'versions figées')}`,
    c.attachments && `${plural(c.attachments, 'pièce jointe', 'pièces jointes')} (les fichiers restent sur le disque tant qu’on ne supprime pas les orphelins)`,
  ];
  const kept = [c.samples && `${plural(c.samples, 'tube')} du stockage détaché${c.samples > 1 ? 's' : ''} de l’entrée (ils restent rangés)`];
  return {
    count: c.entries, lines, kept, items: titles.map((t) => t.title),
    blockers: cross.map((x) => `L’entrée « ${x.title} » contient une image retouchée à partir d’un de ces fichiers : supprimez-la en même temps.`),
  };
}

async function deleteEntries(c, list) {
  const all = await entryClosure(c, list);
  if (!all.length) return { entries: 0 };
  await c.query('UPDATE samples SET entry_id = NULL WHERE entry_id = ANY($1)', [all]);
  const att = await c.query('DELETE FROM attachments WHERE entry_id = ANY($1)', [all]);
  const ver = await c.query('DELETE FROM entry_versions WHERE entry_id = ANY($1)', [all]);
  const ent = await c.query('DELETE FROM entries WHERE id = ANY($1)', [all]);
  return { entries: ent.rowCount, versions: ver.rowCount, attachments: att.rowCount };
}

// --- Séquences du registre -------------------------------------------------------------------------

async function sequencesImpact(db, list) {
  const { rows: [c] } = await db.query(
    `SELECT (SELECT count(*) FROM sequences WHERE id = ANY($1))::int AS sequences,
            (SELECT count(*) FROM sequence_versions WHERE sequence_id = ANY($1))::int AS versions,
            (SELECT count(*) FROM sequence_files WHERE sequence_id = ANY($1))::int AS files,
            (SELECT count(*) FROM samples WHERE sequence_id = ANY($1))::int AS samples`,
    [list],
  );
  const { rows: titles } = await db.query('SELECT code, name FROM sequences WHERE id = ANY($1) ORDER BY code LIMIT $2', [list, TITLES]);
  return {
    count: c.sequences,
    lines: [plural(c.sequences, 'séquence'), c.versions && plural(c.versions, 'version figée', 'versions figées'), c.files && plural(c.files, 'fichier d’origine', 'fichiers d’origine')],
    kept: [c.samples && `${plural(c.samples, 'tube')} du stockage détaché${c.samples > 1 ? 's' : ''} de la séquence`, 'Les entrées qui citent ces séquences gardent le nom affiché, sans lien.'],
    items: titles.map((t) => `${t.code} ${t.name}`),
    blockers: [],
  };
}

async function deleteSequences(c, list) {
  await c.query('UPDATE samples SET sequence_id = NULL WHERE sequence_id = ANY($1)', [list]);
  const files = await c.query('DELETE FROM sequence_files WHERE sequence_id = ANY($1)', [list]);
  const versions = await c.query('DELETE FROM sequence_versions WHERE sequence_id = ANY($1)', [list]);
  const seqs = await c.query('DELETE FROM sequences WHERE id = ANY($1)', [list]);
  return { sequences: seqs.rowCount, versions: versions.rowCount, files: files.rowCount };
}

// --- Projets (entrées, tableau, jeux de données ; séquences et tubes détachés) -------------------------

async function projectsImpact(db, list) {
  const { rows: entryRows } = await db.query('SELECT id FROM entries WHERE project_id = ANY($1)', [list]);
  const e = await entriesImpact(db, entryRows.map((r) => r.id));
  const { rows: [c] } = await db.query(
    `SELECT (SELECT count(*) FROM projects WHERE id = ANY($1))::int AS projects,
            (SELECT count(*) FROM datasets WHERE project_id = ANY($1))::int AS datasets,
            (SELECT count(*) FROM board_notes WHERE project_id = ANY($1))::int AS notes,
            (SELECT count(*) FROM sequences WHERE project_id = ANY($1))::int AS sequences,
            (SELECT count(*) FROM samples WHERE project_id = ANY($1))::int AS samples`,
    [list],
  );
  const { rows: names } = await db.query('SELECT name FROM projects WHERE id = ANY($1) ORDER BY name', [list]);
  return {
    count: c.projects,
    lines: [
      plural(c.projects, 'projet'),
      ...(e.count ? e.lines : ['aucune entrée']),
      c.datasets && plural(c.datasets, 'jeu de données', 'jeux de données'),
      c.notes && `${plural(c.notes, 'post-it')} du tableau d’idées`,
    ],
    kept: [
      c.sequences && `${plural(c.sequences, 'séquence')} du registre, détachée${c.sequences > 1 ? 's' : ''} du projet`,
      c.samples && `${plural(c.samples, 'tube')} du stockage, détaché${c.samples > 1 ? 's' : ''} du projet`,
      ...e.kept,
    ],
    items: names.map((n) => n.name),
    blockers: e.blockers,
  };
}

async function deleteProjects(c, list) {
  const { rows } = await c.query('SELECT id FROM entries WHERE project_id = ANY($1)', [list]);
  const entries = await deleteEntries(c, rows.map((r) => r.id));
  await c.query('DELETE FROM board_links WHERE project_id = ANY($1)', [list]);
  const notes = await c.query('DELETE FROM board_notes WHERE project_id = ANY($1)', [list]);
  await c.query('DELETE FROM board_images WHERE project_id = ANY($1)', [list]);
  const datasets = await c.query('DELETE FROM datasets WHERE project_id = ANY($1)', [list]);
  await c.query('UPDATE sequences SET project_id = NULL WHERE project_id = ANY($1)', [list]);
  await c.query('UPDATE samples SET project_id = NULL WHERE project_id = ANY($1)', [list]);
  // Qui voyait chaque projet : relu par la base pour l'événement project.deleted (migration 016), car les
  // membres sont retirés avant le projet
  await c.query(
    `SELECT set_config('paillasse.project_audience', coalesce(jsonb_object_agg(p.id, coalesce((
       SELECT jsonb_agg(m.user_id) FROM project_members m WHERE m.project_id = p.id AND m.status = 'accepted'), '[]')), '{}')::text, true)
     FROM projects p WHERE p.id = ANY($1)`,
    [list],
  );
  await c.query('DELETE FROM project_members WHERE project_id = ANY($1)', [list]);
  const projects = await c.query('DELETE FROM projects WHERE id = ANY($1)', [list]);
  return { projects: projects.rowCount, ...entries, notes: notes.rowCount, datasets: datasets.rowCount };
}

// --- Stockage : contenants (avec tout ce qu'ils contiennent) et tubes ------------------------------------

async function unitClosure(db, list) {
  const { rows } = await db.query(
    `WITH RECURSIVE t(id) AS (
       SELECT id FROM storage_units WHERE id = ANY($1::uuid[])
       UNION SELECT u.id FROM storage_units u JOIN t ON u.parent_id = t.id)
     SELECT id FROM t`,
    [list],
  );
  return rows.map((r) => r.id);
}

async function unitsImpact(db, list) {
  const all = await unitClosure(db, list);
  const { rows: [c] } = await db.query(
    `SELECT (SELECT count(*) FROM samples WHERE unit_id = ANY($1))::int AS samples,
            (SELECT count(*) FROM samples WHERE unit_id = ANY($1) AND NOT archived)::int AS stored`,
    [all],
  );
  const { rows: names } = await db.query('SELECT name, kind FROM storage_units WHERE id = ANY($1) ORDER BY name', [list]);
  return {
    count: list.length,
    lines: [`${plural(all.length, 'contenant')} (avec ce qu’ils contiennent)`, c.samples && `${plural(c.samples, 'tube')}${c.stored ? `, dont ${c.stored} encore rangé${c.stored > 1 ? 's' : ''}` : ''}, avec leur historique`],
    kept: ['Les entrées qui citent ces tubes gardent leur adresse du jour, sans lien.'],
    items: names.map((n) => n.name),
    blockers: [],
  };
}

async function deleteSamplesIn(c, sampleIds) {
  await c.query('DELETE FROM sample_events WHERE sample_id = ANY($1)', [sampleIds]);
  return (await c.query('DELETE FROM samples WHERE id = ANY($1)', [sampleIds])).rowCount;
}

async function deleteUnits(c, list) {
  const all = await unitClosure(c, list);
  const { rows } = await c.query('SELECT id FROM samples WHERE unit_id = ANY($1)', [all]);
  const samples = await deleteSamplesIn(c, rows.map((r) => r.id));
  const units = await c.query('DELETE FROM storage_units WHERE id = ANY($1)', [all]);
  return { units: units.rowCount, samples };
}

async function samplesImpact(db, list) {
  const { rows: [c] } = await db.query(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE NOT archived)::int AS stored FROM samples WHERE id = ANY($1)`, [list]);
  const { rows: names } = await db.query('SELECT code, name FROM samples WHERE id = ANY($1) ORDER BY code LIMIT $2', [list, TITLES]);
  return {
    count: c.n,
    lines: [`${plural(c.n, 'tube')} avec leur historique${c.stored ? ` (dont ${c.stored} encore rangé${c.stored > 1 ? 's' : ''})` : ''}`],
    kept: ['Les entrées qui citent ces tubes gardent leur adresse du jour, sans lien.'],
    items: names.map((n) => `${n.code} ${n.name}`),
    blockers: [],
  };
}

// --- Tables simples : jeux de données, produits, marqueurs, modèles -------------------------------------

function simpleKind(table, label, labelMany, nameSql) {
  return {
    async impact(db, list) {
      const { rows } = await db.query(`SELECT ${nameSql} AS name FROM ${table} WHERE id = ANY($1) ORDER BY 1`, [list]);
      return { count: rows.length, lines: [plural(rows.length, label, labelMany)], kept: [], items: rows.slice(0, TITLES).map((r) => r.name), blockers: [] };
    },
    async remove(c, list) {
      return { [table]: (await c.query(`DELETE FROM ${table} WHERE id = ANY($1)`, [list])).rowCount };
    },
  };
}

const templatesKind = {
  async impact(db, list) {
    const { rows } = await db.query('SELECT name, slug FROM templates WHERE id = ANY($1) ORDER BY name', [list]);
    const base = rows.filter((r) => r.slug).length;
    return {
      count: rows.length,
      lines: [plural(rows.length - base, 'modèle du labo', 'modèles du labo')].concat(base ? [`${plural(base, 'modèle de base', 'modèles de base')} retiré${base > 1 ? 's' : ''} (sinon Paillasse le${base > 1 ? 's' : ''} réinstallerait à la prochaine mise à jour)`] : []),
      kept: ['Les entrées déjà créées à partir de ces modèles ne changent pas.'],
      items: rows.slice(0, TITLES).map((r) => r.name),
      blockers: [],
    };
  },
  async remove(c, list) {
    const archived = await c.query('UPDATE templates SET archived = true WHERE id = ANY($1) AND slug IS NOT NULL', [list]);
    const deleted = await c.query('DELETE FROM templates WHERE id = ANY($1) AND slug IS NULL', [list]);
    return { templates: deleted.rowCount, templates_retired: archived.rowCount };
  },
};

export const KINDS = {
  entries: { label: 'entrées', impact: entriesImpact, remove: deleteEntries },
  projects: { label: 'projets', impact: projectsImpact, remove: deleteProjects },
  sequences: { label: 'séquences', impact: sequencesImpact, remove: deleteSequences },
  units: { label: 'contenants du stockage', impact: unitsImpact, remove: deleteUnits },
  samples: { label: 'tubes', impact: samplesImpact, remove: (c, list) => deleteSamplesIn(c, list).then((n) => ({ samples: n })) },
  datasets: { label: 'jeux de données', ...simpleKind('datasets', 'jeu de données', 'jeux de données', "coalesce(nullif(title, ''), 'Sans titre')") },
  reagents: { label: 'produits', ...simpleKind('reagents', 'produit', 'produits', 'name') },
  ladders: { label: 'marqueurs de taille', ...simpleKind('ladders', 'marqueur de taille', 'marqueurs de taille', 'name') },
  templates: { label: 'modèles', ...templatesKind },
};

export const cleanIds = ids;

/** Aperçu : ce qui sera supprimé, ce qui reste, ce qui empêche la suppression. */
export async function purgeImpact(kind, list) {
  const k = KINDS[kind];
  if (!k) throw Object.assign(new Error('Type de données inconnu.'), { status: 400, expose: true });
  const r = await k.impact({ query }, ids(list));
  return { ...r, lines: r.lines.filter(Boolean), kept: r.kept.filter(Boolean) };
}

export async function purge(kind, list) {
  const k = KINDS[kind];
  const clean = ids(list);
  const impact = await purgeImpact(kind, clean);
  if (impact.blockers.length) throw Object.assign(new Error(impact.blockers.join(' ')), { status: 400, expose: true });
  return withPurge((c) => k.remove(c, clean));
}

// --- Comptes -----------------------------------------------------------------------------------------

// Colonnes qui nomment un compte sans être scellées : remises à NULL quand le compte disparaît vraiment
const NULLABLE_REFS = [
  ['admin_log', 'user_id'], ['app_settings', 'updated_by'], ['backup_runs', 'started_by'], ['backup_targets', 'created_by'],
  ['board_images', 'uploaded_by'], ['board_notes', 'created_by'], ['project_members', 'invited_by'], ['datasets', 'created_by'], ['datasets', 'updated_by'],
  ['entries', 'locked_by'], ['ladders', 'created_by'], ['ladders', 'updated_by'], ['reagents', 'created_by'], ['reagents', 'updated_by'],
  ['sample_events', 'created_by'], ['samples', 'created_by'], ['samples', 'updated_by'], ['samples', 'owner_id'],
  ['storage_units', 'created_by'], ['storage_units', 'updated_by'], ['templates', 'created_by'], ['templates', 'updated_by'],
  ['api_tokens', 'revoked_by'],
];

export async function userImpact(userId) {
  const { rows: [c] } = await query(
    `SELECT (SELECT count(*) FROM entries WHERE created_by = $1)::int AS entries,
            (SELECT count(*) FROM entries WHERE created_by = $1 AND status = 'locked')::int AS locked,
            (SELECT count(*) FROM sequences WHERE created_by = $1)::int AS sequences,
            (SELECT count(*) FROM datasets WHERE created_by = $1)::int AS datasets,
            (SELECT count(*) FROM templates WHERE created_by = $1 AND slug IS NULL)::int AS templates,
            (SELECT count(*) FROM board_notes WHERE created_by = $1 AND deleted_at IS NULL)::int AS notes,
            (SELECT count(*) FROM projects WHERE created_by = $1)::int AS projects,
            (SELECT count(*) FROM samples WHERE created_by = $1 AND NOT archived)::int AS samples,
            (SELECT count(*) FROM entry_versions v JOIN entries e ON e.id = v.entry_id WHERE v.created_by = $1 AND e.created_by <> $1)::int AS others_versions,
            (SELECT count(*) FROM attachments a JOIN entries e ON e.id = a.entry_id WHERE a.created_by = $1 AND e.created_by <> $1)::int AS others_files`,
    [userId],
  );
  return c;
}

/**
 * Les projets d'un compte qui s'en va passent au plus ancien membre actif (il a accepté d'y être), sinon à
 * l'administrateur qui supprime ; ses propres invitations et participations disparaissent.
 */
async function handOverProjects(c, userId, actorId) {
  const { rows } = await c.query('SELECT id FROM projects WHERE created_by = $1', [userId]);
  for (const { id } of rows) {
    const { rows: [m] } = await c.query(
      `SELECT m.user_id FROM project_members m JOIN users u ON u.id = m.user_id
       WHERE m.project_id = $1 AND m.user_id <> $2 AND m.status = 'accepted' AND u.deleted_at IS NULL AND u.disabled_at IS NULL
       ORDER BY m.responded_at NULLS LAST, m.invited_at LIMIT 1`,
      [id, userId],
    );
    const heir = m?.user_id ?? actorId;
    await c.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [id, heir]);
    await c.query('UPDATE projects SET created_by = $2, updated_at = now() WHERE id = $1', [id, heir]);
  }
  await c.query('DELETE FROM project_members WHERE user_id = $1', [userId]);
  return rows.length;
}

/**
 * Supprime un compte. data : 'keep' (ses entrées restent, signées de son nom ou « Compte supprimé » si
 * anonymize) ou 'delete' (ses entrées, séquences, jeux de données, modèles et post-it partent avec lui ;
 * ses tubes restent au stockage, sans propriétaire). Ses projets non vides passent à un membre ou à actorId.
 * Le compte disparaît entièrement si plus rien de scellé ne le cite ; sinon il ne reste qu'un nom sur
 * les versions figées : identifiant libéré, mot de passe effacé, plus de connexion possible.
 */
export async function deleteUser(userId, { data = 'keep', anonymize = false, actorId }) {
  return withPurge(async (c) => {
    const out = { removed: {}, full: false };
    // Ses accès extérieurs (jetons d'API, webhooks, liaison avec l'assistant IA) disparaissent dans tous les cas
    out.removed.api_tokens = (await c.query('DELETE FROM api_tokens WHERE user_id = $1', [userId])).rowCount;
    out.removed.webhooks = (await c.query('DELETE FROM webhooks WHERE user_id = $1', [userId])).rowCount;
    out.removed.assistant_links = (await c.query('DELETE FROM assistant_links WHERE user_id = $1', [userId])).rowCount;
    if (data === 'delete') {
      const { rows: e } = await c.query('SELECT id FROM entries WHERE created_by = $1', [userId]);
      Object.assign(out.removed, await deleteEntries(c, e.map((r) => r.id)));
      const { rows: s } = await c.query('SELECT id FROM sequences WHERE created_by = $1', [userId]);
      if (s.length) Object.assign(out.removed, await deleteSequences(c, s.map((r) => r.id)));
      out.removed.datasets = (await c.query('DELETE FROM datasets WHERE created_by = $1', [userId])).rowCount;
      out.removed.templates = (await c.query('DELETE FROM templates WHERE created_by = $1 AND slug IS NULL', [userId])).rowCount;
      const { rows: notes } = await c.query('SELECT id FROM board_notes WHERE created_by = $1', [userId]);
      await c.query('DELETE FROM board_links WHERE from_note = ANY($1) OR to_note = ANY($1)', [notes.map((n) => n.id)]);
      out.removed.notes = (await c.query('DELETE FROM board_notes WHERE created_by = $1', [userId])).rowCount;
      await c.query('DELETE FROM board_images i WHERE uploaded_by = $1 AND NOT EXISTS (SELECT 1 FROM board_notes n WHERE n.image_id = i.id)', [userId]);
      // Ses projets : supprimés s'ils sont vides maintenant, sinon confiés à l'administrateur
      const { rows: projects } = await c.query(
        `SELECT id FROM projects p WHERE created_by = $1
           AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.project_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM sequences s WHERE s.project_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM datasets d WHERE d.project_id = p.id)
           AND NOT EXISTS (SELECT 1 FROM board_notes n WHERE n.project_id = p.id)`,
        [userId],
      );
      if (projects.length) out.removed.projects = (await deleteProjects(c, projects.map((p) => p.id))).projects;
      out.handed_over = await handOverProjects(c, userId, actorId);
      for (const [table, col] of NULLABLE_REFS) await c.query(`UPDATE ${table} SET ${col} = NULL WHERE ${col} = $1`, [userId]);
      // Plus rien ne le cite ? Le compte disparaît complètement.
      await c.query('SAVEPOINT full_delete');
      try {
        await c.query('DELETE FROM users WHERE id = $1', [userId]);
        await c.query('RELEASE SAVEPOINT full_delete');
        out.full = true;
        return out;
      } catch {
        await c.query('ROLLBACK TO SAVEPOINT full_delete');
      }
    }
    // Il reste un nom sur des versions figées : le compte devient une simple signature
    out.handed_over = await handOverProjects(c, userId, actorId);
    await c.query(
      `UPDATE users SET username = '~supprime-' || id::text, password_hash = '!', is_admin = false, must_change_password = false,
         disabled_at = coalesce(disabled_at, now()), deleted_at = now(), sessions_valid_after = $2,
         display_name = CASE WHEN $3 THEN 'Compte supprimé' ELSE display_name END
       WHERE id = $1`,
      [userId, new Date(), Boolean(anonymize)],
    );
    return out;
  });
}

/** Anonymise un compte déjà supprimé (son nom disparaît des entrées qu'il signe). */
export async function anonymizeDeletedUser(userId) {
  await query("UPDATE users SET display_name = 'Compte supprimé' WHERE id = $1 AND deleted_at IS NOT NULL", [userId]);
}

/** Efface pour de bon un compte supprimé que plus rien de scellé ne cite (plus aucune entrée, séquence, version…). */
export async function forgetDeletedUser(userId, actorId) {
  try {
    return await withPurge(async (c) => {
      await handOverProjects(c, userId, actorId);
      for (const [table, col] of NULLABLE_REFS) await c.query(`UPDATE ${table} SET ${col} = NULL WHERE ${col} = $1`, [userId]);
      return (await c.query('DELETE FROM users WHERE id = $1 AND deleted_at IS NOT NULL', [userId])).rowCount;
    });
  } catch (err) {
    if (err.code === '23503') {
      throw Object.assign(new Error('Ce nom signe encore des entrées, des séquences ou des versions figées : supprimez-les d’abord, ou anonymisez le compte.'), { status: 400, expose: true });
    }
    throw err;
  }
}
