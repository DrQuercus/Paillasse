import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Database, Download, Gauge as GaugeIcon, Play, ShieldCheck, Table2, Terminal } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { Card, Facts, JobPanel, Status, ago, formatBytes, formatDate, useJob } from './common.jsx';

// Requêtes toutes prêtes pour la console (lecture seule)
const EXAMPLES = [
  ['Dernières connexions', 'SELECT username, display_name, last_login_at FROM users ORDER BY last_login_at DESC NULLS LAST'],
  ['Entrées par projet', 'SELECT p.name AS projet, count(e.id) AS entrees, count(e.id) FILTER (WHERE e.status = \'locked\') AS verrouillees\nFROM projects p LEFT JOIN entries e ON e.project_id = p.id GROUP BY p.name ORDER BY entrees DESC'],
  ['Entrées modifiées aujourd’hui', 'SELECT e.title, u.display_name AS auteur, e.updated_at FROM entries e JOIN users u ON u.id = e.created_by\nWHERE e.updated_at > current_date ORDER BY e.updated_at DESC'],
  ['Brouillons non verrouillés depuis 30 jours', 'SELECT e.title, u.display_name AS auteur, e.updated_at FROM entries e JOIN users u ON u.id = e.created_by\nWHERE e.status = \'draft\' AND e.updated_at < now() - interval \'30 days\' ORDER BY e.updated_at'],
  ['Plus gros fichiers joints', 'SELECT a.filename, pg_size_pretty(a.size_bytes) AS taille, e.title AS entree FROM attachments a JOIN entries e ON e.id = a.entry_id\nORDER BY a.size_bytes DESC LIMIT 20'],
  ['Journal d’administration', 'SELECT at, user_name, action, detail FROM admin_log ORDER BY at DESC LIMIT 50'],
];

