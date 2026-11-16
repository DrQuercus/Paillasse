import { useEffect, useMemo, useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { fold } from '../lib/calc/units.js';
import { formatShortDate } from '../lib/format.js';
import Modal from './Modal.jsx';

/**
 * Choisir le brouillon qui recevra un encart (calcul, figure de gel), ajouté à la fin de l'entrée.
 * onChoose(entry) fait le travail (et peut échouer : l'erreur est affichée, on peut réessayer).
 */
export default function EntryTargetDialog({ title, onChoose, onClose }) {
  const { notify, openNewEntry } = useApp();
  const [entries, setEntries] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/entries?limit=200')
      .then((list) => setEntries(list.filter((e) => e.status === 'draft')))
      .catch((err) => { notify(err.message, 'error'); setEntries([]); });
  }, [notify]);

  const shown = useMemo(() => {
    const needle = fold(q).trim();
    return (entries ?? []).filter((e) => !needle || fold(`${e.title} ${e.project_name}`).includes(needle)).slice(0, 50);
  }, [entries, q]);

  const choose = async (entry) => {
    setBusy(true);
    try {
      await onChoose(entry);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <input
        className="picker-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Titre de l’entrée ou projet"
        aria-label="Rechercher une entrée"
      />
      <p className="hint">L’encart s’ajoute à la fin du brouillon choisi. Les entrées verrouillées ne sont pas proposées : utilisez un addendum.</p>
      {busy && <p className="gel-note" role="status">Enregistrement…</p>}
      {entries?.length === 0 && (
        <div className="empty">
          <p>Aucun brouillon en cours.</p>
          <button type="button" className="btn" onClick={() => { onClose(); openNewEntry(); }}><FilePlus2 size={15} /> Nouvelle entrée</button>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="picker-list">
          {shown.map((e) => (
            <li key={e.id}>
              <button type="button" className="picker-item" onClick={() => choose(e)} disabled={busy}>
                <span className="project-dot" style={{ background: e.project_color }} aria-hidden="true" />
                <span className="picker-name">{e.title}</span>
                <span className="muted small">{e.project_name}, {formatShortDate(e.entry_date)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
