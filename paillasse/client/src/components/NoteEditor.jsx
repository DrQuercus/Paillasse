import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Columns4, Crop } from 'lucide-react';
import { fileUrl } from '../api.js';
import { IMAGE_SIZES, buildExtensions } from './extensions.js';
import Toolbar from './Toolbar.jsx';
import ImageEditor from './ImageEditor.jsx';
import { SequencePicker } from './SequenceRef.jsx';
import { newSlot } from './TemplateSlot.jsx';

// Calculateurs et atelier Gels : chargés à la première ouverture
const CalcDialog = lazy(() => import('./calc/CalcDialog.jsx'));
const GelEditorSession = lazy(() => import('./gel/GelEditorSession.jsx'));
const StatEditorSession = lazy(() => import('./stats/StatEditorSession.jsx'));
const SampleSession = lazy(() => import('./storage/SampleSession.jsx'));

// Formats que tous les navigateurs savent afficher dans la page
const DISPLAYABLE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

/**
 * Place le curseur sur une ligne vide juste sous le bloc sélectionné (image, fichier…),
 * en la créant si besoin. Sans ça, l'image reste sélectionnée et la frappe suivante la remplace.
 */
function placeCursorBelow(editor) {
  const { state } = editor;
  const { selection } = state;
  const end = selection.node ? selection.to : selection.$to.after();
  const next = state.doc.resolve(end).nodeAfter;
  const chain = editor.chain();
  if (!(next?.isTextblock && next.content.size === 0)) chain.insertContentAt(end, { type: 'paragraph' });
  chain.setTextSelection(end + 1).scrollIntoView().run();
}

/**
 * Insère un bloc (séquence, calcul) au curseur. Si un bloc est sélectionné (clic sur une image,
 * un encart…), le nouveau se place dessous au lieu de le remplacer.
 */
function insertBlock(editor, node) {
  const { selection } = editor.state;
  const chain = editor.chain().focus();
  (selection.node ? chain.insertContentAt(selection.to, node) : chain.insertContent(node)).run();
  placeCursorBelow(editor);
}

/** Pièce jointe dans le texte : image affichée, autre fichier sous forme de lien. */
function attachmentNode(att) {
  const url = fileUrl(att.id);
  return DISPLAYABLE.test(att.mime_type)
    ? { type: 'image', attrs: { src: url, alt: att.filename } }
    : { type: 'paragraph', content: [{ type: 'text', text: `📎 ${att.filename}`, marks: [{ type: 'link', attrs: { href: url } }] }] };
}

function insertAttachment(editor, att, pos) {
  if (!editor || editor.isDestroyed) return;
  const node = attachmentNode(att);
  const chain = editor.chain().focus();
  (pos == null ? chain.insertContent(node) : chain.insertContentAt(pos, node)).run();
  placeCursorBelow(editor);
}

/** Position actuelle d'un emplacement de modèle ({ id, pos } au moment du clic), retrouvé par son id s'il a bougé. */
function slotRange(editor, slot) {
  const { doc } = editor.state;
  const at = slot.pos != null && slot.pos < doc.content.size ? doc.nodeAt(slot.pos) : null;
  if (at?.type.name === 'templateSlot' && at.attrs.id === slot.id) return { from: slot.pos, to: slot.pos + at.nodeSize };
  let found = null;
  doc.descendants((n, pos) => {
    if (found) return false;
    if (n.type.name === 'templateSlot' && n.attrs.id === slot.id) { found = { from: pos, to: pos + n.nodeSize }; return false; }
    return true;
  });
  return found;
}

/** Remplace l'emplacement par le bloc produit (figure, graphique, calcul…) ; faux s'il a disparu entre-temps. */
function replaceSlot(editor, slot, node) {
  if (!slot || !editor || editor.isDestroyed) return false;
  const range = slotRange(editor, slot);
  if (!range) return false;
  editor.chain().focus().insertContentAt(range, node).run();
  // Curseur sous le bloc inséré : la frappe suivante ne doit pas le remplacer
  const inserted = editor.state.doc.nodeAt(range.from);
  const end = range.from + (inserted?.nodeSize ?? 0);
  if (editor.state.doc.resolve(end).nodeAfter?.isTextblock) editor.commands.setTextSelection(end + 1);
  return true;
}

