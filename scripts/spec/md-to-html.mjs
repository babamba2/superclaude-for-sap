// sc4sap:program-to-spec / package-to-process — Markdown → HTML converter.
//
// The skills write Markdown as their source of truth. When the user also asks
// for HTML, this helper turns that same .md into ONE self-contained .html page
// built for reading in a browser rather than a copy of the Markdown:
//   - a sticky table of contents (h2/h3) and a cover block: the title, the
//     document's leading "**Label**: value" list as a fact card, and a chip
//     per section that holds tables, with its row count;
//   - every h2 is a <section>, foldable once the page's script runs;
//   - cross-references: each table's key column (the column of SAP names —
//     tables, parameters, BAPIs, routines) becomes a glossary, and the same
//     names anywhere else in the text link to that row with its description
//     as a tooltip; `§4` / `§4.2` link to the numbered heading;
//   - GitHub alerts (`> [!NOTE]`, `> [!WARNING]`, …) become callout boxes;
//   - `<span class="tech">…</span>` and an `<!-- audience: technical -->`
//     line under a heading mark technical detail, which the page's
//     "Functional" view hides (see skills/program-to-spec/html-markup.md);
//   - a paragraph holding only an image becomes a <figure> with its alt text
//     as the caption; long code blocks are folded;
//   - local images (PNG / SVG / JPG / GIF) are inlined as data: URIs, so the
//     file can be mailed without its _assets/ / _img/ folders;
//   - ```mermaid blocks become <pre class="mermaid"> drawn by the Mermaid
//     script from a CDN; offline, the block stays readable as its source;
//   - YAML frontmatter joins the fact card;
//   - raw HTML the writers already emit (<a id>, <details>, <summary>, <br>,
//     &nbsp;) passes through, and headings get GitHub-style ids so in-page
//     links keep working.
//
// Everything above except folding is plain HTML: the page is complete in a
// mail preview that runs no script. The script (md-to-html-assets.mjs) adds
// table sort / filter / TSV copy, folding, the current-section marker, image
// zoom, theme and audience switches, and print preparation.
//
// Scope is the Markdown subset these skills produce (headings, paragraphs,
// GFM tables, lists, blockquotes, fenced code, images, links, emphasis) —
// not a general CommonMark implementation.
//
// CLI
//   node md-to-html.mjs <in.md> [out.html]   (default: same path, .html)
//
// Zero external deps — node:fs / node:path / node:url only.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLE, SCRIPT, labelsFor } from './md-to-html-assets.mjs';
import { FLOW_EDITOR_STYLE, FLOW_EDITOR_SCRIPT, FLOW_PAGE_SCRIPT, flowEditorLabels } from './flow-editor.mjs';

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

