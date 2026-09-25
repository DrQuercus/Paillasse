// Page Maintenance (administrateurs) : comptes, sauvegardes, base de données, fichiers, serveur.
// Rien ne s'efface : un compte se désactive, une destination de sauvegarde se retire, les fichiers
// orphelins sont signalés mais jamais supprimés. Chaque action est notée dans admin_log.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Router } from 'express';
import { config } from '../config.js';
import { pool, query } from '../db.js';
import { hashPassword, temporaryPassword } from '../auth.js';
// sessions_valid_after : toujours l'horloge de ce serveur (voir sessionUser)
import { HttpError, notFound } from '../lib/errors.js';
import { sha256File } from '../lib/hash.js';
import { getJob, listJobs, startJob } from '../lib/jobs.js';
import { serverLog } from '../lib/serverLog.js';
import { getSetting, logAdmin, setSetting } from '../lib/settings.js';
import { blobPath, blobsDir, tmpDir } from '../lib/storage.js';
import { verifyEntry } from '../lib/versions.js';
import {
  KINDS, anonymizeDeletedUser, cleanIds, deleteUser, forgetDeletedUser, purge, purgeImpact, userImpact,
} from '../lib/purge.js';
import {
  checkDest, dumpDatabase, ensureSshKey, stampOf, findTool, lastDue, listDumps, nextDue, parseDest, pgEnv, publicKey, safetyDir,
  startBackup, startRestore, testTarget, toolStatus, walkBlobs,
} from '../lib/backup.js';
import { verifySequence } from './sequences.js';

const router = Router();
const bad = (message) => new HttpError(400, message);
const appVersion = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
const startedAt = new Date();

async function diskOf(dir) {
  try {
    const st = await fs.promises.statfs(dir);
    return { total: st.blocks * st.bsize, free: st.bavail * st.bsize };
  } catch {
    return null;
  }
}

// --- Vue d'ensemble ------------------------------------------------------------------------------------

async function backupSummary() {
  const { rows: targets } = await query('SELECT count(*)::int AS n FROM backup_targets WHERE NOT archived AND enabled');
  const { rows: [lastOk] } = await query(`
    SELECT r.finished_at, r.dump_bytes, t.name FROM backup_runs r JOIN backup_targets t ON t.id = r.target_id
    WHERE r.status = 'ok' ORDER BY r.finished_at DESC LIMIT 1`);
  const { rows: [lastRun] } = await query(`
    SELECT r.status, r.started_at, r.finished_at, t.name FROM backup_runs r JOIN backup_targets t ON t.id = r.target_id
    ORDER BY r.started_at DESC LIMIT 1`);
  return { targets: targets[0].n, last_ok: lastOk ?? null, last_run: lastRun ?? null };
}

