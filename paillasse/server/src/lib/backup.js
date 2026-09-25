// Sauvegardes : base (pg_dump) + fichiers (blobs), vers un dossier du serveur (NAS monté, disque externe)
// ou un serveur SSH (rsync). Même organisation que deploy/backup.sh : <destination>/db/paillasse_<date>.dump
// et <destination>/blobs/. Les fichiers ne sont jamais écrasés ni effacés côté destination ; seuls les
// dumps au-delà du nombre à garder sont retirés. Restauration atomique (une seule transaction).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { migrate } from '../migrate.js';
import { startJob, runningJob } from './jobs.js';
import { getSetting, loadSettings, logAdmin, setSetting } from './settings.js';
import { blobsDir, tmpDir } from './storage.js';

export const sshDir = path.join(config.dataDir, 'ssh');
export const sshKeyPath = path.join(sshDir, 'id_ed25519');
const knownHosts = path.join(sshDir, 'known_hosts');
export const safetyDir = path.join(config.dataDir, 'restaurations');
const DUMP_RE = /^paillasse_[\w-]+\.dump$/;

// --- Outils du système -----------------------------------------------------------------------------

/** Chemin d'un exécutable trouvé dans le PATH, ou null. */
export function findTool(name) {
  for (const dir of String(process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const p = path.join(dir, name);
    try {
      fs.accessSync(p, fs.constants.X_OK);
      return p;
    } catch { /* pas ici */ }
  }
  return null;
}

const INSTALL_HINT = {
  pg_dump: 'sudo apt install postgresql-client', pg_restore: 'sudo apt install postgresql-client', psql: 'sudo apt install postgresql-client',
  rsync: 'sudo apt install rsync', ssh: 'sudo apt install openssh-client', 'ssh-keygen': 'sudo apt install openssh-client',
  primer3_core: 'sudo apt install primer3',
};

export const toolStatus = () => Object.keys(INSTALL_HINT).map((name) => ({ name, path: findTool(name), install: INSTALL_HINT[name] }));

/** Lance une commande sans shell ; rejette si elle échoue, avec la fin de sa sortie d'erreur. */
export function run(cmd, args, { env = process.env, onLine = null, timeout = 0, input = null } = {}) {
  return new Promise((resolve, reject) => {
    if (!findTool(cmd)) {
      reject(Object.assign(new Error(`Commande introuvable sur le serveur : ${cmd} (${INSTALL_HINT[cmd] ?? 'à installer'}).`), { expose: true }));
      return;
    }
    const child = spawn(cmd, args, { env, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timer = null;
    if (timeout) timer = setTimeout(() => child.kill('SIGTERM'), timeout);
    const lines = (chunk, sink) => {
      const text = chunk.toString();
      if (onLine) for (const l of text.split('\n')) if (l.trim()) onLine(l.trim(), sink);
      return text;
    };
    child.stdout.on('data', (c) => { stdout += lines(c, 'out'); if (stdout.length > 2e6) stdout = stdout.slice(-1e6); });
    child.stderr.on('data', (c) => { stderr += lines(c, 'err'); if (stderr.length > 2e5) stderr = stderr.slice(-1e5); });
    if (input) child.stdin.end(input);
    child.on('error', reject);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else {
        const why = signal ? `interrompue (${signal})` : `code ${code}`;
        const tail = stderr.trim().split('\n').slice(-4).join(' ').slice(0, 600);
        reject(Object.assign(new Error(`${cmd} a échoué (${why})${tail ? ` : ${tail}` : ''}`), { expose: true }));
      }
    });
  });
}

/** Variables PG* tirées de DATABASE_URL : le mot de passe n'apparaît pas dans la liste des processus. */
export function pgEnv(url = config.databaseUrl) {
  const env = { ...process.env };
  let u;
  try {
    u = new URL(url);
  } catch {
    u = new URL(url.replace('@/', '@localhost/')); // « postgres://role@/base?host=/var/run/postgresql »
  }
  if (u.hostname) env.PGHOST = decodeURIComponent(u.hostname);
  if (u.port) env.PGPORT = u.port;
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  const db = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (db) env.PGDATABASE = db;
  for (const [k, v] of u.searchParams) {
    if (k === 'host') env.PGHOST = v;
    if (k === 'sslmode') env.PGSSLMODE = v;
  }
  return env;
}

// --- Destinations ------------------------------------------------------------------------------------

/**
 * « /mnt/nas/paillasse » (dossier du serveur) ou « louis@nas:/srv/sauvegardes/paillasse » (SSH).
 * Le chemin distant passe par le shell de l'hôte : caractères limités, sans espace.
 */
export function parseDest(dest) {
  const d = String(dest ?? '').trim();
  // Utilisateur et hôte commencent par une lettre ou un chiffre : jamais pris pour une option de ssh
  const remote = /^((?:[A-Za-z0-9_][A-Za-z0-9._-]*@)?[A-Za-z0-9][A-Za-z0-9.-]*):(\/[A-Za-z0-9._/-]*)$/.exec(d);
  if (remote) return { kind: 'ssh', host: remote[1], path: remote[2].replace(/(.)\/+$/, '$1') };
  if (d.startsWith('/') && !d.includes('\n')) return { kind: 'local', path: path.resolve(d) };
  return null;
}

export function checkDest(dest) {
  const d = parseDest(dest);
  if (!d) return 'Destination à écrire « /chemin/du/dossier » (disque ou partage monté) ou « utilisateur@hôte:/chemin » (serveur SSH, sans espace).';
  if (d.kind === 'local') {
    const inside = (a, b) => a === b || a.startsWith(`${b}${path.sep}`);
    if (inside(d.path, config.dataDir) || inside(config.dataDir, d.path)) return 'La destination ne peut pas être le dossier des données lui-même.';
  }
  return null;
}

const quoteArg = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);

