// Registre de séquences : chercher, lire (résumé, GenBank, FASTA), sites de restriction, digestion virtuelle,
// PCR virtuelle, analyse d'amorces ; créer une séquence, figer une version.
import { assertSequence } from '../../lib/access.js';
import { HttpError } from '../../lib/errors.js';
import { cutterSummary, digest } from '../../lib/seq/enzymes.js';
import { toFasta } from '../../lib/seq/fasta.js';
import { toGenbank } from '../../lib/seq/genbank.js';
import { simulatePcr } from '../../lib/seq/pcr.js';
import { analyzeOligos, primer3Available } from '../../lib/seq/primer3.js';
import { gcPercent, segmentLength } from '../../lib/seq/model.js';
import {
  createSequences, freezeSequenceVersion, listSequences, loadSequence, loadVersion, productSummary,
} from '../../routes/sequences.js';
import { define } from '../registry.js';
import { bool, int, list, oneOf, params, str, uuid } from '../schema.js';
import { compact, isoTime, sequenceIdOf, webUrl } from './common.js';

const GROUP = 'Séquences';
const seqRef = (description = 'Séquence : identifiant (uuid) ou code (SEQ-0001).') => str(description, { minLength: 1, maxLength: 60 });
const MAX_BASES = 200_000;
const MAX_PRODUCTS = 20;

/** Séquence (copie de travail ou version figée) que l'on peut lire. */
async function readable(ctx, ref, version) {
  const id = await sequenceIdOf(ref);
  await assertSequence(ctx.user, id);
  return { id, s: version ? { ...(await loadVersion(id, version)), id } : await loadSequence(id) };
}

const strandSign = (s) => (s === -1 ? '-' : s === 1 ? '+' : undefined);

/** Annotation lisible : positions à partir de 1 (segments joints), brin, qualificatifs principaux. */
function featureView(f, length) {
  const segs = f.segments ?? [];
  const notes = Object.entries(f.notes ?? {})
    .filter(([k]) => ['gene', 'product', 'label', 'note', 'locus_tag', 'protein_id'].includes(k))
    .map(([k, v]) => `${k}: ${[].concat(v).join(' ; ')}`).join(' | ').slice(0, 300);
  return compact({
    name: f.name, type: f.type,
    start: segs.length ? segs[0].start + 1 : undefined,
    end: segs.length ? segs.at(-1).end + 1 : undefined,
    segments: segs.length > 1 ? segs.map((x) => `${x.start + 1}..${x.end + 1}`) : undefined,
    strand: strandSign(f.strand),
    length: segs.reduce((t, x) => t + segmentLength(x, length), 0),
    notes: notes || undefined,
  });
}

define({
  name: 'list_sequences',
  title: 'Chercher des séquences',
  group: GROUP,
  scope: 'read',
  essential: true,
  http: { method: 'GET', path: '/sequences' },
  description: 'Cherche dans le registre de séquences (plasmides, fragments, amorces) : par nom, code, description, ou par bases '
    + '(8 au moins, sur les deux brins). Sans recherche : les plus récemment modifiées.',
  input: params({
    query: str('Nom, code (SEQ-0001), mot de la description, ou bases (ACGT…).', { maxLength: 2000 }),
    project_id: uuid('Seulement les séquences de ce projet.'),
    limit: int('Nombre de séquences (1 à 200).', { minimum: 1, maximum: 200, default: 50 }),
    offset: int('Décalage pour la page suivante.', { minimum: 0, default: 0 }),
  }),
  async handler(a, ctx) {
    const rows = await listSequences(ctx.user, { q: a.query ?? '', project_id: a.project_id, limit: a.limit + 1, offset: a.offset });
    const more = rows.length > a.limit;
    return {
      sequences: rows.slice(0, a.limit).map((s) => compact({
        id: s.id, code: s.code, name: s.name, description: s.description?.slice(0, 300), length: s.length, circular: s.circular,
        features: s.feature_count, primers: s.primer_count, versions: s.version_count, project: s.project_name,
        sequence_match: s.sequence_match || undefined, updated_at: isoTime(s.updated_at), url: webUrl(ctx, `/sequences/${s.id}`),
      })),
      next_offset: more ? a.offset + a.limit : null,
    };
  },
});

