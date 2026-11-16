// Régénère la bibliothèque de modèles installée par le serveur (server/src/lib/template-library.json)
// à partir de client/src/lib/templates/library.js. Les encarts de calcul y sont calculés d'avance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTemplateLibrary } from '../src/lib/templates/library.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const LIBRARY_FILE = path.resolve(here, '../../server/src/lib/template-library.json');

export const serialize = (library) => `${JSON.stringify(library)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const library = buildTemplateLibrary();
  fs.writeFileSync(LIBRARY_FILE, serialize(library));
  console.log(`${library.length} modèles écrits dans ${path.relative(process.cwd(), LIBRARY_FILE)}`);
}
