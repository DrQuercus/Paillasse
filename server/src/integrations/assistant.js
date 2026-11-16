// Assistant IA du labo (Open WebUI ou compatible) : il appelle Paillasse au nom de la personne qui lui parle,
// avec les droits de son compte Paillasse (jamais ceux d'un administrateur), en lecture seule sauf si elle a
// choisi « lecture et écriture ». L'identité de la personne arrive :
//   1. par un en-tête signé (HS256, secret partagé ASSISTANT_JWT_SECRET ; Open WebUI : X-OpenWebUI-User-Jwt) ;
//   2. ou par sa session, transmise par l'assistant (Authorization: Bearer …) et vérifiée auprès de lui
//      (ASSISTANT_IDENTITY_URL).
// Un compte Paillasse se relie à son identité chez l'assistant par un code à usage unique montré dans Paillasse,
// que la personne donne à l'assistant. Toute écriture demandée par l'assistant passe par un aperçu (essai à sec)
// puis une confirmation : la protection est dans le code, pas dans une consigne au modèle.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { query, tx } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { canonicalize } from '../lib/hash.js';
import { getSetting, logAdmin } from '../lib/settings.js';
import { rateLimit } from './tokens.js';

const A = config.assistant;

/** Outils proposés à l'assistant par défaut : le cahier, le stockage, les modèles, en lecture et en écriture. */
export const ASSISTANT_DEFAULT_TOOLS = [
  'whoami', 'search', 'recent_activity', 'list_projects', 'get_project',
  'list_entries', 'get_entry', 'create_entry', 'append_to_entry', 'create_addendum',
  'list_sequences', 'get_sequence',
  'find_samples', 'get_sample', 'storage_overview', 'get_storage_unit', 'storage_alerts', 'store_samples', 'move_sample', 'sample_action', 'update_sample',
  'list_templates', 'get_template', 'list_datasets', 'get_dataset',
  'link_account',
];

export const assistantSettings = () => ({ ...A, configured: Boolean(A.jwtSecret || A.identityUrl) });
export const assistantConfigured = () => Boolean(A.jwtSecret || A.identityUrl);
export const assistantName = () => A.name;
export const assistantTools = () => (A.tools.length ? [...new Set([...A.tools, 'link_account'])] : ASSISTANT_DEFAULT_TOOLS);

/** Configurée, et ni l'accès par jeton ni l'assistant coupés par l'administrateur. */
export function assistantActive() {
  const s = getSetting('integrations');
  return assistantConfigured() && s.enabled && s.assistant !== false;
}

// --- Identité de la personne ------------------------------------------------------------------------------

const identityOf = (u) => ({
  subject: String(u.id ?? u.sub ?? ''),
  email: String(u.email ?? '').slice(0, 300),
  name: String(u.name ?? '').slice(0, 200),
  role: String(u.role ?? ''),
});

/** Identité portée par un jeton signé HS256 ; null s'il est mal signé, expiré ou incomplet. */
export function verifyIdentityJwt(token, secret = A.jwtSecret, now = Date.now()) {
  const parts = String(token ?? '').trim().split('.');
  if (parts.length !== 3 || !secret) return null;
  try {
    const json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    if (json(parts[0]).alg !== 'HS256') return null;
    const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const p = json(parts[1]);
    const skew = 60_000; // horloges des deux serveurs
    if (typeof p.exp === 'number' && p.exp * 1000 + skew < now) return null;
    if (typeof p.nbf === 'number' && p.nbf * 1000 - skew > now) return null;
    const identity = identityOf(p);
    return identity.subject ? identity : null;
  } catch {
    return null;
  }
}

const sessions = new Map(); // empreinte de la session → { identity, until }

/**
 * Session transmise par l'assistant, vérifiée auprès de lui (réponse gardée une minute). from : adresse de l'appelant,
 * pour qu'un flot de sessions inventées ne fasse pas appeler l'assistant sans fin.
 */
