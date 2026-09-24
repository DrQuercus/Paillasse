import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, MessageSquarePlus, RotateCcw, Trash2 } from 'lucide-react';
import { FONTS, figureStyle, laneColor, panelWidths } from '../../lib/gel/figure.js';
import { MODES, PANEL_ORDER, buildSummary, laneName } from '../../lib/gel/model.js';
import { GEL_SIZES, canvasToBlob, drawGelFigure } from '../../lib/gel/render.js';
import { Check, Range, Section, Segmented } from './controls.jsx';
import { download, figurePanels, panelSvg, tableCsv } from './figureExport.js';

const PANEL_LABELS = { gel: 'Image du gel', profiles: 'Profils de migration', calibration: 'Courbe d’étalonnage', standards: 'Gamme étalon' };

// Réglages de mise en page rapides : un clic règle plusieurs options d'un coup
const PRESETS = {
  cahier: { label: 'Cahier', style: { font: 'sans', fontSize: 14, lineWidth: 1.6, letters: false, colors: 'color' }, gel: { size: 'M' }, profiles: { height: 380, width: 900 } },
  article: { label: 'Article', width: 75, style: { font: 'sans', fontSize: 16, lineWidth: 1.4, letters: true, colors: 'color' }, gel: { size: 'S' }, profiles: { height: 320, width: 640 } },
  diapo: { label: 'Diaporama', style: { font: 'sans', fontSize: 22, lineWidth: 2.6, letters: false, colors: 'color' }, gel: { size: 'M' }, profiles: { height: 420, width: 900 } },
  nb: { label: 'Noir et blanc', style: { colors: 'gray' }, gel: { darkBands: true }, profiles: {} },
};

