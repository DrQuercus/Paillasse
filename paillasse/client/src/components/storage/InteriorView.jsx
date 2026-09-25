import { useState } from 'react';
import { Pencil, Plus, ShoppingBag } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { UNIT_KINDS, canContain, tempTheme } from '../../lib/inventory.js';
import ApplianceArt from './ApplianceArt.jsx';
import { ApplianceCard } from './LabView.jsx';
import { FillBar, KIND_ICONS, MiniMap, TempChip, boxColor, kindLabel } from './bits.jsx';

const DRAG_TYPE = 'application/x-paillasse-unit';
// Contenant en cours de glissement (dataTransfer n'est pas lisible pendant le survol)
let draggedUnit = null;

/** Glisser un contenant (boîte, rack, sac) vers une étagère ou un rack. */
function useUnitDrop(target, tree, onMoved) {
  const { notify } = useApp();
  const [over, setOver] = useState(false);
  const dragged = () => tree.byId.get(draggedUnit);
  const accepts = () => {
    const d = dragged();
    return d && d.id !== target.id && d.parent_id !== target.id && canContain(target.kind, d.kind);
  };
  return {
    over,
    props: {
      onDragOver: (e) => { if (accepts()) { e.preventDefault(); e.stopPropagation(); setOver(true); } },
      onDragLeave: () => setOver(false),
      onDrop: async (e) => {
        setOver(false);
        const d = dragged();
        if (!accepts()) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          await api.put(`/inventory/units/${d.id}`, { parent_id: target.id });
          notify(`« ${d.name} » est maintenant dans « ${target.name} ».`, 'success');
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
  onDragStart: (e) => {
    draggedUnit = unit.id;
    e.dataTransfer.setData(DRAG_TYPE, unit.id);
    e.dataTransfer.effectAllowed = 'move';
  },
  onDragEnd: () => { draggedUnit = null; },
});

/** Boîte posée quelque part : mini-carte de ses positions. */
function BoxTile({ unit, tree, onOpen, compact = false }) {
  const t = tree.totals(unit.id);
  return (
    <button type="button" className={`box-tile${compact ? ' is-compact' : ''}`} style={{ '--box': boxColor(unit) }} onClick={() => onOpen(unit)} {...dragProps(unit)} title={`${unit.name} : ${t.tubes} tube(s) sur ${unit.rows * unit.cols}`}>
      {!compact && <MiniMap unit={unit} size={unit.cols > 10 ? 3.6 : 5} />}
      <span className="box-tile-name">{unit.name}</span>
      <span className="box-tile-count">{t.tubes}/{unit.rows * unit.cols}</span>
      {compact && <FillBar used={t.tubes} capacity={unit.rows * unit.cols} label={false} />}
    </button>
  );
}

function BagTile({ unit, tree, onOpen }) {
  return (
    <button type="button" className="bag-tile" onClick={() => onOpen(unit)} {...dragProps(unit)}>
      <ShoppingBag size={22} aria-hidden="true" />
      <span className="box-tile-name">{unit.name}</span>
      <span className="box-tile-count">{tree.totals(unit.id).tubes} tube(s)</span>
    </button>
  );
}

function AddTile({ label, onClick, small = false }) {
  return (
    <button type="button" className={`add-tile${small ? ' is-small' : ''}`} onClick={onClick}>
      <Plus size={small ? 13 : 16} aria-hidden="true" /> {label}
    </button>
  );
}

/** Rack (ou tour de cuve) : ses boîtes empilées, comme dans la réalité. */
function RackColumn({ unit, tree, onOpen, onCreate, onMoved, parentKind }) {
  const drop = useUnitDrop(unit, tree, onMoved);
  const items = tree.children(unit.id);
  return (
    <div className={`rack${drop.over ? ' is-drop' : ''}`} {...drop.props} {...dragProps(unit)}>
      <button type="button" className="rack-head" onClick={() => onOpen(unit)}>
        {kindLabel('rack', parentKind)} <strong>{unit.name.replace(/^(Rack|Tour)\s+/, '')}</strong>
      </button>
      <div className="rack-slots">
        {items.map((u) => (u.kind === 'box'
          ? <BoxTile key={u.id} unit={u} tree={tree} onOpen={onOpen} compact />
          : <BagTile key={u.id} unit={u} tree={tree} onOpen={onOpen} />))}
        <AddTile small label="Boîte" onClick={() => onCreate({ kind: 'box', parent: unit })} />
      </div>
    </div>
  );
}

function Items({ items, tree, onOpen, onCreate, onMoved, parent }) {
  return items.map((u) => {
    if (u.kind === 'rack') return <RackColumn key={u.id} unit={u} tree={tree} onOpen={onOpen} onCreate={onCreate} onMoved={onMoved} parentKind={parent.kind} />;
    if (u.kind === 'box') return <BoxTile key={u.id} unit={u} tree={tree} onOpen={onOpen} />;
    if (u.kind === 'bag') return <BagTile key={u.id} unit={u} tree={tree} onOpen={onOpen} />;
    return null;
  });
}

function AddButtons({ parent, onCreate, small = false }) {
  const kinds = UNIT_KINDS[parent.kind].children.filter((k) => k !== 'shelf');
  return kinds.map((k) => <AddTile key={k} small={small} label={kindLabel(k, parent.kind)} onClick={() => onCreate({ kind: k, parent })} />);
}

/** Étagère : une planche, et ce qui est posé dessus. */
function ShelfBand({ shelf, tree, onOpen, onCreate, onEdit, onMoved }) {
  const drop = useUnitDrop(shelf, tree, onMoved);
  const items = tree.children(shelf.id);
  const t = tree.totals(shelf.id);
  return (
    <section className={`shelf-band${drop.over ? ' is-drop' : ''}`} {...drop.props}>
      <header className="shelf-head">
        <button type="button" className="link-btn" onClick={() => onOpen(shelf)}>{shelf.name}</button>
        <span className="muted small">{t.boxes} boîte{t.boxes > 1 ? 's' : ''} · {t.tubes} tube{t.tubes > 1 ? 's' : ''}</span>
        <button type="button" className="icon-btn" onClick={() => onEdit(shelf)} aria-label={`Modifier ${shelf.name}`} title="Modifier l’étagère"><Pencil size={13} /></button>
      </header>
      <div className="shelf-items">
        <Items items={items} tree={tree} onOpen={onOpen} onCreate={onCreate} onMoved={onMoved} parent={shelf} />
        {!items.length && <span className="shelf-empty">Étagère vide</span>}
        <span className="shelf-add"><AddButtons parent={shelf} onCreate={onCreate} small /></span>
      </div>
      <div className="shelf-board" aria-hidden="true" />
    </section>
  );
}

/**
 * Intérieur d'une pièce (ses appareils), d'un appareil (étagères, racks ou tours, boîtes),
 * d'une étagère ou d'un rack. Les contenants se déplacent par glisser-déposer.
 */
export default function InteriorView({ unit, tree, onOpen, onCreate, onEdit, onMoved }) {
  const drop = useUnitDrop(unit, tree, onMoved);
  const children = tree.children(unit.id);
  const t = tree.totals(unit.id);
  const Icon = KIND_ICONS[unit.kind];
  const appliance = UNIT_KINDS[unit.kind].appliance;
  const applianceOf = appliance ? unit : [...tree.byId.values()].find((u) => UNIT_KINDS[u.kind].appliance && isAncestor(tree, u.id, unit.id));
  const theme = tempTheme(applianceOf?.temperature);

  if (unit.kind === 'room') {
    return (
      <div className="interior theme-ambient">
        <header className="interior-head">
          <Icon size={20} aria-hidden="true" /><h2>{unit.name}</h2>
          <span className="muted">{t.tubes} tubes</span>
          <button type="button" className="btn btn-small" onClick={() => onEdit(unit)}><Pencil size={13} /> Modifier</button>
        </header>
        <ul className="appl-grid">
          {children.map((u) => <ApplianceCard key={u.id} unit={u} tree={tree} onOpen={onOpen} />)}
          <li><button type="button" className="appl-card appl-add" onClick={() => onCreate({ parent: unit })}><span className="appl-add-icon"><Plus size={26} /></span><span className="appl-name">Ajouter un appareil</span></button></li>
        </ul>
      </div>
    );
  }

  const shelves = children.filter((c) => c.kind === 'shelf');
  const loose = children.filter((c) => c.kind !== 'shelf');
  return (
    <div className={`interior theme-${theme}${appliance ? ' is-appliance' : ''}`}>
      {appliance && (
        <aside className="interior-art">
          <ApplianceArt unit={unit} fill={t.capacity ? t.placed / t.capacity : 0} open />
        </aside>
      )}
      <div className="interior-body">
        <header className="interior-head">
          <Icon size={20} aria-hidden="true" />
          <h2>{unit.name}</h2>
          <TempChip unit={applianceOf} />
          <span className="muted">{t.boxes} boîte{t.boxes > 1 ? 's' : ''} · {t.tubes} tube{t.tubes > 1 ? 's' : ''}</span>
          {t.capacity > 0 && <FillBar used={t.placed} capacity={t.capacity} />}
          <button type="button" className="btn btn-small" onClick={() => onEdit(unit)}><Pencil size={13} /> Modifier</button>
        </header>
        {unit.notes && <p className="hint interior-notes">{unit.notes}</p>}
        <div className={`interior-inside kind-${unit.kind}${drop.over ? ' is-drop' : ''}`} {...drop.props}>
          {shelves.map((s) => <ShelfBand key={s.id} shelf={s} tree={tree} onOpen={onOpen} onCreate={onCreate} onEdit={onEdit} onMoved={onMoved} />)}
          {(loose.length > 0 || !shelves.length) && (
            <section className={`shelf-band is-loose kind-${unit.kind}`}>
              {shelves.length > 0 && <header className="shelf-head"><span className="muted small">Sans étagère</span></header>}
              <div className="shelf-items">
                <Items items={loose} tree={tree} onOpen={onOpen} onCreate={onCreate} onMoved={onMoved} parent={unit} />
                {!children.length && <span className="shelf-empty">Rien pour l’instant : ajoutez de quoi ranger.</span>}
              </div>
            </section>
          )}
        </div>
        <div className="interior-add">
          {UNIT_KINDS[unit.kind].children.includes('shelf') && <AddTile label="Étagère" onClick={() => onCreate({ kind: 'shelf', parent: unit })} />}
          <AddButtons parent={unit} onCreate={onCreate} />
          <span className="hint">Glissez une boîte ou un rack pour le changer de place.</span>
        </div>
      </div>
    </div>
  );
}

function isAncestor(tree, ancestorId, id) {
  let u = tree.byId.get(id);
  while (u) {
    if (u.id === ancestorId) return true;
    u = tree.byId.get(u.parent_id);
  }
  return false;
}
