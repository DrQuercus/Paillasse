import { useEffect, useRef, useState } from 'react';
import { useEditorState } from '@tiptap/react';
import {
  Bold, Calculator, ChevronDown, Code, Dna, Highlighter, ImagePlus, Italic, Link as LinkIcon, List, ListChecks, ListOrdered,
  Minus, Paperclip, Quote, Redo2, SquareCode, Strikethrough, Subscript, Superscript, Table,
  Underline, Undo2,
} from 'lucide-react';

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

function Btn({ onClick, active, disabled, label, children }) {
  return (
    <button
      type="button"
      className={`tool${active ? ' is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()} // garde la sélection dans l'éditeur
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active ?? undefined}
      title={label}
    >
      {children}
    </button>
  );
}

const TABLE_ACTIONS = [
  ['Insérer un tableau 3 × 3', (c) => c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }), false],
  ['Ajouter une ligne dessous', (c) => c.addRowAfter(), true],
  ['Ajouter une ligne dessus', (c) => c.addRowBefore(), true],
  ['Ajouter une colonne à droite', (c) => c.addColumnAfter(), true],
  ['Ajouter une colonne à gauche', (c) => c.addColumnBefore(), true],
  ['Fusionner ou scinder les cellules', (c) => c.mergeOrSplit(), true],
  ["Ligne d'en-tête", (c) => c.toggleHeaderRow(), true],
  ['Supprimer la ligne', (c) => c.deleteRow(), true],
  ['Supprimer la colonne', (c) => c.deleteColumn(), true],
  ['Supprimer le tableau', (c) => c.deleteTable(), true, 'danger'],
];

/** Toutes les actions de tableau dans un seul menu : la barre garde la même taille partout. */
function TableMenu({ editor, inTable }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="tool-menu" ref={ref}>
      <button
        type="button"
        className={`tool tool-wide${inTable ? ' is-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tableau"
        title="Tableau"
      >
        <Table size={16} /><ChevronDown size={12} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {TABLE_ACTIONS.map(([label, action, needsTable, tone]) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={`menu-item${tone ? ` menu-${tone}` : ''}`}
              disabled={needsTable !== inTable}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                action(editor.chain().focus()).run();
                setOpen(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Toolbar({ editor, canUpload, onPickFiles, uploading, onInsertSequence, onInsertCalc }) {
  const imageInput = useRef(null);
  const fileInput = useRef(null);

  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? {
      block: e.isActive('heading', { level: 1 }) ? 'h1'
        : e.isActive('heading', { level: 2 }) ? 'h2'
          : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      subscript: e.isActive('subscript'),
      superscript: e.isActive('superscript'),
      code: e.isActive('code'),
      bulletList: e.isActive('bulletList'),
      orderedList: e.isActive('orderedList'),
      taskList: e.isActive('taskList'),
      blockquote: e.isActive('blockquote'),
      codeBlock: e.isActive('codeBlock'),
      link: e.isActive('link'),
      table: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    } : null),
  });

  if (!editor || !s) return null;
  const run = () => editor.chain().focus();

  const setBlock = (value) => {
    if (value === 'p') run().setParagraph().run();
    else run().setHeading({ level: Number(value.slice(1)) }).run();
  };

  const setLink = () => {
    const previous = editor.getAttributes('link').href ?? '';
    const url = window.prompt('Adresse du lien (laisser vide pour retirer le lien)', previous);
    if (url === null) return;
    if (!url.trim()) run().extendMarkRange('link').unsetLink().run();
    else run().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const pick = (input) => (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length) onPickFiles(files);
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Mise en forme">
      <div className="tool-group">
        <Btn label={`Annuler (${mod}+Z)`} onClick={() => run().undo().run()} disabled={!s.canUndo}><Undo2 size={16} /></Btn>
        <Btn label={`Rétablir (${mod}+Maj+Z)`} onClick={() => run().redo().run()} disabled={!s.canRedo}><Redo2 size={16} /></Btn>
      </div>
      <div className="tool-group">
        <select className="tool-select" value={s.block} onChange={(e) => setBlock(e.target.value)} aria-label="Type de paragraphe">
          <option value="p">Texte</option>
          <option value="h1">Titre 1</option>
          <option value="h2">Titre 2</option>
          <option value="h3">Titre 3</option>
        </select>
      </div>
      <div className="tool-group">
        <Btn label={`Gras (${mod}+B)`} active={s.bold} onClick={() => run().toggleBold().run()}><Bold size={16} /></Btn>
        <Btn label={`Italique (${mod}+I)`} active={s.italic} onClick={() => run().toggleItalic().run()}><Italic size={16} /></Btn>
        <Btn label={`Souligné (${mod}+U)`} active={s.underline} onClick={() => run().toggleUnderline().run()}><Underline size={16} /></Btn>
        <Btn label="Barré" active={s.strike} onClick={() => run().toggleStrike().run()}><Strikethrough size={16} /></Btn>
        <Btn label="Surligner" active={s.highlight} onClick={() => run().toggleHighlight().run()}><Highlighter size={16} /></Btn>
        <Btn label={`Indice (${mod}+,)`} active={s.subscript} onClick={() => run().toggleSubscript().run()}><Subscript size={16} /></Btn>
        <Btn label={`Exposant (${mod}+.)`} active={s.superscript} onClick={() => run().toggleSuperscript().run()}><Superscript size={16} /></Btn>
        <Btn label="Code" active={s.code} onClick={() => run().toggleCode().run()}><Code size={16} /></Btn>
        <Btn label="Lien" active={s.link} onClick={setLink}><LinkIcon size={16} /></Btn>
      </div>
      <div className="tool-group">
        <Btn label="Liste à puces" active={s.bulletList} onClick={() => run().toggleBulletList().run()}><List size={16} /></Btn>
        <Btn label="Liste numérotée" active={s.orderedList} onClick={() => run().toggleOrderedList().run()}><ListOrdered size={16} /></Btn>
        <Btn label="Liste de tâches" active={s.taskList} onClick={() => run().toggleTaskList().run()}><ListChecks size={16} /></Btn>
        <Btn label="Citation" active={s.blockquote} onClick={() => run().toggleBlockquote().run()}><Quote size={16} /></Btn>
        <Btn label="Bloc de code" active={s.codeBlock} onClick={() => run().toggleCodeBlock().run()}><SquareCode size={16} /></Btn>
        <Btn label="Séparateur" onClick={() => run().setHorizontalRule().run()}><Minus size={16} /></Btn>
      </div>
      <div className="tool-group">
        <TableMenu editor={editor} inTable={s.table} />
        {onInsertCalc && <Btn label="Insérer un calcul (molarité, dilution, tampon…)" onClick={onInsertCalc}><Calculator size={16} /></Btn>}
      </div>
      {canUpload && (
        <div className="tool-group">
          <Btn label="Insérer une image (double-clic sur une image pour la retoucher)" onClick={() => imageInput.current.click()}><ImagePlus size={16} /></Btn>
          <Btn label="Joindre un fichier" onClick={() => fileInput.current.click()}><Paperclip size={16} /></Btn>
          {onInsertSequence && <Btn label="Insérer une séquence du registre" onClick={onInsertSequence}><Dna size={16} /></Btn>}
          <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={pick(imageInput)} />
          <input ref={fileInput} type="file" multiple hidden onChange={pick(fileInput)} />
          {uploading > 0 && <span className="tool-status">Envoi de {uploading} fichier{uploading > 1 ? 's' : ''}…</span>}
        </div>
      )}
    </div>
  );
}
