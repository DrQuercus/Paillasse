import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FileDown, FileText, FolderDown, GitCommitVertical, Lock, Paperclip, Printer, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api, fileUrl } from '../api.js';
import { formatDateTime, formatSize, shortHash } from '../lib/format.js';
import { describeEdit } from '../lib/imageEdit.js';

export function VersionsPanel({ versions, locked, onCreate, onOpen, busy }) {
  const [note, setNote] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (await onCreate(note.trim())) setNote('');
  };

  return (
    <div className="panel">
      {!locked && (
        <form className="version-form" onSubmit={submit}>
          <label className="field">
            <span>Figer l'état actuel</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note facultative (ex. après élution)" maxLength={500} />
          </label>
          <button className="btn btn-block" disabled={busy}>
            <GitCommitVertical size={15} /> Figer une version
          </button>
          <p className="hint">Une version figée ne peut plus être modifiée. Raccourci : Ctrl+S.</p>
        </form>
      )}
      {versions.length === 0 ? (
        <p className="muted small">Aucune version figée. Le brouillon est enregistré automatiquement, mais seule une version constitue une trace datée et scellée.</p>
      ) : (
        <ol className="version-list">
          {versions.map((v) => (
            <li key={v.id}>
              <button type="button" className="version-item" onClick={() => onOpen(v.version_number)}>
                <span className="version-num">
                  {v.kind === 'lock' ? <Lock size={13} aria-label="Verrouillage" /> : null}
                  v{v.version_number}
                </span>
                <span className="version-info">
                  <span>{formatDateTime(v.created_at)}</span>
                  {v.note && <span className="version-note">{v.note}</span>}
                  <code className="hash" title={v.hash}>{shortHash(v.hash)}</code>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function FilesPanel({ attachments, locked, onUpload }) {
  const input = useRef(null);
  const byId = new Map(attachments.map((a) => [a.id, a]));
  return (
    <div className="panel">
      {!locked && (
        <>
          <button type="button" className="btn btn-block" onClick={() => input.current.click()}>
            <Paperclip size={15} /> Joindre des fichiers
          </button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = [...e.target.files];
              e.target.value = '';
              files.forEach((f) => onUpload(f).catch(() => {}));
            }}
          />
          <p className="hint">Vous pouvez aussi glisser un fichier ou coller une capture directement dans la page.</p>
        </>
      )}
      {attachments.length === 0 ? (
        <p className="muted small">Aucun fichier joint.</p>
      ) : (
        <ul className="file-list">
          {attachments.map((a) => (
            <li key={a.id}>
              <FileText size={15} aria-hidden="true" />
              <span className="file-main">
                <a href={fileUrl(a.id)} target="_blank" rel="noreferrer">{a.filename}</a>
                <span className="muted small">{formatSize(a.size_bytes)}, {formatDateTime(a.created_at)}</span>
                {a.derived_from && (
                  <span className="small derived">
                    Retouche de « {byId.get(a.derived_from)?.filename ?? 'original'} »
                    {a.edit_params ? ` : ${a.edit_params.summary || describeEdit(a.edit_params)}` : ''}
                  </span>
                )}
                <code className="hash" title={`SHA-256 : ${a.sha256}`}>{shortHash(a.sha256)}</code>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function IntegrityPanel({ entryId, lastHash, versionCount }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      setReport(await api.get(`/entries/${entryId}/verify`));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <p className="small">
        Chaque version est scellée par une empreinte SHA-256 qui inclut celle de la version précédente.
        La vérification recalcule toute la chaîne et relit les fichiers joints sur le disque.
      </p>
      {lastHash ? (
        <div className="hash-block">
          <span className="muted small">Dernière empreinte ({versionCount} version{versionCount > 1 ? 's' : ''})</span>
          <code className="hash hash-full">{lastHash}</code>
        </div>
      ) : (
        <p className="muted small">Aucune version figée pour l'instant.</p>
      )}
      <button type="button" className="btn btn-block" onClick={verify} disabled={busy}>
        <ShieldCheck size={15} /> {busy ? 'Vérification…' : "Vérifier l'intégrité"}
      </button>
      {error && <p className="form-error">{error}</p>}
      {report && (
        <div className={`integrity ${report.ok ? 'integrity-ok' : 'integrity-bad'}`} role="status">
          {report.ok ? (
            <p><ShieldCheck size={16} /> Chaîne intacte : {report.version_count} version{report.version_count > 1 ? 's' : ''} et {report.file_count} fichier{report.file_count > 1 ? 's' : ''} vérifiés.</p>
          ) : (
            <>
              <p><TriangleAlert size={16} /> Anomalies détectées :</p>
              <ul>{report.issues.map((i) => <li key={i}>{i}</li>)}</ul>
            </>
          )}
          <p className="muted small">Vérifié le {formatDateTime(report.checked_at)}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Export Markdown d'une entrée (ou d'une version) : .md seul, ou zip avec les fichiers joints à côté
 * (liens relatifs, à ouvrir dans Obsidian ou n'importe quel éditeur Markdown).
 */
export function MarkdownMenu({ entryId, version, hasFiles, label = 'Markdown' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const base = `/api/entries/${entryId}/markdown${version ? `?version=${version}` : ''}`;
  const withFiles = `${base}${version ? '&' : '?'}files=1`;
  return (
    <div className="tool-menu export-menu" ref={ref}>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
        title="Exporter en Markdown (.md), pour Obsidian, un dépôt Git ou un éditeur de texte">
        <FileDown size={15} /> {label} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="menu menu-right" role="menu">
          <a role="menuitem" className="menu-item menu-item-2" href={base} download onClick={() => setOpen(false)}>
            <FileText size={15} aria-hidden="true" />
            <span><strong>Fichier .md</strong><span>Le texte seul ; les images restent sur le serveur</span></span>
          </a>
          {hasFiles && (
            <a role="menuitem" className="menu-item menu-item-2" href={withFiles} download onClick={() => setOpen(false)}>
              <FolderDown size={15} aria-hidden="true" />
              <span><strong>.md et ses fichiers (.zip)</strong><span>Images et pièces jointes à côté : s’ouvre tel quel dans Obsidian</span></span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function PrintLink({ entryId, version, children }) {
  const href = `/api/entries/${entryId}/print${version ? `?version=${version}` : ''}`;
  return (
    <a className="btn btn-ghost" href={href} target="_blank" rel="noreferrer" title="Ouvre une page imprimable (ou enregistrable en PDF)">
      <Printer size={15} /> {children}
    </a>
  );
}
