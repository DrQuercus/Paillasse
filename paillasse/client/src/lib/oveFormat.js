// Traduction entre le format de Paillasse (paillasse-seq/1, voir server/src/lib/seq/model.js)
// et celui d'Open Vector Editor. Tout ce qu'OVE ne connaît pas (noms de segments,
// amorces sans site de fixation, brin « sans direction »…) est repris de la version précédente.

const values = (x) => (Array.isArray(x) ? x : Object.values(x ?? {}));
const SITE_SEP = '__site';
export const PRIMER_COLOR = '#d6e2f5'; // teinte discrète par défaut, proche de SnapGene

/** options.primerBases : afficher les bases des amorces alignées sur la séquence (sinon simples flèches). */
export function toOve(d, { primerBases = true } = {}) {
  return {
    name: d.name ?? '',
    circular: Boolean(d.circular),
    sequence: d.sequence,
    features: d.features.map((f) => {
      const segs = f.segments;
      return {
        id: f.id,
        name: f.name,
        type: f.type,
        start: segs[0].start,
        end: segs[segs.length - 1].end,
        strand: f.strand === -1 ? -1 : 1,
        forward: f.strand !== -1,
        arrowheadType: f.strand === 0 ? 'NONE' : f.strand === -1 ? 'BOTTOM' : 'TOP',
        ...(segs.length > 1 ? { locations: segs.map((s) => ({ start: s.start, end: s.end })) } : {}),
        ...(f.color ? { color: f.color } : {}),
        notes: f.notes ?? {},
      };
    }),
    primers: d.primers.flatMap((p) => p.sites.map((s, i) => ({
      id: `${p.id}${SITE_SEP}${i}`,
      name: p.name,
      type: 'primer_bind',
      start: s.start,
      end: s.end,
      strand: s.strand,
      forward: s.strand !== -1,
      ...(primerBases ? { bases: p.bases } : {}),
      // L'amorce s'hybride par son extrémité 3′ : OVE aligne alors ses bases sur la séquence
      // et dessine la queue 5′ éventuelle en décroché (comme SnapGene)
      primerBindsOn: '3prime',
      color: p.color ?? PRIMER_COLOR,
      notes: p.description ? { note: [p.description] } : {},
    }))),
  };
}

const strandOf = (a, previous) => {
  if (a.arrowheadType === 'NONE') return 0;
  const s = a.strand === -1 || a.forward === false ? -1 : 1;
  // OVE ne distingue pas toujours « sans direction » : on garde le 0 d'origine si le sens n'a pas été changé
  if (previous?.strand === 0 && s === 1 && a.arrowheadType === undefined) return 0;
  return s;
};

/** Couleurs affichées par OVE juste après le chargement : sert à distinguer ses couleurs par défaut d'un vrai choix. */
export function colorBaseline(ove) {
  return new Map([...values(ove.features), ...values(ove.primers)].map((a) => [String(a.id), a.color ?? null]));
}

const pickColor = (a, prevColor, baseline) => {
  const shown = a.color ?? null;
  if (baseline?.has(String(a.id)) && baseline.get(String(a.id)) === shown) return prevColor ?? null; // inchangée
  return shown ?? prevColor ?? null;
};

export function fromOve(ove, previous, baseline) {
  const prevFeatures = new Map((previous?.features ?? []).map((f) => [f.id, f]));
  const prevPrimers = new Map((previous?.primers ?? []).map((p) => [p.id, p]));
  const sequence = String(ove.sequence ?? '');

  const features = values(ove.features).map((f) => {
    const prev = prevFeatures.get(f.id);
    const locs = f.locations?.length ? f.locations : [{ start: f.start, end: f.end }];
    const keepNames = prev && prev.segments.length === locs.length;
    return {
      id: f.id,
      name: f.name ?? '',
      type: f.type || 'misc_feature',
      strand: strandOf(f, prev),
      color: pickColor(f, prev?.color, baseline),
      segments: locs.map((l, i) => ({
        start: l.start,
        end: l.end,
        ...(keepNames && prev.segments[i].name ? { name: prev.segments[i].name } : {}),
      })),
      notes: f.notes ?? prev?.notes ?? {},
    };
  });

  // Les sites d'OVE sont regroupés par amorce ; une amorce créée dans l'éditeur devient une nouvelle amorce
  const grouped = new Map();
  for (const p of values(ove.primers)) {
    const [baseId] = String(p.id).split(SITE_SEP);
    const prev = prevPrimers.get(baseId);
    if (!grouped.has(baseId)) {
      const annealed = p.start <= p.end ? sequence.slice(p.start, p.end + 1) : sequence.slice(p.start) + sequence.slice(0, p.end + 1);
      grouped.set(baseId, {
        id: baseId,
        name: p.name ?? prev?.name ?? '',
        bases: p.bases || prev?.bases || (p.strand === -1 ? '' : annealed),
        description: prev?.description ?? (p.notes?.note?.[0] ?? ''),
        color: pickColor(p, prev?.color, baseline),
        sites: [],
      });
    }
    grouped.get(baseId).sites.push({ start: p.start, end: p.end, strand: p.strand === -1 || p.forward === false ? -1 : 1 });
  }
  const primers = [...grouped.values()].map((p) => {
    const prev = prevPrimers.get(p.id);
    // Les informations de fixation (bases hybridées, Tm) restent valables si le site n'a pas bougé
    p.sites = p.sites.map((s) => {
      const same = prev?.sites.find((x) => x.start === s.start && x.end === s.end && x.strand === s.strand);
      return same ? { ...same } : s;
    });
    return p;
  });
  // Amorces sans site de fixation (connues de SnapGene mais non affichées) : conservées telles quelles
  for (const p of previous?.primers ?? []) {
    if (!p.sites.length && !grouped.has(p.id)) primers.push(p);
  }

  return { sequence, circular: Boolean(ove.circular), features, primers };
}