router.get('/overview', async (_req, res) => {
  const [{ rows: [db] }, { rows: [users] }, { rows: [files] }, disk, backups] = await Promise.all([
    query(`SELECT current_setting('server_version') AS version, pg_database_size(current_database())::bigint AS size,
                  (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections`),
    query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE disabled_at IS NULL)::int AS active,
                  count(*) FILTER (WHERE is_admin AND disabled_at IS NULL)::int AS admins,
                  count(*) FILTER (WHERE must_change_password AND disabled_at IS NULL)::int AS provisional
           FROM users WHERE deleted_at IS NULL`),
    query(`SELECT count(*)::int AS count, coalesce(sum(size_bytes), 0)::bigint AS bytes FROM (
             SELECT DISTINCT ON (sha256) sha256, size_bytes FROM (
               SELECT sha256, size_bytes FROM attachments UNION ALL SELECT sha256, size_bytes FROM board_images
               UNION ALL SELECT sha256, size_bytes FROM sequence_files) a) b`),
    diskOf(config.dataDir),
    backupSummary(),
  ]);
  const maintenance = getSetting('maintenance');
  const warnings = [];
  const hoursSince = (d) => (d ? (Date.now() - new Date(d).getTime()) / 3_600_000 : Infinity);
  if (!backups.targets) warnings.push({ level: 'danger', tab: 'sauvegardes', text: 'Aucune sauvegarde configurée : ajoutez une destination (NAS, disque ou serveur SSH).' });
  else if (hoursSince(backups.last_ok?.finished_at) > 36) warnings.push({ level: 'danger', tab: 'sauvegardes', text: backups.last_ok ? 'Dernière sauvegarde réussie il y a plus de 36 h.' : 'Aucune sauvegarde réussie pour l’instant.' });
  if (backups.last_run?.status === 'failed') warnings.push({ level: 'warn', tab: 'sauvegardes', text: `La dernière sauvegarde (« ${backups.last_run.name} ») a échoué.` });
  if (disk && disk.free / disk.total < 0.1) warnings.push({ level: 'danger', tab: 'fichiers', text: 'Moins de 10 % d’espace libre sur le disque des données.' });
  else if (disk && disk.free / disk.total < 0.2) warnings.push({ level: 'warn', tab: 'fichiers', text: 'Moins de 20 % d’espace libre sur le disque des données.' });
  if (!findTool('pg_dump')) warnings.push({ level: 'warn', tab: 'serveur', text: 'pg_dump introuvable : les sauvegardes de la base ne peuvent pas se faire (sudo apt install postgresql-client).' });
  if (process.env.ADMIN_PASSWORD) warnings.push({ level: 'warn', tab: 'serveur', text: 'ADMIN_PASSWORD est encore dans server/.env : retirez-le.' });
  if (maintenance.on) warnings.push({ level: 'warn', tab: 'ensemble', text: 'Mode maintenance actif : seuls les administrateurs peuvent travailler.' });
  if (users.admins < 2) warnings.push({ level: 'info', tab: 'comptes', text: 'Un seul administrateur : créez-en un second, en secours.' });
  res.json({
    server: {
      version: appVersion, node: process.version, started_at: startedAt, uptime: process.uptime(), hostname: os.hostname(),
      platform: `${os.type()} ${os.release()}`, memory: process.memoryUsage().rss, load: os.loadavg(), cpus: os.cpus().length,
    },
    db: { ok: true, ...db, size: Number(db.size) },
    users,
    files: { ...files, bytes: Number(files.bytes) },
    disk,
    backups,
    maintenance,
    warnings,
    jobs: listJobs().filter((j) => j.status === 'running'),
  });
});

router.get('/maintenance', (_req, res) => res.json(getSetting('maintenance')));
router.put('/maintenance', async (req, res) => {
  const on = Boolean(req.body?.on);
  const message = String(req.body?.message ?? '').trim().slice(0, 300);
  const value = await setSetting('maintenance', { on, message }, req.user.id);
  await logAdmin(req.user, on ? 'Mode maintenance activé' : 'Mode maintenance levé', message);
  res.json(value);
});

// --- Comptes -------------------------------------------------------------------------------------------

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,39}$/;

async function loadUser(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Compte');
  return rows[0];
}

async function activeAdmins(exceptId = null) {
  const { rows } = await query('SELECT count(*)::int AS n FROM users WHERE is_admin AND disabled_at IS NULL AND id <> coalesce($1::uuid, gen_random_uuid())', [exceptId]);
  return rows[0].n;
}

router.get('/users', async (_req, res) => {
  const { rows } = await query(`
    SELECT u.id, u.username, u.display_name, u.is_admin, u.disabled_at, u.must_change_password, u.last_login_at, u.created_at,
           (SELECT count(*)::int FROM entries e WHERE e.created_by = u.id) AS entries,
           (SELECT max(e.updated_at) FROM entries e WHERE e.created_by = u.id) AS last_entry_at
    FROM users u WHERE u.deleted_at IS NULL ORDER BY u.disabled_at IS NOT NULL, u.display_name`);
  res.json(rows);
});

/** Comptes supprimés dont le nom signe encore des versions figées. */
router.get('/users/deleted', async (_req, res) => {
  const { rows } = await query(`
    SELECT u.id, u.display_name, u.deleted_at,
           (SELECT count(*)::int FROM entries e WHERE e.created_by = u.id) AS entries,
           (SELECT count(*)::int FROM entry_versions v WHERE v.created_by = u.id)
             + (SELECT count(*)::int FROM attachments a WHERE a.created_by = u.id)
             + (SELECT count(*)::int FROM sequences s WHERE s.created_by = u.id)
             + (SELECT count(*)::int FROM sequence_versions v WHERE v.created_by = u.id)
             + (SELECT count(*)::int FROM sequence_files f WHERE f.created_by = u.id)
             + (SELECT count(*)::int FROM projects p WHERE p.created_by = u.id) AS sealed
    FROM users u WHERE u.deleted_at IS NOT NULL ORDER BY u.deleted_at DESC`);
  res.json(rows);
});

router.get('/users/:id/impact', async (req, res) => {
  const user = await loadUser(req.params.id);
  res.json({ user: { id: user.id, username: user.username, display_name: user.display_name, is_admin: user.is_admin }, ...(await userImpact(user.id)) });
});

/**
 * Supprimer un compte : confirmation par son identifiant, copie de sécurité avant (conseillée).
 * data : 'keep' (ses entrées restent, signées de son nom ou anonymisées) ou 'delete' (ses données partent avec lui).
 */
router.post('/users/:id/delete', async (req, res) => {
  const user = await loadUser(req.params.id);
  if (user.deleted_at) throw bad('Ce compte est déjà supprimé.');
  if (user.id === req.user.id) throw bad('Vous ne pouvez pas supprimer votre propre compte.');
  if (user.is_admin && !user.disabled_at && (await activeAdmins(user.id)) === 0) throw bad('Il faut garder au moins un administrateur actif.');
  if (String(req.body?.confirm ?? '') !== user.username) throw bad(`Tapez l’identifiant « ${user.username} » pour confirmer.`);
  const data = req.body?.data === 'delete' ? 'delete' : 'keep';
  const anonymize = Boolean(req.body?.anonymize);
  const job = startJob('purge', `Suppression du compte ${user.display_name}`, async (j) => {
    if (req.body?.safety !== false) await safetyCopy(j);
    j.log(data === 'delete' ? 'Suppression du compte et de ses données…' : 'Suppression du compte (ses entrées restent)…');
    const r = await deleteUser(user.id, { data, anonymize, actorId: req.user.id });
    const removed = Object.entries(r.removed).filter(([, n]) => n).map(([k, n]) => `${n} ${REMOVED_LABELS[k] ?? k}`);
    j.log(removed.length ? `Supprimé : ${removed.join(', ')}.` : 'Aucune donnée supprimée.');
    j.log(r.full ? 'Le compte a entièrement disparu.' : `Le compte est supprimé ; ${anonymize ? '« Compte supprimé »' : `le nom « ${user.display_name} »`} reste sur ses entrées et versions figées.`);
    await logAdmin(req.user, 'Compte supprimé', `${user.username} (${user.display_name}) : ${data === 'delete' ? 'avec ses données' : 'données gardées'}${anonymize ? ', anonymisé' : ''}${removed.length ? ` ; ${removed.join(', ')}` : ''}`);
    return { ...r, removed_text: removed };
  }, { exclusive: 'backup', user: req.user });
  res.status(202).json(getJob(job.id));
});

router.post('/users/:id/forget', async (req, res) => {
  const user = await loadUser(req.params.id);
  if (!user.deleted_at) throw bad('Supprimez d’abord le compte.');
  await forgetDeletedUser(user.id);
  await logAdmin(req.user, 'Compte effacé', `${user.display_name} : plus aucune trace dans la base`);
  res.json({ ok: true });
});

router.post('/users/:id/anonymize', async (req, res) => {
  const user = await loadUser(req.params.id);
  if (!user.deleted_at) throw bad('Seul un compte supprimé s’anonymise.');
  await anonymizeDeletedUser(user.id);
  await logAdmin(req.user, 'Compte anonymisé', `${user.display_name} devient « Compte supprimé » sur ses entrées`);
  res.json({ ok: true });
});

router.post('/users', async (req, res) => {
  const username = String(req.body?.username ?? '').trim().toLowerCase();
  const displayName = String(req.body?.display_name ?? '').trim().slice(0, 80) || username;
  if (!USERNAME_RE.test(username)) throw bad('Identifiant : 2 à 40 caractères, lettres minuscules, chiffres, point, tiret ou soulignement.');
  let password = String(req.body?.password ?? '');
  const provisional = !password;
  if (provisional) password = temporaryPassword();
  else if (password.length < 8) throw bad('Le mot de passe doit faire au moins 8 caractères.');
  const { rows: exists } = await query('SELECT 1 FROM users WHERE username = $1', [username]);
  if (exists.length) throw new HttpError(409, `L’identifiant « ${username} » est déjà pris.`);
  const { rows: [user] } = await query(
    `INSERT INTO users (username, display_name, password_hash, is_admin, must_change_password)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, username, display_name, is_admin`,
    [username, displayName, hashPassword(password), Boolean(req.body?.is_admin), provisional],
  );
  await logAdmin(req.user, 'Compte créé', `${username} (${displayName})${user.is_admin ? ', administrateur' : ''}`);
  res.status(201).json({ user, password: provisional ? password : null });
});

router.put('/users/:id', async (req, res) => {
  const user = await loadUser(req.params.id);
  const changes = [];
  let displayName = user.display_name;
  let isAdmin = user.is_admin;
  if (req.body?.display_name !== undefined) {
    displayName = String(req.body.display_name).trim().slice(0, 80);
    if (!displayName) throw bad('Le nom affiché ne peut pas être vide.');
    if (displayName !== user.display_name) changes.push(`nom : ${displayName}`);
  }
  if (req.body?.is_admin !== undefined && Boolean(req.body.is_admin) !== user.is_admin) {
    isAdmin = Boolean(req.body.is_admin);
    if (!isAdmin && !user.disabled_at && (await activeAdmins(user.id)) === 0) throw bad('Il faut garder au moins un administrateur actif.');
    changes.push(isAdmin ? 'devient administrateur' : 'n’est plus administrateur');
  }
  await query('UPDATE users SET display_name = $2, is_admin = $3 WHERE id = $1', [user.id, displayName, isAdmin]);
  if (changes.length) await logAdmin(req.user, 'Compte modifié', `${user.username} : ${changes.join(', ')}`);
  res.json({ ok: true });
});

router.post('/users/:id/password', async (req, res) => {
  const user = await loadUser(req.params.id);
  let password = String(req.body?.password ?? '');
  const provisional = !password;
  if (provisional) password = temporaryPassword();
  else if (password.length < 8) throw bad('Le mot de passe doit faire au moins 8 caractères.');
  await query(
    'UPDATE users SET password_hash = $2, must_change_password = $3, sessions_valid_after = $4 WHERE id = $1',
    [user.id, hashPassword(password), provisional, new Date()],
  );
  await logAdmin(req.user, 'Mot de passe réinitialisé', `${user.username}${provisional ? ' (mot de passe provisoire)' : ''}`);
  res.json({ password: provisional ? password : null });
});

router.post('/users/:id/disable', async (req, res) => {
  const user = await loadUser(req.params.id);
  if (user.id === req.user.id) throw bad('Vous ne pouvez pas désactiver votre propre compte.');
  if (user.is_admin && (await activeAdmins(user.id)) === 0) throw bad('Il faut garder au moins un administrateur actif.');
  await query('UPDATE users SET disabled_at = now(), sessions_valid_after = $2 WHERE id = $1 AND disabled_at IS NULL', [user.id, new Date()]);
  await logAdmin(req.user, 'Compte désactivé', user.username);
  res.json({ ok: true });
});

router.post('/users/:id/enable', async (req, res) => {
  const user = await loadUser(req.params.id);
  await query('UPDATE users SET disabled_at = NULL WHERE id = $1', [user.id]);
  await logAdmin(req.user, 'Compte réactivé', user.username);
  res.json({ ok: true });
});

router.post('/users/:id/logout', async (req, res) => {
  const user = await loadUser(req.params.id);
  await query('UPDATE users SET sessions_valid_after = $2 WHERE id = $1', [user.id, new Date()]);
  await logAdmin(req.user, 'Sessions fermées', `${user.username} est déconnecté de tous ses appareils`);
  res.json({ ok: true });
});

// --- Journal et tâches ------------------------------------------------------------------------------------

router.get('/log', async (_req, res) => {
  const { rows } = await query('SELECT id, at, user_name, action, detail FROM admin_log ORDER BY at DESC, id DESC LIMIT 300');
  res.json({ admin: rows, server: serverLog() });
});

router.get('/jobs', (_req, res) => res.json(listJobs()));
router.get('/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) throw notFound('Tâche');
  res.json(job);
});

// --- Base de données ----------------------------------------------------------------------------------

router.get('/db', async (_req, res) => {
  const [{ rows: [info] }, { rows: tables }, { rows: applied }] = await Promise.all([
    query(`SELECT current_setting('server_version') AS version, current_database() AS name, current_user AS role,
                  pg_database_size(current_database())::bigint AS size, pg_postmaster_start_time() AS started_at,
                  (SELECT count(*)::int FROM pg_stat_activity WHERE datname = current_database()) AS connections`),
    query(`SELECT relname AS name, n_live_tup::bigint AS rows, pg_total_relation_size(relid)::bigint AS bytes,
                  greatest(last_vacuum, last_autovacuum) AS vacuumed, greatest(last_analyze, last_autoanalyze) AS analyzed
           FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC`),
    query('SELECT name, applied_at FROM schema_migrations ORDER BY name'),
  ]);
  const files = fs.readdirSync(config.migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const done = new Set(applied.map((m) => m.name));
  res.json({
    ...info,
    size: Number(info.size),
    tables: tables.map((t) => ({ ...t, rows: Number(t.rows), bytes: Number(t.bytes) })),
    migrations: { applied, pending: files.filter((f) => !done.has(f)) },
    tools: toolStatus().filter((t) => ['pg_dump', 'pg_restore', 'psql'].includes(t.name)),
  });
});

router.post('/db/vacuum', (req, res) => {
  const job = startJob('vacuum', 'Optimisation de la base (VACUUM ANALYZE)', async (j) => {
    j.log('VACUUM ANALYZE…');
    const t0 = Date.now();
    await query('VACUUM (ANALYZE)');
    j.log(`Terminé en ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
    await logAdmin(req.user, 'Base optimisée', 'VACUUM ANALYZE');
  }, { exclusive: 'db', user: req.user });
  res.status(202).json(getJob(job.id));
});

