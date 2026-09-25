import { useEffect, useState } from 'react';
import { ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import Modal from '../Modal.jsx';
import { JobPanel, Status, useJob } from './common.jsx';

/** Case « copie de sécurité avant », cochée par défaut. */
export function SafetyToggle({ value, onChange }) {
  return (
    <label className="adm-check adm-safety">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span><ShieldCheck size={15} aria-hidden="true" /> <strong>Copie de sécurité de la base juste avant</strong> (conseillé) : pour revenir en arrière depuis Sauvegardes › Copies de sécurité.</span>
    </label>
  );
}

/**
 * Suppression définitive (administrateur) : aperçu de ce qui part et de ce qui reste, copie de sécurité,
 * « SUPPRIMER » tapé en toutes lettres, puis avancement. kind : entries, projects, sequences, units, samples,
 * datasets, reagents, ladders, templates.
 */
export default function PurgeDialog({ kind, ids, title, onClose, onDone }) {
  const [impact, setImpact] = useState(null);
  const [error, setError] = useState('');
  const [safety, setSafety] = useState(true);
  const [confirm, setConfirm] = useState('');
  const { reloadProjects } = useApp();
  const [job, setJob] = useJob((j) => {
    if (j.status !== 'ok') return;
    reloadProjects(); // la barre latérale oublie les projets supprimés
    onDone?.(j);
  });

  useEffect(() => {
    api.post('/admin/purge/preview', { kind, ids }).then(setImpact).catch((err) => setError(err.message));
  }, [kind, ids]);

  const start = async () => {
    setError('');
    try {
      setJob(await api.post('/admin/purge', { kind, ids, confirm, safety }));
    } catch (err) {
      setError(err.message);
    }
  };

  const running = job?.status === 'running';
  const blocked = impact?.blockers?.length > 0;
  return (
    <Modal
      title={title ?? 'Supprimer définitivement'}
      onClose={running ? () => {} : onClose}
      closable={!running}
      wide
      footer={job && !running ? <button type="button" className="btn btn-primary" onClick={onClose}>Fermer</button> : (
        <>
          <button type="button" className="btn" onClick={onClose} disabled={running}>Annuler</button>
          <button type="button" className="btn btn-danger" onClick={start} disabled={!impact || blocked || confirm !== 'SUPPRIMER' || running}>
            <Trash2 size={15} /> Supprimer définitivement
          </button>
        </>
      )}
    >
      {!job && (
        <>
          {!impact && !error && <p className="muted">Calcul de ce qui sera supprimé…</p>}
          {impact && (
            <div className="adm-purge">
              <div className="adm-purge-col is-gone">
                <h3>Sera supprimé</h3>
                <ul>{impact.lines.map((l) => <li key={l}>{l}</li>)}</ul>
                {impact.items.length > 0 && (
                  <ul className="adm-purge-items">
                    {impact.items.map((t, i) => <li key={`${t}-${i}`}>{t}</li>)}
                    {impact.count > impact.items.length && <li className="muted">… et {impact.count - impact.items.length} autre(s)</li>}
                  </ul>
                )}
              </div>
              {impact.kept.length > 0 && (
                <div className="adm-purge-col is-kept">
                  <h3>Reste</h3>
                  <ul>{impact.kept.map((l) => <li key={l}>{l}</li>)}</ul>
                </div>
              )}
            </div>
          )}
          {blocked && impact.blockers.map((b) => <p key={b} className="form-error">{b}</p>)}
          {impact && !blocked && (
            <>
              <SafetyToggle value={safety} onChange={setSafety} />
              <label className="field">
                <span>Pour confirmer, tapez <strong>SUPPRIMER</strong></span>
                <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="mono" />
              </label>
            </>
          )}
        </>
      )}
      {error && <p className="form-error">{error}</p>}
      <JobPanel job={job} />
      {job?.status === 'ok' && <p className="adm-allgood"><Status level="ok">Supprimé : {job.result?.removed_text?.join(', ') || 'rien'}.</Status></p>}
    </Modal>
  );
}
