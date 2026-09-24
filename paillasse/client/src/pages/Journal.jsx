import { useEffect, useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import EntryList from '../components/EntryList.jsx';

const PAGE = 100;

export default function Journal() {
  const { openNewEntry, notify, projects } = useApp();
  const [entries, setEntries] = useState(null);
  const [hasMore, setHasMore] = useState(false);

  const load = async (offset = 0) => {
    try {
      const rows = await api.get(`/entries?limit=${PAGE}&offset=${offset}`);
      setEntries((prev) => (offset ? [...prev, ...rows] : rows));
      setHasMore(rows.length === PAGE);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Journal</h1>
          <p className="page-lead">Toutes les entrées, de la plus récente à la plus ancienne.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => openNewEntry()}>
          <FilePlus2 size={16} /> Nouvelle entrée
        </button>
      </header>

      {entries === null && <p className="muted">Chargement…</p>}
      {entries?.length === 0 && (
        <div className="empty">
          <p>Le cahier est vide.</p>
          <p className="muted">
            {projects.length
              ? 'Créez votre première entrée pour commencer à noter vos manips.'
              : "Créez votre première entrée : un projet sera créé en même temps pour la ranger."}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => openNewEntry()}>Créer une entrée</button>
        </div>
      )}
      {entries?.length > 0 && <EntryList entries={entries} />}
      {hasMore && (
        <button type="button" className="btn load-more" onClick={() => load(entries.length)}>Afficher les entrées plus anciennes</button>
      )}
    </div>
  );
}
