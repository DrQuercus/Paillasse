// Lecteur TIFF pour les images de gels (imageurs ChemiDoc, iBright, Amersham, Odyssey, scanners…).
//
// Repris de l'analyseur SDS-PAGE et corrigé : le LZW changeait de taille de code une étape trop tard
// (le TIFF impose le « changement anticipé »), ce qui brouillait l'image sans erreur. Ajouts : Deflate
// (codes 8 et 32946, via DecompressionStream), tuiles, prédicteur sur 8/16/32 bits, flottants,
// palette, MinIsWhite. Les valeurs sont renvoyées brutes (non normalisées) : la quantification et
// la détection de saturation travaillent sur les vraies intensités de l'imageur.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };
const COMPRESSION = { 1: 'aucune', 5: 'LZW', 7: 'JPEG', 8: 'Deflate', 32773: 'PackBits', 32946: 'Deflate' };

export class TiffError extends Error {}

function lzwDecode(input, expected) {
  const out = new Uint8Array(expected);
  const prefix = new Int32Array(4096);
  const suffix = new Uint8Array(4096);
  const first = new Uint8Array(4096);
  const length = new Uint16Array(4096);
  for (let i = 0; i < 256; i += 1) {
    prefix[i] = -1;
    suffix[i] = i;
    first[i] = i;
    length[i] = 1;
  }
  let codeLen = 9;
  let next = 258;
  let old = -1;
  let op = 0;
  let ip = 0;
  let buf = 0;
  let bits = 0;
  const write = (code) => {
    const len = length[code];
    let c = code;
    for (let k = len - 1; k >= 0; k -= 1) {
      if (op + k < out.length) out[op + k] = suffix[c];
      c = prefix[c];
    }
    op += len;
  };
  while (op < out.length) {
    while (bits < codeLen) {
      if (ip >= input.length) return out;
      buf = ((buf << 8) | input[ip++]) >>> 0;
      bits += 8;
    }
    bits -= codeLen;
    const code = (buf >>> bits) & ((1 << codeLen) - 1);
    if (code === 257) break;
    if (code === 256) {
      codeLen = 9;
      next = 258;
      old = -1;
      continue;
    }
    if (old === -1) {
      if (code > 255) break;
      write(code);
      old = code;
      continue;
    }
    if (code > next) break; // flux corrompu
    if (next < 4096) {
      prefix[next] = old;
      first[next] = first[old];
      length[next] = length[old] + 1;
      suffix[next] = code < next ? first[code] : first[old];
      next += 1;
    }
    write(code);
    old = code;
    // Changement anticipé : la largeur augmente dès que le prochain code atteint 2^n − 1
    if (next >= (1 << codeLen) - 1 && codeLen < 12) codeLen += 1;
  }
  return out;
}

function packBitsDecode(input, expected) {
  const out = new Uint8Array(expected);
  let ip = 0;
  let op = 0;
  while (ip < input.length && op < out.length) {
    const n = (input[ip++] << 24) >> 24; // octet signé
    if (n >= 0) {
      for (let i = 0; i <= n && op < out.length; i += 1) out[op++] = input[ip++];
    } else if (n !== -128) {
      const v = input[ip++];
      for (let i = 0; i < 1 - n && op < out.length; i += 1) out[op++] = v;
    }
  }
  return out;
}

