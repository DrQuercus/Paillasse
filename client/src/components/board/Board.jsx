import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Maximize, Minus, Plus, StickyNote, X } from 'lucide-react';
import BoardNote from './BoardNote.jsx';

const MIN_W = 3200;
const MIN_H = 2200;
const ZOOMS = [0.3, 0.45, 0.6, 0.75, 0.9, 1, 1.25, 1.5];
const POLL_MS = 3000;
const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;
const tilt = () => Math.round((Math.random() * 5 - 2.5) * 10) / 10;
const pinOf = (n) => ({ x: n.x + n.width / 2, y: n.y + 10 });

/** Fil légèrement détendu entre deux punaises (courbe quadratique). */
function stringPath(a, b) {
  const sag = Math.min(70, Math.hypot(b.x - a.x, b.y - a.y) * 0.12);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2 + sag;
  return { d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, mid: { x: (a.x + 2 * cx + b.x) / 4, y: (a.y + 2 * cy + b.y) / 4 } };
}

/**
 * Tableau d'enquêteur : post-it punaisés sur du liège, reliés par des fils.
 * client : scopedApi(...) vers /projects/:id/board ou /shared/:token/board
 */
export default function Board({ client, notify, onUnauthorized, toolbarExtra }) {
  const [notes, setNotes] = useState([]);
  const [links, setLinks] = useState([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState(null); // { type: 'note' | 'link', id }
  const [editingId, setEditingId] = useState(null);
  const [linking, setLinking] = useState(null); // { from, x, y }

  const viewportRef = useRef(null);
  const planeRef = useRef(null);
  const imageInputRef = useRef(null);
  const imageTargetRef = useRef(null);
  const revisionRef = useRef(-1);
  const activeRef = useRef(new Set()); // post-it en cours de déplacement ou d'édition : la synchro ne les écrase pas
  const notesRef = useRef(notes);
  const zoomRef = useRef(zoom);
  const pendingScroll = useRef(null);
  const textTimers = useRef({});
  notesRef.current = notes;
  zoomRef.current = zoom;

  const fail = useCallback((err) => {
    if (err.status === 401) onUnauthorized?.();
    else notify(err.message, 'error');
  }, [notify, onUnauthorized]);

  // --- Chargement et synchronisation --------------------------------------------
  const refresh = useCallback(async () => {
    const data = await client.get('');
    revisionRef.current = data.revision;
    setCanEdit(data.can_edit);
    setLinks(data.links);
    setNotes((prev) => {
      const local = new Map(prev.map((n) => [n.id, n]));
      return data.notes.map((n) => (activeRef.current.has(n.id) && local.has(n.id) ? local.get(n.id) : n));
    });
    setLoaded(true);
  }, [client]);

  useEffect(() => {
    refresh().catch(fail);
  }, [refresh, fail]);

  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return;
      try {
        const { revision } = await client.get('/revision');
        setOnline(true);
        if (revision !== revisionRef.current) await refresh();
      } catch (err) {
        if (err.status === 401) onUnauthorized?.();
        else setOnline(false);
      }
    };
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [client, refresh, onUnauthorized]);

  // Premier affichage : cadrer sur les post-it existants
  const didFit = useRef(false);
  useEffect(() => {
    if (!loaded || didFit.current) return;
    didFit.current = true;
    if (notesRef.current.length) requestAnimationFrame(() => fitAll());
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Géométrie -------------------------------------------------------------------
  const toBoard = (e) => {
    const r = planeRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoomRef.current, y: (e.clientY - r.top) / zoomRef.current };
  };

  const size = useMemo(() => ({
    width: Math.max(MIN_W, ...notes.map((n) => n.x + n.width + 900)),
    height: Math.max(MIN_H, ...notes.map((n) => n.y + 1100)),
  }), [notes]);

  const maxZ = () => Math.max(0, ...notesRef.current.map((n) => n.z));

  const zoomTo = (next, anchor) => {
    const vp = viewportRef.current;
    const clamped = Math.min(Math.max(next, ZOOMS[0]), ZOOMS.at(-1));
    const r = vp.getBoundingClientRect();
    const ax = anchor ? anchor.clientX - r.left : r.width / 2;
    const ay = anchor ? anchor.clientY - r.top : r.height / 2;
    const bx = (vp.scrollLeft + ax) / zoomRef.current;
    const by = (vp.scrollTop + ay) / zoomRef.current;
    pendingScroll.current = { left: bx * clamped - ax, top: by * clamped - ay };
    setZoom(clamped);
  };
  const zoomStep = (dir) => {
    const z = zoomRef.current;
    const next = dir > 0 ? ZOOMS.find((v) => v > z + 0.001) : [...ZOOMS].reverse().find((v) => v < z - 0.001);
    if (next) zoomTo(next);
  };

  useLayoutEffect(() => {
    const vp = viewportRef.current;
    if (vp && pendingScroll.current) {
      vp.scrollLeft = pendingScroll.current.left;
      vp.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [zoom]);

  // Ctrl/Cmd + molette (ou pincement sur pavé tactile) : zoom autour du pointeur
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return undefined;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(zoomRef.current * Math.exp(-e.deltaY * 0.0025), e);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  });

  function fitAll() {
    const vp = viewportRef.current;
    const list = notesRef.current;
    if (!vp || !list.length) return;
    const heights = new Map([...planeRef.current.querySelectorAll('[data-note-id]')].map((el) => [el.dataset.noteId, el.offsetHeight]));
    const minX = Math.min(...list.map((n) => n.x)) - 60;
    const minY = Math.min(...list.map((n) => n.y)) - 60;
    const maxX = Math.max(...list.map((n) => n.x + n.width)) + 60;
    const maxY = Math.max(...list.map((n) => n.y + (heights.get(n.id) ?? 200))) + 90;
    const z = Math.min(Math.max(Math.min(vp.clientWidth / (maxX - minX), vp.clientHeight / (maxY - minY), 1), ZOOMS[0]), ZOOMS.at(-1));
    pendingScroll.current = {
      left: minX * z - Math.max(0, (vp.clientWidth - (maxX - minX) * z) / 2),
      top: minY * z - Math.max(0, (vp.clientHeight - (maxY - minY) * z) / 2),
    };
    setZoom(z);
    if (z === zoomRef.current) {
      vp.scrollLeft = pendingScroll.current.left;
      vp.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }

  // --- Écritures -------------------------------------------------------------------
  const setLocal = (id, patch) => setNotes((list) => list.map((n) => (n.id === id ? { ...n, ...patch } : n)));

  const save = async (id, patch) => {
    try {
      const updated = await client.patch(`/notes/${id}`, patch);
      if (!activeRef.current.has(id)) setLocal(id, updated);
    } catch (err) {
      fail(err);
      refresh().catch(() => {});
    }
  };

  const createNote = async (fields, { edit = false } = {}) => {
    try {
      const note = await client.post('/notes', { rotation: tilt(), ...fields });
      setNotes((list) => [...list, note]);
      setSelected({ type: 'note', id: note.id });
      if (edit) {
        activeRef.current.add(note.id);
        setEditingId(note.id);
      }
      return note;
    } catch (err) {
      fail(err);
      return null;
    }
  };

  const visibleCenter = () => {
    const vp = viewportRef.current;
    return {
      x: (vp.scrollLeft + vp.clientWidth / 2) / zoomRef.current - 110,
      y: (vp.scrollTop + vp.clientHeight / 2) / zoomRef.current - 60,
    };
  };

  const uploadImage = async (file) => {
    if (!IMAGE_TYPES.test(file.type)) {
      notify(`${file.name} : format non affichable (PNG, JPEG, GIF ou WebP).`, 'error');
      return null;
    }
    try {
      return await client.upload('/images', file);
    } catch (err) {
      fail(err);
      return null;
    }
  };

  const createImageNotes = async (files, at) => {
    let { x, y } = at;
    for (const file of files) {
      const image = await uploadImage(file);
      if (image) await createNote({ x: Math.max(0, x), y: Math.max(0, y), image_id: image.id, color: 'white', width: 260 });
      x += 40;
      y += 40;
    }
  };

  const deleteNote = async (note) => {
    if ((note.text.trim() || note.image_id) && !window.confirm('Décrocher ce post-it du tableau ?')) return;
    setNotes((list) => list.filter((n) => n.id !== note.id));
    setLinks((list) => list.filter((l) => l.from_note !== note.id && l.to_note !== note.id));
    setSelected(null);
    try {
      await client.del(`/notes/${note.id}`);
    } catch (err) {
      fail(err);
      refresh().catch(() => {});
    }
  };

  const createLink = async (from, to) => {
    try {
      const link = await client.post('/links', { from_note: from, to_note: to });
      setLinks((list) => (list.some((l) => l.id === link.id) ? list : [...list, link]));
    } catch (err) {
      fail(err);
    }
  };

  const deleteLink = async (id) => {
    setLinks((list) => list.filter((l) => l.id !== id));
    setSelected(null);
    try {
      await client.del(`/links/${id}`);
    } catch (err) {
      fail(err);
      refresh().catch(() => {});
    }
  };

  // --- Texte -----------------------------------------------------------------------
  const startEdit = (id) => {
    activeRef.current.add(id);
    setSelected({ type: 'note', id });
    setEditingId(id);
  };

  const typeText = (id, text) => {
    setLocal(id, { text });
    clearTimeout(textTimers.current[id]);
    textTimers.current[id] = setTimeout(() => save(id, { text }), 900);
  };

  const stopEdit = (id, text) => {
    clearTimeout(textTimers.current[id]);
    activeRef.current.delete(id);
    setEditingId((current) => (current === id ? null : current));
    const note = notesRef.current.find((n) => n.id === id);
    setLocal(id, { text });
    if (note) save(id, { text });
  };

  // --- Souris : déplacer, élargir, relier --------------------------------------
  const dragWith = (onMove, onEnd) => {
    const move = (ev) => onMove(ev);
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      onEnd(ev);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // Un clic ailleurs termine la saisie en cours (le preventDefault du glisser empêcherait sinon le blur)
  const endEditingElsewhere = (noteId) => {
    if (editingId && editingId !== noteId && document.activeElement?.classList.contains('note-input')) {
      document.activeElement.blur();
    }
  };

  const onNotePointerDown = (e, note) => {
    if (e.button !== 0 || e.target.closest('.note-tools, .note-input, .note-pin, .note-resize')) return;
    endEditingElsewhere(note.id);
    setSelected({ type: 'note', id: note.id });
    if (!canEdit || editingId === note.id) return;
    e.preventDefault();
    const start = toBoard(e);
    const origin = { x: note.x, y: note.y };
    const z = maxZ() + 1;
    let moved = false;
    activeRef.current.add(note.id);
    dragWith(
      (ev) => {
        const p = toBoard(ev);
        if (!moved && Math.hypot(p.x - start.x, p.y - start.y) * zoomRef.current < 4) return;
        moved = true;
        setLocal(note.id, { x: Math.max(0, origin.x + p.x - start.x), y: Math.max(0, origin.y + p.y - start.y), z });
      },
      () => {
        activeRef.current.delete(note.id);
        if (!moved) return;
        const current = notesRef.current.find((n) => n.id === note.id);
        if (current) save(note.id, { x: current.x, y: current.y, z });
      },
    );
  };

  const onResizePointerDown = (e, note) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    const start = toBoard(e);
    activeRef.current.add(note.id);
    dragWith(
      (ev) => setLocal(note.id, { width: Math.min(520, Math.max(140, note.width + toBoard(ev).x - start.x)) }),
      () => {
        activeRef.current.delete(note.id);
        const current = notesRef.current.find((n) => n.id === note.id);
        if (current && current.width !== note.width) save(note.id, { width: Math.round(current.width) });
      },
    );
  };

  const onPinPointerDown = (e, note) => {
    if (!canEdit) return;
    e.stopPropagation();
    e.preventDefault();
    setLinking({ from: note.id, ...toBoard(e) });
    dragWith(
      (ev) => setLinking((l) => l && { ...l, ...toBoard(ev) }),
      (ev) => {
        setLinking(null);
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-note-id]');
        const to = target?.dataset.noteId;
        if (to && to !== note.id) createLink(note.id, to);
      },
    );
  };

  // --- Clavier, collage, dépôt de fichiers ---------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      if (editingId || e.target.closest?.('input, textarea, select, [contenteditable="true"], .modal')) return;
      if (e.key === 'Escape') setSelected(null);
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected && canEdit) {
        e.preventDefault();
        if (selected.type === 'link') deleteLink(selected.id);
        else {
          const note = notesRef.current.find((n) => n.id === selected.id);
          if (note) deleteNote(note);
        }
      }
    };
    const onPaste = (e) => {
      if (!canEdit || editingId || e.target.closest?.('input, textarea, [contenteditable="true"], .modal')) return;
      const files = [...(e.clipboardData?.files ?? [])].filter((f) => IMAGE_TYPES.test(f.type));
      if (files.length) {
        e.preventDefault();
        createImageNotes(files, visibleCenter());
      } else {
        const text = e.clipboardData?.getData('text/plain')?.trim();
        if (text) {
          e.preventDefault();
          createNote({ ...visibleCenter(), text: text.slice(0, 5000) });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('paste', onPaste);
    };
  });

  const onDrop = (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length || !canEdit) return;
    e.preventDefault();
    const p = toBoard(e);
    createImageNotes(files, { x: p.x - 130, y: p.y - 40 });
  };

  // --- Rendu -------------------------------------------------------------------------
  const byId = new Map(notes.map((n) => [n.id, n]));
  const strings = links
    .map((l) => ({ link: l, a: byId.get(l.from_note), b: byId.get(l.to_note) }))
    .filter((s) => s.a && s.b)
    .map((s) => ({ id: s.link.id, ...stringPath(pinOf(s.a), pinOf(s.b)) }));
  const selectedString = selected?.type === 'link' ? strings.find((s) => s.id === selected.id) : null;
  const linkFrom = linking && byId.get(linking.from);

  return (
    <div className="board">
      <div className="board-toolbar" role="toolbar" aria-label="Tableau">
        {canEdit && (
          <button type="button" className="board-btn board-btn-primary" onClick={() => createNote(visibleCenter(), { edit: true })}>
            <StickyNote size={15} /> Nouveau post-it
          </button>
        )}
        <span className="board-sep" aria-hidden="true" />
        <button type="button" className="board-btn" onClick={() => zoomStep(-1)} aria-label="Dézoomer" title="Dézoomer (Ctrl + molette)"><Minus size={15} /></button>
        <button type="button" className="board-btn board-zoom" onClick={() => zoomTo(1)} title="Taille réelle">{Math.round(zoom * 100)} %</button>
        <button type="button" className="board-btn" onClick={() => zoomStep(1)} aria-label="Zoomer" title="Zoomer (Ctrl + molette)"><Plus size={15} /></button>
        <button type="button" className="board-btn" onClick={fitAll} aria-label="Tout voir" title="Tout voir"><Maximize size={15} /></button>
        <span className={`board-sync${online ? '' : ' is-offline'}`} title={online ? 'Synchronisé avec les autres personnes sur ce tableau' : 'Serveur injoignable, nouvel essai en cours'}>
          <span className="board-sync-dot" aria-hidden="true" />{online ? 'En direct' : 'Hors ligne'}
        </span>
        {toolbarExtra}
      </div>

      <div
        ref={viewportRef}
        className="board-viewport"
        onDragOver={(e) => canEdit && e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="board-surface" style={{ width: size.width * zoom, height: size.height * zoom }}>
          <div
            ref={planeRef}
            className="board-plane"
            style={{ width: size.width, height: size.height, transform: `scale(${zoom})` }}
            onPointerDown={(e) => {
              if (e.target === planeRef.current) {
                endEditingElsewhere(null);
                setSelected(null);
              }
            }}
            onDoubleClick={(e) => {
              if (!canEdit || e.target !== planeRef.current) return;
              const p = toBoard(e);
              createNote({ x: Math.max(0, p.x - 110), y: Math.max(0, p.y - 24) }, { edit: true });
            }}
          >
            <svg className="board-strings" width={size.width} height={size.height} aria-hidden="true">
              {strings.map((s) => (
                <g key={s.id} className={`string${selected?.id === s.id ? ' is-selected' : ''}`}>
                  <path d={s.d} className="string-shadow" />
                  <path d={s.d} className="string-line" />
                  <path
                    d={s.d}
                    className="string-hit"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelected({ type: 'link', id: s.id });
                    }}
                  />
                </g>
              ))}
            </svg>

            {notes.map((note) => (
              <BoardNote
                key={note.id}
                note={note}
                canEdit={canEdit}
                selected={selected?.type === 'note' && selected.id === note.id}
                editing={editingId === note.id}
                imageUrl={(id) => `/api${client.base}/images/${id}`}
                onPointerDown={(e) => onNotePointerDown(e, note)}
                onPinPointerDown={(e) => onPinPointerDown(e, note)}
                onResizePointerDown={(e) => onResizePointerDown(e, note)}
                onStartEdit={() => startEdit(note.id)}
                onTextChange={(text) => typeText(note.id, text)}
                onStopEdit={(text) => stopEdit(note.id, text)}
                onColor={(color) => {
                  setLocal(note.id, { color });
                  save(note.id, { color });
                }}
                onPickImage={() => {
                  imageTargetRef.current = note.id;
                  imageInputRef.current.click();
                }}
                onRemoveImage={() => {
                  setLocal(note.id, { image_id: null });
                  save(note.id, { image_id: null });
                }}
                onDelete={() => deleteNote(note)}
              />
            ))}

            {selectedString && canEdit && (
              <button
                type="button"
                className="string-delete"
                style={{ left: selectedString.mid.x, top: selectedString.mid.y }}
                onClick={() => deleteLink(selectedString.id)}
                title="Couper le fil (Suppr)"
                aria-label="Couper le fil"
              >
                <X size={14} />
              </button>
            )}

            {linkFrom && (
              <svg className="board-linking" width={size.width} height={size.height} aria-hidden="true">
                <path d={stringPath(pinOf(linkFrom), linking).d} className="string-line" />
              </svg>
            )}
          </div>
        </div>

        {loaded && notes.length === 0 && (
          <div className="board-empty">
            {canEdit
              ? 'Double-cliquez sur le liège pour épingler un post-it, glissez-y une image ou collez une capture. Tirez sur une punaise pour relier deux idées.'
              : 'Ce tableau est encore vide.'}
          </div>
        )}
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          const id = imageTargetRef.current;
          if (!file || !id) return;
          const image = await uploadImage(file);
          if (image) {
            setLocal(id, { image_id: image.id });
            save(id, { image_id: image.id });
          }
        }}
      />
    </div>
  );
}
