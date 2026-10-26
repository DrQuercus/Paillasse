// Outils communs aux opérations : adresses, identifiants par code, mise en forme compacte pour une IA.
import { query } from '../../db.js';
import { HttpError } from '../../lib/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Adresses dans l'interface (à donner à l'utilisateur) et dans l'API. */
export const webUrl = (ctx, path) => `${ctx.origin ?? ''}${path}`;
export const apiUrl = (ctx, path) => `${ctx.origin ?? ''}/api/v1${path}`;

/** Identifiant d'une séquence : uuid ou code (SEQ-0001, seq-1). */
export async function sequenceIdOf(value) {
  const v = String(value ?? '').trim();
  if (UUID.test(v)) return v;
  const m = /^SEQ-?0*(\d{1,9})$/i.exec(v);
  if (m) {
    const { rows } = await query("SELECT id FROM sequences WHERE code = 'SEQ-' || lpad($1, 4, '0') OR code = upper($2)", [m[1], v]);
    if (rows[0]) return rows[0].id;
  }
  throw new HttpError(404, `Séquence introuvable : « ${v} » (uuid ou code SEQ-0001 attendu).`);
}

/** Identifiant d'un tube : uuid ou code (ECH-0001). */
export async function sampleIdOf(value) {
  const v = String(value ?? '').trim();
  if (UUID.test(v)) return v;
  const m = /^ECH-?0*(\d{1,9})$/i.exec(v);
  if (m) {
    const { rows } = await query("SELECT id FROM samples WHERE code = 'ECH-' || lpad($1, 4, '0') OR code = upper($2)", [m[1], v]);
    if (rows[0]) return rows[0].id;
  }
  throw new HttpError(404, `Tube introuvable : « ${v} » (uuid ou code ECH-0001 attendu).`);
}

/** Retire les champs vides (null, '', listes vides) : réponses plus courtes pour une IA. */
export function compact(obj) {
  if (Array.isArray(obj)) return obj.map(compact);
  if (!obj || typeof obj !== 'object' || obj instanceof Date) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[k] = compact(v);
  }
  return out;
}

export const isoDate = (d) => (d ? (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toLocaleDateString('sv-SE')) : null);
export const isoTime = (d) => (d ? new Date(d).toISOString() : null);

/** Pagination : renvoie { items, next_offset } à partir d'une liste lue avec une ligne de plus. */
export function page(rows, limit, offset) {
  const more = rows.length > limit;
  return { items: more ? rows.slice(0, limit) : rows, next_offset: more ? offset + limit : null };
}
