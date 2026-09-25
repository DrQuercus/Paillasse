// Qui voit quoi. Un projet est visible par son propriétaire et par les comptes qui ont accepté son
// invitation (project_members.status = 'accepted') ; ce qui y est rangé suit ses droits : entrées,
// versions, pièces jointes, tableau d'idées, séquences et jeux de données rattachés.
// Sans projet (registre de séquences, jeux de données libres, stockage, produits, marqueurs, modèles) :
// visible par tout le labo.
// Un administrateur voit tout (page Maintenance et liens qui en partent) mais n'écrit que là où il est
// membre. Un projet invisible répond « introuvable », comme s'il n'existait pas.
import { query } from '../db.js';
import { HttpError } from './errors.js';

/** Sous-requête SQL des projets visibles par le compte $n (propriétaire ou membre). */
export const visibleProjects = (param) => `(SELECT id FROM projects WHERE created_by = ${param}
  UNION SELECT project_id FROM project_members WHERE user_id = ${param} AND status = 'accepted')`;

/** 'owner', 'member' ou null (ni l'un ni l'autre, ou projet inexistant). */
export async function projectRole(userId, projectId) {
  const { rows } = await query(
    `SELECT p.created_by = $1 AS owner,
            EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $1 AND m.status = 'accepted') AS member
     FROM projects p WHERE p.id = $2`,
    [userId, projectId],
  );
  if (!rows[0]) return null;
  return rows[0].owner ? 'owner' : rows[0].member ? 'member' : null;
}

/**
 * Vérifie l'accès à un projet et renvoie le rôle : 'owner', 'member', 'admin' (lecture seule) ou 'lab'
 * (pas de projet : tout le labo). write : écrire dedans ; owner : le gérer (nom, partage, archivage).
 */
export async function assertProject(user, projectId, { write = false, owner = false } = {}) {
  if (!projectId) return 'lab';
  const role = await projectRole(user.id, projectId);
  if (role === 'owner') return role;
  if (role === 'member') {
    if (owner) throw new HttpError(403, 'Seul le propriétaire du projet peut faire cela.');
    return role;
  }
  if (user.is_admin) {
    if (write || owner) throw new HttpError(403, 'Lecture seule : vous n’êtes pas membre de ce projet.');
    const { rows } = await query('SELECT 1 FROM projects WHERE id = $1', [projectId]);
    if (rows[0]) return 'admin';
  }
  throw new HttpError(404, 'Projet introuvable');
}

async function projectOf(table, id, what) {
  const { rows } = await query(`SELECT project_id FROM ${table} WHERE id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, `${what} introuvable`);
  return rows[0].project_id;
}

/** Accès à une entrée (par son projet) ; renvoie le rôle. */
export async function assertEntry(user, entryId, opts) {
  return assertProject(user, await projectOf('entries', entryId, 'Entrée'), opts);
}

/** Accès à une séquence du registre : celles d'un projet suivent ses droits, les autres sont au labo. */
export async function assertSequence(user, sequenceId, opts) {
  return assertProject(user, await projectOf('sequences', sequenceId, 'Séquence'), opts);
}

export async function assertDataset(user, datasetId, opts) {
  return assertProject(user, await projectOf('datasets', datasetId, 'Jeu de données'), opts);
}

/** Accès à la pièce jointe d'une entrée. */
export async function assertAttachment(user, attachmentId) {
  const { rows } = await query('SELECT e.project_id FROM attachments a JOIN entries e ON e.id = a.entry_id WHERE a.id = $1', [attachmentId]);
  if (!rows[0]) throw new HttpError(404, 'Fichier introuvable');
  return assertProject(user, rows[0].project_id);
}

/** Identifiants des projets visibles par un compte (pour masquer ce qui renvoie à un projet privé). */
export async function visibleProjectIds(userId) {
  const { rows } = await query(`SELECT id FROM ${visibleProjects('$1')} v(id)`, [userId]);
  return new Set(rows.map((r) => r.id));
}
