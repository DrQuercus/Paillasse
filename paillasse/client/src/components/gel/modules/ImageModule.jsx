import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import { shiftGeometry } from '../../../lib/gel/model.js';
import { Check, Group, More, Range, Segmented } from '../controls.jsx';
import { detectLanesInto } from './LanesModule.jsx';

const pct = (v) => `${Math.round(v * 100)} %`;
const deg = (v) => `${v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}°`;

/** Quart de tour ou miroir : la géométrie change, les pistes et réglages dessinés sont refaits. */
const clearGeometry = (state) => ({
  ...state, lanes: [], region: null, warp: [], edits: {}, annotations: [],
  calibration: { ...state.calibration, laneId: null, points: [] },
});

/** « TIFF 16 bits, LZW », « PNG 8 bits » : le format TIFF donne déjà sa profondeur. */
const formatText = (info) => (/bits/.test(info.format) || !info.bits ? info.format : `${info.format} ${info.bits} bits`);

/** Résumé d'une ligne : format, aspect des bandes, redressement, rognage. */
export function imageSummary(ctx) {
  const { info, state, detectedPolarity } = ctx;
  const pol = state.polarity === 'auto' ? detectedPolarity : state.polarity;
  const angle = state.prep.angle ?? 0;
  return [
    formatText(info),
    pol === 'dark' ? 'bandes sombres' : 'bandes claires',
    angle ? `redressé ${deg(angle)}` : null,
    state.prep.crop ? 'rogné' : null,
  ].filter(Boolean).join(' · ');
}

export default function ImageModule({ ctx }) {
  const { state, update, commit, info, tool, setTool, uncropped, detectedPolarity, say } = ctx;
  const p = state.prep;
  const display = state.display ?? {};
  const setDisplay = (patch, opts) => update((s) => ({ ...s, display: { ...s.display, ...patch } }), opts);
  // Quart de tour, miroir : les pistes sont redétectées sur la nouvelle image (Ctrl+Z pour revenir)
  const reorient = (patch) => {
    const had = state.lanes.length > 0;
    update((s) => ({ ...clearGeometry(s), prep: { ...s.prep, ...patch, crop: null } }));
    if (had) ctx.afterImage((c) => { if (detectLanesInto(c, { quiet: true, amend: true })) say('Pistes redétectées sur l’image tournée (Ctrl+Z pour revenir).'); });
  };
  const turn = (by) => reorient({ rotate90: ((p.rotate90 ?? 0) + by + 360) % 360 });

  return (
    <>
      <Group title="Aspect des bandes">
        <Segmented
          label="Aspect des bandes"
          value={state.polarity}
          onChange={(polarity) => update((s) => ({ ...s, polarity }))}
          options={[['auto', 'Auto'], ['dark', 'Sombres'], ['light', 'Claires']]}
        />
        <small className="hint">
          {state.polarity === 'auto' && <>Détecté : bandes {detectedPolarity === 'dark' ? 'sombres' : 'claires'}. </>}
          Sombres : Coomassie, argent. Claires : fluorescence, chimiluminescence, BET ou SYBR sous UV.
        </small>
      </Group>

      <Group title="Orientation et cadrage">
        <div className="gel-btn-row">
          <button type="button" className="btn btn-small" onClick={() => turn(270)} title="Quart de tour à gauche" aria-label="Quart de tour à gauche"><RotateCcw size={15} /></button>
          <button type="button" className="btn btn-small" onClick={() => turn(90)} title="Quart de tour à droite" aria-label="Quart de tour à droite"><RotateCw size={15} /></button>
          <button type="button" className="btn btn-small" onClick={() => reorient({ flipH: !p.flipH })} title="Miroir horizontal" aria-label="Miroir horizontal"><FlipHorizontal2 size={15} /></button>
          <button type="button" className="btn btn-small" onClick={() => reorient({ flipV: !p.flipV })} title="Miroir vertical" aria-label="Miroir vertical"><FlipVertical2 size={15} /></button>
          <button type="button" className={`btn btn-small${tool === 'crop' ? ' is-on' : ''}`} onClick={() => setTool(tool === 'crop' ? 'select' : 'crop')}>
            <Crop size={15} /> {tool === 'crop' ? 'Tracez le cadre…' : 'Rogner'}
          </button>
          {p.crop && (
            <button type="button" className="link-btn small" onClick={() => update((s) => ({ ...shiftGeometry(s, s.prep.crop.x, s.prep.crop.y), prep: { ...s.prep, crop: null } }))}>
              Retirer le rognage
            </button>
          )}
        </div>
        {tool === 'crop' && <small className="hint">Image entière affichée ({uncropped.width} × {uncropped.height} px) ; les pistes suivent le cadre.</small>}
        <Range
          label="Redresser"
          value={ctx.angle}
          min={-10}
          max={10}
          step={0.1}
          format={deg}
          onChange={ctx.previewAngle}
          onCommit={() => ctx.commitAngle(ctx.angle)}
          hint="Alignez les puits sur les lignes du quadrillage. Positif = sens horaire."
        />
      </Group>

      <More title="Contraste et palette" aside={<span className="gel-badge">affichage seulement</span>}>
        <Range label="Noir" value={display.low ?? 0} min={0} max={0.9} step={0.01} format={pct} onChange={(low) => setDisplay({ low: Math.min(low, (display.high ?? 1) - 0.05) }, { key: 'low' })} />
        <Range label="Blanc" value={display.high ?? 1} min={0.1} max={1} step={0.01} format={pct} onChange={(high) => setDisplay({ high: Math.max(high, (display.low ?? 0) + 0.05) }, { key: 'high' })} />
        <Range label="Gamma" value={display.gamma ?? 1} min={0.3} max={2.5} step={0.05} format={(v) => v.toLocaleString('fr-FR')} onChange={(gamma) => setDisplay({ gamma }, { key: 'gamma' })} />
        <div className="gel-btn-row">
          <Segmented label="Palette" value={display.colormap ?? 'gray'} onChange={(colormap) => setDisplay({ colormap })} options={[['gray', 'Gris'], ['fire', 'Feu']]} />
          <Check checked={display.invert} onChange={(invert) => setDisplay({ invert })}>Inverser</Check>
        </div>
        <button type="button" className="link-btn small" onClick={() => setDisplay({ low: 0, high: 1, gamma: 1, invert: false, colormap: 'gray' })}>Réinitialiser l’affichage</button>
        <small className="hint">Les aires sont toujours calculées sur les intensités brutes de l’image.</small>
      </More>

      <More title="Signal mesuré">
        <Segmented
          label="Signal mesuré"
          value={state.signal}
          onChange={(signal) => { update((s) => ({ ...s, signal })); commit(); }}
          options={[['linear', 'Intensité'], ['od', 'Densité optique']]}
        />
        <small className="hint">Densité optique (log) : gel coloré au Coomassie numérisé en transmission. Sinon, gardez l’intensité.</small>
      </More>

      <p className="gel-file" title={info.filename}>
        {info.filename || 'image sans nom'} · {formatText(info)} · {info.width} × {info.height} px
      </p>
      {info.lossy && <p className="gel-note is-warn">JPEG : compression avec pertes. Pour quantifier, exportez un TIFF depuis l’imageur.</p>}
      {!info.lossy && info.bits === 8 && <small className="hint">8 bits : 256 niveaux. Le TIFF 16 bits de l’imageur donne une quantification plus fine.</small>}
    </>
  );
}
