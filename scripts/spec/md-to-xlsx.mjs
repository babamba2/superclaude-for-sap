// sc4sap:compare-programs (and any skill whose Markdown follows
// skills/program-to-spec/html-markup.md) — Markdown → styled .xlsx.
//
// The Excel twin of md-to-html.mjs: the same .md (the source of truth) laid
// out as a workbook. It reuses the spec xlsx toolchain — xlsx-zip.mjs for the
// package and the screen PNGs the skills already render into _assets/ — with
// the hand-written OOXML style of build-bpml.mjs (no template clone: the
// spec template's fixed slots fit a specification, not a free document).
//
//   Sheet 1 (개요 / Overview / 概要) — dark title banner, the fact list as
//            label / value rows, and the contents (one line per sheet).
//   Sheets 2+ — one per `##` section, named "<n>. <title>" (31 chars max):
//            `###` bands, paragraphs and list items as wrapped text rows,
//            `> [!KIND]` callouts on a tinted row, pipe tables with a dark
//            header and borders, images embedded (PNG / JPEG), Mermaid
//            replaced by a one-line note (the HTML page draws it).
//   Comparison markup (report-template.md) carries over: a cell starting with
//   ✅ / 🔷 / ⚠️ / ❓ gets the verdict fill, ● / ○ cells are centred and
//   coloured, `<span class="ev">…</span>` becomes a small grey second line in
//   the cell, and the images after `<!-- layout: side-by-side -->` share a row.
//
// CLI   node md-to-xlsx.mjs <in.md> [out.xlsx]      (default: same path, .xlsx)
// Zero external deps.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, isAbsolute, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipFiles } from './xlsx-zip.mjs';

const OVERVIEW = { ko: '개요', en: 'Overview', ja: '概要' };
const CONTENTS = { ko: '목차', en: 'Contents', ja: '目次' };
const DIAGRAM = {
  ko: '(다이어그램 — HTML 문서에서 확인하세요)',
  en: '(Diagram — see the HTML page)',
  ja: '(図 — HTML 版を参照してください)',
};
const NO_IMAGE = { ko: '(이미지 없음: {p})', en: '(Image not found: {p})', ja: '(画像なし: {p})' };

const EMU_PER_PX = 9525;
const ROW_PX = 20;          // default row height 15pt ≈ 20 px
const MAX_IMG_PX = 960;     // single image
const MAX_ROW_IMG_PX = 620; // each image of a side-by-side row
const MIN_COLS = 6;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

function colLetter(n) {
  let s = '', x = n;
  do { s = String.fromCharCode(65 + (x % 26)) + s; x = Math.floor(x / 26) - 1; } while (x >= 0);
  return s;
}
/** Display width in Excel column units: ASCII ≈ 1, CJK ≈ 2. */
function dispW(s) {
  let w = 0;
  for (const ch of String(s ?? '')) w += ch.codePointAt(0) > 255 ? 2 : 1.05;
  return w;
}
const colPx = (w) => Math.round(w * 7 + 5);

// ── Markdown inline → plain text (+ evidence) ──────────────────────────────

