// Serveur MCP (Model Context Protocol) de Paillasse, transport « Streamable HTTP » sans état : une IA locale
// (Open WebUI, LM Studio, AnythingLLM, Jan, Claude Desktop via le pont stdio, n8n…) se connecte à /mcp avec un
// jeton d'accès (Authorization: Bearer pai_…) et y trouve :
//   tools      toutes les opérations du registre (lecture seule si le jeton l'est) ;
//   resources  les entrées, séquences, tubes, projets, modèles et jeux de données, lisibles par adresse paillasse://… ;
//   prompts    des consignes prêtes à l'emploi (résumer une entrée, bilan d'un projet, préparer une manip…).
// Paramètres d'adresse : ?profile=assistant (outils choisis pour une IA de labo à petite fenêtre de contexte,
// réponses courtes, écriture en deux temps ; « essential » en est un alias), ?tools=nom1,nom2.
// La personne qui parle à l'assistant IA du labo peut aussi être reconnue (voir assistant.js) : Paillasse lui
// répond avec ses droits ; tant que son compte n'est pas relié, seuls l'orientation et la liaison répondent.
import { Router } from 'express';
import { config } from '../config.js';
import { query } from '../db.js';
import { originOf } from '../lib/markdownExport.js';
import { visibleProjects } from '../lib/access.js';
import { descriptionFor, getOperation, inputFor, invoke, listOperations, profileOf } from './registry.js';
import { publicSchema } from './schema.js';
import { fitResponse, unlinkedMessage } from './assistant.js';
import './ops/index.js';

export const PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'paillasse', title: 'Paillasse — cahier de laboratoire', version: '1.0.0' };
const MAX_TEXT = 300_000;

const INSTRUCTIONS = `Paillasse est le cahier de laboratoire électronique du labo (biologie moléculaire, biochimie, cryo-EM).
On y trouve : les entrées du cahier (rangées par projet, en brouillon ou verrouillées/signées), le registre de séquences (codes SEQ-0001),
le stockage des échantillons (congélateurs, boîtes, tubes : codes ECH-0001), les jeux de données statistiques et les modèles d'entrée.
Pour commencer : whoami (droits et projets), puis search pour trouver, get_entry pour lire une entrée en Markdown.
Règles : citer l'adresse (url) des objets utilisés ; ne jamais verrouiller une entrée (lock_entry) sans demande explicite ;
une entrée verrouillée se complète par un addendum (create_addendum) ; écrire en Markdown ; dates au format AAAA-MM-JJ.`;

const TWO_PHASE = `Écriture en deux temps : une création ou une modification rend d'abord un aperçu (rien n'est enregistré) et un code ;
montrer l'aperçu à la personne et attendre sa réponse, puis rappeler le même outil avec les mêmes paramètres et confirmation = ce code, seulement si elle est d'accord.
N'écrire aucune séquence (ADN, protéine) : Paillasse la refuse, la citer par son code SEQ-…. Une réponse raccourcie (truncated) ou en parties (part) se complète en demandant la suite.`;

const profileOfReq = (req) => profileOf(req.query.profile);
const twoPhaseFor = (req) => profileOfReq(req) === 'assistant' || req.apiToken?.kind === 'assistant';
const instructionsFor = (req) => (twoPhaseFor(req) ? `${INSTRUCTIONS}\n${TWO_PHASE}` : INSTRUCTIONS);
const unlinkedError = (req) => Object.assign(new Error(unlinkedMessage(req.assistantIdentity)), { rpc: -32001 });

// --- Outils -----------------------------------------------------------------------------------------------------

function toolOf(op, profile) {
  return {
    name: op.name,
    title: op.title,
    description: descriptionFor(op, profile),
    inputSchema: publicSchema(inputFor(op, profile)),
    annotations: {
      title: op.title,
      readOnlyHint: op.scope === 'read',
      ...(op.scope === 'write' ? { destructiveHint: op.annotations?.destructiveHint ?? false, idempotentHint: op.annotations?.idempotentHint ?? false } : {}),
      openWorldHint: false,
    },
  };
}

