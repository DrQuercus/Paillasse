// API REST v1 (/api/v1) : une route par opération du registre, plus l'appel générique /tools/{nom}, la description
// OpenAPI et l'export de documents. Les paramètres viennent du chemin, de la requête (GET) ou du corps JSON.
import { Router } from 'express';
import { HttpError } from '../lib/errors.js';
import { originOf } from '../lib/markdownExport.js';
import { getOperation, invoke, listOperations, summary } from './registry.js';
import { API_VERSION, openapiDocument, pathParams, successStatus } from './openapi.js';
import { documentsRoute } from './documents.js';
import './ops/index.js';

const ctxOf = (req) => ({ user: req.user, token: req.apiToken ?? null, origin: originOf(req) });

export const v1 = Router();

// Accueil : ce que propose l'API, et où trouver le reste
v1.get('/', (req, res) => {
  const origin = originOf(req);
  res.json({
    name: 'Paillasse',
    api_version: API_VERSION,
    user: { id: req.user.id, name: req.user.display_name },
    access: req.apiToken ? { token: req.apiToken.name, scope: req.apiToken.scope } : { session: true },
    openapi: `${origin}/api/v1/openapi.json`,
    mcp: `${origin}/mcp`,
    documentation: `${origin}/integrations`,
    operations: listOperations({ scope: req.apiToken?.scope ?? 'write' }).map((op) => ({
      name: op.name, group: op.group, method: op.http.method, path: `/api/v1${op.http.path}`, scope: op.scope,
      title: op.title, summary: summary(op), essential: Boolean(op.essential),
    })),
  });
});

v1.get('/documents', documentsRoute);

// Appel générique : POST /api/v1/tools/{nom} avec les paramètres en JSON (pratique depuis un outil d'automatisation)
v1.post('/tools/:name', async (req, res) => {
  if (!getOperation(req.params.name)) throw new HttpError(404, `Opération inconnue : ${req.params.name}. Liste : GET /api/v1`);
  const { op, result } = await invoke(req.params.name, req.body ?? {}, ctxOf(req));
  res.status(successStatus(op)).json(result);
});

for (const op of listOperations()) {
  const method = op.http.method.toLowerCase();
  const expressPath = op.http.path.replace(/\{(\w+)\}/g, ':$1');
  const inPath = pathParams(op.http.path);
  v1[method](expressPath, async (req, res) => {
    const fromQuery = method === 'get' || method === 'delete' ? { ...req.query } : {};
    const fromBody = method === 'get' || method === 'delete' ? {} : (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
    const fromPath = Object.fromEntries(inPath.map((name) => [name, req.params[name]]));
    const { result } = await invoke(op.name, { ...fromQuery, ...fromBody, ...fromPath }, ctxOf(req));
    res.status(successStatus(op)).json(result);
  });
}

v1.use((req, res) => res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}. Liste des opérations : GET /api/v1 ; description : /api/v1/openapi.json` }));

/** Description OpenAPI (publique : elle ne contient aucune donnée). */
export function openapiRoute(req, res) {
  res.set('Cache-Control', 'no-cache');
  res.json(openapiDocument(originOf(req)));
}
