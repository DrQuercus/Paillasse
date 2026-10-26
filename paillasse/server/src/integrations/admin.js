// Page Maintenance, onglet Intégrations (administrateurs) : interrupteur général de l'accès par jeton et des
// webhooks, liste de tous les jetons et webhooks du labo, révocation d'un jeton, pause d'un webhook.
import { Router } from 'express';
import { query } from '../db.js';
import { HttpError, notFound } from '../lib/errors.js';
import { getSetting, logAdmin, setSetting } from '../lib/settings.js';
import { lastEventId } from './events.js';
import { webhookView } from './webhooks.js';

const router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/', async (_req, res) => {
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
  });
});

router.put('/settings', async (req, res) => {
  const before = getSetting('integrations');
  const value = {
    enabled: typeof req.body?.enabled === 'boolean' ? req.body.enabled : before.enabled,
    webhooks: typeof req.body?.webhooks === 'boolean' ? req.body.webhooks : before.webhooks,
  };
  const saved = await setSetting('integrations', value, req.user.id);
  if (value.enabled !== before.enabled) {
    await logAdmin(req.user, value.enabled ? 'Accès par jeton rouvert' : 'Accès par jeton coupé', 'API, serveur MCP, automatisations');
  }
  if (value.webhooks !== before.webhooks) {
    await logAdmin(req.user, value.webhooks ? 'Webhooks remis en marche' : 'Webhooks suspendus', '');
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

export default router;