export async function verifySession(token, url = A.identityUrl, from = '') {
  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = sessions.get(key);
  if (hit && hit.until > Date.now()) return hit.identity;
  const wait = rateLimit(`verification:${from}`);
  if (wait) throw new HttpError(429, `Trop de sessions à vérifier auprès de ${A.name} : réessayez dans ${wait} s.`);
  let identity = null;
  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new HttpError(502, `${A.name} ne répond pas pour confirmer qui vous êtes (${err.cause?.code ?? err.name}) : réessayez dans un instant.`);
  }
  if (res.ok) {
    const u = await res.json().catch(() => null);
    if (u && (u.id || u.sub)) identity = identityOf(u);
  } else {
    await res.body?.cancel().catch(() => {});
    if (res.status >= 500) throw new HttpError(502, `${A.name} n’a pas pu confirmer qui vous êtes (réponse ${res.status}) : réessayez dans un instant.`);
  }
  if (sessions.size > 2000) sessions.clear();
  sessions.set(key, { identity, until: Date.now() + (identity ? 60_000 : 15_000) });
  return identity;
}

/**
 * Identité de l'assistant présente dans la requête : { identity }, { error: [statut, message] }, ou null (rien
 * qui vienne de l'assistant). Un jeton Paillasse (pai_…) est traité avant, par auth.js.
 */
export async function assistantIdentity(req) {
  if (!assistantConfigured()) return null;
  let identity = null;
  const signed = A.jwtSecret ? req.get(A.jwtHeader) : null;
  if (signed) {
    identity = verifyIdentityJwt(signed);
    if (!identity) return { error: [401, `Identité transmise par ${A.name} invalide ou expirée.`] };
  } else if (A.identityUrl) {
    const m = /^\s*Bearer\s+(\S{10,4096})\s*$/i.exec(req.headers.authorization ?? '');
    if (!m || m[1].startsWith('pai_')) return null;
    identity = await verifySession(m[1], A.identityUrl, req.ip);
    if (!identity) return { error: [401, `Session non reconnue par ${A.name} : reconnectez-vous chez ${A.name}, ou utilisez un jeton d’accès Paillasse.`] };
  } else {
    return null;
  }
  if (identity.role === 'pending') return { error: [403, `Votre compte chez ${A.name} attend encore d’être validé.`] };
  if (!assistantActive()) return { error: [403, `L’accès par ${A.name} est désactivé par l’administrateur du cahier.`] };
  return { identity };
}

// --- Comptes reliés -----------------------------------------------------------------------------------------

const LINK = `l.id, l.user_id, l.subject, l.email, l.name, l.scope, l.linked_at, l.last_used_at, l.use_count, l.code_expires_at,
  u.username, u.display_name, u.is_admin, u.must_change_password, u.disabled_at, u.deleted_at`;

/** Compte Paillasse relié à une identité de l'assistant (avec l'état du compte), ou null. */
export async function linkOfSubject(subject) {
  const { rows } = await query(`SELECT ${LINK} FROM assistant_links l JOIN users u ON u.id = l.user_id WHERE l.subject = $1`, [subject]);
  return rows[0] ?? null;
}

export async function linkOfUser(userId) {
  const { rows } = await query(`SELECT ${LINK} FROM assistant_links l JOIN users u ON u.id = l.user_id WHERE l.user_id = $1`, [userId]);
  return rows[0] ?? null;
}

export const linkView = (l) => (l ? {
  linked: Boolean(l.subject),
  email: l.email || null,
  name: l.name || null,
  scope: l.scope,
  linked_at: l.linked_at,
  last_used_at: l.last_used_at,
  use_count: Number(l.use_count ?? 0),
  code_expires_at: l.subject ? null : l.code_expires_at,
} : { linked: false, scope: 'read', use_count: 0 });

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const normalizeCode = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const codeHash = (code) => crypto.createHash('sha256').update(`liaison:${normalizeCode(code)}`).digest('hex');

