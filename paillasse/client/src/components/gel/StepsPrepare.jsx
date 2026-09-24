import { Crop, FlipHorizontal2, FlipVertical2, Plus, RotateCcw, RotateCw, ScanSearch, Trash2, Waves } from 'lucide-react';
import { detectLanes } from '../../lib/gel/raster.js';
import { LANE_COLORS } from '../../lib/gel/figure.js';
import { ROLES, guessLadder, laneName, newId, shiftGeometry } from '../../lib/gel/model.js';
import { Check, Range, Section, Segmented } from './controls.jsx';

const pct = (v) => `${Math.round(v * 100)} %`;

/** Quart de tour ou miroir : la géométrie change, les pistes et réglages dessinés sont effacés. */
const clearGeometry = (state) => ({
  ...state, lanes: [], region: null, warp: [], edits: {}, annotations: [],
  calibration: { ...state.calibration, laneId: null, points: [] },
});

/** Quarts de tour et miroirs. */
export function OrientationButtons({ ctx }) {
  const { state, update, notify } = ctx;
  const p = state.prep;
  const reorient = (patch) => {
    update((s) => ({ ...clearGeometry(s), prep: { ...s.prep, ...patch, crop: null } }));
    if (state.lanes.length) notify('Pistes effacées : l’orientation a changé (Ctrl+Z pour revenir).');
  };
  return (
    <div className="gel-btn-row">
      <button type="button" className="btn btn-small" onClick={() => reorient({ rotate90: ((p.rotate90 ?? 0) + 270) % 360 })} title="Quart de tour à gauche" aria-label="Quart de tour à gauche"><RotateCcw size={15} /></button>
      <button type="button" className="btn btn-small" onClick={() => reorient({ rotate90: ((p.rotate90 ?? 0) + 90) % 360 })} title="Quart de tour à droite" aria-label="Quart de tour à droite"><RotateCw size={15} /></button>
      <button type="button" className="btn btn-small" onClick={() => reorient({ flipH: !p.flipH })} title="Miroir horizontal" aria-label="Miroir horizontal"><FlipHorizontal2 size={15} /></button>
      <button type="button" className="btn btn-small" onClick={() => reorient({ flipV: !p.flipV })} title="Miroir vertical" aria-label="Miroir vertical"><FlipVertical2 size={15} /></button>
    </div>
  );
}

