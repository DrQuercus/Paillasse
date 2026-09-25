import {
  Aperture, AudioWaveform, Atom, Bug, CircleDot, Container, Cylinder, Disc3, DoorOpen, Dna, Droplet, Ellipsis, GitFork, Grape,
  Grid2x2, Grid3x3, Layers, LibraryBig, Package, Refrigerator, Rows3, ShoppingBag, Snowflake, TestTube,
} from 'lucide-react';
import {
  CAP_HEX, SAMPLE_TYPES, UNIT_KINDS, capColor, capInk, capText, decodeCell, formatTemp, tempTheme,
} from '../../lib/inventory.js';

export const TYPE_ICONS = {
  plasmid: CircleDot, strain: Bug, cells: Grape, protein: Atom, antibody: GitFork, dna: Dna,
  rna: AudioWaveform, oligo: Ellipsis, tissue: Droplet, reagent: TestTube, grid: Aperture, other: Package,
};
export const KIND_ICONS = {
  room: DoorOpen, freezer: Snowflake, fridge: Refrigerator, tank: Container, cabinet: LibraryBig,
  shelf: Rows3, rack: Layers, box: Grid3x3, bag: ShoppingBag, canister: Cylinder, puck: Disc3, gridbox: Grid2x2,
};

// Couleurs de boîtes (carton ou plastique des boîtes de congélation)
export const BOX_COLORS = ['#CFE3FF', '#FFD9C2', '#FFF1B8', '#CDEFD8', '#E6D9FF', '#FFD6E7', '#E4E7EC', '#C9F0F0'];
// Boîtes à grilles : aluminium anodisé (argent, or, rose, cuivre, bleu, vert, violet) ou plastique rouge
export const GRIDBOX_COLORS = ['#D5D9DF', '#E6D17E', '#E8B4CC', '#DDA67C', '#9EC5EA', '#A6D7B2', '#BCA8E6', '#E37B84'];
export const GRIDBOX_COLOR_NAMES = ['argent', 'or', 'rose', 'cuivre', 'bleu', 'vert', 'violet', 'rouge'];
export const boxColor = (u) => u?.color || (u?.kind === 'gridbox' ? GRIDBOX_COLORS[0] : BOX_COLORS[0]);

export function TypeIcon({ type, size = 14 }) {
  const Icon = TYPE_ICONS[type] ?? Package;
  return <Icon size={size} aria-hidden="true" />;
}

export const typeLabel = (type) => SAMPLE_TYPES[type]?.label ?? 'Autre';
export const TYPE_SHORT = {
  plasmid: 'Plasmide', strain: 'Souche', cells: 'Cellules', protein: 'Protéine', antibody: 'Anticorps', dna: 'ADN',
  rna: 'ARN', oligo: 'Oligo', tissue: 'Tissu, sérum', reagent: 'Réactif', grid: 'Grille', other: 'Autre',
};

/** Bouchon de tube, vu de dessus. */
export function Cap({ sample, color, size = 22, label = false, className = '' }) {
  const c = color ?? capColor(sample);
  return (
    <span className={`cap ${className}`} style={{ '--cap': CAP_HEX[c], '--cap-ink': capInk(c), width: size, height: size }} aria-hidden="true">
      {label && <span className={`cap-text len-${Math.min(6, Math.max(4, capText(sample).length))}`}>{capText(sample)}</span>}
    </span>
  );
}

export function TempChip({ unit, small = false }) {
  const t = formatTemp(unit?.temperature);
  if (!t) return null;
  return <span className={`temp-chip theme-${tempTheme(unit.temperature)}${small ? ' is-small' : ''}`}><Snowflake size={small ? 11 : 13} aria-hidden="true" />{t}</span>;
}

/** Jauge de remplissage : places occupées / capacité. */
export function FillBar({ used, capacity, label = true }) {
  const ratio = capacity ? Math.min(1, used / capacity) : 0;
  const tone = ratio >= 0.9 ? 'is-full' : ratio >= 0.7 ? 'is-busy' : '';
  return (
    <span className="fill">
      <span className={`fill-bar ${tone}`} role="img" aria-label={`${used} sur ${capacity} places occupées`}>
        <span style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      {label && capacity > 0 && <span className="fill-text">{capacity - used} libre{capacity - used > 1 ? 's' : ''}</span>}
    </span>
  );
}

/** Mini-carte d'une boîte : un point par position, de la couleur du bouchon. */
export function MiniMap({ unit, size = 5, gap = 1.6, highlight = null }) {
  const { rows, cols } = unit;
  const map = unit.map ?? '';
  const step = size + gap;
  return (
    <svg className="minimap" viewBox={`0 0 ${cols * step + gap} ${rows * step + gap}`} width={cols * step + gap} height={rows * step + gap} aria-hidden="true">
      {Array.from({ length: rows * cols }, (_, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const cell = decodeCell(map[i]);
        const hl = highlight?.some((p) => p.row === r && p.col === c);
        return (
          <circle
            key={i}
            cx={gap + c * step + size / 2}
            cy={gap + r * step + size / 2}
            r={size / 2}
            fill={cell ? (cell.out ? 'none' : CAP_HEX[cell.color]) : hl ? '#2449C7' : '#fff'}
            stroke={cell ? (cell.out ? CAP_HEX[cell.color] : 'rgba(0,0,0,.25)') : hl ? '#2449C7' : 'rgba(29,41,64,.18)'}
            strokeWidth={cell?.out ? 1.2 : 0.6}
            strokeDasharray={cell?.out ? '1.5 1' : undefined}
          />
        );
      })}
    </svg>
  );
}

export const kindLabel = (kind, parentKind) => (kind === 'rack' && parentKind === 'tank' ? 'Tour' : UNIT_KINDS[kind]?.label ?? kind);
