import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, Eye, FileDown, FilePlus2, Pencil, Trash2, UserPlus, Users } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import EntryList from '../components/EntryList.jsx';
import ProjectDialog from '../components/ProjectDialog.jsx';
import ProjectTabs from '../components/ProjectTabs.jsx';
import PurgeDialog from '../components/admin/PurgeDialog.jsx';
import { AccessChip, ShareDialog } from '../components/Sharing.jsx';

export default function ProjectPage() {
  const { id } = useParams();
  const { openNewEntry, notify, reloadProjects, projects, user } = useApp();
  const [purging, setPurging] = useState(false);
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [entries, setEntries] = useState(null);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Recharger quand la liste des projets change (renommage, nouvelle entrée…)
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get(`/projects/${id}`), api.get(`/entries?project_id=${id}&limit=500`)])
      .then(([p, e]) => {
        if (cancelled) return;
        setProject(p);
        setEntries(e);
        setLoadError('');
      })
      .catch((err) => { if (!cancelled) setLoadError(err.message); });
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

  const reloadProject = () => api.get(`/projects/${id}`).then(setProject).catch(() => {});

  if (loadError) {
    return (
      <div className="page">
        <div className="empty">
          <p>{loadError}</p>
          <p className="muted small">Un projet privé n’est visible que de son propriétaire et des comptes qui ont accepté son invitation.</p>
          <Link to="/" className="btn">Retour au journal</Link>
        </div>
      </div>
    );
  }
  if (!project || project.id !== id) return <div className="page"><p className="muted">Chargement…</p></div>;
  const owner = project.role === 'owner';
  const readOnly = project.role === 'admin';

  return (
    <div className="page">
      <header className="page-head project-head" style={{ '--project': project.color }}>
        <div>
          <h1>{project.name}</h1>
          <p className="project-access">
            <AccessChip project={project} onClick={() => setSharing(true)} />
            {!owner && <span className="muted small">Projet de {project.owner_name}</span>}
          </p>
          {project.description && <p className="page-lead">{project.description}</p>}
        </div>
        <div className="head-actions">
          {owner && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setSharing(true)}><UserPlus size={15} /> Partager</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}><Pencil size={15} /> Modifier</button>
              {!project.archived && (
                <button type="button" className="btn btn-ghost" onClick={archive}><Archive size={15} /> Archiver</button>
              )}
            </>
          )}
          {project.role === 'member' && (
            <button type="button" className="btn btn-ghost" onClick={() => setSharing(true)}><Users size={15} /> Membres</button>
          )}
          <a className="btn btn-ghost" href={`/api/projects/${id}/markdown`} download
            title="Toutes les entrées du projet en Markdown, avec leurs fichiers et une note d’index (.zip), pour Obsidian ou un éditeur de texte">
            <FileDown size={15} /> Markdown
          </a>
          {user?.is_admin && (
            <button type="button" className="btn btn-ghost btn-danger-ghost" onClick={() => setPurging(true)} title="Supprimer le projet et son contenu (administrateur)"><Trash2 size={15} /> Supprimer</button>
          )}
          {!readOnly && (
            <button type="button" className="btn btn-primary" onClick={() => openNewEntry(id)}>
              <FilePlus2 size={16} /> Nouvelle entrée
            </button>
          )}
        </div>
      </header>
      {readOnly && (
        <p className="notice readonly-notice">
          <Eye size={15} aria-hidden="true" />
          <span>Vous n’êtes pas membre de ce projet : vous le consultez en tant qu’administrateur, <strong>en lecture seule</strong>. Il n’apparaît pas dans votre barre latérale.</span>
        </p>
      )}
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
          {!readOnly && <button type="button" className="btn btn-primary" onClick={() => openNewEntry(id)}>Créer la première entrée</button>}
        </div>
      )}
      {entries?.length > 0 && <EntryList entries={entries} showProject={false} />}
      {editing && <ProjectDialog project={project} onClose={() => setEditing(false)} onSaved={setProject} />}
      {sharing && <ShareDialog project={project} onClose={() => setSharing(false)} onChanged={reloadProject} />}
    </div>
  );
}
