// Registre des opérations : chaque fonction du cahier ouverte aux outils extérieurs est décrite une seule fois
// (nom, description pour une IA, paramètres en JSON Schema, portée lecture ou écriture, route REST) et servie
// à la fois par l'API REST (/api/v1), sa description OpenAPI et le serveur MCP (/mcp).
//
// Profils : « full » (tout, pour les scripts et les grosses IA) et « assistant » (sélection pour une IA de labo
// à fenêtre de contexte limitée, réponses courtes, écriture en deux temps ; « essential » en est un alias).
import { config } from '../config.js';
import { dryRun } from '../db.js';
import { HttpError } from '../lib/errors.js';
import { assistantTools, checkConfirmation, confirmationKey, issueConfirmation, noteTurnSeen, sequenceIn, unlinkedMessage } from './assistant.js';
import { validate } from './schema.js';

const operations = new Map();

const WRITE_PARAMS = {
  dry_run: {
    type: 'boolean', default: false,
    description: 'Essai à sec : l’opération est menée jusqu’au bout puis annulée ; rien n’est enregistré, le résultat montre ce qui serait fait.',
  },
  confirmation: {
    type: 'string', maxLength: 20,
    description: 'Code rendu par l’aperçu, à donner une fois la personne d’accord ; sans lui, rien n’est enregistré.',
  },
};

/**
 * Déclare une opération.
 * { name, title, group, description, scope: 'read' | 'write', http: { method, path }, input, handler(args, ctx),
 *   annotations?, profiles? (seuls profils où elle apparaît), allowUnlinked? (répond aussi à une personne venue
 *   par l'assistant dont le compte n'est pas encore relié), humanOnly? (geste irréversible : jamais par l'assistant
 *   du labo, quel que soit le chemin), preview?(args, ctx, result) → aperçu plus parlant
 *   d'un essai à sec, text?(result, args) → texte pour l'IA, content?(result) → contenus MCP en plus }
 */
export function define(op) {
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(op.name)) throw new Error(`Nom d'opération invalide : ${op.name}`);
  if (operations.has(op.name)) throw new Error(`Opération déjà déclarée : ${op.name}`);
  if (!['read', 'write'].includes(op.scope)) throw new Error(`Portée invalide pour ${op.name}`);
  if (!op.input || op.input.type !== 'object') throw new Error(`Paramètres de ${op.name} : objet attendu`);
  // Toute écriture accepte un essai à sec, et l'écriture en deux temps de l'assistant
  if (op.scope === 'write') op.input = { ...op.input, properties: { ...op.input.properties, ...WRITE_PARAMS } };
  operations.set(op.name, op);
  return op;
}

export const getOperation = (name) => operations.get(name) ?? null;
export const allOperations = () => [...operations.values()];

/** Première phrase de la description : résumé d'une opération (listes, llms.txt). */
export function summary(op) {
  const text = String(op.description ?? '').replace(/\s+/g, ' ').trim();
  return /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
}

export const profileOf = (value) => (value === 'assistant' || value === 'essential' ? 'assistant' : 'full');

/** Opérations visibles : selon la portée du jeton (lecture seule : pas d'écriture), le profil, une liste choisie. */
export function listOperations({ scope = 'write', profile = 'full', only = null } = {}) {
  const p = profileOf(profile);
  const picked = p === 'assistant' ? new Set(assistantTools()) : null;
  return [...operations.values()].filter((op) => (scope === 'write' || op.scope === 'read')
    && (picked ? picked.has(op.name) && !op.humanOnly : !op.profiles || op.profiles.includes(p))
    && (!only || only.includes(op.name)));
}

// Valeurs par défaut du profil assistant : des réponses qui tiennent dans une petite fenêtre de contexte
const ASSISTANT_DEFAULTS = {
  list_entries: { limit: 10 },
  search: { limit: 5 },
  recent_activity: { limit: 15 },
  list_sequences: { limit: 10 },
  find_samples: { limit: 10 },
  storage_overview: { limit: 30 },
  list_datasets: { limit: 15 },
  get_entry: { part_chars: Math.max(1500, config.assistant.maxChars - 1500) },
};

/** Paramètres d'une opération tels que publiés pour un profil (OpenAPI, MCP). */
export function inputFor(op, profile = 'full') {
  const p = profileOf(profile);
  const properties = { ...op.input.properties };
  if (op.scope === 'write') delete properties[p === 'assistant' ? 'dry_run' : 'confirmation'];
  for (const [key, value] of Object.entries(p === 'assistant' ? ASSISTANT_DEFAULTS[op.name] ?? {} : {})) {
    if (properties[key]) properties[key] = { ...properties[key], default: value };
  }
  return { ...op.input, properties };
}

/** Description d'une opération pour un profil : la règle d'écriture y est rappelée. */
export function descriptionFor(op, profile = 'full') {
  if (op.scope !== 'write') return op.description;
  return profileOf(profile) === 'assistant'
    ? `${op.description} En deux temps : d’abord un aperçu et un code, puis l’enregistrement avec ce code.`
    : `${op.description}\n\nModifie le cahier : jeton « lecture et écriture » requis. dry_run = true : essai à sec, rien n’est enregistré.`;
}

const CREATES = /^(create|store|add)_/;

