// Garde-fous de la base et suppression administrateur (migration 013). Tout se passe dans une transaction
// annulée à la fin : la base de développement n'est pas modifiée. Ignoré si PostgreSQL ne répond pas.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { config } from '../src/config.js';
import { cleanIds } from '../src/lib/purge.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 2000 });
let available = true;
try {
  const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE name = '013_admin_purge.sql'");
  available = rows.length > 0;
} catch {
  available = false;
}
after(() => pool.end());

/** Vrai si la requête est refusée ; un point de sauvegarde garde la transaction utilisable. */
async function refused(c, sql, params) {
  await c.query('SAVEPOINT essai');
  try {
    await c.query(sql, params);
    await c.query('RELEASE SAVEPOINT essai');
    return false;
  } catch {
    await c.query('ROLLBACK TO SAVEPOINT essai');
    return true;
  }
}

test('suppression : refusée partout, permise au serveur seulement (SET LOCAL), journal intouchable', { skip: !available && 'PostgreSQL absent' }, async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const { rows: [u] } = await c.query("INSERT INTO users (username, display_name, password_hash) VALUES ('essai-purge', 'Essai', '!') RETURNING id");
    const { rows: [p] } = await c.query("INSERT INTO projects (name, created_by) VALUES ('Essai', $1) RETURNING id", [u.id]);
    const { rows: [e] } = await c.query(
      "INSERT INTO entries (project_id, title, content, created_by, status) VALUES ($1, 'Verrouillée', '{}', $2, 'locked') RETURNING id", [p.id, u.id]);
    await c.query(
      `INSERT INTO entry_versions (entry_id, version_number, kind, title, entry_date, content, plain_text, created_by, created_at, content_hash, hash)
       VALUES ($1, 1, 'lock', 'Verrouillée', current_date, '{}', '', $2, now(), 'x', 'y')`, [e.id, u.id]);
    const { rows: [l] } = await c.query("INSERT INTO admin_log (user_id, user_name, action) VALUES ($1, 'Essai', 'essai') RETURNING id", [u.id]);

    // Sans le drapeau : tout est refusé
    assert.ok(await refused(c, 'DELETE FROM entry_versions WHERE entry_id = $1', [e.id]));
    assert.ok(await refused(c, 'DELETE FROM entries WHERE id = $1', [e.id]));
    assert.ok(await refused(c, "UPDATE entries SET title = 'changé' WHERE id = $1", [e.id]));
    assert.ok(await refused(c, 'UPDATE admin_log SET user_id = NULL WHERE id = $1', [l.id]));

    // Avec le drapeau (transaction du serveur) : la suppression passe…
    await c.query("SET LOCAL paillasse.purge = 'on'");
    assert.ok(!(await refused(c, 'DELETE FROM entry_versions WHERE entry_id = $1', [e.id])));
    assert.ok(!(await refused(c, 'DELETE FROM entries WHERE id = $1', [e.id])));
    // … mais le journal ne s'efface ni ne se réécrit ; seule la référence au compte peut partir
    assert.ok(await refused(c, 'DELETE FROM admin_log WHERE id = $1', [l.id]));
    assert.ok(await refused(c, "UPDATE admin_log SET detail = 'réécrit' WHERE id = $1", [l.id]));
    assert.ok(!(await refused(c, 'UPDATE admin_log SET user_id = NULL WHERE id = $1', [l.id])));
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
});

test('identifiants reçus : seulement des UUID, sans doublon', () => {
  assert.deepEqual(cleanIds(['3f1c2f0e-0000-4000-8000-000000000001', '3f1c2f0e-0000-4000-8000-000000000001', "1'; DROP TABLE users; --", 42]),
    ['3f1c2f0e-0000-4000-8000-000000000001']);
  assert.deepEqual(cleanIds('pas une liste'), []);
});
