// Copie la version autonome d'Open Vector Editor dans public/vendor/ove,
// servie telle quelle dans le cadre (iframe) de l'éditeur de séquences.
// OVE embarque sa propre version de React : il ne doit pas passer par le bundle de Paillasse.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules/@teselagen/ove');
const dest = path.join(root, 'public/vendor/ove');
fs.mkdirSync(dest, { recursive: true });
for (const file of ['index.umd.js', 'ove.css']) fs.copyFileSync(path.join(src, file), path.join(dest, file));
const { version } = JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(dest, 'VERSION'), `${version}\n`);
console.log(`Open Vector Editor ${version} copié dans public/vendor/ove`);
