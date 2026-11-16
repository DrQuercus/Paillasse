import { useState } from 'react';
import { Pencil, Plus, ShoppingBag } from 'lucide-react';
import Modal from '../Modal.jsx';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { UNIT_KINDS, canContain, contentsText, tempTheme } from '../../lib/inventory.js';
import ApplianceArt from './ApplianceArt.jsx';
import { ApplianceCard } from './LabView.jsx';
import { DewarTop } from './cryo.jsx';
import { DrawerIcon, FillBar, KIND_ICONS, MiniMap, TempChip, boxColor, kindLabel } from './bits.jsx';

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
    // Le contenant le plus intérieur saisi (une boîte dans un tiroir dans un rack) : pas son parent
    e.stopPropagation();
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

/** Nom court d'une boîte dans un tiroir : « Boîte 3 » → « 3 ». */
const shortBox = (name) => name.replace(/^Boîte\s+/i, '');

/**
 * Façade d'un tiroir (dans un rack ou posé sur une étagère) : poignée, nom, ses boîtes en pastilles
 * (un clic ouvre la boîte, on les glisse d'un tiroir à l'autre) et son remplissage.
 */
function DrawerFront({ unit, tree, onOpen, onMoved }) {
  const drop = useUnitDrop(unit, tree, onMoved);
  const items = tree.children(unit.id);
  const t = tree.totals(unit.id);
  return (
    <div className={`drawer${drop.over ? ' is-drop' : ''}`} {...drop.props} {...dragProps(unit)}>
      <button type="button" className="drawer-front" onClick={() => onOpen(unit)} title={`${unit.name} : ${t.boxes} boîte(s), ${contentsText(t)}`}>
        <span className="drawer-handle" aria-hidden="true" />
        <span className="drawer-name">{unit.name}</span>
        <span className="box-tile-count">{t.boxes ? `${t.boxes} b.` : 'vide'}</span>
      </button>
      {items.length > 0 && (
        <div className="drawer-boxes">
          {items.map((b) => {
            const bt = tree.totals(b.id);
            return (
              <button key={b.id} type="button" className={`drawer-box${b.kind === 'bag' ? ' is-bag' : ''}`} style={{ '--box': boxColor(b), '--fill': bt.capacity ? bt.placed / bt.capacity : 0 }}
                onClick={() => onOpen(b)} {...dragProps(b)} title={`${b.name} : ${bt.tubes} tube(s)${bt.capacity ? ` sur ${bt.capacity}` : ''}`}>
                {shortBox(b.name)}
              </button>
            );
          })}
        </div>
      )}
      {t.capacity > 0 && <FillBar used={t.placed} capacity={t.capacity} label={false} />}
    </div>
  );
}

/** Rack (ou tour de cuve) : ses tiroirs ou ses boîtes empilés, comme dans la réalité. */
function RackColumn({ unit, tree, onOpen, onCreate, onMoved, parentKind }) {
  const drop = useUnitDrop(unit, tree, onMoved);
  const items = tree.children(unit.id);
  const hasDrawers = items.some((u) => u.kind === 'drawer');
  return (
    <div className={`rack${hasDrawers ? ' has-drawers' : ''}${drop.over ? ' is-drop' : ''}`} {...drop.props} {...dragProps(unit)}>
      <button type="button" className="rack-head" onClick={() => onOpen(unit)}>
        {kindLabel('rack', parentKind)} <strong>{unit.name.replace(/^(Rack|Tour)\s+/, '')}</strong>
      </button>
      <div className="rack-slots">
        {items.map((u) => {
          if (u.kind === 'drawer') return <DrawerFront key={u.id} unit={u} tree={tree} onOpen={onOpen} onMoved={onMoved} />;
          if (u.kind === 'box') return <BoxTile key={u.id} unit={u} tree={tree} onOpen={onOpen} compact />;
          return <BagTile key={u.id} unit={u} tree={tree} onOpen={onOpen} />;
        })}
        <span className="rack-add">
          {UNIT_KINDS[unit.kind]?.children.includes('drawer') && parentKind !== 'tank' && <AddTile small label="Tiroir" onClick={() => onCreate({ kind: 'drawer', parent: unit })} />}
          {!hasDrawers && <AddTile small label="Boîte" onClick={() => onCreate({ kind: 'box', parent: unit })} />}
        </span>
      </div>
    </div>
  );
}

