import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpFromLine, ClipboardPaste, Info, Pencil, PackagePlus, Printer, ShoppingBag,
} from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { SAMPLE_TYPES, freePositions, posLabel, rowLetter } from '../../lib/inventory.js';
import BoxPicker from './BoxPicker.jsx';
import PasteDialog from './PasteDialog.jsx';
import SampleForm from './SampleForm.jsx';
import { BulkPanel, SamplePanel } from './SamplePanel.jsx';
import { Cap, FillBar, TYPE_SHORT, TypeIcon, boxColor } from './bits.jsx';

// Tube en cours de glissement (dataTransfer n'est pas lisible pendant le survol)
let draggedSample = null;

const MESSAGES = {
  out: (n) => `${n > 1 ? `${n} tubes sortis` : 'Tube sorti'} : ${n > 1 ? 'leurs places les attendent' : 'sa place l’attend'}.`,
  back: (n) => (n > 1 ? `${n} tubes remis au froid.` : 'Tube remis au froid.'),
  thaw: () => 'Décongélation comptée.',
  discard: (n) => (n > 1 ? `${n} tubes retirés : leurs places sont libres.` : 'Tube retiré : sa place est libre.'),
  color: () => 'Bouchons recolorés.',
};

/** Infos de la boîte quand rien n'est choisi : remplissage, légende (qui filtre), mode d'emploi. */
function BoxSummary({ unit, samples, free, typeFilter, onType }) {
  const byType = Object.keys(SAMPLE_TYPES).map((t) => [t, samples.filter((s) => s.type === t)]).filter(([, l]) => l.length);
  const out = samples.filter((s) => s.status === 'out');
  return (
    <div className="box-summary">
      {unit.kind === 'box' && (
        <p className="box-fill">
          <strong>{samples.length}</strong> / {unit.rows * unit.cols} places occupées
          <FillBar used={samples.length} capacity={unit.rows * unit.cols} />
        </p>
      )}
      {out.length > 0 && <p className="out-note"><ArrowUpFromLine size={14} aria-hidden="true" /> {out.length} tube{out.length > 1 ? 's' : ''} hors du froid (cercle en pointillé).</p>}
      {byType.length > 0 && (
        <div className="legend" role="group" aria-label="Filtrer par type">
          {byType.map(([t, list]) => (
            <button key={t} type="button" className={`legend-item${typeFilter === t ? ' is-active' : ''}`} aria-pressed={typeFilter === t} onClick={() => onType(typeFilter === t ? '' : t)}>
              <Cap sample={list[0]} size={14} /> <TypeIcon type={t} size={12} /> {TYPE_SHORT[t]} <span className="muted">{list.length}</span>
            </button>
          ))}
        </div>
      )}
      <ul className="box-tips">
        <li><strong>Case vide</strong> : ranger un ou plusieurs tubes.</li>
        <li><strong>Tube</strong> : sa fiche ; <strong>glissez-le</strong> pour le déplacer (sur un autre tube : échange).</li>
        <li><strong>Ctrl+clic</strong>, <strong>Maj+clic</strong> : plusieurs tubes d’un coup.</li>
        {unit.kind === 'box' && <li>Le <strong>coin coupé</strong> de la boîte, c’est A1.</li>}
      </ul>
      {free === 0 && <p className="out-note">Boîte pleine : il est temps d’en ouvrir une autre.</p>}
    </div>
  );
}

/**
 * Une boîte (grille de positions) ou un sac, et le panneau du tube choisi.
 * focus : tube à montrer (recherche « Où est… ? »).
 */
