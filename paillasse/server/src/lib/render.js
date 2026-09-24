// Rendu HTML autonome d'un document TipTap (export, impression, PDF via le navigateur)
import { calcSummary } from './calc.js';
import { gelImages, gelLayout, gelSummary, panelWidths } from './gel.js';

export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const safeUrl = (url) => {
  const u = String(url ?? '').trim();
  return /^(https?:|mailto:|\/|\.\.?\/|files\/|#)/i.test(u) ? u : '#';
};

const MARKS = {
  bold: ['<strong>', '</strong>'],
  italic: ['<em>', '</em>'],
  underline: ['<u>', '</u>'],
  strike: ['<s>', '</s>'],
  code: ['<code>', '</code>'],
  highlight: ['<mark>', '</mark>'],
  subscript: ['<sub>', '</sub>'],
  superscript: ['<sup>', '</sup>'],
};

function renderText(node, opts) {
  let html = escapeHtml(node.text);
  for (const mark of node.marks ?? []) {
    if (mark.type === 'link') {
      html = `<a href="${escapeHtml(opts.rewriteUrl(safeUrl(mark.attrs?.href)))}">${html}</a>`;
    } else if (MARKS[mark.type]) {
      html = MARKS[mark.type][0] + html + MARKS[mark.type][1];
    }
  }
  return html;
}

function cellAttrs(attrs = {}) {
  let a = '';
  if (attrs.colspan > 1) a += ` colspan="${Number(attrs.colspan)}"`;
  if (attrs.rowspan > 1) a += ` rowspan="${Number(attrs.rowspan)}"`;
  return a;
}

/** Encart de calcul : le résumé enregistré, tel qu'il a été vu au moment du calcul. */
function renderCalc(raw) {
  const s = calcSummary(raw);
  const pairs = (items, cls) => (items.length
    ? `<dl class="${cls}">${items.map((i) => `<div${i.main ? ' class="main"' : ''}><dt>${escapeHtml(i.label)}</dt><dd>${escapeHtml(i.value)}</dd></div>`).join('')}</dl>`
    : '');
  const table = s.table
    ? `<table class="calc-table"><thead><tr>${s.table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`
      + `<tbody>${s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '';
  return `<section class="calc"><p class="calc-head"><strong>${escapeHtml(s.title)}</strong>${s.label ? ` — ${escapeHtml(s.label)}` : ''}</p>`
    + `${pairs(s.inputs, 'calc-inputs')}${table}${pairs(s.results, 'calc-results')}`
    + `${s.notes.map((n) => `<p class="calc-note">${escapeHtml(n)}</p>`).join('')}`
    + `${s.formula ? `<p class="calc-formula">${escapeHtml(s.formula)}</p>` : ''}</section>`;
}

/** Figure de gel : images (pièces jointes) puis tableau des bandes et notes. */
function renderGel(attrs, rewriteUrl) {
  const s = gelSummary(attrs?.summary);
  const width = [25, 50, 75, 100].includes(Number(attrs?.width)) ? Number(attrs.width) : 100;
  const list = gelImages(attrs?.images);
  const widths = panelWidths(list.map((i) => i.width), gelLayout(attrs?.layout));
  const images = list
    .map((i, k) => `<img src="${escapeHtml(rewriteUrl(safeUrl(i.src)))}" alt="${escapeHtml(i.alt)}" data-panel="${escapeHtml(i.panel)}" style="width:${widths[k]}%">`).join('');
  const table = s.table
    ? `<table class="calc-table"><thead><tr>${s.table.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`
      + `<tbody>${s.table.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
    : '';
  return `<figure class="gelfig gelfig-${gelLayout(attrs?.layout)}"${width < 100 ? ` style="width:${width}%"` : ''}>`
    + `<figcaption><strong>${escapeHtml(s.title)}</strong>${s.mode ? ` — ${escapeHtml(s.mode)}` : ''}${s.lanes.length ? `<br>Pistes : ${escapeHtml(s.lanes.join(', '))}` : ''}</figcaption>`
    + `<div class="gelfig-panels">${images}</div>${table}`
    + `${s.notes.map((n) => `<p class="calc-note">${escapeHtml(n)}</p>`).join('')}</figure>`;
}

export function renderDoc(doc, options = {}) {
  // Attention : { rewriteUrl: undefined } passé explicitement ne doit pas écraser la valeur par défaut
  const opts = { rewriteUrl: options.rewriteUrl ?? ((u) => u) };
  const children = (node) => (node.content ?? []).map((n) => render(n)).join('');

  function render(node) {
    const a = node.attrs ?? {};
    switch (node.type) {
      case 'doc': return children(node);
      case 'text': return renderText(node, opts);
      case 'paragraph': return `<p>${children(node) || '<br>'}</p>`;
      case 'heading': {
        const level = Math.min(Math.max(Number(a.level) || 1, 1), 6);
        return `<h${level}>${children(node)}</h${level}>`;
      }
      case 'bulletList': return `<ul>${children(node)}</ul>`;
      case 'orderedList': return `<ol${a.start > 1 ? ` start="${Number(a.start)}"` : ''}>${children(node)}</ol>`;
      case 'listItem': return `<li>${children(node)}</li>`;
      case 'taskList': return `<ul class="tasks">${children(node)}</ul>`;
      case 'taskItem': return `<li class="task"><span class="box">${a.checked ? '☑' : '☐'}</span><div>${children(node)}</div></li>`;
      case 'blockquote': return `<blockquote>${children(node)}</blockquote>`;
      case 'codeBlock': return `<pre><code>${(node.content ?? []).map((n) => escapeHtml(n.text)).join('')}</code></pre>`;
      case 'horizontalRule': return '<hr>';
      case 'hardBreak': return '<br>';
      case 'image': {
        const size = [25, 50, 75].includes(Number(a.size)) ? ` style="width:${Number(a.size)}%"` : '';
        return `<figure><img${size} src="${escapeHtml(opts.rewriteUrl(safeUrl(a.src)))}" alt="${escapeHtml(a.alt)}">${a.alt ? `<figcaption>${escapeHtml(a.alt)}</figcaption>` : ''}</figure>`;
      }
      case 'sequenceRef':
        return `<p class="seqref">Séquence <strong>${escapeHtml(a.code)}</strong> « ${escapeHtml(a.name)} », version ${Number(a.version)} (${Number(a.length).toLocaleString('fr-FR')} pb, ${a.circular ? 'circulaire' : 'linéaire'})</p>`;
      case 'labCalc': return renderCalc(a.summary);
      case 'gelFigure': return renderGel(a, opts.rewriteUrl);
      case 'table': return `<table>${children(node)}</table>`;
      case 'tableRow': return `<tr>${children(node)}</tr>`;
      case 'tableHeader': return `<th${cellAttrs(a)}>${children(node)}</th>`;
      case 'tableCell': return `<td${cellAttrs(a)}>${children(node)}</td>`;
      default: return children(node);
    }
  }
  return render(doc);
}

const PRINT_CSS = `
  body { font: 15px/1.6 "IBM Plex Sans", "Segoe UI", system-ui, sans-serif; color: #1F2A44; max-width: 46rem; margin: 2rem auto; padding: 0 1.5rem; }
  header { border-bottom: 2px solid #1F2A44; margin-bottom: 1.5rem; padding-bottom: .75rem; }
  header h1 { margin: 0 0 .25rem; font-size: 1.6rem; line-height: 1.25; }
  header p { margin: 0; color: #55607A; font-size: .9rem; }
  h1, h2, h3 { line-height: 1.3; }
  img { max-width: 100%; height: auto; }
  figure { margin: 1rem 0; } figcaption { font-size: .85rem; color: #55607A; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .9rem; }
  th, td { border: 1px solid #B8C3D0; padding: .3rem .5rem; text-align: left; vertical-align: top; }
  th { background: #EEF2F6; }
  td p, th p { margin: 0; }
  pre { background: #EEF2F6; padding: .75rem; overflow-x: auto; font-size: .85rem; }
  code { font-family: "IBM Plex Mono", ui-monospace, monospace; }
  mark { background: #FFF1A8; }
  blockquote { border-left: 3px solid #B8C3D0; margin-left: 0; padding-left: 1rem; color: #55607A; }
  ul.tasks { list-style: none; padding-left: 0; } li.task { display: flex; gap: .5rem; } li.task p { margin: 0; }
  .seqref { border: 1px solid #B8C3D0; border-left: 4px solid #22704E; padding: .4rem .7rem; }
  .calc { border: 1px solid #B8C3D0; border-left: 4px solid #2449C7; padding: .5rem .8rem; margin: 1rem 0; break-inside: avoid; }
  .calc p { margin: 0; }
  .calc-head { margin-bottom: .3rem !important; }
  .calc dl { display: flex; flex-wrap: wrap; gap: .2rem 1.5rem; margin: .3rem 0; font-size: .9rem; }
  .calc dt { color: #55607A; font-size: .8rem; }
  .calc dd { margin: 0; }
  .calc-results .main dd { font-weight: 600; font-size: 1.05rem; }
  .calc .calc-table { margin: .4rem 0; }
  .calc-note, .calc-formula { font-size: .8rem; color: #55607A; }
  .calc-formula { font-family: "IBM Plex Mono", ui-monospace, monospace; }
  .gelfig { border: 1px solid #B8C3D0; border-left: 4px solid #8F5A06; padding: .5rem .8rem; margin: 1rem 0; }
  .gelfig figcaption { font-size: .9rem; margin-bottom: .4rem; }
  .gelfig-panels { display: flex; flex-direction: column; align-items: flex-start; gap: .6rem; }
  .gelfig-row .gelfig-panels, .gelfig-grid .gelfig-panels { flex-direction: row; flex-wrap: wrap; gap: .6rem 0; }
  .gelfig img { flex: none; max-width: 100%; height: auto; break-inside: avoid; }
  footer { margin-top: 2.5rem; border-top: 1px solid #B8C3D0; padding-top: .75rem; font-size: .8rem; color: #55607A; }
  footer code { word-break: break-all; }
  .noprint { position: fixed; top: 1rem; right: 1rem; font: inherit; padding: .4rem .9rem; border: 1px solid #1F2A44; background: #fff; cursor: pointer; }
  @media print { .noprint { display: none; } body { margin: 0; max-width: none; } a { color: inherit; } }
`;

const formatDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const formatDateTime = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/** Page HTML complète pour une entrée (ou l'une de ses versions). */
export function renderEntryPage({ entry, project, version, author, printButton = false, rewriteUrl }) {
  const source = version ?? entry;
  const lines = [];
  if (version) {
    lines.push(`Version ${version.version_number}${version.kind === 'lock' ? ' (verrouillage)' : ''}, figée le ${escapeHtml(formatDateTime(version.created_at))}${author ? ` par ${escapeHtml(author)}` : ''}.`);
    if (version.note) lines.push(`Note : ${escapeHtml(version.note)}`);
    lines.push(`Empreinte SHA-256 : <code>${escapeHtml(version.hash)}</code>`);
    if (version.prev_hash) lines.push(`Version précédente : <code>${escapeHtml(version.prev_hash)}</code>`);
  } else {
    lines.push('Copie de travail, non figée : enregistrez une version pour la sceller.');
  }
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(source.title)} — ${escapeHtml(source.entry_date)}</title>
<style>${PRINT_CSS}</style></head>
<body>
${printButton ? '<button class="noprint" onclick="window.print()">Imprimer ou enregistrer en PDF</button>' : ''}
<header>
  <h1>${escapeHtml(source.title)}</h1>
  <p>${escapeHtml(formatDate(source.entry_date))}${project ? ` — projet ${escapeHtml(project.name)}` : ''}</p>
</header>
<main>${renderDoc(source.content, { rewriteUrl })}</main>
<footer>${lines.map((l) => `<p>${l}</p>`).join('\n')}</footer>
</body></html>`;
}
