import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Plus } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { fold } from '../../lib/calc/units.js';
import Modal from '../Modal.jsx';
import { loadReagents, useReagents } from './useReagents.js';

const EMPTY = { name: '', formula: '', mw: '', category: '', stock_conc: '', working_conc: '', notes: '' };
const mwText = (mw) => (mw == null ? '' : String(mw).replace('.', ','));

function ReagentDialog({ reagent, categories, onClose, onSaved }) {
  const { notify } = useApp();
  const [form, setForm] = useState(() => (reagent ? { ...EMPTY, ...reagent, mw: mwText(reagent.mw) } : EMPTY));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, form[k]]));
      const saved = reagent ? await api.put(`/reagents/${reagent.id}`, body) : await api.post('/reagents', body);
      notify(reagent ? `« ${saved.name} » modifié.` : `« ${saved.name} » ajouté.`, 'success');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await api.post(`/reagents/${reagent.id}/archive`, { archived: !reagent.archived });
      notify(reagent.archived ? `« ${reagent.name} » rétabli.` : `« ${reagent.name} » archivé.`, 'success');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={reagent ? `Modifier « ${reagent.name} »` : 'Nouveau produit'}
      onClose={onClose}
      footer={(
        <>
          {reagent && (
            <button type="button" className="btn btn-ghost modal-foot-left" onClick={archive} disabled={busy}>
              {reagent.archived ? <><ArchiveRestore size={15} /> Rétablir</> : <><Archive size={15} /> Archiver</>}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          {!reagent?.archived && <button type="submit" form="reagent-form" className="btn btn-primary" disabled={busy}>Enregistrer</button>}
        </>
      )}
    >
      <form id="reagent-form" className="form-stack" onSubmit={submit}>
        <div className="field-row">
          <label className="field"><span>Nom</span><input value={form.name} onChange={set('name')} required /></label>
          <label className="field"><span>Formule</span><input value={form.formula} onChange={set('formula')} placeholder="C4H11NO3·HCl" /></label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Masse molaire (g/mol)</span>
            <input inputMode="decimal" value={form.mw} onChange={set('mw')} placeholder="Vide si sans objet (extrait, mélange)" />
          </label>
          <label className="field">
            <span>Catégorie</span>
            <input value={form.category} onChange={set('category')} list="reagent-categories" />
            <datalist id="reagent-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>
        <div className="field-row">
          <label className="field"><span>Solution mère usuelle</span><input value={form.stock_conc} onChange={set('stock_conc')} placeholder="100 mg/mL (eau)" /></label>
          <label className="field"><span>Concentration d’usage</span><input value={form.working_conc} onChange={set('working_conc')} placeholder="50–100 µg/mL" /></label>
        </div>
        <label className="field"><span>Notes</span><textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="pKa, CMC, conservation…" /></label>
        {reagent && <p className="hint">Changer la masse molaire ne modifie pas les calculs déjà insérés dans le cahier : chacun garde la valeur utilisée.</p>}
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

export default function ReagentsPanel() {
  const current = useReagents();
  const [archived, setArchived] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [editing, setEditing] = useState(null); // produit, ou {} pour un nouveau
  const { notify } = useApp();

  const list = showArchived ? archived : current;
  const categories = useMemo(() => [...new Set((current ?? []).map((r) => r.category).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr')), [current]);
  const shown = useMemo(() => {
    const needle = fold(q).trim();
    return (list ?? []).filter((r) => (!category || r.category === category)
      && (!needle || fold(`${r.name} ${r.formula} ${r.category}`).includes(needle)));
  }, [list, q, category]);

  const toggleArchived = async (on) => {
    setShowArchived(on);
    if (on) {
      try {
        const all = await api.get('/reagents?archived=true');
        setArchived(all.filter((r) => r.archived));
      } catch (err) {
        notify(err.message, 'error');
      }
    }
  };

  const saved = () => {
    setEditing(null);
    loadReagents(true);
    if (showArchived) toggleArchived(true);
  };

  return (
    <section className="reagents" aria-label="Produits">
      <div className="reagents-bar">
        <input
          type="search"
          className="picker-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, formule ou catégorie"
          aria-label="Rechercher un produit"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Catégorie">
          <option value="">Toutes les catégories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => toggleArchived(e.target.checked)} /> Archivés</label>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={15} /> Ajouter un produit</button>
      </div>
      <p className="hint">
        {list ? `${shown.length} produit${shown.length > 1 ? 's' : ''} sur ${list.length}. ` : 'Chargement… '}
        Cliquez sur un produit pour le modifier. Les calculs proposent ces produits et reprennent leur masse molaire.
      </p>
      <div className="table-wrap">
        <table className="seq-table reagents-table">
          <thead>
            <tr><th>Nom</th><th>Formule</th><th className="num">M (g/mol)</th><th>Catégorie</th><th>Solution mère, usage, notes</th></tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} onClick={() => setEditing(r)}>
                <td>
                  <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setEditing(r); }}>{r.name}</button>
                </td>
                <td className="muted">{r.formula}</td>
                <td className="num">{mwText(r.mw) || '—'}</td>
                <td className="muted">{r.category}</td>
                <td className="muted small">{[r.stock_conc && `mère ${r.stock_conc}`, r.working_conc && `usage ${r.working_conc}`, r.notes].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <ReagentDialog
          reagent={editing.id ? editing : null}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
    </section>
  );
}
