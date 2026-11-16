import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, Quote, Search } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { buildTree, locationText, positionLabel, unitLabel, unitPath } from '../../lib/inventory.js';
import Modal from '../Modal.jsx';
import BoxPicker, { occupiedOf } from './BoxPicker.jsx';
import SampleForm from './SampleForm.jsx';
import { SampleIcon } from './cryo.jsx';

const refOf = (s, location) => ({
  id: s.id, code: s.code, name: s.name, type: s.type, cap_color: s.cap_color ?? '', aliquot: s.aliquot ?? '', location,
});

/** Chercher des tubes déjà rangés et les citer dans l'entrée. */
function CiteDialog({ onCite, onClose, grids = false }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [picked, setPicked] = useState(new Map());
  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/inventory/samples?limit=40${grids ? '&type=grid' : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`).then(setResults).catch(() => setResults([]));
    }, 150);
    return () => clearTimeout(t);
  }, [q, grids]);
  const word = grids ? 'grille' : 'tube';
  const toggle = (s) => setPicked((m) => { const n = new Map(m); if (n.has(s.id)) n.delete(s.id); else n.set(s.id, s); return n; });
  return (
    <Modal
      title={grids ? 'Citer des grilles du stockage' : 'Citer des tubes du stockage'}
      onClose={onClose}
      wide
      footer={(
        <>
          <span className="modal-foot-note">{picked.size} {word}{picked.size > 1 ? 's' : ''} {grids ? 'choisie' : 'choisi'}{picked.size > 1 ? 's' : ''}</span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" disabled={!picked.size} onClick={() => onCite([...picked.values()])}>Citer dans l’entrée</button>
        </>
      )}
    >
      <label className="st-search picker-q"><Search size={15} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, code ECH-…, plasmide" aria-label={`Chercher ${grids ? 'une grille' : 'un tube'}`} autoFocus /></label>
      <ul className="cite-list">
        {results.map((s) => (
          <li key={s.id}>
            <label className={`cite-item${picked.has(s.id) ? ' is-picked' : ''}`}>
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s)} />
              <SampleIcon sample={s} size={18} />
              <span><strong>{s.name}</strong> <span className="muted small">{s.code}{s.aliquot ? ` · ${s.aliquot}` : ''}</span><span className="whereis-path">{s.location}</span></span>
            </label>
          </li>
        ))}
        {!results.length && <li className="muted small">{grids ? 'Aucune grille.' : 'Aucun tube.'}</li>}
      </ul>
    </Modal>
  );
}

/**
 * Tubes depuis une entrée : en ranger de nouveaux (liés à l'entrée) ou citer ceux du stockage.
 * session = { preset?, slot? } ; preset (emplacement de modèle) : { type, name } et rangement direct.
 * onInsert(attrs) reçoit les attributs du nœud « sampleRef ».
 */
export default function SampleSession({ session, entryId, onInsert, onClose }) {
  const { notify } = useApp();
  const [mode, setMode] = useState(session.preset?.mode ?? (session.preset ? 'store' : null));
  const [units, setUnits] = useState(null);
  const [target, setTarget] = useState(null); // { box, start }
  useEffect(() => { api.get('/inventory').then((d) => setUnits(d.units)).catch((err) => notify(err.message, 'error')); }, [notify]);
  const tree = useMemo(() => (units ? buildTree(units) : null), [units]);

  if (!mode) {
    return (
      <Modal title="Tubes" onClose={onClose}>
        <div className="session-choices">
          <button type="button" className="session-choice" onClick={() => setMode('store')}>
            <PackagePlus size={22} aria-hidden="true" />
            <strong>Ranger de nouveaux tubes</strong>
            <span className="muted small">Choisir la boîte et les places ; les tubes gardent le lien vers cette entrée.</span>
          </button>
          <button type="button" className="session-choice" onClick={() => setMode('cite')}>
            <Quote size={22} aria-hidden="true" />
            <strong>Citer des tubes du stockage</strong>
            <span className="muted small">Les tubes utilisés aujourd’hui, avec leur adresse.</span>
          </button>
        </div>
      </Modal>
    );
  }

  if (mode === 'cite') {
    return <CiteDialog grids={session.preset?.type === 'grid'} onClose={onClose} onCite={(list) => { onInsert({ action: 'cited', samples: list.map((s) => refOf(s, s.location)) }); onClose(); }} />;
  }

  if (!tree) return null;
  if (!target) {
    return (
      <BoxPicker
        tree={tree}
        title={session.preset?.type === 'grid' ? 'Dans quelle boîte à grilles ?' : 'Où ranger les tubes ?'}
        need={1}
        kinds={session.preset?.type === 'grid' ? ['gridbox'] : ['box', 'bag', 'gridbox']}
        confirmLabel="Ranger dans cette boîte"
        onClose={onClose}
        onPick={(box, positions) => setTarget({ box, start: positions?.[0] ?? null })}
      />
    );
  }

  const { box, start } = target;
  const grid = box.kind !== 'bag';
  const occupied = occupiedOf(box);
  const free = grid ? box.rows * box.cols - occupied.size : 200;
  const submit = async (fields, count) => {
    try {
      const made = await api.post('/inventory/samples', { unit_id: box.id, sample: { ...fields, entry_id: entryId ?? '' }, count, start: start ?? undefined });
      const path = unitPath(tree.byId, box.id);
      onInsert({ action: 'stored', samples: made.map((m) => refOf({ ...m, type: fields.type, cap_color: fields.cap_color, aliquot: count > 1 ? `${made.indexOf(m) + 1}/${count}` : '' }, locationText(path, m.row, m.col))) });
      const many = made.length > 1 ? 's' : '';
      notify(`${made.length} ${box.kind === 'gridbox' ? `grille${many} rangée${many}` : `tube${many} rangé${many}`} dans « ${unitLabel(box)} »${grid ? ` (${made.map((m) => positionLabel(box, m.row, m.col)).join(', ')})` : ''}.`, 'success');
      onClose();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  return (
    <Modal title={grid ? `Ranger dans « ${unitLabel(box)} », à partir de ${positionLabel(box, start?.row, start?.col)}` : `Ranger dans « ${box.name} »`} onClose={onClose} wide>
      <p className="hint session-where">{locationText(unitPath(tree.byId, box.id))}</p>
      <SampleForm create initial={{ type: box.kind === 'gridbox' ? 'grid' : session.preset?.type ?? 'plasmid', name: session.preset?.name ?? '' }} start={start} free={free} bag={!grid} box={box} occupied={occupied} onStart={(p) => setTarget((t) => ({ ...t, start: p }))} onSubmit={submit} onCancel={onClose} />
    </Modal>
  );
}
