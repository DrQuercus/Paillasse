// Réglages de l'application (table app_settings), gardés en mémoire : mode maintenance, intégrations.
import { query } from '../db.js';

const cache = new Map();
const DEFAULTS = {
  maintenance: { on: false, message: '' },
  // Ouverture aux autres outils : jetons d'accès (API, MCP), webhooks sortants, assistant IA du labo
  integrations: { enabled: true, webhooks: true, assistant: true },
};

export async function loadSettings() {
  const { rows } = await query('SELECT key, value FROM app_settings');
  cache.clear();
  for (const r of rows) cache.set(r.key, r.value);
}

export const getSetting = (key) => ({ ...DEFAULTS[key], ...(cache.get(key) ?? {}) });

export async function setSetting(key, value, userId = null) {
  await query(
    `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), userId],
  );
  cache.set(key, value);
  return getSetting(key);
}

/** Journal d'administration (ajout seul). user : { id, display_name } ou null pour le serveur. */
export async function logAdmin(user, action, detail = '', db = { query }) {
  await db.query('INSERT INTO admin_log (user_id, user_name, action, detail) VALUES ($1, $2, $3, $4)', [
    user?.id ?? null, user?.display_name ?? 'Serveur', action, String(detail ?? '').slice(0, 4000),
  ]);
}
