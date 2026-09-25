import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';
import { getSetting } from './lib/settings.js';

export const SESSION_COOKIE = 'paillasse_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [algo, saltHex, hashHex] = String(stored).split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function sign(payload) {
  return crypto.createHmac('sha256', config.sessionSecret).update(payload).digest('base64url');
}

/** Jeton de session sans état : <userId>.<expiration>.<signature HMAC> */
export function createSessionToken(userId) {
  const expires = Date.now() + config.sessionDays * 86_400_000;
  const payload = `${userId}.${expires}`;
  return { token: `${payload}.${sign(payload)}`, expires: new Date(expires) };
}

/** { userId, issuedAt } si le jeton est authentique et pas expiré, sinon null. */
export function readSession(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = Buffer.from(sign(`${userId}.${expires}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (Date.now() > Number(expires)) return null;
  return { userId, issuedAt: Number(expires) - config.sessionDays * 86_400_000 };
}

export const readSessionToken = (token) => readSession(token)?.userId ?? null;

const USER_FIELDS = 'id, username, display_name, is_admin, must_change_password, disabled_at, sessions_valid_after';

/**
 * Compte de la session, ou null : jeton invalide, compte inconnu ou désactivé, session révoquée
 * (mot de passe changé, « déconnecter partout »). sessions_valid_after est posé avec l'horloge de ce
 * serveur (comme la date d'émission des jetons), jamais avec celle de la base.
 */
export async function sessionUser(req) {
  const session = readSession(req.cookies?.[SESSION_COOKIE]);
  if (!session) return null;
  const { rows } = await query(`SELECT ${USER_FIELDS} FROM users WHERE id = $1`, [session.userId]);
  const user = rows[0];
  if (!user || user.disabled_at) return null;
  if (user.sessions_valid_after && session.issuedAt < user.sessions_valid_after.getTime()) return null;
  return user;
}

export const publicUser = (u) => ({
  id: u.id, username: u.username, display_name: u.display_name, is_admin: u.is_admin, must_change_password: u.must_change_password,
});

export function parseCookies(req, _res, next) {
  req.cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    try {
      req.cookies[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      /* cookie mal formé : ignoré */
    }
  }
  next();
}

export async function requireAuth(req, res, next) {
  const user = await sessionUser(req);
  if (!user) return res.status(401).json({ error: 'Connexion requise' });
  // Mode maintenance : seuls les administrateurs travaillent
  const maintenance = getSetting('maintenance');
  if (maintenance.on && !user.is_admin) {
    return res.status(503).json({ error: maintenance.message || 'Maintenance en cours.', maintenance: true });
  }
  req.user = publicUser(user);
  next();
}

/** Tant que le mot de passe provisoire n'est pas changé, seul /auth répond. */
export function requirePasswordChosen(req, res, next) {
  if (req.user?.must_change_password) {
    return res.status(403).json({ error: 'Choisissez d’abord votre mot de passe.', mustChangePassword: true });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  next();
}

/** Mot de passe provisoire lisible (sans 0/O, 1/l/I) : xxxx-xxxx-xxxx. */
export function temporaryPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join('')).join('-');
}

/** Crée le premier compte (administrateur) à partir de ADMIN_USERNAME / ADMIN_PASSWORD si la base est vide. */
export async function ensureFirstUser() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_DISPLAY_NAME } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.warn('Aucun compte. Créez-en un avec : npm run create-user -- <identifiant> --admin');
    return;
  }
  await query('INSERT INTO users (username, display_name, password_hash, is_admin) VALUES ($1, $2, $3, true)', [
    ADMIN_USERNAME,
    ADMIN_DISPLAY_NAME || ADMIN_USERNAME,
    hashPassword(ADMIN_PASSWORD),
  ]);
  console.log(`Compte administrateur « ${ADMIN_USERNAME} » créé. Retirez ADMIN_PASSWORD du fichier .env.`);
}
