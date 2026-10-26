import { useEffect, useState } from 'react';
import { Plug } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import TokensCard from '../components/integrations/TokensCard.jsx';
import ConnectCard from '../components/integrations/ConnectCard.jsx';
import WebhooksCard from '../components/integrations/WebhooksCard.jsx';
import ReferenceCard from '../components/integrations/ReferenceCard.jsx';

/** Intégrations : ouvrir le cahier à une IA locale, une automatisation, un script, un index de recherche. */
export default function IntegrationsPage() {
  const { notify } = useApp();
  const [info, setInfo] = useState(null);
  const [operations, setOperations] = useState(null);
  // Jeton créé pendant cette visite : montré dans les exemples, jamais gardé ailleurs
  const [token, setToken] = useState(null);

  useEffect(() => {
    api.get('/integrations/info').then(setInfo).catch((err) => notify(err.message, 'error'));
    api.get('/v1').then((r) => setOperations(r.operations)).catch(() => {});
  }, [notify]);

  return (
    <div className="page page-wide integrations">
      <header className="page-head">
        <div>
          <h1><Plug size={24} aria-hidden="true" className="adm-title-icon" /> Intégrations</h1>
          <p className="page-lead">
            Ouvrir le cahier à vos outils : une IA locale qui cherche, résume et rédige, une automatisation (n8n, Node-RED), un
            tableur, un script. Chaque outil agit en votre nom, avec un jeton d’accès, sur les projets que vous voyez.
          </p>
        </div>
      </header>
      {info && !info.enabled && (
        <p className="adm-banner" role="status">L’accès par jeton (API, IA, automatisations) est désactivé par l’administrateur du cahier.</p>
      )}
      {info && (
        <div className="adm-stack">
          <TokensCard enabled={info.enabled} onToken={(t) => setToken(t.token)} />
          <ConnectCard endpoints={info.endpoints} token={token} />
          <WebhooksCard info={info} />
          <ReferenceCard endpoints={info.endpoints} operations={operations} />
        </div>
      )}
    </div>
  );
}