function Items({ items, tree, onOpen, onCreate, onMoved, parent }) {
  return items.map((u) => {
    if (u.kind === 'rack') return <RackColumn key={u.id} unit={u} tree={tree} onOpen={onOpen} onCreate={onCreate} onMoved={onMoved} parentKind={parent.kind} />;
    if (u.kind === 'drawer') return <DrawerFront key={u.id} unit={u} tree={tree} onOpen={onOpen} onMoved={onMoved} />;
    if (u.kind === 'box') return <BoxTile key={u.id} unit={u} tree={tree} onOpen={onOpen} />;
    if (u.kind === 'bag') return <BagTile key={u.id} unit={u} tree={tree} onOpen={onOpen} />;
    return null;
  });
}

function AddButtons({ parent, onCreate, small = false, inTank = false }) {
  // Les tours d'une cuve d'azote n'ont pas de tiroirs
  const kinds = UNIT_KINDS[parent.kind].children.filter((k) => k !== 'shelf' && !(inTank && k === 'drawer'));
  return kinds.map((k) => <AddTile key={k} small={small} label={kindLabel(k, parent.kind)} onClick={() => onCreate({ kind: k, parent })} />);
}

/**
 * Étagère : une planche, et ce qui est posé dessus. Tiroir ouvert (vue d'un rack, d'un appareil à tiroirs) :
 * le même bandeau, ses boîtes en grand, et la façade avec sa poignée en bas.
 */
function ShelfBand({ shelf, tree, onOpen, onCreate, onEdit, onMoved }) {
  const drop = useUnitDrop(shelf, tree, onMoved);
  const items = tree.children(shelf.id);
  const t = tree.totals(shelf.id);
  const drawer = shelf.kind === 'drawer';
  return (
    <section className={`shelf-band${drawer ? ' is-drawer' : ''}${drop.over ? ' is-drop' : ''}`} {...drop.props} {...(drawer ? dragProps(shelf) : {})}>
      <header className="shelf-head">
        {drawer && <DrawerIcon size={15} aria-hidden="true" />}
        <button type="button" className="link-btn" onClick={() => onOpen(shelf)}>{shelf.name}</button>
        <span className="muted small">{t.boxes} boîte{t.boxes > 1 ? 's' : ''} · {contentsText(t)}</span>
        {t.capacity > 0 && drawer && <FillBar used={t.placed} capacity={t.capacity} />}
        <button type="button" className="icon-btn" onClick={() => onEdit(shelf)} aria-label={`Modifier ${shelf.name}`} title={drawer ? 'Modifier le tiroir' : 'Modifier l’étagère'}><Pencil size={13} /></button>
      </header>
      <div className="shelf-items">
        <Items items={items} tree={tree} onOpen={onOpen} onCreate={onCreate} onMoved={onMoved} parent={shelf} />
        {!items.length && <span className="shelf-empty">{drawer ? 'Tiroir vide' : 'Étagère vide'}</span>}
        <span className="shelf-add"><AddButtons parent={shelf} onCreate={onCreate} small /></span>
      </div>
      {drawer ? <div className="drawer-panel" aria-hidden="true"><span className="drawer-handle" /></div> : <div className="shelf-board" aria-hidden="true" />}
    </section>
  );
}

