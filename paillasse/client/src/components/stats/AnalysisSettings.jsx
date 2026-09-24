import { ANALYSES, POSTHOC, logXApplied, resolvedType } from '../../lib/stats/analysis.js';
import { MODELS } from '../../lib/stats/regression.js';
import { filledColumns } from '../../lib/stats/model.js';
import { Check, Section, Segmented } from '../gel/controls.jsx';

/** Comparaisons proposées après le test global, selon le test choisi. */
function posthocOptions(a) {
  if (!a.parametric) return [['tukey', 'Dunn (toutes les paires)'], ['dunnett', 'Dunn (contre un témoin)'], ['none', 'Aucune comparaison']];
  if (a.welch && !a.paired) return [['tukey', 'Games-Howell (toutes les paires)'], ['none', 'Aucune comparaison']];
  return Object.entries(POSTHOC);
}

/** Réglages de l'analyse, selon le type de tableau. */
export default function AnalysisSettings({ ds, update }) {
  const a = ds.analysis;
  const set = (patch, opts) => update((d) => ({ ...d, analysis: { ...d.analysis, ...patch } }), opts);
  const type = resolvedType(ds);
  const filled = filledColumns(ds);
  const chosen = (a.cols ?? []).filter((id) => filled.some((c) => c.id === id));
  const inCompare = chosen.length >= 2 ? chosen : filled.map((c) => c.id);

  return (
    <>
      <Section title="Analyse">
        <label className="field">
          <span>Que voulez-vous faire ?</span>
          <select value={a.type} onChange={(e) => set({ type: e.target.value })}>
            {Object.entries(ANALYSES[ds.kind]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {a.type === 'auto' && <p className="hint">Analyse retenue : {ANALYSES.column[type].toLowerCase()}.</p>}
      </Section>

      {ds.kind === 'column' && (type === 'compare2' || type === 'compareN') && (
        <Section title="Plan d’expérience">
          {type === 'compare2' ? (
            <div className="st-pair">
              {[0, 1].map((k) => (
                <label key={k} className="field">
                  <span>Colonne {k ? 'B' : 'A'}</span>
                  <select value={inCompare[k === 0 ? 0 : 1] ?? ''} onChange={(e) => { const next = [...inCompare.slice(0, 2)]; next[k === 0 ? 0 : 1] = e.target.value; set({ cols: next }); }}>
                    {filled.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          ) : (
            <div className="gel-lane-picks" role="group" aria-label="Colonnes comparées">
              {filled.map((c) => (
                <label key={c.id} className="chip-check">
                  <input type="checkbox" checked={inCompare.includes(c.id)} onChange={(e) => set({ cols: e.target.checked ? filled.filter((x) => x.id === c.id || inCompare.includes(x.id)).map((x) => x.id) : inCompare.filter((x) => x !== c.id) })} />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          )}
          <Segmented label="Mesures" value={a.paired ? 'paired' : 'independent'} onChange={(v) => set({ paired: v === 'paired' })} options={[['independent', 'Indépendantes'], ['paired', type === 'compare2' ? 'Appariées' : 'Répétées']]} />
          <p className="hint">{a.paired ? 'Chaque ligne est un même sujet (ou une même expérience) mesuré dans chaque colonne.' : 'Des sujets différents dans chaque colonne.'}</p>
          <Segmented label="Test" value={a.parametric ? 'param' : 'nonparam'} onChange={(v) => set({ parametric: v === 'param' })} options={[['param', 'Paramétrique'], ['nonparam', 'Non paramétrique']]} />
          <p className="hint">
            {a.parametric
              ? `Suppose des distributions à peu près normales (${type === 'compare2' ? (a.paired ? 'test t apparié' : 'test t') : a.paired ? 'ANOVA à mesures répétées' : 'ANOVA'}).`
              : `Sur les rangs, sans hypothèse de normalité (${type === 'compare2' ? (a.paired ? 'Wilcoxon' : 'Mann-Whitney') : a.paired ? 'Friedman' : 'Kruskal-Wallis'}).`}
          </p>
          {a.parametric && !a.paired && <Check checked={a.welch} onChange={(welch) => set({ welch })} hint="À cocher si les écarts-types diffèrent nettement d’une colonne à l’autre.">Correction de Welch (écarts-types différents)</Check>}
          {type === 'compareN' && (
            <>
              <label className="field">
                <span>Comparaisons multiples</span>
                <select value={a.posthoc} onChange={(e) => set({ posthoc: e.target.value })}>
                  {posthocOptions(a).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              {a.posthoc === 'dunnett' && !(a.welch && a.parametric && !a.paired) && (
                <label className="field">
                  <span>Témoin</span>
                  <select value={a.control ?? inCompare[0] ?? ''} onChange={(e) => set({ control: e.target.value })}>
                    {filled.filter((c) => inCompare.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
            </>
          )}
        </Section>
      )}

      {ds.kind === 'column' && type === 'onesample' && (
        <Section title="Valeur théorique">
          <label className="field"><span>Moyenne (ou médiane) attendue</span><input inputMode="decimal" value={a.hypothetical ?? ''} onChange={(e) => set({ hypothetical: e.target.value }, { key: 'hyp' })} /></label>
          <Segmented label="Test" value={a.parametric ? 'param' : 'nonparam'} onChange={(v) => set({ parametric: v === 'param' })} options={[['param', 'Test t'], ['nonparam', 'Wilcoxon']]} />
          <p className="hint">Par exemple 100 (% du témoin) ou 1 (rapport sans effet).</p>
        </Section>
      )}

      {ds.kind === 'xy' && a.type === 'nonlinear' && (
        <Section title="Modèle">
          <label className="field">
            <span>Équation</span>
            <select value={a.model} onChange={(e) => set({ model: e.target.value })}>
              {Object.entries(MODELS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </label>
          <p className="hint st-eq">{MODELS[a.model]?.equation}</p>
          {MODELS[a.model]?.logX && (
            <>
              <Segmented label="X = concentrations" value={a.logX} onChange={(logX) => set({ logX })} options={[['auto', 'Auto'], ['yes', 'Passer en log'], ['no', 'Déjà en log']]} />
              <p className="hint">{logXApplied(ds) ? 'Les concentrations sont converties en log10 pour l’ajustement ; l’EC50 est rendue en concentration.' : 'X est pris tel quel (déjà en log10).'}</p>
            </>
          )}
        </Section>
      )}
      {ds.kind === 'xy' && a.type === 'correlation' && (
        <Section title="Corrélation">
          <Segmented label="Coefficient" value={a.correlation} onChange={(correlation) => set({ correlation })} options={[['pearson', 'Pearson'], ['spearman', 'Spearman (rangs)']]} />
        </Section>
      )}
      {ds.kind === 'xy' && a.type !== 'correlation' && (
        <Section title="Courbe étalon" open={Boolean(a.unknowns)}>
          <label className="field">
            <span>Y d’échantillons inconnus</span>
            <textarea rows={3} value={a.unknowns ?? ''} onChange={(e) => set({ unknowns: e.target.value }, { key: 'unknowns' })} placeholder="0,42 ; 0,57 ; 0,81" />
          </label>
          <p className="hint">Les X correspondants (concentrations) sont lus sur la droite ou la courbe ajustée.</p>
        </Section>
      )}

      {ds.kind === 'grouped' && (
        <Section title="Comparaisons">
          <Segmented label="Comparer" value={a.within} onChange={(within) => set({ within })} options={[['rows', 'Colonnes, dans chaque ligne'], ['columns', 'Lignes, dans chaque colonne'], ['none', 'Aucune']]} />
          {a.within !== 'none' && (
            <label className="field">
              <span>Correction</span>
              <select value={a.method} onChange={(e) => set({ method: e.target.value })}>
                <option value="sidak">Šidák</option>
                <option value="tukey">Tukey</option>
                <option value="bonferroni">Bonferroni</option>
                <option value="fisher">Sans correction (LSD de Fisher)</option>
              </select>
            </label>
          )}
          <div className="st-pair">
            <label className="field"><span>Facteur des lignes</span><input value={ds.rowTitle ?? ''} placeholder="ex. Temps" onChange={(e) => update((d) => ({ ...d, rowTitle: e.target.value }), { key: 'rowTitle' })} /></label>
            <label className="field"><span>Facteur des colonnes</span><input value={ds.colTitle ?? ''} placeholder="ex. Génotype" onChange={(e) => update((d) => ({ ...d, colTitle: e.target.value }), { key: 'colTitle' })} /></label>
          </div>
        </Section>
      )}

      {ds.kind === 'contingency' && (
        <Section title="Options">
          <Check checked={a.yates} onChange={(yates) => set({ yates })} hint="Seulement pour un tableau 2 × 2 ; le test exact de Fisher est toujours donné.">Correction de Yates du χ²</Check>
          <p className="hint">Lignes : groupes (traité, témoin) ; colonnes : issues (événement, pas d’événement). Des effectifs, pas des pourcentages.</p>
        </Section>
      )}
      {ds.kind === 'survival' && (
        <Section title="Saisie">
          <p className="hint">Une ligne par sujet : son temps en X, puis 1 (événement : décès, rechute…) ou 0 (censuré : perdu de vue, fin de l’étude) dans la colonne de son groupe.</p>
        </Section>
      )}
    </>
  );
}
