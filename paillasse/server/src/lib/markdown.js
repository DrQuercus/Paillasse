// Markdown d'un document TipTap (CommonMark + tableaux et cases à cocher GFM), lisible dans Obsidian, GitHub,
// un éditeur de texte. Les encarts (calcul, gel, graphique, tubes, séquence) deviennent du texte et des tableaux ;
// les marques sans équivalent Markdown (souligné, surligné, indice, exposant) restent en HTML en ligne.
import { calcSummary } from './calc.js';
import { gelImages, gelSummary } from './gel.js';
import { statImages, statSummary } from './stat.js';
import { sampleRefCount, sampleRefGrids, sampleRefList, sampleRefTitle } from './inventory.js';

const INLINE_HTML = {
  underline: ['<u>', '</u>'],
  highlight: ['<mark>', '</mark>'],
  subscript: ['<sub>', '</sub>'],
  superscript: ['<sup>', '</sup>'],
};

/** Échappe ce qui serait pris pour de la mise en forme. */
export function escapeMd(text) {
  return String(text ?? '')
    .replace(/[\\`*_[\]<>~|]/g, (c) => `\\${c}`)
    .replace(/&(?=#?\w+;)/g, '&amp;');
}

/** Début de ligne qui ferait un titre, une liste, une citation ou un trait. */
const escapeLineStart = (line) => line
  .replace(/^(\s*)(#{1,6}(?=\s|$)|[-+](?=\s)|>|=+\s*$)/, '$1\\$2')
  .replace(/^(\s*)-(?=(\s*-){2,}\s*$)/, '$1\\-')
  .replace(/^(\s*\d+)([.)])(?=\s)/, '$1\\$2');

const safeUrl = (url) => {
  const u = String(url ?? '').trim();
  return /^(https?:|mailto:|\/|\.\.?\/|files\/|fichiers\/|#)/i.test(u) ? u : '#';
};
// Espaces et parenthèses encodés : le lien reste d'un seul tenant
const mdUrl = (url) => encodeURI(decodeSafe(url)).replace(/[()]/g, (c) => (c === '(' ? '%28' : '%29'));
function decodeSafe(url) {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/** Texte en ligne, marques comprises. Les espaces de bord restent hors des délimiteurs (sinon rien ne s'applique). */
function inline(nodes = [], opts, { cell = false } = {}) {
  let out = '';
  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      out += cell ? '<br>' : '\\\n';
      continue;
    }
    if (node.type === 'image') {
      out += image(node.attrs ?? {}, opts);
      continue;
    }
    if (node.type !== 'text') {
      out += inline(node.content, opts, { cell });
      continue;
    }
    const marks = node.marks ?? [];
    const code = marks.some((m) => m.type === 'code');
    const raw = String(node.text ?? '');
    const [, lead, body, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
    if (!body) {
      out += raw;
      continue;
    }
    let text;
    if (code) {
      const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((r) => r.length));
      const fence = '`'.repeat(longest + 1);
      const pad = body.startsWith('`') || body.endsWith('`') ? ' ' : '';
      text = `${fence}${pad}${body}${pad}${fence}`;
    } else {
      text = escapeMd(body);
    }
    for (const mark of marks) {
      if (mark.type === 'bold') text = `**${text}**`;
      else if (mark.type === 'italic') text = `*${text}*`;
      else if (mark.type === 'strike') text = `~~${text}~~`;
      else if (INLINE_HTML[mark.type]) text = INLINE_HTML[mark.type][0] + text + INLINE_HTML[mark.type][1];
    }
    const link = marks.find((m) => m.type === 'link');
    if (link) text = `[${text}](${mdUrl(opts.rewriteUrl(safeUrl(link.attrs?.href)))})`;
    out += lead + text + trail;
  }
  if (cell) return out.replace(/\n/g, ' ').replace(/(?<!\\)\|/g, '\\|');
  return out.split('\n').map(escapeLineStart).join('\n');
}

function image(a, opts) {
  return `![${escapeMd(a.alt ?? '')}](${mdUrl(opts.rewriteUrl(safeUrl(a.src)))})`;
}

/** Tableau GFM. La première ligne sert d'en-tête (GFM en exige un) ; les cellules fusionnées sont dépliées. */
function gfmTable(rows) {
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length), 1);
  const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  return [line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}
const textCell = (v) => escapeMd(String(v ?? '')).replace(/\n/g, ' ');

function docTable(node, opts) {
  const rows = (node.content ?? []).map((row) => {
    const cells = [];
    for (const cell of row.content ?? []) {
      const text = (cell.content ?? []).map((p) => inline(p.content, opts, { cell: true })).filter(Boolean).join('<br>');
      cells.push(text);
      for (let k = 1; k < (Number(cell.attrs?.colspan) || 1); k += 1) cells.push('');
    }
    return cells;
  });
  return gfmTable(rows);
}

const indent = (text, width) => text.split('\n').map((l, i) => (i && l ? ' '.repeat(width) + l : l)).join('\n');
const quote = (text) => text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');

