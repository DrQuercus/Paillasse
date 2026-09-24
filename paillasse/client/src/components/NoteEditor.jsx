import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Crop } from 'lucide-react';
import { fileUrl } from '../api.js';
import { IMAGE_SIZES, buildExtensions } from './extensions.js';
import Toolbar from './Toolbar.jsx';
import ImageEditor from './ImageEditor.jsx';
import { SequencePicker } from './SequenceRef.jsx';

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

/** Insère une pièce jointe : image affichée dans le texte, autre fichier sous forme de lien. */
function insertAttachment(editor, att, pos) {
  if (!editor || editor.isDestroyed) return;
  const url = fileUrl(att.id);
  const node = DISPLAYABLE.test(att.mime_type)
    ? { type: 'image', attrs: { src: url, alt: att.filename } }
    : { type: 'paragraph', content: [{ type: 'text', text: `📎 ${att.filename}`, marks: [{ type: 'link', attrs: { href: url } }] }] };
  const chain = editor.chain().focus();
  (pos == null ? chain.insertContent(node) : chain.insertContentAt(pos, node)).run();
  placeCursorBelow(editor);
}

/** Petite barre flottante au-dessus d'une image sélectionnée. */
function ImageMenu({ editor, onEdit }) {
  const size = useEditorState({ editor, selector: ({ editor: e }) => e.getAttributes('image').size ?? 100 });
  const setSize = (s) => editor.chain().focus().updateAttributes('image', { size: s === 100 ? null : s }).run();
  return (
    <div className="bubble" role="toolbar" aria-label="Image">
      <button type="button" className="bubble-btn" onClick={onEdit}>
        <Crop size={15} /> Retoucher
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

export default function NoteEditor({ content, editable = true, onChange, onUpload, onReady, placeholder }) {
  const onChangeRef = useRef(onChange);
  const onUploadRef = useRef(onUpload);
  onChangeRef.current = onChange;
  onUploadRef.current = onUpload;
  const editorRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [imageEdit, setImageEdit] = useState(null); // { pos, src }
  const [pickingSequence, setPickingSequence] = useState(false);

  const handleFiles = async (files, pos) => {
    let at = pos;
    for (const file of files) {
      setUploading((n) => n + 1);
      try {
        const att = await onUploadRef.current(file);
        insertAttachment(editorRef.current, att, at);
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
          onInsertSequence={canUpload ? () => setPickingSequence(true) : undefined}
        />
      )}
      {editor && editable && canUpload && (
        <BubbleMenu
          editor={editor}
          pluginKey="imageMenu"
          shouldShow={({ editor: e }) => e.isEditable && e.isActive('image')}
          options={{ placement: 'top-start', offset: { mainAxis: -44, crossAxis: 8 } }}
          className="bubble-host"
        >
          <ImageMenu editor={editor} onEdit={editSelectedImage} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} onClick={onClick} />
      {pickingSequence && (
        <SequencePicker
          onClose={() => setPickingSequence(false)}
          onPick={(attrs) => {
            setPickingSequence(false);
            editor.chain().focus().insertContent({ type: 'sequenceRef', attrs }).run();
            placeCursorBelow(editor);
          }}
        />
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
