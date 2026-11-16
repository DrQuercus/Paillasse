// Markdown → document TipTap (JSON ProseMirror), pour écrire dans le cahier depuis une IA ou un script.
// Lit le Markdown courant (CommonMark + tableaux et cases à cocher GFM) : titres, paragraphes, gras, italique,
// barré, code, liens, images, listes (imbriquées, numérotées, à cocher), citations, blocs de code, traits,
// tableaux ; et le HTML en ligne que produit l'export de Paillasse (<u>, <mark>, <sub>, <sup>, <br>).
// Le résultat respecte le schéma de l'éditeur (premier enfant d'un élément de liste = paragraphe, tableaux
// rectangulaires, pas de texte vide…) : il s'ouvre tel quel dans Paillasse. checkDoc() le vérifie.

const FILE_URL = /^\/api\/files\/[0-9a-f-]{36}$/i;
const SAFE_LINK = /^(https?:|mailto:|\/(?!\/)|#)/i;
const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

// --- Lignes et blocs --------------------------------------------------------------------------------------

const isBlank = (line) => /^\s*$/.test(line);
const indentOf = (line) => /^ */.exec(line)[0].length;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*?)(?:[ \t]+#+)?[ \t]*$/;
const HR = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const FENCE = /^( {0,3})(`{3,}|~{3,})[ \t]*([^`]*?)[ \t]*$/;
const BULLET = /^( {0,3})([-+*])(?:([ \t]+)(.*)|$)/;
const ORDERED = /^( {0,3})(\d{1,9})([.)])(?:([ \t]+)(.*)|$)/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const TABLE_DELIM = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const COMMENT = /^\s*<!--.*-->\s*$/;

/** Cellules d'une ligne de tableau (barres échappées \| gardées dans la cellule). */
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '\\|'; i += 1; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

const startsBlock = (line) => ATX.test(line) || HR.test(line) || FENCE.test(line) || QUOTE.test(line)
  || BULLET.test(line) || ORDERED.test(line);

function listMarker(line) {
  const b = BULLET.exec(line);
  if (b) return { ordered: false, indent: b[1].length, marker: b[2], content: b[4] ?? '', width: b[1].length + 1 + Math.min((b[3] ?? ' ').length, 4) };
  const o = ORDERED.exec(line);
  if (o) return { ordered: true, indent: o[1].length, start: Number(o[2]), delim: o[3], content: o[5] ?? '', width: o[1].length + o[2].length + 1 + Math.min((o[4] ?? ' ').length, 4) };
  return null;
}

const dedent = (line, n) => {
  let k = 0;
  while (k < n && line[k] === ' ') k += 1;
  return line.slice(k);
};

// Au-delà, citations et listes imbriquées sont lues comme du texte (pas de récursion sans fin)
const MAX_DEPTH = 16;

