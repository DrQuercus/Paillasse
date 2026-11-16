// Webhooks : à chaque événement choisi, Paillasse envoie un POST JSON signé à l'adresse d'un outil (n8n, Node-RED,
// script, serveur d'une IA locale…). Signature au format Standard Webhooks (https://www.standardwebhooks.com) :
//   webhook-id         identifiant de l'envoi (le même pour toutes ses tentatives)
//   webhook-timestamp  secondes Unix
//   webhook-signature  v1,<base64 de HMAC-SHA256(secret, `${id}.${timestamp}.${corps}`)>
// Le secret (whsec_<base64>) est donné à la création du webhook. En cas d'échec (réseau, réponse hors 2xx),
// l'envoi est retenté 5 fois, de plus en plus espacé (30 s → 6 h) ; un webhook qui échoue 20 envois d'affilée,
// ou qui répond 410 Gone, est mis en pause.
import crypto from 'node:crypto';
import { pool, query } from '../db.js';
import { assertProject } from '../lib/access.js';
import { HttpError } from '../lib/errors.js';
import { getSetting } from '../lib/settings.js';
import { DEBOUNCED, DEBOUNCE_SECONDS, EVENT_TYPES, eventView, pruneEvents, typeMatches, visibleEvent } from './events.js';

export const MAX_WEBHOOKS = 20;
const RETRY_DELAYS = [30, 120, 600, 3600, 21600]; // secondes avant chaque nouvelle tentative
const PAUSE_AFTER = 20;                          // envois abandonnés d'affilée avant mise en pause
const TIMEOUT_MS = 10_000;
const RESERVED_HEADERS = /^(content-type|content-length|host|user-agent|webhook-.*|x-paillasse-.*|connection|transfer-encoding)$/i;
const FAMILIES = new Set(Object.keys(EVENT_TYPES).map((t) => t.slice(0, t.lastIndexOf('.'))));

export const newSecret = () => `whsec_${crypto.randomBytes(24).toString('base64')}`;

/** Signature Standard Webhooks d'un envoi. */
export function signPayload(secret, id, timestamp, body) {
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  return `v1,${crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

/** Vérifie une signature (côté outil récepteur ; sert aux tests et d'exemple). */
export function verifySignature(secret, headers, body, { toleranceSeconds = 300, now = Date.now() } = {}) {
  const id = headers['webhook-id'];
  const ts = Number(headers['webhook-timestamp']);
  if (!id || !Number.isFinite(ts) || Math.abs(now / 1000 - ts) > toleranceSeconds) return false;
  const expected = signPayload(secret, id, ts, body).slice(3);
  return String(headers['webhook-signature'] ?? '').split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && sig && sig.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
}

// --- Configuration ----------------------------------------------------------------------------------------

function cleanUrl(value) {
  const raw = String(value ?? '').trim();
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, 'Adresse invalide : elle doit commencer par http:// ou https://');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Adresse invalide : http:// ou https:// seulement.');
  if (raw.length > 2000) throw new HttpError(400, 'Adresse trop longue.');
  return url.toString();
}

function cleanEvents(value) {
  const list = [...new Set((Array.isArray(value) ? value : value ? [value] : []).map((v) => String(v).trim()).filter(Boolean))];
  if (list.includes('*')) return [];
  for (const t of list) {
    const family = t.endsWith('.*') ? t.slice(0, -2) : null;
    if (family ? !FAMILIES.has(family) : !EVENT_TYPES[t]) throw new HttpError(400, `Type d’événement inconnu : « ${t} ».`);
  }
  return list.slice(0, 60);
}

function cleanHeader(name, value) {
  const n = String(name ?? '').trim();
  const v = String(value ?? '');
  if (!n) return { header_name: '', header_value: '' };
  if (!/^[A-Za-z0-9-]{1,100}$/.test(n) || RESERVED_HEADERS.test(n)) throw new HttpError(400, `En-tête « ${n} » non permis.`);
  if (/[\r\n]/.test(v) || v.length > 2000) throw new HttpError(400, 'Valeur d’en-tête invalide.');
  return { header_name: n, header_value: v };
}

async function cleanProject(user, value) {
  if (value === null || value === undefined || value === '') return null;
  await assertProject(user, String(value));
  return String(value);
}

export async function createWebhook(user, b, origin = '') {
  if (!getSetting('integrations').webhooks) throw new HttpError(403, 'Les webhooks sont désactivés par l’administrateur du cahier.');
  const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM webhooks WHERE user_id = $1', [user.id]);
  if (n >= MAX_WEBHOOKS) throw new HttpError(409, `${MAX_WEBHOOKS} webhooks au plus par compte.`);
  const url = cleanUrl(b.url);
  const events = cleanEvents(b.events);
  const projectId = await cleanProject(user, b.project_id);
  const header = cleanHeader(b.header_name, b.header_value);
  const { rows: [{ last }] } = await query('SELECT coalesce(max(id), 0)::bigint AS last FROM integration_events');
  const { rows: [w] } = await query(
    `INSERT INTO webhooks (user_id, name, url, secret, events, project_id, header_name, header_value, origin, active, last_event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [user.id, String(b.name ?? '').trim().slice(0, 100), url, newSecret(), events, projectId,
      header.header_name, header.header_value, String(b.origin ?? origin).slice(0, 300), b.active !== false, last],
  );
  return w;
}

