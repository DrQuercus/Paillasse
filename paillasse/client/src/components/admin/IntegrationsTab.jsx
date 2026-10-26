import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Pause, Plug, ShieldOff, Webhook } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { Card, Facts, Status, ago } from './common.jsx';

const SCOPES = { read: 'Lecture seule', write: 'Lecture et écriture' };

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
