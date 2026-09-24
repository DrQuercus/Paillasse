const COMP = { A: 'T', C: 'G', G: 'C', T: 'A', U: 'A', R: 'Y', Y: 'R', S: 'S', W: 'W', K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N' };
export const revcomp = (s) => [...s.toUpperCase()].reverse().map((c) => COMP[c] ?? 'N').join('');

/** Longueur d'un intervalle inclus, éventuellement à cheval sur l'origine. */
export const rangeLength = (start, end, n) => (start <= end ? end - start + 1 : n - start + end + 1);

/** Bases d'un intervalle inclus (gère l'origine d'une séquence circulaire). */
export const rangeBases = (seq, start, end) => (start <= end ? seq.slice(start, end + 1) : seq.slice(start) + seq.slice(0, end + 1));

export const gc = (s) => (s.length ? Math.round(((s.match(/[GCS]/gi) ?? []).length / s.length) * 1000) / 10 : 0);

export const nf = (x) => Number(x).toLocaleString('fr-FR');
export const pos = (i) => nf(i + 1); // affichage en base 1

export const FEATURE_TYPES = [
  ['CDS', 'CDS (séquence codante)'], ['gene', 'Gène'], ['promoter', 'Promoteur'], ['terminator', 'Terminateur'],
  ['RBS', 'RBS'], ['rep_origin', "Origine de réplication"], ['protein_bind', 'Site de fixation (protéine)'],
  ['primer_bind', "Site d'amorce"], ['misc_feature', 'Autre élément'], ['sig_peptide', 'Peptide signal'],
  ['polyA_signal', 'Signal polyA'], ['LTR', 'LTR'], ['mobile_element', 'Élément mobile'], ['regulatory', 'Élément régulateur'],
];
const TYPE_LABELS = Object.fromEntries(FEATURE_TYPES);
export const typeLabel = (t) => TYPE_LABELS[t] ?? t;
export const COLORS = ['#e46a6a', '#f0a14a', '#f2d24b', '#8ac964', '#4fb8a8', '#5a9bd8', '#9178d6', '#c97fb8', '#9aa4b2'];
