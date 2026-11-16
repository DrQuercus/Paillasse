import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, Warehouse } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { buildTree, formatTemp, holdsSamples, isAppliance, tempTheme, unitLabel, unitPath } from '../lib/inventory.js';
import BoxView from '../components/storage/BoxView.jsx';
import InteriorView from '../components/storage/InteriorView.jsx';
import LabView from '../components/storage/LabView.jsx';
import UnitDialog from '../components/storage/UnitDialog.jsx';
import WhereIs from '../components/storage/WhereIs.jsx';
import { KIND_ICONS } from '../components/storage/bits.jsx';
import { CanisterView, PuckView } from '../components/storage/cryo.jsx';

/** Fil d'Ariane : Stockage › pièce › appareil › étagère › rack › boîte. glow : le chemin s'allume (tube trouvé). */
function Trail({ path, glow }) {
  return (
    <nav className={`trail${glow ? ' is-glowing' : ''}`} aria-label="Emplacement">
      <Link to="/storage" className="trail-step" style={{ '--i': 0 }}><Warehouse size={15} aria-hidden="true" /> Stockage</Link>
      {path.map((u, i) => {
        const Icon = KIND_ICONS[u.kind];
        return (
          <Fragment key={u.id}>
            <ChevronRight size={14} className="trail-sep" aria-hidden="true" />
            <Link
              to={`/storage/${u.id}`}
              className={`trail-step${isAppliance(u) ? ` is-appliance theme-${tempTheme(u.temperature)}` : ''}${i === path.length - 1 ? ' is-current' : ''}`}
              style={{ '--i': i + 1 }}
              aria-current={i === path.length - 1 ? 'page' : undefined}
            >
              {Icon && <Icon size={14} aria-hidden="true" />}
              {isAppliance(u) && u.temperature != null ? `${formatTemp(u.temperature)} ` : ''}{unitLabel(u)}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Stockage des échantillons : le labo, ses appareils, leurs étagères, racks et boîtes, et chaque tube. */
export default function StoragePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const focus = params.get('focus');
  const navigate = useNavigate();
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null); // { create } | { unit }

  const reload = useCallback(() => api.get('/inventory').then((d) => { setData(d); setVersion((v) => v + 1); }).catch((err) => notify(err.message, 'error')), [notify]);
  useEffect(() => { reload(); }, [reload]);

  const tree = useMemo(() => (data ? buildTree(data.units) : null), [data]);
  const unit = id && tree ? tree.byId.get(id) : null;
  const path = unit ? unitPath(tree.byId, unit.id) : [];

  useEffect(() => {
    if (tree && id && !unit) navigate('/storage', { replace: true });
  }, [tree, id, unit, navigate]);

  // Lien depuis une entrée (/storage?sample=…) : il mène là où le tube est aujourd'hui
  const sampleParam = params.get('sample');
  useEffect(() => {
    if (!sampleParam) return;
    api.get(`/inventory/samples/${sampleParam}`).then((s) => {
      if (s.archived) {
        notify(`${s.code} « ${s.name} » a été retiré du stockage.`, 'error');
        navigate('/storage', { replace: true });
      } else if (s.unit_id) {
        navigate(`/storage/${s.unit_id}?focus=${s.id}`, { replace: true });
      }
    }).catch((err) => notify(err.message, 'error'));
  }, [sampleParam, navigate, notify]);

  const open = useCallback((u) => navigate(`/storage/${u.id}`), [navigate]);
  const showSample = useCallback((s) => {
    if (!s.unit_id) return;
    navigate(`/storage/${s.unit_id}${s.id ? `?focus=${s.id}` : ''}`);
  }, [navigate]);

  // onCreate reçoit { preset }, { room: true }, { parent } (appareil) ou { kind, parent }
  const create = useCallback((opts) => {
    if (opts.room) setDialog({ create: { kind: 'room', parent: null } });
    else if (opts.preset) setDialog({ create: { parent: null, preset: opts.preset } });
    else setDialog({ create: { kind: opts.kind, parent: opts.parent ?? null, slot: opts.slot ?? null } });
  }, []);

  if (!tree) return <div className="page page-wide"><p className="muted">Ouverture du stockage…</p></div>;

  return (
    <div className="page page-wide storage">
      <header className="stor-head">
        <div>
          <h1>Stockage</h1>
          <p className="page-lead">Chaque tube et chaque grille a son adresse : appareil, étagère, rack, tiroir ou canister et puck, boîte, position.</p>
        </div>
        <WhereIs onFound={showSample} />
      </header>
      {id && <Trail path={path} glow={Boolean(focus)} key={focus ?? 'trail'} />}

      {!id && (
        <LabView
          tree={tree}
          version={version}
          loose={data.loose}
          onOpen={open}
          onCreate={create}
          onEdit={(u) => setDialog({ unit: u })}
          onShowSample={showSample}
          onChanged={reload}
        />
      )}
      {unit && unit.kind === 'canister' && (
        <CanisterView unit={unit} tree={tree} onOpen={open} onCreate={create} onEdit={(u) => setDialog({ unit: u })} onMoved={reload} />
      )}
      {unit && unit.kind === 'puck' && (
        <PuckView unit={unit} tree={tree} onOpen={open} onCreate={create} onEdit={(u) => setDialog({ unit: u })} onMoved={reload} />
      )}
      {unit && !holdsSamples(unit) && unit.kind !== 'canister' && unit.kind !== 'puck' && (
        <InteriorView unit={unit} tree={tree} onOpen={open} onCreate={create} onEdit={(u) => setDialog({ unit: u })} onMoved={reload} />
      )}
      {unit && holdsSamples(unit) && (
        <BoxView key={unit.id} unit={unit} tree={tree} focus={focus} onChanged={reload} onEditUnit={(u) => setDialog({ unit: u })} />
      )}

      {dialog && (
        <UnitDialog
          create={dialog.create}
          unit={dialog.unit}
          tree={tree}
          onClose={() => setDialog(null)}
          onSaved={async (saved) => {
            const wasCreate = Boolean(dialog.create);
            setDialog(null);
            await reload();
            if (wasCreate && (isAppliance(saved) || saved.kind === 'room' || holdsSamples(saved))) navigate(`/storage/${saved.id}`);
          }}
          onArchived={async (u) => {
            setDialog(null);
            await reload();
            notify(`« ${u.name} » retiré.`, 'success');
            navigate(u.parent_id ? `/storage/${u.parent_id}` : '/storage');
          }}
        />
      )}
    </div>
  );
}
