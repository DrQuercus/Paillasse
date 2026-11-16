import { useEffect, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/react';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import { Dna } from 'lucide-react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

/** Carte « séquence du registre » dans une entrée : pointe vers une version figée précise. */
function SequenceRefView({ node }) {
  const a = node.attrs;
  return (
    <NodeViewWrapper className="seqref" data-drag-handle>
      <Dna size={18} aria-hidden="true" />
      <span className="seqref-main">
        <span className="seqref-name">{a.name}</span>
        <span className="seqref-meta">
          <code>{a.code}</code> version {a.version}, {Number(a.length).toLocaleString('fr-FR')} pb, {a.circular ? 'circulaire' : 'linéaire'}
        </span>
      </span>
      <a className="seqref-open" href={`/sequences/${a.sequenceId}?version=${a.version}`} target="_blank" rel="noreferrer" contentEditable={false}>
        Ouvrir
      </a>
    </NodeViewWrapper>
  );
}

export const SequenceRefNode = Node.create({
  name: 'sequenceRef',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      sequenceId: { default: null },
      code: { default: '' },
      name: { default: '' },
      version: { default: 1 },
      length: { default: 0 },
      circular: { default: false },
    };
  },
  parseHTML: () => [{ tag: 'div[data-sequence-ref]' }],
  renderHTML: ({ HTMLAttributes, node }) => [
    'div',
    mergeAttributes({ 'data-sequence-ref': '' }, HTMLAttributes),
    `${node.attrs.code} ${node.attrs.name} (version ${node.attrs.version})`,
  ],
  addNodeView() {
    return ReactNodeViewRenderer(SequenceRefView);
  },
});

/** Choisir une séquence du registre ; on fige une version si besoin, pour que l'entrée pointe vers un état précis. */
export function SequencePicker({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/sequences${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then(setList).catch((e) => setError(e.message));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const choose = async (s) => {
    setBusy(true);
    try {
      const r = await api.post(`/sequences/${s.id}/versions`, {});
      onPick({ sequenceId: s.id, code: s.code, name: s.name, version: r.version.version_number, length: s.length, circular: s.circular });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Insérer une séquence du registre" onClose={onClose} wide>
      <input
        className="picker-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nom, identifiant ou bout de séquence"
        aria-label="Rechercher une séquence"
      />
      <p className="hint">L'entrée pointera vers la dernière version figée (une version est créée si la copie de travail a changé).</p>
      {error && <p className="form-error">{error}</p>}
      {list?.length === 0 && <p className="muted">Aucune séquence. Importez-en depuis la page Séquences.</p>}
      <ul className="picker-list">
        {list?.map((s) => (
          <li key={s.id}>
            <button type="button" className="picker-item" onClick={() => choose(s)} disabled={busy}>
              <code>{s.code}</code>
              <span className="picker-name">{s.name}</span>
              <span className="muted small">{s.length.toLocaleString('fr-FR')} pb, {s.circular ? 'circulaire' : 'linéaire'}</span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
