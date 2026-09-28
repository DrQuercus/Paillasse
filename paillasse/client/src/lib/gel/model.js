// Analyse d'un gel : modes, état enregistrable, calcul complet et résumé scellé dans l'entrée.
//
// L'état (« analysis ») ne contient que des données JSON : il est enregistré dans l'encart de
// l'entrée avec la référence de l'image d'origine, ce qui permet de rouvrir et de refaire l'analyse.

import { formatNumber } from '../calc/units.js';
import { detectPolarity, imageStats } from './raster.js';
import { analyseProfile, bandSaturation, defaultScales, laneScan, makeWarp } from './profile.js';
import { autoAssign, fitCalibration, formatSize } from './calibration.js';
import { findGroup, fitStandard, groupBands, matchExpected, stoichiometry } from './quant.js';

export const MODES = {
  protein: {
    label: 'Protéines', long: 'Protéines (SDS-PAGE)', unit: 'kDa', ladderKind: 'protein', fit: 'linear',
    amountUnit: 'µg', values: 'percent', darkFigure: true,
    hint: 'Coomassie, argent, stain-free : pureté, taille apparente, stœchiométrie, quantité par gamme de BSA.',
  },
  western: {
    label: 'Western blot', long: 'Western blot', unit: 'kDa', ladderKind: 'protein', fit: 'linear',
    amountUnit: 'µg', values: 'normalized', darkFigure: true,
    hint: 'Chimiluminescence ou fluorescence : bande d’intérêt normalisée par un contrôle de charge.',
  },
  dna: {
    label: 'ADN / ARN', long: 'ADN ou ARN (gel d’agarose)', unit: 'pb', ladderKind: 'dna', fit: 'interp',
    amountUnit: 'ng', values: 'area', darkFigure: false,
    hint: 'BET, SYBR, GelRed : taille des fragments, comparaison à une digestion ou une PCR du registre, masse par bande.',
  },
};

export const VALUE_MODES = {
  area: 'Aire (unités arbitraires)',
  percent: '% de la piste (pureté)',
  relative: '% de la piste de référence',
  normalized: 'Normalisé par le contrôle de charge',
  amount: 'Quantité (gamme étalon)',
};

export const ROLES = { sample: 'Échantillon', ladder: 'Marqueur', standard: 'Gamme étalon' };

let counter = 0;
export const newId = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export function newAnalysis(mode = 'protein') {
  const m = MODES[mode] ?? MODES.protein;
  return {
    v: 1,
    mode,
    name: '',
    source: null,
    prep: { rotate90: 0, flipH: false, flipV: false, angle: 0, crop: null },
    polarity: 'auto',
    signal: 'linear',
    region: null,
    laneWidth: null,
    lanes: [],
    warp: [],
    detection: { sensitivity: 0.6, background: 'rollingball', radius: null, minDistance: null },
    edits: {},
    calibration: { ladder: null, laneId: null, points: [], method: m.fit },
    quant: {
      values: m.values, referenceLane: null, loadingControl: null,
      standards: { source: 'none', group: null, amounts: {}, loaded: '' }, throughOrigin: true,
    },
    expected: [],
    bandNames: [],
    display: { low: null, high: null, invert: false, colormap: 'gray' },
    figure: figureDefaults(m),
  };
}

export const PANEL_ORDER = ['gel', 'profiles', 'calibration', 'standards'];

function figureDefaults(m) {
  return {
    panels: { gel: true, profiles: true, table: true, calibration: false, standards: false },
    order: [...PANEL_ORDER],
    layout: 'column',
    width: 100,
    style: { font: 'sans', fontSize: 14, lineWidth: 1.6, letters: false, colors: 'color' },
    gel: {
      overlay: 'none', laneLabels: true, labelAngle: 'auto', labelSide: 'top', sizeScale: true, scaleSide: 'left',
      bandLabels: 'none', expected: false, darkBands: m.darkFigure, cropToLanes: true, frame: true, size: 'M',
    },
    profiles: {
      lanes: null, axis: 'size', baseline: true, areas: true, labels: true, mode: 'overlay', normalize: 'none',
      smooth: false, legend: 'inside', grid: false, width: 900, height: 380,
    },
  };
}

/**
 * Analyse enregistrée par une version précédente (encart déjà inséré, brouillon) : les réglages
 * apparus depuis prennent leur valeur par défaut, ceux déjà choisis sont gardés.
 */
