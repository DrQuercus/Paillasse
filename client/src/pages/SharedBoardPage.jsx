import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { api, scopedApi } from '../api.js';
import Board from '../components/board/Board.jsx';
import Toasts from '../components/Toasts.jsx';

const NAME_KEY = 'paillasse.guestName';
const readName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
const storeName = (name) => {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch { /* stockage indisponible : le nom vaut pour cette visite */ }
};

/** Tableau ouvert par un lien partagé, sans compte : mot de passe commun + prénom. */
export default function SharedBoardPage({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(readName);
  const [loginError, setLoginError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);
  const nameRef = useRef(name);
  nameRef.current = name;

  const notify = useCallback((message, kind = 'info') => {
    const id = ++counter.current;
    setToasts((list) => [...list, { id, message, kind }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 8000 : 4000);
  }, []);

  const load = useCallback(() => {
    api.get(`/shared/${token}`)
      .then((i) => {
        setInfo(i);
        document.title = `${i.title} : tableau`;
      })
      .catch((err) => setError(err.message));
  }, [token]);
  useEffect(load, [load]);

  // Le prénom accompagne chaque modification pour signer les post-it
  const client = useMemo(
    () => scopedApi(`/shared/${token}/board`, () => ({ 'X-Paillasse-Guest': encodeURIComponent(nameRef.current || 'Invité') })),
    [token],
  );

  const login = async (e) => {
    e.preventDefault();
    setBusy(true);
    setLoginError('');
    try {
      await api.post(`/shared/${token}/login`, { password });
      storeName(name.trim());
      setInfo((i) => ({ ...i, authorized: true }));
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rename = () => {
    const next = window.prompt('Votre prénom (il signe vos post-it)', name);
    if (next === null) return;
    setName(next.trim().slice(0, 40));
    storeName(next.trim().slice(0, 40));
  };

  if (error) {
    return (
      <div className="login">
        <div className="login-sheet">
          <h1 className="brand-title">Paillasse</h1>
          <p>{error}</p>
          <p className="muted small">Demandez un nouveau lien à la personne qui vous l'a envoyé.</p>
        </div>
      </div>
    );
  }
  if (!info) return <div className="splash" aria-busy="true" />;

  if (!info.authorized) {
    return (
      <div className="login">
        <form className="login-sheet" onSubmit={login}>
          <h1 className="brand-title">{info.title}</h1>
          <p className="login-lead">Tableau partagé {info.mode === 'read' ? 'en lecture seule' : ''}</p>
          <label className="field">
            <span>Mot de passe du tableau</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
          </label>
          {info.mode === 'edit' && (
            <label className="field">
              <span>Votre prénom</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Il signe vos post-it" />
            </label>
          )}
          {loginError && <p className="form-error" role="alert">{loginError}</p>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Ouverture…' : 'Ouvrir le tableau'}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="board-page board-page-shared">
      <header className="board-head">
        <span className="brand-small">Paillasse</span>
        <h1>{info.title}</h1>
        {info.mode === 'read' && <span className="badge badge-draft">Lecture seule</span>}
        {info.mode === 'edit' && (
          <button type="button" className="btn btn-ghost board-share" onClick={rename} title="Changer de prénom">
            <UserRound size={15} /> {name || 'Invité'}
          </button>
        )}
      </header>
      <Board
        client={client}
        notify={notify}
        onUnauthorized={() => setInfo((i) => ({ ...i, authorized: false }))}
      />
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((list) => list.filter((t) => t.id !== id))} />
    </div>
  );
}
