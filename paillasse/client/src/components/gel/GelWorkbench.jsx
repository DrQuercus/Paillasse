import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Check as CheckIcon, ChevronRight, Redo2, Undo2, X } from 'lucide-react';
import { useApp } from '../../context.js';
import { detectPolarity, prepareImage } from '../../lib/gel/raster.js';
import { MODES, computeProfiles, computeResults, newId, shiftGeometry, switchMode } from '../../lib/gel/model.js';
import { formatSize } from '../../lib/gel/calibration.js';
import { renderToCanvas, signalRange } from '../../lib/gel/render.js';
import Modal from '../Modal.jsx';
import { Segmented } from './controls.jsx';
import GelCanvas from './GelCanvas.jsx';
import LaneDetails from './LaneDetails.jsx';
import LaddersPanel from './LaddersPanel.jsx';
import { StepImage, StepLanes } from './StepsPrepare.jsx';
import { StepBands, StepSizes } from './StepsMeasure.jsx';
import { FigurePreview, StepFigure } from './StepFigure.jsx';
import useHistory from './useHistory.js';
import useLadders from './useLadders.js';

const STEPS = [
  ['image', 'Image', StepImage],
  ['lanes', 'Pistes', StepLanes],
  ['sizes', 'Tailles', StepSizes],
  ['bands', 'Bandes', StepBands],
  ['figure', 'Figure', StepFigure],
];

const TOOL_HINTS = {
  addLane: 'Cliquez sur le gel pour placer une piste (Échap pour terminer).',
  crop: 'Tracez le cadre à garder.',
  warp: 'Cliquez sur une même bande dans plusieurs pistes.',
  band: 'Cliquez sur une bande pour la retirer, à côté pour en ajouter une.',
  annotate: 'Cliquez à la hauteur de la bande à signaler.',
};

/**
 * Atelier d'analyse d'un gel, en plein écran : cinq étapes guidées, annuler / rétablir.
 * source = { image, info } (image décodée) ; initial = état de l'analyse (model.js).
 * onSubmit({ state, img, profiles, results }) produit la figure (insertion dans l'entrée…).
 */
