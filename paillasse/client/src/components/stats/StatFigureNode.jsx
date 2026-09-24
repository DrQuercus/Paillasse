import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { ChartColumn, Pencil, RotateCcw } from 'lucide-react';
import { api } from '../../api.js';
import ResultsView from './ResultsView.jsx';

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
};

function useEditable(editor) {
  const [editable, setEditable] = useState(editor.isEditable);
  useEffect(() => {
    const sync = () => setEditable(editor.isEditable);
    editor.on('update', sync);
    editor.on('transaction', sync);
    return () => { editor.off('update', sync); editor.off('transaction', sync); };
  }, [editor]);
  return editable;
}

function StatFigureView({ node, editor, updateAttributes }) {
  const editable = useEditable(editor);
  const navigate = useNavigate();
  const { dataset, images, summary, width } = node.attrs;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const s = summary ?? {};
  const canEdit = editable && typeof editor.storage.statFigure?.edit === 'function';
  const first = s.sections?.[0];
  // Une entrée verrouillée ne change plus : « Reprendre » copie les données dans un nouveau jeu
  const reopen = async () => {
    setBusy(true);
    try {
      const created = await api.post('/datasets', { data: { ...dataset, title: `${dataset?.title || 'Graphique'} (reprise)` } });
      navigate(`/stats/${created.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <NodeViewWrapper className="statfig-node" data-drag-handle onDoubleClick={canEdit ? () => editor.storage.statFigure.edit(node.attrs, updateAttributes) : undefined}>
      <figure contentEditable={false} className="statfig-card">
        <figcaption>
          <ChartColumn size={17} aria-hidden="true" />
          <span className="gelfig-title">
            <strong>{s.title ?? 'Graphique'}</strong>
            <span className="muted"> — {[s.kind && `tableau ${s.kind}`, s.analysis].filter(Boolean).join(' — ')}</span>
          </span>
          <span className="calc-card-actions">
            {canEdit ? (
              <button type="button" className="btn btn-small" onClick={() => editor.storage.statFigure.edit(node.attrs, updateAttributes)}>
                <Pencil size={14} /> Modifier
              </button>
            ) : !editable && dataset && (
              <button type="button" className="btn btn-small" onClick={reopen} disabled={busy} title="Copier ces données dans un nouveau jeu de la page Statistiques (l’entrée ne change pas)">
                <RotateCcw size={14} /> Reprendre
              </button>
            )}
          </span>
        </figcaption>
        <div className="statfig-graph">
          {(images ?? []).map((img) => <img key={img.src} src={img.src} alt={img.alt} width={img.width} height={img.height} style={{ width: `${width ?? 75}%` }} loading="lazy" />)}
        </div>
        {s.error ? <p className="calc-note">{s.error}</p> : (
          <>
            {!open && first?.rows && (
              <p className="statfig-key">
                {first.rows.slice(0, 3).map(([k, v]) => <span key={k}><span className="muted">{k} :</span> {v}</span>)}
              </p>
            )}
            {open && <ResultsView res={{ method: s.method, sections: s.sections ?? [], warnings: s.warnings ?? [] }} compact />}
            {(s.sections?.length ?? 0) > 0 && (
              <button type="button" className="link-btn small" onClick={() => setOpen((v) => !v)}>
                {open ? 'Masquer les résultats' : 'Tous les résultats'}
              </button>
            )}
          </>
        )}
      </figure>
    </NodeViewWrapper>
  );
}

const jsonAttr = (name, fallback) => ({
  default: fallback,
  parseHTML: (el) => parseJson(el.getAttribute(`data-${name}`), fallback),
  renderHTML: (attrs) => ({ [`data-${name}`]: JSON.stringify(attrs[name] ?? fallback) }),
});

/**
 * Graphique et statistiques dans une entrée : image du graphique (pièce jointe), résultats en texte
 * et copie des données, rééditable tant que l'entrée est un brouillon.
 * editor.storage.statFigure.edit(attrs, apply) est fourni par l'éditeur (NoteEditor).
 */
export const StatFigureNode = Node.create({
  name: 'statFigure',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addStorage() {
    return { edit: null };
  },
  addAttributes() {
    return {
      dataset: jsonAttr('dataset', null),
      images: jsonAttr('images', []),
      summary: jsonAttr('summary', null),
      width: { default: 75, parseHTML: (el) => Number(el.getAttribute('data-width')) || 75, renderHTML: (a) => ({ 'data-width': a.width }) },
    };
  },
  parseHTML: () => [{ tag: 'div[data-stat-figure]' }],
  renderHTML: ({ HTMLAttributes, node }) => ['div', mergeAttributes({ 'data-stat-figure': '' }, HTMLAttributes), node.attrs.summary?.title ?? 'Graphique'],
  addNodeView() {
    return ReactNodeViewRenderer(StatFigureView);
  },
});