const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', middot: '·', rarr: '→', larr: '←' };
function plain(md) {
  let ev = [];
  let s = String(md ?? '').replace(/<span class="ev">([\s\S]*?)<\/span>/g, (_, t) => { ev.push(plain(t).text); return ''; });
  s = s.replace(/<br\s*\/?>/gi, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m)
    .replace(/\\([|*_`\\])/g, '$1');
  return { text: s.trim(), ev };
}

const VERDICT = [['✅', 'vSame'], ['🔷', 'vVar'], ['⚠', 'vDiv'], ['❓', 'vUnk']];
function cellKind(text) {
  const t = text.trim();
  if (t === '●') return 'prYes';
  if (t === '○') return 'prNo';
  const v = VERDICT.find(([m]) => t.startsWith(m));
  return v ? v[1] : null;
}

// ── Markdown blocks (the subset the skills write) ──────────────────────────

const splitRow = (line) => {
  let s = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
};
const isDivider = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);

/** → { title, facts: [[label, value]], sections: [{ title, blocks }] } */
export function parseMd(markdown) {
  let text = String(markdown).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const facts = [];
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (fm) {
    for (const l of fm[1].split('\n')) {
      const m = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
      if (m && m[2] && !/^\[/.test(m[2])) facts.push([m[1], m[2].replace(/^["']|["']$/g, '')]);
    }
    text = text.slice(fm[0].length);
  }
  const lines = text.split('\n');
  const doc = { title: '', facts, sections: [] };
  let sec = null;
  const blocks = () => {
    if (!sec) { sec = { title: '', blocks: [] }; doc.sections.push(sec); }
    return sec.blocks;
  };
  let sideBySide = false;
  let i = 0;
  let inFacts = false;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { i++; continue; }
    if (/^\s*<!--/.test(line)) {
      let body = '';
      while (i < lines.length) { body += lines[i]; if (lines[i++].includes('-->')) break; }
      if (/layout:\s*side-by-side/i.test(body)) sideBySide = true;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      sideBySide = false;
      const t = plain(h[2]).text;
      if (h[1].length === 1 && !doc.title) { doc.title = t; inFacts = true; }
      else if (h[1].length === 2) { sec = { title: t, blocks: [] }; doc.sections.push(sec); inFacts = false; }
      else { blocks().push({ type: 'heading', level: h[1].length, text: t }); inFacts = false; }
      i++;
      continue;
    }
    const fact = inFacts && line.match(/^\s*[-*]\s+\*\*(.+?)\*\*:\s*(.*)$/);
    if (fact) {
      // `- **A**: x · **B**: y` → two facts
      const parts = `**${fact[1]}**: ${fact[2]}`.split(/\s+·\s+(?=\*\*)/);
      for (const p of parts) {
        const m = p.match(/^\*\*(.+?)\*\*:\s*(.*)$/);
        if (m) facts.push([plain(m[1]).text, plain(m[2]).text]);
      }
      i++;
      continue;
    }
    inFacts = false;
    const fence = line.match(/^\s*(`{3,}|~{3,})\s*([\w+-]*)/);
    if (fence) {
      const close = new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`);
      const body = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks().push(fence[2].toLowerCase() === 'mermaid' ? { type: 'diagram' } : { type: 'code', text: body.join('\n') });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const head = splitRow(line).map((c) => plain(c).text);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]).map(plain));
      blocks().push({ type: 'table', head, rows });
      sideBySide = false;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      const kind = (q[0].match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i) || [])[1];
      const body = (kind ? q.slice(1) : q).join(' ').trim();
      blocks().push({ type: 'callout', kind: (kind || (body.startsWith('⚠') ? 'WARNING' : 'NOTE')).toUpperCase(), text: plain(body).text });
      continue;
    }
    if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) {
      const m = line.match(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?[^)]*\)/);
      blocks().push({ type: 'image', alt: plain(m[1]).text, src: m[2], group: sideBySide });
      i++;
      continue;
    }
    if (/^\s*([-*+]|\d{1,9}[.)])\s+/.test(line)) {
      while (i < lines.length && /^\s*([-*+]|\d{1,9}[.)])\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/);
        const bullet = /\d/.test(m[2]) ? `${m[2].replace(')', '.')} ` : '• ';
        blocks().push({ type: 'text', indent: Math.floor(m[1].length / 2), text: bullet + plain(m[3]).text });
        i++;
      }
      sideBySide = false;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { i++; continue; }
    const para = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*(#|>|\||```|~~~|<!--|!\[)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) { i++; continue; }
    const p = plain(para.join(' '));
    if (p.text) blocks().push({ type: 'text', indent: 0, text: p.text });
    sideBySide = false;
  }
  return doc;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const FILL = {
  head: 'FF595959', label: 'FFE7E7E7', band: 'FFDDEBF7', note: 'FFE8F1FB', important: 'FFF0E8FA',
  warn: 'FFFFF2CC', vSame: 'FFE2F0D9', vVar: 'FFDDEBF7', vDiv: 'FFFCE4D6', vUnk: 'FFEDE2F6',
};
const FILL_IDS = Object.fromEntries(Object.keys(FILL).map((k, n) => [k, n + 2]));
// cellXfs index by name
const XF = {
  base: 0, header: 1, title: 2, label: 3, cell: 4, band: 5, text: 6,
  note: 7, important: 8, warn: 9, vSame: 10, vVar: 11, vDiv: 12, vUnk: 13, prYes: 14, prNo: 15, muted: 16, code: 17,
};
function stylesXml() {
  const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    ...Object.values(FILL).map((rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/></patternFill></fill>`)];
  const al = (h, v, wrap = true) => `<alignment${h ? ` horizontal="${h}"` : ''} vertical="${v}"${wrap ? ' wrapText="1"' : ''}/>`;
  const xf = (font, fill, border, align) =>
    `<xf numFmtId="0" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align}</xf>`;
  const xfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    xf(1, FILL_IDS.head, 1, al('center', 'center')),
    xf(3, FILL_IDS.head, 0, al('left', 'center', false)),
    xf(2, FILL_IDS.label, 1, al(null, 'top')),
    xf(0, 0, 1, al(null, 'top')),
    xf(2, FILL_IDS.band, 0, al(null, 'center', false)),
    xf(0, 0, 0, al(null, 'top')),
    xf(0, FILL_IDS.note, 0, al(null, 'top')),
    xf(0, FILL_IDS.important, 0, al(null, 'top')),
    xf(0, FILL_IDS.warn, 0, al(null, 'top')),
    xf(2, FILL_IDS.vSame, 1, al(null, 'top')),
    xf(2, FILL_IDS.vVar, 1, al(null, 'top')),
    xf(2, FILL_IDS.vDiv, 1, al(null, 'top')),
    xf(2, FILL_IDS.vUnk, 1, al(null, 'top')),
    xf(4, 0, 1, al('center', 'top')),
    xf(5, 0, 1, al('center', 'top')),
    xf(6, 0, 0, al(null, 'top')),
    xf(7, 0, 0, al(null, 'top')),
  ];
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="8">
<font><sz val="10"/><name val="맑은 고딕"/></font>
<font><sz val="10"/><b/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>
<font><sz val="10"/><b/><name val="맑은 고딕"/></font>
<font><sz val="14"/><b/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font>
<font><sz val="11"/><b/><color rgb="FF1A7F37"/><name val="맑은 고딕"/></font>
<font><sz val="11"/><color rgb="FFA0A0A0"/><name val="맑은 고딕"/></font>
<font><sz val="9"/><i/><color rgb="FF808080"/><name val="맑은 고딕"/></font>
<font><sz val="9"/><name val="Consolas"/></font>
</fonts>
<fills count="${fills.length}">${fills.join('')}</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFA6A6A6"/></left><right style="thin"><color rgb="FFA6A6A6"/></right><top style="thin"><color rgb="FFA6A6A6"/></top><bottom style="thin"><color rgb="FFA6A6A6"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

// ── Sheet builder ──────────────────────────────────────────────────────────

/** PNG / JPEG pixel size, or null. */
function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), ext: 'png' };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let p = 2;
    while (p < buf.length) {
      if (buf[p] !== 0xff) break;
      const m = buf[p + 1], len = buf.readUInt16BE(p + 2);
      if (m >= 0xc0 && m <= 0xc3) return { w: buf.readUInt16BE(p + 7), h: buf.readUInt16BE(p + 5), ext: 'jpeg' };
      p += 2 + len;
    }
  }
  return null;
}

function inlineCell(ref, style, text, ev = []) {
  const s = style ? ` s="${style}"` : '';
  if (!text && !ev.length) return `<c r="${ref}"${s}/>`;
  if (!ev.length) return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(text)}</t></is></c>`;
  const evRun = `<r><rPr><sz val="8"/><color rgb="FF808080"/><rFont val="맑은 고딕"/></rPr><t xml:space="preserve">${esc(`${text ? '\n' : ''}(${ev.join(' / ')})`)}</t></r>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><r><t xml:space="preserve">${esc(text)}</t></r>${evRun}</is></c>`;
}

class Sheet {
  constructor(name) { this.name = name; this.rows = []; this.merges = []; this.anchors = []; this.r = 1; this.widths = []; }
  fit(col, text, cap = 60) {
    const lines = String(text).split('\n');
    const w = Math.min(cap, Math.max(...lines.map(dispW)) + 2);
    this.widths[col] = Math.max(this.widths[col] || 8, w);
  }
  row(cells, height) {
    const ht = height ? ` ht="${height}" customHeight="1"` : '';
    this.rows.push(`<row r="${this.r}"${ht}>${cells.join('')}</row>`);
    return this.r++;
  }
  /** One text line merged across `span` columns, height from the wrapped length. */
  wide(text, style, span, indent = 0, ev = []) {
    const t = (indent ? '   '.repeat(indent) : '') + text;
    const width = this.span(span);
    const lines = String(t).split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(dispW(l) / Math.max(10, width - 2))), 0);
    const r = this.r;
    const cells = [inlineCell(`A${r}`, style, t, ev)];
    for (let c = 1; c < span; c++) cells.push(`<c r="${colLetter(c)}${r}" s="${style}"/>`);
    if (span > 1) this.merges.push(`A${r}:${colLetter(span - 1)}${r}`);
    this.row(cells, lines > 1 ? Math.min(409, lines * 15 + 3) : null);
  }
  span(n) { let w = 0; for (let c = 0; c < n; c++) w += this.widths[c] || 12; return w; }
  blank() { this.r++; }
}

