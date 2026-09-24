export const todayISO = () => new Date().toLocaleDateString('sv-SE');

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const formatDay = (iso) =>
  capitalize(new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }));

export const formatShortDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (value) =>
  new Date(value).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatSize(bytes) {
  const n = Number(bytes);
  if (n < 1024) return `${n} o`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} Ko`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} Mo`;
  return `${(n / 1024 ** 3).toFixed(2)} Go`;
}

export const shortHash = (hash) => (hash ? hash.slice(0, 12) : '');

/** Regroupe une liste d'entrées (déjà triée) par date. */
export function groupByDate(entries) {
  const groups = [];
  for (const e of entries) {
    const last = groups.at(-1);
    if (last?.date === e.entry_date) last.entries.push(e);
    else groups.push({ date: e.entry_date, entries: [e] });
  }
  return groups;
}