const MIME = {
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

/** A code block longer than this is folded behind a summary line. */
const FOLD_CODE_LINES = 30;
/** A table with more rows than this scrolls inside its frame, header pinned. */
const TALL_TABLE_ROWS = 12;

/**
 * Words that look like SAP names but are everyday vocabulary in these
 * documents; a key column holding them (a function-code table's EXIT) must
 * not turn every "EXIT" in the prose into a link.
 */
const XREF_STOP = new Set([
  'SELECT', 'UPDATE', 'MODIFY', 'DELETE', 'INSERT', 'READ', 'RANGE', 'TRUE', 'FALSE',
  'NULL', 'SAP', 'ALV', 'BAPI', 'ABAP', 'ALL', 'AND', 'NOT', 'YES', 'EXIT', 'BACK',
  'SAVE', 'CANCEL', 'REFRESH', 'TODO', 'FORM', 'METHOD', 'CLASS', 'REPORT', 'INCLUDE',
  'PBO', 'PAI', 'DDIC', 'CDS', 'HTML', 'JSON', 'PDF', 'URL', 'API', 'KEY', 'USER',
  'DATE', 'TIME', 'TYPE', 'TABLE', 'FIELD', 'VALUE', 'TEXT', 'NAME', 'STATUS',
  // Severity, verdict and status words — the key column of review reports.
  'HIGH', 'MEDIUM', 'LOW', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO', 'WARN', 'WARNING',
  'ERROR', 'NOTE', 'TIP', 'OPEN', 'DONE', 'CLOSED', 'PASS', 'FAIL', 'FAILED', 'NONE',
  'TBD', 'NEW', 'OLD', 'YES', 'OK', 'NG', 'GOOD', 'BAD', 'SAME', 'MISSING', 'CHANGED',
  'ADDED', 'REMOVED', 'KEEP', 'DROP', 'MUST', 'SHOULD', 'COULD', 'LOCAL', 'GLOBAL',
  'DRAFT', 'FINAL', 'ACTIVE', 'INACTIVE', 'VALID', 'INVALID', 'PENDING', 'BLOCKED',
]);

const CALLOUTS = new Set(['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']);

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Escapes text but keeps what the writers put there on purpose: entities
// (&nbsp;, &amp;) and inline tags (<br>, <a id>, <sub>, <kbd>, <span>).
function escapeText(s) {
  return String(s)
    .replace(/&(?!#?[0-9A-Za-z]+;)/g, '&amp;')
    .replace(/<(?!\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>)/g, '&lt;');
}

const stripTags = (html) => String(html).replace(/<[^>]*>/g, '');
const decodeBasic = (s) => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

// GitHub's heading-id rule: lower-case, drop punctuation, spaces → '-'.
function slugify(text, used) {
  const base = String(text)
    .replace(/<[^>]*>/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
  const root = base || 'section';
  let slug = root;
  let n = 1;
  while (used.has(slug)) slug = `${root}-${n++}`;
  used.add(slug);
  return slug;
}

function inlineImage(src, baseDir) {
  if (/^(https?:|data:)/i.test(src)) return src;
  let path = src.split(/[?#]/)[0];
  try { path = decodeURIComponent(path); } catch { /* keep as written */ }
  const fp = isAbsolute(path) ? path : join(baseDir, path);
  const mime = MIME[extname(fp).toLowerCase()];
  if (!mime || !existsSync(fp)) return src;
  return `data:${mime};base64,${readFileSync(fp).toString('base64')}`;
}

/**
 * The flow drawn into a PNG, when render-md-images.mjs left its graph next to
 * it (`flow.graph.json`): { key, graph, opts } — the page can then edit it.
 */
function flowGraphFor(src, baseDir) {
  if (/^(https?:|data:)/i.test(src) || !/\.png$/i.test(src.split(/[?#]/)[0])) return null;
  let path = src.split(/[?#]/)[0];
  try { path = decodeURIComponent(path); } catch { /* keep as written */ }
  const fp = (isAbsolute(path) ? path : join(baseDir, path)).replace(/\.png$/i, '.graph.json');
  if (!existsSync(fp)) return null;
  try { return JSON.parse(readFileSync(fp, 'utf8')); } catch { return null; }
}

/** An image whose flow the reader can edit in the page (flow-editor.mjs FLOW_PAGE_SCRIPT). */
function flowFigure(img, data) {
  return `<figure class="flow-fig">${img}<script type="application/json" class="flow-graph">${JSON.stringify(data).replace(/</g, '\\u003c')}</script></figure>`;
}

// ── Cross-references ────────────────────────────────────────────────────────

/**
 * Whether a token reads as an SAP name rather than a word: an `_`, a digit,
 * or a Z/Y customer prefix; otherwise all caps and at least four letters
 * (VBAK, KONV), which the stop list keeps from matching everyday words.
 */
function isSapName(token) {
  if (token.length < 3 || XREF_STOP.has(token.toUpperCase())) return false;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(token)) return false;
  if (token.includes('_')) return /[A-Za-z]/.test(token);
  if (token !== token.toUpperCase()) return false;
  return /\d/.test(token) || /^[ZY]/.test(token) || token.length >= 4;
}

/**
 * The SAP names a key cell holds: `**VBAK / VBKD / VBPA**` → three, and
 * `VBFA (SAP standard)` → one. Each name must lead its part of the cell.
 */
function cellNames(raw) {
  const plain = String(raw).replace(/<[^>]*>/g, ' ').replace(/[`*]/g, '').trim();
  const names = [];
  for (const part of plain.split(/\s*(?:\/|\+|,|、|·|\s-\s)\s*/)) {
    const m = part.match(/^([A-Za-z][A-Za-z0-9_]*)(?=$|[\s(（:\-])/);
    if (m && isSapName(m[1]) && !names.includes(m[1])) names.push(m[1]);
  }
  return names;
}

/** A row's other cells as a one-line tooltip. */
function rowTip(cells, keyCol) {
  const text = cells
    .filter((_, k) => k !== keyCol)
    .map((c) => stripTags(c).replace(/\*\*|__|`/g, '').replace(/\\\|/g, '|').replace(/\s+/g, ' ').trim())
    // Row numbers and check marks say nothing on their own.
    .filter((c) => c && !/^[\d\s.,:✓✔✗×—–\-·()]*$/.test(c))
    .join(' · ');
  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

/**
 * Which column of a table names things: of the first two, the one with the
 * most rows holding an SAP name, provided most of its filled cells do.
 * -1 when neither qualifies.
 */
function keyColumn(rows) {
  let best = -1;
  let bestHits = 1;
  for (const col of [0, 1]) {
    const filled = rows.filter((r) => (r[col] ?? '').trim());
    const hits = filled.filter((r) => cellNames(r[col]).length).length;
    if (filled.length && hits / filled.length >= 0.6 && hits > bestHits) {
      best = col;
      bestHits = hits;
    }
  }
  return best;
}

/** Wraps rendered HTML for `name` in a link to its glossary row. */
function xref(html, name, ctx) {
  if (!ctx.glossary || ctx.noLink || ctx.selfIds?.has(name)) return html;
  const entry = ctx.glossary.get(name);
  if (!entry) return html;
  return `<a class="xref" href="#${entry.anchor}"${entry.tip ? ` title="${escapeHtml(entry.tip)}"` : ''}>${html}</a>`;
}

const PLACEHOLDER = /\u0000(\d+)\u0000/g;

/**
 * Links SAP names, code spans naming them, and `§n` section numbers in
 * escaped text. Tags pass untouched, and nothing is linked between a raw
 * `<a …>` and its `</a>` — a code span there stays a plain code span.
 */
function linkText(s, ctx, st) {
  let inLink = 0;
  return s.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) {
      if (/^<a[\s>]/i.test(part) && !/\/>$/.test(part)) inLink++;
      else if (/^<\/a>/i.test(part)) inLink = Math.max(0, inLink - 1);
      return part;
    }
    if (inLink) return part;
    return part
      .replace(PLACEHOLDER, (m, i) => {
        const name = st.codeNames.get(Number(i));
        if (name !== undefined) st.stash[Number(i)] = xref(st.stash[Number(i)], name, ctx);
        return m;
      })
      .replace(/§\s?(\d+(?:\.\d+)*)/g, (m, num) => {
        const id = ctx.sectionIds?.get(num);
        return id ? st.keep(`<a class="secref" href="#${id}">${m}</a>`) : m;
      })
      .replace(/(?<![A-Za-z0-9_-])([A-Za-z][A-Za-z0-9_]{2,})(?![A-Za-z0-9_])/g, (m, name) => {
        const linked = xref(m, name, ctx);
        return linked === m ? m : st.keep(linked);
      });
  }).join('');
}

// ── Inline ──────────────────────────────────────────────────────────────────

/**
 * Inline Markdown → HTML. Finished fragments are parked in a stash behind
 * `\0<n>\0` placeholders so later passes cannot touch them. One stash serves
 * a link label rendered inside the same text, so its placeholders resolve.
 */
function renderInline(text, ctx, shared) {
  const st = shared || { stash: [], codeNames: new Map() };
  st.keep ||= (html) => `\u0000${st.stash.push(html) - 1}\u0000`;
  const { keep } = st;
  // An attribute value: placeholders restored as their plain text.
  const attr = (value) => escapeHtml(decodeBasic(stripTags(
    String(value).replace(PLACEHOLDER, (_, i) => stripTags(st.stash[Number(i)] ?? '')))));
  let s = String(text).replace(/<!--[\s\S]*?-->/g, '');

  s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|~<>])/g, (_, c) => keep(escapeHtml(c)));
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _t, code) => {
    const body = code.trim();
    const mark = keep(`<code>${escapeHtml(body)}</code>`);
    st.codeNames.set(st.stash.length - 1, body);
    return mark;
  });
  s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (_, alt, src, title) => {
    const path = decodeBasic(stripTags(src.replace(PLACEHOLDER, (__, i) => st.stash[Number(i)])));
    const img = `<img src="${escapeHtml(inlineImage(path, ctx.baseDir))}" alt="${attr(alt)}"${title ? ` title="${attr(title)}"` : ''}>`;
    const flow = flowGraphFor(path, ctx.baseDir);
    if (flow && ctx.flags) ctx.flags.flowEditor = true;
    return keep(flow ? flowFigure(img, flow) : img);
  });
  s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"([^"]*)")?\s*\)/g, (_, label, href, title) =>
    keep(`<a href="${attr(href)}"${title ? ` title="${attr(title)}"` : ''}>${renderInline(label, { ...ctx, noLink: true }, st)}</a>`));
  s = s.replace(/<(https?:\/\/[^\s>]+)>/g, (_, url) => keep(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`));

  s = escapeText(s);
  if (ctx.glossary && !ctx.noLink) s = linkText(s, ctx, st);
  s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?![_\w])/g, '$1<em>$2</em>');
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
  s = s.replace(/ {2,}\n/g, '<br>\n');

  // Stashed fragments never hold placeholders of their own, but a label
  // rendered through the shared stash can: restore until none remain.
  for (let round = 0; round < 4 && /\u0000\d+\u0000/.test(s); round++) {
    s = s.replace(PLACEHOLDER, (_, i) => st.stash[Number(i)] ?? '');
  }
  return s;
}

// ── Blocks ──────────────────────────────────────────────────────────────────

const splitRow = (line) => {
  let row = line.trim();
  if (row.startsWith('|')) row = row.slice(1);
  if (row.endsWith('|') && !row.endsWith('\\|')) row = row.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < row.length; i++) {
    if (row[i] === '\\' && row[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (row[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += row[i];
  }
  cells.push(cur.trim());
  return cells;
};

const isTableDivider = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const listItemRe = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const HTML_BLOCK_RE = /^\s*<\/?(a|details|summary|div|p|table|thead|tbody|tr|td|th|br|hr|img|section|figure|figcaption|center|sup|sub|span)(\s[^>]*)?\/?>/i;
const IMAGE_ONLY_RE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
/** Markers renderBlocks leaves for the sectioning pass; never reach the page. */
const MARK = { technical: '\u0001audience:technical', functional: '\u0001audience:functional', facts: '\u0001facts' };

function renderTable(headRaw, alignRaw, rows, ctx) {
  const t = ctx.tableNo++;
  const align = splitRow(alignRaw).map((c) =>
    c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '');
  const head = splitRow(headRaw);

  // First pass: learn the key column and its names. Second pass: anchor them.
  if (!ctx.glossary) {
    const col = keyColumn(rows);
    ctx.tables[t] = { col, names: rows.map((r) => (col >= 0 ? cellNames(r[col] ?? '') : [])) };
    if (col >= 0) {
      rows.forEach((r, k) => {
        for (const name of ctx.tables[t].names[k]) {
          if (!ctx.found.has(name)) ctx.found.set(name, { anchor: `ref-${name}`, tip: rowTip(r, col), table: t, row: k });
        }
      });
    }
  }
  const info = ctx.glossary ? ctx.tables[t] : null;

  const style = (k) => (align[k] ? ` style="text-align:${align[k]}"` : '');
  const th = head.map((c, k) => `<th${style(k)}>${renderInline(c, { ...ctx, noLink: true })}</th>`).join('');
  const body = rows.map((r, k) => {
    const cells = head.map((_, col) => {
      let anchors = '';
      let cellCtx = ctx;
      if (info && col === info.col) {
        const own = info.names[k].filter((name) => {
          const entry = ctx.glossary.get(name);
          return entry && entry.table === t && entry.row === k;
        });
        anchors = own.map((name) => `<span class="ref-target" id="ref-${name}"></span>`).join('');
        if (own.length) cellCtx = { ...ctx, selfIds: new Set(own) };
      }
      return `<td${style(col)}>${anchors}${renderInline(r[col] ?? '', cellCtx)}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('\n');
  const tall = rows.length > TALL_TABLE_ROWS ? ' tall' : '';
  return `<div class="table-wrap${tall}"><table>\n<thead><tr>${th}</tr></thead>\n<tbody>${body}</tbody>\n</table></div>`;
}

function renderBlockList(lines, ctx) {
  const out = [];
  let i = 0;
  const para = [];
  const flushPara = () => {
    if (para.length === 1 && IMAGE_ONLY_RE.test(para[0])) {
      const alt = para[0].match(/!\[([^\]]*)\]/)[1];
      out.push(`<figure>${renderInline(para[0].trim(), ctx)}${alt ? `<figcaption>${renderInline(alt, { ...ctx, noLink: true })}</figcaption>` : ''}</figure>`);
    } else if (para.length) {
      out.push(`<p>${renderInline(para.join('\n'), ctx)}</p>`);
    }
    para.length = 0;
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { flushPara(); i++; continue; }

    // Comments are dropped; two of them are directives for the page.
    if (/^\s*<!--/.test(line)) {
      flushPara();
      const text = [];
      let rest = '';
      while (i < lines.length) {
        const end = lines[i].indexOf('-->');
        if (end >= 0) {
          text.push(lines[i].slice(0, end));
          rest = lines[i++].slice(end + 3);
          break;
        }
        text.push(lines[i++]);
      }
      const body = text.join('\n').replace(/^\s*<!--/, '').trim();
      const aud = body.match(/^audience:\s*(technical|functional)$/i);
      if (aud) out.push(MARK[aud[1].toLowerCase()]);
      else if (body === 'sc4sap:facts') out.push(MARK.facts);
      // Text after the comment on its closing line is ordinary content.
      if (rest.trim()) para.push(rest.trim());
      continue;
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)/);
    if (fence) {
      flushPara();
      const close = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
      const body = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++;
      const lang = fence[2].toLowerCase();
      const code = escapeHtml(body.join('\n'));
      if (lang === 'mermaid') { ctx.mermaid = true; out.push(`<pre class="mermaid">${code}</pre>`); continue; }
      const pre = `<pre><code${lang ? ` class="language-${lang}"` : ''}>${code}</code></pre>`;
      out.push(body.length > FOLD_CODE_LINES
        ? `<details class="code"><summary>${escapeHtml(ctx.labels.code.replace('{n}', body.length))}</summary>${pre}</details>`
        : pre);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      flushPara();
      const level = heading[1].length;
      const inner = renderInline(heading[2], { ...ctx, noLink: true });
      const text = decodeBasic(stripTags(inner)).trim();
      const id = slugify(heading[2], ctx.ids);
      if (level === 1 && !ctx.title) ctx.title = text;
      const num = text.match(/^(\d+(?:\.\d+)*)\.?\s/);
      if (num && !ctx.glossary && !ctx.found.sections.has(num[1])) ctx.found.sections.set(num[1], id);
      if (level === 2 || level === 3) ctx.headings.push({ level, id, text });
      const hash = level > 1 ? `<a class="hash" href="#${id}" aria-label="${escapeHtml(ctx.labels.link)}">#</a>` : '';
      out.push(`<h${level} id="${id}">${hash}${inner}</h${level}>`);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); out.push('<hr>'); i++; continue; }

    if (HTML_BLOCK_RE.test(line)) { flushPara(); out.push(line.trim()); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      flushPara();
      const headRaw = line;
      const alignRaw = lines[i + 1];
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      out.push(renderTable(headRaw, alignRaw, rows, ctx));
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushPara();
      const quoted = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(renderQuote(quoted, ctx));
      continue;
    }

    if (listItemRe.test(line)) {
      flushPara();
      const block = [];
      while (i < lines.length && (listItemRe.test(lines[i]) || (/^\s+\S/.test(lines[i]) && block.length))) block.push(lines[i++]);
      out.push(renderList(block, ctx));
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
  return out;
}

const renderBlocks = (lines, ctx) => renderBlockList(lines, ctx).filter((b) => !b.startsWith('\u0001')).join('\n');

/** A blockquote, or a callout when it opens with `[!NOTE]` / `[!WARNING]` / …. */
function renderQuote(quoted, ctx) {
  const alert = (quoted[0] ?? '').match(/^\s*\[!([A-Za-z]+)\]\s*(.*)$/);
  if (alert && CALLOUTS.has(alert[1].toUpperCase())) {
    const kind = alert[1].toUpperCase();
    const rest = alert[2] ? [alert[2], ...quoted.slice(1)] : quoted.slice(1);
    return `<div class="callout callout-${kind.toLowerCase()}"><p class="callout-title">${escapeHtml(ctx.labels.callout[kind])}</p>${renderBlocks(rest, ctx)}</div>`;
  }
  // A quote that opens with ⚠ is a warning the writer already meant as one.
  if (/^\s*⚠/.test(quoted[0] ?? '')) {
    return `<div class="callout callout-warning">${renderBlocks(quoted, ctx)}</div>`;
  }
  return `<blockquote>${renderBlocks(quoted, ctx)}</blockquote>`;
}

function renderList(block, ctx) {
  const first = block[0].match(listItemRe);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const items = [];
  for (const line of block) {
    const m = line.match(listItemRe);
    if (m && m[1].length <= indent) items.push({ text: [m[3]], children: [] });
    else if (items.length) items[items.length - 1].children.push(line);
  }
  const start = ordered ? parseInt(first[2], 10) : 1;
  const body = items.map((it) => {
    const nested = it.children.length ? renderBlocks(dedent(it.children), ctx) : '';
    return `<li>${renderInline(it.text.join('\n'), ctx)}${nested}</li>`;
  }).join('\n');
  return ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''}>${body}</ol>` : `<ul>${body}</ul>`;
}

function dedent(lines) {
  const widths = lines.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length);
  const cut = widths.length ? Math.min(...widths) : 0;
  return lines.map((l) => l.slice(Math.min(cut, l.match(/^\s*/)[0].length)));
}

// ── Page structure ──────────────────────────────────────────────────────────

/**
 * The document's fact list — the first list before any h2 whose every item
 * is `**Label**: value` (items may chain pairs with ` · `). Returns the pairs
 * and the line range, or null when the preamble has no such list.
 */
function findFacts(lines) {
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(`{3,}|~{3,})/.test(lines[i])) inFence = !inFence;
    if (inFence) continue;
    if (/^##\s/.test(lines[i])) return null;
    if (!/^[-*+]\s+/.test(lines[i])) continue;
    let end = i;
    const items = [];
    while (end < lines.length && (/^[-*+]\s+/.test(lines[end]) || (/^\s+\S/.test(lines[end]) && items.length))) {
      if (/^[-*+]\s+/.test(lines[end])) items.push(lines[end].replace(/^[-*+]\s+/, ''));
      else items[items.length - 1] += ` ${lines[end].trim()}`;
      end++;
    }
    const pairs = [];
    for (const item of items) {
      for (const piece of item.split(/\s+·\s+(?=\*\*[^*]+\*\*\s*[:：])/)) {
        const m = piece.match(/^\*\*([^*]+?)\*\*\s*[:：]\s*([\s\S]*)$/);
        if (!m) return null;
        pairs.push([m[1].trim(), m[2].trim()]);
      }
    }
    return pairs.length >= 2 ? { start: i, end, pairs } : null;
  }
  return null;
}

