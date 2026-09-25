import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, RefreshCw, ScrollText, Server, Settings, Wrench } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { Card, Facts, Status, duration, formatBytes, formatDate } from './common.jsx';

export default function ServerTab() {
  const { notify } = useApp();
  const [info, setInfo] = useState(null);
  const [log, setLog] = useState(null);
  const [errorsOnly, setErrorsOnly] = useState(false);
  const load = useCallback(() => Promise.all([
    api.get('/admin/server').then(setInfo),
    api.get('/admin/log').then(setLog),
  ]).catch((err) => notify(err.message, 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  if (!info || !log) return <p className="muted">Chargement…</p>;
  const lines = errorsOnly ? log.server.filter((l) => l.level !== 'info') : log.server;

  return (
    <div className="adm-stack">
      <div className="adm-grid">
        <Card title="Serveur" icon={Server}>
          <p className="adm-big"><Status level="ok">En ligne depuis {duration(info.uptime)}</Status></p>
          <Facts items={[
            ['Paillasse', info.version],
            ['Node.js', info.node],
            ['Machine', `${info.hostname} · ${info.platform}`],
            ['Processeurs', `${info.cpus} · charge ${info.load.map((l) => l.toFixed(2)).join(' / ')}`],
            ['Mémoire', `${formatBytes(info.memory.rss)} pour Paillasse · ${formatBytes(info.memory.free)} libres sur ${formatBytes(info.memory.total)}`],
            ['Démarré', formatDate(info.started_at)],
            ['Fuseau horaire', info.time_zone],
          ]} />
        </Card>
        <Card title="Configuration" icon={Settings}>
          <Facts items={[
            ['Adresse', `${info.config.host}:${info.config.port}`],
            ['Base', <code key="db">{info.config.database}</code>],
            ['Données', <code key="dd">{info.config.data_dir}</code>],
            ['Sessions', `${info.config.session_days} jours${info.config.secure_cookies ? ', cookies HTTPS' : ''}`],
            ['Envoi maximal', `${info.config.max_upload_mb} Mo par fichier`],
          ]} />
          <p className="hint">Se change dans <code>server/.env</code>, puis <code>sudo systemctl restart paillasse</code>.{!info.config.secure_cookies && ' Derrière nginx en HTTPS, passez SECURE_COOKIES=true.'}</p>
        </Card>
      </div>

      <Card title="Outils du système" icon={Wrench}>
        <table className="adm-table">
          <thead><tr><th>Outil</th><th>Sert à</th><th>État</th></tr></thead>
          <tbody>
            {info.tools.map((t) => (
              <tr key={t.name}>
                <td><code>{t.name}</code></td>
                <td className="small">{{
                  pg_dump: 'copier la base (sauvegardes, téléchargement)', pg_restore: 'relire et restaurer une sauvegarde', psql: 'restaurer une sauvegarde',
                  rsync: 'sauvegardes vers une autre machine', ssh: 'sauvegardes vers une autre machine', 'ssh-keygen': 'créer la clé SSH de Paillasse', primer3_core: 'dessin d’amorces',
                }[t.name]}</td>
                <td>{t.path ? <Status level="ok"><code>{t.path}</code></Status> : <Status level="warn">absent : <code>{t.install}</code></Status>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Journal d’administration" icon={ClipboardList} actions={<button type="button" className="btn btn-small btn-ghost" onClick={load}><RefreshCw size={14} /> Actualiser</button>}>
        {log.admin.length === 0 ? <p className="muted">Rien pour l’instant.</p> : (
          <div className="adm-table-wrap adm-scroll">
            <table className="adm-table">
              <thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Détail</th></tr></thead>
              <tbody>
                {log.admin.map((l) => (
                  <tr key={l.id}><td className="nowrap">{formatDate(l.at)}</td><td>{l.user_name}</td><td>{l.action}</td><td className="small">{l.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="hint">Ce journal ne se modifie pas et ne s’efface pas : la base le refuse.</p>
      </Card>

      <Card
        title="Journal du serveur (depuis le démarrage)"
        icon={ScrollText}
        actions={<label className="adm-check small"><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> <span>Erreurs seulement</span></label>}
      >
        {lines.length === 0 ? <p className="muted small">{errorsOnly ? 'Aucune erreur depuis le démarrage.' : 'Rien pour l’instant.'}</p> : (
          <ol className="adm-serverlog">
            {lines.map((l, i) => (
              <li key={`${l.at}-${i}`} className={`is-${l.level}`}><time>{new Date(l.at).toLocaleTimeString('fr-FR')}</time> {l.text}</li>
            ))}
          </ol>
        )}
        <p className="hint">Les 400 dernières lignes. Le journal complet : <code>journalctl -u paillasse</code>.</p>
      </Card>
    </div>
  );
}
