import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilePlus2, Search } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { todayISO } from '../lib/format.js';
import Modal from './Modal.jsx';
import {
  CategoryChips, LAB_CATEGORY, TemplateCardBody, filterTemplates, groupTemplates, templateCategories,
} from './TemplateGallery.jsx';

export default function NewEntryDialog({ initialProjectId, initialTemplateId = '', onClose }) {
  const { projects, reloadProjects, notify } = useApp();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [projectId, setProjectId] = useState(initialProjectId || projects[0]?.id || '');
  const [newProjectName, setNewProjectName] = useState('');
  const [templates, setTemplates] = useState(null);
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const noProject = projects.length === 0;

  const scroller = useRef(null);

  useEffect(() => {
    api.get('/templates').then(setTemplates).catch(() => setTemplates([]));
  }, []);
  // Modèle choisi d'avance (page Modèles) : la carte est montrée dans la liste
  useEffect(() => {
    if (templates && initialTemplateId) scroller.current?.querySelector('.is-selected')?.scrollIntoView({ block: 'nearest' });
  }, [templates, initialTemplateId]);

  const chosen = templates?.find((t) => t.id === templateId) ?? null;
  const shown = useMemo(() => {
    const list = filterTemplates(templates ?? [], q);
    return groupTemplates(category ? list.filter((t) => (t.category || LAB_CATEGORY) === category) : list);
  }, [templates, q, category]);

  // tplId : modèle choisi par un double-clic, avant que l'état ne soit à jour
  const submit = async (e, tplId = templateId) => {
    e?.preventDefault();
    if (busy || (noProject && !newProjectName.trim())) return;
    const tpl = templates?.find((t) => t.id === tplId) ?? null;
    setBusy(true);
    try {
      let pid = projectId;
      if (noProject) pid = (await api.post('/projects', { name: newProjectName })).id;
      const entry = await api.post('/entries', {
        project_id: pid, title: title.trim() || tpl?.name || '', entry_date: date, template_id: tplId || undefined,
      });
      reloadProjects();
      onClose();
      navigate(`/entries/${entry.id}`);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  const card = (t) => (
    <li key={t.id}>
      <button
        type="button"
        role="radio"
        aria-checked={templateId === t.id}
        className={`tpl-card tpl-choice${templateId === t.id ? ' is-selected' : ''}`}
        onClick={() => setTemplateId(t.id)}
        onDoubleClick={() => { setTemplateId(t.id); submit(null, t.id); }}
      >
        <TemplateCardBody t={t} compact />
      </button>
    </li>
  );

  return (
    <Modal
      title="Nouvelle entrée"
      onClose={onClose}
      wide
      footer={(
        <>
          <span className="modal-foot-note">{chosen ? <>Modèle : <strong>{chosen.name}</strong></> : 'Page vierge'}</span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="entry-form" className="btn btn-primary" disabled={busy || (noProject && !newProjectName.trim())}>
            Créer l'entrée
          </button>
        </>
      )}
    >
      <form id="entry-form" onSubmit={submit} className="form-stack">
        <label className="field">
          <span>Titre</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={chosen ? `${chosen.name} : …` : 'ex. Purification YukB-His6, Ni-NTA'} />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          {noProject ? (
            <label className="field">
              <span>Projet</span>
              <input value={newProjectName} onChange={(e) => setNewProjectName(e.target.value)} placeholder="Nom du premier projet" required />
            </label>
          ) : (
            <label className="field">
              <span>Projet</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
        </div>
        <fieldset className="tpl-picker">
          <legend>Partir d’un modèle</legend>
          <div className="tpl-filter">
            <label className="st-search"><Search size={15} aria-hidden="true" /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Western, PCR, purification…" aria-label="Rechercher un modèle" /></label>
            {templates?.length > 0 && <CategoryChips categories={templateCategories(templates)} value={category} onChange={setCategory} />}
          </div>
          <div className="tpl-scroll" role="radiogroup" aria-label="Modèle" ref={scroller}>
            {!q && !category && (
              <ul className="tpl-grid">
                <li>
                  <button type="button" role="radio" aria-checked={!templateId} className={`tpl-card tpl-choice${!templateId ? ' is-selected' : ''}`} onClick={() => setTemplateId('')} onDoubleClick={() => { setTemplateId(''); submit(null, ''); }}>
                    <span className="tpl-icon" aria-hidden="true"><FilePlus2 size={18} /></span>
                    <span className="tpl-body"><span className="tpl-name">Page vierge</span><span className="tpl-desc">Commencer sans trame.</span></span>
                  </button>
                </li>
              </ul>
            )}
            {templates === null && <p className="muted small">Chargement des modèles…</p>}
            {templates && shown.length === 0 && <p className="muted small">Aucun modèle ne correspond.</p>}
            {shown.map((g) => (
              <section key={g.category} className="tpl-group">
                <h3 className="tpl-group-title">{g.category}</h3>
                <ul className="tpl-grid">{g.items.map(card)}</ul>
              </section>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
