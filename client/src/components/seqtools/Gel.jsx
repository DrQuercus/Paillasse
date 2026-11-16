// Gel d'agarose virtuel : migration proportionnelle au logarithme de la taille, calée sur le marqueur.
export const LADDERS = {
  'GeneRuler 1 kb': [10000, 8000, 6000, 5000, 4000, 3500, 3000, 2500, 2000, 1500, 1000, 750, 500, 250],
  'GeneRuler 1 kb Plus': [20000, 10000, 7000, 5000, 4000, 3000, 2000, 1500, 1000, 700, 500, 400, 300, 200, 75],
  'NEB 1 kb': [10002, 8001, 6001, 5001, 4001, 3001, 2000, 1500, 1000, 517, 500],
  'GeneRuler 100 pb Plus': [3000, 2000, 1500, 1200, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100],
};
const BOLD = { 'GeneRuler 1 kb': [6000, 3000, 1000], 'GeneRuler 1 kb Plus': [5000, 1500, 500], 'NEB 1 kb': [3001, 1000], 'GeneRuler 100 pb Plus': [1000, 500] };

export default function Gel({ lanes, ladder = 'GeneRuler 1 kb' }) {
  const marks = LADDERS[ladder];
  const W = 110 + lanes.length * 90;
  const H = 360;
  const top = 34;
  const bottom = H - 16;
  const hi = Math.log10(marks[0] * 1.15);
  const lo = Math.log10(marks[marks.length - 1] * 0.8);
  const y = (bp) => top + ((hi - Math.log10(Math.max(bp, 10))) / (hi - lo)) * (bottom - top);
  const inGel = (bp) => y(bp) >= top - 6 && y(bp) <= bottom + 4;
  const laneX = (i) => 70 + i * 90;
  const maxMass = Math.max(1, ...lanes.flatMap((l) => l.bands.map((b) => b.size * (b.copies ?? 1))));
  const bandsOf = (lane) => {
    // Fragments de taille voisine (moins de 3 %) : une seule bande, plus intense
    const merged = [];
    for (const b of [...lane.bands].sort((a, c) => c.size - a.size)) {
      const last = merged.at(-1);
      if (last && Math.abs(last.size - b.size) / last.size < 0.03) last.copies = (last.copies ?? 1) + (b.copies ?? 1);
      else merged.push({ ...b });
    }
    return merged;
  };

  return (
    <svg className="gel" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Gel d'agarose virtuel">
      <rect x="0" y="0" width={W} height={H} rx="6" fill="#161B26" />
      {/* marqueur */}
      <text x={laneX(0)} y="20" textAnchor="middle" className="gel-label">Marqueur</text>
      <rect x={laneX(0) - 26} y={top - 12} width="52" height="6" fill="#2A3142" />
      {marks.map((bp) => (
        <g key={bp}>
          <rect x={laneX(0) - 24} y={y(bp) - 1.5} width="48" height={BOLD[ladder]?.includes(bp) ? 4 : 3} rx="1" fill="#F3F6FF" opacity={BOLD[ladder]?.includes(bp) ? 0.95 : 0.6} />
          <text x={laneX(0) - 30} y={y(bp) + 3.5} textAnchor="end" className="gel-size">{bp >= 1000 ? `${bp / 1000} kb` : bp}</text>
        </g>
      ))}
      {lanes.map((lane, i) => (
        <g key={lane.label}>
          <text x={laneX(i + 1)} y="20" textAnchor="middle" className="gel-label">{lane.label}</text>
          <rect x={laneX(i + 1) - 30} y={top - 12} width="60" height="6" fill="#2A3142" />
          {bandsOf(lane).filter((b) => inGel(b.size)).map((b) => (
            <rect
              key={`${b.size}-${b.copies ?? 1}`}
              x={laneX(i + 1) - 28}
              y={y(b.size) - 2}
              width="56"
              height={b.uncut ? 5 : 4}
              rx="1.5"
              fill="#F3F6FF"
              opacity={0.3 + 0.7 * Math.min(1, (b.size * (b.copies ?? 1)) / maxMass)}
            >
              <title>{b.uncut ? `Plasmide non coupé (${b.size} pb), position indicative` : `${b.size} pb${b.copies > 1 ? ` (×${b.copies})` : ''}`}</title>
            </rect>
          ))}
          {bandsOf(lane).filter((b) => !inGel(b.size)).length > 0 && (
            <text x={laneX(i + 1)} y={H - 4} textAnchor="middle" className="gel-size">hors gel</text>
          )}
        </g>
      ))}
    </svg>
  );
}
