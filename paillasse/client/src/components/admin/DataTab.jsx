import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Download, Lock, Search, Trash2, UserMinus, Users } from 'lucide-react';
import { api } from '../../api.js';
import { useApp } from '../../context.js';
import { Segmented } from '../calc/fields.jsx';
import Modal from '../Modal.jsx';
import PurgeDialog from './PurgeDialog.jsx';
import { Card, formatDate } from './common.jsx';

const SECTIONS = [['entries', 'Entrées'], ['projects', 'Projets'], ['sequences', 'Séquences'], ['storage', 'Stockage'], ['other', 'Autres']];

/** Tableau à cases à cocher, avec « Supprimer la sélection ». columns : [[titre, (ligne) => contenu, classe?]]. */
function SelectTable({ rows, columns, kind, noun, onDeleted, empty = 'Rien ici.' }) {
  const [sel, setSel] = useState(new Set());
  const [dialog, setDialog] = useState(null);
  useEffect(() => { setSel((s) => new Set([...s].filter((id) => rows.some((r) => r.id === id)))); }, [rows]);
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  if (!rows.length) return <p className="muted small">{empty}</p>;
  return (
    <>
      <div className="adm-selbar">
        <label className="adm-check"><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} /> <span>Tout sélectionner ({rows.length})</span></label>
        <button type="button" className="btn btn-small btn-danger" disabled={!sel.size} onClick={() => setDialog([...sel])}>
          <Trash2 size={14} /> Supprimer {sel.size ? `${sel.size} ${noun}` : 'la sélection'}…
        </button>
      </div>
      <div className="adm-table-wrap adm-scroll">
        <table className="adm-table adm-selectable">
          <thead><tr><th className="adm-cb"><span className="sr-only">Sélection</span></th>{columns.map(([label, , cls]) => <th key={label} className={cls}>{label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={sel.has(r.id) ? 'is-selected' : ''} onClick={(e) => { if (!e.target.closest('a, button, input')) toggle(r.id); }}>
                <td className="adm-cb"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label="Sélectionner" /></td>
                {columns.map(([label, render, cls]) => <td key={label} className={cls}>{render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialog && (
        <PurgeDialog
          kind={kind}
          ids={dialog}
          title={`Supprimer ${dialog.length} ${noun}`}
          onClose={() => setDialog(null)}
          onDone={() => { setSel(new Set()); onDeleted(); }}
        />
      )}
    </>
  );
}

const statusText = (e) => (e.archived ? 'archivée' : e.status === 'locked' ? 'verrouillée' : 'brouillon');

function EntriesSection() {
  const { notify } = useApp();
  const [filters, setFilters] = useState({ q: '', project: '', author: '', status: '', before: '' });
  const [rows, setRows] = useState(null);
  const [projects, setProjects] = useState([]);
  const [authors, setAuthors] = useState([]);
  useEffect(() => {
    api.get('/admin/data/projects').then(setProjects).catch(() => {});
    Promise.all([api.get('/admin/users'), api.get('/admin/users/deleted')])
      .then(([a, d]) => setAuthors([...a, ...d.map((u) => ({ ...u, display_name: `${u.display_name} (supprimé)` }))])).catch(() => {});
  }, []);
  const load = useCallback(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    api.get(`/admin/data/entries${qs ? `?${qs}` : ''}`).then(setRows).catch((err) => notify(err.message, 'error'));
  }, [filters, notify]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  return (
    <>
      <div className="adm-filters">
        <label className="st-search"><Search size={15} aria-hidden="true" /><input type="search" value={filters.q} onChange={set('q')} placeholder="Titre ou texte" aria-label="Chercher une entrée" /></label>
        <select value={filters.project} onChange={set('project')} aria-label="Projet"><option value="">Tous les projets</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select value={filters.author} onChange={set('author')} aria-label="Auteur"><option value="">Tous les auteurs</option>{authors.map((u) => <option key={u.id} value={u.id}>{u.display_name}</option>)}</select>
        <select value={filters.status} onChange={set('status')} aria-label="État"><option value="">Tous les états</option><option value="draft">Brouillons</option><option value="locked">Verrouillées</option><option value="archived">Archivées</option></select>
        <label className="adm-date">avant le <input type="date" value={filters.before} onChange={set('before')} /></label>
      </div>
      {!rows ? <p className="muted">Chargement…</p> : (
        <SelectTable
          rows={rows}
          kind="entries"
          noun="entrée(s)"
          onDeleted={load}
          empty="Aucune entrée pour ces filtres."
          columns={[
            ['Entrée', (e) => <><Link to={`/entries/${e.id}`}>{e.title || 'Sans titre'}</Link>{e.parent_entry_id && <span className="muted small"> · addendum</span>}</>],
            ['Projet', (e) => <span className="adm-project"><span className="project-dot" style={{ background: e.project_color }} />{e.project}</span>],
            ['Auteur', (e) => e.author],
            ['État', (e) => <span className={`badge ${e.status === 'locked' ? 'badge-locked' : 'badge-draft'}`}>{statusText(e)}</span>],
            ['Date', (e) => new Date(`${e.entry_date}T12:00:00`).toLocaleDateString('fr-FR'), 'nowrap'],
            ['Versions', (e) => e.versions, 'num'],
            ['Fichiers', (e) => e.files, 'num'],
          ]}
        />
      )}
      {rows?.length === 500 && <p className="hint">Les 500 premières : affinez les filtres.</p>}
      <p className="hint">Une entrée supprimée part avec ses addenda, toutes ses versions figées et ses pièces jointes. Le reste du cahier n’est pas touché et sa vérification d’intégrité reste valable.</p>
    </>
  );
}

const MEMBER_STATUS = { owner: 'Propriétaire', accepted: 'Membre', pending: 'Invitation en attente', declined: 'A refusé' };

/** Partage d'un projet vu par l'administrateur : le confier à un membre, retirer quelqu'un. */
function ProjectAccessDialog({ project, onClose, onChanged }) {
  const { notify } = useApp();
  const [members, setMembers] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get(`/admin/data/projects/${project.id}/members`).then(setMembers).catch((err) => notify(err.message, 'error')); }, [project.id, notify]);
  const act = async (fn, message) => {
    setBusy(true);
    try {
      setMembers(await fn());
      onChanged();
      notify(message, 'success');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const handOver = (m) => {
    if (!window.confirm(`Confier « ${project.name} » à ${m.display_name} ? Il en devient le propriétaire (partage, nom, archivage) ; l’ancien propriétaire reste membre.`)) return;
    act(() => api.post(`/admin/data/projects/${project.id}/owner`, { user_id: m.id }), `${m.display_name} est maintenant propriétaire du projet.`);
  };
  const remove = (m) => {
    if (m.status === 'accepted' && !window.confirm(`Retirer ${m.display_name} du projet « ${project.name} » ? Ses entrées y restent ; il ne verra plus le projet.`)) return;
    act(() => api.del(`/admin/data/projects/${project.id}/members/${m.id}`), m.status === 'pending' ? 'Invitation annulée.' : `${m.display_name} retiré du projet.`);
  };
  return (
    <Modal title={`Accès — ${project.name}`} onClose={onClose} footer={<button type="button" className="btn" onClick={onClose}>Fermer</button>}>
      <p className="small muted">Qui voit ce projet. Vous pouvez le confier à un membre qui a accepté d’y être (propriétaire parti, par exemple) ou retirer quelqu’un. Les invitations, elles, restent du ressort du propriétaire. Chaque geste est noté dans le journal d’administration.</p>
      {!members && <p className="muted">Chargement…</p>}
      {members && (
        <ul className="share-list">
          {members.map((m) => (
            <li key={m.id} className="share-row">
              <span className="people-name">{m.display_name}<span className="muted small"> · {m.username}</span></span>
              <span className={`share-status share-${m.status === 'accepted' ? 'member' : m.status}`}>{MEMBER_STATUS[m.status]}</span>
              {m.status !== 'owner' && (
                <span className="share-actions">
                  {m.status === 'accepted' && (
                    <button type="button" className="btn btn-small" onClick={() => handOver(m)} disabled={busy}><Crown size={14} /> Confier le projet</button>
                  )}
                  <button type="button" className="icon-btn" onClick={() => remove(m)} disabled={busy} title={m.status === 'accepted' ? 'Retirer du projet' : 'Effacer l’invitation'} aria-label={`Retirer ${m.display_name}`}><UserMinus size={15} /></button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ProjectsSection() {
  const [rows, setRows] = useState(null);
  const [access, setAccess] = useState(null);
  const load = useCallback(() => api.get('/admin/data/projects').then(setRows), []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <p className="muted">Chargement…</p>;
  return (
    <>
      <SelectTable
        rows={rows}
        kind="projects"
        noun="projet(s)"
        onDeleted={load}
        columns={[
          ['Projet', (p) => <span className="adm-project"><span className="project-dot" style={{ background: p.color }} /><Link to={`/projects/${p.id}`}>{p.name}</Link>{p.archived && <span className="muted small"> · archivé</span>}</span>],
          ['Propriétaire', (p) => p.owner],
          ['Accès', (p) => (
            <button type="button" className={`access-chip${p.members.length ? ' is-shared' : ''}`} onClick={() => setAccess(p)} title="Voir et gérer qui a accès">
              {p.members.length ? <Users size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}
              {p.members.length ? ` Partagé : ${p.members.join(', ')}` : ' Privé'}
              {p.pending > 0 && ` · ${p.pending} en attente`}
            </button>
          )],
          ['Entrées', (p) => `${p.entries}${p.locked ? ` (${p.locked} verr.)` : ''}`, 'num'],
          ['Séquences', (p) => p.sequences, 'num'],
          ['Jeux de données', (p) => p.datasets, 'num'],
          ['Post-it', (p) => p.notes, 'num'],
        ]}
      />
      <p className="hint">Un projet part avec ses entrées, son tableau d’idées et ses jeux de données. Ses séquences et ses tubes restent dans le registre et le stockage, détachés du projet.</p>
      {access && <ProjectAccessDialog project={access} onClose={() => setAccess(null)} onChanged={load} />}
    </>
  );
}

function SequencesSection() {
  const [rows, setRows] = useState(null);
  const load = useCallback(() => api.get('/admin/data/sequences').then(setRows), []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <p className="muted">Chargement…</p>;
  return (
    <SelectTable
      rows={rows}
      kind="sequences"
      noun="séquence(s)"
      onDeleted={load}
      empty="Aucune séquence dans le registre."
      columns={[
        ['Code', (s) => <code>{s.code}</code>],
        ['Nom', (s) => <Link to={`/sequences/${s.id}`}>{s.name}</Link>],
        ['Projet', (s) => s.project ?? '—'],
        ['Auteur', (s) => s.author],
        ['Versions', (s) => s.versions, 'num'],
        ['Modifiée', (s) => formatDate(s.updated_at), 'nowrap'],
      ]}
    />
  );
}

const KIND_LABELS = { room: 'pièce', freezer: 'congélateur', fridge: 'réfrigérateur', tank: 'cuve ou dewar', cabinet: 'armoire', shelf: 'étagère', rack: 'rack', drawer: 'tiroir', box: 'boîte', bag: 'sac', canister: 'canister', puck: 'puck', gridbox: 'boîte à grilles' };

function StorageSection() {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get('/admin/data/storage').then(setData), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <p className="muted">Chargement…</p>;
  return (
    <>
      <h3 className="adm-subtitle">Pièces, appareils et contenants retirés</h3>
      <SelectTable
        rows={data.units}
        kind="units"
        noun="contenant(s)"
        onDeleted={load}
        empty="Le stockage est vide."
        columns={[
          ['Nom', (u) => <Link to={`/storage/${u.id}`}>{u.name}</Link>],
          ['Type', (u) => `${KIND_LABELS[u.kind] ?? u.kind}${u.archived ? ' · retiré' : ''}`],
          ['Dans', (u) => u.parent ?? '—'],
          ['Contenants dedans', (u) => u.inside, 'num'],
          ['Tubes rangés', (u) => u.samples, 'num'],
        ]}
      />
      <h3 className="adm-subtitle">Tubes retirés (épuisés ou jetés)</h3>
      <SelectTable
        rows={data.discarded}
        kind="samples"
        noun="tube(s)"
        onDeleted={load}
        empty="Aucun tube retiré."
        columns={[
          ['Code', (s) => <code>{s.code}</code>],
          ['Nom', (s) => s.name],
          ['Retiré', (s) => formatDate(s.updated_at), 'nowrap'],
        ]}
      />
      <p className="hint">Supprimer un appareil emporte tout ce qu’il contient (étagères, racks, boîtes, tubes et leur historique). Les entrées qui citent ces tubes gardent l’adresse notée ce jour-là.</p>
    </>
  );
}

function OtherSection() {
  const [data, setData] = useState(null);
  const load = useCallback(() => api.get('/admin/data/other').then(setData), []);
  useEffect(() => { load(); }, [load]);
  const cols = useMemo(() => [
    ['Nom', (r) => r.name],
    ['Détail', (r) => <span className="muted small">{r.detail}{r.archived ? ' · archivé' : ''}</span>],
    ['Modifié', (r) => formatDate(r.updated_at), 'nowrap'],
  ], []);
  if (!data) return <p className="muted">Chargement…</p>;
  return (
    <>
      <h3 className="adm-subtitle">Jeux de données (Statistiques)</h3>
      <SelectTable rows={data.datasets} kind="datasets" noun="jeu(x) de données" onDeleted={load} columns={cols} empty="Aucun jeu de données." />
      <h3 className="adm-subtitle">Modèles d’entrée</h3>
      <SelectTable rows={data.templates} kind="templates" noun="modèle(s)" onDeleted={load} columns={cols} />
      <p className="hint">Un modèle de base (livré avec Paillasse) est retiré plutôt que supprimé : sinon il reviendrait à la prochaine mise à jour.</p>
      <h3 className="adm-subtitle">Produits (Calculs)</h3>
      <SelectTable rows={data.reagents} kind="reagents" noun="produit(s)" onDeleted={load} columns={cols} />
      <h3 className="adm-subtitle">Marqueurs de taille (Gels)</h3>
      <SelectTable rows={data.ladders} kind="ladders" noun="marqueur(s)" onDeleted={load} columns={cols} />
    </>
  );
}

export default function DataTab() {
  const [section, setSection] = useState('entries');
  const Section = { entries: EntriesSection, projects: ProjectsSection, sequences: SequencesSection, storage: StorageSection, other: OtherSection }[section];
  return (
    <div className="adm-stack">
      <Card
        title="Toutes les données"
        actions={<a className="btn btn-small" href="/api/export?all=1" download><Download size={14} /> Export complet</a>}
      >
        <p className="small muted">Tout le cahier, projets privés compris : vous seul, administrateur, le voyez ici. Ouvrir un élément d’un projet dont vous n’êtes pas membre l’affiche en lecture seule. L’export complet contient tous les projets ; celui de la barre latérale, seulement les vôtres.</p>
        <p className="small muted">Suppression définitive : chaque suppression montre d’abord ce qui part et ce qui reste, prend une copie de sécurité de la base (pour revenir en arrière) et s’inscrit dans le journal d’administration. Pour simplement ranger, préférez « archiver » dans le cahier.</p>
        <Segmented label="Quelles données" value={section} onChange={setSection} options={SECTIONS} />
        <Section />
      </Card>
    </div>
  );
}