/** Blocs d'une suite de lignes (récursif pour les citations et les listes). */
function parseBlocks(lines, ctx) {
  const out = [];
  const deep = (ctx.depth ?? 0) >= MAX_DEPTH;
  const inner = { ...ctx, depth: (ctx.depth ?? 0) + 1 };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line) || COMMENT.test(line)) { i += 1; continue; }

    const fence = FENCE.exec(line);
    if (fence) {
      const [, indent, marks, info] = fence;
      const body = [];
      i += 1;
      while (i < lines.length) {
        const close = new RegExp(`^ {0,3}${marks[0] === '`' ? '`' : '~'}{${marks.length},}[ \\t]*$`).exec(lines[i]);
        if (close) { i += 1; break; }
        body.push(dedent(lines[i], indent.length));
        i += 1;
      }
      const text = body.join('\n');
      const language = info.split(/\s+/)[0].replace(/[^\w+#.-]/g, '').slice(0, 40) || null;
      out.push({ type: 'codeBlock', attrs: { language }, ...(text ? { content: [{ type: 'text', text }] } : {}) });
      continue;
    }

    const atx = ATX.exec(line);
    if (atx) {
      out.push({ type: 'heading', attrs: { level: atx[1].length }, content: inline(atx[2].trim(), ctx) });
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      out.push({ type: 'horizontalRule' });
      i += 1;
      continue;
    }

    if (QUOTE.test(line) && !deep) {
      const quoted = [];
      while (i < lines.length && !isBlank(lines[i])) {
        const q = QUOTE.exec(lines[i]);
        // Continuation paresseuse : une ligne de texte sans « > » prolonge le paragraphe cité
        if (q) quoted.push(q[1]);
        else if (startsBlock(lines[i])) break;
        else quoted.push(lines[i]);
        i += 1;
      }
      const content = parseBlocks(quoted, inner);
      out.push({ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] });
      continue;
    }

    const first = deep ? null : listMarker(line);
    if (first) {
      const { node, next } = parseList(lines, i, first, inner);
      out.push(node);
      i = next;
      continue;
    }

    // Tableau : ligne d'en-tête avec des barres, puis ligne de séparation
    if (line.includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const head = splitRow(line);
      const delimCount = splitRow(lines[i + 1]).length;
      if (head.length === delimCount || head.length > 1) {
        const rows = [head];
        i += 2;
        while (i < lines.length && !isBlank(lines[i]) && lines[i].includes('|') && !startsBlock(lines[i])) {
          rows.push(splitRow(lines[i]));
          i += 1;
        }
        out.push(table(rows, ctx));
        continue;
      }
    }

    // Paragraphe (éventuellement titre souligné : === ou ---)
    const para = [line];
    i += 1;
    let setextLevel = 0;
    while (i < lines.length && !isBlank(lines[i])) {
      const st = SETEXT.exec(lines[i]);
      if (st) { setextLevel = st[1][0] === '=' ? 1 : 2; i += 1; break; }
      if ((deep ? FENCE.test(lines[i]) || ATX.test(lines[i]) || HR.test(lines[i]) : startsBlock(lines[i])) || COMMENT.test(lines[i])) break;
      if (lines[i].includes('|') && i + 1 < lines.length && TABLE_DELIM.test(lines[i + 1]) && lines[i + 1].includes('-')) break;
      para.push(lines[i]);
      i += 1;
    }
    const text = para.map((l, k) => (k ? l.replace(/^\s+/, '') : l.replace(/^ {0,3}/, ''))).join('\n');
    if (setextLevel) out.push({ type: 'heading', attrs: { level: setextLevel }, content: inline(text.replace(/\n/g, ' ').trim(), ctx) });
    else out.push(...paragraphs(text, ctx));
  }
  return out;
}

/** Une liste (et ses sous-listes) à partir de la ligne i. Renvoie { node, next }. */
function parseList(lines, start, first, ctx) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const m = listMarker(lines[i]);
    if (!m || m.ordered !== first.ordered || (!m.ordered && m.marker !== first.marker) || (m.ordered && m.delim !== first.delim)) break;
    if (m.indent > first.indent + 3) break;
    const body = [m.content];
    i += 1;
    let blank = false;
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) { blank = true; body.push(''); i += 1; continue; }
      const ind = indentOf(l);
      if (ind >= m.width) { body.push(dedent(l, m.width)); blank = false; i += 1; continue; }
      // Nouvel élément de la même liste, ou fin de la liste
      if (listMarker(l) && ind < m.width) break;
      // Continuation paresseuse d'un paragraphe (pas après une ligne vide)
      if (!blank && !startsBlock(l)) { body.push(l.trim()); i += 1; continue; }
      break;
    }
    while (body.length && body.at(-1) === '') body.pop();
    items.push(body);
    // Une ligne vide puis autre chose qu'un élément de liste : la liste s'arrête
    if (i < lines.length && !listMarker(lines[i])) break;
  }
  const parsed = items.map((body) => {
    const check = !first.ordered ? /^\[([ xX])\][ \t]+/.exec(body[0] ?? '') : null;
    if (check) body[0] = body[0].slice(check[0].length);
    let content = parseBlocks(body, ctx);
    if (!content.length || content[0].type !== 'paragraph') content = [{ type: 'paragraph' }, ...content];
    return { check, content };
  });
  const task = parsed.length > 0 && parsed.every((p) => p.check);
  if (task) {
    return {
      node: { type: 'taskList', content: parsed.map((p) => ({ type: 'taskItem', attrs: { checked: p.check[1] !== ' ' }, content: p.content })) },
      next: i,
    };
  }
  // Case à cocher dans une liste mixte : gardée en texte
  const keepBox = (para, box) => {
    const [head, ...rest] = para.content ?? [];
    const prefix = `[${box}] `;
    if (head?.type === 'text' && !head.marks) return { ...para, content: [{ type: 'text', text: prefix + head.text }, ...rest] };
    return { ...para, content: [{ type: 'text', text: prefix.trimEnd() }, ...(head ? [head] : []), ...rest] };
  };
  const listItems = parsed.map((p) => ({
    type: 'listItem',
    content: p.check ? [keepBox(p.content[0], p.check[1]), ...p.content.slice(1)] : p.content,
  }));
  return {
    node: first.ordered
      ? { type: 'orderedList', attrs: { start: first.start }, content: listItems }
      : { type: 'bulletList', content: listItems },
    next: i,
  };
}

