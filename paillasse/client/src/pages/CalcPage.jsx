import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Copy, FilePlus2, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { CALCULATORS, getCalculator, runCalculator, summaryToText } from '../lib/calc/calculators.js';
import { fold } from '../lib/calc/units.js';
import { formatShortDate } from '../lib/format.js';
import { copyText } from '../lib/clipboard.js';
import Modal from '../components/Modal.jsx';
import CalcForm from '../components/calc/CalcForm.jsx';
import CalcSummary from '../components/calc/CalcSummary.jsx';
import ReagentsPanel from '../components/calc/ReagentsPanel.jsx';
import { lastKind, storeParams, storedParams } from '../components/calc/store.js';
import { takeDraft } from '../components/calc/draft.js';

/** Choisir le brouillon où ajouter le calcul (il s'ajoute à la fin de l'entrée). */
function EntryTargetDialog({ node, onClose }) {
  const { notify, openNewEntry } = useApp();
  const navigate = useNavigate();
  const [entries, setEntries] = useState(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/entries?limit=200')
      .then((list) => setEntries(list.filter((e) => e.status === 'draft')))
      .catch((err) => { notify(err.message, 'error'); setEntries([]); });
  }, [notify]);

  const shown = useMemo(() => {
    const needle = fold(q).trim();
    return (entries ?? []).filter((e) => !needle || fold(`${e.title} ${e.project_name}`).includes(needle)).slice(0, 50);
  }, [entries, q]);

  const choose = async (entry) => {
    setBusy(true);
    try {
      await api.post(`/entries/${entry.id}/blocks`, { node });
      notify(`Calcul ajouté à « ${entry.title} ».`, 'success');
      navigate(`/entries/${entry.id}`);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal title="Insérer le calcul dans une entrée" onClose={onClose} wide>
      <input
        className="picker-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Titre de l’entrée ou projet"
        aria-label="Rechercher une entrée"
      />
      <p className="hint">Le calcul s’ajoute à la fin du brouillon choisi. Les entrées verrouillées ne sont pas proposées : utilisez un addendum.</p>
      {entries?.length === 0 && (
        <div className="empty">
          <p>Aucun brouillon en cours.</p>
          <button type="button" className="btn" onClick={() => { onClose(); openNewEntry(); }}><FilePlus2 size={15} /> Nouvelle entrée</button>
        </div>
      )}
      {shown.length > 0 && (
        <ul className="picker-list">
          {shown.map((e) => (
            <li key={e.id}>
              <button type="button" className="picker-item" onClick={() => choose(e)} disabled={busy}>
                <span className="project-dot" style={{ background: e.project_color }} aria-hidden="true" />
                <span className="picker-name">{e.title}</span>
                <span className="muted small">{e.project_name}, {formatShortDate(e.entry_date)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function Calculator({ kind }) {
  const { notify } = useApp();
  const calc = getCalculator(kind);
  const [params, setParams] = useState(() => {
    const draft = takeDraft();
    return draft?.kind === kind ? { ...calc.defaults(), ...draft.params } : storedParams(kind);
  });
  const [target, setTarget] = useState(null);
  const result = useMemo(() => runCalculator(kind, params), [kind, params]);

  const onChange = useCallback((next) => {
    setParams(next);
    storeParams(kind, next);
  }, [kind]);

  const copy = async () => {
    try {
      await copyText(summaryToText(result.summary));
      notify('Résultat copié.', 'success');
    } catch {
      notify('Copie impossible dans ce navigateur.', 'error');
    }
  };

  return (
    <div className="calc-layout">
      <section className="calc-main" aria-labelledby="calc-title">
        <h2 id="calc-title">{calc.name}</h2>
        <p className="calc-desc">{calc.description}</p>
        <CalcForm kind={kind} params={params} onChange={onChange} />
      </section>
      <aside className="calc-side" aria-live="polite">
        {result.ok
          ? <CalcSummary summary={result.summary} preview />
          : <p className={result.message ? 'form-error' : 'calc-waiting'}>{result.message ?? 'Le résultat s’affiche dès que les valeurs nécessaires sont saisies.'}</p>}
        <div className="calc-side-actions">
          <button type="button" className="btn btn-primary" disabled={!result.ok} onClick={() => setTarget({ type: 'labCalc', attrs: { kind, params, summary: result.summary } })}>
            <FilePlus2 size={15} /> Insérer dans une entrée…
          </button>
          <button type="button" className="btn" disabled={!result.ok} onClick={copy}><Copy size={15} /> Copier</button>
          <button type="button" className="btn btn-ghost" onClick={() => onChange(calc.defaults())}><RotateCcw size={15} /> Effacer</button>
        </div>
        <p className="hint">Dans une entrée, le bouton <strong>Calcul</strong> de la barre d’outils insère aussi un calcul à l’endroit du curseur.</p>
      </aside>
      {target && <EntryTargetDialog node={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

export default function CalcPage() {
  const { kind } = useParams();
  if (!kind) return <Navigate to={`/calc/${lastKind()}`} replace />;
  if (kind !== 'reagents' && !getCalculator(kind)) return <Navigate to="/calc" replace />;

  return (
    <div className="page page-wide calc-page">
      <header className="page-head">
        <div>
          <h1>Calculs</h1>
          <p className="page-lead">
            Les outils de paillasse. Un calcul inséré dans une entrée y garde ses valeurs,
            et il est scellé avec la version, comme le reste de la page.
          </p>
        </div>
      </header>
      <nav className="project-tabs calc-tabs" aria-label="Calculateurs">
        {CALCULATORS.map((c) => (
          <NavLink key={c.kind} to={`/calc/${c.kind}`} className="project-tab">{c.short}</NavLink>
        ))}
        <NavLink to="/calc/reagents" className="project-tab calc-tab-reagents">Produits</NavLink>
      </nav>
      {kind === 'reagents' ? <ReagentsPanel /> : <Calculator key={kind} kind={kind} />}
    </div>
  );
}
