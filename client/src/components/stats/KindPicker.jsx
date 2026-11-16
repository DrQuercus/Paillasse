import { KINDS } from '../../lib/stats/model.js';

const ICONS = {
  column: <svg viewBox="0 0 40 30" aria-hidden="true"><rect x="5" y="12" width="8" height="15" rx="1" /><rect x="16" y="5" width="8" height="22" rx="1" /><rect x="27" y="16" width="8" height="11" rx="1" /></svg>,
  xy: <svg viewBox="0 0 40 30" aria-hidden="true"><path d="M4 26 C16 26 18 4 36 4" fill="none" strokeWidth="2" /><circle cx="8" cy="25" r="2.2" /><circle cx="19" cy="15" r="2.2" /><circle cx="30" cy="6" r="2.2" /></svg>,
  grouped: <svg viewBox="0 0 40 30" aria-hidden="true"><rect x="4" y="12" width="6" height="15" /><rect x="11" y="17" width="6" height="10" opacity=".45" /><rect x="22" y="5" width="6" height="22" /><rect x="29" y="14" width="6" height="13" opacity=".45" /></svg>,
  contingency: <svg viewBox="0 0 40 30" aria-hidden="true"><rect x="6" y="4" width="12" height="10" /><rect x="21" y="4" width="12" height="10" opacity=".45" /><rect x="6" y="17" width="12" height="10" opacity=".45" /><rect x="21" y="17" width="12" height="10" /></svg>,
  survival: <svg viewBox="0 0 40 30" aria-hidden="true"><path d="M3 4 H11 V10 H19 V16 H28 V22 H37" fill="none" strokeWidth="2" /></svg>,
};

/** Choix du type de tableau : vide ou avec un exemple. */
export default function KindPicker({ onPick }) {
  return (
    <ul className="st-kinds">
      {Object.entries(KINDS).map(([k, v]) => (
        <li key={k}>
          <div className="st-kind-card">
            <span className="st-kind-icon">{ICONS[k]}</span>
            <strong>{v.label}</strong>
            <span className="small">{v.long}</span>
            <span className="muted small">{v.hint}</span>
            <span className="st-kind-actions">
              <button type="button" className="btn btn-primary btn-small" onClick={() => onPick(k, false)}>Tableau vide</button>
              <button type="button" className="btn btn-small" onClick={() => onPick(k, true)}>Exemple</button>
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
