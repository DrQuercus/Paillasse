import { useId, useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import {
  GRIDBOX_FORMATS, GRID_SCREENING, contentsText, decodeCell, formatTemp, unitLabel,
} from '../../lib/inventory.js';
import { Cap, boxColor } from './bits.jsx';

// Couleurs du résultat de criblage (halo autour de la grille)
export const SCREENING_COLORS = {
  todo: '#94A3B8', good: '#16A34A', thick: '#F59E0B', thin: '#0EA5E9', aggregates: '#8B5CF6',
  empty: '#64748B', broken: '#DC2626', collected: '#2563EB',
};

// Supports courants, proposés à la saisie
export const GRID_SUPPORTS = [
  'Quantifoil R1.2/1.3 Cu 300', 'Quantifoil R2/1 Cu 300', 'Quantifoil R1.2/1.3 Au 300', 'Quantifoil R2/2 Cu 200',
  'UltrAuFoil R1.2/1.3 Au 300', 'UltrAuFoil R0.6/1 Au 300', 'C-flat 1.2/1.3 Cu 400', 'C-flat 2/1 Au 300',
  'Lacey carbone Cu 300', 'Oxyde de graphène sur Quantifoil Cu 300', 'Carbone continu Cu 400 (coloration négative)',
];

/** Métal de la grille d'après son support : or, nickel ou cuivre. */
export function gridMetal(support) {
  const s = String(support ?? '');
  if (/\bAu\b|UltrAuFoil|\bor\b|gold/i.test(s)) return { base: '#E8C65B', mesh: '#A5801C', rim: '#8E6D14', name: 'or' };
  if (/\bNi\b|nickel/i.test(s)) return { base: '#CDD0D5', mesh: '#8C9099', rim: '#6B7280', name: 'nickel' };
  return { base: '#D48D5B', mesh: '#98572B', rim: '#854A22', name: 'cuivre' };
}

/** Grille vue de dessus : disque de métal quadrillé, anneau de clip, halo du criblage. */
export function GridDisc({ sample, clipped = false, size = '100%', out = false }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const metal = gridMetal(sample?.details?.support);
  const screening = sample?.details?.screening;
  const r = clipped ? 13.2 : 16;
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={`grid-disc${out ? ' is-out' : ''}`} aria-hidden="true">
      <defs>
        <pattern id={`m${uid}`} width="2.6" height="2.6" patternUnits="userSpaceOnUse">
          <path d="M0 0H2.6M0 0V2.6" stroke={metal.mesh} strokeWidth="0.75" fill="none" />
        </pattern>
        <clipPath id={`c${uid}`}><circle cx="20" cy="20" r={r - 1.4} /></clipPath>
      </defs>
      {screening && screening !== 'todo' && <circle cx="20" cy="20" r="19" fill="none" stroke={SCREENING_COLORS[screening]} strokeWidth="2.2" />}
      {clipped && (
        <>
          <circle cx="20" cy="20" r="17.3" fill="#AEB5BF" stroke="#6B7280" strokeWidth="0.9" />
          <circle cx="20" cy="20" r="14.4" fill="none" stroke="#7C8491" strokeWidth="1.1" />
        </>
      )}
      <circle cx="20" cy="20" r={r} fill={metal.base} />
      <rect x="0" y="0" width="40" height="40" fill={`url(#m${uid})`} clipPath={`url(#c${uid})`} />
      <circle cx="20" cy="20" r={r} fill="none" stroke={metal.rim} strokeWidth="1.5" />
      <circle cx={20 - r * 0.45} cy={20 - r * 0.45} r={r * 0.22} fill="#fff" opacity=".35" />
      {screening === 'broken' && <path d="M12 13 L19 19 L16 23 L27 29" stroke="#7F1D1D" strokeWidth="1.4" fill="none" strokeLinecap="round" />}
      {screening === 'collected' && <path d="M14 20.5 L18.2 24.5 L26.5 15.5" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}

/** Pastille d'un échantillon dans une liste : grille (disque quadrillé) ou bouchon de tube. */
export function SampleIcon({ sample, size = 16 }) {
  return sample?.type === 'grid' ? <span className="sample-icon-grid"><GridDisc sample={sample} size={size} /></span> : <Cap sample={sample} size={size} />;
}

/** Position de chaque grille dans une boîte ronde (en % du diamètre), et sa taille. */
export function gridboxSpots(format) {
  const ring = (n, radius, start, size, extra = {}, inward = false) => Array.from({ length: n }, (_, i) => {
    const a = ((start + (i * 360) / n) * Math.PI) / 180;
    // Numéro côté centre quand les grilles se touchent presque (en % de la case de la grille)
    const lab = inward ? { x: 50 - 72 * Math.cos(a), y: 50 - 72 * Math.sin(a) } : null;
    return { x: 50 + radius * Math.cos(a), y: 50 + radius * Math.sin(a), size, lab, ...extra };
  });
  if (format === 'g12') return ring(12, 36, -90, 17.5, {}, true);
  if (format === 'g4c4') return [...ring(4, 33, -135, 25, { clipped: true }), ...ring(4, 33, -90, 20.5)];
  if (format === 'g4c') return ring(4, 27, -90, 32, { clipped: true });
  return ring(4, 27, -90, 29);
}

/** Petite boîte ronde (dans un puck) : une pastille par position, pleine si une grille y est. */
export function MiniRoundBox({ box, size = 34 }) {
  const spots = gridboxSpots(box.format);
  const map = box.map ?? '';
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className="mini-roundbox" aria-hidden="true">
      <circle cx="50" cy="50" r="48" fill={boxColor(box)} stroke="rgba(29,41,64,.35)" strokeWidth="3" />
      {spots.map((p, i) => {
        const cell = decodeCell(map[i]);
        return <circle key={i} cx={p.x} cy={p.y} r={p.size / 2.4} fill={cell ? (cell.out ? 'none' : '#C9814F') : 'rgba(29,41,64,.18)'} stroke={cell ? '#854A22' : 'none'} strokeWidth="3" strokeDasharray={cell?.out ? '6 4' : undefined} />;
      })}
      <circle cx="50" cy="50" r="7" fill="rgba(29,41,64,.3)" />
    </svg>
  );
}

// --- Glisser un puck (niveau de canister) ou une boîte (case de puck) --------------------------------
let dragged = null;

function useSlotDrop(parent, slot, onMoved) {
  const { notify } = useApp();
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e) => { if (dragged && (dragged.parent_id !== parent.id || dragged.slot !== slot)) { e.preventDefault(); setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: async (e) => {
        e.preventDefault();
        setOver(false);
        const u = dragged;
        dragged = null;
        if (!u) return;
        try {
          await api.put(`/inventory/units/${u.id}`, { parent_id: parent.id, slot });
          notify(`${unitLabel(u)} → ${parent.kind === 'canister' ? 'niveau' : 'case'} ${slot}.`, 'success');
          onMoved();
        } catch (err) {
          notify(err.message, 'error');
        }
      },
    },
  };
}
const dragProps = (unit) => ({
  draggable: true,
  onDragStart: (e) => { dragged = unit; e.dataTransfer.setData('text/plain', unitLabel(unit)); e.dataTransfer.effectAllowed = 'move'; },
  onDragEnd: () => { dragged = null; },
});