function table(rows, ctx) {
  const width = Math.max(...rows.map((r) => r.length));
  const cell = (text, header) => {
    const content = inlineNodes(text.replace(/<br\s*\/?>/gi, '\n'), ctx, { cell: true });
    return {
      type: header ? 'tableHeader' : 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: [content.length ? { type: 'paragraph', content } : { type: 'paragraph' }],
    };
  };
  return {
    type: 'table',
    content: rows.map((r, k) => ({
      type: 'tableRow',
      content: Array.from({ length: width }, (_, j) => cell(r[j] ?? '', k === 0)),
    })),
  };
}

/** Paragraphe ; une image seule sur sa ligne devient un bloc image (l'éditeur range les images en blocs). */
function paragraphs(text, ctx) {
  const nodes = inlineNodes(text, ctx);
  const out = [];
  let cur = [];
  const flush = () => {
    // Bords d'une coupure autour d'une image : sauts de ligne et espaces retirés
    while (cur.length && (cur[0].type === 'hardBreak' || (cur[0].type === 'text' && !cur[0].text.trim()))) cur.shift();
    while (cur.length && (cur.at(-1).type === 'hardBreak' || (cur.at(-1).type === 'text' && !cur.at(-1).text.trim()))) cur.pop();
    if (cur[0]?.type === 'text') cur[0] = { ...cur[0], text: cur[0].text.replace(/^\s+/, '') };
    if (cur.at(-1)?.type === 'text') cur[cur.length - 1] = { ...cur.at(-1), text: cur.at(-1).text.replace(/\s+$/, '') };
    if (cur.length) out.push({ type: 'paragraph', content: cur });
    cur = [];
  };
  for (const n of nodes) {
    if (n.type === 'image') { flush(); out.push(n); } else cur.push(n);
  }
  flush();
  // Légende ajoutée par l'export de Paillasse sous une image (*texte de l'image*) : déjà dans l'image
  for (let k = out.length - 1; k > 0; k -= 1) {
    const prev = out[k - 1];
    const c = out[k].content;
    if (prev.type === 'image' && prev.attrs.alt && c?.length === 1 && c[0].text === prev.attrs.alt
      && c[0].marks?.length === 1 && c[0].marks[0].type === 'italic') out.splice(k, 1);
  }
  return out.length ? out : [{ type: 'paragraph' }];
}

// --- En ligne ---------------------------------------------------------------------------------------------
// Deux temps, comme CommonMark : découpage en jetons (texte, code, liens, délimiteurs * _ ~~), puis appariement
// des délimiteurs (gras, italique, barré) avec la pile de délimiteurs.

