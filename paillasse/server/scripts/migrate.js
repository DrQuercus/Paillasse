import { migrate } from '../src/migrate.js';
import { pool } from '../src/db.js';

try {
  await migrate();
  console.log('Base de données à jour.');
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
