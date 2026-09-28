import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Maximize2, Minus, Plus } from 'lucide-react';
import { laneX } from '../../lib/gel/profile.js';
import { LANE_COLORS } from '../../lib/gel/figure.js';
import { formatSize } from '../../lib/gel/calibration.js';
import { spreadLabels } from '../../lib/gel/layout.js';
import { laneName } from '../../lib/gel/model.js';
import { rawY } from '../../lib/gel/render.js';

const CURSORS = { select: 'grab', addLane: 'crosshair', crop: 'crosshair', warp: 'crosshair', calib: 'crosshair', band: 'crosshair', annotate: 'crosshair' };
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Largeur d'une étiquette (pill). */
function pillWidth(ctx, text, { dot = null, bold = false } = {}) {
  ctx.font = `${bold ? '600 ' : ''}11px ${FONT}`;
  return ctx.measureText(text).width + (dot ? 18 : 10);
}

/** Étiquette arrondie, lisible sur n'importe quel fond. */
function pill(ctx, x, y, text, { align = 'center', bg, fg, dot = null, bold = false }) {
  const w = pillWidth(ctx, text, { dot, bold });
  const h = 17;
  const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(left, y - h / 2, w, h, 8);
  ctx.fill();
  if (dot) {
    ctx.fillStyle = dot;
    ctx.beginPath(); ctx.arc(left + 8, y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, left + (dot ? 14 : 5), y + 0.5);
  ctx.textBaseline = 'alphabetic';
}

/**
 * Vue du gel : image (rendu mis en cache) + repères discrets dessinés à chaque changement.
 * Les repères sont neutres ; seule la piste active prend sa couleur. Molette : zoom ; glisser : déplacer la vue ;
 * glisser une piste : la déplacer, ses poignées : l'incliner. La vue (zoom, position) est gardée tant que
 * l'image ne change pas ; elle ne se réajuste d'elle-même que si elle n'a pas été touchée.
 */
export default function GelCanvas({
  img, base, state, profiles, results, polarity = 'dark', tool = 'select', overlay = true, onOverlay,
  activeLaneId, onSelectLane, hoverPos, onHover,
  showRegion = false, showGrid = false, cropRect = null, activeWarpId = null, previewRotation = 0,
  onLaneAdd, onLaneChange, onRegionChange, onDragEnd, onCrop, onWarpPoint, onPick, onAnnotate,
}) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState(null); // { scale, x, y }
  const viewRef = useRef(null);
  viewRef.current = view;
  const fitted = useRef(true); // la vue suit la taille du cadre tant qu'on ne l'a ni zoomée ni déplacée
  const drag = useRef(null);
  const [draftCrop, setDraftCrop] = useState(null);

  // Taille du conteneur
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Tailles du marqueur : du côté extérieur du gel (à gauche d'un marqueur placé dans la moitié gauche)
  const ladderIndex = state.lanes.findIndex((l) => l.role === 'ladder');
  const ladderSide = ladderIndex < 0 ? null : ladderIndex < state.lanes.length / 2 ? 'left' : 'right';
  const fit = useCallback(() => {
    if (!img) return;
    fitted.current = true;
    // Marges : noms des pistes au-dessus, tailles du marqueur sur le côté, commandes du zoom en bas
    const left = ladderSide === 'left' ? 64 : 16;
    const right = ladderSide === 'right' ? 64 : 16;
    const scale = Math.min((size.w - left - right) / img.width, (size.h - 76) / img.height, 4);
    setView({ scale, x: left + (size.w - left - right - img.width * scale) / 2, y: 32 + (size.h - 76 - img.height * scale) / 2 });
  }, [img, size.w, size.h, ladderSide]);
  // Nouvelle image (recadrage, rotation…) : on réajuste ; cadre redimensionné : seulement si la vue n'a pas été touchée
  const imgKey = `${img?.width}x${img?.height}`;
  const lastImg = useRef(null);
  useEffect(() => {
    if (lastImg.current !== imgKey || fitted.current || !viewRef.current) fit();
    lastImg.current = imgKey;
  }, [imgKey, size.w, size.h, ladderSide]); // eslint-disable-line react-hooks/exhaustive-deps
  const moveView = (next) => { fitted.current = false; setView(next); };

  const toImage = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.x) / view.scale, y: (e.clientY - r.top - view.y) / view.scale };
  };
  const region = profiles?.region ?? { top: 0, bottom: (img?.height ?? 1) - 1 };
  const hw = (profiles?.width ?? 10) / 2;
  const marks = overlay || tool !== 'select';

  // --- Dessin ---------------------------------------------------------------------------------
  useEffect(() => {
    const c = canvas.current;
    if (!c || !view || !base) return;
    const dpr = window.devicePixelRatio || 1;
    // Redimensionner un canvas le réalloue : seulement quand la vue change de taille
    if (c.width !== Math.round(size.w * dpr) || c.height !== Math.round(size.h * dpr)) {
      c.width = Math.round(size.w * dpr);
      c.height = Math.round(size.h * dpr);
      c.style.width = `${size.w}px`;
      c.style.height = `${size.h}px`;
    }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    const { scale: s, x: ox, y: oy } = view;
    ctx.imageSmoothingEnabled = s < 1;
    if (previewRotation) {
      // Aperçu du redressement : l'image affichée tourne, le calcul suivra au relâchement du curseur
      ctx.save();
      ctx.translate(ox + (img.width * s) / 2, oy + (img.height * s) / 2);
      ctx.rotate((previewRotation * Math.PI) / 180);
      ctx.drawImage(base, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s);
      ctx.restore();
    } else {
      ctx.drawImage(base, ox, oy, img.width * s, img.height * s);
    }
    const X = (x) => ox + x * s;
    const Y = (y) => oy + y * s;

    if (tool === 'crop') {
      const r = draftCrop ?? cropRect;
      if (r) {
        ctx.fillStyle = 'rgba(15,23,42,.55)';
        const rx = X(Math.min(r.x, r.x + r.w)); const ry = Y(Math.min(r.y, r.y + r.h));
        const rw = Math.abs(r.w) * s; const rh = Math.abs(r.h) * s;
        ctx.fillRect(X(0), Y(0), img.width * s, ry - Y(0));
        ctx.fillRect(X(0), ry + rh, img.width * s, Y(img.height) - ry - rh);
        ctx.fillRect(X(0), ry, rx - X(0), rh);
        ctx.fillRect(rx + rw, ry, X(img.width) - rx - rw, rh);
        ctx.strokeStyle = '#22D3EE'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.strokeRect(rx, ry, rw, rh); ctx.setLineDash([]);
      }
      return;
    }

    // Repères horizontaux pour redresser l'image (les puits doivent suivre une ligne)
    if (showGrid) {
      ctx.strokeStyle = 'rgba(36,73,199,.35)';
      ctx.lineWidth = 1;
      const step = Math.max(24, Math.round(size.h / 14));
      for (let y = step / 2; y < size.h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.w, y); ctx.stroke(); }
    }
    if (!marks) return;

    // Encre neutre accordée au fond de l'image (clair : ardoise ; sombre : blanc)
    const lightBg = (polarity === 'dark') !== Boolean(state.display?.invert) && state.display?.colormap !== 'fire';
    const ink = (a) => (lightBg ? `rgba(30,41,59,${a})` : `rgba(248,250,252,${a})`);
    const pillBg = lightBg ? 'rgba(255,255,255,.92)' : 'rgba(15,23,42,.78)';
    const pillFg = lightBg ? '#1E293B' : '#F8FAFC';

    // Zone de migration (seulement pendant le réglage des pistes)
    if (showRegion) {
      ctx.strokeStyle = '#10B981'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 4]);
      for (const y of [region.top, region.bottom]) { ctx.beginPath(); ctx.moveTo(X(0), Y(y)); ctx.lineTo(X(img.width), Y(y)); ctx.stroke(); }
      ctx.setLineDash([]);
    }

    // Courbes d'iso-migration
    (state.warp ?? []).forEach((curve) => {
      const pts = [...(curve.points ?? [])].sort((a, b) => a.x - b.x);
      const active = curve.id === activeWarpId;
      ctx.strokeStyle = active ? '#DB2777' : 'rgba(219,39,119,.5)'; ctx.lineWidth = active ? 2 : 1.25;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
      ctx.stroke();
      ctx.fillStyle = active ? '#DB2777' : 'rgba(219,39,119,.6)';
      for (const p of pts) { ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), active ? 4 : 3, 0, Math.PI * 2); ctx.fill(); }
    });

    // Pistes : axe pointillé discret ; la piste active en couleur, avec sa largeur de lecture et ses poignées
    const names = [];
    state.lanes.forEach((lane, i) => {
      const col = LANE_COLORS[i % LANE_COLORS.length];
      const active = lane.id === activeLaneId;
      if (active) {
        ctx.fillStyle = `${col}1F`;
        ctx.beginPath();
        ctx.moveTo(X(lane.xTop - hw), Y(region.top)); ctx.lineTo(X(lane.xTop + hw), Y(region.top));
        ctx.lineTo(X(lane.xBot + hw), Y(region.bottom)); ctx.lineTo(X(lane.xBot - hw), Y(region.bottom)); ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = active ? col : ink(0.45); ctx.lineWidth = active ? 2 : 1; ctx.setLineDash(active ? [] : [3, 5]);
      ctx.beginPath(); ctx.moveTo(X(lane.xTop), Y(region.top)); ctx.lineTo(X(lane.xBot), Y(region.bottom)); ctx.stroke();
      ctx.setLineDash([]);
      names.push({ x: X(lane.xTop), text: `${lane.role === 'ladder' ? '⚖ ' : ''}${laneName(lane, i)}`, col, active });
      if (active && tool === 'select') {
        for (const [x, y] of [[lane.xTop, region.top], [lane.xBot, region.bottom]]) {
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X(x), Y(y), 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        }
      }
    });

    // Noms des pistes : la piste active d'abord, les autres seulement s'ils ne chevauchent rien (pistes serrées)
    const placedNames = [];
    for (const n of [...names].sort((p, q) => Number(q.active) - Number(p.active))) {
      const w = pillWidth(ctx, n.text, { dot: n.col, bold: n.active });
      if (!n.active && placedNames.some((r) => n.x - w / 2 < r.b + 3 && n.x + w / 2 > r.a - 3)) continue;
      placedNames.push({ a: n.x - w / 2, b: n.x + w / 2 });
      pill(ctx, n.x, Y(region.top) - 16, n.text, { bg: pillBg, fg: pillFg, dot: n.col, bold: n.active });
    }

    // Bandes détectées : traits courts neutres (en couleur dans la piste active, en rouge si saturées) ;
    // tailles seulement pour le marqueur et la piste active, écartées pour ne pas se chevaucher
    if (results && profiles) {
      const cal = results.calibration;
      results.lanes.forEach((lane, i) => {
        const col = LANE_COLORS[i % LANE_COLORS.length];
        const active = lane.id === activeLaneId;
        const labels = [];
        for (const b of lane.bands) {
          const y = Y(rawY(profiles, lane, b.apex));
          const x = X(laneX(lane, region.top + b.apex, region));
          ctx.strokeStyle = b.saturated ? '#DC2626' : active ? col : ink(0.75);
          ctx.lineWidth = active ? 2 : 1.5;
          ctx.beginPath(); ctx.moveTo(x - hw * s * 0.8, y); ctx.lineTo(x + hw * s * 0.8, y); ctx.stroke();
          if (lane.role === 'ladder' || active) {
            const assigned = lane.id === state.calibration.laneId && (state.calibration.points ?? []).find((p) => Math.abs(p.pos - b.apex) <= 2);
            const text = assigned ? formatSize(assigned.size, results.unit) : (cal && b.size ? formatSize(b.size, results.unit) : '');
            if (text) labels.push({ x: x - hw * s - 6, y, text, assigned: Boolean(assigned) });
          }
        }
        if (labels.length) {
          // À gauche de la piste ; le marqueur du côté extérieur du gel (la marge est prévue au cadrage)
          const right = lane.role === 'ladder' && ladderSide === 'right';
          const ys = spreadLabels(labels.map((l) => l.y), 18, 10, size.h - 10);
          labels.forEach((l, k) => {
            const x = right ? l.x + 2 * hw * s + 12 : l.x;
            const dir = right ? 1 : -1;
            if (Math.abs(ys[k] - l.y) > 1) {
              ctx.strokeStyle = ink(0.5); ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(x, l.y); ctx.lineTo(x + dir * 6, ys[k]); ctx.stroke();
            }
            pill(ctx, x + dir * 6, ys[k], l.text, { align: right ? 'left' : 'right', bg: pillBg, fg: l.assigned ? '#B45309' : pillFg, bold: l.assigned });
          });
        }
        if (cal) {
          for (const e of lane.expected ?? []) {
            ctx.strokeStyle = '#D55E00'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
            for (const sz of e.sizes) {
              const pos = cal.posAt(sz);
              const y = Y(rawY(profiles, lane, pos));
              const x = X(laneX(lane, region.top + pos, region));
              ctx.beginPath(); ctx.moveTo(x - hw * s - 5, y); ctx.lineTo(x + hw * s + 5, y); ctx.stroke();
            }
            ctx.setLineDash([]);
          }
        }
      });
    }

    // Annotations (flèches de la figure), à droite de la dernière piste
    const last = [...state.lanes].sort((p, q) => q.xTop - p.xTop)[0];
    if (last && profiles) {
      for (const a of state.annotations ?? []) {
        const y = Y(rawY(profiles, last, a.pos));
        const x = X(Math.max(last.xTop, last.xBot) + hw) + 6;
        ctx.fillStyle = '#B45309';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9, y - 5); ctx.lineTo(x + 9, y + 5); ctx.fill();
        pill(ctx, x + 12, y, a.text, { align: 'left', bg: pillBg, fg: '#B45309', bold: true });
      }
    }

    // Position survolée (synchronisée avec le profil)
    const active = results?.lanes.find((l) => l.id === activeLaneId);
    if (hoverPos !== null && hoverPos !== undefined && active && profiles) {
      const y = Y(rawY(profiles, active, hoverPos));
      const x = X(laneX(active, region.top + hoverPos, region));
      ctx.strokeStyle = '#DC2626'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - hw * s - 12, y); ctx.lineTo(x + hw * s + 12, y); ctx.stroke();
    }
  }, [base, img, view, size, state, profiles, results, polarity, tool, marks, activeLaneId, hoverPos, showRegion, showGrid, draftCrop, cropRect, activeWarpId, region.top, region.bottom, hw, previewRotation]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Souris ---------------------------------------------------------------------------------
  const hit = (p) => {
    const tol = 10 / view.scale;
    const active = state.lanes.find((l) => l.id === activeLaneId);
    if (active) {
      if (Math.hypot(p.x - active.xTop, p.y - region.top) < tol) return { kind: 'handle', lane: active, end: 'top' };
      if (Math.hypot(p.x - active.xBot, p.y - region.bottom) < tol) return { kind: 'handle', lane: active, end: 'bottom' };
    }
    if (showRegion) {
      if (Math.abs(p.y - region.top) < tol * 0.7) return { kind: 'region', end: 'top' };
      if (Math.abs(p.y - region.bottom) < tol * 0.7) return { kind: 'region', end: 'bottom' };
    }
    let best = null;
    for (const lane of state.lanes) {
      if (p.y < region.top - tol || p.y > region.bottom + tol) continue;
      const d = Math.abs(p.x - laneX(lane, p.y, region));
      if (d <= hw + tol / 2 && (!best || d < best.d)) best = { kind: 'lane', lane, d };
    }
    return best;
  };

  const idealPos = (lane, p) => {
    const y = p.y;
    if (!profiles?.warp) return Math.round(y - region.top);
    // Position idéale : on cherche la position dont la ligne lue est la plus proche du clic
    let bestPos = y - region.top;
    let bestD = Infinity;
    for (let i = 0; i < profiles.length; i += 1) {
      const d = Math.abs(rawY(profiles, lane, i) - y);
      if (d < bestD) { bestD = d; bestPos = i; }
    }
    return bestPos;
  };

  const onPointerDown = (e) => {
    if (!view || !img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    const start = { sx: e.clientX, sy: e.clientY, moved: false, p };
    if (tool === 'crop') { drag.current = { ...start, kind: 'crop' }; setDraftCrop({ x: p.x, y: p.y, w: 0, h: 0 }); return; }
    if (tool === 'select' && marks) {
      const h = hit(p);
      if (h?.kind === 'handle' || h?.kind === 'region') { drag.current = { ...start, ...h }; return; }
      if (h?.kind === 'lane') {
        onSelectLane?.(h.lane.id);
        drag.current = { ...start, kind: 'lane', lane: h.lane, x0: p.x, top0: h.lane.xTop, bot0: h.lane.xBot };
        return;
      }
    }
    drag.current = { ...start, kind: 'pan', view0: view };
  };

  const onPointerMove = (e) => {
    if (!view || !img) return;
    const p = toImage(e);
    const d = drag.current;
    if (!d) {
      const active = results?.lanes.find((l) => l.id === activeLaneId);
      if (active && profiles && p.y >= region.top && p.y <= region.bottom && Math.abs(p.x - laneX(active, p.y, region)) < hw * 3) {
        const pos = idealPos(active, p);
        if (pos !== hoverPos) onHover?.(pos);
      } else if (hoverPos !== null && hoverPos !== undefined) onHover?.(null);
      const h = tool === 'select' && marks ? hit(p) : null;
      canvas.current.style.cursor = h?.kind === 'handle' ? 'ew-resize' : h?.kind === 'region' ? 'ns-resize' : h?.kind === 'lane' ? 'move' : CURSORS[tool];
      return;
    }
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 3) d.moved = true;
    const clampX = (x) => Math.max(0, Math.min(img.width - 1, Math.round(x)));
    if (d.kind === 'pan') { if (d.moved) moveView({ ...d.view0, x: d.view0.x + e.clientX - d.sx, y: d.view0.y + e.clientY - d.sy }); }
    else if (d.kind === 'crop') setDraftCrop({ x: d.p.x, y: d.p.y, w: p.x - d.p.x, h: p.y - d.p.y });
    else if (d.kind === 'handle') onLaneChange?.(d.lane.id, d.end === 'top' ? { xTop: clampX(p.x) } : { xBot: clampX(p.x) }, { transient: true });
    else if (d.kind === 'lane' && d.moved) {
      const dx = p.x - d.x0;
      onLaneChange?.(d.lane.id, { xTop: clampX(d.top0 + dx), xBot: clampX(d.bot0 + dx) }, { transient: true });
    } else if (d.kind === 'region') {
      const y = Math.max(0, Math.min(img.height - 1, Math.round(p.y)));
      if (d.end === 'top') onRegionChange?.({ top: Math.min(y, region.bottom - 10) }, { transient: true });
      else onRegionChange?.({ bottom: Math.max(y, region.top + 10) }, { transient: true });
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !view) return;
    const p = toImage(e);
    if (d.kind === 'crop') {
      const r = draftCrop;
      setDraftCrop(null);
      if (r && Math.abs(r.w) > 10 && Math.abs(r.h) > 10) {
        onCrop?.({ x: Math.round(Math.min(r.x, r.x + r.w)), y: Math.round(Math.min(r.y, r.y + r.h)), w: Math.round(Math.abs(r.w)), h: Math.round(Math.abs(r.h)) });
      }
      return;
    }
    if (['handle', 'lane', 'region'].includes(d.kind) && d.moved) { onDragEnd?.(); return; }
    if (d.moved) return;
    // Clic simple, selon l'outil
    if (tool === 'addLane' && p.x >= 0 && p.x < img.width) onLaneAdd?.(Math.round(p.x));
    else if (tool === 'warp') onWarpPoint?.({ x: Math.round(p.x), y: Math.round(p.y) });
    else if (tool === 'annotate') {
      const lane = [...state.lanes].sort((a, b) => b.xTop - a.xTop)[0];
      if (lane) onAnnotate?.(idealPos(lane, p));
    } else if (tool === 'calib' || tool === 'band') {
      let best = null;
      for (const lane of state.lanes) {
        const dd = Math.abs(p.x - laneX(lane, p.y, region));
        if (dd <= hw * 1.5 && (!best || dd < best.d)) best = { lane, d: dd };
      }
      if (best) onPick?.(best.lane.id, idealPos(best.lane, p));
    } else if (tool === 'select' && d.kind === 'pan' && marks) {
      const h = hit(p);
      if (h?.lane) onSelectLane?.(h.lane.id);
    }
  };

  // Molette : zoom autour du pointeur (écouteur non passif pour bloquer le défilement de la page)
  useEffect(() => {
    const c = canvas.current;
    if (!c) return undefined;
    const onWheel = (e) => {
      if (!viewRef.current) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      fitted.current = false;
      setView((v) => {
        const scale = Math.max(0.05, Math.min(30, v.scale * f));
        const k = scale / v.scale;
        return { scale, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k };
      });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, []);

  const zoom = (f) => {
    fitted.current = false;
    setView((v) => {
      const scale = Math.max(0.05, Math.min(30, v.scale * f));
      const cx = size.w / 2;
      const cy = size.h / 2;
      return { scale, x: cx - (cx - v.x) * (scale / v.scale), y: cy - (cy - v.y) * (scale / v.scale) };
    });
  };

  return (
    <div className="gel-canvas" ref={wrap}>
      <canvas
        ref={canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { if (!drag.current && hoverPos !== null && hoverPos !== undefined) onHover?.(null); }}
        style={{ cursor: CURSORS[tool] }}
        aria-label="Image du gel"
        role="img"
      />
      <div className="gel-zoom">
        {onOverlay && (
          <button
            type="button"
            className={`icon-btn${overlay ? '' : ' is-off'}`}
            onClick={() => onOverlay(!overlay)}
            aria-pressed={!overlay}
            aria-label={overlay ? 'Masquer les repères' : 'Afficher les repères'}
            title={overlay ? 'Masquer les repères (voir le gel nu)' : 'Afficher les repères'}
          >
            {overlay ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        )}
        <button type="button" className="icon-btn" onClick={() => zoom(1.25)} aria-label="Agrandir"><Plus size={16} /></button>
        <span>{view ? `${Math.round(view.scale * 100)} %` : ''}</span>
        <button type="button" className="icon-btn" onClick={() => zoom(0.8)} aria-label="Réduire"><Minus size={16} /></button>
        <button type="button" className="icon-btn" onClick={fit} aria-label="Ajuster à la fenêtre" title="Ajuster à la fenêtre"><Maximize2 size={15} /></button>
      </div>
    </div>
  );
}
