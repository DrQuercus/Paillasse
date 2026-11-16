import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { gc, nf, pos, rangeBases, rangeLength } from '../../lib/dna.js';

/** Barre d'état en français : sélection (taille, GC, Tm), taille totale, topologie. */
export default function StatusBar({ data, selection }) {
  const [tm, setTm] = useState(null);
  const n = data?.sequence.length ?? 0;
  const bases = selection && data ? rangeBases(data.sequence, selection.start, selection.end) : '';

  // Tm de la sélection (primer3), pour les longueurs d'amorce
  useEffect(() => {
    setTm(null);
    if (bases.length < 8 || bases.length > 36 || !/^[ACGT]+$/i.test(bases)) return undefined;
    const t = setTimeout(() => {
      api.post('/tools/oligos/analyze', { oligos: [bases] }).then((r) => setTm(r.oligos[0].tm)).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [bases]);

  if (!data) return <div className="seq-status" />;
  return (
    <div className="seq-status" aria-live="polite">
      {selection ? (
        <span>
          Sélection <strong>{pos(selection.start)} – {pos(selection.end)}</strong> ({nf(rangeLength(selection.start, selection.end, n))} pb)
          <span className="st-sep" aria-hidden="true" /> GC {String(gc(bases)).replace('.', ',')} %
          {tm !== null && <><span className="st-sep" aria-hidden="true" />Tm {String(tm).replace('.', ',')} °C</>}
        </span>
      ) : (
        <span className="muted">Aucune sélection : cliquez-glissez sur la séquence ou cliquez une annotation.</span>
      )}
      <span className="st-right">
        {nf(n)} pb, {data.circular ? 'circulaire' : 'linéaire'}
        <span className="st-sep" aria-hidden="true" />{data.features.length} annotations, {data.primers.length} amorces
      </span>
    </div>
  );
}