function calc(raw) {
  const s = calcSummary(raw);
  const parts = [`**${escapeMd(s.title)}**${s.label ? ` — ${escapeMd(s.label)}` : ''}`];
  if (s.inputs.length) parts.push(s.inputs.map((i) => `- ${escapeMd(i.label)} : ${escapeMd(i.value)}`).join('\n'));
  if (s.table) parts.push(gfmTable([s.table.columns.map(textCell), ...s.table.rows.map((r) => r.map(textCell))]));
  if (s.results.length) parts.push(s.results.map((r) => `- ${escapeMd(r.label)} : ${r.main ? `**${escapeMd(r.value)}**` : escapeMd(r.value)}`).join('\n'));
  for (const n of s.notes) parts.push(`*${escapeMd(n)}*`);
  if (s.formula) parts.push(`\`${s.formula.replace(/`/g, "'")}\``);
  return parts.join('\n\n');
}

function gel(a, opts) {
  const s = gelSummary(a.summary);
  const parts = [`**${escapeMd(s.title)}**${s.mode ? ` — ${escapeMd(s.mode)}` : ''}`];
  if (s.lanes.length) parts.push(`Pistes : ${escapeMd(s.lanes.join(', '))}`);
  const images = gelImages(a.images).map((i) => image(i, opts));
  if (images.length) parts.push(images.join('\n'));
  if (s.table) parts.push(gfmTable([s.table.columns.map(textCell), ...s.table.rows.map((r) => r.map(textCell))]));
  for (const n of s.notes) parts.push(`*${escapeMd(n)}*`);
  return parts.join('\n\n');
}

function stat(a, opts) {
  const s = statSummary(a.summary);
  const parts = [`**${escapeMd(s.title)}**${s.kind ? ` — tableau ${escapeMd(s.kind)}` : ''}${s.analysis ? ` — ${escapeMd(s.analysis)}` : ''}`];
  const images = statImages(a.images).map((i) => image(i, opts));
  if (images.length) parts.push(images.join('\n'));
  if (s.method) parts.push(`*${escapeMd(s.method)}*`);
  for (const sec of s.sections) {
    if (sec.title) parts.push(`**${escapeMd(sec.title)}**`);
    parts.push(sec.table
      ? gfmTable([sec.table.columns.map(textCell), ...sec.table.rows.map((r) => r.map(textCell))])
      : sec.rows.map(([k, v]) => `- ${escapeMd(k)} : ${escapeMd(v)}`).join('\n'));
  }
  for (const w of s.warnings) parts.push(`⚠ ${escapeMd(w)}`);
  return parts.filter(Boolean).join('\n\n');
}

function samples(a) {
  const list = sampleRefList(a);
  if (!list.length) return '';
  return `**${escapeMd(sampleRefTitle(a))}** — ${sampleRefCount(a)}\n\n${gfmTable([
    ['Code', sampleRefGrids(a) ? 'Grille' : 'Tube', 'Emplacement'],
    ...list.map((t) => [textCell(t.code), textCell(`${t.name}${t.aliquot ? ` (${t.aliquot})` : ''}`), textCell(t.location)]),
  ])}`;
}

