// Intégrations (API v1, MCP, webhooks) : validation des paramètres, signatures, jetons, description OpenAPI,
// protocole MCP, llms.txt. La dernière partie (événements de suppression, visibilité) passe par PostgreSQL, dans
// une transaction annulée à la fin ; elle est ignorée si la base ne répond pas.
import crypto from 'node:crypto';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import pg from 'pg';
import { config } from '../src/config.js';
import { dryRun, inDryRun, pool, query } from '../src/db.js';
import { validate, params, str, int, num, bool, list, uuid, date, oneOf, publicSchema } from '../src/integrations/schema.js';
import { signPayload, verifySignature, newSecret } from '../src/integrations/webhooks.js';
import { hashToken, looksLikeToken, newToken, rateLimit } from '../src/integrations/tokens.js';
import { getOperation, invoke, listOperations } from '../src/integrations/registry.js';
import { openapiDocument, pathParams } from '../src/integrations/openapi.js';
import { llmsText } from '../src/integrations/docs.js';
import { mcp, mcpParseError, PROTOCOL_VERSIONS } from '../src/integrations/mcp.js';
import { checkConfirmation, fitResponse, issueConfirmation, sequenceIn, verifyIdentityJwt } from '../src/integrations/assistant.js';
import { splitParts } from '../src/integrations/ops/common.js';
import { EVENT_TYPES, typeMatches, visibleEvent } from '../src/integrations/events.js';

after(() => pool.end());

const rejects400 = (fn, pattern) => assert.throws(fn, (err) => err.status === 400 && pattern.test(err.message));

test('paramètres : conversions tolérantes (IA, adresse de page)', () => {
  const schema = params({
    n: int('n'), x: num('x'), ok: bool('ok'), tags: list({ type: 'string' }, 'tags'), id: uuid('id'),
    day: date('jour'), kind: oneOf(['a', 'b'], 'kind'), name: str('nom', { maxLength: 5 }), raw: str('brut', { trim: false }),
    limit: int('limite', { default: 25, minimum: 1, maximum: 100 }),
  }, ['n']);
  const v = validate(schema, { n: '12', x: '1,5', ok: 'oui', tags: 'a, b', id: '0D205BFF-8A39-4A6E-A60F-8D1A1CBF01B3', day: '2026-10-26', kind: 'b', name: ' ab ', raw: ' ab ' });
  assert.deepEqual(v, { n: 12, x: 1.5, ok: true, tags: ['a', 'b'], id: '0D205BFF-8A39-4A6E-A60F-8D1A1CBF01B3', day: '2026-10-26', kind: 'b', name: 'ab', raw: ' ab ', limit: 25 });
  assert.deepEqual(validate(schema, { n: 1, tags: '["x","y"]' }).tags, ['x', 'y'], 'liste en JSON');
  assert.deepEqual(validate(schema, { n: 1, tags: 'seul' }).tags, ['seul'], 'valeur seule');
  assert.equal(validate(schema, { n: '3,0' }).n, 3);
  assert.equal(validate(schema, { n: 1, ok: 'non' }).ok, false);
  assert.equal(validate(schema, { n: 1, limit: null }).limit, 25, 'null vaut absent');
});