/** Aperçu d'un essai à sec : sans les identifiants et adresses d'objets qui n'existent pas encore. */
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'id' && k !== 'url').map(([k, v]) => [k, scrub(v)]));
}

async function preview(op, args, ctx) {
  const dryCtx = { ...ctx, dryRun: true };
  const result = await dryRun(async () => {
    const r = await op.handler(args, dryCtx);
    return op.preview ? op.preview(args, dryCtx, r) : r;
  });
  return CREATES.test(op.name) ? scrub(result) : result;
}

const withFlags = (result, flags) => (result && typeof result === 'object' && !Array.isArray(result) ? { ...result, ...flags } : { result, ...flags });

/**
 * Exécute une opération pour un compte. ctx : { user (null : personne venue par l'assistant, compte pas encore
 * relié), token (null pour une session), origin, profile, assistant (identité chez l'assistant), twoPhase
 * (écriture en deux temps), toolName (nom de l'outil vu par l'IA) }. Les paramètres sont validés (et convertis) ;
 * une écriture est refusée à un accès en lecture seule. Renvoie { op, args, result, dryRun }.
 */
export async function invoke(name, rawArgs, ctx) {
  const op = operations.get(name);
  if (!op) throw new HttpError(404, `Opération inconnue : ${name}`);
  if (!ctx.user && !op.allowUnlinked) throw new HttpError(403, unlinkedMessage(ctx.assistant));
  if (op.scope === 'write' && ctx.token?.scope === 'read') {
    throw new HttpError(403, ctx.token.kind === 'assistant'
      ? `« ${ctx.toolName ?? name} » modifie le cahier, mais la personne a laissé ${ctx.token.name} en lecture seule : elle peut ouvrir l’écriture dans Paillasse › Intégrations › Assistant.`
      : `« ${name} » modifie le cahier : ce jeton est en lecture seule.`);
  }
  const raw = { ...(rawArgs ?? {}) };
  if (profileOf(ctx.profile) === 'assistant') {
    for (const [key, value] of Object.entries(ASSISTANT_DEFAULTS[name] ?? {})) if (raw[key] == null) raw[key] = value;
  }
  if (ctx.twoPhase && op.humanOnly) {
    throw new HttpError(403, `« ${ctx.toolName ?? name} » est irréversible : seule la personne le fait, dans Paillasse. Rien n’a été modifié.`);
  }
  const args = validate(op.input, raw, '');
  if (op.scope !== 'write') return { op, args, result: await op.handler(args, ctx) };

  const { dry_run: dry, confirmation, ...rest } = args;
  if (ctx.twoPhase) {
    const sequence = sequenceIn(rest);
    if (sequence) {
      const shown = sequence.length > 24 ? `${sequence.slice(0, 16)}…` : sequence;
      throw new HttpError(422, `Le texte contient ce qui ressemble à une séquence biologique (« ${shown} », ${sequence.replace(/\s/g, '').length} lettres). `
        + 'Une IA n’écrit jamais de séquence dans le cahier : citez-la par son code du registre (SEQ-…, à trouver avec list_sequences), '
        + 'ou demandez à la personne de la saisir elle-même dans Paillasse. Rien n’a été enregistré.');
    }
    const key = confirmationKey(ctx, name, rest);
    // Message en cours chez l'assistant : la confirmation n'est acceptée que dans un message suivant, donc après une
    // réponse de la personne (le modèle ne peut pas enchaîner seul l'aperçu et l'enregistrement)
    const turn = ctx.turn || null;
    if (turn) noteTurnSeen();
    const check = confirmation ? checkConfirmation(confirmation, key, turn) : null;
    if (check?.status === 'ok') {
      return { op, args: rest, result: withFlags(await op.handler(rest, ctx), { confirmed: true }) };
    }
    const shown = await preview(op, rest, ctx);
    const issued = check?.status === 'wait' ? check : issueConfirmation(key, turn);
    const tool = ctx.toolName ?? name;
    const warning = check?.status === 'wait'
      ? 'La personne n’a pas encore répondu : la confirmation n’est acceptée que dans un message suivant, une fois qu’elle a vu l’aperçu et donné son accord.'
      : check ? 'Code de confirmation inconnu, expiré ou donné avec d’autres paramètres : voici un nouvel aperçu, avec un nouveau code.' : null;
    return {
      op, args: rest, dryRun: true,
      result: {
        dry_run: true,
        saved: false,
        ...(warning ? { warning } : {}),
        preview: shown,
        confirmation: issued.code,
        confirmation_expires_at: issued.expires_at,
        next_step: `Rien n’est encore enregistré. Montrez cet aperçu à la personne, demandez-lui son accord et attendez sa réponse. S’il est donné, rappelez ${tool} `
          + `avec exactement les mêmes paramètres et confirmation = "${issued.code}" (valable 15 minutes).`
          + (CREATES.test(name) ? ' Les codes (ECH-…, SEQ-…) de l’aperçu sont indicatifs : les définitifs sont attribués à l’enregistrement.' : ''),
      },
    };
  }
  if (dry) {
    return { op, args: rest, dryRun: true, result: { dry_run: true, saved: false, preview: await preview(op, rest, ctx), note: 'Essai à sec : rien n’a été enregistré.' } };
  }
  return { op, args: rest, result: await op.handler(rest, ctx) };
}
