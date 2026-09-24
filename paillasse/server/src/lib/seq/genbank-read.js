// Lecture GenBank (.gb, .gbk, .genbank) : fichiers NCBI, Addgene, SnapGene, Benchling, ApE…
import { HttpError } from '../errors.js';
import { newId } from './model.js';

const invalid = (why) => new HttpError(400, `Fichier GenBank illisible : ${why}`);
const NAME_QUALIFIERS = ['label', 'gene', 'product', 'locus_tag', 'standard_name', 'note'];

/** Découpe une position en morceaux { start, end, strand } (base 0, inclus). */
function parseLocation(text) {
  const src = text.replace(/\s+/g, '');
  if (/[A-Za-z0-9_.]+:/.test(src.replace(/^(complement|join|order)\(/g, ''))) return null; // référence à une autre séquence
  let pos = 0;
  const parts = [];
  function expr(strand) {
    if (src.startsWith('complement(', pos)) {
      pos += 'complement('.length;
      const before = parts.length;
      list(-strand);
      pos += 1; // ')'
      // complement(join(a,b)) : les morceaux restent dans l'ordre du génome
      parts.splice(before, parts.length - before, ...parts.slice(before));
      return;
    }
    for (const op of ['join(', 'order(']) {
      if (src.startsWith(op, pos)) {
        pos += op.length;
        list(strand);
        pos += 1;
        return;
      }
    }
    const m = /^<?(\d+)(?:(?:\.\.|\^)>?(\d+))?>?/.exec(src.slice(pos));
    if (!m) throw invalid(`position « ${text.trim()} » incomprise.`);
    pos += m[0].length;
    const a = Number(m[1]) - 1;
    const b = m[2] ? Number(m[2]) - 1 : a;
    parts.push({ start: Math.min(a, b), end: Math.max(a, b), strand });
  }
  function list(strand) {
    expr(strand);
    while (src[pos] === ',') {
      pos += 1;
      expr(strand);
    }
  }
  expr(1);
  return parts;
}

function parseFeatures(lines, length, circular) {
  const features = [];
  let current = null;
  let pendingLocation = null;
  let qual = null;

  const flushQual = () => {
    if (!qual || !current) return;
    let value = qual.raw;
    if (value === null) value = '';
    else if (value.startsWith('"')) value = value.replace(/^"/, '').replace(/"$/, '').replace(/""/g, '"');
    else if (/^-?\d+$/.test(value)) value = Number(value);
    (current.quals[qual.key] ??= []).push(value);
    qual = null;
  };
  const flushFeature = () => {
    flushQual();
    if (current) features.push(current);
    current = null;
  };

  for (const line of lines) {
    const key = line.slice(5, 21).trim();
    const body = line.slice(21);
    if (line.startsWith('     ') && line[5] !== ' ' && key) {
      flushFeature();
      current = { type: key, location: body.trim(), quals: {} };
      pendingLocation = true;
    } else if (current && pendingLocation && !body.startsWith('/')) {
      current.location += body.trim();
    } else if (current && body.startsWith('/')) {
      pendingLocation = false;
      flushQual();
      const m = /^\/([^=]+)(?:=(.*))?$/.exec(body.trimEnd());
      qual = { key: m[1], raw: m[2] ?? null };
    } else if (current && qual && qual.raw !== null) {
      // suite d'une valeur sur plusieurs lignes : sans espace pour les traductions et séquences
      const joiner = ['translation', 'sequence'].includes(qual.key) ? '' : ' ';
      qual.raw += joiner + body.trim();
    }
  }
  flushFeature();

  const out = [];
  for (const f of features) {
    if (f.type === 'source') continue;
    const parts = parseLocation(f.location);
    if (!parts?.length) continue;
    // Deux morceaux consécutifs fin → origine sur une séquence circulaire : un seul segment qui traverse l'origine
    const segments = [];
    for (const p of parts) {
      const prev = segments.at(-1);
      if (circular && prev && prev.end === length - 1 && p.start === 0) prev.end = p.end;
      else segments.push({ start: p.start, end: p.end });
    }
    const notes = { ...f.quals };
    const nameKey = NAME_QUALIFIERS.find((k) => notes[k]?.length);
    const name = nameKey ? String(notes[nameKey][0]) : f.type;
    if (nameKey === 'label') delete notes.label;
    const color = [notes.ApEinfo_fwdcolor?.[0], notes.color?.[0]].find((c) => /^#[0-9a-f]{6}$/i.test(String(c ?? '')));
    out.push({ id: newId(), name, type: f.type, strand: parts[0].strand, color: color ?? null, segments, notes });
  }
  return out;
}

/** Texte GenBank → une ou plusieurs séquences. */
export function parseGenbank(text) {
  const records = String(text).replace(/\r\n?/g, '\n').split(/^\/\/\s*$/m).filter((r) => /\S/.test(r));
  if (!records.length || !/^LOCUS/m.test(records[0])) throw invalid('en-tête LOCUS absent.');
  return records.filter((r) => /^LOCUS/m.test(r)).map((record) => {
    const lines = record.split('\n');
    const locus = lines.find((l) => l.startsWith('LOCUS')) ?? '';
    const tokens = locus.split(/\s+/);
    const circular = /\bcircular\b/i.test(locus);
    let definition = '';
    const featureLines = [];
    const seqChunks = [];
    let section = '';
    for (const line of lines) {
      if (/^[A-Z]/.test(line)) {
        section = line.split(/\s+/)[0];
        if (section === 'DEFINITION') definition = line.slice(12).trim();
        continue;
      }
      if (section === 'DEFINITION' && line.startsWith('            ')) definition += ` ${line.trim()}`;
      else if (section === 'FEATURES') featureLines.push(line);
      else if (section === 'ORIGIN') seqChunks.push(line.replace(/[\s\d]/g, ''));
    }
    const sequence = seqChunks.join('');
    if (!sequence) throw invalid('pas de séquence après ORIGIN.');
    return {
      name: tokens[1] || 'sequence',
      description: definition === '.' ? '' : definition,
      sequence,
      circular,
      features: parseFeatures(featureLines, sequence.length, circular),
      primers: [],
    };
  });
}
