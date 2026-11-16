import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, KeyRound, Pause, Plug, ShieldOff, Unlink, Webhook } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { Card, Facts, Status, ago, formatDate } from './common.jsx';
import { Address, Snippet } from '../integrations/common.jsx';

const SCOPES = { read: 'Lecture seule', write: 'Lecture et écriture' };

const ENV_EXAMPLE = `# server/.env, puis redémarrer Paillasse
ASSISTANT_NAME=Assistant du labo
ASSISTANT_URL=http://adresse-de-l-assistant:8080
# Identité de la personne, au choix (ou les deux) :
# 1. en-tête signé, conseillé (Open WebUI : ENABLE_FORWARD_USER_INFO_HEADERS=true et
#    FORWARD_USER_INFO_HEADER_JWT_SECRET = la même valeur, créée avec openssl rand -hex 32)
ASSISTANT_JWT_SECRET=
# 2. session transmise par l'assistant (serveur d'outils en authentification « Session »)
ASSISTANT_IDENTITY_URL=http://adresse-de-l-assistant:8080/api/v1/auths/`;

/** Assistant IA du labo : comment il est branché, comment le déclarer chez lui, qui y est relié. */
function AssistantAdmin({ a, settings, onSetting, onChanged }) {
  const { notify } = useApp();
  const [prompt, setPrompt] = useState('');
  const [check, setCheck] = useState(null);
  const origin = window.location.origin;
  useEffect(() => {
    fetch('/api/v1/assistant/prompt').then((r) => r.text()).then(setPrompt).catch(() => {});
  }, []);
  const verify = async () => {
    setCheck({ running: true });
    try {
      setCheck(await api.post('/admin/integrations/assistant/check'));
    } catch (err) {
      setCheck({ ok: false, detail: err.message });
    }
  };
  const unlinkOne = async (l) => {
    if (!window.confirm(`Délier ${l.user_name} (${l.email || l.name}) de ${a.name} ?`)) return;
    try {
      await api.del(`/admin/integrations/assistant/links/${l.user_id}`);
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!a.configured) {
    return (
      <Card title="Assistant IA du labo" icon={Bot}>
        <p className="small muted">
          Une IA du labo (Open WebUI ou compatible) peut appeler Paillasse au nom de la personne qui lui parle, avec les droits de son compte
          Paillasse : chacun relie une fois son compte (page Intégrations), choisit lecture seule ou écriture, et toute écriture passe par
          un aperçu à confirmer. Pour la brancher, ajoutez à la configuration du serveur :
        </p>
        <Snippet title="Réglages du serveur" text={ENV_EXAMPLE} />
      </Card>
    );
  }
  const auth = a.modes.session ? 'Session (la session de la personne est transmise, Paillasse la vérifie)' : 'Aucune (identité par en-tête signé)';
  return (
    <Card title={`Assistant IA du labo : ${a.name}`} icon={Bot}>
      <label className="adm-check">
        <input type="checkbox" checked={settings.assistant !== false} onChange={(e) => onSetting({ assistant: e.target.checked }, e.target.checked ? 'Accès par l’assistant rouvert.' : 'Accès par l’assistant coupé.')} />
        <span><strong>Accès par {a.name}</strong> au nom des personnes qui ont relié leur compte (aussi coupé si l’accès par jeton l’est).</span>
      </label>
      <Facts items={[
        ['Identité de la personne', [a.modes.signed_header && `en-tête signé (${a.jwt_header})`, a.modes.session && `session vérifiée auprès de ${a.identity_url}`].filter(Boolean).join(' ; ')],
        ['État', a.active ? <Status level="ok">Actif</Status> : <Status level="warn">Coupé</Status>],
        ['Outils proposés', `${a.tools.length} (${a.tools.filter((t) => t.scope === 'write').length} d’écriture, en deux temps) ≈ ${a.tool_tokens.toLocaleString('fr-FR')} jetons de description à chaque message`],
        ['Réponses', `${a.max_chars.toLocaleString('fr-FR')} caractères au plus ; longues entrées en parties`],
        ['Accord avant d’écrire', a.turn_seen_at
          ? <span><Status level="ok">Vérifié</Status> : confirmation acceptée seulement après une réponse de la personne ({a.turn_header} reçu {ago(a.turn_seen_at)})</span>
          : <span>{a.turn_header} pas encore reçu avec une écriture depuis le démarrage : sans lui, le modèle pourrait confirmer seul ce qu’il a montré (Open WebUI : ENABLE_FORWARD_USER_INFO_HEADERS=true).</span>],
        a.unknown_tools.length > 0 && ['Outils inconnus', <span className="int-error">{a.unknown_tools.join(', ')} (ASSISTANT_TOOLS)</span>],
        a.refused_tools?.length > 0 && ['Outils écartés', <span>{a.refused_tools.join(', ')} : geste irréversible, réservé à la personne</span>],
      ]}
      />
      <p><button type="button" className="btn btn-small" onClick={verify} disabled={check?.running}>Vérifier la liaison avec {a.name}</button>
        {check && !check.running && <> <Status level={check.ok ? 'ok' : 'danger'}>{check.detail}</Status></>}</p>

      <h3 className="adm-subtitle">À déclarer chez {a.name} (une fois, par son administrateur)</h3>
      <p className="small muted">Serveur d’outils de type <strong>OpenAPI</strong>, ouvert à tous les comptes, ajouté au préréglage du modèle :</p>
      <div className="int-addresses">
        <Address label="Adresse" value={`${origin}/api/v1/assistant`} hint={`Telle que l’assistant la joint (depuis son conteneur, l’adresse du serveur peut différer de ${origin}).`} />
        <Address label="Chemin de la description" value="openapi.json" />
        <Address label="Authentification" value={auth} />
      </div>
      {a.modes.signed_header && <p className="small muted">Côté Open WebUI : ENABLE_FORWARD_USER_INFO_HEADERS=true et FORWARD_USER_INFO_HEADER_JWT_SECRET égal à ASSISTANT_JWT_SECRET.</p>}
      <p className="small muted">Ou en MCP (HTTP « streamable ») : <code>{origin}/mcp?profile=assistant</code>, même authentification.</p>
      {prompt && <Snippet title="Branche à ajouter au prompt système de l’assistant" text={prompt} wrap />}

      <h3 className="adm-subtitle">Comptes reliés ({a.links.length})</h3>
      {a.links.length === 0 ? <p className="small muted">Personne pour l’instant : chacun relie son compte depuis la page Intégrations.</p> : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Compte</th><th>Chez {a.name}</th><th>Droits</th><th>Utilisation</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {a.links.map((l) => (
                <tr key={l.user_id}>
                  <td>{l.user_name}</td>
                  <td>{l.email || l.name}<div className="small muted">relié le {formatDate(l.linked_at)}</div></td>
                  <td>{SCOPES[l.scope]}</td>
                  <td>{l.last_used_at ? <>{ago(l.last_used_at)}<div className="small muted">{l.use_count.toLocaleString('fr-FR')} appels</div></> : 'jamais'}</td>
                  <td><button type="button" className="btn btn-small btn-ghost btn-danger-ghost" onClick={() => unlinkOne(l)}><Unlink size={14} /> Délier</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Onglet Intégrations de la Maintenance : interrupteurs, jetons et webhooks de tout le labo. */
export default function IntegrationsTab() {
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get('/admin/integrations').then(setData).catch((err) => notify(err.message, 'error')), [notify]);
  useEffect(() => { load(); }, [load]);

  const setSetting = async (patch, message) => {
    try {
      await api.put('/admin/integrations/settings', patch);
      notify(message, 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const revoke = async (t) => {
    if (!window.confirm(`Révoquer le jeton « ${t.name} » de ${t.user_name} ? L’outil qui s’en sert perd l’accès tout de suite.`)) return;
    try {
      await api.post(`/admin/integrations/tokens/${t.id}/revoke`);
      notify('Jeton révoqué.', 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const pause = async (w) => {
    if (!window.confirm(`Mettre en pause le webhook vers ${w.url} (${w.user_name}) ?`)) return;
    try {
      await api.post(`/admin/integrations/webhooks/${w.id}/pause`);
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!data) return <p className="muted">Chargement…</p>;
  const { settings, stats } = data;
  const active = data.tokens.filter((t) => t.status === 'active');
  return (
    <div className="adm-stack">
      <Card title="Ouverture du cahier aux autres outils" icon={Plug}>
        <p className="small muted">IA locale, automatisations, scripts : chacun se connecte avec un jeton personnel créé dans la page{' '}
          <Link to="/integrations">Intégrations</Link>, avec les droits de son compte sur les projets, jamais ceux d’un administrateur.</p>
        <label className="adm-check">
          <input type="checkbox" checked={settings.enabled} onChange={(e) => setSetting({ enabled: e.target.checked }, e.target.checked ? 'Accès par jeton rouvert.' : 'Accès par jeton coupé : les outils connectés sont refusés.')} />
          <span><strong>Accès par jeton</strong> (API REST, serveur MCP, automatisations). Coupé : tous les jetons sont refusés, sans être supprimés.</span>
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={settings.webhooks} onChange={(e) => setSetting({ webhooks: e.target.checked }, e.target.checked ? 'Webhooks remis en marche.' : 'Webhooks suspendus.')} />
          <span><strong>Webhooks</strong> (appels sortants vers les outils). Suspendus : rien n’est envoyé, les événements attendent.</span>
        </label>
        <Facts items={[
          ['Événements', `${stats.events_day.toLocaleString('fr-FR')} ces dernières 24 h (${stats.events_total.toLocaleString('fr-FR')} gardés, 90 jours)`],
          ['Envois de webhooks', `${stats.deliveries_ok_week} reçus et ${stats.deliveries_failed_week} abandonnés en 7 jours ; ${stats.deliveries_pending} en attente`],
        ]}
        />
      </Card>

      <AssistantAdmin a={data.assistant} settings={settings} onSetting={setSetting} onChanged={load} />

      <Card title={`Jetons d’accès (${active.length} actif${active.length > 1 ? 's' : ''})`} icon={KeyRound}>
        {data.tokens.length === 0 ? <p className="small muted">Aucun jeton.</p> : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Compte</th><th>Outil</th><th>Droits</th><th>Dernière utilisation</th><th>État</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.tokens.map((t) => (
                  <tr key={t.id} className={t.status === 'active' ? '' : 'is-disabled'}>
                    <td>{t.user_name}</td>
                    <td>{t.name}<div className="small muted"><code>{t.token_hint}</code></div></td>
                    <td>{SCOPES[t.scope]}</td>
                    <td>{t.last_used_at ? <>{ago(t.last_used_at)}<div className="small muted">{t.use_count.toLocaleString('fr-FR')} appels{t.last_used_ip ? ` · ${t.last_used_ip}` : ''}</div></> : 'jamais'}</td>
                    <td>
                      {t.status === 'active' && <Status level="ok">{t.expires_at ? `Actif, jusqu’au ${new Date(t.expires_at).toLocaleDateString('fr-FR')}` : 'Actif'}</Status>}
                      {t.status === 'expired' && <Status level="warn">Expiré</Status>}
                      {t.status === 'revoked' && <Status level="danger">Révoqué {ago(t.revoked_at)}{t.revoked_by_name ? ` par ${t.revoked_by_name}` : ''}</Status>}
                    </td>
                    <td>{t.status === 'active' && <button type="button" className="btn btn-small btn-ghost btn-danger-ghost" onClick={() => revoke(t)}><ShieldOff size={14} /> Révoquer</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Webhooks (${data.webhooks.length})`} icon={Webhook}>
        {data.webhooks.length === 0 ? <p className="small muted">Aucun webhook.</p> : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead><tr><th>Compte</th><th>Adresse</th><th>État</th><th className="num">Abandons (7 j)</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.webhooks.map((w) => (
                  <tr key={w.id} className={w.active ? '' : 'is-disabled'}>
                    <td>{w.user_name}</td>
                    <td>{w.name && <div>{w.name}</div>}<code className="int-hook-url">{w.url}</code></td>
                    <td>
                      {w.active
                        ? <Status level={!w.last_status || w.last_status.startsWith('ok') ? 'ok' : 'danger'}>{w.last_delivery_at ? `Dernier envoi ${ago(w.last_delivery_at)}` : 'Actif'}</Status>
                        : <Status level="warn">En pause{w.disabled_reason ? ` : ${w.disabled_reason}` : ''}</Status>}
                    </td>
                    <td className="num">{w.failed_week}</td>
                    <td>{w.active && <button type="button" className="btn btn-small btn-ghost" onClick={() => pause(w)}><Pause size={14} /> Pause</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
