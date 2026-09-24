import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Table } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { formatDateTime } from '../../lib/format.js';
import { KINDS, datasetFromTable, exampleDataset, newDataset } from '../../lib/stats/model.js';
import Modal from '../Modal.jsx';
import KindPicker from './KindPicker.jsx';
import StatWorkbench from './StatWorkbench.jsx';
import { statNodeAttrs } from './statExport.js';

/** Point de départ d'un nouveau graphique : tableau de l'entrée, nouveau tableau ou jeu enregistré. */
function StartDialog({ table, onStart, onClose }) {
  const [saved, setSaved] = useState(null);
  const { notify } = useApp();
  useEffect(() => { api.get('/datasets').then(setSaved).catch(() => setSaved([])); }, []);
  const open = async (id) => {
    try {
      const d = await api.get(`/datasets/${id}`);
      onStart(d.data);
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  return (
    <Modal title="Graphique et statistiques" onClose={onClose} wide>
      {table && (
        <button type="button" className="st-from-table" onClick={() => onStart(datasetFromTable(table))}>
          <Table size={22} aria-hidden="true" />
          <span>
            <strong>Analyser le tableau où se trouve le curseur</strong>
            <span className="muted small">{table.length} lignes × {Math.max(...table.map((r) => r.length))} colonnes ; la première ligne donne les noms des groupes.</span>
          </span>
        </button>
      )}
      <h3 className="gel-source-title">Nouveau tableau</h3>
      <KindPicker onPick={(kind, example) => onStart(example ? exampleDataset(kind) : newDataset(kind))} />
      {saved?.length > 0 && (
        <>
          <h3 className="gel-source-title">Ou un jeu de données de la page Statistiques</h3>
          <ul className="picker-list st-saved">
            {saved.slice(0, 12).map((s) => (
              <li key={s.id}>
                <button type="button" className="picker-item" onClick={() => open(s.id)}>
                  <span className="picker-name">{s.title || 'Sans titre'}</span>
                  <span className="muted small">{KINDS[s.kind]?.label} · {formatDateTime(s.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/**
 * Session ouverte depuis l'éditeur : point de départ (nouveau graphique) ou encart à modifier,
 * atelier en plein écran, puis graphique joint à l'entrée et encart inséré ou mis à jour.
 * session = { attrs?, apply?, table? } ; upload(file, derivation) → pièce jointe.
 */
export default function StatEditorSession({ session, upload, onInsert, onUpdate, onClose }) {
  const [initial, setInitial] = useState(session.attrs?.dataset ?? null);
  if (!initial) return <StartDialog table={session.table} onStart={setInitial} onClose={onClose} />;
  const submit = async ({ ds, res, plot }) => {
    const attrs = await statNodeAttrs({ ds, res, plot, upload, width: session.attrs?.width ?? 75 });
    if (session.attrs) onUpdate(attrs);
    else onInsert(attrs);
    onClose();
  };
  return createPortal(
    <StatWorkbench
      initial={initial}
      submitLabel={session.attrs ? 'Mettre à jour l’encart' : 'Insérer dans l’entrée'}
      onSubmit={submit}
      onClose={onClose}
    />,
    document.body,
  );
}
