import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, ArrowLeft, Copy, FilePlus2, RotateCcw } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import NoteEditor from '../components/NoteEditor.jsx';
import { TEMPLATE_CATEGORIES } from '../lib/templates/categories.js';

export default function TemplateEditPage({ id }) {
  const { notify, openNewEntry } = useApp();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState(TEMPLATE_CATEGORIES);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const content = useRef(null);

  const show = (t) => {
    setTemplate(t);
    setName(t.name);
    setDescription(t.description);
    setCategory(t.category ?? '');
    content.current = t.content;
  };

  useEffect(() => {
    api.get(`/templates/${id}`).then(show).catch((err) => notify(err.message, 'error'));
    api.get('/templates').then((list) => setCategories([...new Set([...TEMPLATE_CATEGORIES, ...list.map((t) => t.category).filter(Boolean)])])).catch(() => {});
  }, [id, notify]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (setter) => (e) => { setter(e.target.value); setDirty(true); };

  const save = async () => {
    setBusy(true);
    try {
      setTemplate(await api.put(`/templates/${id}`, { name, description, category, content: content.current }));
      setDirty(false);
      notify('Modèle enregistré.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm(`Revenir au modèle « ${template.name} » livré avec Paillasse ? Les modifications du labo sur ce modèle seront perdues (les entrées déjà créées ne changent pas).`)) return;
    try {
      show(await api.post(`/templates/${id}/reset`, {}));
      setEditorKey((k) => k + 1);
      setDirty(false);
      notify('Modèle d’origine rétabli.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const duplicate = async () => {
    try {
      const copy = await api.post('/templates', { from_template_id: id });
      navigate(`/templates/${copy.id}`);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const retire = async () => {
    if (!window.confirm(`Retirer le modèle « ${name} » ? Il ne sera plus proposé, mais pourra être remis depuis la page Modèles. Les entrées déjà créées ne changent pas.`)) return;
    try {
      await api.del(`/templates/${id}`);
      navigate('/templates');
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (!template) return <div className="page"><p className="muted">Chargement…</p></div>;

  return (
    <div className="page page-wide">
      <div className="entry-bar">
        <Link to="/templates" className="crumb"><ArrowLeft size={15} /> Modèles</Link>
        <span className={`save-state ${dirty ? 'save-pending' : 'save-saved'}`}>{dirty ? 'Modifications non enregistrées' : 'Enregistré'}</span>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={retire}><Archive size={15} /> Retirer</button>
          <button type="button" className="btn btn-ghost" onClick={duplicate} disabled={dirty} title={dirty ? 'Enregistrez d’abord le modèle' : 'Copier ce modèle pour en faire une variante'}><Copy size={15} /> Dupliquer</button>
          <button type="button" className="btn" onClick={() => openNewEntry(undefined, id)} disabled={dirty} title={dirty ? 'Enregistrez d’abord le modèle' : undefined}><FilePlus2 size={15} /> Nouvelle entrée</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}>Enregistrer le modèle</button>
        </div>
      </div>
      {template.builtin && (
        <p className="tpl-origin">
          {template.modified
            ? <>Modèle de base adapté par le labo : Paillasse ne le met plus à jour. <button type="button" className="link-btn" onClick={reset}><RotateCcw size={13} /> Revenir à la version d’origine</button></>
            : 'Modèle de base fourni avec Paillasse : modifiez-le librement pour l’adapter au labo.'}
        </p>
      )}
      <div className="sheet">
        <input className="sheet-title" value={name} onChange={edit(setName)} aria-label="Nom du modèle" />
        <input
          className="sheet-subtitle"
          value={description}
          onChange={edit(setDescription)}
          placeholder="Description courte (visible dans la galerie des modèles)"
          aria-label="Description du modèle"
        />
        <label className="tpl-category">
          <span>Catégorie</span>
          <input value={category} onChange={edit(setCategory)} list="template-categories" placeholder="Modèles du labo" />
          <datalist id="template-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <NoteEditor
          key={editorKey}
          templateMode
          content={template.content}
          onChange={(json) => { content.current = json; setDirty(true); }}
          placeholder="Écrivez la trame du protocole : matériel, tampons, étapes, tableau de pipetage…"
        />
      </div>
    </div>
  );
}
