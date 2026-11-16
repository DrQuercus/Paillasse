import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { prepareImage } from '../../lib/gel/raster.js';
import { computeProfiles, computeResults, createProfileCache, imageInfo, normalizeAnalysis } from '../../lib/gel/model.js';
import useHistory from './useHistory.js';

/**
 * Tout le calcul d'une analyse de gel, séparé de l'interface : historique (annuler / rétablir), image de
 * travail (orientation, redressement, rognage), profils et résultats, aperçu du redressement.
 * getCtx() donne le contexte courant de l'atelier aux actions qui attendent la nouvelle image.
 */
export default function useGelAnalysis(source, initial, getCtx) {
  const [start] = useState(() => normalizeAnalysis(initial));
  const history = useHistory(start);
  const { state, update } = history;

  // Images : l'original n'est jamais modifié ; le rognage se fait en dernier (et se voit en entier pendant l'outil)
  const { rotate90, flipH, flipV, angle, crop } = state.prep;
  const uncropped = useMemo(() => prepareImage(source.image, { rotate90, flipH, flipV, angle }), [source.image, rotate90, flipH, flipV, angle]);
  const img = useMemo(() => (crop ? prepareImage(uncropped, { crop }) : uncropped), [uncropped, crop]);
  // Mémoire des lectures de pistes : déplacer une piste ne relit qu'elle, régler la détection ne relit rien
  const cacheRef = useRef(null);
  if (!cacheRef.current) cacheRef.current = createProfileCache();
  const cache = cacheRef.current;
  const detectedPolarity = useMemo(() => imageInfo(img, cache).polarity, [img, cache]);
  const polarity = state.polarity === 'auto' ? detectedPolarity : state.polarity;

  // Calculs sur l'état différé : l'interface reste fluide pendant qu'on glisse une piste
  const d = useDeferredValue(state);
  const profiles = useMemo(() => computeProfiles(img, d, cache), [img, d.polarity, d.signal, d.region, d.laneWidth, d.lanes, d.warp, d.detection, d.edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => computeResults(profiles, d, source.info), [profiles, d.calibration, d.quant, d.expected, d.mode, d.bandNames]); // eslint-disable-line react-hooks/exhaustive-deps

  // Actions qui ont besoin de la nouvelle image (détection des pistes après un redressement, un quart de tour)
  const pending = useRef([]);
  useEffect(() => {
    const list = pending.current;
    pending.current = [];
    for (const fn of list) fn(getCtx());
  }, [img]); // eslint-disable-line react-hooks/exhaustive-deps
  /** fn(ctx) une fois la prochaine image calculée. */
  const afterImage = useCallback((fn) => { pending.current.push(fn); }, []);

  // Redressement : aperçu immédiat (l'image affichée tourne), calcul réel quand on lâche le curseur ;
  // les pistes déjà placées sont alors recalées sur l'image redressée (getCtx().onStraightened)
  const stateRef = useRef(state);
  stateRef.current = state;
  const [anglePreview, setAnglePreview] = useState(null);
  const angleTimer = useRef(null);
  const commitAngle = useCallback((value) => {
    clearTimeout(angleTimer.current);
    setAnglePreview(null);
    const before = stateRef.current;
    if ((before.prep.angle ?? 0) === value) return;
    update((s) => ({ ...s, prep: { ...s.prep, angle: value } }), { key: 'angle' });
    if (before.lanes.length) afterImage((c) => c.onStraightened?.(c, before.prep.angle ?? 0, value));
  }, [update, afterImage]);
  const previewAngle = useCallback((value) => {
    setAnglePreview(value);
    clearTimeout(angleTimer.current);
    angleTimer.current = setTimeout(() => commitAngle(value), 450);
  }, [commitAngle]);
  useEffect(() => () => clearTimeout(angleTimer.current), []);

  /** fn(ctx) tout de suite, ou après le redressement en cours d'aperçu. */
  const settle = useCallback((fn) => {
    if (anglePreview === null || anglePreview === (state.prep.angle ?? 0)) {
      if (anglePreview !== null) { clearTimeout(angleTimer.current); setAnglePreview(null); }
      fn(getCtx());
      return;
    }
    afterImage(fn);
    commitAngle(anglePreview);
  }, [anglePreview, state.prep.angle, afterImage, commitAngle, getCtx]);
  const flushAngle = useCallback(() => { if (anglePreview !== null) commitAngle(anglePreview); }, [anglePreview, commitAngle]);

  return {
    ...history, img, uncropped, cache, detectedPolarity, polarity, profiles, results, settled: d === state,
    angle: anglePreview ?? state.prep.angle ?? 0, anglePreview, previewAngle, commitAngle, flushAngle, settle, afterImage,
  };
}