const HTML_MARKS = { u: 'underline', ins: 'underline', mark: 'highlight', sub: 'subscript', sup: 'superscript', b: 'bold', strong: 'bold', i: 'italic', em: 'italic', s: 'strike', del: 'strike' };
const isSpace = (c) => c === undefined || /\s/u.test(c);
const isPunct = (c) => c !== undefined && /[\p{P}\p{S}]/u.test(c);

const linkMark = (href) => ({ type: 'link', attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow', class: null } });

function sameMarks(a = [], b = []) {
  if (a.length !== b.length) return false;
  return a.every((m, k) => m.type === b[k].type && JSON.stringify(m.attrs ?? null) === JSON.stringify(b[k].attrs ?? null));
}

// Ordre fixe des marques (l'éditeur les range lui-même ; un ordre stable rend les documents comparables)
const MARK_ORDER = ['bold', 'italic', 'strike', 'code', 'underline', 'highlight', 'subscript', 'superscript', 'link'];
const withMark = (marks, mark) => (marks.some((m) => m.type === mark.type) ? marks
  : [...marks, mark].sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type)));

/** Cible d'un lien ou d'une image : (url "titre") ; renvoie { url, title, end } ou null. */
function linkTarget(src, open) {
  if (src[open] !== '(') return null;
  let k = open + 1;
  while (src[k] === ' ') k += 1;
  let url = '';
  if (src[k] === '<') {
    const close = src.indexOf('>', k);
    if (close < 0) return null;
    url = src.slice(k + 1, close);
    k = close + 1;
  } else {
    let depth = 0;
    while (k < src.length) {
      const c = src[k];
      if (c === '\\' && k + 1 < src.length && PUNCT.test(src[k + 1])) { url += src[k + 1]; k += 2; continue; }
      if (c === '(') depth += 1;
      if (c === ')') { if (depth === 0) break; depth -= 1; }
      if (/\s/.test(c) && depth === 0) break;
      url += c;
      k += 1;
    }
  }
  while (src[k] === ' ') k += 1;
  let title = null;
  if (src[k] === '"' || src[k] === "'") {
    const q = src[k];
    const close = src.indexOf(q, k + 1);
    if (close < 0) return null;
    title = src.slice(k + 1, close);
    k = close + 1;
    while (src[k] === ' ') k += 1;
  }
  if (src[k] !== ')') return null;
  let decoded = url;
  try { decoded = decodeURI(url); } catch { /* adresse laissée telle quelle */ }
  return { url: decoded, title, end: k + 1 };
}

