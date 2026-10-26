import { useCallback, useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { Archive, Database, Eraser, HardDrive, LayoutDashboard, Plug, Server, Users, Wrench } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import OverviewTab from '../components/admin/OverviewTab.jsx';
import UsersTab from '../components/admin/UsersTab.jsx';
import BackupsTab from '../components/admin/BackupsTab.jsx';
import DataTab from '../components/admin/DataTab.jsx';
import DatabaseTab from '../components/admin/DatabaseTab.jsx';
import FilesTab from '../components/admin/FilesTab.jsx';
import ServerTab from '../components/admin/ServerTab.jsx';
import IntegrationsTab from '../components/admin/IntegrationsTab.jsx';

const TABS = [
  ['ensemble', 'Vue d’ensemble', LayoutDashboard, OverviewTab],
  ['comptes', 'Comptes', Users, UsersTab],
  ['sauvegardes', 'Sauvegardes', Archive, BackupsTab],
  ['donnees', 'Données', Eraser, DataTab],
  ['base', 'Base de données', Database, DatabaseTab],
  ['fichiers', 'Fichiers', HardDrive, FilesTab],
  ['integrations', 'Intégrations', Plug, IntegrationsTab],
  ['serveur', 'Serveur', Server, ServerTab],
];

/** Page Maintenance : tout ce qu'il faut pour faire tourner le cahier, réservé aux administrateurs. */
export default function MaintenancePage() {
  const { tab = 'ensemble' } = useParams();
  const { notify } = useApp();
  const [maintenance, setMaintenance] = useState(null);
  const current = TABS.find((t) => t[0] === tab) ?? TABS[0];
  const Tab = current[3];

  const loadMaintenance = useCallback(() => api.get('/admin/maintenance').then(setMaintenance).catch(() => {}), []);
  useEffect(() => { loadMaintenance(); }, [loadMaintenance]);

  const setMode = async (on, message = maintenance?.message ?? '') => {
    try {
      setMaintenance(await api.put('/admin/maintenance', { on, message }));
      notify(on ? 'Mode maintenance activé : les autres comptes attendent.' : 'Mode maintenance levé : tout le monde peut travailler.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="page page-wide maintenance">
      <header className="page-head">
        <div>
          <h1><Wrench size={24} aria-hidden="true" className="adm-title-icon" /> Maintenance</h1>
          <p className="page-lead">Comptes, sauvegardes, base de données, fichiers, intégrations et serveur : de quoi tout gérer en cas de besoin. Chaque action est notée dans le journal.</p>
        </div>
      </header>
      {maintenance?.on && (
        <div className="adm-banner" role="status">
          <Wrench size={16} aria-hidden="true" />
          <span><strong>Mode maintenance actif.</strong> Les autres comptes voient une page d’attente{maintenance.message ? ` : « ${maintenance.message} »` : ''}.</span>
          <button type="button" className="btn btn-small" onClick={() => setMode(false)}>Lever la maintenance</button>
        </div>
      )}
      <nav className="adm-tabs" aria-label="Sections de la maintenance">
        {TABS.map(([key, label, Icon]) => (
          <NavLink key={key} to={key === 'ensemble' ? '/maintenance' : `/maintenance/${key}`} end className={() => `adm-tab${key === current[0] ? ' is-active' : ''}`}>
            <Icon size={15} aria-hidden="true" /> {label}
          </NavLink>
        ))}
      </nav>
      <Tab maintenance={maintenance} onMaintenance={setMode} />
    </div>
  );
}
