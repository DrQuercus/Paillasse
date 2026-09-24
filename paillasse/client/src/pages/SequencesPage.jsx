import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardPaste, Dna, Upload } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../context.js';
import { formatDateTime } from '../lib/format.js';
import Modal from '../components/Modal.jsx';

const ACCEPT = '.dna,.gb,.gbk,.genbank,.gbff,.ape,.fa,.fasta,.fna,.fas,.seq,.txt';

function PasteDialog({ onClose, onCreated }) {
  const { notify } = useApp();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [circular, setCircular] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onCreated(await api.post('/sequences', { name, text, circular }));
    } catch (err) {
      notify(err.message, 'error');
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Coller une séquence"
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="paste-form" className="btn btn-primary" disabled={busy || !text.trim()}>Créer</button>
        </>
      )}
    >
      <form id="paste-form" className="form-stack" onSubmit={submit}>
        <label className="field">
          <span>Nom</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Repris du fichier si vide" />
        </label>
        <label className="field">
          <span>Séquence (bases, FASTA ou GenBank)</span>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} className="mono-input" placeholder="ATGGCAGGATTAATTCGTGTC…" />
        </label>
        <label className="check">
          <input type="checkbox" checked={circular} onChange={(e) => setCircular(e.target.checked)} /> Séquence circulaire (plasmide)
        </label>
      </form>
    </Modal>
  );
}

export default function SequencesPage() {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [list, setList] = useState(null);
  const [pasting, setPasting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);

  const load = useCallback((query) => {
    api.get(`/sequences${query ? `?q=${encodeURIComponent(query)}` : ''}`).then(setList).catch((err) => notify(err.message, 'error'));
  }, [notify]);

  useEffect(() => {
    const t = setTimeout(() => load(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  const imported = (result) => {
    for (const e of result.errors ?? []) notify(`${e.filename} : ${e.error}`, 'error');
    const n = result.created?.length ?? 0;
    if (n === 1) navigate(`/sequences/${result.created[0].id}`);
    else if (n > 1) {
      notify(`${n} séquences importées.`, 'success');
      load(q.trim());
    }
  };

  const importFiles = async (files) => {
    if (!files.length) return;
    setBusy(true);
    try {
      imported(await api.uploadFiles('/sequences/import', files));
    } catch (err) {
      if (err.body?.errors) imported(err.body);
      else notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const dnaQuery = /^[ACGTURYSWKMBDHVN\s]{8,}$/i.test(q.trim());

  return (
    <div
      className={`page page-wide${dragging ? ' is-dropping' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); importFiles([...e.dataTransfer.files]); }}
    >
      <header className="page-head">
        <div>
          <h1>Séquences</h1>
          <p className="page-lead">Plasmides, fragments et oligos. Glissez ici des fichiers SnapGene, GenBank ou FASTA pour les importer.</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPasting(true)}><ClipboardPaste size={15} /> Coller</button>
          <button type="button" className="btn btn-primary" onClick={() => input.current.click()} disabled={busy}>
            <Upload size={15} /> {busy ? 'Import…' : 'Importer des fichiers'}
          </button>
          <input ref={input} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { const f = [...e.target.files]; e.target.value = ''; importFiles(f); }} />
        </div>
      </header>

      <form className="search-form" role="search" onSubmit={(e) => e.preventDefault()}>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nom, identifiant (SEQ-0012), ou un bout de séquence (8 bases ou plus, les deux brins)"
          aria-label="Rechercher une séquence"
        />
      </form>

      {list?.length === 0 && (
        <div className="empty">
          <Dna size={28} aria-hidden="true" />
          <p>{q ? 'Aucune séquence ne correspond.' : 'Le registre est vide.'}</p>
          {!q && <p className="muted">Glissez vos fichiers .dna, .gb ou .fasta sur cette page.</p>}
        </div>
      )}
      {list?.length > 0 && (
        <div className="table-wrap">
          <table className="seq-table">
            <thead>
              <tr><th>Identifiant</th><th>Nom</th><th className="num">Taille</th><th>Topologie</th><th className="num">Annot.</th><th className="num">Amorces</th><th>Projet</th><th className="num">Versions</th><th>Modifiée</th></tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} onClick={() => navigate(`/sequences/${s.id}`)}>
                  <td><code>{s.code}</code></td>
                  <td>
                    <Link to={`/sequences/${s.id}`} onClick={(e) => e.stopPropagation()}>{s.name}</Link>
                    {dnaQuery && s.sequence_match && <span className="badge badge-locked seq-match">contient la séquence</span>}
                  </td>
                  <td className="num">{s.length.toLocaleString('fr-FR')} pb</td>
                  <td>{s.circular ? 'Circulaire' : 'Linéaire'}</td>
                  <td className="num">{s.feature_count}</td>
                  <td className="num">{s.primer_count}</td>
                  <td>{s.project_name && <span className="project-tag"><span className="project-dot" style={{ background: s.project_color }} />{s.project_name}</span>}</td>
                  <td className="num">{s.version_count || ''}</td>
                  <td className="muted small">{formatDateTime(s.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pasting && <PasteDialog onClose={() => setPasting(false)} onCreated={(r) => { setPasting(false); imported(r); }} />}
    </div>
  );
}
