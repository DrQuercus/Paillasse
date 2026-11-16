import { memo, useCallback, useRef } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { KINDS, newId, parseClipboard } from '../../lib/stats/model.js';

/** Une ligne vide en fin de tableau, pour saisir la suite ; au moins cinq lignes. */
export function withTrailing(ds) {
  const reps = KINDS[ds.kind].replicates ? ds.replicates : 1;
  const empty = (r) => !String(r.x ?? '').trim() && !String(r.label ?? '').trim()
    && ds.columns.every((c) => (r.v?.[c.id] ?? []).every((s) => !String(s ?? '').trim()));
  const rows = [...ds.rows];
  const blank = () => ({ id: newId(), x: '', label: '', v: Object.fromEntries(ds.columns.map((c) => [c.id, new Array(reps).fill('')])) });
  if (!rows.length || !empty(rows.at(-1))) rows.push(blank());
  while (rows.length < 5) rows.push(blank());
  return rows.length === ds.rows.length ? ds : { ...ds, rows };
}

const setAt = (arr, j, value, reps) => {
  const out = Array.from({ length: Math.max(reps, arr?.length ?? 0) }, (_, k) => arr?.[k] ?? '');
  out[j] = value;
  return out;
};

/** Collage d'un bloc de cellules (Excel, LibreOffice) à partir de la cellule (ligne r0, colonne plate f0). */
export function pasteAt(ds, r0, f0, grid) {
  const k = KINDS[ds.kind];
  const reps = k.replicates ? ds.replicates : 1;
  const lead = k.x || k.labels ? 1 : 0;
  const width = Math.max(0, ...grid.map((r) => r.length));
  const neededCols = Math.ceil((f0 + width - lead) / reps);
  const columns = [...ds.columns];
  while (columns.length < neededCols) columns.push({ id: newId(), name: `${k.columnWord} ${String.fromCharCode(65 + (columns.length % 26))}` });
  const rows = [...ds.rows];
  while (rows.length < r0 + grid.length) rows.push({ id: newId(), x: '', label: '', v: {} });
  grid.forEach((cells, i) => {
    const r = { ...rows[r0 + i], v: { ...rows[r0 + i].v } };
    cells.forEach((value, j) => {
      const f = f0 + j;
      if (lead && f === 0) {
        if (k.x) r.x = value; else r.label = value;
        return;
      }
      const ci = Math.floor((f - lead) / reps);
      const rep = (f - lead) % reps;
      const col = columns[ci];
      r.v[col.id] = setAt(r.v[col.id], rep, value, reps);
    });
    rows[r0 + i] = r;
  });
  return withTrailing({ ...ds, columns, rows });
}

const Row = memo(function Row({ row, index, columns, reps, lead, kind, onCell, onLead, onPaste, onKey, onDelete }) {
  // Survie : un sujet par ligne, l'aide « 1 / 0 » n'apparaît que sur les lignes vides
  const rowEmpty = kind === 'survival' && !columns.some((c) => (row.v?.[c.id] ?? []).some((v) => v !== '' && v != null));
  return (
    <tr>
      <th className="sg-rowhead" scope="row">
        <span>{index + 1}</span>
        <button type="button" className="sg-del" onClick={() => onDelete(row.id)} tabIndex={-1} aria-label={`Supprimer la ligne ${index + 1}`}><X size={12} /></button>
      </th>
      {lead && (
        <td className="sg-lead">
          <input
            value={lead === 'x' ? row.x ?? '' : row.label ?? ''}
            onChange={(e) => onLead(row.id, e.target.value)}
            onPaste={(e) => onPaste(e, index, 0)}
            onKeyDown={(e) => onKey(e, index, 0)}
            data-r={index}
            data-f={0}
            aria-label={`${lead === 'x' ? 'X' : 'Libellé'}, ligne ${index + 1}`}
            inputMode={lead === 'x' ? 'decimal' : 'text'}
          />
        </td>
      )}
      {columns.map((c, ci) => Array.from({ length: reps }, (_, j) => {
        const f = (lead ? 1 : 0) + ci * reps + j;
        return (
          <td key={`${c.id}-${j}`} className={j === reps - 1 ? 'sg-last' : ''}>
            <input
              value={row.v?.[c.id]?.[j] ?? ''}
              onChange={(e) => onCell(row.id, c.id, j, e.target.value)}
              onPaste={(e) => onPaste(e, index, f)}
              onKeyDown={(e) => onKey(e, index, f)}
              data-r={index}
              data-f={f}
              inputMode="decimal"
              placeholder={kind === 'survival' && rowEmpty ? '1 / 0' : ''}
              aria-label={`${c.name}${reps > 1 ? ` (${j + 1})` : ''}, ligne ${index + 1}`}
            />
          </td>
        );
      }))}
      <td className="sg-pad" />
    </tr>
  );
});

