import { useCallback, useEffect, useState } from 'react';
import {
  Archive, CalendarClock, Download, FlaskConical, HardDrive, History, KeyRound, ListChecks, Pencil, Play, Plus, RotateCcw, Server, Trash2,
} from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import Modal from '../Modal.jsx';
import { Segmented } from '../calc/fields.jsx';
import { Card, CopyButton, JobPanel, Status, ago, duration, formatBytes, formatDate, useJob } from './common.jsx';

const RUN_STATUS = { ok: ['ok', 'Réussie'], failed: ['danger', 'Échec'], running: ['running', 'En cours'], interrupted: ['warn', 'Interrompue'] };

function splitDest(dest) {
  const m = /^(?:([^@:/]+)@)?([^:/]+):(\/.*)$/.exec(dest ?? '');
  return m ? { kind: 'ssh', user: m[1] ?? '', host: m[2], path: m[3] } : { kind: 'local', path: dest ?? '' };
}

function TargetDialog({ target, onClose, onSaved }) {
  const { notify } = useApp();
  const initial = splitDest(target?.dest);
  const [kind, setKind] = useState(target ? initial.kind : 'local');
  const [name, setName] = useState(target?.name ?? '');
  const [path, setPath] = useState(initial.path ?? '');
  const [user, setUser] = useState(initial.user ?? '');
  const [host, setHost] = useState(initial.host ?? '');
  const [port, setPort] = useState(target?.port ? String(target.port) : '');
  const [scheduled, setScheduled] = useState(target ? Boolean(target.schedule) : true);
  const [time, setTime] = useState(target?.schedule || '02:30');
  const [keep, setKeep] = useState(String(target?.keep ?? 30));
  const [enabled, setEnabled] = useState(target?.enabled ?? true);
  const [busy, setBusy] = useState(false);
  const dest = kind === 'local' ? path.trim() : `${user.trim() ? `${user.trim()}@` : ''}${host.trim()}:${path.trim()}`;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const body = { name, dest, port: kind === 'ssh' ? port : '', schedule: scheduled ? time : '', keep, enabled };
    try {
      const saved = target ? await api.put(`/admin/backups/targets/${target.id}`, body) : await api.post('/admin/backups/targets', body);
      onSaved(saved);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={target ? `Modifier : ${target.name}` : 'Nouvelle destination de sauvegarde'}
      onClose={onClose}
      wide
      footer={(
        <>
          <span className="modal-foot-note">Après l’enregistrement : « Tester », puis « Sauvegarder maintenant ».</span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="target-form" className="btn btn-primary" disabled={busy || !name.trim() || !path.trim() || (kind === 'ssh' && !host.trim())}>Enregistrer</button>
        </>
      )}
    >
      <form id="target-form" className="form-stack" onSubmit={submit}>
        <Segmented label="Où" value={kind} onChange={setKind} options={[['local', 'Dossier du serveur (NAS monté, disque USB)'], ['ssh', 'Autre machine, par SSH']]} />
        <label className="field">
          <span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'local' ? 'ex. NAS du labo' : 'ex. Serveur de l’institut'} maxLength={80} autoFocus />
        </label>
        {kind === 'local' ? (
          <label className="field">
            <span>Dossier (chemin absolu sur le serveur)</span>
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/mnt/nas/paillasse" className="mono" />
            <small className="hint">Un partage réseau monté (NAS) ou un disque externe. Le même disque que le cahier ne protège pas d’une panne de disque.</small>
          </label>
        ) : (
          <div className="adm-ssh-fields">
            <label className="field"><span>Utilisateur</span><input value={user} onChange={(e) => setUser(e.target.value)} placeholder="sauvegarde" className="mono" /></label>
            <label className="field"><span>Machine</span><input value={host} onChange={(e) => setHost(e.target.value)} placeholder="nas.labo.local" className="mono" /></label>
            <label className="field"><span>Port</span><input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} placeholder="22" inputMode="numeric" className="mono" /></label>
            <label className="field adm-span"><span>Dossier sur cette machine</span><input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/srv/sauvegardes/paillasse" className="mono" /></label>
            <small className="hint adm-span">rsync doit être installé des deux côtés. La clé SSH de Paillasse (encadré « Clé SSH ») doit être autorisée sur cette machine.</small>
          </div>
        )}
        <div className="adm-schedule">
          <label className="adm-check">
            <input type="checkbox" checked={scheduled} onChange={(e) => setScheduled(e.target.checked)} />
            <span>Chaque jour à</span>
          </label>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!scheduled} aria-label="Heure de la sauvegarde" />
          <span className="muted small">(heure du serveur ; sinon, à la demande)</span>
        </div>
        <label className="field adm-keep">
          <span>Nombre de sauvegardes de la base à garder</span>
          <input type="number" min="1" max="1000" value={keep} onChange={(e) => setKeep(e.target.value)} />
          <small className="hint">Au-delà, les plus anciennes sont retirées. Les fichiers joints, eux, ne sont jamais effacés de la destination.</small>
        </label>
        {target && (
          <label className="adm-check">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Active (décochez pour suspendre la planification sans perdre les réglages)</span>
          </label>
        )}
        <p className="hint">Destination : <code>{dest || '—'}</code></p>
      </form>
    </Modal>
  );
}

