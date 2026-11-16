// Écriture GenBank (format lu par SnapGene, Benchling, ApE, Biopython…).
import { segmentLength } from './model.js';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const QUAL_INDENT = ' '.repeat(21);

const gbDate = (d) => `${String(d.getDate()).padStart(2, '0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;

/** Segments (base 0 inclus) → chaîne de position GenBank (base 1). */
export function locationString(segments, strand, length) {
  const ranges = [];
  for (const s of segments) {
    if (s.start <= s.end) ranges.push(s.start === s.end ? `${s.start + 1}` : `${s.start + 1}..${s.end + 1}`);
    else {
      // passe par l'origine : deux morceaux, dans l'ordre de lecture
      ranges.push(s.start + 1 === length ? `${length}` : `${s.start + 1}..${length}`);
      ranges.push(s.end === 0 ? '1' : `1..${s.end + 1}`);
    }
  }
  const joined = ranges.length > 1 ? `join(${ranges.join(',')})` : ranges[0];
  return strand === -1 ? `complement(${joined})` : joined;
}

/** Découpe une ligne longue sur 79 colonnes avec l'indentation GenBank. */
function wrap(text, first, indent = QUAL_INDENT, width = 79) {
  const lines = [];
  let line = first;
  let rest = text;
  while (rest.length) {
    const room = width - line.length;
    if (rest.length <= room) {
      line += rest;
      rest = '';
      break;
    }
    let cut = rest.lastIndexOf(' ', room);
    if (cut <= 0) cut = room; // pas d'espace (ex. traduction) : coupure franche
    line += rest.slice(0, cut);
    lines.push(line.trimEnd());
    rest = rest.slice(cut).replace(/^ /, '');
    line = indent;
  }
  lines.push(line);
  return lines;
}

function qualifierLines(key, value) {
  const v = typeof value === 'number' ? String(value) : `"${String(value).replace(/"/g, '""')}"`;
  return wrap(v, `${QUAL_INDENT}/${key}=`);
}

function featureLines(type, location, qualifiers) {
  const head = `     ${type.padEnd(16)}`;
  const out = wrap(location, head);
  for (const [k, v] of qualifiers) out.push(...qualifierLines(k, v));
  return out;
}

export function toGenbank({ name, description = '', sequence, circular, features, primers }, { date = new Date() } = {}) {
  const locus = (name || 'sequence').replace(/[^\w.-]+/g, '_').slice(0, 60);
  const lines = [
    `LOCUS       ${locus.padEnd(16)} ${String(sequence.length).padStart(11)} bp    DNA     ${circular ? 'circular' : 'linear  '} SYN ${gbDate(date)}`,
    ...wrap(description.replace(/\s+/g, ' ') || name || '.', 'DEFINITION  ', ' '.repeat(12)),
    'ACCESSION   .',
    'VERSION     .',
    'KEYWORDS    .',
    'SOURCE      synthetic DNA construct',
    '  ORGANISM  synthetic DNA construct',
    'FEATURES             Location/Qualifiers',
    ...featureLines('source', `1..${sequence.length}`, [['mol_type', 'other DNA']]),
  ];
  for (const f of features) {
    const quals = [];
    if (f.name && !f.notes.label) quals.push(['label', f.name]);
    for (const [k, values] of Object.entries(f.notes)) for (const v of values) quals.push([k, v]);
    lines.push(...featureLines(f.type, locationString(f.segments, f.strand, sequence.length), quals));
  }
  for (const p of primers) {
    for (const s of p.sites) {
      const quals = [['label', p.name]];
      if (p.bases) quals.push(['note', `sequence: ${p.bases}`]);
      if (p.description) quals.push(['note', p.description]);
      lines.push(...featureLines('primer_bind', locationString([s], s.strand, sequence.length), quals));
    }
  }
  lines.push('ORIGIN');
  const lower = sequence.toLowerCase();
  for (let i = 0; i < lower.length; i += 60) {
    const chunk = lower.slice(i, i + 60).match(/.{1,10}/g).join(' ');
    lines.push(`${String(i + 1).padStart(9)} ${chunk}`);
  }
  lines.push('//');
  return `${lines.join('\n')}\n`;
}

export { segmentLength };