// --- Dewar vu du dessus ----------------------------------------------------------------------------

/** Ouverture du dewar vue d'en haut : les canisters en couronne, avec leur numéro. */
export function DewarTop({ unit, tree, onOpen }) {
  const canisters = tree.children(unit.id).filter((c) => c.kind === 'canister')
    .sort((a, b) => a.name.localeCompare(b.name, 'fr', { numeric: true }));
  const n = canisters.length;
  const size = n <= 6 ? 23 : n <= 10 ? 19 : 15;
  return (
    <div className="dewar-wrap">
      <div className="dewar-top" role="group" aria-label={`${unit.name} vu du dessus : ${n} canister${n > 1 ? 's' : ''}`}>
        <span className="dewar-center" aria-hidden="true">LN₂<small>{formatTemp(unit.temperature)}</small></span>
        {canisters.map((c, i) => {
          const a = ((-90 + (i * 360) / Math.max(n, 1)) * Math.PI) / 180;
          const radius = n === 1 ? 0 : n <= 6 ? 30 : 33;
          const pucks = tree.children(c.id).length;
          const ratio = c.capacity ? pucks / c.capacity : 0;
          return (
            <button
              key={c.id}
              type="button"
              className="canister-top"
              style={{ left: `${50 + radius * Math.cos(a)}%`, top: `${50 + radius * Math.sin(a)}%`, width: `${size}%`, '--fill': `${Math.round(ratio * 360)}deg` }}
              onClick={() => onOpen(c)}
              title={`Canister ${c.name} : ${pucks} puck(s) sur ${c.capacity}, ${contentsText(tree.totals(c.id), 'grille')}`}
            >
              <span className="canister-num">{c.name}</span>
              <span className="canister-sub">{pucks}/{c.capacity}</span>
            </button>
          );
        })}
        {n === 0 && <span className="dewar-empty">Aucun canister</span>}
      </div>
    </div>
  );
}

