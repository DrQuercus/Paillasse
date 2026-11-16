import { useEffect, useState } from 'react';
import { Dna } from 'lucide-react';
import { api } from '../../../api.js';
import { formatNumber } from '../../../lib/calc/units.js';
import { MODES, laneName, newId } from '../../../lib/gel/model.js';
import { proteinsOf } from '../../../lib/gel/protein.js';
import Modal from '../../Modal.jsx';
import { Segmented } from '../controls.jsx';

const parseList = (s) => String(s).split(/[;,\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => x > 0);

/** Taille attendue : saisie, ou calculée depuis le registre (CDS d'une protéine, fragment, digestion). */
export default function ExpectedDialog({ state, onAdd, onClose }) {
  const mode = MODES[state.mode];
  const [tab, setTab] = useState('registry');
  const [laneId, setLaneId] = useState('');
  const [label, setLabel] = useState('');
  const [sizes, setSizes] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [seq, setSeq] = useState(null);
  const [enzymes, setEnzymes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tab !== 'registry' || seq) return undefined;
    const t = setTimeout(() => api.get(`/sequences${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then((l) => setList(l.slice(0, 12))).catch(() => setList([])), 200);
    return () => clearTimeout(t);
  }, [q, tab, seq]);

  const pickSeq = async (s) => {
    setError('');
    try {
      setSeq(await api.get(`/sequences/${s.id}`));
    } catch (err) {
      setError(err.message);
    }
  };
  const add = (entry) => {
    onAdd({ id: newId(), laneId: laneId || null, ...entry });
    onClose();
  };
  const digest = async () => {
    const names = enzymes.split(/[,;\s]+/).filter(Boolean);
    if (!names.length) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.post(`/sequences/${seq.id}/digest`, { enzymes: names });
      add({ label: `${seq.code} × ${names.join(' + ')}`, sizes: r.fragments.map((f) => f.length).sort((a, b) => b - a) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const proteins = seq && state.mode !== 'dna' ? proteinsOf(seq) : [];

  return (
    <Modal title="Taille attendue" onClose={onClose} wide>
      <div className="form-stack">
        <label className="field">
          <span>Piste</span>
          <select value={laneId} onChange={(e) => setLaneId(e.target.value)}>
            <option value="">Toutes les pistes d’échantillon</option>
            {state.lanes.filter((l) => l.role !== 'ladder').map((l) => <option key={l.id} value={l.id}>Piste {laneName(l, state.lanes.indexOf(l))}</option>)}
          </select>
        </label>
        <Segmented label="Source" value={tab} onChange={setTab} options={[['registry', 'Registre de séquences'], ['manual', 'Saisie']]} />
        {tab === 'manual' && (
          <>
            <label className="field"><span>Nom</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={mode.unit === 'pb' ? 'Produit de PCR' : 'DegU-His6'} /></label>
            <label className="field"><span>Tailles ({mode.unit})</span><input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder={mode.unit === 'pb' ? '3000, 1200' : '28,5'} /></label>
            <button type="button" className="btn btn-primary" disabled={!parseList(sizes).length} onClick={() => add({ label: label.trim() || 'attendu', sizes: parseList(sizes) })}>Ajouter</button>
          </>
        )}
        {tab === 'registry' && !seq && (
          <>
            <input className="picker-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou identifiant (SEQ-…)" aria-label="Rechercher une séquence" />
            {list?.length === 0 && <p className="muted">Aucune séquence.</p>}
            <ul className="picker-list">
              {list?.map((s) => (
                <li key={s.id}>
                  <button type="button" className="picker-item" onClick={() => pickSeq(s)}>
                    <code>{s.code}</code><span className="picker-name">{s.name}</span>
                    <span className="muted small">{s.length.toLocaleString('fr-FR')} pb, {s.circular ? 'circulaire' : 'linéaire'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === 'registry' && seq && (
          <>
            <p><Dna size={15} aria-hidden="true" /> <code>{seq.code}</code> <strong>{seq.name}</strong> <button type="button" className="link-btn small" onClick={() => setSeq(null)}>changer</button></p>
            {state.mode === 'dna' ? (
              <>
                <button type="button" className="btn" onClick={() => add({ label: `${seq.code} ${seq.name}`, sizes: [seq.sequence.length] })}>
                  Fragment entier : {seq.sequence.length.toLocaleString('fr-FR')} pb{seq.circular ? ' (migration d’un plasmide non digéré imprévisible)' : ''}
                </button>
                <div className="gel-inline">
                  <label className="field"><span>Digestion par</span><input value={enzymes} onChange={(e) => setEnzymes(e.target.value)} placeholder="EcoRI, HindIII" /></label>
                  <button type="button" className="btn btn-primary" disabled={busy || !enzymes.trim()} onClick={digest}>Digérer</button>
                </div>
              </>
            ) : proteins.length ? (
              <ul className="picker-list">
                {proteins.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="picker-item" onClick={() => add({ label: `${seq.code} ${p.name}`, sizes: [Math.round(p.kDa * 10) / 10] })}>
                      <span className="picker-name">{p.name}</span>
                      <span className="muted small">{p.length} aa, {formatNumber(p.kDa, 3)} kDa</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Aucune annotation CDS dans cette séquence : ajoutez-en une, ou utilisez la saisie.</p>}
          </>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    </Modal>
  );
}
