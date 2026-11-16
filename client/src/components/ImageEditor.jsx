import { useEffect, useMemo, useRef, useState } from 'react';
import { Crop, FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import { api, fileUrl } from '../api.js';
import {
  DEFAULT_EDIT, canvasToBlob, describeEdit, flip, isEdited, orientCanvas, orientedSize, renderFinal, rotate, toneCanvas,
} from '../lib/imageEdit.js';
import Modal from './Modal.jsx';

const PREVIEW_MAX = 1200;
const MIN_CROP = 0.02;
const HANDLES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const round = (v) => Math.round(v * 1e5) / 1e5;
const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };

/** Rectangle de recadrage déplaçable et redimensionnable (souris, stylet, doigt). */
function CropOverlay({ crop, onChange }) {
  const ref = useRef(null);
  const drag = useRef(null);

  const point = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp((e.clientY - r.top) / r.height, 0, 1) };
  };

  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const pt = point(e);
    const inside = pt.x >= crop.x && pt.x <= crop.x + crop.w && pt.y >= crop.y && pt.y <= crop.y + crop.h;
    const whole = crop.w > 0.999 && crop.h > 0.999; // cadre = image entière : on trace un nouveau cadre
    const mode = e.target.dataset.handle || (inside && !whole ? 'move' : 'draw');
    drag.current = { mode, start: pt, crop };
    ref.current.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const pt = point(e);
    const dx = pt.x - d.start.x;
    const dy = pt.y - d.start.y;
    const c = d.crop;
    if (d.mode === 'move') {
      onChange({ ...c, x: clamp(c.x + dx, 0, 1 - c.w), y: clamp(c.y + dy, 0, 1 - c.h) });
    } else if (d.mode === 'draw') {
      const x = Math.min(d.start.x, pt.x);
      const y = Math.min(d.start.y, pt.y);
      const w = Math.abs(pt.x - d.start.x);
      const h = Math.abs(pt.y - d.start.y);
      if (w >= MIN_CROP && h >= MIN_CROP) onChange({ x, y, w, h });
    } else {
      let l = c.x;
      let r = c.x + c.w;
      let t = c.y;
      let b = c.y + c.h;
      if (d.mode.includes('w')) l = clamp(l + dx, 0, r - MIN_CROP);
      if (d.mode.includes('e')) r = clamp(r + dx, l + MIN_CROP, 1);
      if (d.mode.includes('n')) t = clamp(t + dy, 0, b - MIN_CROP);
      if (d.mode.includes('s')) b = clamp(b + dy, t + MIN_CROP, 1);
      onChange({ x: l, y: t, w: r - l, h: b - t });
    }
  };

  const end = () => { drag.current = null; };

  return (
    <div
      ref={ref}
      className="crop-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div
        className="crop-rect"
        style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.w * 100}%`, height: `${crop.h * 100}%` }}
      >
        <span className="crop-thirds" aria-hidden="true" />
        {HANDLES.map((h) => <span key={h} className={`crop-handle crop-${h}`} data-handle={h} aria-hidden="true" />)}
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }) {
  const shown = unit === '°' ? `${String(value).replace('.', ',')}°` : `${value > 0 ? '+' : ''}${value}`;
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{label}</span>
        <button type="button" className="slider-value" onClick={() => onChange(0)} title="Remettre à zéro">{shown}</button>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/**
 * Retouche non destructive : on repart toujours de l'image d'origine,
 * avec les réglages précédents si l'image a déjà été retouchée.
 */
export default function ImageEditor({ src, onApply, onClose }) {
  const attachmentId = /\/api\/files\/([0-9a-f-]{36})/.exec(src ?? '')?.[1];
  const [source, setSource] = useState(null); // { original, img }
  const [p, setP] = useState(DEFAULT_EDIT);
  const [error, setError] = useState(attachmentId ? '' : "Seules les images jointes à l'entrée peuvent être retouchées.");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!attachmentId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const current = await api.get(`/attachments/${attachmentId}`);
        const original = current.derived_from ? await api.get(`/attachments/${current.derived_from}`) : current;
        const img = new Image();
        img.src = fileUrl(original.id);
        await img.decode();
        if (cancelled) return;
        setSource({ original, img });
        if (current.derived_from && current.edit_params) {
          const { orientation, straighten, crop, brightness, contrast, invert, grayscale } = current.edit_params;
          setP({ ...DEFAULT_EDIT, orientation, straighten, crop, brightness, contrast, invert, grayscale });
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Impossible de charger l'image d'origine.");
      }
    })();
    return () => { cancelled = true; };
  }, [attachmentId]);

  // Aperçu réduit : ton, puis orientation (le recadrage est affiché par-dessus)
  const toned = useMemo(
    () => source && toneCanvas(source.img, p, PREVIEW_MAX),
    [source, p.brightness, p.contrast, p.invert, p.grayscale], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const oriented = useMemo(
    () => toned && orientCanvas(toned, p),
    [toned, p.orientation, p.straighten], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !oriented) return;
    canvas.width = oriented.width;
    canvas.height = oriented.height;
    canvas.getContext('2d').drawImage(oriented, 0, 0);
  }, [oriented]);

  const full = source && orientedSize(source.img.naturalWidth, source.img.naturalHeight, p);
  const outW = full ? Math.round(full.width * p.crop.w) : 0;
  const outH = full ? Math.round(full.height * p.crop.h) : 0;
  const set = (patch) => setP((prev) => ({ ...prev, ...patch }));

  const apply = async () => {
    setBusy(true);
    setError('');
    try {
      const { original } = source;
      if (!isEdited(p)) {
        await onApply({ revertTo: original.id });
        return;
      }
      const canvas = renderFinal(source.img, p);
      const type = EXT[original.mime_type] ? original.mime_type : 'image/png';
      const blob = await canvasToBlob(canvas, type);
      const base = original.filename.replace(/\.[^.]+$/, '');
      const params = {
        format: 'paillasse-image-edit/1',
        pipeline: 'ton (niveaux de gris, inversion, luminosité, contraste) → orientation → redressement → recadrage',
        orientation: p.orientation,
        straighten: p.straighten,
        crop: { x: round(p.crop.x), y: round(p.crop.y), w: round(p.crop.w), h: round(p.crop.h) },
        brightness: p.brightness,
        contrast: p.contrast,
        invert: p.invert,
        grayscale: p.grayscale,
        summary: describeEdit(p),
        output: { width: canvas.width, height: canvas.height, type: blob.type },
      };
      await onApply({ blob, filename: `${base}_retouche.${EXT[blob.type] ?? 'png'}`, originalId: original.id, params });
    } catch (err) {
      setError(err.message || "L'image retouchée n'a pas pu être enregistrée.");
      setBusy(false);
    }
  };

  return (
    <Modal
      wide
      title="Retoucher l'image"
      onClose={onClose}
      footer={(
        <>
          <span className="modal-foot-note">L'original reste joint à l'entrée, avec la liste des retouches.</span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={!source || busy}>
            {busy ? 'Enregistrement…' : 'Appliquer'}
          </button>
        </>
      )}
    >
      {error && <p className="form-error" role="alert">{error}</p>}
      {!source && !error && <p className="muted">Chargement de l'image d'origine…</p>}
      {source && (
        <div className="image-editor">
          <div className="crop-area">
            <div className="crop-stage">
              <canvas ref={canvasRef} className="crop-canvas" />
              <CropOverlay crop={p.crop} onChange={(crop) => set({ crop })} />
            </div>
          </div>

          <div className="image-controls">
            <div className="control-block">
              <span className="control-label">Orientation</span>
              <div className="control-row">
                <button type="button" className="tool" onClick={() => setP((x) => rotate(x, false))} title="Tourner de 90° à gauche" aria-label="Tourner de 90° à gauche"><RotateCcw size={17} /></button>
                <button type="button" className="tool" onClick={() => setP((x) => rotate(x, true))} title="Tourner de 90° à droite" aria-label="Tourner de 90° à droite"><RotateCw size={17} /></button>
                <button type="button" className="tool" onClick={() => setP((x) => flip(x, true))} title="Miroir horizontal" aria-label="Miroir horizontal"><FlipHorizontal2 size={17} /></button>
                <button type="button" className="tool" onClick={() => setP((x) => flip(x, false))} title="Miroir vertical" aria-label="Miroir vertical"><FlipVertical2 size={17} /></button>
              </div>
            </div>

            <Slider label="Redresser" unit="°" min={-15} max={15} step={0.25} value={p.straighten} onChange={(v) => set({ straighten: v })} />
            <Slider label="Luminosité" min={-100} max={100} value={p.brightness} onChange={(v) => set({ brightness: v })} />
            <Slider label="Contraste" min={-100} max={100} value={p.contrast} onChange={(v) => set({ contrast: v })} />

            <label className="check">
              <input type="checkbox" checked={p.grayscale} onChange={(e) => set({ grayscale: e.target.checked })} />
              Niveaux de gris
            </label>
            <label className="check">
              <input type="checkbox" checked={p.invert} onChange={(e) => set({ invert: e.target.checked })} />
              Inverser les couleurs
            </label>

            <div className="control-block">
              <span className="control-label"><Crop size={14} aria-hidden="true" /> Recadrage</span>
              <span className="small muted">{outW} × {outH} px, tracez un cadre sur l'image</span>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => set({ crop: DEFAULT_EDIT.crop })}>Image entière</button>
            </div>

            <button type="button" className="btn btn-block" onClick={() => setP(DEFAULT_EDIT)} disabled={!isEdited(p)}>
              Revenir à l'original
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
