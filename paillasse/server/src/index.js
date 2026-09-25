import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { config } from './config.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { ensureFirstUser, parseCookies, requireAuth } from './auth.js';
import { ensureDataDirs } from './lib/storage.js';
import { escapeHtml } from './lib/render.js';
import { installTemplateLibrary } from './lib/templates.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
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
import { ownerBoard, sharedBoard } from './routes/board.js';

if (config.sessionSecret.length < 32) {
  console.error('SESSION_SECRET manquant ou trop court (32 caractères minimum). Voir server/.env.example');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '25mb' }));
app.use(parseCookies);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
// Tableaux partagés par lien : accessibles sans compte (mot de passe du lien)
app.use('/api/shared/:token', sharedBoard);

const api = express.Router();
api.use(requireAuth);
api.use('/projects/:projectId/board', ownerBoard);
api.use('/projects', projectRoutes);
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
  if (err.expose) return [err.status || 400, err.message];
  return [500, 'Erreur interne du serveur. Le détail est dans le journal : journalctl -u paillasse'];
}

app.use((err, req, res, _next) => {
  const [status, message] = describeError(err);
  if (status >= 500) console.error(`${req.method} ${req.originalUrl}`, err);
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

const server = app.listen(config.port, config.host, () => {
  console.log(`Paillasse en écoute sur http://${config.host}:${config.port}`);
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