async function inflate(input) {
  if (typeof DecompressionStream === 'undefined') throw new TiffError('Ce navigateur ne sait pas lire les TIFF compressés en Deflate.');
  const stream = new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lit la première image d'un fichier TIFF. Renvoie les intensités brutes (Float32Array, une valeur par pixel). */
export async function decodeTiff(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8) throw new TiffError('Fichier TIFF tronqué.');
  const order = dv.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) throw new TiffError("Ce n'est pas un fichier TIFF.");
  const le = order === 0x4949;
  const magic = dv.getUint16(2, le);
  if (magic === 43) throw new TiffError('BigTIFF non pris en charge : enregistrez l’image en TIFF classique.');
  if (magic !== 42) throw new TiffError("Ce n'est pas un fichier TIFF.");

  const ifd = dv.getUint32(4, le);
  const count = dv.getUint16(ifd, le);
  const tags = new Map();
  const readValue = (type, off) => {
    switch (type) {
      case 1: case 2: case 7: return dv.getUint8(off);
      case 3: return dv.getUint16(off, le);
      case 4: return dv.getUint32(off, le);
      case 6: return dv.getInt8(off);
      case 8: return dv.getInt16(off, le);
      case 9: return dv.getInt32(off, le);
      case 5: return dv.getUint32(off, le) / (dv.getUint32(off + 4, le) || 1);
      case 10: return dv.getInt32(off, le) / (dv.getInt32(off + 4, le) || 1);
      case 11: return dv.getFloat32(off, le);
      case 12: return dv.getFloat64(off, le);
      default: return 0;
    }
  };
  for (let i = 0; i < count; i += 1) {
    const e = ifd + 2 + i * 12;
    const tag = dv.getUint16(e, le);
    const type = dv.getUint16(e + 2, le);
    const n = dv.getUint32(e + 4, le);
    const size = TYPE_SIZE[type] ?? 1;
    const base = n * size <= 4 ? e + 8 : dv.getUint32(e + 8, le);
    if (base + n * size > bytes.length) continue; // étiquette hors du fichier : ignorée
    const values = [];
    for (let k = 0; k < n; k += 1) values.push(readValue(type, base + k * size));
    tags.set(tag, values);
  }
  const one = (tag, def) => tags.get(tag)?.[0] ?? def;
  const width = one(256, 0);
  const height = one(257, 0);
  if (!width || !height) throw new TiffError('Dimensions de l’image absentes.');
  const spp = one(277, 1);
  const bits = one(258, 8);
  const compression = one(259, 1);
  const photometric = one(262, 1);
  const planar = one(284, 1);
  const predictor = one(317, 1);
  const sampleFormat = one(339, 1);
  if (!COMPRESSION[compression] || compression === 7) {
    throw new TiffError(`Compression TIFF ${COMPRESSION[compression] ?? compression} non prise en charge : enregistrez l’image en TIFF non compressé ou LZW.`);
  }
  if (![8, 16, 32].includes(bits)) throw new TiffError(`Profondeur de ${bits} bits non prise en charge.`);
  if (planar !== 1 && spp > 1) throw new TiffError('TIFF à plans de couleur séparés non pris en charge.');
  if (predictor !== 1 && predictor !== 2) throw new TiffError('Prédicteur TIFF flottant non pris en charge.');

  const bps = bits / 8;
  const pixelBytes = bps * spp;
  const tiled = tags.has(322);
  const chunkW = tiled ? one(322) : width;
  const chunkH = tiled ? one(323) : Math.min(one(278, height), height);
  const offsets = tags.get(tiled ? 324 : 273) ?? [];
  const counts = tags.get(tiled ? 325 : 279) ?? [];
  const across = Math.ceil(width / chunkW);
  const palette = photometric === 3 ? tags.get(320) : null;

  const sample = (arr, off) => {
    if (bits === 8) return sampleFormat === 2 ? (arr[off] << 24) >> 24 : arr[off];
    const v = new DataView(arr.buffer, arr.byteOffset + off, bps);
    if (bits === 16) return sampleFormat === 2 ? v.getInt16(0, le) : v.getUint16(0, le);
    if (sampleFormat === 3) return v.getFloat32(0, le);
    return sampleFormat === 2 ? v.getInt32(0, le) : v.getUint32(0, le);
  };

  const data = new Float32Array(width * height);
  for (let c = 0; c < offsets.length; c += 1) {
    const cx = tiled ? (c % across) * chunkW : 0;
    const cy = tiled ? Math.floor(c / across) * chunkH : c * chunkH;
    if (cy >= height) break;
    const rows = tiled ? chunkH : Math.min(chunkH, height - cy);
    const rowBytes = chunkW * pixelBytes;
    const expected = rows * rowBytes;
    const raw = bytes.subarray(offsets[c], offsets[c] + (counts[c] ?? expected));
    let chunk;
    if (compression === 5) chunk = lzwDecode(raw, expected);
    else if (compression === 8 || compression === 32946) chunk = await inflate(raw);
    else if (compression === 32773) chunk = packBitsDecode(raw, expected);
    else chunk = raw.slice(0, expected);

    if (predictor === 2) {
      const v = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      for (let r = 0; r < rows; r += 1) {
        for (let i = spp; i < chunkW * spp; i += 1) {
          const cur = r * rowBytes + i * bps;
          const prev = cur - spp * bps;
          if (cur + bps > chunk.length) break;
          if (bps === 1) chunk[cur] = (chunk[cur] + chunk[prev]) & 0xff;
          else if (bps === 2) v.setUint16(cur, (v.getUint16(cur, le) + v.getUint16(prev, le)) & 0xffff, le);
          else v.setUint32(cur, (v.getUint32(cur, le) + v.getUint32(prev, le)) >>> 0, le);
        }
      }
    }

    for (let r = 0; r < rows; r += 1) {
      const y = cy + r;
      if (y >= height) break;
      for (let col = 0; col < chunkW; col += 1) {
        const x = cx + col;
        if (x >= width) break;
        const off = r * rowBytes + col * pixelBytes;
        if (off + pixelBytes > chunk.length) break;
        let value;
        if (palette) {
          const idx = sample(chunk, off);
          const n = palette.length / 3;
          value = (0.299 * palette[idx] + 0.587 * palette[n + idx] + 0.114 * palette[2 * n + idx]) / 257;
        } else if (spp >= 3 && photometric === 2) {
          value = 0.299 * sample(chunk, off) + 0.587 * sample(chunk, off + bps) + 0.114 * sample(chunk, off + 2 * bps);
        } else {
          value = sample(chunk, off);
        }
        data[y * width + x] = value;
      }
    }
  }

  let maxValue;
  if (sampleFormat === 3) {
    maxValue = 0;
    for (let i = 0; i < data.length; i += 1) if (data[i] > maxValue) maxValue = data[i];
  } else {
    maxValue = palette ? 255 : 2 ** bits - 1;
  }
  if (photometric === 0) for (let i = 0; i < data.length; i += 1) data[i] = maxValue - data[i];
  return {
    data, width, height,
    bits: palette ? 8 : bits,
    maxValue,
    float: sampleFormat === 3,
    format: `TIFF ${bits} bits${compression !== 1 ? `, ${COMPRESSION[compression]}` : ''}`,
    lossy: false,
    pages: 1,
  };
}
