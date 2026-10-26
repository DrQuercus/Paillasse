import { useCallback, useEffect, useState } from 'react';
import { History, Pause, Pencil, Play, Plus, RotateCw, Send, Trash2, Webhook } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import Modal from '../Modal.jsx';
import { Card, Status, ago, formatDate } from '../admin/common.jsx';
import { SecretOnce, Snippet } from './common.jsx';

const VERIFY_PYTHON = `import base64, hashlib, hmac

def signature_valide(secret, entetes, corps):
    """corps : le texte brut reçu (avant json.loads)."""
    cle = base64.b64decode(secret.removeprefix("whsec_"))
    signe = f'{entetes["webhook-id"]}.{entetes["webhook-timestamp"]}.{corps}'.encode()
    attendu = base64.b64encode(hmac.new(cle, signe, hashlib.sha256).digest()).decode()
    return any(s.split(",", 1)[-1] == attendu for s in entetes["webhook-signature"].split())`;

const VERIFY_NODE = `import crypto from 'node:crypto';

// corps : le texte brut reçu (avant JSON.parse)
function signatureValide(secret, entetes, corps) {
  const cle = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const attendu = crypto.createHmac('sha256', cle)
    .update(\`\${entetes['webhook-id']}.\${entetes['webhook-timestamp']}.\${corps}\`).digest('base64');
  return entetes['webhook-signature'].split(' ').some((s) => s.split(',')[1] === attendu);
}`;

function SecretDialog({ hook, onClose }) {
  return (
    <Modal title="Secret de signature" onClose={onClose} wide footer={<button type="button" className="btn btn-primary" onClick={onClose}>J’ai copié le secret</button>}>
      <p className="modal-lead">Chaque envoi vers <code>{hook.url}</code> est signé avec ce secret (format Standard Webhooks) : l’outil vérifie ainsi qu’il vient bien de Paillasse.</p>
      <SecretOnce value={hook.secret}>
        Gardez-le dans l’outil récepteur. Vous le retrouverez dans « Modifier » (depuis cette page seulement), et pouvez en tirer un nouveau à tout moment.
      </SecretOnce>
      <p className="small">En-têtes de chaque envoi : <code>webhook-id</code>, <code>webhook-timestamp</code>, <code>webhook-signature</code>, <code>X-Paillasse-Event</code>.
        Les bibliothèques <em>standardwebhooks</em> (Python, JavaScript, Go…) vérifient la signature ; sinon :</p>
      <Snippet title="Vérifier en Python" text={VERIFY_PYTHON} />
      <Snippet title="Vérifier en JavaScript (Node)" text={VERIFY_NODE} />
    </Modal>
  );
}