/** Vérifie toutes les chaînes d'empreintes : entrées (versions figées, pièces jointes) et séquences. */
router.post('/db/verify', (req, res) => {
  const job = startJob('verify', 'Vérification d’intégrité de tout le cahier', async (j) => {
    const { rows: entries } = await query('SELECT id, title FROM entries ORDER BY created_at');
    const { rows: sequences } = await query('SELECT id, name, code FROM sequences ORDER BY created_at');
    const total = entries.length + sequences.length;
    const problems = [];
    let n = 0;
    j.log(`${entries.length} entrée(s) et ${sequences.length} séquence(s) à vérifier.`);
    for (const e of entries) {
      const r = await verifyEntry({ query }, e.id);
      if (!r.ok) problems.push({ kind: 'entry', id: e.id, title: e.title, issues: r.issues });
      j.progress(++n, total);
    }
    for (const s of sequences) {
      const r = await verifySequence(s.id);
      if (!r.ok) problems.push({ kind: 'sequence', id: s.id, title: `${s.code} ${s.name}`, issues: r.issues });
      j.progress(++n, total);
    }
    j.log(problems.length ? `${problems.length} élément(s) à examiner.` : 'Tout concorde : empreintes, chaînes et fichiers.');
    await logAdmin(req.user, 'Intégrité vérifiée', `${entries.length} entrées, ${sequences.length} séquences : ${problems.length ? `${problems.length} problème(s)` : 'tout concorde'}`);
    return { entries: entries.length, sequences: sequences.length, problems };
  }, { exclusive: 'db', user: req.user });
  res.status(202).json(getJob(job.id));
});

