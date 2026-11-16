import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Eye, Lock, LogOut, MailPlus, RotateCcw, Search, UserMinus, Users, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import Modal from './Modal.jsx';

const STATUS = {
  owner: ['Propriétaire', 'share-owner'],
  accepted: ['Membre', 'share-member'],
  pending: ['Invitation envoyée', 'share-pending'],
  declined: ['A refusé', 'share-declined'],
};

/** Accès d'un projet en quelques mots : « Privé », « Partagé · 2 membres ». */
export function AccessChip({ project, onClick }) {
  const shared = project.member_count > 0 || project.role === 'member';
  const Icon = shared ? Users : Lock;
  const people = project.member_count + 1; // les membres et le propriétaire
  let text = shared ? `Partagé · ${people} personnes` : 'Privé';
  if (!shared && project.pending_count > 0) text = 'Privé · invitation en attente';
  const title = shared
    ? `Projet de ${project.owner_name}, partagé avec ${project.member_count} membre(s)`
    : 'Seul le propriétaire voit ce projet';
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`access-chip${shared ? ' is-shared' : ''}`} onClick={onClick} title={title}>
      <Icon size={13} aria-hidden="true" /> {text}
    </Tag>
  );
}

/** Choix de comptes (cases à cocher), avec filtre quand la liste est longue. exclude : comptes à ne pas proposer. */
export function PeoplePicker({ selected, onChange, exclude = [] }) {
  const [people, setPeople] = useState(null);
  const [filter, setFilter] = useState('');
  useEffect(() => { api.get('/users').then(setPeople).catch(() => setPeople([])); }, []);
  const hidden = useMemo(() => new Set(exclude), [exclude]);
  if (!people) return <p className="muted small">Chargement des comptes…</p>;
  const offered = people.filter((p) => !hidden.has(p.id));
  if (!offered.length) {
    return <p className="muted small">{people.length ? 'Tous les comptes du labo sont déjà invités.' : 'Aucun autre compte dans le labo pour l’instant : l’administrateur en crée depuis la page Maintenance.'}</p>;
  }
  const f = filter.trim().toLowerCase();
  const shown = f ? offered.filter((p) => `${p.display_name} ${p.username}`.toLowerCase().includes(f)) : offered;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className="people-picker">
      {offered.length > 6 && (
        <label className="people-filter">
          <Search size={14} aria-hidden="true" />
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Chercher un compte" aria-label="Chercher un compte" />
        </label>
      )}
      <ul className="people-list">
        {shown.map((p) => (
          <li key={p.id}>
            <label className={`people-item${selected.includes(p.id) ? ' is-selected' : ''}`}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} />
              <span className="people-avatar" aria-hidden="true">{initials(p.display_name)}</span>
              <span className="people-name">{p.display_name}<span className="muted small"> · {p.username}</span></span>
            </label>
          </li>
        ))}
        {!shown.length && <li className="muted small">Aucun compte ne correspond.</li>}
      </ul>
      {selected.length > 0 && <p className="small people-count">{selected.length} compte{selected.length > 1 ? 's' : ''} choisi{selected.length > 1 ? 's' : ''}</p>}
    </div>
  );
}

