"""Fichiers TIFF de référence pour test/gel-tiff.test.js (petits, contenu connu par formule).

    pip install tifffile imagecodecs numpy
    python3 client/test/make-tiff-fixtures.py

Couvre ce que produisent les imageurs de gels : 8 et 16 bits, non compressé, LZW, Deflate,
PackBits, prédicteur horizontal, tuiles, bandes multiples, gros-boutiste, MinIsWhite, RVB, flottant.
"""
import os
import numpy as np
import tifffile

OUT = os.path.join(os.path.dirname(__file__), 'fixtures', 'tiff')
os.makedirs(OUT, exist_ok=True)
W, H = 37, 23
y, x = np.mgrid[0:H, 0:W]
u8 = ((x * 7 + y * 13) % 256).astype(np.uint8)
u16 = ((x * 997 + y * 131) % 65536).astype(np.uint16)
f32 = (x * 0.5 + y * 0.25).astype(np.float32)
rgb = np.stack([u8, (u8.astype(int) * 3 % 256).astype(np.uint8), (u8.astype(int) * 5 % 256).astype(np.uint8)], axis=-1)

def w(name, data, **kw):
    tifffile.imwrite(os.path.join(OUT, name), data, **kw)

w('u8-none.tif', u8, photometric='minisblack')
w('u8-lzw.tif', u8, photometric='minisblack', compression='lzw')
w('u8-packbits.tif', u8, photometric='minisblack', compression='packbits')
w('u8-deflate.tif', u8, photometric='minisblack', compression='zlib')
w('u8-strips.tif', u8, photometric='minisblack', compression='lzw', rowsperstrip=5)
w('u16-none-be.tif', u16, photometric='minisblack', byteorder='>')
w('u16-lzw-predictor.tif', u16, photometric='minisblack', compression='lzw', predictor=True)
w('u16-deflate-tiles.tif', u16, photometric='minisblack', compression='zlib', predictor=True, tile=(16, 16))
w('u16-miniswhite.tif', u16, photometric='miniswhite')
w('rgb-lzw.tif', rgb, photometric='rgb', compression='lzw')
w('f32-none.tif', f32, photometric='minisblack')
# Compression Deflate « ancienne » (code 32946) : mêmes données zlib, seul le code change
w('u8-deflate-32946.tif', u8, photometric='minisblack', compression='zlib')
with tifffile.TiffFile(os.path.join(OUT, 'u8-deflate-32946.tif'), mode='r+b') as t:
    t.pages[0].tags['Compression'].overwrite(32946)
print('Fixtures écrites dans', OUT)
