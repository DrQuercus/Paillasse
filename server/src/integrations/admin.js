// Page Maintenance, onglet Intégrations (administrateurs) : interrupteur général de l'accès par jeton et des
// webhooks, liste de tous les jetons et webhooks du labo, révocation d'un jeton, pause d'un webhook.
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { getSetting, logAdmin, setSetting } from '../lib/settings.js';
import { lastEventId } from './events.js';
import { webhookView } from './webhooks.js';
import { assistantActive, assistantSettings, assistantTools, lastTurnSeen, unlink } from './assistant.js';
import { descriptionFor, getOperation, inputFor, listOperations } from './registry.js';

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ce que l'administrateur doit savoir de l'assistant : comment il est branché, et qui y est relié. */
async function assistantAdmin() {
  const a = assistantSettings();
  const { rows: links } = await query(
    `SELECT l.user_id, u.display_name AS user_name, l.email, l.name, l.scope, l.linked_at, l.last_used_at, l.use_count
     FROM assistant_links l JOIN users u ON u.id = l.user_id WHERE l.subject IS NOT NULL ORDER BY u.display_name`,
  );
  const tools = listOperations({ profile: 'assistant' });
  // Ce que le modèle garde dans sa fenêtre de contexte à chaque message : nom, description et paramètres des outils
  const payload = tools.map((op) => ({ name: `${a.toolPrefix}${op.name}`, description: descriptionFor(op, 'assistant'), parameters: inputFor(op, 'assistant') }));
  return {
    configured: a.configured,
    active: assistantActive(),
    name: a.name,
    url: a.url || null,
    modes: { signed_header: Boolean(a.jwtSecret), session: Boolean(a.identityUrl) },
    jwt_header: a.jwtHeader,
    // Identifiant du message reçu avec une écriture : la confirmation n'est acceptée qu'après une réponse de la personne
    turn_header: a.turnHeader,
    turn_seen_at: lastTurnSeen()?.toISOString() ?? null,
    identity_url: a.identityUrl || null,
    tool_prefix: a.toolPrefix,
    max_chars: a.maxChars,
    tools: tools.map((op) => ({ name: `${a.toolPrefix}${op.name}`, title: op.title, scope: op.scope })),
    unknown_tools: assistantTools().filter((n) => !getOperation(n)),
    refused_tools: assistantTools().filter((n) => getOperation(n)?.humanOnly),
    // ≈ 3,5 caractères par jeton pour un texte français et du JSON
    tool_tokens: Math.round(JSON.stringify(payload).length / 3.5),
    links: links.map((l) => ({ ...l, use_count: Number(l.use_count) })),
  };
}

router.get('/', async (req, res) => {
  const [{ rows: tokens }, { rows: hooks }, { rows: [stats] }] = await Promise.all([
    query(`SELECT t.id, t.name, t.scope, t.token_hint, t.created_at, t.expires_at, t.last_used_at, t.last_used_ip, t.use_count,
                  t.revoked_at, u.id AS user_id, u.display_name AS user_name, r.display_name AS revoked_by_name
           FROM api_tokens t JOIN users u ON u.id = t.user_id LEFT JOIN users r ON r.id = t.revoked_by
           WHERE t.revoked_at IS NULL OR t.revoked_at > now() - interval '30 days'
           ORDER BY t.revoked_at NULLS FIRST, t.last_used_at DESC NULLS LAST, t.created_at DESC`),
    query(`SELECT w.*, u.display_name AS user_name, p.name AS project_name,
                  (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'pending')::int AS pending,
                  (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed' AND d.created_at > now() - interval '7 days')::int AS failed_week
           FROM webhooks w JOIN users u ON u.id = w.user_id LEFT JOIN projects p ON p.id = w.project_id
           ORDER BY w.active DESC, w.created_at`),
    query(`SELECT (SELECT count(*) FROM integration_events WHERE created_at > now() - interval '24 hours')::int AS events_day,
                  (SELECT count(*) FROM integration_events)::int AS events_total,
                  (SELECT count(*) FROM webhook_deliveries WHERE status = 'pending')::int AS deliveries_pending,
                  (SELECT count(*) FROM webhook_deliveries WHERE status = 'ok' AND created_at > now() - interval '7 days')::int AS deliveries_ok_week,
                  (SELECT count(*) FROM webhook_deliveries WHERE status = 'failed' AND created_at > now() - interval '7 days')::int AS deliveries_failed_week`),
  ]);
  const now = Date.now();
  res.json({
    settings: getSetting('integrations'),
    stats: { ...stats, last_event_id: await lastEventId() },
    tokens: tokens.map((t) => ({
      ...t,
      use_count: Number(t.use_count),
      status: t.revoked_at ? 'revoked' : t.expires_at && new Date(t.expires_at).getTime() <= now ? 'expired' : 'active',
    })),
    webhooks: hooks.map((w) => ({ ...webhookView(w), user_id: w.user_id, user_name: w.user_name })),
    assistant: await assistantAdmin(),
  });
});