/** Position du « ] » qui ferme le « [ » en from (crochets équilibrés, code ignoré), ou -1. */
function closingBracket(src, from) {
  let depth = 0;
  for (let k = from; k < src.length; k += 1) {
    if (src[k] === '\\') { k += 1; continue; }
    if (src[k] === '`') {
      const run = /^`+/.exec(src.slice(k))[0];
      const end = src.indexOf(run, k + run.length);
      if (end > 0) { k = end + run.length - 1; continue; }
    }
    if (src[k] === '[') depth += 1;
    else if (src[k] === ']') { depth -= 1; if (depth === 0) return k; }
  }
  return -1;
}

/** Jetons : { k: 'text' | 'code' | 'break' | 'image' | 'group' | 'delim', … }. */
function tokenize(src, st) {
  const tokens = [];
  let text = '';
  const flush = () => { if (text) { tokens.push({ k: 'text', text }); text = ''; } };
  // Liens et balises imbriqués : au-delà de 20 niveaux, le reste est du texte (pas de récursion sans fin)
  const deeper = { ...st, depth: (st.depth ?? 0) + 1 };
  const nested = (inner) => ((st.depth ?? 0) >= 20 ? [{ k: 'text', text: inner }] : emphasis(tokenize(inner, deeper)));
  const group = (mark, inner) => { flush(); tokens.push({ k: 'group', mark, children: nested(inner) }); };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const rest = src.slice(i);
    if (c === '\\') {
      if (src[i + 1] === '\n') { flush(); tokens.push({ k: 'break' }); i += 2; while (src[i] === ' ') i += 1; continue; }
      if (src[i + 1] && PUNCT.test(src[i + 1])) { text += src[i + 1]; i += 2; continue; }
    }
    if (c === '\n') {
      // Deux espaces en fin de ligne (ou une cellule de tableau) : retour à la ligne ; sinon une espace
      const hard = / {2,}$/.test(text) || st.cell;
      text = text.replace(/ +$/, '');
      if (hard) { flush(); tokens.push({ k: 'break' }); } else text += ' ';
      i += 1;
      while (src[i] === ' ') i += 1;
      continue;
    }
    if (c === '`') {
      const run = /^`+/.exec(rest)[0];
      let end = src.indexOf(run, i + run.length);
      while (end > 0 && src[end + run.length] === '`') end = src.indexOf(run, end + run.length + 1);
      if (end > 0) {
        flush();
        let code = src.slice(i + run.length, end).replace(/\n/g, ' ');
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        tokens.push({ k: 'code', text: code });
        i = end + run.length;
        continue;
      }
      text += run;
      i += run.length;
      continue;
    }
    if (c === '<') {
      const auto = /^<((?:https?|mailto):[^\s<>]+)>/i.exec(rest);
      if (auto) { flush(); tokens.push({ k: 'group', mark: linkMark(auto[1]), children: [{ k: 'text', text: auto[1].replace(/^mailto:/i, '') }] }); i += auto[0].length; continue; }
      const comment = /^<!--[\s\S]*?-->/.exec(rest);
      if (comment) { i += comment[0].length; continue; }
      const br = /^<br\s*\/?>/i.exec(rest);
      if (br) { flush(); tokens.push({ k: 'break' }); i += br[0].length; continue; }
      const tag = /^<([a-z]+)>/i.exec(rest);
      if (tag && HTML_MARKS[tag[1].toLowerCase()]) {
        const name = tag[1].toLowerCase();
        const close = src.toLowerCase().indexOf(`</${name}>`, i + tag[0].length);
        if (close > 0) {
          group({ type: HTML_MARKS[name] }, src.slice(i + tag[0].length, close));
          i = close + name.length + 3;
          continue;
        }
      }
    }
    if (c === '!' && src[i + 1] === '[') {
      const close = closingBracket(src, i + 1);
      const target = close > 0 ? linkTarget(src, close + 1) : null;
      if (target) {
        flush();
        const alt = src.slice(i + 2, close).replace(/\\(.)/g, '$1');
        if (st.ctx.images !== false && (FILE_URL.test(target.url) || /^https?:\/\//i.test(target.url))) {
          tokens.push({ k: 'image', attrs: { src: target.url, alt: alt || null, title: target.title } });
        } else if (alt) {
          tokens.push({ k: 'text', text: alt });
        }
        i = target.end;
        continue;
      }
    }
    if (c === '[') {
      const close = closingBracket(src, i);
      const target = close > 0 ? linkTarget(src, close + 1) : null;
      if (target) {
        const label = src.slice(i + 1, close);
        if (SAFE_LINK.test(target.url)) group(linkMark(target.url), label);
        else { flush(); tokens.push(...nested(label)); }
        i = target.end;
        continue;
      }
    }
    if (c === '*' || c === '_' || c === '~') {
      const run = /^(\*+|_+|~+)/.exec(rest)[0];
      if (c === '~' && run.length !== 2) { text += run; i += run.length; continue; }
      const before = src[i - 1];
      const after = src[i + run.length];
      const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before));
      const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after));
      const canOpen = c === '_' ? left && (!right || isPunct(before)) : left;
      const canClose = c === '_' ? right && (!left || isPunct(after)) : right;
      flush();
      tokens.push({ k: 'delim', ch: c, count: run.length, orig: run.length, canOpen, canClose });
      i += run.length;
      continue;
    }
    // Adresse nue : un lien, comme quand on la tape dans l'éditeur
    if ((c === 'h' || c === 'H') && (i === 0 || /[\s(]/.test(src[i - 1]))) {
      const bare = /^https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"]/i.exec(rest);
      if (bare) {
        flush();
        tokens.push({ k: 'group', mark: linkMark(bare[0]), children: [{ k: 'text', text: bare[0] }] });
        i += bare[0].length;
        continue;
      }
    }
    text += c;
    i += 1;
  }
  flush();
  return tokens;
}

