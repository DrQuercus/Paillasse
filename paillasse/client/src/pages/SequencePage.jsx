import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Eye, GitCommitVertical, Menu, PanelRightClose, PanelRightOpen, RotateCcw, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { formatDateTime } from '../lib/format.js';
import { colorBaseline, fromOve, toOve } from '../lib/oveFormat.js';
import { newId } from '../lib/ids.js';
import { rangeBases, revcomp } from '../lib/dna.js';
import { copyText } from '../lib/clipboard.js';
import DigestDialog from '../components/seqtools/DigestDialog.jsx';
import PrimerDialog from '../components/seqtools/PrimerDialog.jsx';
import PcrDialog from '../components/seqtools/PcrDialog.jsx';
import Ribbon from '../components/seqtools/Ribbon.jsx';
import StatusBar from '../components/seqtools/StatusBar.jsx';
import SequencePanel from '../components/seqtools/SequencePanel.jsx';
import AddDialog from '../components/seqtools/AddDialog.jsx';

const EDITOR_PROTOCOL = 2; // doit correspondre à public/sequence-editor.js
const VIEW_KEY = 'paillasse.sequenceView';
const DEFAULT_VIEW = { layout: 'both', features: true, primers: true, primerBases: true, enzymes: 'single', orfs: false, translations: false };
const SAVE_LABELS = {
  saved: 'Enregistré', pending: 'Modifications en attente', saving: 'Enregistrement…',
  error: 'Échec de l’enregistrement, nouvel essai dans 5 s', conflict: 'Modifiée ailleurs : rechargez la page',
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pick = (s) => ({ sequence: s.sequence, circular: s.circular, features: s.features, primers: s.primers });
const loadView = () => {
  try {
    return { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}') };
  } catch {
    return DEFAULT_VIEW;
  }
};

export default function SequencePage({ id }) {
  const { notify, projects } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null); // copie de travail affichée (listes, barre d'état)
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [versions, setVersions] = useState([]);
  const [viewing, setViewing] = useState(null); // version affichée en lecture seule
  const [view, setViewState] = useState(loadView);
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState('features');
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState(null); // 'digest' | 'primers'
  const [adding, setAdding] = useState(null); // 'feature' | 'primer'
  const [selection, setSelection] = useState(null);
  const frame = useRef(null);
  const st = useRef({ ready: false, data: null, baseline: null, revision: 0, dirty: false, saving: null, timer: null, blocked: false, name: '' });
  const viewingRef = useRef(null);
  viewingRef.current = viewing;
  const viewRef = useRef(view);
  viewRef.current = view;

  const send = (msg) => frame.current?.contentWindow?.postMessage(msg, window.location.origin);

  // Mode concentré : la barre latérale de Paillasse est masquée pour laisser la place à l'éditeur
  const [focus, setFocus] = useState(true);
  useEffect(() => {
    document.body.classList.toggle('seq-focus', focus);
    return () => document.body.classList.remove('seq-focus');
  }, [focus]);
  const shown = viewing ? pick(viewing) : data;
  // Séquence d'un projet dont l'administrateur n'est pas membre : il la lit, ne la modifie pas
  const adminView = meta?.role === 'admin';
  const readOnly = Boolean(viewing) || adminView;

  const setView = (next) => {
    const reload = next.primerBases !== viewRef.current.primerBases; // change les données envoyées à OVE
    setViewState(next);
    viewRef.current = next;
    try { localStorage.setItem(VIEW_KEY, JSON.stringify(next)); } catch { /* sans stockage */ }
    if (reload) pushToEditor();
    else send({ type: 'view', view: next });
  };

  const loadVersions = useCallback(() => api.get(`/sequences/${id}/versions`).then(setVersions).catch(() => {}), [id]);

  /** Envoie à l'éditeur la copie de travail, ou la version consultée (lecture seule). */
  function pushToEditor(version = viewingRef.current) {
    const s = st.current;
    if (!s.ready || !s.data) return;
    const content = version ? { ...pick(version), name: version.name } : { ...s.data, name: s.name };
    s.baseline = null;
    setSelection(null);
    send({ type: 'load', sequenceData: toOve(content, { primerBases: viewRef.current.primerBases }), readOnly: Boolean(version) || s.readOnly, view: viewRef.current });
    send({ type: 'request' }); // état initial vu par l'éditeur : référence des couleurs par défaut
  }

  useEffect(() => {
    api.get(`/sequences/${id}`)
      .then((s) => {
        setMeta(s);
        setName(s.name);
        setData(pick(s));
        Object.assign(st.current, { data: pick(s), revision: s.revision, name: s.name, readOnly: s.role === 'admin', blocked: s.role === 'admin' });
        pushToEditor();
      })
      .catch((err) => setError(err.message));
    loadVersions();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Sauvegarde automatique --------------------------------------------------------
  const saveRef = useRef(null);
  const schedule = useCallback((delay = 1200) => {
    clearTimeout(st.current.timer);
    st.current.timer = setTimeout(() => saveRef.current().catch(() => {}), delay);
  }, []);

  const save = useCallback(async () => {
    const s = st.current;
    clearTimeout(s.timer);
    if (s.saving || !s.dirty || s.blocked) return;
    s.dirty = false;
    setSaveState('saving');
    s.saving = api.put(`/sequences/${id}`, { revision: s.revision, name: s.name, data: s.data });
    try {
      const r = await s.saving;
      s.revision = r.revision;
      setMeta((m) => ({ ...m, length: r.length, updated_at: r.updated_at, revision: r.revision }));
      setSaveState(s.dirty ? 'pending' : 'saved');
      if (s.dirty) schedule();
    } catch (err) {
      s.dirty = true;
      if (err.status === 409) {
        s.blocked = true;
        setSaveState('conflict');
      } else {
        setSaveState('error');
        if (err.status === 400) notify(err.message, 'error');
        schedule(5000);
      }
      throw err;
    } finally {
      s.saving = null;
    }
  }, [id, schedule, notify]);
  saveRef.current = save;

  const ensureSaved = async () => {
    const s = st.current;
    while (s.saving || (s.dirty && !s.blocked)) {
      if (s.saving) await s.saving.catch(() => {});
      else await save();
    }
    if (s.dirty) throw new Error("Des modifications n'ont pas pu être enregistrées.");
  };

  const markDirty = () => {
    st.current.dirty = true;
    if (!st.current.blocked) {
      setSaveState('pending');
      schedule();
    }
  };

  /** Remplace la copie de travail (ajout ou suppression depuis Paillasse) et recharge l'éditeur. */
  const replaceData = (next) => {
    st.current.data = next;
    setData(next);
    pushToEditor(null);
    markDirty();
  };

  // --- Messages de l'éditeur ---------------------------------------------------------
  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== window.location.origin || e.source !== frame.current?.contentWindow) return;
      const msg = e.data ?? {};
      const s = st.current;
      if (msg.type === 'ready') {
        if (msg.protocol !== EDITOR_PROTOCOL) {
          notify('L’éditeur chargé est une ancienne version gardée en cache : rechargez la page (Ctrl+Maj+R ou Cmd+Maj+R).', 'error');
        }
        s.ready = true;
        pushToEditor();
      } else if (msg.type === 'change' && !viewingRef.current && s.data) {
        if (!s.baseline) {
          if (msg.requested) s.baseline = colorBaseline(msg.sequenceData);
          return; // chargement en cours
        }
        const next = fromOve(msg.sequenceData, s.data, s.baseline);
        if (same(next, s.data)) return;
        s.data = next;
        setData(next);
        setMeta((m) => ({ ...m, length: next.sequence.length, circular: next.circular }));
        markDirty();
      } else if (msg.type === 'selection') {
        setSelection(msg.start >= 0 && msg.end >= 0 ? { start: msg.start, end: msg.end } : null);
      } else if (msg.type === 'freeze') {
        freezeRef.current();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = st.current;
    const warn = (e) => { if (s.dirty || s.saving) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      clearTimeout(s.timer);
      if (s.dirty && !s.blocked) saveRef.current().catch(() => {});
    };
  }, []);

  // --- Versions ----------------------------------------------------------------------
  const freeze = async (note = '') => {
    if (viewingRef.current || st.current.readOnly) return;
    setBusy(true);
    try {
      await ensureSaved();
      const r = await api.post(`/sequences/${id}/versions`, { note });
      notify(r.unchanged ? 'Rien n’a changé depuis la dernière version.' : `Version ${r.version.version_number} figée.`, r.unchanged ? 'info' : 'success');
      setMeta((m) => ({ ...m, version_count: r.version.version_number, last_version_hash: r.version.hash }));
      loadVersions();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const freezeRef = useRef(freeze);
  freezeRef.current = freeze;

  const openVersion = useCallback(async (n) => {
    try {
      await ensureSaved();
      const v = await api.get(`/sequences/${id}/versions/${n}`);
      setViewing(v);
      viewingRef.current = v;
      pushToEditor(v);
    } catch (err) {
      notify(err.message, 'error');
    }
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const wanted = params.get('version');
  useEffect(() => {
    if (wanted && meta && viewing?.version_number !== Number(wanted)) openVersion(Number(wanted));
  }, [wanted, meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const backToWorkingCopy = () => {
    setViewing(null);
    viewingRef.current = null;
    setParams({}, { replace: true });
    pushToEditor(null);
  };

  const restore = () => {
    const v = viewing;
    st.current.name = v.name;
    setName(v.name);
    setViewing(null);
    viewingRef.current = null;
    setParams({}, { replace: true });
    replaceData(pick(v));
    notify(`Version ${v.version_number} restaurée dans la copie de travail. Figez une version pour la conserver.`);
  };

  // --- Actions du ruban et du panneau ------------------------------------------------
  const selectRange = (start, end) => send({ type: 'select', start, end });

  const copySelection = async (reverse) => {
    if (!selection || !shown) return;
    const bases = rangeBases(shown.sequence, selection.start, selection.end).toUpperCase();
    try {
      await copyText(reverse ? revcomp(bases) : bases);
      notify(`${bases.length} bases copiées${reverse ? ' (complément inverse)' : ''}.`, 'success');
    } catch {
      notify('Copie impossible dans ce navigateur.', 'error');
    }
  };

  const addItem = (item) => {
    const s = st.current;
    const kind = adding;
    setAdding(null);
    replaceData(kind === 'feature'
      ? { ...s.data, features: [...s.data.features, { id: newId(), ...item }] }
      : { ...s.data, primers: [...s.data.primers, { id: newId(), ...item }] });
    setTab(kind === 'feature' ? 'features' : 'primers');
    notify(kind === 'feature' ? `Annotation « ${item.name} » ajoutée.` : `Amorce « ${item.name} » ajoutée.`, 'success');
  };

  const removeFeature = (f) => {
    if (!window.confirm(`Supprimer l'annotation « ${f.name} » ? (les versions figées la conservent)`)) return;
    replaceData({ ...st.current.data, features: st.current.data.features.filter((x) => x.id !== f.id) });
  };
  const removePrimer = (p) => {
    if (!window.confirm(`Supprimer l'amorce « ${p.name} » ? (les versions figées la conservent)`)) return;
    replaceData({ ...st.current.data, primers: st.current.data.primers.filter((x) => x.id !== p.id) });
  };

  /** Amorces dessinées par primer3 → copie de travail. */
  const addPrimers = (items) => {
    const s = st.current;
    replaceData({
      ...s.data,
      primers: [...s.data.primers, ...items.map(({ name: primerName, primer }) => ({
        id: newId(), name: primerName, bases: primer.sequence, description: `Dessinée avec primer3 (Tm ${primer.tm} °C)`, color: null,
        sites: [{ start: primer.start, end: primer.end, strand: primer.strand, annealed: primer.sequence, tm: primer.tm }],
      }))],
    });
    setTab('primers');
  };

  const openTool = async (which) => {
    try {
      if (!viewing) await ensureSaved(); // les outils calculent sur la version enregistrée
      if (which === 'primers') {
        send({ type: 'getSelection' }); // sélection courante (y compris faite avec la recherche d'OVE)
        await new Promise((r) => setTimeout(r, 150));
      }
      setTool(which);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const exportAs = async (format) => {
    try {
      if (!viewing) await ensureSaved();
      window.location.href = `/api/sequences/${id}/export?format=${format}${viewing ? `&version=${viewing.version_number}` : ''}`;
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const updateMeta = async (patch) => {
    try {
      await ensureSaved();
      const r = await api.put(`/sequences/${id}`, { revision: st.current.revision, ...patch });
      st.current.revision = r.revision;
      setMeta((m) => ({ ...m, ...patch }));
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const archive = async () => {
    if (!window.confirm('Archiver cette séquence ? Elle disparaîtra du registre mais restera dans la base, avec ses versions.')) return;
    try {
      await ensureSaved();
      await api.post(`/sequences/${id}/archive`);
      navigate('/sequences');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (error) return <div className="page"><div className="empty"><p>{error}</p><Link to="/sequences" className="btn">Retour au registre</Link></div></div>;

  return (
    <div className="seq-page">
      <div className="seq-bar">
        <button type="button" className="icon-btn seq-menu" onClick={() => setFocus((f) => !f)} title={focus ? 'Afficher le menu de Paillasse' : 'Masquer le menu'} aria-label="Menu de Paillasse">
          <Menu size={18} />
        </button>
        <Link to="/sequences" className="crumb"><ArrowLeft size={15} /> Séquences</Link>
        {meta && <code className="seq-code">{meta.code}</code>}
        <input
          className="seq-name"
          value={name}
          readOnly={readOnly}
          onChange={(e) => {
            setName(e.target.value);
            st.current.name = e.target.value;
            markDirty();
          }}
          aria-label="Nom de la séquence"
        />
        {!readOnly && <span className={`save-state save-${saveState}`} aria-live="polite">{SAVE_LABELS[saveState]}</span>}
        {adminView && <span className="readonly-badge" title="Séquence d’un projet dont vous n’êtes pas membre : accès administrateur, en lecture seule"><Eye size={13} aria-hidden="true" /> Lecture seule</span>}
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={() => exportAs('genbank')} title="Exporter en GenBank (lisible par SnapGene, Benchling…)"><Download size={15} /> GenBank</button>
          <button type="button" className="btn btn-ghost" onClick={() => exportAs('fasta')}><Download size={15} /> FASTA</button>
          {!readOnly && (
            <button type="button" className="btn btn-primary" onClick={() => freeze()} disabled={busy} title="Figer une version (Ctrl+S)">
              <GitCommitVertical size={15} /> Figer une version
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setPanelOpen((o) => !o)} title={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'} aria-label={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'}>
            {panelOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </div>

      <Ribbon
        view={view}
        setView={setView}
        hasSelection={Boolean(selection)}
        readOnly={readOnly}
        onAddFeature={() => setAdding('feature')}
        onAddPrimer={() => setAdding('primer')}
        onCopy={copySelection}
        onTool={openTool}
      />

      {viewing && (
        <div className="seq-banner" role="status">
          <span>
            Version {viewing.version_number} figée le {formatDateTime(viewing.created_at)} par {viewing.author}
            {viewing.note ? ` (${viewing.note})` : ''}, en lecture seule.
          </span>
          <button type="button" className="btn btn-small" onClick={restore}><RotateCcw size={14} /> Restaurer dans la copie de travail</button>
          <button type="button" className="btn btn-small btn-ghost" onClick={backToWorkingCopy}><X size={14} /> Revenir à la copie de travail</button>
        </div>
      )}

      <div className="seq-body">
        <iframe ref={frame} className="seq-frame" src="/sequence-editor.html" title="Éditeur de séquence" />
        {panelOpen && (
          <SequencePanel
            tab={tab}
            setTab={setTab}
            data={shown}
            readOnly={readOnly}
            sequenceId={id}
            version={viewing?.version_number}
            revision={meta?.revision}
            meta={meta}
            versions={versions}
            viewing={viewing}
            projects={projects}
            onSelect={selectRange}
            onDelete={tab === 'primers' ? removePrimer : removeFeature}
            onOpenVersion={openVersion}
            onUpdateMeta={updateMeta}
            onArchive={archive}
          />
        )}
      </div>

      <StatusBar data={shown} selection={selection} />

      {adding && selection && data && (
        <AddDialog kind={adding} data={data} selection={selection} onAdd={addItem} onClose={() => setAdding(null)} />
      )}
      {tool === 'digest' && meta && (
        <DigestDialog sequenceId={id} version={viewing?.version_number} name={name} notify={notify} onClose={() => setTool(null)} />
      )}
      {tool === 'pcr' && meta && (
        <PcrDialog
          sequenceId={id}
          version={viewing?.version_number}
          name={name}
          data={shown}
          notify={notify}
          onClose={() => setTool(null)}
          onCreated={(created) => {
            setTool(null);
            navigate(`/sequences/${created.id}`);
          }}
        />
      )}
      {tool === 'primers' && meta && (
        <PrimerDialog sequenceId={id} name={name} length={meta.length} selection={selection} notify={notify} onAdd={addPrimers} onClose={() => setTool(null)} />
      )}
    </div>
  );
}
