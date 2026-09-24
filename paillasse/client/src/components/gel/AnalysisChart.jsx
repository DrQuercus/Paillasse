import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatNumber } from '../../lib/calc/units.js';
import { formatSize, sizeAxis } from '../../lib/gel/calibration.js';

const PAD = { t: 22, r: 12, b: 30, l: 50 };
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const f1 = (x) => Math.round(x * 10) / 10;

function niceTicks(lo, hi, count = 4) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(v);
  return out;
}

/** Tracé d'une courbe entre from et to : exact si peu de points, sinon min et max par pixel (les pics restent). */
function linePath(vals, from, to, X, Y, px) {
  const m = to - from + 1;
  let d = '';
  if (m <= px * 2) {
    for (let i = from; i <= to; i += 1) d += `${d ? 'L' : 'M'}${f1(X(i))},${f1(Y(vals[i], i))}`;
    return d;
  }
  const per = m / px;
  for (let k = 0; k < px; k += 1) {
    const a = from + Math.floor(k * per);
    const b = Math.min(to, from + Math.floor((k + 1) * per) - 1);
    let lo = a;
    let hi = a;
    for (let i = a; i <= b; i += 1) {
      if (vals[i] < vals[lo]) lo = i;
      if (vals[i] > vals[hi]) hi = i;
    }
    const [p, q] = lo < hi ? [lo, hi] : [hi, lo];
    d += `${d ? 'L' : 'M'}${f1(X(p))},${f1(Y(vals[p], p))}L${f1(X(q))},${f1(Y(vals[q], q))}`;
  }
  return d;
}

/** Étiquettes des sommets : jusqu'à trois hauteurs pour éviter les chevauchements, sinon rien. */
function placeLabels(s, from, to, X, Y, unit, show) {
  const levels = [[], [], []];
  return s.bands.map((b, i) => {
    const x = X(b.apex);
    const y = Y(s.values[b.apex], b.apex);
    const m = { apex: b.apex, x, y, saturated: b.saturated };
    if (!show || b.apex < from || b.apex > to) return b.apex < from || b.apex > to ? null : m;
    const label = b.size ? formatSize(b.size, unit) : `#${i + 1}`;
    const pct = `${formatNumber(b.percent, 2)} %`;
    const half = ((label.length + pct.length + 1) * 5.6) / 2;
    for (let k = 0; k < levels.length; k += 1) {
      const ly = Math.max(PAD.t - 4 + k * 12, y - 7 - k * 12);
      if (levels[k].every((r) => x - half > r.b + 3 || x + half < r.a - 3 || Math.abs(ly - r.y) > 11)) {
        levels[k].push({ a: x - half, b: x + half, y: ly });
        return { ...m, label, pct, ly };
      }
    }
    return m;
  }).filter(Boolean);
}

/**
 * Graphique d'analyse de l'atelier : profils des pistes, fond, aires des bandes.
 * mode : « lane » (une piste, fond et aires), « overlay » (pistes superposées), « stack » (empilées).
 * series = [{ id, name, color, values, baseline?, bands }] — valeurs déjà préparées (lissées, fond soustrait…).
 * Molette : zoom ; glisser : se déplacer ; double-clic : tout voir. En mode piste, clic sur une bande :
 * elle est sélectionnée et ses bornes se déplacent à la souris.
 */
