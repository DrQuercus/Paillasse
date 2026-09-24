import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');

// Charge server/.env s'il existe (en production, systemd fournit EnvironmentFile)
const envFile = path.join(serverRoot, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export const config = {
  port: Number(process.env.PORT || 3070),
  host: process.env.HOST || '0.0.0.0',
  databaseUrl: process.env.DATABASE_URL || 'postgres://paillasse@localhost:5432/paillasse',
  dataDir: path.resolve(serverRoot, process.env.DATA_DIR || '../data'),
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  secureCookies: process.env.SECURE_COOKIES === 'true',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB || 500),
  clientDist: path.resolve(serverRoot, '../client/dist'),
  migrationsDir: path.join(serverRoot, 'migrations'),
};
