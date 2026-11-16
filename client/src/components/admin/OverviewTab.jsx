import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowRight, Database, Download, HardDrive, Server, Users, Wrench } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { Card, Facts, Gauge, JobPanel, Status, ago, duration, formatBytes, useJob } from './common.jsx';

const TAB_URL = { ensemble: '/maintenance', comptes: '/maintenance/comptes', sauvegardes: '/maintenance/sauvegardes', base: '/maintenance/base', fichiers: '/maintenance/fichiers', serveur: '/maintenance/serveur' };

export default function OverviewTab({ maintenance, onMaintenance }) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [message, setMessage] = useState('');
  const load = useCallback(() => api.get('/admin/overview').then(setData).catch((err) => notify(err.message, 'error')), [notify]);
  const [job, setJob] = useJob(() => load());

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { if (maintenance) setMessage(maintenance.message ?? ''); }, [maintenance]);
  useEffect(() => { if (maintenance) load(); }, [maintenance?.on]); // eslint-disable-line react-hooks/exhaustive-deps

  const backupNow = async () => {
    try {
      setJob(await api.post('/admin/backups/run-all'));
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!data) return <p className="muted">Chargement…</p>;
  const { backups, db, disk, files, users, server } = data;
  const lastOkHours = backups.last_ok ? (Date.now() - new Date(backups.last_ok.finished_at).getTime()) / 3_600_000 : Infinity;
  const backupLevel = !backups.targets || lastOkHours > 36 ? 'danger' : backups.last_run?.status === 'failed' ? 'warn' : 'ok';

  return (
    <div className="adm-stack">
      {data.warnings.length > 0 ? (
        <ul className="adm-warnings">
          {data.warnings.map((w) => (
            <li key={w.text} className={`is-${w.level}`}>
              <Status level={w.level === 'info' ? 'info' : w.level}>{w.text}</Status>
              {w.tab !== 'ensemble' && <Link to={TAB_URL[w.tab]} className="adm-warning-link">Voir <ArrowRight size={13} aria-hidden="true" /></Link>}
            </li>
          ))}
        </ul>
      ) : <p className="adm-allgood"><Status level="ok">Tout va bien : sauvegardes à jour, place disponible, rien à signaler.</Status></p>}

      <JobPanel job={job} onClose={() => setJob(null)} />

      <div className="adm-grid">
        <Card title="Sauvegardes" icon={Archive} actions={backups.targets > 0 && <button type="button" className="btn btn-small btn-primary" onClick={backupNow} disabled={job?.status === 'running'}>Sauvegarder</button>}>
          <p className="adm-big"><Status level={backupLevel}>{!backups.targets ? 'Aucune destination active' : backups.last_ok ? `Dernière réussie ${ago(backups.last_ok.finished_at)}` : 'Aucune sauvegarde réussie'}</Status></p>
          <Facts items={[
            ['Destinations actives', backups.targets || 'aucune'],
            backups.last_ok && ['Dernière réussie', `${ago(backups.last_ok.finished_at)}, vers ${backups.last_ok.name}`],
            backups.last_ok && ['Taille de la base', formatBytes(backups.last_ok.dump_bytes)],
            backups.last_run && backups.last_run.status !== 'ok' && ['Dernier essai', backups.last_run.status === 'failed' ? `échec ${ago(backups.last_run.started_at)}` : backups.last_run.status === 'running' ? 'en cours' : 'interrompu'],
          ]} />
          <Link to="/maintenance/sauvegardes" className="adm-more">Destinations, horaires, restauration <ArrowRight size={13} aria-hidden="true" /></Link>
        </Card>

        <Card title="Base de données" icon={Database} actions={<a className="btn btn-small" href="/api/admin/db/dump" download><Download size={14} /> Télécharger</a>}>
          <p className="adm-big"><Status level="ok">PostgreSQL {db.version.split(' ')[0]} répond</Status></p>
          <Facts items={[['Taille', formatBytes(db.size)], ['Connexions', db.connections]]} />
          <Link to="/maintenance/base" className="adm-more">Tables, intégrité, console <ArrowRight size={13} aria-hidden="true" /></Link>
        </Card>

        <Card title="Fichiers et disque" icon={HardDrive}>
          {disk ? (
            <>
              <p className="adm-big"><Status level={disk.free / disk.total < 0.1 ? 'danger' : disk.free / disk.total < 0.2 ? 'warn' : 'ok'}>{formatBytes(disk.free)} libres sur {formatBytes(disk.total)}</Status></p>
              <Gauge used={disk.total - disk.free} total={disk.total} label="Occupation du disque des données" />
            </>
          ) : <p className="muted">Disque illisible.</p>}
          <Facts items={[['Fichiers joints', `${files.count} (${formatBytes(files.bytes)})`]]} />
          <Link to="/maintenance/fichiers" className="adm-more">Vérifier les fichiers <ArrowRight size={13} aria-hidden="true" /></Link>
        </Card>

        <Card title="Comptes" icon={Users}>
          <p className="adm-big"><Status level={users.admins < 2 ? 'info' : 'ok'}>{users.active} compte{users.active > 1 ? 's' : ''} actif{users.active > 1 ? 's' : ''}</Status></p>
          <Facts items={[
            ['Administrateurs', users.admins],
            users.total - users.active > 0 && ['Désactivés', users.total - users.active],
            users.provisional > 0 && ['Mot de passe provisoire', users.provisional],
          ]} />
          <Link to="/maintenance/comptes" className="adm-more">Créer, réinitialiser, désactiver <ArrowRight size={13} aria-hidden="true" /></Link>
        </Card>

        <Card title="Serveur" icon={Server}>
          <p className="adm-big"><Status level="ok">En ligne depuis {duration(server.uptime)}</Status></p>
          <Facts items={[['Paillasse', server.version], ['Node.js', server.node], ['Mémoire', formatBytes(server.memory)], ['Charge', server.load.map((l) => l.toFixed(2)).join(' · ')]]} />
          <Link to="/maintenance/serveur" className="adm-more">Configuration et journal <ArrowRight size={13} aria-hidden="true" /></Link>
        </Card>

        <Card title="Mode maintenance" icon={Wrench} className={maintenance?.on ? 'is-on' : ''}>
          <p className="small muted">Pendant une restauration ou une intervention : les autres comptes voient une page d’attente, rien ne s’écrit. Les administrateurs continuent de travailler.</p>
          <label className="field">
            <span>Message affiché</span>
            <input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="ex. Restauration en cours, retour vers 14 h" maxLength={300} />
          </label>
          <div className="adm-row">
            {maintenance?.on
              ? <button type="button" className="btn" onClick={() => onMaintenance(false, message)}>Lever la maintenance</button>
              : <button type="button" className="btn btn-danger-ghost" onClick={() => onMaintenance(true, message)}>Activer la maintenance</button>}
            {maintenance?.on && <button type="button" className="btn btn-ghost" onClick={() => onMaintenance(true, message)}>Changer le message</button>}
          </div>
        </Card>
      </div>
    </div>
  );
}
