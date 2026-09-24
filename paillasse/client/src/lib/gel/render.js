// Côté navigateur : ouverture des images, rendu à l'écran et images de la figure (canvas).
// Le calcul, lui, est dans model.js et ne dépend d'aucun réglage d'affichage.

import { decodeTiff } from './tiff.js';
import { signalFn } from './raster.js';
import { formatSize, sizeAxis } from './calibration.js';
import { laneName } from './model.js';
import { laneX } from './profile.js';

const FONT = 'Helvetica, Arial, sans-serif';

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
  const values = [];
  for (let i = 0; i < img.data.length; i += step) values.push(sig(img.data[i]));
  values.sort((a, b) => a - b);
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
  const sig = signalFn(img, polarity);
  const { lo, hi } = range ?? signalRange(img, polarity);
  const a = lo + (display.low ?? 0) * (hi - lo);
  const b = lo + (display.high ?? 1) * (hi - lo);
  const span = b - a || 1;
  const gamma = display.gamma ?? 1;
  const invert = Boolean(display.invert);
  const lut = new Uint8ClampedArray(1024 * 3);
  // t = force du signal (1 = bande intense) ; « feu » : bandes chaudes sur fond noir, pour voir les bandes faibles
  for (let k = 0; k < 1024; k += 1) {
    const t = (k / 1023) ** gamma;
    const g = darkBands !== invert ? 255 * (1 - t) : 255 * t;
    const [cr, cg, cb] = colormap === 'fire' ? FIRE(t) : [g, g, g];
    lut[k * 3] = cr; lut[k * 3 + 1] = cg; lut[k * 3 + 2] = cb;
  }
  for (let y = 0; y < r.h; y += 1) {
    const row = (r.y + y) * img.width + r.x;
    for (let x = 0; x < r.w; x += 1) {
      const t = Math.max(0, Math.min(1, (sig(img.data[row + x]) - a) / span));
      const k = Math.round(t * 1023) * 3;
      const o = (y * r.w + x) * 4;
      out.data[o] = lut[k]; out.data[o + 1] = lut[k + 1]; out.data[o + 2] = lut[k + 2]; out.data[o + 3] = 255;
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

function arrow(ctx, x, y, text, color = '#111') {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + 10, y - 5);
  ctx.lineTo(x + 10, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillText(text, x + 14, y + 5);
}

/** Panneau « gel » de la figure : image recadrée, noms des pistes, échelle de tailles, repères. */
export function drawGelFigure(img, state, profiles, results) {
  const opt = state.figure?.gel ?? {};
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
  const s = rect.w < 520 ? Math.min(4, 520 / rect.w) : rect.w > 1400 ? 1400 / rect.w : 1;
  const iw = Math.round(rect.w * s);
  const ih = Math.round(rect.h * s);
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `15px ${FONT}`;
  const names = lanes.map((l, i) => laneName(l, i));
  const labelW = Math.max(0, ...names.map((n) => measure.measureText(n).width));
  const spacing = lanes.length > 1
    ? Math.min(...lanes.slice(1).map((l, i) => Math.abs((l.xTop - lanes[i].xTop) * s)))
    : iw;
  const rotate = opt.laneLabels !== false && labelW > spacing - 6;
  const cal = results.calibration;
  const ladderLane = results.ladderLane;
  const showScale = opt.sizeScale !== false && cal && ladderLane;
  const marks = [];
  if (opt.bandLabels === 'groups') {
    const right = [...results.sampleLanes].sort((a, b) => b.xTop - a.xTop)[0];
    for (const row of results.rows) if (right) marks.push({ y: rawY(profiles, right, row.group.pos), text: row.label });
  }
  const rightLane = [...lanes].sort((a, b) => b.xTop - a.xTop)[0];
  for (const a of state.annotations ?? []) if (rightLane) marks.push({ y: rawY(profiles, rightLane, a.pos), text: a.text });
  measure.font = `14px ${FONT}`;
  const markW = Math.max(0, ...marks.map((m) => measure.measureText(m.text).width));
  const top = opt.laneLabels === false ? 12 : rotate ? 16 + labelW * 0.72 : 32;
  const left = showScale ? 74 : 12;
  const right = marks.length ? 26 + markW : 12;
  const W = Math.round(left + iw + right);
  const H = Math.round(top + ih + 12);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const base = renderToCanvas(img, { polarity: profiles.polarity, display: state.display, darkBands: opt.darkBands !== false, rect });
  ctx.imageSmoothingEnabled = s < 1;
  ctx.drawImage(base, left, top, iw, ih);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, top + 0.5, iw - 1, ih - 1);
  const X = (x) => left + (x - rect.x) * s;
  const Y = (y) => top + (y - rect.y) * s;
  const light = opt.darkBands === false;

  // Pistes
  if (opt.overlay && opt.overlay !== 'none') {
    ctx.strokeStyle = light ? 'rgba(255,255,255,.75)' : 'rgba(0,0,0,.55)';
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
    ctx.strokeStyle = '#D55E00';
    ctx.lineWidth = 2;
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
    ctx.lineWidth = 1;
  }
  // Noms des pistes
  if (opt.laneLabels !== false) {
    ctx.fillStyle = '#111';
    ctx.font = `15px ${FONT}`;
    lanes.forEach((l, i) => {
      const x = X(l.xTop);
      if (rotate) {
        ctx.save();
        ctx.translate(x + 4, top - 6);
        ctx.rotate(-Math.PI / 4);
        ctx.textAlign = 'left';
        ctx.fillText(names[i], 0, 0);
        ctx.restore();
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(names[i], x, top - 10);
      }
    });
  }
  // Échelle de tailles, lue sur la piste du marqueur
  if (showScale) {
    ctx.fillStyle = '#111';
    ctx.strokeStyle = '#111';
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'right';
    const axis = sizeAxis(cal.points.map((p) => p.size), results.unit);
    for (const p of cal.points) {
      const y = Y(rawY(profiles, ladderLane, p.pos));
      if (y < top - 2 || y > top + ih + 2) continue;
      ctx.beginPath(); ctx.moveTo(left - 7, y); ctx.lineTo(left, y); ctx.stroke();
      ctx.fillText(axis.label(p.size), left - 10, y + 4);
    }
    ctx.font = `bold 13px ${FONT}`;
    ctx.fillText(axis.unit, left - 10, Math.max(14, top - 10));
  }
  // Repères à droite (bandes, annotations)
  ctx.font = `14px ${FONT}`;
  ctx.textAlign = 'left';
  for (const m of marks) {
    const y = Y(m.y);
    if (y >= top - 2 && y <= top + ih + 2) arrow(ctx, left + iw + 4, y, m.text);
  }
  return canvas;
}

export function canvasToBlob(canvas, type = 'image/png') {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible à produire.'))), type));
}

/** SVG → PNG (×2 pour un rendu net à l'écran et à l'impression). */
export async function svgToPng(svg, scale = 2) {
  const w = Number(/width="([\d.]+)"/.exec(svg)?.[1] ?? 800);
  const h = Number(/height="([\d.]+)"/.exec(svg)?.[1] ?? 400);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Graphique illisible.')); image.src = url; });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export { formatSize };
