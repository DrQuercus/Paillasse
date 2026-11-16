// Plan des boîtes à grilles de cryo-EM, dessinées d'après les boîtes du commerce.
// Coordonnées en % du diamètre de la boîte (0–100, y vers le bas) ; l'ordre des positions suit
// celui des colonnes de la boîte (col 0 = position 1, ou C1 pour une boîte 4 + 4).
//   g12   12 positions rondes (type Molecular Dimensions) : 1 à 8 sur le pourtour dans le sens des
//         aiguilles d'une montre, 9 à 12 autour de la vis ; un cran sur le bord juste avant la 1.
//   g4c4  boîte hybride (type MiTeGen) : clippées C1–C4 à gauche, en logements ronds à oreilles,
//         non clippées N1–N4 à droite, en losanges ; vis au centre, cran en haut.
//   g4    4 losanges autour de la vis ; g4c : 4 logements ronds à oreilles. Cran en haut, 1 juste à sa droite.
// Chaque position : { x, y, shape: 'round' | 'diamond' | 'clip', w, h, clipped, ear (axe des oreilles, en
// degrés), disc (diamètre du dessin de la grille), lab: { x, y } (numéro gravé) }.

const rad = (deg) => (deg * Math.PI) / 180;
const polar = (r, deg) => ({ x: 50 + r * Math.cos(rad(deg)), y: 50 + r * Math.sin(rad(deg)) });

// Le dessin d'une grille (GridDisc) : le métal occupe 80 % de sa taille, un anneau de clip 87,6 %
const round = (at, w, lab) => ({ ...at, shape: 'round', w, h: w, clipped: false, disc: (w * 0.86) / 0.8, lab });
const diamond = (at, w, h, lab) => {
  // Cercle inscrit dans le losange : la grille y repose
  const inner = (w * h) / Math.hypot(w, h);
  return { ...at, shape: 'diamond', w, h, clipped: false, disc: (inner * 0.9) / 0.8, lab };
};
const clip = (at, w, ear, lab) => ({ ...at, shape: 'clip', w, h: w, clipped: true, ear, disc: (w * 0.98) / 0.876, lab });

function g12() {
  const outer = Array.from({ length: 8 }, (_, i) => {
    const a = -67.5 + 45 * i;
    return round(polar(37, a), 20, polar(45.6, a - 17));
  });
  const inner = Array.from({ length: 4 }, (_, i) => {
    const a = -45 + 90 * i;
    return round(polar(16.5, a), 18.5, polar(29, a));
  });
  return { notch: { ...polar(50.5, -101), r: 4.6 }, screw: 4.4, dots: [polar(27.5, -104)], spots: [...outer, ...inner] };
}

function g4c4() {
  const ys = [22, 36, 64, 78];
  const clipped = ys.map((y) => clip({ x: 28, y }, 15, 0, { x: 13.2, y }));
  const unclipped = [[69, 22], [72, 40.5], [72, 59.5], [69, 78]].map(([x, y]) => diamond({ x, y }, 22, 16.5, { x: x + 15.5, y }));
  return { notch: { x: 51, y: -1, r: 10.5 }, screw: 8, dots: [], spots: [...clipped, ...unclipped] };
}

function ring4(kind) {
  return Array.from({ length: 4 }, (_, i) => {
    const a = -45 + 90 * i;
    const lab = polar(43.5, a);
    return kind === 'clip' ? clip(polar(26, a), 22, a + 90, lab) : diamond(polar(26, a), 28, 28, lab);
  });
}

export function gridboxLayout(format) {
  if (format === 'g12') return g12();
  if (format === 'g4c4') return g4c4();
  const spots = ring4(format === 'g4c' ? 'clip' : 'diamond');
  return { notch: { x: 50, y: -1.5, r: 7.5 }, screw: 7, dots: [], spots };
}

/** Oreilles d'un logement clippé : deux encoches pour la pince, de part et d'autre. */
export function clipEars(p) {
  const d = p.w / 2 + 0.7;
  const a = rad(p.ear ?? 0);
  return [-1, 1].map((k) => ({ x: p.x + k * d * Math.cos(a), y: p.y + k * d * Math.sin(a), r: 2.3 }));
}
