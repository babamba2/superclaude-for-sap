// sc4sap:program-to-spec — spec HTML → Markdown (the way back from the edit mode).
//
// Reads a page md-to-html.mjs wrote — typically one a reader changed in the
// edit mode and saved (spec-editor.mjs) — and returns its Markdown. It knows
// exactly the subset md-to-html emits: headings, paragraphs, lists, pipe
// tables, GitHub alerts, quotes, figures, ```mermaid, code blocks,
// <details> passthrough, <span class="tech">, the audience markers, bold /
// italic / strike / code / links, and the cover card. What the converter
// generated — cross-reference links and their tooltips, row anchors, the
// contents, section chips, the version row, the Revision History section
// (regenerated from history.json) and every toolbar or edit tool — is dropped.
//
// Two modes:
//   · source map (an editable page: <script id="spec-source"> holds the .md it
//     was built from and each top-level block's line range): a block the
//     reader did not touch (no data-edited) keeps its source lines byte for
//     byte; a touched block is converted. The .md diff is just the edits.
//   · plain (any other page): the whole document is converted.
//
// Images: a figure keeps its relative path in data-src, so an inlined data:
// URI maps back to it. A replaced image (img[data-replaced], a pasted
// screenshot) becomes a new file under the original's folder
// (`<name>-edited.<ext>`), returned in `assets` for the caller to write.
//
// Zero external deps.

import { renderInlinePlain } from './md-to-html.mjs';

// ── HTML parsing (well-formed page HTML: ours, or a browser's serialization of it) ──

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const CLOSES_P = new Set(['address', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', mdash: '—', ndash: '–',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', harr: '↔', times: '×', divide: '÷', copy: '©', reg: '®', trade: '™',
  bull: '•', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', ensp: ' ', emsp: ' ',
  thinsp: ' ', zwj: '‍', zwnj: '‌', deg: '°', plusmn: '±', sect: '§', para: '¶', euro: '€', yen: '¥',
  check: '✓', le: '≤', ge: '≥', ne: '≠', minus: '−', shy: '­',
};

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m;
    }
    return Object.prototype.hasOwnProperty.call(ENTITIES, e) ? ENTITIES[e] : m;
  });
}

