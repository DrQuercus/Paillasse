/** Identifiant court aléatoire (fonctionne aussi en HTTP simple, sans crypto.randomUUID). */
export function newId() {
  const bytes = new Uint8Array(6);
  (window.crypto ?? {}).getRandomValues?.(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('') || Math.random().toString(16).slice(2, 14);
}
