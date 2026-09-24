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