function sshArgs(port) {
  fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
  const args = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=accept-new', '-o', `UserKnownHostsFile=${knownHosts}`];
  if (fs.existsSync(sshKeyPath)) args.push('-i', sshKeyPath, '-o', 'IdentitiesOnly=yes');
  if (port) args.push('-p', String(port));
  return args;
}
const rsh = (port) => ['ssh', ...sshArgs(port)].map(quoteArg).join(' ');
const ssh = (d, port, command, opts) => run('ssh', [...sshArgs(port), d.host, command], opts);

/** Clé SSH du serveur (créée à la demande) : à ajouter dans ~/.ssh/authorized_keys du serveur de sauvegarde. */
export async function ensureSshKey() {
  if (!fs.existsSync(sshKeyPath)) {
    fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
    await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', `paillasse@${os.hostname()}`, '-f', sshKeyPath]);
  }
  return publicKey();
}
export const publicKey = () => (fs.existsSync(`${sshKeyPath}.pub`) ? fs.readFileSync(`${sshKeyPath}.pub`, 'utf8').trim() : null);

const human = (bytes) => {
  if (bytes == null) return '?';
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = Number(bytes);
  let i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: i ? 1 : 0 })} ${u[i]}`;
};

/** Vérifie qu'on peut écrire à la destination ; renvoie { ok, lines, warnings }. */
export async function testTarget(target) {
  const d = parseDest(target.dest);
  const lines = [];
  const warnings = [];
  if (d.kind === 'local') {
    await fs.promises.mkdir(path.join(d.path, 'db'), { recursive: true });
    await fs.promises.mkdir(path.join(d.path, 'blobs'), { recursive: true });
    const probe = path.join(d.path, `.essai-paillasse-${process.pid}`);
    await fs.promises.writeFile(probe, 'ok');
    await fs.promises.unlink(probe);
    lines.push(`Écriture possible dans ${d.path}.`);
    const st = await fs.promises.statfs(d.path);
    lines.push(`Place libre : ${human(st.bavail * st.bsize)} sur ${human(st.blocks * st.bsize)}.`);
    if (fs.statSync(d.path).dev === fs.statSync(config.dataDir).dev) {
      warnings.push('Même disque que les données du cahier : si ce disque lâche, la sauvegarde est perdue aussi. Préférez un NAS ou une autre machine.');
    }
  } else {
    const { stdout } = await ssh(d, target.port, `mkdir -p ${d.path}/db ${d.path}/blobs && test -w ${d.path} && df -Pk ${d.path} | tail -1`, { timeout: 30_000 });
    lines.push(`Connexion SSH à ${d.host} réussie, écriture possible dans ${d.path}.`);
    const cols = stdout.trim().split(/\s+/);
    if (cols.length >= 4) lines.push(`Place libre : ${human(Number(cols[3]) * 1024)} sur ${human(Number(cols[1]) * 1024)}.`);
    if (!findTool('rsync')) warnings.push('rsync n’est pas installé sur ce serveur : sudo apt install rsync');
  }
  return { ok: true, lines, warnings };
}

/** Dumps présents à la destination, du plus récent au plus ancien. */
export async function listDumps(target) {
  const d = parseDest(target.dest);
  if (d.kind === 'local') {
    const dir = path.join(d.path, 'db');
    if (!fs.existsSync(dir)) return [];
    const names = (await fs.promises.readdir(dir)).filter((n) => DUMP_RE.test(n));
    const out = await Promise.all(names.map(async (name) => {
      const st = await fs.promises.stat(path.join(dir, name));
      return { name, bytes: st.size, date: st.mtime.toISOString() };
    }));
    return out.sort((a, b) => b.name.localeCompare(a.name));
  }
  const { stdout } = await run('rsync', ['--list-only', '-e', rsh(target.port), `${d.host}:${d.path}/db/`], { timeout: 60_000 });
  const out = [];
  for (const line of stdout.split('\n')) {
    const m = /^\S+\s+([\d,.]+)\s+(\d{4})\/(\d\d)\/(\d\d) (\d\d:\d\d:\d\d)\s+(\S+)$/.exec(line.trim());
    if (m && DUMP_RE.test(m[6])) out.push({ name: m[6], bytes: Number(m[1].replace(/[,.]/g, '')), date: new Date(`${m[2]}-${m[3]}-${m[4]}T${m[5]}`).toISOString() });
  }
  return out.sort((a, b) => b.name.localeCompare(a.name));
}

// --- Sauvegarde --------------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const stampOf = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** Fichiers du stockage : [{ rel: 'ab/abcd…', abs, size }]. */
export async function walkBlobs(dir = blobsDir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const sub of await fs.promises.readdir(dir, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    for (const f of await fs.promises.readdir(path.join(dir, sub.name), { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const abs = path.join(dir, sub.name, f.name);
      out.push({ rel: `${sub.name}/${f.name}`, abs, size: (await fs.promises.stat(abs)).size });
    }
  }
  return out;
}

async function copyNew(src, dest) {
  const part = `${dest}.part`;
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.copyFile(src, part);
  await fs.promises.rename(part, dest);
}

/** Copie les fichiers absents de to (jamais d'écrasement) ; renvoie le nombre copié. */
async function copyMissingBlobs(from, to, job) {
  const files = await walkBlobs(from);
  let copied = 0;
  for (let i = 0; i < files.length; i += 1) {
    const dest = path.join(to, files[i].rel);
    if (!fs.existsSync(dest)) {
      await copyNew(files[i].abs, dest);
      copied += 1;
    }
    if (i % 25 === 0 || i === files.length - 1) job.progress(i + 1, files.length);
  }
  return copied;
}

/** Dump de la base dans un fichier, vérifié en le relisant (pg_restore --list). */
export async function dumpDatabase(file, job) {
  const part = `${file}.part`;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${part}`], { env: pgEnv() });
  await fs.promises.rename(part, file);
  const { stdout } = await run('pg_restore', ['--list', file]);
  const objects = stdout.split('\n').filter((l) => l.trim() && !l.startsWith(';')).length;
  const bytes = (await fs.promises.stat(file)).size;
  job?.log(`Base copiée : ${path.basename(file)}, ${human(bytes)}, ${objects} objets (relu avec pg_restore).`);
  return bytes;
}