/** Nouveau code de liaison pour ce compte (10 minutes, à usage unique ; remplace le précédent). */
export async function newLinkCode(user) {
  const raw = [...crypto.randomBytes(8)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  const { rows: [l] } = await query(
    `INSERT INTO assistant_links (user_id, code_hash, code_expires_at) VALUES ($1, $2, now() + interval '10 minutes')
     ON CONFLICT (user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, code_expires_at = EXCLUDED.code_expires_at
     RETURNING code_expires_at`,
    [user.id, codeHash(code)],
  );
  return { code, expires_at: l.code_expires_at };
}

const attempts = new Map(); // identité → tentatives de liaison récentes

/** Relie l'identité de l'assistant au compte qui a montré ce code. */
export async function linkWithCode(identity, code) {
  const now = Date.now();
  const recent = (attempts.get(identity.subject) ?? []).filter((t) => t > now - 600_000);
  if (recent.length >= 10) throw new HttpError(429, 'Trop d’essais de liaison : attendez quelques minutes, puis demandez un nouveau code dans Paillasse.');
  attempts.set(identity.subject, [...recent, now]);
  if (normalizeCode(code).length !== 8) throw new HttpError(400, 'Code de liaison attendu : 8 caractères, comme 7KQ2-M9XD (Paillasse › Intégrations).');
  const linked = await tx(async (db) => {
    const { rows: [l] } = await db.query(
      `SELECT l.id, l.user_id, u.display_name FROM assistant_links l JOIN users u ON u.id = l.user_id
       WHERE l.code_hash = $1 AND l.code_expires_at > now() AND u.disabled_at IS NULL AND u.deleted_at IS NULL FOR UPDATE OF l`,
      [codeHash(code)],
    );
    if (!l) return null;
    // Une identité ne sert qu'un compte : elle quitte celui qu'elle servait peut-être
    await db.query('DELETE FROM assistant_links WHERE subject = $1 AND id <> $2', [identity.subject, l.id]);
    const { rows: [done] } = await db.query(
      `UPDATE assistant_links SET subject = $2, email = $3, name = $4, linked_at = now(), code_hash = NULL, code_expires_at = NULL
       WHERE id = $1 RETURNING scope`,
      [l.id, identity.subject, identity.email, identity.name],
    );
    return { ...l, scope: done.scope };
  });
  if (!linked) throw new HttpError(400, 'Code de liaison inconnu ou expiré : demandez-en un nouveau dans Paillasse › Intégrations (il vaut 10 minutes).');
  attempts.delete(identity.subject);
  await logAdmin({ id: linked.user_id, display_name: linked.display_name }, 'Compte relié à l’assistant IA', `${linked.display_name} ↔ ${identity.email || identity.subject} (${A.name})`);
  return linked;
}

export async function setLinkScope(user, scope) {
  const { rows } = await query('UPDATE assistant_links SET scope = $2 WHERE user_id = $1 AND subject IS NOT NULL RETURNING id', [user.id, scope === 'write' ? 'write' : 'read']);
  if (!rows[0]) throw new HttpError(404, 'Compte pas encore relié.');
  await logAdmin(user, 'Droits de l’assistant IA', `${user.display_name} : ${scope === 'write' ? 'lecture et écriture' : 'lecture seule'}`);
}

/** Délie un compte (by : qui le fait, pour le journal). */
export async function unlink(userId, by) {
  const { rows } = await query(
    `DELETE FROM assistant_links l USING users u WHERE l.user_id = $1 AND u.id = l.user_id RETURNING l.email, l.subject, u.display_name`,
    [userId],
  );
  if (!rows[0]) throw new HttpError(404, 'Aucun compte relié.');
  if (rows[0].subject) await logAdmin(by, 'Compte délié de l’assistant IA', `${rows[0].display_name} ↔ ${rows[0].email || rows[0].subject}`);
}

// Usage : compté en mémoire, écrit par lots (comme pour les jetons)
const usage = new Map();
export const noteAssistantUse = (linkId) => usage.set(linkId, (usage.get(linkId) ?? 0) + 1);
export async function flushAssistantUsage() {
  const batch = [...usage.entries()];
  usage.clear();
  for (const [id, n] of batch) {
    await query('UPDATE assistant_links SET use_count = use_count + $2, last_used_at = now() WHERE id = $1', [id, n])
      .catch((err) => console.warn('Assistant : usage non enregistré :', err.message));
  }
}
setInterval(() => { if (usage.size) flushAssistantUsage(); }, 15_000).unref();

/** Message pour une personne dont le compte n'est pas encore relié. */
export const unlinkedMessage = (identity) => `Votre compte chez ${A.name}${identity?.email ? ` (${identity.email})` : ''} n’est pas encore relié à un compte Paillasse. `
  + 'Ouvrez Paillasse › Intégrations › Assistant, demandez un code de liaison, puis donnez ce code (8 caractères, comme 7KQ2-M9XD) '
  + `à ${A.name} : la liaison se fait en une fois.`;

// --- Écriture en deux temps : aperçu (essai à sec), puis confirmation --------------------------------------

const confirmations = new Map(); // code → { key, turn, until }
let turnSeenAt = null; // dernier appel d'écriture qui portait l'identifiant du message (depuis le démarrage)
export const noteTurnSeen = () => { turnSeenAt = new Date(); };
export const lastTurnSeen = () => turnSeenAt;
const CONFIRM_MINUTES = 15;

/** Empreinte de ce qui sera fait : qui, par quel accès, quelle opération, quels paramètres exactement. */
export const confirmationKey = (ctx, opName, args) => crypto.createHash('sha256')
  .update(canonicalize([ctx.user?.id ?? null, ctx.token?.id ?? null, opName, args])).digest('hex');

/** Code de confirmation d'un aperçu ; turn : message de l'assistant où l'aperçu a été montré (s'il est connu). */
export function issueConfirmation(key, turn = null) {
  const now = Date.now();
  for (const [c, v] of confirmations) if (v.until < now) confirmations.delete(c);
  const code = [...crypto.randomBytes(6)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  confirmations.set(code, { key, turn, until: now + CONFIRM_MINUTES * 60_000 });
  return { code, expires_at: new Date(now + CONFIRM_MINUTES * 60_000).toISOString() };
}

/**
 * Vérifie un code de confirmation. ok : il correspond exactement à cette opération, et il est consommé (il ne sert
 * qu'une fois) ; wait : il arrive dans le message même de l'aperçu, avant que la personne ait pu répondre (il reste
 * valable pour un message suivant) ; invalid : inconnu, expiré ou donné avec d'autres paramètres.
 */
export function checkConfirmation(code, key, turn = null) {
  const c = normalizeCode(code);
  const found = confirmations.get(c);
  if (!found || found.until < Date.now() || found.key !== key) return { status: 'invalid' };
  if (found.turn && turn && found.turn === turn) return { status: 'wait', code: c, expires_at: new Date(found.until).toISOString() };
  confirmations.delete(c);
  return { status: 'ok' };
}

// --- Aucune séquence écrite par un modèle -------------------------------------------------------------------

// Un modèle recopie mal une séquence, ou l'invente : elle entre dans le registre par un fichier, NCBI ou UniProt,
// et l'assistant la cite par son code (SEQ-…). Nucléotides (IUPAC, toute casse) : 20 lettres de suite, ou des
// blocs de 10 comme dans GenBank ; acides aminés (majuscules) : 30 lettres de suite, ou des blocs de 10.
const NUCLEOTIDES = /[ACGTUNRYSWKMBDHV]{20,}|(?:[ACGTUN]{10}[ \t]+){2,}[ACGTUN]{1,10}/i;
const PROTEIN = /[ACDEFGHIKLMNPQRSTVWY]{30,}|(?:[ACDEFGHIKLMNPQRSTVWY]{10}[ \t]+){2,}[ACDEFGHIKLMNPQRSTVWY]{1,10}/;

/** Premier passage d'un paramètre (texte, liste, objet) qui ressemble à une séquence biologique, ou null. */
export function sequenceIn(value) {
  if (typeof value === 'string') return (NUCLEOTIDES.exec(value) ?? PROTEIN.exec(value))?.[0] ?? null;
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) {
      const found = sequenceIn(v);
      if (found) return found;
    }
  }
  return null;
}

