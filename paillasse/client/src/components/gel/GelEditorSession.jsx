import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileImage, Upload } from 'lucide-react';
import { api, fileUrl } from '../../api.js';
import { useApp } from '../../context.js';
import { formatSize as formatBytes } from '../../lib/format.js';
import { loadGelFile } from '../../lib/gel/render.js';
import { newAnalysis } from '../../lib/gel/model.js';
import { lastMode, rememberMode } from '../../lib/gel/draft.js';
import Modal from '../Modal.jsx';
import GelWorkbench from './GelWorkbench.jsx';
import { renderFigure, uploadFigure } from './figureExport.js';

const GEL_TYPES = /^image\/(png|jpe?g|tiff|bmp|webp|gif)$/i;
const DISPLAYABLE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

/** Choix de l'image : un fichier à importer, ou une image déjà jointe à l'entrée. */
function SourceDialog({ entryId, onChoose, onClose }) {
  const [attachments, setAttachments] = useState(null);
  const input = useRef(null);
  useEffect(() => {
    if (!entryId) { setAttachments([]); return; }
    api.get(`/entries/${entryId}/attachments`)
      .then((list) => setAttachments(list.filter((a) => GEL_TYPES.test(a.mime_type) || /\.tiff?$/i.test(a.filename)).filter((a) => !a.edit_params?.tool)))
      .catch(() => setAttachments([]));
  }, [entryId]);
  return (
    <Modal title="Figure de gel" onClose={onClose} wide>
      <p className="modal-lead">Choisissez l’image du gel. Pour quantifier, préférez le TIFF 16 bits exporté par l’imageur (ChemiDoc, iBright, Amersham…) : il garde les vraies intensités.</p>
      <button type="button" className="btn btn-primary" onClick={() => input.current.click()}><Upload size={15} /> Importer une image…</button>
      <input ref={input} type="file" accept=".tif,.tiff,image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onChoose({ file: f }); }} />
      {attachments?.length > 0 && (
        <>
          <h3 className="gel-source-title">Ou une image déjà jointe à cette entrée</h3>
          <ul className="gel-source-list">
            {attachments.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => onChoose({ attachment: a })}>
                  {DISPLAYABLE.test(a.mime_type) ? <img src={fileUrl(a.id)} alt="" loading="lazy" /> : <span className="gel-source-icon"><FileImage size={28} /></span>}
                  <span className="gel-source-name">{a.filename}</span>
                  <span className="muted small">{formatBytes(a.size_bytes)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

/**
 * Session d'analyse ouverte depuis l'éditeur : choix de l'image (nouvelle figure), chargement,
 * atelier en plein écran, puis production de la figure et des pièces jointes.
 * session = { attrs? (modification), attachmentId?, filename? } ; upload(file, derivation) → pièce jointe.
 */
export default function GelEditorSession({ session, entryId, upload, onInsert, onUpdate, onClose }) {
  const { notify } = useApp();
  const [chosen, setChosen] = useState(() => (session.attrs
    ? { attachment: { id: session.attrs.analysis?.source?.attachmentId, filename: session.attrs.analysis?.source?.filename } }
    : session.attachmentId ? { attachment: { id: session.attachmentId, filename: session.filename } } : null));
  const [loaded, setLoaded] = useState(null);

  useEffect(() => {
    if (!chosen) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const blob = chosen.file ?? await fetch(fileUrl(chosen.attachment.id), { credentials: 'same-origin' }).then((r) => {
          if (!r.ok) throw new Error('Image d’origine introuvable.');
          return r.blob();
        });
        const filename = chosen.file?.name ?? chosen.attachment.filename ?? 'gel';
        const { image, info } = await loadGelFile(blob, filename);
        if (cancelled) return;
        const initial = session.attrs?.analysis
          ? session.attrs.analysis
          : { ...newAnalysis(lastMode()), source: { attachmentId: chosen.attachment?.id ?? null, filename, width: info.width, height: info.height, bits: info.bits, format: info.format, lossy: info.lossy } };
        setLoaded({ source: { image, info }, initial, file: chosen.file ?? null });
      } catch (err) {
        notify(err.message, 'error');
        onClose();
      }
    })();
    return () => { cancelled = true; };
  }, [chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async ({ state, img, profiles, results }) => {
    let sourceId = state.source?.attachmentId;
    if (!sourceId) {
      const att = await upload(loaded.file);
      sourceId = att.id;
    }
    const analysis = { ...state, source: { ...state.source, attachmentId: sourceId } };
    const figure = await renderFigure({ state: analysis, img, profiles, results });
    const attrs = await uploadFigure({ figure, state: analysis, upload, sourceId });
    rememberMode(state.mode);
    if (session.attrs) onUpdate(attrs);
    else onInsert(attrs);
    onClose();
  };

  if (!chosen) return <SourceDialog entryId={entryId} onChoose={setChosen} onClose={onClose} />;
  if (!loaded) return createPortal(<div className="gel-loading" role="status">Ouverture de l’image…</div>, document.body);
  return createPortal(
    <GelWorkbench
      source={loaded.source}
      initial={loaded.initial}
      initialStep={session.attrs ? 'figure' : 'image'}
      submitLabel={session.attrs ? 'Mettre à jour la figure' : 'Insérer dans l’entrée'}
      onSubmit={submit}
      onClose={onClose}
    />,
    document.body,
  );
}
