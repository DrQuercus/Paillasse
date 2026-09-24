import { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import Modal from './Modal.jsx';

export const PROJECT_COLORS = ['#2449C7', '#2A7A56', '#0F7C8C', '#6B3FA0', '#B3261E', '#9A6208', '#56627A'];

export default function ProjectDialog({ project, onClose, onSaved }) {
  const { reloadProjects, notify } = useApp();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name, description, color };
      const saved = project ? await api.patch(`/projects/${project.id}`, body) : await api.post('/projects', body);
      await reloadProjects();
      notify(project ? 'Projet mis à jour.' : `Projet « ${saved.name} » créé.`, 'success');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={project ? 'Modifier le projet' : 'Nouveau projet'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="project-form" className="btn btn-primary" disabled={busy || !name.trim()}>
            {project ? 'Enregistrer' : 'Créer le projet'}
          </button>
        </>
      )}
    >
      <form id="project-form" onSubmit={submit} className="form-stack">
        <label className="field">
          <span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. T7SSb — complexe YukB" required />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Objectif, constructions concernées, collaborateurs…" />
        </label>
        <fieldset className="field">
          <legend>Couleur</legend>
          <div className="swatches">
            {PROJECT_COLORS.map((c) => (
              <label key={c} className="swatch" style={{ '--swatch': c }}>
                <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} />
                <span aria-label={c} />
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
