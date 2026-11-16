import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArchiveRestore, Copy, FilePlus2, Plus, Search } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import {
  CategoryChips, LAB_CATEGORY, TemplateCardBody, filterTemplates, groupTemplates, templateCategories,
} from '../components/TemplateGallery.jsx';

export default function TemplatesPage() {
  const { notify, openNewEntry } = useApp();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);
  const [archived, setArchived] = useState([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');

  const load = useCallback(() => {
    api.get('/templates').then(setTemplates).catch((err) => notify(err.message, 'error'));
    api.get('/templates?archived=true').then(setArchived).catch(() => setArchived([]));
  }, [notify]);
  useEffect(load, [load]);

  const groups = useMemo(() => {
    const list = filterTemplates(templates ?? [], q);
    return groupTemplates(category ? list.filter((t) => (t.category || LAB_CATEGORY) === category) : list);
  }, [templates, q, category]);

  const create = async () => {
    try {
      const t = await api.post('/templates', { name: 'Nouveau modèle', category: category && category !== LAB_CATEGORY ? category : '' });
      navigate(`/templates/${t.id}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const duplicate = async (t) => {
    try {
      const copy = await api.post('/templates', { from_template_id: t.id });
      navigate(`/templates/${copy.id}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const restore = async (t) => {
    try {
      await api.post(`/templates/${t.id}/restore`, {});
      notify(`« ${t.name} » est de retour parmi les modèles.`, 'success');
      load();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>Modèles</h1>
          <p className="page-lead">
            Trames réutilisables : une nouvelle entrée part d’un modèle, avec ses tableaux, ses étapes à cocher, ses calculs
            et des emplacements à remplir (figure de gel, graphique, photo). Les modèles de base se modifient comme les autres.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={create}><Plus size={16} /> Nouveau modèle</button>
      </header>

      <div className="tpl-filter tpl-filter-page">
        <label className="st-search"><Search size={15} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : western, PCR, tampon…" aria-label="Rechercher un modèle" /></label>
        {templates?.length > 0 && <CategoryChips categories={templateCategories(templates)} value={category} onChange={setCategory} />}
      </div>

      {templates?.length === 0 && (
        <div className="empty">
          <p>Aucun modèle.</p>
          <p className="muted">Créez-en un ici, ou depuis une entrée existante avec « Enregistrer comme modèle ».</p>
        </div>
      )}
      {templates?.length > 0 && groups.length === 0 && <p className="muted">Aucun modèle ne correspond à cette recherche.</p>}

      {groups.map((g) => (
        <section key={g.category} className="tpl-group">
          <h2 className="section-title">{g.category}</h2>
          <ul className="tpl-grid tpl-grid-page">
            {g.items.map((t) => (
              <li key={t.id} className="tpl-card tpl-card-page">
                <Link to={`/templates/${t.id}`} className="tpl-card-link" aria-label={`Modifier le modèle ${t.name}`}>
                  <TemplateCardBody t={t} />
                </Link>
                <span className="tpl-actions">
                  <button type="button" className="btn btn-small btn-primary" onClick={() => openNewEntry(undefined, t.id)}>
                    <FilePlus2 size={14} /> Nouvelle entrée
                  </button>
                  <button type="button" className="btn btn-small btn-ghost" onClick={() => duplicate(t)} title="Copier ce modèle pour en faire une variante">
                    <Copy size={14} /> Dupliquer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {archived.length > 0 && (
        <details className="tpl-archived">
          <summary>Modèles retirés ({archived.length})</summary>
          <ul className="entry-list">
            {archived.map((t) => (
              <li key={t.id} className="tpl-archived-row">
                <span>
                  <strong>{t.name}</strong>
                  {t.category && <span className="muted small"> · {t.category}</span>}
                </span>
                <button type="button" className="btn btn-small" onClick={() => restore(t)}><ArchiveRestore size={14} /> Remettre</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
