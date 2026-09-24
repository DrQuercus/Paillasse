// Crée un compte ou réinitialise son mot de passe.
// Usage : npm run create-user -- <identifiant> ["Nom affiché"]
import readline from 'node:readline';
import { hashPassword } from '../src/auth.js';
import { pool } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const [username, displayName] = process.argv.slice(2);
if (!username) {
  console.error('Usage : npm run create-user -- <identifiant> ["Nom affiché"]');
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
    `INSERT INTO users (username, display_name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           display_name = COALESCE($4, users.display_name)
     RETURNING (xmax = 0) AS created`,
    [username, displayName || username, hashPassword(password), displayName || null],
  );
  console.log(rows[0].created ? `Compte « ${username} » créé.` : `Mot de passe de « ${username} » mis à jour.`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
