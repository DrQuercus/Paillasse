// Calcul repris depuis une entrée (bouton « Reprendre ») : transmis une seule fois à la page Calculs.
const DRAFT_KEY = 'paillasse.calc.draft';

export function setDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch { /* stockage indisponible : la page Calculs s'ouvrira avec ses dernières valeurs */ }
}

export function takeDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
    sessionStorage.removeItem(DRAFT_KEY);
    return d && typeof d === 'object' ? d : null;
  } catch {
    return null;
  }
}