const ATTR_RE = /\s*([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/y;

/** HTML → a tree of { type: 'el', tag, attrs, children, parent } / { type: 'text', text }. */
export function parseHtml(html) {
  const s = String(html);
  const root = { type: 'el', tag: '#root', attrs: {}, children: [], parent: null };
  let cur = root;
  let i = 0;
  const text = (t) => { if (t) cur.children.push({ type: 'text', text: decodeEntities(t), parent: cur }); };
  const close = (tag) => {
    for (let n = cur; n && n !== root; n = n.parent) {
      if (n.tag === tag) { n.closed = true; cur = n.parent; return; }
    }
  };
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { text(s.slice(i)); break; }
    if (lt > i) text(s.slice(i, lt));
    if (s.startsWith('<!--', lt)) {
      const end = s.indexOf('-->', lt + 4);
      i = end < 0 ? s.length : end + 3;
      continue;
    }
    if (s[lt + 1] === '!' || s[lt + 1] === '?') {
      const end = s.indexOf('>', lt);
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    const head = s.slice(lt, lt + 80);
    const endTag = /^<\/([A-Za-z][A-Za-z0-9-]*)\s*>/.exec(head);
    if (endTag) { close(endTag[1].toLowerCase()); i = lt + endTag[0].length; continue; }
    const open = /^<([A-Za-z][A-Za-z0-9-]*)/.exec(head);
    if (!open) { text('<'); i = lt + 1; continue; }
    const tag = open[1].toLowerCase();
    const attrs = {};
    let j = lt + open[0].length;
    for (;;) {
      ATTR_RE.lastIndex = j;
      const m = ATTR_RE.exec(s);
      if (!m || !m[1] || /^\s*\/?>/.test(s.slice(j, j + 3))) break;
      attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
      j = ATTR_RE.lastIndex;
    }
    const gt = s.indexOf('>', j);
    i = gt < 0 ? s.length : gt + 1;
    if (CLOSES_P.has(tag) && cur.tag === 'p') cur = cur.parent;
    if ((tag === 'li' && cur.tag === 'li') || ((tag === 'td' || tag === 'th') && (cur.tag === 'td' || cur.tag === 'th'))) cur = cur.parent;
    const node = { type: 'el', tag, raw: open[1], attrs, children: [], parent: cur };
    cur.children.push(node);
    if (VOID.has(tag)) continue;
    if (RAW.has(tag)) {
      const end = s.toLowerCase().indexOf(`</${tag}`, i);
      const body = s.slice(i, end < 0 ? s.length : end);
      node.children.push({ type: 'text', text: tag === 'script' || tag === 'style' ? body : decodeEntities(body), parent: node });
      const gt2 = end < 0 ? -1 : s.indexOf('>', end);
      i = gt2 < 0 ? s.length : gt2 + 1;
      continue;
    }
    cur = node;
  }
  return root;
}

const isEl = (n, tag) => n?.type === 'el' && (!tag || n.tag === tag);
const has = (n, a) => isEl(n) && Object.prototype.hasOwnProperty.call(n.attrs, a);
const classes = (n) => new Set(String(n.attrs?.class || '').split(/\s+/).filter(Boolean));
const hasClass = (n, c) => isEl(n) && classes(n).has(c);
const elements = (n) => n.children.filter((c) => c.type === 'el');
export function textOf(n) {
  if (n.type === 'text') return n.text;
  return n.children.map(textOf).join('');
}
export function findAll(n, pred, out = []) {
  for (const c of n.children || []) {
    if (c.type !== 'el') continue;
    if (pred(c)) out.push(c);
    findAll(c, pred, out);
  }
  return out;
}
const find = (n, pred) => findAll(n, pred)[0] || null;

// ── Inline ──────────────────────────────────────────────────────────────────

/** Generated or tool markup that never becomes Markdown. */
const UI_CLASSES = ['toolbar', 'tbl-tools', 'fold', 'copy', 'hash', 'ref-target', 'lightbox', 'chips', 'ed-rowtools', 'ed-addrow',
  'ed-litools', 'ed-imgbtn', 'ed-draft', 'ed-guide', 'fe-tools', 'flow-edit-btn', 'fe-label', 'fe-bar', 'ql-tooltip', 'ql-toolbar'];
const isUi = (n) => isEl(n) && (['button', 'script', 'style', 'nav', 'input', 'select', 'textarea', 'svg'].includes(n.tag)
  || UI_CLASSES.some((c) => hasClass(n, c)));
const RAW_INLINE = new Set(['sub', 'sup', 'kbd', 'mark', 'u', 'small', 'abbr', 'cite', 'q', 'var', 'samp', 'ins', 'span', 'a']);
/** Elements a page legitimately holds; anything else inline was text in the .md. */
const KNOWN = new Set(['li', 'ul', 'ol', 'td', 'th', 'tr', 'table', 'thead', 'tbody', 'figure', 'figcaption', 'dl', 'dt', 'dd',
  'section', 'header', 'main', 'body', 'html', 'head', 'font', 'label', 'center', 'details', 'summary', 'blockquote', 'pre']);
const ESCAPABLE = '\\\\`*_{}\\[\\]()#+\\-.!|~<>';
const TAG_AHEAD = /^<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/;

const attrHtml = (attrs) => Object.entries(attrs)
  .map(([k, v]) => (v === '' ? ` ${k}` : ` ${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`)).join('');

/** Text → Markdown text that renders back to the same characters. */
function escText(text, o) {
  let t = String(text);
  if (o.oneLine) t = t.replace(/\s*\n\s*/g, ' ');
  t = t.replace(new RegExp(`\\\\(?=[${ESCAPABLE}])`, 'g'), '\\\\');
  t = t.replace(/&(?=#?[0-9A-Za-z]+;)/g, '&amp;');
  t = t.replace(/</g, (m, at, all) => (TAG_AHEAD.test(all.slice(at)) ? '&lt;' : m));
  t = t.replace(/ /g, '&nbsp;');
  if (o.cell) t = t.replace(/\|/g, '\\|');
  // Emphasis, code and link characters stay as written unless they would turn into markup.
  if (/[*_`~[]/.test(t) && /<(em|strong|code|del|a|img)\b/.test(renderInlinePlain(t))) t = t.replace(/[*_`~[\]]/g, '\\$&');
  return t;
}

/** Leading / trailing blanks go outside the markers: `** x **` is not bold. */
function wrapMd(mark, inner) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return m[2] ? `${m[1]}${mark}${m[2]}${mark}${m[3]}` : inner;
}

function codeSpan(body, o) {
  let b = body.replace(new RegExp(`\\\\(?=[${ESCAPABLE}])`, 'g'), '\\\\');
  if (o.cell) b = b.replace(/\|/g, '\\|');
  if (o.oneLine) b = b.replace(/\s*\n\s*/g, ' ');
  const run = Math.max(0, ...(b.match(/`+/g) || []).map((x) => x.length));
  const fence = '`'.repeat(run + 1);
  const pad = /^`|`$/.test(b) ? ' ' : '';
  return `${fence}${pad}${b}${pad}${fence}`;
}

function imageMd(img, alt, o, figure = null) {
  const at = img?.attrs || {};
  let src = figure?.attrs['data-src'] ?? at['data-src'] ?? at.src ?? '';
  if (img && has(img, 'data-replaced') && /^data:/.test(at.src || '')) src = o.asset(at.src, src);
  const title = figure?.attrs['data-title'] ?? at.title;
  const text = String(alt ?? at.alt ?? '').replace(/\]/g, '\\]');
  return `![${text}](${src}${title ? ` "${title}"` : ''})`;
}

/** Inline nodes → Markdown. o: { oneLine, cell, heading, asset }. */
function inl(nodes, o) {
  let out = '';
  nodes.forEach((n, k) => {
    if (n.type === 'text') { out += escText(n.text, o); return; }
    if (n.type !== 'el' || isUi(n)) return;
    const t = n.tag;
    if (t === 'br') { out += o.heading ? ' ' : '<br>'; return; }
    if (t === 'strong' || t === 'b') { out += wrapMd('**', inl(n.children, o)); return; }
    if (t === 'em' || t === 'i') {
      // `a*b*c` is not emphasis to the renderer; keep the tag there.
      const next = nodes[k + 1];
      const inner = inl(n.children, o);
      const glued = /[\w*]$/.test(out) || (next?.type === 'text' && /^\w/.test(next.text));
      out += glued ? `<em>${inner}</em>` : wrapMd('*', inner);
      return;
    }
    if (t === 'del' || t === 's' || t === 'strike') { out += wrapMd('~~', inl(n.children, o)); return; }
    if (t === 'code') { out += codeSpan(textOf(n), o); return; }
    if (t === 'a' && (hasClass(n, 'xref') || hasClass(n, 'secref'))) { out += inl(n.children, o); return; }
    if (t === 'a' && has(n, 'href')) {
      const href = n.attrs.href;
      const title = n.attrs.title;
      if (!title && /^https?:\/\//i.test(href) && textOf(n) === href) out += `<${href}>`;
      else out += `[${inl(n.children, o)}](${href}${title ? ` "${title.replace(/"/g, '&quot;')}"` : ''})`;
      return;
    }
    if (t === 'span' && hasClass(n, 'tech')) { out += `<span class="tech">${inl(n.children, o)}</span>`; return; }
    if (t === 'span' && (has(n, 'data-f') || !Object.keys(n.attrs).length)) { out += inl(n.children, o); return; }
    if (t === 'img') { out += imageMd(n, null, o); return; }
    if (t === 'div' || t === 'p') { // a line a contenteditable field made
      if (out && !/<br>$/.test(out)) out += o.heading ? ' ' : '<br>';
      out += inl(n.children, o);
      return;
    }
    if (RAW_INLINE.has(t)) { out += `<${t}${attrHtml(n.attrs)}>${inl(n.children, o)}</${t}>`; return; }
    if (VOID.has(t)) { out += `<${t}${attrHtml(n.attrs)}>`; return; }
    if (KNOWN.has(t)) { out += inl(n.children, o); return; }
    // Text that only looked like a tag in the .md (`<FVBELN>`): written back as it was.
    out += `<${n.raw || t}${attrHtml(n.attrs)}>${inl(n.children, o)}${n.closed ? `</${n.raw || t}>` : ''}`;
  });
  return out;
}

// ── Blocks ──────────────────────────────────────────────────────────────────

const BLOCK = new Set(['p', 'div', 'ul', 'ol', 'table', 'pre', 'blockquote', 'figure', 'details', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5',
  'h6', 'dl', 'section', 'header']);
const indent = (text, pad) => text.split('\n').map((l) => (l ? pad + l : l)).join('\n');
const quote = (text) => text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');

/** A paragraph line that would start a block is escaped (`\#`, `\-`, `1\.`, `\>`). */
const paraLines = (md) => md.split('\n').map((l) => l
  .replace(/^(\s*)(#{1,6}(?=\s|$)|>|[-*+](?=\s)|`{3,}|~{3,})/, '$1\\$2')
  .replace(/^(\s*\d{1,9})([.)])(?=\s)/, '$1\\$2')).join('\n');

function fence(lang, body) {
  const run = Math.max(2, ...(body.match(/^\s*`{3,}/gm) || []).map((x) => x.trim().length));
  const f = '`'.repeat(run + 1);
  return `${f}${lang}\n${body}\n${f}`;
}

function heading(n, o) {
  const level = Number(n.tag[1]);
  return `${'#'.repeat(level)} ${inl(n.children, { ...o, oneLine: true, heading: true }).trim()}`;
}

function tableMd(t, o) {
  const rowsOf = (sec) => (sec ? elements(sec).filter((r) => r.tag === 'tr') : []);
  const cellsOf = (tr) => elements(tr).filter((c) => (c.tag === 'td' || c.tag === 'th') && !hasClass(c, 'ed-rowtools'));
  const thead = find(t, (n) => n.tag === 'thead');
  const tbody = elements(t).find((n) => n.tag === 'tbody');
  const headRow = rowsOf(thead)[0] || rowsOf(tbody)[0];
  if (!headRow) return '';
  const cell = (c) => inl(c.children, { ...o, oneLine: true, cell: true }).trim();
  const line = (cells) => `|${cells.map((c) => (c ? ` ${c} ` : ' ')).join('|')}|`;
  const head = cellsOf(headRow);
  const align = head.map((c) => (/text-align:\s*(left|right|center)/.exec(c.attrs.style || '') || [])[1] || '');
  // The source's own divider line when the column count still matches (smaller diff).
  const divider = o.divider && o.divider.split('|').filter((c) => c.trim()).length === head.length ? o.divider
    : `|${align.map((a) => (a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---')).join('|')}|`;
  const body = rowsOf(tbody).filter((r) => r !== headRow).map((r) => {
    const cells = cellsOf(r).map(cell);
    while (cells.length < head.length) cells.push('');
    return line(cells);
  });
  return [line(head.map(cell)), divider, ...body].join('\n');
}

function listMd(list, o) {
  const ordered = list.tag === 'ol';
  let n = ordered ? parseInt(list.attrs.start || '1', 10) || 1 : 0;
  const items = elements(list).filter((c) => c.tag === 'li').map((li) => {
    const marker = ordered ? `${n++}. ` : '- ';
    const lead = [];
    const rest = [];
    for (const c of li.children) {
      if (isUi(c)) continue;
      (rest.length || (isEl(c) && BLOCK.has(c.tag) && !has(c, 'data-f')) ? rest : lead).push(c);
    }
    const text = inl(lead, { ...o, oneLine: true }).trim();
    // Nested blocks sit under the item, indented by the marker's width, no blank line between.
    const nested = blocks(rest, o).join('\n');
    return `${marker}${text}${nested ? `\n${indent(nested, ' '.repeat(marker.length))}` : ''}`;
  });
  return items.join('\n');
}

function figureMd(fig, o) {
  const cap = elements(fig).find((c) => c.tag === 'figcaption');
  const img = find(fig, (n) => n.tag === 'img');
  const alt = cap ? inl(cap.children, { ...o, oneLine: true }).trim() : null;
  return imageMd(img, alt, o, fig);
}

function calloutMd(div, o) {
  const kind = [...classes(div)].map((c) => /^callout-(note|tip|important|warning|caution)$/.exec(c)).find(Boolean);
  const kids = elements(div);
  const title = kids.find((c) => hasClass(c, 'callout-title'));
  const inner = blocks(div.children.filter((c) => c !== title), o).join('\n\n');
  return quote(title && kind ? `[!${kind[1].toUpperCase()}]${inner ? `\n${inner}` : ''}` : inner);
}

/** The cover card's fact list: one `- **Label**: value` item per data-fi group, pairs joined with ` · `. */
function factItems(dl, o, only = null) {
  const groups = new Map();
  elements(dl).filter((d) => d.tag === 'div' && !has(d, 'data-gen') && !has(d, 'data-fm')).forEach((d, k) => {
    const key = has(d, 'data-fi') ? d.attrs['data-fi'] : `n${k}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });
  const out = new Map();
  for (const [key, divs] of groups) {
    if (only && !only(key, divs)) continue;
    out.set(key, `- ${divs.map((d) => {
      const dt = elements(d).find((c) => c.tag === 'dt');
      const dd = elements(d).find((c) => c.tag === 'dd');
      const one = { ...o, oneLine: true };
      return `**${dt ? inl(dt.children, one).trim() : ''}**: ${dd ? inl(dd.children, one).trim() : ''}`;
    }).join(' · ')}`);
  }
  return out;
}

/** Block nodes → Markdown blocks (strings, no blank line inside a block's edges). */
function blocks(nodes, o) {
  const out = [];
  for (const n of nodes) {
    if (n.type === 'text') {
      if (n.text.trim()) out.push(paraLines(escText(n.text.trim(), o)));
      continue;
    }
    if (n.type !== 'el' || isUi(n)) continue;
    const t = n.tag;
    if (/^h[1-6]$/.test(t)) { out.push(heading(n, o)); continue; }
    if (t === 'p') {
      if (hasClass(n, 'callout-title')) continue;
      const md = inl(n.children, o).trim();
      if (md) out.push(paraLines(md));
      continue;
    }
    if (t === 'figure') { out.push(figureMd(n, o)); continue; }
    if (t === 'table') { out.push(tableMd(n, o)); continue; }
    if (t === 'ul' || t === 'ol') { const md = listMd(n, o); if (md) out.push(md); continue; }
    if (t === 'blockquote') { out.push(quote(blocks(n.children, o).join('\n\n'))); continue; }
    if (t === 'hr') { out.push('---'); continue; }
    if (t === 'pre') {
      if (hasClass(n, 'mermaid')) { out.push(fence('mermaid', n.attrs['data-src'] ?? textOf(n))); continue; }
      const code = elements(n).find((c) => c.tag === 'code');
      const lang = (/(?:^|\s)language-(\S+)/.exec(code?.attrs.class || '') || [])[1] || '';
      out.push(fence(lang, code ? textOf(code) : textOf(n)));
      continue;
    }
    if (t === 'details') {
      if (hasClass(n, 'code')) { out.push(...blocks(elements(n).filter((c) => c.tag !== 'summary'), o)); continue; }
      // Raw <details> the writer put in the .md: its tags pass through, its content is Markdown.
      const attrs = { ...n.attrs };
      delete attrs.open;
      const summary = elements(n).find((c) => c.tag === 'summary');
      out.push(`<details${attrHtml(attrs)}>${summary ? `\n<summary>${inl(summary.children, { ...o, oneLine: true })}</summary>` : ''}`);
      out.push(...blocks(n.children.filter((c) => c !== summary), o));
      out.push('</details>');
      continue;
    }
    if (t === 'dl' && hasClass(n, 'facts')) { const items = [...factItems(n, o).values()]; if (items.length) out.push(items.join('\n')); continue; }
    if (t === 'section') {
      if (has(n, 'data-rev')) continue;
      out.push(...withAudience(n, o));
      continue;
    }
    if (t === 'div') {
      if (hasClass(n, 'table-wrap')) { const tb = elements(n).find((c) => c.tag === 'table'); if (tb) out.push(tableMd(tb, o)); continue; }
      if (hasClass(n, 'callout')) { out.push(calloutMd(n, o)); continue; }
      if (hasClass(n, 'sub')) { out.push(...withAudience(n, o)); continue; }
      out.push(...blocks(n.children, o));
      continue;
    }
    if (t === 'header' || t === 'main' || t === 'body' || t === 'html') { out.push(...blocks(n.children, o)); continue; }
    if (t === 'summary') { out.push(`<summary>${inl(n.children, { ...o, oneLine: true })}</summary>`); continue; }
    // An inline element at block level (a raw <a id> line, an image): its own paragraph.
    const md = inl([n], o).trim();
    if (md) out.push(md);
  }
  return out;
}

/** A section / sub-section: its heading, the audience directive the page turned into data-audience, the rest. */
function withAudience(n, o) {
  const aud = n.attrs['data-audience'];
  const h = aud ? n.children.findIndex((c) => isEl(c) && /^h[1-6]$/.test(c.tag)) : -1;
  if (!aud) return blocks(n.children, o);
  return [...blocks(n.children.slice(0, h + 1), o), `<!-- audience: ${aud} -->`, ...blocks(n.children.slice(h + 1), o)];
}

// ── Assets ──────────────────────────────────────────────────────────────────

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp' };

/** A pasted image's file next to the one it replaces: `_assets/x/flow.png` → `_assets/x/flow-edited.png`. */
function assetCollector(exists, mdStem) {
  const assets = [];
  const asset = (dataUri, orig) => {
    const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUri);
    if (!m) return orig;
    const ext = EXT[m[1].toLowerCase()] || 'png';
    const rel = /^(https?:|data:)/i.test(orig || '') || !orig ? `_assets/${mdStem}/image` : orig.replace(/\.[A-Za-z0-9]+$/, '');
    let path = `${rel}-edited.${ext}`;
    for (let k = 2; exists(path) || assets.some((a) => a.path === path); k++) path = `${rel}-edited-${k}.${ext}`;
    const data = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
    assets.push({ path, mime: m[1], bytes: data.length, data });
    return path;
  };
  return { assets, asset };
}

// ── Entry points ────────────────────────────────────────────────────────────

/** The source map an editable page embeds, or null. */
export function specSource(doc) {
  const el = find(doc, (n) => n.tag === 'script' && n.attrs.id === 'spec-source');
  if (!el) return null;
  try { return JSON.parse(textOf(el)); } catch { return null; }
}

/**
 * Spec page HTML → { md, changed, missing, assets, source }.
 *   changed: data-b keys of the blocks rewritten from the page ('facts' for the cover card)
 *   missing: blocks the source map names but the page no longer has (kept as they were)
 *   assets:  [{ path, mime, bytes, data }] replaced images to write next to the .md
 *   source:  the embedded source map (null for a plain page)
 * Options: plain — ignore the source map and convert everything;
 *          exists(relPath) — whether an asset path is taken; mdStem — folder name for images with no path.
 */
export function htmlToMd(html, { plain = false, exists = () => false, mdStem = 'spec' } = {}) {
  const doc = parseHtml(html);
  const S = specSource(doc);
  const main = find(doc, (n) => n.tag === 'main') || doc;
  const { assets, asset } = assetCollector(exists, mdStem);
  const o = { asset };
  if (plain || !S || typeof S.md !== 'string') {
    const fm = findAll(main, (n) => has(n, 'data-fm'))
      .map((d) => `${textOf(find(d, (c) => c.tag === 'dt') || d).trim()}: ${textOf(find(d, (c) => c.tag === 'dd') || d).trim()}`);
    const body = blocks(main.children, o).join('\n\n');
    return { md: `${fm.length ? `---\n${fm.join('\n')}\n---\n` : ''}${body}\n`, changed: 'all', missing: [], assets, source: S };
  }

  const nodes = new Map(findAll(main, (n) => has(n, 'data-b')).map((n) => [String(n.attrs['data-b']), n]));
  const lines = S.md.split('\n');
  const starts = new Map((S.blocks || []).map(([s, e], k) => [s, [String(k), e]]));
  const out = [];
  const changed = [];
  const missing = [];
  for (let j = 0; j < lines.length;) {
    if (S.facts && j === S.facts.start) {
      const dl = nodes.get('facts');
      if (dl && has(dl, 'data-edited')) {
        // Only the items holding an edited pair are rewritten.
        const fresh = factItems(dl, o, (key, divs) => divs.some((d) => has(d, 'data-edited')));
        (S.facts.items || []).forEach(([s, e], k) => {
          if (fresh.has(String(k))) out.push(fresh.get(String(k)));
          else out.push(...lines.slice(s, e));
        });
        changed.push('facts');
      } else {
        out.push(...lines.slice(S.facts.start, S.facts.end));
      }
      j = S.facts.end;
      continue;
    }
    const b = starts.get(j);
    if (!b) { out.push(lines[j]); j++; continue; }
    const [key, end] = b;
    const node = nodes.get(key);
    if (!node) {
      missing.push(key);
      out.push(...lines.slice(j, end));
    } else if (has(node, 'data-edited')) {
      const divider = lines.slice(j, end).find((l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l));
      const md = blocks([node], { ...o, divider: hasClass(node, 'table-wrap') ? divider : undefined }).join('\n\n');
      if (md) out.push(md);
      changed.push(key);
    } else {
      out.push(...lines.slice(j, end));
    }
    j = end;
  }
  return { md: out.join('\n'), changed, missing, assets, source: S };
}
