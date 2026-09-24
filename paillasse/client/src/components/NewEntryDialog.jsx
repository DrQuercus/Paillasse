import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { todayISO } from '../lib/format.js';
import Modal from './Modal.jsx';

export default function NewEntryDialog({ initialProjectId, onClose }) {
  const { projects, reloadProjects, notify } = useApp();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [newProjectName, setNewProjectName] = useState('');
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const noProject = projects.length === 0;

  useEffect(() => {
    api.get('/templates').then(setTemplates).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let pid = projectId;
      if (noProject) pid = (await api.post('/projects', { name: newProjectName })).id;
      const entry = await api.post('/entries', {
        project_id: pid, title, entry_date: date, template_id: templateId || undefined,
      });
      reloadProjects();
      onClose();
      navigate(`/entries/${entry.id}`);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Nouvelle entrée"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="entry-form" className="btn btn-primary" disabled={busy || (noProject && !newProjectName.trim())}>
            Créer l'entrée
          </button>
        </>
      )}
    >
      <form id="entry-form" onSubmit={submit} className="form-stack">
        <label className="field">
          <span>Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex. Purification YukB-His6, Ni-NTA" />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          {noProject ? (
            <label className="field">
              <span>Projet</span>
              <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Nom du premier projet" required />
            </label>
          ) : (
            <label className="field">
              <span>Projet</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <label className="field">
          <span>Partir d'un modèle</span>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Page vierge</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
      </form>
    </Modal>
  );
}
