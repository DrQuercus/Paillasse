// Documentation publique pour les outils (aucune donnée du cahier) : /llms.txt, le résumé que lit une IA pour
// savoir comment se servir de Paillasse, et le pont MCP stdio à télécharger.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { originOf } from '../lib/markdownExport.js';
import { listOperations, summary } from './registry.js';
import { API_VERSION } from './openapi.js';
import { EVENT_GROUPS } from './events.js';
import './ops/index.js';

const BRIDGE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/paillasse-mcp.mjs');

/** llms.txt (https://llmstxt.org) : Markdown, généré depuis le registre des opérations. */
export function llmsText(origin = '') {
  const byGroup = new Map();
  for (const op of listOperations()) {
    if (!byGroup.has(op.group)) byGroup.set(op.group, []);
    byGroup.get(op.group).push(op);
  }
  const lines = [
    '# Paillasse',
    '',
    '> Cahier de laboratoire électronique d’un labo de biologie : entrées du cahier (en Markdown, rangées par projet, '
      + 'brouillons ou verrouillées), registre de séquences ADN (codes SEQ-0001), stockage des échantillons (congélateurs, '
      + 'boîtes, tubes : codes ECH-0001), jeux de données statistiques, modèles d’entrée, produits et marqueurs de taille. '
      + 'Accès par une API REST (OpenAPI 3.1) et un serveur MCP, avec un jeton d’accès personnel.',
    '',
    'Toutes les réponses sont en français. Les identifiants sont des UUID ; séquences et tubes acceptent aussi leur code. '
      + 'Dates au format AAAA-MM-JJ. Le contenu des entrées se lit et s’écrit en Markdown.',
    '',
    '## Connexion',
    '',
    '- Jeton d’accès : chaque utilisateur le crée dans Paillasse, page Intégrations (/integrations), en lecture seule ou en '
      + 'lecture et écriture. À envoyer dans l’en-tête `Authorization: Bearer pai_…`. Il agit avec les droits du compte sur ses '
      + 'projets, jamais avec les droits d’administration.',
    `- [Serveur MCP](${origin}/mcp) : transport Streamable HTTP, sans état (POST JSON-RPC 2.0). Outils, ressources `
      + '(paillasse://entries/{id}…) et consignes prêtes à l’emploi. `?profile=essential` : une douzaine d’outils seulement '
      + '(petits modèles) ; `?tools=search,get_entry` : liste choisie.',
    `- [Pont MCP stdio](${origin}/integrations/paillasse-mcp.mjs) pour les clients qui ne lancent que des serveurs locaux : `
      + '`PAILLASSE_URL=… PAILLASSE_TOKEN=pai_… node paillasse-mcp.mjs` (Node 18 ou plus, sans dépendance).',
    `- [Description OpenAPI 3.1](${origin}/api/v1/openapi.json) de l’API REST (version ${API_VERSION}), utilisable comme `
      + 'serveur d’outils (Open WebUI, n8n…).',
    `- [Liste des opérations](${origin}/api/v1) avec le jeton ; appel générique : \`POST /api/v1/tools/{nom}\` avec les paramètres en JSON.`,
    '',
    '## Synchronisation',
    '',
    `- [Changements](${origin}/api/v1/changes) : ce qui a changé depuis un curseur (\`cursor\`), regroupé par objet ; `
      + 'garder `next_cursor` pour l’appel suivant.',
    `- [Documents](${origin}/api/v1/documents) : tout ce que le compte voit, un document par objet (texte en Markdown et `
      + 'métadonnées), en NDJSON, pour l’indexer dans une IA locale (RAG). `since` : seulement ce qui a changé depuis une date.',
    '- Webhooks : un POST JSON signé (Standard Webhooks : en-têtes webhook-id, webhook-timestamp, webhook-signature) à chaque '
      + `événement choisi (familles ${Object.keys(EVENT_GROUPS).map((f) => `\`${f}.*\``).join(', ')}, ou un type précis comme `
      + '`entry.locked`) ; à déclarer dans la page Intégrations ou par `POST /api/integrations/webhooks` (jeton en écriture).',
    '',
    '## Opérations',
    '',
    'Chaque opération est un outil MCP du même nom et une route REST. (écriture) : jeton « lecture et écriture » requis.',
  ];
  for (const [group, ops] of byGroup) {
    lines.push('', `### ${group}`, '');
    for (const op of ops) {
      lines.push(`- \`${op.name}\` — \`${op.http.method} /api/v1${op.http.path}\`${op.scope === 'write' ? ' (écriture)' : ''} : ${summary(op)}`);
    }
  }
  lines.push(
    '',
    '## Règles d’usage',
    '',
    '- Commencer par `whoami` (compte, projets accessibles), puis `search` pour trouver, `get_entry` pour lire une entrée.',
    '- Citer l’adresse (`url`) des objets utilisés.',
    '- Ne jamais verrouiller une entrée (`lock_entry`) sans demande explicite : c’est une signature, définitive. '
      + 'Une entrée verrouillée se complète par un addendum (`create_addendum`).',
    '- Écrire en Markdown (titres, listes, tableaux, cases à cocher) ; les images jointes se citent par leur adresse /api/files/….',
    '- Réponse 429 : trop de requêtes, attendre le délai de l’en-tête Retry-After.',
    '',
  );
  return lines.join('\n');
}

export function llmsRoute(req, res) {
  res.set('Cache-Control', 'no-cache');
  res.type('text/markdown; charset=utf-8').send(llmsText(originOf(req)));
}

/** Le pont MCP stdio, à télécharger (aucune donnée, aucun secret dedans). */
export function bridgeRoute(_req, res) {
  res.set('Cache-Control', 'no-cache');
  res.type('text/javascript; charset=utf-8');
  res.attachment('paillasse-mcp.mjs');
  res.sendFile(BRIDGE);
}
