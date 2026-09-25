import { useEffect, useId, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { CAP_COLORS, CAP_HEX, CAP_LABELS, SAMPLE_TYPES, posLabel } from '../../lib/inventory.js';
import { TYPE_SHORT, TypeIcon } from './bits.jsx';

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
 * Ranger un ou plusieurs tubes (aliquots), ou modifier un tube.
 * create : start (position de départ), free (places libres), onPreview(n) montre où iront les n tubes.
 */
export default function SampleForm({ initial, create = false, start = null, free = 1, bag = false, onPreview, onSubmit, onCancel }) {
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
