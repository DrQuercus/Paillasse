import { Copy, Dna, Eye, FlaskConical, Plus, Scissors, Waypoints } from 'lucide-react';

function Toggle({ on, onClick, children, title }) {
  return (
    <button type="button" className={`rb-toggle${on ? ' is-on' : ''}`} aria-pressed={on} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

/** Ruban au-dessus de l'éditeur, façon SnapGene : vues, calques, actions sur la sélection, outils. */
export default function Ribbon({ view, setView, hasSelection, readOnly, onAddFeature, onAddPrimer, onCopy, onTool }) {
  const set = (patch) => setView({ ...view, ...patch });
  return (
    <div className="ribbon" role="toolbar" aria-label="Affichage et actions">
      <div className="rb-group">
        <span className="rb-label">Vue</span>
        <div className="rb-seg">
          {[['both', 'Carte et séquence'], ['map', 'Carte'], ['sequence', 'Séquence']].map(([k, label]) => (
            <button key={k} type="button" className={view.layout === k ? 'is-on' : ''} aria-pressed={view.layout === k} onClick={() => set({ layout: k })}>{label}</button>
          ))}
        </div>
      </div>

      <div className="rb-group">
        <span className="rb-label"><Eye size={13} aria-hidden="true" /> Afficher</span>
        <Toggle on={view.features} onClick={() => set({ features: !view.features })}>Annotations</Toggle>
        <div className="rb-seg" role="group" aria-label="Amorces">
          <button type="button" className={view.primers && view.primerBases ? 'is-on' : ''} onClick={() => set({ primers: true, primerBases: true })} title="Amorces avec leurs bases alignées sur la séquence">Amorces : bases</button>
          <button type="button" className={view.primers && !view.primerBases ? 'is-on' : ''} onClick={() => set({ primers: true, primerBases: false })} title="Amorces en simples flèches">flèches</button>
          <button type="button" className={!view.primers ? 'is-on' : ''} onClick={() => set({ primers: false })}>masquées</button>
        </div>
        <label className="rb-select">
          <span className="sr-only">Enzymes affichées</span>
          <select value={view.enzymes} onChange={(e) => set({ enzymes: e.target.value })}>
            <option value="single">Enzymes : coupeurs uniques</option>
            <option value="double">Enzymes : coupeurs doubles</option>
            <option value="both">Enzymes : uniques et doubles</option>
            <option value="none">Enzymes : aucune</option>
          </select>
        </label>
        <Toggle on={view.orfs} onClick={() => set({ orfs: !view.orfs })} title="Cadres ouverts de lecture">ORF</Toggle>
        <Toggle on={view.translations} onClick={() => set({ translations: !view.translations })}>Traductions</Toggle>
      </div>

      <div className="rb-group">
        <span className="rb-label">Sélection</span>
        <button type="button" className="rb-btn" disabled={!hasSelection || readOnly} onClick={onAddFeature} title="Annoter la région sélectionnée"><Plus size={14} /> Annotation</button>
        <button type="button" className="rb-btn" disabled={!hasSelection || readOnly} onClick={onAddPrimer} title="Créer une amorce à partir de la région sélectionnée"><Plus size={14} /> Amorce</button>
        <button type="button" className="rb-btn" disabled={!hasSelection} onClick={() => onCopy(false)}><Copy size={14} /> Copier</button>
        <button type="button" className="rb-btn" disabled={!hasSelection} onClick={() => onCopy(true)} title="Copier le complément inverse">Compl. inverse</button>
      </div>

      <div className="rb-group">
        <span className="rb-label"><Dna size={13} aria-hidden="true" /> Outils</span>
        <button type="button" className="rb-btn" onClick={() => onTool('digest')}><Scissors size={14} /> Digestion</button>
        <button type="button" className="rb-btn" onClick={() => onTool('primers')} disabled={readOnly}><Waypoints size={14} /> Dessin d'amorces</button>
        <button type="button" className="rb-btn" onClick={() => onTool('pcr')}><FlaskConical size={14} /> PCR virtuelle</button>
      </div>
    </div>
  );
}
