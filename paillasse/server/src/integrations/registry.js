// Registre des opérations : chaque fonction du cahier ouverte aux outils extérieurs est décrite une seule fois
// (nom, description pour une IA, paramètres en JSON Schema, portée lecture ou écriture, route REST) et servie
// à la fois par l'API REST (/api/v1), sa description OpenAPI et le serveur MCP (/mcp).
import { HttpError } from '../lib/errors.js';
import { validate } from './schema.js';

const operations = new Map();

/**
 * Déclare une opération.
 * { name, title, group, description, scope: 'read' | 'write', http: { method, path }, input, handler(args, ctx),
 *   annotations?, essential?, text?(result, args) → texte pour l'IA, content?(result) → contenus MCP en plus }
 */
export function define(op) {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(op.name)) throw new Error(`Nom d'opération invalide : ${op.name}`);
  if (operations.has(op.name)) throw new Error(`Opération déjà déclarée : ${op.name}`);
  if (!['read', 'write'].includes(op.scope)) throw new Error(`Portée invalide pour ${op.name}`);
  if (!op.input || op.input.type !== 'object') throw new Error(`Paramètres de ${op.name} : objet attendu`);
  operations.set(op.name, op);
  return op;
}

export const getOperation = (name) => operations.get(name) ?? null;

/** Première phrase de la description : résumé d'une opération (listes, llms.txt). */
export function summary(op) {
  const text = String(op.description ?? '').replace(/\s+/g, ' ').trim();
  return /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
}

/** Opérations visibles : selon la portée du jeton (lecture seule : pas d'écriture) et le profil choisi. */
export function listOperations({ scope = 'write', profile = 'full', only = null } = {}) {
  return [...operations.values()].filter((op) => (scope === 'write' || op.scope === 'read')
    && (profile !== 'essential' || op.essential)
    && (!only || only.includes(op.name)));
}

/**
 * Exécute une opération pour un compte. ctx : { user, token (null pour une session), origin }.
 * Les paramètres sont validés (et convertis) d'abord ; une opération d'écriture est refusée à un jeton de lecture.
 */
export async function invoke(name, rawArgs, ctx) {
  const op = operations.get(name);
  if (!op) throw new HttpError(404, `Opération inconnue : ${name}`);
  if (op.scope === 'write' && ctx.token?.scope === 'read') {
    throw new HttpError(403, `« ${name} » modifie le cahier : ce jeton est en lecture seule.`);
  }
  const args = validate(op.input, rawArgs ?? {}, '');
  return { op, args, result: await op.handler(args, ctx) };
}
