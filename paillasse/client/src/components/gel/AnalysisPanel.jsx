import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Download, RotateCcw, ZoomOut } from 'lucide-react';
import { formatNumber } from '../../lib/calc/units.js';
import { formatSize } from '../../lib/gel/calibration.js';
import { LANE_COLORS, UI_STYLE, calibrationSvg, traceOf } from '../../lib/gel/figure.js';
import { MODES, ROLES, VALUE_MODES, buildSummary, laneName } from '../../lib/gel/model.js';
import { svgToPng } from '../../lib/gel/render.js';
import AnalysisChart from './AnalysisChart.jsx';
import { Segmented } from './controls.jsx';
import { download, tableCsv } from './figureExport.js';

// Unité dans l'en-tête plutôt que dans chaque cellule : le tableau reste lisible avec 10 pistes
const cellText = (v, mode) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return formatNumber(v, mode === 'area' ? 4 : 3);
};
const unitText = (mode, unit) => ({ percent: '%', relative: '%', amount: unit }[mode] ?? null);

// Préférences d'affichage du graphique, gardées d'une session à l'autre dans ce navigateur
const VIEW_KEY = 'paillasse.gel.chart';
const DEFAULT_VIEW = { curve: 'smoothed', background: 'show', normalize: 'none', compare: 'overlay', labels: true };
function loadView() {
  try { return { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') }; } catch { return DEFAULT_VIEW; }
}

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

const TABS = [['lane', 'Piste'], ['compare', 'Comparer'], ['calib', 'Étalonnage'], ['table', 'Tableau']];

/**
 * Panneau d'analyse (à droite de l'atelier) : profil de la piste active avec ses bandes, comparaison
 * de pistes superposées ou empilées, courbe d'étalonnage, tableau de toutes les bandes.
 */
export default function AnalysisPanel({
  state, update, commit, profiles, results, activeLaneId, setActiveLaneId, hoverPos, onHover, onPick, pickable, onRenameBand, tab, onTab,
}) {
  const [localTab, setLocalTab] = useState('lane');
  const current = tab ?? localTab;
  const setTab = onTab ?? setLocalTab;
  const [view, setViewState] = useState(loadView);
  const setView = (patch) => setViewState((v) => {
    const next = { ...v, ...patch };
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* navigation privée */ }
    return next;
  });
  const [zoom, setZoom] = useState(null);
  const [selected, setSelected] = useState(null);
  const [compareIds, setCompareIds] = useState(null);
  const svgRef = useRef(null);
  const mode = MODES[state.mode];
  const ladderSizes = (state.calibration.ladder?.bands ?? []).map((b) => b.size);
  const q = state.quant;
  const index = state.lanes.findIndex((l) => l.id === activeLaneId);
  const lane = results?.lanes.find((l) => l.id === activeLaneId);
  const colorOf = (id) => LANE_COLORS[Math.max(0, state.lanes.findIndex((l) => l.id === id)) % LANE_COLORS.length];
  const nameOf = (l) => laneName(l, state.lanes.findIndex((x) => x.id === l.id));
  useEffect(() => { setSelected(null); }, [activeLaneId]);

  const smooth = view.curve !== 'raw';
  const laneSeries = useMemo(() => {
    if (!lane) return [];
    if (view.background === 'subtract') {
      return [{ id: lane.id, name: `Piste ${nameOf(lane)}`, color: colorOf(lane.id), values: traceOf(lane, { smooth }).v, baseline: null, bands: lane.bands }];
    }
    return [{ id: lane.id, name: `Piste ${nameOf(lane)}`, color: colorOf(lane.id), values: smooth ? lane.smoothed : lane.profile, baseline: lane.baseline, bands: lane.bands }];
  }, [lane, view.background, smooth]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = compareIds ?? results?.lanes.filter((l) => l.role !== 'ladder').map((l) => l.id) ?? [];
  const compareSeries = useMemo(() => (results?.lanes ?? [])
    .filter((l) => shown.includes(l.id))
    .map((l) => ({ id: l.id, name: `Piste ${nameOf(l)}`, color: colorOf(l.id), values: traceOf(l, { smooth, normalize: view.normalize }).v, baseline: null, bands: l.bands })),
  [results, shown.join(), smooth, view.normalize]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bornes d'intégration d'une bande, déplacées sur le graphique
  const setBounds = (apex, patch) => update((s) => {
    const e = s.edits?.[activeLaneId] ?? {};
    const band = lane.bands.find((b) => b.apex === apex);
    const others = (e.bounds ?? []).filter((b) => Math.abs(b.apex - apex) > 1);
    const cur = (e.bounds ?? []).find((b) => Math.abs(b.apex - apex) <= 1) ?? { left: band.left, right: band.right };
    return { ...s, edits: { ...s.edits, [activeLaneId]: { ...e, bounds: [...others, { apex, left: patch.left ?? cur.left, right: patch.right ?? cur.right }] } } };
  }, { transient: true });
  const resetBounds = () => update((s) => {
    const e = { ...(s.edits?.[activeLaneId] ?? {}) };
    delete e.bounds;
    return { ...s, edits: { ...s.edits, [activeLaneId]: e } };
  });

  const exportChart = async (type) => {
    const el = svgRef.current;
    if (!el) return;
    const xml = new XMLSerializer().serializeToString(el);
    const name = current === 'lane' && lane ? `profil-piste-${nameOf(lane)}` : 'profils';
    if (type === 'svg') download(new Blob([xml], { type: 'image/svg+xml' }), `${name}.svg`);
    else download((await svgToPng(xml, 2)).blob, `${name}.png`);
  };

  const chartTools = (
    <div className="an-tools">
      <Segmented label="Courbe" value={view.curve} onChange={(curve) => setView({ curve })} options={[['smoothed', 'Lissée'], ['raw', 'Brute']]} />
      {current === 'lane'
        ? <Segmented label="Fond" value={view.background} onChange={(background) => setView({ background })} options={[['show', 'Avec fond'], ['subtract', 'Sans fond']]} />
        : (
          <>
            <Segmented label="Disposition" value={view.compare} onChange={(compare) => setView({ compare })} options={[['overlay', 'Superposées'], ['stack', 'Empilées']]} />
            <select className="an-select" value={view.normalize} onChange={(e) => setView({ normalize: e.target.value })} aria-label="Normalisation">
              <option value="none">Sans normalisation</option>
              <option value="max">Maximum = 1</option>
              <option value="area">Aire totale = 100</option>
            </select>
          </>
        )}
      <span className="an-tools-end">
        {zoom && <button type="button" className="icon-btn" onClick={() => setZoom(null)} title="Tout voir (double-clic)" aria-label="Tout voir"><ZoomOut size={15} /></button>}
        <button type="button" className="icon-btn" onClick={() => exportChart('png')} title="Enregistrer le graphique (PNG)" aria-label="Enregistrer le graphique en PNG"><Download size={15} /></button>
      </span>
    </div>
  );

  const chartProps = {
    length: profiles?.length ?? 0, calibration: results?.calibration, unit: results?.unit, ladderSizes,
    zoom, onZoom: setZoom, hoverPos, onHover, svgRef,
  };

  return (
    <div className="gel-details">
      <div className="gel-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={current === k} className={current === k ? 'is-active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {current === 'lane' && (
        !lane ? <p className="gel-empty">Ajoutez des pistes puis cliquez sur l’une d’elles pour voir son profil.</p> : (
          <>
            <div className="an-lane-head">
              <button type="button" className="icon-btn" disabled={index <= 0} onClick={() => setActiveLaneId(state.lanes[index - 1].id)} aria-label="Piste précédente"><ChevronLeft size={16} /></button>
              <span className="gel-dot" style={{ background: colorOf(lane.id) }} />
              <select value={activeLaneId} onChange={(e) => setActiveLaneId(e.target.value)} aria-label="Piste affichée">
                {state.lanes.map((l, i) => <option key={l.id} value={l.id}>Piste {laneName(l, i)}</option>)}
              </select>
              <span className="muted small">{ROLES[lane.role].toLowerCase()}</span>
              <button type="button" className="icon-btn" disabled={index >= state.lanes.length - 1} onClick={() => setActiveLaneId(state.lanes[index + 1].id)} aria-label="Piste suivante"><ChevronRight size={16} /></button>
            </div>
            {chartTools}
            <AnalysisChart
              {...chartProps}
              series={laneSeries}
              mode="lane"
              labels={view.labels}
              pickable={pickable}
              onPick={(pos) => onPick?.(lane.id, pos)}
              selected={selected}
              onSelect={setSelected}
              onBounds={setBounds}
              onBoundsEnd={commit}
            />
            <p className="an-hint">
              {selected !== null ? 'Tirez les bornes orange pour régler l’intégration de la bande.' : 'Molette : zoom · glisser : se déplacer · clic sur une bande : régler ses bornes.'}
              {state.edits?.[activeLaneId]?.bounds?.length ? <> <button type="button" className="link-btn small" onClick={resetBounds}><RotateCcw size={11} /> Bornes automatiques</button></> : null}
            </p>
            {lane.bands.length === 0 ? <p className="hint">Aucune bande détectée : augmentez la sensibilité (réglages des bandes).</p> : (
              <table className="gel-table an-bands">
                <thead>
                  <tr><th>#</th><th>{results.calibration ? 'Taille' : 'Position'}</th><th className="num">Aire</th><th className="num">% de la piste</th>{results.standard && <th className="num">Quantité</th>}</tr>
                </thead>
                <tbody>
                  {lane.bands.map((b, i) => (
                    <tr key={b.apex} className={`${b.saturated ? 'is-saturated' : ''}${b.apex === selected ? ' is-selected' : ''}`} onClick={() => setSelected(b.apex === selected ? null : b.apex)}>
                      <td>{i + 1}</td>
                      <td>
                        {b.size ? formatSize(b.size, results.unit) : Math.round(b.apex)}
                        {b.saturated && <AlertTriangle size={13} className="gel-warn-icon" aria-label="saturée" />}
                        {b.manual && <span className="an-manual" title="Bornes réglées à la main">↔</span>}
                      </td>
                      <td className="num">{formatNumber(b.area, 4)}</td>
                      <td className="num an-pct">
                        <span className="an-bar" style={{ width: `${Math.min(100, b.percent)}%`, background: colorOf(lane.id) }} />
                        <span>{formatNumber(b.percent, 3)} %</span>
                      </td>
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

      {current === 'compare' && (
        !results?.lanes.length ? <p className="gel-empty">Ajoutez des pistes pour les comparer.</p> : (
          <>
            <div className="gel-lane-picks">
              {results.lanes.map((l) => (
                <label key={l.id} className="chip-check">
                  <input type="checkbox" checked={shown.includes(l.id)} onChange={(e) => setCompareIds(e.target.checked ? results.lanes.filter((x) => x.id === l.id || shown.includes(x.id)).map((x) => x.id) : shown.filter((x) => x !== l.id))} />
                  <span style={{ borderColor: colorOf(l.id) }}>{nameOf(l)}</span>
                </label>
              ))}
              <button type="button" className="link-btn small" onClick={() => setCompareIds(results.lanes.map((l) => l.id))}>Toutes</button>
              <button type="button" className="link-btn small" onClick={() => setCompareIds([])}>Aucune</button>
            </div>
            {chartTools}
            <AnalysisChart {...chartProps} series={compareSeries} mode={view.compare === 'stack' ? 'stack' : 'overlay'} />
            <p className="an-hint">Fond soustrait. Normaliser compare des pistes inégalement chargées. Molette : zoom · double-clic : tout voir.</p>
          </>
        )
      )}

      {current === 'calib' && (
        !results?.calibration ? <p className="gel-empty">Choisissez un marqueur de taille et sa piste : la courbe d’étalonnage apparaîtra ici.</p> : (
          <>
            {/* SVG construit par figure.js à partir de nombres et de textes échappés */}
            <div className="gel-svg" dangerouslySetInnerHTML={{ __html: calibrationSvg(state, profiles, results, { width: 460, height: 300, style: UI_STYLE }) }} />
            <table className="gel-table">
              <thead><tr><th>Marqueur</th><th className="num">Position</th><th className="num">Taille lue</th><th className="num">Écart</th></tr></thead>
              <tbody>
                {results.calibration.points.map((p) => (
                  <tr key={p.size}>
                    <td>{formatSize(p.size, results.unit)}</td>
                    <td className="num">{Math.round(p.pos)} px</td>
                    <td className="num">{formatSize(p.fitted, results.unit)}</td>
                    <td className={`num${Math.abs(p.error) > 5 ? ' gel-warn' : ''}`}>{results.calibration.method === 'interp' ? '—' : `${p.error >= 0 ? '+' : ''}${formatNumber(p.error, 2)} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint">
              {results.calibration.method === 'interp' ? 'Interpolation entre marqueurs : passe par chaque point.' : `R² = ${formatNumber(results.calibration.r2, 4)} sur log(taille).`}
              {' '}Méthode et bandes du marqueur : réglages des tailles.
            </p>
          </>
        )
      )}

      {current === 'table' && (
        !results?.rows.length ? <p className="gel-empty">Les bandes apparaîtront ici, regroupées entre pistes par {results?.calibration ? 'taille' : 'position'}.</p> : (
          <>
            <p className="hint">{VALUE_MODES[q.values]}{unitText(q.values, mode.amountUnit) ? `, en ${unitText(q.values, mode.amountUnit)}` : ''}.{onRenameBand ? ' Cliquez sur une bande pour la nommer.' : ''}</p>
            <div className="gel-table-wrap">
              <table className="gel-table gel-table-matrix">
                <thead>
                  <tr><th>Bande</th>{results.sampleLanes.map((l) => <th key={l.id} className="num">{nameOf(l)}</th>)}</tr>
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
            <button type="button" className="btn btn-small btn-ghost" onClick={() => download(new Blob([`﻿${tableCsv(buildSummary(state, results))}`], { type: 'text/csv' }), 'bandes.csv')}>
              <Download size={14} /> Tableau (CSV)
            </button>
          </>
        )
      )}
    </div>
  );
}
