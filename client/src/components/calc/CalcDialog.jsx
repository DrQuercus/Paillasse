import { useCallback, useMemo, useState } from 'react';
import { CALCULATORS, getCalculator, runCalculator } from '../../lib/calc/calculators.js';
import Modal from '../Modal.jsx';
import CalcForm from './CalcForm.jsx';
import CalcSummary from './CalcSummary.jsx';
import { lastKind, storeParams, storedParams } from './store.js';

/**
 * Insérer un calcul dans l'éditeur, ou modifier un encart existant (initial = { kind, params }).
 * preset = { kind, params } : calcul proposé par un emplacement de modèle (insertion).
 * onApply reçoit les attributs du nœud : { kind, params, summary }.
 */
export default function CalcDialog({ initial = null, preset = null, onApply, onClose }) {
  const editing = Boolean(initial);
  const start = initial ?? (getCalculator(preset?.kind) ? preset : null);
  const [kind, setKind] = useState(start?.kind ?? lastKind());
  const [byKind, setByKind] = useState(() => (start ? { [start.kind]: { ...getCalculator(start.kind)?.defaults(), ...start.params } } : {}));
  const params = byKind[kind] ?? storedParams(kind);
  const result = useMemo(() => runCalculator(kind, params), [kind, params]);

  const onChange = useCallback((next) => {
    setByKind((all) => ({ ...all, [kind]: next }));
    if (!editing) storeParams(kind, next);
  }, [kind, editing]);

  const submit = (e) => {
    e?.preventDefault();
    if (result.ok) onApply({ kind, params, summary: result.summary });
  };

  return (
    <Modal
      title={editing ? 'Modifier le calcul' : 'Insérer un calcul'}
      onClose={onClose}
      wide
      footer={(
        <>
          <span className="modal-foot-note">Le calcul est enregistré avec ses valeurs, et scellé avec la prochaine version.</span>
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" form="calc-dialog-form" className="btn btn-primary" disabled={!result.ok}>
            {editing ? 'Enregistrer' : 'Insérer'}
          </button>
        </>
      )}
    >
      {!editing && (
        <div className="chip-row calc-chooser" role="tablist" aria-label="Type de calcul">
          {CALCULATORS.map((c) => (
            <button key={c.kind} type="button" role="tab" aria-selected={c.kind === kind} className={`chip${c.kind === kind ? ' is-active' : ''}`} onClick={() => setKind(c.kind)}>
              {c.short}
            </button>
          ))}
        </div>
      )}
      <form id="calc-dialog-form" className="calc-layout calc-layout-dialog" onSubmit={submit}>
        <div>
          <p className="calc-desc">{getCalculator(kind).description}</p>
          <CalcForm kind={kind} params={params} onChange={onChange} />
        </div>
        <div className="calc-preview" aria-live="polite">
          {result.ok
            ? <CalcSummary summary={result.summary} preview />
            : <p className={result.message ? 'form-error' : 'calc-waiting'}>{result.message ?? 'Le résultat s’affiche dès que les valeurs nécessaires sont saisies.'}</p>}
        </div>
      </form>
    </Modal>
  );
}