export function StepFigure({ ctx }) {
  const { state, update, results, tool, setTool, img, profiles, notify } = ctx;
  const f = state.figure;
  const setFig = (patch, opts) => update((s) => ({ ...s, figure: { ...s.figure, ...patch } }), opts);
  const setPanels = (patch) => setFig({ panels: { ...f.panels, ...patch } });
  const setStyle = (patch, opts) => update((s) => ({ ...s, figure: { ...s.figure, style: { ...s.figure.style, ...patch } } }), opts);
  const setGel = (patch, opts) => update((s) => ({ ...s, figure: { ...s.figure, gel: { ...s.figure.gel, ...patch } } }), opts);
  const setProf = (patch, opts) => update((s) => ({ ...s, figure: { ...s.figure, profiles: { ...s.figure.profiles, ...patch } } }), opts);
  const cal = Boolean(results?.calibration);
  const st = figureStyle(state);
  const profileLanes = f.profiles.lanes ?? results?.sampleLanes.map((l) => l.id) ?? [];
  const order = f.order ?? PANEL_ORDER;
  const move = (key, dir) => {
    const i = order.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setFig({ order: next });
  };
  const applyPreset = (p) => update((s) => ({
    ...s,
    figure: { ...s.figure, ...(p.width ? { width: p.width } : {}), style: { ...s.figure.style, ...p.style }, gel: { ...s.figure.gel, ...p.gel }, profiles: { ...s.figure.profiles, ...p.profiles } },
  }));
  const available = { gel: true, profiles: true, calibration: cal, standards: Boolean(results?.standard) };

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
      download(new Blob([panelSvg('profiles', { state, profiles, results })], { type: 'image/svg+xml' }), 'profils.svg');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <>
      <Section title="Éléments de la figure">
        <ul className="gel-order">
          {order.map((key, i) => (
            <li key={key}>
              <Check checked={f.panels[key] && available[key]} disabled={!available[key]} onChange={(on) => setPanels({ [key]: on })}>{PANEL_LABELS[key]}</Check>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => move(key, -1)} aria-label={`Monter : ${PANEL_LABELS[key]}`} title="Monter"><ArrowUp size={14} /></button>
              <button type="button" className="icon-btn" disabled={i === order.length - 1} onClick={() => move(key, 1)} aria-label={`Descendre : ${PANEL_LABELS[key]}`} title="Descendre"><ArrowDown size={14} /></button>
            </li>
          ))}
        </ul>
        <Check checked={f.panels.table} onChange={(table) => setPanels({ table })}>Tableau des bandes (texte, sous les images)</Check>
      </Section>

      <Section title="Mise en page">
        <div className="gel-presets" role="group" aria-label="Préréglages">
          {Object.entries(PRESETS).map(([k, p]) => <button key={k} type="button" className="btn btn-small" onClick={() => applyPreset(p)}>{p.label}</button>)}
        </div>
        <Segmented label="Disposition" value={f.layout} onChange={(layout) => setFig({ layout })} options={[['column', 'En colonne'], ['row', 'Côte à côte'], ['grid', 'Grille 2 × 2']]} />
        <Segmented label="Largeur dans la page" value={String(f.width)} onChange={(w) => setFig({ width: Number(w) })} options={[['50', '50 %'], ['75', '75 %'], ['100', '100 %']]} />
        <Segmented label="Police" value={f.style.font} onChange={(font) => setStyle({ font })} options={Object.entries(FONTS).map(([k, v]) => [k, v.label])} />
        <Range label="Taille du texte" value={st.size} min={8} max={32} step={1} format={(v) => `${v} px`} onChange={(fontSize) => setStyle({ fontSize }, { key: 'fontSize' })} />
        <Range label="Épaisseur des courbes" value={st.line} min={0.5} max={5} step={0.1} format={(v) => `${v.toLocaleString('fr-FR')} px`} onChange={(lineWidth) => setStyle({ lineWidth }, { key: 'lineWidth' })} />
        <Segmented label="Couleurs" value={f.style.colors} onChange={(colors) => setStyle({ colors })} options={[['color', 'Couleur'], ['gray', 'Niveaux de gris']]} />
        <Check checked={f.style.letters} onChange={(letters) => setStyle({ letters })}>Lettres des panneaux (A, B, C…)</Check>
      </Section>

      {f.panels.gel && (
        <Section title="Image du gel">
          <Segmented label="Taille du gel" value={f.gel.size} onChange={(size) => setGel({ size })} options={[['S', 'Petite'], ['M', 'Moyenne'], ['L', 'Grande']]} />
          <Segmented label="Pistes" value={f.gel.overlay} onChange={(overlay) => setGel({ overlay })} options={[['none', 'Sans pistes'], ['lines', 'Lignes'], ['boxes', 'Cadres']]} />
          <Check checked={f.gel.laneLabels} onChange={(laneLabels) => setGel({ laneLabels })}>Noms des pistes</Check>
          {f.gel.laneLabels && (
            <div className="gel-sub">
              <Segmented label="Position des noms" value={f.gel.labelSide} onChange={(labelSide) => setGel({ labelSide })} options={[['top', 'Au-dessus'], ['bottom', 'Au-dessous']]} />
              <Segmented label="Inclinaison" value={f.gel.labelAngle} onChange={(labelAngle) => setGel({ labelAngle })} options={[['auto', 'Auto'], ['0', '0°'], ['45', '45°'], ['90', '90°']]} />
            </div>
          )}
          <Check checked={f.gel.sizeScale} disabled={!cal} onChange={(sizeScale) => setGel({ sizeScale })}>Échelle de tailles ({MODES[state.mode].unit})</Check>
          {f.gel.sizeScale && cal && (
            <div className="gel-sub">
              <Segmented label="Côté de l’échelle" value={f.gel.scaleSide} onChange={(scaleSide) => setGel({ scaleSide })} options={[['left', 'À gauche'], ['right', 'À droite']]} />
            </div>
          )}
          <Check checked={f.gel.bandLabels === 'groups'} onChange={(on) => setGel({ bandLabels: on ? 'groups' : 'none' })}>Taille (ou nom) des bandes, en face du gel</Check>
          <Check checked={f.gel.expected} disabled={!cal || !state.expected.length} onChange={(expected) => setGel({ expected })}>Tailles attendues</Check>
          <Check checked={f.gel.darkBands} onChange={(darkBands) => setGel({ darkBands })}>Bandes sombres sur fond blanc</Check>
          <Check checked={f.gel.cropToLanes} onChange={(cropToLanes) => setGel({ cropToLanes })}>Recadrer sur les pistes</Check>
          <Check checked={f.gel.frame} onChange={(frame) => setGel({ frame })}>Cadre autour du gel</Check>
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
                  onChange={(e) => setProf({ lanes: e.target.checked ? results.lanes.filter((x) => x.id === l.id || profileLanes.includes(x.id)).map((x) => x.id) : profileLanes.filter((x) => x !== l.id) })}
                />
                <span style={{ borderColor: laneColor(st, profileLanes.indexOf(l.id)) }}>{laneName(l, i)}</span>
              </label>
            ))}
          </div>
          <Segmented label="Courbes" value={f.profiles.mode} onChange={(mode) => setProf({ mode })} options={[['overlay', 'Superposées'], ['stack', 'Empilées']]} />
          <Segmented label="Normalisation" value={f.profiles.normalize} onChange={(normalize) => setProf({ normalize })} options={[['none', 'Aucune'], ['max', 'Maximum'], ['area', 'Aire totale']]} />
          <Segmented label="Axe horizontal" value={f.profiles.axis} onChange={(axis) => setProf({ axis })} options={[['size', 'Tailles'], ['position', 'Migration']]} />
          {f.profiles.mode !== 'stack' && (
            <Segmented label="Légende" value={f.profiles.legend} onChange={(legend) => setProf({ legend })} options={[['inside', 'Dedans'], ['right', 'À droite'], ['top', 'Au-dessus'], ['none', 'Aucune']]} />
          )}
          <Range label="Largeur du graphique" value={f.profiles.width} min={400} max={1600} step={20} format={(v) => `${v} px`} onChange={(width) => setProf({ width }, { key: 'profW' })} />
          <Range label="Hauteur du graphique" value={f.profiles.height} min={200} max={900} step={10} format={(v) => `${v} px`} onChange={(height) => setProf({ height }, { key: 'profH' })} />
          <Check checked={f.profiles.areas} onChange={(areas) => setProf({ areas })}>Aires des bandes</Check>
          <Check checked={f.profiles.labels} onChange={(labels) => setProf({ labels })}>Tailles au-dessus des pics</Check>
          <Check checked={f.profiles.smooth} onChange={(smooth) => setProf({ smooth })}>Courbes lissées</Check>
          <Check checked={f.profiles.grid} onChange={(grid) => setProf({ grid })}>Quadrillage</Check>
        </Section>
      )}

      <Section title="Télécharger" open={false}>
        <div className="gel-btn-row">
          <button type="button" className="btn btn-small" onClick={() => save('gel')}><Download size={14} /> Gel (PNG)</button>
          <button type="button" className="btn btn-small" onClick={() => save('profiles')}><Download size={14} /> Profils (SVG)</button>
          <button type="button" className="btn btn-small" onClick={() => save('csv')} disabled={!results?.rows.length}><Download size={14} /> Tableau (CSV)</button>
        </div>
      </Section>
      <button type="button" className="btn btn-small btn-ghost" onClick={() => update((s) => ({ ...s, figure: { ...s.figure, style: { font: 'sans', fontSize: 14, lineWidth: 1.6, letters: false, colors: 'color' } } }))}>
        <RotateCcw size={14} /> Style par défaut
      </button>
    </>
  );
}

