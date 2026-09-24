import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import NoteEditor from '../components/NoteEditor.jsx';

export default function TemplateEditPage({ id }) {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const content = useRef(null);

  useEffect(() => {
    api.get(`/templates/${id}`)
      .then((t) => {
        setTemplate(t);
        setName(t.name);
        setDescription(t.description);
        content.current = t.content;
      })
      .catch((err) => notify(err.message, 'error'));
  }, [id, notify]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/templates/${id}`, { name, description, content: content.current });
      setDirty(false);
      notify('Modèle enregistré.', 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Supprimer le modèle « ${name} » ? Les entrées déjà créées à partir de lui ne changent pas.`)) return;
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
          <button type="button" className="btn btn-ghost" onClick={remove}><Trash2 size={15} /> Supprimer</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}>Enregistrer le modèle</button>
        </div>
      </div>
      <div className="sheet">
        <input
          className="sheet-title"
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          aria-label="Nom du modèle"
        />
        <input
          className="sheet-subtitle"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setDirty(true); }}
          placeholder="Description courte (visible dans la liste des modèles)"
          aria-label="Description du modèle"
        />
        <NoteEditor
          content={template.content}
          onChange={(json) => { content.current = json; setDirty(true); }}
          placeholder="Écrivez la trame du protocole : matériel, tampons, étapes, tableau de pipetage…"
        />
      </div>
    </div>
  );
}
