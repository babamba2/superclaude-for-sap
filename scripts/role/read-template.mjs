// sc4sap:role-matrix — what a company's role-matrix form looks like, read from the form itself (HTML, Word .docx or
// Excel .xlsx).
//
// Output (one JSON object) is the input for writing a layout (skills/role-matrix/layout.md):
//   blocks   headings / paragraphs and tables in document order; a table gives its first rows (cell text, colspan,
//            fill colour, text colour, bold), its size and the text right before it (usually the sheet title)
//   header   page header / footer texts (.docx) — document number, company name, approval boxes
//   colors   fill colours by frequency (header rows first)   fonts  font families by frequency
//   images   pictures in the form (logo candidates); with --out they are saved there so a layout can point to one
// An .xlsx gives one heading (the sheet name) and one table per sheet; its rows carry the row number (`r`) and its cells
// the column letter (`c`), so a layout's `form` mapping (import-form.mjs) can name them.
// Values are only read and reported — nothing of the form goes into the plugin.
//
// CLI: node read-template.mjs <form.html | form.htm | form.docx | form.xlsx> [--out <dir>]

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipEntries } from '../spec/xlsx-zip.mjs';
import { readXlsx, colName } from './xlsx-read.mjs';

const ROWS = 6;
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));
const clean = (s) => decode(String(s).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t\r\f\v ]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
const hex = (c) => {
  const s = String(c || '').trim().toLowerCase();
  if (/^#?[0-9a-f]{6}$/.test(s)) return `#${s.replace('#', '')}`;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  const m = /^rgb\(\s*(\d+)\D+(\d+)\D+(\d+)/.exec(s);
  return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '';
};
const tally = () => { const m = new Map(); return { add: (k, w = 1) => k && m.set(k, (m.get(k) || 0) + w), top: (n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => ({ v: k, n: c })) }; };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', emf: 'image/emf', wmf: 'image/wmf', svg: 'image/svg+xml' };

// ---------- HTML ----------

/** CSS rules of <style> blocks: selector → declarations (only simple class / element selectors are used). */
function cssRules(html) {
  const rules = new Map();
  for (const [, css] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const [, sel, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      for (const one of sel.split(',')) rules.set(one.trim().toLowerCase(), `${rules.get(one.trim().toLowerCase()) || ''};${body}`);
    }
  }
  return rules;
}
const decl = (css, prop) => { const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(css || ''); return m ? m[1].trim() : ''; };

function htmlCellStyle(tag, attrs, inner, rules) {
  const cls = (/class\s*=\s*["']?([^"'>]+)/i.exec(attrs)?.[1] || '').split(/\s+/).filter(Boolean);
  const css = [rules.get(tag) || '', ...cls.map((c) => rules.get(`.${c.toLowerCase()}`) || rules.get(`${tag}.${c.toLowerCase()}`) || ''), /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] || /style\s*=\s*'([^']*)'/i.exec(attrs)?.[1] || ''].join(';');
  const bg = hex(decl(css, 'background-color') || decl(css, 'background').split(/\s+/).find((x) => hex(x)) || /bgcolor\s*=\s*["']?([#\w]+)/i.exec(attrs)?.[1]);
  const color = hex(decl(css, 'color'));
  const bold = tag === 'th' || /bold|[6-9]00/.test(decl(css, 'font-weight')) || /^\s*<(b|strong)\b/i.test(inner);
  return { bg, color, bold, font: decl(css, 'font-family').split(',')[0].replace(/["']/g, '').trim() };
}

function readHtml(file) {
  const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  const rules = cssRules(html);
  const colors = tally(), fonts = tally(), blocks = [];
  for (const [, css] of html.matchAll(/font-family\s*:\s*((?:"[^"]*"|'[^']*'|&quot;|[^;}"'<>])+)/gi)) fonts.add(decode(css).split(',')[0].replace(/["']/g, '').trim());
  // top-level tables in order, with the headings / paragraphs between them
  const re = /<(h[1-6]|p|caption|table)\b([^>]*)>|<\/table>/gi;
  let depth = 0, start = 0, m;
  while ((m = re.exec(html))) {
    const tag = (m[1] || '').toLowerCase();
    if (!m[1]) { depth--; if (depth === 0) blocks.push(htmlTable(html.slice(start, m.index), rules, colors, fonts)); continue; }
    if (tag === 'table') { if (depth++ === 0) start = re.lastIndex; continue; }
    if (depth) continue;
    const end = html.indexOf(`</${tag}`, re.lastIndex);
    const text = clean(html.slice(re.lastIndex, end < 0 ? re.lastIndex : end));
    if (text) blocks.push({ type: /^h/.test(tag) || tag === 'caption' ? 'heading' : 'text', text: text.slice(0, 200) });
  }
  const images = [];
  for (const [, attrs] of html.matchAll(/<img\b([^>]*)>/gi)) {
    const src = /src\s*=\s*["']([^"']+)/i.exec(attrs)?.[1] || '';
    const d = /^data:(image\/[\w+.-]+);base64,(.*)$/i.exec(src);
    if (d) images.push({ name: `image${images.length + 1}.${d[1].split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg')}`, mime: d[1], data: Buffer.from(d[2], 'base64') });
    else if (src && !/^https?:/i.test(src)) {
      const p = resolve(dirname(file), decodeURIComponent(src));
      const ext = extname(p).slice(1).toLowerCase();
      if (existsSync(p) && MIME[ext]) images.push({ name: basename(p), mime: MIME[ext], data: readFileSync(p) });
    } else if (src) images.push({ name: src, mime: '', data: null, remote: true });
  }
  return { kind: 'html', title: clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] || ''), blocks, header: [], colors, fonts, images };
}

function htmlTable(inner, rules, colors, fonts) {
  // nested tables stay inside their cell (text only)
  const rows = [];
  for (const tr of inner.split(/<tr\b[^>]*>/i).slice(1)) {
    const cells = [];
    for (const [, tag, attrs, body] of tr.replace(/<\/tr>[\s\S]*$/i, '').matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)(?=<t[dh]\b|$)/gi)) {
      const st = htmlCellStyle(tag.toLowerCase(), attrs, body, rules);
      const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1]) || 1;
      const rs = Number(/rowspan\s*=\s*["']?(\d+)/i.exec(attrs)?.[1]) || 1;
      cells.push({ t: clean(body.replace(/<\/t[dh]>[\s\S]*$/i, '')).slice(0, 120), ...(span > 1 ? { span } : {}), ...(rs > 1 ? { rows: rs } : {}), ...(st.bg ? { bg: st.bg } : {}), ...(st.color ? { color: st.color } : {}), ...(st.bold ? { bold: true } : {}) });
      colors.add(st.bg, rows.length < 2 ? 3 : 1);
      fonts.add(st.font);
    }
    if (cells.length) rows.push(cells);
  }
  return tableBlock(rows);
}

// ---------- DOCX ----------

const attr = (xml, tag, a) => new RegExp(`<${tag}\\b[^>]*\\b${a}="([^"]*)"`).exec(xml)?.[1] || '';
const wText = (xml) => xml.split(/<\/w:p>/).map((p) => [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g)].map((m) => (m[1] != null ? decode(m[1]) : m[0] === '<w:tab/>' ? '\t' : '\n')).join('')).map((s) => s.trim()).filter(Boolean).join('\n');

function docxCell(tc, colors, first) {
  const tcPr = /<w:tcPr>([\s\S]*?)<\/w:tcPr>/.exec(tc)?.[1] || '';
  const fill = attr(tcPr, 'w:shd', 'w:fill');
  const bg = fill && fill !== 'auto' ? hex(fill) : '';
  const span = Number(attr(tcPr, 'w:gridSpan', 'w:val')) || 1;
  const vm = /<w:vMerge\b(?![^>]*w:val="restart")/.test(tcPr);
  const color = hex(attr(tc, 'w:color', 'w:val'));
  const bold = /<w:b\/>|<w:b w:val="(1|true|on)"/.test(tc);
  colors.add(bg, first ? 3 : 1);
  return { t: wText(tc).slice(0, 120), ...(span > 1 ? { span } : {}), ...(vm ? { merged: true } : {}), ...(bg ? { bg } : {}), ...(color && color !== '#000000' ? { color } : {}), ...(bold ? { bold: true } : {}) };
}

/** Top-level <w:tbl> / <w:p> of a body in order (nested tables stay in their cell). */
function docxBody(xml, colors) {
  const blocks = [];
  const re = /<w:tbl>|<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  let depth = 0, start = 0, m;
  while ((m = re.exec(xml))) {
    if (m[0] === '<w:tbl>') { if (depth++ === 0) start = re.lastIndex; continue; }
    if (m[0] === '</w:tbl>') {
      if (--depth === 0) {
        const rows = [];
        for (const tr of xml.slice(start, m.index).split(/<w:tr[ >]/).slice(1)) {
          const cells = [...tr.matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map(([, tc]) => docxCell(tc, colors, rows.length < 2));
          if (cells.length) rows.push(cells);
        }
        blocks.push(tableBlock(rows));
      }
      continue;
    }
    if (depth) continue;
    const text = wText(m[0]);
    if (!text) continue;
    const style = attr(m[0], 'w:pStyle', 'w:val');
    const big = Number(attr(m[0], 'w:sz', 'w:val')) >= 28;
    blocks.push({ type: /heading|title|제목|^\d$/i.test(style) || big ? 'heading' : 'text', text: text.slice(0, 200), ...(style ? { style } : {}) });
  }
  return blocks;
}

function readDocx(file) {
  const entries = new Map(unzipEntries(readFileSync(file)).map((e) => [e.name, e.data]));
  const doc = entries.get('word/document.xml')?.toString('utf8');
  if (!doc) throw new Error(`${file}: no word/document.xml — not a .docx (an old .doc must be saved as .docx or .html first)`);
  const colors = tally(), fonts = tally();
  for (const name of ['word/document.xml', 'word/styles.xml', ...[...entries.keys()].filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))]) {
    const x = entries.get(name)?.toString('utf8') || '';
    for (const [tag] of x.matchAll(/<w:rFonts\b[^>]*>/g)) { fonts.add(/w:eastAsia="([^"]*)"/.exec(tag)?.[1]); fonts.add(/w:ascii="([^"]*)"/.exec(tag)?.[1]); }
  }
  const theme = entries.get('word/theme/theme1.xml')?.toString('utf8') || '';
  const minor = /<a:minorFont>[\s\S]*?<a:latin typeface="([^"]*)"[\s\S]*?(?:<a:font script="Hang" typeface="([^"]*)")?/.exec(theme);
  if (minor) { fonts.add(minor[2], 0.5); fonts.add(minor[1], 0.5); }
  const blocks = docxBody(doc, colors);
  const header = [];
  const inHeader = new Set();
  for (const name of [...entries.keys()].filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n)).sort()) {
    const x = entries.get(name).toString('utf8');
    const text = wText(x);
    if (text) header.push({ part: basename(name, '.xml'), text: text.slice(0, 300) });
    const rels = entries.get(`word/_rels/${basename(name)}.rels`)?.toString('utf8') || '';
    for (const [, t] of rels.matchAll(/Target="media\/([^"]+)"/g)) inHeader.add(t);
  }
  const images = [...entries.keys()].filter((n) => n.startsWith('word/media/')).map((n) => {
    const name = basename(n), ext = extname(name).slice(1).toLowerCase();
    return { name, mime: MIME[ext] || '', data: entries.get(n), ...(inHeader.has(name) ? { inHeader: true } : {}) };
  });
  const title = (entries.get('docProps/core.xml')?.toString('utf8').match(/<dc:title>([^<]*)<\/dc:title>/) || [])[1] || '';
  return { kind: 'docx', title: decode(title), blocks, header, colors, fonts, images };
}

