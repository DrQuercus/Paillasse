import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSearch, FileStack, HardDrive, ScanSearch, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { Card, Facts, Gauge, JobPanel, Status, formatBytes, formatDate, useJob } from './common.jsx';

const short = (sha) => `${sha.slice(0, 12)}…`;

export default function FilesTab() {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get('/admin/files').then(setData).catch((err) => notify(err.message, 'error')), [notify]);
  const [job, setJob] = useJob(() => load());
  useEffect(() => { load(); }, [load]);

  const check = async (deep) => {
    try {
      setJob(await api.post('/admin/files/check', { deep }));
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const purgeOrphans = async () => {
    const typed = window.prompt('Effacer du disque les fichiers que plus rien ne cite ? Une copie de sécurité ancienne qui les citait ne pourra plus les retrouver (sauf dans les sauvegardes). Tapez SUPPRIMER pour confirmer.');
    if (typed === null) return;
    try {
      const r = await api.post('/admin/files/purge-orphans', { confirm: typed.trim() });
      notify(`${r.removed} fichier(s) orphelin(s) effacé(s) (${formatBytes(r.bytes)}).`, 'success');
      setJob(null);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const cleanTmp = async () => {
    try {
      const r = await api.post('/admin/files/clean-tmp');
      notify(`${r.removed} fichier(s) temporaire(s) retiré(s) (${formatBytes(r.bytes)}).`, 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!data) return <p className="muted">Chargement…</p>;
  const { disk } = data;
  const known = data.db.attachments.count + data.db.board_images.count + data.db.sequence_files.count;
  const result = job?.kind === 'files' && job.status === 'ok' ? job.result : null;

  return (
    <div className="adm-stack">
      <div className="adm-grid">
        <Card title="Disque des données" icon={HardDrive}>
          {disk ? (
            <>
              <p className="adm-big"><Status level={disk.free / disk.total < 0.1 ? 'danger' : disk.free / disk.total < 0.2 ? 'warn' : 'ok'}>{formatBytes(disk.free)} libres sur {formatBytes(disk.total)}</Status></p>
              <Gauge used={disk.total - disk.free} total={disk.total} label="Occupation du disque" />
            </>
          ) : <p className="muted">Disque illisible.</p>}
          <Facts items={[['Dossier', <code key="d">{data.data_dir}</code>], ['Fichiers stockés', `${data.blobs.count} (${formatBytes(data.blobs.bytes)})`]]} />
          <p className="hint">Chaque fichier est rangé sous son empreinte SHA-256 : un fichier joint deux fois n’occupe la place qu’une fois.</p>
        </Card>
        <Card title="Ce que la base connaît" icon={FileStack}>
          <Facts items={[
            ['Pièces jointes des entrées', `${data.db.attachments.count} (${formatBytes(data.db.attachments.bytes)})`],
            ['Images des tableaux', `${data.db.board_images.count} (${formatBytes(data.db.board_images.bytes)})`],
            ['Fichiers d’origine des séquences', `${data.db.sequence_files.count} (${formatBytes(data.db.sequence_files.bytes)})`],
            ['Fichiers temporaires', `${data.tmp.count} (${formatBytes(data.tmp.bytes)})${data.tmp.old ? `, dont ${data.tmp.old} de plus d’une heure` : ''}`],
          ]} />
          <div className="adm-row">
            <button type="button" className="btn btn-small" onClick={cleanTmp} disabled={!data.tmp.old}><Trash2 size={14} /> Vider les temporaires anciens</button>
          </div>
          <p className="hint">{known} références pour {data.blobs.count} fichiers sur le disque (un même fichier peut servir plusieurs fois).</p>
        </Card>
      </div>

      <Card title="Vérifier les fichiers" icon={FileSearch}>
        <div className="adm-action-list">
          <button type="button" className="adm-action" onClick={() => check(false)} disabled={job?.status === 'running'}>
            <FileSearch size={18} aria-hidden="true" />
            <span><strong>Vérification rapide</strong><small>Chaque fichier connu de la base est-il sur le disque ? Y a-t-il des fichiers que plus rien ne cite ?</small></span>
          </button>
          <button type="button" className="adm-action" onClick={() => check(true)} disabled={job?.status === 'running'}>
            <ScanSearch size={18} aria-hidden="true" />
            <span><strong>Relecture complète</strong><small>En plus : relit chaque fichier octet par octet et recalcule son empreinte (plus long). Détecte un disque qui s’abîme.</small></span>
          </button>
        </div>
        <JobPanel job={job} onClose={() => setJob(null)} />
        {result && (
          <div className="adm-stack">
            <p className="adm-allgood">
              <Status level={result.missing.length || result.altered.length ? 'danger' : 'ok'}>
                {result.known} fichier(s) connus, {result.on_disk} sur le disque : {result.missing.length} manquant(s){result.deep ? `, ${result.altered.length} altéré(s)` : ''}, {result.orphan_count} orphelin(s).
              </Status>
            </p>
            {(result.missing.length > 0 || result.altered.length > 0) && (
              <>
                <p className="small">Fichiers à récupérer depuis une sauvegarde (dossier <code>blobs/</code>) : la restauration les recopie, ou <code>rsync -a --ignore-existing …/blobs/ {data.data_dir}/blobs/</code>.</p>
                <table className="adm-table">
                  <thead><tr><th>Fichier</th><th>Où</th><th>Problème</th><th>Empreinte</th></tr></thead>
                  <tbody>
                    {result.missing.map((m) => <tr key={`m${m.sha256}`}><td>{m.filename}</td><td>{m.src}</td><td><Status level="danger">Absent du disque</Status></td><td><code>{short(m.sha256)}</code></td></tr>)}
                    {result.altered.map((m) => <tr key={`a${m.sha256}`}><td>{m.filename}</td><td>{m.src}</td><td><Status level="danger">Contenu altéré</Status></td><td><code>{short(m.sha256)}</code></td></tr>)}
                  </tbody>
                </table>
              </>
            )}
            {result.orphan_count > 0 && (
              <div className="adm-orphans">
                <p className="small">{result.orphan_count} fichier(s) orphelin(s) : sur le disque mais cités nulle part (entrée supprimée, envoi interrompu). Ils ne gênent pas et ne sont jamais effacés automatiquement ; les destinations de sauvegarde gardent leur copie.</p>
                <button type="button" className="btn btn-small btn-danger-ghost" onClick={purgeOrphans}><Trash2 size={14} /> Effacer les fichiers orphelins du disque…</button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Plus gros fichiers joints" icon={FileStack}>
        {data.largest.length === 0 ? <p className="muted">Aucun fichier joint.</p> : (
          <table className="adm-table">
            <thead><tr><th>Fichier</th><th>Entrée</th><th className="num">Taille</th><th>Ajouté le</th></tr></thead>
            <tbody>
              {data.largest.map((f) => (
                <tr key={f.id}><td>{f.filename}</td><td><Link to={`/entries/${f.entry_id}`}>{f.entry_title}</Link></td><td className="num">{formatBytes(f.bytes)}</td><td>{formatDate(f.created_at)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
