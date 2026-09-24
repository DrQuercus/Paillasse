import crypto from 'node:crypto';
import { config } from './config.js';
import { query } from './db.js';

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

export function readSessionToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = Buffer.from(sign(`${userId}.${expires}`));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (Date.now() > Number(expires)) return null;
  return userId;
}

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
  const userId = readSessionToken(req.cookies?.[SESSION_COOKIE]);
  if (!userId) return res.status(401).json({ error: 'Connexion requise' });
  const { rows } = await query('SELECT id, username, display_name FROM users WHERE id = $1', [userId]);
  if (!rows[0]) return res.status(401).json({ error: 'Connexion requise' });
  req.user = rows[0];
  next();
}

/** Crée le premier compte à partir de ADMIN_USERNAME / ADMIN_PASSWORD si la base est vide. */
export async function ensureFirstUser() {
  const { rows } = await query('SELECT count(*)::int AS n FROM users');
  if (rows[0].n > 0) return;
  const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_DISPLAY_NAME } = process.env;
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.warn('Aucun compte. Créez-en un avec : npm run create-user -- <identifiant>');
    return;
  }
  await query('INSERT INTO users (username, display_name, password_hash) VALUES ($1, $2, $3)', [
    ADMIN_USERNAME,
    ADMIN_DISPLAY_NAME || ADMIN_USERNAME,
    hashPassword(ADMIN_PASSWORD),
  ]);
  console.log(`Compte « ${ADMIN_USERNAME} » créé. Retirez ADMIN_PASSWORD du fichier .env.`);
}
