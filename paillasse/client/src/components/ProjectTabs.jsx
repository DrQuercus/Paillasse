import { NavLink } from 'react-router-dom';
import { BookOpen, Users } from 'lucide-react';

export default function ProjectTabs({ projectId, shared }) {
  return (
    <nav className="project-tabs" aria-label="Vues du projet">
      <NavLink to={`/projects/${projectId}`} end className="project-tab">
        <BookOpen size={15} aria-hidden="true" /> Entrées
      </NavLink>
      <NavLink to={`/projects/${projectId}/board`} className="project-tab">
        Tableau
        {shared && <Users size={14} aria-label="partagé" />}
      </NavLink>
    </nav>
  );
}