/** Markdown d'un document. opts.rewriteUrl : où pointent les fichiers joints (/api/files/<id>). */
export function docToMarkdown(doc, options = {}) {
  const opts = { rewriteUrl: options.rewriteUrl ?? ((u) => u) };

  const listMarker = (type) => ({ bulletList: '-', taskList: '-', orderedList: '.' })[type];
  const blocks = (nodes = [], { inItem = false } = {}) => {
    const out = [];
    let previous = null;
    nodes.forEach((node, i) => {
      const text = block(node);
      if (!text) return;
      // Dans un élément de liste, une sous-liste suit son paragraphe sans ligne vide (liste compacte)
      const tight = inItem && i > 0 && /List$/.test(node.type) && nodes[i - 1].type === 'paragraph' && out.length;
      // Deux listes de même sorte à la suite seraient lues comme une seule : un commentaire invisible les sépare
      const split = previous && listMarker(previous) && listMarker(previous) === listMarker(node.type) ? '<!-- -->\n\n' : '';
      out.push(tight ? `\n${text}` : `${out.length ? '\n\n' : ''}${split}${text}`);
      previous = node.type;
    });
    return out.join('');
  };

  const listItems = (node, marker) => (node.content ?? []).map((item, k) => {
    const m = marker(item, k);
    const body = blocks(item.content, { inItem: true }) || '';
    return m + indent(body, Math.min(m.length, 4));
  }).join('\n');

  function block(node) {
    const a = node.attrs ?? {};
    switch (node.type) {
      case 'doc': return blocks(node.content);
      case 'paragraph': return inline(node.content, opts);
      case 'heading': {
        const level = Math.min(Math.max(Number(a.level) || 1, 1), 6);
        const text = inline(node.content, opts).replace(/\\\n/g, ' ');
        return text ? `${'#'.repeat(level)} ${text}` : '';
      }
      case 'bulletList': return listItems(node, () => '- ');
      case 'orderedList': {
        const start = Math.max(Number(a.start) || 1, 0);
        return listItems(node, (_, k) => `${start + k}. `);
      }
      case 'taskList': return listItems(node, (item) => `- [${item.attrs?.checked ? 'x' : ' '}] `);
      case 'blockquote': return quote(blocks(node.content));
      case 'codeBlock': {
        const code = (node.content ?? []).map((n) => n.text ?? '').join('');
        const longest = Math.max(2, ...(code.match(/`{3,}/g) ?? []).map((r) => r.length));
        const fence = '`'.repeat(longest + 1);
        return `${fence}${String(a.language ?? '').replace(/[^\w+-]/g, '')}\n${code}\n${fence}`;
      }
      case 'horizontalRule': return '---';
      case 'image': return image(a, opts) + (a.alt ? `\n*${escapeMd(a.alt)}*` : '');
      case 'sequenceRef':
        return `**Séquence ${escapeMd(a.code)}** « ${escapeMd(a.name)} », version ${Number(a.version)} (${Number(a.length).toLocaleString('fr-FR')} pb, ${a.circular ? 'circulaire' : 'linéaire'})`;
      case 'labCalc': return quote(calc(a.summary));
      case 'gelFigure': return quote(gel(a, opts));
      case 'statFigure': return quote(stat(a, opts));
      case 'sampleRef': return samples(a) && quote(samples(a));
      case 'templateSlot': return ''; // emplacement de modèle resté vide
      case 'table': return docTable(node, opts);
      default: return node.content ? blocks(node.content) : '';
    }
  }
  return block(doc).replace(/\n{3,}/g, '\n\n').trim();
}

const yaml = (v) => JSON.stringify(String(v ?? '')); // chaîne YAML sûre (guillemets, échappements JSON)
const formatDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const formatDateTime = (d) => new Date(d).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
const formatSize = (n) => (n < 1024 ? `${n} o` : n < 1048576 ? `${(n / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko` : `${(n / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const isoDate = (d) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toLocaleDateString('sv-SE'));

/**
 * Fichier Markdown complet d'une entrée (ou d'une de ses versions) : propriétés YAML (Obsidian les affiche),
 * titre, contenu, pièces jointes, puis l'état (version figée et empreinte, ou copie de travail).
 * fileLink(attachment) : lien vers le fichier (dans le zip, ou sur le serveur).
 */
export function entryToMarkdown({ entry, project, version, author, attachments = [], rewriteUrl, fileLink }) {
  const source = version ?? entry;
  const props = [
    ['titre', yaml(source.title)],
    ['date', isoDate(source.entry_date)],
    ['projet', yaml(project?.name ?? entry.project_name ?? '')],
    ['auteur', yaml(entry.created_by_name ?? '')],
    ['statut', entry.status === 'locked' ? 'verrouillée' : 'brouillon'],
    ...(version ? [
      ['version', version.version_number],
      ['figee_le', yaml(new Date(version.created_at).toISOString())],
      ['empreinte_sha256', version.hash],
    ] : [['version', yaml('copie de travail')]]),
    ['exportee_le', yaml(new Date().toISOString())],
    ['source', 'Paillasse'],
    ['tags', '[paillasse]'],
  ];
  const lines = [
    '---', ...props.map(([k, v]) => `${k}: ${v}`), '---', '',
    `# ${escapeMd(source.title)}`, '',
    `*${escapeMd(formatDate(isoDate(source.entry_date)))}${project?.name || entry.project_name ? ` — projet ${escapeMd(project?.name ?? entry.project_name)}` : ''}*`,
  ];
  if (entry.parent) lines.push('', `Addendum à « ${escapeMd(entry.parent.title)} » (${escapeMd(isoDate(entry.parent.entry_date))}).`);
  const body = docToMarkdown(source.content, { rewriteUrl });
  if (body) lines.push('', body);
  if (attachments.length) {
    lines.push('', '## Pièces jointes', '');
    for (const f of attachments) {
      const link = fileLink ? fileLink(f) : null;
      const name = escapeMd(f.filename);
      lines.push(`- ${link ? `[${name}](${mdUrl(link)})` : name} — ${formatSize(Number(f.size_bytes) || 0)}, SHA-256 \`${f.sha256}\``);
    }
  }
  lines.push('', '---', '');
  if (version) {
    lines.push(`Version ${version.version_number}${version.kind === 'lock' ? ' (verrouillage)' : ''}, figée le ${formatDateTime(version.created_at)}${author ? ` par ${escapeMd(author)}` : ''}.`);
    if (version.note) lines.push('', `Note : ${escapeMd(version.note)}`);
    lines.push('', `Empreinte SHA-256 : \`${version.hash}\``);
    if (version.prev_hash) lines.push('', `Version précédente : \`${version.prev_hash}\``);
  } else {
    lines.push('Copie de travail, non figée : enregistrez une version pour la sceller.');
  }
  return `${lines.join('\n')}\n`;
}

/** Nom de fichier sûr partout (Windows, macOS, Obsidian), accents gardés. */
export function safeFileName(name, fallback = 'sans-titre') {
  const clean = String(name ?? '').normalize('NFC')
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^\.+/, '').slice(0, 80).trim();
  return clean || fallback;
}
