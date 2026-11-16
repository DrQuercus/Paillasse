import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatNumber } from '../../../lib/calc/units.js';
import { formatSize } from '../../../lib/gel/calibration.js';
import { MODES, VALUE_MODES, laneName } from '../../../lib/gel/model.js';
import { Check, More, Segmented } from '../controls.jsx';
import ExpectedDialog from './ExpectedDialog.jsx';

const SHORT_VALUES = { area: 'Aires', percent: '% de la piste', relative: '% de la référence', normalized: 'Normalisé', amount: 'Quantités' };

export function quantSummary(ctx) {
  const { state, results } = ctx;
  const q = state.quant;
  const parts = [SHORT_VALUES[q.values] ?? VALUE_MODES[q.values]];
  if (q.values === 'normalized' && results?.loadingGroup) parts[0] += ` par ${results.rows.find((r) => r.isLoadingControl)?.label ?? 'le contrôle'}`;
  if (results?.standard) parts.push(`gamme R² ${formatNumber(results.standard.r2, 3)}`);
  if (state.expected.length) parts.push(`${state.expected.length} attendu${state.expected.length > 1 ? 's' : ''}`);
  return parts.join(' · ');
}

/** Valeurs du tableau, gamme étalon, tailles attendues. */
export default function QuantModule({ ctx }) {
  const { state, update, results } = ctx;
  const [addingExpected, setAddingExpected] = useState(false);
  const mode = MODES[state.mode];
  const q = state.quant;
  const st = q.standards;
  const setQuant = (patch) => update((s) => ({ ...s, quant: { ...s.quant, ...patch } }));
  const setStd = (patch) => update((s) => ({ ...s, quant: { ...s.quant, standards: { ...s.quant.standards, ...patch } } }), { key: 'std' });
  const groups = results?.rows ?? [];
  const groupRef = (row) => ({ pos: row.group.pos, size: row.group.size });
  const selectedGroup = (ref) => (ref ? groups.findIndex((r) => (ref.size && r.group.size ? Math.abs(Math.log(r.group.size / ref.size)) < 0.06 : Math.abs(r.group.pos - ref.pos) < 12)) : -1);
  const sampleLanes = state.lanes.filter((l) => l.role !== 'ladder');
  const ladderHasMasses = state.calibration.ladder?.bands?.some((b) => b.mass > 0);
  const autoStd = results?.standardAuto ? groups.find((r) => r.group === results.standardGroup) : null;
  const presence = (r) => { const n = Object.keys(r.group.members).length; return `${n} piste${n > 1 ? 's' : ''}`; };

  return (
    <>
      <label className="field">
        <span>Valeurs du tableau</span>
        <select value={q.values} onChange={(e) => setQuant({ values: e.target.value })}>
          {Object.entries(VALUE_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {(q.values === 'relative' || q.values === 'normalized') && (
        <label className="field">
          <span>Piste de référence (= 100 % ou 1)</span>
          <select value={q.referenceLane ?? ''} onChange={(e) => setQuant({ referenceLane: e.target.value || null })}>
            <option value="">{q.values === 'normalized' ? 'Aucune (rapport brut)' : '— Choisir —'}</option>
            {sampleLanes.map((l) => <option key={l.id} value={l.id}>Piste {laneName(l, state.lanes.indexOf(l))}</option>)}
          </select>
        </label>
      )}
      {q.values === 'normalized' && (
        <label className="field">
          <span>Contrôle de charge</span>
          <select value={selectedGroup(q.loadingControl)} onChange={(e) => setQuant({ loadingControl: Number(e.target.value) >= 0 ? groupRef(groups[Number(e.target.value)]) : null })}>
            <option value={-1}>— Bande de référence (actine, GAPDH…) —</option>
            {groups.map((r, i) => <option key={r.group.pos} value={i}>{r.label}</option>)}
          </select>
        </label>
      )}
      <small className="hint">Nommez une bande (GAPDH, p-ERK…) dans l’onglet « Tableau », à droite.</small>

      <More title="Gamme étalon" open={st.source !== 'none'} aside={results?.standard ? <span className="gel-badge">R² {formatNumber(results.standard.r2, 3)}</span> : null}>
        <Segmented
          label="Gamme étalon"
          value={st.source}
          onChange={(source) => setStd({ source })}
          options={[['none', 'Aucune'], ['group', 'Pistes de gamme'], ...(state.mode === 'dna' || ladderHasMasses ? [['ladder', 'Masses du marqueur']] : [])]}
        />
        {st.source === 'group' && (
          <>
            <label className="field">
              <span>Bande de la gamme</span>
              <select value={selectedGroup(st.group)} onChange={(e) => setStd({ group: Number(e.target.value) >= 0 ? groupRef(groups[Number(e.target.value)]) : null })}>
                <option value={-1}>{autoStd ? `Automatique : ${autoStd.label}` : '— Choisir la bande (ex. BSA) —'}</option>
                {groups.map((r, i) => <option key={r.group.pos} value={i}>{r.label} · {presence(r)}</option>)}
              </select>
            </label>
            <small className="hint">Quantité déposée ({mode.amountUnit}) dans chaque piste de gamme ; laissez vides les autres.</small>
            <div className="gel-amounts">
              {sampleLanes.map((l) => (
                <label key={l.id}>
                  <span>Piste {laneName(l, state.lanes.indexOf(l))}</span>
                  <input inputMode="decimal" value={st.amounts?.[l.id] ?? ''} onChange={(e) => setStd({ amounts: { ...st.amounts, [l.id]: e.target.value } })} placeholder="—" />
                </label>
              ))}
            </div>
          </>
        )}
        {st.source === 'ladder' && (
          <>
            {!ladderHasMasses && <p className="gel-note is-warn">Le marqueur choisi n’a pas de masses par bande : complétez-les dans « Gérer les marqueurs » (fiche du fabricant).</p>}
            <label className="field">
              <span>Quantité de marqueur déposée ({mode.amountUnit})</span>
              <input inputMode="decimal" value={st.loaded ?? ''} placeholder={state.calibration.ladder?.load ? String(state.calibration.ladder.load).replace('.', ',') : ''} onChange={(e) => setStd({ loaded: e.target.value })} />
            </label>
          </>
        )}
        {st.source !== 'none' && (
          <>
            <Check checked={q.throughOrigin !== false} onChange={(throughOrigin) => setQuant({ throughOrigin })}>Droite passant par l’origine</Check>
            {results?.standard
              ? (
                <p className={`gel-note${results.standard.r2 >= 0.95 ? ' is-ok' : ' is-warn'}`}>
                  {results.standard.n} point{results.standard.n > 1 ? 's' : ''}, R² = {formatNumber(results.standard.r2, 3)}.
                  {q.values !== 'amount' && <> <button type="button" className="link-btn small" onClick={() => setQuant({ values: 'amount' })}>Afficher les quantités</button></>}
                </p>
              )
              : <p className="gel-note">Il faut au moins un point (deux sans l’origine).</p>}
          </>
        )}
      </More>

      <More title="Tailles attendues" open={state.expected.length > 0} aside={state.expected.length ? <span className="gel-badge">{state.expected.length}</span> : null}>
        <small className="hint">{state.mode === 'dna' ? 'PCR ou digestion d’une séquence du registre : les tailles attendues sont marquées sur le gel.' : 'Masse calculée depuis un CDS du registre (ou saisie), comparée à la taille apparente.'}</small>
        {state.expected.length > 0 && (
          <ul className="gel-curves">
            {state.expected.map((e) => (
              <li key={e.id}>
                <span><strong>{e.label}</strong> · {e.sizes.map((x) => formatSize(x, mode.unit)).join(', ')}{e.laneId ? ` · piste ${laneName(state.lanes.find((l) => l.id === e.laneId) ?? {}, state.lanes.findIndex((l) => l.id === e.laneId))}` : ''}</span>
                <button type="button" className="icon-btn" onClick={() => update((s) => ({ ...s, expected: s.expected.filter((x) => x.id !== e.id) }))} aria-label={`Retirer ${e.label}`}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-small gel-align-start" onClick={() => setAddingExpected(true)}><Plus size={15} /> Ajouter</button>
        {!results?.calibration && state.expected.length > 0 && <p className="gel-note">Étalonnez le gel (module Tailles) pour comparer.</p>}
      </More>
      {addingExpected && <ExpectedDialog state={state} onClose={() => setAddingExpected(false)} onAdd={(e) => update((s) => ({ ...s, expected: [...s.expected, e] }))} />}
    </>
  );
}
