import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';
import { config } from './config.js';

// Les colonnes DATE restent des chaînes 'AAAA-MM-JJ' : pas de décalage de fuseau horaire
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

// Essai à sec en cours : toutes les requêtes passent par sa transaction, annulée à la fin (voir dryRun)
const dryRunClient = new AsyncLocalStorage();

export function query(text, params) {
  return (dryRunClient.getStore() ?? pool).query(text, params);
}

/**
 * Exécute fn(client) dans une transaction. client.beforeCommit : tâches à faire juste avant la validation
 * (écriture des événements des intégrations, voir integrations/events.js).
 */
export async function tx(fn) {
  const outer = dryRunClient.getStore();
  if (outer) return nestedTx(outer, fn);
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

/** Transaction dans un essai à sec : un point de sauvegarde de sa transaction. */
async function nestedTx(client, fn) {
  client.savepoints += 1;
  const name = `essai_${client.savepoints}`;
  const saved = client.beforeCommit;
  client.beforeCommit = [];
  await client.query(`SAVEPOINT ${name}`);
  try {
    const result = await fn(client);
    for (const task of client.beforeCommit) await task(client);
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (err) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`).catch(() => {});
    throw err;
  } finally {
    client.beforeCommit = saved;
  }
}

/**
 * Essai à sec : fn s'exécute pour de vrai (vérifications, places choisies, codes attribués…) dans une
 * transaction qui est ensuite annulée. Rien n'est enregistré ; les compteurs (codes ECH-…, SEQ-…) peuvent
 * seulement sauter un numéro. Ce qui touche aux fichiers vérifie inDryRun() et s'abstient.
 */
export async function dryRun(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    client.beforeCommit = [];
    client.savepoints = 0;
    return await dryRunClient.run(client, fn);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.beforeCommit = null;
    client.release();
  }
}

export const inDryRun = () => Boolean(dryRunClient.getStore());
