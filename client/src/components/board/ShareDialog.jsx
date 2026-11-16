import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { api } from '../../api.js';
import Modal from '../Modal.jsx';

/** Copie dans le presse-papiers, y compris en HTTP simple (où navigator.clipboard n'existe pas). */
async function copyText(input) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(input.value);
    return;
  }
  input.select();
  document.execCommand('copy');
}

export default function ShareDialog({ projectId, onClose, onChange, notify }) {
  const [info, setInfo] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('edit');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const linkRef = useRef(null);

  useEffect(() => {
    api.get(`/projects/${projectId}/board/share`)
      .then((i) => {
        setInfo(i);
        setEnabled(i.enabled);
        setMode(i.mode);
      })
      .catch((err) => notify(err.message, 'error'));
  }, [projectId, notify]);

  const saveShare = async (extra = {}) => {
    setBusy(true);
    try {
      const i = await api.put(`/projects/${projectId}/board/share`, { enabled, mode, password, ...extra });
      setInfo(i);
      setEnabled(i.enabled);
      setPassword('');
      onChange?.(i);
      notify(i.enabled ? (extra.regenerate ? "Nouveau lien créé : l'ancien ne fonctionne plus." : 'Partage enregistré.') : 'Le tableau n’est plus partagé.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const url = info?.token ? `${window.location.origin}/b/${info.token}` : '';
  const needsPassword = enabled && !info?.has_password && !password;

  return (
    <Modal
      title="Partager le tableau"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Fermer</button>
          <button type="button" className="btn btn-primary" onClick={() => saveShare()} disabled={!info || busy || needsPassword}>
            Enregistrer
          </button>
        </>
      )}
    >
      {!info ? <p className="muted">Chargement…</p> : (
        <div className="form-stack">
          <label className="check">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>
              Partager ce tableau par lien
              <span className="hint">Les invités n'ont pas besoin de compte : ils entrent le mot de passe du lien et un prénom pour signer leurs post-it. Ils ne voient que ce tableau, jamais les entrées du cahier.</span>
            </span>
          </label>

          {enabled && (
            <>
              <fieldset className="field">
                <legend>Les invités peuvent</legend>
                <div className="segmented">
                  <label><input type="radio" name="mode" checked={mode === 'edit'} onChange={() => setMode('edit')} /> <span>Ajouter et modifier</span></label>
                  <label><input type="radio" name="mode" checked={mode === 'read'} onChange={() => setMode('read')} /> <span>Seulement regarder</span></label>
                </div>
              </fieldset>
              <label className="field">
                <span>{info.has_password ? 'Changer le mot de passe (déconnecte les invités)' : 'Mot de passe du lien'}</span>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={info.has_password ? 'Laisser vide pour garder l’actuel' : '4 caractères minimum'}
                  autoComplete="off"
                />
              </label>
            </>
          )}

          {info.enabled && enabled && (
            <div className="field">
              <span>Lien à envoyer</span>
              <div className="copy-row">
                <input ref={linkRef} readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Lien du tableau partagé" />
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    await copyText(linkRef.current);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => saveShare({ regenerate: true })} disabled={busy}>
                Remplacer par un nouveau lien
              </button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
