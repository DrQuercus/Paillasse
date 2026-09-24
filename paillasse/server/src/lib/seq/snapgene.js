// Lecteur de fichiers SnapGene (.dna).
// Écrit pour Paillasse car les bibliothèques JavaScript existantes perdent les amorces
// (paquet 5) et les qualificatifs. Logique calquée sur Bio.SeqIO.SnapGeneIO (Biopython),
// et vérifiée contre lui sur des fichiers réels (voir test/sequences.test.js).
//
// Structure : suite de paquets [type : 1 octet][longueur : 4 octets big-endian][données]
//   0x09 en-tête « SnapGene »   0x00 ADN (drapeau circulaire + bases)
//   0x0A annotations (XML)      0x05 amorces (XML)      0x06 notes (XML)

import { XMLParser } from 'fast-xml-parser';
import { HttpError } from '../errors.js';
import { newId } from './model.js';
import { htmlToText } from './text.js';

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  isArray: (name) => ['Feature', 'Segment', 'Q', 'V', 'Primer', 'BindingSite', 'HybridizationParams'].includes(name),
});

const invalid = (why) => new HttpError(400, `Fichier SnapGene illisible : ${why}`);

function* packets(buf) {
  let offset = 0;
  while (offset < buf.length) {
    if (offset + 5 > buf.length) throw invalid('paquet tronqué.');
    const type = buf[offset];
    const length = buf.readUInt32BE(offset + 1);
    const start = offset + 5;
    if (start + length > buf.length) throw invalid('paquet tronqué.');
    yield { type, data: buf.subarray(start, start + length) };
    offset = start + length;
  }
}

const range = (spec) => {
  const m = /^(\d+)-(\d+)$/.exec(String(spec ?? '').trim());
  if (!m) throw invalid(`position « ${spec} » incomprise.`);
  return [Number(m[1]), Number(m[2])];
};

function parseFeatures(text) {
  const doc = xml.parse(text);
  return (doc.Features?.Feature ?? []).map((f) => {
    const dir = String(f.directionality ?? '');
    const strand = dir === '1' ? 1 : dir === '2' ? -1 : 0;
    const segments = [];
    let color = null;
    let longest = -1;
    for (const seg of f.Segment ?? []) {
      if ((seg.type ?? 'standard') === 'gap') continue;
      const [a, b] = range(seg.range); // base 1, bornes incluses
      segments.push({ start: a - 1, end: b - 1, ...(seg.name ? { name: htmlToText(seg.name) } : {}) });
      // Couleur de l'annotation = celle de son plus long segment (les petits segments nommés sont souvent blancs)
      if (seg.color && Math.abs(b - a) > longest) {
        longest = Math.abs(b - a);
        color = seg.color;
      }
    }
    const notes = {};
    for (const q of f.Q ?? []) {
      notes[q.name] = (q.V ?? []).map((v) => {
        if (v.text !== undefined) return htmlToText(v.text);
        if (v.predef !== undefined) return htmlToText(v.predef);
        if (v.int !== undefined) return Number(v.int);
        return '';
      });
    }
    return {
      id: newId(),
      name: htmlToText(f.name ?? ''),
      type: f.type || 'misc_feature',
      strand,
      color,
      segments,
      notes,
    };
  }).filter((f) => f.segments.length);
}

function parsePrimers(text) {
  const doc = xml.parse(text);
  const params = doc.Primers?.HybridizationParams?.[0] ?? {};
  const minLen = Number(params.minContinuousMatchLen ?? 0);
  const minTm = Number(params.minMeltingTemperature ?? 0);
  return (doc.Primers?.Primer ?? []).map((p) => {
    const sites = [];
    for (const site of p.BindingSite ?? []) {
      const [a, b] = range(site.location); // base 0, bornes incluses
      const s = { start: a, end: b, strand: String(site.boundStrand ?? '0') === '1' ? -1 : 1 };
      // Même filtre que SnapGene à l'affichage (et Biopython) : sites trop courts ou trop peu stables ignorés
      if (site.simplified === '1' && sites.some((x) => x.start === s.start && x.end === s.end && x.strand === s.strand)) continue;
      if (site.annealedBases !== undefined && site.annealedBases.length < minLen) continue;
      if (site.meltingTemperature !== undefined && Number(site.meltingTemperature) < minTm) continue;
      if (site.annealedBases) s.annealed = site.annealedBases;
      if (site.meltingTemperature !== undefined) s.tm = Number(site.meltingTemperature);
      sites.push(s);
    }
    return {
      id: newId(),
      name: htmlToText(p.name ?? ''),
      bases: String(p.sequence ?? ''),
      description: htmlToText(p.description ?? ''),
      color: null,
      sites,
    };
  });
}

function parseNotes(text) {
  const doc = xml.parse(text)?.Notes ?? {};
  const value = (k) => (typeof doc[k] === 'string' ? htmlToText(doc[k]) : '');
  const parts = [value('Description')];
  if (doc.UseCustomMapLabel === '1' && value('CustomMapLabel')) parts.push(`Étiquette de carte : ${value('CustomMapLabel')}`);
  return parts.filter(Boolean).join('\n');
}

/** Buffer d'un fichier .dna → données Paillasse (non encore validées). */
export function parseSnapGene(buf, filename = 'sequence.dna') {
  const iter = packets(buf);
  const first = iter.next().value;
  if (!first || first.type !== 0x09 || first.data.subarray(0, 8).toString('ascii') !== 'SnapGene') {
    throw invalid("ce n'est pas un fichier SnapGene.");
  }
  let sequence = null;
  let circular = false;
  let features = [];
  let primers = [];
  let description = '';
  for (const { type, data } of iter) {
    if (type === 0x00) {
      if (sequence !== null) throw invalid('plusieurs séquences ADN dans le fichier.');
      circular = (data[0] & 0x01) === 1;
      sequence = data.subarray(1).toString('ascii');
    } else if (type === 0x0a) features = parseFeatures(data.toString('utf8'));
    else if (type === 0x05) primers = parsePrimers(data.toString('utf8'));
    else if (type === 0x06) description = parseNotes(data.toString('utf8'));
  }
  if (sequence === null) throw invalid("pas de séquence ADN (fichier de protéine ?).");
  return {
    name: filename.replace(/\.[^.]+$/, ''),
    description,
    sequence,
    circular,
    features,
    primers,
  };
}