/**
 * Console SQL en lecture seule : une seule instruction (protocole étendu), transaction READ ONLY,
 * 10 s au plus, 500 lignes affichées. Pour consulter, jamais pour modifier.
 */
router.post('/db/query', async (req, res) => {
  const sql = String(req.body?.sql ?? '').trim().replace(/;\s*$/, '');
  if (!sql) throw bad('Écrivez une requête.');
  if (sql.length > 20_000) throw bad('Requête trop longue.');
  const client = await pool.connect();
  const t0 = Date.now();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await client.query({ text: sql, queryMode: 'extended', rowMode: 'array' });
    const rows = result.rows ?? [];
    res.json({
      fields: (result.fields ?? []).map((f) => f.name),
      rows: rows.slice(0, 500).map((r) => r.map((v) => (v instanceof Date ? v.toISOString() : v !== null && typeof v === 'object' ? JSON.stringify(v) : v))),
      total: rows.length,
      command: result.command,
      ms: Date.now() - t0,
    });
  } catch (err) {
    throw bad(`PostgreSQL : ${err.message}`);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
});

/** Copie de la base téléchargée tout de suite (format pg_dump « custom », pour pg_restore). */
router.get('/db/dump', async (req, res) => {
  if (!findTool('pg_dump')) throw new HttpError(501, 'pg_dump introuvable sur le serveur (sudo apt install postgresql-client).');
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `paillasse_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}.dump`;
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges'], { env: pgEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (c) => { stderr += c; });
  res.attachment(name).type('application/octet-stream');
  child.stdout.pipe(res);
  child.on('close', (code) => {
    if (code !== 0) {
      console.error('Téléchargement de la base : pg_dump a échoué', stderr.trim());
      res.destroy();
    }
  });
  req.on('close', () => { if (child.exitCode === null) child.kill(); });
  await logAdmin(req.user, 'Base téléchargée', name);
});

// --- Fichiers ------------------------------------------------------------------------------------------

const REFERENCED_SQL = `
  SELECT sha256, max(size_bytes)::bigint AS size, min(filename) AS filename, min(src) AS src FROM (
    SELECT sha256, size_bytes, filename, 'entrée' AS src FROM attachments
    UNION ALL SELECT sha256, size_bytes, filename, 'tableau' FROM board_images
    UNION ALL SELECT sha256, size_bytes, filename, 'séquence' FROM sequence_files) f
  GROUP BY sha256`;

