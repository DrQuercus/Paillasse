import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, Calculator, ChartColumn, Columns4, Dna, Download, FilePlus2, LayoutTemplate, LogOut, Menu, Plus, Search, Snowflake, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import ProjectDialog from './ProjectDialog.jsx';

export default function Sidebar() {
  const { user, setUser, projects, openNewEntry, notify } = useApp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [projectDialog, setProjectDialog] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => setOpen(false), [location.pathname, location.search]);

  const search = (e) => {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
      setUser(null);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const currentProject = location.pathname.match(/^\/projects\/([^/]+)/)?.[1];

  return (
    <>
      <div className="topbar">
        <button type="button" className="icon-btn" onClick={() => setOpen(true)} aria-label="Ouvrir le menu">
          <Menu size={20} />
        </button>
        <Link to="/" className="brand-small">Paillasse</Link>
        <button type="button" className="icon-btn" onClick={() => openNewEntry(currentProject)} aria-label="Nouvelle entrée">
          <FilePlus2 size={20} />
        </button>
      </div>

      <aside className={`sidebar${open ? ' open' : ''}`}>
        <div className="sidebar-head">
          <Link to="/" className="brand">Paillasse</Link>
          <button type="button" className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Fermer le menu">
            <X size={18} />
          </button>
        </div>

        <form className="sidebar-search" onSubmit={search} role="search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher dans le cahier"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher dans le cahier"
          />
        </form>

        <button type="button" className="btn btn-primary btn-block" onClick={() => openNewEntry(currentProject)}>
          <FilePlus2 size={16} /> Nouvelle entrée
        </button>

        <nav className="sidebar-nav">
          <NavLink to="/" end className="nav-link"><BookOpen size={16} /> Journal</NavLink>
          <NavLink to="/sequences" className="nav-link"><Dna size={16} /> Séquences</NavLink>
          <NavLink to="/storage" className="nav-link"><Snowflake size={16} /> Stockage</NavLink>
          <NavLink to="/gels" className="nav-link"><Columns4 size={16} /> Gels</NavLink>
          <NavLink to="/stats" className="nav-link"><ChartColumn size={16} /> Statistiques</NavLink>
          <NavLink to="/calc" className="nav-link"><Calculator size={16} /> Calculs</NavLink>
          <NavLink to="/templates" className="nav-link"><LayoutTemplate size={16} /> Modèles</NavLink>
        </nav>

        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <h2>Projets</h2>
            <button type="button" className="icon-btn" onClick={() => setProjectDialog(true)} aria-label="Nouveau projet" title="Nouveau projet">
              <Plus size={16} />
            </button>
          </div>
          {projects.length === 0 && <p className="sidebar-empty">Créez un projet pour ranger vos entrées.</p>}
          <ul className="project-list">
            {projects.map((p) => (
              <li key={p.id}>
                <NavLink to={`/projects/${p.id}`} className="nav-link project-link">
                  <span className="project-dot" style={{ background: p.color }} aria-hidden="true" />
                  <span className="project-name">{p.name}</span>
                  <span className="project-count">{p.entry_count}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        <div className="sidebar-foot">
          <a className="nav-link" href="/api/export" download>
            <Download size={16} /> Exporter tout le cahier
          </a>
          <div className="sidebar-user">
            <span>{user.display_name}</span>
            <button type="button" className="icon-btn" onClick={logout} title="Se déconnecter" aria-label="Se déconnecter">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="sidebar-scrim" onClick={() => setOpen(false)} aria-hidden="true" />}
      {projectDialog && (
        <ProjectDialog
          onClose={() => setProjectDialog(false)}
          onSaved={(p) => navigate(`/projects/${p.id}`)}
        />
      )}
    </>
  );
}
