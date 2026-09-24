import { useEffect, useMemo, useState } from 'react';
import { Download, MessageSquarePlus, Trash2 } from 'lucide-react';
import { LANE_COLORS, calibrationSvg, profilesSvg, standardSvg } from '../../lib/gel/figure.js';
import { MODES, buildSummary, laneName } from '../../lib/gel/model.js';
import { canvasToBlob, drawGelFigure } from '../../lib/gel/render.js';
import { Check, Section, Segmented } from './controls.jsx';
import { download, tableCsv } from './figureExport.js';

export function StepFigure({ ctx }) {
  const { state, update, results, tool, setTool, img, profiles, notify } = ctx;
  const f = state.figure;
  const setFig = (patch) => update((s) => ({ ...s, figure: { ...s.figure, ...patch } }));
  const setPanels = (patch) => setFig({ panels: { ...f.panels, ...patch } });
  const setGel = (patch) => setFig({ gel: { ...f.gel, ...patch } });
  const setProf = (patch) => setFig({ profiles: { ...f.profiles, ...patch } });
  const cal = Boolean(results?.calibration);
  const profileLanes = f.profiles.lanes ?? results?.sampleLanes.map((l) => l.id) ?? [];

  const save = async (what) => {
    try {
      if (what === 'csv') {
        const csv = tableCsv(buildSummary(state, results));
        download(new Blob([`﻿${csv}`], { type: 'text/csv' }), 'bandes.csv');
        return;
      }
      if (what === 'gel') {
        download(await canvasToBlob(drawGelFigure(img, state, profiles, results)), 'gel.png');
        return;
      }
      download(new Blob([profilesSvg(state, profiles, results)], { type: 'image/svg+xml' }), 'profils.svg');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <>
      <Section title="Éléments de la figure">
        <Check checked={f.panels.gel} onChange={(gel) => setPanels({ gel })}>Image du gel</Check>
        <Check checked={f.panels.profiles} onChange={(profiles2) => setPanels({ profiles: profiles2 })}>Profils de migration</Check>
        <Check checked={f.panels.table} onChange={(table) => setPanels({ table })}>Tableau des bandes</Check>
        <Check checked={f.panels.calibration} disabled={!cal} onChange={(calibration) => setPanels({ calibration })}>Courbe d’étalonnage</Check>
        <Check checked={f.panels.standards} disabled={!results?.standard} onChange={(standards) => setPanels({ standards })}>Gamme étalon</Check>
      </Section>

      {f.panels.gel && (
        <Section title="Image du gel">
          <Segmented label="Pistes" value={f.gel.overlay} onChange={(overlay) => setGel({ overlay })} options={[['none', 'Sans pistes'], ['lines', 'Lignes'], ['boxes', 'Cadres']]} />
          <Check checked={f.gel.laneLabels} onChange={(laneLabels) => setGel({ laneLabels })}>Noms des pistes</Check>
          <Check checked={f.gel.sizeScale} disabled={!cal} onChange={(sizeScale) => setGel({ sizeScale })}>Échelle de tailles ({MODES[state.mode].unit})</Check>
          <Check checked={f.gel.bandLabels === 'groups'} onChange={(on) => setGel({ bandLabels: on ? 'groups' : 'none' })}>Taille des bandes (à droite)</Check>
          <Check checked={f.gel.expected} disabled={!cal || !state.expected.length} onChange={(expected) => setGel({ expected })}>Tailles attendues</Check>
          <Check checked={f.gel.darkBands} onChange={(darkBands) => setGel({ darkBands })}>Bandes sombres sur fond blanc</Check>
          <Check checked={f.gel.cropToLanes} onChange={(cropToLanes) => setGel({ cropToLanes })}>Recadrer sur les pistes</Check>
          <div className="gel-btn-row">
            <button type="button" className={`btn btn-small${tool === 'annotate' ? ' is-on' : ''}`} onClick={() => setTool(tool === 'annotate' ? 'select' : 'annotate')}>
              <MessageSquarePlus size={15} /> {tool === 'annotate' ? 'Cliquez à la hauteur voulue…' : 'Ajouter une flèche'}
            </button>
          </div>
          {(state.annotations ?? []).length > 0 && (
            <ul className="gel-curves">
              {state.annotations.map((a) => (
                <li key={a.id}>
                  <input aria-label="Texte de la flèche" value={a.text} onChange={(e) => update((s) => ({ ...s, annotations: s.annotations.map((x) => (x.id === a.id ? { ...x, text: e.target.value } : x)) }), { key: `ann-${a.id}` })} />
                  <button type="button" className="icon-btn" onClick={() => update((s) => ({ ...s, annotations: s.annotations.filter((x) => x.id !== a.id) }))} aria-label="Supprimer la flèche"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          <p className="hint">Contraste et aspect de l’image : réglages d’affichage de l’étape 1.</p>
        </Section>
      )}

      {f.panels.profiles && (
        <Section title="Profils">
          <div className="gel-lane-picks">
            {results?.lanes.map((l, i) => (
              <label key={l.id} className="chip-check">
                <input
                  type="checkbox"
                  checked={profileLanes.includes(l.id)}
                  onChange={(e) => setProf({ lanes: e.target.checked ? [...profileLanes, l.id] : profileLanes.filter((x) => x !== l.id) })}
                />
                <span style={{ borderColor: LANE_COLORS[profileLanes.indexOf(l.id) % LANE_COLORS.length] }}>{laneName(l, i)}</span>
              </label>
            ))}
          </div>
          <Segmented label="Axe" value={f.profiles.axis} onChange={(axis) => setProf({ axis })} options={[['size', 'Tailles'], ['position', 'Migration']]} />
          <Check checked={f.profiles.areas} onChange={(areas) => setProf({ areas })}>Aires des bandes</Check>
        </Section>
      )}

      <Section title="Mise en page">
        <Segmented label="Disposition" value={f.layout} onChange={(layout) => setFig({ layout })} options={[['column', 'L’un sous l’autre'], ['row', 'Côte à côte']]} />
        <Segmented label="Largeur" value={String(f.width)} onChange={(w) => setFig({ width: Number(w) })} options={[['50', '50 %'], ['75', '75 %'], ['100', '100 %']]} />
      </Section>

      <Section title="Télécharger" open={false}>
        <div className="gel-btn-row">
          <button type="button" className="btn btn-small" onClick={() => save('gel')}><Download size={14} /> Gel (PNG)</button>
          <button type="button" className="btn btn-small" onClick={() => save('profiles')}><Download size={14} /> Profils (SVG)</button>
          <button type="button" className="btn btn-small" onClick={() => save('csv')} disabled={!results?.rows.length}><Download size={14} /> Tableau (CSV)</button>
        </div>
      </Section>
    </>
  );
}

/** Aperçu de la figure, telle qu'elle apparaîtra dans l'entrée. */
export function FigurePreview({ state, img, profiles, results }) {
  const f = state.figure;
  const [gelUrl, setGelUrl] = useState(null);
  const summary = useMemo(() => (results ? buildSummary(state, results) : null), [state, results]);
  useEffect(() => {
    if (!f.panels.gel || !img || !profiles || !results) { setGelUrl(null); return undefined; }
    let url = null;
    let cancelled = false;
    const t = setTimeout(() => {
      canvasToBlob(drawGelFigure(img, state, profiles, results)).then((b) => {
        if (cancelled) return;
        url = URL.createObjectURL(b);
        setGelUrl(url);
      }).catch(() => {});
    }, 120);
    return () => { cancelled = true; clearTimeout(t); if (url) URL.revokeObjectURL(url); };
  }, [img, state, profiles, results, f.panels.gel]);
  if (!results || !summary) return null;
  const svgs = [
    f.panels.profiles && results.lanes.length ? profilesSvg(state, profiles, results) : null,
    f.panels.calibration && results.calibration ? calibrationSvg(state, profiles, results) : null,
    f.panels.standards && results.standard ? standardSvg(state, results, { unit: MODES[state.mode].amountUnit }) : null,
  ].filter(Boolean);
  return (
    <div className="gel-preview">
      <p className="gel-preview-label">Aperçu de l’encart inséré dans l’entrée</p>
      <figure className={`gelfig-card gelfig-${f.layout}`} style={{ width: `${f.width}%` }}>
        <figcaption><strong>{summary.title}</strong> <span className="muted">— {summary.mode}</span></figcaption>
        <div className="gelfig-panels">
          {f.panels.gel && (gelUrl ? <img src={gelUrl} alt="Gel" /> : <div className="gel-preview-wait">Rendu du gel…</div>)}
          {/* SVG construits par figure.js (nombres et textes échappés) */}
          {svgs.map((svg, i) => <div key={i} className="gelfig-svg" dangerouslySetInnerHTML={{ __html: svg }} />)}
        </div>
        {f.panels.table && summary.table && (
          <div className="calc-table-wrap">
            <table className="calc-table">
              <thead><tr>{summary.table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{summary.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
        {summary.notes.map((n) => <p key={n} className="calc-note">{n}</p>)}
      </figure>
    </div>
  );
}
