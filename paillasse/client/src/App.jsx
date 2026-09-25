import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { api } from './api.js';
import { AppContext } from './context.js';
import Sidebar from './components/Sidebar.jsx';
import Toasts from './components/Toasts.jsx';
import NewEntryDialog from './components/NewEntryDialog.jsx';
import Login from './pages/Login.jsx';
import Journal from './pages/Journal.jsx';
import ProjectPage from './pages/ProjectPage.jsx';
import ProjectBoardPage from './pages/ProjectBoardPage.jsx';
import SharedBoardPage from './pages/SharedBoardPage.jsx';
import SequencesPage from './pages/SequencesPage.jsx';
import SequencePage from './pages/SequencePage.jsx';
import EntryPage from './pages/EntryPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import TemplateEditPage from './pages/TemplateEditPage.jsx';

const CalcPage = lazy(() => import('./pages/CalcPage.jsx'));
const GelPage = lazy(() => import('./pages/GelPage.jsx'));
const StatsPage = lazy(() => import('./pages/StatsPage.jsx'));
const StoragePage = lazy(() => import('./pages/StoragePage.jsx'));

function EntryRoute() {
  const { id } = useParams();
  return <EntryPage key={id} id={id} />;
}

function SequenceRoute() {
  const { id } = useParams();
  return <SequencePage key={id} id={id} />;
}

function TemplateRoute() {
  const { id } = useParams();
  return <TemplateEditPage key={id} id={id} />;
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined : vérification en cours
  const [projects, setProjects] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [newEntry, setNewEntry] = useState(null);
  const location = useLocation();
  const sharedToken = /^\/b\/([A-Za-z0-9_-]+)/.exec(location.pathname)?.[1];

  const toastCounter = useRef(0);
  // (crypto.randomUUID n'existe pas en HTTP simple sur le réseau du labo : simple compteur)
  const notify = useCallback((message, kind = 'info') => {
    const id = ++toastCounter.current;
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  const reloadProjects = useCallback(
    () => api.get('/projects').then(setProjects).catch((err) => notify(err.message, 'error')),
    [notify],
  );

  useEffect(() => {
    api.get('/auth/me').then(setUser).catch(() => setUser(null));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('paillasse:unauthorized', onUnauthorized);
    return () => window.removeEventListener('paillasse:unauthorized', onUnauthorized);
  }, []);

  useEffect(() => {
    if (user) reloadProjects();
  }, [user, reloadProjects]);

  const context = useMemo(() => ({
    user,
    setUser,
    projects,
    reloadProjects,
    notify,
    openNewEntry: (projectId, templateId) => setNewEntry({ projectId, templateId }),
  }), [user, projects, reloadProjects, notify]);

  // Tableau partagé par lien : accessible sans compte
  if (sharedToken) return <SharedBoardPage token={sharedToken} />;
  if (user === undefined) return <div className="splash" aria-busy="true" />;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <AppContext.Provider value={context}>
      <div className="app">
        <Sidebar />
        <main className="main" id="contenu">
          <Routes>
            <Route path="/" element={<Journal />} />
            <Route path="/projects/:id" element={<ProjectPage />} />
            <Route path="/projects/:id/board" element={<ProjectBoardPage />} />
            <Route path="/entries/:id" element={<EntryRoute />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/sequences" element={<SequencesPage />} />
            <Route path="/sequences/:id" element={<SequenceRoute />} />
            <Route path="/gels" element={<Suspense fallback={null}><GelPage /></Suspense>} />
            <Route path="/gels/:tab" element={<Suspense fallback={null}><GelPage /></Suspense>} />
            <Route path="/stats" element={<Suspense fallback={null}><StatsPage /></Suspense>} />
            <Route path="/stats/:id" element={<Suspense fallback={null}><StatsPage /></Suspense>} />
            <Route path="/storage" element={<Suspense fallback={null}><StoragePage /></Suspense>} />
            <Route path="/storage/:id" element={<Suspense fallback={null}><StoragePage /></Suspense>} />
            <Route path="/calc" element={<Suspense fallback={null}><CalcPage /></Suspense>} />
            <Route path="/calc/:kind" element={<Suspense fallback={null}><CalcPage /></Suspense>} />
            <Route path="/templates" element={<TemplatesPage />} />
            <Route path="/templates/:id" element={<TemplateRoute />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      {newEntry && <NewEntryDialog initialProjectId={newEntry.projectId} initialTemplateId={newEntry.templateId ?? ''} onClose={() => setNewEntry(null)} />}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
    </AppContext.Provider>
  );
}
