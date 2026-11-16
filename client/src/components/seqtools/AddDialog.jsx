import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { COLORS, FEATURE_TYPES, gc, nf, pos, rangeBases, rangeLength, revcomp } from '../../lib/dna.js';
import Modal from '../Modal.jsx';

/** Nouvelle annotation ou nouvelle amorce à partir de la région sélectionnée. */
export default function AddDialog({ kind, data, selection, onAdd, onClose }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('misc_feature');
  const [strand, setStrand] = useState(1);
  const [color, setColor] = useState(COLORS[5]);
  const [tm, setTm] = useState(null);
  const n = data.sequence.length;
  const length = rangeLength(selection.start, selection.end, n);
  const selected = rangeBases(data.sequence, selection.start, selection.end).toUpperCase();
  const bases = strand === -1 ? revcomp(selected) : selected;

  useEffect(() => {
    if (kind !== 'primer' || bases.length < 8) return;
    setTm(null);
    api.post('/tools/oligos/analyze', { oligos: [bases] }).then((r) => setTm(r.oligos[0].tm)).catch(() => {});
  }, [kind, bases]);

  const submit = (e) => {
    e.preventDefault();
    if (kind === 'feature') {
      onAdd({ name: name.trim(), type, strand: Number(strand), color, segments: [{ start: selection.start, end: selection.end }], notes: {} });
    } else {
      onAdd({
        name: name.trim(), bases, description: '', color: null,
        sites: [{ start: selection.start, end: selection.end, strand: Number(strand) === -1 ? -1 : 1, annealed: bases, ...(tm !== null ? { tm } : {}) }],
      });
    }
  };

  return (
    <Modal
      title={kind === 'feature' ? 'Nouvelle annotation' : 'Nouvelle amorce'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="add-form" className="btn btn-primary" disabled={!name.trim()}>Ajouter</button>
        </>
      )}
    >
      <form id="add-form" className="form-stack" onSubmit={submit}>
        <p className="small muted">Région {pos(selection.start)} – {pos(selection.end)} ({nf(length)} pb)</p>
        <label className="field">
          <span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder={kind === 'feature' ? 'ex. YukE' : 'ex. LR30_YukE_F'} />
        </label>
        {kind === 'feature' && (
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {FEATURE_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </label>
        )}
        <fieldset className="field">
          <legend>{kind === 'feature' ? 'Sens' : 'Amorce'}</legend>
          <div className="segmented">
            <label><input type="radio" name="strand" checked={strand === 1} onChange={() => setStrand(1)} /> <span>{kind === 'feature' ? 'Direct →' : 'Sens (brin affiché)'}</span></label>
            <label><input type="radio" name="strand" checked={strand === -1} onChange={() => setStrand(-1)} /> <span>{kind === 'feature' ? '← Inverse' : 'Antisens (complément inverse)'}</span></label>
            {kind === 'feature' && <label><input type="radio" name="strand" checked={strand === 0} onChange={() => setStrand(0)} /> <span>Sans direction</span></label>}
          </div>
        </fieldset>
        {kind === 'feature' ? (
          <fieldset className="field">
            <legend>Couleur</legend>
            <div className="swatches">
              {COLORS.map((c) => (
                <label key={c} className="swatch" style={{ '--swatch': c }}>
                  <input type="radio" name="color" checked={color === c} onChange={() => setColor(c)} />
                  <span aria-label={c} />
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <div className="field">
            <span>Séquence de l'amorce (5′ → 3′)</span>
            <code className="oligo-seq">{bases}</code>
            <span className="small muted">
              {bases.length} nt, GC {String(gc(bases)).replace('.', ',')} %{tm !== null && `, Tm ${String(tm).replace('.', ',')} °C`}
              {bases.length > 36 && ' (Tm calculé sur les 36 nt en 3′)'}
            </span>
          </div>
        )}
      </form>
    </Modal>
  );
}
