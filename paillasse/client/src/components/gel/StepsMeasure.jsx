import { useEffect, useState } from 'react';
import { Crosshair, Dna, Hand, Plus, Trash2, Wand2 } from 'lucide-react';
import { api } from '../../api.js';
import { formatNumber } from '../../lib/calc/units.js';
import { FIT_METHODS, formatSize } from '../../lib/gel/calibration.js';
import { UI_STYLE, calibrationSvg } from '../../lib/gel/figure.js';
import { rememberLadder } from '../../lib/gel/draft.js';
import { MODES, VALUE_MODES, laneName, newId, suggestCalibration } from '../../lib/gel/model.js';
import { proteinsOf } from '../../lib/gel/protein.js';
import Modal from '../Modal.jsx';
import { Check, Range, Section, Segmented } from './controls.jsx';
import { ladderSnapshot } from './useLadders.js';

const parseList = (s) => String(s).split(/[;,\s]+/).map((x) => Number(x.replace(',', '.'))).filter((x) => x > 0);

/** Choix du marqueur et de sa piste, attribution automatique, méthode d'ajustement. */
export function LadderControls({ ctx, compact = false }) {
  const { state, update, results, ladders, openLadders } = ctx;
  const mode = MODES[state.mode];
  const cal = state.calibration;
  const available = (ladders ?? []).filter((l) => l.kind === mode.ladderKind && !l.archived);
  const setCal = (patch) => update((s) => ({ ...s, calibration: { ...s.calibration, ...patch } }));
  const chooseLadder = (id) => {
    const l = available.find((x) => x.id === id);
    if (!l) return setCal({ ladder: null, points: [] });
    const snap = ladderSnapshot(l);
    rememberLadder(mode.ladderKind, l.id);
    return setCal({ ladder: snap, points: results ? suggestCalibration(results, snap) : [] });
  };
  const setLadderLane = (id) => update((s) => ({
    ...s,
    lanes: s.lanes.map((l) => (l.id === id ? { ...l, role: 'ladder' } : l.role === 'ladder' ? { ...l, role: 'sample' } : l)),
    calibration: { ...s.calibration, laneId: id || null, points: [] },
  }));
  return (
    <>
      <label className="field">
        <span>Marqueur</span>
        <select value={cal.ladder?.id ?? ''} onChange={(e) => chooseLadder(e.target.value)}>
          <option value="">— Choisir —</option>
          {cal.ladder && !available.some((l) => l.id === cal.ladder.id) && <option value={cal.ladder.id}>{cal.ladder.name}</option>}
          {available.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </label>
      {!compact && <button type="button" className="link-btn small" onClick={openLadders}>Gérer les marqueurs…</button>}
      <label className="field">
        <span>Piste du marqueur</span>
        <select value={cal.laneId ?? ''} onChange={(e) => setLadderLane(e.target.value)}>
          <option value="">— Aucune —</option>
          {state.lanes.map((l, i) => <option key={l.id} value={l.id}>Piste {laneName(l, i)}</option>)}
        </select>
      </label>
      {compact && cal.ladder && cal.laneId && (
        <div className="gel-btn-row">
          <button type="button" className="btn btn-small" onClick={() => setCal({ points: suggestCalibration(results, cal.ladder) })}><Wand2 size={15} /> Réattribuer</button>
          {results?.calibration && <span className="muted small">{results.calibration.points.length} bandes{results.calibration.method !== 'interp' ? `, R² = ${formatNumber(results.calibration.r2, 4)}` : ''}</span>}
        </div>
      )}
      {results?.calibration && (
        <Segmented label="Méthode" value={cal.method} onChange={(method) => setCal({ method })} options={Object.entries(FIT_METHODS).map(([k, v]) => [k, v.replace('Interpolation entre marqueurs', 'Interpolation').replace('Régression linéaire', 'Linéaire').replace('Polynôme de degré 2', 'Polynôme')])} />
      )}
    </>
  );
}

export function StepSizes({ ctx }) {
  const { state, update, profiles, results, tool, setTool, calibSize, setCalibSize } = ctx;
  const mode = MODES[state.mode];
  const cal = state.calibration;
  const ladderLane = state.lanes.find((l) => l.id === cal.laneId);
  const setCal = (patch) => update((s) => ({ ...s, calibration: { ...s.calibration, ...patch } }));
  const auto = () => setCal({ points: suggestCalibration(results, cal.ladder) });
  const pointOf = (size) => cal.points.find((p) => p.size === size);
  const fitted = results?.calibration?.points ?? [];
  const svg = results?.calibration && profiles ? calibrationSvg(state, profiles, results, { width: 460, height: 280, style: UI_STYLE }) : null;

  return (
    <>
      <Section title="Marqueur de taille">
        <LadderControls ctx={ctx} />
        {!state.lanes.length && <p className="gel-note">Placez d’abord les pistes (étape 2).</p>}
      </Section>

      {cal.ladder && ladderLane && (
        <Section title="Bandes du marqueur">
          <div className="gel-btn-row">
            <button type="button" className="btn btn-small" onClick={auto}><Wand2 size={15} /> Attribuer automatiquement</button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setCal({ points: [] })}>Effacer</button>
          </div>
          <table className="gel-table gel-calib">
            <thead><tr><th>Taille</th><th className="num">Écart</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {cal.ladder.bands.map((b) => {
                const p = pointOf(b.size);
                const f = fitted.find((x) => x.size === b.size);
                const picking = tool === 'calib' && calibSize === b.size;
                return (
                  <tr key={b.size} className={picking ? 'is-picking' : p ? '' : 'is-missing'}>
                    <td>{formatSize(b.size, mode.unit)}</td>
                    <td className="num">{f && results.calibration.method !== 'interp' ? `${f.error >= 0 ? '+' : ''}${formatNumber(f.error, 2)} %` : p ? '✓' : '—'}</td>
                    <td className="gel-calib-actions">
                      <button type="button" className={`icon-btn${picking ? ' is-on' : ''}`} title="Placer cette taille sur une bande du marqueur" aria-label={`Placer ${formatSize(b.size, mode.unit)}`} onClick={() => { setCalibSize(b.size); setTool('calib'); }}>
                        <Crosshair size={14} />
                      </button>
                      {p && <button type="button" className="icon-btn" aria-label={`Retirer ${formatSize(b.size, mode.unit)}`} onClick={() => setCal({ points: cal.points.filter((x) => x.size !== b.size) })}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tool === 'calib' && <p className="gel-note">Cliquez sur la bande de {formatSize(calibSize, mode.unit)} dans la piste du marqueur (sur le gel ou sur le profil).</p>}
          <p className="hint">Une bande mal placée ? Cliquez la cible puis la bande. Les bandes absentes du gel peuvent rester vides.</p>
        </Section>
      )}

      {results?.calibration && (
        <Section title="Courbe d’étalonnage">
          <p className="hint">
            {cal.method === 'interp' ? 'Interpolation : passe par chaque marqueur, recommandé pour l’ADN, dont la migration n’est pas log-linéaire.'
              : `R² = ${formatNumber(results.calibration.r2, 4)} sur log(taille). ${results.calibration.r2 < 0.98 ? 'Essayez l’interpolation.' : ''}`}
          </p>
          {/* SVG construit par figure.js à partir de nombres et de textes échappés */}
          <div className="gel-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        </Section>
      )}
    </>
  );
}

function ExpectedDialog({ state, onAdd, onClose }) {
  const mode = MODES[state.mode];
  const [tab, setTab] = useState('registry');
  const [laneId, setLaneId] = useState('');
  const [label, setLabel] = useState('');
  const [sizes, setSizes] = useState('');
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [seq, setSeq] = useState(null);
  const [enzymes, setEnzymes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tab !== 'registry' || seq) return undefined;
    const t = setTimeout(() => api.get(`/sequences${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then((l) => setList(l.slice(0, 12))).catch(() => setList([])), 200);
    return () => clearTimeout(t);
  }, [q, tab, seq]);

  const pickSeq = async (s) => {
    setError('');
    try {
      setSeq(await api.get(`/sequences/${s.id}`));
    } catch (err) {
      setError(err.message);
    }
  };
  const add = (entry) => {
    onAdd({ id: newId(), laneId: laneId || null, ...entry });
    onClose();
  };
  const digest = async () => {
    const names = enzymes.split(/[,;\s]+/).filter(Boolean);
    if (!names.length) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.post(`/sequences/${seq.id}/digest`, { enzymes: names });
      add({ label: `${seq.code} × ${names.join(' + ')}`, sizes: r.fragments.map((f) => f.length).sort((a, b) => b - a) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const proteins = seq && state.mode !== 'dna' ? proteinsOf(seq) : [];

  return (
    <Modal title="Taille attendue" onClose={onClose} wide>
      <div className="form-stack">
        <label className="field">
          <span>Piste</span>
          <select value={laneId} onChange={(e) => setLaneId(e.target.value)}>
            <option value="">Toutes les pistes d’échantillon</option>
            {state.lanes.filter((l) => l.role !== 'ladder').map((l) => <option key={l.id} value={l.id}>Piste {laneName(l, state.lanes.indexOf(l))}</option>)}
          </select>
        </label>
        <Segmented label="Source" value={tab} onChange={setTab} options={[['registry', 'Registre de séquences'], ['manual', 'Saisie']]} />
        {tab === 'manual' && (
          <>
            <label className="field"><span>Nom</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={mode.unit === 'pb' ? 'Produit de PCR' : 'DegU-His6'} /></label>
            <label className="field"><span>Tailles ({mode.unit})</span><input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder={mode.unit === 'pb' ? '3000, 1200' : '28,5'} /></label>
            <button type="button" className="btn btn-primary" disabled={!parseList(sizes).length} onClick={() => add({ label: label.trim() || 'attendu', sizes: parseList(sizes) })}>Ajouter</button>
          </>
        )}
        {tab === 'registry' && !seq && (
          <>
            <input className="picker-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou identifiant (SEQ-…)" aria-label="Rechercher une séquence" />
            {list?.length === 0 && <p className="muted">Aucune séquence.</p>}
            <ul className="picker-list">
              {list?.map((s) => (
                <li key={s.id}>
                  <button type="button" className="picker-item" onClick={() => pickSeq(s)}>
                    <code>{s.code}</code><span className="picker-name">{s.name}</span>
                    <span className="muted small">{s.length.toLocaleString('fr-FR')} pb, {s.circular ? 'circulaire' : 'linéaire'}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {tab === 'registry' && seq && (
          <>
            <p><Dna size={15} aria-hidden="true" /> <code>{seq.code}</code> <strong>{seq.name}</strong> <button type="button" className="link-btn small" onClick={() => setSeq(null)}>changer</button></p>
            {state.mode === 'dna' ? (
              <>
                <button type="button" className="btn" onClick={() => add({ label: `${seq.code} ${seq.name}`, sizes: [seq.sequence.length] })}>
                  Fragment entier : {seq.sequence.length.toLocaleString('fr-FR')} pb{seq.circular ? ' (migration d’un plasmide non digéré imprévisible)' : ''}
                </button>
                <div className="gel-inline">
                  <label className="field"><span>Digestion par</span><input value={enzymes} onChange={(e) => setEnzymes(e.target.value)} placeholder="EcoRI, HindIII" /></label>
                  <button type="button" className="btn btn-primary" disabled={busy || !enzymes.trim()} onClick={digest}>Digérer</button>
                </div>
              </>
            ) : proteins.length ? (
              <ul className="picker-list">
                {proteins.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="picker-item" onClick={() => add({ label: `${seq.code} ${p.name}`, sizes: [Math.round(p.kDa * 10) / 10] })}>
                      <span className="picker-name">{p.name}</span>
                      <span className="muted small">{p.length} aa, {formatNumber(p.kDa, 3)} kDa</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Aucune annotation CDS dans cette séquence : ajoutez-en une, ou utilisez la saisie.</p>}
          </>
        )}
        {error && <p className="form-error">{error}</p>}
      </div>
    </Modal>
  );
}

/** Détection des bandes : sensibilité, fond, corrections à la main. */
export function DetectionControls({ ctx, compact = false }) {
  const { state, update, tool, setTool, activeLaneId } = ctx;
  const d = state.detection;
  const setDet = (patch, opts) => update((s) => ({ ...s, detection: { ...s.detection, ...patch } }), opts);
  const activeEdits = state.edits?.[activeLaneId];
  return (
    <>
      <Range label="Sensibilité" value={d.sensitivity} min={0.05} max={0.98} step={0.01} format={(v) => `${Math.round(v * 100)} %`} onChange={(sensitivity) => setDet({ sensitivity }, { key: 'sens' })} hint={compact ? null : 'Plus haut : bandes faibles détectées, mais aussi du bruit.'} />
      <Segmented label="Fond" value={d.background} onChange={(background) => setDet({ background })} options={[['rollingball', 'Rolling ball'], ['valley', 'Vallée à vallée'], ['min', 'Minimum']]} />
      {d.background === 'rollingball' && (
        <Range label="Rayon" value={d.radius ?? ctx.profiles?.scales.radius ?? 30} min={4} max={Math.max(40, Math.round((ctx.profiles?.length ?? 400) / 3))} format={(v) => `${v} px`} onChange={(radius) => setDet({ radius }, { key: 'radius' })} hint={compact ? null : 'Plus grand que la largeur des bandes.'} />
      )}
      <div className="gel-btn-row">
        <button type="button" className={`btn btn-small${tool === 'band' ? ' is-on' : ''}`} onClick={() => setTool(tool === 'band' ? 'select' : 'band')}>
          <Hand size={15} /> {tool === 'band' ? 'Cliquez sur une bande…' : 'Corriger à la main'}
        </button>
        {activeEdits && (activeEdits.added?.length || activeEdits.removed?.length || activeEdits.bounds?.length) ? (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => update((s) => { const e = { ...s.edits }; delete e[activeLaneId]; return { ...s, edits: e }; })}>
            Annuler les corrections de la piste
          </button>
        ) : null}
      </div>
      {tool === 'band' && <p className="gel-note">Cliquez sur une bande pour la retirer, à côté d’une bande non détectée pour l’ajouter (sur le gel ou sur le profil).</p>}
    </>
  );
}

/** Valeurs du tableau : aire, %, référence, contrôle de charge, quantité. */
export function QuantControls({ ctx }) {
  const { state, update, results } = ctx;
  const q = state.quant;
  const setQuant = (patch) => update((s) => ({ ...s, quant: { ...s.quant, ...patch } }));
  const groups = results?.rows ?? [];
  const groupRef = (row) => ({ pos: row.group.pos, size: row.group.size });
  const selectedGroup = (ref) => (ref ? groups.findIndex((r) => (ref.size && r.group.size ? Math.abs(Math.log(r.group.size / ref.size)) < 0.06 : Math.abs(r.group.pos - ref.pos) < 12)) : -1);
  const sampleLanes = state.lanes.filter((l) => l.role !== 'ladder');
  return (
    <>
      <label className="field">
        <span>Valeurs du tableau</span>
        <select value={q.values} onChange={(e) => setQuant({ values: e.target.value })}>
          {Object.entries(VALUE_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      {(q.values === 'relative' || q.values === 'normalized') && (
        <label className="field">
          <span>Piste de référence (= 100 % ou 1)</span>
          <select value={q.referenceLane ?? ''} onChange={(e) => setQuant({ referenceLane: e.target.value || null })}>
            <option value="">{q.values === 'normalized' ? 'Aucune (rapport brut)' : '— Choisir —'}</option>
            {sampleLanes.map((l) => <option key={l.id} value={l.id}>Piste {laneName(l, state.lanes.indexOf(l))}</option>)}
          </select>
        </label>
      )}
      {q.values === 'normalized' && (
        <label className="field">
          <span>Contrôle de charge</span>
          <select value={selectedGroup(q.loadingControl)} onChange={(e) => setQuant({ loadingControl: Number(e.target.value) >= 0 ? groupRef(groups[Number(e.target.value)]) : null })}>
            <option value={-1}>— Bande de référence (actine, GAPDH…) —</option>
            {groups.map((r, i) => <option key={r.group.pos} value={i}>{r.label}</option>)}
          </select>
        </label>
      )}
    </>
  );
}

export function StepBands({ ctx }) {
  const { state, update, results } = ctx;
  const [addingExpected, setAddingExpected] = useState(false);
  const mode = MODES[state.mode];
  const q = state.quant;
  const st = q.standards;
  const setQuant = (patch) => update((s) => ({ ...s, quant: { ...s.quant, ...patch } }));
  const setStd = (patch) => update((s) => ({ ...s, quant: { ...s.quant, standards: { ...s.quant.standards, ...patch } } }), { key: 'std' });
  const groups = results?.rows ?? [];
  const groupRef = (row) => ({ pos: row.group.pos, size: row.group.size });
  const selectedGroup = (ref) => (ref ? groups.findIndex((r) => (ref.size && r.group.size ? Math.abs(Math.log(r.group.size / ref.size)) < 0.06 : Math.abs(r.group.pos - ref.pos) < 12)) : -1);
  const sampleLanes = state.lanes.filter((l) => l.role !== 'ladder');
  const ladderHasMasses = state.calibration.ladder?.bands?.some((b) => b.mass > 0);
  const autoStd = results?.standardAuto ? groups.find((r) => r.group === results.standardGroup) : null;
  const presence = (r) => { const n = Object.keys(r.group.members).length; return `${n} piste${n > 1 ? 's' : ''}`; };

  return (
    <>
      <Section title="Détection des bandes">
        <DetectionControls ctx={ctx} />
      </Section>

      <Section title="Quantification">
        <QuantControls ctx={ctx} />
      </Section>

      <Section title="Gamme étalon" open={st.source !== 'none'}>
        <Segmented
          label="Gamme étalon"
          value={st.source}
          onChange={(source) => setStd({ source })}
          options={[['none', 'Aucune'], ['group', 'Pistes de gamme'], ...(state.mode === 'dna' || ladderHasMasses ? [['ladder', 'Masses du marqueur']] : [])]}
        />
        {st.source === 'group' && (
          <>
            <label className="field">
              <span>Bande de la gamme</span>
              <select value={selectedGroup(st.group)} onChange={(e) => setStd({ group: Number(e.target.value) >= 0 ? groupRef(groups[Number(e.target.value)]) : null })}>
                <option value={-1}>{autoStd ? `Automatique : ${autoStd.label}` : '— Choisir la bande (ex. BSA) —'}</option>
                {groups.map((r, i) => <option key={r.group.pos} value={i}>{r.label} · {presence(r)}</option>)}
              </select>
            </label>
            <p className="hint">Quantité déposée ({mode.amountUnit}) dans chaque piste de gamme ; laissez vide les autres.</p>
            <div className="gel-amounts">
              {sampleLanes.map((l) => (
                <label key={l.id}>
                  <span>Piste {laneName(l, state.lanes.indexOf(l))}</span>
                  <input inputMode="decimal" value={st.amounts?.[l.id] ?? ''} onChange={(e) => setStd({ amounts: { ...st.amounts, [l.id]: e.target.value } })} placeholder="—" />
                </label>
              ))}
            </div>
          </>
        )}
        {st.source === 'ladder' && (
          <>
            {!ladderHasMasses && <p className="gel-note is-warn">Le marqueur choisi n’a pas de masses par bande : complétez-les dans « Gérer les marqueurs » (fiche du fabricant).</p>}
            <label className="field">
              <span>Quantité de marqueur déposée ({mode.amountUnit})</span>
              <input inputMode="decimal" value={st.loaded ?? ''} placeholder={state.calibration.ladder?.load ? String(state.calibration.ladder.load).replace('.', ',') : ''} onChange={(e) => setStd({ loaded: e.target.value })} />
            </label>
          </>
        )}
        {st.source !== 'none' && (
          <>
            <Check checked={q.throughOrigin !== false} onChange={(throughOrigin) => setQuant({ throughOrigin })}>Droite passant par l’origine</Check>
            {results?.standard
              ? (
                <p className={`gel-note${results.standard.r2 >= 0.95 ? ' is-ok' : ' is-warn'}`}>
                  {results.standard.n} point{results.standard.n > 1 ? 's' : ''}, R² = {formatNumber(results.standard.r2, 3)}.
                  {q.values !== 'amount' && <> <button type="button" className="link-btn small" onClick={() => setQuant({ values: 'amount' })}>Afficher les quantités dans le tableau</button></>}
                </p>
              )
              : <p className="gel-note">Il faut au moins un point (deux sans l’origine).</p>}
          </>
        )}
      </Section>

      <Section title="Tailles attendues" open={state.expected.length > 0}>
        <p className="hint">{state.mode === 'dna' ? 'Fragment de PCR ou digestion d’une séquence du registre : les tailles attendues sont marquées sur le gel.' : 'Masse calculée à partir d’un CDS du registre (ou saisie) : comparée à la taille apparente.'}</p>
        {state.expected.length > 0 && (
          <ul className="gel-curves">
            {state.expected.map((e) => (
              <li key={e.id}>
                <span><strong>{e.label}</strong> · {e.sizes.map((x) => formatSize(x, mode.unit)).join(', ')}{e.laneId ? ` · piste ${laneName(state.lanes.find((l) => l.id === e.laneId) ?? {}, state.lanes.findIndex((l) => l.id === e.laneId))}` : ''}</span>
                <button type="button" className="icon-btn" onClick={() => update((s) => ({ ...s, expected: s.expected.filter((x) => x.id !== e.id) }))} aria-label={`Retirer ${e.label}`}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="btn btn-small" onClick={() => setAddingExpected(true)}><Plus size={15} /> Ajouter</button>
        {!results?.calibration && state.expected.length > 0 && <p className="gel-note">Étalonnez le gel (étape 3) pour comparer.</p>}
      </Section>
      {addingExpected && <ExpectedDialog state={state} onClose={() => setAddingExpected(false)} onAdd={(e) => update((s) => ({ ...s, expected: [...s.expected, e] }))} />}
    </>
  );
}
