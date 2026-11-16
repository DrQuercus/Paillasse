// Validation des paramètres des opérations (sous-ensemble de JSON Schema), tolérante comme il faut l'être avec
// une IA ou une URL : « 12 » vaut 12, « true » vaut vrai, « 1,5 » vaut 1.5, une valeur seule vaut une liste
// d'une valeur, null vaut « absent ». Un paramètre inconnu est refusé avec la liste des paramètres possibles :
// l'IA corrige d'elle-même son appel.
import { HttpError } from '../lib/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TRUE = new Set(['true', '1', 'oui', 'yes', 'vrai', 'on']);
const FALSE = new Set(['false', '0', 'non', 'no', 'faux', 'off']);

const fail = (path, message) => { throw new HttpError(400, `Paramètre « ${path || 'arguments'} » : ${message}`); };
const typesOf = (schema) => (Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []);

function coerce(type, value) {
  if (value === null || value === undefined) return value;
  switch (type) {
    case 'integer': {
      if (typeof value === 'string' && /^\s*-?\d+(?:[.,]0+)?\s*$/.test(value)) return Number(value.trim().replace(',', '.'));
      return value;
    }
    case 'number': {
      if (typeof value === 'string' && /^\s*-?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?\s*$/.test(value)) return Number(value.trim().replace(',', '.'));
      return value;
    }
    case 'boolean': {
      if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (TRUE.has(v)) return true;
        if (FALSE.has(v)) return false;
      }
      if (value === 1 || value === 0) return Boolean(value);
      return value;
    }
    case 'string': return typeof value === 'number' || typeof value === 'boolean' ? String(value) : value;
    case 'array': {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        let s = value.trim();
        if (s.startsWith('[') && s.endsWith(']')) {
          try { return JSON.parse(s); } catch { /* peut-être une liste à la Python : ['a', 'b'] */ }
          try { return JSON.parse(s.replace(/'/g, '"')); } catch { s = s.slice(1, -1); }
        }
        return s === '' ? [] : s.split(',').map((x) => x.trim().replace(/^(['"])(.*)\1$/, '$2')).filter(Boolean);
      }
      return [value];
    }
    case 'object': {
      if (typeof value === 'string' && value.trim().startsWith('{')) { try { return JSON.parse(value); } catch { return value; } }
      return value;
    }
    default: return value;
  }
}

const matches = (type, v) => ({
  string: typeof v === 'string',
  integer: Number.isInteger(v),
  number: typeof v === 'number' && Number.isFinite(v),
  boolean: typeof v === 'boolean',
  array: Array.isArray(v),
  object: v !== null && typeof v === 'object' && !Array.isArray(v),
  null: v === null,
}[type]);

const TYPE_FR = { string: 'un texte', integer: 'un nombre entier', number: 'un nombre', boolean: 'vrai ou faux', array: 'une liste', object: 'un objet', null: 'null' };

/** Valide (et convertit) value selon schema ; renvoie la valeur propre ou lève une erreur 400 explicite. */
export function validate(schema, value, path = '') {
  if (!schema) return value;
  const types = typesOf(schema);
  let v = value;
  if (types.length && v !== null && v !== undefined && !types.some((t) => matches(t, v))) {
    for (const t of types) {
      const c = coerce(t, v);
      if (matches(t, c)) { v = c; break; }
    }
  }
  if (v === undefined || (v === null && !types.includes('null'))) return schema.default;
  if (types.length && !types.some((t) => matches(t, v))) fail(path, `${types.map((t) => TYPE_FR[t]).join(' ou ')} attendu.`);
  if (schema.const !== undefined && v !== schema.const) fail(path, `doit valoir ${JSON.stringify(schema.const)}.`);
  if (schema.enum && !schema.enum.includes(v)) fail(path, `valeurs possibles : ${schema.enum.map((x) => JSON.stringify(x)).join(', ')}.`);

  if (typeof v === 'string') {
    if (schema.trim !== false) v = v.trim();
    if (schema.minLength !== undefined && v.length < schema.minLength) fail(path, schema.minLength === 1 ? 'ne peut pas être vide.' : `${schema.minLength} caractères au moins.`);
    if (schema.maxLength !== undefined && v.length > schema.maxLength) fail(path, `${schema.maxLength} caractères au plus.`);
    if (schema.format === 'uuid' && !UUID.test(v)) fail(path, 'identifiant (uuid) attendu, par exemple 0d205bff-8a39-4a6e-a60f-8d1a1cbf01b3.');
    if (schema.format === 'date' && (!DATE.test(v) || Number.isNaN(Date.parse(v)))) fail(path, 'date attendue au format AAAA-MM-JJ.');
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(v))) fail(path, 'date et heure attendues (ISO 8601, ex. 2026-10-26T09:30:00Z).');
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) fail(path, schema.patternHint ?? 'format invalide.');
  }
  if (typeof v === 'number') {
    if (schema.minimum !== undefined && v < schema.minimum) fail(path, `${schema.minimum} au moins.`);
    if (schema.maximum !== undefined && v > schema.maximum) fail(path, `${schema.maximum} au plus.`);
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) fail(path, `${schema.minItems} élément(s) au moins.`);
    if (schema.maxItems !== undefined && v.length > schema.maxItems) fail(path, `${schema.maxItems} éléments au plus.`);
    if (schema.items) v = v.map((x, k) => validate(schema.items, x, `${path}[${k}]`)).filter((x) => x !== undefined);
  }
  if (matches('object', v) && (schema.properties || schema.additionalProperties === false)) {
    const props = schema.properties ?? {};
    const out = {};
    for (const key of Object.keys(v)) {
      if (!props[key]) {
        if (schema.additionalProperties === false) {
          fail(path ? `${path}.${key}` : key, `paramètre inconnu. Paramètres possibles : ${Object.keys(props).join(', ') || 'aucun'}.`);
        }
        out[key] = v[key];
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      const cleaned = validate(sub, v[key], path ? `${path}.${key}` : key);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    for (const key of schema.required ?? []) {
      if (out[key] === undefined || out[key] === null || out[key] === '') fail(path ? `${path}.${key}` : key, 'obligatoire.');
    }
    v = out;
  }
  return v;
}

// --- Petits constructeurs pour écrire les schémas lisiblement ---------------------------------------------

export const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
export const uuid = (description) => ({ type: 'string', format: 'uuid', description });
export const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
export const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
export const bool = (description, extra = {}) => ({ type: 'boolean', description, ...extra });
export const date = (description) => ({ type: 'string', format: 'date', description });
export const list = (items, description, extra = {}) => ({ type: 'array', items, description, ...extra });
export const oneOf = (values, description, extra = {}) => ({ type: 'string', enum: values, description, ...extra });

/** Objet de paramètres (aucun paramètre inconnu accepté). */
export const params = (properties = {}, required = []) => ({
  type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false,
});

/** Schéma publié (OpenAPI, MCP) : sans les mots-clés propres à Paillasse (trim, patternHint). */
export function publicSchema(schema) {
  if (Array.isArray(schema)) return schema.map(publicSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'trim' || k === 'patternHint') continue;
    // properties : des noms de paramètres, pas des mots-clés
    out[k] = k === 'properties' ? Object.fromEntries(Object.entries(v).map(([name, sub]) => [name, publicSchema(sub)]))
      : typeof v === 'object' ? publicSchema(v) : v;
  }
  return out;
}
