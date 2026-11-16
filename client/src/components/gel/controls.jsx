import { useId } from 'react';
import { Check as CheckIcon, ChevronDown } from 'lucide-react';

/** Curseur avec son libellé et sa valeur. */
export function Range({ label, value, min, max, step = 1, onChange, onCommit, format = (v) => v, hint }) {
  const id = useId();
  return (
    <div className="gel-range">
      <label htmlFor={id}><span>{label}</span><output>{format(value)}</output></label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
      />
      {hint && <small className="hint">{hint}</small>}
    </div>
  );
}

/** Case à cocher avec texte. */
export function Check({ checked, onChange, children, disabled, hint }) {
  return (
    <label className={`check${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}{hint && <small className="hint">{hint}</small>}</span>
    </label>
  );
}

/** Section repliable à titre (utilisée par l'atelier Statistiques). */
export function Section({ title, children, open = true, aside }) {
  return (
    <details className="gel-section" open={open}>
      <summary><span>{title}</span>{aside}</summary>
      <div className="gel-section-body">{children}</div>
    </details>
  );
}

/** Groupe de réglages avec un petit titre, toujours visible. */
export function Group({ title, aside, children }) {
  return (
    <div className="gel-group">
      {title && <div className="gel-group-title"><span>{title}</span>{aside}</div>}
      {children}
    </div>
  );
}

/** Réglages moins courants, repliés : une ligne tant qu'on n'en a pas besoin. */
export function More({ title, aside, open = false, children }) {
  return (
    <details className="gel-more" open={open}>
      <summary><span>{title}</span>{aside}</summary>
      <div className="gel-more-body">{children}</div>
    </details>
  );
}

/**
 * Module de l'atelier : en-tête (titre, résumé d'une ligne, fait ou non) et contenu déplié à la demande.
 * Un seul module ouvert à la fois : le panneau reste court.
 */
export function ModuleCard({ title, icon: Icon, summary, done, open, onToggle, children }) {
  return (
    <section className={`gel-mod${open ? ' is-open' : ''}`}>
      <button type="button" className="gel-mod-head" aria-expanded={open} onClick={onToggle}>
        <span className={`gel-mod-icon${done ? ' is-done' : ''}`}>{done && !open ? <CheckIcon size={14} aria-label="fait" /> : <Icon size={15} aria-hidden="true" />}</span>
        <span className="gel-mod-text">
          <span className="gel-mod-title">{title}</span>
          {summary && <span className="gel-mod-summary">{summary}</span>}
        </span>
        <ChevronDown size={15} className="gel-mod-chev" aria-hidden="true" />
      </button>
      {open && <div className="gel-mod-body">{children}</div>}
    </section>
  );
}

export { Segmented } from '../calc/fields.jsx';
