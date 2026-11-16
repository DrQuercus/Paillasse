// Mise en page des panneaux d'une figure de gel (sans dépendance : utilisé aussi par l'encart des entrées).
/**
 * Largeur d'affichage de chaque panneau, en % de la figure : tous à la même échelle, pour que
 * la taille du texte et l'épaisseur des traits soient les mêmes d'un panneau à l'autre.
 * widths = largeurs de conception (px) ; layout = column, row ou grid (deux par ligne).
 */
export function panelWidths(widths, layout = 'column') {
  const w = widths.map((x) => Math.max(1, Number(x) || 1));
  if (!w.length) return [];
  let ref;
  if (layout === 'row') ref = w.reduce((a, b) => a + b, 0);
  else if (layout === 'grid') {
    ref = 0;
    for (let i = 0; i < w.length; i += 2) ref = Math.max(ref, w[i] + (w[i + 1] ?? 0));
  } else ref = Math.max(...w);
  return w.map((x) => Math.round((x / ref) * 1000) / 10);
}

/**
 * Étiquettes empilées sans chevauchement : positions ys (croissantes ou non) écartées d'au moins gap,
 * en bougeant le moins possible, entre lo et hi si la place suffit (sinon elles dépassent vers le bas).
 * Renvoie les positions dans l'ordre d'entrée.
 */
export function spreadLabels(ys, gap, lo = -Infinity, hi = Infinity) {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = order.map((o) => o.y);
  const n = out.length;
  for (let k = 1; k < n; k += 1) out[k] = Math.max(out[k], out[k - 1] + gap);
  if (n && out[n - 1] > hi) {
    out[n - 1] = hi;
    for (let k = n - 2; k >= 0; k -= 1) out[k] = Math.min(out[k], out[k + 1] - gap);
  }
  if (n && out[0] < lo) {
    out[0] = lo;
    for (let k = 1; k < n; k += 1) out[k] = Math.max(out[k], out[k - 1] + gap);
  }
  const result = new Array(n);
  order.forEach((o, k) => { result[o.i] = out[k]; });
  return result;
}