function SqlConsole() {
  const [sql, setSql] = useState(EXAMPLES[0][1]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const runQuery = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await api.post('/admin/db/query', { sql }));
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="adm-sql">
      <div className="adm-row">
        <label className="field adm-grow">
          <span>Requête toute prête</span>
          <select onChange={(e) => { if (e.target.value) setSql(EXAMPLES[Number(e.target.value)][1]); }} defaultValue="0">
            {EXAMPLES.map(([label], i) => <option key={label} value={i}>{label}</option>)}
          </select>
        </label>
      </div>
      <textarea
        className="adm-sql-input"
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); } }}
        rows={5}
        spellCheck={false}
        aria-label="Requête SQL"
      />
      <div className="adm-row">
        <button type="button" className="btn btn-primary btn-small" onClick={runQuery} disabled={busy || !sql.trim()}><Play size={14} /> Exécuter <kbd>Ctrl+Entrée</kbd></button>
        <span className="hint">Lecture seule : une seule instruction, 10 s au plus, 500 lignes affichées. Rien ne peut être modifié d’ici.</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      {result && (
        <>
          <p className="small muted">{result.total} ligne{result.total > 1 ? 's' : ''}{result.total > result.rows.length ? ` (${result.rows.length} affichées)` : ''} · {result.ms} ms</p>
          <div className="adm-table-wrap adm-sql-result">
            <table className="adm-table">
              <thead><tr>{result.fields.map((f) => <th key={f}>{f}</th>)}</tr></thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>{row.map((v, j) => <td key={j} className={v === null ? 'is-null' : ''}>{v === null ? 'null' : String(v)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default function DatabaseTab() {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get('/admin/db').then(setData).catch((err) => notify(err.message, 'error')), [notify]);
  const [job, setJob] = useJob(() => load());
  useEffect(() => { load(); }, [load]);

  const start = async (url) => {
    try {
      setJob(await api.post(url));
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!data) return <p className="muted">Chargement…</p>;
  const problems = job?.kind === 'verify' && job.status === 'ok' ? job.result?.problems ?? [] : null;
  const busy = job?.status === 'running';
  const lastMigration = data.migrations.applied.at(-1);

  return (
    <div className="adm-stack">
      <div className="adm-grid">
        <Card title="PostgreSQL" icon={Database}>
          <p className="adm-big"><Status level="ok">Base « {data.name} » en service</Status></p>
          <Facts items={[
            ['Version', data.version.split(' ')[0]],
            ['Taille', formatBytes(data.size)],
            ['Rôle', data.role],
            ['Connexions', data.connections],
            ['Démarrée', `${formatDate(data.started_at)} (${ago(data.started_at)})`],
            ['Schéma', data.migrations.pending.length ? `${data.migrations.pending.length} migration(s) en attente` : `à jour (${lastMigration?.name.replace('.sql', '')})`],
          ]} />
        </Card>
        <Card title="Actions" icon={ShieldCheck}>
          <div className="adm-action-list">
            <button type="button" className="adm-action" onClick={() => start('/admin/db/verify')} disabled={busy}>
              <ShieldCheck size={18} aria-hidden="true" />
              <span><strong>Vérifier l’intégrité de tout le cahier</strong><small>Recalcule les empreintes de chaque version figée (entrées et séquences) et relit leurs fichiers.</small></span>
            </button>
            <button type="button" className="adm-action" onClick={() => start('/admin/db/vacuum')} disabled={busy}>
              <GaugeIcon size={18} aria-hidden="true" />
              <span><strong>Optimiser (VACUUM ANALYZE)</strong><small>Récupère la place et remet à jour les statistiques. Sans risque, à tout moment.</small></span>
            </button>
            <a className="adm-action" href="/api/admin/db/dump" download>
              <Download size={18} aria-hidden="true" />
              <span><strong>Télécharger une copie de la base</strong><small>Fichier .dump à restaurer avec pg_restore. Ne contient pas les fichiers joints.</small></span>
            </a>
          </div>
        </Card>
      </div>

      <JobPanel job={job} onClose={() => setJob(null)} />
      {problems && (
        problems.length === 0
          ? <p className="adm-allgood"><Status level="ok">{job.result.entries} entrées et {job.result.sequences} séquences vérifiées : tout concorde.</Status></p>
          : (
            <Card title={`${problems.length} élément(s) à examiner`}>
              <ul className="adm-problems">
                {problems.map((p) => (
                  <li key={p.id}>
                    <Link to={p.kind === 'entry' ? `/entries/${p.id}` : `/sequences/${p.id}`}>{p.title}</Link>
                    <ul>{p.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                  </li>
                ))}
              </ul>
            </Card>
          )
      )}

      <Card title="Tables" icon={Table2}>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Table</th><th className="num">Lignes</th><th className="num">Taille</th><th>Dernier nettoyage</th></tr></thead>
            <tbody>
              {data.tables.map((t) => (
                <tr key={t.name}><td><code>{t.name}</code></td><td className="num">{t.rows.toLocaleString('fr-FR')}</td><td className="num">{formatBytes(t.bytes)}</td><td>{t.vacuumed ? ago(t.vacuumed) : '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Console SQL (lecture seule)" icon={Terminal}>
        <SqlConsole />
      </Card>

      <Card title="Si le serveur ne démarre plus" icon={Terminal}>
        <p className="small">Sans l’application, restaurer une sauvegarde à la main sur le serveur (voir aussi le README) :</p>
        <pre className="adm-pre">{`sudo systemctl stop paillasse
sudo -u postgres dropdb paillasse && sudo -u postgres createdb -O paillasse paillasse
pg_restore --no-owner -d "postgres://paillasse:…@localhost/paillasse" /mnt/nas/paillasse/db/paillasse_AAAA-MM-JJ_HHMMSS.dump
rsync -a --ignore-existing /mnt/nas/paillasse/blobs/ /opt/paillasse/data/blobs/
sudo systemctl start paillasse
# compte administrateur de secours :
npm --prefix /opt/paillasse/server run create-user -- secours --admin`}</pre>
      </Card>
    </div>
  );
}