// --- Canister en coupe : un puck par niveau -------------------------------------------------------------

function PuckLevel({ canister, level, puck, tree, onOpen, onCreate, onMoved }) {
  const drop = useSlotDrop(canister, level, onMoved);
  if (!puck) {
    return (
      <div className={`can-level is-empty${drop.over ? ' is-drop' : ''}`} {...drop.props}>
        <span className="can-level-num">{level}</span>
        <button type="button" className="can-level-add" onClick={() => onCreate({ kind: 'puck', parent: canister, slot: level })}>
          <Plus size={14} aria-hidden="true" /> Puck au niveau {level}
        </button>
      </div>
    );
  }
  const boxes = tree.children(puck.id);
  const t = tree.totals(puck.id);
  const cap = puck.capacity ?? 12;
  return (
    <div className={`can-level${drop.over ? ' is-drop' : ''}`} {...drop.props}>
      <span className="can-level-num">{level}</span>
      <button type="button" className="puck-disc" onClick={() => onOpen(puck)} {...dragProps(puck)} title={`Puck ${puck.name} : ${boxes.length} boîte(s) sur ${cap}, ${contentsText(t, 'grille')}`}>
        <svg viewBox="0 0 100 100" className="puck-dots" aria-hidden="true">
          <circle cx="50" cy="50" r="47" className="puck-dots-plate" />
          {Array.from({ length: cap }, (_, i) => {
            const a = ((-90 + (i * 360) / cap) * Math.PI) / 180;
            const has = boxes.some((b) => b.slot === i + 1);
            return <circle key={i} cx={50 + 32 * Math.cos(a)} cy={50 + 32 * Math.sin(a)} r="9" className={has ? 'is-full' : ''} />;
          })}
          <circle cx="50" cy="50" r="10" className="puck-dots-hub" />
        </svg>
        <span className="puck-disc-text">
          <strong>Puck {puck.name}</strong>
          <span>{boxes.length}/{cap} boîtes · {contentsText(t, 'grille')}</span>
        </span>
      </button>
    </div>
  );
}

/** Canister vu en coupe : niveau 1 en haut, un puck par niveau ; un puck se glisse vers un autre niveau. */
export function CanisterView({ unit, tree, onOpen, onCreate, onEdit, onMoved }) {
  const pucks = tree.children(unit.id);
  const at = new Map(pucks.map((p) => [p.slot, p]));
  const levels = Array.from({ length: unit.capacity ?? 5 }, (_, i) => i + 1);
  const t = tree.totals(unit.id);
  return (
    <div className="cryo-view">
      <div className="canister-tube">
        <span className="canister-handle" aria-hidden="true" />
        <span className="canister-label" aria-hidden="true">{unit.name}</span>
        {levels.map((l) => <PuckLevel key={l} canister={unit} level={l} puck={at.get(l)} tree={tree} onOpen={onOpen} onCreate={onCreate} onMoved={onMoved} />)}
      </div>
      <aside className="cryo-side">
        <h2>Canister {unit.name}</h2>
        <p className="muted">{pucks.length}/{levels.length} niveaux occupés · {t.boxes} boîte{t.boxes > 1 ? 's' : ''} · {contentsText(t, 'grille')}</p>
        <button type="button" className="btn btn-small" onClick={() => onEdit(unit)}><Pencil size={13} /> Modifier le canister</button>
        <p className="hint">Niveau 1 en haut. Glissez un puck sur un autre niveau pour le déplacer (sur un autre puck : ils s’échangent).</p>
      </aside>
    </div>
  );
}