test('paramètres : erreurs explicites, en français', () => {
  const schema = params({ n: int('n', { minimum: 1, maximum: 10 }), id: uuid('id'), day: date('jour'), kind: oneOf(['a', 'b'], 'kind'), color: str('couleur', { pattern: '^#[0-9a-f]{6}$', patternHint: 'couleur #RRGGBB attendue.' }), sure: { type: 'boolean', const: true } }, ['n']);
  rejects400(() => validate(schema, {}), /« n » : obligatoire/);
  rejects400(() => validate(schema, { n: 'douze' }), /nombre entier attendu/);
  rejects400(() => validate(schema, { n: 11 }), /10 au plus/);
  rejects400(() => validate(schema, { n: 1, id: '12' }), /uuid/);
  rejects400(() => validate(schema, { n: 1, day: '26/10/2026' }), /AAAA-MM-JJ/);
  rejects400(() => validate(schema, { n: 1, kind: 'c' }), /valeurs possibles : "a", "b"/);
  rejects400(() => validate(schema, { n: 1, color: 'rouge' }), /#RRGGBB/);
  rejects400(() => validate(schema, { n: 1, sure: false }), /doit valoir true/);
  rejects400(() => validate(schema, { n: 1, colour: '#ffffff' }), /« colour » : paramètre inconnu\. Paramètres possibles : n, id, day, kind, color, sure/);
  // Objet imbriqué : le chemin du paramètre est donné
  const nested = params({ forward: { type: 'object', properties: { bases: str('bases', { minLength: 8 }) }, required: ['bases'], additionalProperties: false } });
  rejects400(() => validate(nested, { forward: { bases: 'ACG' } }), /« forward\.bases » : 8 caractères au moins/);
  assert.deepEqual(validate(nested, { forward: '{"bases": "ACGTACGTAA"}' }), { forward: { bases: 'ACGTACGTAA' } }, 'objet en JSON');
});

test('schéma publié : sans les mots-clés propres à Paillasse, noms de paramètres intacts', () => {
  const pub = publicSchema(params({ trim: str('un paramètre nommé trim', { trim: false, patternHint: 'x', pattern: '^a' }) }));
  assert.deepEqual(Object.keys(pub.properties), ['trim']);
  assert.equal(pub.properties.trim.trim, undefined);
  assert.equal(pub.properties.trim.patternHint, undefined);
  assert.equal(pub.properties.trim.pattern, '^a');
});

test('webhooks : signature Standard Webhooks (vecteur de la spécification)', () => {
  const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
  const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
  const ts = 1614265330;
  const body = '{"test": 2432232314}';
  const signature = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';
  assert.equal(signPayload(secret, id, ts, body), signature);
  const headers = { 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': signature };
  const at = { now: ts * 1000 };
  assert.equal(verifySignature(secret, headers, body, at), true);
  assert.equal(verifySignature(secret, { ...headers, 'webhook-signature': `v1,autre ${signature}` }, body, at), true, 'plusieurs signatures (rotation)');
  assert.equal(verifySignature(secret, headers, `${body} `, at), false, 'corps modifié');
  assert.equal(verifySignature(newSecret(), headers, body, at), false, 'autre secret');
  assert.equal(verifySignature(secret, headers, body, { now: (ts + 301) * 1000 }), false, 'horodatage trop ancien');
  assert.match(newSecret(), /^whsec_[A-Za-z0-9+/]{32}$/);
});

test('jetons : format, empreinte, limite de débit', () => {
  const t = newToken();
  assert.match(t.token, /^pai_[A-Za-z0-9_-]{32}$/);
  assert.equal(looksLikeToken(t.token), true);
  assert.equal(looksLikeToken('pai_court'), false);
  assert.equal(t.hash, hashToken(t.token));
  assert.match(t.hash, /^[0-9a-f]{64}$/);
  assert.equal(t.hint, `${t.token.slice(0, 8)}…${t.token.slice(-4)}`);
  // Rafale de 300, puis 20 par seconde
  const id = `essai-${Math.random()}`;
  const now = 1_000_000;
  for (let k = 0; k < 300; k += 1) assert.equal(rateLimit(id, now), 0);
  assert.equal(rateLimit(id, now), 1, '301e requête dans la même seconde : attendre');
  assert.equal(rateLimit(id, now + 1000), 0, 'une seconde plus tard : 20 de plus');
});

test('registre : chaque opération est complète et cohérente', () => {
  const ops = listOperations();
  assert.equal(ops.length, 44);
  const routes = new Set();
  for (const op of ops) {
    assert.ok(op.title && op.description.length > 30 && op.group, op.name);
    assert.ok(['GET', 'POST', 'PATCH', 'DELETE'].includes(op.http.method), op.name);
    const route = `${op.http.method} ${op.http.path.replace(/\{\w+\}/g, '{}')}`;
    assert.ok(!routes.has(route), `route en double : ${route}`);
    routes.add(route);
    for (const p of pathParams(op.http.path)) {
      assert.ok(op.input.properties[p], `${op.name} : ${p} non décrit`);
      assert.ok(op.input.required?.includes(p), `${op.name} : ${p} doit être obligatoire`);
    }
    if (op.http.method === 'GET') {
      for (const [name, s] of Object.entries(op.input.properties ?? {})) {
        assert.notEqual(s.type, 'object', `${op.name} : ${name} est un objet, impossible dans une adresse`);
        assert.ok(s.type !== 'array' || s.items?.type === 'string', `${op.name} : ${name} doit être une liste de textes`);
      }
      assert.equal(op.scope, 'read', `${op.name} : un GET ne modifie rien`);
    }
  }
  assert.equal(listOperations({ scope: 'read' }).length, 29, 'jeton de lecture : pas d’écriture');
  assert.equal(listOperations({ profile: 'assistant' }).length, 26, 'sélection de l’assistant');
  assert.equal(listOperations({ profile: 'essential' }).length, 26, 'ancien nom du même profil');
  assert.ok(!listOperations().some((op) => op.name === 'link_account'), 'la liaison n’apparaît que pour l’assistant');
  assert.deepEqual(listOperations({ only: ['search', 'get_entry'] }).map((o) => o.name), ['search', 'get_entry']);
  assert.equal(getOperation('lock_entry').annotations.destructiveHint, true);
});

test('registre : un jeton de lecture ne lance pas une opération d’écriture', async () => {
  await assert.rejects(
    invoke('create_project', { name: 'x' }, { user: { id: '00000000-0000-0000-0000-000000000000' }, token: { scope: 'read' } }),
    (err) => err.status === 403 && /lecture seule/.test(err.message),
  );
  await assert.rejects(invoke('nexiste_pas', {}, {}), (err) => err.status === 404);
});

test('OpenAPI 3.1 : identifiants uniques, paramètres de chemin déclarés, références résolues', () => {
  const doc = openapiDocument('https://paillasse.labo.fr');
  assert.equal(doc.openapi, '3.1.0');
  assert.deepEqual(doc.servers, [{ url: 'https://paillasse.labo.fr/api/v1' }]);
  const ids = [];
  for (const [path, item] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(item)) {
      ids.push(op.operationId);
      const declared = (op.parameters ?? []).filter((p) => p.in === 'path').map((p) => p.name).sort();
      assert.deepEqual(declared, pathParams(path).sort(), `${method} ${path}`);
      if (method === 'get') assert.equal(op.requestBody, undefined, `${method} ${path} : pas de corps`);
    }
  }
  assert.equal(new Set(ids).size, ids.length, 'operationId uniques');
  assert.equal(ids.length, 45, '44 opérations et l’export de documents');
  const text = JSON.stringify(doc);
  for (const ref of text.matchAll(/"\$ref":"#\/([^"]+)"/g)) {
    const target = ref[1].split('/').reduce((o, k) => o?.[k], doc);
    assert.ok(target, `référence introuvable : ${ref[1]}`);
  }
  assert.ok(!text.includes('patternHint') && !text.includes('"trim"'));
});

