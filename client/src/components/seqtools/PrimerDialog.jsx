import { useState } from 'react';
import { Plus, TriangleAlert } from 'lucide-react';
import { api } from '../../api.js';
import Modal from '../Modal.jsx';

const nf = (x) => x.toLocaleString('fr-FR');

function Oligo({ o }) {
  return (
    <span className="oligo">
      <code className="oligo-seq">{o.sequence}</code>
      <span className="oligo-meta">
        {o.length} nt, Tm {String(o.tm).replace('.', ',')} °C, GC {Math.round(o.gc)} %
        {o.truncated && `, Tm calculé sur les ${o.analyzed.length} nt en 3′`}
      </span>
      {o.warnings?.length > 0 && <span className="oligo-warn"><TriangleAlert size={13} /> {o.warnings.join(', ')}</span>}
    </span>
  );
}

function Conditions({ c }) {
  if (!c) return null;
  return (
    <p className="hint">
      Tm primer3 (plus proches voisins, SantaLucia) avec Na⁺ {c.monovalent_mM} mM, Mg²⁺ {String(c.divalent_mM).replace('.', ',')} mM,
      dNTP {String(c.dntp_mM).replace('.', ',')} mM, amorce {c.oligo_nM} nM. Le Tm conseillé pour une polymérase donnée (calculateur NEB…) peut différer de quelques degrés.
    </p>
  );
}

/** Dessin d'amorces pour une région (sélection de l'éditeur), et analyse d'oligos. */
export default function PrimerDialog({ sequenceId, version, name, length, selection, onAdd, onClose, notify }) {
  const [start, setStart] = useState(selection ? selection.start + 1 : '');
  const [end, setEnd] = useState(selection ? selection.end + 1 : '');
  const [mode, setMode] = useState('exact');
  const [tm, setTm] = useState(60);
  const [prefix, setPrefix] = useState('');
  const [result, setResult] = useState(null);
  const [pick, setPick] = useState({ f: 0, r: 0 });
  const [busy, setBusy] = useState(false);
  const [oligo, setOligo] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const v = version ? `?version=${version}` : '';

  const design = async (e) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const r = await api.post(`/sequences/${sequenceId}/primers/design${v}`, { mode, start: Number(start) - 1, end: Number(end) - 1, targetTm: Number(tm) });
      setResult(r);
      setPick({ f: 0, r: 0 });
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const base = prefix.trim() || name.slice(0, 20);
  const add = (f, r) => {
    onAdd([
      { name: `${base}_F`, primer: f },
      { name: `${base}_R`, primer: r },
    ]);
    notify(`Amorces ${base}_F et ${base}_R ajoutées à la séquence.`, 'success');
  };

  const analyze = async () => {
    try {
      setAnalysis(await api.post('/tools/oligos/analyze', { oligos: oligo.split(/[\s,;]+/).filter(Boolean) }));
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const regionLength = start && end ? (Number(end) >= Number(start) ? Number(end) - Number(start) + 1 : length - Number(start) + Number(end) + 1) : 0;

  return (
    <Modal wide title={`Amorces : ${name}`} onClose={onClose}>
      <form className="primer-form" onSubmit={design}>
        <div className="field-row field-row-3">
          <label className="field"><span>Début (pb)</span><input type="number" min="1" max={length} value={start} onChange={(e) => setStart(e.target.value)} required /></label>
          <label className="field"><span>Fin (pb)</span><input type="number" min="1" max={length} value={end} onChange={(e) => setEnd(e.target.value)} required /></label>
          <label className="field"><span>Tm visé (°C)</span><input type="number" min="45" max="75" value={tm} onChange={(e) => setTm(e.target.value)} /></label>
        </div>
        <p className="hint">{selection ? 'Région reprise de la sélection dans l’éditeur.' : 'Astuce : sélectionnez la région dans l’éditeur avant d’ouvrir cet outil.'} {regionLength > 0 && `Région de ${nf(regionLength)} pb.`}</p>
        <div className="segmented">
          <label><input type="radio" name="mode" checked={mode === 'exact'} onChange={() => setMode('exact')} /> <span>Amplifier exactement la région (clonage)</span></label>
          <label><input type="radio" name="mode" checked={mode === 'flanking'} onChange={() => setMode('flanking')} /> <span>Encadrer la région (vérification, séquençage)</span></label>
        </div>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Calcul…' : 'Dessiner les amorces'}</button>
      </form>

      {result?.mode === 'exact' && (
        <div className="primer-results">
          <div className="primer-cols">
            {[['f', 'Amorce sens (début)', result.forward], ['r', 'Amorce antisens (fin)', result.reverse]].map(([k, title, list]) => (
              <fieldset key={k} className="primer-col">
                <legend>{title}</legend>
                {list.map((o, i) => (
                  <label key={o.sequence} className={`primer-choice${pick[k] === i ? ' is-selected' : ''}`}>
                    <input type="radio" name={`pick-${k}`} checked={pick[k] === i} onChange={() => setPick((p) => ({ ...p, [k]: i }))} />
                    <Oligo o={o} />
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <p className="small">
            Produit : {nf(result.product)} pb. Écart de Tm : {String(Math.abs(result.forward[pick.f].tm - result.reverse[pick.r].tm).toFixed(1)).replace('.', ',')} °C.
            {result.pairDimer.any >= result.limits.pairDimer && ' Attention : dimère possible entre les deux amorces.'}
          </p>
          <div className="primer-add">
            <label className="field"><span>Préfixe des noms</span><input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder={name.slice(0, 20)} /></label>
            <button type="button" className="btn btn-primary" onClick={() => add(result.forward[pick.f], result.reverse[pick.r])}>
              <Plus size={15} /> Ajouter cette paire à la séquence
            </button>
          </div>
          <Conditions c={result.conditions} />
        </div>
      )}

      {result?.mode === 'flanking' && (
        <div className="primer-results">
          {!result.pairs.length && <p className="form-error">primer3 n'a trouvé aucune paire : {result.explain}</p>}
          <ol className="pair-list">
            {result.pairs.map((p, i) => (
              <li key={i} className="pair">
                <div className="pair-head">
                  <strong>Paire {i + 1}</strong>
                  <span className="muted small">produit {nf(p.product)} pb, amorces en {nf(p.forward.start + 1)} et {nf(p.reverse.end + 1)}</span>
                  <button type="button" className="btn btn-small" onClick={() => add(p.forward, p.reverse)}><Plus size={14} /> Ajouter</button>
                </div>
                <Oligo o={p.forward} />
                <Oligo o={p.reverse} />
              </li>
            ))}
          </ol>
          <Conditions c={result.conditions} />
        </div>
      )}

      <details className="oligo-check">
        <summary>Analyser une amorce existante</summary>
        <div className="copy-row">
          <input value={oligo} onChange={(e) => setOligo(e.target.value)} className="mono-input" placeholder="Séquence 5′→3′ (plusieurs séparées par des espaces)" />
          <button type="button" className="btn" onClick={analyze} disabled={!oligo.trim()}>Analyser</button>
        </div>
        {analysis?.oligos.map((o) => <Oligo key={o.sequence} o={o} />)}
        {analysis && <Conditions c={analysis.conditions} />}
      </details>
    </Modal>
  );
}
