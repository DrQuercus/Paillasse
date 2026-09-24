import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ClipboardPaste, Download, Eraser, Redo2, Undo2, X } from 'lucide-react';
import { useApp } from '../../context.js';
import { KINDS, datasetCsv, normalizeDataset, parseClipboard, tableFromGrid } from '../../lib/stats/model.js';
import { analyze } from '../../lib/stats/analysis.js';
import { renderPlot } from '../../lib/stats/plot.js';
import { download, svgToPng } from '../../lib/image.js';
import Modal from '../Modal.jsx';
import useHistory from '../gel/useHistory.js';
import AnalysisSettings from './AnalysisSettings.jsx';
import DataGrid, { withTrailing } from './DataGrid.jsx';
import GraphSettings from './GraphSettings.jsx';
import ResultsView from './ResultsView.jsx';

const slug = (s) => String(s || 'graphique').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).toLowerCase() || 'graphique';

/** Coller un tableau entier (avec ses en-têtes) depuis Excel ou LibreOffice. */
function PasteDialog({ ds, onApply, onClose }) {
  const [text, setText] = useState('');
  const k = KINDS[ds.kind];
  return (
    <Modal title="Coller un tableau" onClose={onClose} wide>
      <p className="modal-lead">
        Copiez les cellules dans Excel ou LibreOffice (avec la ligne des titres), puis collez-les ici. Le tableau actuel est remplacé.
        {k.x ? ' Première colonne : X.' : k.labels ? ' Première colonne : noms des lignes (facultatif).' : ''}
        {k.replicates ? ` ${ds.replicates} colonne${ds.replicates > 1 ? 's' : ''} par série (réplicats).` : ''}
      </p>
      <textarea className="st-paste" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Témoin\tTraité\n12,1\t7,9\n13,4\t8,8'} autoFocus />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>Annuler</button>
        <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={() => onApply(parseClipboard(text))}>Remplacer le tableau</button>
      </div>
    </Modal>
  );
}

/**
 * Atelier Statistiques, en plein écran : tableau de données, graphique et résultats mis à jour à
 * chaque saisie, réglages de l'analyse et du graphique. onSubmit({ ds, res, plot }) insère l'encart.
 */
export default function StatWorkbench({ initial, submitLabel = 'Insérer dans l’entrée', onSubmit, onClose, onChange, status }) {
  const { notify } = useApp();
  const [start] = useState(() => withTrailing(normalizeDataset(initial)));
  const { state: ds, update, undo, redo, canUndo, canRedo } = useHistory(start);
  const [tab, setTab] = useState('analysis');
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const k = KINDS[ds.kind];

  // Calculs sur l'état différé : la saisie reste fluide même quand une analyse prend 100 ms
  const d = useDeferredValue(ds);
  const res = useMemo(() => analyze(d), [d.rows, d.columns, d.analysis, d.kind, d.replicates, d.rowTitle, d.colTitle]); // eslint-disable-line react-hooks/exhaustive-deps
  const plot = useMemo(() => renderPlot(d, res), [d, res]);

  useEffect(() => { onChange?.(ds); }, [ds, onChange]);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && !['range', 'checkbox', 'radio', 'color'].includes(e.target.type);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  const save = async (what) => {
    const name = slug(ds.title);
    if (what === 'svg') download(new Blob([plot.svg], { type: 'image/svg+xml' }), `${name}.svg`);
    else if (what === 'png') download((await svgToPng(plot.svg, 3)).blob, `${name}.png`);
    else download(new Blob([`﻿${datasetCsv(ds)}`], { type: 'text/csv' }), `${name}.csv`);
  };

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit({ ds, res: analyze(ds), plot: renderPlot(ds, analyze(ds)) });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="st-wb" role="dialog" aria-modal="true" aria-label="Statistiques">
      <header className="gel-wb-head">
        <button type="button" className="btn btn-ghost" onClick={onClose}><X size={16} /> Fermer</button>
        <input className="gel-title" value={ds.title} onChange={(e) => update((s) => ({ ...s, title: e.target.value }), { key: 'title' })} placeholder="Titre (ex. Activité selon le traitement)" aria-label="Titre" />
        <span className="st-kind" title={k.long}>Tableau {k.label}</span>
        <div className="gel-wb-actions">
          {status && <span className="muted small st-status">{status}</span>}
          <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} title="Annuler (Ctrl+Z)" aria-label="Annuler"><Undo2 size={17} /></button>
          <button type="button" className="icon-btn" onClick={redo} disabled={!canRedo} title="Rétablir (Ctrl+Maj+Z)" aria-label="Rétablir"><Redo2 size={17} /></button>
          {onSubmit && <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || Boolean(res.error)}>{busy ? 'Enregistrement…' : submitLabel}</button>}
        </div>
      </header>
      <div className="st-body">
        <section className="st-data" aria-label="Données">
          <div className="st-toolbar">
            <button type="button" className="btn btn-small" onClick={() => setPasting(true)}><ClipboardPaste size={14} /> Coller un tableau…</button>
            {k.replicates && (
              <label className="st-reps">
                Réplicats
                <select value={ds.replicates} onChange={(e) => update((s) => withTrailing({ ...s, replicates: Number(e.target.value) }))} aria-label="Nombre de réplicats par série">
                  {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </label>
            )}
            <button type="button" className="btn btn-small btn-ghost" onClick={() => update((s) => withTrailing({ ...s, rows: [] }))} title="Vider le tableau (Ctrl+Z pour revenir)"><Eraser size={14} /> Vider</button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => save('csv')}><Download size={14} /> CSV</button>
          </div>
          <p className="hint st-kind-hint">{k.long}. Collez depuis Excel dans n’importe quelle cellule.</p>
          <DataGrid ds={ds} update={update} />
        </section>
        <main className="st-center">
          <div className="st-graph">
            {/* SVG construit par plot.js à partir de nombres et de textes échappés */}
            <div className="st-svg" style={{ maxWidth: `${plot.width}px` }} dangerouslySetInnerHTML={{ __html: plot.svg }} />
            <div className="st-graph-actions">
              <button type="button" className="btn btn-small btn-ghost" onClick={() => save('png')}><Download size={14} /> PNG</button>
              <button type="button" className="btn btn-small btn-ghost" onClick={() => save('svg')}><Download size={14} /> SVG</button>
            </div>
          </div>
          <div className="st-results-wrap">
            <h3 className="st-results-title">{res.error ? 'Résultats' : res.title}</h3>
            <ResultsView res={res} />
          </div>
        </main>
        <aside className="st-side">
          <div className="gel-tabs st-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'analysis'} className={tab === 'analysis' ? 'is-active' : ''} onClick={() => setTab('analysis')}>Analyse</button>
            <button type="button" role="tab" aria-selected={tab === 'graph'} className={tab === 'graph' ? 'is-active' : ''} onClick={() => setTab('graph')}>Graphique</button>
          </div>
          <div className="st-side-body">
            {tab === 'analysis' ? <AnalysisSettings ds={ds} update={update} /> : <GraphSettings ds={ds} update={update} />}
          </div>
        </aside>
      </div>
      {pasting && (
        <PasteDialog
          ds={ds}
          onClose={() => setPasting(false)}
          onApply={(grid) => { update((s) => withTrailing(tableFromGrid(s, grid))); setPasting(false); }}
        />
      )}
    </div>
  );
}
