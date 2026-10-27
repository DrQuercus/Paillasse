// Page Intégrations : jetons d'accès, webhooks et informations de connexion (adresses de l'API, du serveur MCP).
// Les jetons se gèrent seulement depuis une session du navigateur (un jeton ne crée pas de jeton) ; les webhooks
// aussi avec un jeton en écriture (un outil d'automatisation peut déclarer lui-même son webhook).
import { Router } from 'express';
import { query } from '../db.js';
import { requireSession } from '../auth.js';
import { HttpError, notFound } from '../lib/errors.js';
import { getSetting, logAdmin } from '../lib/settings.js';
import { originOf } from '../lib/markdownExport.js';
import { SCOPES, newToken } from './tokens.js';
import { EVENT_GROUPS, EVENT_TYPES, lastEventId } from './events.js';
import { createWebhook, deliveriesOf, redeliver, rotateSecret, sendTest, updateWebhook, webhookView } from './webhooks.js';
import { assistantActive, assistantSettings, linkOfUser, linkView, newLinkCode, setLinkScope, unlink } from './assistant.js';

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOKENS = 50;

const TOKEN_COLUMNS = `id, name, scope, token_hint, created_at, expires_at, last_used_at, last_used_ip, use_count, revoked_at`;
const tokenView = (t) => ({
  ...t,
  use_count: Number(t.use_count),
  status: t.revoked_at ? 'revoked' : t.expires_at && new Date(t.expires_at) <= new Date() ? 'expired' : 'active',
});

/** Adresses à donner aux outils, vues depuis le navigateur (derrière nginx : l'adresse publique). */
export function endpoints(origin) {
  return {
    origin,
    api: `${origin}/api/v1`,
    openapi: `${origin}/api/v1/openapi.json`,
    mcp: `${origin}/mcp`,
    assistant_api: `${origin}/api/v1/assistant`,
    assistant_openapi: `${origin}/api/v1/assistant/openapi.json`,
    assistant_prompt: `${origin}/api/v1/assistant/prompt`,
    llms: `${origin}/llms.txt`,
    bridge: `${origin}/integrations/paillasse-mcp.mjs`,
    changes: `${origin}/api/v1/changes`,
    documents: `${origin}/api/v1/documents`,
  };
}

// Ce qu'affiche la page : adresses, réglages du labo, types d'événements
router.get('/info', async (req, res) => {
  const settings = getSetting('integrations');
  res.json({
    endpoints: endpoints(originOf(req)),
    enabled: settings.enabled,
    webhooks_enabled: settings.webhooks,
    scopes: SCOPES,
    event_types: EVENT_TYPES,
    event_groups: EVENT_GROUPS,
    last_event_id: await lastEventId(),
    via_token: Boolean(req.apiToken),
    assistant: assistantInfo(),
  });
});

// --- Assistant IA du labo : liaison de mon compte (session du navigateur seulement) --------------------------

function assistantInfo() {
  const a = assistantSettings();
  return {
    configured: a.configured,
    active: assistantActive(),
    name: a.name,
    url: a.url || null,
    tool_prefix: a.toolPrefix,
    max_chars: a.maxChars,
    modes: { signed_header: Boolean(a.jwtSecret), session: Boolean(a.identityUrl) },
  };
}

router.get('/assistant', requireSession, async (req, res) => {
  res.json({ ...assistantInfo(), link: linkView(await linkOfUser(req.user.id)) });
});

router.post('/assistant/code', requireSession, async (req, res) => {
  if (!assistantActive()) throw new HttpError(403, 'L’assistant IA n’est pas branché sur ce cahier, ou l’administrateur l’a désactivé.');
  res.status(201).json(await newLinkCode(req.user));
});

router.patch('/assistant', requireSession, async (req, res) => {
  if (!['read', 'write'].includes(req.body?.scope)) throw new HttpError(400, 'Droits : read (lecture seule) ou write (lecture et écriture).');
  await setLinkScope(req.user, req.body.scope);
  res.json(linkView(await linkOfUser(req.user.id)));
});

router.delete('/assistant', requireSession, async (req, res) => {
  await unlink(req.user.id, req.user);
  res.json({ ok: true });
});

// --- Jetons d'accès (session du navigateur seulement) ------------------------------------------------------

router.get('/tokens', requireSession, async (req, res) => {
  const { rows } = await query(
    `SELECT ${TOKEN_COLUMNS} FROM api_tokens WHERE user_id = $1
       AND (revoked_at IS NULL OR revoked_at > now() - interval '30 days')
     ORDER BY revoked_at NULLS FIRST, created_at DESC`,
    [req.user.id],
  );
  res.json(rows.map(tokenView));
});

