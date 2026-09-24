import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { formatShortDate } from '../lib/format.js';
import { StatusBadge } from '../components/EntryList.jsx';

/** Transforme « texte ⟦terme⟧ texte » en éléments React, sans HTML injecté. */
function Snippet({ text }) {
  if (!text) return null;
  const parts = text.split(/(⟦[^⟧]*⟧)/g);
  return (
    <span className="search-snippet">
      {parts.map((part, i) =>
        part.startsWith('⟦') ? <mark key={i}>{part.slice(1, -1)}</mark> : <span key={i}>{part}</span>,
      )}
    </span>
  );
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const { notify } = useApp();
  const [input, setInput] = useState(q);
  const [results, setResults] = useState(null);

  useEffect(() => {
    setInput(q);
    if (!q.trim()) {
      setResults(null);
      return;
    }
    let cancelled = false;
    api.get(`/search?q=${encodeURIComponent(q)}`)
      .then((r) => !cancelled && setResults(r))
      .catch((err) => notify(err.message, 'error'));
    return () => { cancelled = true; };
  }, [q, notify]);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Recherche</h1>
      </header>
      <form className="search-form" role="search" onSubmit={(e) => { e.preventDefault(); setParams(input.trim() ? { q: input.trim() } : {}); }}>
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Un mot, un début de mot, une construction, un tampon…"
          aria-label="Termes recherchés"
          autoFocus
        />
        <button className="btn btn-primary">Rechercher</button>
      </form>
      {results?.length === 0 && <p className="muted">Aucune entrée ne contient « {q} ».</p>}
      {results?.length > 0 && (
        <>
          <p className="muted">{results.length} entrée{results.length > 1 ? 's' : ''}</p>
          <ul className="entry-list">
            {results.map((r) => (
              <li key={r.id}>
                <Link to={`/entries/${r.id}`} className="entry-row">
                  <span className="entry-row-main">
                    <span className="entry-row-title">{r.title}</span>
                    <Snippet text={r.snippet} />
                  </span>
                  <span className="entry-row-meta">
                    <span className="project-tag">
                      <span className="project-dot" style={{ background: r.project_color }} aria-hidden="true" />
                      {r.project_name}
                    </span>
                    <time dateTime={r.entry_date}>{formatShortDate(r.entry_date)}</time>
                    <StatusBadge status={r.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