/** Racks de ce contenant (ou lui-même) dont les boîtes sont posées à même le rack, sans tiroir (hors cuve d'azote). */
function racksWithoutDrawers(tree, unit) {
  const out = [];
  const walk = (u, inTank) => {
    const tank = inTank || u.kind === 'tank';
    if (u.kind === 'rack' && !tank) {
      const kids = tree.children(u.id);
      if (kids.some((k) => k.kind === 'box' || k.kind === 'bag') && !kids.some((k) => k.kind === 'drawer')) out.push({ rack: u, boxes: kids.filter((k) => k.kind === 'box' || k.kind === 'bag').length });
    }
    for (const c of tree.children(u.id)) walk(c, tank);
  };
  walk(unit, unitInTank(tree, unit));
  return out;
}
const unitInTank = (tree, unit) => {
  for (let u = unit; u; u = tree.byId.get(u.parent_id)) if (u.kind === 'tank') return true;
  return false;
};

/** Mettre les boîtes des racks dans des tiroirs, d'un coup (un −80 saisi avant les tiroirs). */
function DrawerizeDialog({ unit, racks, onClose, onDone }) {
  const { notify } = useApp();
  const [per, setPer] = useState(4);
  const [busy, setBusy] = useState(false);
  const n = Math.max(1, Math.min(30, Math.trunc(Number(per)) || 1));
  const drawers = racks.reduce((sum, r) => sum + Math.ceil(r.boxes / n), 0);
  const boxes = racks.reduce((sum, r) => sum + r.boxes, 0);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(`/inventory/units/${unit.id}/drawers`, { per_drawer: n });
      notify(`${r.drawers} tiroir${r.drawers > 1 ? 's' : ''} créé${r.drawers > 1 ? 's' : ''} dans ${r.racks} rack${r.racks > 1 ? 's' : ''} ; ${r.boxes} boîte${r.boxes > 1 ? 's' : ''} rangée${r.boxes > 1 ? 's' : ''}.`, 'success');
      onDone();
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Ranger les boîtes dans des tiroirs"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="drawerize-form" className="btn btn-primary" disabled={busy}>Créer {drawers} tiroir{drawers > 1 ? 's' : ''}</button>
        </>
      )}
    >
      <form id="drawerize-form" className="form-stack" onSubmit={submit}>
        <p>
          {racks.length > 1 ? `${racks.length} racks ont` : 'Ce rack a'} des boîtes posées sans tiroir ({boxes} boîte{boxes > 1 ? 's' : ''}).
          Des tiroirs sont créés dans chaque rack et les boîtes y passent dans leur ordre actuel : les premières dans le tiroir 1, et ainsi de suite.
        </p>
        <label className="field field-inline">
          <span>Boîtes par tiroir</span>
          <input type="number" min="1" max="30" value={per} onChange={(e) => setPer(e.target.value)} autoFocus />
        </label>
        <ul className="drawerize-list">
          {racks.slice(0, 12).map((r) => (
            <li key={r.rack.id}>{r.rack.name} : {r.boxes} boîte{r.boxes > 1 ? 's' : ''} → {Math.ceil(r.boxes / n)} tiroir{Math.ceil(r.boxes / n) > 1 ? 's' : ''}</li>
          ))}
          {racks.length > 12 && <li className="muted">… et {racks.length - 12} autres racks</li>}
        </ul>
        <p className="hint">Les tubes restent dans leur boîte, à leur place ; seul le chemin change (… › Rack A › Tiroir 2 › Boîte 5). Ensuite, glissez une boîte d’un tiroir à l’autre si besoin.</p>
      </form>
    </Modal>
  );
}

/**
 * Intérieur d'une pièce (ses appareils), d'un appareil (étagères, racks ou tours, boîtes),
 * d'une étagère ou d'un rack. Les contenants se déplacent par glisser-déposer.
 */
