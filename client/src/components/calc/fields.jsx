import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Dna, X } from 'lucide-react';
import { api } from '../../api.js';
import { parseNumber } from '../../lib/calc/units.js';
import { findReagent, searchReagents, useReagents } from './useReagents.js';

const invalid = (v) => String(v ?? '').trim() !== '' && Number.isNaN(parseNumber(v));
const mwText = (mw) => (mw == null ? '' : String(mw).replace('.', ','));

/** Champ numérique : accepte la virgule ; signale une saisie qui n'est pas un nombre. */
export function NumberField({ label, value, onChange, unit, placeholder, hint, integer = false }) {
  const bad = invalid(value);
  return (
    <label className="field">
      <span>{label}</span>
      <span className={`qty${bad ? ' is-invalid' : ''}`}>
        <input
          inputMode={integer ? 'numeric' : 'decimal'}
          autoComplete="off"
          value={value ?? ''}
          placeholder={placeholder}
          aria-invalid={bad || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        {unit && <span className="qty-unit">{unit}</span>}
      </span>
      {bad ? <small className="field-error">Nombre attendu (virgule ou point).</small> : hint && <small className="hint">{hint}</small>}
    </label>
  );
}

/** Valeur + unité : { v: '500', u: 'mM' }. */
export function QtyField({ label, value, units, onChange, placeholder, hint }) {
  const q = value ?? { v: '', u: units[0] };
  const bad = invalid(q.v);
  return (
    <div className="field">
      <span>{label}</span>
      <span className={`qty${bad ? ' is-invalid' : ''}`}>
        <input
          inputMode="decimal"
          autoComplete="off"
          aria-label={label}
          aria-invalid={bad || undefined}
          value={q.v}
          placeholder={placeholder}
          onChange={(e) => onChange({ ...q, v: e.target.value })}
        />
        <select aria-label={`Unité (${label.toLowerCase()})`} value={units.includes(q.u) ? q.u : units[0]} onChange={(e) => onChange({ ...q, u: e.target.value })}>
          {units.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </span>
      {bad ? <small className="field-error">Nombre attendu (virgule ou point).</small> : hint && <small className="hint">{hint}</small>}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

/** Choix exclusif sous forme de boutons accolés. */
export function Segmented({ label, value, options, onChange }) {
  const name = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <label key={v}>
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
          <span>{text}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * Produit de la base, avec suggestions (nom, formule ou catégorie, sans tenir compte des accents).
 * onType(nom) quand on tape, onPick(produit) quand on choisit une suggestion.
 */
export function ReagentField({ label = 'Produit', value, onType, onPick, placeholder = 'Nom, formule ou catégorie', showUsage = true }) {
  const reagents = useReagents();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(false); // suggestion choisie : plus de liste tant qu'on ne retape pas
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = useMemo(() => searchReagents(reagents, value).slice(0, 8), [reagents, value]);
  const known = findReagent(reagents, value);
  const pick = (r) => {
    onPick(r);
    setPicked(true);
    setOpen(false);
  };
  const showList = open && !picked && matches.length > 0;
  const onKeyDown = (e) => {
    if (!showList) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(matches[Math.min(active, matches.length - 1)]);
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // ne ferme pas la fenêtre
      setOpen(false);
    }
  };
  const usage = known && [known.stock_conc && `solution mère ${known.stock_conc}`, known.working_conc && `usage ${known.working_conc}`, known.notes]
    .filter(Boolean).join(' · ');
  return (
    <div className="field">
      <span>{label}</span>
      <span className="combo-box">
      <input
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          onType(e.target.value);
          setOpen(true);
          setPicked(false);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul className="combo-list" role="listbox" id={listId}>
          {matches.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setActive(i)}
            >
              <span className="combo-name">{r.name}</span>
              <span className="combo-meta">{r.formula && r.formula !== r.name ? r.formula : r.category}</span>
              <span className="combo-mw">{r.mw ? `${mwText(r.mw)} g/mol` : ''}</span>
            </li>
          ))}
        </ul>
      )}
      </span>
      {showUsage && usage && <small className="hint">{usage}</small>}
    </div>
  );
}

/** Masse molaire telle qu'enregistrée dans la base, prête à être saisie dans un champ. */
export const reagentMw = (r) => mwText(r?.mw);

/** Recherche d'une séquence du registre (sans rien figer : on n'en lit que la longueur). */
function SequenceSearch({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const t = setTimeout(() => {
      api.get(`/sequences${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then((l) => setList(l.slice(0, 8))).catch(() => setList([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="seq-search">
      <span className="qty">
        <input
          ref={input}
          type="search"
          value={q}
          placeholder="Nom ou identifiant (SEQ-…)"
          aria-label="Rechercher une séquence du registre"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
        />
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer la recherche"><X size={15} /></button>
      </span>
      {list?.length === 0 && <p className="hint">Aucune séquence trouvée.</p>}
      {list?.length > 0 && (
        <ul className="combo-list combo-static">
          {list.map((s) => (
            <li key={s.id} onMouseDown={(e) => { e.preventDefault(); onPick(s); }}>
              <code>{s.code}</code>
              <span className="combo-name">{s.name}</span>
              <span className="combo-mw">{s.length.toLocaleString('fr-FR')} pb</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Longueur d'un ADN, saisie ou reprise d'une séquence du registre. value = { length, sequence }. */
export function LengthField({ label, value, onChange, unit = 'pb' }) {
  const [picking, setPicking] = useState(false);
  const bad = invalid(value.length);
  return (
    <div className="field">
      <span>{label}</span>
      <span className={`qty${bad ? ' is-invalid' : ''}`}>
        <input
          inputMode="numeric"
          autoComplete="off"
          aria-label={label}
          aria-invalid={bad || undefined}
          value={value.length ?? ''}
          placeholder="5000"
          onChange={(e) => onChange({ length: e.target.value, sequence: null })}
        />
        <span className="qty-unit">{unit}</span>
        <button type="button" className="qty-btn" onClick={() => setPicking((p) => !p)} title="Reprendre la longueur d'une séquence du registre">
          <Dna size={14} aria-hidden="true" /> Registre
        </button>
      </span>
      {value.sequence && <small className="hint">Longueur de {value.sequence.code} {value.sequence.name}</small>}
      {picking && (
        <SequenceSearch
          onClose={() => setPicking(false)}
          onPick={(s) => {
            onChange({ length: String(s.length), sequence: { id: s.id, code: s.code, name: s.name } });
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