function factsCard(pairs, ctx) {
  if (!pairs.length) return '';
  const items = pairs.map(([k, v]) =>
    `<div><dt>${renderInline(k, { ...ctx, noLink: true })}</dt><dd>${renderInline(v, ctx)}</dd></div>`);
  return `<dl class="facts">${items.join('')}</dl>`;
}

function frontmatterPairs(yaml) {
  const rows = [];
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) rows.push([m[1], m[2]]);
    else if (rows.length && line.trim()) rows[rows.length - 1][1] += ` ${line.trim()}`;
  }
  // YAML quoting: a value wrapped in one matched pair of quotes loses them.
  return rows.map(([k, v]) => [k, v.replace(/^(["'])([\s\S]*)\1$/, '$2')]);
}

/**
 * Top-level blocks → a cover block and one <section> per h2. An h3
 * subsection is wrapped in a <div> only when an audience directive needs a
 * boundary; otherwise its blocks go into the section as they came, so raw
 * HTML a writer spreads across blocks (<details> … </details>) stays intact.
 * `audiences` maps every marked heading id (h2 or h3) to its audience.
 */
function sectionize(blocks, card) {
  const hero = [];
  const sections = [];
  const audiences = new Map();
  let sec = null;
  let sub = null;
  const closeSub = () => {
    if (sub && sec) {
      if (sub.audience) {
        audiences.set(sub.id, sub.audience);
        sec.parts.push(`<div class="sub" data-audience="${sub.audience}">\n${sub.parts.join('\n')}\n</div>`);
      } else {
        sec.parts.push(...sub.parts);
      }
    }
    sub = null;
  };
  const closeSec = () => {
    closeSub();
    if (sec) {
      if (sec.audience) audiences.set(sec.id, sec.audience);
      sections.push(sec);
    }
    sec = null;
  };
  for (const block of blocks) {
    if (block.startsWith('<h2')) {
      closeSec();
      sec = { id: block.match(/id="([^"]*)"/)[1], parts: [block], audience: null, heading: block };
      continue;
    }
    if (block.startsWith('<h3') && sec) {
      closeSub();
      sub = { id: block.match(/id="([^"]*)"/)[1], parts: [block], audience: null };
      continue;
    }
    if (block === MARK.technical || block === MARK.functional) {
      const target = sub || sec;
      if (target) target.audience = block === MARK.technical ? 'technical' : 'functional';
      continue;
    }
    if (block === MARK.facts) { hero.push(card); continue; }
    (sub ? sub.parts : sec ? sec.parts : hero).push(block);
  }
  closeSec();
  if (!hero.includes(card) && card) {
    const h1 = hero.findIndex((b) => b.startsWith('<h1'));
    hero.splice(h1 + 1, 0, card);
  }
  return { hero, sections, audiences };
}

function sectionRows(html) {
  const rows = (html.match(/<tr>/g) || []).length - (html.match(/<thead>/g) || []).length;
  return Math.max(0, rows);
}

function tocHtml(headings, audiences, labels) {
  if (headings.length < 2) return '';
  const items = [];
  let inTop = false; // an h2 <li> is open
  let inSub = false; // its nested <ol> is open
  for (const h of headings) {
    const aud = audiences.get(h.id);
    const li = `<li${aud ? ` data-audience="${aud}"` : ''}><a href="#${h.id}">${escapeHtml(h.text)}</a>`;
    if (h.level === 2) {
      if (inSub) items.push('</ol>');
      if (inTop) items.push('</li>');
      items.push(li);
      inTop = true;
      inSub = false;
    } else {
      // An h3 before any h2 still needs a list item to nest under.
      if (!inTop) { items.push('<li>'); inTop = true; }
      if (!inSub) { items.push('<ol>'); inSub = true; }
      items.push(`${li}</li>`);
    }
  }
  if (inSub) items.push('</ol>');
  if (inTop) items.push('</li>');
  return `<nav class="toc" aria-label="${escapeHtml(labels.contents)}"><details open><summary>${escapeHtml(labels.contents)}</summary><ol>${items.join('')}</ol></details></nav>`;
}

function chipsHtml(sections, labels) {
  const withRows = sections
    .map((s) => ({ s, n: sectionRows(s.parts.join('\n')) }))
    .filter((x) => x.n > 0);
  if (withRows.length < 2) return '';
  const chips = withRows.map(({ s, n }) => {
    const title = decodeBasic(stripTags(s.heading)).replace(/^#/, '').trim();
    return `<li><a href="#${s.id}">${escapeHtml(title)}<span class="n">${n} ${escapeHtml(labels.rows)}</span></a></li>`;
  });
  return `<ul class="chips">${chips.join('')}</ul>`;
}

export function mdToHtml(markdown, { baseDir = process.cwd(), title, lang } = {}) {
  let text = String(markdown).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  let pairs = [];
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    pairs = frontmatterPairs(fm[1]);
    text = text.slice(fm[0].length);
    const fmLang = fm[1].match(/^(?:lang|language):\s*["']?([A-Za-z-]+)/m);
    if (!lang && fmLang) lang = fmLang[1];
  }
  const labels = labelsFor(lang);

  let lines = text.split('\n');
  const facts = findFacts(lines);
  if (facts) {
    pairs = [...pairs, ...facts.pairs];
    lines = [...lines.slice(0, facts.start), '<!-- sc4sap:facts -->', ...lines.slice(facts.end)];
  }

  // Pass 1 learns the glossary and the section numbers; pass 2 renders with
  // them. Both walk the same lines in the same order, so table and heading
  // numbering agree.
  const found = new Map();
  found.sections = new Map();
  const base = { baseDir, labels, mermaid: false, flags: {} };
  const first = { ...base, title: '', ids: new Set(), tables: [], tableNo: 0, found, headings: [] };
  renderBlockList(lines, first);
  const ctx = {
    ...base, title: title || '', ids: new Set(), tables: first.tables, tableNo: 0,
    glossary: found, sectionIds: found.sections, headings: [],
  };
  const blocks = renderBlockList(lines, ctx);

  const card = factsCard(pairs, ctx);
  const { hero, sections, audiences } = sectionize(blocks, card);
  const chips = chipsHtml(sections, labels);
  const heroHtml = hero.length || chips
    ? `<header class="hero">\n${hero.join('\n')}\n${chips}\n</header>`
    : '';
  const body = sections.map((s) =>
    `<section class="sec" aria-labelledby="${s.id}"${s.audience ? ` data-audience="${s.audience}"` : ''}>\n${s.parts.join('\n')}\n</section>`).join('\n');

  const flowEditor = ctx.flags.flowEditor
    ? `\n<script type="application/json" id="flow-editor-labels">${JSON.stringify(flowEditorLabels(lang)).replace(/</g, '\\u003c')}</script>`
      + `\n<script>${FLOW_EDITOR_SCRIPT}</script>\n<script>${FLOW_PAGE_SCRIPT}</script>`
    : '';
  const mermaid = ctx.mermaid
    ? `\n<script src="${MERMAID_CDN}"></script>\n<script>if(window.mermaid){var d=document.documentElement.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');mermaid.initialize({startOnLoad:true,securityLevel:'strict',theme:d==='dark'?'dark':'default'});}</script>`
    : '';
  return `<!doctype html>
<html lang="${escapeHtml(lang || 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="sc4sap md-to-html">
<title>${escapeHtml(ctx.title || 'Document')}</title>
<style>${STYLE}${ctx.flags.flowEditor ? FLOW_EDITOR_STYLE : ''}</style>
</head>
<body>
<div class="layout">
${tocHtml(ctx.headings, audiences, labels)}
<main>
${heroHtml}
${body}
</main>
</div>
<script>var L=${JSON.stringify(labels).replace(/</g, '\\u003c')};${SCRIPT}</script>${flowEditor}${mermaid}
</body>
</html>
`;
}

export function convertMdFile(inPath, outPath) {
  const src = resolve(inPath);
  const dest = resolve(outPath || src.replace(/\.(md|markdown)$/i, '') + '.html');
  const lang = (src.match(/-(ko|en|ja|[a-z]{2})\.(md|markdown)$/i) || [])[1];
  const html = mdToHtml(readFileSync(src, 'utf8'), { baseDir: dirname(src), lang });
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, html, 'utf8');
  return { outPath: dest, bytes: Buffer.byteLength(html), mermaid: html.includes('class="mermaid"') };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath) {
    console.error('Usage: node md-to-html.mjs <in.md> [out.html]');
    process.exit(2);
  }
  try {
    const res = convertMdFile(inPath, outPath);
    console.log(`md-to-html: wrote ${res.outPath} (${res.bytes} bytes${res.mermaid ? ', mermaid via CDN' : ''})`);
  } catch (e) {
    console.error(`md-to-html: ${e.message}`);
    process.exit(1);
  }
}
