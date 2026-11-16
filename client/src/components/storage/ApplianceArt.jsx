import { formatTemp } from '../../lib/inventory.js';
import { tempTheme } from '../../lib/inventory.js';

/** Flocon (6 branches) centré en (x, y). */
function Snowflake({ x, y, r = 6 }) {
  const arms = [0, 60, 120];
  return (
    <g className="a-snow" transform={`translate(${x} ${y})`}>
      {arms.map((a) => <line key={a} x1={-r} y1="0" x2={r} y2="0" transform={`rotate(${a})`} />)}
      {arms.flatMap((a) => [-1, 1].map((s) => (
        <path key={`${a}${s}`} d={`M${s * r * 0.62} -2.2 L${s * r * 0.4} 0 L${s * r * 0.62} 2.2`} transform={`rotate(${a})`} fill="none" />
      )))}
    </g>
  );
}

/** Petites boîtes rangées sur les étagères, allumées selon le remplissage. */
function ShelfBoxes({ x, y, width, count, fill, seed }) {
  const lit = Math.round(count * fill);
  const w = (width - (count - 1) * 3) / count;
  return Array.from({ length: count }, (_, k) => (
    <rect key={k} x={x + k * (w + 3)} y={y - 9 + ((k * 7 + seed) % 3)} width={w} height={9 - ((k * 7 + seed) % 3)} rx="1.5" className={k < lit ? 'a-box is-lit' : 'a-box'} />
  ));
}

function Upright({ unit, fill, fridge }) {
  const shelves = [44, 76, 108, 140];
  return (
    <>
      <rect x="8" y="4" width="104" height="156" rx="9" className="a-body" />
      <rect x="15" y="11" width="90" height="143" rx="4" className="a-inside" />
      {shelves.map((y, i) => (
        <g key={y}>
          <line x1="15" x2="105" y1={y} y2={y} className="a-shelf" />
          {fridge
            ? [22, 40, 58, 76].map((x, k) => <rect key={x} x={x} y={y - 16 + (k % 2) * 4} width="9" height={16 - (k % 2) * 4} rx="3" className={k < Math.round(4 * fill) ? 'a-box is-lit' : 'a-box'} />)
            : <ShelfBoxes x={20} y={y} width={80} count={5} fill={fill} seed={i} />}
        </g>
      ))}
      <g className="a-door">
        <rect x="11" y="7" width="98" height="150" rx="7" className="a-doorpanel" />
        <rect x="95" y="52" width="6" height="46" rx="3" className="a-handle" />
        <rect x="21" y="18" width="50" height="19" rx="3.5" className="a-lcd" />
        <text x="46" y="31.5" textAnchor="middle" className="a-lcdtext">{formatTemp(unit.temperature) || '—'}</text>
        {!fridge && <Snowflake x={86} y={27.5} r={6.5} />}
        {[128, 134, 140].map((y) => <rect key={y} x="22" y={y} width="34" height="2.6" rx="1.3" className="a-vent" />)}
      </g>
      <rect x="18" y="159" width="14" height="7" rx="2" className="a-feet" />
      <rect x="88" y="159" width="14" height="7" rx="2" className="a-feet" />
    </>
  );
}

function Chest({ unit, fill }) {
  return (
    <>
      <rect x="10" y="40" width="150" height="78" rx="9" className="a-body" />
      <rect x="16" y="33" width="138" height="14" rx="3" className="a-inside" />
      <ShelfBoxes x={22} y={46} width={126} count={8} fill={fill} seed={1} />
      <g className="a-lid">
        <rect x="6" y="27" width="158" height="15" rx="6" className="a-doorpanel" />
        <rect x="70" y="38" width="30" height="5" rx="2.5" className="a-handle" />
      </g>
      <rect x="22" y="58" width="50" height="19" rx="3.5" className="a-lcd" />
      <text x="47" y="71.5" textAnchor="middle" className="a-lcdtext">{formatTemp(unit.temperature) || '—'}</text>
      <Snowflake x={140} y={67} r={7} />
      {[92, 98, 104].map((y) => <rect key={y} x="112" y={y} width="36" height="2.6" rx="1.3" className="a-vent" />)}
      <rect x="18" y="117" width="16" height="6" rx="2" className="a-feet" />
      <rect x="136" y="117" width="16" height="6" rx="2" className="a-feet" />
    </>
  );
}

