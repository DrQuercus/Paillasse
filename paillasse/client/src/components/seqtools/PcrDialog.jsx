import { useEffect, useMemo, useState } from 'react';
import { CircleAlert, Info, Plus, TriangleAlert } from 'lucide-react';
import { api } from '../../api.js';
import { nf, pos } from '../../lib/dna.js';
import Modal from '../Modal.jsx';

const LEVEL_ICONS = { error: CircleAlert, warn: TriangleAlert, info: Info };

function PrimerField({ label, value, onChange, primers }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="pcr-primer">
        <input
          className="mono-input"
          value={value.bases}
          onChange={(e) => onChange({ ...value, bases: e.target.value.toUpperCase().replace(/[^ACGTURYSWKMBDHVN]/gi, '') })}
          placeholder="Séquence 5′ → 3′"
          aria-label={`${label} : séquence`}
        />
        <input
          className="pcr-name"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          placeholder="Nom"
          aria-label={`${label} : nom`}
        />
        {primers.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const p = primers.find((x) => x.id === e.target.value);
              if (p) onChange({ name: p.name, bases: p.bases.toUpperCase() });
            }}
            aria-label={`${label} : choisir une amorce du registre`}
          >
            <option value="">Amorces de la séquence…</option>
            {primers.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.bases.length} nt)</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

/** PCR virtuelle : produit, mésappariements, sites parasites, température d'hybridation. */
export default function PcrDialog({ sequenceId, version, name, data, onClose, onCreated, notify }) {
  const available = data?.primers ?? [];
  const [forward, setForward] = useState({ name: '', bases: '' });
  const [reverse, setReverse] = useState({ name: '', bases: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [productName, setProductName] = useState('');
  const [index, setIndex] = useState(0);

  // Pré-remplissage : deux premières amorces de la séquence qui vont dans des sens opposés
  useEffect(() => {
    const fwd = available.find((p) => p.sites[0]?.strand === 1);
    const rev = available.find((p) => p.sites[0]?.strand === -1);
    if (fwd) setForward({ name: fwd.name, bases: fwd.bases.toUpperCase() });
    if (rev) setReverse({ name: rev.name, bases: rev.bases.toUpperCase() });
  }, [available.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post(`/sequences/${sequenceId}/pcr`, { forward, reverse, version });
      setResult(r);
      setIndex(0);
      setProductName(`${name} — PCR ${r.forward.name || 'sens'} × ${r.reverse.name || 'antisens'}`.slice(0, 120));
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const created = await api.post(`/sequences/${sequenceId}/pcr/create`, {
        forward: result.forward, reverse: result.reverse, product_index: index, name: productName,
      });
      notify(`${created.code} « ${created.name} » créé (${nf(created.length)} pb).`, 'success');
      onCreated(created);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  const product = result?.products?.[index];
  const canRun = forward.bases.length >= 10 && reverse.bases.length >= 10;
  const tailNote = (p, side) => (p[side].tail_length ? `, dont ${p[side].tail_length} nt de queue 5′` : '');

  const sequencePreview = useMemo(() => {
    if (!result?.sequence || index !== 0) return null;
    const s = result.sequence;
    return s.length <= 160 ? s : `${s.slice(0, 80)} … ${s.slice(-60)}`;
  }, [result, index]);

  return (
    <Modal
      wide
      title={`PCR virtuelle sur ${name}`}
      onClose={onClose}
      footer={product ? (
        <>
          <span className="modal-foot-note">Le produit devient une séquence du registre, avec sa recette.</span>
          <button type="button" className="btn" onClick={onClose}>Fermer</button>
          <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
            <Plus size={15} /> Créer le produit
          </button>
        </>
      ) : <button type="button" className="btn" onClick={onClose}>Fermer</button>}
    >
      <form className="primer-form" onSubmit={run}>
        <PrimerField label="Amorce sens" value={forward} onChange={setForward} primers={available} />
        <PrimerField label="Amorce antisens" value={reverse} onChange={setReverse} primers={available} />
        <button className="btn btn-primary" disabled={busy || !canRun}>{busy ? 'Simulation…' : 'Simuler la PCR'}</button>
      </form>

      {result && (
        <div className="primer-results">
          {result.warnings.map((w) => {
            const Icon = LEVEL_ICONS[w.level] ?? Info;
            return <p key={w.text} className={`pcr-warn pcr-${w.level}`}><Icon size={15} /> {w.text}</p>;
          })}

          {result.products.length > 1 && (
            <div className="chip-row">
              {result.products.map((p, i) => (
                <button key={i} type="button" className={`chip${index === i ? ' is-active' : ''}`} onClick={() => setIndex(i)}>
                  Produit {i + 1} : {nf(p.length)} pb
                </button>
              ))}
            </div>
          )}

          {product && (
            <>
              <dl className="pcr-facts">
                <dt>Produit</dt><dd><strong>{nf(product.length)} pb</strong>{product.region.wraps_origin ? ' (passe par l’origine du plasmide)' : ''}</dd>
                <dt>Région amplifiée</dt><dd>{pos(product.region.start)} – {pos(product.region.end)} sur {nf(result.template.length)} pb</dd>
                <dt>Amorce sens</dt><dd>{product.forward.annealed_length} nt hybridés{tailNote(product, 'forward')}, Tm {String(product.forward.tm).replace('.', ',')} °C</dd>
                <dt>Amorce antisens</dt><dd>{product.reverse.annealed_length} nt hybridés{tailNote(product, 'reverse')}, Tm {String(product.reverse.tm).replace('.', ',')} °C</dd>
                <dt>Annotations reportées</dt><dd>{product.feature_count}</dd>
              </dl>

              {result.annealing_temperatures && (
                <div className="ta-row">
                  <span className="rb-label">Température d'hybridation conseillée</span>
                  <ul className="ta-list">
                    {result.annealing_temperatures.map((t) => (
                      <li key={t.name}><strong>{t.value} °C</strong> <span>{t.name}</span><span className="muted small"> — {t.note}</span></li>
                    ))}
                  </ul>
                  <p className="hint">Point de départ à valider par un gradient : ces règles diffèrent d'un fabricant à l'autre.</p>
                </div>
              )}

              {sequencePreview && (
                <div className="field">
                  <span>Séquence du produit</span>
                  <code className="oligo-seq">{sequencePreview}</code>
                </div>
              )}

              <label className="field">
                <span>Nom du produit</span>
                <input value={productName} onChange={(e) => setProductName(e.target.value)} />
              </label>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
