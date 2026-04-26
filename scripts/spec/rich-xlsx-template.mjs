// sc4sap:program-to-spec — Rich XLSX standalone driver TEMPLATE.
//
// Purpose:
//   Generate a human-readable multi-sheet .xlsx specification artifact
//   using REAL Excel cell geometry (styles.xml + borders + merged cells +
//   fixed column widths) — NOT ASCII box-drawing. ASCII art breaks when
//   Excel column widths don't match character widths; borders + merges
//   render cleanly at any zoom level.
//
// How the skill uses this file:
//   1. COPY this template to .sc4sap/specs/_drivers/{OBJECT}-{YYYYMMDD}.mjs
//      (or C:/Users/<user>/Desktop/... when the user specifies an absolute
//      directory).
//   2. REPLACE the three // TODO blocks:
//        - SHEETS_DATA    (text sheets — Overview, Data Model, Logic, ...)
//        - SCREEN_PARAMS  (Parameters table rendered under the wireframes)
//        - screensSheet() body (Dynpro + ALV wireframe using borders)
//      with the spec-specific content produced by sap-analyst + sap-writer.
//   3. SET OUT_PATH to the user's target file.
//   4. RUN `node <driver>.mjs`  → writes xlsx, auto-opens in default app.
//   5. DELETE the driver file on success. The xlsx is the artifact, the
//      driver is scaffolding.
//
// Zero npm dependencies — uses only node:zlib / node:fs / node:child_process.

import { deflateRawSync } from 'node:zlib';
import { writeFileSync, existsSync, unlinkSync, readdirSync, rmdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// =============================================================
// ZIP + CRC32 (no external deps — XLSX is a zip of OOXML parts)
// =============================================================
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u16(n) { const b = Buffer.alloc(2); b.writeUInt16LE(n, 0); return b; }
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0, 0); return b; }

function zipFiles(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = e.data;
    const compressed = deflateRawSync(raw, { level: 9 });
    const useDeflate = compressed.length < raw.length;
    const body = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(method),
      u16(0), u16(0), u32(crc), u32(body.length), u32(raw.length),
      u16(nameBuf.length), u16(0), nameBuf,
    ]);
    locals.push(local, body);
    const central = Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(method),
      u16(0), u16(0), u32(crc), u32(body.length), u32(raw.length),
      u16(nameBuf.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nameBuf,
    ]);
    centrals.push(central);
    offset += local.length + body.length;
  }
  const centralSize = centrals.reduce((s, p) => s + p.length, 0);
  const centralOffset = offset;
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0),
    u16(entries.length), u16(entries.length),
    u32(centralSize), u32(centralOffset), u16(0),
  ]);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

// =============================================================
// XML helpers
// =============================================================
function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function colLetter(c0) {
  let n = c0 + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
const R = (r, c) => colLetter(c) + (r + 1);

// =============================================================
// Styles catalog
//   Border slots (indices into BORDER_DEFS):
//     0 none | 1 all | 2 top | 3 bottom | 4 left | 5 right
//     6 TL  | 7 TR  | 8 BL  | 9 BR
//    10 TLR (top+left+right) | 11 LR | 12 BLR (bottom+left+right)
//
//   Fill slots:
//     0 none | 1 gray125 (OOXML default) | 2 light grey | 3 soft yellow
//     4 (RETIRED v8 — was light green; styles now point at fill 2 instead)
//     5 light sky blue (input widget — replaces grey for selection-screen params)
//
//   v8 palette rule (MANDATORY — propagated from SKILL.md):
//     · Headers / title bars / table captions → light grey (fill 2)
//     · Warnings / must-not-miss constraints → soft yellow (fill 3)
//     · Input widgets (selection-screen params) → light sky blue (fill 5)
//     · Do NOT reintroduce green. Grey + yellow is the whole palette.
//
//   Font slots:
//     0 default 11 Calibri | 1 bold 11 | 2 bold 14 | 3 bold 12
//
//   cellXfs (used via `s="N"` on each cell):
//     0 default          | 1 bold             | 2 report title (bold 14 center)
//     3 block title      | 4 ALV header       | 5 ALV data cell
//     6 input widget     | 7 label right      | 8 toolbar bold
//     9 left only        | 10 right only      | 11 top only
//    12 bottom only      | 13 TL              | 14 TR
//    15 BL               | 16 BR              | 17 frame-top TLR bold grey
//    18 all-border left  | 19 grey header     | 20 yellow highlight
//    21 bold bordered cell (for flow diagram nodes)
//    22 wrap (no border) | 23 wrap + border   | 24 wrap header (grey)
//    25 centered (no border, no fill) — flow-arrow rows ↓
// =============================================================
const BORDER_DEFS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>',
  '<border><left/><right/><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border>',
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right/><top/><bottom/><diagonal/></border>',
  '<border><left/><right style="thin"><color rgb="FF000000"/></right><top/><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right/><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border>',
  '<border><left/><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right/><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>',
  '<border><left/><right style="thin"><color rgb="FF000000"/></right><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top/><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>',
];
const CELL_XFS = [
  { },                                                                      // 0
  { font: 1 },                                                              // 1
  { font: 2, fill: 2, halign: 'center' },                                   // 2 sheet title — light grey (v7: was green) + bold 14
  { font: 3, fill: 2, border: 1, halign: 'center', valign: 'center' },      // 3 block title — light grey + bold (v8)
  { font: 1, fill: 2, border: 1, halign: 'center', valign: 'center' },      // 4 header row — light grey + bold (v8)
  { border: 1, halign: 'center', valign: 'center' },                        // 5
  { fill: 5, border: 1, halign: 'center' },                                 // 6 input widget — light sky blue + all borders
  { halign: 'right' },                                                      // 7
  { font: 1 },                                                              // 8
  { border: 4 },                                                            // 9  col-A left-only (v7: no fill, moved grey to style 2)
  { border: 5 },                                                            // 10 col-Q right-only
  { border: 2 },                                                            // 11
  { border: 3 },                                                            // 12
  { border: 6 },                                                            // 13 col-A TL (v7: no fill)
  { border: 7 },                                                            // 14
  { border: 8 },                                                            // 15 col-A BL (v7: no fill)
  { border: 9 },                                                            // 16 col-Q BR
  { border: 1, fill: 2, font: 1, halign: 'center' },                        // 17 frame-top — grey + bold + ALL borders (v8)
  { border: 1, halign: 'left', valign: 'center' },                          // 18
  { border: 1, halign: 'center', valign: 'center', font: 1, fill: 2 },      // 19 grey header (v8)
  { border: 1, fill: 3, halign: 'center', valign: 'center' },               // 20 yellow highlight
  { border: 1, font: 1, halign: 'center', valign: 'center' },               // 21 bold bordered (flow / toolbar boxes)
  { wrap: true, valign: 'top' },                                             // 22 wrap (no border)
  { border: 1, wrap: true, valign: 'top', halign: 'left' },                  // 23 wrap + border (long values)
  { border: 1, fill: 2, font: 1, wrap: true, halign: 'center', valign: 'center' }, // 24 wrap header — light grey (v8)
  { halign: 'center', valign: 'center' },                                    // 25 centered no-border no-fill — flow arrows
];