// ---------- XLSX ----------

function readXlsxForm(file) {
  const wb = readXlsx(file);
  const colors = tally(), fonts = tally(), blocks = [];
  for (const sh of wb.sheets) {
    blocks.push({ type: 'heading', text: sh.name, sheet: true, ...(sh.hidden ? { hidden: true } : {}) });
    // merged ranges: the first cell carries span / rows, the cells it covers are left out
    const top = new Map(), covered = new Set();
    for (const m of sh.merges) { top.set(`${m.r0}:${m.c0}`, m); for (let r = m.r0; r <= m.r1; r++) for (let c = m.c0; c <= m.c1; c++) if (r !== m.r0 || c !== m.c0) covered.add(`${r}:${c}`); }
    const rows = [];
    let filled = 0;
    for (let r = 1; r <= sh.maxRow; r++) {
      const cells = [];
      for (let c = 1; c <= sh.maxCol; c++) {
        const k = `${r}:${c}`, x = sh.cells.get(k);
        if (covered.has(k) || !x?.t) continue;
        const m = top.get(k);
        cells.push({ c: colName(c), t: String(x.t).replace(/\s+/g, ' ').trim().slice(0, 120), ...(m && m.c1 > m.c0 ? { span: m.c1 - m.c0 + 1 } : {}), ...(m && m.r1 > m.r0 ? { rows: m.r1 - m.r0 + 1 } : {}),
          ...(x.bg ? { bg: x.bg } : {}), ...(x.color ? { color: x.color } : {}), ...(x.bold ? { bold: true } : {}) });
        colors.add(x.bg, rows.length < ROWS ? 3 : 1);
        fonts.add(x.font);
      }
      if (!cells.length) continue;
      filled++;
      if (rows.length < ROWS + 2) rows.push({ r, cells });
    }
    blocks.push({ type: 'table', sheet: sh.name, rows: filled, cols: sh.maxCol, lastRow: sh.maxRow, head: rows });
  }
  const images = wb.images.map((im) => ({ name: im.name, mime: MIME[extname(im.name).slice(1).toLowerCase()] || '', data: im.data }));
  return { kind: 'xlsx', title: wb.title, blocks, header: [], colors, fonts, images };
}

