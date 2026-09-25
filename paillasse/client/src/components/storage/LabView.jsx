import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDownToLine, ArrowUpFromLine, CircleCheck, Clock, DoorOpen, Droplets, Move, PackagePlus, Pencil, Plus, Sparkles,
  Thermometer, Trash2, TriangleAlert,
} from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { ago, formatTemp, isAppliance, tempTheme } from '../../lib/inventory.js';
import ApplianceArt from './ApplianceArt.jsx';
import { Cap, FillBar, TempChip } from './bits.jsx';
import { APPLIANCE_PRESETS } from './UnitDialog.jsx';

/** Un appareil du labo, dessiné : un clic l'ouvre. */
export function ApplianceCard({ unit, tree, onOpen }) {
  const t = tree.totals(unit.id);
  const fill = t.capacity ? t.placed / t.capacity : 0;
  return (
    <li>
      <button type="button" className={`appl-card theme-${tempTheme(unit.temperature)}`} onClick={() => onOpen(unit)}>
        <ApplianceArt unit={unit} fill={fill} />
        <span className="appl-name">{unit.name}</span>
        <TempChip unit={unit} />
        <span className="appl-stats">{t.boxes} boîte{t.boxes > 1 ? 's' : ''} · {t.tubes} tube{t.tubes > 1 ? 's' : ''}</span>
        {t.capacity > 0 && <FillBar used={t.placed} capacity={t.capacity} />}
        {t.out > 0 && <span className="appl-alert"><ArrowUpFromLine size={12} aria-hidden="true" /> {t.out} sorti{t.out > 1 ? 's' : ''}</span>}
      </button>
    </li>
  );
}

function AddApplianceTile({ onClick }) {
  return (
    <li>
      <button type="button" className="appl-card appl-add" onClick={onClick}>
        <span className="appl-add-icon"><Plus size={26} /></span>
        <span className="appl-name">Ajouter un appareil</span>
        <span className="appl-stats">congélateur, frigo, cuve d’azote…</span>
      </button>
    </li>
  );
}