export function normalizeAnalysis(state) {
  const m = MODES[state.mode] ?? MODES.protein;
  const d = figureDefaults(m);
  const f = state.figure ?? {};
  const order = [...(f.order ?? []).filter((k) => PANEL_ORDER.includes(k)), ...PANEL_ORDER.filter((k) => !(f.order ?? []).includes(k))];
  return {
    ...newAnalysis(state.mode),
    ...state,
    edits: state.edits ?? {},
    expected: state.expected ?? [],
    bandNames: state.bandNames ?? [],
    annotations: state.annotations ?? [],
    figure: {
      ...d,
      ...f,
      order,
      panels: { ...d.panels, ...f.panels },
      style: { ...d.style, ...f.style },
      gel: { ...d.gel, ...f.gel },
      profiles: { ...d.profiles, ...f.profiles },
    },
  };
}

/** Change de mode en gardant l'image, les pistes et les bandes ; les réglages propres au mode suivent. */
export function switchMode(state, mode) {
  const m = MODES[mode];
  const sameKind = MODES[state.mode]?.ladderKind === m.ladderKind;
  return {
    ...state,
    mode,
    calibration: sameKind ? state.calibration : { ladder: null, laneId: state.calibration.laneId, points: [], method: m.fit },
    quant: { ...state.quant, values: m.values },
    figure: { ...state.figure, gel: { ...state.figure.gel, darkBands: m.darkFigure } },
  };
}

export const unitOf = (state) => MODES[state.mode]?.unit ?? 'kDa';

/** Décale toutes les coordonnées dessinées (pistes, zone, courbes) : après un rognage. */
export function shiftGeometry(state, dx, dy) {
  if (!dx && !dy) return state;
  return {
    ...state,
    lanes: state.lanes.map((l) => ({ ...l, xTop: l.xTop + dx, xBot: l.xBot + dx })),
    region: state.region ? { top: Math.max(0, state.region.top + dy), bottom: state.region.bottom + dy } : null,
    warp: state.warp.map((c) => ({ ...c, points: c.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) })),
  };
}

/**
 * Fait tourner pistes et courbes de courbure avec l'image quand le redressement passe de « from » à
 * « to » degrés : même rotation que prepareImage (autour du centre de l'image avant rognage).
 * size = dimensions de l'image avant rognage ; imgSize = image de travail (rognée). Les corrections de
 * bandes et les points d'étalonnage, liés aux anciennes positions, sont retirés.
 */