router.post('/tokens', requireSession, async (req, res) => {
  if (!getSetting('integrations').enabled) throw new HttpError(403, 'L’accès par jeton est désactivé par l’administrateur du cahier.');
  const name = String(req.body?.name ?? '').trim().slice(0, 100);
  if (!name) throw new HttpError(400, 'Nommez le jeton (l’outil qui s’en servira : « Open WebUI », « n8n »…).');
  const scope = req.body?.scope === 'write' ? 'write' : 'read';
  const days = req.body?.expires_in_days == null || req.body.expires_in_days === '' ? null : Math.trunc(Number(req.body.expires_in_days));
  if (days !== null && !(days >= 1 && days <= 3650)) throw new HttpError(400, 'Durée de validité : de 1 à 3 650 jours, ou sans limite.');
  const { rows: [{ n }] } = await query('SELECT count(*)::int AS n FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
  if (n >= MAX_TOKENS) throw new HttpError(409, `${MAX_TOKENS} jetons actifs au plus : révoquez ceux qui ne servent plus.`);
  const t = newToken();
  const { rows: [row] } = await query(
    `INSERT INTO api_tokens (user_id, name, scope, token_hash, token_hint, expires_at)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)
     RETURNING ${TOKEN_COLUMNS}`,
    [req.user.id, name, scope, t.hash, t.hint, days],
  );
  await logAdmin(req.user, 'Jeton d’accès créé', `${req.user.display_name} : « ${name} » (${SCOPES[scope].toLowerCase()}${days ? `, ${days} jours` : ''})`);
  // La valeur n'est renvoyée qu'ici : elle n'est gardée nulle part en clair
  res.status(201).json({ ...tokenView(row), token: t.token });
});

router.patch('/tokens/:id', requireSession, async (req, res) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 100);
  if (!name) throw new HttpError(400, 'Nom manquant.');
  const { rows } = await query(
    `UPDATE api_tokens SET name = $3 WHERE id = $1 AND user_id = $2 RETURNING ${TOKEN_COLUMNS}`,
    [req.params.id, req.user.id, name],
  );
  if (!rows[0]) throw notFound('Jeton');
  res.json(tokenView(rows[0]));
});

router.delete('/tokens/:id', requireSession, async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound('Jeton');
  const { rows } = await query(
    `UPDATE api_tokens SET revoked_at = coalesce(revoked_at, now()), revoked_by = coalesce(revoked_by, $2)
     WHERE id = $1 AND user_id = $2 RETURNING name`,
    [req.params.id, req.user.id],
  );
  if (!rows[0]) throw notFound('Jeton');
  await logAdmin(req.user, 'Jeton d’accès révoqué', `${req.user.display_name} : « ${rows[0].name} »`);
  res.json({ ok: true });
});

// --- Webhooks (session, ou jeton en écriture) ---------------------------------------------------------------

async function ownWebhook(user, id) {
  if (!UUID.test(String(id))) throw notFound('Webhook');
  const { rows } = await query('SELECT * FROM webhooks WHERE id = $1 AND user_id = $2', [id, user.id]);
  if (!rows[0]) throw notFound('Webhook');
  return rows[0];
}

router.get('/webhooks', async (req, res) => {
  const { rows } = await query(
    `SELECT w.*, p.name AS project_name,
            (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'pending')::int AS pending,
            (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed' AND d.created_at > now() - interval '7 days')::int AS failed_week
     FROM webhooks w LEFT JOIN projects p ON p.id = w.project_id
     WHERE w.user_id = $1 ORDER BY w.created_at`,
    [req.user.id],
  );
  res.json(rows.map((w) => webhookView(w, { withSecret: !req.apiToken })));
});

router.post('/webhooks', async (req, res) => {
  const w = await createWebhook(req.user, req.body ?? {}, originOf(req));
  // Le secret de signature est montré à la création, même par jeton : l'outil doit vérifier les envois
  res.status(201).json(webhookView(w, { withSecret: true }));
});

router.get('/webhooks/:id', async (req, res) => {
  res.json(webhookView(await ownWebhook(req.user, req.params.id), { withSecret: !req.apiToken }));
});

router.patch('/webhooks/:id', async (req, res) => {
  const w = await ownWebhook(req.user, req.params.id);
  res.json(webhookView(await updateWebhook(req.user, w, req.body ?? {}), { withSecret: !req.apiToken }));
});

router.delete('/webhooks/:id', async (req, res) => {
  const w = await ownWebhook(req.user, req.params.id);
  await query('DELETE FROM webhooks WHERE id = $1', [w.id]);
  res.json({ ok: true });
});

router.post('/webhooks/:id/secret', requireSession, async (req, res) => {
  const w = await ownWebhook(req.user, req.params.id);
  res.json(webhookView(await rotateSecret(w), { withSecret: true }));
});

router.post('/webhooks/:id/test', async (req, res) => {
  const w = await ownWebhook(req.user, req.params.id);
  res.json(await sendTest(w, req.user, originOf(req)));
});

router.get('/webhooks/:id/deliveries', async (req, res) => {
  const w = await ownWebhook(req.user, req.params.id);
  res.json(await deliveriesOf(w.id, { limit: Number(req.query.limit) || 50 }));
});

router.post('/webhooks/:id/deliveries/:deliveryId/retry', async (req, res) => {
  const w = await ownWebhook(req.user, req.params.id);
  if (!UUID.test(req.params.deliveryId)) throw notFound('Envoi');
  res.json(await redeliver(w.id, req.params.deliveryId));
});

export default router;