/** Petite barre flottante au-dessus d'une image sélectionnée. */
function ImageMenu({ editor, onEdit, onAnalyse }) {
  const size = useEditorState({ editor, selector: ({ editor: e }) => e.getAttributes('image').size ?? 100 });
  const setSize = (s) => editor.chain().focus().updateAttributes('image', { size: s === 100 ? null : s }).run();
  return (
    <div className="bubble" role="toolbar" aria-label="Image">
      <button type="button" className="bubble-btn" onClick={onEdit}>
        <Crop size={15} /> Retoucher
      </button>
      <button type="button" className="bubble-btn" onClick={onAnalyse} title="Analyser ce gel et en tirer une figure (pistes, tailles, quantification)">
        <Columns4 size={15} /> Analyser le gel
      </button>
      <span className="bubble-sep" aria-hidden="true" />
      {IMAGE_SIZES.map((s) => (
        <button
          key={s}
          type="button"
          className={`bubble-btn${size === s ? ' is-active' : ''}`}
          onClick={() => setSize(s)}
          aria-pressed={size === s}
          title={`Largeur ${s} %`}
        >
          {s} %
        </button>
      ))}
    </div>
  );
}

export default function NoteEditor({ content, editable = true, onChange, onUpload, onReady, placeholder, entryId, templateMode = false }) {
  const onChangeRef = useRef(onChange);
  const onUploadRef = useRef(onUpload);
  onChangeRef.current = onChange;
  onUploadRef.current = onUpload;
  const editorRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [imageEdit, setImageEdit] = useState(null); // { pos, src }
  // Les sessions portent éventuellement l'emplacement de modèle qu'elles rempliront : slot = { id, pos }
  const [pickingSequence, setPickingSequence] = useState(null); // { slot? }
  const [insertingCalc, setInsertingCalc] = useState(null); // { preset?, slot? }
  const [gelSession, setGelSession] = useState(null); // { attrs?, apply?, attachmentId?, filename?, insertAt?, mode?, slot? }
  const [statSession, setStatSession] = useState(null); // { attrs?, apply?, table?, dataset?, slot? }
  const [sampleSession, setSampleSession] = useState(null); // { preset?, slot? }
  const slotFileInput = useRef(null);
  const slotForFiles = useRef(null);

  const handleFiles = async (files, pos, slot = null) => {
    let at = pos;
    let target = slot;
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const att = await onUploadRef.current(file);
        if (!(target && replaceSlot(editorRef.current, target, attachmentNode(att)))) insertAttachment(editorRef.current, att, at);
        target = null;
        at = undefined; // les suivants s'insèrent à la suite
      } catch {
        /* l'erreur est signalée par le parent */
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const extensions = useMemo(() => buildExtensions({ placeholder }), [placeholder]);

  const editor = useEditor({
    extensions,
    content,
    editable,
    immediatelyRender: true,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getJSON()),
    editorProps: {
      attributes: { class: 'prose', spellcheck: 'true', lang: 'fr' },
      handleDrop: (view, event, _slice, moved) => {
        const files = [...(event.dataTransfer?.files ?? [])];
        if (moved || !files.length || !onUploadRef.current || !view.editable) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        handleFiles(files, pos);
        return true;
      },
      handlePaste: (view, event) => {
        const data = event.clipboardData;
        const files = [...(data?.files ?? [])];
        // Un copier-coller depuis Excel ou Word contient aussi une image du contenu :
        // on ne traite comme fichier que ce qui n'a pas de version texte.
        const hasText = data?.types?.includes('text/html') || data?.types?.includes('text/plain');
        if (!files.length || hasText || !onUploadRef.current || !view.editable) return false;
        event.preventDefault();
        handleFiles(files);
        return true;
      },
      // Image sélectionnée + frappe d'un caractère : on écrit dessous au lieu de remplacer l'image
      handleKeyDown: (view, event) => {
        const { selection } = view.state;
        if (selection.node?.type.name === 'image' && event.key.length === 1
          && !event.ctrlKey && !event.metaKey && !event.altKey && editorRef.current) {
          placeCursorBelow(editorRef.current);
        }
        return false;
      },
      handleDoubleClickOn: (view, pos, node) => {
        if (node.type.name !== 'image' || !view.editable || !onUploadRef.current) return false;
        setImageEdit({ pos, src: node.attrs.src });
        return true;
      },
    },
  }, []);

  useEffect(() => {
    editorRef.current = editor;
    onReady?.(editor);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  // Les figures de gel se modifient dans l'atelier, qui a besoin de pouvoir joindre des fichiers
  const canUploadNow = Boolean(onUpload);
  useEffect(() => {
    if (!editor?.storage.gelFigure) return;
    editor.storage.gelFigure.edit = canUploadNow ? (attrs, apply) => setGelSession({ attrs, apply }) : null;
    if (editor.storage.statFigure) editor.storage.statFigure.edit = canUploadNow ? (attrs, apply) => setStatSession({ attrs, apply }) : null;
    // Emplacements des modèles : remplis dans une entrée (pièces jointes possibles), dessinés dans un modèle
    if (editor.storage.templateSlot) {
      editor.storage.templateSlot.fill = canUploadNow ? (attrs, pos) => {
        const slot = { id: attrs.id, pos };
        if (attrs.tool === 'gel') setGelSession({ mode: attrs.preset?.mode, slot });
        else if (attrs.tool === 'stats') setStatSession({ dataset: attrs.preset?.dataset, slot });
        else if (attrs.tool === 'calc') setInsertingCalc({ preset: attrs.preset, slot });
        else if (attrs.tool === 'sequence') setPickingSequence({ slot });
        else if (attrs.tool === 'samples') setSampleSession({ preset: attrs.preset ?? {}, slot });
        else { slotForFiles.current = slot; slotFileInput.current?.click(); }
      } : null;
      if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta('templateSlotMode', canUploadNow));
    }
  }, [editor, canUploadNow]);

  // Tableau sous le curseur : proposé comme données du graphique
  const tableAtCursor = () => {
    const { $from } = editor.state.selection;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name === 'table') {
        const grid = [];
        node.forEach((row) => { const cells = []; row.forEach((cell) => cells.push(cell.textContent.trim())); grid.push(cells); });
        return grid;
      }
    }
    return null;
  };

  const analyseSelectedImage = () => {
    const { selection } = editor.state;
    const node = selection.node;
    const id = /\/api\/files\/([0-9a-f-]{36})/.exec(node?.attrs.src ?? '')?.[1];
    if (id) setGelSession({ attachmentId: id, filename: node.attrs.alt, insertAt: selection.to });
  };

  const editSelectedImage = () => {
    const { selection } = editor.state;
    if (selection.node?.type.name === 'image') setImageEdit({ pos: selection.from, src: selection.node.attrs.src });
  };

  const closeImageEdit = useCallback(() => setImageEdit(null), []);

  /** Remplace l'image par sa version retouchée (l'original reste dans les fichiers de l'entrée). */
  const applyImageEdit = async ({ blob, filename, originalId, params, revertTo }) => {
    let src;
    if (revertTo) {
      src = fileUrl(revertTo);
    } else {
      const file = new File([blob], filename, { type: blob.type });
      const att = await onUploadRef.current(file, { derived_from: originalId, edit_params: params });
      src = fileUrl(att.id);
    }
    const ed = editorRef.current;
    const { pos, src: oldSrc } = imageEdit;
    const node = ed.state.doc.nodeAt(pos);
    if (node?.type.name === 'image' && node.attrs.src === oldSrc) {
      ed.view.dispatch(ed.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, src }));
    }
    setImageEdit(null);
    ed.commands.focus();
  };

  // Ctrl/Cmd + clic ouvre un lien pendant l'édition
  const onClick = (e) => {
    const link = e.target.closest?.('a[href]');
    if (link && editable && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener');
    }
  };

  const canUpload = Boolean(onUpload);

  return (
    <div className={`note-editor${editable ? '' : ' is-readonly'}`}>
      {editable && (
        <Toolbar
          editor={editor}
          canUpload={canUpload}
          onPickFiles={(files) => handleFiles(files)}
          uploading={uploading}
          onInsertSequence={canUpload ? () => setPickingSequence({}) : undefined}
          onInsertCalc={() => setInsertingCalc({})}
          onInsertGel={canUpload ? () => setGelSession({}) : undefined}
          onInsertStats={canUpload ? () => setStatSession({ table: tableAtCursor() }) : undefined}
          onInsertSamples={canUpload ? () => setSampleSession({}) : undefined}
          onInsertSlot={templateMode ? (tool) => insertBlock(editor, newSlot(tool)) : undefined}
        />
      )}
      <input
        ref={slotFileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = [...e.target.files];
          e.target.value = '';
          if (files.length) handleFiles(files, undefined, slotForFiles.current);
          slotForFiles.current = null;
        }}
      />
      {editor && editable && canUpload && (
        <BubbleMenu
          editor={editor}
          pluginKey="imageMenu"
          shouldShow={({ editor: e }) => e.isEditable && e.isActive('image')}
          options={{ placement: 'top-start', offset: { mainAxis: -44, crossAxis: 8 } }}
          className="bubble-host"
        >
          <ImageMenu editor={editor} onEdit={editSelectedImage} onAnalyse={analyseSelectedImage} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} onClick={onClick} />
      {pickingSequence && (
        <SequencePicker
          onClose={() => setPickingSequence(null)}
          onPick={(attrs) => {
            const node = { type: 'sequenceRef', attrs };
            if (!replaceSlot(editor, pickingSequence.slot, node)) insertBlock(editor, node);
            setPickingSequence(null);
          }}
        />
      )}
      {insertingCalc && (
        <Suspense fallback={null}>
          <CalcDialog
            preset={insertingCalc.preset}
            onClose={() => setInsertingCalc(null)}
            onApply={(attrs) => {
              const node = { type: 'labCalc', attrs };
              if (!replaceSlot(editor, insertingCalc.slot, node)) insertBlock(editor, node);
              setInsertingCalc(null);
            }}
          />
        </Suspense>
      )}
      {gelSession && (
        <Suspense fallback={null}>
          <GelEditorSession
            session={gelSession}
            entryId={entryId}
            upload={(file, derivation) => onUploadRef.current(file, derivation)}
            onClose={() => setGelSession(null)}
            onUpdate={(attrs) => gelSession.apply?.(attrs)}
            onInsert={(attrs) => {
              const node = { type: 'gelFigure', attrs };
              if (replaceSlot(editor, gelSession.slot, node)) return;
              if (gelSession.insertAt !== undefined) {
                editor.chain().focus().insertContentAt(gelSession.insertAt, node).run();
                placeCursorBelow(editor);
              } else {
                insertBlock(editor, node);
              }
            }}
          />
        </Suspense>
      )}
      {statSession && (
        <Suspense fallback={null}>
          <StatEditorSession
            session={statSession}
            upload={(file, derivation) => onUploadRef.current(file, derivation)}
            onClose={() => setStatSession(null)}
            onUpdate={(attrs) => statSession.apply?.(attrs)}
            onInsert={(attrs) => {
              const node = { type: 'statFigure', attrs };
              if (replaceSlot(editor, statSession.slot, node)) return;
              if (statSession.table) {
                // Sous le tableau analysé, et non dedans
                const { $from } = editor.state.selection;
                let pos = null;
                for (let depth = $from.depth; depth > 0; depth -= 1) if ($from.node(depth).type.name === 'table') { pos = $from.after(depth); break; }
                if (pos !== null) { editor.chain().focus().insertContentAt(pos, node).run(); placeCursorBelow(editor); return; }
              }
              insertBlock(editor, node);
            }}
          />
        </Suspense>
      )}
      {sampleSession && (
        <Suspense fallback={null}>
          <SampleSession
            session={sampleSession}
            entryId={entryId}
            onClose={() => setSampleSession(null)}
            onInsert={(attrs) => {
              const node = { type: 'sampleRef', attrs };
              if (!replaceSlot(editor, sampleSession.slot, node)) insertBlock(editor, node);
            }}
          />
        </Suspense>
      )}
      {imageEdit && <ImageEditor src={imageEdit.src} onApply={applyImageEdit} onClose={closeImageEdit} />}
    </div>
  );
}

/** Affichage figé d'un document (versions). */
export function ReadOnlyDoc({ content }) {
  const extensions = useMemo(() => buildExtensions(), []);
  const editor = useEditor({
    extensions,
    content,
    editable: false,
    immediatelyRender: true,
    editorProps: { attributes: { class: 'prose' } },
  }, [content]);
  return <EditorContent editor={editor} />;
}
