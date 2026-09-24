import { useRef } from 'react';
import { formatNumber } from '../../lib/calc/units.js';
import { formatSize } from '../../lib/gel/calibration.js';

const W = 600;
const H = 250;
const PAD = { t: 16, r: 14, b: 34, l: 14 };

/**
 * Profil d'une piste : signal lissé, fond (pointillés), aires des bandes, sommets.
 * Survol synchronisé avec le gel ; clic = ajout/retrait de bande ou attribution d'une taille (selon l'outil).
 */
export default function ProfileChart({ lane, length, calibration, unit, ladderSizes = [], hoverPos, onHover, onPick, pickable, color = '#0072B2' }) {
  const svg = useRef(null);
  if (!lane) return null;
  const n = length;
  const s = lane.smoothed;
  const base = lane.baseline;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i += 1) { lo = Math.min(lo, base[i], s[i]); hi = Math.max(hi, s[i]); }
  const span = hi - lo || 1;
  const pw = W - PAD.l - PAD.r;
  const ph = H - PAD.t - PAD.b;
  const X = (i) => PAD.l + (i / Math.max(1, n - 1)) * pw;
  const Y = (v) => PAD.t + ph - ((v - lo) / (span * 1.1)) * ph;
  const path = (arr) => {
    let d = '';
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 900))) d += `${d ? 'L' : 'M'}${X(i).toFixed(1)},${Y(arr[i]).toFixed(1)}`;
    return d;
  };
  const toPos = (e) => {
    const r = svg.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(n - 1, Math.round(((x - PAD.l) / pw) * (n - 1))));
  };
  const ticks = calibration
    ? ladderSizes.map((size) => ({ pos: calibration.posAt(size), label: formatSize(size, unit).replace(/ (kDa|pb|kb)$/, '') })).filter((t) => t.pos >= 0 && t.pos <= n - 1)
    : [0, 0.25, 0.5, 0.75, 1].map((f) => ({ pos: f * (n - 1), label: `${f * 100} %` }));
  const hover = hoverPos !== null && hoverPos !== undefined && hoverPos >= 0 && hoverPos < n ? hoverPos : null;

  return (
    <svg
      ref={svg}
      className={`profile-chart${pickable ? ' is-pickable' : ''}`}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Profil de migration de la piste"
      onMouseMove={(e) => onHover?.(toPos(e))}
      onMouseLeave={() => onHover?.(null)}
      onClick={(e) => pickable && onPick?.(toPos(e))}
    >
      <rect x={PAD.l} y={PAD.t} width={pw} height={ph} fill="#fff" stroke="#D2DAE3" />
      {lane.bands.map((b) => {
        let d = `M${X(b.left).toFixed(1)},${Y(base[b.left]).toFixed(1)}`;
        for (let i = b.left; i <= b.right; i += 1) d += `L${X(i).toFixed(1)},${Y(s[i]).toFixed(1)}`;
        for (let i = b.right; i >= b.left; i -= 1) d += `L${X(i).toFixed(1)},${Y(base[i]).toFixed(1)}`;
        return <path key={`a${b.apex}`} d={`${d}Z`} fill={b.saturated ? '#DC2626' : color} fillOpacity="0.18" />;
      })}
      <path d={path(base)} fill="none" stroke="#8792A6" strokeDasharray="5 4" strokeWidth="1.2" />
      <path d={path(s)} fill="none" stroke={color} strokeWidth="1.6" />
      {lane.bands.map((b, i) => (
        <g key={`p${b.apex}`}>
          <circle cx={X(b.apex)} cy={Y(s[b.apex])} r="3.5" fill={b.saturated ? '#DC2626' : color} />
          <text x={X(b.apex)} y={Math.max(PAD.t + 10, Y(s[b.apex]) - 7)} fontSize="10" textAnchor="middle" fill="#1D2940">
            {b.size ? formatSize(b.size, unit) : `#${i + 1}`}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <g key={`t${t.label}`}>
          <line x1={X(t.pos)} x2={X(t.pos)} y1={PAD.t + ph} y2={PAD.t + ph + 4} stroke="#56627A" />
          <text x={X(t.pos)} y={PAD.t + ph + 15} fontSize="10" textAnchor="middle" fill="#56627A">{t.label}</text>
        </g>
      ))}
      <text x={PAD.l + pw} y={H - 4} fontSize="10" textAnchor="end" fill="#8792A6">
        {calibration ? `taille (${unit})` : 'distance de migration'} — haut du gel à gauche
      </text>
      {hover !== null && (
        <g pointerEvents="none">
          <line x1={X(hover)} x2={X(hover)} y1={PAD.t} y2={PAD.t + ph} stroke="#DC2626" strokeDasharray="3 3" />
          <rect x={Math.min(X(hover) + 6, W - 132)} y={PAD.t + 4} width="124" height={calibration ? 34 : 20} rx="4" fill="#1D2940" opacity="0.88" />
          {calibration && (
            <text x={Math.min(X(hover) + 12, W - 126)} y={PAD.t + 17} fontSize="11" fill="#fff">
              ≈ {formatSize(calibration.sizeAt(hover), unit)}
            </text>
          )}
          <text x={Math.min(X(hover) + 12, W - 126)} y={PAD.t + (calibration ? 31 : 17)} fontSize="11" fill="#C9D2E3">
            signal {formatNumber(s[hover] - base[hover], 3)}
          </text>
        </g>
      )}
    </svg>
  );
}
