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
  // Assistant IA du labo (Open WebUI ou compatible) qui appelle Paillasse au nom de la personne qui lui parle.
  // Rien n'est actif sans ASSISTANT_JWT_SECRET ou ASSISTANT_IDENTITY_URL (voir server/.env.example).
  assistant: {
    name: (process.env.ASSISTANT_NAME || '').trim() || 'l’assistant IA',
    url: (process.env.ASSISTANT_URL || '').trim().replace(/\/+$/, ''),
    jwtSecret: (process.env.ASSISTANT_JWT_SECRET || '').trim(),
    jwtHeader: (process.env.ASSISTANT_JWT_HEADER || '').trim() || 'X-OpenWebUI-User-Jwt',
    // Identifiant du message en cours, joint par l'assistant à chaque appel d'outil (Open WebUI, en-têtes transmis)
    turnHeader: (process.env.ASSISTANT_TURN_HEADER || '').trim() || 'X-OpenWebUI-Message-Id',
    identityUrl: (process.env.ASSISTANT_IDENTITY_URL || '').trim(),
    tools: (process.env.ASSISTANT_TOOLS || '').split(',').map((s) => s.trim()).filter(Boolean),
    // (vide : paillasse_ ; « aucun » : pas de préfixe)
    toolPrefix: ((p) => (/^(aucun|none)$/i.test(p) ? '' : p || 'paillasse_'))((process.env.ASSISTANT_TOOL_PREFIX || '').trim()),
    maxChars: Math.max(2000, Number(process.env.ASSISTANT_MAX_CHARS) || 6000),
  },
};
