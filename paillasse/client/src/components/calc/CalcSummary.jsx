import { Calculator } from 'lucide-react';

/**
 * Résultat d'un calcul, tel qu'il est inséré et scellé dans une entrée.
 * Même rendu pour l'aperçu, l'encart de l'éditeur et la lecture seule.
 */
export default function CalcSummary({ summary, actions, preview = false }) {
  const s = summary ?? {};
  const inputs = s.inputs ?? [];
  const results = s.results ?? [];
  return (
    <div className={`calc-card${preview ? ' is-preview' : ''}`}>
      <div className="calc-card-head">
        <Calculator size={17} aria-hidden="true" />
        <span className="calc-card-title">
          {s.title ?? 'Calcul'}
          {s.label && <span className="calc-card-label">{s.label}</span>}
        </span>
        {actions && <span className="calc-card-actions">{actions}</span>}
      </div>
      {inputs.length > 0 && (
        <dl className="calc-pairs calc-inputs">
          {inputs.map((i) => (
            <div key={i.label}><dt>{i.label}</dt><dd>{i.value}</dd></div>
          ))}
        </dl>
      )}
      {s.table && (
        <div className="calc-table-wrap">
          <table className="calc-table">
            <thead><tr>{s.table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {s.table.rows.map((row, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results.length > 0 && (
        <dl className="calc-pairs calc-results">
          {results.map((r) => (
            <div key={r.label} className={r.main ? 'is-main' : ''}><dt>{r.label}</dt><dd>{r.value}</dd></div>
          ))}
        </dl>
      )}
      {(s.notes ?? []).map((n) => <p key={n} className="calc-note">{n}</p>)}
      {s.formula && <p className="calc-formula">{s.formula}</p>}
    </div>
  );
}