export default function GelWorkbench({ source, initial, initialStep, submitLabel = 'Insérer dans l’entrée', onSubmit, onClose, onChange }) {
  const { notify } = useApp();
  const { state, update, commit, undo, redo, canUndo, canRedo } = useHistory(initial);
  const [step, setStep] = useState(initialStep ?? 'image');
  const [tool, setToolState] = useState('select');
  const [activeLaneId, setActiveLaneId] = useState(() => initial.lanes.find((l) => l.role !== 'ladder')?.id ?? initial.lanes[0]?.id ?? null);
  const [hoverPos, setHoverPos] = useState(null);
  const [activeWarpId, setActiveWarpId] = useState(null);
  const [calibSize, setCalibSize] = useState(null);
  const [laddersOpen, setLaddersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ladders = useLadders();
  const setTool = useCallback((t) => { setToolState(t); if (t !== 'warp') setActiveWarpId(null); }, []);

  // Images : l'original n'est jamais modifié ; le rognage se fait en dernier (et se voit en entier pendant l'outil)
  const { rotate90, flipH, flipV, angle, crop } = state.prep;
  const uncropped = useMemo(() => prepareImage(source.image, { rotate90, flipH, flipV, angle }), [source.image, rotate90, flipH, flipV, angle]);
  const img = useMemo(() => (crop ? prepareImage(uncropped, { crop }) : uncropped), [uncropped, crop]);
  const detectedPolarity = useMemo(() => detectPolarity(img), [img]);
  const polarity = state.polarity === 'auto' ? detectedPolarity : state.polarity;

  // Calculs sur l'état différé : l'interface reste fluide pendant qu'on glisse une piste
  const d = useDeferredValue(state);
  const profiles = useMemo(() => computeProfiles(img, d), [img, d.polarity, d.signal, d.region, d.laneWidth, d.lanes, d.warp, d.detection, d.edits]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useMemo(() => computeResults(profiles, d, source.info), [profiles, d.calibration, d.quant, d.expected, d.mode, d.bandNames]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rendu de l'image (mis en cache : ne dépend que de l'image et des réglages d'affichage)
  const viewImg = tool === 'crop' ? uncropped : img;
  const range = useMemo(() => signalRange(viewImg, polarity), [viewImg, polarity]);
  const base = useMemo(
    () => renderToCanvas(viewImg, { polarity, display: state.display, darkBands: polarity === 'dark', colormap: state.display.colormap, range }),
    [viewImg, polarity, state.display, range],
  );

  useEffect(() => { onChange?.(state); }, [state, onChange]);

  // Nom d'une bande du tableau (GAPDH, p-ERK…), retrouvé ensuite par sa taille ou sa position
  const onRenameBand = useCallback((group, name) => update((s) => {
    const same = (n) => (n.size && group.size ? Math.abs(Math.log(n.size / group.size)) < 0.03 : Math.abs(n.pos - group.pos) < 4);
    const rest = (s.bandNames ?? []).filter((n) => !same(n));
    return { ...s, bandNames: name.trim() ? [...rest, { pos: group.pos, size: group.size, name }] : rest };
  }, { key: `band-name-${group.pos}` }), [update]);

  // Raccourcis : Ctrl+Z / Ctrl+Maj+Z, Échap
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range' && e.target.type !== 'checkbox' && e.target.type !== 'radio';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape' && tool !== 'select' && !document.querySelector('.modal-backdrop')) {
        e.stopPropagation();
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [undo, redo, tool, setTool]);

  // --- Actions sur le gel ------------------------------------------------------------------------
  const onLaneAdd = (x) => {
    const id = newId();
    update((s) => ({ ...s, lanes: [...s.lanes, { id, name: String(s.lanes.filter((l) => l.role !== 'ladder').length + 1), xTop: x, xBot: x, role: 'sample' }].sort((a, b) => a.xTop - b.xTop) }));
    setActiveLaneId(id);
  };
  const onLaneChange = (id, patch, opts) => update((s) => ({ ...s, lanes: s.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), opts);
  const onRegionChange = (patch, opts) => update((s) => ({ ...s, region: { ...(s.region ?? { top: 0, bottom: img.height - 1 }), ...patch } }), opts);
  const onCrop = (rect) => {
    update((s) => {
      const old = s.prep.crop ?? { x: 0, y: 0 };
      return { ...shiftGeometry(s, old.x - rect.x, old.y - rect.y), prep: { ...s.prep, crop: rect } };
    });
    setTool('select');
  };
  const onWarpPoint = (p) => {
    if (!activeWarpId) return;
    update((s) => ({ ...s, warp: s.warp.map((c) => (c.id === activeWarpId ? { ...c, points: [...c.points, p] } : c)) }));
  };
  const onPick = (laneId, pos) => {
    const lane = results.lanes.find((l) => l.id === laneId);
    if (!lane) return;
    const tol = Math.max(4, profiles.scales.minDistance);
    const near = lane.bands.reduce((best, b) => (!best || Math.abs(b.apex - pos) < Math.abs(best.apex - pos) ? b : best), null);
    if (tool === 'calib') {
      if (laneId !== state.calibration.laneId) { notify('Cliquez dans la piste du marqueur.', 'error'); return; }
      const at = near && Math.abs(near.apex - pos) <= tol ? near.apex : pos;
      const sizes = state.calibration.ladder?.bands.map((b) => b.size) ?? [];
      const points = [...state.calibration.points.filter((p) => p.size !== calibSize && Math.abs(p.pos - at) > 1), { size: calibSize, pos: at }];
      update((s) => ({ ...s, calibration: { ...s.calibration, points } }));
      const next = sizes.find((sz) => sz < calibSize && !points.some((p) => p.size === sz));
      if (next) setCalibSize(next);
      else setTool('select');
      notify(`${formatSize(calibSize, MODES[state.mode].unit)} placé.`, 'success');
      return;
    }
    if (tool === 'band') {
      setActiveLaneId(laneId);
      update((s) => {
        const e = s.edits?.[laneId] ?? { added: [], removed: [] };
        const hit = near && Math.abs(near.apex - pos) <= tol / 2;
        const next = hit
          ? { added: (e.added ?? []).filter((a) => Math.abs(a - near.apex) > tol), removed: [...(e.removed ?? []), near.apex] }
          : { added: [...(e.added ?? []), pos], removed: (e.removed ?? []).filter((r) => Math.abs(r - pos) > tol) };
        return { ...s, edits: { ...s.edits, [laneId]: next } };
      });
    }
  };
  const onAnnotate = (pos) => {
    update((s) => ({ ...s, annotations: [...(s.annotations ?? []), { id: newId(), pos, text: 'Bande' }] }));
    setTool('select');
    notify('Flèche ajoutée : modifiez son texte dans le panneau.', 'success');
  };

  const submit = async () => {
    setBusy(true);
    try {
      const fresh = computeProfiles(img, state);
      await onSubmit({ state, img, profiles: fresh, results: computeResults(fresh, state, source.info) });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const done = {
    image: true,
    lanes: state.lanes.length > 0,
    sizes: Boolean(results.calibration),
    bands: results.lanes.some((l) => l.bands.length),
    figure: false,
  };
  const stepIndex = STEPS.findIndex(([k]) => k === step);
  const StepPanel = STEPS[stepIndex][2];
  const ctx = {
    state, update, commit, profiles, results, info: source.info, img, uncropped, detectedPolarity, tool, setTool,
    activeLaneId, setActiveLaneId, activeWarpId, setActiveWarpId, calibSize, setCalibSize, ladders, notify,
    openLadders: () => setLaddersOpen(true),
  };
  const showDetails = step !== 'image' && step !== 'figure';

  return (
    <div className="gel-wb" role="dialog" aria-modal="true" aria-label="Analyse de gel">
      <header className="gel-wb-head">
        <button type="button" className="btn btn-ghost" onClick={onClose}><X size={16} /> Fermer</button>
        <input className="gel-title" value={state.name} onChange={(e) => update((s) => ({ ...s, name: e.target.value }), { key: 'name' })} placeholder="Titre de la figure" aria-label="Titre de la figure" />
        <Segmented label="Type de gel" value={state.mode} onChange={(mode) => update((s) => switchMode(s, mode))} options={Object.entries(MODES).map(([k, m]) => [k, m.label])} />
        <div className="gel-wb-actions">
          <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Undo2 size={17} /></button>
          <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir"><Redo2 size={17} /></button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !state.lanes.length}>{busy ? 'Enregistrement…' : submitLabel}</button>
        </div>
      </header>
      <div className={`gel-wb-body${showDetails ? '' : ' no-details'}`}>
        <aside className="gel-wb-side">
          <nav className="gel-steps" aria-label="Étapes">
            {STEPS.map(([key, label], i) => (
              <button key={key} type="button" className={`gel-step${key === step ? ' is-active' : ''}${done[key] ? ' is-done' : ''}`} onClick={() => { setStep(key); setTool('select'); }} aria-current={key === step ? 'step' : undefined}>
                <span className="gel-step-num">{done[key] && key !== step ? <CheckIcon size={12} /> : i + 1}</span>{label}
              </button>
            ))}
          </nav>
          <p className="gel-mode-hint">{MODES[state.mode].hint}</p>
          <div className="gel-step-panel">
            <StepPanel ctx={ctx} />
            {stepIndex < STEPS.length - 1 && (
              <button type="button" className="btn gel-next" onClick={() => { setStep(STEPS[stepIndex + 1][0]); setTool('select'); }}>
                Étape suivante : {STEPS[stepIndex + 1][1]} <ChevronRight size={15} />
              </button>
            )}
          </div>
          {results.warnings.length > 0 && step !== 'figure' && (
            <ul className="gel-warnings" aria-label="Avertissements">
              {results.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </aside>
        <main className="gel-wb-main">
          {step === 'figure' && tool !== 'annotate'
            ? <FigurePreview state={state} img={img} profiles={profiles} results={results} />
            : (
              <GelCanvas
                img={viewImg}
                base={base}
                state={state}
                profiles={profiles}
                results={results}
                tool={tool}
                activeLaneId={activeLaneId}
                onSelectLane={setActiveLaneId}
                hoverPos={hoverPos}
                onHover={setHoverPos}
                showRegion={step === 'lanes'}
                showBands={step === 'sizes' || step === 'bands' || step === 'figure'}
                showGrid={step === 'image' && tool !== 'crop'}
                cropRect={state.prep.crop}
                activeWarpId={activeWarpId}
                onLaneAdd={onLaneAdd}
                onLaneChange={onLaneChange}
                onRegionChange={onRegionChange}
                onDragEnd={commit}
                onCrop={onCrop}
                onWarpPoint={onWarpPoint}
                onPick={onPick}
                onAnnotate={onAnnotate}
              />
            )}
          {TOOL_HINTS[tool] && <div className="gel-tool-hint">{TOOL_HINTS[tool]} <button type="button" className="link-btn" onClick={() => setTool('select')}>Terminer</button></div>}
          {tool === 'calib' && <div className="gel-tool-hint">Cliquez sur la bande de {formatSize(calibSize, MODES[state.mode].unit)} dans la piste du marqueur. <button type="button" className="link-btn" onClick={() => setTool('select')}>Terminer</button></div>}
        </main>
        {showDetails && (
          <aside className="gel-wb-details">
            <LaneDetails
              state={state}
              profiles={profiles}
              results={results}
              activeLaneId={activeLaneId}
              hoverPos={hoverPos}
              onHover={setHoverPos}
              onPick={onPick}
              pickable={tool === 'band' || tool === 'calib'}
              onRenameBand={onRenameBand}
            />
          </aside>
        )}
      </div>
      {laddersOpen && (
        <Modal title="Marqueurs de taille" onClose={() => setLaddersOpen(false)} wide>
          <LaddersPanel ladders={ladders} />
        </Modal>
      )}
    </div>
  );
}
