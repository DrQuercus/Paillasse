import { useCallback, useReducer } from 'react';

// Historique de l'analyse (annuler / rétablir). L'état est du JSON : chaque étape est une copie.
// Les réglages continus (curseurs, glisser-déposer) sont regroupés en une seule étape.
function reducer(h, a) {
  switch (a.type) {
    case 'set': {
      const next = typeof a.update === 'function' ? a.update(h.present) : a.update;
      if (next === h.present) return h;
      const now = Date.now();
      if (a.transient) return { ...h, present: next, pending: h.pending ?? h.present };
      // Suite automatique de l'étape précédente (pistes recalées après un redressement…) : une seule étape à annuler
      if (a.amend) return { ...h, present: next };
      if (a.key && a.key === h.lastKey && now - h.lastTime < 900) return { ...h, present: next, lastTime: now };
      return { past: [...h.past, h.pending ?? h.present].slice(-80), present: next, future: [], lastKey: a.key ?? null, lastTime: now, pending: null };
    }
    case 'commit':
      if (!h.pending) return h;
      return { ...h, past: [...h.past, h.pending].slice(-80), future: [], pending: null, lastKey: null };
    case 'undo': {
      if (!h.past.length) return h;
      return { ...h, past: h.past.slice(0, -1), present: h.past.at(-1), future: [h.present, ...h.future], lastKey: null, pending: null };
    }
    case 'redo': {
      if (!h.future.length) return h;
      return { ...h, past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, pending: null };
    }
    case 'reset':
      return { past: [], present: a.state, future: [], lastKey: null, lastTime: 0, pending: null };
    default:
      return h;
  }
}

export default function useHistory(initial) {
  const [h, dispatch] = useReducer(reducer, null, () => ({ past: [], present: initial, future: [], lastKey: null, lastTime: 0, pending: null }));
  /**
   * update(fn | valeur, { key, transient, amend }) : key regroupe les changements rapprochés, transient attend
   * commit(), amend complète la dernière étape au lieu d'en créer une.
   */
  const update = useCallback((u, opts = {}) => dispatch({ type: 'set', update: u, ...opts }), []);
  const commit = useCallback(() => dispatch({ type: 'commit' }), []);
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const reset = useCallback((state) => dispatch({ type: 'reset', state }), []);
  return { state: h.present, update, commit, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