export default function AnalysisChart({
  series, length, calibration, unit, ladderSizes = [], mode = 'lane', axis = 'size', labels = true,
  zoom, onZoom, hoverPos, onHover, pickable, onPick, selected, onSelect, onBounds, onBoundsEnd, svgRef,
}) {
  const wrap = useRef(null);
  const svg = useRef(null);
  const [w, setW] = useState(420);
  const drag = useRef(null);
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setW(Math.max(260, el.clientWidth)));
    ro.observe(el);
    setW(Math.max(260, el.clientWidth));
    return () => ro.disconnect();
  }, []);
  const setSvg = (el) => { svg.current = el; if (svgRef) svgRef.current = el; };

  const n = length;
  const H = Math.round(Math.max(230, Math.min(460, w * 0.58)));
  const pw = w - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;
  const from = Math.max(0, Math.floor(zoom?.from ?? 0));
  const to = Math.min(n - 1, Math.ceil(zoom?.to ?? n - 1));
  const span = Math.max(1, to - from);
  const X = (i) => PAD.l + ((i - from) / span) * pw;
  const toPos = (clientX) => {
    const r = svg.current.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * w;
    return Math.max(0, Math.min(n - 1, Math.round(from + ((x - PAD.l) / pw) * span)));
  };

  // Échelle verticale ajustée à la partie visible (le zoom agrandit aussi les petites bandes)
  const stack = mode === 'stack' && series.length > 1;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (let i = from; i <= to; i += 1) {
      const v = s.values[i];
      if (v > hi) hi = v;
      if (v < lo) lo = v;
      if (s.baseline && s.baseline[i] < lo) lo = s.baseline[i];
    }
  }
  if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
  if (mode !== 'lane' || series.some((s) => !s.baseline)) lo = Math.min(0, lo);
  const top = hi > lo ? hi : lo + 1;
  const step = (top - lo) * 0.62;
  const total = stack ? step * (series.length - 1) + (top - lo) * 1.1 : (top - lo) * 1.12;
  const offset = (k) => (stack ? (series.length - 1 - k) * step : 0);
  const Y = (v, _i, k = 0) => PAD.t + ph - ((v - lo + offset(k)) / total) * ph;

  // Graduations horizontales : tailles du marqueur si le gel est étalonné, sinon pixels
  const ticks = [];
  if (calibration && axis === 'size' && ladderSizes.length) {
    const ax = sizeAxis(ladderSizes, unit);
    let last = -Infinity;
    for (const size of [...ladderSizes].sort((a, b) => b - a)) {
      const p = calibration.posAt(size);
      if (!(p >= from && p <= to)) continue;
      const label = ax.label(size);
      const show = X(p) - last > label.length * 6.5 + 6;
      if (show) last = X(p);
      ticks.push({ x: X(p), label: show ? label : null });
    }
    ticks.unit = ax.unit;
  } else {
    for (const v of niceTicks(from, to, Math.max(3, Math.round(pw / 90)))) ticks.push({ x: X(v), label: String(Math.round(v)) });
    ticks.unit = 'px';
  }
  const yTicks = stack ? [] : niceTicks(lo, top * 1.05, 4);

  // --- Souris -----------------------------------------------------------------------------------
  const selBand = mode === 'lane' && selected !== null && selected !== undefined ? series[0]?.bands.find((b) => b.apex === selected) : null;
  const handleAt = (clientX) => {
    if (!selBand) return null;
    const r = svg.current.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * w;
    if (Math.abs(x - X(selBand.left)) < 7) return 'left';
    if (Math.abs(x - X(selBand.right)) < 7) return 'right';
    return null;
  };
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const h = handleAt(e.clientX);
    drag.current = h
      ? { kind: 'bound', side: h, apex: selBand.apex }
      : { kind: 'pan', x0: e.clientX, from0: from, to0: to, moved: false };
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    const pos = toPos(e.clientX);
    if (!d) {
      onHover?.(pos);
      const h = handleAt(e.clientX);
      e.currentTarget.style.cursor = h ? 'ew-resize' : pickable ? 'crosshair' : zoom ? 'grab' : 'default';
      return;
    }
    if (d.kind === 'bound') {
      onBounds?.(d.apex, d.side === 'left' ? { left: Math.min(pos, d.apex - 1) } : { right: Math.max(pos, d.apex + 1) });
      onHover?.(pos);
      return;
    }
    const dx = e.clientX - d.x0;
    if (Math.abs(dx) > 3) d.moved = true;
    if (d.moved && zoom) {
      const r = svg.current.getBoundingClientRect();
      const shift = (-dx / r.width) * w * (span / pw);
      const width = d.to0 - d.from0;
      const a = Math.max(0, Math.min(n - 1 - width, d.from0 + shift));
      onZoom?.({ from: a, to: a + width });
    }
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'bound') { onBoundsEnd?.(); return; }
    if (d.moved) return;
    const pos = toPos(e.clientX);
    if (pickable) { onPick?.(pos); return; }
    if (mode === 'lane') {
      const b = series[0]?.bands.find((x) => pos >= x.left && pos <= x.right);
      onSelect?.(b ? b.apex : null);
    }
  };
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const r = svg.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * w;
    const at = from + ((x - PAD.l) / pw) * span;
    const f = e.deltaY < 0 ? 0.8 : 1.25;
    const width = Math.max(20, Math.min(n - 1, span * f));
    if (width >= n - 1) { onZoom?.(null); return; }
    const k = (at - from) / span;
    const a = Math.max(0, Math.min(n - 1 - width, at - k * width));
    onZoom?.({ from: a, to: a + width });
  }, [from, span, n, pw, w, onZoom]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return undefined;
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  // --- Dessin -----------------------------------------------------------------------------------
  const hover = hoverPos !== null && hoverPos !== undefined && hoverPos >= from && hoverPos <= to ? hoverPos : null;
  const px = Math.max(50, Math.round(pw));
  const tip = [];
  if (hover !== null) {
    tip.push({ text: `${hover} px${calibration ? ` · ≈ ${formatSize(calibration.sizeAt(hover), unit)}` : ''}`, color: '#fff', bold: true });
    series.slice(0, 8).forEach((s) => tip.push({ text: `${s.name} : ${formatNumber(s.values[hover] - (s.baseline ? s.baseline[hover] : 0), 3)}`, color: s.color }));
    if (mode === 'lane') {
      const b = series[0]?.bands.find((x) => hover >= x.left && hover <= x.right);
      if (b) tip.push({ text: `Bande ${series[0].bands.indexOf(b) + 1} : ${formatNumber(b.percent, 3)} %${b.size ? ` · ${formatSize(b.size, unit)}` : ''}`, color: '#FCD34D' });
    }
  }
  const tipW = Math.max(120, ...tip.map((t) => t.text.length * 6.4 + 16));
  const tipX = hover !== null && X(hover) + 14 + tipW > w - 4 ? X(hover) - tipW - 10 : (hover !== null ? X(hover) + 12 : 0);

  return (
    <div ref={wrap} className="an-chart-wrap">
      <svg
        ref={setSvg}
        className={`an-chart${pickable ? ' is-pickable' : ''}`}
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        fontFamily={FONT}
        role="img"
        aria-label={mode === 'lane' ? 'Profil de la piste' : 'Profils des pistes'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { if (!drag.current) onHover?.(null); }}
        onDoubleClick={() => onZoom?.(null)}
      >
        <defs><clipPath id="an-clip"><rect x={PAD.l} y={PAD.t - 16} width={pw} height={ph + 16} /></clipPath></defs>
        <rect x="0" y="0" width={w} height={H} fill="#fff" />
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.l} x2={PAD.l + pw} y1={f1(Y(v))} y2={f1(Y(v))} stroke="#EEF1F5" />
            <text x={PAD.l - 5} y={f1(Y(v) + 3.5)} fontSize="10" textAnchor="end" fill="#6B7689">{formatNumber(v, 3)}</text>
          </g>
        ))}
        <rect x={PAD.l} y={PAD.t} width={pw} height={ph} fill="none" stroke="#D2DAE3" />
        {ticks.map((t, i) => (
          <g key={`x${i}`}>
            <line x1={f1(t.x)} x2={f1(t.x)} y1={PAD.t + ph} y2={PAD.t + ph + 4} stroke="#8792A6" />
            {t.label && <text x={f1(t.x)} y={PAD.t + ph + 15} fontSize="10" textAnchor="middle" fill="#56627A">{t.label}</text>}
          </g>
        ))}
        <text x={PAD.l + pw} y={H - 3} fontSize="10" textAnchor="end" fill="#8792A6">
          {ticks.unit === 'px' ? 'position (px) — haut du gel à gauche' : `taille (${ticks.unit}) — haut du gel à gauche`}
        </text>
        <g clipPath="url(#an-clip)">
          {series.map((s, k) => (
            <g key={s.id}>
              {stack && <line x1={PAD.l} x2={PAD.l + pw} y1={f1(Y(lo, 0, k))} y2={f1(Y(lo, 0, k))} stroke="#DDE3EA" />}
              {/* Aires des bandes : entre la courbe et le fond (ou zéro) */}
              {(mode === 'lane' || stack) && s.bands.map((b) => {
                const a = Math.max(from, b.left);
                const z = Math.min(to, b.right);
                if (z <= a) return null;
                let d = `M${f1(X(a))},${f1(Y(s.baseline ? s.baseline[a] : 0, a, k))}`;
                for (let i = a; i <= z; i += 1) d += `L${f1(X(i))},${f1(Y(s.values[i], i, k))}`;
                for (let i = z; i >= a; i -= 1) d += `L${f1(X(i))},${f1(Y(s.baseline ? s.baseline[i] : 0, i, k))}`;
                const sel = mode === 'lane' && b.apex === selected;
                return <path key={`a${b.apex}`} d={`${d}Z`} fill={b.saturated ? '#DC2626' : s.color} fillOpacity={sel ? 0.36 : 0.17} />;
              })}
              {s.baseline && <path d={linePath(s.baseline, from, to, X, Y, px)} fill="none" stroke="#8792A6" strokeDasharray="5 4" strokeWidth="1.2" />}
              <path d={linePath(s.values, from, to, X, (v, i) => Y(v, i, k), px)} fill="none" stroke={s.color} strokeWidth={mode === 'lane' ? 1.7 : 1.5} strokeLinejoin="round" />
              {stack && <text x={PAD.l + 4} y={f1(Y(lo, 0, k) - 4)} fontSize="10.5" fontWeight="600" fill={s.color}>{s.name}</text>}
            </g>
          ))}
          {/* Sommets et étiquettes (piste seule) : placées sans chevauchement, sinon au survol seulement */}
          {mode === 'lane' && series[0] && placeLabels(series[0], from, to, X, Y, unit, labels).map((m) => (
            <g key={`p${m.apex}`}>
              <circle cx={f1(m.x)} cy={f1(m.y)} r="3.2" fill={m.saturated ? '#DC2626' : series[0].color} />
              {m.label && (
                <text x={f1(m.x)} y={f1(m.ly)} fontSize="10" textAnchor="middle" fill="#1D2940">
                  {m.label}<tspan fill="#0E7490"> {m.pct}</tspan>
                </text>
              )}
            </g>
          ))}
          {/* Bornes de la bande sélectionnée : à tirer */}
          {selBand && ['left', 'right'].map((side) => (
            <g key={side}>
              <line x1={f1(X(selBand[side]))} x2={f1(X(selBand[side]))} y1={PAD.t} y2={PAD.t + ph} stroke="#B45309" strokeWidth="1.5" />
              <rect x={f1(X(selBand[side]) - 4)} y={PAD.t + ph / 2 - 12} width="8" height="24" rx="3" fill="#fff" stroke="#B45309" strokeWidth="1.5" />
            </g>
          ))}
        </g>
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={f1(X(hover))} x2={f1(X(hover))} y1={PAD.t} y2={PAD.t + ph} stroke="#DC2626" strokeDasharray="3 3" />
            {series.slice(0, 8).map((s, k) => <circle key={s.id} cx={f1(X(hover))} cy={f1(Y(s.values[hover], hover, k))} r="3" fill={s.color} stroke="#fff" strokeWidth="1" />)}
            <rect x={f1(tipX)} y={PAD.t + 4} width={f1(tipW)} height={tip.length * 14 + 8} rx="4" fill="#1D2940" opacity="0.9" />
            {tip.map((t, i) => (
              <text key={i} x={f1(tipX + 8)} y={PAD.t + 17 + i * 14} fontSize="11" fontWeight={t.bold ? 600 : 400} fill={t.color === '#fff' || t.color === '#FCD34D' ? t.color : '#E2E8F0'}>
                {t.color !== '#fff' && t.color !== '#FCD34D' && <tspan fill={t.color}>● </tspan>}{t.text}
              </text>
            ))}
          </g>
        )}
      </svg>
    </div>
  );
}