// --- Réponses courtes pour un petit modèle -----------------------------------------------------------------

/**
 * Raccourcit une réponse trop longue pour l'assistant (fenêtre de contexte limitée) : les plus longues listes
 * et les plus longs textes sont coupés tour à tour, et une note dit ce qui manque et comment l'obtenir.
 */
export function fitResponse(value, maxChars = A.maxChars) {
  const size = (v) => JSON.stringify(v)?.length ?? 0;
  if (!value || typeof value !== 'object' || size(value) <= maxChars) return value;
  const out = structuredClone(value);
  const original = new Map(); // chemin → taille d'origine
  for (let round = 0; round < 80 && size(out) > maxChars; round += 1) {
    let best = null;
    const visit = (holder, key, v, path) => {
      if (Array.isArray(v)) {
        if (v.length > 1) {
          const s = size(v);
          if (!best || s > best.s) best = { holder, key, v, s, path, list: true };
        }
        v.forEach((x, k) => visit(v, k, x, `${path}[${k}]`));
      } else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) visit(v, k, x, path ? `${path}.${k}` : k);
      } else if (typeof v === 'string' && v.length > 600) {
        if (!best || v.length > best.s) best = { holder, key, v, s: v.length, path, list: false };
      }
    };
    visit(null, null, out, '');
    if (!best || !best.holder) break;
    const label = best.path.replace(/\[\d+\]/g, '[]');
    if (!original.has(label)) original.set(label, { list: best.list, total: best.list ? best.v.length : best.v.length });
    best.holder[best.key] = best.list ? best.v.slice(0, Math.max(1, Math.floor(best.v.length / 2))) : `${best.v.slice(0, Math.floor(best.v.length / 2))} […]`;
  }
  out.truncated = {
    note: 'Réponse raccourcie pour tenir dans la conversation : demandez moins d’éléments (limit), la suite (offset, part), ou un filtre plus précis.',
    fields: [...original].map(([path, o]) => (o.list ? `${path} : liste de ${o.total} éléments, coupée` : `${path} : texte de ${o.total} caractères, coupé`)),
  };
  return out;
}

