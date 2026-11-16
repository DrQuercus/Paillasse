import { useMemo, useState } from 'react';
import { Search, ShoppingBag } from 'lucide-react';
import { CAP_HEX, decodeCell, freePositions, isAppliance, positionLabel, unitLabel, unitPath } from '../../lib/inventory.js';
import Modal from '../Modal.jsx';
import { TempChip, boxColor } from './bits.jsx';
import { GridboxBody } from './cryo.jsx';

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Places occupées d'une boîte d'après sa mini-carte, sans compter les tubes qu'on déplace. */
export function occupiedOf(box, moving = []) {
  const set = new Set();
  const map = box.map ?? '';
  for (let i = 0; i < map.length; i += 1) if (map[i] !== '.') set.add(`${Math.floor(i / box.cols)},${i % box.cols}`);
  for (const s of moving) if (s.unit_id === box.id && s.row != null) set.delete(`${s.row},${s.col}`);
  return set;
}

/**
 * Choisir une boîte (ou un sac) et la place de départ : déplacer des tubes, ou savoir où en ranger.
 * onPick(box, positions) ; positions = null pour un sac.
 */
export default function BoxPicker({ tree, title, need = 1, moving = [], confirmLabel = 'Choisir', kinds = ['box', 'bag', 'gridbox'], onPick, onClose }) {
  const [q, setQ] = useState('');
  const [box, setBox] = useState(null);
  const [start, setStart] = useState(null);

  // Boîtes et sacs, rangés par appareil
  const groups = useMemo(() => {
    const out = [];
    for (const u of tree.byId.values()) {
      if (!kinds.includes(u.kind)) continue;
      const path = unitPath(tree.byId, u.id);
      const appliance = path.find(isAppliance);
      const inside = path.slice(path.indexOf(appliance) + 1).map(unitLabel).join(' › ');
      if (q && !fold(`${path.map(unitLabel).join(' ')}`).includes(fold(q))) continue;
      const free = u.kind === 'bag' ? Infinity : u.rows * u.cols - occupiedOf(u, moving).size;
      const key = appliance?.id ?? '';
      let g = out.find((x) => x.key === key);
      if (!g) { g = { key, appliance, items: [] }; out.push(g); }
      g.items.push({ unit: u, inside, free });
    }
    for (const g of out) g.items.sort((a, b) => a.inside.localeCompare(b.inside, 'fr', { numeric: true }));
    return out;
  }, [tree, q, moving, kinds]);

  const occupied = box && box.kind !== 'bag' ? occupiedOf(box, moving) : new Set();
  const positions = box && box.kind !== 'bag' ? freePositions(box, occupied, need, start ?? undefined) : null;
  const enough = box && (box.kind === 'bag' || positions.length >= need);

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide
      footer={(
        <>
          <span className="modal-foot-note">
            {box ? (box.kind === 'bag' ? `Dans « ${box.name} »` : enough ? `${need} place${need > 1 ? 's' : ''} : ${positions.map((p) => positionLabel(box, p.row, p.col)).join(', ')}` : `Pas assez de places libres (${positions.length} pour ${need}).`) : 'Choisissez une boîte.'}
          </span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" disabled={!enough} onClick={() => onPick(box, positions)}>{confirmLabel}</button>
        </>
      )}
    >
      <div className="picker-layout">
        <div className="picker-col">
          <label className="st-search picker-q"><Search size={15} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Appareil, étagère, boîte…" aria-label="Chercher une boîte" autoFocus /></label>
          <div className="picker-scroll">
            {groups.length === 0 && <p className="muted small">Aucune boîte : créez-en une dans un appareil.</p>}
            {groups.map((g) => (
              <section key={g.key} className="picker-group">
                <h3>{g.appliance ? <>{g.appliance.name} <TempChip unit={g.appliance} small /></> : 'Hors appareil'}</h3>
                <ul>
                  {g.items.map(({ unit, inside, free }) => (
                    <li key={unit.id}>
                      <button type="button" className={`picker-box${box?.id === unit.id ? ' is-selected' : ''}`} onClick={() => { setBox(unit); setStart(null); }} disabled={free < 1}>
                        {unit.kind === 'bag' ? <ShoppingBag size={14} aria-hidden="true" /> : <span className="picker-swatch" style={{ background: boxColor(unit) }} />}
                        <span className="picker-box-name">{inside || unitLabel(unit)}</span>
                        <span className="muted small">{unit.kind === 'bag' ? 'sac' : `${free} libre${free > 1 ? 's' : ''}`}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
        <div className="picker-col picker-preview">
          {box?.kind === 'gridbox' && (
            <>
              <p className="small muted">Cliquez la première position voulue.</p>
              <GridboxBody format={box.format} color={boxColor(box)} map={box.map ?? ''} marks={positions?.map((p) => p.col) ?? []} inside size={190} className="pick-gbox" />
              <div className="pick-row" style={{ '--box': boxColor(box) }}>
                {Array.from({ length: box.cols }, (_, c) => {
                  const taken = occupied.has(`0,${c}`);
                  const chosen = positions?.some((p) => p.col === c);
                  return (
                    <button key={c} type="button" className={`pick-slot${taken ? ' is-taken' : ''}${chosen ? ' is-chosen' : ''}`} disabled={taken} onClick={() => setStart({ row: 0, col: c })}>
                      {positionLabel(box, 0, c)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {box?.kind === 'box' && (
            <>
              <p className="small muted">Cliquez la première place voulue ; les suivantes suivent l’ordre de lecture.</p>
              <div className="pick-grid" style={{ gridTemplateColumns: `1.2rem repeat(${box.cols}, 1fr)`, '--box': boxColor(box) }}>
                <span />
                {Array.from({ length: box.cols }, (_, c) => <span key={c} className="pick-h">{c + 1}</span>)}
                {Array.from({ length: box.rows }, (_, r) => [
                  <span key={`h${r}`} className="pick-h">{String.fromCharCode(65 + r)}</span>,
                  ...Array.from({ length: box.cols }, (__, c) => {
                    const cell = occupied.has(`${r},${c}`) ? decodeCell(box.map?.[r * box.cols + c]) : null;
                    const chosen = positions?.some((p) => p.row === r && p.col === c);
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        className={`pick-cell${cell ? ' is-taken' : ''}${chosen ? ' is-chosen' : ''}`}
                        style={cell ? { '--cap': CAP_HEX[cell.color] } : undefined}
                        disabled={Boolean(cell)}
                        onClick={() => setStart({ row: r, col: c })}
                        aria-label={`${positionLabel(box, r, c)}${cell ? ' occupée' : ' libre'}`}
                      />
                    );
                  }),
                ])}
              </div>
            </>
          )}
          {box?.kind === 'bag' && <p className="muted">Un sac n’a pas de positions : les tubes y sont simplement ajoutés.</p>}
          {!box && <p className="muted picker-empty">← Choisissez une boîte pour voir ses places.</p>}
        </div>
      </div>
    </Modal>
  );
}
