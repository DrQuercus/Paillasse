import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatNumber } from '../../lib/calc/units.js';
import { formatSize } from '../../lib/gel/calibration.js';
import { LANE_COLORS } from '../../lib/gel/figure.js';
import { MODES, ROLES, VALUE_MODES, laneName } from '../../lib/gel/model.js';
import ProfileChart from './ProfileChart.jsx';

// Unité dans l'en-tête plutôt que dans chaque cellule : le tableau reste lisible avec 10 pistes
const cellText = (v, mode) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return formatNumber(v, mode === 'area' ? 4 : 3);
};
const unitText = (mode, unit) => ({ percent: '%', relative: '%', amount: unit }[mode] ?? null);

/** Nom de bande modifiable sur place ; le texte tapé reste local pendant la saisie (calculs différés). */
function RowName({ value, placeholder, onChange }) {
  const [text, setText] = useState(value);
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(value); }, [value]);
  return (
    <input
      className="gel-rowname"
      value={text}
      placeholder={placeholder}
      size={Math.max(6, (text || placeholder).length)}
      onFocus={() => { editing.current = true; }}
      onBlur={() => { editing.current = false; }}
      onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
      aria-label={`Nom de la bande ${placeholder}`}
      title="Nommer la bande (ex. GAPDH, BSA)"
      readOnly={!onChange}
    />
  );
}