test('llms.txt : toutes les opérations et les adresses utiles', () => {
  const text = llmsText('https://paillasse.labo.fr');
  assert.match(text, /^# Paillasse\n\n> /);
  for (const op of listOperations()) assert.ok(text.includes(`\`${op.name}\``), op.name);
  for (const url of ['https://paillasse.labo.fr/mcp', 'https://paillasse.labo.fr/api/v1/openapi.json', 'https://paillasse.labo.fr/api/v1/documents']) {
    assert.ok(text.includes(url), url);
  }
});

test('événements : filtres des webhooks', () => {
  assert.equal(typeMatches([], 'entry.locked'), true, 'liste vide : tout');
  assert.equal(typeMatches(['entry.*'], 'entry.locked'), true);
  assert.equal(typeMatches(['entry.*'], 'entry_x.locked'), false);
  assert.equal(typeMatches(['sample.moved'], 'sample.out'), false);
  for (const type of Object.keys(EVENT_TYPES)) assert.match(type, /^[a-z_]+\.[a-z_]+$/);
});

// --- Protocole MCP (sans base : initialize, listes, erreurs JSON-RPC) ---------------------------------------

async function withMcp(fn) {
  const app = express();
  app.use(express.json());
  app.use(mcpParseError);
  app.use((req, _res, next) => {
    req.user = { id: '00000000-0000-0000-0000-000000000000', username: 'essai', display_name: 'Essai', is_admin: false };
    req.apiToken = req.get('x-scope') ? { id: 'x', name: 'essai', scope: req.get('x-scope') } : null;
    next();
  });
  app.use('/mcp', mcp);
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const rpc = async (body, headers = {}) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  try {
    await fn(rpc, url);
  } finally {
    server.close();
  }
}

test('MCP : initialisation, outils, ressources, consignes', async () => {
  await withMcp(async (rpc) => {
    let r = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } });
    assert.equal(r.body.result.protocolVersion, '2025-06-18');
    assert.equal(r.body.result.serverInfo.name, 'paillasse');
    assert.ok(r.body.result.capabilities.tools && r.body.result.capabilities.resources && r.body.result.capabilities.prompts);
    assert.match(r.body.result.instructions, /lock_entry/);
    r = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
    assert.equal(r.body.result.protocolVersion, PROTOCOL_VERSIONS[0], 'version inconnue : la plus récente');
    r = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    assert.equal(r.body.result.tools.length, 44);
    for (const t of r.body.result.tools) {
      assert.equal(t.inputSchema.type, 'object', t.name);
      assert.equal(typeof t.annotations.readOnlyHint, 'boolean', t.name);
    }
    r = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, { 'x-scope': 'read' });
    assert.equal(r.body.result.tools.length, 29);
    assert.ok(r.body.result.tools.every((t) => t.annotations.readOnlyHint));
    r = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'create_entry', arguments: {} } }, { 'x-scope': 'read' });
    assert.equal(r.body.error.code, -32602, 'outil d’écriture invisible pour un jeton de lecture');
    r = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'get_entry', arguments: { entry_id: 'pas-un-uuid' } } });
    assert.equal(r.body.result.isError, true, 'erreur d’exécution : renvoyée à l’IA');
    assert.match(r.body.result.content[0].text, /uuid/);
    r = await rpc({ jsonrpc: '2.0', id: 7, method: 'resources/templates/list' });
    assert.ok(r.body.result.resourceTemplates.some((t) => t.uriTemplate === 'paillasse://entries/{id}'));
    r = await rpc({ jsonrpc: '2.0', id: 8, method: 'resources/read', params: { uri: 'https://ailleurs' } });
    assert.equal(r.body.error.code, -32002);
    r = await rpc({ jsonrpc: '2.0', id: 9, method: 'prompts/list' });
    assert.deepEqual(r.body.result.prompts.map((p) => p.name), ['resume_entree', 'bilan_projet', 'preparer_manip', 'retrouver_echantillon', 'rediger_conclusion']);
    r = await rpc({ jsonrpc: '2.0', id: 10, method: 'prompts/get', params: { name: 'retrouver_echantillon', arguments: { description: 'glycérol BL21' } } });
    assert.match(r.body.result.messages[0].content.text, /glycérol BL21/);
    r = await rpc({ jsonrpc: '2.0', id: 11, method: 'prompts/get', params: { name: 'resume_entree', arguments: {} } });
    assert.equal(r.body.error.code, -32602, 'argument obligatoire manquant');
    r = await rpc({ jsonrpc: '2.0', id: 12, method: 'ping' });
    assert.deepEqual(r.body.result, {});
  });
});