router.get('/files', async (_req, res) => {
  const [disk, blobs, { rows: counts }, { rows: largest }] = await Promise.all([
    diskOf(config.dataDir),
    walkBlobs(),
    query(`SELECT 'attachments' AS t, count(*)::int AS n, coalesce(sum(size_bytes), 0)::bigint AS bytes FROM attachments
           UNION ALL SELECT 'board_images', count(*)::int, coalesce(sum(size_bytes), 0)::bigint FROM board_images
           UNION ALL SELECT 'sequence_files', count(*)::int, coalesce(sum(size_bytes), 0)::bigint FROM sequence_files`),
    query(`SELECT a.id, a.filename, a.size_bytes::bigint AS bytes, a.created_at, e.id AS entry_id, e.title AS entry_title
           FROM attachments a JOIN entries e ON e.id = a.entry_id ORDER BY a.size_bytes DESC LIMIT 10`),
  ]);
  const tmp = fs.existsSync(tmpDir) ? await fs.promises.readdir(tmpDir, { withFileTypes: true }) : [];
  let tmpBytes = 0;
  let tmpOld = 0;
  for (const f of tmp) {
    const st = await fs.promises.stat(path.join(tmpDir, f.name)).catch(() => null);
    if (!st) continue;
    tmpBytes += st.isFile() ? st.size : 0;
    if (Date.now() - st.mtimeMs > 3_600_000) tmpOld += 1;
  }
  const safety = fs.existsSync(safetyDir)
    ? (await fs.promises.readdir(safetyDir)).filter((n) => n.endsWith('.dump')).sort().reverse().map((name) => {
      const st = fs.statSync(path.join(safetyDir, name));
      return { name, bytes: st.size, date: st.mtime };
    })
    : [];
  res.json({
    data_dir: config.dataDir,
    disk,
    blobs: { count: blobs.length, bytes: blobs.reduce((s, b) => s + b.size, 0) },
    db: Object.fromEntries(counts.map((c) => [c.t, { count: c.n, bytes: Number(c.bytes) }])),
    tmp: { count: tmp.length, bytes: tmpBytes, old: tmpOld },
    largest: largest.map((l) => ({ ...l, bytes: Number(l.bytes) })),
    safety,
  });
});

/** Fichiers manquants (connus de la base, absents du disque), orphelins, et altérés (relecture complète). */
router.post('/files/check', (req, res) => {
  const deep = Boolean(req.body?.deep);
  const job = startJob('files', deep ? 'Relecture complète des fichiers' : 'Vérification des fichiers', async (j) => {
    const { rows: known } = await query(REFERENCED_SQL);
    const onDisk = await walkBlobs();
    const diskSet = new Set(onDisk.map((b) => b.rel.split('/')[1]));
    const knownSet = new Set(known.map((k) => k.sha256));
    const missing = known.filter((k) => !diskSet.has(k.sha256)).map((k) => ({ sha256: k.sha256, filename: k.filename, src: k.src, size: Number(k.size) }));
    const orphans = onDisk.filter((b) => !knownSet.has(b.rel.split('/')[1])).map((b) => ({ sha256: b.rel.split('/')[1], size: b.size }));
    j.log(`${known.length} fichier(s) connus de la base, ${onDisk.length} sur le disque.`);
    const altered = [];
    if (deep) {
      const present = known.filter((k) => diskSet.has(k.sha256));
      j.progress(0, present.length);
      for (let i = 0; i < present.length; i += 1) {
        const k = present[i];
        if ((await sha256File(blobPath(k.sha256))) !== k.sha256) altered.push({ sha256: k.sha256, filename: k.filename, src: k.src });
        j.progress(i + 1, present.length);
      }
      j.log(`${present.length} fichier(s) relus octet par octet : ${altered.length ? `${altered.length} altéré(s)` : 'tous intacts'}.`);
    }
    const summary = `${missing.length} manquant(s), ${orphans.length} orphelin(s)${deep ? `, ${altered.length} altéré(s)` : ''}`;
    j.log(summary);
    await logAdmin(req.user, deep ? 'Fichiers relus' : 'Fichiers vérifiés', summary);
    return { known: known.length, on_disk: onDisk.length, missing, orphans: orphans.slice(0, 200), orphan_count: orphans.length, altered, deep };
  }, { exclusive: 'files', user: req.user });
  res.status(202).json(getJob(job.id));
});

/** Fichiers temporaires d'envois interrompus, vieux de plus d'une heure. */
router.post('/files/clean-tmp', async (req, res) => {
  let removed = 0;
  let bytes = 0;
  for (const f of fs.existsSync(tmpDir) ? await fs.promises.readdir(tmpDir) : []) {
    const p = path.join(tmpDir, f);
    const st = await fs.promises.stat(p).catch(() => null);
    if (!st || Date.now() - st.mtimeMs < 3_600_000) continue;
    await fs.promises.rm(p, { recursive: true, force: true });
    removed += 1;
    bytes += st.isFile() ? st.size : 0;
  }
  await logAdmin(req.user, 'Fichiers temporaires vidés', `${removed} élément(s)`);
  res.json({ removed, bytes });
});

router.delete('/files/safety/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  const p = path.join(safetyDir, name);
  if (!name.endsWith('.dump') || !fs.existsSync(p)) throw notFound('Copie de sécurité');
  await fs.promises.unlink(p);
  await logAdmin(req.user, 'Copie de sécurité supprimée', name);
  res.json({ ok: true });
});

/** Fichiers que plus rien ne cite (entrées supprimées, envois interrompus) : effacés du disque. */
router.post('/files/purge-orphans', async (req, res) => {
  if (String(req.body?.confirm ?? '') !== 'SUPPRIMER') throw bad('Tapez SUPPRIMER pour confirmer.');
  const { rows } = await query(REFERENCED_SQL);
  const known = new Set(rows.map((r) => r.sha256));
  let removed = 0;
  let bytes = 0;
  for (const b of await walkBlobs()) {
    const sha = b.rel.split('/')[1];
    if (known.has(sha) || !/^[0-9a-f]{64}$/.test(sha)) continue;
    await fs.promises.unlink(b.abs);
    removed += 1;
    bytes += b.size;
  }
  await logAdmin(req.user, 'Fichiers orphelins supprimés', `${removed} fichier(s), ${Math.round(bytes / 1024)} Ko`);
  res.json({ removed, bytes });
});

router.get('/files/safety/:name', async (req, res) => {
  const name = path.basename(req.params.name);
  const p = path.join(safetyDir, name);
  if (!name.endsWith('.dump') || !fs.existsSync(p)) throw notFound('Copie de sécurité');
  res.download(p, name);
});

// --- Sauvegardes ---------------------------------------------------------------------------------------