/** Redressement fin : aperçu immédiat, calcul au relâchement. */
export function AngleRange({ ctx, hint }) {
  return (
    <Range
      label="Redresser"
      value={ctx.angle}
      min={-10}
      max={10}
      step={0.1}
      format={(v) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`}
      onChange={ctx.previewAngle}
      onCommit={() => ctx.commitAngle(ctx.angle)}
      hint={hint}
    />
  );
}

/** Rognage de l'image. */
export function CropButtons({ ctx }) {
  const { state, update, tool, setTool } = ctx;
  return (
    <div className="gel-btn-row">
      <button type="button" className={`btn btn-small${tool === 'crop' ? ' is-on' : ''}`} onClick={() => setTool(tool === 'crop' ? 'select' : 'crop')}>
        <Crop size={15} /> {tool === 'crop' ? 'Tracez le cadre sur l’image…' : 'Rogner'}
      </button>
      {state.prep.crop && (
        <button
          type="button"
          className="btn btn-small btn-ghost"
          onClick={() => update((s) => ({ ...shiftGeometry(s, s.prep.crop.x, s.prep.crop.y), prep: { ...s.prep, crop: null } }))}
        >
          Retirer le rognage
        </button>
      )}
    </div>
  );
}

/** Bandes sombres ou claires (détecté automatiquement). */
export function PolarityControl({ ctx }) {
  const { state, update, detectedPolarity } = ctx;
  return (
    <Segmented
      label="Aspect des bandes"
      value={state.polarity}
      onChange={(polarity) => update((s) => ({ ...s, polarity }))}
      options={[['auto', `Auto (${detectedPolarity === 'dark' ? 'sombres' : 'claires'})`], ['dark', 'Sombres'], ['light', 'Claires']]}
    />
  );
}

/** Contraste d'affichage (sans effet sur les mesures). */
export function DisplayControls({ ctx }) {
  const { state, update } = ctx;
  const display = state.display ?? {};
  const setDisplay = (patch, opts) => update((s) => ({ ...s, display: { ...s.display, ...patch } }), opts);
  return (
    <>
      <Range label="Noir" value={display.low ?? 0} min={0} max={0.9} step={0.01} format={pct} onChange={(low) => setDisplay({ low: Math.min(low, (display.high ?? 1) - 0.05) }, { key: 'low' })} />
      <Range label="Blanc" value={display.high ?? 1} min={0.1} max={1} step={0.01} format={pct} onChange={(high) => setDisplay({ high: Math.max(high, (display.low ?? 0) + 0.05) }, { key: 'high' })} />
      <Range label="Gamma" value={display.gamma ?? 1} min={0.3} max={2.5} step={0.05} format={(v) => v.toLocaleString('fr-FR')} onChange={(gamma) => setDisplay({ gamma }, { key: 'gamma' })} />
      <div className="gel-btn-row">
        <Segmented label="Palette" value={display.colormap ?? 'gray'} onChange={(colormap) => setDisplay({ colormap })} options={[['gray', 'Gris'], ['fire', 'Feu']]} />
        <Check checked={display.invert} onChange={(invert) => setDisplay({ invert })}>Inverser</Check>
      </div>
      <button type="button" className="btn btn-small btn-ghost" onClick={() => setDisplay({ low: 0, high: 1, gamma: 1, invert: false, colormap: 'gray' })}>Réinitialiser l’affichage</button>
    </>
  );
}

export function StepImage({ ctx }) {
  const { state, update, commit, info, tool, uncropped } = ctx;
  const setDisplay = (patch, opts) => update((s) => ({ ...s, display: { ...s.display, ...patch } }), opts);

  return (
    <>
      <Section title="Fichier">
        <dl className="gel-facts">
          <dt>Image</dt><dd title={info.filename}>{info.filename || 'sans nom'}</dd>
          <dt>Format</dt><dd>{info.format}{info.bits ? `, ${info.bits} bits` : ''}</dd>
          <dt>Taille</dt><dd>{info.width} × {info.height} px</dd>
        </dl>
        {info.lossy && <p className="gel-note is-warn">JPEG : compression avec pertes. Pour quantifier, exportez un TIFF depuis l’imageur.</p>}
        {!info.lossy && info.bits === 8 && <p className="gel-note">8 bits : 256 niveaux. Le TIFF 16 bits de l’imageur donne une quantification plus fine.</p>}
      </Section>

      <Section title="Aspect des bandes">
        <PolarityControl ctx={ctx} />
        <p className="hint">Sombres sur fond clair : Coomassie, argent. Claires sur fond sombre : fluorescence, chimiluminescence, BET ou SYBR sous UV.</p>
      </Section>

      <Section title="Orientation et cadrage">
        <OrientationButtons ctx={ctx} />
        <AngleRange ctx={ctx} hint="Alignez les puits sur les lignes bleues : les pistes deviennent verticales. Positif = sens horaire." />
        <CropButtons ctx={ctx} />
        {tool === 'crop' && <p className="hint">Image entière affichée : {uncropped.width} × {uncropped.height} px. Les pistes déjà placées suivent le cadre.</p>}
      </Section>

      <Section title="Affichage" aside={<span className="gel-badge">sans effet sur les mesures</span>}>
        <DisplayControls ctx={ctx} />
        <p className="hint">Contraste, palette et inversion servent à bien voir les bandes : les aires sont toujours calculées sur les intensités brutes.</p>
      </Section>

      <Section title="Mesure" open={false}>
        <Segmented
          label="Signal mesuré"
          value={state.signal}
          onChange={(signal) => { update((s) => ({ ...s, signal })); commit(); }}
          options={[['linear', 'Intensité'], ['od', 'Densité optique']]}
        />
        <p className="hint">Densité optique (log) : pour un gel coloré au Coomassie numérisé en transmission. Sinon, gardez l’intensité.</p>
      </Section>
    </>
  );
}

/**
 * Détecte les pistes et repère le marqueur (piste du bord avec nettement plus de bandes ;
 * à défaut la première, sauf en western). Renvoie le nombre de pistes trouvées.
 */
export function detectLanesInto(ctx, { quiet = false } = {}) {
  const { state, update, img, detectedPolarity, setActiveLaneId, notify } = ctx;
  const region = state.region ?? { top: 0, bottom: img.height - 1 };
  const polarity = state.polarity === 'auto' ? detectedPolarity : state.polarity;
  const found = detectLanes(img, { ...region, polarity });
  if (found.lanes.length < 1) {
    notify('Aucune piste trouvée : placez-les à la main (outil « Ajouter »).', 'error');
    return 0;
  }
  const guessed = guessLadder(img, state, found.lanes.map((x, i) => ({ id: `g${i}`, xTop: x, xBot: x, role: 'sample' })), found.width, ctx.cache);
  const ladderIndex = guessed ?? (state.mode === 'western' ? null : 0);
  let n = 0;
  const lanes = found.lanes.map((x, i) => (i === ladderIndex
    ? { id: newId(), name: 'M', xTop: x, xBot: x, role: 'ladder' }
    : { id: newId(), name: String(n += 1), xTop: x, xBot: x, role: 'sample' }));
  const ladder = lanes[ladderIndex] ?? null;
  update((s) => ({ ...s, lanes, laneWidth: found.width, edits: {}, calibration: { ...s.calibration, laneId: ladder?.id ?? null, points: [] } }));
  setActiveLaneId(lanes.find((l) => l.role !== 'ladder')?.id ?? lanes[0].id);
  if (!quiet) {
    const which = ladderIndex === 0 ? 'La première' : 'La dernière';
    notify(`${lanes.length} piste${lanes.length > 1 ? 's' : ''} trouvée${lanes.length > 1 ? 's' : ''}. ${ladder
      ? `${which} ${guessed !== null ? 'ressemble au' : 'est supposée être le'} marqueur : changez son rôle si besoin.`
      : 'Pas de marqueur repéré : donnez le rôle « Marqueur » à une piste s’il y en a un.'}`, 'success');
  }
  return lanes.length;
}

/** Boutons « Détecter les pistes » et « Ajouter ». */
export function LaneButtons({ ctx }) {
  const { tool, setTool } = ctx;
  return (
    <div className="gel-btn-row">
      <button type="button" className="btn btn-primary btn-small" onClick={() => ctx.settle((c) => detectLanesInto(c))}><ScanSearch size={15} /> Détecter les pistes</button>
      <button type="button" className={`btn btn-small${tool === 'addLane' ? ' is-on' : ''}`} onClick={() => setTool(tool === 'addLane' ? 'select' : 'addLane')}>
        <Plus size={15} /> {tool === 'addLane' ? 'Cliquez sur le gel…' : 'Ajouter'}
      </button>
    </div>
  );
}

/** Largeur commune des pistes. */
export function LaneWidthRange({ ctx, hint }) {
  const { state, update, img, profiles } = ctx;
  const width = state.laneWidth ?? profiles?.width ?? 20;
  return (
    <Range
      label="Largeur des pistes"
      value={width}
      min={3}
      max={Math.max(20, Math.round(img.width / 4))}
      format={(v) => `${v} px`}
      onChange={(laneWidth) => update((s) => ({ ...s, laneWidth }), { key: 'laneWidth' })}
      hint={hint}
    />
  );
}

/** Liste des pistes : nom, rôle, suppression. */
export function LaneList({ ctx }) {
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
  if (!state.lanes.length) return <p className="gel-empty">Aucune piste. « Détecter les pistes » les place pour vous.</p>;
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

export function StepLanes({ ctx }) {
  const { state, update, img, tool, setTool, activeWarpId, setActiveWarpId } = ctx;
  const region = state.region ?? { top: 0, bottom: img.height - 1 };
  const newCurve = () => {
    const id = newId();
    update((s) => ({ ...s, warp: [...s.warp, { id, points: [] }] }));
    setActiveWarpId(id);
    setTool('warp');
  };

  return (
    <>
      <Section title="Pistes">
        <LaneButtons ctx={ctx} />
        <LaneWidthRange ctx={ctx} hint="Un peu moins large que les bandes, pour éviter les bords du puits." />
        <LaneList ctx={ctx} />
        <p className="hint">Glissez une piste pour la déplacer, ses poignées rondes pour l’incliner.</p>
      </Section>

      <Section title="Zone de migration">
        <div className="gel-inline">
          <label>Haut <input type="number" value={region.top} min={0} max={region.bottom - 10} onChange={(e) => update((s) => ({ ...s, region: { ...region, top: Math.max(0, Math.min(region.bottom - 10, Number(e.target.value))) } }), { key: 'regionTop' })} /></label>
          <label>Bas <input type="number" value={region.bottom} min={region.top + 10} max={img.height - 1} onChange={(e) => update((s) => ({ ...s, region: { ...region, bottom: Math.min(img.height - 1, Math.max(region.top + 10, Number(e.target.value))) } }), { key: 'regionBottom' })} /></label>
        </div>
        <p className="hint">Du bas des puits au front de migration : glissez les lignes vertes.</p>
      </Section>

      <Section title="Courbure (effet « sourire »)" open={state.warp.length > 0}>
        <p className="hint">Si une même bande est plus haute au bord qu’au centre, tracez au moins deux courbes le long de bandes qui traversent le gel (bandes du marqueur prolongées, bande commune). Les profils sont redressés entre ces courbes.</p>
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
        {tool === 'warp' && <p className="gel-note">Cliquez sur la même bande dans plusieurs pistes, de gauche à droite.</p>}
        <p className={`gel-note${state.warp.filter((c) => c.points.length >= 2).length >= 2 ? ' is-ok' : ''}`}>
          {state.warp.filter((c) => c.points.length >= 2).length >= 2 ? 'Correction de courbure active.' : 'Correction inactive : il faut deux courbes d’au moins deux points.'}
        </p>
      </Section>
    </>
  );
}
