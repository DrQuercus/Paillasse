import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { sha256File } from './hash.js';

export const blobsDir = path.join(config.dataDir, 'blobs');
export const tmpDir = path.join(config.dataDir, 'tmp');

export function ensureDataDirs() {
  fs.mkdirSync(blobsDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
}

export function blobPath(sha) {
  return path.join(blobsDir, sha.slice(0, 2), sha);
}

/**
 * Range un fichier temporaire dans le stockage adressé par contenu.
 * Un fichier identique déjà présent n'est pas dupliqué.
 */
export async function storeBlob(tmpFile) {
  const sha = await sha256File(tmpFile);
  const dest = blobPath(sha);
  if (fs.existsSync(dest)) {
    await fs.promises.unlink(tmpFile);
  } else {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rename(tmpFile, dest);
    await fs.promises.chmod(dest, 0o440); // lecture seule
  }
  return sha;
}
