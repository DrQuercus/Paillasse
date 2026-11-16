import { useEffect, useRef, useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import { api } from '../../api.js';
import { SampleIcon } from './cryo.jsx';

/**
 * « Où est… ? » : nom, code ECH-…, plasmide du registre, concentration. Entrée ouvre le premier résultat
 * (une douchette qui tape un code puis Entrée marche directement).
 */
export default function WhereIs({ onFound }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return undefined; }
    const t = setTimeout(() => {
      api.get(`/inventory/samples?limit=12&q=${encodeURIComponent(q.trim())}`).then((r) => { setResults(r); setActive(0); setOpen(true); }).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (s) => {
    setOpen(false);
    setQ('');
    onFound(s);
  };

  return (
    <div className="whereis" ref={box}>
      <label className="whereis-input">
        <MapPin size={17} aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === 'Enter' && results[active]) { e.preventDefault(); pick(results[active]); }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Où est… ? nom, code ECH-…, plasmide"
          aria-label="Où est… ? Chercher un tube"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="whereis-list"
        />
        <Search size={15} aria-hidden="true" className="muted" />
      </label>
      {open && q.trim() && (
        <ul className="whereis-list" id="whereis-list" role="listbox">
          {results.length === 0 && <li className="muted small whereis-none">Aucun tube ne correspond.</li>}
          {results.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button type="button" className={`whereis-item${i === active ? ' is-active' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => pick(s)}>
                <SampleIcon sample={s} size={20} />
                <span className="whereis-text">
                  <strong>{s.name}</strong> <span className="muted small">{s.code}{s.status === 'out' ? ' · hors du froid' : ''}</span>
                  <span className="whereis-path">{s.location || 'sans emplacement'}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
