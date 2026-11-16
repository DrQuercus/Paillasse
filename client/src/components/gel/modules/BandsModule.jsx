import { Hand } from 'lucide-react';
import { Range, Segmented } from '../controls.jsx';

export function bandsSummary(ctx) {
  const { state, results } = ctx;
  const n = results?.lanes.reduce((t, l) => t + l.bands.length, 0) ?? 0;
  const edited = Object.values(state.edits ?? {}).some((e) => e?.added?.length || e?.removed?.length || e?.bounds?.length);
  return [`${n} bande${n > 1 ? 's' : ''}`, `sensibilité ${Math.round(state.detection.sensitivity * 100)} %`, edited ? 'corrigées à la main' : null].filter(Boolean).join(' · ');
}

/** Détection des bandes : sensibilité, fond, corrections à la main. */
export default function BandsModule({ ctx }) {
  const { state, update, tool, setTool, activeLaneId, profiles } = ctx;
  const d = state.detection;
  const setDet = (patch, opts) => update((s) => ({ ...s, detection: { ...s.detection, ...patch } }), opts);
  const activeEdits = state.edits?.[activeLaneId];
  const hasEdits = activeEdits && (activeEdits.added?.length || activeEdits.removed?.length || activeEdits.bounds?.length);
  return (
    <>
      <Range label="Sensibilité" value={d.sensitivity} min={0.05} max={0.98} step={0.01} format={(v) => `${Math.round(v * 100)} %`} onChange={(sensitivity) => setDet({ sensitivity }, { key: 'sens' })} hint="Plus haut : bandes faibles détectées, mais aussi du bruit." />
      <Segmented label="Fond" value={d.background} onChange={(background) => setDet({ background })} options={[['rollingball', 'Rolling ball'], ['valley', 'Vallée à vallée'], ['min', 'Minimum']]} />
      {d.background === 'rollingball' && (
        <Range label="Rayon" value={d.radius ?? profiles?.scales.radius ?? 30} min={4} max={Math.max(40, Math.round((profiles?.length ?? 400) / 3))} format={(v) => `${v} px`} onChange={(radius) => setDet({ radius }, { key: 'radius' })} hint="Plus grand que la largeur des bandes." />
      )}
      <div className="gel-btn-row">
        <button type="button" className={`btn btn-small${tool === 'band' ? ' is-on' : ''}`} onClick={() => setTool(tool === 'band' ? 'select' : 'band')}>
          <Hand size={15} /> {tool === 'band' ? 'Cliquez sur une bande…' : 'Corriger à la main'}
        </button>
        {hasEdits ? (
          <button type="button" className="link-btn small" onClick={() => update((s) => { const e = { ...s.edits }; delete e[activeLaneId]; return { ...s, edits: e }; })}>
            Annuler les corrections de la piste
          </button>
        ) : null}
      </div>
      <small className="hint">Corriger : cliquez une bande pour la retirer, à côté pour en ajouter une (sur le gel ou le profil). Bornes d’intégration : cliquez la bande sur le profil, à droite.</small>
    </>
  );
}