function sheetXml(sh, span) {
  const cols = [];
  for (let c = 0; c < Math.max(span, sh.widths.length); c++) cols.push(`<col min="${c + 1}" max="${c + 1}" width="${(sh.widths[c] || 12).toFixed(1)}" customWidth="1"/>`);
  const merges = sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols.join('')}</cols>
<sheetData>${sh.rows.join('')}</sheetData>
${merges}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToHeight="0"/>
${sh.anchors.length ? '<drawing r:id="rId1"/>' : ''}
</worksheet>`;
}

function safeSheetName(name, used) {
  let base = String(name).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let n = base, k = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 28)} ${k++}`;
  used.add(n.toLowerCase());
  return n;
}

/**
 * @param {string} markdown
 * @param {{ baseDir?: string, lang?: string }} [o]
 * @returns {{ buffer: Buffer, sheets: string[], images: number, missing: string[] }}
 */
export function mdToXlsx(markdown, { baseDir = process.cwd(), lang = 'en' } = {}) {
  const L = String(lang).slice(0, 2).toLowerCase();
  const doc = parseMd(markdown);
  const used = new Set();
  const media = [];  // { name, data }
  const missing = [];
  const sheets = [];

  // Sections → sheets (laid out first so the overview can list their names).
  const sectionSheets = doc.sections.filter((s) => s.title || s.blocks.length).map((sec) => {
    const sh = new Sheet(safeSheetName(sec.title || doc.title || OVERVIEW[L] || OVERVIEW.en, used));
    const tables = sec.blocks.filter((b) => b.type === 'table');
    const span = Math.max(MIN_COLS, ...tables.map((t) => t.head.length));
    // Column widths from the tables of this sheet.
    for (const t of tables) {
      t.head.forEach((h, c) => sh.fit(c, h, 40));
      t.rows.forEach((r) => r.forEach((cell, c) => sh.fit(c, cell.text + (cell.ev.length ? ' ' : ''), 60)));
    }
    for (let c = 0; c < span; c++) sh.widths[c] = sh.widths[c] || 14;
    sh.wide(sec.title, XF.title, span);
    sh.rows[sh.rows.length - 1] = sh.rows.at(-1).replace('<row ', '<row ht="26" customHeight="1" ');
    sh.blank();
    let rowImgs = null; // pending side-by-side group: { r, x }
    const flushRow = () => { if (rowImgs) { sh.r = rowImgs.bottom + 1; rowImgs = null; } };
    for (const b of sec.blocks) {
      if (b.type !== 'image' || !b.group) flushRow();
      if (b.type === 'heading') { sh.blank(); sh.wide(b.text, XF.band, span); continue; }
      if (b.type === 'text') { sh.wide(b.text, XF.text, span, b.indent); continue; }
      if (b.type === 'callout') {
        const style = b.kind === 'WARNING' || b.kind === 'CAUTION' ? XF.warn : b.kind === 'IMPORTANT' ? XF.important : XF.note;
        sh.wide(b.text, style, span);
        continue;
      }
      if (b.type === 'diagram') { sh.wide(DIAGRAM[L] || DIAGRAM.en, XF.muted, span); continue; }
      if (b.type === 'code') { sh.wide(b.text, XF.code, span); continue; }
      if (b.type === 'table') {
        sh.row(b.head.map((h, c) => inlineCell(`${colLetter(c)}${sh.r}`, XF.header, h)));
        for (const r of b.rows) {
          let lines = 1;
          const cells = b.head.map((_, c) => {
            const cell = r[c] || { text: '', ev: [] };
            const kind = cellKind(cell.text);
            const width = sh.widths[c] || 12;
            lines = Math.max(lines, cell.text.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(dispW(l) / Math.max(6, width - 1))), 0)
              + (cell.ev.length ? Math.ceil(dispW(cell.ev.join(' / ')) * 0.8 / Math.max(6, width - 1)) : 0));
            return inlineCell(`${colLetter(c)}${sh.r}`, kind ? XF[kind] : XF.cell, cell.text, cell.ev);
          });
          sh.row(cells, lines > 1 ? Math.min(409, lines * 14 + 4) : null);
        }
        sh.blank();
        continue;
      }
      if (b.type === 'image') {
        const path = isAbsolute(b.src) ? b.src : resolve(baseDir, b.src);
        const buf = existsSync(path) ? readFileSync(path) : null;
        const size = buf && imageSize(buf);
        if (!size) { missing.push(b.src); sh.wide((NO_IMAGE[L] || NO_IMAGE.en).replace('{p}', b.src), XF.muted, span); continue; }
        const max = b.group ? MAX_ROW_IMG_PX : MAX_IMG_PX;
        const k = Math.min(1, max / size.w);
        const w = Math.round(size.w * k), h = Math.round(size.h * k);
        media.push({ name: `image${media.length + 1}.${size.ext}`, data: buf });
        let col = 0, row0;
        if (b.group && rowImgs) {
          // Next column whose left edge is right of the previous image + a gap;
          // its caption joins the group's (unmerged) caption row.
          let x = 0;
          while (x < rowImgs.x + 24) x += colPx(sh.widths[col++] || 12);
          row0 = rowImgs.r;
          const at = sh.rows.findIndex((s) => s.startsWith(`<row r="${rowImgs.capRow}"`));
          if (at >= 0) sh.rows[at] = sh.rows[at].replace('</row>', `${inlineCell(`${colLetter(col)}${rowImgs.capRow}`, XF.muted, b.alt)}</row>`);
        } else if (b.group) {
          const capRow = sh.row([inlineCell(`A${sh.r}`, XF.muted, b.alt)]);
          row0 = sh.r;
          rowImgs = { r: row0, x: 0, bottom: row0, capRow };
        } else {
          sh.wide(b.alt, XF.muted, span);
          row0 = sh.r;
        }
        let left = 0;
        for (let c = 0; c < col; c++) left += colPx(sh.widths[c] || 12);
        sh.anchors.push({ col0: col, row0: row0 - 1, cx: w * EMU_PER_PX, cy: h * EMU_PER_PX, media: media.length });
        const rowsTall = Math.ceil(h / ROW_PX) + 1;
        if (b.group) {
          rowImgs.x = left + w;
          rowImgs.bottom = Math.max(rowImgs.bottom, row0 + rowsTall);
        } else {
          sh.r = row0 + rowsTall;
        }
        continue;
      }
    }
    flushRow();
    return { sh, span };
  });

  // Overview sheet.
  const ov = new Sheet(safeSheetName(OVERVIEW[L] || OVERVIEW.en, used));
  ov.widths = [24, 70];
  ov.wide(doc.title, XF.title, 2);
  ov.rows[0] = ov.rows[0].replace('<row ', '<row ht="30" customHeight="1" ');
  ov.blank();
  for (const [k, v] of doc.facts) {
    const lines = Math.max(1, Math.ceil(dispW(v) / 68));
    ov.row([inlineCell(`A${ov.r}`, XF.label, k), inlineCell(`B${ov.r}`, XF.cell, v)], lines > 1 ? lines * 15 + 3 : null);
  }
  ov.blank();
  ov.row([inlineCell(`A${ov.r}`, XF.band, CONTENTS[L] || CONTENTS.en)]);
  for (const { sh } of sectionSheets) ov.row([inlineCell(`A${ov.r}`, XF.text, ''), inlineCell(`B${ov.r}`, XF.text, sh.name)]);
  sheets.push({ sh: ov, span: 2 }, ...sectionSheets);

  // Package.
  const files = [];
  const add = (name, s) => files.push({ name, data: Buffer.from(s, 'utf8') });
  let drawingNo = 0;
  sheets.forEach(({ sh, span }, i) => {
    add(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh, span));
    if (!sh.anchors.length) return;
    const d = ++drawingNo;
    add(`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${d}.xml"/></Relationships>`);
    const pics = sh.anchors.map((a, k) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${a.col0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.row0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${a.cx}" cy="${a.cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="Picture ${k + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${k + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join('');
    add(`xl/drawings/drawing${d}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pics}</xdr:wsDr>`);
    add(`xl/drawings/_rels/drawing${d}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sh.anchors.map((a, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${media[a.media - 1].name}"/>`).join('')}</Relationships>`);
  });
  // The overview was built last but is the first tab: sheet order = sheets[] order.
  media.forEach((m) => files.push({ name: `xl/media/${m.name}`, data: m.data }));
  const n = sheets.length;
  add('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
${Array.from({ length: drawingNo }, (_, i) => `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`).join('\n')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  add('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets.map(({ sh }, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`);
  add('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add('xl/styles.xml', stylesXml());
  // [Content_Types].xml first, as Excel expects.
  files.sort((a, b) => (a.name === '[Content_Types].xml' ? -1 : b.name === '[Content_Types].xml' ? 1 : 0));
  return { buffer: zipFiles(files), sheets: sheets.map(({ sh }) => sh.name), images: media.length, missing };
}

export function convertMdFileToXlsx(inPath, outPath) {
  const src = resolve(inPath);
  const dest = resolve(outPath || src.replace(/\.(md|markdown)$/i, '') + '.xlsx');
  if (extname(dest).toLowerCase() !== '.xlsx') throw new Error(`refusing to write a workbook to ${dest} (expects .xlsx)`);
  const lang = (src.match(/-([a-z]{2})\.(md|markdown)$/i) || [])[1] || 'en';
  const res = mdToXlsx(readFileSync(src, 'utf8'), { baseDir: dirname(src), lang });
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, res.buffer);
  return { xlsx: dest, bytes: res.buffer.length, sheets: res.sheets, images: res.images, missing: res.missing };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [inPath, outPath] = process.argv.slice(2);
  if (!inPath) { console.error('Usage: node md-to-xlsx.mjs <in.md> [out.xlsx]'); process.exit(2); }
  try {
    console.log(JSON.stringify(convertMdFileToXlsx(inPath, outPath), null, 2));
  } catch (e) {
    console.error(`md-to-xlsx: ${e.message}`);
    process.exit(1);
  }
}