async function backup(target, job) {
  const d = parseDest(target.dest);
  const name = `paillasse_${stampOf()}.dump`;
  const local = path.join(tmpDir, name);
  job.log(`Destination : ${target.dest}`);
  try {
    job.log('Copie de la base de données (pg_dump)…');
    const bytes = await dumpDatabase(local, job);
    let copied;
    if (d.kind === 'local') {
      await fs.promises.mkdir(path.join(d.path, 'db'), { recursive: true });
      await copyNew(local, path.join(d.path, 'db', name));
      job.log('Dump déposé. Copie des fichiers nouveaux…');
      copied = await copyMissingBlobs(blobsDir, path.join(d.path, 'blobs'), job);
      const dumps = (await fs.promises.readdir(path.join(d.path, 'db'))).filter((n) => DUMP_RE.test(n)).sort().reverse();
      for (const old of dumps.slice(target.keep)) await fs.promises.unlink(path.join(d.path, 'db', old));
      if (dumps.length > target.keep) job.log(`${dumps.length - target.keep} dump(s) ancien(s) retiré(s) (on en garde ${target.keep}).`);
    } else {
      await ssh(d, target.port, `mkdir -p ${d.path}/db ${d.path}/blobs`, { timeout: 60_000 });
      await run('rsync', ['-a', '-e', rsh(target.port), local, `${d.host}:${d.path}/db/`]);
      job.log('Dump déposé. Copie des fichiers nouveaux (rsync)…');
      const { stdout } = await run('rsync', ['-a', '--stats', '-e', rsh(target.port), `${blobsDir}/`, `${d.host}:${d.path}/blobs/`]);
      copied = Number(/Number of regular files transferred: ([\d,.]+)/.exec(stdout)?.[1]?.replace(/[,.]/g, '') ?? 0);
      await ssh(d, target.port, `cd ${d.path}/db && ls -1 paillasse_*.dump 2>/dev/null | sort -r | tail -n +${target.keep + 1} | xargs -r rm -f --`, { timeout: 60_000 });
    }
    job.log(`${copied} fichier(s) nouveau(x) copié(s). Sauvegarde terminée.`);
    return { dump_name: name, dump_bytes: bytes, blobs_copied: copied };
  } finally {
    await fs.promises.rm(local, { force: true });
    await fs.promises.rm(`${local}.part`, { force: true });
  }
}

