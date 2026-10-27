// API REST v1 (/api/v1) : une route par opération du registre, plus l'appel générique /tools/{nom}, la description
// OpenAPI et l'export de documents. Les paramètres viennent du chemin, de la requête (GET) ou du corps JSON.
// /api/v1/assistant : la même API pour un assistant IA de labo (outils choisis, réponses courtes, écriture en deux
// temps), à déclarer telle quelle comme serveur d'outils OpenAPI (Open WebUI).
import { Router } from 'express';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { originOf } from '../lib/markdownExport.js';
import { allOperations, getOperation, invoke, listOperations, summary } from './registry.js';
import { API_VERSION, openapiDocument, pathParams, prefixNames, successStatus } from './openapi.js';
import { documentsRoute } from './documents.js';
import { assistantPrompt, fitResponse, unlinkedMessage } from './assistant.js';
import './ops/index.js';

/** Contexte d'un appel : qui, par quel accès, pour quel profil. */
function contextOf(req, profile, op) {
  const assistant = profile === 'assistant';
  const prefix = assistant ? config.assistant.toolPrefix : '';
  return {
    user: req.user,
    token: req.apiToken ?? null,
    origin: originOf(req),
    profile,
    assistant: req.assistantIdentity ?? null,
    // L'écriture demandée par une IA de labo passe toujours par un aperçu, puis une confirmation
    twoPhase: assistant || req.apiToken?.kind === 'assistant',
    toolName: op ? `${prefix}${op.name}` : undefined,
    turn: req.get(config.assistant.turnHeader)?.slice(0, 200) || null,
  };
}

function buildRouter(profile) {
  const assistant = profile === 'assistant';
  const ops = assistant ? listOperations({ profile }) : allOperations();
  const rename = assistant ? prefixNames(config.assistant.toolPrefix, ops.map((op) => op.name)) : (t) => t;
  const send = (res, op, { result, dryRun }) => res.status(dryRun ? 200 : successStatus(op)).json(assistant ? fitResponse(result) : result);
  const r = Router();

  // Venue par l'assistant, compte pas encore relié : seules les opérations qui l'orientent ou le relient répondent
  const open = ops.filter((op) => op.allowUnlinked);
  r.use((req, res, next) => {
    if (req.user) return next();
    const allowed = open.some((op) => (req.method === op.http.method && req.path === op.http.path)
      || (req.method === 'POST' && req.path === `/tools/${op.name}`));
    if (allowed) return next();
    res.status(403).json({ error: rename(unlinkedMessage(req.assistantIdentity)), linked: false });
  });

  // Accueil : ce que propose l'API, et où trouver le reste
  r.get('/', (req, res) => {
    const origin = originOf(req);
    const base = `${origin}/api/v1${assistant ? '/assistant' : ''}`;
    res.json({
      name: assistant ? 'Paillasse (assistant)' : 'Paillasse',
      api_version: API_VERSION,
      user: { id: req.user.id, name: req.user.display_name },
      access: req.apiToken ? { via: req.apiToken.kind === 'assistant' ? 'assistant' : 'jeton', name: req.apiToken.name, scope: req.apiToken.scope } : { session: true },
      openapi: `${base}/openapi.json`,
      mcp: `${origin}/mcp${assistant ? '?profile=assistant' : ''}`,
      documentation: `${origin}/integrations`,
      operations: listOperations({ scope: req.apiToken?.scope ?? 'write', profile }).map((op) => ({
        name: assistant ? `${config.assistant.toolPrefix}${op.name}` : op.name, group: op.group, method: op.http.method,
        path: `/api/v1${assistant ? '/assistant' : ''}${op.http.path}`, scope: op.scope, title: op.title, summary: rename(summary(op)),
      })),
    });
  });

  if (!assistant) r.get('/documents', documentsRoute);

  // Appel générique : POST …/tools/{nom} avec les paramètres en JSON (pratique depuis un outil d'automatisation)
  r.post('/tools/:name', async (req, res) => {
    const prefix = assistant ? config.assistant.toolPrefix : '';
    const name = prefix && req.params.name.startsWith(prefix) ? req.params.name.slice(prefix.length) : req.params.name;
    const op = getOperation(name);
    if (!op || !ops.includes(op)) throw new HttpError(404, `Opération inconnue : ${req.params.name}. Liste : GET ${req.baseUrl}`);
    send(res, op, await invoke(op.name, req.body ?? {}, contextOf(req, profile, op)));
  });

  for (const op of ops) {
    const method = op.http.method.toLowerCase();
    const expressPath = op.http.path.replace(/\{(\w+)\}/g, ':$1');
    const inPath = pathParams(op.http.path);
    r[method](expressPath, async (req, res) => {
      const fromQuery = method === 'get' || method === 'delete' ? { ...req.query } : {};
      const fromBody = method === 'get' || method === 'delete' ? {} : (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
      const fromPath = Object.fromEntries(inPath.map((name) => [name, req.params[name]]));
      send(res, op, await invoke(op.name, { ...fromQuery, ...fromBody, ...fromPath }, contextOf(req, profile, op)));
    });
  }

  r.use((req, res) => res.status(404).json({ error: `Route inconnue : ${req.method} ${req.originalUrl}. Liste des opérations : GET ${req.baseUrl} ; description : ${req.baseUrl}/openapi.json` }));
  // Messages d'erreur : avec les noms d'outils que voit l'assistant
  if (assistant) {
    r.use((err, _req, _res, next) => {
      if (err?.expose && typeof err.message === 'string') err.message = rename(err.message);
      next(err);
    });
  }
  return r;
}

export const v1 = Router();
v1.use('/assistant', buildRouter('assistant'));
v1.use(buildRouter('full'));

/** Description OpenAPI (publique : elle ne contient aucune donnée). */
export function openapiRoute(req, res) {
  res.set('Cache-Control', 'no-cache');
  res.json(openapiDocument(originOf(req)));
}

/** Description OpenAPI du profil assistant (outils choisis, noms préfixés) : à déclarer dans l'assistant. */
export function assistantOpenapiRoute(req, res) {
  res.set('Cache-Control', 'no-cache');
  res.json(openapiDocument(originOf(req), { profile: 'assistant' }));
}

/** Branche de consigne à ajouter au prompt système de l'assistant (texte, public). */
export function assistantPromptRoute(req, res) {
  res.set('Cache-Control', 'no-cache');
  res.type('text/markdown; charset=utf-8').send(assistantPrompt(originOf(req)));
}
