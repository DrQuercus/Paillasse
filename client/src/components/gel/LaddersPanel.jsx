import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { formatSize } from '../../lib/gel/calibration.js';
import Modal from '../Modal.jsx';
import { Segmented } from './controls.jsx';
import { loadLadders } from './useLadders.js';

const UNIT = { protein: 'kDa', dna: 'pb' };
const MASS_UNIT = { protein: 'µg', dna: 'ng' };
const txt = (v) => (v === null || v === undefined ? '' : String(v).replace('.', ','));

function LadderDialog({ ladder, kind, onClose, onSaved }) {
  const { notify } = useApp();
  const [form, setForm] = useState(() => ({
    name: ladder?.name ?? '',
    kind: ladder?.kind ?? kind,
    supplier: ladder?.supplier ?? '',
    reference: ladder?.reference ?? '',
    notes: ladder?.notes ?? '',
    load: txt(ladder?.load),
    bands: ladder?.bands?.map((b) => ({ size: txt(b.size), mass: txt(b.mass) })) ?? [{ size: '', mass: '' }, { size: '', mass: '' }],
  }));
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const setBand = (i, patch) => setForm((f) => ({ ...f, bands: f.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)) }));

  const fromPaste = () => {
    const sizes = paste.split(/[;,\s]+/).map((x) => x.trim()).filter(Boolean);
    if (sizes.length) setForm((f) => ({ ...f, bands: sizes.map((size) => ({ size, mass: '' })) }));
    setPaste('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, bands: form.bands.filter((b) => b.size.trim()).map((b) => ({ size: b.size, mass: b.mass.trim() || null })) };
      if (ladder) await api.put(`/ladders/${ladder.id}`, body);
      else await api.post('/ladders', body);
      notify(`Marqueur « ${form.name.trim()} » enregistré.`, 'success');
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const archive = async () => {
    setBusy(true);
    try {
      await api.post(`/ladders/${ladder.id}/archive`, { archived: !ladder.archived });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={ladder ? `Modifier « ${ladder.name} »` : 'Nouveau marqueur'}
      onClose={onClose}
      wide
      footer={(
        <>
          {ladder && (
            <button type="button" className="btn btn-ghost modal-foot-left" onClick={archive} disabled={busy}>
              {ladder.archived ? <><ArchiveRestore size={15} /> Rétablir</> : <><Archive size={15} /> Archiver</>}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          {!ladder?.archived && <button type="submit" form="ladder-form" className="btn btn-primary" disabled={busy}>Enregistrer</button>}
        </>
      )}
    >
      <form id="ladder-form" className="form-stack" onSubmit={submit}>
        <div className="field-row">
          <label className="field"><span>Nom</span><input value={form.name} onChange={set('name')} required /></label>
          <div className="field"><span>Type</span>
            <Segmented label="Type" value={form.kind} onChange={(k) => setForm((f) => ({ ...f, kind: k }))} options={[['protein', 'Protéines (kDa)'], ['dna', 'ADN (pb)']]} />
          </div>
        </div>
        <div className="field-row">
          <label className="field"><span>Fournisseur</span><input value={form.supplier} onChange={set('supplier')} /></label>
          <label className="field"><span>Référence</span><input value={form.reference} onChange={set('reference')} /></label>
        </div>
        <div className="field">
          <span>Bandes, de la plus grande à la plus petite</span>
          <div className="gel-inline">
            <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Coller une liste : 250, 130, 100…" aria-label="Liste de tailles à coller" />
            <button type="button" className="btn btn-small" onClick={fromPaste} disabled={!paste.trim()}>Remplir</button>
          </div>
          <table className="gel-table ladder-bands">
            <thead><tr><th>Taille ({UNIT[form.kind]})</th><th>Masse ({MASS_UNIT[form.kind]}, facultatif)</th><th><span className="sr-only">Retirer</span></th></tr></thead>
            <tbody>
              {form.bands.map((b, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <tr key={i}>
                  <td><input inputMode="decimal" aria-label={`Taille de la bande ${i + 1}`} value={b.size} onChange={(e) => setBand(i, { size: e.target.value })} /></td>
                  <td><input inputMode="decimal" aria-label={`Masse de la bande ${i + 1}`} value={b.mass} onChange={(e) => setBand(i, { mass: e.target.value })} /></td>
                  <td><button type="button" className="icon-btn" onClick={() => setForm((f) => ({ ...f, bands: f.bands.filter((_, j) => j !== i) }))} aria-label={`Retirer la bande ${i + 1}`}><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-ghost btn-small calc-add" onClick={() => setForm((f) => ({ ...f, bands: [...f.bands, { size: '', mass: '' }] }))}><Plus size={14} /> Ajouter une bande</button>
        </div>
        <label className="field">
          <span>Quantité déposée à laquelle correspondent les masses ({MASS_UNIT[form.kind]})</span>
          <input inputMode="decimal" value={form.load} onChange={set('load')} placeholder={form.kind === 'dna' ? '500' : ''} />
          <small className="hint">Les masses par bande servent à quantifier l’ADN ; elles figurent sur la fiche du fabricant, pour un dépôt donné.</small>
        </label>
        <label className="field"><span>Notes</span><textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="Système de tampon, lot…" /></label>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

/** Liste des marqueurs, modifiable. */
export default function LaddersPanel({ ladders, onChanged }) {
  const [kind, setKind] = useState('protein');
  const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archived, setArchived] = useState([]);
  const list = useMemo(() => [...(ladders ?? []), ...(showArchived ? archived : [])].filter((l) => l.kind === kind), [ladders, archived, showArchived, kind]);

  const toggleArchived = async (on) => {
    setShowArchived(on);
    if (on) setArchived((await api.get('/ladders?archived=true')).filter((l) => l.archived));
  };
  const saved = async () => {
    setEditing(null);
    await loadLadders(true);
    if (showArchived) toggleArchived(true);
    onChanged?.();
  };

  return (
    <section className="ladders">
      <div className="reagents-bar">
        <Segmented label="Type de marqueur" value={kind} onChange={setKind} options={[['protein', 'Protéines'], ['dna', 'ADN']]} />
        <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => toggleArchived(e.target.checked)} /> Archivés</label>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({})}><Plus size={15} /> Nouveau marqueur</button>
      </div>
      <p className="hint">Une figure insérée garde sa propre copie du marqueur : modifier un marqueur ne change aucune entrée. Les marqueurs précolorés migrent différemment selon le tampon (Tris-glycine, MES, MOPS) : vérifiez les tailles sur la fiche du lot.</p>
      <div className="table-wrap">
        <table className="seq-table">
          <thead><tr><th>Nom</th><th>Fournisseur</th><th>Bandes</th></tr></thead>
          <tbody>
            {list.map((l) => (
              <tr key={l.id} onClick={() => setEditing(l)} className={l.archived ? 'is-archived' : ''}>
                <td><button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); setEditing(l); }}>{l.name}</button>{l.archived && <span className="muted small"> (archivé)</span>}</td>
                <td className="muted">{[l.supplier, l.reference].filter(Boolean).join(' ')}</td>
                <td className="muted small">
                  {l.bands.map((b) => formatSize(b.size, UNIT[l.kind]).replace(/ (kDa|pb|kb)$/, '')).join(' · ')}
                  {l.bands.some((b) => b.mass) ? ' — masses renseignées' : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <LadderDialog ladder={editing.id ? editing : null} kind={kind} onClose={() => setEditing(null)} onSaved={saved} />}
    </section>
  );
}