/**
 * Lance une sauvegarde en tâche de fond. Elle est notée dans backup_runs une fois finie (réussie ou non) :
 * le dump ne contient donc jamais sa propre ligne « en cours », et une base restaurée n'en garde pas de fausse.
 */
export function startBackup(target, { trigger = 'manual', user = null } = {}) {
  return startJob('backup', `Sauvegarde vers « ${target.name} »`, async (job) => {
    const started = new Date();
    const record = (status, result = {}) => query(
      `INSERT INTO backup_runs (target_id, trigger, status, started_at, finished_at, dump_name, dump_bytes, blobs_copied, log, started_by)
       VALUES ($1, $2, $3, $4, now(), $5, $6, $7, $8, $9)`,
      [target.id, trigger, status, started, result.dump_name ?? null, result.dump_bytes ?? null, result.blobs_copied ?? null,
        job.lines.map((l) => l.text).join('\n'), user?.id ?? null],
    );
    try {
      const result = await backup(target, job);
      await record('ok', result);
      return result;
    } catch (err) {
      job.log(`Échec : ${err.message}`);
      await record('failed').catch(() => {});
      await logAdmin(user, 'Sauvegarde échouée', `${target.name} : ${err.message}`).catch(() => {});
      throw err;
    }
  }, { exclusive: 'backup', user });
}

// --- Restauration ------------------------------------------------------------------------------------

/**
 * Ce qui décrit le serveur plutôt que le cahier survit à une restauration : destinations de sauvegarde,
 * leur historique, journal d'administration. Relu avant, remis après (comptes absents : NULL).
 */
async function readAdminState() {
  const [targets, runs, log] = await Promise.all([
    query('SELECT * FROM backup_targets'), query('SELECT * FROM backup_runs'), query('SELECT * FROM admin_log ORDER BY id'),
  ]);
  return { targets: targets.rows, runs: runs.rows, log: log.rows };
}

