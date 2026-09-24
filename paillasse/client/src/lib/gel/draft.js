// Gel en cours sur la page Gels : gardé dans ce navigateur (IndexedDB) pour ne rien perdre
// en rechargeant la page. Ce n'est qu'un confort : ce qui compte est la figure insérée dans le cahier.
const DB = 'paillasse-gels';
const STORE = 'drafts';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function saveDraft(draft) {
  try {
    await run('readwrite', (s) => s.put({ ...draft, savedAt: Date.now() }, 'current'));
  } catch { /* stockage indisponible (navigation privée…) : sans importance */ }
}

export async function loadDraft() {
  try {
    return (await run('readonly', (s) => s.get('current'))) ?? null;
  } catch {
    return null;
  }
}

export async function clearDraft() {
  try {
    await run('readwrite', (s) => s.delete('current'));
  } catch { /* rien à effacer */ }
}

// Figure reprise depuis une entrée verrouillée (bouton « Reprendre ») : transmise une fois à la page Gels
const RESUME = 'paillasse.gel.resume';
export function setResume(value) {
  try { sessionStorage.setItem(RESUME, JSON.stringify(value)); } catch { /* sans stockage */ }
}
export function takeResume() {
  try {
    const v = JSON.parse(sessionStorage.getItem(RESUME) ?? 'null');
    sessionStorage.removeItem(RESUME);
    return v;
  } catch {
    return null;
  }
}

const MODE = 'paillasse.gel.mode';
export const lastMode = () => { try { return localStorage.getItem(MODE) || 'protein'; } catch { return 'protein'; } };
export const rememberMode = (m) => { try { localStorage.setItem(MODE, m); } catch { /* sans stockage */ } };

// Dernier marqueur utilisé pour chaque sorte de gel (protéines, ADN) : proposé d'office au gel suivant
const LADDER = 'paillasse.gel.ladder.';
export const lastLadder = (kind) => { try { return localStorage.getItem(LADDER + kind); } catch { return null; } };
export const rememberLadder = (kind, id) => { try { if (id) localStorage.setItem(LADDER + kind, id); } catch { /* sans stockage */ } };

// Présentation de l'atelier : pas à pas (guidé) ou rapide (tout sur un écran)
const VIEW = 'paillasse.gel.view';
export const lastView = () => { try { return localStorage.getItem(VIEW) === 'quick' ? 'quick' : 'steps'; } catch { return 'steps'; } };
export const rememberView = (v) => { try { localStorage.setItem(VIEW, v); } catch { /* sans stockage */ } };
