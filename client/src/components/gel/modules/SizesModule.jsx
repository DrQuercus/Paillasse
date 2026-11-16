import { Crosshair, Trash2, Wand2 } from 'lucide-react';
import { formatNumber } from '../../../lib/calc/units.js';
import { FIT_METHODS, formatSize } from '../../../lib/gel/calibration.js';
import { rememberLadder } from '../../../lib/gel/draft.js';
import { MODES, laneName, suggestCalibration } from '../../../lib/gel/model.js';
import { Group, More, Segmented } from '../controls.jsx';
import { ladderSnapshot } from '../useLadders.js';

const SHORT_METHODS = { interp: 'Interpolation', linear: 'Linéaire', quadratic: 'Polynôme' };

export function sizesSummary(ctx) {
  const { state, results } = ctx;
  const cal = state.calibration;
  if (results?.calibration) {
    const c = results.calibration;
    return `${cal.ladder?.name ?? 'Marqueur'} · ${c.points.length} bandes${c.method !== 'interp' ? ` · R² ${formatNumber(c.r2, 3)}` : ''}`;
  }
  if (!cal.laneId) return 'Pas de piste de marqueur';
  if (!cal.ladder) return 'Choisissez le marqueur';
  return 'Bandes du marqueur à attribuer';
}

export default function SizesModule({ ctx }) {
  const { state, update, results, ladders, openLadders, tool, setTool, calibSize, setCalibSize } = ctx;
  const mode = MODES[state.mode];
  const cal = state.calibration;
  const available = (ladders ?? []).filter((l) => l.kind === mode.ladderKind && !l.archived);
  const setCal = (patch) => update((s) => ({ ...s, calibration: { ...s.calibration, ...patch } }));
  const chooseLadder = (id) => {
    const l = available.find((x) => x.id === id);
    if (!l) return setCal({ ladder: null, points: [] });
    const snap = ladderSnapshot(l);
    rememberLadder(mode.ladderKind, l.id);
    return setCal({ ladder: snap, points: results ? suggestCalibration(results, snap) : [] });
  };
  const setLadderLane = (id) => update((s) => ({
    ...s,
    lanes: s.lanes.map((l) => (l.id === id ? { ...l, role: 'ladder' } : l.role === 'ladder' ? { ...l, role: 'sample' } : l)),
    calibration: { ...s.calibration, laneId: id || null, points: [] },
  }));
  const ladderLane = state.lanes.find((l) => l.id === cal.laneId);
  const pointOf = (size) => cal.points.find((p) => p.size === size);
  const fitted = results?.calibration?.points ?? [];

  return (
    <>
      <div className="gel-two">
        <label className="field">
          <span>Marqueur</span>
          <select value={cal.ladder?.id ?? ''} onChange={(e) => chooseLadder(e.target.value)}>
            <option value="">— Choisir —</option>
            {cal.ladder && !available.some((l) => l.id === cal.ladder.id) && <option value={cal.ladder.id}>{cal.ladder.name}</option>}
            {available.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Sa piste</span>
          <select value={cal.laneId ?? ''} onChange={(e) => setLadderLane(e.target.value)}>
            <option value="">— Aucune —</option>
            {state.lanes.map((l, i) => <option key={l.id} value={l.id}>Piste {laneName(l, i)}</option>)}
          </select>
        </label>
      </div>
      <button type="button" className="link-btn small gel-align-start" onClick={openLadders}>Gérer les marqueurs…</button>
      {!state.lanes.length && <p className="gel-empty">Placez d’abord les pistes.</p>}

      {results?.calibration && (
        <Segmented label="Méthode" value={cal.method} onChange={(method) => setCal({ method })} options={Object.keys(FIT_METHODS).map((k) => [k, SHORT_METHODS[k] ?? FIT_METHODS[k]])} />
      )}
      {results?.calibration && (
        <small className="hint">
          {cal.method === 'interp' ? 'Interpolation : passe par chaque marqueur, conseillée pour l’ADN.' : `R² = ${formatNumber(results.calibration.r2, 4)} sur log(taille).${results.calibration.r2 < 0.98 ? ' Essayez l’interpolation.' : ''}`}
          {' '}Courbe : onglet « Étalonnage » à droite.
        </small>
      )}

      {cal.ladder && ladderLane && (
        <More title={`Bandes du marqueur (${cal.points.length}/${cal.ladder.bands.length})`} open={!results?.calibration}>
          <div className="gel-btn-row">
            <button type="button" className="btn btn-small" onClick={() => setCal({ points: suggestCalibration(results, cal.ladder) })}><Wand2 size={15} /> Attribuer automatiquement</button>
            <button type="button" className="link-btn small" onClick={() => setCal({ points: [] })}>Effacer</button>
          </div>
          <table className="gel-table gel-calib">
            <thead><tr><th>Taille</th><th className="num">Écart</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {cal.ladder.bands.map((b) => {
                const p = pointOf(b.size);
                const f = fitted.find((x) => x.size === b.size);
                const picking = tool === 'calib' && calibSize === b.size;
                return (
                  <tr key={b.size} className={picking ? 'is-picking' : p ? '' : 'is-missing'}>
                    <td>{formatSize(b.size, mode.unit)}</td>
                    <td className="num">{f && results.calibration.method !== 'interp' ? `${f.error >= 0 ? '+' : ''}${formatNumber(f.error, 2)} %` : p ? '✓' : '—'}</td>
                    <td className="gel-calib-actions">
                      <button type="button" className={`icon-btn${picking ? ' is-on' : ''}`} title="Placer cette taille : cliquez ensuite sa bande sur le gel ou le profil" aria-label={`Placer ${formatSize(b.size, mode.unit)}`} onClick={() => { setCalibSize(b.size); setTool('calib'); }}>
                        <Crosshair size={14} />
                      </button>
                      {p && <button type="button" className="icon-btn" aria-label={`Retirer ${formatSize(b.size, mode.unit)}`} onClick={() => setCal({ points: cal.points.filter((x) => x.size !== b.size) })}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <small className="hint">Une bande mal placée ? Cliquez la cible puis la bande. Les tailles absentes du gel peuvent rester vides.</small>
        </More>
      )}
      {!available.length && ladders && (
        <Group><p className="gel-empty">Aucun marqueur {mode.ladderKind === 'dna' ? 'd’ADN' : 'de protéines'} : ajoutez-en un dans « Gérer les marqueurs ».</p></Group>
      )}
    </>
  );
}
