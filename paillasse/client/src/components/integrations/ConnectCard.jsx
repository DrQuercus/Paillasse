import { useState } from 'react';
import { Download, Plug } from 'lucide-react';
import { Card } from '../admin/common.jsx';
import { Address, Snippet, TOKEN_PLACEHOLDER } from './common.jsx';

const json = (value) => JSON.stringify(value, null, 2);

/** Pas à pas et configurations prêtes à copier, outil par outil. e : adresses ; token : jeton à montrer. */
const TOOLS = [
  {
    key: 'openwebui',
    label: 'Open WebUI',
    render: (e, token) => (
      <>
        <p>Interface d’IA locale (avec Ollama, par exemple). Dans les réglages d’administration, rubrique des outils externes,
          ajoutez un serveur <strong>MCP (HTTP « streamable »)</strong> :</p>
        <Address label="Adresse" value={e.mcp} />
        <Address label="Authentification" value={`Bearer ${token}`} hint="Type Bearer : la clé est le jeton." />
        <p>Autre possibilité : un serveur d’outils <strong>OpenAPI</strong>, à l’adresse <code>{e.api}</code> (même jeton).
          Pour un petit modèle (7 à 8 milliards de paramètres), préférez l’adresse MCP réduite à l’essentiel :</p>
        <Address label="Adresse MCP réduite" value={`${e.mcp}?profile=essential`} hint="Une douzaine d’outils : chercher, lire et créer des entrées, séquences, tubes." />
        <p className="small muted">Pour que l’IA cite tout le cahier dans ses réponses (connaissances, RAG), voyez aussi « Index de recherche ».</p>
      </>
    ),
  },
  {
    key: 'lmstudio',
    label: 'LM Studio',
    render: (e, token) => (
      <>
        <p>LM Studio 0.3.17 ou plus : onglet <em>Program</em> › <em>Install</em> › <em>Edit mcp.json</em>, puis ajoutez :</p>
        <Snippet title="mcp.json" text={json({ mcpServers: { paillasse: { url: e.mcp, headers: { Authorization: `Bearer ${token}` } } } })} />
      </>
    ),
  },
  {
    key: 'anythingllm',
    label: 'AnythingLLM',
    render: (e, token) => (
      <>
        <p>Fichier <code>anythingllm_mcp_servers.json</code> (dossier <code>plugins</code> du stockage d’AnythingLLM), puis
          « Agent Skills › MCP Servers › Refresh » :</p>
        <Snippet title="anythingllm_mcp_servers.json" text={json({ mcpServers: { paillasse: { type: 'streamable', url: e.mcp, headers: { Authorization: `Bearer ${token}` } } } })} />
      </>
    ),
  },
  {
    key: 'stdio',
    label: 'Claude Desktop, Jan, Cline…',
    render: (e, token) => (
      <>
        <p>Pour les clients MCP qui ne lancent que des programmes locaux : téléchargez le pont (un fichier, Node.js 18 ou plus,
          sans dépendance) et déclarez-le dans la configuration du client.</p>
        <p><a className="btn" href={e.bridge} download><Download size={15} /> Télécharger paillasse-mcp.mjs</a></p>
        <Snippet title="Configuration du client (claude_desktop_config.json, mcp.json…)" text={json({ mcpServers: { paillasse: { command: 'node', args: ['/chemin/vers/paillasse-mcp.mjs'], env: { PAILLASSE_URL: e.origin, PAILLASSE_TOKEN: token } } } })} />
        <Snippet title="Vérifier l’adresse et le jeton" text={`PAILLASSE_URL=${e.origin} PAILLASSE_TOKEN=${token} node paillasse-mcp.mjs --check`} />
        <p className="small muted">Variables facultatives : <code>PAILLASSE_PROFILE=essential</code> (moins d’outils), <code>PAILLASSE_TOOLS=search,get_entry</code> (liste choisie).
          Certificat d’une autorité interne : <code>NODE_EXTRA_CA_CERTS=/chemin/ca.pem</code>.</p>
      </>
    ),
  },
  {
    key: 'n8n',
    label: 'n8n',
    render: (e, token) => (
      <>
        <ul className="int-steps">
          <li><strong>Agent IA</strong> : nœud « MCP Client Tool », point d’accès <code>{e.mcp}</code>, transport HTTP Streamable, authentification Bearer avec le jeton.</li>
          <li><strong>Appels directs</strong> : nœud « HTTP Request », en-tête <code>Authorization: Bearer {token}</code> ; les routes sont décrites dans <a href={e.openapi} target="_blank" rel="noreferrer">la description OpenAPI</a>.</li>
          <li><strong>Déclencher un workflow</strong> à chaque événement (entrée verrouillée, tube sorti…) : nœud « Webhook » en POST, puis déclarez son adresse dans « Webhooks » ci-dessous.</li>
        </ul>
        <Snippet title="Exemple : créer une entrée (HTTP Request, corps JSON)" text={json({ project_id: '…', title: 'Mesures du jour', content_markdown: '| Échantillon | DO600 |\n|---|---|\n| A | 0,52 |' })} />
      </>
    ),
  },
  {
    key: 'scripts',
    label: 'Scripts (curl, Python)',
    render: (e, token) => (
      <>
        <Snippet title="curl" text={`# Chercher dans tout le cahier
curl -H "Authorization: Bearer ${token}" "${e.api}/search?query=DegU"

# Créer une entrée (jeton en écriture), contenu en Markdown
curl -X POST "${e.api}/entries" \\
  -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \\
  -d '{"project_id": "…", "title": "Mesures du jour", "content_markdown": "## Résultats\\n\\n- DO600 : 0,52"}'`}
        />
        <Snippet title="Python (requests)" text={`import requests

paillasse = requests.Session()
paillasse.headers["Authorization"] = "Bearer ${token}"
API = "${e.api}"

# Les dix dernières entrées
for entree in paillasse.get(f"{API}/entries", params={"limit": 10}).json()["entries"]:
    print(entree["date"], entree["title"], entree["url"])

# Une entrée en Markdown
print(paillasse.get(f"{API}/entries/<identifiant>").json()["markdown"])

# Où est ce tube ?
print(paillasse.get(f"{API}/samples/ECH-0001").json()["location"])`}
        />
      </>
    ),
  },
  {
    key: 'rag',
    label: 'Index de recherche (RAG)',
    render: (e, token) => (
      <>
        <p>Pour qu’une IA locale (connaissances d’Open WebUI, AnythingLLM, LlamaIndex…) cherche dans tout le cahier : exportez
          une fois tous les documents (une entrée, une séquence, un tube… par ligne, en Markdown avec ses métadonnées), puis
          suivez seulement ce qui change.</p>
        <Snippet title="1. Tout exporter (NDJSON)" text={`curl -H "Authorization: Bearer ${token}" -D entetes.txt "${e.documents}" > paillasse.ndjson
# Curseur à garder pour la suite : en-tête X-Paillasse-Cursor dans entetes.txt`}
        />
        <Snippet title="2. Ensuite, seulement ce qui a changé (Python)" text={`import requests

paillasse = requests.Session()
paillasse.headers["Authorization"] = "Bearer ${token}"
API = "${e.api}"
curseur = 0  # ou celui de l'export (X-Paillasse-Cursor), gardé d'un passage à l'autre

r = paillasse.get(f"{API}/changes", params={"cursor": curseur}).json()
for c in r["changes"]:
    if c["deleted"]:
        index.supprimer(c["object_id"])          # supprimé, ou plus visible
    else:
        index.mettre_a_jour(c["links"]["api"])   # relire l'objet
curseur = r["next_cursor"]                       # à garder pour le prochain passage`}
        />
        <p className="small muted">Ou recevez les changements au fil de l’eau avec un webhook (ci-dessous). Les événements sont gardés 90 jours.</p>
      </>
    ),
  },
];

/** Connecter un outil : adresses, pas à pas et configurations, avec le jeton qui vient d'être créé. */
export default function ConnectCard({ endpoints, token }) {
  const [tool, setTool] = useState(TOOLS[0].key);
  const shown = token ?? TOKEN_PLACEHOLDER;
  const current = TOOLS.find((t) => t.key === tool);
  return (
    <Card title="Connecter un outil" icon={Plug}>
      <p className="small muted">
        Les IA locales se branchent sur le <strong>serveur MCP</strong> de Paillasse : elles y trouvent les outils (chercher, lire
        et écrire des entrées, séquences, tubes…), les documents et des consignes prêtes à l’emploi. Les autres outils passent par
        l’<strong>API REST</strong>. {token ? 'Les exemples contiennent le jeton que vous venez de créer.' : <>Remplacez <code>{TOKEN_PLACEHOLDER}</code> par un jeton.</>}
      </p>
      <div className="int-tools" role="tablist" aria-label="Outil à connecter">
        {TOOLS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={t.key === tool} className={`chip${t.key === tool ? ' is-active' : ''}`} onClick={() => setTool(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="int-tool" role="tabpanel">{current.render(endpoints, shown)}</div>
    </Card>
  );
}