function Tank({ unit, fill }) {
  return (
    <>
      <g className="a-mist">
        <circle cx="52" cy="26" r="7" />
        <circle cx="64" cy="20" r="9" />
        <circle cx="72" cy="28" r="6" />
      </g>
      <path d="M18 70 Q18 56 60 56 Q102 56 102 70 L102 146 Q102 162 60 162 Q18 162 18 146 Z" className="a-body" />
      <ellipse cx="60" cy="68" rx="42" ry="11" className="a-rim" />
      <path d="M40 60 L40 44 Q40 38 60 38 Q80 38 80 44 L80 60" className="a-neck" />
      <g className="a-lid">
        <ellipse cx="60" cy="41" rx="23" ry="6.5" className="a-doorpanel" />
        <rect x="55" y="30" width="10" height="9" rx="3" className="a-handle" />
      </g>
      <path d="M18 88 Q6 88 6 100 Q6 112 18 112" className="a-ear" />
      <path d="M102 88 Q114 88 114 100 Q114 112 102 112" className="a-ear" />
      <rect x="26" y="104" width="68" height="24" rx="4" className="a-lcd" />
      <text x="60" y="114.5" textAnchor="middle" className="a-lcdtext a-small">LN₂</text>
      <text x="60" y="124.5" textAnchor="middle" className="a-lcdtext">{formatTemp(unit.temperature) || '−196 °C'}</text>
      <rect x="30" y="138" width={60 * Math.max(0.04, Math.min(1, fill))} height="5" rx="2.5" className="a-level" />
      <rect x="30" y="138" width="60" height="5" rx="2.5" className="a-levelframe" />
      <ellipse cx="60" cy="165" rx="40" ry="4" className="a-shadow" />
    </>
  );
}

function Cabinet({ fill }) {
  const shelves = [40, 72, 104, 136];
  return (
    <>
      <rect x="10" y="6" width="100" height="154" rx="5" className="a-body" />
      <rect x="17" y="12" width="86" height="142" rx="2" className="a-inside" />
      {shelves.map((y, i) => (
        <g key={y}>
          <ShelfBoxes x={21} y={y} width={78} count={4} fill={fill} seed={i + 2} />
          <rect x="15" y={y} width="90" height="5" rx="1.5" className="a-plank" />
        </g>
      ))}
      <rect x="14" y="158" width="10" height="8" rx="2" className="a-feet" />
      <rect x="96" y="158" width="10" height="8" rx="2" className="a-feet" />
    </>
  );
}

/**
 * Appareil dessiné : congélateur armoire ou coffre, réfrigérateur, cuve d'azote liquide, armoire.
 * fill (0–1) : remplissage (boîtes allumées, niveau de la cuve). open : porte ouverte (vue intérieure).
 */
export default function ApplianceArt({ unit, fill = 0, open = false, className = '' }) {
  const theme = tempTheme(unit.temperature);
  const chest = unit.kind === 'freezer' && unit.style === 'chest';
  const view = chest ? '0 0 170 126' : '0 0 120 170';
  let body;
  if (unit.kind === 'tank') body = <Tank unit={unit} fill={fill} />;
  else if (unit.kind === 'cabinet') body = <Cabinet fill={fill} />;
  else if (chest) body = <Chest unit={unit} fill={fill} />;
  else body = <Upright unit={unit} fill={fill} fridge={unit.kind === 'fridge'} />;
  return (
    <svg viewBox={view} className={`appl appl-${chest ? 'chest' : unit.kind} theme-${theme}${open ? ' is-open' : ''} ${className}`} aria-hidden="true">
      {body}
    </svg>
  );
}