export default function InteriorView({ unit, tree, onOpen, onCreate, onEdit, onMoved }) {
  const drop = useUnitDrop(unit, tree, onMoved);
  const [drawerize, setDrawerize] = useState(false);
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
          <span className="muted">{contentsText(t)}</span>
          <button type="button" className="btn btn-small" onClick={() => onEdit(unit)}><Pencil size={13} /> Modifier</button>
        </header>
        <ul className="appl-grid">
          {children.map((u) => <ApplianceCard key={u.id} unit={u} tree={tree} onOpen={onOpen} />)}
          <li><button type="button" className="appl-card appl-add" onClick={() => onCreate({ parent: unit })}><span className="appl-add-icon"><Plus size={26} /></span><span className="appl-name">Ajouter un appareil</span></button></li>
        </ul>
      </div>
    );
  }

  const bareRacks = UNIT_KINDS[unit.kind].children.length ? racksWithoutDrawers(tree, unit) : [];
  // Bandeaux : les étagères, et les tiroirs ouverts (ceux d'un rack, ou d'un appareil qui n'a que des tiroirs)
  const shelves = children.filter((c) => c.kind === 'shelf' || c.kind === 'drawer');
  const canisters = children.filter((c) => c.kind === 'canister');
  const loose = children.filter((c) => !shelves.includes(c) && c.kind !== 'canister');
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
          <span className="muted">{t.boxes} boîte{t.boxes > 1 ? 's' : ''} · {contentsText(t, canisters.length ? 'grille' : 'tube')}</span>
          {t.capacity > 0 && <FillBar used={t.placed} capacity={t.capacity} />}
          <button type="button" className="btn btn-small" onClick={() => onEdit(unit)}><Pencil size={13} /> Modifier</button>
        </header>
        {unit.notes && <p className="hint interior-notes">{unit.notes}</p>}
        {canisters.length > 0 && <DewarTop unit={unit} tree={tree} onOpen={onOpen} />}
        {(canisters.length === 0 || loose.length > 0) && (
        <div className={`interior-inside kind-${unit.kind}${drop.over ? ' is-drop' : ''}`} {...drop.props}>
          {shelves.map((s) => <ShelfBand key={s.id} shelf={s} tree={tree} onOpen={onOpen} onCreate={onCreate} onEdit={onEdit} onMoved={onMoved} />)}
          {(loose.length > 0 || !shelves.length) && (
            <section className={`shelf-band is-loose kind-${unit.kind}`}>
              {shelves.length > 0 && <header className="shelf-head"><span className="muted small">{shelves.some((c) => c.kind === 'shelf') ? 'Sans étagère' : 'Hors des tiroirs'}</span></header>}
              <div className="shelf-items">
                <Items items={loose} tree={tree} onOpen={onOpen} onCreate={onCreate} onMoved={onMoved} parent={unit} />
                {!children.length && <span className="shelf-empty">Rien pour l’instant : ajoutez de quoi ranger.</span>}
              </div>
            </section>
          )}
        </div>
        )}
        <div className="interior-add">
          {UNIT_KINDS[unit.kind].children.includes('shelf') && <AddTile label="Étagère" onClick={() => onCreate({ kind: 'shelf', parent: unit })} />}
          <AddButtons parent={unit} onCreate={onCreate} inTank={applianceOf?.kind === 'tank'} />
          {bareRacks.length > 0 && (
            <button type="button" className="add-tile" onClick={() => setDrawerize(true)} title="Crée des tiroirs dans les racks et y range leurs boîtes">
              <DrawerIcon size={16} aria-hidden="true" /> Ranger les boîtes des racks dans des tiroirs…
            </button>
          )}
          <span className="hint">{canisters.length ? 'Cliquez un canister pour voir ses pucks.' : 'Glissez une boîte, un tiroir ou un rack pour le changer de place.'}</span>
        </div>
      </div>
      {drawerize && <DrawerizeDialog unit={unit} racks={bareRacks} onClose={() => setDrawerize(false)} onDone={() => { setDrawerize(false); onMoved(); }} />}
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