/** Restauration : maintenance obligatoire, copie de sécurité automatique, confirmation tapée. */
function RestoreDialog({ source, maintenance, onMaintenance, onClose, onDone }) {
  const { notify } = useApp();
  const [confirm, setConfirm] = useState('');
  const [job, setJob] = useJob((j) => onDone(j));
  const start = async () => {
    try {
      setJob(await api.post('/admin/backups/restore', { ...source.body, confirm }));
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const running = job?.status === 'running';
  return (
    <Modal
      title={`Restaurer ${source.label}`}
      onClose={running ? () => {} : () => onClose(Boolean(job))}
      closable={!running}
      wide
      footer={job && !running ? <button type="button" className="btn btn-primary" onClick={() => onClose(true)}>Fermer</button> : (
        <>
          <button type="button" className="btn" onClick={() => onClose(false)} disabled={running}>Annuler</button>
          <button type="button" className="btn btn-danger" onClick={start} disabled={!maintenance?.on || confirm !== 'RESTAURER' || running}><RotateCcw size={15} /> Restaurer</button>
        </>
      )}
    >
      {!job && (
        <>
          <p className="modal-lead">Toute la base du cahier sera remplacée par celle de cette sauvegarde{source.date ? ` (${formatDate(source.date)})` : ''}. Ce qui a été écrit depuis disparaîtra de la base.</p>
          <ol className="adm-steps">
            <li><strong>Copie de sécurité</strong> de la base actuelle, gardée sur le serveur : on peut revenir en arrière.</li>
            <li><strong>Remplacement en une seule transaction</strong> : si quoi que ce soit échoue, rien ne change.</li>
            <li><strong>Fichiers joints</strong> absents recopiés depuis la sauvegarde (aucun fichier existant n’est touché).</li>
            <li>Les comptes et mots de passe redeviennent ceux de la sauvegarde. Le mode maintenance reste actif : vérifiez, puis levez-le.</li>
          </ol>
          {!maintenance?.on && (
            <div className="adm-banner is-warn">
              <span>Activez d’abord le mode maintenance : personne ne doit écrire pendant la restauration.</span>
              <button type="button" className="btn btn-small" onClick={() => onMaintenance(true, 'Restauration d’une sauvegarde en cours.')}>Activer la maintenance</button>
            </div>
          )}
          <label className="field">
            <span>Pour confirmer, tapez <strong>RESTAURER</strong></span>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" className="mono" />
          </label>
        </>
      )}
      <JobPanel job={job} />
      {job?.status === 'ok' && (
        <p className="adm-allgood"><Status level="ok">Restauration terminée. Copie de sécurité : <code>{job.result?.safety}</code>. Vérifiez le cahier puis levez le mode maintenance.</Status></p>
      )}
    </Modal>
  );
}

function DumpsDialog({ target, maintenance, onMaintenance, onClose, onRestored }) {
  const { notify } = useApp();
  const [dumps, setDumps] = useState(null);
  const [restore, setRestore] = useState(null);
  useEffect(() => {
    api.get(`/admin/backups/targets/${target.id}/dumps`).then(setDumps).catch((err) => { notify(err.message, 'error'); setDumps([]); });
  }, [target.id, notify]);
  if (restore) {
    // Restauration terminée : on referme tout ; annulée : retour à la liste
    return <RestoreDialog source={restore} maintenance={maintenance} onMaintenance={onMaintenance} onClose={(finished) => (finished ? onClose() : setRestore(null))} onDone={onRestored} />;
  }
  return (
    <Modal title={`Sauvegardes présentes : ${target.name}`} onClose={onClose} wide>
      <p className="modal-lead"><code>{target.dest}</code></p>
      {!dumps ? <p className="muted">Lecture de la destination…</p> : dumps.length === 0 ? <p className="muted">Aucune sauvegarde de la base à cet endroit.</p> : (
        <table className="adm-table">
          <thead><tr><th>Sauvegarde de la base</th><th>Date</th><th>Taille</th><th><span className="sr-only">Restaurer</span></th></tr></thead>
          <tbody>
            {dumps.map((d, i) => (
              <tr key={d.name}>
                <td><code>{d.name}</code> {i === 0 && <span className="badge badge-locked">la plus récente</span>}</td>
                <td>{formatDate(d.date)}</td>
                <td>{formatBytes(d.bytes)}</td>
                <td><button type="button" className="btn btn-small" onClick={() => setRestore({ label: d.name, date: d.date, body: { target_id: target.id, dump: d.name } })}><RotateCcw size={14} /> Restaurer…</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

function RunLog({ run, onClose }) {
  const [full, setFull] = useState(null);
  useEffect(() => { api.get(`/admin/backups/runs/${run.id}`).then(setFull).catch(() => setFull({ log: '(journal illisible)' })); }, [run.id]);
  return (
    <Modal title={`Sauvegarde du ${formatDate(run.started_at)} : ${run.target_name}`} onClose={onClose} wide>
      <pre className="adm-pre">{full ? full.log || '(vide)' : 'Chargement…'}</pre>
    </Modal>
  );
}

function scheduleText(t) {
  if (!t.enabled) return 'Suspendue';
  if (!t.schedule) return 'À la demande';
  return `Chaque jour à ${t.schedule}`;
}

export default function BackupsTab({ maintenance, onMaintenance }) {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [safety, setSafety] = useState([]);
  const [dialog, setDialog] = useState(null); // { target? }
  const [dumps, setDumps] = useState(null);
  const [restoreSafety, setRestoreSafety] = useState(null);
  const [runLog, setRunLog] = useState(null);
  const [tests, setTests] = useState({});
  const load = useCallback(() => Promise.all([
    api.get('/admin/backups').then(setData),
    api.get('/admin/files').then((f) => setSafety(f.safety)),
  ]).catch((err) => notify(err.message, 'error')), [notify]);
  const [job, setJob] = useJob(() => load());
  useEffect(() => { load(); }, [load]);
  // Une sauvegarde planifiée en cours apparaît d'elle-même
  useEffect(() => {
    const running = data?.jobs?.find((j) => j.status === 'running');
    if (running && !job) setJob(running);
  }, [data, job, setJob]);

  const run = async (t) => {
    try {
      setJob(await api.post(`/admin/backups/targets/${t.id}/run`));
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const test = async (t) => {
    setTests((m) => ({ ...m, [t.id]: { running: true } }));
    try {
      const r = await api.post(`/admin/backups/targets/${t.id}/test`);
      setTests((m) => ({ ...m, [t.id]: r }));
    } catch (err) {
      setTests((m) => ({ ...m, [t.id]: { ok: false, lines: [err.message], warnings: [] } }));
    }
  };
  const archive = async (t) => {
    if (!window.confirm(`Retirer la destination « ${t.name} » ? Les sauvegardes déjà faites y restent ; il n’y en aura simplement plus de nouvelles.`)) return;
    try {
      await api.post(`/admin/backups/targets/${t.id}/archive`);
      notify('Destination retirée.', 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const removeSafety = async (s) => {
    if (!window.confirm(`Supprimer la copie de sécurité ${s.name} ? On ne pourra plus revenir à cet état.`)) return;
    try {
      await api.del(`/admin/files/safety/${encodeURIComponent(s.name)}`);
      notify('Copie de sécurité supprimée.', 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const makeKey = async () => {
    try {
      const r = await api.post('/admin/backups/ssh-key');
      setData((d) => ({ ...d, public_key: r.public_key }));
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!data) return <p className="muted">Chargement…</p>;
  const missing = data.tools.filter((t) => !t.path);
  const hasSsh = data.targets.some((t) => t.kind === 'ssh');

  return (
    <div className="adm-stack">
      {missing.length > 0 && (
        <div className="adm-banner is-warn">
          <span>Outils absents du serveur : {missing.map((t) => <code key={t.name}>{t.name}</code>).reduce((a, b) => [a, ', ', b])}. À installer : <code>{[...new Set(missing.map((t) => t.install))].join(' ; ')}</code></span>
        </div>
      )}
      <JobPanel job={job} onClose={() => setJob(null)} />

      <Card
        title="Destinations"
        icon={Archive}
        actions={<button type="button" className="btn btn-primary btn-small" onClick={() => setDialog({})}><Plus size={15} /> Ajouter une destination</button>}
      >
        {data.targets.length === 0 && (
          <div className="empty">
            <p><strong>Aucune sauvegarde configurée.</strong></p>
            <p className="muted small">Ajoutez un NAS monté sur le serveur, un disque externe ou une autre machine joignable en SSH. Idéalement deux destinations, dont une hors de la pièce du serveur.</p>
          </div>
        )}
        <ul className="adm-targets">
          {data.targets.map((t) => {
            const last = t.last_run;
            const [level, label] = last ? RUN_STATUS[last.status] ?? ['info', last.status] : ['warn', 'Jamais lancée'];
            const tr = tests[t.id];
            return (
              <li key={t.id} className={`adm-target${t.enabled ? '' : ' is-paused'}`}>
                <div className="adm-target-icon">{t.kind === 'ssh' ? <Server size={20} /> : <HardDrive size={20} />}</div>
                <div className="adm-target-body">
                  <h3>{t.name}</h3>
                  <code className="adm-dest">{t.dest}{t.port ? ` (port ${t.port})` : ''}</code>
                  <div className="adm-target-meta">
                    <span><CalendarClock size={13} aria-hidden="true" /> {scheduleText(t)}{t.next_at && t.enabled ? `, prochaine ${formatDate(t.next_at)}` : ''}</span>
                    <span>garder {t.keep} dump{t.keep > 1 ? 's' : ''}</span>
                    <Status level={level}>{label}{last ? ` ${ago(last.finished_at ?? last.started_at)}` : ''}{last?.dump_bytes ? ` · ${formatBytes(last.dump_bytes)}` : ''}</Status>
                    {t.last_ok && last?.status !== 'ok' && <span className="muted">dernière réussie {ago(t.last_ok)}</span>}
                  </div>
                  {tr && !tr.running && (
                    <div className={`adm-test is-${tr.ok ? 'ok' : 'danger'}`}>
                      {tr.lines.map((l) => <p key={l}>{tr.ok ? '✓' : '✗'} {l}</p>)}
                      {tr.warnings.map((w) => <p key={w} className="is-warn">⚠ {w}</p>)}
                    </div>
                  )}
                </div>
                <div className="adm-target-actions">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => run(t)} disabled={job?.status === 'running'}><Play size={14} /> Sauvegarder maintenant</button>
                  <button type="button" className="btn btn-small" onClick={() => test(t)} disabled={tr?.running}><FlaskConical size={14} /> {tr?.running ? 'Test…' : 'Tester'}</button>
                  <button type="button" className="btn btn-small" onClick={() => setDumps(t)}><ListChecks size={14} /> Sauvegardes, restaurer…</button>
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => setDialog({ target: t })}><Pencil size={14} /> Modifier</button>
                  <button type="button" className="btn btn-small btn-ghost btn-danger-ghost" onClick={() => archive(t)}><Trash2 size={14} /> Retirer</button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="hint">Chaque sauvegarde copie la base (<code>pg_dump</code>, relue aussitôt pour vérifier qu’elle est lisible) et les fichiers joints nouveaux. Organisation : <code>db/paillasse_date.dump</code> et <code>blobs/</code>, comme <code>deploy/backup.sh</code>. Heure du serveur : {formatDate(data.server_time)} ({data.time_zone}).</p>
      </Card>

      <Card title="Clé SSH du serveur" icon={KeyRound}>
        {data.public_key ? (
          <>
            <p className="small">Pour une destination SSH, ajoutez cette ligne au fichier <code>~/.ssh/authorized_keys</code> du compte de sauvegarde, sur l’autre machine :</p>
            <div className="adm-password"><code className="adm-key">{data.public_key}</code><CopyButton text={data.public_key} /></div>
            <p className="hint">Par exemple : <code>echo '…la ligne…' &gt;&gt; ~/.ssh/authorized_keys</code>. Puis « Tester » sur la destination.</p>
          </>
        ) : (
          <>
            <p className="small muted">{hasSsh ? 'Aucune clé propre à Paillasse : ssh utilise celles du compte du service, s’il en a.' : 'Utile seulement pour sauvegarder vers une autre machine par SSH.'}</p>
            <button type="button" className="btn btn-small" onClick={makeKey}><KeyRound size={14} /> Créer la clé de Paillasse</button>
          </>
        )}
      </Card>

      <Card title="Historique" icon={History}>
        {data.runs.length === 0 ? <p className="muted">Aucune sauvegarde pour l’instant.</p> : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Date</th><th>Destination</th><th>Lancée</th><th>État</th><th>Base</th><th>Fichiers copiés</th><th>Durée</th><th><span className="sr-only">Journal</span></th></tr></thead>
              <tbody>
                {data.runs.map((r) => {
                  const [level, label] = RUN_STATUS[r.status] ?? ['info', r.status];
                  return (
                    <tr key={r.id}>
                      <td>{formatDate(r.started_at)}</td>
                      <td>{r.target_name}</td>
                      <td>{r.trigger === 'schedule' ? 'planifiée' : `par ${r.started_by ?? '—'}`}</td>
                      <td><Status level={level}>{label}</Status></td>
                      <td>{formatBytes(r.dump_bytes)}</td>
                      <td>{r.blobs_copied ?? '—'}</td>
                      <td>{r.finished_at ? duration((new Date(r.finished_at) - new Date(r.started_at)) / 1000) : '—'}</td>
                      <td><button type="button" className="btn btn-small btn-ghost" onClick={() => setRunLog(r)}>Journal</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Copies de sécurité (avant restauration ou suppression)" icon={RotateCcw}>
        {safety.length === 0 ? <p className="muted small">Aucune : une copie de la base est prise automatiquement avant chaque restauration et chaque suppression.</p> : (
          <table className="adm-table">
            <thead><tr><th>Copie</th><th>Date</th><th>Taille</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {safety.map((s) => (
                <tr key={s.name}>
                  <td><code>{s.name}</code></td>
                  <td>{formatDate(s.date)}</td>
                  <td>{formatBytes(s.bytes)}</td>
                  <td className="adm-actions">
                    <a className="btn btn-small btn-ghost" href={`/api/admin/files/safety/${encodeURIComponent(s.name)}`} download><Download size={14} /> Télécharger</a>
                    <button type="button" className="btn btn-small" onClick={() => setRestoreSafety({ label: s.name, date: s.date, body: { safety: true, dump: s.name } })}><RotateCcw size={14} /> Revenir à cette copie…</button>
                    <button type="button" className="icon-btn adm-danger" title="Supprimer cette copie" aria-label={`Supprimer ${s.name}`} onClick={() => removeSafety(s)}><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {dialog && <TargetDialog target={dialog.target} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load(); notify('Destination enregistrée. Testez-la maintenant.', 'success'); }} />}
      {dumps && <DumpsDialog target={dumps} maintenance={maintenance} onMaintenance={onMaintenance} onClose={() => { setDumps(null); load(); }} onRestored={() => load()} />}
      {restoreSafety && <RestoreDialog source={restoreSafety} maintenance={maintenance} onMaintenance={onMaintenance} onClose={() => { setRestoreSafety(null); load(); }} onDone={() => load()} />}
      {runLog && <RunLog run={runLog} onClose={() => setRunLog(null)} />}
    </div>
  );
}
