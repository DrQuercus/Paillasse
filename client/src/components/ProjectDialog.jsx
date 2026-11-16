import { useState } from 'react';
import { Lock, Users } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import Modal from './Modal.jsx';
import { PeoplePicker } from './Sharing.jsx';

export const PROJECT_COLORS = ['#2449C7', '#2A7A56', '#0F7C8C', '#6B3FA0', '#B3261E', '#9A6208', '#56627A'];

export default function ProjectDialog({ project, onClose, onSaved }) {
  const { reloadProjects, notify } = useApp();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [color, setColor] = useState(project?.color ?? PROJECT_COLORS[0]);
  const [access, setAccess] = useState('private');
  const [shareWith, setShareWith] = useState([]);
  const [busy, setBusy] = useState(false);
  const missingPeople = !project && access === 'shared' && !shareWith.length;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name, description, color };
      if (!project && access === 'shared') body.share_with = shareWith;
      const saved = project ? await api.patch(`/projects/${project.id}`, body) : await api.post('/projects', body);
      await reloadProjects();
      const invited = saved.pending_count;
      notify(project ? 'Projet mis à jour.'
        : invited ? `Projet « ${saved.name} » créé. ${invited > 1 ? `${invited} invitations envoyées` : 'Invitation envoyée'} : le projet sera partagé dès qu’elle${invited > 1 ? 's seront acceptées' : ' sera acceptée'}.`
          : `Projet privé « ${saved.name} » créé.`, 'success');
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
          <button type="submit" form="project-form" className="btn btn-primary" disabled={busy || !name.trim() || missingPeople}
            title={missingPeople ? 'Choisissez au moins un compte avec qui partager' : undefined}>
            {project ? 'Enregistrer' : access === 'shared' ? 'Créer et inviter' : 'Créer le projet'}
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
        {!project && (
          <fieldset className="field">
            <legend>Qui voit ce projet ?</legend>
            <div className="access-choice">
              <label className={`access-option${access === 'private' ? ' is-active' : ''}`}>
                <input type="radio" name="access" value="private" checked={access === 'private'} onChange={() => setAccess('private')} />
                <Lock size={18} aria-hidden="true" />
                <span><strong>Privé</strong><span className="small">Vous seul voyez le projet et tout ce qu’il contient.</span></span>
              </label>
              <label className={`access-option${access === 'shared' ? ' is-active' : ''}`}>
                <input type="radio" name="access" value="shared" checked={access === 'shared'} onChange={() => setAccess('shared')} />
                <Users size={18} aria-hidden="true" />
                <span><strong>Partagé</strong><span className="small">Avec les comptes que vous choisissez, s’ils acceptent.</span></span>
              </label>
            </div>
            {access === 'shared' && (
              <>
                <PeoplePicker selected={shareWith} onChange={setShareWith} />
                <p className="hint">Chaque compte reçoit une invitation : il ne voit rien du projet tant qu’il ne l’a pas acceptée. Vous pourrez inviter d’autres personnes ou en retirer plus tard.</p>
              </>
            )}
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
