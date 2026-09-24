import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { hasAgar, newComponent, newMixItem } from '../../lib/calc/calculators.js';
import { MEDIA, MEDIA_CATEGORIES } from '../../lib/calc/media.js';
import { ALL_CONC_UNITS, MASS_CONC_UNITS, MOLAR_UNITS, VOLUME_UNITS } from '../../lib/calc/units.js';
import { newId } from '../../lib/ids.js';
import { LengthField, NumberField, QtyField, ReagentField, Segmented, TextField, reagentMw } from './fields.jsx';

const VOLUMES = Object.keys(VOLUME_UNITS);
const WEIGH_UNITS = [...MOLAR_UNITS, ...MASS_CONC_UNITS];

function MolarityForm({ p, set }) {
  return (
    <>
      <Segmented label="Calcul" value={p.mode} onChange={(mode) => set({ mode })} options={[['mass', 'Masse à peser'], ['conc', 'Concentration obtenue']]} />
      <div className="calc-row calc-row-product">
        <ReagentField
          value={p.reagent}
          onType={(reagent) => set({ reagent, formula: '' })}
          onPick={(r) => set({ reagent: r.name, formula: r.formula, mw: reagentMw(r) })}
        />
        <NumberField label="Masse molaire" unit="g/mol" value={p.mw} onChange={(mw) => set({ mw })} placeholder="58,44" />
      </div>
      <div className="calc-row">
        {p.mode === 'conc'
          ? <QtyField label="Masse pesée" units={['g', 'mg', 'µg']} value={p.mass} onChange={(mass) => set({ mass })} />
          : <QtyField label="Concentration voulue" units={WEIGH_UNITS} value={p.conc} onChange={(conc) => set({ conc })} />}
        <QtyField label="Volume final" units={VOLUMES} value={p.vol} onChange={(vol) => set({ vol })} />
      </div>
    </>
  );
}

function DilutionForm({ p, set }) {
  return (
    <>
      <ReagentField label="Produit (facultatif)" value={p.product} onType={(product) => set({ product })} onPick={(r) => set({ product: r.name })} />
      <div className="calc-row">
        <QtyField label="Solution mère (C₁)" units={ALL_CONC_UNITS} value={p.c1} onChange={(c1) => set({ c1 })} />
        <QtyField label="Concentration finale (C₂)" units={ALL_CONC_UNITS} value={p.c2} onChange={(c2) => set({ c2 })} />
      </div>
      <div className="calc-row">
        <QtyField label="Volume final (V₂)" units={VOLUMES} value={p.v2} onChange={(v2) => set({ v2 })} />
      </div>
    </>
  );
}