export async function updateWebhook(user, w, b) {
  const sets = [];
  const values = [w.id];
  const set = (col, v) => { values.push(v); sets.push(`${col} = $${values.length}`); };
  if (b.name !== undefined) set('name', String(b.name ?? '').trim().slice(0, 100));
  if (b.url !== undefined) set('url', cleanUrl(b.url));
  if (b.events !== undefined) set('events', cleanEvents(b.events));
  if (b.project_id !== undefined) set('project_id', await cleanProject(user, b.project_id));
  if (b.header_name !== undefined) {
    // Valeur laissée vide : on garde l'ancienne (elle n'est jamais renvoyée au navigateur)
    const header = cleanHeader(b.header_name, b.header_value === undefined || b.header_value === '' ? w.header_value : b.header_value);
    set('header_name', header.header_name);
    set('header_value', header.header_value);
  }
  if (typeof b.active === 'boolean') {
    set('active', b.active);
    if (b.active) {
      // Remis en marche : on repart des événements à venir, sans rejouer ceux de la pause
      set('disabled_reason', '');
      set('failure_streak', 0);
      if (!w.active) {
        const { rows: [{ last }] } = await query('SELECT coalesce(max(id), 0)::bigint AS last FROM integration_events');
        set('last_event_id', last);
      }
    }
  }
  if (!sets.length) return w;
  const { rows: [updated] } = await query(`UPDATE webhooks SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, values);
  return updated;
}

export async function rotateSecret(w) {
  const { rows: [updated] } = await query('UPDATE webhooks SET secret = $2, updated_at = now() WHERE id = $1 RETURNING *', [w.id, newSecret()]);
  return updated;
}

/** Forme publique : jamais la valeur de l'en-tête ajouté ; le secret seulement si demandé. */
export function webhookView(w, { withSecret = false } = {}) {
  return {
    id: w.id,
    name: w.name,
    url: w.url,
    events: w.events ?? [],
    project_id: w.project_id,
    ...(w.project_name !== undefined ? { project_name: w.project_name } : {}),
    header_name: w.header_name,
    has_header_value: Boolean(w.header_value),
    active: w.active,
    disabled_reason: w.disabled_reason,
    failure_streak: w.failure_streak,
    last_status: w.last_status,
    last_delivery_at: w.last_delivery_at,
    created_at: w.created_at,
    updated_at: w.updated_at,
    ...(w.pending !== undefined ? { pending: w.pending, failed_week: w.failed_week } : {}),
    ...(withSecret ? { secret: w.secret } : {}),
  };
}

export async function deliveriesOf(webhookId, { limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT id, event_id, event_type, status, attempts, next_attempt_at, response_status, error, duration_ms, created_at, delivered_at,
            payload->'object' AS object
     FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [webhookId, Math.min(200, Math.max(1, limit))],
  );
  return rows;
}

/** Renvoyer un envoi (échoué ou non) : remis en file, tout de suite. */
export async function redeliver(webhookId, deliveryId) {
  const { rows } = await query(
    `UPDATE webhook_deliveries SET status = 'pending', attempts = 0, next_attempt_at = now(), error = ''
     WHERE id = $1 AND webhook_id = $2 RETURNING id`,
    [deliveryId, webhookId],
  );
  if (!rows[0]) throw new HttpError(404, 'Envoi introuvable');
  setImmediate(() => tick().catch(() => {}));
  return { ok: true };
}

// --- Envoi ------------------------------------------------------------------------------------------------

/** Un POST signé ; renvoie { ok, status, duration_ms, error }. */
export async function postPayload(w, deliveryId, payload) {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'Paillasse-Webhooks/1',
    'webhook-id': deliveryId,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': signPayload(w.secret, deliveryId, timestamp, body),
    'X-Paillasse-Event': payload.type,
  };
  if (w.header_name) headers[w.header_name] = w.header_value;
  const started = Date.now();
  try {
    const res = await fetch(w.url, { method: 'POST', headers, body, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel().catch(() => {});
    const ok = res.status >= 200 && res.status < 300;
    return { ok, status: res.status, duration_ms: Date.now() - started, error: ok ? '' : `Réponse ${res.status}` };
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? `Pas de réponse en ${TIMEOUT_MS / 1000} s`
      : err.cause?.code ? `${err.cause.code}${err.cause.message ? ` : ${err.cause.message}` : ''}` : err.message;
    return { ok: false, status: null, duration_ms: Date.now() - started, error: String(reason).slice(0, 300) };
  }
}

/** Envoi de test (événement « ping ») : immédiat, sans relance ; noté dans le journal des envois. */
export async function sendTest(w, user, origin = '') {
  const id = crypto.randomUUID();
  const payload = {
    id: 0,
    type: 'ping',
    occurred_at: new Date().toISOString(),
    object: { type: 'webhook', id: w.id, title: w.name || w.url },
    project_id: null,
    actor: { id: user.id, name: user.display_name },
    data: { message: 'Envoi de test depuis Paillasse : si vous lisez ceci, le webhook fonctionne.' },
    links: { web: `${w.origin || origin}/integrations` },
  };
  const r = await postPayload(w, id, payload);
  await query(
    `INSERT INTO webhook_deliveries (id, webhook_id, event_id, event_type, payload, status, attempts, response_status, error, duration_ms, delivered_at)
     VALUES ($1, $2, NULL, 'ping', $3, $4, 1, $5, $6, $7, now())`,
    [id, w.id, JSON.stringify(payload), r.ok ? 'ok' : 'failed', r.status, r.error, r.duration_ms],
  );
  await query('UPDATE webhooks SET last_status = $2, last_delivery_at = now() WHERE id = $1', [w.id, r.ok ? `ok ${r.status}` : r.error]);
  return r;
}

// --- Répartition des événements, envoi des files ----------------------------------------------------------

/** Événements nouveaux de chaque webhook actif → envois en attente. */
async function fanOut() {
  const { rows: hooks } = await query(
    `SELECT w.* FROM webhooks w JOIN users u ON u.id = w.user_id
     WHERE w.active AND u.disabled_at IS NULL AND u.deleted_at IS NULL`,
  );
  if (!hooks.length) return 0;
  const { rows: [{ max }] } = await query('SELECT coalesce(max(id), 0)::bigint AS max FROM integration_events');
  const top = Number(max);
  let created = 0;
  for (const w of hooks) {
    let cursor = Number(w.last_event_id);
    if (cursor >= top) continue;
    const { rows: events } = await query(
      `SELECT e.* FROM integration_events e
       WHERE e.id > $1 AND e.id <= $2 AND ${visibleEvent('e', '$3')}
         AND ($4::uuid IS NULL OR e.project_id = $4)
       ORDER BY e.id LIMIT 500`,
      [cursor, top, w.user_id, w.project_id],
    );
    let stopped = false;
    for (const e of events) {
      if (!typeMatches(w.events, e.type)) { cursor = Number(e.id); continue; }
      if (DEBOUNCED.has(e.type)) {
        // Remplacé par une modification plus récente du même objet : seule la dernière part
        const { rows: newer } = await query(
          'SELECT 1 FROM integration_events WHERE type = $1 AND object_type = $2 AND object_id = $3 AND id > $4 LIMIT 1',
          [e.type, e.object_type, e.object_id, e.id],
        );
        if (newer.length) { cursor = Number(e.id); continue; }
        // Encore en cours de modification : on attend qu'il se calme (les suivants attendent aussi, dans l'ordre)
        if (Date.now() - new Date(e.created_at).getTime() < DEBOUNCE_SECONDS * 1000) { stopped = true; break; }
      }
      await query(
        `INSERT INTO webhook_deliveries (webhook_id, event_id, event_type, payload) VALUES ($1, $2, $3, $4)`,
        [w.id, e.id, e.type, JSON.stringify(eventView(e, w.origin))],
      );
      created += 1;
      cursor = Number(e.id);
    }
    if (!stopped && events.length < 500) cursor = Math.max(cursor, top);
    if (cursor !== Number(w.last_event_id)) await query('UPDATE webhooks SET last_event_id = $2 WHERE id = $1', [w.id, cursor]);
  }
  return created;
}

async function deliverOne(d) {
  const r = await postPayload(d, d.id, d.payload);
  const attempts = d.attempts + 1;
  if (r.ok) {
    await query(
      `UPDATE webhook_deliveries SET status = 'ok', attempts = $2, response_status = $3, error = '', duration_ms = $4, delivered_at = now() WHERE id = $1`,
      [d.id, attempts, r.status, r.duration_ms],
    );
    await query(`UPDATE webhooks SET last_status = $2, last_delivery_at = now(), failure_streak = 0 WHERE id = $1`, [d.webhook_id, `ok ${r.status}`]);
    return;
  }
  const gone = r.status === 410;
  const giveUp = gone || attempts > RETRY_DELAYS.length;
  await query(
    `UPDATE webhook_deliveries SET status = $2, attempts = $3, response_status = $4, error = $5, duration_ms = $6,
       next_attempt_at = now() + make_interval(secs => $7)
     WHERE id = $1`,
    [d.id, giveUp ? 'failed' : 'pending', attempts, r.status, r.error, r.duration_ms, giveUp ? 0 : RETRY_DELAYS[attempts - 1]],
  );
  const { rows: [w] } = await query(
    `UPDATE webhooks SET last_status = $2, last_delivery_at = now(), failure_streak = failure_streak + $3 WHERE id = $1 RETURNING failure_streak`,
    [d.webhook_id, r.error, giveUp ? 1 : 0],
  );
  if (gone || (w && w.failure_streak >= PAUSE_AFTER)) {
    await query('UPDATE webhooks SET active = false, disabled_reason = $2 WHERE id = $1', [
      d.webhook_id, gone ? 'L’outil a répondu 410 (Gone) : webhook mis en pause.' : `${PAUSE_AFTER} envois abandonnés d’affilée : webhook mis en pause.`,
    ]);
  }
}

async function sendDue() {
  const { rows } = await query(
    `SELECT d.id, d.webhook_id, d.attempts, d.payload, w.url, w.secret, w.header_name, w.header_value
     FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
     WHERE d.status = 'pending' AND d.next_attempt_at <= now() AND w.active
     ORDER BY d.next_attempt_at, d.created_at LIMIT 25`,
  );
  // Un webhook à la fois dans l'ordre de ses événements ; plusieurs webhooks en parallèle
  const byHook = new Map();
  for (const d of rows) {
    if (!byHook.has(d.webhook_id)) byHook.set(d.webhook_id, []);
    byHook.get(d.webhook_id).push(d);
  }
  await Promise.all([...byHook.values()].map(async (list) => {
    for (const d of list) await deliverOne(d);
  }));
  return rows.length;
}

let running = false;
let lastPrune = 0;

/** Un passage : répartir, envoyer, et de temps en temps faire le ménage. */
export async function tick() {
  if (running) return;
  running = true;
  const lock = await pool.connect();
  try {
    // Un seul répartiteur à la fois, même si deux serveurs tournent sur la même base
    const { rows: [{ ok }] } = await lock.query('SELECT pg_try_advisory_lock(727274) AS ok');
    if (!ok) return;
    try {
      if (getSetting('integrations').webhooks) {
        await fanOut();
        await sendDue();
      }
      if (Date.now() - lastPrune > 6 * 3600_000) {
        lastPrune = Date.now();
        await pruneEvents(90);
        await query("DELETE FROM webhook_deliveries WHERE created_at < now() - interval '30 days' AND status <> 'pending'");
      }
    } finally {
      await lock.query('SELECT pg_advisory_unlock(727274)');
    }
  } finally {
    lock.release();
    running = false;
  }
}

/** Lance le répartiteur (toutes les 2 secondes). */
export function startWebhookDispatcher(intervalMs = 2000) {
  const timer = setInterval(() => {
    tick().catch((err) => console.error('Webhooks :', err.message));
  }, intervalMs);
  timer.unref();
  return timer;
}
