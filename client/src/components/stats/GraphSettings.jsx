import { ERRORS, PALETTES, PLOT_TYPES } from '../../lib/stats/plot.js';
import { filledColumns } from '../../lib/stats/model.js';
import { Check, Range, Section, Segmented } from '../gel/controls.jsx';

const PRESETS = {
  prism: { label: 'Classique', graph: { palette: 'color', fill: 'light', fontSize: 14, lineWidth: 1.5, points: true, font: 'sans' } },
  article: { label: 'Article', graph: { palette: 'black', fill: 'none', fontSize: 12, lineWidth: 1.2, points: true, width: 360, height: 320, font: 'sans' } },
  slide: { label: 'Diaporama', graph: { palette: 'vivid', fill: 'solid', fontSize: 20, lineWidth: 2.5, width: 640, height: 480 } },
  gray: { label: 'Niveaux de gris', graph: { palette: 'gray', fill: 'solid' } },
};

/** Réglages du graphique (type, barres d'erreur, étoiles, axes, couleurs, mise en page). */
export default function GraphSettings({ ds, update }) {
  const g = ds.graph;
  const set = (patch, opts) => update((d) => ({ ...d, graph: { ...d.graph, ...patch } }), opts);
  const types = PLOT_TYPES[ds.kind];
  const pal = PALETTES[g.palette] ?? PALETTES.color;
  const series = ds.kind === 'column' ? filledColumns(ds) : ds.columns;
  const hasError = ['column', 'xy', 'grouped'].includes(ds.kind) && !['box', 'violin'].includes(g.type);
  const hasStars = ds.kind === 'column' || ds.kind === 'grouped' || ds.kind === 'survival';

  return (
    <>
      <Section title="Type de graphique">
        <div className="st-types">
          {Object.entries(types).map(([k, label]) => (
            <button key={k} type="button" className={`st-type${g.type === k ? ' is-on' : ''}`} onClick={() => set({ type: k })} aria-pressed={g.type === k}>
              <TypeIcon type={k} /><span>{label}</span>
            </button>
          ))}
        </div>
        <div className="gel-presets" role="group" aria-label="Styles prédéfinis">
          {Object.entries(PRESETS).map(([k, p]) => <button key={k} type="button" className="btn btn-small" onClick={() => set(p.graph)}>{p.label}</button>)}
        </div>
      </Section>

      <Section title="Titres">
        <label className="field"><span>Titre du graphique</span><input value={g.title} onChange={(e) => set({ title: e.target.value }, { key: 'gtitle' })} /></label>
        <label className="field"><span>Axe Y</span><input value={g.yTitle} onChange={(e) => set({ yTitle: e.target.value }, { key: 'ytitle' })} placeholder="Activité (µmol/min)" /></label>
        {(ds.kind === 'xy' || ds.kind === 'survival') && <label className="field"><span>Axe X</span><input value={g.xTitle || ''} onChange={(e) => set({ xTitle: e.target.value }, { key: 'xtitle' })} placeholder={ds.xTitle || 'X'} /></label>}
        {(ds.kind === 'column' || ds.kind === 'grouped' || ds.kind === 'contingency') && (
          <Segmented label="Noms sous l’axe" value={String(g.xAngle)} onChange={(v) => set({ xAngle: Number(v) })} options={[['0', 'Droits'], ['45', '45°'], ['90', 'Verticaux']]} />
        )}
      </Section>

      {(hasError || ds.kind === 'column') && (
        <Section title="Données représentées">
          {hasError && (
            <>
              {g.type !== 'bar' && g.type !== 'groupedBar' && (
                <Segmented label="Centre" value={g.center} onChange={(center) => set({ center, error: center === 'median' && ['sd', 'sem', 'ci'].includes(g.error) ? 'iqr' : g.error })} options={[['mean', 'Moyenne'], ['median', 'Médiane']]} />
              )}
              <label className="field">
                <span>Barres d’erreur</span>
                <select value={g.error} onChange={(e) => set({ error: e.target.value })}>
                  {Object.entries(ERRORS).filter(([k]) => (g.center === 'median' ? !['sd', 'sem', 'ci'].includes(k) : k !== 'iqr')).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </>
          )}
          {g.type === 'box' && <Segmented label="Moustaches" value={g.whiskers} onChange={(whiskers) => set({ whiskers })} options={[['tukey', 'Tukey (1,5 × IQR)'], ['minmax', 'Min – max'], ['p10', '10e – 90e']]} />}
          {ds.kind !== 'contingency' && ds.kind !== 'survival' && g.type !== 'scatter' && g.type !== 'line' && <Check checked={g.points} onChange={(points) => set({ points })}>Points individuels</Check>}
          {ds.kind === 'xy' && <Check checked={g.connect} onChange={(connect) => set({ connect })}>Relier les moyennes</Check>}
          {ds.kind === 'xy' && <Check checked={g.showFit} onChange={(showFit) => set({ showFit })}>Courbe ajustée (analyse)</Check>}
          {ds.kind === 'xy' && ds.analysis.type === 'linear' && <Check checked={g.showBand} onChange={(showBand) => set({ showBand })}>Bande de confiance à 95 %</Check>}
          <Range label="Taille des points" value={g.pointSize} min={2} max={16} step={1} format={(v) => `${v} px`} onChange={(pointSize) => set({ pointSize }, { key: 'psize' })} />
        </Section>
      )}

      {hasStars && (
        <Section title="Significativité">
          <Segmented label="Afficher" value={g.stars} onChange={(stars) => set({ stars })} options={[['significant', 'Significatives'], ['all', 'Toutes'], ['none', 'Aucune']]} />
          {ds.kind !== 'survival' && g.stars !== 'none' && (
            <>
              <Segmented label="Notation" value={g.starStyle} onChange={(starStyle) => set({ starStyle })} options={[['stars', 'Étoiles'], ['p', 'Valeurs de P']]} />
              {g.starStyle === 'stars' && <Segmented label="Seuils" value={g.thresholds} onChange={(thresholds) => set({ thresholds })} options={[['classic', '0,05 · 0,01 · 0,001'], ['gp', 'Prism (0,0332…)']]} />}
            </>
          )}
          <p className="hint">{ds.kind === 'survival' ? 'P du log-rank, en bas à droite.' : 'Comparaisons de l’analyse (post-tests) ; * P < 0,05, ** P < 0,01, *** P < 0,001, **** P < 0,0001.'}</p>
        </Section>
      )}

      <Section title="Axes">
        <div className="st-pair">
          <label className="field"><span>Y min</span><input inputMode="decimal" value={g.yMin} placeholder="auto" onChange={(e) => set({ yMin: e.target.value }, { key: 'ymin' })} /></label>
          <label className="field"><span>Y max</span><input inputMode="decimal" value={g.yMax} placeholder="auto" onChange={(e) => set({ yMax: e.target.value }, { key: 'ymax' })} /></label>
        </div>
        {ds.kind !== 'contingency' && ds.kind !== 'survival' && <Check checked={g.yLog} onChange={(yLog) => set({ yLog })}>Échelle logarithmique en Y</Check>}
        {ds.kind === 'xy' && <Check checked={g.xLog} onChange={(xLog) => set({ xLog })}>Échelle logarithmique en X (concentrations)</Check>}
        {(ds.kind === 'contingency' || ds.kind === 'survival') && <Check checked={g.percent} onChange={(percent) => set({ percent })}>En pourcentage</Check>}
        {ds.kind === 'survival' && <Check checked={g.censorTicks} onChange={(censorTicks) => set({ censorTicks })}>Marquer les données censurées</Check>}
      </Section>

      <Section title="Couleurs">
        <label className="field">
          <span>Palette</span>
          <select value={g.palette} onChange={(e) => set({ palette: e.target.value, colors: {} })}>
            {Object.entries(PALETTES).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
          </select>
        </label>
        <ul className="st-colors">
          {series.map((c, i) => (
            <li key={c.id}>
              <input type="color" value={g.colors?.[c.id] || pal.colors[ds.columns.indexOf(c) % pal.colors.length] || pal.colors[i % pal.colors.length]} onChange={(e) => set({ colors: { ...g.colors, [c.id]: e.target.value } }, { key: `color-${c.id}` })} aria-label={`Couleur de ${c.name}`} />
              <span>{c.name}</span>
            </li>
          ))}
        </ul>
        {['bar', 'box', 'violin', 'groupedBar', 'stacked', 'grouped'].includes(g.type) && (
          <Segmented label="Remplissage" value={g.fill} onChange={(fill) => set({ fill })} options={[['solid', 'Plein'], ['light', 'Clair'], ['none', 'Vide']]} />
        )}
        {(ds.kind !== 'column') && <Segmented label="Légende" value={g.legend} onChange={(legend) => set({ legend })} options={[['right', 'À droite'], ['top', 'Au-dessus'], ['inside', 'Dedans'], ['none', 'Aucune']]} />}
      </Section>

      <Section title="Taille et texte">
        <div className="st-pair">
          <Range label="Largeur" value={g.width} min={260} max={1200} step={10} format={(v) => `${v} px`} onChange={(width) => set({ width }, { key: 'gw' })} />
          <Range label="Hauteur" value={g.height} min={200} max={1000} step={10} format={(v) => `${v} px`} onChange={(height) => set({ height }, { key: 'gh' })} />
        </div>
        <Segmented label="Police" value={g.font} onChange={(font) => set({ font })} options={[['sans', 'Sans empattement'], ['serif', 'Avec empattement']]} />
        <Range label="Taille du texte" value={g.fontSize} min={8} max={28} step={1} format={(v) => `${v} px`} onChange={(fontSize) => set({ fontSize }, { key: 'gfs' })} />
        <Range label="Épaisseur des traits" value={g.lineWidth} min={0.5} max={5} step={0.1} format={(v) => `${v.toLocaleString('fr-FR')} px`} onChange={(lineWidth) => set({ lineWidth }, { key: 'glw' })} />
      </Section>
    </>
  );
}

/** Petits pictogrammes des types de graphiques. */
function TypeIcon({ type }) {
  const s = { width: 34, height: 26, viewBox: '0 0 34 26', 'aria-hidden': true };
  const c = 'currentColor';
  switch (type) {
    case 'bar': return <svg {...s}><rect x="4" y="10" width="7" height="14" fill={c} opacity=".35" stroke={c} /><rect x="14" y="5" width="7" height="19" fill={c} opacity=".35" stroke={c} /><rect x="24" y="13" width="7" height="11" fill={c} opacity=".35" stroke={c} /></svg>;
    case 'box': return <svg {...s}><line x1="9" x2="9" y1="3" y2="23" stroke={c} /><rect x="5" y="8" width="8" height="9" fill="#fff" stroke={c} /><line x1="5" x2="13" y1="12" y2="12" stroke={c} strokeWidth="2" /><line x1="24" x2="24" y1="6" y2="22" stroke={c} /><rect x="20" y="10" width="8" height="8" fill="#fff" stroke={c} /><line x1="20" x2="28" y1="14" y2="14" stroke={c} strokeWidth="2" /></svg>;
    case 'violin': return <svg {...s}><path d="M9 3 C4 9 14 12 9 23 C4 12 14 9 9 3Z" fill={c} opacity=".35" stroke={c} /><path d="M24 5 C19 11 29 14 24 22 C19 14 29 11 24 5Z" fill={c} opacity=".35" stroke={c} /></svg>;
    case 'meanerr': return <svg {...s}><line x1="9" x2="9" y1="6" y2="18" stroke={c} /><rect x="7" y="10" width="4" height="4" fill={c} /><line x1="24" x2="24" y1="9" y2="21" stroke={c} /><rect x="22" y="13" width="4" height="4" fill={c} /></svg>;
    case 'xy': return <svg {...s}><path d="M3 22 C12 22 14 4 31 4" fill="none" stroke={c} /><circle cx="6" cy="21" r="2" fill={c} /><circle cx="15" cy="14" r="2" fill={c} /><circle cx="24" cy="6" r="2" fill={c} /></svg>;
    case 'groupedBar': case 'grouped': return <svg {...s}><rect x="3" y="9" width="5" height="15" fill={c} opacity=".35" stroke={c} /><rect x="9" y="13" width="5" height="11" fill={c} stroke={c} /><rect x="19" y="5" width="5" height="19" fill={c} opacity=".35" stroke={c} /><rect x="25" y="11" width="5" height="13" fill={c} stroke={c} /></svg>;
    case 'groupedDots': return <svg {...s}><circle cx="6" cy="10" r="2" fill={c} /><circle cx="6" cy="15" r="2" fill={c} /><circle cx="12" cy="17" r="2" fill="none" stroke={c} /><circle cx="22" cy="6" r="2" fill={c} /><circle cx="22" cy="11" r="2" fill={c} /><circle cx="28" cy="14" r="2" fill="none" stroke={c} /></svg>;
    case 'line': return <svg {...s}><path d="M4 20 L13 10 L22 6 L31 12" fill="none" stroke={c} /><path d="M4 21 L13 17 L22 15 L31 18" fill="none" stroke={c} strokeDasharray="3 2" /></svg>;
    case 'stacked': return <svg {...s}><rect x="6" y="4" width="8" height="20" fill="#fff" stroke={c} /><rect x="6" y="14" width="8" height="10" fill={c} opacity=".5" /><rect x="20" y="4" width="8" height="20" fill="#fff" stroke={c} /><rect x="20" y="9" width="8" height="15" fill={c} opacity=".5" /></svg>;
    case 'km': return <svg {...s}><path d="M3 4 H9 V9 H15 V14 H23 V19 H31" fill="none" stroke={c} /><path d="M3 4 H13 V7 H21 V10 H31" fill="none" stroke={c} strokeDasharray="3 2" /></svg>;
    default: return <svg {...s}><circle cx="8" cy="10" r="2" fill={c} /><circle cx="10" cy="14" r="2" fill={c} /><circle cx="7" cy="17" r="2" fill={c} /><line x1="4" x2="13" y1="13" y2="13" stroke={c} strokeWidth="2" /><circle cx="24" cy="6" r="2" fill={c} /><circle cx="26" cy="10" r="2" fill={c} /><circle cx="22" cy="12" r="2" fill={c} /><line x1="19" x2="29" y1="9" y2="9" stroke={c} strokeWidth="2" /></svg>;
  }
}
