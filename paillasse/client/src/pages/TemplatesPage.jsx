import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { formatDateTime } from '../lib/format.js';

export default function TemplatesPage() {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);

  useEffect(() => {
    api.get('/templates').then(setTemplates).catch((err) => notify(err.message, 'error'));
  }, [notify]);

  const create = async () => {
    try {
      const t = await api.post('/templates', { name: 'Nouveau modèle' });
      navigate(`/templates/${t.id}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Modèles</h1>
          <p className="page-lead">Protocoles et trames réutilisables : une nouvelle entrée peut partir d'un modèle.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={create}><Plus size={16} /> Nouveau modèle</button>
      </header>
      {templates?.length === 0 && (
        <div className="empty">
          <p>Aucun modèle.</p>
          <p className="muted">Créez-en un ici, ou depuis une entrée existante avec « Enregistrer comme modèle ».</p>
        </div>
      )}
      {templates?.length > 0 && (
        <ul className="entry-list">
          {templates.map((t) => (
            <li key={t.id}>
              <Link to={`/templates/${t.id}`} className="entry-row">
                <span className="entry-row-main">
                  <span className="entry-row-title">{t.name}</span>
                  {t.description && <span className="entry-row-excerpt">{t.description}</span>}
                </span>
                <span className="entry-row-meta muted">Modifié le {formatDateTime(t.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
