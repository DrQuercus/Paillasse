import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from '@tiptap/react';
import { Link } from 'react-router-dom';
import { MapPin, TestTube } from 'lucide-react';
import { Cap } from './bits.jsx';

const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value) ?? fallback;
  } catch {
    return fallback;
  }
};

const POS = / › ([A-Z])(\d+)$/;

/** Aliquots d'un même tube rangés dans la même boîte : une seule ligne (« ×8, B2 à B9 »). */
export function groupSamples(list) {
  const groups = [];
  for (const s of list) {
    const base = String(s.location ?? '').replace(POS, '');
    const last = groups.at(-1);
    if (last && last.name === s.name && last.base === base) last.items.push(s);
    else groups.push({ name: s.name, base, items: [s] });
  }
  return groups;
}

function positions(items) {
  const pos = items.map((s) => POS.exec(s.location ?? '')).filter(Boolean).map((m) => `${m[1]}${m[2]}`);
  if (pos.length !== items.length) return '';
  return pos.length > 3 ? `${pos[0]} à ${pos.at(-1)}` : pos.join(', ');
}

/** Tubes rangés depuis l'entrée, ou cités : l'adresse du jour, et un lien qui suit le tube s'il bouge. */
function SampleRefView({ node }) {
  const { samples, action } = node.attrs;
  const list = samples ?? [];
  const groups = groupSamples(list);
  return (
    <NodeViewWrapper className="sampleref-node" data-drag-handle>
      <figure contentEditable={false} className="sampleref-card">
        <figcaption>
          <TestTube size={16} aria-hidden="true" />
          <strong>{action === 'stored' ? 'Tubes rangés' : 'Tubes utilisés'}</strong>
          <span className="muted"> · {list.length} tube{list.length > 1 ? 's' : ''}</span>
        </figcaption>
        <ul>
          {groups.map((g) => {
            const first = g.items[0];
            const many = g.items.length > 2;
            return (
              <li key={first.id}>
                <Cap sample={first} size={16} />
                <span className="sampleref-name">{g.name}</span>
                {many && <span className="sampleref-count">×{g.items.length}</span>}
                <code>{many ? `${first.code} → ${g.items.at(-1).code}` : g.items.map((s) => s.code).join(', ')}</code>
                {!many && first.aliquot && <span className="muted small">{g.items.map((s) => s.aliquot).join(', ')}</span>}
                <Link to={`/storage?sample=${first.id}`} className="sampleref-where" title="Ouvrir la boîte, là où est le tube aujourd’hui">
                  <MapPin size={12} aria-hidden="true" /> {g.items.length > 1 && positions(g.items) ? `${g.base} › ${positions(g.items)}` : first.location || 'sans emplacement'}
                </Link>
              </li>
            );
          })}
        </ul>
      </figure>
    </NodeViewWrapper>
  );
}

/**
 * Encart « Tubes » d'une entrée. samples : [{ id, code, name, type, cap_color, aliquot, location }],
 * l'emplacement tel qu'il était à l'insertion ; action : 'stored' (rangés depuis l'entrée) ou 'cited'.
 */
export const SampleRefNode = Node.create({
  name: 'sampleRef',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
  addAttributes() {
    return {
      samples: {
        default: [],
        parseHTML: (el) => parseJson(el.getAttribute('data-samples'), []),
        renderHTML: (a) => ({ 'data-samples': JSON.stringify(a.samples ?? []) }),
      },
      action: { default: 'cited', parseHTML: (el) => el.getAttribute('data-action') ?? 'cited', renderHTML: (a) => ({ 'data-action': a.action }) },
    };
  },
  parseHTML: () => [{ tag: 'div[data-sample-ref]' }],
  renderHTML: ({ HTMLAttributes, node }) => ['div', mergeAttributes({ 'data-sample-ref': '' }, HTMLAttributes), (node.attrs.samples ?? []).map((s) => s.code).join(' ')],
  addNodeView() {
    return ReactNodeViewRenderer(SampleRefView);
  },
});
