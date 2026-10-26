// Jetons d'accès personnels pour les outils extérieurs (IA locale, scripts, automatisations) :
//   Authorization: Bearer pai_<32 caractères>
// Seule l'empreinte SHA-256 est gardée ; le jeton n'est montré qu'une fois, à sa création. Un jeton agit au nom
// de son compte, avec ses droits sur les projets, mais jamais avec les droits d'administration. Portée 'read' :
// lecture seule ; 'write' : lecture et écriture.
import crypto from 'node:crypto';
import { query } from '../db.js';

export const TOKEN_PREFIX = 'pai_';
export const SCOPES = { read: 'Lecture seule', write: 'Lecture et écriture' };
const TOKEN_RE = /^pai_[A-Za-z0-9_-]{32}$/;

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
export const looksLikeToken = (value) => TOKEN_RE.test(String(value ?? ''));

/** Nouveau jeton : la valeur (à montrer une fois), son empreinte et un indice pour le reconnaître. */
export function newToken() {
  const token = `${TOKEN_PREFIX}${crypto.randomBytes(24).toString('base64url')}`;
  return { token, hash: hashToken(token), hint: `${token.slice(0, 8)}…${token.slice(-4)}` };
}

// --- Usage : compté en mémoire, écrit en base par lots (pas d'écriture à chaque requête) ---------------

const usage = new Map(); // tokenId → { count, at, ip }
let flushing = null;

function noteUse(tokenId, ip) {
  const u = usage.get(tokenId) ?? { count: 0 };
  usage.set(tokenId, { count: u.count + 1, at: new Date(), ip: String(ip ?? '').slice(0, 60) });
}

export async function flushTokenUsage() {
  if (flushing) return flushing;
  const batch = [...usage.entries()];
  usage.clear();
  flushing = (async () => {
    for (const [id, u] of batch) {
      await query(
        'UPDATE api_tokens SET use_count = use_count + $2, last_used_at = GREATEST(coalesce(last_used_at, $3), $3), last_used_ip = $4 WHERE id = $1',
        [id, u.count, u.at, u.ip],
      ).catch((err) => console.warn('Jetons : usage non enregistré :', err.message));
    }
  })().finally(() => { flushing = null; });
  return flushing;
}
setInterval(() => { if (usage.size) flushTokenUsage(); }, 15_000).unref();

// --- Limite de débit : seau de jetons par jeton d'accès (une IA qui boucle ne submerge pas le serveur) -----

const BURST = 300;
const PER_SECOND = 20;
const buckets = new Map();

/** 0 si la requête passe, sinon le nombre de secondes à attendre. */
export function rateLimit(tokenId, now = Date.now()) {
  const b = buckets.get(tokenId) ?? { level: BURST, at: now };
  b.level = Math.min(BURST, b.level + ((now - b.at) / 1000) * PER_SECOND);
  b.at = now;
  buckets.set(tokenId, b);
  if (b.level < 1) return Math.ceil((1 - b.level) / PER_SECOND);
  b.level -= 1;
  return 0;
}

/**
 * Compte et jeton correspondant à la valeur présentée, ou null : jeton inconnu, révoqué ou expiré, compte
 * désactivé ou supprimé. Le compte rendu n'est jamais administrateur.
 */
export async function tokenUser(value, ip = '') {
  if (!looksLikeToken(value)) return null;
  const { rows } = await query(
    `SELECT t.id AS token_id, t.name AS token_name, t.scope, t.expires_at, t.revoked_at,
            u.id, u.username, u.display_name, u.is_admin, u.must_change_password, u.disabled_at, u.deleted_at
     FROM api_tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1`,
    [hashToken(value)],
  );
  const r = rows[0];
  if (!r || r.revoked_at || r.disabled_at || r.deleted_at) return null;
  if (r.expires_at && r.expires_at.getTime() <= Date.now()) return null;
  noteUse(r.token_id, ip);
  return {
    user: { id: r.id, username: r.username, display_name: r.display_name, is_admin: false, must_change_password: r.must_change_password },
    token: { id: r.token_id, name: r.token_name, scope: r.scope },
  };
}

/** Jeton d'un en-tête Authorization (Bearer pai_…) ; null si l'en-tête est absent ou d'un autre type. */
export function bearerToken(req) {
  const m = /^\s*Bearer\s+(pai_\S*)\s*$/i.exec(req.headers.authorization ?? '');
  return m ? m[1] : null;
}