const initials = (name) => String(name ?? '?').split(/[\s.-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/**
 * Partage d'un projet. Le propriétaire invite, annule une invitation, retire un membre ; un membre voit
 * qui participe et peut quitter le projet ; un administrateur non membre ne fait que regarder.
 */
export function ShareDialog({ project, onClose, onChanged }) {
  const { notify, reloadProjects, user } = useApp();
  const navigate = useNavigate();
  const [members, setMembers] = useState(null);
  const [invite, setInvite] = useState([]);
  const [busy, setBusy] = useState(false);
  const owner = project.role === 'owner';

  const load = useCallback(
    () => api.get(`/projects/${project.id}/members`).then(setMembers).catch((err) => notify(err.message, 'error')),
    [project.id, notify],
  );
  useEffect(() => { load(); }, [load]);

  const act = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      await load();
      await reloadProjects();
      onChanged?.();
      if (message) notify(message, 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendInvites = () => act(async () => {
    await api.post(`/projects/${project.id}/members`, { user_ids: invite });
    setInvite([]);
  }, invite.length > 1 ? `${invite.length} invitations envoyées.` : 'Invitation envoyée.');
  const reinvite = (m) => act(() => api.post(`/projects/${project.id}/members`, { user_ids: [m.id] }), `Nouvelle invitation envoyée à ${m.display_name}.`);
  const remove = (m) => {
    const q = m.status === 'accepted'
      ? `Retirer ${m.display_name} du projet ? Ses entrées restent dans le projet ; il ne le verra plus.`
      : null;
    if (q && !window.confirm(q)) return;
    act(() => api.del(`/projects/${project.id}/members/${m.id}`),
      m.status === 'pending' ? 'Invitation annulée.' : m.status === 'declined' ? null : `${m.display_name} ne fait plus partie du projet.`);
  };
  const leave = async () => {
    if (!window.confirm(`Quitter le projet « ${project.name} » ? Vous ne le verrez plus ; vos entrées y restent. Le propriétaire pourra vous réinviter.`)) return;
    setBusy(true);
    try {
      await api.del(`/projects/${project.id}/members/${user.id}`);
      await reloadProjects();
      notify(`Vous avez quitté « ${project.name} ».`, 'success');
      onClose();
      navigate('/');
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  const accepted = members?.filter((m) => m.status === 'accepted').length ?? 0;
  const pending = members?.filter((m) => m.status === 'pending').length ?? 0;
  const exclude = members?.map((m) => m.id) ?? []; // un refus se renouvelle par son bouton

  return (
    <Modal
      title={`Partage — ${project.name}`}
      onClose={onClose}
      footer={(
        <>
          {project.role === 'member' && (
            <button type="button" className="btn btn-ghost btn-danger-ghost share-leave" onClick={leave} disabled={busy}><LogOut size={15} /> Quitter le projet</button>
          )}
          <button type="button" className="btn" onClick={onClose}>Fermer</button>
          {owner && (
            <button type="button" className="btn btn-primary" onClick={sendInvites} disabled={busy || !invite.length}>
              <MailPlus size={15} /> Inviter{invite.length ? ` (${invite.length})` : ''}
            </button>
          )}
        </>
      )}
    >
      <p className={`share-summary${accepted ? ' is-shared' : ''}`}>
        {accepted ? <Users size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />}
        <span>
          {accepted
            ? `Partagé : ${accepted + 1} personnes voient ce projet et y écrivent.`
            : 'Privé : seul le propriétaire voit ce projet.'}
          {pending > 0 && ` ${pending} invitation${pending > 1 ? 's' : ''} en attente de réponse.`}
        </span>
      </p>
      {project.role === 'admin' && (
        <p className="notice"><Eye size={15} aria-hidden="true" /> Accès administrateur, en lecture seule. Pour confier le projet à un membre ou en retirer un : Maintenance › Données › Projets.</p>
      )}
      {!members && <p className="muted">Chargement…</p>}
      {members && (
        <ul className="share-list">
          {members.map((m) => {
            const [label, cls] = STATUS[m.status];
            return (
              <li key={m.id} className="share-row">
                <span className="people-avatar" aria-hidden="true">{initials(m.display_name)}</span>
                <span className="people-name">{m.display_name}{m.id === user.id && <span className="muted small"> (vous)</span>}</span>
                <span className={`share-status ${cls}`}>{label}</span>
                {owner && m.status !== 'owner' && (
                  <span className="share-actions">
                    {m.status === 'declined' && (
                      <button type="button" className="icon-btn" onClick={() => reinvite(m)} disabled={busy} title="Inviter de nouveau" aria-label={`Inviter de nouveau ${m.display_name}`}><RotateCcw size={15} /></button>
                    )}
                    <button type="button" className="icon-btn" onClick={() => remove(m)} disabled={busy}
                      title={m.status === 'accepted' ? 'Retirer du projet' : m.status === 'pending' ? 'Annuler l’invitation' : 'Effacer de la liste'}
                      aria-label={`${m.status === 'accepted' ? 'Retirer' : 'Annuler l’invitation de'} ${m.display_name}`}>
                      {m.status === 'accepted' ? <UserMinus size={15} /> : <X size={15} />}
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {owner && members && (
        <section className="share-invite">
          <h3>Inviter d’autres comptes</h3>
          <PeoplePicker selected={invite} onChange={setInvite} exclude={exclude} />
          <p className="hint">Chaque compte reçoit une invitation : il ne voit rien du projet tant qu’il ne l’a pas acceptée.</p>
        </section>
      )}
    </Modal>
  );
}

/** Invitations reçues, à accepter ou refuser (en tête du journal). */
export function InvitationsPanel({ onAccepted }) {
  const { invitations, reloadProjects, notify } = useApp();
  const [busy, setBusy] = useState(null);
  if (!invitations?.length) return null;
  const answer = async (inv, accept) => {
    setBusy(inv.project_id);
    try {
      await api.post(`/invitations/${inv.project_id}/${accept ? 'accept' : 'decline'}`);
      await reloadProjects();
      notify(accept ? `Vous avez rejoint « ${inv.name} ».` : `Invitation à « ${inv.name} » refusée.`, 'success');
      if (accept) onAccepted?.(inv);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="invitations" aria-labelledby="invitations-title" id="invitations">
      <h2 id="invitations-title"><MailPlus size={17} aria-hidden="true" /> {invitations.length > 1 ? `${invitations.length} invitations` : 'Une invitation'} à rejoindre un projet</h2>
      <ul>
        {invitations.map((inv) => (
          <li key={inv.project_id} className="invitation">
            <span className="project-dot" style={{ background: inv.color }} aria-hidden="true" />
            <div className="invitation-text">
              <strong>{inv.name}</strong>
              <span className="muted small">
                {inv.invited_by ? `${inv.invited_by} vous invite` : 'Vous êtes invité'} · {inv.entries} entrée{inv.entries > 1 ? 's' : ''}
              </span>
              {inv.description && <span className="small invitation-desc">{inv.description}</span>}
            </div>
            <div className="invitation-actions">
              <button type="button" className="btn btn-small" onClick={() => answer(inv, false)} disabled={busy === inv.project_id}><X size={14} /> Refuser</button>
              <button type="button" className="btn btn-small btn-primary" onClick={() => answer(inv, true)} disabled={busy === inv.project_id}><Check size={14} /> Accepter</button>
            </div>
          </li>
        ))}
      </ul>
      <p className="hint">Tant que vous n’avez pas accepté, vous ne voyez rien du projet. En acceptant, vous le lisez et y écrivez comme son propriétaire.</p>
    </section>
  );
}
