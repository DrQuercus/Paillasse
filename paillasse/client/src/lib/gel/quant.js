// Quantification entre pistes : bandes appariées, normalisation, gamme étalon, stœchiométrie.

/**
 * Regroupe les bandes des différentes pistes qui correspondent à la même espèce :
 * même taille (±tolérance relative) si le gel est étalonné, sinon même position.
 * lanes = [{ id, bands: [{ apex, size? }] }]. Une piste ne compte qu'une bande par groupe.
 */
export function groupBands(lanes, { calibrated, sizeTolerance = 0.04, posTolerance = 8 } = {}) {
  const items = [];
  for (const lane of lanes) {
    lane.bands.forEach((b, index) => {
      const key = calibrated && b.size ? Math.log10(b.size) : b.apex;
      items.push({ laneId: lane.id, index, key, band: b });
    });
  }
  const tol = calibrated ? Math.log10(1 + sizeTolerance) : posTolerance;
  items.sort((a, b) => (calibrated ? b.key - a.key : a.key - b.key));
  const groups = [];
  for (const it of items) {
    const g = groups.find((x) => Math.abs(x.center - it.key) <= tol && !(it.laneId in x.members));
    if (g) {
      g.members[it.laneId] = it.index;
      g.keys.push(it.key);
      g.center = g.keys.reduce((a, b) => a + b, 0) / g.keys.length;
    } else {
      groups.push({ center: it.key, keys: [it.key], members: { [it.laneId]: it.index } });
    }
  }
  return groups
    .map((g) => {
      const bands = Object.entries(g.members).map(([laneId, i]) => lanes.find((l) => String(l.id) === laneId).bands[i]);
      const pos = bands.reduce((a, b) => a + b.apex, 0) / bands.length;
      const size = calibrated ? 10 ** g.center : null;
      return { pos, size, members: g.members };
    })
    .sort((a, b) => a.pos - b.pos);
}

/** Groupe le plus proche d'une référence enregistrée ({ pos, size }). */
export function findGroup(groups, ref, { calibrated, sizeTolerance = 0.06, posTolerance = 12 } = {}) {
  if (!ref) return null;
  let best = null;
  let bestD = Infinity;
  for (const g of groups) {
    const d = calibrated && g.size && ref.size ? Math.abs(Math.log10(g.size / ref.size)) : Math.abs(g.pos - ref.pos);
    if (d < bestD) { bestD = d; best = g; }
  }
  const tol = calibrated && ref.size ? Math.log10(1 + sizeTolerance) : posTolerance;
  return bestD <= tol ? best : null;
}

/** Régression d'une gamme étalon : quantité en fonction de l'aire. */
export function fitStandard(points, { throughOrigin = true } = {}) {
  const pts = points.filter((p) => p.area > 0 && p.amount > 0);
  if (pts.length < (throughOrigin ? 1 : 2)) return null;
  let slope;
  let intercept = 0;
  if (throughOrigin) {
    slope = pts.reduce((t, p) => t + p.area * p.amount, 0) / pts.reduce((t, p) => t + p.area * p.area, 0);
  } else {
    const n = pts.length;
    const sx = pts.reduce((t, p) => t + p.area, 0);
    const sy = pts.reduce((t, p) => t + p.amount, 0);
    const sxx = pts.reduce((t, p) => t + p.area * p.area, 0);
    const sxy = pts.reduce((t, p) => t + p.area * p.amount, 0);
    slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    intercept = (sy - slope * sx) / n;
  }
  const mean = pts.reduce((t, p) => t + p.amount, 0) / pts.length;
  let tot = 0;
  let res = 0;
  for (const p of pts) { tot += (p.amount - mean) ** 2; res += (p.amount - (slope * p.area + intercept)) ** 2; }
  const areas = pts.map((p) => p.area);
  return {
    slope, intercept, r2: tot ? 1 - res / tot : 1, n: pts.length,
    range: [Math.min(...areas), Math.max(...areas)],
    amountFor(area) {
      const amount = slope * area + intercept;
      return { amount, outOfRange: area < this.range[0] * 0.95 || area > this.range[1] * 1.05 };
    },
  };
}

/**
 * Rapports molaires dans une piste : la coloration (Coomassie, BET/SYBR) est proportionnelle
 * à la masse, donc moles ∝ aire / taille. Rapports ramenés à la plus petite quantité,
 * puis au plus petit multiplicateur (≤ 8) qui les rend presque entiers (1 : 1,5 → 2 : 3).
 * Tolérance de 15 % par bande : un gel ne sépare pas mieux 1 : 1,14 de 1 : 1, et « 5 : 6 »
 * serait une précision illusoire.
 */
export function stoichiometry(bands) {
  const withSize = bands.filter((b) => b.size > 0 && b.area > 0);
  if (withSize.length < 2) return null;
  const moles = withSize.map((b) => b.area / b.size);
  const min = Math.min(...moles);
  const ratios = moles.map((m) => m / min);
  let multiplier = null;
  for (let m = 1; m <= 8; m += 1) {
    if (ratios.every((r) => Math.abs(r * m - Math.round(r * m)) <= 0.15 * Math.round(r * m))) { multiplier = m; break; }
  }
  return {
    ratios,
    integers: multiplier ? ratios.map((r) => Math.round(r * multiplier)) : null,
    bands: withSize,
  };
}

/** Pour chaque taille attendue, la bande observée la plus proche et l'écart en %. */
export function matchExpected(expectedSizes, bands, tolerance = 0.15) {
  return expectedSizes.map((size) => {
    let best = null;
    for (const b of bands) {
      if (!b.size) continue;
      const d = Math.abs(Math.log(b.size / size));
      if (!best || d < best.d) best = { d, band: b };
    }
    if (!best || best.d > Math.log(1 + tolerance)) return { size, band: null, deviation: null };
    return { size, band: best.band, deviation: (best.band.size / size - 1) * 100 };
  });
}
