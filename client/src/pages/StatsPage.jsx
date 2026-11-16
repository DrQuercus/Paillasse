import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, ArchiveRestore, ChartColumn, Search } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { formatDateTime } from '../lib/format.js';
import { KINDS, exampleDataset, newDataset } from '../lib/stats/model.js';
import EntryTargetDialog from '../components/EntryTargetDialog.jsx';
import KindPicker from '../components/stats/KindPicker.jsx';
import StatWorkbench from '../components/stats/StatWorkbench.jsx';
import { compactDataset, statNodeAttrs } from '../components/stats/statExport.js';

/** Un jeu de données ouvert : enregistrement automatique (révision vérifiée), insertion dans une entrée. */
function DatasetEditor({ id }) {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(null);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(null);
  const rev = useRef(null);
  const timer = useRef(null);
  const last = useRef(null);
  const blocked = useRef(false);

  useEffect(() => {
    api.get(`/datasets/${id}`).then((d) => { rev.current = d.revision; setLoaded(d); }).catch((err) => { notify(err.message, 'error'); navigate('/stats'); });
    return () => clearTimeout(timer.current);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback(async () => {
    const data = last.current;
    if (!data || blocked.current) return;
    setStatus('Enregistrement…');
    try {
      const r = await api.put(`/datasets/${id}`, { data: compactDataset(data), revision: rev.current });
      rev.current = r.revision;
      setStatus('Enregistré');
    } catch (err) {
      if (err.status === 409) blocked.current = true;
      setStatus('Non enregistré');
      notify(err.message, 'error');
    }
  }, [id, notify]);

  const onChange = useCallback((ds) => {
    if (!loaded || ds === last.current) return;
    if (last.current === null) { last.current = ds; return; } // état initial : rien à enregistrer
    last.current = ds;
    setStatus('Modifié');
    clearTimeout(timer.current);
    timer.current = setTimeout(persist, 800);
  }, [loaded, persist]);

  const close = async () => {
    clearTimeout(timer.current);
    if (status === 'Modifié') await persist();
    navigate('/stats');
  };

  const insert = async (entry) => {
    const { ds, res, plot } = pending;
    const attrs = await statNodeAttrs({ ds, res, plot, upload: (file, derivation) => api.upload(entry.id, file, derivation) });
    await api.post(`/entries/${entry.id}/blocks`, { node: { type: 'statFigure', attrs } });
    notify(`Graphique ajouté à « ${entry.title} ».`, 'success');
    navigate(`/entries/${entry.id}`);
  };

  if (!loaded) return <div className="gel-loading" role="status">Ouverture…</div>;
  return (
    <>
      <StatWorkbench
        initial={loaded.data}
        status={status}
        submitLabel="Insérer dans une entrée…"
        onSubmit={async (result) => { clearTimeout(timer.current); await persist(); setPending(result); }}
        onChange={onChange}
        onClose={close}
      />
      {pending && <EntryTargetDialog title="Insérer le graphique dans une entrée" onClose={() => setPending(null)} onChoose={insert} />}
    </>
  );
}

/** Page Statistiques : nouveaux tableaux, jeux de données enregistrés. */
export default function StatsPage() {
  const { id } = useParams();
  const { notify } = useApp();
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);

  const load = useCallback(() => {
    api.get(`/datasets?archived=${archived}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`).then(setList).catch((err) => { notify(err.message, 'error'); setList([]); });
  }, [archived, q, notify]);
  useEffect(() => { if (!id) { const t = setTimeout(load, 200); return () => clearTimeout(t); } return undefined; }, [id, load]);

  if (id) return <DatasetEditor key={id} id={id} />;

  const create = async (kind, example) => {
    try {
      const data = example ? exampleDataset(kind) : newDataset(kind);
      const created = await api.post('/datasets', { data });
      navigate(`/stats/${created.id}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const toggleArchive = async (d) => {
    await api.post(`/datasets/${d.id}/archive`, { archived: !d.archived });
    load();
  };

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Statistiques</h1>
          <p className="page-lead">Tableaux de données, tests statistiques et graphiques, à la façon de Prism : insérés dans une entrée, ils sont scellés avec elle.</p>
        </div>
      </header>

      <section className="st-new">
        <h2 className="section-title">Nouveau tableau</h2>
        <KindPicker onPick={create} />
      </section>

      <section className="st-list">
        <div className="st-list-head">
          <h2 className="section-title">Jeux de données</h2>
          <label className="st-search"><Search size={15} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un titre" aria-label="Rechercher un jeu de données" /></label>
          <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /><span>Archives</span></label>
        </div>
        {list?.length === 0 && <p className="muted">Aucun jeu de données{q ? ' pour cette recherche' : ' : commencez par un nouveau tableau, ou essayez un exemple'}.</p>}
        {list?.length > 0 && (
          <table className="seq-table st-datasets">
            <thead><tr><th>Titre</th><th>Tableau</th><th className="num">Lignes</th><th>Modifié</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className={d.archived ? 'is-archived' : ''}>
                  <td><button type="button" className="link-btn" onClick={() => navigate(`/stats/${d.id}`)} disabled={d.archived}><ChartColumn size={14} aria-hidden="true" /> {d.title || 'Sans titre'}</button></td>
                  <td>{KINDS[d.kind]?.label}</td>
                  <td className="num">{d.row_count}</td>
                  <td className="muted small">{formatDateTime(d.updated_at)}{d.updated_by_name ? ` · ${d.updated_by_name}` : ''}</td>
                  <td>
                    <button type="button" className="icon-btn" onClick={() => toggleArchive(d)} title={d.archived ? 'Désarchiver' : 'Archiver'} aria-label={d.archived ? `Désarchiver ${d.title}` : `Archiver ${d.title}`}>
                      {d.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