function SolutionForm({ p, set }) {
  const items = p.items ?? [];
  const update = (id, patch) => set({ items: items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  return (
    <>
      <div className="calc-row">
        <QtyField label="Volume final" units={VOLUMES} value={p.vol} onChange={(vol) => set({ vol })} />
      </div>
      <ol className="calc-items">
        {items.map((it, i) => (
          <li key={it.id} className="calc-item">
            <div className="calc-item-head">
              <ReagentField
                label={`Composant ${i + 1}`}
                value={it.name}
                onType={(name) => update(it.id, { name })}
                onPick={(r) => update(it.id, { name: r.name, mw: reagentMw(r) })}
              />
              <button type="button" className="icon-btn calc-item-remove" onClick={() => set({ items: items.filter((x) => x.id !== it.id) })} aria-label={`Retirer le composant ${i + 1}`} title="Retirer">
                <Trash2 size={15} />
              </button>
            </div>
            <Segmented
              label={`Source du composant ${i + 1}`}
              value={it.source}
              onChange={(source) => update(it.id, { source })}
              options={[['powder', 'Poudre à peser'], ['stock', 'Solution mère']]}
            />
            <div className="calc-row">
              {it.source === 'stock'
                ? <QtyField label="Solution mère" units={ALL_CONC_UNITS} value={it.stock} onChange={(stock) => update(it.id, { stock })} />
                : <NumberField label="Masse molaire" unit="g/mol" value={it.mw} onChange={(mw) => update(it.id, { mw })} />}
              <QtyField label="Concentration finale" units={ALL_CONC_UNITS} value={it.conc} onChange={(conc) => update(it.id, { conc })} />
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="btn btn-ghost calc-add" onClick={() => set({ items: [...items, newComponent(newId())] })}>
        <Plus size={15} /> Ajouter un composant
      </button>
    </>
  );
}

function MediumForm({ p, set }) {
  const medium = MEDIA.find((m) => m.name === p.medium);
  return (
    <>
      <label className="field">
        <span>Milieu</span>
        <select value={p.medium} onChange={(e) => set({ medium: e.target.value, agar: false })}>
          {MEDIA_CATEGORIES.map((cat) => (
            <optgroup key={cat} label={cat}>
              {MEDIA.filter((m) => m.category === cat).map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      {medium && (
        <details className="calc-about">
          <summary>À propos de ce milieu (pH {medium.ph})</summary>
          <p>{medium.note}</p>
        </details>
      )}
      <div className="calc-row">
        <QtyField label="Volume final" units={VOLUMES} value={p.vol} onChange={(vol) => set({ vol })} />
      </div>
      {medium && !hasAgar(medium) && (
        <label className="check">
          <input type="checkbox" checked={Boolean(p.agar)} onChange={(e) => set({ agar: e.target.checked })} />
          Milieu solide : ajouter 15 g/L d’agar
        </label>
      )}
    </>
  );
}

function MasterMixForm({ p, set }) {
  const items = p.items ?? [];
  const update = (id, patch) => set({ items: items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
  return (
    <>
      <div className="calc-row">
        <NumberField label="Nombre de réactions" value={p.reactions} onChange={(reactions) => set({ reactions })} integer />
        <NumberField label="Marge de pipetage" unit="%" value={p.surplus} onChange={(surplus) => set({ surplus })} hint="10 % couvre les pertes de pipetage." />
      </div>
      <table className="mix-table">
        <thead>
          <tr><th>Composant</th><th>µL par réaction</th><th>Hors mix</th><th><span className="sr-only">Retirer</span></th></tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id}>
              <td><input aria-label={`Composant ${i + 1}`} value={it.name} onChange={(e) => update(it.id, { name: e.target.value })} /></td>
              <td>
                <input
                  aria-label={`Volume par réaction, composant ${i + 1}`}
                  inputMode="decimal"
                  className="num"
                  value={it.vol}
                  onChange={(e) => update(it.id, { vol: e.target.value })}
                />
              </td>
              <td className="mix-check">
                <input
                  type="checkbox"
                  checked={Boolean(it.perTube)}
                  onChange={(e) => update(it.id, { perTube: e.target.checked })}
                  aria-label={`${it.name || `Composant ${i + 1}`} : ajouté dans chaque tube, hors du mix`}
                  title="Ajouté dans chaque tube (matrice, échantillon…)"
                />
              </td>
              <td>
                <button type="button" className="icon-btn" onClick={() => set({ items: items.filter((x) => x.id !== it.id) })} aria-label={`Retirer ${it.name || `le composant ${i + 1}`}`}>
                  <Trash2 size={15} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">Cochez « Hors mix » pour ce qui s’ajoute tube par tube (matrice, échantillon).</p>
      <button type="button" className="btn btn-ghost calc-add" onClick={() => set({ items: [...items, newMixItem(newId())] })}>
        <Plus size={15} /> Ajouter un composant
      </button>
    </>
  );
}

function DnaForm({ p, set }) {
  const unit = p.strand === 'ss' ? 'nt' : 'pb';
  return (
    <>
      <Segmented
        label="Calcul"
        value={p.mode}
        onChange={(mode) => set({ mode })}
        options={[['mass', 'Masse → moles'], ['moles', 'Moles → masse'], ['conc', 'ng/µL → nM']]}
      />
      <Segmented label="Type d'ADN" value={p.strand} onChange={(strand) => set({ strand })} options={[['ds', 'Double brin'], ['ss', 'Simple brin (oligo)']]} />
      <div className="calc-row">
        <LengthField label="Longueur" unit={unit} value={{ length: p.length, sequence: p.sequence }} onChange={(v) => set(v)} />
        {p.mode === 'mass' && <QtyField label="Masse" units={['ng', 'µg', 'mg']} value={p.mass} onChange={(mass) => set({ mass })} />}
        {p.mode === 'moles' && <QtyField label="Quantité" units={['fmol', 'pmol', 'nmol']} value={p.moles} onChange={(moles) => set({ moles })} />}
        {p.mode === 'conc' && <QtyField label="Concentration" units={['ng/µL', 'µg/mL', 'mg/mL']} value={p.conc} onChange={(conc) => set({ conc })} />}
      </div>
      <p className="hint">Masse moyenne : 660 g/mol par paire de bases, 330 g/mol par base en simple brin (sel de sodium).</p>
    </>
  );
}

function LigationForm({ p, set }) {
  const vector = p.vector ?? {};
  const insert = p.insert ?? {};
  return (
    <>
      <fieldset className="calc-group">
        <legend>Vecteur</legend>
        <div className="calc-row">
          <LengthField label="Longueur" value={{ length: vector.length, sequence: vector.sequence }} onChange={(v) => set({ vector: { ...vector, ...v } })} />
          <QtyField label="Masse engagée" units={['ng', 'µg']} value={vector.mass} onChange={(mass) => set({ vector: { ...vector, mass } })} />
        </div>
      </fieldset>
      <fieldset className="calc-group">
        <legend>Insert</legend>
        <div className="calc-row">
          <LengthField label="Longueur" value={{ length: insert.length, sequence: insert.sequence }} onChange={(v) => set({ insert: { ...insert, ...v } })} />
          <NumberField
            label="Rapport molaire insert / vecteur"
            unit=": 1"
            value={p.ratio}
            onChange={(ratio) => set({ ratio })}
            hint="Souvent 3 pour une ligation, 2 pour un assemblage Gibson ou HiFi."
          />
        </div>
      </fieldset>
    </>
  );
}

function CentrifugeForm({ p, set }) {
  return (
    <>
      <Segmented label="Calcul" value={p.mode} onChange={(mode) => set({ mode })} options={[['rpm', 'rpm → × g'], ['rcf', '× g → rpm']]} />
      <div className="calc-row">
        <NumberField label="Rayon du rotor" unit="mm" value={p.radius} onChange={(radius) => set({ radius })} placeholder="84" hint="Rayon maximal, indiqué sur le rotor ou dans sa notice." />
        {p.mode === 'rcf'
          ? <NumberField label="Accélération voulue" unit="× g" value={p.rcf} onChange={(rcf) => set({ rcf })} placeholder="16 000" />
          : <NumberField label="Vitesse" unit="rpm" value={p.rpm} onChange={(rpm) => set({ rpm })} placeholder="13 000" />}
      </div>
    </>
  );
}

const FORMS = {
  molarity: MolarityForm,
  dilution: DilutionForm,
  solution: SolutionForm,
  medium: MediumForm,
  mastermix: MasterMixForm,
  dna: DnaForm,
  ligation: LigationForm,
  centrifuge: CentrifugeForm,
};

/** Formulaire d'un calculateur. Les paramètres restent des chaînes, telles que saisies. */
export default function CalcForm({ kind, params, onChange }) {
  const Form = FORMS[kind];
  const set = useMemo(() => (patch) => onChange({ ...params, ...patch }), [params, onChange]);
  if (!Form) return <p className="form-error">Calcul inconnu.</p>;
  return (
    <div className="calc-form">
      <TextField label="Libellé (facultatif)" value={params.label} onChange={(label) => set({ label })} placeholder="Ex. : stock IPTG 1 M, tampon de lyse…" />
      <Form p={params} set={set} />
    </div>
  );
}
