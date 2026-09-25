import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { api } from '../api.js';
import Modal from './Modal.jsx';

/**
 * Changer son mot de passe. forced : premier passage après un mot de passe provisoire donné par
 * l'administrateur (on ne peut pas fermer, seulement se déconnecter).
 */
export default function PasswordDialog({ forced = false, onDone, onClose, onLogout }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = confirm && next !== confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) return;
    setBusy(true);
    setError('');
    try {
      onDone(await api.post('/auth/password', { current, next }));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={forced ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}
      onClose={forced ? () => {} : onClose}
      closable={!forced}
      footer={(
        <>
          {forced
            ? <button type="button" className="btn btn-ghost modal-foot-left" onClick={onLogout}>Se déconnecter</button>
            : <button type="button" className="btn" onClick={onClose}>Annuler</button>}
          <button type="submit" form="password-form" className="btn btn-primary" disabled={busy || !current || next.length < 8 || next !== confirm}>
            <KeyRound size={15} /> Enregistrer
          </button>
        </>
      )}
    >
      <form id="password-form" className="form-stack" onSubmit={submit}>
        {forced && <p className="modal-lead">L’administrateur vous a donné un mot de passe provisoire. Choisissez le vôtre pour continuer : lui seul le connaîtra.</p>}
        <label className="field">
          <span>{forced ? 'Mot de passe provisoire' : 'Mot de passe actuel'}</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </label>
        <label className="field">
          <span>Nouveau mot de passe</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
          <small className="hint">8 caractères au moins. Une phrase courte se retient mieux qu’un mot compliqué.</small>
        </label>
        <label className="field">
          <span>Confirmation</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required aria-invalid={Boolean(mismatch)} />
          {mismatch && <small className="form-error">Les deux saisies ne correspondent pas.</small>}
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="hint">Vos autres sessions (autres ordinateurs, téléphone) seront fermées.</p>
      </form>
    </Modal>
  );
}
