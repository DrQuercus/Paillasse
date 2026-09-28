import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelRightClose, PanelRightOpen, Redo2, Undo2, X } from 'lucide-react';
import { useApp } from '../../context.js';
import { MODES, computeProfiles, computeResults, newId, shiftGeometry, suggestCalibration, switchMode } from '../../lib/gel/model.js';
import { formatSize } from '../../lib/gel/calibration.js';
import { renderToCanvas, signalRange } from '../../lib/gel/render.js';
import { lastLadder } from '../../lib/gel/draft.js';
import Modal from '../Modal.jsx';
import { ModuleCard, Segmented } from './controls.jsx';
import GelCanvas from './GelCanvas.jsx';
import AnalysisPanel from './AnalysisPanel.jsx';
import FigurePreview from './FigurePreview.jsx';
import DownloadMenu from './DownloadMenu.jsx';
import LaddersPanel from './LaddersPanel.jsx';
import { MODULES } from './modules/index.js';
import { detectLanesInto, rotateLanesInto } from './modules/LanesModule.jsx';
import useGelAnalysis from './useGelAnalysis.js';
import useLadders, { ladderSnapshot } from './useLadders.js';

const TOOL_HINTS = {
  addLane: 'Cliquez sur le gel pour placer une piste.',
  crop: 'Tracez le cadre à garder.',
  warp: 'Cliquez sur une même bande dans plusieurs pistes, de gauche à droite.',
  band: 'Cliquez sur une bande pour la retirer, à côté pour en ajouter une.',
  annotate: 'Cliquez à la hauteur de la bande à signaler.',
};

const PANEL_KEY = 'paillasse.gel.panel';
const readPanel = () => {
  try {
    const v = JSON.parse(localStorage.getItem(PANEL_KEY) ?? 'null');
    return { width: Number(v?.width) || 440, open: v?.open !== false };
  } catch {
    return { width: 440, open: true };
  }
};
const savePanel = (p) => { try { localStorage.setItem(PANEL_KEY, JSON.stringify(p)); } catch { /* sans stockage */ } };

/**
 * Atelier d'analyse d'un gel, en plein écran et sur un seul écran : modules repliables à gauche (image,
 * pistes, tailles, bandes, quantification, figure), gel ou aperçu de la figure au centre, analyse à droite.
 * À l'ouverture d'une nouvelle image, pistes détectées et dernier marqueur appliqué d'office.
 * source = { image, info } (image décodée) ; initial = état de l'analyse (model.js) ; initialModule = module ouvert.
 * onSubmit({ state, img, profiles, results }) produit la figure (insertion dans l'entrée…).
 */
