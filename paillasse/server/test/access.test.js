// Projets privés ou partagés (migration 014) : qui voit quel projet. Tout se passe dans une transaction
// annulée à la fin : la base de développement n'est pas modifiée. Ignoré si PostgreSQL ne répond pas.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { config } from '../src/config.js';
import { visibleProjects } from '../src/lib/access.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 2000 });
let available = true;
try {
  const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE name = '014_project_sharing.sql'");
  available = rows.length > 0;
} catch {
  available = false;
}
after(() => pool.end());

test('visibilité : propriétaire et membres ayant accepté, personne d’autre', { skip: !available && 'PostgreSQL absent' }, async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const user = async (name) => (await c.query(
      "INSERT INTO users (username, display_name, password_hash) VALUES ($1, $1, '!') RETURNING id", [`essai-acces-${name}`])).rows[0].id;
    const [owner, invited, member, declined, stranger] = [await user('p'), await user('i'), await user('m'), await user('r'), await user('x')];
    const { rows: [p] } = await c.query("INSERT INTO projects (name, created_by) VALUES ('Essai accès', $1) RETURNING id", [owner]);
    await c.query(
      `INSERT INTO project_members (project_id, user_id, status, invited_by) VALUES
         ($1, $2, 'pending', $5), ($1, $3, 'accepted', $5), ($1, $4, 'declined', $5)`,
      [p.id, invited, member, declined, owner],
    );
    const sees = async (u) => (await c.query(`SELECT $2::uuid IN ${visibleProjects('$1')} AS v`, [u, p.id])).rows[0].v;
    assert.equal(await sees(owner), true, 'propriétaire');
    assert.equal(await sees(member), true, 'invitation acceptée');
    assert.equal(await sees(invited), false, 'invitation en attente : pas encore d’accès');
    assert.equal(await sees(declined), false, 'invitation refusée');
    assert.equal(await sees(stranger), false, 'autre compte');

    // Une seule ligne par compte et par projet ; statut contrôlé par la base
    await c.query('SAVEPOINT s');
    await assert.rejects(c.query("INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)", [p.id, member]));
    await c.query('ROLLBACK TO SAVEPOINT s');
    await assert.rejects(c.query("UPDATE project_members SET status = 'admin' WHERE user_id = $1", [member]));
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
});
