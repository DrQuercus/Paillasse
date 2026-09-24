import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArrowLeft, ArrowRight, Minus, ShieldCheck, Trash2, TriangleAlert } from 'lucide-react';
import { api } from '../../api.js';
import { formatDateTime, formatSize, shortHash } from '../../lib/format.js';
import { COLORS, nf, pos, typeLabel } from '../../lib/dna.js';

const Strand = ({ s }) => (s === 1 ? <ArrowRight size={13} aria-label="direct" /> : s === -1 ? <ArrowLeft size={13} aria-label="inverse" /> : <Minus size={13} aria-label="sans direction" />);
const featureSpan = (f) => ({ start: f.segments[0].start, end: f.segments[f.segments.length - 1].end });

function Features({ data, readOnly, onSelect, onDelete }) {
  const list = [...data.features].sort((a, b) => a.segments[0].start - b.segments[0].start);
  if (!list.length) return <p className="muted small panel-empty">Aucune annotation. Sélectionnez une région puis « Annotation » dans le ruban.</p>;
  return (
    <ul className="ann-list">
      {list.map((f) => {
        const { start, end } = featureSpan(f);
        return (
          <li key={f.id}>
            <button type="button" className="ann-item" onClick={() => onSelect(start, end)} title="Sélectionner dans l'éditeur">
              <span className="ann-color" style={{ background: f.color ?? COLORS[8] }} aria-hidden="true" />
              <span className="ann-main">
                <span className="ann-name">{f.name || '(sans nom)'}</span>
                <span className="ann-meta">{typeLabel(f.type)}, {pos(start)} – {pos(end)}{f.segments.length > 1 ? `, ${f.segments.length} segments` : ''}</span>
              </span>
              <Strand s={f.strand} />
            </button>
            {!readOnly && (
              <button type="button" className="icon-btn ann-del" onClick={() => onDelete(f)} aria-label={`Supprimer ${f.name}`} title="Supprimer l'annotation"><Trash2 size={14} /></button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Primers({ data, readOnly, onSelect, onDelete }) {
  if (!data.primers.length) return <p className="muted small panel-empty">Aucune amorce. Sélectionnez une région puis « Amorce », ou utilisez le dessin d'amorces.</p>;
  return (
    <ul className="ann-list">
      {data.primers.map((p) => {
        const site = p.sites[0];
        return (
          <li key={p.id}>
            <button type="button" className="ann-item" disabled={!site} onClick={() => site && onSelect(site.start, site.end)}>
              <span className="ann-main">
                <span className="ann-name">{p.name || '(sans nom)'}</span>
                <code className="ann-oligo">{p.bases}</code>
                <span className="ann-meta">
                  {p.bases.length} nt, {site ? `se fixe en ${pos(site.start)} – ${pos(site.end)}${p.sites.length > 1 ? ` (+${p.sites.length - 1})` : ''}` : 'aucun site de fixation'}
                  {site?.tm ? `, Tm ${String(site.tm).replace('.', ',')} °C` : ''}
                </span>
              </span>
              {site && <Strand s={site.strand} />}
            </button>
            {!readOnly && (
              <button type="button" className="icon-btn ann-del" onClick={() => onDelete(p)} aria-label={`Supprimer ${p.name}`} title="Supprimer l'amorce"><Trash2 size={14} /></button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Enzymes({ sequenceId, version, revision, onSelect }) {
  const [cutters, setCutters] = useState(null);
  const [which, setWhich] = useState(1);
  useEffect(() => {
    api.get(`/sequences/${sequenceId}/cutters${version ? `?version=${version}` : ''}`).then(setCutters).catch(() => {});
  }, [sequenceId, version, revision]);
  if (!cutters) return <p className="muted small panel-empty">Recherche des sites…</p>;
  const rows = cutters.enzymes.filter((e) => e.count === which).flatMap((e) => e.positions.map((p) => ({ name: e.name, p }))).sort((a, b) => a.p - b.p);
  return (
    <>
      <div className="chip-row panel-chips">
        <button type="button" className={`chip${which === 1 ? ' is-active' : ''}`} onClick={() => setWhich(1)}>Uniques</button>
        <button type="button" className={`chip${which === 2 ? ' is-active' : ''}`} onClick={() => setWhich(2)}>Doubles</button>
      </div>
      <ul className="ann-list">
        {rows.map((r) => (
          <li key={`${r.name}-${r.p}`}>
            <button type="button" className="ann-item" onClick={() => onSelect(Math.max(0, r.p - 1), r.p)} title="Aller au site">
              <span className="ann-main"><span className="ann-name">{r.name}</span></span>
              <span className="ann-meta">coupe après {nf(r.p)}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Recette de construction : comment cette séquence a été obtenue. */
function Origin({ origin }) {
  if (!origin) return null;
  const t = origin.template;
  return (
    <>
      <h3>Construction</h3>
      <div className="origin">
        <p><strong>{origin.method === 'pcr' ? 'Produit de PCR' : origin.method}</strong></p>
        <p>
          Matrice : <Link to={`/sequences/${t.sequence_id}?version=${t.version}`}>{t.code} {t.name}</Link>, version {t.version}
        </p>
        <p>Amorces : {origin.primers.map((p) => p.name).join(' et ')}</p>
        <p className="muted small">
          Région {pos(origin.region.start)} – {pos(origin.region.end)} ({nf(origin.region.length)} pb)
          {origin.mismatches?.length ? `, ${origin.mismatches.length} mésappariement${origin.mismatches.length > 1 ? 's' : ''} introduit${origin.mismatches.length > 1 ? 's' : ''} par les amorces` : ''}
        </p>
      </div>
    </>
  );
}

function Infos({ sequenceId, meta, versions, viewing, projects, onOpenVersion, onUpdateMeta, onArchive }) {
  const [report, setReport] = useState(null);
  return (
    <div className="panel-infos">
      <dl className="seq-facts">
        <dt>Identifiant</dt><dd><code>{meta.code}</code></dd>
        <dt>Taille</dt><dd>{nf(meta.length)} pb</dd>
        <dt>GC</dt><dd>{String(meta.gc_percent).replace('.', ',')} %</dd>
        <dt>Créée</dt><dd>{formatDateTime(meta.created_at)} par {meta.created_by_name}</dd>
      </dl>
      <label className="field">
        <span>Projet</span>
        <select value={meta.project_id ?? ''} onChange={(e) => onUpdateMeta({ project_id: e.target.value || null })}>
          <option value="">Aucun</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Description</span>
        <textarea rows={3} defaultValue={meta.description} onBlur={(e) => e.target.value !== meta.description && onUpdateMeta({ description: e.target.value })} />
      </label>

      <Origin origin={meta.origin} />

      <h3>Versions</h3>
      {versions.length === 0 && <p className="muted small">Aucune version figée. Figez-en une avant d'utiliser la séquence dans une manip.</p>}
      <ol className="version-list">
        {versions.map((v) => (
          <li key={v.version_number}>
            <button type="button" className={`version-item${viewing?.version_number === v.version_number ? ' is-current' : ''}`} onClick={() => onOpenVersion(v.version_number)}>
              <span className="version-num">v{v.version_number}</span>
              <span className="version-info">
                <span>{formatDateTime(v.created_at)}, {nf(v.length)} pb</span>
                {v.note && <span className="version-note">{v.note}</span>}
                <code className="hash" title={v.hash}>{shortHash(v.hash)}</code>
              </span>
            </button>
          </li>
        ))}
      </ol>

      {meta.files?.length > 0 && (
        <>
          <h3>Fichier d'origine</h3>
          <ul className="file-list">
            {meta.files.map((f) => (
              <li key={f.id}>
                <a href={`/api/sequences/${sequenceId}/files/${f.id}`}>{f.filename}</a>
                <span className="muted small">{formatSize(f.size_bytes)}, importé le {formatDateTime(f.created_at)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Intégrité</h3>
      <button type="button" className="btn btn-block" onClick={async () => setReport(await api.get(`/sequences/${sequenceId}/verify`))}>
        <ShieldCheck size={15} /> Vérifier les versions
      </button>
      {report && (
        <div className={`integrity ${report.ok ? 'integrity-ok' : 'integrity-bad'}`}>
          {report.ok
            ? <p><ShieldCheck size={16} /> Chaîne intacte : {report.version_count} version{report.version_count > 1 ? 's' : ''}.</p>
            : <><p><TriangleAlert size={16} /> Anomalies :</p><ul>{report.issues.map((i) => <li key={i}>{i}</li>)}</ul></>}
        </div>
      )}
      <button type="button" className="btn btn-ghost btn-block" onClick={onArchive}><Archive size={15} /> Archiver la séquence</button>
    </div>
  );
}

/** Panneau latéral à onglets, comme les onglets Features / Primers / Enzymes de SnapGene. */
export default function SequencePanel(props) {
  const { data, tab, setTab } = props;
  const tabs = [
    ['features', `Annotations (${data?.features.length ?? 0})`],
    ['primers', `Amorces (${data?.primers.length ?? 0})`],
    ['enzymes', 'Enzymes'],
    ['infos', 'Infos'],
  ];
  return (
    <aside className="seq-panel" aria-label="Annotations, amorces, enzymes et informations">
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' is-active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div className="panel-body">
        {data && tab === 'features' && <Features {...props} />}
        {data && tab === 'primers' && <Primers {...props} />}
        {tab === 'enzymes' && <Enzymes {...props} />}
        {tab === 'infos' && props.meta && <Infos {...props} />}
      </div>
    </aside>
  );
}
