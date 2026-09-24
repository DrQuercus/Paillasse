import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { Columns4, FileImage, Pencil, RotateCcw } from 'lucide-react';
import { setResume } from '../../lib/gel/draft.js';
import { panelWidths } from '../../lib/gel/layout.js';

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
    return () => editor.off('update', sync);
  }, [editor]);
  return editable;
}

function GelFigureView({ node, editor, updateAttributes }) {
  const editable = useEditable(editor);
  const { analysis, images, summary, layout, width } = node.attrs;
  const [showNotes, setShowNotes] = useState(false);
  const s = summary ?? {};
  const notes = s.notes ?? [];
  const sourceId = analysis?.source?.attachmentId;
  const canEdit = editable && typeof editor.storage.gelFigure?.edit === 'function';
  const widths = panelWidths((images ?? []).map((i) => i.width), layout);

  return (
    <NodeViewWrapper className="gelfig-node" data-drag-handle onDoubleClick={canEdit ? () => editor.storage.gelFigure.edit(node.attrs, updateAttributes) : undefined}>
      <figure contentEditable={false} className={`gelfig-card gelfig-${['row', 'grid'].includes(layout) ? layout : 'column'}`} style={{ width: `${width ?? 100}%` }}>
        <figcaption>
          <Columns4 size={17} aria-hidden="true" />
          <span className="gelfig-title"><strong>{s.title ?? 'Figure de gel'}</strong>{s.mode && <span className="muted"> — {s.mode}</span>}</span>
          <span className="calc-card-actions">
            {sourceId && (
              <a className="icon-btn" href={`/api/files/${sourceId}?download=1`} title={`Image d’origine : ${analysis.source.filename ?? ''}`} aria-label="Télécharger l’image d’origine">
                <FileImage size={15} />
              </a>
            )}
            {canEdit ? (
              <button type="button" className="btn btn-small" onClick={() => editor.storage.gelFigure.edit(node.attrs, updateAttributes)}>
                <Pencil size={14} /> Modifier
              </button>
            ) : !editable && sourceId && (
              <Link
                className="btn btn-small"
                to="/gels"
                onClick={() => setResume({ analysis, sourceUrl: `/api/files/${sourceId}`, filename: analysis.source.filename })}
                title="Rouvrir cette analyse dans l’atelier Gels (l’entrée ne change pas)"
              >
                <RotateCcw size={14} /> Reprendre
              </Link>
            )}
          </span>
        </figcaption>
        {s.lanes?.length > 0 && <p className="gelfig-lanes">Pistes : {s.lanes.join(', ')}</p>}
        <div className="gelfig-panels">
          {(images ?? []).map((img, i) => <img key={img.src} src={img.src} alt={img.alt} width={img.width} height={img.height} style={{ width: `${widths[i]}%` }} loading="lazy" />)}
        </div>
        {s.table && (
          <div className="calc-table-wrap">
            <table className="calc-table">
              <thead><tr>{s.table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{s.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
        {notes.slice(0, showNotes ? notes.length : 2).map((n) => <p key={n} className="calc-note">{n}</p>)}
        {notes.length > 2 && (
          <button type="button" className="link-btn small" onClick={() => setShowNotes((v) => !v)}>
            {showNotes ? 'Moins de détails' : `${notes.length - 2} note${notes.length > 3 ? 's' : ''} de plus`}
          </button>
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
 * Figure de gel dans une entrée : panneaux (pièces jointes dérivées de l'image d'origine),
 * tableau des bandes et analyse complète, rééditable tant que l'entrée est un brouillon.
 * editor.storage.gelFigure.edit(attrs, apply) est fourni par l'éditeur (NoteEditor).
 */
export const GelFigureNode = Node.create({
  name: 'gelFigure',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addStorage() {
    return { edit: null };
  },
  addAttributes() {
    return {
      analysis: jsonAttr('analysis', null),
      images: jsonAttr('images', []),
      summary: jsonAttr('summary', null),
      layout: { default: 'column', parseHTML: (el) => el.getAttribute('data-layout') ?? 'column', renderHTML: (a) => ({ 'data-layout': a.layout }) },
      width: { default: 100, parseHTML: (el) => Number(el.getAttribute('data-width')) || 100, renderHTML: (a) => ({ 'data-width': a.width }) },
    };
  },
  parseHTML: () => [{ tag: 'div[data-gel-figure]' }],
  renderHTML: ({ HTMLAttributes, node }) => ['div', mergeAttributes({ 'data-gel-figure': '' }, HTMLAttributes), node.attrs.summary?.title ?? 'Figure de gel'],
  addNodeView() {
    return ReactNodeViewRenderer(GelFigureView);
  },
});