function visibleTools(req) {
  const only = req.query.tools ? String(req.query.tools).split(',').map((s) => s.trim()).filter(Boolean) : null;
  // Écriture en deux temps (assistant) : pas de geste irréversible, réservé à la personne
  const ops = listOperations({ scope: req.apiToken?.scope ?? 'write', profile: profileOfReq(req), only })
    .filter((op) => !(op.humanOnly && twoPhaseFor(req)));
  // Venue par l'assistant : la liaison du compte est toujours proposée ; non reliée, elle seule (avec l'orientation)
  const link = getOperation('link_account');
  if (req.assistantIdentity && link && !ops.includes(link)) ops.push(link);
  return req.user ? ops : ops.filter((op) => op.allowUnlinked);
}

function textOf(op, result, args, max) {
  let text = (result?.dry_run ? null : op.text?.(result, args)) ?? null;
  if (text === null) text = JSON.stringify(result);
  if (text.length > max) text = `${text.slice(0, max)}\n… (réponse tronquée à ${max} caractères : affinez la demande, par exemple avec limit, offset, part ou un filtre)`;
  return text;
}

async function callTool(req, params) {
  const name = String(params?.name ?? '');
  const op = getOperation(name);
  // Un geste réservé à la personne reste appelable, pour que le refus dise pourquoi (registry.invoke)
  if (!op || !(visibleTools(req).includes(op) || (op.humanOnly && twoPhaseFor(req) && req.user))) {
    throw Object.assign(new Error(`Outil inconnu : ${name}`), { rpc: -32602 });
  }
  try {
    const assistant = profileOfReq(req) === 'assistant';
    const ctx = {
      user: req.user, token: req.apiToken ?? null, origin: originOf(req), profile: profileOfReq(req),
      assistant: req.assistantIdentity ?? null, twoPhase: twoPhaseFor(req), toolName: name,
      turn: req.get(config.assistant.turnHeader)?.slice(0, 200) || null,
    };
    const { result: raw, args } = await invoke(name, params?.arguments ?? {}, ctx);
    const result = assistant ? fitResponse(raw) : raw;
    const content = [{ type: 'text', text: textOf(op, result, args, assistant ? config.assistant.maxChars : MAX_TEXT) }, ...(result?.dry_run ? [] : op.content?.(result) ?? [])];
    const structured = result && typeof result === 'object' && !Array.isArray(result) && (result.dry_run || (!op.text && !op.content)) ? { structuredContent: result } : {};
    return { content, ...structured, isError: false };
  } catch (err) {
    // Erreur d'exécution : renvoyée à l'IA (qui peut corriger son appel), pas en erreur de protocole
    if (!err.expose) console.error(`MCP ${name} :`, err);
    const message = err.expose ? err.message : err.code === '22P02' ? 'Identifiant ou valeur invalide.' : 'Erreur interne du serveur.';
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

// --- Ressources -------------------------------------------------------------------------------------------------

const TEMPLATES = [
  { uriTemplate: 'paillasse://entries/{id}', name: 'entry', title: 'Entrée du cahier', mimeType: 'text/markdown', description: 'Une entrée en Markdown (propriétés, contenu, pièces jointes).' },
  { uriTemplate: 'paillasse://projects/{id}', name: 'project', title: 'Projet', mimeType: 'text/markdown', description: 'Un projet : description, membres, dernières entrées.' },
  { uriTemplate: 'paillasse://sequences/{id}', name: 'sequence', title: 'Séquence (GenBank)', mimeType: 'text/plain', description: 'Une séquence du registre au format GenBank (uuid ou code SEQ-0001).' },
  { uriTemplate: 'paillasse://samples/{id}', name: 'sample', title: 'Tube du stockage', mimeType: 'application/json', description: 'La fiche d’un tube et son historique (uuid ou code ECH-0001).' },
  { uriTemplate: 'paillasse://templates/{id}', name: 'template', title: 'Modèle d’entrée', mimeType: 'text/markdown', description: 'Un modèle d’entrée en Markdown.' },
  { uriTemplate: 'paillasse://datasets/{id}', name: 'dataset', title: 'Jeu de données', mimeType: 'text/csv', description: 'Un jeu de données statistiques en CSV.' },
];

const ctxOf = (req) => ({ user: req.user, token: req.apiToken ?? null, origin: originOf(req) });

async function readResource(req, uri) {
  if (!req.user) throw unlinkedError(req);
  const m = /^paillasse:\/\/(entries|projects|sequences|samples|templates|datasets)\/([^/?#]+)$/.exec(String(uri ?? ''));
  if (!m) throw Object.assign(new Error(`Adresse de ressource inconnue : ${uri}`), { rpc: -32002 });
  const [, kind, id] = m;
  const ctx = ctxOf(req);
  const run = async (name, args) => (await invoke(name, args, ctx)).result;
  try {
    if (kind === 'entries') return { uri, mimeType: 'text/markdown', text: (await run('get_entry', { entry_id: id })).markdown };
    if (kind === 'sequences') return { uri, mimeType: 'text/plain', text: (await run('get_sequence', { sequence_id: id, format: 'genbank' })).text };
    if (kind === 'samples') return { uri, mimeType: 'application/json', text: JSON.stringify(await run('get_sample', { sample_id: id }), null, 1) };
    if (kind === 'templates') return { uri, mimeType: 'text/markdown', text: (await run('get_template', { template_id: id })).markdown };
    if (kind === 'datasets') return { uri, mimeType: 'text/csv', text: (await run('get_dataset', { dataset_id: id, format: 'csv' })).csv };
    const p = await run('get_project', { project_id: id });
    const lines = [`# Projet : ${p.name}`, '', p.description ?? '', '', `Propriétaire : ${p.owner}. Membres : ${(p.members ?? []).map((x) => x.name).join(', ')}.`,
      `Entrées : ${p.counts?.entries ?? 0} (dont ${p.counts?.drafts ?? 0} brouillons) ; séquences : ${p.counts?.sequences ?? 0} ; jeux de données : ${p.counts?.datasets ?? 0}.`,
      '', '## Dernières entrées', '', ...(p.recent_entries ?? []).map((e) => `- ${e.date} — [${e.title}](${e.url}) (${e.status === 'locked' ? 'verrouillée' : 'brouillon'}) — paillasse://entries/${e.id}`)];
    return { uri, mimeType: 'text/markdown', text: lines.join('\n') };
  } catch (err) {
    if (err.status === 404 || err.status === 400) throw Object.assign(new Error(err.message), { rpc: -32002 });
    throw err;
  }
}

async function listResources(req, cursor) {
  if (!req.user) return { resources: [] };
  const offset = Math.max(0, Number.parseInt(cursor ?? '0', 10) || 0);
  const PAGE = 100;
  const { rows } = await query(
    `SELECT * FROM (
       SELECT 'projects' AS kind, p.id::text AS id, p.name AS title, NULL::date AS day, p.updated_at AS at, '' AS extra
       FROM projects p WHERE NOT p.archived AND p.id IN ${visibleProjects('$1')}
       UNION ALL
       SELECT 'entries', e.id::text, e.title, e.entry_date, e.updated_at, pr.name
       FROM entries e JOIN projects pr ON pr.id = e.project_id WHERE NOT e.archived AND e.project_id IN ${visibleProjects('$1')}
     ) r ORDER BY (kind = 'projects') DESC, at DESC LIMIT $2 OFFSET $3`,
    [req.user.id, PAGE + 1, offset],
  );
  const more = rows.length > PAGE;
  return {
    resources: rows.slice(0, PAGE).map((r) => ({
      uri: `paillasse://${r.kind}/${r.id}`,
      name: r.kind === 'projects' ? `projet-${r.id}` : `entree-${r.id}`,
      title: r.kind === 'projects' ? `Projet : ${r.title}` : `${r.day ? `${new Date(r.day).toLocaleDateString('sv-SE')} — ` : ''}${r.title}`,
      description: r.kind === 'projects' ? 'Projet du cahier' : `Entrée du projet ${r.extra}`,
      mimeType: 'text/markdown',
    })),
    ...(more ? { nextCursor: String(offset + PAGE) } : {}),
  };
}

// --- Consignes (prompts) ----------------------------------------------------------------------------------------

const PROMPTS = [
  {
    name: 'resume_entree', title: 'Résumer une entrée',
    description: 'Résume une entrée du cahier : objectif, méthode, résultats chiffrés, conclusion, suite à donner.',
    arguments: [{ name: 'entry_id', description: 'Identifiant de l’entrée', required: true }],
    async build(req, a) {
      const r = await readResource(req, `paillasse://entries/${a.entry_id}`);
      return [
        { role: 'user', content: { type: 'resource', resource: r } },
        { role: 'user', content: { type: 'text', text: 'Résume cette entrée du cahier en français, en cinq rubriques courtes : objectif, méthode, résultats (avec les chiffres importants), conclusion, suite à donner. Signale ce qui manque pour qu’elle soit complète (témoins, unités, lots…).' } },
      ];
    },
  },
  {
    name: 'bilan_projet', title: 'Bilan d’un projet',
    description: 'Bilan des derniers jours d’un projet à partir de ses entrées (pour une réunion d’équipe).',
    arguments: [{ name: 'project_id', description: 'Identifiant du projet', required: true }, { name: 'jours', description: 'Période en jours (7 par défaut)', required: false }],
    async build(req, a) {
      const days = Math.min(365, Math.max(1, Number(a.jours) || 7));
      const since = new Date(Date.now() - days * 86_400_000).toLocaleDateString('sv-SE');
      const { result } = await invoke('list_entries', { project_id: a.project_id, since, limit: 50 }, ctxOf(req));
      const list = result.entries.map((e) => `- ${e.date} — ${e.title} (${e.status === 'locked' ? 'verrouillée' : 'brouillon'}, ${e.author}) — id ${e.id}${e.excerpt ? `\n  ${e.excerpt.replace(/\s+/g, ' ').slice(0, 200)}` : ''}`).join('\n');
      return [{
        role: 'user',
        content: { type: 'text', text: `Voici les entrées des ${days} derniers jours (depuis le ${since}) du projet ${a.project_id} :\n\n${list || '(aucune entrée)'}\n\nLis les entrées utiles avec get_entry, puis rédige en français un bilan pour la réunion d’équipe : avancées, résultats marquants (chiffres), difficultés, prochaines étapes. Cite chaque entrée par son titre et son adresse.` },
      }];
    },
  },
  {
    name: 'preparer_manip', title: 'Préparer une manip',
    description: 'Prépare une expérience : modèle d’entrée adapté, tubes et réactifs disponibles, plan, puis création de l’entrée.',
    arguments: [{ name: 'description', description: 'L’expérience à préparer (ex. « miniprep de pET28-DegU, 4 clones »)', required: true }, { name: 'project_id', description: 'Projet où créer l’entrée', required: false }],
    async build(_req, a) {
      return [{
        role: 'user',
        content: { type: 'text', text: `Je prépare cette expérience : ${a.description}.\n1. Cherche un modèle d’entrée adapté (list_templates, get_template).\n2. Vérifie dans le stockage les tubes nécessaires (find_samples : plasmides, souches, amorces…) et donne leur emplacement exact ; regarde les produits (list_reagents) pour les solutions à préparer.\n3. Propose-moi un plan de manip (étapes, quantités, témoins).\n4. Quand je valide, crée l’entrée (create_entry${a.project_id ? ` dans le projet ${a.project_id}` : ''}, avec le modèle s’il y en a un) et ajoute le plan en Markdown.` },
      }];
    },
  },
  {
    name: 'retrouver_echantillon', title: 'Retrouver un échantillon',
    description: 'Retrouve un tube dans le stockage et donne son emplacement exact (appareil, étagère, boîte, position).',
    arguments: [{ name: 'description', description: 'Ce que l’on cherche (ex. « glycérol de BL21 pET28-DegU »)', required: true }],
    async build(_req, a) {
      return [{
        role: 'user',
        content: { type: 'text', text: `Retrouve dans le stockage : ${a.description}. Utilise find_samples (essaie plusieurs mots si besoin, et le code de la séquence liée), puis get_sample pour le meilleur candidat. Donne l’emplacement complet (appareil › étagère › rack › boîte › position), l’état du tube (sorti du froid ? décongélations ? péremption ?) et les autres aliquots disponibles.` },
      }];
    },
  },
  {
    name: 'rediger_conclusion', title: 'Rédiger la conclusion d’une entrée',
    description: 'Propose une conclusion et une discussion pour une entrée, puis l’ajoute si l’utilisateur valide.',
    arguments: [{ name: 'entry_id', description: 'Identifiant de l’entrée', required: true }],
    async build(req, a) {
      const r = await readResource(req, `paillasse://entries/${a.entry_id}`);
      return [
        { role: 'user', content: { type: 'resource', resource: r } },
        { role: 'user', content: { type: 'text', text: `Propose une conclusion (5 à 8 phrases) pour cette entrée : ce qui a marché, les résultats chiffrés, les limites, la suite. Montre-la-moi d’abord ; si je valide, ajoute-la à la fin avec append_to_entry (entry_id ${a.entry_id}) sous un titre « ## Conclusion ». Si l’entrée est verrouillée, propose un addendum (create_addendum) à la place.` } },
      ];
    },
  },
];

async function getPrompt(req, params) {
  const p = PROMPTS.find((x) => x.name === params?.name);
  if (!p) throw Object.assign(new Error(`Consigne inconnue : ${params?.name}`), { rpc: -32602 });
  const args = params?.arguments ?? {};
  for (const a of p.arguments) if (a.required && !args[a.name]) throw Object.assign(new Error(`Argument manquant : ${a.name}`), { rpc: -32602 });
  return { description: p.description, messages: await p.build(req, args) };
}

// --- JSON-RPC ---------------------------------------------------------------------------------------------------

function negotiate(requested) {
  return PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
}

async function handle(req, msg) {
  const { method, params } = msg;
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: negotiate(params?.protocolVersion),
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false }, prompts: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: instructionsFor(req),
      };
    case 'ping': return {};
    case 'tools/list': return { tools: visibleTools(req).map((op) => toolOf(op, profileOfReq(req))) };
    case 'tools/call': return callTool(req, params);
    case 'resources/list': return listResources(req, params?.cursor);
    case 'resources/templates/list': return { resourceTemplates: TEMPLATES };
    case 'resources/read': return { contents: [await readResource(req, params?.uri)] };
    case 'prompts/list': return { prompts: PROMPTS.map(({ build, ...p }) => p) };
    case 'prompts/get':
      if (!req.user) throw unlinkedError(req);
      return getPrompt(req, params);
    default: throw Object.assign(new Error(`Méthode inconnue : ${method}`), { rpc: -32601 });
  }
}

const isRequest = (m) => m && typeof m === 'object' && typeof m.method === 'string' && m.id !== undefined && m.id !== null;

async function answer(req, msg) {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Requête JSON-RPC 2.0 invalide.' } };
  }
  try {
    return { jsonrpc: '2.0', id: msg.id, result: await handle(req, msg) };
  } catch (err) {
    if (!err.rpc && !err.expose) console.error(`MCP ${msg.method} :`, err);
    const code = err.rpc ?? (err.status === 404 ? -32002 : err.status >= 400 && err.status < 500 ? -32602 : -32603);
    return { jsonrpc: '2.0', id: msg.id, error: { code, message: err.rpc || err.expose ? err.message : 'Erreur interne du serveur.' } };
  }
}

