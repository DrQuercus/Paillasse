// Format de séquence de Paillasse (« paillasse-seq/1 »), indépendant de l'éditeur utilisé.
//
// {
//   sequence: "ACGT…",            // IUPAC, casse d'origine conservée
//   circular: true,
//   features: [{ id, name, type, strand, color, segments: [{ start, end, name? }], notes: { qualificatif: [valeurs] } }],
//   primers:  [{ id, name, bases, description, color, sites: [{ start, end, strand, annealed?, tm? }] }]
// }
//
// Positions : base 0, bornes incluses (comme OVE). Un segment dont start > end
// passe par l'origine (séquence circulaire uniquement). Brin : 1, -1, ou 0 (sans direction).

import crypto from 'node:crypto';
import { HttpError } from '../errors.js';

export const FORMAT = 'paillasse-seq/1';
export const MAX_LENGTH = 5_000_000;
const IUPAC = /^[ACGTURYSWKMBDHVN]*$/i;
const COLOR = /^#[0-9a-f]{6}$/i;

export const newId = () => crypto.randomBytes(6).toString('hex');

function fail(message) {
  throw new HttpError(400, `Séquence invalide : ${message}`);
}

function checkPosition(value, length, where) {
  if (!Number.isInteger(value) || value < 0 || value >= length) {
    fail(`${where} : position ${value} hors de la séquence (0 à ${length - 1}).`);
  }
}

function normalizeNotes(notes, where) {
  const out = {};
  if (notes == null) return out;
  if (typeof notes !== 'object' || Array.isArray(notes)) fail(`${where} : qualificatifs mal formés.`);
  for (const [key, raw] of Object.entries(notes)) {
    const values = Array.isArray(raw) ? raw : [raw];
    out[String(key).slice(0, 100)] = values
      .filter((v) => v !== null && v !== undefined)
      .map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : String(v).slice(0, 20000)));
  }
  return out;
}

function normalizeStrand(value, where) {
  const s = Number(value ?? 0);
  if (![-1, 0, 1].includes(s)) fail(`${where} : brin ${value} invalide.`);
  return s;
}

function normalizeRange(r, length, circular, where) {
  checkPosition(r.start, length, where);
  checkPosition(r.end, length, where);
  if (r.start > r.end && !circular) fail(`${where} : passe par l'origine alors que la séquence est linéaire.`);
}

/**
 * Vérifie et normalise des données de séquence. Tout ce qui sort d'ici est cohérent :
 * aucune annotation hors séquence, aucun identifiant en double, alphabet IUPAC.
 */
export function normalizeSequenceData(input) {
  if (!input || typeof input !== 'object') fail('données absentes.');
  const sequence = String(input.sequence ?? '').replace(/\s+/g, '');
  if (!IUPAC.test(sequence)) {
    const bad = sequence.match(/[^ACGTURYSWKMBDHVN]/i)?.[0];
    fail(`caractère « ${bad} » non autorisé (ADN, code IUPAC).`);
  }
  if (sequence.length > MAX_LENGTH) fail(`plus de ${MAX_LENGTH.toLocaleString('fr-FR')} bases.`);
  const circular = Boolean(input.circular);
  const length = sequence.length;
  const ids = new Set();
  const uniqueId = (id) => {
    let v = typeof id === 'string' && id ? id.slice(0, 64) : newId();
    while (ids.has(v)) v = newId();
    ids.add(v);
    return v;
  };

  const features = (input.features ?? []).map((f, i) => {
    const where = `annotation ${f?.name ?? i + 1}`;
    const segments = (f.segments ?? []).map((s) => {
      normalizeRange(s, length, circular, where);
      return { start: s.start, end: s.end, ...(s.name ? { name: String(s.name).slice(0, 200) } : {}) };
    });
    if (!segments.length) fail(`${where} : aucune position.`);
    return {
      id: uniqueId(f.id),
      name: String(f.name ?? '').slice(0, 500),
      type: String(f.type || 'misc_feature').slice(0, 64),
      strand: normalizeStrand(f.strand, where),
      color: COLOR.test(f.color ?? '') ? f.color.toLowerCase() : null,
      segments,
      notes: normalizeNotes(f.notes, where),
    };
  });

  const primers = (input.primers ?? []).map((p, i) => {
    const where = `amorce ${p?.name ?? i + 1}`;
    const bases = String(p.bases ?? '').replace(/\s+/g, '');
    if (!IUPAC.test(bases)) fail(`${where} : séquence d'amorce invalide.`);
    const sites = (p.sites ?? []).map((s) => {
      normalizeRange(s, length, circular, where);
      return {
        start: s.start,
        end: s.end,
        strand: s.strand === -1 ? -1 : 1,
        ...(s.annealed ? { annealed: String(s.annealed).slice(0, 1000) } : {}),
        ...(Number.isFinite(s.tm) ? { tm: s.tm } : {}),
      };
    });
    return {
      id: uniqueId(p.id),
      name: String(p.name ?? '').slice(0, 500),
      bases,
      description: String(p.description ?? '').slice(0, 5000),
      color: COLOR.test(p.color ?? '') ? p.color.toLowerCase() : null,
      sites,
    };
  });

  return { sequence, circular, features, primers };
}

export const segmentLength = (s, length) => (s.start <= s.end ? s.end - s.start + 1 : length - s.start + s.end + 1);

export function gcPercent(sequence) {
  if (!sequence.length) return 0;
  const gc = (sequence.match(/[GCS]/gi) ?? []).length;
  return Math.round((gc / sequence.length) * 1000) / 10;
}
