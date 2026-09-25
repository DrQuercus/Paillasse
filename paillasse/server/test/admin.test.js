// Administration : destinations de sauvegarde, planification, mots de passe provisoires, sessions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDest, lastDue, nextDue, parseDest, pgEnv } from '../src/lib/backup.js';
import { createSessionToken, readSession, temporaryPassword } from '../src/auth.js';
import { config } from '../src/config.js';

test('destinations : dossier du serveur ou serveur SSH', () => {
  assert.deepEqual(parseDest('/mnt/nas/paillasse/'), { kind: 'local', path: '/mnt/nas/paillasse' });
  assert.deepEqual(parseDest('louis@nas.labo:/srv/sauvegardes/paillasse'), { kind: 'ssh', host: 'louis@nas.labo', path: '/srv/sauvegardes/paillasse' });
  assert.deepEqual(parseDest('nas:/volume1/paillasse/'), { kind: 'ssh', host: 'nas', path: '/volume1/paillasse' });
  // Chemin distant passé au shell de l'hôte : pas d'espace, pas de caractère spécial
  assert.equal(parseDest('louis@nas:/srv/a b'), null);
  assert.equal(parseDest('louis@nas:/srv/$(reboot)'), null);
  assert.equal(parseDest('louis@nas:/srv/x;rm -rf /'), null);
  assert.equal(parseDest('relatif/chemin'), null);
  assert.equal(parseDest('-oProxyCommand:/srv'), null);
  assert.equal(parseDest('-v@nas:/srv'), null);
  assert.match(checkDest('sauvegardes'), /chemin/);
  assert.match(checkDest(config.dataDir), /dossier des données/);
  assert.match(checkDest(`${config.dataDir}/sauve`), /dossier des données/);
  assert.equal(checkDest('/mnt/nas/paillasse'), null);
});

test('planification : dernière et prochaine échéance, heure du serveur', () => {
  const now = new Date(2026, 8, 25, 10, 15);
  assert.deepEqual(lastDue('02:30', now), new Date(2026, 8, 25, 2, 30));
  assert.deepEqual(nextDue('02:30', now), new Date(2026, 8, 26, 2, 30));
  assert.deepEqual(lastDue('23:00', now), new Date(2026, 8, 24, 23, 0));
  assert.deepEqual(nextDue('23:00', now), new Date(2026, 8, 25, 23, 0));
  assert.deepEqual(lastDue('10:15', now), new Date(2026, 8, 25, 10, 15));
});

test('mot de passe provisoire : lisible, sans caractère ambigu, jamais le même', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const p = temporaryPassword();
    assert.match(p, /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
    seen.add(p);
  }
  assert.equal(seen.size, 200);
});

test('session : jeton signé, date d’émission retrouvée, jeton altéré refusé', () => {
  const before = Date.now();
  const { token } = createSessionToken('3f1c2f0e-0000-4000-8000-000000000001');
  const s = readSession(token);
  assert.equal(s.userId, '3f1c2f0e-0000-4000-8000-000000000001');
  assert.ok(s.issuedAt >= before && s.issuedAt <= Date.now());
  const [id, exp, sig] = token.split('.');
  assert.equal(readSession(`${id}.${Number(exp) + 86_400_000}.${sig}`), null);
  assert.equal(readSession(`${id.replace('1', '2')}.${exp}.${sig}`), null);
  assert.equal(readSession('n.importe.quoi'), null);
});

test('pg_dump : identifiants passés par l’environnement, pas en argument', () => {
  const env = pgEnv('postgres://paillasse:mot%20de%20passe@db.labo:5433/cahier?sslmode=require');
  assert.equal(env.PGHOST, 'db.labo');
  assert.equal(env.PGPORT, '5433');
  assert.equal(env.PGUSER, 'paillasse');
  assert.equal(env.PGPASSWORD, 'mot de passe');
  assert.equal(env.PGDATABASE, 'cahier');
  assert.equal(env.PGSSLMODE, 'require');
  assert.equal(pgEnv('postgres://paillasse@/cahier?host=/var/run/postgresql').PGHOST, '/var/run/postgresql');
});