test('MCP : erreurs JSON-RPC, lots, notifications', async () => {
  await withMcp(async (rpc, url) => {
    let r = await rpc({ jsonrpc: '2.0', id: 1, method: 'nimporte/quoi' });
    assert.equal(r.body.error.code, -32601);
    r = await rpc({ id: 2, method: 'ping' });
    assert.equal(r.body.error.code, -32600);
    r = await rpc('{"jsonrpc": "2.0", "id": ');
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, -32700);
    r = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(r.status, 202);
    assert.equal(r.body, null);
    r = await rpc([{ jsonrpc: '2.0', id: 'a', method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 'b', method: 'ping' }]);
    assert.deepEqual(r.body.map((x) => x.id), ['a', 'b']);
    r = await rpc({ jsonrpc: '2.0', id: 3, method: 'ping' }, { 'MCP-Protocol-Version': '1999-01-01' });
    assert.equal(r.status, 400);
    const get = await fetch(url);
    assert.equal(get.status, 405, 'pas de flux SSE');
  });
});

// --- Base de données : événements de suppression et visibilité --------------------------------------------

const db = new pg.Pool({ connectionString: config.databaseUrl, max: 1, connectionTimeoutMillis: 2000 });
let available = true;
try {
  const { rows } = await db.query("SELECT 1 FROM schema_migrations WHERE name = '016_integrations.sql'");
  available = rows.length > 0;
} catch {
  available = false;
}
after(() => db.end());