function stylesXml() {
  const fonts = `<fonts count="4">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><b/><sz val="12"/><name val="Calibri"/></font>
</fonts>`;
  const fills = `<fills count="6">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE7E6E6"/><bgColor rgb="FFE7E6E6"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor rgb="FFFFF2CC"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE2EFDA"/><bgColor rgb="FFE2EFDA"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor rgb="FFDDEBF7"/></patternFill></fill>
</fills>`;
  const borders = `<borders count="${BORDER_DEFS.length}">${BORDER_DEFS.join('')}</borders>`;
  const xfs = CELL_XFS.map(x => {
    const attrs = [
      'numFmtId="0"',
      `fontId="${x.font || 0}"`,
      `fillId="${x.fill || 0}"`,
      `borderId="${x.border || 0}"`,
      'xfId="0"',
    ];
    if (x.font) attrs.push('applyFont="1"');
    if (x.fill) attrs.push('applyFill="1"');
    if (x.border) attrs.push('applyBorder="1"');
    if (x.halign || x.valign || x.wrap) attrs.push('applyAlignment="1"');
    const align = (x.halign || x.valign || x.wrap)
      ? `<alignment${x.halign ? ` horizontal="${x.halign}"` : ''}${x.valign ? ` vertical="${x.valign}"` : ''}${x.wrap ? ' wrapText="1"' : ''}/>`
      : '';
    return `<xf ${attrs.join(' ')}>${align}</xf>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${fonts}
${fills}
${borders}
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${CELL_XFS.length}">${xfs}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

// =============================================================
// Sheet rendering:
//   Input shape:  { cells: {A1:{v,s}, ...}, merges:["A1:C1",...], cols:[{min,max,width}], rowHeights:{1:24} }
// =============================================================
function sheetXml({ cells, merges = [], cols = [], rowHeights = {} }) {
  const grouped = new Map();
  for (const [ref, c] of Object.entries(cells)) {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    const rowIdx = +m[2];
    if (!grouped.has(rowIdx)) grouped.set(rowIdx, []);
    grouped.get(rowIdx).push({ ref, ...c });
  }
  const rowXmls = [];
  for (const rowIdx of [...grouped.keys()].sort((a, b) => a - b)) {
    const cs = grouped.get(rowIdx).sort((a, b) => a.ref.localeCompare(b.ref, undefined, { numeric: true }));
    const ht = rowHeights[rowIdx] ? ` ht="${rowHeights[rowIdx]}" customHeight="1"` : '';
    const cellXmls = cs.map(c => {
      // Emit s="0" explicitly — style 0 (default) must not be dropped, else
      // a cell with style 0 and no value becomes a naked <c r="X"/> which
      // Excel flags as recoverable corruption.
      const hasStyle = (c.s !== undefined && c.s !== null);
      const styleAttr = hasStyle ? ` s="${c.s}"` : '';
      const isEmpty = (c.v === undefined || c.v === null || c.v === '');
      if (isEmpty) {
        // Skip entirely when neither style nor value — avoids <c r="X"/>.
        if (!hasStyle) return '';
        return `<c r="${c.ref}"${styleAttr}/>`;
      }
      if (typeof c.v === 'number') {
        return `<c r="${c.ref}"${styleAttr}><v>${c.v}</v></c>`;
      }
      return `<c r="${c.ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
    }).join('');
    rowXmls.push(`<row r="${rowIdx}"${ht}>${cellXmls}</row>`);
  }
  const colsXml = cols.length
    ? `<cols>${cols.map(c => `<col min="${c.min}" max="${c.max}" width="${c.width}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const mergeXml = merges.length
    ? `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
${colsXml}
<sheetData>${rowXmls.join('')}</sheetData>
${mergeXml}
</worksheet>`;
}