async function restoreAdminState(state) {
  await tx(async (c) => {
    const users = new Set((await c.query('SELECT id FROM users')).rows.map((r) => r.id));
    const who = (id) => (id && users.has(id) ? id : null);
    for (const t of state.targets) {
      await c.query(
        `INSERT INTO backup_targets (id, name, dest, port, enabled, schedule, keep, archived, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, dest = EXCLUDED.dest, port = EXCLUDED.port, enabled = EXCLUDED.enabled,
           schedule = EXCLUDED.schedule, keep = EXCLUDED.keep, archived = EXCLUDED.archived`,
        [t.id, t.name, t.dest, t.port, t.enabled, t.schedule, t.keep, t.archived, who(t.created_by), t.created_at],
      );
    }
    for (const r of state.runs) {
      await c.query(
        `INSERT INTO backup_runs (id, target_id, trigger, status, started_at, finished_at, dump_name, dump_bytes, blobs_copied, log, started_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO NOTHING`,
        [r.id, r.target_id, r.trigger, r.status, r.started_at, r.finished_at, r.dump_name, r.dump_bytes, r.blobs_copied, r.log, who(r.started_by)],
      );
    }
    const key = (l) => `${new Date(l.at).toISOString()}|${l.action}|${l.detail}`;
    const present = new Set((await c.query('SELECT at, action, detail FROM admin_log')).rows.map(key));
    for (const l of state.log) {
      if (present.has(key(l))) continue;
      await c.query('INSERT INTO admin_log (at, user_id, user_name, action, detail) VALUES ($1, $2, $3, $4, $5)',
        [l.at, who(l.user_id), l.user_name, l.action, l.detail]);
    }
  });
}

/**
 * Remplace toute la base par un dump, en une seule transaction (en cas d'erreur, rien ne change),
 * après une copie de sécurité de la base actuelle. Les fichiers absents sont recopiés depuis la destination.
 */