/** Labo vide : on commence par dessiner ses appareils. */
function Onboarding({ onCreate }) {
  return (
    <section className="stor-onboard">
      <Sparkles size={22} aria-hidden="true" />
      <h2>Dessinons votre labo</h2>
      <p>Ajoutez vos appareils, puis leurs étagères, racks et boîtes : chaque tube aura une adresse, comme une rue et un numéro.</p>
      <ul className="appl-presets">
        {APPLIANCE_PRESETS.map((p) => (
          <li key={p.key}>
            <button type="button" className="appl-preset" onClick={() => onCreate({ preset: p })}>
              <ApplianceArt unit={{ kind: p.kind, temperature: p.temperature, style: p.style }} fill={0.5} />
              <span>{p.label}</span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn" onClick={() => onCreate({ room: true })}><DoorOpen size={15} /> Commencer par une pièce</button>
    </section>
  );
}

const WATCH = [
  ['out', ArrowUpFromLine, (n, l) => `${n} tube${n > 1 ? 's' : ''} hors du froid depuis plus de ${l.outHours} h`, 'is-hot'],
  ['expired', TriangleAlert, (n) => `${n} échantillon${n > 1 ? 's' : ''} périmé${n > 1 ? 's' : ''}`, 'is-hot'],
  ['thawed', Droplets, (n, l) => `${n} tube${n > 1 ? 's' : ''} décongelé${n > 1 ? 's' : ''} ${l.thaw} fois ou plus`, 'is-warm'],
  ['expiring', Clock, (n, l) => `${n} bientôt périmé${n > 1 ? 's' : ''} (${l.expiringDays} j)`, 'is-warm'],
];

/** « À surveiller » : tubes oubliés sur la paillasse, périmés, trop décongelés ; boîtes pleines. */
function WatchPanel({ version, onShow, onChanged }) {
  const { notify } = useApp();
  const [w, setW] = useState(null);
  useEffect(() => { api.get('/inventory/watch').then(setW).catch(() => setW(null)); }, [version]);
  if (!w) return null;
  const back = async (s) => {
    try {
      await api.post('/inventory/samples/action', { ids: [s.id], action: 'back', thawed: true });
      notify(`${s.code} est de retour au froid.`, 'success');
      onChanged();
    } catch (err) {
      notify(err.message, 'error');
    }
  };
  const groups = WATCH.filter(([k]) => w[k]?.length);
  return (
    <section className="stor-card watch">
      <h2 className="section-title"><Thermometer size={16} aria-hidden="true" /> À surveiller</h2>
      {!groups.length && !w.full.length && <p className="watch-ok"><CircleCheck size={18} aria-hidden="true" /> Tout est au froid, rien de périmé.</p>}
      {groups.map(([k, Icon, text, tone]) => (
        <details key={k} className={`watch-group ${tone}`} open={k === 'out'}>
          <summary><Icon size={15} aria-hidden="true" /> {text(w[k].length, w.limits)}</summary>
          <ul>
            {w[k].map((s) => (
              <li key={s.id}>
                <button type="button" className="watch-item" onClick={() => onShow(s)}>
                  <Cap sample={s} size={16} />
                  <span><strong>{s.name}</strong> <span className="muted small">{s.code}{k === 'out' && s.out_since ? ` · sorti ${ago(s.out_since)}` : ''}{k === 'thawed' ? ` · ${s.thaw_count} fois` : ''}{(k === 'expired' || k === 'expiring') && s.expires_on ? ` · ${new Date(s.expires_on).toLocaleDateString('fr-FR')}` : ''}</span></span>
                </button>
                {k === 'out' && <button type="button" className="btn btn-small" onClick={() => back(s)} title="Remis à sa place (compte une décongélation)"><ArrowDownToLine size={13} /> Remis</button>}
              </li>
            ))}
          </ul>
        </details>
      ))}
      {w.full.length > 0 && (
        <details className="watch-group is-info">
          <summary><PackagePlus size={15} aria-hidden="true" /> {w.full.length} boîte{w.full.length > 1 ? 's' : ''} presque pleine{w.full.length > 1 ? 's' : ''}</summary>
          <ul>
            {w.full.map((b) => (
              <li key={b.id}>
                <button type="button" className="watch-item" onClick={() => onShow({ unit_id: b.id })}>
                  <span><strong>{b.name}</strong> <span className="muted small">{b.used}/{b.capacity} · {b.location}</span></span>
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

const EVENT_ICONS = { created: PackagePlus, moved: Move, out: ArrowUpFromLine, back: ArrowDownToLine, thawed: Droplets, discarded: Trash2, edited: Pencil, restored: Sparkles };

/** Derniers gestes sur les tubes du labo. */
function Activity({ version, onShow }) {
  const [events, setEvents] = useState(null);
  useEffect(() => { api.get('/inventory/events?limit=12').then(setEvents).catch(() => setEvents([])); }, [version]);
  if (!events?.length) return null;
  return (
    <section className="stor-card activity">
      <h2 className="section-title">Activité récente</h2>
      <ol>
        {events.map((e, i) => {
          const Icon = EVENT_ICONS[e.kind] ?? Pencil;
          return (
            <li key={i}>
              <span className={`act-icon act-${e.kind}`}><Icon size={13} aria-hidden="true" /></span>
              <button type="button" className="link-btn" onClick={() => !e.archived && onShow({ id: e.sample_id, unit_id: e.unit_id })} disabled={e.archived}>
                <Cap sample={e} size={12} /> {e.name}
              </button>
              <span className="act-detail">{e.detail}</span>
              <span className="muted small">{e.author ?? '—'} · {ago(e.created_at)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Vue d'ensemble : les pièces et leurs appareils. */
export default function LabView({ tree, version, onOpen, onCreate, onEdit, onShowSample, onChanged, loose }) {
  const roots = tree.children(null);
  const rooms = roots.filter((u) => u.kind === 'room');
  const appliances = roots.filter(isAppliance);
  const showSample = useCallback((s) => onShowSample(s), [onShowSample]);
  return (
    <div className="lab">
      <div className="lab-main">
        {!roots.length && <Onboarding onCreate={onCreate} />}
        {rooms.map((room) => (
          <section key={room.id} className="lab-room">
            <header className="lab-room-head">
              <DoorOpen size={17} aria-hidden="true" />
              <h2>{room.name}</h2>
              <span className="muted small">{tree.totals(room.id).tubes} tubes</span>
              <button type="button" className="icon-btn" onClick={() => onEdit(room)} title="Modifier la pièce" aria-label={`Modifier ${room.name}`}><Pencil size={14} /></button>
            </header>
            <ul className="appl-grid">
              {tree.children(room.id).map((u) => <ApplianceCard key={u.id} unit={u} tree={tree} onOpen={onOpen} />)}
              <AddApplianceTile onClick={() => onCreate({ parent: room })} />
            </ul>
            <div className="lab-floor" aria-hidden="true" />
          </section>
        ))}
        {(appliances.length > 0 || (rooms.length === 0 && roots.length > 0)) && (
          <section className="lab-room">
            {rooms.length > 0 && <header className="lab-room-head"><h2>Autres appareils</h2></header>}
            <ul className="appl-grid">
              {appliances.map((u) => <ApplianceCard key={u.id} unit={u} tree={tree} onOpen={onOpen} />)}
              <AddApplianceTile onClick={() => onCreate({ parent: null })} />
            </ul>
            <div className="lab-floor" aria-hidden="true" />
          </section>
        )}
        {roots.length > 0 && (
          <p className="lab-actions">
            <button type="button" className="btn btn-small" onClick={() => onCreate({ room: true })}><DoorOpen size={14} /> Nouvelle pièce</button>
            {rooms.length > 0 && appliances.length === 0 && <button type="button" className="btn btn-small btn-ghost" onClick={() => onCreate({ parent: null })}><Plus size={14} /> Appareil hors pièce</button>}
            {loose > 0 && <span className="muted small">{loose} tube(s) sans emplacement</span>}
          </p>
        )}
      </div>
      <aside className="lab-side">
        <WatchPanel version={version} onShow={showSample} onChanged={onChanged} />
        <Activity version={version} onShow={showSample} />
        {roots.length > 0 && <p className="hint lab-legend">{formatTemp(-80)} ultra-congélateur · {formatTemp(-20)} congélateur · {formatTemp(4)} réfrigérateur · {formatTemp(-196)} azote liquide</p>}
      </aside>
    </div>
  );
}