test('suppressions : notées avec leur audience, écrites à la validation', { skip: !available && 'PostgreSQL absent' }, async () => {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL paillasse.purge = 'on'");
    const user = async (name) => (await c.query("INSERT INTO users (username, display_name, password_hash) VALUES ($1, $1, '!') RETURNING id", [`essai-evt-${name}`])).rows[0].id;
    const [owner, member, stranger] = [await user('p'), await user('m'), await user('x')];
    const { rows: [p] } = await c.query("INSERT INTO projects (name, created_by) VALUES ('Essai événements', $1) RETURNING id", [owner]);
    await c.query("INSERT INTO project_members (project_id, user_id, status) VALUES ($1, $2, 'accepted')", [p.id, member]);
    const { rows: [e] } = await c.query(
      `INSERT INTO entries (project_id, title, entry_date, content, plain_text, created_by)
       VALUES ($1, 'Entrée à supprimer', '2026-10-26', '{"type":"doc","content":[]}', '', $2) RETURNING id`,
      [p.id, owner],
    );
    await c.query('DELETE FROM entries WHERE id = $1', [e.id]);
    const { rows: pending } = await c.query('SELECT type, object_id, audience FROM integration_events_pending');
    assert.equal(pending.length, 1, 'en attente jusqu’à la validation');
    assert.equal(pending[0].type, 'entry.deleted');
    assert.deepEqual([...pending[0].audience].sort(), [owner, member].sort());
    // Projet : ses membres sont retirés avant lui ; la purge les a notés
    await c.query(
      `SELECT set_config('paillasse.project_audience', jsonb_build_object($1::text, jsonb_build_array($2::text))::text, true)`,
      [p.id, member],
    );
    await c.query('DELETE FROM project_members WHERE project_id = $1', [p.id]);
    await c.query('DELETE FROM projects WHERE id = $1', [p.id]);
    // Validation simulée : les déclencheurs différés s'exécutent maintenant
    await c.query('SET CONSTRAINTS ALL IMMEDIATE');
    const { rows: [{ n }] } = await c.query('SELECT count(*)::int AS n FROM integration_events_pending');
    assert.equal(n, 0, 'tout est écrit');
    const { rows: events } = await c.query(
      "SELECT type, audience FROM integration_events WHERE object_id = ANY($1) ORDER BY id", [[e.id, p.id]],
    );
    assert.deepEqual(events.map((x) => x.type), ['entry.deleted', 'project.deleted']);
    assert.deepEqual([...events[1].audience].sort(), [owner, member].sort(), 'le membre apprend la suppression du projet');
    // Visibilité : qui voyait l'objet, personne d'autre
    const sees = async (u) => (await c.query(
      `SELECT count(*)::int AS n FROM integration_events e WHERE e.object_id = ANY($2) AND ${visibleEvent('e', '$1')}`, [u, [e.id, p.id]],
    )).rows[0].n;
    assert.equal(await sees(owner), 2);
    assert.equal(await sees(member), 2);
    assert.equal(await sees(stranger), 0);
  } finally {
    await c.query('ROLLBACK');
    c.release();
  }
});

// --- Assistant IA du labo --------------------------------------------------------------------------------------