export function rotateGeometry(state, size, from, to, imgSize = size) {
  if (from === to) return state;
  const t = ((to - from) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const off = state.prep?.crop ?? { x: 0, y: 0 };
  const cx = (size.width - 1) / 2;
  const cy = (size.height - 1) / 2;
  const map = (x, y) => {
    const dx = x + off.x - cx;
    const dy = y + off.y - cy;
    return [cx + dx * cos - dy * sin - off.x, cy + dx * sin + dy * cos - off.y];
  };
  const region = state.region ?? { top: 0, bottom: imgSize.height - 1 };
  const clampX = (x) => Math.max(0, Math.min(imgSize.width - 1, Math.round(x)));
  return {
    ...state,
    lanes: state.lanes.map((l) => {
      const [x1, y1] = map(l.xTop, region.top);
      const [x2, y2] = map(l.xBot, region.bottom);
      const at = (y) => x1 + ((x2 - x1) * (y - y1)) / (y2 - y1 || 1);
      return { ...l, xTop: clampX(at(region.top)), xBot: clampX(at(region.bottom)) };
    }),
    warp: state.warp.map((c) => ({ ...c, points: c.points.map((p) => { const [x, y] = map(p.x, p.y); return { x: Math.round(x), y: Math.round(y) }; }) })),
    edits: {},
    calibration: { ...state.calibration, points: [] },
  };
}
export const laneName = (lane, i) => lane.name?.trim() || String(i + 1);

// --- Calcul ---------------------------------------------------------------------------------------

/**
 * Mémoire des calculs, à garder d'un appel à l'autre pour une même image de travail :
 * déplacer une piste ne relit que cette piste, changer la sensibilité ne relit aucune piste.
 */
export function createProfileCache() {
  return { img: null, image: null, scans: new Map(), analyses: new Map() };
}

function remember(map, key, compute) {
  if (map.has(key)) return map.get(key);
  const value = compute();
  map.set(key, value);
  if (map.size > 160) map.delete(map.keys().next().value); // les plus anciennes (pistes glissées)
  return value;
}

/**
 * Profils, bandes et aires de toutes les pistes (partie coûteuse : dépend de l'image).
 * img = image de travail (préparée) ; cache = createProfileCache(), facultatif.
 */
/** Statistiques et sens des bandes de l'image de travail (calculés une fois par image). */
export function imageInfo(img, cache) {
  if (cache.img !== img) {
    cache.img = img;
    const stats = imageStats(img);
    cache.image = { stats, polarity: detectPolarity(img, stats) };
    cache.scans.clear();
    cache.analyses.clear();
  }
  return cache.image;
}

export function computeProfiles(img, state, cache = createProfileCache()) {
  const { stats } = imageInfo(img, cache);
  const polarity = state.polarity === 'auto' ? cache.image.polarity : state.polarity;
  const region = state.region ?? { top: 0, bottom: img.height - 1 };
  const length = region.bottom - region.top + 1;
  const scales = defaultScales(length);
  const width = state.laneWidth ?? Math.max(3, Math.round(img.width / 30));
  const warp = makeWarp(state.warp, img.width);
  const d = state.detection ?? {};
  const opts = {
    sensitivity: d.sensitivity ?? 0.6,
    minDistance: d.minDistance ?? scales.minDistance,
    background: d.background ?? 'rollingball',
    radius: d.radius ?? scales.radius,
  };
  const common = JSON.stringify([polarity, state.signal, region.top, region.bottom, width, warp ? state.warp : null]);
  const optsKey = JSON.stringify(opts);
  const lanes = state.lanes.map((lane) => {
    const scanKey = `${lane.xTop}|${lane.xBot}|${common}`;
    const { profile, sat } = remember(cache.scans, scanKey, () => laneScan(img, lane, { region, width, polarity, signal: state.signal, warp }));
    const edits = state.edits?.[lane.id];
    const a = remember(cache.analyses, `${scanKey}|${optsKey}|${JSON.stringify(edits ?? null)}`, () => {
      const r = analyseProfile(profile, { ...opts, edits });
      return { ...r, bands: r.bands.map((b) => ({ ...b, saturation: bandSaturation(sat, b) })) };
    });
    return { ...lane, profile, smoothed: a.smoothed, baseline: a.baseline, bands: a.bands, total: a.total };
  });
  return { polarity, region, length, width, warp, lanes, stats, scales };
}

/**
 * Piste du marqueur parmi des pistes détectées : celle du bord (première ou dernière) qui a
 * nettement plus de bandes que les autres. Rien si aucune ne se détache : un western révélé
 * en chimiluminescence, ou un gel de lysats aussi chargés que le marqueur.
 */
export function guessLadder(img, state, lanes, laneWidth, cache = createProfileCache()) {
  if (lanes.length < 2) return null;
  const p = computeProfiles(img, { ...state, lanes, laneWidth, edits: {} }, cache);
  const counts = p.lanes.map((l) => l.bands.length);
  const medianOthers = (i) => {
    const o = counts.filter((_, j) => j !== i).sort((a, b) => a - b);
    return o[Math.floor(o.length / 2)] ?? 0;
  };
  const edges = lanes.length > 2 ? [0, lanes.length - 1] : [0];
  const candidates = edges.filter((i) => counts[i] >= 4 && counts[i] >= 1.5 * medianOthers(i) + 1);
  return candidates.sort((a, b) => counts[b] - counts[a])[0] ?? null;
}

/** Étalonnage, groupes, normalisation, gamme, tailles attendues (partie rapide). */
export function computeResults(profiles, state, source = {}) {
  const unit = unitOf(state);
  const cal = state.calibration ?? {};
  const calibration = cal.points?.length >= 2 ? fitCalibration(cal.points, cal.method) : null;
  const lanes = profiles.lanes.map((lane) => ({
    ...lane,
    bands: lane.bands.map((b) => ({
      ...b,
      size: calibration ? calibration.sizeAt(b.apex) : null,
      saturated: b.saturation > 0.01,
    })),
  }));
  const ladderLane = lanes.find((l) => l.id === cal.laneId) ?? null;
  const sampleLanes = lanes.filter((l) => l.role !== 'ladder');
  const groups = groupBands(sampleLanes, { calibrated: Boolean(calibration), posTolerance: Math.max(4, profiles.length * 0.015) });
  const opts = { calibrated: Boolean(calibration), posTolerance: Math.max(6, profiles.length * 0.02) };
  const q = state.quant ?? {};
  const loadingGroup = findGroup(groups, q.loadingControl, opts);
  const bandOf = (g, laneId) => (g && g.members[laneId] !== undefined ? lanes.find((l) => l.id === laneId).bands[g.members[laneId]] : null);

  // Gamme étalon : bandes d'un groupe avec quantités connues, ou bandes du marqueur avec leurs masses
  let standardPoints = [];
  const st = q.standards ?? {};
  let standardGroup = null;
  let standardAuto = false;
  let standardMissing = [];
  if (st.source === 'group') {
    const amounts = Object.entries(st.amounts ?? {})
      .map(([laneId, amount]) => ({ laneId, amount: Number(String(amount).replace(',', '.').trim() || NaN) }))
      .filter((a) => a.amount > 0 && sampleLanes.some((l) => l.id === a.laneId));
    standardGroup = findGroup(groups, st.group, opts);
    // Bande non choisie : celle présente dans le plus de pistes de gamme (la plus intense à égalité)
    if (!st.group && amounts.length) {
      const score = (g) => amounts.filter((a) => g.members[a.laneId] !== undefined).length;
      const area = (g) => amounts.reduce((t, a) => t + (bandOf(g, a.laneId)?.area ?? 0), 0);
      standardGroup = groups.filter((g) => score(g) > 0).sort((a, b) => score(b) - score(a) || area(b) - area(a))[0] ?? null;
      standardAuto = Boolean(standardGroup);
    }
    standardMissing = standardGroup ? amounts.filter((a) => !bandOf(standardGroup, a.laneId)).map((a) => a.laneId) : [];
    standardPoints = amounts.map((a) => ({ ...a, area: bandOf(standardGroup, a.laneId)?.area ?? 0 })).filter((p) => p.area > 0);
  } else if (st.source === 'ladder' && ladderLane && cal.ladder) {
    const ref = Number(String(cal.ladder.load ?? '').replace(',', '.'));
    const loaded = Number(String(st.loaded ?? '').replace(',', '.')) || ref;
    const factor = ref > 0 ? loaded / ref : 1;
    for (const p of cal.points ?? []) {
      const mass = cal.ladder.bands?.find((b) => b.size === p.size)?.mass;
      const band = ladderLane.bands.reduce((best, b) => (!best || Math.abs(b.apex - p.pos) < Math.abs(best.apex - p.pos) ? b : best), null);
      if (mass > 0 && band && Math.abs(band.apex - p.pos) <= 3) standardPoints.push({ size: p.size, amount: mass * factor, area: band.area });
    }
  }
  const standard = standardPoints.length ? fitStandard(standardPoints, { throughOrigin: q.throughOrigin !== false }) : null;

  // Valeurs par piste et par groupe
  const refLane = q.referenceLane && lanes.find((l) => l.id === q.referenceLane) ? q.referenceLane : null;
  const valueOf = (g, lane) => {
    const b = bandOf(g, lane.id);
    if (!b) return null;
    switch (q.values) {
      case 'percent': return b.percent;
      case 'relative': {
        const r = refLane ? bandOf(g, refLane) : null;
        return r?.area ? (b.area / r.area) * 100 : null;
      }
      case 'normalized': {
        const lc = bandOf(loadingGroup, lane.id);
        if (!lc?.area) return null;
        const ratio = b.area / lc.area;
        if (!refLane) return ratio;
        const r = bandOf(g, refLane);
        const rlc = bandOf(loadingGroup, refLane);
        return r?.area && rlc?.area ? ratio / (r.area / rlc.area) : null;
      }
      case 'amount': return standard ? standard.amountFor(b.area).amount : null;
      default: return b.area;
    }
  };
  const rows = groups.map((g, i) => ({
    group: g,
    label: g.size ? formatSize(g.size, unit) : `Bande ${i + 1}`,
    isLoadingControl: g === loadingGroup,
    cells: sampleLanes.map((lane) => {
      const b = bandOf(g, lane.id);
      const outOfRange = q.values === 'amount' && standard && b ? standard.amountFor(b.area).outOfRange : false;
      return { laneId: lane.id, value: valueOf(g, lane), saturated: Boolean(b?.saturated), outOfRange };
    }),
  }));

  // Deux groupes voisins qui s'afficheraient pareil (« 14 kDa ») : un chiffre de plus
  for (const r of rows) {
    if (r.group.size && rows.filter((x) => x.label === r.label).length > 1) r.label = `${formatNumber(r.group.size, 3)} ${unit}`;
  }
  // Noms donnés par l'utilisateur (GAPDH, p-ERK, BSA…) : la taille reste entre parenthèses
  for (const r of rows) {
    r.sizeLabel = r.label;
    r.name = '';
  }
  for (const n of state.bandNames ?? []) {
    const g = n.name?.trim() && findGroup(groups, n, opts);
    const r = g && rows.find((x) => x.group === g);
    if (r && !r.name) {
      r.name = n.name.trim();
      r.label = r.group.size ? `${r.name} (${r.sizeLabel})` : r.name;
    }
  }

  // Par piste : quantités, stœchiométrie, tailles attendues
  for (const lane of lanes) {
    for (const b of lane.bands) if (standard) Object.assign(b, standard.amountFor(b.area));
    // Stœchiométrie : seulement pour quelques bandes (complexe purifié, co-IP), pas pour un lysat
    const st = calibration && lane.role !== 'ladder' && lane.bands.length >= 2 && lane.bands.length <= 5 ? stoichiometry(lane.bands) : null;
    lane.stoichiometry = st && st.integers && st.integers.some((x) => x > 12) ? { ...st, integers: null } : st;
    const exp = (state.expected ?? []).filter((e) => !e.laneId || e.laneId === lane.id);
    lane.expected = calibration ? exp.map((e) => ({ ...e, matches: matchExpected(e.sizes, lane.bands) })) : exp.map((e) => ({ ...e, matches: [] }));
  }

  const warnings = [];
  if (source.lossy) warnings.push('Image JPEG : la compression avec pertes altère les intensités. Pour quantifier, exportez un TIFF depuis l’imageur.');
  else if (source.bits === 8) warnings.push('Image 8 bits : 256 niveaux seulement. Le TIFF 16 bits de l’imageur donne une quantification plus fiable.');
  const s = profiles.stats;
  if (s && (s.clippedLow > 0.005 || s.clippedHigh > 0.005)) warnings.push('Une partie de l’image est écrêtée (saturée ou retouchée) : les bandes concernées sont sous-estimées.');
  const saturatedBands = lanes.flatMap((l) => l.bands.filter((b) => b.saturated).map(() => l));
  if (saturatedBands.length) warnings.push(`${saturatedBands.length} bande${saturatedBands.length > 1 ? 's' : ''} saturée${saturatedBands.length > 1 ? 's' : ''} : aire sous-estimée, refaites une exposition plus courte.`);
  if (calibration && calibration.method !== 'interp' && calibration.r2 < 0.98) warnings.push(`Étalonnage peu linéaire (R² = ${formatNumber(calibration.r2, 3)}) : essayez l’interpolation entre marqueurs.`);
  if (standard && standard.r2 < 0.95) warnings.push(`Gamme étalon peu linéaire (R² = ${formatNumber(standard.r2, 3)}) : vérifiez qu’aucune bande n’est saturée.`);
  if (q.values === 'normalized' && !loadingGroup) warnings.push('Choisissez la bande du contrôle de charge (actine, GAPDH, tubuline…) pour normaliser.');
  if (q.values === 'relative' && !refLane) warnings.push('Choisissez la piste de référence.');
  if (q.values === 'amount' && !standard) warnings.push('Définissez une gamme étalon pour obtenir des quantités.');
  if (standardMissing.length) {
    const names = standardMissing.map((id) => laneName(state.lanes.find((l) => l.id === id) ?? {}, state.lanes.findIndex((l) => l.id === id)));
    warnings.push(`Bande de la gamme non détectée dans ${names.length > 1 ? 'les pistes' : 'la piste'} ${names.join(', ')} : ces points sont ignorés.`);
  }

  return { lanes, sampleLanes, ladderLane, calibration, groups, rows, loadingGroup, standard, standardPoints, standardGroup, standardAuto, warnings, unit };
}

/** Positions (dans le profil du marqueur) proposées pour l'étalonnage automatique. */
export function suggestCalibration(results, ladder) {
  const lane = results.ladderLane;
  if (!lane || !ladder?.bands?.length) return [];
  return autoAssign(lane.bands.map((b) => b.apex), ladder.bands.map((b) => b.size));
}

// --- Résumé scellé dans l'entrée -------------------------------------------------------------------

const valueText = (v, mode, unit) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  switch (mode) {
    case 'percent': case 'relative': return `${formatNumber(v, 3)} %`;
    case 'normalized': return formatNumber(v, 3);
    case 'amount': return `${formatNumber(v, 3)} ${unit}`;
    default: return formatNumber(v, 4);
  }
};

