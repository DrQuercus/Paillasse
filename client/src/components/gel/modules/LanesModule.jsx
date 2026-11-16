import { Plus, ScanSearch, Trash2, Waves } from 'lucide-react';
import { detectLanes } from '../../../lib/gel/raster.js';
import { LANE_COLORS } from '../../../lib/gel/figure.js';
import { ROLES, guessLadder, laneName, newId, rotateGeometry } from '../../../lib/gel/model.js';
import { Group, More, Range } from '../controls.jsx';

/**
 * Détecte les pistes et repère le marqueur (piste du bord avec nettement plus de bandes ; à défaut la
 * première, sauf en western). Renvoie le nombre de pistes trouvées.
 * keep : pistes à recaler (après un redressement) ; si le nombre concorde, noms et rôles sont gardés
 * (sinon, avec sameOnly, rien ne change et la fonction renvoie 0).
 * amend : complète la dernière étape de l'historique (un seul Ctrl+Z annule l'action et ce recalage).
 */
export function detectLanesInto(ctx, { quiet = false, keep = null, sameOnly = false, amend = false } = {}) {
  const { state, update, img, detectedPolarity, setActiveLaneId, notify, say } = ctx;
  const region = state.region ?? { top: 0, bottom: img.height - 1 };
  const polarity = state.polarity === 'auto' ? detectedPolarity : state.polarity;
  const found = detectLanes(img, { ...region, polarity });
  if (found.lanes.length < 1) {
    if (!quiet) notify('Aucune piste trouvée : placez-les à la main (« Ajouter »).', 'error');
    return 0;
  }
  if (sameOnly && keep?.length !== found.lanes.length) return 0;
  let lanes;
  let ladder;
  let ladderIndex = null;
  if (keep?.length === found.lanes.length) {
    lanes = found.lanes.map((x, i) => ({ ...keep[i], xTop: x, xBot: x }));
    ladder = lanes.find((l) => l.role === 'ladder') ?? null;
  } else {
    const guessed = guessLadder(img, state, found.lanes.map((x, i) => ({ id: `g${i}`, xTop: x, xBot: x, role: 'sample' })), found.width, ctx.cache);
    ladderIndex = guessed ?? (state.mode === 'western' ? null : 0);
    let n = 0;
    lanes = found.lanes.map((x, i) => (i === ladderIndex
      ? { id: newId(), name: 'M', xTop: x, xBot: x, role: 'ladder' }
      : { id: newId(), name: String(n += 1), xTop: x, xBot: x, role: 'sample' }));
    ladder = lanes[ladderIndex] ?? null;
  }
  update((s) => ({ ...s, lanes, laneWidth: found.width, edits: {}, calibration: { ...s.calibration, laneId: ladder?.id ?? null, points: [] } }), { amend });
  if (!keep || !lanes.some((l) => l.id === ctx.activeLaneId)) setActiveLaneId(lanes.find((l) => l.role !== 'ladder')?.id ?? lanes[0].id);
  // Marqueur déjà choisi : ses bandes seront réattribuées dès que les nouvelles pistes seront lues
  if (ladder && state.calibration.ladder) ctx.requestAssign?.();
  if (!quiet) {
    const which = ladderIndex === 0 ? 'la première' : ladderIndex === null ? 'celle déjà choisie' : 'la dernière';
    say(`${lanes.length} piste${lanes.length > 1 ? 's' : ''} trouvée${lanes.length > 1 ? 's' : ''}${ladder
      ? ` ; marqueur : ${which} (changez son rôle si besoin).`
      : ' ; pas de marqueur repéré.'}`);
  }
  return lanes.length;
}

/** Pistes et courbes tournées avec l'image (redressement de « from » à « to » degrés), dans la même étape. */
export function rotateLanesInto(ctx, from, to) {
  const { state, update, img, uncropped } = ctx;
  update((s) => rotateGeometry(s, uncropped, from, to, img), { amend: true });
  if (state.calibration.laneId && state.calibration.ladder) ctx.requestAssign?.();
}

export function lanesSummary(ctx) {
  const { state } = ctx;
  if (!state.lanes.length) return 'Aucune piste';
  const ladder = state.lanes.find((l) => l.role === 'ladder');
  const n = state.lanes.length;
  return [
    `${n} piste${n > 1 ? 's' : ''}`,
    ladder ? `marqueur ${laneName(ladder, state.lanes.indexOf(ladder))}` : 'sans marqueur',
    state.warp.filter((c) => c.points.length >= 2).length >= 2 ? 'courbure corrigée' : null,
  ].filter(Boolean).join(' · ');
}

