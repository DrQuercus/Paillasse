import { useMemo, useState } from 'react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { SAMPLE_TYPES, posLabel, readPasted } from '../../lib/inventory.js';
import Modal from '../Modal.jsx';
import { TYPE_SHORT, TypeIcon } from './bits.jsx';

/** Coller le plan d'une boîte depuis Excel : chaque case remplie devient un tube. */
export default function PasteDialog({ box, samples, onClose, onDone }) {
  const { notify } = useApp();
  const [text, setText] = useState('');
  const [type, setType] = useState('plasmid');
  const [busy, setBusy] = useState(false);
  const taken = useMemo(() => new Set(samples.filter((s) => s.row != null).map((s) => `${s.row},${s.col}`)), [samples]);
  const tubes = useMemo(() => readPasted(text, box).map((t) => ({
    ...t,
    outside: t.outside || t.row >= box.rows || t.col >= box.cols,
    taken: taken.has(`${t.row},${t.col}`),
  })), [text, box, taken]);
  const ok = tubes.filter((t) => !t.outside && !t.taken);
  const at = new Map(tubes.map((t) => [`${t.row},${t.col}`, t]));

  const submit = async () => {
    setBusy(true);
    try {
      await api.post('/inventory/samples', { unit_id: box.id, items: ok.map((t) => ({ row: t.row, col: t.col, name: t.name, type, concentration: t.concentration, volume: t.volume })) });
      notify(`${ok.length} tube${ok.length > 1 ? 's' : ''} rangé${ok.length > 1 ? 's' : ''} dans « ${box.name} ».`, 'success');
      onDone();
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Coller le plan de « ${box.name} »`}
      onClose={onClose}
      wide
      footer={(
        <>
          <span className="modal-foot-note">
            {ok.length} tube{ok.length > 1 ? 's' : ''} à ranger
            {tubes.some((t) => t.taken) ? ` · ${tubes.filter((t) => t.taken).length} sur des places déjà prises (ignorés)` : ''}
            {tubes.some((t) => t.outside) ? ` · ${tubes.filter((t) => t.outside).length} hors de la boîte (ignorés)` : ''}
          </span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" disabled={busy || !ok.length} onClick={submit}>Ranger {ok.length} tube{ok.length > 1 ? 's' : ''}</button>
        </>
      )}
    >
      <div className="paste-layout">
        <div className="form-stack">
          <p className="hint">Copiez dans Excel le plan de la boîte (une case = un tube ; les en-têtes 1, 2, 3… et A, B, C… sont reconnus), ou une liste « position, nom, concentration, volume », puis collez ici.</p>
          <textarea className="paste-area" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'\t1\t2\t3\nA\tpUC19\tpET28a\t\nB\tGFP-1\tGFP-2\tGFP-3\n\nou :\nA1\tpUC19\t250 ng/µL\nA2\tpET28a\t180 ng/µL'} aria-label="Plan de la boîte collé depuis Excel" autoFocus />
          <div className="field">
            <span>Type des tubes</span>
            <div className="type-chips">
              {Object.keys(SAMPLE_TYPES).map((t) => (
                <button key={t} type="button" className={`type-chip${type === t ? ' is-active' : ''}`} aria-pressed={type === t} onClick={() => setType(t)}><TypeIcon type={t} size={13} /> {TYPE_SHORT[t]}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="paste-preview" style={{ gridTemplateColumns: `1.2rem repeat(${box.cols}, minmax(0, 1fr))` }} aria-label="Aperçu">
          <span />
          {Array.from({ length: box.cols }, (_, c) => <span key={c} className="pick-h">{c + 1}</span>)}
          {Array.from({ length: box.rows }, (_, r) => [
            <span key={`h${r}`} className="pick-h">{String.fromCharCode(65 + r)}</span>,
            ...Array.from({ length: box.cols }, (__, c) => {
              const t = at.get(`${r},${c}`);
              const busyCell = taken.has(`${r},${c}`);
              return (
                <span key={`${r}-${c}`} className={`paste-cell${t ? ' has-name' : ''}${t?.taken ? ' is-conflict' : ''}${!t && busyCell ? ' is-taken' : ''}`} title={t ? `${posLabel(r, c)} : ${t.name}${t.taken ? ' (place prise)' : ''}` : posLabel(r, c)}>
                  {t?.name}
                </span>
              );
            }),
          ])}
        </div>
      </div>
    </Modal>
  );
}
