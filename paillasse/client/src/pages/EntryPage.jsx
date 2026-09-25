import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArrowLeft, CornerDownRight, Eye, FilePlus2, LayoutTemplate, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { formatDateTime, formatShortDate, shortHash } from '../lib/format.js';
import NoteEditor, { ReadOnlyDoc } from '../components/NoteEditor.jsx';
import Modal from '../components/Modal.jsx';
import PurgeDialog from '../components/admin/PurgeDialog.jsx';
import { StatusBadge } from '../components/EntryList.jsx';
import { FilesPanel, IntegrityPanel, PrintLink, VersionsPanel } from '../components/EntryPanels.jsx';

const SAVE_LABELS = {
  saved: 'Enregistré',
  pending: 'Modifications en attente',
  saving: 'Enregistrement…',
  error: 'Échec de l’enregistrement, nouvel essai dans 5 s',
  conflict: 'Modifiée ailleurs : rechargez la page',
  locked: 'Verrouillée',
};

export default function EntryPage({ id }) {
  const { projects, notify, reloadProjects, user } = useApp();
  const [purging, setPurging] = useState(false);
  const navigate = useNavigate();

  const [entry, setEntry] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [title, setTitle] = useState('');
  const [entryDate, setEntryDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [docKey, setDocKey] = useState(0);
  const [panel, setPanel] = useState('history');
  const [versions, setVersions] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmLock, setConfirmLock] = useState(false);
  const [openVersion, setOpenVersion] = useState(null);
  const editorRef = useRef(null);
  const titleRef = useRef(null);

  // État de l'autosave, hors du cycle de rendu React
  const st = useRef({ dirty: false, saving: null, blocked: false, timer: null, revision: 0, title: '', date: '', content: null, projectId: null });
  const locked = entry?.status === 'locked';
  // Administrateur qui n'est pas membre du projet : il lit, n'écrit pas
  const readOnly = entry?.role === 'admin';
  const frozen = locked || readOnly;

  const loadVersions = useCallback(
    () => api.get(`/entries/${id}/versions`).then(setVersions).catch(() => {}),
    [id],
  );

  useEffect(() => {
    api.get(`/entries/${id}`)
      .then((e) => {
        setEntry(e);
        setTitle(e.title);
        setEntryDate(e.entry_date);
        setProjectId(e.project_id);
        Object.assign(st.current, {
          revision: e.revision, title: e.title, date: e.entry_date, content: e.content,
          projectId: e.project_id, blocked: e.status === 'locked' || e.role === 'admin',
        });
        setSaveState(e.status === 'locked' ? 'locked' : 'saved');
      })
      .catch((err) => setLoadError(err.message));
    loadVersions();
    api.get(`/entries/${id}/attachments`).then(setAttachments).catch(() => {});
  }, [id, loadVersions]);

  // --- Sauvegarde automatique -------------------------------------------------
  const saveRef = useRef(null);
  const schedule = useCallback((delay = 1000) => {
    clearTimeout(st.current.timer);
    st.current.timer = setTimeout(() => saveRef.current().catch(() => {}), delay);
  }, []);

  const save = useCallback(async () => {
    const s = st.current;
    clearTimeout(s.timer);
    if (s.saving || !s.dirty || s.blocked) return;
    s.dirty = false;
    setSaveState('saving');
    s.saving = api.put(`/entries/${id}`, {
      revision: s.revision, title: s.title, entry_date: s.date, content: s.content, project_id: s.projectId,
    });
    try {
      const result = await s.saving;
      s.revision = result.revision;
      setSaveState(s.dirty ? 'pending' : 'saved');
      if (s.dirty) schedule();
    } catch (err) {
      s.dirty = true;
      if (err.status === 409) {
        s.blocked = true;
        setSaveState(err.body?.code === 'locked' ? 'locked' : 'conflict');
        notify(err.message, 'error');
      } else {
        setSaveState('error');
        schedule(5000);
      }
      throw err;
    } finally {
      s.saving = null;
    }
  }, [id, schedule, notify]);
  saveRef.current = save;

  /** Attend que tout soit enregistré côté serveur (avant de figer ou verrouiller). */
  const ensureSaved = async () => {
    const s = st.current;
    while (s.saving || (s.dirty && !s.blocked)) {
      if (s.saving) await s.saving.catch(() => {});
      else await save();
    }
    if (s.dirty) throw new Error('Des modifications ne sont pas enregistrées : rechargez la page.');
  };

  const markDirty = (patch) => {
    const s = st.current;
    Object.assign(s, patch);
    s.dirty = true;
    if (!s.blocked) {
      setSaveState('pending');
      schedule();
    }
  };

  useEffect(() => {
    const s = st.current;
    const warn = (e) => {
      if (s.dirty || s.saving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      clearTimeout(s.timer);
      if (s.dirty && !s.blocked) saveRef.current().catch(() => {}); // on quitte l'entrée : dernier enregistrement
    };
  }, []);

  // --- Actions -----------------------------------------------------------------
  const refreshEntry = () => api.get(`/entries/${id}`).then(setEntry).catch(() => {});

  const createVersion = async (note = '') => {
    setBusy(true);
    try {
      await ensureSaved();
      const result = await api.post(`/entries/${id}/versions`, { note });
      if (result.unchanged) notify('Rien n’a changé depuis la dernière version.');
      else notify(`Version ${result.version.version_number} figée.`, 'success');
      await Promise.all([loadVersions(), refreshEntry()]);
      return true;
    } catch (err) {
      notify(err.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    setBusy(true);
    try {
      await ensureSaved();
      const e = await api.post(`/entries/${id}/lock`);
      st.current.blocked = true;
      setEntry(e);
      setSaveState('locked');
      setConfirmLock(false);
      notify('Entrée verrouillée. Elle ne peut plus être modifiée.', 'success');
      loadVersions();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const addendum = async () => {
    try {
      const e = await api.post(`/entries/${id}/addendum`);
      reloadProjects();
      navigate(`/entries/${e.id}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const saveAsTemplate = async () => {
    const name = window.prompt('Nom du modèle', title);
    if (!name?.trim()) return;
    try {
      await ensureSaved();
      await api.post('/templates', { name: name.trim(), from_entry_id: id });
      notify(`Modèle « ${name.trim()} » créé.`, 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const archive = async () => {
    if (!window.confirm('Archiver ce brouillon ? Il disparaîtra des listes mais restera dans la base et dans les exports.')) return;
    try {
      await ensureSaved();
      await api.post(`/entries/${id}/archive`);
      reloadProjects();
      navigate(`/projects/${entry.project_id}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const upload = async (file, derivation) => {
    try {
      const att = await api.upload(id, file, derivation);
      setAttachments((list) => [...list, att]);
      return att;
    } catch (err) {
      notify(`${file.name} : ${err.message}`, 'error');
      throw err;
    }
  };

  const showVersion = async (n) => {
    try {
      setOpenVersion(await api.get(`/entries/${id}/versions/${n}`));
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const restore = (version) => {
    setTitle(version.title);
    setEntryDate(version.entry_date);
    markDirty({ title: version.title, date: version.entry_date, content: version.content });
    st.current.content = version.content;
    setEntry((e) => ({ ...e, content: version.content }));
    setDocKey((k) => k + 1); // recrée l'éditeur avec le contenu restauré
    setOpenVersion(null);
    notify(`Version ${version.version_number} restaurée dans le brouillon. Figez une version pour la conserver.`);
  };

  // Ctrl/Cmd + S : figer une version
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!frozen && !busy) createVersion();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Le titre s'agrandit avec son contenu (recalculé quand la police ou la largeur change)
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    document.fonts?.ready.then(fit);
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement);
    return () => observer.disconnect();
  }, [title, entry]);

  // --- Rendu -------------------------------------------------------------------
  if (loadError) {
    return (
      <div className="page">
        <div className="empty">
          <p>{loadError}</p>
          <Link to="/" className="btn">Retour au journal</Link>
        </div>
      </div>
    );
  }
  if (!entry) return <div className="page"><p className="muted">Chargement…</p></div>;

  const project = projects.find((p) => p.id === projectId);

  return (
    <div className="entry-page">
      <div className="entry-bar">
        <Link to={`/projects/${entry.project_id}`} className="crumb">
          <ArrowLeft size={15} />
          <span className="project-dot" style={{ background: project?.color ?? entry.project_color }} aria-hidden="true" />
          {project?.name ?? entry.project_name}
        </Link>
        <StatusBadge status={entry.status} versionCount={entry.version_count} />
        {!frozen && <span className={`save-state save-${saveState}`} aria-live="polite">{SAVE_LABELS[saveState]}</span>}
        {readOnly && <span className="readonly-badge" title="Vous n’êtes pas membre de ce projet : accès administrateur, en lecture seule"><Eye size={13} aria-hidden="true" /> Lecture seule</span>}
        <div className="head-actions">
          <PrintLink entryId={id} version={locked ? 'last' : null}>Imprimer</PrintLink>
          {!frozen && (
            <>
              <button type="button" className="btn btn-ghost" onClick={saveAsTemplate} title="Enregistrer comme modèle">
                <LayoutTemplate size={15} /> Modèle
              </button>
              <button type="button" className="btn btn-ghost" onClick={archive} title="Archiver ce brouillon">
                <Archive size={15} />
                <span className="sr-only">Archiver</span>
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setConfirmLock(true)} disabled={busy}>
                <Lock size={15} /> Verrouiller
              </button>
            </>
          )}
          {locked && !readOnly && (
            <button type="button" className="btn btn-primary" onClick={addendum}>
              <FilePlus2 size={15} /> Ajouter un addendum
            </button>
          )}
          {user?.is_admin && (
            <button type="button" className="btn btn-ghost btn-danger-ghost" onClick={() => setPurging(true)} title="Supprimer définitivement (administrateur)">
              <Trash2 size={15} />
              <span className="sr-only">Supprimer définitivement</span>
            </button>
          )}
        </div>
      </div>
      {purging && (
        <PurgeDialog
          kind="entries"
          ids={[id]}
          title="Supprimer définitivement cette entrée"
          onClose={() => setPurging(false)}
          onDone={() => { reloadProjects(); setTimeout(() => navigate(`/projects/${entry.project_id}`), 1200); }}
        />
      )}

      <div className="entry-layout">
        <article className={`sheet${locked ? ' sheet-locked' : ''}`}>
          {locked && (
            <div className="stamp" aria-label={`Verrouillée le ${formatDateTime(entry.locked_at)}`}>
              <span>Verrouillée</span>
              <span>{formatDateTime(entry.locked_at)}</span>
              {entry.locked_by_name && <span>{entry.locked_by_name}</span>}
            </div>
          )}
          {entry.parent && (
            <p className="relation">
              <CornerDownRight size={14} /> Addendum à{' '}
              <Link to={`/entries/${entry.parent.id}`}>{entry.parent.title}</Link> ({formatShortDate(entry.parent.entry_date)})
            </p>
          )}
          <textarea
            ref={titleRef}
            className="sheet-title"
            rows={1}
            value={title}
            readOnly={frozen}
            onChange={(e) => {
              const v = e.target.value.replace(/\n/g, ' ');
              setTitle(v);
              markDirty({ title: v });
            }}
            aria-label="Titre de l'entrée"
          />
          <div className="sheet-meta">
            <label>
              <span className="sr-only">Date de l'expérience</span>
              <input
                type="date"
                value={entryDate}
                disabled={frozen}
                onChange={(e) => {
                  if (!e.target.value) return;
                  setEntryDate(e.target.value);
                  markDirty({ date: e.target.value });
                }}
              />
            </label>
            {!frozen && projects.length > 1 && (
              <label>
                <span className="sr-only">Projet</span>
                <select
                  value={projectId}
                  onChange={(e) => {
                    setProjectId(e.target.value);
                    markDirty({ projectId: e.target.value });
                    ensureSaved().then(reloadProjects).catch(() => {});
                  }}
                >
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
            <span className="muted small">Créée par {entry.created_by_name} le {formatDateTime(entry.created_at)}</span>
          </div>

          <NoteEditor
            key={docKey}
            content={entry.content}
            editable={!frozen}
            onChange={(json) => markDirty({ content: json })}
            onUpload={frozen ? undefined : upload}
            entryId={id}
            onReady={(ed) => { editorRef.current = ed; }}
          />

          {entry.addenda?.length > 0 && (
            <section className="addenda">
              <h2>Addenda</h2>
              <ul>
                {entry.addenda.map((a) => (
                  <li key={a.id}>
                    <Link to={`/entries/${a.id}`}>{a.title}</Link>{' '}
                    <span className="muted small">({formatShortDate(a.entry_date)})</span>{' '}
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>

        <aside className="entry-aside" aria-label="Historique, fichiers et intégrité">
          <div className="tabs" role="tablist">
            {[['history', `Historique (${versions.length})`], ['files', `Fichiers (${attachments.length})`], ['integrity', 'Intégrité']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={panel === key}
                className={`tab${panel === key ? ' is-active' : ''}`}
                onClick={() => setPanel(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {panel === 'history' && (
            <VersionsPanel versions={versions} locked={frozen} onCreate={createVersion} onOpen={showVersion} busy={busy} />
          )}
          {panel === 'files' && <FilesPanel attachments={attachments} locked={frozen} onUpload={upload} />}
          {panel === 'integrity' && (
            <IntegrityPanel entryId={id} lastHash={entry.last_version_hash} versionCount={entry.version_count} />
          )}
        </aside>
      </div>

      {confirmLock && (
        <Modal
          title="Verrouiller l'entrée"
          onClose={() => setConfirmLock(false)}
          footer={(
            <>
              <button type="button" className="btn" onClick={() => setConfirmLock(false)}>Annuler</button>
              <button type="button" className="btn btn-primary" onClick={lock} disabled={busy}>
                <Lock size={15} /> Verrouiller définitivement
              </button>
            </>
          )}
        >
          <p>
            Le contenu actuel sera figé dans une version de verrouillage et l'entrée ne pourra plus être modifiée,
            comme une page de cahier signée. Toute correction ou suite passera par un addendum daté.
          </p>
          <p className="muted small">Cette action est irréversible.</p>
        </Modal>
      )}

      {openVersion && (
        <Modal
          wide
          title={`Version ${openVersion.version_number}${openVersion.kind === 'lock' ? ' (verrouillage)' : ''}`}
          onClose={() => setOpenVersion(null)}
          footer={(
            <>
              <PrintLink entryId={id} version={openVersion.version_number}>Imprimer cette version</PrintLink>
              {!frozen && (
                <button type="button" className="btn btn-primary" onClick={() => restore(openVersion)}>
                  <RotateCcw size={15} /> Restaurer dans le brouillon
                </button>
              )}
            </>
          )}
        >
          <p className="muted small">
            Figée le {formatDateTime(openVersion.created_at)} par {openVersion.author}
            {openVersion.note ? `. Note : ${openVersion.note}` : ''}.
            {' '}Empreinte <code className="hash" title={openVersion.hash}>{shortHash(openVersion.hash)}</code>
          </p>
          <div className="version-preview">
            <h3>{openVersion.title}</h3>
            <ReadOnlyDoc content={openVersion.content} />
          </div>
        </Modal>
      )}
    </div>
  );
}
