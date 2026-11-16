import { Router } from 'express';
import { query, tx } from '../db.js';
import { assertProject, visibleProjects } from '../lib/access.js';
import { HttpError, notFound } from '../lib/errors.js';
import { escapeMd, safeFileName } from '../lib/markdown.js';
import { entryFileBase, markdownWithFiles, originOf, sendZip, uniqueName } from '../lib/markdownExport.js';
import { emit } from '../integrations/events.js';

const router = Router();
const COLOR = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f-]{36}$/i;
// Colonnes publiques : jamais le mot de passe ni le jeton du tableau partagé
const PUBLIC = `p.id, p.name, p.description, p.color, p.archived, p.created_at, p.updated_at,
  (p.board_share_token IS NOT NULL) AS board_shared, p.created_by AS owner_id, ou.display_name AS owner_name,
  (SELECT count(*)::int FROM project_members m WHERE m.project_id = p.id AND m.status = 'accepted') AS member_count,
  (SELECT count(*)::int FROM project_members m WHERE m.project_id = p.id AND m.status = 'pending') AS pending_count`;

export async function loadProject(id, user, opts) {
  const role = await assertProject(user, id, opts);
  const { rows } = await query(`SELECT ${PUBLIC} FROM projects p JOIN users ou ON ou.id = p.created_by WHERE p.id = $1`, [id]);
  if (!rows[0]) throw notFound('Projet');
  return { ...rows[0], role };
}

/** Membres et invitations d'un projet (le propriétaire en tête). */
export async function members(projectId) {
  const { rows } = await query(
    `SELECT u.id, u.display_name, u.username, 'owner' AS status, p.created_at AS since
     FROM projects p JOIN users u ON u.id = p.created_by WHERE p.id = $1
     UNION ALL
     SELECT u.id, u.display_name, u.username, m.status, coalesce(m.responded_at, m.invited_at)
     FROM project_members m JOIN users u ON u.id = m.user_id WHERE m.project_id = $1 AND u.deleted_at IS NULL`,
    [projectId],
  );
  const order = { owner: 0, accepted: 1, pending: 2, declined: 3 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.display_name.localeCompare(b.display_name, 'fr'));
}

/** Invite des comptes (actifs, autres que le propriétaire) ; un refus peut être renouvelé. */
async function invite(db, projectId, ownerId, userIds, invitedBy) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(String))].filter((id) => UUID.test(id) && id !== ownerId);
  if (!ids.length) return 0;
  const { rows: valid } = await db.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL AND disabled_at IS NULL', [ids]);
  for (const u of valid) {
    await db.query(
      `INSERT INTO project_members (project_id, user_id, status, invited_by) VALUES ($1, $2, 'pending', $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET status = 'pending', invited_by = EXCLUDED.invited_by, invited_at = now(), responded_at = NULL
       WHERE project_members.status = 'declined'`,
      [projectId, u.id, invitedBy],
    );
  }
  return valid.length;
}

// Projets visibles : les miens et ceux où j'ai accepté l'invitation (un administrateur aussi : il voit le
// reste depuis la page Maintenance)
/** Projets visibles d'un compte, avec leur nombre d'entrées et la date de la dernière. */
export async function listProjects(user, { archived = false } = {}) {
  const { rows } = await query(
    `SELECT p.id, p.name, p.description, p.color, p.archived, p.created_at,
            (p.board_share_token IS NOT NULL) AS board_shared, p.created_by AS owner_id, ou.display_name AS owner_name,
            CASE WHEN p.created_by = $2 THEN 'owner' ELSE 'member' END AS role,
            (SELECT count(*)::int FROM project_members m WHERE m.project_id = p.id AND m.status = 'accepted') AS member_count,
            (SELECT count(*)::int FROM project_members m WHERE m.project_id = p.id AND m.status = 'pending') AS pending_count,
            count(e.id)::int AS entry_count, max(e.entry_date) AS last_entry_date
     FROM projects p JOIN users ou ON ou.id = p.created_by
     LEFT JOIN entries e ON e.project_id = p.id AND NOT e.archived
     WHERE ($1 OR NOT p.archived) AND p.id IN ${visibleProjects('$2')}
     GROUP BY p.id, ou.display_name ORDER BY p.archived, lower(p.name)`,
    [archived === true || archived === 'true', user.id],
  );
  return rows;
}

router.get('/', async (req, res) => res.json(await listProjects(req.user, { archived: req.query.archived })));

