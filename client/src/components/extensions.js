import { Extension } from '@tiptap/react';
import { Plugin } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { TableKit } from '@tiptap/extension-table';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Image from '@tiptap/extension-image';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { SequenceRefNode } from './SequenceRef.jsx';
import { LabCalcNode } from './calc/LabCalcNode.jsx';
import { GelFigureNode } from './gel/GelFigureNode.jsx';
import { StatFigureNode } from './stats/StatFigureNode.jsx';
import { TemplateSlotNode } from './TemplateSlot.jsx';
import { SampleRefNode } from './storage/SampleRefNode.jsx';

export const IMAGE_SIZES = [25, 50, 75, 100];

/** Image avec une largeur d'affichage en pourcentage de la page (25, 50, 75 ou 100 %). */
const LabImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: null,
        parseHTML: (el) => {
          const v = Number(el.getAttribute('data-size'));
          return IMAGE_SIZES.includes(v) && v !== 100 ? v : null;
        },
        renderHTML: (attrs) => (attrs.size ? { 'data-size': attrs.size } : {}),
      },
    };
  },
});

/**
 * Pendant une sélection à la souris (bouton enfoncé), on n'affiche pas les poignées
 * de redimensionnement des colonnes : sinon elles apparaissent et disparaissent à chaque
 * bordure franchie et la sélection « saute ». Un redimensionnement déjà commencé
 * n'est pas concerné (il suit la souris via ses propres écouteurs).
 */
const TableDragGuard = Extension.create({
  name: 'tableDragGuard',
  priority: 1000,
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            mousemove: (_view, event) => (event.buttons & 1) === 1,
          },
        },
      }),
    ];
  },
});

/** Extensions communes à l'éditeur et à l'affichage en lecture seule. */
export function buildExtensions({ placeholder } = {}) {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      },
    }),
    Placeholder.configure({ placeholder: placeholder ?? 'Notez ce que vous faites et ce que vous observez…' }),
    Highlight,
    Subscript,
    Superscript,
    LabImage.configure({ allowBase64: false }),
    TableDragGuard,
    TableKit.configure({ table: { resizable: true, handleWidth: 4, cellMinWidth: 48 } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    SequenceRefNode,
    LabCalcNode,
    GelFigureNode,
    StatFigureNode,
    TemplateSlotNode,
    SampleRefNode,
  ];
}
