import { useMemo, useState } from 'react';
import { Archive } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import {
  CAPACITY, GRIDBOX_FORMATS, NUMBERED, SLOTTED, UNIT_KINDS, canContain, formatTemp, locationText, quickLayout, unitLabel, unitPath,
} from '../../lib/inventory.js';
import Modal from '../Modal.jsx';
import { Segmented } from '../calc/fields.jsx';
import ApplianceArt from './ApplianceArt.jsx';
import { BOX_COLORS, KIND_ICONS, kindLabel } from './bits.jsx';
import { gridboxSpots } from './cryo.jsx';

// Appareils proposés à la création, avec leur réglage d'usine
export const APPLIANCE_PRESETS = [
  { key: 'm80', kind: 'freezer', temperature: -80, style: 'upright', label: 'Congélateur −80 °C', layout: { shelves: 5, racks: 4, boxes: 5 } },
  { key: 'm20', kind: 'freezer', temperature: -20, style: 'upright', label: 'Congélateur −20 °C', layout: { shelves: 4, racks: 0, boxes: 6 } },
  { key: 'p4', kind: 'fridge', temperature: 4, style: '', label: 'Réfrigérateur +4 °C', layout: { shelves: 4, racks: 0, boxes: 4 } },
  { key: 'cryoem', kind: 'tank', temperature: -196, style: '', label: 'Dewar cryo-EM (grilles)', layout: { canisters: 6, pucks: 5, firstPuck: 1 } },
  { key: 'ln2', kind: 'tank', temperature: -196, style: '', label: 'Cuve d’azote (cryotubes)', layout: { shelves: 0, racks: 6, boxes: 10, rows: 10, cols: 10 } },
  { key: 'amb', kind: 'cabinet', temperature: 20, style: '', label: 'Armoire (ambiant)', layout: { shelves: 4, racks: 0, boxes: 0 } },
];

const BOX_SIZES = [['9x9', '9 × 9 (81)'], ['10x10', '10 × 10 (100)'], ['5x5', '5 × 5 (25)'], ['8x12', '8 × 12 (plaque 96)']];

const num = (v) => Math.max(0, Math.trunc(Number(v)) || 0);

/** Prochain numéro libre : canisters parmi leurs voisins, pucks et boîtes à grilles dans tout le stockage. */
function nextNumber(list) {
  const nums = list.map((u) => Number(u.name)).filter(Number.isInteger);
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}

/** Nom proposé pour un nouveau contenant : « Étagère 3 », « Rack C », « Boîte 7 », numéro de puck… */
export function defaultName(kind, siblings, parentKind, all = []) {
  if (kind === 'canister') return nextNumber(siblings.filter((s) => s.kind === 'canister'));
  if (kind === 'puck' || kind === 'gridbox') return nextNumber(all.filter((u) => u.kind === kind));
  const n = siblings.filter((s) => s.kind === kind).length + 1;
  if (kind === 'rack') return `${kindLabel('rack', parentKind)} ${String.fromCharCode(64 + Math.min(26, n))}`;
  if (kind === 'shelf') return `Étagère ${n}`;
  if (kind === 'box') return `Boîte ${n}`;
  if (kind === 'bag') return n > 1 ? `Sac ${n}` : 'Sac';
  if (kind === 'room') return '';
  return '';
}

/**
 * Créer ou modifier un contenant.
 * create : { kind?, parent } (kind absent : choix de l'appareil) ; edit : { unit }.
 */