define({
  name: 'get_sequence',
  title: 'Lire une séquence',
  group: GROUP,
  scope: 'read',
  essential: true,
  http: { method: 'GET', path: '/sequences/{sequence_id}' },
  description: 'Lit une séquence du registre : longueur, forme (circulaire ou linéaire), %GC, annotations (positions à partir de 1), '
    + 'amorces, origine (PCR…), versions. format = genbank ou fasta pour le fichier complet ; include_bases pour les bases en clair.',
  input: params({
    sequence_id: seqRef(),
    version: int('Version figée (sinon la copie de travail).', { minimum: 1 }),
    format: oneOf(['summary', 'genbank', 'fasta'], 'summary (par défaut), genbank ou fasta.', { default: 'summary' }),
    include_bases: bool('Joindre les bases (200 000 au plus).', { default: false }),
  }, ['sequence_id']),
  async handler(a, ctx) {
    const { id, s } = await readable(ctx, a.sequence_id, a.version);
    const base = { id, code: s.code, name: s.name, url: webUrl(ctx, `/sequences/${id}`) };
    if (a.format === 'genbank') return { ...base, format: 'genbank', text: toGenbank({ ...s, description: s.description || s.name }) };
    if (a.format === 'fasta') return { ...base, format: 'fasta', text: toFasta(`${s.code}_${s.name}`, s.sequence, s.description) };
    const length = s.sequence.length;
    return compact({
      ...base,
      description: s.description,
      length,
      circular: s.circular,
      gc_percent: gcPercent(s.sequence),
      project: s.project_name,
      version: a.version ?? undefined,
      versions: s.version_count,
      created_by: s.created_by_name ?? s.author,
      updated_at: isoTime(s.updated_at ?? s.created_at),
      origin: s.origin,
      features: (s.features ?? []).map((f) => featureView(f, length)),
      primers: (s.primers ?? []).map((p) => compact({
        name: p.name, bases: p.bases, description: p.description,
        sites: (p.sites ?? []).map((x) => `${x.start + 1}..${x.end + 1} (${strandSign(x.strand) ?? '+'})`),
      })),
      files: s.files?.map((f) => ({ id: f.id, filename: f.filename })),
      bases: a.include_bases ? s.sequence.slice(0, MAX_BASES) : undefined,
      bases_truncated: a.include_bases && length > MAX_BASES ? true : undefined,
    });
  },
  text: (r) => (r.text ? r.text : null),
});

define({
  name: 'find_restriction_sites',
  title: 'Sites de restriction',
  group: GROUP,
  scope: 'read',
  http: { method: 'GET', path: '/sequences/{sequence_id}/cutters' },
  description: 'Enzymes de restriction (base REBASE des fournisseurs courants) qui coupent la séquence : une fois, deux fois, '
    + 'ou pas du tout, avec les positions de coupure. Pour choisir des enzymes de clonage.',
  input: params({ sequence_id: seqRef(), version: int('Version figée.', { minimum: 1 }) }, ['sequence_id']),
  async handler(a, ctx) {
    const { id, s } = await readable(ctx, a.sequence_id, a.version);
    return { id, code: s.code, length: s.sequence.length, circular: s.circular, enzymes: cutterSummary(s.sequence, s.circular) };
  },
});

define({
  name: 'digest_sequence',
  title: 'Digestion virtuelle',
  group: GROUP,
  scope: 'read',
  http: { method: 'POST', path: '/sequences/{sequence_id}/digest' },
  description: 'Digère virtuellement la séquence par une ou plusieurs enzymes (ex. ["EcoRI", "HindIII"]) : fragments, tailles, '
    + 'extrémités. Pour prévoir un gel d’agarose de contrôle.',
  input: params({
    sequence_id: seqRef(),
    enzymes: list({ type: 'string', minLength: 1, maxLength: 40 }, 'Noms des enzymes (1 à 20).', { minItems: 1, maxItems: 20 }),
    version: int('Version figée.', { minimum: 1 }),
  }, ['sequence_id', 'enzymes']),
  async handler(a, ctx) {
    const { id, s } = await readable(ctx, a.sequence_id, a.version);
    return { id, code: s.code, ...digest(s.sequence, s.circular, [...new Set(a.enzymes)]) };
  },
});

const primerParam = (label) => ({
  type: 'object',
  description: `Amorce ${label} : { name, bases } (5′→3′).`,
  properties: { name: str('Nom de l’amorce.', { maxLength: 200 }), bases: str('Bases 5′→3′ (queue non hybridée comprise).', { minLength: 8, maxLength: 200 }) },
  required: ['bases'],
  additionalProperties: false,
});

