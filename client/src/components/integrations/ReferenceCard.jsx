import { BookOpenText } from 'lucide-react';
import { Card } from '../admin/common.jsx';
import { Address } from './common.jsx';

/** Adresses de l'API et liste de ce qu'un outil connecté peut faire. */
export default function ReferenceCard({ endpoints: e, operations }) {
  const groups = new Map();
  for (const op of operations ?? []) {
    if (!groups.has(op.group)) groups.set(op.group, []);
    groups.get(op.group).push(op);
  }
  return (
    <Card title="Référence" icon={BookOpenText}>
      <div className="int-addresses">
        <Address label="Serveur MCP" value={e.mcp} hint="Streamable HTTP, sans état. ?profile=assistant : outils choisis pour une IA de labo." />
        <Address label="API de l’assistant" value={e.assistant_api} hint="Serveur d’outils OpenAPI (description : openapi.json), noms préfixés, écriture en deux temps." />
        <Address label="API REST" value={e.api} hint="Jeton dans l’en-tête Authorization: Bearer pai_…" />
        <Address label="Description OpenAPI" value={e.openapi} href={e.openapi} />
        <Address label="Changements" value={e.changes} hint="Curseur : ce qui a changé depuis le dernier passage." />
        <Address label="Documents (RAG)" value={e.documents} hint="Tout ce que le compte voit, en NDJSON, Markdown et métadonnées." />
        <Address label="Mode d’emploi pour une IA" value={e.llms} href={e.llms} hint="llms.txt : à donner à une IA qui doit écrire un script ou un workflow." />
      </div>
      {operations?.length > 0 && (
        <details className="int-more">
          <summary>Ce qu’un outil connecté peut faire ({operations.length} opérations)</summary>
          <p className="small muted">Chaque opération est un outil MCP du même nom et une route de l’API REST. Celles marquées « écriture » demandent un jeton en lecture et écriture.</p>
          {[...groups].map(([group, ops]) => (
            <section key={group} className="int-ops">
              <h3>{group}</h3>
              <ul>
                {ops.map((op) => (
                  <li key={op.name}>
                    <code>{op.name}</code>
                    {op.scope === 'write' && <span className="int-badge">écriture</span>}
                    <span>{op.summary}</span>
                    <small className="muted mono">{op.method} {op.path}</small>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </details>
      )}
    </Card>
  );
}