const signJwt = (payload, secret, header = { alg: 'HS256', typ: 'JWT' }) => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const body = `${enc(header)}.${enc(payload)}`;
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`;
};

test('assistant : identité signée (HS256, comme X-OpenWebUI-User-Jwt)', () => {
  const now = 1_800_000_000_000;
  const p = { sub: 'u-1', email: 'a@labo.fr', name: 'A', role: 'user', iss: 'open-webui', iat: now / 1000, exp: now / 1000 + 300 };
  assert.deepEqual(verifyIdentityJwt(signJwt(p, 'secret'), 'secret', now), { subject: 'u-1', email: 'a@labo.fr', name: 'A', role: 'user' });
  assert.equal(verifyIdentityJwt(signJwt(p, 'autre'), 'secret', now), null, 'mauvais secret');
  assert.equal(verifyIdentityJwt(signJwt({ ...p, exp: now / 1000 - 120 }, 'secret'), 'secret', now), null, 'expiré');
  assert.notEqual(verifyIdentityJwt(signJwt({ ...p, exp: now / 1000 - 30 }, 'secret'), 'secret', now), null, 'tolérance d’horloge');
  assert.equal(verifyIdentityJwt(signJwt(p, 'secret', { alg: 'none' }), 'secret', now), null, 'alg none');
  assert.equal(verifyIdentityJwt(signJwt({ ...p, sub: '' }, 'secret'), 'secret', now), null, 'sans sujet');
  const t = signJwt(p, 'secret').split('.');
  const forged = [t[0], Buffer.from(JSON.stringify({ ...p, sub: 'admin' })).toString('base64url'), t[2]].join('.');
  assert.equal(verifyIdentityJwt(forged, 'secret', now), null, 'contenu modifié');
  assert.equal(verifyIdentityJwt('pas.un.jeton', 'secret', now), null);
  assert.equal(verifyIdentityJwt(signJwt(p, 'secret'), '', now), null, 'pas de secret configuré');
});

test('assistant : code de confirmation lié aux paramètres, à usage unique', () => {
  const { code } = issueConfirmation('cle-a');
  assert.match(code, /^[A-Z0-9]{6}$/);
  assert.equal(checkConfirmation(code, 'cle-b').status, 'invalid', 'autres paramètres');
  assert.equal(checkConfirmation(code.toLowerCase(), 'cle-a').status, 'ok', 'casse indifférente');
  assert.equal(checkConfirmation(code, 'cle-a').status, 'invalid', 'déjà servi');
  assert.equal(checkConfirmation('ZZZZZZ', 'cle-a').status, 'invalid');
});

test('assistant : confirmation seulement après une réponse de la personne', () => {
  const { code } = issueConfirmation('cle-t', 'message-1');
  const same = checkConfirmation(code, 'cle-t', 'message-1');
  assert.equal(same.status, 'wait', 'même message que l’aperçu : le modèle enchaîne seul');
  assert.equal(same.code, code, 'le code reste valable');
  assert.equal(checkConfirmation(code, 'cle-t', 'message-2').status, 'ok', 'message suivant');
  const loose = issueConfirmation('cle-u');
  assert.equal(checkConfirmation(loose.code, 'cle-u', 'message-9').status, 'ok', 'message inconnu à l’aperçu : accepté');
});

test('assistant : réponses raccourcies, avec ce qui manque', () => {
  const big = { entries: Array.from({ length: 80 }, (_, k) => ({ id: k, title: `Entrée ${k}`, excerpt: 'x'.repeat(150) })), next_offset: 80 };
  const fit = fitResponse(big, 4000);
  assert.ok(JSON.stringify(fit).length <= 4600, JSON.stringify(fit).length);
  assert.ok(fit.entries.length < 80 && fit.entries[0].id === 0, 'les premiers gardés');
  assert.match(fit.truncated.fields[0], /entries : liste de 80 éléments/);
  assert.match(fit.truncated.note, /limit|offset/);
  const text = fitResponse({ markdown: 'y'.repeat(20000) }, 5000);
  assert.ok(text.markdown.length < 6000 && text.markdown.endsWith('[…]'));
  const small = { a: 1 };
  assert.equal(fitResponse(small, 4000), small, 'déjà courte : inchangée');
});

test('assistant : aucune séquence écrite par une IA', async () => {
  assert.equal(sequenceIn('Amorce sens : ATGCGTACGTTAGCATGCAA'), 'ATGCGTACGTTAGCATGCAA');
  assert.ok(sequenceIn('1 atgcatgcat gcatgcatgc atgcat'), 'blocs de 10, comme GenBank');
  assert.ok(sequenceIn({ samples: [{ content: 'MKVLAAGIVGLLLAAQPAMAQVQLVESGGG' }] }), 'protéine, dans un objet');
  for (const text of ['Plasmide SEQ-0042, digestion EcoRI (GAATTC) 1 h à 37 °C, TAE 1X.', 'anticonstitutionnellement',
    'https://www.ncbi.nlm.nih.gov/nuccore/NM_000546', '7c9e6679-7425-40de-944b-e07fc1f90ae7']) {
    assert.equal(sequenceIn(text), null, text);
  }
  const ctx = { user: { id: 'u' }, token: { id: 'assistant:x', kind: 'assistant', scope: 'write', name: 'IA' }, profile: 'assistant', twoPhase: true };
  await assert.rejects(
    invoke('append_to_entry', { entry_id: crypto.randomUUID(), content_markdown: 'Amorce : ATGCGTACGTTAGCATGCAAGG' }, ctx),
    (err) => err.status === 422 && /séquence/.test(err.message) && /Rien n’a été enregistré/.test(err.message),
  );
});

test('assistant : le verrouillage reste un geste de la personne', async () => {
  assert.ok(!listOperations({ profile: 'assistant' }).some((op) => op.humanOnly), 'absent du profil');
  const ctx = { user: { id: 'u' }, token: { id: 'assistant:x', kind: 'assistant', scope: 'write', name: 'IA' }, profile: 'full', twoPhase: true };
  await assert.rejects(invoke('lock_entry', { entry_id: crypto.randomUUID(), confirm: true }, ctx), (err) => err.status === 403 && /irréversible/.test(err.message));
});

test('assistant : longue entrée en parties', () => {
  const t = Array.from({ length: 40 }, (_, k) => `Paragraphe ${k} ${'z'.repeat(300)}`).join('\n\n');
  const parts = splitParts(t, 2000);
  assert.ok(parts.length > 5 && parts.every((p) => p.length <= 2000));
  assert.equal(parts.join(''), t, 'rien de perdu');
  assert.ok(parts[1].startsWith('Paragraphe'), 'coupé entre deux paragraphes');
  assert.deepEqual(splitParts('', 1000), ['']);
});

test('assistant : description OpenAPI de son profil', () => {
  const doc = openapiDocument('https://paillasse.labo.fr', { profile: 'assistant', prefix: 'paillasse_' });
  assert.deepEqual(doc.servers, [{ url: 'https://paillasse.labo.fr/api/v1/assistant' }]);
  const ops = Object.values(doc.paths).flatMap((p) => Object.values(p));
  assert.equal(ops.length, 26);
  assert.ok(ops.every((o) => o.operationId.startsWith('paillasse_')));
  assert.ok(!doc.paths['/documents'], 'pas d’export en bloc');
  const store = doc.paths['/samples'].post;
  const props = store.requestBody.content['application/json'].schema.properties;
  assert.ok(props.confirmation && !props.dry_run, 'deux temps, pas d’essai à sec direct');
  assert.match(store.description, /paillasse_get_storage_unit/, 'renvois préfixés');
  const full = openapiDocument('', {});
  assert.ok(full.paths['/samples'].post.requestBody.content['application/json'].schema.properties.dry_run, 'API complète : dry_run');
  assert.ok(!full.paths['/samples'].post.requestBody.content['application/json'].schema.properties.confirmation);
});

test('essai à sec : tout est annulé', { skip: !available && 'PostgreSQL absent' }, async () => {
  const key = `essai-a-sec-${Date.now()}`;
  const seen = await dryRun(async () => {
    assert.equal(inDryRun(), true);
    await query("INSERT INTO app_settings (key, value) VALUES ($1, '{}')", [key]);
    const { tx } = await import('../src/db.js');
    await tx(async (c) => { await c.query("UPDATE app_settings SET value = '{\"a\":1}' WHERE key = $1", [key]); });
    return (await query('SELECT value FROM app_settings WHERE key = $1', [key])).rows[0]?.value;
  });
  assert.deepEqual(seen, { a: 1 }, 'visible pendant l’essai, transactions imbriquées comprises');
  assert.equal(inDryRun(), false);
  const { rows } = await query('SELECT 1 FROM app_settings WHERE key = $1', [key]);
  assert.equal(rows.length, 0, 'rien d’enregistré');
  await assert.rejects(dryRun(async () => { throw new Error('échec'); }), /échec/);
});
