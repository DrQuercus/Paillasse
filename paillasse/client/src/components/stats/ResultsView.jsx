import { AlertTriangle } from 'lucide-react';

/** Feuille de résultats (comme dans Prism) : méthode, sections de libellés et valeurs, tableaux. */
export default function ResultsView({ res, compact = false }) {
  if (!res) return null;
  if (res.error) return <p className="st-error"><AlertTriangle size={15} aria-hidden="true" /> {res.error}</p>;
  return (
    <div className={`st-results${compact ? ' is-compact' : ''}`}>
      {res.method && <p className="st-method">{res.method}</p>}
      {res.warnings?.length > 0 && (
        <ul className="gel-warnings st-warnings">{res.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}
      {res.sections.map((s) => (
        <section key={s.title} className="st-section">
          <h4>{s.title}</h4>
          {s.table ? (
            <div className="calc-table-wrap">
              <table className="calc-table st-table">
                <thead><tr>{s.table.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                <tbody>{s.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
              </table>
            </div>
          ) : (
            <table className="calc-table st-kv">
              <tbody>{s.rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td className={/^(\*+|ns)$/.test(v) ? 'st-stars' : ''}>{v}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      ))}
    </div>
  );
}
