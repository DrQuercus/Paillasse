import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut, Pencil, ShieldCheck, UserCheck, UserPlus, UserX } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import Modal from '../Modal.jsx';
import { Card, CopyButton, Status, ago } from './common.jsx';

/** Mot de passe provisoire : affiché une seule fois, à transmettre de vive voix. */
function PasswordShown({ info, onClose }) {
  return (
    <Modal title={info.title} onClose={onClose} footer={<button type="button" className="btn btn-primary" onClick={onClose}>J’ai noté le mot de passe</button>}>
      <p className="modal-lead">Mot de passe provisoire de <strong>{info.name}</strong> (identifiant <code>{info.username}</code>) :</p>
      <div className="adm-password">
        <code>{info.password}</code>
        <CopyButton text={info.password} />
      </div>
      <p className="hint">Il ne sera plus jamais affiché. Transmettez-le de vive voix ou sur papier, pas par courriel. À la première connexion, {info.name} choisira son propre mot de passe.</p>
    </Modal>
  );
}

function UserDialog({ user, onClose, onSaved }) {
  const { notify } = useApp();
  const editing = Boolean(user);
  const [username, setUsername] = useState('');
  const [name, setName] = useState(user?.display_name ?? '');
  const [admin, setAdmin] = useState(user?.is_admin ?? false);
  const [mode, setMode] = useState('provisional');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) {
        await api.put(`/admin/users/${user.id}`, { display_name: name, is_admin: admin });
        onSaved(null);
      } else {
        const r = await api.post('/admin/users', { username, display_name: name, is_admin: admin, password: mode === 'set' ? password : '' });
        onSaved(r.password ? { title: 'Compte créé', name: r.user.display_name, username: r.user.username, password: r.password } : null);
      }
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={editing ? `Modifier : ${user.display_name}` : 'Nouveau compte'}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={busy || (!editing && !username) || (mode === 'set' && !editing && password.length < 8)}>{editing ? 'Enregistrer' : 'Créer le compte'}</button>
        </>
      )}
    >
      <form id="user-form" className="form-stack" onSubmit={submit}>
        {!editing && (
          <label className="field">
            <span>Identifiant (pour se connecter)</span>
            <input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, '.'))} placeholder="ex. marie.curie" autoComplete="off" required pattern="[a-z0-9][a-z0-9._\-]{1,39}" />
            <small className="hint">Minuscules, chiffres, point, tiret. Il ne pourra plus changer.</small>
          </label>
        )}
        <label className="field">
          <span>Nom affiché (dans les entrées, l’historique)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Marie Curie" maxLength={80} />
        </label>
        {!editing && (
          <fieldset className="field">
            <legend>Mot de passe</legend>
            <label className="adm-radio"><input type="radio" name="pw" checked={mode === 'provisional'} onChange={() => setMode('provisional')} /> Provisoire, généré ici (conseillé) : la personne choisit le sien à la première connexion</label>
            <label className="adm-radio"><input type="radio" name="pw" checked={mode === 'set'} onChange={() => setMode('set')} /> Le fixer maintenant</label>
            {mode === 'set' && <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8 caractères au moins" autoComplete="new-password" minLength={8} />}
          </fieldset>
        )}
        <label className="adm-check">
          <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
          <span><strong>Administrateur</strong> : accès à la page Maintenance (comptes, sauvegardes, restauration).</span>
        </label>
      </form>
    </Modal>
  );
}

export default function UsersTab() {
  const { notify, user: me } = useApp();
  const [users, setUsers] = useState(null);
  const [dialog, setDialog] = useState(null); // { user? }
  const [shown, setShown] = useState(null);
  const load = useCallback(() => api.get('/admin/users').then(setUsers).catch((err) => notify(err.message, 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  const act = async (u, action, question, success) => {
    if (question && !window.confirm(question)) return;
    try {
      const r = await api.post(`/admin/users/${u.id}/${action}`);
      if (r?.password) setShown({ title: 'Mot de passe réinitialisé', name: u.display_name, username: u.username, password: r.password });
      else notify(success, 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!users) return <p className="muted">Chargement…</p>;
  return (
    <div className="adm-stack">
      <Card
        title={`Comptes (${users.filter((u) => !u.disabled_at).length} actifs)`}
        actions={<button type="button" className="btn btn-primary btn-small" onClick={() => setDialog({})}><UserPlus size={15} /> Nouveau compte</button>}
      >
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Personne</th><th>État</th><th>Dernière connexion</th><th>Entrées</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.disabled_at ? 'is-disabled' : ''}>
                  <td>
                    <strong>{u.display_name}</strong> {u.id === me.id && <span className="muted small">(vous)</span>}
                    <div className="muted small"><code>{u.username}</code> · créé le {new Date(u.created_at).toLocaleDateString('fr-FR')}</div>
                  </td>
                  <td>
                    <div className="adm-badges">
                      {u.is_admin && <span className="badge adm-badge-admin"><ShieldCheck size={12} /> Admin</span>}
                      {u.disabled_at ? <Status level="danger">Désactivé</Status> : u.must_change_password ? <Status level="warn">Mot de passe provisoire</Status> : <Status level="ok">Actif</Status>}
                    </div>
                  </td>
                  <td>{u.last_login_at ? ago(u.last_login_at) : <span className="muted">jamais</span>}</td>
                  <td>{u.entries}</td>
                  <td>
                    <div className="adm-actions">
                      <button type="button" className="icon-btn" title="Modifier le nom, le rôle" aria-label={`Modifier ${u.display_name}`} onClick={() => setDialog({ user: u })}><Pencil size={15} /></button>
                      <button type="button" className="icon-btn" title="Réinitialiser le mot de passe" aria-label={`Réinitialiser le mot de passe de ${u.display_name}`} onClick={() => act(u, 'password', `Donner un nouveau mot de passe provisoire à ${u.display_name} ? L’ancien ne marchera plus et ses sessions seront fermées.`)}><KeyRound size={15} /></button>
                      <button type="button" className="icon-btn" title="Déconnecter de tous ses appareils" aria-label={`Déconnecter ${u.display_name} partout`} onClick={() => act(u, 'logout', `Déconnecter ${u.display_name} de tous ses appareils (ordinateur perdu, départ…) ?`, `${u.display_name} est déconnecté partout.`)}><LogOut size={15} /></button>
                      {u.disabled_at
                        ? <button type="button" className="icon-btn" title="Réactiver le compte" aria-label={`Réactiver ${u.display_name}`} onClick={() => act(u, 'enable', null, `${u.display_name} peut de nouveau se connecter.`)}><UserCheck size={15} /></button>
                        : u.id !== me.id && <button type="button" className="icon-btn adm-danger" title="Désactiver le compte" aria-label={`Désactiver ${u.display_name}`} onClick={() => act(u, 'disable', `Désactiver le compte de ${u.display_name} ? Il ne pourra plus se connecter ; ses entrées restent dans le cahier, signées de son nom.`, `Compte de ${u.display_name} désactivé.`)}><UserX size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Un compte ne se supprime jamais : ses entrées restent signées de son nom. On le désactive (départ du labo) et on peut le réactiver. En dernier recours, sur le serveur : <code>npm --prefix server run create-user -- identifiant --admin</code> redonne un accès administrateur.</p>
      </Card>
      {dialog && <UserDialog user={dialog.user} onClose={() => setDialog(null)} onSaved={(pw) => { setDialog(null); load(); if (pw) setShown(pw); else notify('Compte enregistré.', 'success'); }} />}
      {shown && <PasswordShown info={shown} onClose={() => setShown(null)} />}
    </div>
  );
}
