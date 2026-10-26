import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Pencil, Plus, ShieldOff } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import Modal from '../Modal.jsx';
import { Card, Status, ago, formatDate } from '../admin/common.jsx';
import { SCOPE_LABELS, SecretOnce } from './common.jsx';

const VALIDITY = [['30', '30 jours'], ['90', '90 jours'], ['365', '1 an'], ['', 'Sans limite']];

function NewTokenDialog({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('read');
  const [days, setDays] = useState('365');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const t = await api.post('/integrations/tokens', { name: name.trim(), scope, expires_in_days: days || null });
      setCreated(t);
      onCreated(t);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Modal title={`Jeton « ${created.name} »`} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={onClose}>J’ai copié le jeton</button>}>
        <p className="modal-lead">Collez-le dans l’outil ({SCOPE_LABELS[created.scope].toLowerCase()}{created.expires_at ? `, valable jusqu’au ${new Date(created.expires_at).toLocaleDateString('fr-FR')}` : ', sans limite de durée'}) :</p>
        <SecretOnce value={created.token}>
          Copiez-le maintenant : il ne sera plus jamais affiché (Paillasse n’en garde qu’une empreinte). Tant que cette page reste
          ouverte, il apparaît dans les exemples de « Connecter un outil ». Perdu ? Révoquez-le et créez-en un autre.
        </SecretOnce>
      </Modal>
    );
  }

  return (
    <Modal
      title="Nouveau jeton d’accès"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="new-token" className="btn btn-primary" disabled={!name.trim() || busy}><KeyRound size={15} /> Créer le jeton</button>
        </>
      )}
    >
      <form id="new-token" onSubmit={create}>
        <label className="field">
          <span>Pour quel outil ?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Open WebUI du labo, n8n, script de suivi…" maxLength={100} required />
        </label>
        <div className="adm-choice" role="radiogroup" aria-label="Droits du jeton">
          <label className={`adm-choice-item${scope === 'read' ? ' is-on' : ''}`}>
            <input type="radio" name="scope" checked={scope === 'read'} onChange={() => setScope('read')} />
            <span>
              <strong>Lecture seule</strong>
              <small>L’outil lit et cherche dans le cahier, il ne peut rien modifier. Conseillé pour une IA qui répond à vos questions ou un index de recherche.</small>
            </span>
          </label>
          <label className={`adm-choice-item${scope === 'write' ? ' is-on' : ''}`}>
            <input type="radio" name="scope" checked={scope === 'write'} onChange={() => setScope('write')} />
            <span>
              <strong>Lecture et écriture</strong>
              <small>L’outil peut aussi créer et compléter des entrées, joindre des fichiers, ranger ou déplacer des tubes, ajouter des séquences et déclarer des webhooks. Jamais d’administration ; une entrée ne se verrouille que sur demande explicite.</small>
            </span>
          </label>
        </div>
        <label className="field">
          <span>Validité</span>
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            {VALIDITY.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <p className="hint">Le jeton agit en votre nom, sur les projets que vous voyez. Vous pourrez le révoquer à tout moment.</p>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

const STATUS = { active: ['ok', 'Actif'], expired: ['warn', 'Expiré'], revoked: ['danger', 'Révoqué'] };

/** Jetons d'accès personnels : création (montré une fois), renommage, révocation. */
export default function TokensCard({ enabled, onToken }) {
  const { notify } = useApp();
  const [tokens, setTokens] = useState(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => api.get('/integrations/tokens').then(setTokens).catch((err) => notify(err.message, 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  const rename = async (t) => {
    const name = window.prompt('Nom du jeton', t.name);
    if (!name?.trim() || name.trim() === t.name) return;
    try {
      await api.patch(`/integrations/tokens/${t.id}`, { name: name.trim() });
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const revoke = async (t) => {
    if (!window.confirm(`Révoquer le jeton « ${t.name} » ? Les outils qui s’en servent perdront l’accès tout de suite.`)) return;
    try {
      await api.del(`/integrations/tokens/${t.id}`);
      notify(`Jeton « ${t.name} » révoqué.`, 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <Card
      title="Jetons d’accès"
      icon={KeyRound}
      actions={<button type="button" className="btn btn-small btn-primary" onClick={() => setCreating(true)} disabled={!enabled}><Plus size={14} /> Nouveau jeton</button>}
    >
      <p className="small muted">Un jeton par outil : chacun se révoque sans toucher aux autres, et sa dernière utilisation montre s’il sert encore.</p>
      {tokens?.length === 0 && <p className="int-empty">Aucun jeton pour l’instant.</p>}
      {tokens?.length > 0 && (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Outil</th><th>Droits</th><th>Utilisation</th><th>Validité</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className={t.status === 'active' ? '' : 'is-disabled'}>
                  <td>
                    <strong>{t.name}</strong>
                    <div className="small muted"><code>{t.token_hint}</code> · créé le {formatDate(t.created_at)}</div>
                  </td>
                  <td>{SCOPE_LABELS[t.scope]}</td>
                  <td>
                    {t.last_used_at ? <>{ago(t.last_used_at)}<div className="small muted">{t.use_count.toLocaleString('fr-FR')} appel{t.use_count > 1 ? 's' : ''}</div></> : <span className="muted">Jamais utilisé</span>}
                  </td>
                  <td>
                    {t.status === 'active'
                      ? (t.expires_at ? `jusqu’au ${new Date(t.expires_at).toLocaleDateString('fr-FR')}` : 'sans limite')
                      : <Status level={STATUS[t.status][0]}>{STATUS[t.status][1]}{t.status === 'revoked' ? ` ${ago(t.revoked_at)}` : ''}</Status>}
                  </td>
                  <td>
                    {t.status !== 'revoked' && (
                      <div className="adm-actions">
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => rename(t)} title="Renommer"><Pencil size={14} /><span className="sr-only">Renommer</span></button>
                        <button type="button" className="btn btn-small btn-ghost btn-danger-ghost" onClick={() => revoke(t)}><ShieldOff size={14} /> Révoquer</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <NewTokenDialog onClose={() => setCreating(false)} onCreated={(t) => { onToken(t); load(); }} />}
    </Card>
  );
}
