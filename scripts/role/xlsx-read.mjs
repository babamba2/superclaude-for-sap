// sc4sap:role-matrix — reads an Excel workbook (.xlsx): every sheet's cells with their text, fill, text colour, bold
// and font, and the merged ranges. Used to read a company's role-matrix form (read-template.mjs) and to take its
// content into a document (import-form.mjs). Plain zip + XML, nothing installed.

import { readFileSync } from 'node:fs';
import { unzipEntries } from '../spec/xlsx-zip.mjs';

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENT[e.toLowerCase()] ?? m));
const tText = (xml) => [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

// the legacy 56-colour palette (indexed colours 8–63)
const PALETTE = ('000000 FFFFFF FF0000 00FF00 0000FF FFFF00 FF00FF 00FFFF 800000 008000 000080 808000 800080 008080 C0C0C0 808080 '
  + '9999FF 993366 FFFFCC CCFFFF 660066 FF8080 0066CC CCCCFF 000080 FF00FF FFFF00 00FFFF 800080 800000 008080 0000FF '
  + '00CCFF CCFFFF CCFFCC FFFF99 99CCFF FF99CC CC99FF FFCC99 3366FF 33CCCC 99CC00 FFCC00 FF9900 FF6600 666699 969696 '
  + '003366 339966 003300 333300 993300 993366 333399 333333').split(' ');

/** Column letters → 1-based number, and back. */
export const colNum = (s) => [...String(s).toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const colName = (n) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
/** "B3" → { c: 2, r: 3 }; "B3:D4" → { c0, r0, c1, r1 }. */
export const cellRef = (ref) => { const m = /^([A-Z]+)(\d+)$/i.exec(ref); return m ? { c: colNum(m[1]), r: Number(m[2]) } : null; };
export const rangeRef = (ref) => { const [a, b = a] = String(ref).split(':').map(cellRef); return a && b ? { c0: a.c, r0: a.r, c1: b.c, r1: b.r } : null; };

function themeColors(xml) {
  const scheme = /<a:clrScheme\b[\s\S]*?<\/a:clrScheme>/.exec(xml || '')?.[0] || '';
  const list = [...scheme.matchAll(/<a:(dk1|lt1|dk2|lt2|accent\d|hlink|folHlink)>[\s\S]*?(?:srgbClr val|lastClr)="([0-9A-Fa-f]{6})"/g)].map((m) => [m[1], m[2]]);
  const by = Object.fromEntries(list);
  // Excel numbers the theme colours with light / dark swapped: 0 lt1, 1 dk1, 2 lt2, 3 dk2, 4–9 accent1–6
  return [by.lt1, by.dk1, by.lt2, by.dk2, by.accent1, by.accent2, by.accent3, by.accent4, by.accent5, by.accent6, by.hlink, by.folHlink];
}

function tint(rgb, t) {
  if (!t) return rgb;
  return rgb.match(/../g).map((h) => { const c = parseInt(h, 16); const v = t < 0 ? c * (1 + t) : c + (255 - c) * t; return Math.round(v).toString(16).padStart(2, '0'); }).join('');
}

function colorOf(tag, theme) {
  if (!tag) return '';
  const rgb = /\brgb="(?:[0-9A-Fa-f]{2})?([0-9A-Fa-f]{6})"/.exec(tag)?.[1];
  const th = /\btheme="(\d+)"/.exec(tag)?.[1], ix = /\bindexed="(\d+)"/.exec(tag)?.[1];
  const t = Number(/\btint="([-\d.E]+)"/i.exec(tag)?.[1]) || 0;
  const base = rgb || (th != null ? theme[Number(th)] : ix != null ? PALETTE[Number(ix) - 8] : '');
  return base ? `#${tint(base, t).toLowerCase()}` : '';
}

function styles(xml, theme) {
  const sect = (name) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`).exec(xml || '')?.[1] || '';
  const fonts = [...sect('fonts').matchAll(/<font\b[^>]*>([\s\S]*?)<\/font>|<font\b[^>]*\/>/g)].map(([, f = '']) => ({
    bold: /<b\/>|<b val="(1|true)"\/>/.test(f), color: colorOf(/<color\b[^>]*\/>/.exec(f)?.[0], theme), font: decode(/<name val="([^"]*)"/.exec(f)?.[1] || '') }));
  const fills = [...sect('fills').matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map(([, f]) => (/patternType="solid"/.test(f) ? colorOf(/<fgColor\b[^>]*\/>/.exec(f)?.[0], theme) : ''));
  return [...sect('cellXfs').matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)].map(([, a]) => {
    const fo = fonts[Number(/fontId="(\d+)"/.exec(a)?.[1]) || 0] || {};
    return { bg: fills[Number(/fillId="(\d+)"/.exec(a)?.[1]) || 0] || '', color: fo.color && fo.color !== '#000000' ? fo.color : '', bold: !!fo.bold, font: fo.font || '' };
  });
}

/**
 * Every sheet of a workbook. A sheet: { name, hidden, cells: Map("r:c" → { t, bg, color, bold, font }), merges: [{c0,r0,c1,r1}],
 * maxRow, maxCol }. Empty cells with a fill are kept (a header band without text still shows its colour).
 */
export function readXlsx(file) {
  const z = new Map(unzipEntries(readFileSync(file)).map((e) => [e.name, e.data]));
  const get = (n) => z.get(n)?.toString('utf8') || '';
  if (!z.has('xl/workbook.xml')) throw new Error(`${file}: no xl/workbook.xml — not an .xlsx (an old .xls must be saved as .xlsx first)`);
  const theme = themeColors(get('xl/theme/theme1.xml'));
  const xf = styles(get('xl/styles.xml'), theme);
  const shared = [...get('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => tText(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
  const rels = new Map([...get('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)].map(([t]) => [/Id="([^"]+)"/.exec(t)?.[1], /Target="([^"]+)"/.exec(t)?.[1]]));
  const sheets = [];
  for (const [tag] of get('xl/workbook.xml').matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = decode(/name="([^"]*)"/.exec(tag)?.[1] || '');
    const target = rels.get(/r:id="([^"]+)"/.exec(tag)?.[1]) || '';
    const xml = get(`xl/${target.replace(/^\/?xl\//, '')}`);
    const cells = new Map();
    let maxRow = 0, maxCol = 0;
    for (const [, a, inner = ''] of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = cellRef(/r="([A-Z]+\d+)"/.exec(a)?.[1] || ''); if (!at) continue;
      const ty = /\bt="(\w+)"/.exec(a)?.[1] || '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const t = ty === 's' ? shared[Number(v)] ?? '' : ty === 'inlineStr' ? tText(inner) : ty === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v != null ? decode(v) : '';
      const st = xf[Number(/\bs="(\d+)"/.exec(a)?.[1]) || 0] || {};
      if (!t && !st.bg) continue;
      cells.set(`${at.r}:${at.c}`, { t: String(t).replace(/\r\n?/g, '\n'), ...st });
      if (t) { maxRow = Math.max(maxRow, at.r); maxCol = Math.max(maxCol, at.c); }
    }
    const merges = [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => rangeRef(m[1])).filter(Boolean);
    sheets.push({ name, hidden: /state="(hidden|veryHidden)"/.test(tag), cells, merges, maxRow, maxCol });
  }
  const images = [...z.keys()].filter((n) => n.startsWith('xl/media/')).map((n) => ({ name: n.slice(9), data: z.get(n) }));
  const title = decode((get('docProps/core.xml').match(/<dc:title>([^<]*)<\/dc:title>/) || [])[1] || '');
  return { sheets, images, title };
}

/** Text of a cell (trimmed); r / c 1-based. */
export const cellText = (sheet, r, c) => String(sheet.cells.get(`${r}:${c}`)?.t ?? '').trim();
