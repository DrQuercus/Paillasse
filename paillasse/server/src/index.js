import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { ensureFirstUser, parseCookies, requireAdmin, requireAuth, requirePasswordChosen } from './auth.js';
import { installServerLog } from './lib/serverLog.js';
import { loadSettings } from './lib/settings.js';
import { startBackupScheduler } from './lib/backup.js';
import { ensureDataDirs } from './lib/storage.js';
import { escapeHtml } from './lib/render.js';
import { installTemplateLibrary } from './lib/templates.js';
import authRoutes from './routes/auth.js';
import projectRoutes, { directory, invitations } from './routes/projects.js';
import entryRoutes from './routes/entries.js';
import attachmentRoutes from './routes/attachments.js';
import templateRoutes from './routes/templates.js';
import searchRoutes from './routes/search.js';
import exportRoutes from './routes/export.js';
import sequenceRoutes from './routes/sequences.js';
import toolRoutes from './routes/tools.js';
import reagentRoutes from './routes/reagents.js';
import ladderRoutes from './routes/ladders.js';
import datasetRoutes from './routes/datasets.js';
import inventoryRoutes from './routes/inventory.js';
import adminRoutes from './routes/admin.js';
import { ownerBoard, sharedBoard } from './routes/board.js';
import integrationRoutes from './integrations/routes.js';
import integrationAdminRoutes from './integrations/admin.js';
import { openapiRoute, v1 } from './integrations/rest.js';
import { mcp, mcpParseError } from './integrations/mcp.js';
import { bridgeRoute, llmsRoute } from './integrations/docs.js';
import { flushTokenUsage } from './integrations/tokens.js';
import { startWebhookDispatcher } from './integrations/webhooks.js';

installServerLog();

if (config.sessionSecret.length < 32) {
  console.error('SESSION_SECRET manquant ou trop court (32 caractères minimum). Voir server/.env.example');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
// API v1 et MCP : pièces jointes en base64 (20 Mo de fichier font 27 Mo de JSON)
app.use(['/api/v1', '/mcp'], express.json({ limit: '40mb' }));
app.use(express.json({ limit: '25mb' }));
app.use('/mcp', mcpParseError);
app.use(parseCookies);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
// Tableaux partagés par lien : accessibles sans compte (mot de passe du lien)
app.use('/api/shared/:token', sharedBoard);

// Ouverture aux autres outils (IA locale, automatisations, scripts) : API REST v1 et serveur MCP, avec un jeton
// d'accès. Appelables depuis une autre origine (outil dans le navigateur), jamais avec le cookie de session
// (pas de « credentials » en CORS). La portée du jeton y est vérifiée opération par opération.
function openCors(req, res, next) {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID',
    'Access-Control-Expose-Headers': 'X-Paillasse-Cursor, Retry-After, WWW-Authenticate, Mcp-Session-Id',
    'Access-Control-Max-Age': '600',
  });
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}
const scopeByOperation = (req, _res, next) => {
  req.scopeByOperation = true;
  next();
};
app.get('/api/v1/openapi.json', openCors, openapiRoute);
app.get('/llms.txt', llmsRoute);
app.get('/integrations/paillasse-mcp.mjs', bridgeRoute);
app.use('/api/v1', openCors, scopeByOperation, requireAuth, requirePasswordChosen, v1);
app.use('/mcp', openCors, scopeByOperation, requireAuth, requirePasswordChosen, mcp);
// Découverte OAuth des clients MCP : pas d'OAuth ici (jeton d'accès personnel), réponse nette plutôt que la page web
app.use('/.well-known', (_req, res) => res.status(404).json({ error: 'Pas d’OAuth : utilisez un jeton d’accès personnel (page Intégrations).' }));

const api = express.Router();
api.use(requireAuth);
api.use(requirePasswordChosen);
api.use('/admin/integrations', requireAdmin, integrationAdminRoutes);
api.use('/admin', requireAdmin, adminRoutes);
api.use('/integrations', integrationRoutes);
api.use('/projects/:projectId/board', ownerBoard);
api.use('/projects', projectRoutes);
api.use('/invitations', invitations);
api.use('/users', directory);
api.use('/entries', entryRoutes);
api.use('/templates', templateRoutes);
api.use('/search', searchRoutes);
api.use('/export', exportRoutes);
api.use('/sequences', sequenceRoutes);
api.use('/tools', toolRoutes);
api.use('/reagents', reagentRoutes);
api.use('/ladders', ladderRoutes);
api.use('/datasets', datasetRoutes);
api.use('/inventory', inventoryRoutes);
api.use('/', attachmentRoutes);
api.use((_req, res) => res.status(404).json({ error: 'Route inconnue' }));
app.use('/api', api);

// Interface web compilée (client/dist)
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist, {
    index: false,
    // Fichiers à empreinte (assets/) : cache long. Les autres (éditeur de séquence, OVE…) gardent
    // le même nom d'une version à l'autre : le navigateur doit revalider, sinon il garde l'ancienne version.
    setHeaders: (res, filePath) => {
      res.set('Cache-Control', filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
}

// Gestion d'erreurs centralisée (Express 5 transmet les erreurs des handlers async)
function describeError(err) {
  if (err.code === '22P02' || err.code === '22007') return [400, 'Identifiant ou valeur invalide.'];
  if (err.code === '23503') return [400, 'Référence inconnue (projet, modèle ou entrée).'];
  if (err.code === 'LIMIT_FILE_SIZE') return [413, `Fichier trop volumineux (max ${config.maxUploadMb} Mo).`];
  if (err.type === 'entity.too.large') return [413, 'Contenu trop volumineux.'];
  if (err.type === 'entity.parse.failed') return [400, 'Corps de la requête illisible : JSON attendu.'];
  if (err.expose) return [err.status || 400, err.message];
  return [500, 'Erreur interne du serveur. Le détail est dans le journal : journalctl -u paillasse'];
}

app.use((err, req, res, _next) => {
  const [status, message] = describeError(err);
  // Erreur voulue (503 « primer3 absent »…) : pas de trace dans le journal
  if (status >= 500 && !err.expose) console.error(`${req.method} ${req.originalUrl}`, err);
  // Page ouverte directement dans le navigateur (impression, fichier) : message lisible plutôt que du JSON
  if (req.accepts(['json', 'html']) === 'html') {
    return res.status(status).type('html').send(`<!doctype html><html lang="fr"><meta charset="utf-8">
<title>Paillasse : erreur</title><body style="font:16px/1.5 system-ui,sans-serif;color:#1D2940;max-width:36rem;margin:4rem auto;padding:0 1rem">
<h1 style="font-size:1.3rem">Cette page n'a pas pu être affichée</h1><p>${escapeHtml(message)}</p>
<p><a href="/">Retour au cahier</a></p></body></html>`);
  }
  res.status(status).json({ error: message });
});

ensureDataDirs();
await migrate();
await installTemplateLibrary(pool);
await ensureFirstUser();
await loadSettings();
await startBackupScheduler();
startWebhookDispatcher();

const server = app.listen(config.port, config.host, () => {
  console.log(`Paillasse en écoute sur http://${config.host}:${config.port}`);
});

const shutdown = () => {
  server.close(() => flushTokenUsage().finally(() => pool.end()).then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