function cleanTarget(body, partial = false) {
  const out = {};
  if (!partial || body.name !== undefined) {
    out.name = String(body.name ?? '').trim().slice(0, 80);
    if (!out.name) throw bad('Donnez un nom à la destination (ex. NAS du labo).');
  }
  if (!partial || body.dest !== undefined) {
    out.dest = String(body.dest ?? '').trim();
    const why = checkDest(out.dest);
    if (why) throw bad(why);
    out.dest = parseDest(out.dest).kind === 'local' ? parseDest(out.dest).path : out.dest;
  }
  if (!partial || body.port !== undefined) {
    const port = body.port === '' || body.port == null ? null : Math.trunc(Number(body.port));
    if (port !== null && !(port >= 1 && port <= 65535)) throw bad('Port SSH entre 1 et 65535.');
    out.port = port;
  }
  if (!partial || body.schedule !== undefined) {
    out.schedule = String(body.schedule ?? '').trim();
    if (out.schedule && !/^([01]\d|2[0-3]):[0-5]\d$/.test(out.schedule)) throw bad('Heure de sauvegarde au format HH:MM (ou vide : à la demande).');
  }
  if (!partial || body.keep !== undefined) {
    out.keep = Math.trunc(Number(body.keep ?? 30));
    if (!(out.keep >= 1 && out.keep <= 1000)) throw bad('Nombre de sauvegardes à garder : de 1 à 1000.');
  }
  if (!partial || body.enabled !== undefined) out.enabled = body.enabled === undefined ? true : Boolean(body.enabled);
  return out;
}

async function loadTarget(id) {
  const { rows } = await query('SELECT * FROM backup_targets WHERE id = $1 AND NOT archived', [id]);
  if (!rows[0]) throw notFound('Destination de sauvegarde');
  return rows[0];
}

router.get('/backups', async (_req, res) => {
  const [{ rows: targets }, { rows: runs }] = await Promise.all([
    query(`SELECT t.*,
             (SELECT row_to_json(r) FROM (SELECT status, started_at, finished_at, dump_bytes FROM backup_runs WHERE target_id = t.id ORDER BY started_at DESC LIMIT 1) r) AS last_run,
             (SELECT max(finished_at) FROM backup_runs WHERE target_id = t.id AND status = 'ok') AS last_ok
           FROM backup_targets t WHERE NOT t.archived ORDER BY t.created_at`),
    query(`SELECT r.id, r.target_id, t.name AS target_name, r.trigger, r.status, r.started_at, r.finished_at, r.dump_name,
                  r.dump_bytes, r.blobs_copied, u.display_name AS started_by
           FROM backup_runs r JOIN backup_targets t ON t.id = r.target_id LEFT JOIN users u ON u.id = r.started_by
           ORDER BY r.started_at DESC LIMIT 60`),
  ]);
  res.json({
    targets: targets.map((t) => ({
      ...t,
      kind: parseDest(t.dest)?.kind ?? 'local',
      next_at: t.enabled && t.schedule ? nextDue(t.schedule).toISOString() : null,
      due_now: Boolean(t.enabled && t.schedule && lastDue(t.schedule) >= t.created_at && (!t.last_run || new Date(t.last_run.started_at) < lastDue(t.schedule))),
    })),
    runs,
    tools: toolStatus().filter((t) => ['pg_dump', 'pg_restore', 'psql', 'rsync', 'ssh', 'ssh-keygen'].includes(t.name)),
    public_key: publicKey(),
    server_time: new Date().toISOString(),
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    jobs: listJobs().filter((j) => ['backup', 'restore'].includes(j.kind)).slice(0, 5),
  });
});