/** Choix des événements : tout, des familles entières (entry.*) ou des types précis. */
function EventPicker({ value, onChange, types, groups }) {
  const all = value.length === 0;
  const byFamily = Object.keys(groups).map((family) => [family, Object.keys(types).filter((t) => t.startsWith(`${family}.`))]);
  const toggle = (item, on) => onChange(on ? [...value, item] : value.filter((v) => v !== item));
  const toggleFamily = (family, on) => onChange(on ? [...value.filter((v) => !v.startsWith(`${family}.`)), `${family}.*`] : value.filter((v) => v !== `${family}.*`));
  return (
    <fieldset className="int-events">
      <legend>Événements</legend>
      <label className="adm-radio"><input type="radio" checked={all} onChange={() => onChange([])} /> <span>Tous</span></label>
      <label className="adm-radio"><input type="radio" checked={!all} onChange={() => onChange(['entry.locked'])} /> <span>Seulement ceux-ci :</span></label>
      {!all && (
        <div className="int-event-groups">
          {byFamily.map(([family, list]) => {
            const whole = value.includes(`${family}.*`);
            return (
              <div key={family} className="int-event-group">
                <label className="adm-check"><input type="checkbox" checked={whole} onChange={(e) => toggleFamily(family, e.target.checked)} /> <strong>{groups[family]}</strong> <small className="muted">(tous)</small></label>
                {!whole && list.map((t) => (
                  <label key={t} className="adm-check int-event"><input type="checkbox" checked={value.includes(t)} onChange={(e) => toggle(t, e.target.checked)} /> <span>{types[t]}</span></label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}

function WebhookDialog({ hook, info, onClose, onSaved }) {
  const { projects } = useApp();
  const editing = Boolean(hook);
  const [form, setForm] = useState({
    name: hook?.name ?? '', url: hook?.url ?? '', events: hook?.events ?? [], project_id: hook?.project_id ?? '',
    header_name: hook?.header_name ?? '', header_value: '', active: hook?.active ?? true,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, project_id: form.project_id || null };
      if (editing && !form.header_value) delete body.header_value; // vide : on garde l'ancienne valeur
      const saved = editing ? await api.patch(`/integrations/webhooks/${hook.id}`, body) : await api.post('/integrations/webhooks', body);
      onSaved(saved, !editing);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const rotate = async () => {
    if (!window.confirm('Tirer un nouveau secret ? L’ancien ne vérifiera plus les envois : mettez l’outil à jour aussitôt.')) return;
    try {
      onSaved(await api.post(`/integrations/webhooks/${hook.id}/secret`), true);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Modal
      title={editing ? `Webhook « ${hook.name || hook.url} »` : 'Nouveau webhook'}
      onClose={onClose}
      wide
      footer={(
        <>
          {editing && <button type="button" className="btn btn-ghost modal-foot-left" onClick={() => onSaved(hook, true)}>Voir le secret</button>}
          {editing && <button type="button" className="btn btn-ghost" onClick={rotate}><RotateCw size={14} /> Nouveau secret</button>}
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="webhook-form" className="btn btn-primary" disabled={busy || !form.url.trim()}>{editing ? 'Enregistrer' : 'Créer le webhook'}</button>
        </>
      )}
    >
      <form id="webhook-form" onSubmit={save} className="int-form">
        <label className="field">
          <span>Adresse de l’outil (reçoit un POST JSON)</span>
          <input type="url" value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://n8n.labo.fr/webhook/…" required className="mono" />
        </label>
        <label className="field">
          <span>Nom <small className="muted">(facultatif)</small></span>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="n8n : avertir l’équipe" maxLength={100} />
        </label>
        <EventPicker value={form.events} onChange={(events) => set({ events })} types={info.event_types} groups={info.event_groups} />
        <label className="field">
          <span>Projets</span>
          <select value={form.project_id} onChange={(e) => set({ project_id: e.target.value })}>
            <option value="">Tous ceux que je vois (et ce qui est commun au labo)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>Seulement : {p.name}</option>)}
          </select>
        </label>
        <details className="int-more" open={Boolean(form.header_name)}>
          <summary>En-tête ajouté à chaque envoi (clé d’API de l’outil…)</summary>
          <div className="int-row">
            <label className="field">
              <span>Nom</span>
              <input value={form.header_name} onChange={(e) => set({ header_name: e.target.value })} placeholder="X-Api-Key" className="mono" />
            </label>
            <label className="field">
              <span>Valeur</span>
              <input value={form.header_value} onChange={(e) => set({ header_value: e.target.value })} placeholder={hook?.has_header_value ? '(inchangée)' : ''} className="mono" autoComplete="off" />
            </label>
          </div>
        </details>
        {editing && (
          <label className="adm-check">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            <span>Actif{!hook.active && hook.disabled_reason ? ` (en pause : ${hook.disabled_reason})` : ''}</span>
          </label>
        )}
        <p className="hint">Chaque envoi contient le type d’événement, l’objet (titre, code), qui a fait le geste, et les adresses de l’objet. L’outil relit le détail avec un jeton. Les modifications d’une entrée en cours de saisie sont regroupées (envoi après 30 s de calme).</p>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

const DELIVERY = { ok: ['ok', 'Reçu'], failed: ['danger', 'Abandonné'], pending: ['running', 'En attente'] };

function DeliveriesDialog({ hook, onClose }) {
  const { notify } = useApp();
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api.get(`/integrations/webhooks/${hook.id}/deliveries`).then(setRows).catch((err) => notify(err.message, 'error')), [hook.id, notify]);
  useEffect(() => { load(); }, [load]);
  const retry = async (d) => {
    try {
      await api.post(`/integrations/webhooks/${hook.id}/deliveries/${d.id}/retry`);
      notify('Renvoi demandé.', 'success');
      setTimeout(load, 1500);
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  return (
    <Modal title={`Envois : ${hook.name || hook.url}`} onClose={onClose} wide footer={<button type="button" className="btn" onClick={load}><RotateCw size={14} /> Actualiser</button>}>
      {rows?.length === 0 && <p className="int-empty">Aucun envoi pour l’instant.</p>}
      {rows?.length > 0 && (
        <div className="adm-table-wrap adm-scroll">
          <table className="adm-table">
            <thead><tr><th>Quand</th><th>Événement</th><th>Résultat</th><th><span className="sr-only">Renvoyer</span></th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="nowrap">{formatDate(d.created_at)}</td>
                  <td>
                    <code>{d.event_type}</code>
                    {d.object?.title && <div className="small muted">{d.object.code ? `${d.object.code} ` : ''}{d.object.title}</div>}
                  </td>
                  <td>
                    <Status level={DELIVERY[d.status][0]}>{DELIVERY[d.status][1]}{d.response_status ? ` (${d.response_status})` : ''}</Status>
                    <div className="small muted">
                      {d.attempts > 1 ? `${d.attempts} tentatives` : d.attempts === 1 ? '1 tentative' : ''}
                      {d.duration_ms != null ? ` · ${d.duration_ms} ms` : ''}
                      {d.status === 'pending' && d.attempts > 0 ? ` · nouvel essai ${ago(d.next_attempt_at)}` : ''}
                    </div>
                    {d.error && d.status !== 'ok' && <div className="small int-error">{d.error}</div>}
                  </td>
                  <td>{d.event_id != null && <button type="button" className="btn btn-small btn-ghost" onClick={() => retry(d)}><Send size={13} /> Renvoyer</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

const eventsText = (events, types, groups) => {
  if (!events?.length) return 'Tous les événements';
  return events.map((e) => (e.endsWith('.*') ? `${groups[e.slice(0, -2)] ?? e} (tous)` : types[e] ?? e)).join(', ');
};

/** Webhooks : Paillasse prévient un outil à chaque événement choisi. */
export default function WebhooksCard({ info }) {
  const { notify } = useApp();
  const [hooks, setHooks] = useState(null);
  const [editing, setEditing] = useState(null); // null, 'new' ou le webhook
  const [secretOf, setSecretOf] = useState(null);
  const [journal, setJournal] = useState(null);
  const load = useCallback(() => api.get('/integrations/webhooks').then(setHooks).catch((err) => notify(err.message, 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  const test = async (h) => {
    try {
      const r = await api.post(`/integrations/webhooks/${h.id}/test`);
      notify(r.ok ? `Envoi de test reçu (réponse ${r.status}, ${r.duration_ms} ms).` : `Échec de l’envoi de test : ${r.error}`, r.ok ? 'success' : 'error');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const setActive = async (h, active) => {
    try {
      await api.patch(`/integrations/webhooks/${h.id}`, { active });
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const remove = async (h) => {
    if (!window.confirm(`Supprimer le webhook vers ${h.url} ?`)) return;
    try {
      await api.del(`/integrations/webhooks/${h.id}`);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <Card
      title="Webhooks"
      icon={Webhook}
      actions={<button type="button" className="btn btn-small btn-primary" onClick={() => setEditing('new')} disabled={!info.webhooks_enabled}><Plus size={14} /> Nouveau webhook</button>}
    >
      <p className="small muted">Paillasse prévient un outil (n8n, Node-RED, un script, le serveur de l’IA…) à chaque événement choisi : entrée créée ou
        verrouillée, tube sorti du froid, séquence ajoutée… Un POST JSON signé, renvoyé jusqu’à cinq fois en cas d’échec (de 30 s à 6 h plus tard).</p>
      {!info.webhooks_enabled && <p className="adm-banner is-warn">Les webhooks sont suspendus par l’administrateur du cahier : rien n’est envoyé pour l’instant.</p>}
      {hooks?.length === 0 && <p className="int-empty">Aucun webhook.</p>}
      {hooks?.length > 0 && (
        <ul className="int-hooks">
          {hooks.map((h) => (
            <li key={h.id} className={h.active ? '' : 'is-paused'}>
              <div className="int-hook-main">
                <strong>{h.name || h.url}</strong>
                {h.name && <code className="int-hook-url">{h.url}</code>}
                <span className="small muted">{eventsText(h.events, info.event_types, info.event_groups)}{h.project_name ? ` · projet ${h.project_name}` : ''}</span>
                <span className="small">
                  {!h.active ? <Status level="warn">En pause{h.disabled_reason ? ` : ${h.disabled_reason}` : ''}</Status>
                    : h.last_delivery_at ? <Status level={h.last_status.startsWith('ok') ? 'ok' : 'danger'}>Dernier envoi {ago(h.last_delivery_at)} : {h.last_status.startsWith('ok') ? `reçu (${h.last_status.slice(3)})` : h.last_status}</Status>
                      : <Status level="info">Actif, rien envoyé pour l’instant</Status>}
                  {h.pending > 0 && <span className="muted"> · {h.pending} en attente</span>}
                  {h.failed_week > 0 && <span className="int-error"> · {h.failed_week} abandonné{h.failed_week > 1 ? 's' : ''} cette semaine</span>}
                </span>
              </div>
              <div className="adm-actions">
                <button type="button" className="btn btn-small btn-ghost" onClick={() => test(h)} title="Envoyer un événement « ping »"><Send size={14} /> Tester</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setJournal(h)}><History size={14} /> Envois</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setEditing(h)}><Pencil size={14} /> Modifier</button>
                {h.active
                  ? <button type="button" className="btn btn-small btn-ghost" onClick={() => setActive(h, false)} title="Mettre en pause"><Pause size={14} /><span className="sr-only">Mettre en pause</span></button>
                  : <button type="button" className="btn btn-small btn-ghost" onClick={() => setActive(h, true)} title="Reprendre (à partir des prochains événements)"><Play size={14} /><span className="sr-only">Reprendre</span></button>}
                <button type="button" className="btn btn-small btn-ghost btn-danger-ghost" onClick={() => remove(h)} title="Supprimer"><Trash2 size={14} /><span className="sr-only">Supprimer</span></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <WebhookDialog
          hook={editing === 'new' ? null : editing}
          info={info}
          onClose={() => setEditing(null)}
          onSaved={(saved, showSecret) => {
            setEditing(null);
            load();
            if (showSecret && saved.secret) setSecretOf(saved);
          }}
        />
      )}
      {secretOf && <SecretDialog hook={secretOf} onClose={() => setSecretOf(null)} />}
      {journal && <DeliveriesDialog hook={journal} onClose={() => { setJournal(null); load(); }} />}
    </Card>
  );
}
