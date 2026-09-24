import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { api, scopedApi } from '../api.js';
import { useApp } from '../context.js';
import Board from '../components/board/Board.jsx';
import ShareDialog from '../components/board/ShareDialog.jsx';
import ProjectTabs from '../components/ProjectTabs.jsx';

export default function ProjectBoardPage() {
  const { id } = useParams();
  const { notify, reloadProjects } = useApp();
  const [project, setProject] = useState(null);
  const [sharing, setSharing] = useState(false);
  const client = useMemo(() => scopedApi(`/projects/${id}/board`), [id]);

  useEffect(() => {
    api.get(`/projects/${id}`).then(setProject).catch((err) => notify(err.message, 'error'));
  }, [id, notify]);

  return (
    <div className="board-page">
      <header className="board-head" style={{ '--project': project?.color ?? 'var(--ink-3)' }}>
        <h1>{project?.name ?? '…'}</h1>
        <ProjectTabs projectId={id} shared={project?.board_shared} />
        <button type="button" className={`btn ${project?.board_shared ? 'btn-shared' : 'btn-ghost'} board-share`} onClick={() => setSharing(true)}>
          <Share2 size={15} /> {project?.board_shared ? 'Partagé par lien' : 'Partager'}
        </button>
      </header>
      <Board key={id} client={client} notify={notify} />
      {sharing && (
        <ShareDialog
          projectId={id}
          notify={notify}
          onClose={() => setSharing(false)}
          onChange={(i) => {
            setProject((p) => ({ ...p, board_shared: i.enabled }));
            reloadProjects();
          }}
        />
      )}
    </div>
  );
}
