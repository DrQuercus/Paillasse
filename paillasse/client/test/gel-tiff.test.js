// Lecteur TIFF : chaque fichier de test (make-tiff-fixtures.py) contient un motif connu par formule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTiff } from '../src/lib/gel/tiff.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tiff');
const W = 37;
const H = 23;
const u8 = (x, y) => (x * 7 + y * 13) % 256;
const u16 = (x, y) => (x * 997 + y * 131) % 65536;

async function check(file, expected, { tolerance = 0, maxValue } = {}) {
  const img = await decodeTiff(fs.readFileSync(path.join(dir, file)));
  assert.equal(img.width, W, file);
  assert.equal(img.height, H, file);
  if (maxValue !== undefined) assert.equal(img.maxValue, maxValue, file);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const got = img.data[y * W + x];
      const exp = expected(x, y);
      if (Math.abs(got - exp) > tolerance) assert.fail(`${file} : pixel (${x}, ${y}) = ${got}, attendu ${exp}`);
    }
  }
  return img;
}

for (const file of ['u8-none.tif', 'u8-lzw.tif', 'u8-packbits.tif', 'u8-deflate.tif', 'u8-deflate-32946.tif', 'u8-strips.tif']) {
  test(`8 bits : ${file}`, () => check(file, u8, { maxValue: 255 }));
}

test('16 bits gros-boutiste, sans compression', () => check('u16-none-be.tif', u16, { maxValue: 65535 }));
test('16 bits LZW avec prédicteur horizontal (le LZW était illisible dans l’analyseur d’origine)', () => check('u16-lzw-predictor.tif', u16));
test('16 bits Deflate, prédicteur, tuiles de 16 × 16', () => check('u16-deflate-tiles.tif', u16));
test('MinIsWhite : valeurs remises dans le sens « plus clair = plus grand »', () => check('u16-miniswhite.tif', (x, y) => 65535 - u16(x, y)));

test('RVB : luminance', () => check('rgb-lzw.tif', (x, y) => {
  const v = u8(x, y);
  return 0.299 * v + 0.587 * ((v * 3) % 256) + 0.114 * ((v * 5) % 256);
}, { tolerance: 1e-3 }));

test('flottant 32 bits', async () => {
  const img = await check('f32-none.tif', (x, y) => x * 0.5 + y * 0.25, { tolerance: 1e-6 });
  assert.equal(img.float, true);
});

test('fichiers refusés avec un message clair', async () => {
  await assert.rejects(decodeTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /pas un fichier TIFF/);
  const bytes = fs.readFileSync(path.join(dir, 'u8-none.tif'));
  const jpeg = Buffer.from(bytes);
  // Remplace le code de compression par 7 (JPEG)
  const dv = new DataView(jpeg.buffer, jpeg.byteOffset, jpeg.byteLength);
  const ifd = dv.getUint32(4, true);
  for (let i = 0; i < dv.getUint16(ifd, true); i += 1) {
    const e = ifd + 2 + i * 12;
    if (dv.getUint16(e, true) === 259) dv.setUint16(e + 8, 7, true);
  }
  await assert.rejects(decodeTiff(jpeg), /JPEG non prise en charge/);
});
