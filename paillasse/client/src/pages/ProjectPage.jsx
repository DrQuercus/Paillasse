import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, FilePlus2, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import EntryList from '../components/EntryList.jsx';
import ProjectDialog from '../components/ProjectDialog.jsx';
import ProjectTabs from '../components/ProjectTabs.jsx';
import PurgeDialog from '../components/admin/PurgeDialog.jsx';

export default function ProjectPage() {
  const { id } = useParams();
  const { openNewEntry, notify, reloadProjects, projects, user } = useApp();
  const [purging, setPurging] = useState(false);
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState(null);
  const [editing, setEditing] = useState(false);

  // Recharger quand la liste des projets change (renommage, nouvelle entrée…)
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/projects/${id}`), api.get(`/entries?project_id=${id}&limit=500`)])
      .then(([p, e]) => {
        if (cancelled) return;
        setProject(p);
        setEntries(e);
      })
      .catch((err) => notify(err.message, 'error'));
    return () => { cancelled = true; };
  }, [id, projects, notify]);

  const archive = async () => {
    if (!window.confirm(`Archiver le projet « ${project.name} » ? Il disparaîtra de la barre latérale, ses entrées restent dans le cahier et les exports.`)) return;
    try {
      await api.patch(`/projects/${id}`, { archived: true });
      await reloadProjects();
      notify('Projet archivé.', 'success');
      navigate('/');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!project) return <div className="page"><p className="muted">Chargement…</p></div>;

  return (
    <div className="page">
      <header className="page-head project-head" style={{ '--project': project.color }}>
        <div>
          <h1>{project.name}</h1>
          {project.description && <p className="page-lead">{project.description}</p>}
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}><Pencil size={15} /> Modifier</button>
          {!project.archived && (
            <button type="button" className="btn btn-ghost" onClick={archive}><Archive size={15} /> Archiver</button>
          )}
          {user?.is_admin && (
            <button type="button" className="btn btn-ghost btn-danger-ghost" onClick={() => setPurging(true)} title="Supprimer le projet et son contenu (administrateur)"><Trash2 size={15} /> Supprimer</button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => openNewEntry(id)}>
            <FilePlus2 size={16} /> Nouvelle entrée
          </button>
        </div>
      </header>
      {purging && (
        <PurgeDialog
          kind="projects"
          ids={[id]}
          title={`Supprimer le projet « ${project.name} »`}
          onClose={() => setPurging(false)}
          onDone={() => { reloadProjects(); setTimeout(() => navigate('/'), 1200); }}
        />
      )}

      <ProjectTabs projectId={id} shared={project.board_shared} />

      {entries?.length === 0 && (
        <div className="empty">
          <p>Aucune entrée dans ce projet.</p>
          <button type="button" className="btn btn-primary" onClick={() => openNewEntry(id)}>Créer la première entrée</button>
        </div>
      )}
      {entries?.length > 0 && <EntryList entries={entries} showProject={false} />}
      {editing && <ProjectDialog project={project} onClose={() => setEditing(false)} onSaved={setProject} />}
    </div>
  );
}
