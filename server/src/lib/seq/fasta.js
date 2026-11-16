import { HttpError } from '../errors.js';

/** FASTA → une ou plusieurs séquences (linéaires par défaut). */
export function parseFasta(text, filename = 'sequence.fasta') {
  const records = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('>')) {
      const header = line.slice(1).trim();
      const [name, ...rest] = header.split(/\s+/);
      current = { name: name || filename.replace(/\.[^.]+$/, ''), description: rest.join(' '), chunks: [] };
      records.push(current);
    } else {
      if (!current) {
        current = { name: filename.replace(/\.[^.]+$/, ''), description: '', chunks: [] };
        records.push(current);
      }
      current.chunks.push(line.replace(/[\s\d]/g, ''));
    }
  }
  if (!records.length) throw new HttpError(400, 'Fichier FASTA vide.');
  return records.map((r) => ({
    name: r.name, description: r.description, sequence: r.chunks.join('').replace(/\*$/, ''),
    circular: false, features: [], primers: [],
  }));
}

export function toFasta(name, sequence, description = '') {
  const lines = [`>${name.replace(/\s+/g, '_')}${description ? ` ${description.replace(/\s+/g, ' ')}` : ''}`];
  for (let i = 0; i < sequence.length; i += 70) lines.push(sequence.slice(i, i + 70));
  return `${lines.join('\n')}\n`;
}