// --- Consigne pour l'assistant ------------------------------------------------------------------------------

/** Branche de consigne (prompt système) à ajouter à l'assistant, en français. */
export function assistantPrompt(origin = '') {
  return `## Cahier de laboratoire (Paillasse)

Paillasse est le cahier de laboratoire électronique du labo${origin ? ` (${origin})` : ''} : entrées de manip rangées par projet, protocoles (modèles), registre de séquences (codes SEQ-…), stockage des échantillons (congélateurs, boîtes, tubes : codes ECH-…), jeux de données statistiques.

- Dès qu'une question porte sur ce qui a été fait ou noté au labo (une manip, un résultat, un protocole, un projet), sur un tube ou un échantillon (où il est, ce qu'il en reste, ce qui est à surveiller) ou sur une séquence enregistrée, appelle les outils Paillasse au lieu de répondre de mémoire. Cherche d'abord, puis lis l'élément trouvé.
- Donne toujours l'adresse (url) des entrées, tubes ou séquences que tu cites, pour que la personne vérifie.
- Paillasse répond avec les droits de la personne qui te parle. Si un outil répond que son compte n'est pas relié, explique-lui comment faire (Paillasse › Intégrations › Assistant : code de liaison) ; quand elle te donne le code, appelle l'outil de liaison avec ce code.
- Écriture : toute création ou modification rend d'abord un aperçu, sans rien enregistrer. Montre cet aperçu à la personne, attends sa réponse, et ne confirme (même outil, mêmes paramètres, avec le code de confirmation reçu) que si elle est d'accord. Si un outil répond « lecture seule », la personne peut ouvrir l'écriture dans Paillasse › Intégrations › Assistant.
- N'écris jamais de séquence (ADN, protéine) dans le cahier, Paillasse la refuserait : cite-la par son code SEQ-…, ou laisse la personne la saisir elle-même. Ne verrouille jamais une entrée : cela se fait dans Paillasse.
- Si une réponse est raccourcie (champ truncated) ou en plusieurs parties (part), demande la suite au lieu de deviner.`;
}
