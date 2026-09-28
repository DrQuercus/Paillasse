// Côté navigateur : ouverture des images, rendu à l'écran et images de la figure (canvas).
// Le calcul, lui, est dans model.js et ne dépend d'aucun réglage d'affichage.

import { decodeTiff } from './tiff.js';
import { signalFn } from './raster.js';
import { formatSize, sizeAxis } from './calibration.js';
import { figureStyle } from './figure.js';
import { laneName } from './model.js';
import { laneX } from './profile.js';
import { spreadLabels } from './layout.js';

const f1 = (x) => Math.round(x * 10) / 10;

/** Ouvre une image de gel : TIFF (8, 16, 32 bits) lu par Paillasse, autres formats par le navigateur. */
export async function loadGelFile(blob, filename = '') {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const isTiff = (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 42);
  if (isTiff) {
    const t = await decodeTiff(bytes);
    return {
      image: { data: t.data, width: t.width, height: t.height, maxValue: t.maxValue },
      info: { filename, format: t.format, bits: t.bits, lossy: false, width: t.width, height: t.height },
    };
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error('Format d’image non reconnu (TIFF, PNG, JPEG, BMP ou WebP attendus).');
  }
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const px = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
  const data = new Float32Array(bitmap.width * bitmap.height);
  for (let i = 0; i < data.length; i += 1) data[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  return {
    image: { data, width: bitmap.width, height: bitmap.height, maxValue: 255 },
    info: { filename, format: jpeg ? 'JPEG' : png ? 'PNG' : (blob.type || 'image').replace('image/', '').toUpperCase(), bits: 8, lossy: jpeg, width: bitmap.width, height: bitmap.height },
  };
}

/** Bornes du signal pour l'affichage (0,5 % et 99,8 % des pixels). */
export function signalRange(img, polarity) {
  const sig = signalFn(img, polarity);
  const step = Math.max(1, Math.floor(img.data.length / 150_000));
  const values = new Float32Array(Math.ceil(img.data.length / step));
  for (let i = 0, k = 0; i < img.data.length; i += step, k += 1) values[k] = sig(img.data[i]);
  values.sort();
  const lo = values[Math.floor(values.length * 0.005)] ?? 0;
  const hi = values[Math.floor(values.length * 0.998)] ?? 1;
  return { lo, hi: hi > lo ? hi : lo + 1 };
}

const FIRE = (t) => [Math.min(255, t * 3 * 255), Math.max(0, Math.min(255, (t - 0.33) * 3 * 255)), Math.max(0, Math.min(255, (t - 0.66) * 3 * 255))];

/**
 * Image affichée (résolution native) : signal ramené entre noir et blanc selon les réglages
 * d'affichage. darkBands : bandes sombres sur fond clair (sinon claires sur fond sombre).
 */
export function renderToCanvas(img, { polarity, display = {}, darkBands = true, colormap = 'gray', rect = null, range = null }) {
  const r = rect ?? { x: 0, y: 0, w: img.width, h: img.height };
  const canvas = document.createElement('canvas');
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext('2d');
  const out = ctx.createImageData(r.w, r.h);
  const { lo, hi } = range ?? signalRange(img, polarity);
  const a = lo + (display.low ?? 0) * (hi - lo);
  const b = lo + (display.high ?? 1) * (hi - lo);
  const span = b - a || 1;
  const gamma = display.gamma ?? 1;
  const invert = Boolean(display.invert);
  // Table de couleurs RGBA écrite d'un bloc (un pixel = un entier 32 bits, octets dans l'ordre de la mémoire)
  // t = force du signal (1 = bande intense) ; « feu » : bandes chaudes sur fond noir, pour voir les bandes faibles
  const lut = new Uint32Array(1024);
  const bytes = new Uint8ClampedArray(lut.buffer);
  for (let k = 0; k < 1024; k += 1) {
    const t = (k / 1023) ** gamma;
    const g = darkBands !== invert ? 255 * (1 - t) : 255 * t;
    const [cr, cg, cb] = colormap === 'fire' ? FIRE(t) : [g, g, g];
    bytes[k * 4] = cr; bytes[k * 4 + 1] = cg; bytes[k * 4 + 2] = cb; bytes[k * 4 + 3] = 255;
  }
  const px = new Uint32Array(out.data.buffer);
  const { data } = img;
  const max = img.maxValue || 1;
  const dark = polarity === 'dark';
  const k0 = dark ? (max - a) * (1023 / span) : -a * (1023 / span); // indice = k0 ∓ v · 1023 / span
  const kv = (dark ? -1023 : 1023) / span;
  for (let y = 0; y < r.h; y += 1) {
    const row = (r.y + y) * img.width + r.x;
    const o = y * r.w;
    for (let x = 0; x < r.w; x += 1) {
      const k = k0 + data[row + x] * kv;
      px[o + x] = lut[k <= 0 ? 0 : k >= 1023 ? 1023 : (k + 0.5) | 0];
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** Ligne de l'image où se trouve la position « idéale » pos d'une piste (courbure comprise). */
export function rawY(profiles, lane, pos) {
  const y = profiles.region.top + pos;
  const x = laneX(lane, y, profiles.region);
  return profiles.warp ? profiles.warp(x, y) : y;
}

// Repère pointant vers le gel : à droite de l'image (pointe à gauche) ou à gauche (pointe à droite).
// ly : hauteur du texte, décalée si deux repères sont trop proches (un trait relie alors la flèche au texte).
function arrow(ctx, x, y, text, size, side = 'right', ly = y) {
  const a = Math.max(5, size * 0.4);
  const dir = side === 'right' ? 1 : -1;
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + dir * 2 * a, y - a); ctx.lineTo(x + dir * 2 * a, y + a);
  ctx.closePath();
  ctx.fill();
  let tx = x + dir * (2 * a + 4);
  if (Math.abs(ly - y) > 1.5) {
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + dir * 2 * a, y); ctx.lineTo(x + dir * (2 * a + 8), ly); ctx.stroke();
    tx = x + dir * (2 * a + 11);
  }
  ctx.textAlign = side === 'right' ? 'left' : 'right';
  ctx.fillText(text, tx, ly + size * 0.35);
}

// Largeur du gel dans la figure (px) : S, M, L
export const GEL_SIZES = { S: 600, M: 900, L: 1300 };

/**
 * Panneau « gel » de la figure : image recadrée, noms des pistes, échelle de tailles, repères.
 * Options dans state.figure.gel et state.figure.style ; letter = lettre du panneau (A, B…).
 * pixelRatio : finesse du dessin (2 = deux fois plus de pixels, pour l'impression). Le canvas rendu porte
 * sa taille de conception dans designWidth et designHeight.
 */
export function drawGelFigure(img, state, profiles, results, { letter = null, pixelRatio = 1 } = {}) {
  const opt = state.figure?.gel ?? {};
  const st = figureStyle(state);
  const font = (px, bold = false) => `${bold ? 'bold ' : ''}${px}px ${st.font}`;
  const lanes = state.lanes;
  const region = profiles.region;
  const hw = profiles.width / 2;
  let rect = { x: 0, y: 0, w: img.width, h: img.height };
  if (opt.cropToLanes !== false && lanes.length) {
    const pad = Math.max(8, profiles.width * 0.6);
    const xs = lanes.flatMap((l) => [l.xTop, l.xBot]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs) - hw - pad));
    const x1 = Math.min(img.width, Math.ceil(Math.max(...xs) + hw + pad));
    const y0 = Math.max(0, Math.floor(region.top - pad / 2));
    const y1 = Math.min(img.height, Math.ceil(region.bottom + pad / 2));
    rect = { x: x0, y: y0, w: Math.max(8, x1 - x0), h: Math.max(8, y1 - y0) };
  }
  const target = GEL_SIZES[opt.size] ?? GEL_SIZES.M;
  const s = Math.min(4, target / rect.w);
  const iw = Math.round(rect.w * s);
  const ih = Math.round(rect.h * s);
  const measure = document.createElement('canvas').getContext('2d');
  const labelSize = f1(st.size * 1.08);
  measure.font = font(labelSize);
  const names = lanes.map((l, i) => laneName(l, i));
  const labelW = Math.max(0, ...names.map((n) => measure.measureText(n).width));
  const spacing = lanes.length > 1
    ? Math.min(...lanes.slice(1).map((l, i) => Math.abs((l.xTop - lanes[i].xTop) * s)))
    : iw;
  const showLabels = opt.laneLabels !== false;
  const angle = opt.labelAngle === '0' || opt.labelAngle === '45' || opt.labelAngle === '90'
    ? Number(opt.labelAngle)
    : labelW > spacing - 6 ? 45 : 0;
  const labelsBottom = opt.labelSide === 'bottom';
  const labelBand = !showLabels ? 0 : angle === 0 ? labelSize + 14 : angle === 45 ? 14 + labelW * 0.72 + labelSize * 0.5 : 14 + labelW;
  const cal = results.calibration;
  const ladderLane = results.ladderLane;
  const showScale = opt.sizeScale !== false && cal && ladderLane;
  const scaleRight = opt.scaleSide === 'right';
  const axis = showScale ? sizeAxis(cal.points.map((p) => p.size), results.unit) : null;
  measure.font = font(st.small);
  const scaleW = showScale ? Math.max(measure.measureText(axis.unit).width, ...cal.points.map((p) => measure.measureText(axis.label(p.size)).width)) + 16 : 0;
  const marks = [];
  if (opt.bandLabels === 'groups') {
    const right = [...results.sampleLanes].sort((a, b) => b.xTop - a.xTop)[0];
    for (const row of results.rows) if (right) marks.push({ y: rawY(profiles, right, row.group.pos), text: row.label });
  }
  const rightLane = [...lanes].sort((a, b) => b.xTop - a.xTop)[0];
  for (const a of state.annotations ?? []) if (rightLane) marks.push({ y: rawY(profiles, rightLane, a.pos), text: a.text });
  measure.font = font(st.size);
  const markW = marks.length ? Math.max(...marks.map((m) => measure.measureText(m.text).width)) + st.size * 0.8 + 24 : 0;
  // Repères trop proches (taille d'une bande et flèche à la même hauteur) : textes écartés, jamais superposés
  const shown = marks.map((m) => ({ ...m, rel: (m.y - rect.y) * s })).filter((m) => m.rel >= -2 && m.rel <= ih + 2);
  const spread = spreadLabels(shown.map((m) => m.rel), st.size * 1.2, 0, ih);
  shown.forEach((m, i) => { m.ly = spread[i]; });
  const overflow = shown.length ? Math.max(0, Math.max(...spread) + st.size * 0.6 - ih) : 0;
  // Échelle à gauche, repères à droite (ou l'inverse)
  const leftW = (scaleRight ? markW : scaleW) || 12;
  const rightW = (scaleRight ? scaleW : markW) || 12;
  const letterW = letter ? st.size * 1.6 : 0;
  const unitH = showScale ? st.small + 12 : 0;
  const top = Math.max(labelsBottom ? 12 : labelBand, unitH, letter ? st.size * 1.6 : 0, 12);
  const bottom = Math.max(labelsBottom ? Math.max(labelBand, 12) : 12, overflow + 8);
  const left = Math.round(letterW + leftW);
  const W = Math.round(left + iw + rightW);
  const H = Math.round(top + ih + bottom);
  const pr = Math.max(1, Math.min(4, Number(pixelRatio) || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * pr);
  canvas.height = Math.round(H * pr);
  canvas.designWidth = W;
  canvas.designHeight = H;
  const ctx = canvas.getContext('2d');
  ctx.scale(pr, pr);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const base = renderToCanvas(img, { polarity: profiles.polarity, display: state.display, darkBands: opt.darkBands !== false, rect });
  ctx.imageSmoothingEnabled = s * pr < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, left, top, iw, ih);
  if (opt.frame !== false) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, iw - 1, ih - 1);
  }
  const X = (x) => left + (x - rect.x) * s;
  const Y = (y) => top + (y - rect.y) * s;
  const light = opt.darkBands === false;

  // Pistes
  if (opt.overlay && opt.overlay !== 'none') {
    ctx.strokeStyle = light ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.55)';
    ctx.lineWidth = Math.max(1, st.line * 0.7);
    ctx.setLineDash(opt.overlay === 'lines' ? [5, 4] : []);
    for (const l of lanes) {
      ctx.beginPath();
      if (opt.overlay === 'lines') {
        ctx.moveTo(X(l.xTop), Y(region.top));
        ctx.lineTo(X(l.xBot), Y(region.bottom));
      } else {
        ctx.moveTo(X(l.xTop - hw), Y(region.top)); ctx.lineTo(X(l.xTop + hw), Y(region.top));
        ctx.lineTo(X(l.xBot + hw), Y(region.bottom)); ctx.lineTo(X(l.xBot - hw), Y(region.bottom)); ctx.closePath();
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // Tailles attendues : tirets sur la piste concernée
  if (opt.expected && cal) {
    ctx.strokeStyle = st.gray ? (light ? '#fff' : '#000') : '#D55E00';
    ctx.lineWidth = Math.max(1.5, st.line * 1.2);
    ctx.setLineDash([4, 3]);
    for (const lane of results.lanes) {
      for (const e of lane.expected ?? []) {
        for (const size of e.sizes) {
          const y = Y(rawY(profiles, lane, cal.posAt(size)));
          const x = X(laneX(lane, region.top, region));
          ctx.beginPath(); ctx.moveTo(x - hw * s, y); ctx.lineTo(x + hw * s, y); ctx.stroke();
        }
      }
    }
    ctx.setLineDash([]);
  }
  ctx.lineWidth = 1;
  // Noms des pistes, au-dessus ou au-dessous du gel, droits, inclinés ou verticaux
  if (showLabels) {
    ctx.fillStyle = '#111';
    ctx.font = font(labelSize);
    lanes.forEach((l, i) => {
      const x = X(labelsBottom ? l.xBot : l.xTop);
      const y = labelsBottom ? top + ih + 8 : top - 8;
      ctx.save();
      ctx.translate(x, y);
      if (angle === 0) {
        ctx.textAlign = 'center';
        ctx.fillText(names[i], 0, labelsBottom ? labelSize * 0.9 : -2);
      } else {
        // Texte qui monte depuis le gel (en haut) ou qui descend (en bas)
        ctx.rotate((labelsBottom ? 1 : -1) * (angle * Math.PI) / 180);
        ctx.textAlign = 'left';
        ctx.fillText(names[i], 2, labelSize * 0.35);
      }
      ctx.restore();
    });
  }
  // Échelle de tailles, lue sur la piste du marqueur
  if (showScale) {
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#111';
    ctx.font = font(st.small);
    ctx.textAlign = scaleRight ? 'left' : 'right';
    const edge = scaleRight ? left + iw : left;
    const dir = scaleRight ? 1 : -1;
    for (const p of cal.points) {
      const y = Y(rawY(profiles, ladderLane, p.pos));
      if (y < top - 2 || y > top + ih + 2) continue;
      ctx.beginPath(); ctx.moveTo(edge + dir * 6, y); ctx.lineTo(edge, y); ctx.stroke();
      ctx.fillText(axis.label(p.size), edge + dir * 9, y + st.small * 0.35);
    }
    ctx.font = font(st.small, true);
    ctx.fillText(axis.unit, edge + dir * 9, Math.max(st.small + 2, top - 8));
  }
  // Repères (tailles des bandes, flèches), du côté opposé à l'échelle
  ctx.font = font(st.size);
  for (const m of shown) {
    if (scaleRight) arrow(ctx, left - 4, Y(m.y), m.text, st.size, 'left', top + m.ly);
    else arrow(ctx, left + iw + 4, Y(m.y), m.text, st.size, 'right', top + m.ly);
  }
  if (letter) {
    ctx.fillStyle = '#111';
    ctx.font = font(f1(st.size * 1.35), true);
    ctx.textAlign = 'left';
    ctx.fillText(letter, 4, st.size * 1.35);
  }
  return canvas;
}

export { canvasToBlob, svgToPng } from '../image.js';

export { formatSize };