/** Panneau de droite : profil et bandes de la piste active, ou tableau de toutes les pistes. */
export default function LaneDetails({ state, profiles, results, activeLaneId, hoverPos, onHover, onPick, pickable, tab, onTab, onRenameBand }) {
  const [localTab, setLocalTab] = useState('lane');
  const current = tab ?? localTab;
  const setTab = onTab ?? setLocalTab;
  const index = state.lanes.findIndex((l) => l.id === activeLaneId);
  const lane = results?.lanes.find((l) => l.id === activeLaneId);
  const mode = MODES[state.mode];
  const ladderSizes = (state.calibration.ladder?.bands ?? []).map((b) => b.size);
  const q = state.quant;

  return (
    <div className="gel-details">
      <div className="gel-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={current === 'lane'} className={current === 'lane' ? 'is-active' : ''} onClick={() => setTab('lane')}>Piste</button>
        <button type="button" role="tab" aria-selected={current === 'table'} className={current === 'table' ? 'is-active' : ''} onClick={() => setTab('table')}>Tableau des bandes</button>
      </div>
      {current === 'lane' && (
        !lane ? <p className="gel-empty">Ajoutez des pistes puis cliquez sur l’une d’elles pour voir son profil.</p> : (
          <>
            <h3 className="gel-lane-title">
              <span className="gel-dot" style={{ background: LANE_COLORS[index % LANE_COLORS.length] }} />
              Piste {laneName(lane, index)} <span className="muted small">{ROLES[lane.role].toLowerCase()}</span>
            </h3>
            <ProfileChart
              lane={lane}
              length={profiles.length}
              calibration={results.calibration}
              unit={results.unit}
              ladderSizes={ladderSizes}
              hoverPos={hoverPos}
              onHover={onHover}
              onPick={(pos) => onPick?.(lane.id, pos)}
              pickable={pickable}
              color={LANE_COLORS[index % LANE_COLORS.length]}
            />
            {lane.bands.length === 0 ? <p className="hint">Aucune bande détectée : augmentez la sensibilité à l’étape Bandes.</p> : (
              <table className="gel-table">
                <thead>
                  <tr><th>#</th><th>{results.calibration ? 'Taille' : 'Position'}</th><th className="num">Aire</th><th className="num">%</th>{results.standard && <th className="num">Quantité</th>}</tr>
                </thead>
                <tbody>
                  {lane.bands.map((b, i) => (
                    <tr key={b.apex} className={b.saturated ? 'is-saturated' : ''}>
                      <td>{i + 1}</td>
                      <td>{b.size ? formatSize(b.size, results.unit) : Math.round(b.apex)}{b.saturated && <AlertTriangle size={13} className="gel-warn-icon" aria-label="saturée" />}</td>
                      <td className="num">{formatNumber(b.area, 4)}</td>
                      <td className="num">{formatNumber(b.percent, 3)} %</td>
                      {results.standard && <td className="num">{Number.isFinite(b.amount) ? `${formatNumber(b.amount, 3)} ${mode.amountUnit}${b.outOfRange ? ' *' : ''}` : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {lane.bands.some((b) => b.saturated) && <p className="hint gel-warn">Bande en rouge : pixels saturés, aire sous-estimée.</p>}
            {results.standard && lane.bands.some((b) => b.outOfRange) && <p className="hint">* hors de la gamme étalon (extrapolé).</p>}
            {lane.stoichiometry && (
              <p className="gel-stoich">
                Rapport molaire (aire / taille) :{' '}
                <strong>{lane.stoichiometry.integers
                  ? `≈ ${lane.stoichiometry.integers.join(' : ')}`
                  : lane.stoichiometry.ratios.map((r) => formatNumber(r, 2)).join(' : ')}</strong>
                <span className="muted small">
                  {' '}({lane.stoichiometry.bands.map((b) => formatSize(b.size, results.unit)).join(', ')}
                  {lane.stoichiometry.integers && ` ; mesuré ${lane.stoichiometry.ratios.map((r) => formatNumber(r, 2)).join(' : ')}`})
                </span>
              </p>
            )}
            {lane.expected?.map((e) => (
              <div key={e.id} className="gel-expected">
                <strong>Attendu : {e.label}</strong>
                <ul>
                  {(e.matches.length ? e.matches : e.sizes.map((size) => ({ size }))).map((m) => (
                    <li key={m.size}>
                      {formatSize(m.size, results.unit)} →{' '}
                      {!results.calibration ? 'étalonnez le gel pour comparer'
                        : m.band ? <>observé à {formatSize(m.band.size, results.unit)} <span className="muted">({m.deviation >= 0 ? '+' : ''}{formatNumber(m.deviation, 2)} %)</span></>
                          : <span className="gel-warn">absent</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        )
      )}
      {current === 'table' && (
        !results?.rows.length ? <p className="gel-empty">Les bandes apparaîtront ici, regroupées entre pistes par {results?.calibration ? 'taille' : 'position'}.</p> : (
          <>
            <p className="hint">{VALUE_MODES[q.values]}{unitText(q.values, mode.amountUnit) ? `, en ${unitText(q.values, mode.amountUnit)}` : ''}. Réglage à l’étape Bandes.{onRenameBand ? ' Cliquez sur une bande pour la nommer.' : ''}</p>
            <div className="gel-table-wrap">
              <table className="gel-table gel-table-matrix">
                <thead>
                  <tr><th>Bande</th>{results.sampleLanes.map((l) => <th key={l.id} className="num">{laneName(l, state.lanes.findIndex((x) => x.id === l.id))}</th>)}</tr>
                </thead>
                <tbody>
                  {results.rows.map((r) => (
                    <tr key={r.group.pos} className={r.isLoadingControl ? 'is-control' : ''}>
                      <th scope="row">
                        <RowName value={r.name} placeholder={r.sizeLabel} onChange={onRenameBand && ((name) => onRenameBand(r.group, name))} />
                        {r.name && r.group.size ? <span className="muted small"> {r.sizeLabel}</span> : null}
                        {r.isLoadingControl && <span className="muted small"> contrôle</span>}
                      </th>
                      {r.cells.map((c) => (
                        <td key={c.laneId} className={`num${c.saturated ? ' is-saturated' : ''}`}>{cellText(c.value, q.values)}{c.outOfRange ? ' *' : ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {results.rows.some((r) => r.cells.some((c) => c.saturated)) && <p className="hint gel-warn">En rouge : bande saturée, valeur sous-estimée.</p>}
            {results.rows.some((r) => r.cells.some((c) => c.outOfRange)) && <p className="hint">* hors de la gamme étalon (extrapolé).</p>}
          </>
        )
      )}
    </div>
  );
}
