import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../../api.js';
import Modal from '../Modal.jsx';
import Gel, { LADDERS } from './Gel.jsx';

const FILTERS = [['1', 'Coupe 1 fois'], ['2', 'Coupe 2 fois'], ['any', 'Toutes celles qui coupent'], ['0', 'Ne coupe pas']];
const nf = (x) => x.toLocaleString('fr-FR');
const ends = (list) => (list ? list.map((e) => `${e.enzyme}${e.bases ? ` (${e.type} ${e.bases})` : ' (franche)'}`).join(' + ') : 'extrémité');

/** Digestion virtuelle : choix des enzymes, fragments, gel d'agarose. */
export default function DigestDialog({ sequenceId, version, name, onClose, notify }) {
  const [cutters, setCutters] = useState(null);
  const [meta, setMeta] = useState({});
  const [filter, setFilter] = useState('1');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState([]);
  const [result, setResult] = useState(null);
  const [ladder, setLadder] = useState('GeneRuler 1 kb');
  const v = version ? `?version=${version}` : '';

  useEffect(() => {
    api.get(`/sequences/${sequenceId}/cutters${v}`).then(setCutters).catch((e) => notify(e.message, 'error'));
    api.get('/tools/enzymes').then((d) => setMeta(Object.fromEntries(d.enzymes.map((e) => [e.name, e])))).catch(() => {});
  }, [sequenceId, v, notify]);

  useEffect(() => {
    if (!selected.length) {
      setResult(null);
      return;
    }
    api.post(`/sequences/${sequenceId}/digest${v}`, { enzymes: selected }).then(setResult).catch((e) => notify(e.message, 'error'));
  }, [selected, sequenceId, v, notify]);

  const list = useMemo(() => {
    if (!cutters) return [];
    const term = q.trim().toLowerCase();
    return cutters.enzymes.filter((e) => {
      if (term) return e.name.toLowerCase().includes(term) || meta[e.name]?.site.toLowerCase().includes(term);
      if (filter === 'any') return e.count > 0;
      return e.count === Number(filter);
    });
  }, [cutters, filter, q, meta]);

  const toggle = (name) => setSelected((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name].slice(0, 10)));

  const lanes = result ? [
    ...(cutters?.circular ? [{ label: 'Non coupé', bands: [{ size: Math.round(result.length * 0.7), uncut: true }] }] : []),
    { label: selected.join(' + ').slice(0, 18) || 'Digestion', bands: result.fragments.map((f) => ({ size: f.uncut ? Math.round(f.length * 0.7) : f.length, uncut: f.uncut })) },
  ] : [];

  return (
    <Modal wide title={`Digestion virtuelle : ${name}`} onClose={onClose}>
      <div className="tool-layout">
        <div className="tool-side">
          <input className="picker-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Enzyme ou site (ex. BsaI, GAATTC)" aria-label="Rechercher une enzyme" />
          {!q && (
            <div className="chip-row" role="radiogroup" aria-label="Filtrer les enzymes">
              {FILTERS.map(([k, label]) => (
                <button key={k} type="button" role="radio" aria-checked={filter === k} className={`chip${filter === k ? ' is-active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
              ))}
            </div>
          )}
          <div className="enzyme-list" role="listbox" aria-multiselectable="true" aria-label="Enzymes">
            {!cutters && <p className="muted small">Recherche des sites…</p>}
            {list.map((e) => (
              <label key={e.name} className={`enzyme-item${selected.includes(e.name) ? ' is-selected' : ''}`}>
                <input type="checkbox" checked={selected.includes(e.name)} onChange={() => toggle(e.name)} />
                <span className="enzyme-name">{e.name}</span>
                <code className="enzyme-site">{meta[e.name]?.site}</code>
                <span className="enzyme-count">{e.count === 0 ? '0' : `${e.count}×`}</span>
              </label>
            ))}
            {cutters && !list.length && <p className="muted small">Aucune enzyme.</p>}
          </div>
          <p className="hint">{cutters ? `${nf(cutters.enzymes.filter((e) => e.count === 1).length)} enzymes commerciales coupent une seule fois (base REBASE).` : ''}</p>
        </div>

        <div className="tool-main">
          <div className="chip-row">
            {selected.map((s) => (
              <button key={s} type="button" className="chip is-active" onClick={() => toggle(s)} title="Retirer">{s} <X size={12} /></button>
            ))}
            {!selected.length && <span className="muted small">Cochez une ou plusieurs enzymes.</span>}
          </div>
          {result && (
            <>
              <div className="gel-row">
                <Gel lanes={lanes} ladder={ladder} />
                <label className="field gel-ladder">
                  <span>Marqueur</span>
                  <select value={ladder} onChange={(e) => setLadder(e.target.value)}>
                    {Object.keys(LADDERS).map((l) => <option key={l}>{l}</option>)}
                  </select>
                </label>
              </div>
              <table className="frag-table">
                <thead><tr><th className="num">Taille</th><th>Position</th><th>Extrémité gauche</th><th>Extrémité droite</th></tr></thead>
                <tbody>
                  {result.fragments.map((f) => (
                    <tr key={`${f.start}-${f.length}`}>
                      <td className="num">{nf(f.length)} pb</td>
                      <td>{f.uncut ? 'plasmide non coupé' : `${nf(f.start + 1)} – ${nf(f.end + 1)}`}</td>
                      <td>{ends(f.left)}</td>
                      <td>{ends(f.right)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cutters?.circular && <p className="hint">La bande « non coupé » est indicative : un plasmide surenroulé migre plus vite que sa taille réelle.</p>}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
