// Encart « graphique et statistiques » : graphique en PNG joint à l'entrée, résultats en texte,
// copie du jeu de données. C'est ce qui est scellé avec la version.
import { KINDS } from '../../lib/stats/model.js';
import { buildStatSummary } from '../../lib/stats/analysis.js';
import { svgToPng } from '../../lib/image.js';

const slug = (s) => String(s || 'graphique').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50).toLowerCase() || 'graphique';

/** Jeu de données sans les lignes vides du tableur (la copie scellée reste compacte). */
export function compactDataset(ds) {
  const filled = (r) => String(r.x ?? '').trim() || String(r.label ?? '').trim()
    || ds.columns.some((c) => (r.v?.[c.id] ?? []).some((s) => String(s ?? '').trim()));
  return { ...ds, rows: ds.rows.filter(filled) };
}

/** Rend le graphique, le joint à l'entrée (upload) et renvoie les attributs du nœud « statFigure ». */
export async function statNodeAttrs({ ds, res, plot, upload, width = 75 }) {
  const png = await svgToPng(plot.svg, 2);
  const file = new File([png.blob], `${slug(ds.title)}.png`, { type: 'image/png' });
  const att = await upload(file, { edit_params: { tool: 'stats' } });
  return {
    dataset: compactDataset(ds),
    images: [{ src: `/api/files/${att.id}`, width: plot.width, height: plot.height, alt: `${ds.title || 'Graphique'} (${KINDS[ds.kind].label})` }],
    summary: buildStatSummary(ds, res),
    width,
  };
}
