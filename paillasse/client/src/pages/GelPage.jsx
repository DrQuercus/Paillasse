import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { Columns4, History, Upload } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { formatDateTime } from '../lib/format.js';
import { loadGelFile } from '../lib/gel/render.js';
import { MODES, newAnalysis } from '../lib/gel/model.js';
import { clearDraft, lastMode, loadDraft, rememberMode, saveDraft, takeResume } from '../lib/gel/draft.js';
import EntryTargetDialog from '../components/EntryTargetDialog.jsx';
import GelWorkbench from '../components/gel/GelWorkbench.jsx';
import LaddersPanel from '../components/gel/LaddersPanel.jsx';
import useLadders from '../components/gel/useLadders.js';
import { renderFigure, uploadFigure } from '../components/gel/figureExport.js';

// Les modules de l'atelier, tous sur un même écran ; en mode « Tout auto », pistes et marqueur sont posés d'office
const MODULES = [
  ['Image', 'orientation, redressement, rognage, contraste'],
  ['Pistes', 'détection automatique, pistes inclinées, courbure corrigée'],
  ['Tailles', 'marqueur, attribution automatique, courbe d’étalonnage'],
  ['Bandes', 'sensibilité, fond, corrections à la main'],
  ['Quantification', 'normalisation, gamme étalon, tailles attendues'],
  ['Figure', 'gel, profils, tableau : insérée dans une entrée ou téléchargée (PNG, SVG)'],
];

export default function GelPage() {
  const { tab } = useParams();
  const { notify } = useApp();
  const navigate = useNavigate();
  const ladders = useLadders();
  const [session, setSession] = useState(null); // { source, initial, blob, filename, module }
  const [draft, setDraft] = useState(undefined);
  const [pending, setPending] = useState(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef(null);
  const saveTimer = useRef(null);

  const [opening, setOpening] = useState(null);
  const open = useCallback(async (blob, filename, analysis = null, module = undefined) => {
    setOpening(filename || 'image');
    try {
      // Laisser le navigateur afficher « Ouverture… » avant le décodage (quelques centaines de ms sur 10 Mpx)
      await new Promise((r) => { requestAnimationFrame(() => setTimeout(r, 0)); });
      const { image, info } = await loadGelFile(blob, filename);
      const initial = analysis
        ? { ...analysis, source: { ...analysis.source, attachmentId: null } }
        : { ...newAnalysis(lastMode()), source: { attachmentId: null, filename, width: info.width, height: info.height, bits: info.bits, format: info.format, lossy: info.lossy } };
      setSession({ source: { image, info }, initial, blob, filename, module });
      if (!analysis) saveDraft({ analysis: initial, blob, filename });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setOpening(null);
    }
  }, [notify]);

  // Figure reprise depuis une entrée, sinon gel en cours dans ce navigateur
  useEffect(() => {
    const resume = takeResume();
    if (resume?.sourceUrl) {
      fetch(resume.sourceUrl, { credentials: 'same-origin' })
        .then((r) => { if (!r.ok) throw new Error('Image d’origine introuvable.'); return r.blob(); })
        .then((blob) => open(blob, resume.filename ?? 'gel', resume.analysis, 'figure'))
        .catch((err) => notify(err.message, 'error'));
    }
    loadDraft().then(setDraft);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = useCallback((state) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSession((s) => {
        if (s) saveDraft({ analysis: state, blob: s.blob, filename: s.filename });
        return s;
      });
    }, 800);
  }, []);
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const insert = async (entry) => {
    const { state, img, profiles, results } = pending;
    const upload = (file, derivation) => api.upload(entry.id, file, derivation);
    const original = await upload(new File([session.blob], session.filename, { type: session.blob.type || 'application/octet-stream' }));
    const analysis = { ...state, source: { ...state.source, attachmentId: original.id } };
    const figure = await renderFigure({ state: analysis, img, profiles, results });
    const attrs = await uploadFigure({ figure, state: analysis, upload, sourceId: original.id });
    await api.post(`/entries/${entry.id}/blocks`, { node: { type: 'gelFigure', attrs } });
    rememberMode(state.mode);
    await clearDraft();
    notify(`Figure ajoutée à « ${entry.title} ».`, 'success');
    navigate(`/entries/${entry.id}`);
  };

  const pick = (files) => {
    const f = files?.[0];
    if (f) open(f, f.name);
  };

  if (session) {
    return (
      <>
        <GelWorkbench
          source={session.source}
          initial={session.initial}
          initialModule={session.module}
          submitLabel="Insérer dans une entrée…"
          onSubmit={async (result) => setPending(result)}
          onChange={onChange}
          onClose={() => { setSession(null); loadDraft().then(setDraft); }}
        />
        {pending && <EntryTargetDialog title="Insérer la figure dans une entrée" onClose={() => setPending(null)} onChoose={insert} />}
      </>
    );
  }

  return (
    <div
      className={`page page-wide gel-page${dragging ? ' is-dropping' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files); }}
    >
      <header className="page-head">
        <div>
          <h1>Gels</h1>
          <p className="page-lead">SDS-PAGE, western blots et gels d’agarose : pistes, tailles, quantification, et une figure prête pour le cahier.</p>
        </div>
      </header>
      <nav className="project-tabs" aria-label="Gels">
        <NavLink to="/gels" end className="project-tab">Analyse</NavLink>
        <NavLink to="/gels/markers" className="project-tab">Marqueurs</NavLink>
      </nav>

      {tab === 'markers' ? <LaddersPanel ladders={ladders} /> : (
        <div className="gel-landing">
          <button type="button" className="gel-drop" onClick={() => input.current.click()} disabled={Boolean(opening)} aria-busy={Boolean(opening)}>
            <Columns4 size={34} aria-hidden="true" />
            {opening
              ? <strong>Ouverture de « {opening} »…</strong>
              : <strong>Déposez une image de gel, ou cliquez pour la choisir</strong>}
            <span className="muted">TIFF 8 ou 16 bits (recommandé), PNG, JPEG</span>
          </button>
          <input ref={input} type="file" accept=".tif,.tiff,image/*" hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; pick(f); }} />
          {draft && (
            <div className="gel-draft">
              <History size={18} aria-hidden="true" />
              <span>
                <strong>{draft.analysis?.name || draft.filename}</strong>
                <span className="muted small"> — gel en cours, {MODES[draft.analysis?.mode]?.label.toLowerCase()}, modifié le {formatDateTime(draft.savedAt)}</span>
              </span>
              <button type="button" className="btn btn-primary btn-small" onClick={() => open(draft.blob, draft.filename, { ...draft.analysis, source: { ...draft.analysis.source } }, draft.analysis.lanes?.length ? 'bands' : undefined)}>Reprendre</button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => clearDraft().then(() => setDraft(null))}>Oublier</button>
            </div>
          )}
          <ol className="gel-howto">
            {MODULES.map(([title, text], i) => <li key={title}><span className="gel-step-num">{i + 1}</span><strong>{title}</strong> <span className="muted">— {text}</span></li>)}
          </ol>
          <p className="hint">
            Mode « Tout auto » (en haut à gauche de l’atelier) : pistes détectées et dernier marqueur appliqué dès l’ouverture.
            Les mesures se font toujours sur les intensités brutes de l’image : contraste et palette ne changent pas les aires.
            Depuis une entrée, le bouton <Upload size={12} aria-hidden="true" /> « Figure de gel » de la barre d’outils ouvre le même atelier.
          </p>
        </div>
      )}
    </div>
  );
}