router.get('/backups/runs/:id', async (req, res) => {
  const { rows } = await query('SELECT * FROM backup_runs WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound('Sauvegarde');
  res.json(rows[0]);
});

router.post('/backups/targets', async (req, res) => {
  const t = cleanTarget(req.body ?? {});
  const { rows: [target] } = await query(
    `INSERT INTO backup_targets (name, dest, port, schedule, keep, enabled, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [t.name, t.dest, t.port, t.schedule, t.keep, t.enabled, req.user.id],
  );
  await logAdmin(req.user, 'Destination de sauvegarde ajoutée', `${t.name} : ${t.dest}${t.schedule ? `, chaque jour à ${t.schedule}` : ', à la demande'}`);
  res.status(201).json(target);
});

router.put('/backups/targets/:id', async (req, res) => {
  const target = await loadTarget(req.params.id);
  const t = { ...target, ...cleanTarget(req.body ?? {}, true) };
  await query('UPDATE backup_targets SET name = $2, dest = $3, port = $4, schedule = $5, keep = $6, enabled = $7 WHERE id = $1',
    [target.id, t.name, t.dest, t.port, t.schedule, t.keep, t.enabled]);
  await logAdmin(req.user, 'Destination de sauvegarde modifiée', `${t.name} : ${t.dest}, ${t.enabled ? (t.schedule ? `chaque jour à ${t.schedule}` : 'à la demande') : 'suspendue'}, garder ${t.keep}`);
  res.json({ ok: true });
});

router.post('/backups/targets/:id/archive', async (req, res) => {
  const target = await loadTarget(req.params.id);
  await query('UPDATE backup_targets SET archived = true, enabled = false WHERE id = $1', [target.id]);
  await logAdmin(req.user, 'Destination de sauvegarde retirée', `${target.name} : ${target.dest} (les sauvegardes déjà faites y restent)`);
  res.json({ ok: true });
});

router.post('/backups/targets/:id/test', async (req, res) => {
  const target = await loadTarget(req.params.id);
  try {
    res.json(await testTarget(target));
  } catch (err) {
    const hint = /Permission denied|publickey/i.test(err.message)
      ? 'Le serveur de sauvegarde refuse la clé : ajoutez la clé publique de Paillasse (ci-dessous) à ~/.ssh/authorized_keys de ce compte.'
      : /Could not resolve|Name or service not known|timed out|No route|refused/i.test(err.message)
        ? 'Hôte injoignable : vérifiez le nom, le port et le réseau.'
        : /EACCES|permission/i.test(err.message) ? 'Pas le droit d’écrire là : vérifiez les permissions du dossier pour l’utilisateur du service.' : '';
    res.json({ ok: false, lines: [err.message], warnings: hint ? [hint] : [] });
  }
});

router.post('/backups/targets/:id/run', async (req, res) => {
  const target = await loadTarget(req.params.id);
  const job = startBackup(target, { trigger: 'manual', user: req.user });
  await logAdmin(req.user, 'Sauvegarde lancée', target.name);
  res.status(202).json(getJob(job.id));
});

router.post('/backups/run-all', async (req, res) => {
  const { rows } = await query('SELECT * FROM backup_targets WHERE NOT archived AND enabled ORDER BY created_at');
  if (!rows.length) throw bad('Aucune destination de sauvegarde active.');
  // Les destinations passent l'une après l'autre
  const job = startJob('backup-all', `Sauvegarde vers ${rows.length} destination(s)`, async (j) => {
    const results = [];
    for (const t of rows) {
      j.log(`→ ${t.name}`);
      const sub = startBackup(t, { trigger: 'manual', user: req.user });
      while (getJob(sub.id)?.status === 'running') await new Promise((r) => setTimeout(r, 500));
      const done = getJob(sub.id);
      j.log(`${t.name} : ${done.status === 'ok' ? 'réussie' : `échec (${done.error})`}`);
      results.push({ target: t.name, status: done.status, error: done.error });
      j.progress(results.length, rows.length);
    }
    if (results.some((r) => r.status !== 'ok')) throw new Error(`${results.filter((r) => r.status !== 'ok').length} destination(s) en échec.`);
    return results;
  }, { exclusive: 'backup-all', user: req.user });
  await logAdmin(req.user, 'Sauvegarde lancée', `toutes les destinations (${rows.length})`);
  res.status(202).json(getJob(job.id));
});

router.get('/backups/targets/:id/dumps', async (req, res) => {
  const target = await loadTarget(req.params.id);
  try {
    res.json(await listDumps(target));
  } catch (err) {
    throw bad(err.message);
  }
});

router.post('/backups/ssh-key', async (req, res) => {
  const key = await ensureSshKey();
  await logAdmin(req.user, 'Clé SSH du serveur', 'clé publique affichée ou créée');
  res.json({ public_key: key });
});

/** Restauration : mode maintenance obligatoire et confirmation tapée en toutes lettres. */
router.post('/backups/restore', async (req, res) => {
  if (!getSetting('maintenance').on) throw bad('Activez d’abord le mode maintenance : personne ne doit écrire pendant la restauration.');
  if (String(req.body?.confirm ?? '') !== 'RESTAURER') throw bad('Tapez RESTAURER pour confirmer.');
  const dump = String(req.body?.dump ?? '');
  let source;
  if (req.body?.safety) source = { safety: true };
  else source = { target: await loadTarget(req.body?.target_id) };
  const job = startRestore({ ...source, dumpName: dump }, req.user);
  await logAdmin(req.user, 'Restauration lancée', `${dump}${source.target ? ` depuis « ${source.target.name} »` : ' (copie de sécurité)'}`);
  res.status(202).json(getJob(job.id));
});

// --- Données : parcourir et supprimer ----------------------------------------------------------------------

const REMOVED_LABELS = {
  entries: 'entrée(s)', versions: 'version(s) figée(s)', attachments: 'pièce(s) jointe(s)', projects: 'projet(s)', notes: 'post-it',
  datasets: 'jeu(x) de données', sequences: 'séquence(s)', files: 'fichier(s) d’origine', units: 'contenant(s)', samples: 'tube(s)',
  reagents: 'produit(s)', ladders: 'marqueur(s)', templates: 'modèle(s)', templates_retired: 'modèle(s) de base retiré(s)',
};

async function safetyCopy(job) {
  job.log('Copie de sécurité de la base avant suppression…');
  const file = path.join(safetyDir, `paillasse_avant-suppression_${stampOf()}.dump`);
  await dumpDatabase(file, job);
  job.log(`Copie de sécurité : ${path.basename(file)} (Sauvegardes › Copies de sécurité pour revenir en arrière).`);
}

router.get('/data/entries', async (req, res) => {
  const where = [];
  const params = [];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('$?', `$${params.length}`)); };
  if (req.query.q) {
    params.push(String(req.query.q));
    where.push(`(e.title ILIKE '%' || $${params.length} || '%' OR e.plain_text ILIKE '%' || $${params.length} || '%')`);
  }
  if (req.query.project) add('e.project_id = $?', String(req.query.project));
  if (req.query.author) add('e.created_by = $?', String(req.query.author));
  if (req.query.status === 'draft' || req.query.status === 'locked') add('e.status = $?', req.query.status);
  if (req.query.status === 'archived') where.push('e.archived');
  if (req.query.before) add('e.entry_date < $?::date', String(req.query.before));
  const { rows } = await query(`
    SELECT e.id, e.title, e.entry_date, e.status, e.archived, e.updated_at, e.parent_entry_id,
           p.name AS project, p.color AS project_color, u.display_name AS author, e.version_count AS versions,
           (SELECT count(*)::int FROM attachments a WHERE a.entry_id = e.id) AS files
    FROM entries e JOIN projects p ON p.id = e.project_id JOIN users u ON u.id = e.created_by
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY e.entry_date DESC, e.created_at DESC LIMIT 500`, params);
  res.json(rows);
});

router.get('/data/projects', async (_req, res) => {
  const { rows } = await query(`
    SELECT p.id, p.name, p.color, p.archived, p.created_at, u.display_name AS owner,
           (SELECT count(*)::int FROM entries e WHERE e.project_id = p.id) AS entries,
           (SELECT count(*)::int FROM entries e WHERE e.project_id = p.id AND e.status = 'locked') AS locked,
           (SELECT count(*)::int FROM sequences s WHERE s.project_id = p.id) AS sequences,
           (SELECT count(*)::int FROM datasets d WHERE d.project_id = p.id) AS datasets,
           (SELECT count(*)::int FROM board_notes n WHERE n.project_id = p.id AND n.deleted_at IS NULL) AS notes
    FROM projects p JOIN users u ON u.id = p.created_by ORDER BY p.archived, p.name`);
  res.json(rows);
});

router.get('/data/sequences', async (_req, res) => {
  const { rows } = await query(`
    SELECT s.id, s.code, s.name, s.archived, s.updated_at, p.name AS project, u.display_name AS author,
           (SELECT count(*)::int FROM sequence_versions v WHERE v.sequence_id = s.id) AS versions
    FROM sequences s JOIN users u ON u.id = s.created_by LEFT JOIN projects p ON p.id = s.project_id ORDER BY s.code`);
  res.json(rows);
});

router.get('/data/storage', async (_req, res) => {
  const { rows: units } = await query(`
    WITH RECURSIVE t(root, id) AS (
      SELECT id, id FROM storage_units WHERE parent_id IS NULL OR kind IN ('freezer', 'fridge', 'tank', 'cabinet')
      UNION SELECT t.root, u.id FROM storage_units u JOIN t ON u.parent_id = t.id)
    SELECT u.id, u.name, u.kind, u.archived, u.parent_id, pu.name AS parent,
           (SELECT count(*)::int FROM t WHERE t.root = u.id) - 1 AS inside,
           (SELECT count(*)::int FROM samples s WHERE s.unit_id IN (SELECT id FROM t WHERE t.root = u.id) AND NOT s.archived) AS samples
    FROM storage_units u LEFT JOIN storage_units pu ON pu.id = u.parent_id
    WHERE u.parent_id IS NULL OR u.kind IN ('freezer', 'fridge', 'tank', 'cabinet') OR u.archived
    ORDER BY u.archived, u.parent_id IS NOT NULL, u.name`);
  const { rows: gone } = await query(`
    SELECT s.id, s.code, s.name, s.updated_at FROM samples s WHERE s.archived ORDER BY s.updated_at DESC LIMIT 1000`);
  res.json({ units, discarded: gone });
});

router.get('/data/other', async (_req, res) => {
  const [datasets, reagents, ladders, templates] = await Promise.all([
    query("SELECT id, coalesce(nullif(title, ''), 'Sans titre') AS name, kind AS detail, archived, updated_at FROM datasets ORDER BY updated_at DESC"),
    query("SELECT id, name, category AS detail, archived, updated_at FROM reagents ORDER BY name"),
    query("SELECT id, name, CASE WHEN kind = 'dna' THEN 'ADN' ELSE 'protéines' END || CASE WHEN supplier <> '' THEN ' · ' || supplier ELSE '' END AS detail, archived, updated_at FROM ladders ORDER BY name"),
    query("SELECT id, name, CASE WHEN slug IS NULL THEN 'modèle du labo' ELSE 'modèle de base' END AS detail, archived, updated_at FROM templates ORDER BY name"),
  ]);
  res.json({ datasets: datasets.rows, reagents: reagents.rows, ladders: ladders.rows, templates: templates.rows });
});

router.post('/purge/preview', async (req, res) => {
  res.json(await purgeImpact(String(req.body?.kind ?? ''), req.body?.ids));
});

/** Suppression définitive : confirmation tapée, copie de sécurité avant (conseillée), une seule transaction. */
router.post('/purge', async (req, res) => {
  const kind = String(req.body?.kind ?? '');
  if (!KINDS[kind]) throw bad('Type de données inconnu.');
  if (String(req.body?.confirm ?? '') !== 'SUPPRIMER') throw bad('Tapez SUPPRIMER pour confirmer.');
  const list = cleanIds(req.body?.ids);
  if (!list.length) throw bad('Rien à supprimer.');
  const impact = await purgeImpact(kind, list);
  if (impact.blockers.length) throw bad(impact.blockers.join(' '));
  const job = startJob('purge', `Suppression : ${impact.lines[0]}`, async (j) => {
    if (req.body?.safety !== false) await safetyCopy(j);
    j.log('Suppression (une seule transaction)…');
    const r = await purge(kind, list);
    const removed = Object.entries(r).filter(([, n]) => n).map(([k, n]) => `${n} ${REMOVED_LABELS[k] ?? k}`);
    j.log(`Supprimé : ${removed.join(', ') || 'rien'}.`);
    const names = impact.items.slice(0, 10).map((t) => `« ${t} »`).join(', ');
    await logAdmin(req.user, 'Données supprimées', `${KINDS[kind].label} : ${removed.join(', ')}${names ? ` — ${names}${impact.items.length > 10 ? '…' : ''}` : ''}`);
    return { removed: r, removed_text: removed };
  }, { exclusive: 'backup', user: req.user });
  res.status(202).json(getJob(job.id));
});

// --- Serveur ---------------------------------------------------------------------------------------------

router.get('/server', async (_req, res) => {
  res.json({
    version: appVersion,
    node: process.version,
    started_at: startedAt,
    uptime: process.uptime(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()} (${os.arch()})`,
    memory: { rss: process.memoryUsage().rss, total: os.totalmem(), free: os.freemem() },
    load: os.loadavg(),
    cpus: os.cpus().length,
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    config: {
      port: config.port, host: config.host, data_dir: config.dataDir, session_days: config.sessionDays,
      secure_cookies: config.secureCookies, max_upload_mb: config.maxUploadMb,
      database: config.databaseUrl.replace(/\/\/([^:@/]+):[^@/]*@/, '//$1:•••@'),
    },
    tools: toolStatus(),
  });
});

export default router;