export function startRestore({ target = null, safety = false, dumpName }, user) {
  if (!DUMP_RE.test(String(dumpName))) throw Object.assign(new Error('Nom de dump invalide.'), { status: 400, expose: true });
  return startJob('restore', `Restauration de ${dumpName}`, async (job) => {
    const d = safety ? { kind: 'safety' } : parseDest(target.dest);
    const work = path.join(tmpDir, `restauration-${process.pid}-${Date.now()}`);
    await fs.promises.mkdir(work, { recursive: true });
    try {
      // La restauration efface ce que possède le rôle de l'application : jamais avec un superutilisateur
      const { rows: [role] } = await query('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
      if (role?.rolsuper) throw new Error('L’application se connecte à PostgreSQL avec un superutilisateur : restauration refusée. Utilisez un rôle dédié (voir l’installation dans le README) ou restaurez en ligne de commande.');
      job.log(safety ? `Retour à la copie de sécurité ${dumpName}.` : `Source : « ${target.name} » (${target.dest}).`);
      job.log('Copie de sécurité de la base actuelle…');
      const safetyFile = path.join(safetyDir, `paillasse_avant-restauration_${stampOf()}.dump`);
      await dumpDatabase(safetyFile, job);
      job.log(`Copie de sécurité : ${safetyFile}`);

      let dump = safety ? path.join(safetyDir, dumpName) : path.join(d.path ?? '', 'db', dumpName);
      if (d.kind === 'ssh') {
        job.log(`Récupération de ${dumpName} depuis ${d.host}…`);
        dump = path.join(work, dumpName);
        await run('rsync', ['-a', '-e', rsh(target.port), `${d.host}:${d.path}/db/${dumpName}`, dump]);
      }
      if (!fs.existsSync(dump)) throw new Error(`Dump introuvable : ${dump}`);
      await run('pg_restore', ['--list', dump]);

      job.log('Préparation du script de restauration…');
      const script = path.join(work, 'restauration.sql');
      await fs.promises.writeFile(script, 'SET client_min_messages = warning;\nDROP OWNED BY CURRENT_USER CASCADE;\n');
      const body = path.join(work, 'dump.sql');
      await run('pg_restore', ['--no-owner', '--no-privileges', `--file=${body}`, dump]);
      await fs.promises.appendFile(script, await fs.promises.readFile(body));

      const maintenance = getSetting('maintenance');
      const adminState = await readAdminState();
      job.log('Remplacement de la base (une seule transaction)…');
      await run('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-f', script], { env: pgEnv() });
      job.log('Base restaurée. Mise à niveau du schéma…');
      await migrate({ log: (m) => job.log(m) });
      await restoreAdminState(adminState);
      job.log('Destinations de sauvegarde, historique et journal d’administration conservés.');
      await query(`UPDATE backup_runs SET status = 'interrupted', finished_at = coalesce(finished_at, now()) WHERE status = 'running'`);
      await loadSettings();
      await setSetting('maintenance', maintenance); // reste en maintenance jusqu'à ce que l'administrateur la lève

      let copied = 0;
      if (d.kind === 'safety') job.log('Fichiers : rien à recopier (la copie de sécurité ne contient que la base).');
      else if (d.kind === 'local') {
        job.log('Recopie des fichiers absents…');
        copied = await copyMissingBlobs(path.join(d.path, 'blobs'), blobsDir, job);
      } else {
        job.log('Recopie des fichiers absents…');
        const { stdout } = await run('rsync', ['-a', '--ignore-existing', '--stats', '-e', rsh(target.port), `${d.host}:${d.path}/blobs/`, `${blobsDir}/`]);
        copied = Number(/Number of regular files transferred: ([\d,.]+)/.exec(stdout)?.[1]?.replace(/[,.]/g, '') ?? 0);
      }
      job.log(`${copied} fichier(s) recopié(s). Restauration terminée.`);
      const still = (await query('SELECT 1 FROM users WHERE id = $1', [user.id])).rowCount > 0;
      await logAdmin(still ? user : { display_name: user.display_name }, 'Base restaurée', `${dumpName}${target ? ` depuis « ${target.name} »` : ' (copie de sécurité)'} ; copie de sécurité prise avant : ${path.basename(safetyFile)}`);
      return { safety: path.basename(safetyFile), blobs_copied: copied, account_kept: still };
    } finally {
      await fs.promises.rm(work, { recursive: true, force: true });
    }
  }, { exclusive: 'backup', user });
}

// --- Planification -------------------------------------------------------------------------------------

/** Dernière échéance passée d'un horaire « HH:MM » (heure du serveur). */
export function lastDue(schedule, now = new Date()) {
  const [h, m] = schedule.split(':').map(Number);
  const due = new Date(now);
  due.setHours(h, m, 0, 0);
  if (due > now) due.setDate(due.getDate() - 1);
  return due;
}

export function nextDue(schedule, now = new Date()) {
  const due = lastDue(schedule, now);
  due.setDate(due.getDate() + 1);
  return due;
}

async function runDueBackups() {
  if (runningJob('backup')) return;
  const { rows } = await query(`
    SELECT t.*, (SELECT max(started_at) FROM backup_runs r WHERE r.target_id = t.id) AS last_started
    FROM backup_targets t WHERE t.enabled AND NOT t.archived AND t.schedule <> '' ORDER BY t.created_at`);
  const now = new Date();
  for (const t of rows) {
    const due = lastDue(t.schedule, now);
    if (due < t.created_at) continue; // pas de rattrapage avant la création de la destination
    if (t.last_started && t.last_started >= due) continue;
    console.log(`Sauvegarde planifiée vers « ${t.name} » (${t.schedule})`);
    startBackup(t, { trigger: 'schedule' });
    return; // une à la fois ; la suivante au prochain passage
  }
}

let timer = null;
export async function startBackupScheduler() {
  await query(`UPDATE backup_runs SET status = 'interrupted', finished_at = now(), log = log || E'\\nInterrompue : le serveur a redémarré.' WHERE status = 'running'`);
  const tick = () => runDueBackups().catch((err) => console.error('Planification des sauvegardes :', err.message));
  setTimeout(tick, 15_000).unref();
  timer = setInterval(tick, 60_000);
  timer.unref();
}
