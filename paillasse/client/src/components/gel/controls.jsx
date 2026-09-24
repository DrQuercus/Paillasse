import { useId } from 'react';

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

/** Section repliable d'un panneau d'étape. */
export function Section({ title, children, open = true, aside }) {
  return (
    <details className="gel-section" open={open}>
      <summary><span>{title}</span>{aside}</summary>
      <div className="gel-section-body">{children}</div>
    </details>
  );
}

export { Segmented } from '../calc/fields.jsx';
