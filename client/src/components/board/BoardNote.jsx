import { useEffect, useRef } from 'react';
import { ImageMinus, ImagePlus, Pencil, Trash2 } from 'lucide-react';

export const NOTE_COLORS = {
  yellow: { label: 'Jaune', bg: '#FFE98A' },
  pink: { label: 'Rose', bg: '#FFC4D3' },
  blue: { label: 'Bleu', bg: '#BFE3F6' },
  green: { label: 'Vert', bg: '#CDEDB6' },
  orange: { label: 'Orange', bg: '#FFD3A3' },
  white: { label: 'Fiche blanche', bg: '#FBFAF4' },
};

/** Un post-it : punaise (point d'accroche des fils), image éventuelle, texte manuscrit. */
export default function BoardNote({
  note, selected, editing, canEdit, imageUrl,
  onPointerDown, onPinPointerDown, onResizePointerDown,
  onStartEdit, onTextChange, onStopEdit, onColor, onPickImage, onRemoveImage, onDelete,
}) {
  const textRef = useRef(null);

  useEffect(() => {
    if (!editing || !textRef.current) return;
    const el = textRef.current;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  // Le champ de saisie grandit avec le texte
  const fit = (el) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(() => {
    if (editing && textRef.current) fit(textRef.current);
  }, [editing]);

  const title = [
    `Épinglé par ${note.author_name}`,
    note.updated_by_name && note.updated_by_name !== note.author_name ? `modifié par ${note.updated_by_name}` : '',
  ].filter(Boolean).join(', ');

  return (
    <div
      data-note-id={note.id}
      className={`note${selected ? ' is-selected' : ''}${editing ? ' is-editing' : ''}${canEdit ? '' : ' is-readonly'}`}
      style={{
        left: note.x,
        top: note.y,
        width: note.width,
        zIndex: note.z + 1,
        transform: `rotate(${note.rotation}deg)`,
        '--note-bg': NOTE_COLORS[note.color]?.bg ?? NOTE_COLORS.yellow.bg,
      }}
      onPointerDown={onPointerDown}
      onDoubleClick={(e) => {
        if (!canEdit || e.target.closest('.note-tools, .note-pin, .note-resize')) return;
        e.stopPropagation();
        onStartEdit();
      }}
      title={title}
    >
      <span
        className="note-pin"
        onPointerDown={onPinPointerDown}
        title={canEdit ? 'Tirer un fil vers un autre post-it' : undefined}
        aria-hidden="true"
      />
      {note.image_id && <img className="note-image" src={imageUrl(note.image_id)} alt="" draggable={false} />}
      {editing ? (
        <textarea
          ref={textRef}
          className="note-input"
          defaultValue={note.text}
          maxLength={5000}
          placeholder="Une idée, une piste, une question…"
          onChange={(e) => {
            fit(e.target);
            onTextChange(e.target.value);
          }}
          onBlur={(e) => onStopEdit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) e.currentTarget.blur();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="note-text">
          {note.text || (canEdit && !note.image_id ? <span className="note-placeholder">Double-clic pour écrire</span> : null)}
        </div>
      )}
      <div className="note-author">{note.author_name}</div>

      {canEdit && selected && !editing && (
        <div className="note-tools" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {Object.entries(NOTE_COLORS).map(([key, c]) => (
            <button
              key={key}
              type="button"
              className={`note-swatch${note.color === key ? ' is-active' : ''}`}
              style={{ background: c.bg }}
              onClick={() => onColor(key)}
              title={c.label}
              aria-label={c.label}
              aria-pressed={note.color === key}
            />
          ))}
          <span className="note-tools-sep" aria-hidden="true" />
          <button type="button" className="note-tool" onClick={onStartEdit} title="Modifier le texte" aria-label="Modifier le texte">
            <Pencil size={15} />
          </button>
          {note.image_id ? (
            <button type="button" className="note-tool" onClick={onRemoveImage} title="Retirer l'image" aria-label="Retirer l'image">
              <ImageMinus size={15} />
            </button>
          ) : (
            <button type="button" className="note-tool" onClick={onPickImage} title="Ajouter une image" aria-label="Ajouter une image">
              <ImagePlus size={15} />
            </button>
          )}
          <button type="button" className="note-tool note-tool-danger" onClick={onDelete} title="Décrocher le post-it (Suppr)" aria-label="Décrocher le post-it">
            <Trash2 size={15} />
          </button>
        </div>
      )}
      {canEdit && <span className="note-resize" onPointerDown={onResizePointerDown} title="Élargir" aria-hidden="true" />}
    </div>
  );
}