export default function UnitDialog({ create = null, unit = null, tree, onClose, onSaved, onArchived }) {
  const { notify } = useApp();
  const editing = Boolean(unit);
  const parent = editing ? tree.byId.get(unit.parent_id) ?? null : create?.parent ?? null;
  const siblings = tree.children(parent?.id ?? null);
  const initialPreset = !editing && create && !create.kind ? create.preset ?? APPLIANCE_PRESETS[0] : null;
  const [preset, setPreset] = useState(initialPreset);
  const kind = editing ? unit.kind : create?.kind ?? preset?.kind;
  const appliance = UNIT_KINDS[kind]?.appliance;
  const [name, setName] = useState(() => (editing ? unit.name : initialPreset?.label ?? defaultName(kind, siblings, parent?.kind, [...tree.byId.values()])));
  const [format, setFormat] = useState(editing ? unit.format || 'g4' : 'g4');
  const [capacity, setCapacity] = useState(editing ? String(unit.capacity ?? '') : String(CAPACITY[kind]?.default ?? ''));
  const numbered = NUMBERED.includes(kind);
  const slotted = SLOTTED.includes(kind);
  const [temperature, setTemperature] = useState(editing ? String(unit.temperature ?? '') : String(preset?.temperature ?? UNIT_KINDS[kind]?.temperature ?? ''));
  const [style, setStyle] = useState(editing ? unit.style || 'upright' : preset?.style || 'upright');
  const [size, setSize] = useState(editing && unit.kind === 'box' ? `${unit.rows}x${unit.cols}` : preset?.layout?.rows === 10 ? '10x10' : '9x9');
  const [color, setColor] = useState(editing ? unit.color : '');
  const [notes, setNotes] = useState(editing ? unit.notes : '');
  const [parentId, setParentId] = useState(editing ? unit.parent_id ?? '' : '');
  // Case dans le parent (niveau d'un canister, case d'un puck) : libre, ou celle du contenant lui-même
  const slotParent = tree.byId.get(editing ? parentId : parent?.id) ?? null;
  const freeSlots = useMemo(() => {
    if (!slotted || !slotParent) return [];
    const taken = new Map(tree.children(slotParent.id).filter((u) => u.slot != null).map((u) => [u.slot, u]));
    return Array.from({ length: slotParent.capacity ?? 0 }, (_, i) => i + 1).map((k) => ({ slot: k, by: taken.get(k) }))
      .filter((x) => !x.by || x.by.id === unit?.id || editing);
  }, [slotted, slotParent, tree, unit, editing]);
  const [slot, setSlot] = useState(() => String(editing ? unit.slot ?? '' : create?.slot ?? ''));
  // Pucks numérotés à la suite de ceux déjà rangés dans le labo
  const withPuckNumbers = (l) => (l?.firstPuck !== undefined ? { ...l, firstPuck: Number(nextNumber([...tree.byId.values()].filter((u) => u.kind === 'puck'))) } : { ...l });
  const [layout, setLayout] = useState(() => withPuckNumbers(preset?.layout ?? {}));
  const [busy, setBusy] = useState(false);

  const choosePreset = (p) => {
    setPreset(p);
    setTemperature(String(p.temperature));
    setStyle(p.style || 'upright');
    setLayout(withPuckNumbers(p.layout));
    setSize(p.layout?.rows === 10 ? '10x10' : '9x9');
    if (!name || APPLIANCE_PRESETS.some((q) => q.label === name)) setName(p.label);
  };

  const [rows, cols] = size.split('x').map(Number);
  const plan = useMemo(() => (appliance && !editing ? quickLayout({ ...layout, rows, cols }, kind) : []), [appliance, editing, layout, rows, cols, kind]);
  const planBoxes = plan.filter((p) => p.kind === 'box').length;

  // Où ce contenant peut aller (modification)
  const destinations = useMemo(() => {
    if (!editing) return [];
    return [...tree.byId.values()]
      .filter((u) => canContain(u.kind, unit.kind) && !unitPath(tree.byId, u.id).some((p) => p.id === unit.id))
      .map((u) => ({ id: u.id, text: locationText(unitPath(tree.byId, u.id)) }))
      .sort((a, b) => a.text.localeCompare(b.text, 'fr'));
  }, [editing, tree, unit]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = { name, notes, color };
      if (appliance) Object.assign(body, { temperature, style: kind === 'freezer' ? style : '' });
      if (kind === 'box') Object.assign(body, { rows, cols });
      if (kind === 'gridbox') body.format = format;
      if (CAPACITY[kind]) body.capacity = capacity;
      if (slotted && slot) body.slot = Number(slot);
      let saved;
      if (editing) {
        if (canContain(null, unit.kind) || parentId) body.parent_id = parentId || null;
        if (slotted && parentId !== unit.parent_id && !slot) body.slot = null;
        saved = await api.put(`/inventory/units/${unit.id}`, body);
      } else {
        saved = await api.post('/inventory/units', { ...body, kind, parent_id: parent?.id ?? null, ...(appliance && plan.length ? { layout: { ...layout, rows, cols } } : {}) });
      }
      onSaved(saved);
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!window.confirm(`Retirer « ${unitLabel(unit)} » ? Il doit être vide. On le retrouve dans l’historique des tubes qui y ont été rangés.`)) return;
    try {
      await api.post(`/inventory/units/${unit.id}/archive`);
      onArchived?.(unit);
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const Icon = KIND_ICONS[kind];
  const NEW_TITLES = { canister: 'Nouveau canister', puck: 'Nouveau puck', gridbox: 'Nouvelle boîte à grilles' };
  const title = editing ? `Modifier : ${unitLabel(unit)}` : appliance || !kind ? 'Nouvel appareil' : NEW_TITLES[kind] ?? `Nouveau : ${kindLabel(kind, parent?.kind).toLowerCase()}`;
  const cryoLayout = appliance && kind === 'tank' && layout.canisters !== undefined;
  const planPucks = plan.filter((p) => p.kind === 'puck').length;
  const setL = (k) => (e) => setLayout((l) => ({ ...l, [k]: num(e.target.value) }));

  return (
    <Modal
      title={title}
      onClose={onClose}
      wide={appliance && !editing}
      footer={(
        <>
          {editing && <button type="button" className="btn btn-ghost" onClick={archive}><Archive size={15} /> Retirer</button>}
          <span className="modal-foot-note">
            {!editing && planBoxes > 0 ? `${plan.length} contenants créés d’un coup, dont ${planBoxes} boîtes (${planBoxes * rows * cols} places).` : ''}
            {!editing && planPucks > 0 ? `${plan.length - planPucks} canisters et ${planPucks} pucks (n° ${plan.find((p) => p.kind === 'puck').name} à ${plan.filter((p) => p.kind === 'puck').at(-1).name}).` : ''}
          </span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="unit-form" className="btn btn-primary" disabled={busy || !name.trim()}>{editing ? 'Enregistrer' : 'Créer'}</button>
        </>
      )}
    >
      <form id="unit-form" className="form-stack" onSubmit={submit}>
        {!editing && create && !create.kind && (
          <div className="appl-presets" role="radiogroup" aria-label="Type d’appareil">
            {APPLIANCE_PRESETS.map((p) => (
              <button key={p.key} type="button" role="radio" aria-checked={preset?.key === p.key} className={`appl-preset${preset?.key === p.key ? ' is-selected' : ''}`} onClick={() => choosePreset(p)}>
                <ApplianceArt unit={{ kind: p.kind, temperature: p.temperature, style: p.style }} fill={0.6} />
                <span>{p.label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="field-row">
          <label className="field">
            <span>{Icon && <Icon size={13} aria-hidden="true" />} {numbered ? 'Numéro ou annotation' : 'Nom'}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={appliance ? 'ex. Thor, −80 du couloir' : kind === 'room' ? 'ex. Salle 204, pièce culture' : kind === 'gridbox' ? 'ex. 37, apoferritine 12/09' : ''} autoFocus />
          </label>
          {CAPACITY[kind] && (
            <label className="field">
              <span>{kind === 'canister' ? 'Niveaux (pucks)' : 'Cases (boîtes)'}</span>
              <input type="number" min="1" max={CAPACITY[kind].max} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
          )}
          {slotted && freeSlots.length > 0 && (
            <label className="field">
              <span>{kind === 'puck' ? `Niveau dans le canister ${slotParent?.name}` : `Case dans le puck ${slotParent?.name}`}</span>
              <select value={slot} onChange={(e) => setSlot(e.target.value)}>
                <option value="">{editing ? '—' : 'première libre'}</option>
                {freeSlots.map((x) => <option key={x.slot} value={x.slot}>{x.slot}{x.by && x.by.id !== unit?.id ? ` (échange avec ${unitLabel(x.by)})` : ''}</option>)}
              </select>
            </label>
          )}
          {appliance && (
            <label className="field">
              <span>Température (°C)</span>
              <input inputMode="decimal" value={temperature} onChange={(e) => setTemperature(e.target.value)} />
            </label>
          )}
        </div>
        {kind === 'freezer' && <Segmented label="Forme" value={style} onChange={setStyle} options={[['upright', 'Armoire (porte)'], ['chest', 'Coffre (couvercle)']]} />}
        {kind === 'gridbox' && (
          <>
            <div className="field">
              <span>Type de boîte</span>
              <div className="format-picker" role="radiogroup" aria-label="Type de boîte à grilles">
                {Object.entries(GRIDBOX_FORMATS).map(([k, f]) => (
                  <button key={k} type="button" role="radio" aria-checked={format === k} className={`format-card${format === k ? ' is-selected' : ''}`} onClick={() => setFormat(k)}>
                    <svg viewBox="0 0 100 100" width="54" height="54" aria-hidden="true">
                      <circle cx="50" cy="50" r="47" className="fmt-box" />
                      {gridboxSpots(k).map((p, i) => (p.clipped ? (
                        <g key={i}><circle cx={p.x} cy={p.y} r={p.size / 2.2} className="fmt-clip" /><circle cx={p.x} cy={p.y} r={p.size / 3.3} className="fmt-grid" /></g>
                      ) : <circle key={i} cx={p.x} cy={p.y} r={p.size / 2.6} className="fmt-grid" />))}
                      <circle cx="50" cy="50" r="6" className="fmt-hub" />
                    </svg>
                    <span>{f.label}</span>
                  </button>
                ))}
              </div>
              {editing && <small className="hint">Changer de type n’est possible que si aucune grille n’en sort.</small>}
            </div>
            <div className="field">
              <span>Couleur de la boîte</span>
              <div className="swatches">
                {BOX_COLORS.map((c) => (
                  <button key={c} type="button" className={`swatch${(color || BOX_COLORS[0]) === c ? ' is-active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Couleur ${c}`} aria-pressed={(color || BOX_COLORS[0]) === c} />
                ))}
              </div>
            </div>
          </>
        )}
        {kind === 'box' && (
          <>
            <div className="field">
              <span>Positions</span>
              <Segmented label="Positions" value={size} onChange={setSize} options={BOX_SIZES} />
              {editing && <small className="hint">Réduire la boîte n’est possible que si aucun tube n’en sort.</small>}
            </div>
            <div className="field">
              <span>Couleur de la boîte</span>
              <div className="swatches">
                {BOX_COLORS.map((c) => (
                  <button key={c} type="button" className={`swatch${(color || BOX_COLORS[0]) === c ? ' is-active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Couleur ${c}`} aria-pressed={(color || BOX_COLORS[0]) === c} />
                ))}
              </div>
            </div>
          </>
        )}
        {cryoLayout && !editing && (
          <fieldset className="field layout-box">
            <legend>Canisters et pucks (facultatif)</legend>
            <div className="layout-inputs">
              <label><input type="number" min="0" max="30" value={layout.canisters ?? 0} onChange={setL('canisters')} /> canisters</label>
              <label><input type="number" min="0" max="30" value={layout.pucks ?? 0} onChange={setL('pucks')} /> pucks par canister</label>
              <label>puck n° <input type="number" min="1" value={layout.firstPuck ?? 1} onChange={setL('firstPuck')} /> pour le premier</label>
            </div>
            <div className="cryo-preview" aria-hidden="true">
              {plan.filter((p) => p.kind === 'canister').slice(0, 12).map((c) => (
                <span key={c.key} className="cp-can">
                  <strong>{c.name}</strong>
                  {plan.filter((p) => p.parentKey === c.key).map((p) => <span key={p.key} className="cp-puck">{p.name}</span>)}
                </span>
              ))}
            </div>
            <small className="hint">Canisters numérotés 1, 2, 3… ; pucks numérotés à la suite, niveau 1 en haut. Les boîtes à grilles s’ajoutent ensuite, case par case.</small>
          </fieldset>
        )}
        {appliance && !editing && !cryoLayout && (
          <fieldset className="field layout-box">
            <legend>Aménagement rapide (facultatif)</legend>
            <div className="layout-inputs">
              {kind !== 'tank' && <label><input type="number" min="0" max="20" value={layout.shelves ?? 0} onChange={setL('shelves')} /> étagères</label>}
              <label><input type="number" min="0" max="20" value={layout.racks ?? 0} onChange={setL('racks')} /> {kind === 'tank' ? 'tours' : `racks${kind !== 'tank' && layout.shelves ? ' par étagère' : ''}`}</label>
              <label><input type="number" min="0" max="30" value={layout.boxes ?? 0} onChange={setL('boxes')} /> boîtes{layout.racks ? ` par ${kind === 'tank' ? 'tour' : 'rack'}` : layout.shelves ? ' par étagère' : ''}</label>
              <Segmented label="Boîtes" value={size} onChange={setSize} options={BOX_SIZES.slice(0, 2)} />
            </div>
            <LayoutPreview plan={plan} kind={kind} />
            <small className="hint">Tout reste modifiable ensuite : on ajoute, renomme ou déplace étagères, racks et boîtes.</small>
          </fieldset>
        )}
        {editing && destinations.length > 0 && (
          <label className="field">
            <span>Rangé dans</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              {canContain(null, unit.kind) && <option value="">— (à la racine du stockage)</option>}
              {destinations.map((d) => <option key={d.id} value={d.id}>{d.text}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>Notes</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={appliance ? 'ex. alarme reliée au poste de garde, contrat de maintenance…' : ''} />
        </label>
        {appliance && <p className="hint">{formatTemp(temperature)} : {kindLabel(kind).toLowerCase()}{kind === 'freezer' ? (style === 'chest' ? ' coffre' : ' armoire') : ''}.</p>}
      </form>
    </Modal>
  );
}

/** Schéma de l'aménagement prévu : étagères, racks, boîtes. */
function LayoutPreview({ plan, kind }) {
  if (!plan.length) return null;
  const shelves = plan.filter((p) => p.kind === 'shelf');
  const kids = (key) => plan.filter((p) => (p.parentKey || '') === key);
  const renderBoxes = (key) => kids(key).filter((p) => p.kind === 'box').slice(0, 12).map((b) => <span key={b.key} className="lp-box" />);
  const renderRow = (key) => (
    <div className="lp-row">
      {kids(key).filter((p) => p.kind === 'rack').map((r) => <span key={r.key} className="lp-rack">{renderBoxes(r.key)}</span>)}
      {renderBoxes(key)}
    </div>
  );
  return (
    <div className={`layout-preview kind-${kind}`} aria-hidden="true">
      {shelves.length ? shelves.slice(0, 8).map((s) => <div key={s.key} className="lp-shelf">{renderRow(s.key)}</div>) : renderRow('')}
    </div>
  );
}
