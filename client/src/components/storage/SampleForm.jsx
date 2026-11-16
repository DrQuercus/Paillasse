import { useEffect, useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { CAP_COLORS, CAP_HEX, CAP_LABELS, SAMPLE_TYPES, positionLabel, posLabel } from '../../lib/inventory.js';
import { TYPE_SHORT, TypeIcon } from './bits.jsx';
import { GRID_SUPPORTS, ScreeningChips } from './cryo.jsx';
import { Segmented } from '../calc/fields.jsx';

const today = () => new Date().toISOString().slice(0, 10);

export const emptySample = () => ({
  name: '', type: 'plasmid', cap_color: '', concentration: '', volume: '', frozen_on: today(), expires_on: '',
  project_id: '', sequence_id: '', entry_id: '', notes: '',
});

/** Séquence du registre liée au tube (plasmide, construction). */
function SequenceField({ value, onChange }) {
  const listId = useId();
  const [list, setList] = useState([]);
  const [text, setText] = useState('');
  useEffect(() => {
    api.get('/sequences').then((l) => {
      setList(l);
      const cur = l.find((s) => s.id === value);
      if (cur) setText(`${cur.code} · ${cur.name}`);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="field">
      <span>Séquence du registre</span>
      <input
        list={listId}
        value={text}
        placeholder="SEQ-… (facultatif)"
        onChange={(e) => {
          setText(e.target.value);
          const hit = list.find((s) => `${s.code} · ${s.name}` === e.target.value || s.code.toLowerCase() === e.target.value.trim().toLowerCase());
          onChange(hit?.id ?? '');
        }}
      />
      <datalist id={listId}>{list.slice(0, 300).map((s) => <option key={s.id} value={`${s.code} · ${s.name}`} />)}</datalist>
    </label>
  );
}

/**
 * Ranger un ou plusieurs tubes (aliquots) ou grilles, ou modifier un échantillon.
 * create : start (position de départ), free (places libres), onPreview(n) montre où iront les n tubes.
 */
// Conditions de la dernière série de grilles : reprises pour la suivante (même journée de vitrification)
const LAST_GRID = 'paillasse.grid.last';
const lastGridDetails = () => {
  try {
    const d = JSON.parse(localStorage.getItem(LAST_GRID) ?? '{}');
    return { ...d, screening: 'todo', session: '' };
  } catch {
    return { screening: 'todo' };
  }
};

export default function SampleForm(props) {
  const { initial, box } = props;
  if (box?.kind === 'gridbox' || initial?.type === 'grid') return <GridForm {...props} />;
  return <TubeForm {...props} />;
}

/** Conditions de préparation d'une grille de cryo-EM ; plusieurs grilles d'un coup. */
function GridForm({ initial, create = false, start = null, box, occupied = new Set(), onStart, onPreview, onSubmit, onCancel }) {
  const { projects } = useApp();
  const listId = useId();
  const [f, setF] = useState(() => ({
    ...emptySample(), ...initial, type: 'grid',
    details: { ...(create && !initial?.details ? lastGridDetails() : { screening: 'todo' }), ...(initial?.details ?? {}) },
  }));
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const mixed = box?.format === 'g4c4';
  const [half, setHalf] = useState((start?.col ?? 0) < 4 ? 'C' : 'N');
  const cols = box?.cols ?? 4;
  // Positions de la moitié choisie (clippées C1–C4 ou non clippées N1–N4), sinon toute la boîte
  const range = mixed ? (half === 'C' ? [0, 4] : [4, 8]) : [0, cols];
  const from = Math.max(range[0], Math.min(range[1] - 1, start?.col ?? range[0]));
  const freeAfter = Array.from({ length: range[1] - from }, (_, k) => from + k).filter((c) => !occupied.has(`0,${c}`)).length;
  const max = Math.max(1, freeAfter);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setD = (k) => (e) => setF((x) => ({ ...x, details: { ...x.details, [k]: e.target.value } }));

  useEffect(() => { if (count > max) setCount(max); }, [max]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (create) onPreview?.(Math.min(count, max)); }, [count, max, create, start?.col]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview?.(0), []); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseHalf = (h) => {
    setHalf(h);
    const [a, b] = h === 'C' ? [0, 4] : [4, 8];
    const first = Array.from({ length: b - a }, (_, k) => a + k).find((c) => !occupied.has(`0,${c}`));
    if (first != null) onStart?.({ row: 0, col: first });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      if (create) {
        const { screening, session, ...keep } = f.details;
        try { localStorage.setItem(LAST_GRID, JSON.stringify(keep)); } catch { /* stockage local indisponible */ }
      }
      await onSubmit(f, Math.min(count, max));
    } finally {
      setBusy(false);
    }
  };
  const d = f.details;
  const n = Math.min(count, max);

  return (
    <form className="sample-form grid-form" onSubmit={submit}>
      <label className="field">
        <span>Échantillon</span>
        <input value={f.name} onChange={set('name')} placeholder="ex. Apoferritine, complexe X + ligand Y" autoFocus required />
      </label>
      <div className="field-row">
        <label className="field"><span>Concentration</span><input value={f.concentration} onChange={set('concentration')} placeholder="ex. 3 mg/mL, 4 µM" /></label>
        <label className="field"><span>Additif</span><input value={d.additive ?? ''} onChange={setD('additive')} placeholder="ex. 0,05 % CHAPSO" /></label>
      </div>
      <label className="field">
        <span>Support</span>
        <input list={listId} value={d.support ?? ''} onChange={setD('support')} placeholder="ex. Quantifoil R1.2/1.3 Cu 300" />
        <datalist id={listId}>{GRID_SUPPORTS.map((x) => <option key={x} value={x} />)}</datalist>
      </label>
      <label className="field"><span>Glow discharge</span><input value={d.glow ?? ''} onChange={setD('glow')} placeholder="ex. 15 mA, 30 s, air" /></label>
      <fieldset className="field vitro">
        <legend>Vitrification</legend>
        <div className="vitro-grid">
          <label><span>Appareil</span><input value={d.instrument ?? ''} onChange={setD('instrument')} placeholder="Vitrobot Mark IV" /></label>
          <label><span>Blot (s)</span><input value={d.blot_time ?? ''} onChange={setD('blot_time')} placeholder="4" inputMode="decimal" /></label>
          <label><span>Force</span><input value={d.blot_force ?? ''} onChange={setD('blot_force')} placeholder="0" inputMode="decimal" /></label>
          <label><span>Humidité</span><input value={d.humidity ?? ''} onChange={setD('humidity')} placeholder="100 %" /></label>
          <label><span>Température</span><input value={d.chamber_temp ?? ''} onChange={setD('chamber_temp')} placeholder="4 °C" /></label>
        </div>
      </fieldset>
      <div className="field-row">
        <label className="field"><span>Vitrifiée le</span><input type="date" value={f.frozen_on ?? ''} onChange={set('frozen_on')} /></label>
        <label className="field"><span>Session, jeu de données</span><input value={d.session ?? ''} onChange={setD('session')} placeholder="ex. Krios 12/09, EMPIAR…" /></label>
      </div>
      <div className="field">
        <span>Criblage</span>
        <ScreeningChips value={d.screening ?? 'todo'} onChange={(v) => setF((x) => ({ ...x, details: { ...x.details, screening: v } }))} />
      </div>
      {create && (
        <div className="field">
          <span>Nombre de grilles</span>
          {mixed && <Segmented label="Grilles clippées ou non" value={half} onChange={chooseHalf} options={[['C', 'Clippées (C1–C4)'], ['N', 'Non clippées (N1–N4)']]} />}
          <div className="stepper">
            <button type="button" className="icon-btn" onClick={() => setCount((k) => Math.max(1, k - 1))} aria-label="Une grille de moins"><Minus size={14} /></button>
            <input type="number" min="1" max={max} value={n} onChange={(e) => setCount(Math.max(1, Math.min(max, Math.trunc(Number(e.target.value)) || 1)))} aria-label="Nombre de grilles" />
            <button type="button" className="icon-btn" onClick={() => setCount((k) => Math.min(max, k + 1))} aria-label="Une grille de plus"><Plus size={14} /></button>
            <span className="hint">à partir de {positionLabel(box, 0, from)} ({freeAfter} libre{freeAfter > 1 ? 's' : ''})</span>
          </div>
        </div>
      )}
      <div className="field-row">
        <label className="field">
          <span>Projet</span>
          <select value={f.project_id ?? ''} onChange={set('project_id')}>
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <SequenceField value={f.sequence_id} onChange={(id) => setF((x) => ({ ...x, sequence_id: id }))} />
      </div>
      <label className="field"><span>Notes</span><textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Tampon, observation, qui a vitrifié…" /></label>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !f.name.trim()}>
          {create ? (n > 1 ? `Ranger ${n} grilles` : 'Ranger la grille') : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

/** Tubes : type, bouchon, concentration, dates ; plusieurs aliquots d'un coup. */
function TubeForm({ initial, create = false, start = null, free = 1, bag = false, onPreview, onSubmit, onCancel }) {
  const { projects } = useApp();
  const [f, setF] = useState(() => ({ ...emptySample(), ...initial }));
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const max = bag ? 200 : Math.max(1, Math.min(200, free));

  useEffect(() => { if (create) onPreview?.(count); }, [count, create]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onPreview?.(0), []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      await onSubmit(f, count);
    } finally {
      setBusy(false);
    }
  };
  const cap = f.cap_color || SAMPLE_TYPES[f.type]?.cap;

  return (
    <form className="sample-form" onSubmit={submit}>
      <label className="field">
        <span>Nom</span>
        <input value={f.name} onChange={set('name')} placeholder="ex. pUC19-GFP miniprep, BL21 glycérol" autoFocus required />
      </label>
      <div className="field">
        <span>Type</span>
        <div className="type-chips" role="radiogroup" aria-label="Type d’échantillon">
          {Object.keys(SAMPLE_TYPES).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={f.type === t} className={`type-chip${f.type === t ? ' is-active' : ''}`} onClick={() => setF((x) => ({ ...x, type: t }))} title={SAMPLE_TYPES[t].label}>
              <TypeIcon type={t} size={13} /> {TYPE_SHORT[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Bouchon</span>
        <div className="swatches caps" role="radiogroup" aria-label="Couleur du bouchon">
          {CAP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={cap === c}
              className={`swatch cap-swatch${cap === c ? ' is-active' : ''}`}
              style={{ '--cap': CAP_HEX[c] }}
              onClick={() => setF((x) => ({ ...x, cap_color: c === SAMPLE_TYPES[x.type]?.cap ? '' : c }))}
              title={CAP_LABELS[c]}
              aria-label={CAP_LABELS[c]}
            />
          ))}
        </div>
      </div>
      <div className="field-row">
        <label className="field"><span>Concentration</span><input value={f.concentration} onChange={set('concentration')} placeholder="ex. 250 ng/µL, 2 mg/mL, 10⁷ cellules" /></label>
        <label className="field"><span>Volume</span><input value={f.volume} onChange={set('volume')} placeholder="ex. 50 µL" /></label>
      </div>
      <div className="field-row">
        <label className="field"><span>Congelé le</span><input type="date" value={f.frozen_on ?? ''} onChange={set('frozen_on')} /></label>
        <label className="field"><span>Périme le</span><input type="date" value={f.expires_on ?? ''} onChange={set('expires_on')} /></label>
      </div>
      {create && (
        <div className="field">
          <span>Nombre de tubes (aliquots)</span>
          <div className="stepper">
            <button type="button" className="icon-btn" onClick={() => setCount((n) => Math.max(1, n - 1))} aria-label="Un tube de moins"><Minus size={14} /></button>
            <input type="number" min="1" max={max} value={count} onChange={(e) => setCount(Math.max(1, Math.min(max, Math.trunc(Number(e.target.value)) || 1)))} aria-label="Nombre de tubes" />
            <button type="button" className="icon-btn" onClick={() => setCount((n) => Math.min(max, n + 1))} aria-label="Un tube de plus"><Plus size={14} /></button>
            <span className="hint">{bag ? 'dans le sac' : `à partir de ${posLabel(start?.row ?? 0, start?.col ?? 0)}, places libres suivantes (${free} libres)`}</span>
          </div>
        </div>
      )}
      <div className="field-row">
        <label className="field">
          <span>Projet</span>
          <select value={f.project_id ?? ''} onChange={set('project_id')}>
            <option value="">—</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <SequenceField value={f.sequence_id} onChange={(id) => setF((x) => ({ ...x, sequence_id: id }))} />
      </div>
      <label className="field"><span>Notes</span><textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="Souche, passage, tampon, remarque…" /></label>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !f.name.trim()}>
          {create ? (count > 1 ? `Ranger ${count} tubes` : 'Ranger le tube') : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
