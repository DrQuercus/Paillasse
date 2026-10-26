import pg from 'pg';
import { config } from './config.js';

// Les colonnes DATE restent des chaînes 'AAAA-MM-JJ' : pas de décalage de fuseau horaire
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Exécute fn(client) dans une transaction. client.beforeCommit : tâches à faire juste avant la validation
 * (écriture des événements des intégrations, voir integrations/events.js).
 */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    client.beforeCommit = [];
    const result = await fn(client);
    for (const task of client.beforeCommit) await task(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.beforeCommit = null;
    client.release();
  }
}