router.put('/settings', async (req, res) => {
  const before = getSetting('integrations');
  const pick = (key) => (typeof req.body?.[key] === 'boolean' ? req.body[key] : before[key]);
  const value = { enabled: pick('enabled'), webhooks: pick('webhooks'), assistant: pick('assistant') };
  const saved = await setSetting('integrations', value, req.user.id);
  if (value.enabled !== before.enabled) {
    await logAdmin(req.user, value.enabled ? 'Accès par jeton rouvert' : 'Accès par jeton coupé', 'API, serveur MCP, automatisations');
  }
  if (value.webhooks !== before.webhooks) {
    await logAdmin(req.user, value.webhooks ? 'Webhooks remis en marche' : 'Webhooks suspendus', '');
  }
  if (value.assistant !== before.assistant) {
    await logAdmin(req.user, value.assistant ? 'Accès par l’assistant IA rouvert' : 'Accès par l’assistant IA coupé', assistantSettings().name);
  }
  res.json(saved);
});

router.post('/tokens/:id/revoke', async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound('Jeton');
  const { rows } = await query(
    `UPDATE api_tokens t SET revoked_at = now(), revoked_by = $2 FROM users u
     WHERE t.id = $1 AND u.id = t.user_id AND t.revoked_at IS NULL RETURNING t.name, u.display_name`,
    [req.params.id, req.user.id],
  );
  if (!rows[0]) throw new HttpError(404, 'Jeton introuvable ou déjà révoqué.');
  await logAdmin(req.user, 'Jeton d’accès révoqué', `« ${rows[0].name} » de ${rows[0].display_name}`);
  res.json({ ok: true });
});

router.post('/webhooks/:id/pause', async (req, res) => {
  if (!UUID.test(req.params.id)) throw notFound('Webhook');
  const { rows } = await query(
    `UPDATE webhooks w SET active = false, disabled_reason = $2, updated_at = now() FROM users u
     WHERE w.id = $1 AND u.id = w.user_id RETURNING w.name, w.url, u.display_name`,
    [req.params.id, `Mis en pause par ${req.user.display_name} (administrateur).`],
  );
  if (!rows[0]) throw notFound('Webhook');
  await logAdmin(req.user, 'Webhook mis en pause', `${rows[0].name || rows[0].url} (${rows[0].display_name})`);
  res.json({ ok: true });
});

router.delete('/assistant/links/:userId', async (req, res) => {
  if (!UUID.test(req.params.userId)) throw notFound('Compte');
  await unlink(req.params.userId, req.user);
  res.json({ ok: true });
});

/** L'assistant répond-il ? (son adresse de vérification des sessions, sans session : un refus est attendu) */
router.post('/assistant/check', async (_req, res) => {
  const a = assistantSettings();
  if (!a.identityUrl) return res.json({ ok: Boolean(a.jwtSecret), detail: a.jwtSecret ? 'Identité par en-tête signé : rien à joindre, le secret suffit.' : 'Assistant non configuré.' });
  const started = Date.now();
  try {
    const r = await fetch(a.identityUrl, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(5000) });
    await r.body?.cancel().catch(() => {});
    const ok = r.status === 401 || r.status === 403;
    res.json({ ok, status: r.status, ms: Date.now() - started, detail: ok ? 'Joignable : il refuse bien une requête sans session.' : `Réponse inattendue (${r.status}) : vérifiez l’adresse (Open WebUI : …/api/v1/auths/).` });
  } catch (err) {
    res.json({ ok: false, detail: `Injoignable depuis Paillasse : ${err.cause?.code ?? err.message}.` });
  }
});

export default router;