/** Appariement des délimiteurs (algorithme « process emphasis » de CommonMark). */
function emphasis(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const closer = tokens[i];
    if (closer.k !== 'delim' || !closer.canClose || !closer.count) { i += 1; continue; }
    let found = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      const op = tokens[j];
      if (op.k !== 'delim' || op.ch !== closer.ch || !op.canOpen || !op.count) continue;
      if (closer.ch === '~') { if (op.count !== closer.count) continue; }
      else if ((op.canClose || closer.canOpen) && (op.orig + closer.orig) % 3 === 0 && !(op.orig % 3 === 0 && closer.orig % 3 === 0)) continue;
      found = j;
      break;
    }
    if (found < 0) { i += 1; continue; }
    const op = tokens[found];
    const use = closer.ch === '~' ? op.count : op.count >= 2 && closer.count >= 2 ? 2 : 1;
    const mark = closer.ch === '~' ? 'strike' : use === 2 ? 'bold' : 'italic';
    // Les délimiteurs restés seuls entre les deux redeviennent du texte
    const inner = tokens.slice(found + 1, i).map((t) => (t.k === 'delim' ? { k: 'text', text: t.ch.repeat(t.count) } : t));
    op.count -= use;
    closer.count -= use;
    const replacement = [...(op.count ? [op] : []), { k: 'group', mark: { type: mark }, children: inner }, ...(closer.count ? [closer] : [])];
    tokens.splice(found, i - found + 1, ...replacement);
    i = found + replacement.length - (closer.count ? 1 : 0);
  }
  return tokens;
}

/** Jetons → nœuds TipTap (texte marqué, retours à la ligne, images). */
function toNodes(tokens, marks, out) {
  const pushText = (text, m) => {
    if (!text) return;
    const clean = m.some((x) => x.type === 'code') ? m.filter((x) => x.type === 'code') : m;
    const last = out.at(-1);
    if (last?.type === 'text' && sameMarks(last.marks ?? [], clean)) last.text += text;
    else out.push(clean.length ? { type: 'text', text, marks: clean } : { type: 'text', text });
  };
  for (const t of tokens) {
    if (t.k === 'text') pushText(t.text, marks);
    else if (t.k === 'delim') pushText(t.ch.repeat(t.count), marks);
    else if (t.k === 'code') pushText(t.text, withMark(marks.filter((m) => m.type === 'link'), { type: 'code' }));
    else if (t.k === 'break') out.push({ type: 'hardBreak' });
    else if (t.k === 'image') out.push({ type: 'image', attrs: t.attrs });
    else if (t.k === 'group') toNodes(t.children, withMark(marks, t.mark), out);
  }
  return out;
}

/** Texte en ligne → nœuds TipTap. */
function inlineNodes(src, ctx, { cell = false } = {}) {
  return toNodes(emphasis(tokenize(src, { ctx, cell })), [], []);
}

/** Texte en ligne d'un titre (sans image en bloc). */
function inline(src, ctx) {
  return inlineNodes(src, ctx).filter((n) => n.type !== 'image');
}

// --- Entrées --------------------------------------------------------------------------------------------

/** Blocs TipTap d'un texte Markdown (propriétés YAML de tête ignorées). options.images : false pour les ignorer. */
export function markdownToBlocks(markdown, options = {}) {
  let text = String(markdown ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\u0000/g, '');
  // Propriétés YAML (export Paillasse, Obsidian) : ce ne sont pas du contenu
  const front = /^---\n[\s\S]*?\n---\n/.exec(text);
  if (front) text = text.slice(front[0].length);
  return parseBlocks(text.split('\n'), { images: options.images !== false });
}

