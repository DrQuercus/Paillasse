// Figure de gel complète, en un seul fichier : titre, panneaux (gel, profils, étalonnage, gamme) à la même
// échelle et dans la même disposition que l'encart de l'entrée, tableau des bandes, notes.
// Fonction pure (aucun accès au navigateur) : le SVG produit se télécharge tel quel (modifiable dans
// Inkscape ou Illustrator) ou se convertit en PNG haute définition.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f1 = (x) => Math.round(x * 10) / 10;

/** Largeur estimée d'un texte (sans police chargée) ; le navigateur fournit une mesure exacte. */
export const estimateText = (text, size, bold = false) => String(text).length * size * (bold ? 0.6 : 0.55);

/** Découpe un texte en lignes d'au plus maxW (px). */
export function wrapText(text, size, maxW, measure = estimateText) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measure(next, size) > maxW) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Position de chaque panneau (px, à l'échelle de conception) : en colonne, côte à côte ou deux par ligne.
 * panels = [{ width, height }] ; renvoie { boxes: [{ x, y, width, height }], width, height }.
 */
export function layoutPanels(panels, layout = 'column', gap = 16) {
  const boxes = [];
  let width = 0;
  let y = 0;
  if (layout === 'row') {
    let x = 0;
    let h = 0;
    for (const p of panels) {
      boxes.push({ x, y: 0, width: p.width, height: p.height });
      x += p.width + gap;
      h = Math.max(h, p.height);
    }
    return { boxes, width: Math.max(0, x - gap), height: h };
  }
  const perRow = layout === 'grid' ? 2 : 1;
  for (let i = 0; i < panels.length; i += perRow) {
    const row = panels.slice(i, i + perRow);
    let x = 0;
    let h = 0;
    for (const p of row) {
      boxes.push({ x, y, width: p.width, height: p.height });
      x += p.width + gap;
      h = Math.max(h, p.height);
    }
    width = Math.max(width, x - gap);
    y += h + gap;
  }
  return { boxes, width, height: Math.max(0, y - gap) };
}

/**
 * SVG de la figure entière.
 * panels = [{ kind: 'svg', svg, width, height } | { kind: 'image', href, width, height }] (taille de conception)
 * table = { columns, rows } ou null ; notes = [texte] ; measure(text, size, bold) → px.
 * Renvoie { svg, width, height }.
 */
export function composeFigureSvg({
  title = '', subtitle = '', panels = [], layout = 'column', table = null, notes = [],
  font = 'Helvetica, Arial, sans-serif', fontSize = 14, measure = estimateText,
}) {
  const M = 24;
  const gap = 16;
  const size = Math.max(9, Math.min(28, Number(fontSize) || 14));
  const small = f1(size * 0.86);
  const titleSize = f1(size * 1.3);
  const grid = layoutPanels(panels, layout, gap);

  // Tableau : largeur de chaque colonne d'après son texte le plus long
  let tableW = 0;
  let colW = [];
  if (table?.columns?.length) {
    const cellPad = 14;
    colW = table.columns.map((c, j) => Math.max(
      measure(c, small, true),
      ...table.rows.map((r) => measure(r[j] ?? '', small)),
    ) + cellPad);
    tableW = colW.reduce((a, b) => a + b, 0);
  }
  const titleW = measure(title, titleSize, true) + (subtitle ? measure(`  —  ${subtitle}`, size) : 0);
  const W = Math.ceil(Math.max(grid.width, tableW, Math.min(titleW, 900), 360)) + 2 * M;
  const inner = W - 2 * M;

  let y = M;
  let body = '';
  // Titre (et sorte de gel)
  if (title || subtitle) {
    const lines = wrapText(title, titleSize, inner, (t, s) => measure(t, s, true));
    lines.forEach((line, i) => {
      y += titleSize * (i ? 1.25 : 1);
      body += `<text x="${M}" y="${f1(y)}" font-size="${titleSize}" font-weight="bold" fill="#111">${esc(line)}</text>`;
    });
    if (subtitle) {
      y += size * 1.45;
      body += `<text x="${M}" y="${f1(y)}" font-size="${size}" fill="#555">${esc(subtitle)}</text>`;
    }
    y += size * 0.9;
  }
  // Panneaux
  if (panels.length) {
    const y0 = y;
    panels.forEach((p, i) => {
      const b = grid.boxes[i];
      const x = M + b.x;
      const py = y0 + b.y;
      if (p.kind === 'svg') {
        // SVG du panneau imbriqué tel quel : il reste vectoriel
        body += String(p.svg).replace(/^\s*<svg\b/, `<svg x="${f1(x)}" y="${f1(py)}"`);
      } else {
        body += `<image x="${f1(x)}" y="${f1(py)}" width="${f1(b.width)}" height="${f1(b.height)}" preserveAspectRatio="none" href="${esc(p.href)}" xlink:href="${esc(p.href)}"/>`;
      }
    });
    y = y0 + grid.height + gap;
  }
  // Tableau des bandes
  if (table?.columns?.length) {
    const rowH = small * 1.75;
    y += 4;
    let x = M;
    const top = y;
    table.columns.forEach((c, j) => {
      body += `<text x="${f1(x + 4)}" y="${f1(y + rowH * 0.68)}" font-size="${small}" font-weight="bold" fill="#111">${esc(c)}</text>`;
      x += colW[j];
    });
    y += rowH;
    body += `<line x1="${M}" x2="${f1(M + tableW)}" y1="${f1(y)}" y2="${f1(y)}" stroke="#222" stroke-width="1"/>`;
    for (const r of table.rows) {
      x = M;
      r.forEach((c, j) => {
        body += `<text x="${f1(x + 4)}" y="${f1(y + rowH * 0.68)}" font-size="${small}" fill="#222">${esc(c)}</text>`;
        x += colW[j] ?? 0;
      });
      y += rowH;
      body += `<line x1="${M}" x2="${f1(M + tableW)}" y1="${f1(y)}" y2="${f1(y)}" stroke="#DDE3EA" stroke-width="1"/>`;
    }
    body += `<line x1="${M}" x2="${f1(M + tableW)}" y1="${f1(top)}" y2="${f1(top)}" stroke="#222" stroke-width="1"/>`;
    y += gap * 0.75;
  }
  // Notes (méthode, étalonnage, avertissements)
  const noteSize = f1(size * 0.8);
  for (const n of notes) {
    for (const line of wrapText(n, noteSize, inner, measure)) {
      y += noteSize * 1.45;
      body += `<text x="${M}" y="${f1(y)}" font-size="${noteSize}" fill="#555">${esc(line)}</text>`;
    }
  }
  const H = Math.ceil(y + M);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${esc(font)}">`
    + `<rect width="${W}" height="${H}" fill="#ffffff"/>${body}</svg>`;
  return { svg, width: W, height: H };
}