// ---------- shared ----------

function tableBlock(rows) {
  const cols = Math.max(0, ...rows.map((r) => r.reduce((n, c) => n + (c.span || 1), 0)));
  return { type: 'table', rows: rows.length, cols, head: rows.slice(0, ROWS) };
}

/** Reads a form; with opts.out the pictures are written there (a layout's theme.logo can name one). */
export function readTemplate(file, { out = '' } = {}) {
  if (!existsSync(file)) throw new Error(`${file} not found`);
  const ext = extname(file).toLowerCase();
  const r = ext === '.docx' ? readDocx(file) : ext === '.xlsx' || ext === '.xlsm' ? readXlsxForm(file) : /^\.(html?|xhtml|mht)$/.test(ext) ? readHtml(file) : null;
  if (!r) throw new Error(`${file}: give the form as .html / .htm, .docx or .xlsx (an old .doc / .xls or a PDF: save it as .docx / .xlsx or .html first)`);
  // text right before a table names it (sheet title)
  const blocks = r.blocks.map((b, i) => (b.type === 'table' && !b.sheet ? { ...b, before: [...r.blocks.slice(Math.max(0, i - 3), i)].reverse().find((x) => x.type !== 'table')?.text || '' } : b));
  if (out) mkdirSync(out, { recursive: true });
  const images = r.images.map((im) => {
    const o = { name: im.name, mime: im.mime, bytes: im.data ? im.data.length : 0, ...(im.inHeader ? { inHeader: true } : {}), ...(im.remote ? { remote: true } : {}) };
    if (out && im.data && /^image\/(png|jpeg|gif|svg\+xml)$/.test(im.mime)) { const p = join(out, im.name); writeFileSync(p, im.data); o.file = p; }
    return o;
  });
  return { file, kind: r.kind, title: r.title, tables: blocks.filter((b) => b.type === 'table').length, blocks, header: r.header, colors: r.colors.top(8), fonts: r.fonts.top(6), images };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--out');
  try {
    console.log(JSON.stringify(readTemplate(resolve(args[0] || ''), { out: i >= 0 ? resolve(args[i + 1]) : '' })));
  } catch (e) { console.error(`read-template: ${e.message}`); process.exit(1); }
}