/** Liste des pistes : nom, rôle, suppression. */
function LaneList({ ctx }) {
  const { state, update, activeLaneId, setActiveLaneId } = ctx;
  const setLane = (id, patch) => update((s) => ({ ...s, lanes: s.lanes.map((l) => (l.id === id ? { ...l, ...patch } : l)) }), { key: `lane-${id}-${Object.keys(patch).join()}` });
  const setRole = (id, role) => update((s) => ({
    ...s,
    lanes: s.lanes.map((l) => (l.id === id ? { ...l, role } : role === 'ladder' && l.role === 'ladder' ? { ...l, role: 'sample' } : l)),
    calibration: role === 'ladder' ? { ...s.calibration, laneId: id, points: [] } : s.calibration.laneId === id ? { ...s.calibration, laneId: null, points: [] } : s.calibration,
  }));
  const remove = (id) => update((s) => ({
    ...s,
    lanes: s.lanes.filter((l) => l.id !== id),
    calibration: s.calibration.laneId === id ? { ...s.calibration, laneId: null, points: [] } : s.calibration,
  }));
  if (!state.lanes.length) return <p className="gel-empty">Aucune piste : « Détecter » les place pour vous.</p>;
  return (
    <ul className="gel-lanes">
      {state.lanes.map((l, i) => (
        <li key={l.id} className={l.id === activeLaneId ? 'is-active' : ''} onClick={() => setActiveLaneId(l.id)}>
          <span className="gel-dot" style={{ background: LANE_COLORS[i % LANE_COLORS.length] }} />
          <input aria-label={`Nom de la piste ${i + 1}`} value={l.name} placeholder={String(i + 1)} onChange={(e) => setLane(l.id, { name: e.target.value })} />
          <select aria-label={`Rôle de la piste ${laneName(l, i)}`} value={l.role} onChange={(e) => setRole(l.id, e.target.value)}>
            {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="button" className="icon-btn" onClick={(e) => { e.stopPropagation(); remove(l.id); }} aria-label={`Retirer la piste ${laneName(l, i)}`}><Trash2 size={14} /></button>
        </li>
      ))}
    </ul>
  );
}

export default function LanesModule({ ctx }) {
  const { state, update, img, profiles, tool, setTool, activeWarpId, setActiveWarpId } = ctx;
  const region = state.region ?? { top: 0, bottom: img.height - 1 };
  const width = state.laneWidth ?? profiles?.width ?? 20;
  const newCurve = () => {
    const id = newId();
    update((s) => ({ ...s, warp: [...s.warp, { id, points: [] }] }));
    setActiveWarpId(id);
    setTool('warp');
  };
  const activeCurves = state.warp.filter((c) => c.points.length >= 2).length;
  const setRegion = (patch) => update((s) => ({ ...s, region: { ...region, ...patch } }), { key: `region-${Object.keys(patch)[0]}` });

  return (
    <>
      <div className="gel-btn-row">
        <button type="button" className="btn btn-small" onClick={() => ctx.settle((c) => detectLanesInto(c))}><ScanSearch size={15} /> Détecter</button>
        <button type="button" className={`btn btn-small${tool === 'addLane' ? ' is-on' : ''}`} onClick={() => setTool(tool === 'addLane' ? 'select' : 'addLane')}>
          <Plus size={15} /> {tool === 'addLane' ? 'Cliquez sur le gel…' : 'Ajouter'}
        </button>
      </div>
      <Range
        label="Largeur des pistes"
        value={width}
        min={3}
        max={Math.max(20, Math.round(img.width / 4))}
        format={(v) => `${v} px`}
        onChange={(laneWidth) => update((s) => ({ ...s, laneWidth }), { key: 'laneWidth' })}
      />
      <LaneList ctx={ctx} />
      <small className="hint">Glissez une piste sur le gel pour la déplacer, ses poignées rondes pour l’incliner.</small>

      <More title="Zone de migration" aside={state.region ? <span className="gel-badge">réglée</span> : null}>
        <div className="gel-inline">
          <label>Haut <input type="number" value={region.top} min={0} max={region.bottom - 10} onChange={(e) => setRegion({ top: Math.max(0, Math.min(region.bottom - 10, Number(e.target.value))) })} /></label>
          <label>Bas <input type="number" value={region.bottom} min={region.top + 10} max={img.height - 1} onChange={(e) => setRegion({ bottom: Math.min(img.height - 1, Math.max(region.top + 10, Number(e.target.value))) })} /></label>
        </div>
        <small className="hint">Du bas des puits au front de migration : glissez aussi les deux lignes horizontales sur le gel.</small>
      </More>

      <More title="Courbure (effet « sourire »)" open={state.warp.length > 0} aside={activeCurves >= 2 ? <span className="gel-badge">active</span> : null}>
        <small className="hint">Une même bande plus haute au bord qu’au centre ? Tracez au moins deux courbes le long de bandes qui traversent le gel : les profils sont redressés entre elles.</small>
        <button type="button" className="btn btn-small" onClick={newCurve}><Waves size={15} /> Nouvelle courbe</button>
        {state.warp.length > 0 && (
          <ul className="gel-curves">
            {state.warp.map((c, i) => (
              <li key={c.id} className={c.id === activeWarpId ? 'is-active' : ''}>
                <span>Courbe {i + 1} · {c.points.length} point{c.points.length > 1 ? 's' : ''}</span>
                {c.id === activeWarpId && tool === 'warp'
                  ? <button type="button" className="btn btn-small" onClick={() => { setTool('select'); setActiveWarpId(null); }}>Terminer</button>
                  : <button type="button" className="btn btn-small btn-ghost" onClick={() => { setActiveWarpId(c.id); setTool('warp'); }}>Compléter</button>}
                <button type="button" className="icon-btn" onClick={() => update((s) => ({ ...s, warp: s.warp.filter((x) => x.id !== c.id) }))} aria-label={`Supprimer la courbe ${i + 1}`}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
        {state.warp.length > 0 && activeCurves < 2 && <small className="hint">Correction inactive : il faut deux courbes d’au moins deux points.</small>}
      </More>
    </>
  );
}
