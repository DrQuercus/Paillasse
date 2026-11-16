#!/usr/bin/env node
// Pont MCP « stdio » vers le serveur MCP de Paillasse (/mcp), pour les clients qui ne savent lancer que des
// serveurs locaux (Claude Desktop, certaines versions de LM Studio, Jan, Cline, Continue…). Aucune dépendance :
// Node 18 ou plus suffit. Le client écrit ses messages JSON-RPC sur l'entrée standard (un par ligne), le pont les
// envoie à Paillasse avec le jeton et écrit les réponses sur la sortie standard. Le journal va sur stderr.
//
//   PAILLASSE_URL=https://paillasse.labo.fr PAILLASSE_TOKEN=pai_… node paillasse-mcp.mjs
//   node paillasse-mcp.mjs --check        vérifie l'adresse et le jeton, puis s'arrête
//
// Réglages (variables d'environnement, ou arguments --url, --token, --profile, --tools) :
//   PAILLASSE_URL       adresse de Paillasse (https://paillasse.labo.fr, ou directement …/mcp)
//   PAILLASSE_TOKEN     jeton d'accès personnel (page Intégrations de Paillasse)
//   PAILLASSE_PROFILE   essential : une douzaine d'outils seulement (petits modèles locaux)
//   PAILLASSE_TOOLS     liste d'outils choisie, séparés par des virgules (search,get_entry,…)
// Certificat d'une autorité interne au labo : NODE_EXTRA_CA_CERTS=/chemin/vers/ca.pem
import { createInterface } from 'node:readline';

const VERSION = '1.0.0';
const TIMEOUT_MS = 120_000;

function option(name) {
  const argv = process.argv.slice(2);
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return undefined;
  return argv[i].includes('=') ? argv[i].slice(argv[i].indexOf('=') + 1) : argv[i + 1];
}

const log = (message) => process.stderr.write(`[paillasse-mcp] ${message}\n`);

const base = String(option('url') ?? process.env.PAILLASSE_URL ?? '').trim().replace(/\/+$/, '');
const token = String(option('token') ?? process.env.PAILLASSE_TOKEN ?? '').trim();
const profile = option('profile') ?? process.env.PAILLASSE_PROFILE ?? '';
const tools = option('tools') ?? process.env.PAILLASSE_TOOLS ?? '';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  process.stderr.write(`Pont MCP stdio pour Paillasse ${VERSION}
Usage : PAILLASSE_URL=https://paillasse.labo.fr PAILLASSE_TOKEN=pai_… node paillasse-mcp.mjs [--check]
Options : --url, --token, --profile essential, --tools search,get_entry, --check
`);
  process.exit(0);
}
if (!base || !token) {
  log('PAILLASSE_URL et PAILLASSE_TOKEN sont requis (jeton : page Intégrations de Paillasse).');
  process.exit(2);
}

let endpoint;
try {
  endpoint = new URL(/\/mcp$/.test(base) ? base : `${base}/mcp`);
} catch {
  log(`Adresse invalide : ${base}`);
  process.exit(2);
}
if (profile) endpoint.searchParams.set('profile', profile);
if (tools) endpoint.searchParams.set('tools', tools);

let protocolVersion = null;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const reason = (err) => (err?.name === 'TimeoutError' ? `pas de réponse en ${TIMEOUT_MS / 1000} s` : err?.cause?.code ?? err?.cause?.message ?? err?.message ?? String(err));

/** POST vers Paillasse : réessaie sur une coupure réseau (2 fois) et sur 429 (selon Retry-After, 30 s au plus). */
async function post(body) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
    'User-Agent': `paillasse-mcp/${VERSION}`,
  };
  if (protocolVersion) headers['MCP-Protocol-Version'] = protocolVersion;
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 429 && attempt < 2) {
        const wait = Math.min(30, Number(res.headers.get('retry-after')) || 2);
        log(`Trop de requêtes : nouvel essai dans ${wait} s.`);
        await res.body?.cancel();
        await sleep(wait * 1000);
        continue;
      }
      return res;
    } catch (err) {
      if (attempt >= 2 || err?.name === 'TimeoutError') throw err;
      await sleep(1000 * (attempt + 1));
    }
  }
}

const isRequest = (m) => m && typeof m === 'object' && typeof m.method === 'string' && m.id !== undefined && m.id !== null;

function explain(status, message) {
  if (status === 401) return `Jeton refusé (401) : vérifiez PAILLASSE_TOKEN (révoqué ou expiré ?). ${message}`;
  if (status === 403) return `Accès refusé (403) : ${message}`;
  if (status === 503) return `Paillasse est en maintenance (503) : ${message}`;
  return `Paillasse a répondu ${status} : ${message}`;
}

/** Envoie un message (ou un lot) et renvoie la ou les réponses JSON-RPC à écrire (null : rien à écrire). */
async function forward(message) {
  const requests = (Array.isArray(message) ? message : [message]).filter(isRequest);
  const failAll = (text) => {
    if (!requests.length) {
      log(text);
      return null;
    }
    const errors = requests.map((r) => ({ jsonrpc: '2.0', id: r.id, error: { code: -32603, message: text } }));
    return Array.isArray(message) ? errors : errors[0];
  };
  let res;
  try {
    res = await post(JSON.stringify(message));
  } catch (err) {
    return failAll(`Paillasse injoignable (${endpoint.origin}) : ${reason(err)}`);
  }
  if (res.status === 202 || res.status === 204) return null;
  const type = res.headers.get('content-type') ?? '';
  const text = await res.text();
  if (type.includes('text/event-stream')) {
    // Pas utilisé par Paillasse aujourd'hui (réponses JSON directes), mais prévu par le protocole
    const out = text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5).trim()));
    return out.length === 1 ? out[0] : out;
  }
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* pas du JSON : page d'erreur d'un serveur intermédiaire */
  }
  if (body?.jsonrpc || (Array.isArray(body) && body[0]?.jsonrpc)) {
    for (const r of Array.isArray(body) ? body : [body]) {
      const asked = requests.find((q) => q.id === r?.id);
      if (asked?.method === 'initialize' && r.result?.protocolVersion) protocolVersion = r.result.protocolVersion;
    }
    return body;
  }
  return failAll(explain(res.status, body?.error ?? text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)));
}

const write = (message) => {
  if (message !== null && !(Array.isArray(message) && !message.length)) process.stdout.write(`${JSON.stringify(message)}\n`);
};

// --check : connexion, jeton, outils proposés
if (process.argv.includes('--check')) {
  const init = await forward({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'paillasse-mcp-check', version: VERSION } } });
  if (init?.error) {
    log(init.error.message);
    process.exit(1);
  }
  const list = await forward({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  const who = await forward({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'whoami', arguments: {} } });
  const me = who?.result?.structuredContent;
  log(`OK : ${endpoint.origin}, protocole ${init.result.protocolVersion}, ${list?.result?.tools?.length ?? 0} outils${me?.user ? `, compte ${me.user.name}` : ''}${me?.access?.scope ? ` (${me.access.scope})` : ''}.`);
  process.exit(0);
}

log(`Pont vers ${endpoint.origin}${endpoint.pathname}${endpoint.search} prêt.`);
const inFlight = new Set();
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON illisible.' } });
    return;
  }
  const job = forward(message).then(write, (err) => log(`Erreur : ${reason(err)}`));
  inFlight.add(job);
  job.finally(() => inFlight.delete(job));
});
rl.on('close', async () => {
  await Promise.allSettled([...inFlight]);
  process.exit(0);
});
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