export default function GelWorkbench({ source, initial, initialModule, submitLabel = 'Insérer dans l’entrée', onSubmit, onClose, onChange }) {
  const { notify } = useApp();
  const ctxRef = useRef(null);
  const getCtx = useCallback(() => ctxRef.current, []);
  const a = useGelAnalysis(source, initial, getCtx);
  const { state, update, commit, undo, redo, canUndo, canRedo, img, uncropped, profiles, results, polarity } = a;
  const fresh = useRef(!initial?.lanes?.length);

  const [openKey, setOpenKey] = useState(() => initialModule ?? (fresh.current ? 'lanes' : 'bands'));
  const [view, setView] = useState(() => (initialModule === 'figure' ? 'figure' : 'gel'));
  const [tool, setToolState] = useState('select');
  const [activeLaneId, setActiveLaneId] = useState(() => state.lanes.find((l) => l.role !== 'ladder')?.id ?? state.lanes[0]?.id ?? null);
  const [hoverPos, setHoverPos] = useState(null);
  const [activeWarpId, setActiveWarpId] = useState(null);
  const [calibSize, setCalibSize] = useState(null);
  const [laddersOpen, setLaddersOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanelState] = useState(readPanel);
  const [overlay, setOverlay] = useState(true);
  const ladders = useLadders();
  const setTool = useCallback((t) => { setToolState(t); if (t !== 'warp') setActiveWarpId(null); }, []);
  const setPanel = (patch) => setPanelState((p) => { const next = { ...p, ...patch }; savePanel(next); return next; });

  // Messages courants (pistes trouvées, taille placée…) : une ligne discrète sur le gel, pas une pile de notifications
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);
  const say = useCallback((text) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 6000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);
  // Annuler, rétablir : le dernier message ne décrit plus l'état affiché
  const doUndo = useCallback(() => { setNotice(null); undo(); }, [undo]);
  const doRedo = useCallback(() => { setNotice(null); redo(); }, [redo]);

  const toggleModule = (key) => {
    a.flushAngle();
    setTool('select');
    const next = openKey === key ? null : key;
    setOpenKey(next);
    // La figure se règle en la regardant ; les autres modules travaillent sur le gel
    if (next === 'figure') setView('figure');
    else if (next) setView('gel');
  };

  // Rendu de l'image (ne dépend que de l'image et des réglages d'affichage)
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
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !['range', 'checkbox', 'radio'].includes(e.target.type);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) doRedo(); else doUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) {
        e.preventDefault();
        doRedo();
      } else if (e.key === 'Escape' && tool !== 'select' && !document.querySelector('.modal-backdrop')) {
        e.stopPropagation();
        setTool('select');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [doUndo, doRedo, tool, setTool]);

  // --- Actions sur le gel ------------------------------------------------------------------------
  const onLaneAdd = (x) => {
    const id = newId();
    update((s) => ({ ...s, lanes: [...s.lanes, { id, name: String(s.lanes.filter((l) => l.role !== 'ladder').length + 1), xTop: x, xBot: x, role: 'sample' }].sort((p, q) => p.xTop - q.xTop) }));
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
      say(`${formatSize(calibSize, MODES[state.mode].unit)} placé${next ? ` ; suivante : ${formatSize(next, MODES[state.mode].unit)}` : ''}.`);
      if (next) setCalibSize(next);
      else setTool('select');
      return;
    }
    if (tool === 'band') {
      setActiveLaneId(laneId);
      update((s) => {
        const e = s.edits?.[laneId] ?? { added: [], removed: [] };
        const hit = near && Math.abs(near.apex - pos) <= tol / 2;
        const next = hit
          ? { ...e, added: (e.added ?? []).filter((x) => Math.abs(x - near.apex) > tol), removed: [...(e.removed ?? []), near.apex] }
          : { ...e, added: [...(e.added ?? []), pos], removed: (e.removed ?? []).filter((r) => Math.abs(r - pos) > tol) };
        return { ...s, edits: { ...s.edits, [laneId]: next } };
      });
    }
  };
  const onAnnotate = (pos) => {
    update((s) => ({ ...s, annotations: [...(s.annotations ?? []), { id: newId(), pos, text: 'Bande' }] }));
    setTool('select');
    setView('figure');
    say('Flèche ajoutée : changez son texte dans le module Figure.');
  };

  // Données à jour pour produire la figure (sans attendre les calculs différés)
  const current = () => {
    const p = computeProfiles(img, state, a.cache);
    return { state, img, profiles: p, results: computeResults(p, state, source.info) };
  };
  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(current());
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Bandes du marqueur à réattribuer dès que les pistes (re)détectées sont lues
  const wantAssign = useRef(false);
  const requestAssign = useCallback(() => { wantAssign.current = true; }, []);
  // Image redressée : les pistes sont recalées, dans la même étape de l'historique. Redétectées si on en
  // retrouve autant (noms et rôles gardés), sinon tournées avec l'image (pistes placées à la main).
  const onStraightened = useCallback((c, from, to) => {
    if (!detectLanesInto(c, { quiet: true, keep: c.state.lanes, sameOnly: true, amend: true })) rotateLanesInto(c, from, to);
    say('Pistes recalées sur l’image redressée.');
  }, [say]);

  const ctx = {
    ...a, info: source.info, tool, setTool, activeLaneId, setActiveLaneId, activeWarpId, setActiveWarpId,
    calibSize, setCalibSize, ladders, notify, say, requestAssign, onStraightened, openLadders: () => setLaddersOpen(true),
  };
  ctxRef.current = ctx;

  // Première passe automatique sur une nouvelle image : pistes détectées, dernier marqueur appliqué.
  // Elle fait partie de l'ouverture : rien à annuler.
  const auto = useRef({ lanes: false, ladder: false });
  useEffect(() => { auto.current.ladder = false; }, [state.mode]);
  useEffect(() => {
    if (!fresh.current || state.lanes.length || auto.current.lanes) return;
    auto.current.lanes = true;
    detectLanesInto(ctx, { amend: true });
  }, [state.lanes.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!a.settled) return;
    const cal = state.calibration;
    const lane = results.ladderLane;
    const ready = lane && lane.id === cal.laneId && lane.bands.length > 0;
    if (wantAssign.current && cal.ladder) {
      if (!ready) return;
      wantAssign.current = false;
      if (!cal.points.length) update((s) => ({ ...s, calibration: { ...s.calibration, points: suggestCalibration(results, s.calibration.ladder) } }), { amend: true });
      return;
    }
    if (auto.current.ladder || cal.ladder || !ladders || !ready) return;
    auto.current.ladder = true;
    const kind = MODES[state.mode].ladderKind;
    const found = ladders.find((l) => l.id === lastLadder(kind) && l.kind === kind && !l.archived);
    if (!found) return;
    const snap = ladderSnapshot(found);
    update((s) => ({ ...s, calibration: { ...s.calibration, ladder: snap, points: suggestCalibration(results, snap) } }), { amend: !canUndo });
    say(`Marqueur « ${found.name} » appliqué (le dernier utilisé) : changez-le dans Tailles si besoin.`);
  }, [results, a.settled, ladders, state.calibration.ladder, state.calibration.laneId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Panneau d'analyse redimensionnable (poignée sur son bord gauche)
  const body = useRef(null);
  const onResizeStart = (e) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const r = body.current.getBoundingClientRect();
      setPanelState((p) => ({ ...p, width: Math.round(Math.max(320, Math.min(r.width - 320 - 300, r.right - ev.clientX))) }));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      setPanelState((p) => { savePanel(p); return p; });
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const showFigure = view === 'figure' && tool !== 'annotate';
  const showDetails = panel.open && !showFigure;
  const hint = tool === 'calib'
    ? `Cliquez sur la bande de ${formatSize(calibSize, MODES[state.mode].unit)} dans la piste du marqueur.`
    : TOOL_HINTS[tool];

  return (
    <div className="gel-wb" role="dialog" aria-modal="true" aria-label="Analyse de gel">
      <header className="gel-wb-head">
        <button type="button" className="btn btn-ghost" onClick={onClose}><X size={16} /> Fermer</button>
        <input className="gel-title" value={state.name} onChange={(e) => update((s) => ({ ...s, name: e.target.value }), { key: 'name' })} placeholder="Titre de la figure" aria-label="Titre de la figure" />
        <Segmented label="Type de gel" value={state.mode} onChange={(mode) => update((s) => switchMode(s, mode))} options={Object.entries(MODES).map(([k, m]) => [k, m.label])} />
        <div className="gel-wb-actions">
          <button type="button" className="icon-btn" onClick={doUndo} disabled={!canUndo} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Undo2 size={17} /></button>
          <button type="button" className="icon-btn" onClick={doRedo} disabled={!canRedo} title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir"><Redo2 size={17} /></button>
          <DownloadMenu getData={current} notify={notify} />
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || !state.lanes.length}>{busy ? 'Enregistrement…' : submitLabel}</button>
        </div>
      </header>
      <div ref={body} className={`gel-wb-body${showDetails ? '' : ' no-details'}`} style={{ '--gel-details-w': `${panel.width}px` }}>
        <aside className="gel-wb-side" aria-label="Réglages">
          <p className="gel-mode-hint">{MODES[state.mode].hint}</p>
          {MODULES.map((m) => (
            <ModuleCard key={m.key} title={m.title} icon={m.icon} summary={m.summary(ctx)} done={m.done(ctx)} open={openKey === m.key} onToggle={() => toggleModule(m.key)}>
              <m.Component ctx={ctx} />
            </ModuleCard>
          ))}
          {results.warnings.length > 0 && (
            <ul className="gel-warnings" aria-label="Avertissements">
              {results.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </aside>
        <main className="gel-wb-main">
          <div className="gel-main-bar">
            <Segmented label="Vue" value={showFigure ? 'figure' : 'gel'} onChange={(v) => { setTool('select'); setView(v); }} options={[['gel', 'Gel'], ['figure', 'Figure']]} />
            <div className="gel-main-msg">
              {hint && <span className="gel-tool-hint">{hint} <button type="button" className="link-btn" onClick={() => setTool('select')}>Terminer</button></span>}
              {notice && !hint && (
                <span className="gel-notice" role="status">
                  <span>{notice}</span>
                  <button type="button" className="icon-btn" onClick={() => setNotice(null)} aria-label="Fermer le message"><X size={13} /></button>
                </span>
              )}
            </div>
            {!panel.open && !showFigure && (
              <button type="button" className="btn btn-ghost btn-small gel-panel-open" onClick={() => setPanel({ open: true })} title="Afficher l’analyse (profils, étalonnage, tableau)">
                <PanelRightOpen size={15} /> Analyse
              </button>
            )}
          </div>
          <div className="gel-stage">
            {showFigure
              ? <FigurePreview state={state} img={img} profiles={profiles} results={results} />
              : (
                <GelCanvas
                  img={viewImg}
                  base={base}
                  state={state}
                  profiles={profiles}
                  results={results}
                  polarity={polarity}
                  tool={tool}
                  overlay={overlay}
                  onOverlay={setOverlay}
                  activeLaneId={activeLaneId}
                  onSelectLane={setActiveLaneId}
                  hoverPos={hoverPos}
                  onHover={setHoverPos}
                  showRegion={openKey === 'lanes'}
                  showGrid={(openKey === 'image' || a.anglePreview !== null) && tool !== 'crop'}
                  cropRect={state.prep.crop}
                  previewRotation={a.anglePreview === null ? 0 : a.anglePreview - (state.prep.angle ?? 0)}
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
          </div>
        </main>
        {showDetails && (
          <aside className="gel-wb-details" aria-label="Analyse">
            <AnalysisPanel
              state={state}
              update={update}
              commit={commit}
              profiles={profiles}
              results={results}
              activeLaneId={activeLaneId}
              setActiveLaneId={setActiveLaneId}
              hoverPos={hoverPos}
              onHover={setHoverPos}
              onPick={onPick}
              pickable={tool === 'band' || tool === 'calib'}
              onRenameBand={onRenameBand}
              extra={<button type="button" className="icon-btn gel-panel-close" onClick={() => setPanel({ open: false })} title="Masquer l’analyse" aria-label="Masquer l’analyse"><PanelRightClose size={16} /></button>}
            />
          </aside>
        )}
        {showDetails && <div className="gel-resize" onPointerDown={onResizeStart} role="separator" aria-orientation="vertical" aria-label="Largeur du panneau d’analyse" title="Glisser pour élargir le panneau d’analyse" />}
      </div>
      {laddersOpen && (
        <Modal title="Marqueurs de taille" onClose={() => setLaddersOpen(false)} wide>
          <LaddersPanel ladders={ladders} />
        </Modal>
      )}
    </div>
  );
}