define({
  name: 'simulate_pcr',
  title: 'PCR virtuelle',
  group: GROUP,
  scope: 'read',
  http: { method: 'POST', path: '/sequences/{sequence_id}/pcr' },
  description: 'Simule une PCR sur la séquence avec deux amorces : sites d’hybridation, produits (taille, région, mésappariements), '
    + 'températures d’hybridation conseillées, avertissements.',
  input: params({
    sequence_id: seqRef('Matrice : identifiant (uuid) ou code (SEQ-0001).'),
    forward: primerParam('sens'),
    reverse: primerParam('antisens'),
    version: int('Version figée de la matrice.', { minimum: 1 }),
  }, ['sequence_id', 'forward', 'reverse']),
  async handler(a, ctx) {
    const { id, s } = await readable(ctx, a.sequence_id, a.version);
    const r = simulatePcr(s, { name: a.forward.name || 'sens', bases: a.forward.bases }, { name: a.reverse.name || 'antisens', bases: a.reverse.bases });
    return compact({
      id,
      template: { code: s.code, name: s.name, length: s.sequence.length, circular: s.circular },
      forward: r.forwardPrimer, reverse: r.reversePrimer, swapped: r.swapped, warnings: r.warnings,
      annealing_temperatures: r.annealingTemperatures,
      product_count: r.products.length,
      // Amorces peu spécifiques (séquence répétée) : les 20 premiers produits suffisent à le montrer
      products: r.products.slice(0, MAX_PRODUCTS).map(productSummary),
      products_truncated: r.products.length > MAX_PRODUCTS || undefined,
    });
  },
});

define({
  name: 'analyze_oligos',
  title: 'Analyser des amorces',
  group: GROUP,
  scope: 'read',
  http: { method: 'POST', path: '/oligos/analyze' },
  description: 'Analyse des amorces avec primer3 (installé sur le serveur) : Tm, %GC, épingles, auto-dimères, dimères croisés.',
  input: params({
    oligos: list({
      type: 'object',
      properties: { name: str('Nom.', { maxLength: 200 }), bases: str('Bases 5′→3′.', { minLength: 5, maxLength: 200 }) },
      required: ['bases'],
      additionalProperties: false,
    }, 'Amorces (1 à 20) : [{ name, bases }].', { minItems: 1, maxItems: 20 }),
  }, ['oligos']),
  async handler(a) {
    if (!(await primer3Available())) throw new HttpError(503, 'primer3 n’est pas installé sur le serveur (sudo apt install primer3).');
    return { oligos: await analyzeOligos(a.oligos.map((o, k) => ({ name: o.name || `amorce ${k + 1}`, bases: o.bases }))) };
  },
});

define({
  name: 'create_sequence',
  title: 'Ajouter une séquence',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/sequences' },
  annotations: { destructiveHint: false, idempotentHint: false },
  description: 'Ajoute au registre une séquence collée : bases brutes, FASTA (un ou plusieurs enregistrements) ou GenBank '
    + '(annotations gardées). Rattachée à un projet ou commune au labo.',
  input: params({
    text: str('Séquence : bases, FASTA ou GenBank.', { minLength: 1, maxLength: 12_000_000 }),
    name: str('Nom (sinon celui du FASTA ou du GenBank).', { maxLength: 300 }),
    circular: bool('Circulaire (plasmide) ; par défaut selon le fichier, sinon linéaire.'),
    description: str('Description.', { maxLength: 10000 }),
    project_id: uuid('Projet (sinon : commune au labo).'),
  }, ['text']),
  async handler(a, ctx) {
    const created = await createSequences(ctx.user, a);
    return { created: created.map((s) => ({ id: s.id, code: s.code, name: s.name, length: s.length, circular: s.circular, url: webUrl(ctx, `/sequences/${s.id}`) })) };
  },
});

define({
  name: 'freeze_sequence_version',
  title: 'Figer une version de séquence',
  group: GROUP,
  scope: 'write',
  http: { method: 'POST', path: '/sequences/{sequence_id}/versions' },
  annotations: { destructiveHint: false, idempotentHint: true },
  description: 'Fige l’état actuel d’une séquence dans une version scellée (empreinte chaînée), par exemple avant de la citer.',
  input: params({ sequence_id: seqRef(), note: str('Note de version.', { maxLength: 500 }) }, ['sequence_id']),
  async handler(a, ctx) {
    const id = await sequenceIdOf(a.sequence_id);
    const r = await freezeSequenceVersion(ctx.user, id, a.note ?? '');
    return { id, unchanged: r.unchanged, version: compact({ number: r.version.version_number, hash: r.version.hash, created_at: isoTime(r.version.created_at), note: r.version.note }) };
  },
});
