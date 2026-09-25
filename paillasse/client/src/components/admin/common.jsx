import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Copy, Info, Loader2, XCircle } from 'lucide-react';
import { api } from '../../api.js';

export function formatBytes(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let v = Number(bytes);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: i && v < 10 ? 1 : 0 })} ${units[i]}`;
}

export const formatDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

export function ago(d) {
  if (!d) return 'jamais';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 0) return `dans ${Math.round(-s / 60)} min`;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const days = Math.round(s / 86400);
  return `il y a ${days} jour${days > 1 ? 's' : ''}`;
}

export function duration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  const h = Math.floor(s / 3600);
  if (h < 48) return `${h} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} jours`;
}

const LEVEL_ICONS = { ok: CheckCircle2, danger: XCircle, warn: AlertTriangle, info: Info, running: Loader2 };

/** Pastille d'état : ok (vert), warn (ambre), danger (rouge), info, running. */
export function Status({ level = 'info', children }) {
  const Icon = LEVEL_ICONS[level] ?? Info;
  return <span className={`adm-status is-${level}`}><Icon size={14} aria-hidden="true" className={level === 'running' ? 'spin' : ''} /> {children}</span>;
}

/** Jauge d'occupation. */
export function Gauge({ used, total, label }) {
  const ratio = total ? Math.min(1, used / total) : 0;
  const level = ratio > 0.9 ? 'danger' : ratio > 0.8 ? 'warn' : 'ok';
  return (
    <div className={`adm-gauge is-${level}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={label}>
      <span style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

export function CopyButton({ text, label = 'Copier' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Réseau du labo en HTTP : pas de presse-papiers asynchrone
      const t = document.createElement('textarea');
      t.value = text;
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return <button type="button" className="btn btn-small" onClick={copy}>{done ? <Check size={14} /> : <Copy size={14} />} {done ? 'Copié' : label}</button>;
}

/** Suit une tâche du serveur (sauvegarde, vérification…) jusqu'à la fin ; onEnd(job) à la fin. */
export function useJob(onEnd) {
  const [job, setJob] = useState(null);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  useEffect(() => {
    if (!job || job.status !== 'running') return undefined;
    const t = setTimeout(async () => {
      try {
        const next = await api.get(`/admin/jobs/${job.id}`);
        setJob(next);
        if (next.status !== 'running') endRef.current?.(next);
      } catch (err) {
        setJob((j) => ({ ...j, status: 'failed', error: err.message }));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [job]);
  return [job, setJob];
}

/** Avancement et journal d'une tâche. */
export function JobPanel({ job, onClose }) {
  if (!job) return null;
  const pct = job.total ? Math.round((job.done / job.total) * 100) : null;
  const level = job.status === 'running' ? 'running' : job.status === 'ok' ? 'ok' : 'danger';
  const text = { running: 'En cours', ok: 'Terminé', failed: 'Échec' }[job.status] ?? job.status;
  return (
    <section className={`adm-job is-${level}`} aria-live="polite">
      <header>
        <Status level={level}>{text}</Status>
        <strong>{job.label}</strong>
        {job.status !== 'running' && onClose && <button type="button" className="btn btn-ghost btn-small adm-job-close" onClick={onClose}>Fermer</button>}
      </header>
      {job.status === 'running' && (
        <div className="adm-progress" aria-label="Avancement">
          <span style={{ width: pct == null ? '35%' : `${pct}%` }} className={pct == null ? 'is-indeterminate' : ''} />
        </div>
      )}
      {pct != null && job.status === 'running' && <p className="small muted">{job.done} / {job.total}</p>}
      {job.lines?.length > 0 && (
        <ol className="adm-log">
          {job.lines.slice(-12).map((l, i) => <li key={`${l.at}-${i}`}>{l.text}</li>)}
        </ol>
      )}
      {job.error && <p className="form-error">{job.error}</p>}
    </section>
  );
}

/** Carte de la page Maintenance. */
export function Card({ title, icon: Icon, actions, children, className = '' }) {
  return (
    <section className={`adm-card ${className}`}>
      {(title || actions) && (
        <header className="adm-card-head">
          {title && <h2>{Icon && <Icon size={17} aria-hidden="true" />} {title}</h2>}
          {actions && <div className="adm-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Paires libellé / valeur. */
export function Facts({ items }) {
  return (
    <dl className="adm-facts">
      {items.filter(Boolean).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}