/**
 * Tableur de saisie : une colonne par groupe (ou série, avec ses réplicats), X ou libellé en tête de
 * ligne. Collage depuis Excel à partir de n'importe quelle cellule ; Entrée ou flèches pour changer de ligne.
 */
export default function DataGrid({ ds, update }) {
  const k = KINDS[ds.kind];
  const reps = k.replicates ? ds.replicates : 1;
  const lead = k.x ? 'x' : k.labels ? 'label' : null;
  const table = useRef(null);

  const onCell = useCallback((rowId, colId, j, value) => update((d) => withTrailing({
    ...d, rows: d.rows.map((r) => (r.id === rowId ? { ...r, v: { ...r.v, [colId]: setAt(r.v?.[colId], j, value, KINDS[d.kind].replicates ? d.replicates : 1) } } : r)),
  }), { key: `cell-${rowId}-${colId}-${j}` }), [update]);
  const onLead = useCallback((rowId, value) => update((d) => withTrailing({
    ...d, rows: d.rows.map((r) => (r.id === rowId ? { ...r, [KINDS[d.kind].x ? 'x' : 'label']: value } : r)),
  }), { key: `lead-${rowId}` }), [update]);
  const onPaste = useCallback((e, r0, f0) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n;]/.test(text.trim())) return; // une seule valeur : collage ordinaire
    e.preventDefault();
    update((d) => pasteAt(d, r0, f0, parseClipboard(text)));
  }, [update]);
  const onKey = useCallback((e, r, f) => {
    let next = null;
    if (e.key === 'Enter' || e.key === 'ArrowDown') next = [r + 1, f];
    else if (e.key === 'ArrowUp') next = [r - 1, f];
    if (!next) return;
    const el = table.current?.querySelector(`input[data-r="${next[0]}"][data-f="${next[1]}"]`);
    if (el) { e.preventDefault(); el.focus(); el.select(); }
  }, []);
  const onDelete = useCallback((rowId) => update((d) => withTrailing({ ...d, rows: d.rows.filter((r) => r.id !== rowId) })), [update]);
  const renameColumn = (id, name) => update((d) => ({ ...d, columns: d.columns.map((c) => (c.id === id ? { ...c, name } : c)) }), { key: `col-${id}` });
  const removeColumn = (id) => update((d) => ({ ...d, columns: d.columns.filter((c) => c.id !== id) }));
  const addColumn = () => update((d) => ({ ...d, columns: [...d.columns, { id: newId(), name: `${k.columnWord} ${String.fromCharCode(65 + (d.columns.length % 26))}` }] }));

  return (
    <div className="sg-wrap">
      <table className="sg" ref={table}>
        <thead>
          <tr>
            <th className="sg-corner" rowSpan={reps > 1 ? 2 : 1} />
            {lead && (
              <th className="sg-lead" rowSpan={reps > 1 ? 2 : 1}>
                {lead === 'x'
                  ? <input value={ds.xTitle ?? ''} onChange={(e) => update((d) => ({ ...d, xTitle: e.target.value }), { key: 'xTitle' })} placeholder="X" aria-label="Titre de X" style={{ minWidth: `${Math.min(20, Math.max(6, (ds.xTitle ?? '').length + 1))}ch` }} />
                  : <span className="muted small">{ds.kind === 'contingency' ? 'Groupe' : 'Ligne'}</span>}
              </th>
            )}
            {ds.columns.map((c) => (
              <th key={c.id} colSpan={reps} className="sg-col">
                <div className="sg-colhead">
                  <input value={c.name} onChange={(e) => renameColumn(c.id, e.target.value)} aria-label="Nom de la colonne" style={{ minWidth: `${Math.min(18, Math.max(4, c.name.length + 1))}ch` }} />
                  {ds.columns.length > 1 && <button type="button" className="icon-btn" onClick={() => removeColumn(c.id)} aria-label={`Supprimer la colonne ${c.name}`} title="Supprimer la colonne"><Trash2 size={13} /></button>}
                </div>
              </th>
            ))}
            <th className="sg-pad" rowSpan={reps > 1 ? 2 : 1}>
              <button type="button" className="icon-btn" onClick={addColumn} title={`Ajouter une colonne (${k.columnWord.toLowerCase()})`} aria-label="Ajouter une colonne"><Plus size={15} /></button>
            </th>
          </tr>
          {reps > 1 && (
            <tr>
              {ds.columns.map((c) => Array.from({ length: reps }, (_, j) => <th key={`${c.id}-${j}`} className="sg-sub">Y{j + 1}</th>))}
            </tr>
          )}
        </thead>
        <tbody>
          {ds.rows.map((r, i) => (
            <Row key={r.id} row={r} index={i} columns={ds.columns} reps={reps} lead={lead} kind={ds.kind} onCell={onCell} onLead={onLead} onPaste={onPaste} onKey={onKey} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
