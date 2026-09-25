import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowUpFromLine, Copy, Dna, Droplets, FileText, History, MapPin, Move, Pencil, Trash2, X,
} from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { CAP_COLORS, CAP_HEX, CAP_LABELS, since } from '../../lib/inventory.js';
import { Cap, TypeIcon, typeLabel } from './bits.jsx';

const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR') : '');

/** Décongélations : un flocon par cycle, en couleur chaude au-delà de 3. */
function ThawMeter({ n }) {
  if (!n) return <span className="muted">jamais</span>;
  return (
    <span className={`thaw${n >= 3 ? ' is-many' : ''}`} title={`${n} décongélation${n > 1 ? 's' : ''}`}>
      {Array.from({ length: Math.min(n, 8) }, (_, i) => <Droplets key={i} size={13} aria-hidden="true" />)}
      <span>{n}</span>
    </span>
  );
}

const EVENT_LABELS = { created: 'Rangé', moved: 'Déplacé', out: 'Sorti', back: 'Remis', thawed: 'Décongelé', discarded: 'Jeté', edited: 'Modifié', restored: 'Remis en service' };

/** Fiche d'un tube : où il est, ce qu'il contient, ce qu'on peut en faire, son histoire. */
export function SamplePanel({ sampleId, version, onAction, onEdit, onMove, onMore, onClose }) {
  const { notify } = useApp();
  const [s, setS] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const [reason, setReason] = useState('');
  useEffect(() => {
    setDiscarding(false);
    api.get(`/inventory/samples/${sampleId}`).then(setS).catch((err) => notify(err.message, 'error'));
  }, [sampleId, version, notify]);
  if (!s) return <div className="sample-card is-loading" aria-busy="true" />;
  const expired = s.expires_on && s.expires_on < new Date().toISOString().slice(0, 10);
  const act = (action, extra = {}) => onAction([s.id], action, extra);

  return (
    <article className="sample-card" aria-label={`Tube ${s.name}`}>
      <header className="sample-head">
        <Cap sample={s} size={46} label />
        <div className="sample-title">
          <h3>{s.name}</h3>
          <span className="code-chip">{s.code}</span>
          <span className="type-badge"><TypeIcon type={s.type} size={12} /> {typeLabel(s.type)}</span>
          {s.aliquot && <span className="type-badge">aliquot {s.aliquot}</span>}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer la fiche"><X size={16} /></button>
      </header>

      {s.status === 'out' && (
        <div className="out-banner" role="status">
          <ArrowUpFromLine size={16} aria-hidden="true" />
          <span>Sorti du froid {since(s.out_since)} : {s.position ? `sa place ${s.position} l’attend` : 'pensez à le remettre'}.</span>
          <span className="out-actions">
            <button type="button" className="btn btn-small btn-primary" onClick={() => act('back', { thawed: true })}><ArrowDownToLine size={13} /> Remis (décongelé)</button>
            <button type="button" className="btn btn-small" onClick={() => act('back', { thawed: false })}>Resté congelé</button>
          </span>
        </div>
      )}

      <p className="sample-where"><MapPin size={14} aria-hidden="true" /> {s.location || 'Sans emplacement'}</p>

      <dl className="facts">
        {s.concentration && <div><dt>Concentration</dt><dd>{s.concentration}</dd></div>}
        {s.volume && <div><dt>Volume</dt><dd>{s.volume}</dd></div>}
        <div><dt>Congelé le</dt><dd>{fmtDate(s.frozen_on) || '—'}</dd></div>
        {s.expires_on && <div className={expired ? 'is-bad' : ''}><dt>Périme le</dt><dd>{fmtDate(s.expires_on)}{expired ? ' (périmé)' : ''}</dd></div>}
        <div><dt>Décongélations</dt><dd><ThawMeter n={s.thaw_count} /></dd></div>
        <div><dt>Propriétaire</dt><dd>{s.owner_name ?? '—'}</dd></div>
        {s.project_name && <div><dt>Projet</dt><dd>{s.project_name}</dd></div>}
      </dl>

      {(s.sequence_id || s.entry_id) && (
        <p className="sample-links">
          {s.sequence_id && <Link to={`/sequences/${s.sequence_id}`}><Dna size={13} aria-hidden="true" /> {s.sequence_code} · {s.sequence_name}</Link>}
          {s.entry_id && <Link to={`/entries/${s.entry_id}`}><FileText size={13} aria-hidden="true" /> {s.entry_title}</Link>}
        </p>
      )}
      {s.notes && <p className="sample-notes">{s.notes}</p>}

      <div className="sample-actions">
        {s.status !== 'out' && <button type="button" className="btn btn-small" onClick={() => act('out')} title="Le tube quitte le froid : sa place reste réservée"><ArrowUpFromLine size={14} /> Sortir</button>}
        <button type="button" className="btn btn-small" onClick={() => act('thaw')} title="Compter une décongélation"><Droplets size={14} /> +1 décongélation</button>
        <button type="button" className="btn btn-small" onClick={() => onMove([s.id])}><Move size={14} /> Déplacer…</button>
        <button type="button" className="btn btn-small" onClick={() => onEdit(s)}><Pencil size={14} /> Modifier</button>
        <button type="button" className="btn btn-small" onClick={() => onMore(s)} title="Ranger d’autres tubes identiques"><Copy size={14} /> Aliquots en plus</button>
        <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => setDiscarding(true)}><Trash2 size={14} /> Épuisé, jeté</button>
      </div>
      {discarding && (
        <form className="discard-box" onSubmit={(e) => { e.preventDefault(); act('discard', { reason }); }}>
          <label className="field"><span>Pourquoi ? (facultatif)</span><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="épuisé, contaminé, périmé…" autoFocus /></label>
          <span className="form-actions">
            <button type="button" className="btn btn-small" onClick={() => setDiscarding(false)}>Annuler</button>
            <button type="submit" className="btn btn-small btn-danger">Retirer le tube</button>
          </span>
          <small className="hint">La place se libère ; le tube reste dans l’historique.</small>
        </form>
      )}

      <details className="sample-history">
        <summary><History size={14} aria-hidden="true" /> Historique ({s.events?.length ?? 0})</summary>
        <ol>
          {(s.events ?? []).map((e, i) => (
            <li key={i}>
              <strong>{EVENT_LABELS[e.kind] ?? e.kind}</strong> <span className="muted small">{new Date(e.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })} · {e.author ?? '—'}</span>
              <span className="small">{e.detail}</span>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

/** Plusieurs tubes choisis (Ctrl+clic ou Maj+clic) : gestes groupés. */
export function BulkPanel({ samples, onAction, onMove, onClear }) {
  const [discarding, setDiscarding] = useState(false);
  const ids = samples.map((s) => s.id);
  return (
    <article className="sample-card bulk">
      <header className="sample-head">
        <span className="bulk-caps">{samples.slice(0, 12).map((s) => <Cap key={s.id} sample={s} size={20} />)}</span>
        <div className="sample-title"><h3>{samples.length} tubes choisis</h3><span className="muted small">{samples.map((s) => s.position).join(', ')}</span></div>
        <button type="button" className="icon-btn" onClick={onClear} aria-label="Tout désélectionner"><X size={16} /></button>
      </header>
      <div className="sample-actions">
        <button type="button" className="btn btn-small" onClick={() => onAction(ids, 'out')}><ArrowUpFromLine size={14} /> Sortir</button>
        <button type="button" className="btn btn-small" onClick={() => onAction(ids, 'back', { thawed: true })}><ArrowDownToLine size={14} /> Remettre</button>
        <button type="button" className="btn btn-small" onClick={() => onMove(ids)}><Move size={14} /> Déplacer…</button>
        <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => setDiscarding(true)}><Trash2 size={14} /> Jeter</button>
      </div>
      <div className="field">
        <span>Couleur des bouchons</span>
        <div className="swatches caps">
          {CAP_COLORS.map((c) => <button key={c} type="button" className="swatch cap-swatch" style={{ '--cap': CAP_HEX[c] }} onClick={() => onAction(ids, 'color', { color: c })} title={CAP_LABELS[c]} aria-label={`Bouchons ${CAP_LABELS[c]}`} />)}
        </div>
      </div>
      {discarding && (
        <p className="discard-box">
          Retirer ces {samples.length} tubes du stockage ?
          <span className="form-actions">
            <button type="button" className="btn btn-small" onClick={() => setDiscarding(false)}>Annuler</button>
            <button type="button" className="btn btn-small btn-danger" onClick={() => onAction(ids, 'discard', { reason: 'retrait groupé' })}>Retirer {samples.length} tubes</button>
          </span>
        </p>
      )}
      <p className="hint">Ctrl+clic ajoute ou retire un tube, Maj+clic prend toute une plage, Échap désélectionne.</p>
    </article>
  );
}