router.get('/:id', async (req, res) => {
  res.json(await loadProject(req.params.id, req.user));
});

/** Création : privé par défaut ; share_with = comptes invités (ils doivent accepter). */
/** Nouveau projet (privé ; share_with : comptes invités, qui doivent accepter). Renvoie son identifiant. */
export async function createProject(user, body = {}) {
  const name = String(body.name ?? '').trim().slice(0, 200);
  if (!name) throw new HttpError(400, 'Le projet doit avoir un nom.');
  const color = COLOR.test(body.color) ? body.color : '#2449C7';
  return tx(async (db) => {
    const { rows: [p] } = await db.query(
      'INSERT INTO projects (name, description, color, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, String(body.description ?? ''), color, user.id],
    );
    await invite(db, p.id, user.id, body.share_with, user.id);
    await emit(db, { type: 'project.created', id: p.id, projectId: p.id, actor: user, data: { title: name } });
    return p.id;
  });
}

router.post('/', async (req, res) => {
  const id = await createProject(req.user, req.body ?? {});
  res.status(201).json(await loadProject(id, req.user));
});

router.patch('/:id', async (req, res) => {
  await assertProject(req.user, req.params.id, { owner: true });
  const b = req.body ?? {};
  const name = b.name === undefined ? null : String(b.name).trim();
  if (name === '') throw new HttpError(400, 'Le projet doit avoir un nom.');
  if (b.color !== undefined && !COLOR.test(b.color)) throw new HttpError(400, 'Couleur invalide.');
  const { rowCount } = await query(
    `UPDATE projects SET
       name = COALESCE($2, name),
       description = COALESCE($3, description),
       color = COALESCE($4, color),
       archived = COALESCE($5, archived),
       updated_at = now()
     WHERE id = $1`,
    [req.params.id, name, b.description ?? null, b.color ?? null, typeof b.archived === 'boolean' ? b.archived : null],
  );
  if (!rowCount) throw notFound('Projet');
  const p = await loadProject(req.params.id, req.user);
  await emit(null, { type: 'project.updated', id: p.id, projectId: p.id, actor: req.user, data: { title: p.name, archived: p.archived } });
  res.json(p);
});

// --- Markdown : tout le projet dans un dossier (une note par entrée, fichiers joints, note d'index) ----------------

router.get('/:id/markdown', async (req, res) => {
  const p = await loadProject(req.params.id, req.user);
  const { rows: entries } = await query(
    `SELECT e.*, u.display_name AS created_by_name FROM entries e JOIN users u ON u.id = e.created_by
     WHERE e.project_id = $1 AND NOT e.archived ORDER BY e.entry_date, e.created_at`,
    [p.id],
  );
  const ids = entries.map((e) => e.id);
  const [{ rows: versions }, { rows: attachments }, people] = await Promise.all([
    query(
      `SELECT DISTINCT ON (v.entry_id) v.*, u.display_name AS author FROM entry_versions v JOIN users u ON u.id = v.created_by
       WHERE v.entry_id = ANY($1::uuid[]) ORDER BY v.entry_id, v.version_number DESC`,
      [ids],
    ),
    query('SELECT id, entry_id, sha256, filename, size_bytes, created_at FROM attachments WHERE entry_id = ANY($1::uuid[]) ORDER BY created_at', [ids]),
    members(p.id),
  ]);
  const lastVersion = new Map(versions.map((v) => [v.entry_id, v]));
  const byId = new Map(entries.map((e) => [e.id, e]));
  const folder = safeFileName(p.name, 'projet');
  const used = new Set([folder.toLowerCase()]);
  const origin = originOf(req);
  const stamp = new Date().toLocaleDateString('sv-SE');
  const index = [];
  await sendZip(res, `${folder} (Markdown ${stamp}).zip`, (zip, addFile) => {
    for (const e of entries) {
      // Une entrée verrouillée : sa version de verrouillage, comme à l'impression et dans l'export complet
      const version = e.status === 'locked' ? lastVersion.get(e.id) ?? null : null;
      const parent = e.parent_entry_id ? byId.get(e.parent_entry_id) ?? null : null;
      const files = attachments.filter((a) => a.entry_id === e.id && (!version || a.created_at <= version.created_at));
      const name = uniqueName(used, entryFileBase(version ?? e));
      const out = markdownWithFiles({
        entry: { ...e, project_name: p.name, parent }, project: p, version, author: version?.author, attachments: files, origin,
      });
      zip.append(out.md, { name: `${folder}/${name}.md` });
      for (const f of out.files) addFile(f.path, `${folder}/fichiers/${f.name}`);
      index.push({ e, version, name });
    }
    const shared = people.filter((m) => m.status === 'accepted').map((m) => m.display_name);
    const lines = [
      '---', `projet: ${JSON.stringify(p.name)}`, `proprietaire: ${JSON.stringify(p.owner_name)}`,
      `entrees: ${entries.length}`, `exporte_le: ${JSON.stringify(new Date().toISOString())}`, 'source: Paillasse', 'tags: [paillasse]', '---', '',
      `# ${escapeMd(p.name)}`, '',
    ];
    if (p.description) lines.push(escapeMd(p.description), '');
    lines.push(`Projet de ${escapeMd(p.owner_name)}${shared.length ? `, partagé avec ${shared.map(escapeMd).join(', ')}` : ', privé'}.`, '');
    if (index.length) {
      lines.push('| Date | Entrée | État | Auteur |', '| --- | --- | --- | --- |');
      for (const { e, version, name } of index) {
        const state = e.status === 'locked' ? `verrouillée (v${version?.version_number ?? e.version_count})` : e.version_count ? `brouillon (${e.version_count} version${e.version_count > 1 ? 's' : ''})` : 'brouillon';
        lines.push(`| ${e.entry_date} | [${escapeMd((version ?? e).title)}](${encodeURI(`${name}.md`).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'))}) | ${state} | ${escapeMd(e.created_by_name)} |`);
      }
    } else {
      lines.push('*Aucune entrée.*');
    }
    lines.push('', '---', '', `Exporté de Paillasse le ${new Date().toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}. Une entrée verrouillée est exportée depuis sa version de verrouillage ; son empreinte SHA-256 figure dans ses propriétés.`);
    zip.append(`${lines.join('\n')}\n`, { name: `${folder}/${folder}.md` });
  });
});

