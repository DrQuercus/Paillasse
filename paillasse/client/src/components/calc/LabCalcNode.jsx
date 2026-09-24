import { Suspense, lazy, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { Copy, Pencil, RotateCcw } from 'lucide-react';
import { summaryToText } from '../../lib/calc/summary.js';
import { copyText } from '../../lib/clipboard.js';
import CalcSummary from './CalcSummary.jsx';
import { setDraft } from './draft.js';

const CalcDialog = lazy(() => import('./CalcDialog.jsx'));

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
};

/** L'éditeur peut passer en lecture seule (verrouillage) sans recréer les encarts. */
function useEditable(editor) {
  const [editable, setEditable] = useState(editor.isEditable);
  useEffect(() => {
    const sync = () => setEditable(editor.isEditable);
    editor.on('update', sync);
    return () => editor.off('update', sync);
  }, [editor]);
  return editable;
}

function LabCalcView({ node, editor, updateAttributes }) {
  const editable = useEditable(editor);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const { kind, params, summary } = node.attrs;

  const copy = async () => {
    try {
      await copyText(summaryToText(summary));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* presse-papiers refusé : rien à faire */ }
  };

  const actions = (
    <>
      <button type="button" className="icon-btn" onClick={copy} title={copied ? 'Copié' : 'Copier le résultat (texte)'} aria-label="Copier le résultat">
        <Copy size={15} />
      </button>
      {editable ? (
        <button type="button" className="btn btn-small" onClick={() => setEditing(true)}>
          <Pencil size={14} /> Modifier
        </button>
      ) : (
        <Link
          className="btn btn-small"
          to={`/calc/${kind}`}
          onClick={() => setDraft({ kind, params })}
          title="Ouvrir ce calcul dans la page Calculs avec les mêmes valeurs"
        >
          <RotateCcw size={14} /> Reprendre
        </Link>
      )}
    </>
  );

  return (
    <NodeViewWrapper className="calc-node" data-drag-handle onDoubleClick={editable ? () => setEditing(true) : undefined}>
      <div contentEditable={false}>
        <CalcSummary summary={summary} actions={actions} />
      </div>
      {editing && createPortal(
        <Suspense fallback={null}>
          <CalcDialog
            initial={{ kind, params }}
            onClose={() => setEditing(false)}
            onApply={(attrs) => {
              if (editor.isEditable) updateAttributes(attrs);
              setEditing(false);
            }}
          />
        </Suspense>,
        document.body,
      )}
    </NodeViewWrapper>
  );
}

/**
 * Encart de calcul dans une entrée. Il garde les paramètres saisis (pour le modifier)
 * et le résumé affiché, qui est scellé tel quel avec la version de l'entrée.
 */
export const LabCalcNode = Node.create({
  name: 'labCalc',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      kind: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-kind') ?? '',
        renderHTML: (attrs) => ({ 'data-kind': attrs.kind }),
      },
      params: {
        default: {},
        parseHTML: (el) => parseJson(el.getAttribute('data-params'), {}),
        renderHTML: (attrs) => ({ 'data-params': JSON.stringify(attrs.params ?? {}) }),
      },
      summary: {
        default: null,
        parseHTML: (el) => parseJson(el.getAttribute('data-summary'), null),
        renderHTML: (attrs) => ({ 'data-summary': JSON.stringify(attrs.summary) }),
      },
    };
  },
  parseHTML: () => [{ tag: 'div[data-lab-calc]' }],
  renderHTML: ({ HTMLAttributes, node }) => [
    'div',
    mergeAttributes({ 'data-lab-calc': '' }, HTMLAttributes),
    summaryToText(node.attrs.summary),
  ],
  addNodeView() {
    return ReactNodeViewRenderer(LabCalcView);
  },
});