export default function BoxView({ unit, tree, focus, onChanged, onEditUnit }) {
  const { notify } = useApp();
  const grid = unit.kind === 'box';
  const [samples, setSamples] = useState(null);
  const [sel, setSel] = useState([]);
  const [anchor, setAnchor] = useState(null);
  const [cell, setCell] = useState(null);
  const [mode, setMode] = useState(null); // { kind: 'add' | 'edit' | 'more', sample? }
  const [ghost, setGhost] = useState([]);
  const [picker, setPicker] = useState(null);
  const [pasting, setPasting] = useState(false);
  const [found, setFound] = useState(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [dropAt, setDropAt] = useState(null);
  const [landed, setLanded] = useState(new Set());
  const [panelVersion, setPanelVersion] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
  const [cellSize, setCellSize] = useState(46);
  const cellRefs = useRef(new Map());
  const wrap = useRef(null);

  const load = useCallback(() => api.get(`/inventory/units/${unit.id}`).then((d) => { setSamples(d.samples); return d.samples; }), [unit.id]);
  useEffect(() => { load().catch((err) => notify(err.message, 'error')); }, [load, notify]);

  const at = useMemo(() => new Map((samples ?? []).filter((s) => s.row != null).map((s) => [`${s.row},${s.col}`, s])), [samples]);
  const occupied = useMemo(() => new Set(at.keys()), [at]);
  const free = grid ? unit.rows * unit.cols - occupied.size : Infinity;
  const selected = (samples ?? []).filter((s) => sel.includes(s.id));
  const ghostAt = new Map(ghost.map((p, i) => [`${p.row},${p.col}`, i + 1]));

  // Taille des cases : la boîte remplit la place disponible
  useLayoutEffect(() => {
    if (!grid || !wrap.current) return undefined;
    const fit = () => {
      const w = wrap.current?.clientWidth ?? 600;
      setCellSize(Math.max(26, Math.min(60, Math.floor((w - 64) / unit.cols))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [grid, unit.cols, samples === null]);

  // Tube cherché : sélectionné, montré, et qui clignote quelques secondes
  useEffect(() => {
    if (!samples || !focus) return undefined;
    const s = samples.find((x) => x.id === focus);
    if (!s) return undefined;
    setSel([s.id]);
    setMode(null);
    setCell(null);
    setFound(s.id);
    requestAnimationFrame(() => cellRefs.current.get(s.row != null ? `${s.row},${s.col}` : s.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    const t = setTimeout(() => setFound(null), 5000);
    return () => clearTimeout(t);
  }, [samples, focus]);

  const refresh = async () => {
    await load();
    onChanged();
    setPanelVersion((v) => v + 1);
  };

  const action = async (ids, act, extra = {}) => {
    try {
      await api.post('/inventory/samples/action', { ids, action: act, ...extra });
      if (act === 'discard') setSel([]);
      await refresh();
      notify(MESSAGES[act]?.(ids.length) ?? 'C’est fait.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const move = async (moves, message) => {
    try {
      await api.post('/inventory/samples/move', { moves });
      await refresh();
      if (message) notify(message, 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const clickTube = (s, e) => {
    setMode(null);
    setCell(null);
    if (e.ctrlKey || e.metaKey) {
      setSel((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]));
    } else if (e.shiftKey && anchor) {
      const key = (x) => (x.row ?? 0) * (unit.cols ?? 1) + (x.col ?? 0);
      const [lo, hi] = [key(anchor), key(s)].sort((a, b) => a - b);
      setSel((samples ?? []).filter((x) => key(x) >= lo && key(x) <= hi).map((x) => x.id));
    } else {
      setSel([s.id]);
    }
    setAnchor(s);
  };

  const clickFree = (row, col) => {
    setSel([]);
    setCell({ row, col });
    setMode({ kind: 'add' });
  };

  const startAdd = (from = null) => {
    const first = grid ? freePositions(unit, occupied, 1)[0] : null;
    if (grid && !first) { notify('Boîte pleine.', 'error'); return; }
    setSel([]);
    setCell(grid ? first : null);
    setMode(from ? { kind: 'more', sample: from } : { kind: 'add' });
  };

  const create = async (fields, count) => {
    try {
      const made = await api.post('/inventory/samples', { unit_id: unit.id, sample: fields, count, start: cell ?? undefined });
      setLanded(new Set(made.map((m) => m.id)));
      setTimeout(() => setLanded(new Set()), 1200);
      setMode(null);
      setCell(null);
      setGhost([]);
      setSel(made.length === 1 ? [made[0].id] : []);
      await refresh();
      notify(`${made.length > 1 ? `${made.length} tubes rangés` : 'Tube rangé'}${grid ? ` : ${made.map((m) => posLabel(m.row, m.col)).join(', ')}` : ''}.`, 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const save = async (fields) => {
    try {
      await api.put(`/inventory/samples/${mode.sample.id}`, fields);
      setMode(null);
      await refresh();
      notify('Tube modifié.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const onPreview = (n) => setGhost(grid && n > 0 && cell ? freePositions(unit, occupied, n, cell) : []);

  // Glisser-déposer d'un tube : sur une case libre, il y va ; sur un autre tube, ils s'échangent
  const drop = (row, col) => {
    setDropAt(null);
    const s = (samples ?? []).find((x) => x.id === draggedSample);
    draggedSample = null;
    if (!s || (s.row === row && s.col === col)) return;
    const other = at.get(`${row},${col}`);
    const moves = [{ id: s.id, unit_id: unit.id, row, col }];
    if (other) moves.push({ id: other.id, unit_id: unit.id, row: s.row, col: s.col });
    move(moves, other ? `${posLabel(s.row, s.col)} ⇄ ${posLabel(row, col)} : tubes échangés.` : `${s.name} : ${posLabel(s.row, s.col)} → ${posLabel(row, col)}.`);
    setSel([s.id]);
  };

  const onKey = (e, idx) => {
    const { rows, cols } = unit;
    const moves = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols };
    if (moves[e.key]) {
      e.preventDefault();
      const next = Math.max(0, Math.min(rows * cols - 1, idx + moves[e.key]));
      setFocusIdx(next);
      cellRefs.current.get(`${Math.floor(next / cols)},${next % cols}`)?.focus();
    } else if (e.key === 'Escape') {
      setSel([]);
      setMode(null);
      setCell(null);
    }
  };

  if (!samples) return <div className="box-view" aria-busy="true" />;

  const tubeTitle = (s) => [
    `${posLabel(s.row, s.col)} · ${s.name} (${s.code})`,
    SAMPLE_TYPES[s.type]?.label,
    [s.concentration, s.volume].filter(Boolean).join(' · '),
    s.status === 'out' ? 'Hors du froid' : '',
  ].filter(Boolean).join('\n');

  const renderCell = (r, c) => {
    const key = `${r},${c}`;
    const s = at.get(key);
    const idx = r * unit.cols + c;
    const g = ghostAt.get(key);
    const cls = [
      'cell',
      s ? 'has-tube' : 'is-free',
      s && sel.includes(s.id) ? 'is-selected' : '',
      s && found === s.id ? 'is-found' : '',
      s && landed.has(s.id) ? 'is-landed' : '',
      s && typeFilter && s.type !== typeFilter ? 'is-dim' : '',
      !s && cell?.row === r && cell?.col === c ? 'is-target' : '',
      g ? 'is-ghost' : '',
      dropAt === key ? 'is-drop' : '',
    ].filter(Boolean).join(' ');
    return (
      <button
        key={key}
        ref={(el) => { if (el) cellRefs.current.set(key, el); else cellRefs.current.delete(key); }}
        type="button"
        className={cls}
        tabIndex={idx === focusIdx ? 0 : -1}
        onFocus={() => setFocusIdx(idx)}
        onKeyDown={(e) => onKey(e, idx)}
        onClick={(e) => (s ? clickTube(s, e) : clickFree(r, c))}
        draggable={Boolean(s)}
        onDragStart={s ? (e) => { draggedSample = s.id; e.dataTransfer.setData('text/plain', s.code); e.dataTransfer.effectAllowed = 'move'; } : undefined}
        onDragEnd={() => { draggedSample = null; setDropAt(null); }}
        onDragOver={(e) => { if (draggedSample) { e.preventDefault(); if (dropAt !== key) setDropAt(key); } }}
        onDragLeave={() => { if (dropAt === key) setDropAt(null); }}
        onDrop={(e) => { e.preventDefault(); drop(r, c); }}
        aria-label={s ? `${posLabel(r, c)} : ${s.name}, ${s.code}${s.status === 'out' ? ', hors du froid' : ''}` : `${posLabel(r, c)} : libre`}
        aria-pressed={s ? sel.includes(s.id) : undefined}
        title={s ? tubeTitle(s) : `${posLabel(r, c)} : libre, cliquer pour ranger ici`}
      >
        {s ? <Cap sample={s} label={cellSize >= 34} className={s.status === 'out' ? 'is-out' : ''} size="82%" /> : g ? <span className="ghost-cap">{g}</span> : <span className="hole" />}
      </button>
    );
  };

  let panel;
  if (mode?.kind === 'add' || mode?.kind === 'more') {
    const base = mode.sample ? {
      name: mode.sample.name, type: mode.sample.type, cap_color: mode.sample.cap_color, concentration: mode.sample.concentration,
      volume: mode.sample.volume, project_id: mode.sample.project_id ?? '', sequence_id: mode.sample.sequence_id ?? '', notes: mode.sample.notes,
    } : {};
    panel = (
      <div className="sample-card">
        <h3 className="panel-title"><PackagePlus size={17} aria-hidden="true" /> {grid ? `Ranger à partir de ${posLabel(cell?.row, cell?.col)}` : `Ranger dans « ${unit.name} »`}</h3>
        <SampleForm key={`${mode.kind}-${cell?.row}-${cell?.col}`} create initial={base} start={cell} free={free} bag={!grid} onPreview={onPreview} onSubmit={create} onCancel={() => { setMode(null); setCell(null); setGhost([]); }} />
      </div>
    );
  } else if (mode?.kind === 'edit') {
    panel = (
      <div className="sample-card">
        <h3 className="panel-title"><Pencil size={16} aria-hidden="true" /> Modifier {mode.sample.code}</h3>
        <SampleForm key={mode.sample.id} initial={{ ...mode.sample, project_id: mode.sample.project_id ?? '', sequence_id: mode.sample.sequence_id ?? '', expires_on: mode.sample.expires_on ?? '', frozen_on: mode.sample.frozen_on ?? '' }} onSubmit={save} onCancel={() => setMode(null)} />
      </div>
    );
  } else if (selected.length === 1) {
    panel = (
      <SamplePanel
        sampleId={selected[0].id}
        version={panelVersion}
        onAction={action}
        onEdit={(s) => setMode({ kind: 'edit', sample: s })}
        onMove={(ids) => setPicker({ ids })}
        onMore={(s) => startAdd(s)}
        onClose={() => setSel([])}
      />
    );
  } else if (selected.length > 1) {
    panel = <BulkPanel samples={selected} onAction={action} onMove={(ids) => setPicker({ ids })} onClear={() => setSel([])} />;
  } else {
    panel = <BoxSummary unit={unit} samples={samples} free={free} typeFilter={typeFilter} onType={setTypeFilter} />;
  }

  const moving = (samples ?? []).filter((s) => picker?.ids.includes(s.id));

  return (
    <div className="box-view">
      <div className="box-main" ref={wrap}>
        <header className="box-head">
          <h2>{grid ? null : <ShoppingBag size={20} aria-hidden="true" />} {unit.name}</h2>
          <span className="muted">{grid ? `${unit.rows} × ${unit.cols} · ${free} place${free > 1 ? 's' : ''} libre${free > 1 ? 's' : ''}` : `${samples.length} tube${samples.length > 1 ? 's' : ''}`}</span>
          <span className="box-actions">
            <button type="button" className="btn btn-small btn-primary" onClick={() => startAdd()} disabled={grid && !free}><PackagePlus size={14} /> Ranger des tubes</button>
            {grid && <button type="button" className="btn btn-small" onClick={() => setPasting(true)}><ClipboardPaste size={14} /> Coller depuis Excel</button>}
            <a className="btn btn-small" href={`/api/inventory/units/${unit.id}/print`} target="_blank" rel="noreferrer"><Printer size={14} /> Plan à imprimer</a>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => onEditUnit(unit)}><Pencil size={14} /> {grid ? 'Boîte' : 'Sac'}</button>
          </span>
        </header>
        {grid ? (
          <div className="cbox-wrap">
            <div className="cbox" style={{ '--box': boxColor(unit), '--cell': `${cellSize}px` }} role="group" aria-label={`Boîte ${unit.name}, ${unit.rows} lignes et ${unit.cols} colonnes, A1 en haut à gauche`}>
              <div className="cbox-grid" style={{ gridTemplateColumns: `1.3rem repeat(${unit.cols}, var(--cell))` }}>
                <span className="cbox-corner" title="Coin coupé : A1" />
                {Array.from({ length: unit.cols }, (_, c) => <span key={`c${c}`} className="cbox-h">{c + 1}</span>)}
                {Array.from({ length: unit.rows }, (_, r) => [
                  <span key={`r${r}`} className="cbox-h">{rowLetter(r)}</span>,
                  ...Array.from({ length: unit.cols }, (__, c) => renderCell(r, c)),
                ])}
              </div>
            </div>
          </div>
        ) : (
          <div className="sack">
            {samples.length === 0 && <p className="muted">Sac vide.</p>}
            <ul className="sack-list">
              {samples.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    ref={(el) => { if (el) cellRefs.current.set(s.id, el); }}
                    className={`sack-tube${sel.includes(s.id) ? ' is-selected' : ''}${found === s.id ? ' is-found' : ''}${landed.has(s.id) ? ' is-landed' : ''}`}
                    onClick={(e) => clickTube(s, e)}
                  >
                    <Cap sample={s} size={22} className={s.status === 'out' ? 'is-out' : ''} />
                    <span>{s.name}</span>
                    <span className="muted small">{s.code}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {samples.length > 0 && (
          <details className="box-list">
            <summary><Info size={14} aria-hidden="true" /> Liste des {samples.length} tubes</summary>
            <table className="seq-table">
              <thead><tr><th>Place</th><th>Code</th><th>Nom</th><th>Type</th><th>Conc. · volume</th><th>Congelé le</th></tr></thead>
              <tbody>
                {samples.map((s) => (
                  <tr key={s.id} className={sel.includes(s.id) ? 'is-selected' : ''} onClick={(e) => clickTube(s, e)}>
                    <td>{s.position || '—'}</td><td>{s.code}</td><td><Cap sample={s} size={12} /> {s.name}</td><td>{TYPE_SHORT[s.type]}</td>
                    <td>{[s.concentration, s.volume].filter(Boolean).join(' · ')}</td><td>{s.frozen_on ? new Date(`${s.frozen_on}T12:00:00`).toLocaleDateString('fr-FR') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
      <aside className="box-side">{panel}</aside>
      {picker && (
        <BoxPicker
          tree={tree}
          title={`Déplacer ${picker.ids.length > 1 ? `${picker.ids.length} tubes` : `« ${moving[0]?.name ?? ''} »`}`}
          need={picker.ids.length}
          moving={moving}
          confirmLabel="Déplacer ici"
          onClose={() => setPicker(null)}
          onPick={async (box, positions) => {
            const moves = moving.map((s, i) => ({ id: s.id, unit_id: box.id, row: positions?.[i]?.row ?? null, col: positions?.[i]?.col ?? null }));
            setPicker(null);
            await move(moves, `${moves.length > 1 ? `${moves.length} tubes déplacés` : 'Tube déplacé'} vers « ${box.name} »${positions ? ` (${positions.map((p) => posLabel(p.row, p.col)).join(', ')})` : ''}.`);
            if (box.id !== unit.id) setSel([]);
          }}
        />
      )}
      {pasting && <PasteDialog box={unit} samples={samples} onClose={() => setPasting(false)} onDone={async () => { setPasting(false); await refresh(); }} />}
    </div>
  );
}
