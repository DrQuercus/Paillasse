import { useEffect, useState } from 'react';
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { Aperture, Calculator, ChartColumn, Columns4, Dna, ImagePlus, TestTube, X } from 'lucide-react';

/** Outils qu'un emplacement de modèle peut ouvrir. */
export const SLOT_TOOLS = {
  gel: { Icon: Columns4, name: 'Figure de gel', action: 'Analyser le gel…' },
  stats: { Icon: ChartColumn, name: 'Graphique et statistiques', action: 'Saisir les valeurs…' },
  calc: { Icon: Calculator, name: 'Calcul', action: 'Calculer…' },
  image: { Icon: ImagePlus, name: 'Photo ou fichier', action: 'Ajouter…' },
  sequence: { Icon: Dna, name: 'Séquence du registre', action: 'Choisir…' },
  samples: { Icon: TestTube, name: 'Tubes à ranger', action: 'Ranger les tubes…' },
};

// Emplacement « tubes » réglé pour des grilles de cryo-EM (ranger ou citer)
const GRID_SLOTS = {
  store: { Icon: Aperture, name: 'Grilles à ranger', action: 'Ranger les grilles…' },
  cite: { Icon: Aperture, name: 'Grilles utilisées', action: 'Citer les grilles…' },
};
const slotMeta = (tool, preset) => (tool === 'samples' && preset?.type === 'grid'
  ? GRID_SLOTS[preset.mode === 'cite' ? 'cite' : 'store']
  : SLOT_TOOLS[tool] ?? SLOT_TOOLS.image);

const newSlotId = () => `slot-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const newSlot = (tool) => ({ type: 'templateSlot', attrs: { id: newSlotId(), tool, label: SLOT_TOOLS[tool].name, hint: '', preset: null } });

/** Mode d'affichage : entrée à remplir, modèle en cours d'écriture, ou lecture seule (masqué). */
function useSlotMode(editor) {
  const read = () => (!editor.isEditable ? 'hidden' : typeof editor.storage.templateSlot?.fill === 'function' ? 'fill' : 'design');
  const [mode, setMode] = useState(read);
  useEffect(() => {
    const sync = () => setMode(read());
    editor.on('transaction', sync);
    return () => editor.off('transaction', sync);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps
  return mode;
}

function SlotView({ node, editor, getPos, deleteNode, updateAttributes }) {
  const mode = useSlotMode(editor);
  const { tool, label, hint } = node.attrs;
  const meta = slotMeta(tool, node.attrs.preset);
  // Une entrée verrouillée (ou une version figée) n'affiche pas les emplacements restés vides
  if (mode === 'hidden') return <NodeViewWrapper className="slot-node" hidden />;
  const fill = () => editor.storage.templateSlot.fill?.(node.attrs, getPos());
  return (
    <NodeViewWrapper className="slot-node" data-drag-handle>
      <div contentEditable={false} className={`slot slot-${tool}`}>
        <span className="slot-icon"><meta.Icon size={18} aria-hidden="true" /></span>
        {mode === 'fill' ? (
          <>
            <button type="button" className="slot-main" onClick={fill}>
              <strong>{label || meta.name}</strong>
              {hint && <span className="slot-hint">{hint}</span>}
            </button>
            <button type="button" className="btn btn-small" onClick={fill}>{meta.action}</button>
          </>
        ) : (
          <span className="slot-design">
            <input value={label} onChange={(e) => updateAttributes({ label: e.target.value })} aria-label="Libellé de l’emplacement" placeholder={meta.name} />
            <input value={hint} onChange={(e) => updateAttributes({ hint: e.target.value })} aria-label="Consigne de l’emplacement" placeholder="Consigne (facultative)" className="slot-hint" />
            <span className="slot-hint">Emplacement « {meta.name.toLowerCase()} » : il se remplit dans l’entrée créée à partir du modèle.</span>
          </span>
        )}
        <button type="button" className="icon-btn slot-remove" onClick={deleteNode} title="Retirer cet emplacement" aria-label={`Retirer l’emplacement ${label || meta.name}`}>
          <X size={14} />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

const jsonAttr = (name, fallback) => ({
  default: fallback,
  parseHTML: (el) => {
    try { return JSON.parse(el.getAttribute(`data-${name}`)) ?? fallback; } catch { return fallback; }
  },
  renderHTML: (attrs) => ({ [`data-${name}`]: JSON.stringify(attrs[name] ?? fallback) }),
});
const textAttr = (name) => ({ default: '', parseHTML: (el) => el.getAttribute(`data-${name}`) ?? '', renderHTML: (a) => ({ [`data-${name}`]: a[name] ?? '' }) });

/**
 * Emplacement à remplir, posé par un modèle : figure de gel, graphique, calcul, photo ou séquence.
 * Dans une entrée, un clic ouvre l'outil (avec les réglages du modèle) et le résultat prend sa place.
 * editor.storage.templateSlot.fill(attrs, pos) est fourni par l'éditeur (NoteEditor) quand c'est possible.
 */
export const TemplateSlotNode = Node.create({
  name: 'templateSlot',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addStorage() {
    return { fill: null };
  },
  addAttributes() {
    return {
      id: textAttr('id'),
      tool: textAttr('tool'),
      label: textAttr('label'),
      hint: textAttr('hint'),
      preset: jsonAttr('preset', null),
    };
  },
  parseHTML: () => [{ tag: 'div[data-template-slot]' }],
  renderHTML: ({ HTMLAttributes, node }) => ['div', mergeAttributes({ 'data-template-slot': '' }, HTMLAttributes), node.attrs.label || ''],
  addNodeView() {
    return ReactNodeViewRenderer(SlotView);
  },
});