// =============================================================
// OOXML wrappers
// =============================================================
function contentTypes(nSheets, { hasPng = false, drawingIds = [] } = {}) {
  const overrides = [];
  overrides.push('<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>');
  overrides.push('<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>');
  for (let i = 1; i <= nSheets; i++) {
    overrides.push(`<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  }
  for (const id of drawingIds) {
    overrides.push(`<Override PartName="/xl/drawings/drawing${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
  }
  const pngDefault = hasPng ? '<Default Extension="png" ContentType="image/png"/>' : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${pngDefault}${overrides.join('')}
</Types>`;
}

// =============================================================
// Image support (v8) — embed PNG mockups produced by
// screen-image-renderer.mjs over the Inputs & Screens sheet.
//
// images shape (passed to build()):
//   [{ sheetName, pngBuffer, anchorCell: 'B3', width, height }, ...]
// Multiple images per sheet are grouped into ONE drawing.xml; distinct
// sheets get distinct drawing parts.
// =============================================================
const EMU_PER_PX = 9525; // 96 DPI

function cellRefToColRow(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  let col = 0;
  for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
  return { col: col - 1, row: parseInt(m[2], 10) - 1 };
}

function drawingXml(imgs) {
  // imgs: [{ pngBuffer, anchorCell, width, height, rid: 'rId1' }]
  const anchors = imgs.map((img, i) => {
    const { col, row } = cellRefToColRow(img.anchorCell);
    const cx = img.width * EMU_PER_PX, cy = img.height * EMU_PER_PX;
    return `<xdr:oneCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:ext cx="${cx}" cy="${cy}"/>
<xdr:pic>
<xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Image${i + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="${img.rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic>
<xdr:clientData/>
</xdr:oneCellAnchor>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
${anchors}
</xdr:wsDr>`;
}

function drawingRelsXml(imgs) {
  const rs = imgs.map((img, i) => `<Relationship Id="${img.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${img.mediaName}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rs}</Relationships>`;
}

function sheetDrawingRel(drawingId) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingId}.xml"/>
</Relationships>`;
}

function injectDrawingRef(sheetXmlStr) {
  // Worksheet already written by sheetXml(); inject <drawing> + xmlns:r.
  let s = sheetXmlStr;
  if (!/xmlns:r=/.test(s)) {
    s = s.replace('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">');
  }
  return s.replace('</worksheet>', '<drawing r:id="rId1"/></worksheet>');
}
function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}
function workbookXml(names) {
  const sheets = names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets}</sheets>
</workbook>`;
}
function workbookRels(n) {
  const rs = [];
  for (let i = 1; i <= n; i++) {
    rs.push(`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`);
  }
  rs.push(`<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rs.join('')}
</Relationships>`;
}

// =============================================================
// textSheet — auto-styles a 2D array of strings as a tabular sheet
//   (header row: bold + grey + all-borders; auto column widths)
//
// Use this for the DATA sheets (Overview, Data Model, Logic, Outputs,
// Authorization, Exceptions, Enhancements, Where-Used, etc.).
// =============================================================
// Visual width for column sizing — CJK / emoji / fullwidth count as 2
// because Calibri 11pt renders them ~2x the width of ASCII. Without this,
// Korean/Chinese/Japanese labels get truncated in auto-sized columns.
function visualWidth(s) {
  let w = 0;
  for (const ch of String(s ?? '')) {
    const cp = ch.codePointAt(0);
    if ((cp >= 0x1100 && cp <= 0x11FF) ||   // Hangul Jamo
        (cp >= 0x2E80 && cp <= 0x303F) ||   // CJK Radicals / Kangxi / Symbols
        (cp >= 0x3040 && cp <= 0x30FF) ||   // Hiragana + Katakana
        (cp >= 0x3400 && cp <= 0x9FFF) ||   // CJK Unified + Ext A
        (cp >= 0xAC00 && cp <= 0xD7AF) ||   // Hangul Syllables
        (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK Compat Ideographs
        (cp >= 0xFF00 && cp <= 0xFFEF) ||   // Fullwidth / Halfwidth
        cp >= 0x1F000) {                    // emoji + supplementary planes
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

// ─── Auto-fit defaults (MUST NOT BE TIGHTENED) ────────────────────
// The program-to-spec skill requires that NO cell content is truncated
// in the rendered xlsx. These values are calibrated for Korean/CJK text
// in Calibri 11pt, with extra headroom for bold headers and merged
// labels. If a reviewer ever reports truncation, RAISE these — never
// lower them.
//
//   WIDTH_PADDING   = 6  breathing room beyond measured visual width
//                        (bold headers + CJK glyph drift need ≥ 4; use 6)
//   WIDTH_MIN       = 12 smallest usable col (single emoji + 1 char)
//   WIDTH_MAX       = 100 upper cap — beyond this, wrap saves horizontal
//                        screen real estate without clipping
//   WRAP_THRESHOLD  = 55 cells wider than this switch to wrapText +
//                        multi-line row height (≈ 2 Korean sentences)
const WIDTH_PADDING     = 6;
const WIDTH_MIN         = 12;
const WIDTH_MAX         = 100;
const WRAP_THRESHOLD    = 55;
const LINE_HEIGHT_PT    = 16.875; // per wrapped line — matches Google Sheets' xlsx baseline
                                  // (16.875 × 2 = 33.75, × 4 = 67.5 — the common 2-/4-line heights
                                  // produced when reviewers re-save in Sheets). v8 used 17 which
                                  // gave 34 / 68 — visually identical but didn't round-trip cleanly.
const HEADER_ROW_HEIGHT = 22.5;   // explicit row-1 height for bold header — gives the title row
                                  // breathing room above data, matches the reference reviewers expect.
const WARNING_ROW_HEIGHT = 22.5;  // sheet 3 yellow warning rows — same breathing room as headers.
const MAX_ROW_HEIGHT    = 300;    // row-height cap (some rules/long narratives need 5+ lines)

// Row height per line count — Google Sheets uses inconsistent multipliers
// (16.875 for 2/4 lines, 17 for 3 lines). Single-multiplier formulas give
// 50.625 instead of 51 for 3-line rows. The lookup table reproduces REF
// exactly for 2-, 3-, 4-line cells; 5+ falls back to LINE_HEIGHT_PT × n.
const HEIGHT_BY_LINES = { 2: 33.75, 3: 51, 4: 67.5 };
function rowHeightForLines(n) {
  return HEIGHT_BY_LINES[n] ?? Math.min(n * LINE_HEIGHT_PT, MAX_ROW_HEIGHT);
}

// textSheet(rows, opts) — opts.colWidths is an optional array of explicit column widths
// (in xlsx col-width units, e.g. 26, 145.71). When provided, auto-fit is bypassed and
// consecutive same-width entries are grouped (`<col min=4 max=6 width=12/>`). When omitted,
// the v4 CJK-aware auto-fit metric runs (WIDTH_MAX=100, WRAP_THRESHOLD=55).
//
// Use explicit colWidths when reverse-engineering a known reference (program-to-spec output
// must match the analyst's reviewed widths) — auto-fit is fine for greenfield specs.
function textSheet(rows, opts = {}) {
  const cells = {};
  const rowHeights = {};
  const maxCols = Math.max(...rows.map(r => r.length));
  const explicitWidths = Array.isArray(opts.colWidths) ? opts.colWidths : null;

  // Pass 1a — ALWAYS compute auto-fit widths first (CJK-aware, capped at
  // WRAP_THRESHOLD). These drive ROW HEIGHT calculations even when the
  // emitted column widths are overridden via colWidths — this matches the
  // reference behavior where users widened specific columns in Sheets but
  // row heights kept their original "narrow column wrap" line counts. If
  // we computed row heights against the wide explicit widths, every long
  // cell would shrink to 2 lines and the spec would lose the visual rhythm
  // reviewers expect (220-char Note → 4 lines @ 67.5, not 2 @ 33.75).
  const autoCols = [];
  for (let c = 0; c < maxCols; c++) {
    let maxVw = 0;
    for (const row of rows) {
      const vw = visualWidth(row[c] ?? '');
      maxVw = Math.max(maxVw, Math.min(vw, WRAP_THRESHOLD));
    }
    const width = Math.min(Math.max(maxVw + WIDTH_PADDING, WIDTH_MIN), WIDTH_MAX);
    autoCols.push({ min: c + 1, max: c + 1, width });
  }

  // Pass 1b — emitted cols. Use explicit widths when provided (with same-width
  // grouping). Auto-fit otherwise.
  let cols;
  if (explicitWidths) {
    cols = [];
    let i = 0;
    while (i < explicitWidths.length) {
      const w = explicitWidths[i];
      let j = i;
      while (j + 1 < explicitWidths.length && explicitWidths[j + 1] === w) j++;
      cols.push({ min: i + 1, max: j + 1, width: w });
      i = j + 1;
    }
    if (explicitWidths.length < maxCols) {
      cols.push({ min: explicitWidths.length + 1, max: maxCols, width: WIDTH_MIN });
    }
  } else {
    cols = autoCols;
  }

  // Header row gets explicit breathing room (REF baseline). Data rows stay
  // at the workbook default (~15) unless they contain a "long" cell.
  if (rows.length > 0) rowHeights[1] = HEADER_ROW_HEIGHT;

  // Pass 2 — emit cells, apply wrap style for long values, compute row heights
  // against AUTO-FIT widths so wraps match the reference cadence.
  rows.forEach((row, rIdx) => {
    let maxLines = 1;
    let anyLong = false;
    row.forEach((val, cIdx) => {
      const ref = R(rIdx, cIdx);
      const vw = visualWidth(val);
      const usable = Math.max(1, (autoCols[cIdx]?.width ?? WIDTH_MIN) - WIDTH_PADDING);
      const isLong = vw > WRAP_THRESHOLD;
      // Header row 0 → style 4 (bold grey border, non-wrap) for short headers,
      //                style 24 (wrap header) when long.
      // Data rows    → style 23 (wrap + border) when long, else style 18
      //                (all-border + left align). Every data cell gets a
      //                border so the spec reads as a uniform grid.
      const style = rIdx === 0
        ? (isLong ? 24 : 4)
        : (isLong ? 23 : 18);
      cells[ref] = { v: val, s: style };
      if (isLong) {
        anyLong = true;
        const lines = Math.ceil(vw / usable);
        if (lines > maxLines) maxLines = lines;
      }
    });
    if (rIdx > 0 && anyLong) {
      const lines = Math.max(2, maxLines);
      rowHeights[rIdx + 1] = rowHeightForLines(lines);
    }
  });

  return { cells, merges: [], cols, rowHeights };
}

// =============================================================
// appendProcessFlow — append a vertical flowchart below the data
//   table on a textSheet payload. Used by build() to decorate the
//   Processing Logic sheet automatically when PROCESS_FLOW is non-empty.
//
// Layout (3-col span = matches the ABAP Logic sheet's #/Event/Step grid):
//   row N+1   blank spacer
//   row N+2   "Process Flow Chart" heading       (style 17, A:C merged)
//   row N+3   first node (box / decision)        (A:C merged, ↓ stacked)
//   row N+4   "↓"                                 (style 25, no border)
//   row N+5   next node ...
//
// Node convention (each PROCESS_FLOW item is a single string):
//   · Plain text                → bordered box (style 21)
//   · Prefix '?' → decision       → yellow box (style 20), '?' stripped, '◇ ' added
//   · Prefix '!' → terminal/exit  → bordered box, '■ ' added (END / RETURN /
//                                   LEAVE LIST-PROCESSING markers)
//
// Decision branches that need a separate side-arm row are described inside
// the decision string itself with " → " (e.g. "? gt_result IS INITIAL → MESSAGE + LEAVE")
// — the renderer keeps everything on one row so the chart stays compact in
// a 3-column grid. For programs that need true two-branch fan-out, drivers
// can render the branch as the next node prefixed with "└─ " or similar.
// =============================================================
function appendProcessFlow(payload, items, opts = {}) {
  if (!Array.isArray(items) || items.length === 0) return payload;
  const { cells, merges, rowHeights, cols } = payload;
  const heading = opts.heading || 'Process Flow Chart';
  const colSpan = Math.max(1, Math.min(3, cols.length || 3));
  const lastCol = colLetter(colSpan - 1);

  // Find next free row by scanning current cells.
  let maxRow = 0;
  for (const ref of Object.keys(cells)) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (m) maxRow = Math.max(maxRow, +m[2]);
  }

  let r = maxRow + 2; // 1 blank spacer row between table and heading

  // Heading row — style 17 (grey + bold + all borders).
  cells[R(r - 1, 0)] = { v: heading, s: 17 };
  for (let c = 1; c < colSpan; c++) cells[R(r - 1, c)] = { s: 17 };
  if (colSpan > 1) merges.push(`A${r}:${lastCol}${r}`);
  rowHeights[r] = 22;
  r++;

  items.forEach((raw, idx) => {
    const txt = String(raw ?? '');
    const isDecision = /^\?\s*/.test(txt);
    const isTerminal = /^!\s*/.test(txt);
    const label = isDecision ? `◇ ${txt.replace(/^\?\s*/, '')}`
                : isTerminal ? `■ ${txt.replace(/^!\s*/, '')}`
                : txt;
    const style = isDecision ? 20 : 21;

    cells[R(r - 1, 0)] = { v: label, s: style };
    for (let c = 1; c < colSpan; c++) cells[R(r - 1, c)] = { s: style };
    if (colSpan > 1) merges.push(`A${r}:${lastCol}${r}`);
    rowHeights[r] = 24;
    r++;

    if (idx < items.length - 1) {
      // Centered "↓" arrow row, no border / no fill — visually links boxes.
      cells[R(r - 1, 0)] = { v: '↓', s: 25 };
      for (let c = 1; c < colSpan; c++) cells[R(r - 1, c)] = { s: 25 };
      if (colSpan > 1) merges.push(`A${r}:${lastCol}${r}`);
      rowHeights[r] = 16;
      r++;
    }
  });

  return payload;
}

// =============================================================
// TODO (per-spec): SHEETS_DATA — fill with text sheets.
//   Shape: [{ name: 'Overview', rows: [[header...], [row...], ...], colWidths? }, ...]
//
//   Optional `colWidths`: array of explicit column widths in xlsx units
//   (e.g. [26, 145.71]). When provided, auto-fit is bypassed and consecutive
//   same-width entries are grouped into a single <col> XML node. Use this when
//   reverse-engineering a known reference file (the analyst's reviewed widths
//   must round-trip exactly). Omit for greenfield specs — auto-fit picks
//   reasonable widths from the v4 CJK-aware metric.
// =============================================================
const SHEETS_DATA = [
  // Example — REPLACE:
  // {
  //   name: 'Overview',
  //   rows: [
  //     ['Field', 'Value'],
  //     ['Object Name', '{OBJECT}'],
  //     ['Object Type', '{TYPE}'],
  //     // ...
  //   ],
  // },
];

// =============================================================
// TODO (per-spec): PROCESS_FLOW — vertical flowchart appended to the
//   `Processing Logic` sheet (matched by name = PROCESS_FLOW_SHEET).
//
//   Each entry is one node string. Conventions:
//     · plain text   → bordered box (style 21)
//     · '?' prefix   → decision (yellow style 20), prefix stripped → '◇ '
//     · '!' prefix   → terminal/exit (bordered), prefix stripped → '■ '
//
//   Decisions can fold a single branch into the same row using ' → ',
//   e.g. '? gt_result IS INITIAL → MESSAGE + LEAVE LIST-PROCESSING'.
//
//   Empty array = no flowchart rendered (the heading is also skipped).
//   Localise PROCESS_FLOW_HEADING per spec language as needed.
//
// Example:
//   const PROCESS_FLOW = [
//     'INITIALIZATION — set S_ERDAT default (current month BOM~EOM)',
//     'User submits selection screen',
//     'FORM get_data — SELECT VBAK + VBAP + KNA1 + MAKT (4-way JOIN)',
//     '? gt_result IS INITIAL → MESSAGE "데이터 없음" + LEAVE LIST-PROCESSING',
//     'FORM display_alv — cl_salv_table=>factory + columns + aggregations',
//     'go_salv->display() — ALV displayed',
//     '? hotspot click on VBELN → CALL TRANSACTION VA03 SKIP FIRST SCREEN',
//     '! END',
//   ];
// =============================================================
const PROCESS_FLOW = [];
const PROCESS_FLOW_SHEET = 'Processing Logic';   // sheet name to attach flowchart to
const PROCESS_FLOW_HEADING = 'Process Flow Chart'; // localise per spec language

// =============================================================
// TODO (per-spec): SCREEN_PARAMS — parameters of the object.
//   Rendered as a bordered table BELOW the wireframes on the
//   `Inputs & Screens` sheet via paramsBlock(). Always emitted,
//   even when the object has no screens (for pure FM / Class / CDS /
//   RAP inputs, this is the only input documentation on the sheet).
//
//   Shape: [{ field, type, required, defaultVal, description }, ...]
//   Source per archetype:
//     Report      → PARAMETERS / SELECT-OPTIONS
//     FM / Class  → IMPORTING parameters
//     CDS         → view parameters (@parameters)
//     RAP         → action input structure fields
// =============================================================
const SCREEN_PARAMS = [
  // Example — REPLACE:
  // { field: 'P_BUKRS', type: 'BUKRS', required: 'X', defaultVal: '1000', description: 'Company code' },
  // { field: 'S_BUDAT', type: 'BUDAT', required: 'X', defaultVal: '',     description: 'Posting date range' },
];

// =============================================================
// TODO (per-spec): SHEET_TITLE — localised Inputs & Screens sheet title.
//   Shown in row 1 (merged A:Q, grey style 2). Localise per spec language:
//     KO → '입력 및 화면 · {OBJECT}'
//     JA → '入力と画面 · {OBJECT}'
//     EN → 'Inputs & Screens · {OBJECT}'
// =============================================================
const SHEET_TITLE = 'Inputs & Screens';

// =============================================================
// TODO (per-spec): SELECTION_IMAGE_SPEC — selection-screen field list.
//   Consumed by BOTH paths:
//     · Primary (image) — renderScreenImages() in screen-image-renderer.mjs
//                         produces a PNG that overlays rows 3–16 at B3.
//     · Fallback (wireframe) — when headless browser unavailable, the same
//                         spec is rendered as cell-border wireframe by
//                         renderSelectionWireframe() inside screensSheet().
//   Leave `null` if the object has no selection screen (pure FM / Class /
//   CDS / RAP without UI). The Parameters table below is still rendered.
//
//   Shape: { blockLabel, fields: [{...}], optionBlockLabel, optionFields: [{...}] }
//     field:         { required?, label, name, range?, defaultLow?, defaultHigh?, note? }
//     optionField:   { label, name, note? }
// =============================================================
const SELECTION_IMAGE_SPEC = null;
// Example — REPLACE:
// const SELECTION_IMAGE_SPEC = {
//   blockLabel: '조회 조건',
//   fields: [
//     { required: true, label: '회사코드',   name: 'P_BUKRS',                              defaultLow: '1000'                     },
//     { required: true, label: '구매조직',   name: 'S_EKORG', range: true,                 defaultLow: '1000', defaultHigh: '9999' },
//     { required: true, label: '전표일자',   name: 'S_BUDAT', range: true,                 defaultLow: '당월1일', defaultHigh: '오늘' },
//   ],
//   optionBlockLabel: '옵션',
//   optionFields: [
//     { label: '테스트 모드', name: 'P_TEST', note: '(체크 시 DB 업데이트 생략)' },
//   ],
// };

// =============================================================
// TODO (per-spec): ALV_IMAGE_SPEC — output ALV layout spec.
//   Consumed by both image path and wireframe fallback.
//   maxRows capped at 5 (default 3) — ALV is a mockup, never a data dump.
//   Leave `null` for non-ALV outputs (pure FM exporting structs, OData
//   entity returns, etc.) — BAPI/Action table below will still show them.
//
//   Shape: { columns: [{...}], sampleRows: [{...}], maxRows? }
//     column:        { name, header?, width?, align?, hotspot?, editable? }
//     sampleRow:     { [colName]: value, _status?: '●'|'○'|'◉', _locked?: bool }
// =============================================================
const ALV_IMAGE_SPEC = null;
// Example — REPLACE:
// const ALV_IMAGE_SPEC = {
//   columns: [
//     { name: '_status', header: '',         width: 40                         },
//     { name: 'EBELN',   header: '구매오더', width: 110, hotspot: true         },
//     { name: 'EBELP',   header: '항목',     width: 50,  align: 'end'          },
//     { name: 'MATNR',   header: '자재',     width: 140                         },
//     { name: 'MENGE',   header: '수량',     width: 90,  align: 'end'          },
//     { name: 'NETPR',   header: '단가',     width: 90,  align: 'end'          },
//   ],
//   sampleRows: [
//     { _status: '◉', EBELN: '4500001234', EBELP: '10', MATNR: 'RAW-001', MENGE: '100', NETPR: '1,250.00' },
//     { _status: '●', EBELN: '4500001234', EBELP: '20', MATNR: 'RAW-002', MENGE:  '50', NETPR:   '880.00' },
//     { _status: '○', EBELN: '4500001235', EBELP: '10', MATNR: 'RAW-003', MENGE: '200', NETPR: '2,100.00' },
//   ],
//   maxRows: 3,
// };

// =============================================================
// paramsBlock — append a "Parameters" table below existing sheet
//   content (e.g. under the wireframes drawn in screensSheet).
//
// Uses the same 17-col grid (A..Q) shared with screensSheet:
//   A        = left frame (style 9)
//   B:D      = Field       (header style 4 → data style 5)
//   E:F      = Type        (")
//   G:H      = Required    (")
//   I:K      = Default     (")
//   L:P      = Description (")
//   Q        = right frame (style 10)
//
// Rows:
//   row startRow      → merged A:Q title bar 'Parameters' (style 17)
//   row startRow+1    → header row (Field / Type / Required / Default / Description)
//   row startRow+2..  → one row per parameter
//
// Call AFTER drawing wireframes, ~1–2 rows below the last closing frame
// row, so the params table reads as a caption of the screen above.
//
// Returns the next free row number (1-based).
// =============================================================
function paramsBlock(cells, merges, rowHeights, startRow, params = []) {
  const COLS = [[1, 3], [4, 5], [6, 7], [8, 10], [11, 15]]; // B:D E:F G:H I:K L:P
  const HEADERS = ['Field', 'Type', 'Required', 'Default', 'Description'];
  let r = startRow;

  // Title bar — merged A:Q, grey + bold.
  cells[R(r - 1, 0)] = { v: 'Parameters', s: 17 };
  for (let c = 1; c <= 16; c++) cells[R(r - 1, c)] = { s: 17 };
  merges.push(`A${r}:Q${r}`);
  rowHeights[r] = 20;
  r++;

  // Header row — left/right frame + merged column groups.
  cells[R(r - 1, 0)] = { s: 9 };
  HEADERS.forEach((h, i) => {
    const [c0, c1] = COLS[i];
    cells[R(r - 1, c0)] = { v: h, s: 4 };
    for (let c = c0 + 1; c <= c1; c++) cells[R(r - 1, c)] = { s: 4 };
    merges.push(`${colLetter(c0)}${r}:${colLetter(c1)}${r}`);
  });
  cells[R(r - 1, 16)] = { s: 10 };
  r++;

  // Data rows — empty array still leaves the header visible as a stub.
  for (const p of params) {
    cells[R(r - 1, 0)] = { s: 9 };
    const vals = [p.field, p.type, p.required, p.defaultVal, p.description];
    vals.forEach((v, i) => {
      const [c0, c1] = COLS[i];
      cells[R(r - 1, c0)] = { v: v ?? '', s: 5 };
      for (let c = c0 + 1; c <= c1; c++) cells[R(r - 1, c)] = { s: 5 };
      merges.push(`${colLetter(c0)}${r}:${colLetter(c1)}${r}`);
    });
    cells[R(r - 1, 16)] = { s: 10 };
    r++;
  }

  return r;
}

// =============================================================
// Screen-sheet render helpers — kept for FALLBACK cell-border wireframes
// when no headless browser is available for image rasterization (v8).
//
// v8 note: the PRIMARY path for Selection + ALV is now embedded PNG
// images produced by scripts/spec/screen-image-renderer.mjs. These
// helpers are still used for:
//   · Flow diagram rows (grey styled)
//   · BAPI mapping rows (grey styled)
//   · Yellow warning rows at the BOTTOM of the sheet (style 20)
//   · Full fallback wireframe when rasterizer returns null
// =============================================================
function screenFrameRow(cells, row) {
  cells[R(row - 1, 0)]  = { s: 9 };   // col A — left border
  cells[R(row - 1, 16)] = { s: 10 };  // col Q — right border
}
function screenCloseFrame(cells, row) {
  cells[R(row - 1, 0)] = { s: 15 };                              // BL
  for (let c = 1; c <= 15; c++) cells[R(row - 1, c)] = { s: 12 }; // bottom only
  cells[R(row - 1, 16)] = { s: 16 };                              // BR
}
// Full-width row (A:Q merged) — use for sheet titles, section titles,
// standalone banners. Style applied to ALL cells so outer borders render.
function screenFullRow(cells, merges, row, val, s) {
  cells[R(row - 1, 0)] = { v: val, s };
  for (let c = 1; c <= 16; c++) cells[R(row - 1, c)] = { s };
  merges.push(`A${row}:Q${row}`);
}
// Sub-title INSIDE a frame section. Keeps col A/Q frame borders intact
// (A=9, Q=10) and merges B:P for the label. Style applied to every cell
// in the B:P merge so borders render if the style carries any.
function screenSubtitleRow(cells, merges, row, val, s = 1) {
  cells[R(row - 1, 0)]  = { s: 9 };
  cells[R(row - 1, 1)]  = { v: val, s };
  for (let c = 2; c <= 15; c++) cells[R(row - 1, c)] = { s };
  cells[R(row - 1, 16)] = { s: 10 };
  merges.push(`B${row}:P${row}`);
}
// Merged cell whose outer rectangle renders — style set on every cell in
// the merge range so Excel draws the full perimeter (critical for input
// boxes F:H / K:M which otherwise lose their right+bottom edges).
function screenMerge(cells, merges, row, c0, c1, style, value) {
  cells[R(row - 1, c0)] = { v: value ?? '', s: style };
  for (let c = c0 + 1; c <= c1; c++) cells[R(row - 1, c)] = { s: style };
  if (c1 > c0) merges.push(`${colLetter(c0)}${row}:${colLetter(c1)}${row}`);
}

// =============================================================
// FALLBACK WIREFRAME RENDERERS (v8 — activated when headless browser
// unavailable, so the same SELECTION_IMAGE_SPEC / ALV_IMAGE_SPEC still
// produces a readable layout with cell-border wireframes).
// =============================================================

// Selection-screen wireframe, rendered as cell-border rows. Column layout
// matches workflow-steps.md "Selection-screen parameter-row alignment":
//   B:E label (style 7) · F:H low (style 6) · I ▼ (style 0)
//   J ~ (style 7, range only) · K:M high (style 6, range only)
//   N ▼ (range only) · O:P note (style 0)
function renderSelectionWireframe(cells, merges, rowHeights, startRow, spec) {
  const fields = spec.fields || [];
  const optionFields = spec.optionFields || [];
  const blockLabel = spec.blockLabel || '조회 조건';
  let r = startRow;

  // Block title bar — grey, all borders (style 17).
  screenFullRow(cells, merges, r, `◆ ${blockLabel}`, 17);
  rowHeights[r] = 20;
  r++;

  for (const f of fields) {
    screenFrameRow(cells, r);  // col A / Q frame continuity
    const prefix = f.required ? '* ' : '  ';
    const label = `${prefix}${f.label || ''} (${f.name || ''})`;
    screenMerge(cells, merges, r, 1, 4, 7, label);                     // B:E label
    screenMerge(cells, merges, r, 5, 7, 6, f.defaultLow || '');        // F:H low input (sky blue)
    cells[R(r - 1, 8)] = { v: '▼', s: 0 };                             // I dropdown
    if (f.range) {
      cells[R(r - 1, 9)] = { v: '~', s: 7 };                           // J range separator
      screenMerge(cells, merges, r, 10, 12, 6, f.defaultHigh || '');   // K:M high input
      cells[R(r - 1, 13)] = { v: '▼', s: 0 };                          // N dropdown
    }
    screenMerge(cells, merges, r, 14, 15, 0, f.note || '');            // O:P note
    rowHeights[r] = 18;
    r++;
  }

  // Optional checkbox block (if present).
  if (optionFields.length) {
    screenSubtitleRow(cells, merges, r, `◆ ${spec.optionBlockLabel || '옵션'}`, 17);
    r++;
    for (const f of optionFields) {
      screenFrameRow(cells, r);
      screenMerge(cells, merges, r, 1, 4, 7, `☐ ${f.label || ''} (${f.name || ''})`);
      screenMerge(cells, merges, r, 5, 15, 0, f.note || '');
      rowHeights[r] = 18;
      r++;
    }
  }

  screenCloseFrame(cells, r);
  return r + 1;
}

// ALV-layout wireframe, rendered as cell-border rows. Columns distribute
// evenly across B..P (15 cells of 14-unit width each = 210 units total).
// Header = style 4 (grey bordered), data = style 5 (bordered).
function renderAlvWireframe(cells, merges, rowHeights, startRow, spec) {
  const columns = spec.columns || [];
  const sampleRows = (spec.sampleRows || []).slice(0, Math.max(1, Math.min(spec.maxRows || 3, 5)));
  let r = startRow;

  // Title bar.
  screenFullRow(cells, merges, r, '◆ ALV 그리드', 17);
  rowHeights[r] = 20;
  r++;

  const layout = distributeAlvColumns(columns.length);
  if (!layout.length) {
    screenCloseFrame(cells, r);
    return r + 1;
  }

  // Header row.
  screenFrameRow(cells, r);
  columns.forEach((c, i) => {
    const [c0, c1] = layout[i];
    screenMerge(cells, merges, r, c0, c1, 4, c.header || c.name || '');
  });
  rowHeights[r] = 20;
  r++;

  // Sample data rows — capped at maxRows (default 3, absolute max 5).
  for (const row of sampleRows) {
    screenFrameRow(cells, r);
    columns.forEach((c, i) => {
      const [c0, c1] = layout[i];
      const v = row[c.name];
      screenMerge(cells, merges, r, c0, c1, 5, v == null ? '' : String(v));
    });
    rowHeights[r] = 18;
    r++;
  }

  screenCloseFrame(cells, r);
  return r + 1;
}

// Distribute N columns across cells 1..15 (B:P). Returns [[c0,c1], ...].
// Extra cells prepended to leading columns so widest-header columns (usually
// placed first) get the extra real estate.
function distributeAlvColumns(n) {
  if (n <= 0) return [];
  const total = 15;
  const base = Math.floor(total / n);
  const extra = total - base * n;
  const out = [];
  let c = 1;
  for (let i = 0; i < n; i++) {
    const width = base + (i < extra ? 1 : 0);
    out.push([c, c + width - 1]);
    c += width;
  }
  return out;
}

// =============================================================
// screensSheet — Inputs & Screens sheet body (v8).
//
// V8 SHEET ORDER (TOP → BOTTOM)
//   1. Sheet title                         style 2  (light grey, merged A:Q)
//   2. Image anchor rows                   blank rows where PNGs overlay
//        · Selection-screen image at B3   (driver-supplied anchor)
//        · ALV layout image at B{dyn}     (anchor row computed by build()
//                                          from the selection PNG's real
//                                          pixel height — legacy static
//                                          B19 overflowed for >5 fields)
//      Reserve those rows EMPTY in cells{}. buildImages() in build() lays
//      the PNG on top via oneCellAnchor.
//   3. Flow diagram (informational)        style 21 boxes, style 0 arrows
//   4. BAPI / Action mapping (informational) style 18 cells, no heavy fill
//   5. Parameters table                    paramsBlock() — header style 4,
//                                          data style 5 (grey header only)
//   6. Yellow warnings                     MUST be at the BOTTOM of the sheet
//        · Authority / Auth-check caveats  style 20, merged A:Q
//        · Data-volume / runtime caveats   style 20, merged A:Q
//      Rationale: readers scan top→bottom; constraints sit last so the
//      positive content (screens + parameters) isn't drowned in warnings.
//
// V8 COLOR RULES
//   · Headers / title bars / table captions → GREY (fill 2) — NEVER green.
//   · Warnings (must-not-miss) → YELLOW (fill 3), style 20.
//   · Input widgets on wireframe → SKY BLUE (fill 5), style 6.
//   · Informational rows (flow, BAPI) → NO FILL beyond optional grey header.
//     Keep them uncluttered — the images carry the visual weight.
//
// V8 IMAGE PIPELINE (see scripts/spec/screen-image-renderer.mjs)
//   const { renderScreenImages } = await import('./screen-image-renderer.mjs');
//   const imgs = await renderScreenImages({
//     selection: { fields: [...], optionFields: [...] },
//     alv:       { columns: [...], sampleRows: [...], maxRows: 3 },
//   });
//   // Pass to build():
//   const images = [];
//   if (imgs.selection) images.push({ sheetName: INPUTS_SHEET_NAME, anchorCell: 'B3',
//                                     pngBuffer: imgs.selection.pngBuffer,
//                                     width: imgs.selection.width, height: imgs.selection.height });
//   if (imgs.alv)       images.push({ sheetName: INPUTS_SHEET_NAME, anchorCell: 'B19',
//                                     pngBuffer: imgs.alv.pngBuffer,
//                                     width: imgs.alv.width, height: imgs.alv.height });
//   build(OUT_PATH, { images });
//
//   ALV sample rows MUST be capped at 3 (up to 5 when showing lock/edit/mixed-
//   status variants). Never emit >5 — a mockup, not a data dump.
//
//   If imgs.selection / imgs.alv is null (no headless browser), fall back
//   to the legacy cell-border wireframe via screenFullRow / screenMerge
//   helpers — DO NOT silently omit the screens.
//
// LAYOUT GRID (17-col)
//   A=3, B..P=14 each, Q=3. Max full-width merge = A:Q.
//
// RETURN SHAPE
//   { cells, merges, cols, rowHeights }
// =============================================================
function screensSheet({
  hasSelectionImg = false,
  hasAlvImg = false,
  alvStartRow = 19,        // Dynamically computed by build() from selection PNG height.
  paramsStartRow = 49,     // Dynamically computed by build() from ALV PNG height.
} = {}) {
  const cells = {};
  const merges = [];
  // Col F (col 6) is widened so the Parameters table's Type column (E:F merge)
  // can show full SELECT-OPTIONS / DDIC type strings without clipping
  // (e.g. "SELECT-OPTIONS → VBAK-VKORG (VKORG CHAR4)" — 40 chars). Other B..P
  // cols stay at 14 to preserve the selection-screen widget grid (B:E label,
  // F:H low input, K:M high input). The fallback wireframe's F:H low-input
  // merge becomes lopsided (50.71 + 14 + 14 = 78.71 vs K:M 42), but PNG embed
  // is the v8.1+ primary path so the wireframe is rarely seen.
  const cols = [
    { min: 1, max: 1,  width: 3      },
    { min: 2, max: 5,  width: 14     },
    { min: 6, max: 6,  width: 50.71  },
    { min: 7, max: 16, width: 14     },
    { min: 17, max: 17, width: 3     },
  ];
  const rowHeights = { 1: 30 };

  // Row 1 — sheet title (always rendered, grey style 2, merged A:Q).
  screenFullRow(cells, merges, 1, SHEET_TITLE, 2);

  // Selection area — starts at row 3.
  //   · PNG overlay when hasSelectionImg (leave cells blank so image is visible).
  //   · Cell-border wireframe when SELECTION_IMAGE_SPEC present but no image.
  //   · Blank when spec is null (object has no selection screen).
  if (!hasSelectionImg && SELECTION_IMAGE_SPEC) {
    renderSelectionWireframe(cells, merges, rowHeights, 3, SELECTION_IMAGE_SPEC);
  }

  // ALV area — starts at alvStartRow (dynamic; defaults to 19 for wireframe).
  if (!hasAlvImg && ALV_IMAGE_SPEC) {
    renderAlvWireframe(cells, merges, rowHeights, alvStartRow, ALV_IMAGE_SPEC);
  }

  // Flow diagram / BAPI mapping rows: drivers may add additional content
  // between ALV and Parameters via a post-build edit.

  // Parameters table — grey header, full-bordered data rows.
  let r = paramsStartRow;
  r = paramsBlock(cells, merges, rowHeights, r, SCREEN_PARAMS);

  // WARNINGS — MUST be the last content on the sheet (v8 rule). Rendered
  // automatically from the top-level WARNINGS constant so every spec that
  // populates it gets consistent yellow bottom rows without driver copies
  // needing to call screenFullRow(...) by hand. Empty WARNINGS = no rows.
  if (Array.isArray(WARNINGS) && WARNINGS.length) {
    r += 1;                 // one blank spacer row below Parameters
    rowHeights[r] = 8;      // slim spacer so the warning block stays close
    for (const msg of WARNINGS) {
      r += 1;
      screenFullRow(cells, merges, r, String(msg), 20);
      rowHeights[r] = WARNING_ROW_HEIGHT;
    }
  }

  return { cells, merges, cols, rowHeights };
}

// =============================================================
// TODO (per-spec): set output path
// =============================================================
const OUT_PATH = 'CHANGE_ME.xlsx';

// =============================================================
// Sheet name for the screens/inputs sheet. Override per-spec for
// localised specs (e.g. '입력 및 화면' for KO, '入力と画面' for JA).
// Default is English so ASCII-only tooling reads cleanly.
// =============================================================
const INPUTS_SHEET_NAME = 'Inputs & Screens';

// =============================================================
// Spec language — drives the auto-derived legend text inside the
// Selection / ALV PNGs produced by screen-image-renderer.mjs. Accepts
// 'ko' | 'en' | 'ja'. Default is Korean because the template was first
// shipped KO-only; English specs MUST set 'en' or they'll render with
// Korean legend strings (필수 입력, 범위(LOW~HIGH), …).
// =============================================================
const SPEC_LANG = 'ko';

// =============================================================
// TODO (per-spec): WARNINGS — yellow-shaded caveat rows pinned to the
//   BOTTOM of the Inputs & Screens sheet (v8 rule: constraints sit last).
//
//   These are program-specific, NOT boilerplate. Fill with the analyst's
//   actual findings: auth gaps, data-volume risk, dependencies, PII, etc.
//   An empty array means "no caveats to flag" — the template renders
//   nothing and keeps the sheet clean.
//
//   Each entry is a single plain-text string (A:Q merged, style 20 yellow).
//   Prefix with ⚠ so the row is scannable. Examples:
//     '⚠ Authorization (GAP): No AUTHORITY-CHECK — add V_VBAK_VKO for row-level.'
//     '⚠ Runtime: 4-way JOIN returns cartesian item×header rows; keep VKORG + date tight.'
//     '⚠ PII: KNA1~NAME1 exposed in output; mask for non-SD audiences.'
// =============================================================
const WARNINGS = [];

// =============================================================
// Build + auto-open
// =============================================================
// Excel sheet name rules (enforced here so a typo in SHEETS_DATA doesn't
// produce a file that opens with a "recovered contents" dialog):
//   · Forbidden characters: \ / ? * [ ]
//   · Max length: 31 characters
//   · Must not be blank; must not start/end with apostrophe
//   · Must be unique within the workbook
function sanitizeSheetName(name, seenNames) {
  let n = String(name ?? '').replace(/[\\/?*\[\]]/g, '-');
  n = n.replace(/^'+|'+$/g, '');
  if (n.length > 31) n = n.slice(0, 31);
  if (!n) n = 'Sheet';
  let candidate = n, i = 2;
  while (seenNames.has(candidate)) {
    const suffix = ` (${i})`;
    candidate = n.slice(0, 31 - suffix.length) + suffix;
    i++;
  }
  seenNames.add(candidate);
  return candidate;
}

// build({ outPath, images })
//   images — optional array from screen-image-renderer.renderScreenImages():
//     [{ sheetName, pngBuffer, anchorCell:'B3', width, height }, ...]
//   Anchor cell is on the target sheet (usually INPUTS_SHEET_NAME).
//   Omit or pass [] → v8 degrades gracefully to cell-border wireframes.
function build(outPath, { images = [] } = {}) {
  // Pre-analyse image anchors so screensSheet() knows whether to skip the
  // cell-border wireframe (image will overlay) or draw it (no image for
  // that section, so readers still see the layout).
  //
  // Drivers hand us images with two sentinel anchors:
  //   · 'B3'  → selection-screen PNG
  //   · 'B19' → ALV layout PNG
  // The B19 sentinel is the ORIGINAL (static) anchor from v8.0. We keep
  // matching on it here because it's the contract with buildImages() /
  // external drivers. The anchor is REWRITTEN below once we know the real
  // selection image height.
  const hasSelectionImg = images.some(img => (img.anchorCell || '').toUpperCase() === 'B3');
  const hasAlvImg       = images.some(img => (img.anchorCell || '').toUpperCase() === 'B19');

  // ── Dynamic anchor layout (v8.2 fix) ──────────────────────────
  // The selection PNG height is a function of field count:
  //   renderSelectionScreenSVG: h = 40 + N*24 + 60 + (M ? 24+M*24 : 0) + 60
  // so it easily exceeds the 16-row (≈320 px @ default row height 15 pt)
  // span that the legacy static anchor B3→B19 assumed. Anything beyond
  // ~5 fields + 1 option (the smoke case, 328 px) spills into the B19
  // anchor row and the later-drawn ALV image paints on top, visually
  // cropping the bottom of the selection image.
  // Fix: read each image's actual pixel height and place the ALV anchor
  // (and the Parameters table below it) at computed rows so there is
  // never any overlap, regardless of how many fields / option-fields the
  // selection screen has.
  const DEFAULT_ROW_PX = 20;     // Excel default row height (15 pt @ 96 DPI).
  const IMG_GAP_PX = 20;         // One-row visual gap below each image.
  const PARAMS_GAP_ROWS = 2;     // Breathing room between ALV block and Parameters table.
  const selImg = images.find(img => (img.anchorCell || '').toUpperCase() === 'B3');
  const alvImg = images.find(img => (img.anchorCell || '').toUpperCase() === 'B19');
  // Rows the selection image (or wireframe) occupies, starting at row 3.
  // If selection is absent we fall back to the legacy 16-row span so
  // wireframe-only / alv-only specs keep their original layout.
  const selRowsSpan = selImg ? Math.ceil((selImg.height + IMG_GAP_PX) / DEFAULT_ROW_PX) : 16;
  const alvStartRow = 3 + selRowsSpan;
  // Rows the ALV image (or wireframe) occupies.
  const alvRowsSpan = alvImg ? Math.ceil((alvImg.height + IMG_GAP_PX) / DEFAULT_ROW_PX) : 13;
  // Parameters table sits right under the ALV block with a small breathing
  // gap — no lower clamp. The legacy row-49 minimum was reserving space for
  // an optional flow-diagram / BAPI-mapping block between ALV and Params,
  // but that region is not emitted by any current driver, so clamping
  // produces a large blank stretch for every spec. Drivers that really need
  // that reserve can widen PARAMS_GAP_ROWS or append content after build().
  const paramsStartRow = alvStartRow + alvRowsSpan + PARAMS_GAP_ROWS;
  // Rewrite ALV anchor in place so drawingXml() emits the computed cell.
  if (alvImg) alvImg.anchorCell = `B${alvStartRow}`;

  const seen = new Set();
  const dataSheets = SHEETS_DATA.map(s => {
    // textSheet honours per-sheet colWidths when the driver supplies them
    // (used to round-trip a known reference file's column widths exactly).
    const payload = textSheet(s.rows, { colWidths: s.colWidths });
    // Auto-attach the process flowchart under the Processing Logic sheet
    // (or whichever sheet the driver names as PROCESS_FLOW_SHEET). Empty
    // PROCESS_FLOW = no-op, so other sheets pass through untouched.
    if (s.name === PROCESS_FLOW_SHEET && Array.isArray(PROCESS_FLOW) && PROCESS_FLOW.length) {
      appendProcessFlow(payload, PROCESS_FLOW, { heading: PROCESS_FLOW_HEADING });
    }
    return { name: sanitizeSheetName(s.name, seen), payload };
  });
  const inputsSheet = {
    name: sanitizeSheetName(INPUTS_SHEET_NAME, seen),
    payload: screensSheet({ hasSelectionImg, hasAlvImg, alvStartRow, paramsStartRow }),
  };
  const insertAt = Math.min(2, dataSheets.length);
  const sheets = [
    ...dataSheets.slice(0, insertAt),
    inputsSheet,
    ...dataSheets.slice(insertAt),
  ];

  // Validate image sheetName against actual workbook sheets. Silent drop
  // was a pre-v8 bug: drivers that localised INPUTS_SHEET_NAME (e.g.
  // '입력 및 화면') but left images[].sheetName as 'Inputs & Screens'
  // used to lose the PNGs with no log at all. Now we warn + skip that one
  // image, and other sheets continue rendering normally.
  const validSheetNames = new Set(sheets.map(s => s.name));
  const imagesBySheet = new Map();
  for (const img of images) {
    const key = img.sheetName || INPUTS_SHEET_NAME;
    if (!validSheetNames.has(key)) {
      console.warn(`[build] image sheetName "${key}" not in workbook sheets [${[...validSheetNames].join(', ')}] — image skipped. Did you localise INPUTS_SHEET_NAME but forget to update images[].sheetName?`);
      continue;
    }
    if (!imagesBySheet.has(key)) imagesBySheet.set(key, []);
    imagesBySheet.get(key).push(img);
  }

  // Assign drawing/media IDs deterministically.
  const drawings = [];      // [{ drawingId, sheetIdx, imgs:[{ rid, mediaName, ... }] }]
  const mediaEntries = [];  // [{ name, data }]
  let drawingCounter = 0, mediaCounter = 0;
  sheets.forEach((s, idx) => {
    const imgs = imagesBySheet.get(s.name);
    if (!imgs || !imgs.length) return;
    drawingCounter++;
    const wired = imgs.map((img, i) => {
      mediaCounter++;
      const mediaName = `image${mediaCounter}.png`;
      mediaEntries.push({ name: `xl/media/${mediaName}`, data: img.pngBuffer });
      return { ...img, rid: `rId${i + 1}`, mediaName };
    });
    drawings.push({ drawingId: drawingCounter, sheetIdx: idx, imgs: wired });
  });

  const drawingIds = drawings.map(d => d.drawingId);
  const hasPng = mediaEntries.length > 0;

  // Build worksheet XMLs — inject <drawing> ref on sheets that have one.
  const sheetXmls = sheets.map((s, idx) => {
    let xmlStr = sheetXml(s.payload);
    const d = drawings.find(x => x.sheetIdx === idx);
    if (d) xmlStr = injectDrawingRef(xmlStr);
    return { name: `xl/worksheets/sheet${idx + 1}.xml`, data: Buffer.from(xmlStr, 'utf8') };
  });

  // Per-sheet rels (only for sheets with drawings).
  const sheetRelEntries = drawings.map(d => ({
    name: `xl/worksheets/_rels/sheet${d.sheetIdx + 1}.xml.rels`,
    data: Buffer.from(sheetDrawingRel(d.drawingId), 'utf8'),
  }));

  // Drawing parts + their rels.
  const drawingEntries = drawings.flatMap(d => [
    { name: `xl/drawings/drawing${d.drawingId}.xml`, data: Buffer.from(drawingXml(d.imgs), 'utf8') },
    { name: `xl/drawings/_rels/drawing${d.drawingId}.xml.rels`, data: Buffer.from(drawingRelsXml(d.imgs), 'utf8') },
  ]);

  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes(sheets.length, { hasPng, drawingIds }), 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rootRels(), 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(sheets.map(s => s.name)), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels(sheets.length), 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(stylesXml(), 'utf8') },
    ...sheetXmls,
    ...sheetRelEntries,
    ...drawingEntries,
    ...mediaEntries,
  ];
  writeFileSync(outPath, zipFiles(entries));
  console.log(`Wrote ${outPath} (${sheets.length} sheets${hasPng ? `, ${mediaEntries.length} images` : ''})`);
}
function openInDefault(p) {
  let cmd, args;
  if (platform() === 'win32') { cmd = 'cmd.exe'; args = ['/c', 'start', '""', p]; }
  else if (platform() === 'darwin') { cmd = 'open'; args = [p]; }
  else { cmd = 'xdg-open'; args = [p]; }
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', shell: false });
  child.unref();
}

// =============================================================
// V8 AUTO-IMAGE PIPELINE
//
// Drivers DO NOT need to import renderScreenImages — just populate
// SELECTION_IMAGE_SPEC / ALV_IMAGE_SPEC at the top of this file. This
// helper calls into screen-image-renderer.mjs which renders Selection +
// ALV as PNG IN PARALLEL (Promise.all → concurrent headless browsers).
//
// Universal applicability: this path runs for EVERY xlsx spec regardless
// of language (ko/en/ja/de/…) and depth (L1/L2/L3/L4). The only hard
// requirements are (a) format=xlsx and (b) at least one of the two specs
// is populated.
//
// Returns an empty [] when either:
//   · Both specs are null (object has no UI — e.g. pure FM / CDS / RAP
//     without screens), OR
//   · No headless browser is installed (Edge / Chrome / Chromium not
//     found on PATH / standard install dirs).
// In both cases screensSheet() auto-draws cell-border wireframes for
// whichever SPEC is populated — readers still see the layout.
// =============================================================
async function buildImages() {
  if (!SELECTION_IMAGE_SPEC && !ALV_IMAGE_SPEC) return [];
  try {
    // Resolve screen-image-renderer.mjs. Works whether this file runs in
    // its original location (scripts/spec/...) OR was copied as a
    // throwaway per-spec driver to .sc4sap/specs/_drivers/, to an absolute
    // Desktop folder, or into a plugin cache. Search order:
    //   (1) next to this file                          → in-place / plugin cache
    //   (2) walk up + 'scripts/spec/...'               → consumer layout (scripts/ at root)
    //   (3) walk up + 'sc4sap/scripts/spec/...'        → plugin-dev layout (source inside sc4sap/)
    //   (4) process.cwd() + 'scripts/spec/...'         → invocation from project root, consumer
    //   (5) process.cwd() + 'sc4sap/scripts/spec/...'  → invocation from project root, dev
    //   (6) CLAUDE_PLUGIN_ROOT env (Claude Code plugin cache runtime)
    const hereDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [join(hereDir, 'screen-image-renderer.mjs')];
    let cur = hereDir;
    for (let i = 0; i < 8; i++) {
      candidates.push(join(cur, 'scripts', 'spec', 'screen-image-renderer.mjs'));
      candidates.push(join(cur, 'sc4sap', 'scripts', 'spec', 'screen-image-renderer.mjs'));
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    candidates.push(join(process.cwd(), 'scripts', 'spec', 'screen-image-renderer.mjs'));
    candidates.push(join(process.cwd(), 'sc4sap', 'scripts', 'spec', 'screen-image-renderer.mjs'));
    if (process.env.CLAUDE_PLUGIN_ROOT) {
      candidates.push(join(process.env.CLAUDE_PLUGIN_ROOT, 'scripts', 'spec', 'screen-image-renderer.mjs'));
    }
    const rendererPath = candidates.find(p => existsSync(p));
    if (!rendererPath) {
      console.warn('[screen-images] screen-image-renderer.mjs not resolvable — falling back to wireframe. Searched:\n  - ' + candidates.slice(0, 8).join('\n  - '));
      return [];
    }
    const { renderScreenImages } = await import(pathToFileURL(rendererPath).href);
    const imgs = await renderScreenImages({
      selection: SELECTION_IMAGE_SPEC,
      alv: ALV_IMAGE_SPEC,
      lang: SPEC_LANG,
    });
    const out = [];
    if (imgs.selection) out.push({
      sheetName: INPUTS_SHEET_NAME, anchorCell: 'B3',
      pngBuffer: imgs.selection.pngBuffer,
      width: imgs.selection.width, height: imgs.selection.height,
    });
    if (imgs.alv) out.push({
      sheetName: INPUTS_SHEET_NAME, anchorCell: 'B19',
      pngBuffer: imgs.alv.pngBuffer,
      width: imgs.alv.width, height: imgs.alv.height,
    });
    if (!out.length) {
      console.warn('[screen-images] headless browser unavailable — cell-border wireframe will be used instead');
    }
    return out;
  } catch (err) {
    console.warn('[screen-images] renderer error:', err?.message || err, '— falling back to wireframe');
    return [];
  }
}

const images = await buildImages();
build(OUT_PATH, { images });
openInDefault(OUT_PATH);

// =============================================================
// Self-cleanup (v8.3)
//
// The driver is SCAFFOLDING — once the xlsx is written and verified,
// keeping the per-spec .mjs file around just clutters the repo and
// confuses future readers into thinking it's part of the deliverable.
// We self-delete at the end of a SUCCESSFUL run (build() didn't throw,
// so OUT_PATH exists) to guarantee cleanup regardless of whether the
// calling agent remembers to `rm` it.
//
// Safety guards:
//   · Only runs if CLEANUP_AFTER_BUILD is true (set false for debugging
//     a failed/weird render — then you can edit+rerun the same driver).
//   · Only runs if OUT_PATH actually exists (build could have silently
//     bailed — don't self-destruct without evidence of success).
//   · Only deletes the driver FILE itself, plus its enclosing directory
//     if that directory (a) is `_drivers`, (b) becomes empty after we
//     remove the driver. We never rmdir a user-supplied absolute path
//     like `C:\Users\me\Desktop\test\` even if it ends up empty.
//   · Any error (file locked, permission, antivirus) is logged as warn
//     and swallowed — the xlsx artifact still survives, user can rm
//     the driver by hand.
// =============================================================
const CLEANUP_AFTER_BUILD = true;
if (CLEANUP_AFTER_BUILD) {
  try {
    if (!existsSync(resolve(OUT_PATH))) {
      console.warn('[cleanup] skipped: OUT_PATH not found on disk — keeping driver for debugging.');
    } else {
      const driverPath = fileURLToPath(import.meta.url);
      const driverDir = dirname(driverPath);
      unlinkSync(driverPath);
      console.log(`[cleanup] removed driver: ${driverPath}`);
      // Best-effort rmdir of the scaffolding folder when it only existed
      // to hold this driver. Scope the cleanup to folders literally named
      // `_drivers` so we never delete an arbitrary user directory.
      if (driverDir.endsWith('_drivers') || driverDir.endsWith('\\_drivers') || driverDir.endsWith('/_drivers')) {
        try {
          const remaining = readdirSync(driverDir);
          if (remaining.length === 0) {
            rmdirSync(driverDir);
            console.log(`[cleanup] removed empty _drivers folder: ${driverDir}`);
          }
        } catch { /* non-empty or race — leave it */ }
      }
    }
  } catch (err) {
    console.warn(`[cleanup] driver self-delete failed: ${err?.message || err}`);
    console.warn(`[cleanup] remove the driver manually when convenient.`);
  }
}