export const mcp = Router();

mcp.post('/', async (req, res) => {
  const version = req.get('mcp-protocol-version');
  if (version && !PROTOCOL_VERSIONS.includes(version)) {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: `Version du protocole non prise en charge : ${version} (${PROTOCOL_VERSIONS.join(', ')}).` } });
  }
  const body = req.body;
  const batch = Array.isArray(body);
  const messages = batch ? body : [body];
  if (!messages.length || (!batch && (body === undefined || body === null || typeof body !== 'object'))) {
    return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Corps JSON-RPC attendu.' } });
  }
  const requests = messages.filter(isRequest);
  // Notifications (initialized, cancelled…) et réponses seules : accusé de réception, sans corps
  if (!requests.length) {
    const invalid = messages.filter((m) => !m || typeof m !== 'object' || m.jsonrpc !== '2.0');
    if (invalid.length) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Requête JSON-RPC 2.0 invalide.' } });
    return res.status(202).end();
  }
  const answers = await Promise.all(requests.map((m) => answer(req, m)));
  res.json(batch ? answers : answers[0]);
});

// Pas de flux d'événements serveur → client : ce serveur ne fait que répondre
mcp.get('/', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Ce serveur MCP répond aux requêtes POST (pas de flux SSE).' }));
mcp.delete('/', (_req, res) => res.status(405).set('Allow', 'POST').json({ error: 'Pas de session à fermer : serveur sans état.' }));

/** Erreur de lecture du JSON (avant le routeur) : en erreur JSON-RPC « parse error ». */
export function mcpParseError(err, _req, res, next) {
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible.' } });
  return next(err);
}

export { PROMPTS, TEMPLATES as RESOURCE_TEMPLATES };