/** Panneau « gel » de l'aperçu : dessiné directement (sans encodage PNG), seulement quand ses réglages changent. */
function GelPanelPreview({ img, state, profiles, results, letter, width, onSize }) {
  const box = useRef(null);
  const key = JSON.stringify([state.figure.gel, state.figure.style, state.display, state.lanes, state.annotations, state.expected, state.calibration, state.bandNames, letter]);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = drawGelFigure(img, state, profiles, results, { letter });
      box.current?.replaceChildren(c);
      onSize(c.width);
    }, 60);
    return () => clearTimeout(t);
  }, [key, img, profiles, results]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} className="gelfig-canvas" style={{ width: `${width}%` }}><div className="gel-preview-wait">Rendu du gel…</div></div>;
}

/** Aperçu de la figure, telle qu'elle apparaîtra dans l'entrée (panneaux à la même échelle). */
export function FigurePreview({ state, img, profiles, results }) {
  const f = state.figure;
  const [gelW, setGelW] = useState(null);
  const summary = useMemo(() => (results ? buildSummary(state, results) : null), [state, results]);
  const panels = results ? figurePanels(state, results) : [];
  // SVG construits par figure.js à partir de nombres et de textes échappés
  const svgs = useMemo(
    () => Object.fromEntries(panels.filter((p) => p.panel !== 'gel').map((p) => [p.panel, panelSvg(p.panel, { state, profiles, results, letter: p.letter })])),
    [f, state.lanes, state.calibration, state.mode, profiles, results], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (!results || !summary) return null;
  const sizes = panels.map((p) => (p.panel === 'gel'
    ? gelW ?? (GEL_SIZES[f.gel.size] ?? GEL_SIZES.M) + 120
    : Number(/width="([\d.]+)"/.exec(svgs[p.panel] ?? '')?.[1] ?? 600)));
  const widths = panelWidths(sizes, f.layout);
  return (
    <div className="gel-preview">
      <p className="gel-preview-label">Aperçu de l’encart inséré dans l’entrée</p>
      <figure className={`gelfig-card gelfig-${f.layout}`} style={{ width: `${f.width}%` }}>
        <figcaption><strong>{summary.title}</strong> <span className="muted">— {summary.mode}</span></figcaption>
        <div className="gelfig-panels">
          {panels.map(({ panel, letter }, i) => (panel === 'gel'
            ? <GelPanelPreview key={panel} img={img} state={state} profiles={profiles} results={results} letter={letter} width={widths[i]} onSize={setGelW} />
            : <div key={panel} className="gelfig-svg" style={{ width: `${widths[i]}%` }} dangerouslySetInnerHTML={{ __html: svgs[panel] }} />))}
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
