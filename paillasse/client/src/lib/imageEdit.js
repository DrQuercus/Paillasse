// Retouches d'image, calculées dans le navigateur sur un <canvas>.
// Ordre fixe et documenté (enregistré avec l'image) :
//   1. niveaux de gris, inversion, luminosité, contraste (table de correspondance par canal)
//   2. orientation (quarts de tour et miroirs), puis redressement fin
//   3. recadrage
// Les formules sont écrites à la main plutôt que via ctx.filter pour donner
// exactement le même résultat dans tous les navigateurs (Safari compris).

export const IDENTITY = { a: 1, b: 0, c: 0, d: 1 };

export const DEFAULT_EDIT = {
  orientation: IDENTITY, // matrice 2×2 (quarts de tour et miroirs)
  straighten: 0,         // degrés, sens horaire
  crop: { x: 0, y: 0, w: 1, h: 1 }, // fraction du cadre après orientation
  brightness: 0,         // -100 … 100
  contrast: 0,           // -100 … 100
  invert: false,
  grayscale: false,
};

// Compose N ∘ M (M appliquée d'abord)
const compose = (n, m) => ({
  a: n.a * m.a + n.c * m.b,
  b: n.b * m.a + n.d * m.b,
  c: n.a * m.c + n.c * m.d,
  d: n.b * m.c + n.d * m.d,
});

const ROT_CW = { a: 0, b: 1, c: -1, d: 0 };
const ROT_CCW = { a: 0, b: -1, c: 1, d: 0 };
const FLIP_H = { a: -1, b: 0, c: 0, d: 1 };
const FLIP_V = { a: 1, b: 0, c: 0, d: -1 };

/** Quart de tour visible à l'écran ; le recadrage suit l'image. */
export function rotate(p, clockwise) {
  const { x, y, w, h } = p.crop;
  const crop = clockwise ? { x: 1 - (y + h), y: x, w: h, h: w } : { x: y, y: 1 - (x + w), w: h, h: w };
  return { ...p, orientation: compose(clockwise ? ROT_CW : ROT_CCW, p.orientation), crop };
}

/** Miroir visible à l'écran ; le redressement change de sens pour rester visuellement identique. */
export function flip(p, horizontal) {
  const { x, y, w, h } = p.crop;
  return {
    ...p,
    orientation: compose(horizontal ? FLIP_H : FLIP_V, p.orientation),
    straighten: -p.straighten,
    crop: horizontal ? { x: 1 - x - w, y, w, h } : { x, y: 1 - y - h, w, h },
  };
}

export const isToneEdited = (p) => p.brightness !== 0 || p.contrast !== 0 || p.invert || p.grayscale;

export function isEdited(p) {
  const o = p.orientation;
  const c = p.crop;
  return isToneEdited(p) || p.straighten !== 0 || o.a !== 1 || o.b !== 0 || o.c !== 0 || o.d !== 1
    || c.x > 0.0005 || c.y > 0.0005 || c.w < 0.9995 || c.h < 0.9995;
}

/** Dimensions du cadre complet après orientation et redressement. */
export function orientedSize(width, height, p) {
  const [w, h] = p.orientation.a === 0 ? [height, width] : [width, height];
  const t = (p.straighten * Math.PI) / 180;
  return {
    width: Math.abs(w * Math.cos(t)) + Math.abs(h * Math.sin(t)),
    height: Math.abs(w * Math.sin(t)) + Math.abs(h * Math.cos(t)),
  };
}

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Copie l'image source dans un canvas (réduit à maxDim pour l'aperçu) et applique les réglages de ton. */
export function toneCanvas(source, p, maxDim = Infinity) {
  const sw = source.naturalWidth ?? source.width;
  const sh = source.naturalHeight ?? source.height;
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const canvas = makeCanvas(sw * scale, sh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (!isToneEdited(p)) return canvas;

  const C = p.contrast * 2.55;
  const factor = (259 * (C + 255)) / (255 * (259 - C));
  const offset = p.brightness * 1.28;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v += 1) {
    const x = p.invert ? 255 - v : v;
    lut[v] = factor * (x - 128) + 128 + offset;
  }
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];
    if (p.grayscale) {
      r = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      g = r;
      b = r;
    }
    d[i] = lut[r];
    d[i + 1] = lut[g];
    d[i + 2] = lut[b];
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Oriente et redresse un canvas ; les coins découverts par le redressement sont blancs. */
export function orientCanvas(toned, p) {
  const { width, height } = orientedSize(toned.width, toned.height, p);
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((p.straighten * Math.PI) / 180);
  const o = p.orientation;
  ctx.transform(o.a, o.b, o.c, o.d, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(toned, -toned.width / 2, -toned.height / 2);
  return canvas;
}

/** Image finale en pleine résolution. */
export function renderFinal(source, p) {
  const full = orientCanvas(toneCanvas(source, p), p);
  const { x, y, w, h } = p.crop;
  const sx = Math.round(x * full.width);
  const sy = Math.round(y * full.height);
  const out = makeCanvas(Math.round(w * full.width), Math.round(h * full.height));
  out.getContext('2d').drawImage(full, sx, sy, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

export function canvasToBlob(canvas, type) {
  const mime = type === 'image/jpeg' || type === 'image/webp' ? type : 'image/png';
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Impossible d'encoder l'image."))), mime, 0.95);
  });
}

/** Résumé lisible des retouches, pour la liste des fichiers. */
export function describeEdit(p) {
  if (!p) return '';
  const parts = [];
  const o = p.orientation ?? IDENTITY;
  const det = o.a * o.d - o.b * o.c;
  // o = R si det = 1, o = R ∘ miroir horizontal si det = -1
  const r = det === 1 ? o : compose(o, FLIP_H);
  const angle = Math.round((Math.atan2(r.b, r.a) * 180) / Math.PI);
  if (angle) parts.push(`rotation ${angle > 0 ? angle : 360 + angle}°`);
  if (det === -1) parts.push('miroir');
  if (p.straighten) parts.push(`redressée de ${String(p.straighten).replace('.', ',')}°`);
  const c = p.crop;
  if (c && (c.x > 0.0005 || c.y > 0.0005 || c.w < 0.9995 || c.h < 0.9995)) parts.push('recadrée');
  if (p.grayscale) parts.push('niveaux de gris');
  if (p.invert) parts.push('inversée');
  if (p.brightness) parts.push(`luminosité ${p.brightness > 0 ? '+' : ''}${p.brightness}`);
  if (p.contrast) parts.push(`contraste ${p.contrast > 0 ? '+' : ''}${p.contrast}`);
  return parts.join(', ');
}