export function markdownToDoc(markdown, options = {}) {
  const content = markdownToBlocks(markdown, options);
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}

// --- Vérification du schéma ----------------------------------------------------------------------------

const BLOCKS = new Set(['paragraph', 'heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule', 'image', 'table',
  'sequenceRef', 'labCalc', 'gelFigure', 'statFigure', 'sampleRef', 'templateSlot']);
const MARKS = new Set(['bold', 'italic', 'strike', 'code', 'link', 'underline', 'highlight', 'subscript', 'superscript']);

/** Vérifie qu'un document respecte le schéma de l'éditeur ; renvoie la liste des problèmes (vide si valide). */
export function checkDoc(doc) {
  const issues = [];
  const at = (path, msg) => issues.push(`${path} : ${msg}`);
  const inlineOk = (nodes = [], path) => nodes.forEach((n, k) => {
    const p = `${path}[${k}]`;
    if (n.type === 'hardBreak') return;
    if (n.type !== 'text') return at(p, `nœud en ligne inconnu ${n.type}`);
    if (typeof n.text !== 'string' || !n.text) at(p, 'texte vide');
    for (const m of n.marks ?? []) if (!MARKS.has(m.type)) at(p, `marque inconnue ${m.type}`);
    if ((n.marks ?? []).some((m) => m.type === 'code') && n.marks.length > 1) at(p, 'code avec d’autres marques');
    if (new Set((n.marks ?? []).map((m) => m.type)).size !== (n.marks ?? []).length) at(p, 'marque en double');
  });
  const blocks = (nodes, path, { allowEmpty = false } = {}) => {
    if (!Array.isArray(nodes) || (!nodes.length && !allowEmpty)) return at(path, 'contenu vide');
    nodes.forEach((n, k) => block(n, `${path}[${k}]`));
  };
  const items = (n, path, itemType) => {
    if (!n.content?.length) return at(path, 'liste vide');
    n.content.forEach((it, k) => {
      const p = `${path}[${k}]`;
      if (it.type !== itemType) return at(p, `${itemType} attendu, ${it.type} trouvé`);
      if (it.content?.[0]?.type !== 'paragraph') at(p, 'le premier enfant doit être un paragraphe');
      blocks(it.content, p);
    });
  };
  function block(n, path) {
    if (!BLOCKS.has(n?.type)) return at(path, `bloc inconnu ${n?.type}`);
    switch (n.type) {
      case 'paragraph': return inlineOk(n.content, path);
      case 'heading':
        if (!(n.attrs?.level >= 1 && n.attrs.level <= 6)) at(path, 'niveau de titre');
        return inlineOk(n.content, path);
      case 'bulletList': case 'orderedList': return items(n, path, 'listItem');
      case 'taskList': return items(n, path, 'taskItem');
      case 'blockquote': return blocks(n.content, path);
      case 'codeBlock':
        if ((n.content ?? []).some((c) => c.type !== 'text' || !c.text || c.marks?.length)) at(path, 'bloc de code : texte brut seulement');
        return null;
      case 'image':
        if (!n.attrs?.src) at(path, 'image sans adresse');
        return null;
      case 'table': {
        if (!n.content?.length) return at(path, 'tableau vide');
        const widths = n.content.map((r) => r.content?.length ?? 0);
        if (new Set(widths).size !== 1 || !widths[0]) at(path, 'tableau non rectangulaire');
        n.content.forEach((r, k) => {
          if (r.type !== 'tableRow') return at(`${path}[${k}]`, 'ligne de tableau attendue');
          (r.content ?? []).forEach((c, j) => {
            const p = `${path}[${k}][${j}]`;
            if (!['tableCell', 'tableHeader'].includes(c.type)) return at(p, 'cellule attendue');
            blocks(c.content, p);
          });
        });
        return null;
      }
      default: return null;
    }
  }
  if (doc?.type !== 'doc') at('doc', 'pas un document');
  else blocks(doc.content, 'doc');
  return issues;
}