// --- Partage ---------------------------------------------------------------------------------------------

router.get('/:id/members', async (req, res) => {
  await assertProject(req.user, req.params.id);
  res.json(await members(req.params.id));
});

router.post('/:id/members', async (req, res) => {
  const p = await loadProject(req.params.id, req.user, { owner: true });
  const n = await tx((db) => invite(db, p.id, p.owner_id, req.body?.user_ids, req.user.id));
  res.status(201).json({ invited: n, members: await members(p.id) });
});

/** Le propriétaire retire un membre (ou annule une invitation) ; un membre quitte le projet. */
router.delete('/:id/members/:userId', async (req, res) => {
  const self = req.params.userId === req.user.id;
  await assertProject(req.user, req.params.id, self ? {} : { owner: true });
  const { rowCount } = await query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [req.params.id, req.params.userId]);
  if (!rowCount) throw notFound('Membre');
  res.json({ ok: true });
});

export default router;

// --- Invitations reçues : /api/invitations ------------------------------------------------------------------

export const invitations = Router();

invitations.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT p.id AS project_id, p.name, p.color, p.description, iu.display_name AS invited_by, m.invited_at,
            (SELECT count(*)::int FROM entries e WHERE e.project_id = p.id AND NOT e.archived) AS entries
     FROM project_members m JOIN projects p ON p.id = m.project_id LEFT JOIN users iu ON iu.id = m.invited_by
     WHERE m.user_id = $1 AND m.status = 'pending' AND NOT p.archived ORDER BY m.invited_at DESC`,
    [req.user.id],
  );
  res.json(rows);
});

async function respond(req, res, status) {
  const { rowCount } = await query(
    `UPDATE project_members SET status = $3, responded_at = now()
     WHERE project_id = $1 AND user_id = $2 AND status = 'pending'`,
    [req.params.projectId, req.user.id, status],
  );
  if (!rowCount) throw notFound('Invitation');
  res.json({ ok: true });
}

invitations.post('/:projectId/accept', (req, res) => respond(req, res, 'accepted'));
invitations.post('/:projectId/decline', (req, res) => respond(req, res, 'declined'));

// --- Annuaire : les comptes actifs, pour choisir avec qui partager ---------------------------------------------

export const directory = Router();

directory.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT id, display_name, username FROM users
     WHERE deleted_at IS NULL AND disabled_at IS NULL AND id <> $1 ORDER BY lower(display_name)`,
    [req.user.id],
  );
  res.json(rows);
});
