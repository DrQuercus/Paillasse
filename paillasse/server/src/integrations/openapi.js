// Description OpenAPI 3.1 de l'API REST v1, générée depuis le registre des opérations : Open WebUI (« serveurs
// d'outils OpenAPI »), n8n, Postman, un générateur de client, ou une IA qui lit la documentation.
import { listOperations } from './registry.js';
import { publicSchema } from './schema.js';

export const API_VERSION = '1.0.0';

const ERROR = { $ref: '#/components/responses/Error' };

/** Code de réussite d'une opération : 201 pour ce qui crée quelque chose. */
export const successStatus = (op) => (op.http.method === 'POST' && /^(create|store|add)_/.test(op.name) ? 201 : 200);

export function pathParams(path) {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

export function openapiDocument(origin = '') {
  const paths = {};
  const groups = new Set();
  for (const op of listOperations()) {
    groups.add(op.group);
    const method = op.http.method.toLowerCase();
    const inPath = pathParams(op.http.path);
    const props = op.input.properties ?? {};
    const required = new Set(op.input.required ?? []);
    const parameters = inPath.map((name) => ({
      name, in: 'path', required: true, description: props[name]?.description, schema: publicSchema(props[name] ?? { type: 'string' }),
    }));
    let requestBody;
    const rest = Object.entries(props).filter(([name]) => !inPath.includes(name));
    if (method === 'get' || method === 'delete') {
      for (const [name, schema] of rest) {
        parameters.push({ name, in: 'query', required: required.has(name), description: schema.description, schema: publicSchema(schema) });
      }
    } else if (rest.length) {
      const req = rest.map(([name]) => name).filter((name) => required.has(name));
      requestBody = {
        required: req.length > 0,
        content: {
          'application/json': {
            schema: { type: 'object', properties: Object.fromEntries(rest.map(([n, s]) => [n, publicSchema(s)])), ...(req.length ? { required: req } : {}), additionalProperties: false },
          },
        },
      };
    }
    const status = String(successStatus(op));
    paths[op.http.path] ??= {};
    paths[op.http.path][method] = {
      operationId: op.name,
      summary: op.title,
      description: `${op.description}${op.scope === 'write' ? '\n\nModifie le cahier : jeton « lecture et écriture » requis.' : ''}`,
      tags: [op.group],
      ...(parameters.length ? { parameters } : {}),
      ...(requestBody ? { requestBody } : {}),
      responses: {
        [status]: { description: 'Réussite', content: { 'application/json': { schema: { type: 'object' } } } },
        400: ERROR, 401: ERROR, 403: ERROR, 404: ERROR, 409: ERROR, 429: ERROR,
      },
      'x-paillasse-scope': op.scope,
    };
  }

  // Exports en bloc, hors registre (pour indexer tout le cahier, pas pour une IA en conversation)
  paths['/documents'] = {
    get: {
      operationId: 'export_documents',
      summary: 'Exporter des documents pour un index (RAG)',
      description: 'Tout ce que le compte voit, un document par objet (entrée en Markdown, séquence, tube, jeu de données, modèle, '
        + 'projet) avec ses métadonnées : pour indexer le cahier dans une IA locale (Open WebUI, AnythingLLM, LlamaIndex…). '
        + 'format=ndjson (par défaut) : une ligne JSON par document, en flux. format=json : page de documents (offset, limit). '
        + 'since : seulement ce qui a changé depuis (date ISO). Pour suivre les changements ensuite : /changes.',
      tags: ['Synchronisation'],
      parameters: [
        { name: 'types', in: 'query', description: 'entries, sequences, samples, datasets, templates, projects (par défaut : tous).', schema: { type: 'array', items: { type: 'string', enum: ['entries', 'sequences', 'samples', 'datasets', 'templates', 'projects'] } } },
        { name: 'since', in: 'query', description: 'Seulement les objets modifiés depuis cette date (ISO 8601).', schema: { type: 'string', format: 'date-time' } },
        { name: 'format', in: 'query', description: 'ndjson (par défaut) ou json.', schema: { type: 'string', enum: ['ndjson', 'json'] } },
        { name: 'limit', in: 'query', description: 'format=json : documents par page (1 à 500).', schema: { type: 'integer', minimum: 1, maximum: 500 } },
        { name: 'offset', in: 'query', description: 'format=json : décalage.', schema: { type: 'integer', minimum: 0 } },
      ],
      responses: {
        200: {
          description: 'Documents',
          content: {
            'application/x-ndjson': { schema: { $ref: '#/components/schemas/Document' } },
            'application/json': { schema: { type: 'object', properties: { documents: { type: 'array', items: { $ref: '#/components/schemas/Document' } }, next_offset: { type: ['integer', 'null'] }, cursor: { type: 'integer' } } } },
          },
        },
        401: ERROR,
      },
      'x-paillasse-scope': 'read',
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Paillasse',
      version: API_VERSION,
      description: 'API du cahier de laboratoire électronique Paillasse : lire et écrire les entrées (en Markdown), le registre de '
        + 'séquences, le stockage des échantillons, les jeux de données statistiques, les modèles ; suivre les changements. '
        + 'Authentification : jeton d’accès personnel (page Intégrations de Paillasse) dans l’en-tête Authorization: Bearer pai_…. '
        + 'Les mêmes opérations sont proposées aux IA par le serveur MCP (/mcp).',
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearer: [] }],
    tags: [...groups, 'Synchronisation'].filter((g, k, all) => all.indexOf(g) === k).map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'pai_…', description: 'Jeton d’accès personnel créé dans Paillasse (page Intégrations).' } },
      responses: {
        Error: { description: 'Erreur (message en français)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
        Document: {
          type: 'object',
          properties: {
            id: { type: 'string' }, type: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' },
            updated_at: { type: 'string', format: 'date-time' }, text: { type: 'string', description: 'Contenu en Markdown ou en texte.' },
            metadata: { type: 'object' },
          },
        },
      },
    },
  };
}
