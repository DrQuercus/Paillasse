// Crée un compte ou réinitialise son mot de passe (en secours : sans passer par la page Maintenance).
// Usage : npm run create-user -- <identifiant> ["Nom affiché"] [--admin]
// Un compte réinitialisé ici est aussi réactivé ; --admin le rend administrateur.
import readline from 'node:readline';
import { hashPassword } from '../src/auth.js';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const args = process.argv.slice(2);
const admin = args.includes('--admin');
const [username, displayName] = args.filter((a) => a !== '--admin');
if (!username) {
  console.error('Usage : npm run create-user -- <identifiant> ["Nom affiché"] [--admin]');
  process.exit(1);
}

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.stdoutMuted = false;
    rl._writeToOutput = (s) => rl.output.write(rl.stdoutMuted ? '' : s);
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    rl.stdoutMuted = true;
  });
}

try {
  await migrate({ log: () => {} });
  const password = process.env.NEW_PASSWORD || (await askHidden('Mot de passe : '));
  if (password.length < 8) throw new Error('Le mot de passe doit faire au moins 8 caractères.');
  const confirm = process.env.NEW_PASSWORD || (await askHidden('Confirmation : '));
  if (password !== confirm) throw new Error('Les deux saisies ne correspondent pas.');
  const { rows } = await pool.query(
    `INSERT INTO users (username, display_name, password_hash, is_admin) VALUES ($1, $2, $3, $5)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           display_name = COALESCE($4, users.display_name),
           is_admin = users.is_admin OR $5,
           disabled_at = NULL,
           must_change_password = false,
           sessions_valid_after = now()
     RETURNING (xmax = 0) AS created, is_admin`,
    [username, displayName || username, hashPassword(password), displayName || null, admin],
  );
  const role = rows[0].is_admin ? ' (administrateur)' : '';
  console.log(rows[0].created ? `Compte « ${username} » créé${role}.` : `Mot de passe de « ${username} » mis à jour, compte actif${role}.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