// --- Puck vu du dessus : les boîtes dans leurs cases ---------------------------------------------------

function PuckSlot({ puck, slot, box, tree, x, y, size, onOpen, onCreate, onMoved }) {
  const drop = useSlotDrop(puck, slot, onMoved);
  const style = { left: `${x}%`, top: `${y}%`, width: `${size}%` };
  return (
    <>
      {box ? (
        <button
          type="button"
          className={`puck-slot has-box${drop.over ? ' is-drop' : ''}`}
          style={{ ...style, '--box': boxColor(box) }}
          onClick={() => onOpen(box)}
          {...drop.props}
          {...dragProps(box)}
          title={`Boîte ${box.name} (case ${slot}) : ${GRIDBOX_FORMATS[box.format]?.label}, ${tree.totals(box.id).tubes} grille(s)`}
        >
          <MiniRoundBox box={box} size="100%" />
          <span className="puck-slot-name">{box.name}</span>
        </button>
      ) : (
        <button type="button" className={`puck-slot is-empty${drop.over ? ' is-drop' : ''}`} style={style} onClick={() => onCreate({ kind: 'gridbox', parent: puck, slot })} {...drop.props} aria-label={`Case ${slot} libre : ajouter une boîte`}>
          <Plus size={16} aria-hidden="true" />
        </button>
      )}
    </>
  );
}

/** Puck vu du dessus : ses cases en couronne, numérotées ; une boîte se glisse vers une autre case. */
export function PuckView({ unit, tree, onOpen, onCreate, onEdit, onMoved }) {
  const boxes = tree.children(unit.id);
  const at = new Map(boxes.map((b) => [b.slot, b]));
  const cap = unit.capacity ?? 12;
  const size = cap <= 6 ? 26 : cap <= 12 ? 19 : 16;
  const t = tree.totals(unit.id);
  return (
    <div className="cryo-view">
      <div className="puck-top-wrap">
        <div className="puck-top" role="group" aria-label={`Puck ${unit.name} vu du dessus, ${cap} cases`}>
          {Array.from({ length: cap }, (_, i) => {
            const a = ((-90 + (i * 360) / cap) * Math.PI) / 180;
            const x = 50 + 35 * Math.cos(a);
            const y = 50 + 35 * Math.sin(a);
            const lx = 50 + 48 * Math.cos(a);
            const ly = 50 + 48 * Math.sin(a);
            return (
              <span key={i}>
                <PuckSlot puck={unit} slot={i + 1} box={at.get(i + 1)} tree={tree} x={x} y={y} size={size} onOpen={onOpen} onCreate={onCreate} onMoved={onMoved} />
                <span className="puck-slot-num" style={{ left: `${lx}%`, top: `${ly}%` }} aria-hidden="true">{i + 1}</span>
              </span>
            );
          })}
          <span className="puck-hub" aria-hidden="true">Puck<strong>{unit.name}</strong></span>
        </div>
      </div>
      <aside className="cryo-side">
        <h2>Puck {unit.name}</h2>
        <p className="muted">{boxes.length}/{cap} boîtes · {contentsText(t, 'grille')}</p>
        <ul className="puck-list">
          {boxes.map((b) => (
            <li key={b.id}>
              <button type="button" className="link-btn" onClick={() => onOpen(b)}>
                <span className="puck-list-slot">{b.slot}</span> Boîte {b.name}
              </button>
              <span className="muted small">{GRIDBOX_FORMATS[b.format]?.label} · {tree.totals(b.id).tubes}/{b.cols}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn btn-small" onClick={() => onEdit(unit)}><Pencil size={13} /> Modifier le puck</button>
        <p className="hint">Case vide : ajouter une boîte. Glissez une boîte vers une autre case (sur une autre boîte : elles s’échangent).</p>
      </aside>
    </div>
  );
}

/** Choix du résultat de criblage d'une grille. */
export function ScreeningChips({ value, onChange }) {
  return (
    <div className="screening-chips" role="radiogroup" aria-label="Criblage">
      {Object.entries(GRID_SCREENING).map(([k, label]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={`screen-chip${value === k ? ' is-active' : ''}`} style={{ '--sc': SCREENING_COLORS[k] }} onClick={() => onChange(k)}>
          <span className="screen-dot" aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  );
}
