import { useEffect, useMemo, useRef, useState } from 'react';
import { panelWidths } from '../../lib/gel/figure.js';
import { buildSummary } from '../../lib/gel/model.js';
import { GEL_SIZES, drawGelFigure } from '../../lib/gel/render.js';
import { figurePanels, panelSvg } from './figureExport.js';

/** Panneau « gel » de l'aperçu : dessiné directement (sans encodage PNG), seulement quand ses réglages changent. */
function GelPanelPreview({ img, state, profiles, results, letter, width, onSize }) {
  const box = useRef(null);
  const [ready, setReady] = useState(false);
  const key = JSON.stringify([state.figure.gel, state.figure.style, state.display, state.lanes, state.annotations, state.expected, state.calibration, state.bandNames, letter]);
  useEffect(() => {
    const t = setTimeout(() => {
      const c = drawGelFigure(img, state, profiles, results, { letter, pixelRatio: Math.min(2, window.devicePixelRatio || 1) });
      box.current?.replaceChildren(c);
      setReady(true);
      onSize(c.designWidth);
    }, 60);
    return () => clearTimeout(t);
  }, [key, img, profiles, results]); // eslint-disable-line react-hooks/exhaustive-deps
  // Le canvas vit dans un conteneur que React ne touche pas ; l'attente est à côté
  return (
    <div className="gelfig-canvas" style={{ width: `${width}%` }}>
      <div ref={box} />
      {!ready && <div className="gel-preview-wait">Rendu du gel…</div>}
    </div>
  );
}

/** Aperçu de la figure, telle qu'elle apparaîtra dans l'entrée (panneaux à la même échelle). */
export default function FigurePreview({ state, img, profiles, results }) {
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
