import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { RefreshCw, Wrench } from 'lucide-react';
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
import PasswordDialog from './components/PasswordDialog.jsx';

const CalcPage = lazy(() => import('./pages/CalcPage.jsx'));
const GelPage = lazy(() => import('./pages/GelPage.jsx'));
const StatsPage = lazy(() => import('./pages/StatsPage.jsx'));
const StoragePage = lazy(() => import('./pages/StoragePage.jsx'));
const MaintenancePage = lazy(() => import('./pages/MaintenancePage.jsx'));

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

/** Pendant une maintenance, les comptes non administrateurs attendent ici. */
function MaintenanceScreen({ message, onRetry, onLogout, signedIn }) {
  return (
    <div className="login">
      <div className="login-sheet maintenance-sheet" role="alert">
        <Wrench size={34} className="maintenance-icon" aria-hidden="true" />
        <h1 className="brand-title">Maintenance en cours</h1>
        <p>{message || 'Le cahier est en maintenance.'}</p>
        <p className="muted small">Rien n’est perdu : vos entrées vous attendent. Réessayez dans quelques minutes.</p>
        <button type="button" className="btn btn-primary btn-block" onClick={onRetry}><RefreshCw size={15} /> Réessayer</button>
        <button type="button" className="btn btn-ghost btn-block" onClick={onLogout}>{signedIn ? 'Se déconnecter' : 'Se connecter avec un autre compte'}</button>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined : vérification en cours
  const [maintenance, setMaintenance] = useState(null); // message du mode maintenance
  const navigate = useNavigate();
  const landed = useRef(false);
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

  const loadMe = useCallback(() => api.get('/auth/me')
    .then((u) => { setMaintenance(null); setUser(u); })
    .catch((err) => {
      if (err.body?.maintenance) return;
      setMaintenance(null); // maintenance levée : retour à la connexion
      setUser(null);
    }), []);

  useEffect(() => {
    loadMe();
    const onUnauthorized = () => setUser(null);
    const onMaintenance = (e) => setMaintenance(e.detail || 'Maintenance en cours.');
    const onMustChange = () => setUser((u) => (u ? { ...u, must_change_password: true } : u));
    window.addEventListener('paillasse:unauthorized', onUnauthorized);
    window.addEventListener('paillasse:maintenance', onMaintenance);
    window.addEventListener('paillasse:must-change-password', onMustChange);
    return () => {
      window.removeEventListener('paillasse:unauthorized', onUnauthorized);
      window.removeEventListener('paillasse:maintenance', onMaintenance);
      window.removeEventListener('paillasse:must-change-password', onMustChange);
    };
  }, [loadMe]);

  // Un administrateur arrive sur la page Maintenance (à la connexion, ou en ouvrant le cahier)
  useEffect(() => {
    if (!user || landed.current) return;
    landed.current = true;
    if (user.is_admin && location.pathname === '/') navigate('/maintenance', { replace: true });
  }, [user, location.pathname, navigate]);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setMaintenance(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (user && !user.must_change_password) reloadProjects();
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
  if (maintenance && !user?.is_admin) return <MaintenanceScreen message={maintenance} onRetry={loadMe} onLogout={logout} signedIn={Boolean(user)} />;
  if (user === undefined) return <div className="splash" aria-busy="true" />;
  if (!user) return <Login onLogin={(u) => { landed.current = false; setUser(u); }} onMaintenance={setMaintenance} />;
  if (user.must_change_password) {
    return (
      <AppContext.Provider value={context}>
        <div className="login" />
        <PasswordDialog forced onDone={(u) => setUser(u)} onLogout={logout} />
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
      </AppContext.Provider>
    );
  }

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
            <Route path="/maintenance" element={user.is_admin ? <Suspense fallback={null}><MaintenancePage /></Suspense> : <Navigate to="/" replace />} />
            <Route path="/maintenance/:tab" element={user.is_admin ? <Suspense fallback={null}><MaintenancePage /></Suspense> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      {newEntry && <NewEntryDialog initialProjectId={newEntry.projectId} initialTemplateId={newEntry.templateId ?? ''} onClose={() => setNewEntry(null)} />}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
    </AppContext.Provider>
  );
}
