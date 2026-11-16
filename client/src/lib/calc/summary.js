// Texte brut d'un résumé de calcul : léger, utilisable sans charger les calculateurs.

/** Texte brut d'un résumé (copier-coller, recherche). */
export function summaryToText(s) {
  if (!s) return '';
  const lines = [[s.title, s.label].filter(Boolean).join(' : ')];
  for (const i of s.inputs ?? []) lines.push(`${i.label} : ${i.value}`);
  if (s.table) {
    lines.push(s.table.columns.join(' | '));
    for (const row of s.table.rows) lines.push(row.join(' | '));
  }
  for (const r of s.results ?? []) lines.push(`${r.label} : ${r.value}`);
  for (const n of s.notes ?? []) lines.push(n);
  if (s.formula) lines.push(`(${s.formula})`);
  return lines.join('\n');
}