/** Tableau des bandes et notes, tels qu'insérés (texte) dans l'entrée. */
export function buildSummary(state, results) {
  const m = MODES[state.mode] ?? MODES.protein;
  const q = state.quant ?? {};
  const laneLabel = (l) => laneName(l, state.lanes.findIndex((x) => x.id === l.id));
  const amountUnit = m.amountUnit;
  const columns = ['Bande', ...results.sampleLanes.map(laneLabel)];
  const rows = results.rows.map((r) => [
    `${r.label}${r.isLoadingControl ? ' (contrôle de charge)' : ''}`,
    ...r.cells.map((c) => `${valueText(c.value, q.values, amountUnit)}${c.saturated ? ' ⚠' : ''}${c.outOfRange ? ' (hors gamme)' : ''}`),
  ]);
  const notes = [];
  notes.push(`Valeurs : ${VALUE_MODES[q.values] ?? VALUE_MODES.area}${q.values === 'relative' || q.values === 'normalized'
    ? (q.referenceLane ? `, piste de référence ${laneLabel(state.lanes.find((l) => l.id === q.referenceLane) ?? { name: '?' })}` : '') : ''}.`);
  const cal = state.calibration;
  if (results.calibration && cal?.ladder) {
    notes.push(`Tailles : marqueur ${cal.ladder.name}, ${results.calibration.points.length} bandes, ${
      results.calibration.method === 'interp' ? 'interpolation entre marqueurs' : `${results.calibration.method === 'quadratic' ? 'polynôme de degré 2' : 'régression linéaire'}, R² = ${formatNumber(results.calibration.r2, 4)}`}.`);
  }
  if (results.standard) {
    notes.push(`Gamme étalon : ${results.standard.n} points, R² = ${formatNumber(results.standard.r2, 3)}${q.throughOrigin !== false ? ', droite passant par l’origine' : ''}.`);
  }
  for (const lane of results.sampleLanes) {
    const st = lane.stoichiometry;
    if (st?.integers && lane.bands.length <= 8) {
      notes.push(`Piste ${laneLabel(lane)}, rapport molaire ≈ ${st.bands.map((b, i) => `${st.integers[i]} (${formatSize(b.size, results.unit)})`).join(' : ')}, mesuré ${st.ratios.map((r) => formatNumber(r, 2)).join(' : ')}.`);
    }
    for (const e of lane.expected ?? []) {
      if (!e.sizes.length || !results.calibration) continue;
      notes.push(`Piste ${laneLabel(lane)}, attendu « ${e.label} » : ${e.matches.map((x) => (x.band
        ? `${formatSize(x.size, results.unit)} trouvé à ${formatSize(x.band.size, results.unit)} (${x.deviation >= 0 ? '+' : ''}${formatNumber(x.deviation, 2)} %)`
        : `${formatSize(x.size, results.unit)} absent`)).join(', ')}.`);
    }
  }
  notes.push(...results.warnings);
  const fromFile = String(state.source?.filename ?? '').replace(/\.[^.]+$/, '').trim();
  return {
    title: state.name?.trim() || (fromFile ? `Gel ${fromFile}` : 'Figure de gel'),
    mode: m.long,
    lanes: state.lanes.map((l, i) => `${laneName(l, i)}${l.role !== 'sample' ? ` (${ROLES[l.role].toLowerCase()})` : ''}`),
    table: results.rows.length ? { columns, rows } : null,
    notes,
  };
}
