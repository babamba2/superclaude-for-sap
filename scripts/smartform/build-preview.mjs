// sc4sap:smartform-preview — draws the expected print of a SmartForm.
//
// INPUT  <form>.content.json written by the MCP tool GetSmartFormContent
//        (pages → windows → content tree, SmartStyle CSS, SE78 graphics as BMP)
//        + values.json with invented sample values for the &symbols&
// OUTPUT <FORM>-preview.html (A4 page in mm) and <FORM>-preview.jpg (headless
//        Chrome / Edge / Chromium), plus a JSON report on stdout.
//
// CLI
//   node build-preview.mjs symbols <content.json>
//     → every printed &symbol& with where it prints (window, node, cell width,
//       font size, inside a loop or not) and the form's data declarations,
//       so the sample values can follow the field types and the space.
//   node build-preview.mjs build <content.json> --values <values.json>
//        --out-dir <dir> [--rows N] [--no-jpg] [--mark]
//     → { html, jpg, rows, filled, unfilled, overflow, approximations, defaultParagraph }
//
// values.json
//   { "defaultParagraph": "AA",        // paragraph for '*' lines (the style's
//                                      // standard paragraph is not in the content)
//     "rows": 3,                       // sample rows per loop / table
//     "values": { "HEADER-NAME1": "…",               // as printed, already formatted
//                 "GS_ITEM-MATNR": ["…", "…", "…"] } } // array = one value per row
//
// Sample values are invented by the skill — never business data.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const PT_MM = 0.3528;
// The page is laid out 4x and scaled back for the picture: at print sizes (10-20 px)
// Chrome takes whole-pixel advances from the font (hdmx), e.g. DotumChe 14 pt bold
// 0.59 em a character instead of 0.52; at 4x the advances are the real ones.
const ZOOM = 4;
const SYS_DEFAULTS = { 'SFSY-PAGE': '1', 'SFSY-FORMPAGES': '1', 'SFSY-JOBPAGES': '1', 'SY-ULINE': '-'.repeat(255), 'SY-VLINE': '|' };

/** Output options of a symbol, &NAME(options)&: a length n prints the value left-justified
 *  in n characters (right-justified with R), Z drops leading zeros, C compresses blanks.
 *  ZSD_PACK_LIST: &SFSY-PAGE(3Z)& → "1  ". */
function formatSymbol(value, raw) {
  // &F+off(len)&: the part of the value from offset off, len characters long
  const sub = /\+(\d+)(?:\((\d+)\))?\s*$/.exec(raw.replace(/\(([^)]*[A-Z][^)]*)\)\s*$/i, ''));
  if (sub) {
    const off = Number(sub[1]);
    if (sub[2] === undefined) return value.substr(off);
    // a CHAR field is blank-padded: the part keeps its trailing blanks, which a right-aligned
    // paragraph prints (ZSD_PI_TAIWAN &TDLINE+107(16)& = "400.50" + 10 blanks)
    const len = Number(sub[2]);
    return value.padEnd(off + len).substr(off, len);
  }
  const m = /\(([^)]*)\)\s*$/.exec(raw);
  if (!m) return value;
  const opt = m[1].toUpperCase();
  let v = value;
  if (opt.includes('Z')) v = v.replace(/^(\s*)0+(?=\d)/, '$1');
  // a number keeps its sign position at the end (a blank, or '-'): sample values carry it (R60)
  const signed = /^\s*-?[\d.,]+[ -]$/.test(value);
  // C drops the leading blanks; a number keeps its trailing sign blank (ZFIR560105_JS NETWR(C))
  if (opt.includes('C')) v = signed ? v.replace(/\s+/g, ' ').replace(/^ /, '') : v.replace(/\s+/g, ' ').trim();
  const len = /(\d+)/.exec(opt);
  if (len) {
    const n = Number(len[1]);
    const t = v.trim();
    // a number with a length stays right-justified in it, sign position last
    // (ZFIR560105_JS &GT_ITEM-FKIMG(10)& = "       10 "); Z (no leading zeros) keeps R25
    if (signed && !opt.includes('Z') && !/^SFSY-/i.test(raw)) {
      const s = /-$/.test(t) ? t : `${t} `;
      // only when it fits: slicing a longer one would cut its first digits (reviewer I)
      if (s.length <= n) return s.padStart(n);
    }
    // the page total is filled in at the end into a place n digits wide, right-justified
    // (ZSD_PI_UAE_NEW "  1" = 270 tw = 3 digit widths at HELVE 8 pt): pad with figure spaces
    // with C (compress) the total stays left in its place (ZNA_B2B_FORM_01 (4ZC): "1" + 3 NULs)
    if (/^SFSY-(FORMPAGES|JOBPAGES)\b/i.test(raw))
      return opt.includes('C') ? t.padEnd(n, ' ').slice(0, n) : t.padStart(n, ' ').slice(-n);
    v = opt.includes('R') ? t.padStart(n).slice(-n) : t.padEnd(n).slice(0, n);
  }
  return v;
}
const SYMBOL_RE = /&([^&\s][^&]*?)&/g;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// ── bar codes: Code 128 (set B) bars; SAP's own symbology / module come from SE73 ──
const CODE128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232 2331112').split(' ');
/** Code 128 symbol values of a value, as SAP's BRLC bar codes print it: set B, switching
 *  to set C for runs of 4+ digits (an odd run gives its first digit to B) — 101 modules
 *  for "BC12345", 123 for "BC0012345678" in SAP's PDF. Start, check and stop included. */
export function code128Codes(value) {
  const s = [...String(value)].filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) < 127).join('');
  const digitsAt = (i) => { let n = 0; while (i + n < s.length && /\d/.test(s[i + n])) n++; return n; };
  const lead = digitsAt(0);
  let set = lead >= 4 && lead % 2 === 0 ? 'C' : 'B';
  const codes = [set === 'C' ? 105 : 104];
  for (let i = 0; i < s.length;) {
    if (set === 'C') {
      if (digitsAt(i) >= 2) { codes.push(Number(s.substr(i, 2))); i += 2; continue; }
      codes.push(100); set = 'B';
    }
    const run = digitsAt(i);
    if (run >= 4 && run % 2 === 0) { codes.push(99); set = 'C'; continue; }
    codes.push(s.charCodeAt(i) - 32); i++;
  }
  codes.push(codes.reduce((t, c, i) => t + c * (i || 1), 0) % 103, 106);
  return codes;
}

/** Module and height of an SE73 bar code: TFO05-TDBARCAUX "N08X00080A" = module 8, height 80,
 *  both in 1/600 inch (measured on SAP's PDF: 0.339 mm / 3.39 mm, 6 / 150 → 0.254 / 6.35). */
export function barcodeSize(def) {
  const m = /^.(\d{2}).(\d{5})/.exec(String(def?.aux || ''));
  if (!m) return null;
  // the place the text line keeps for it is the SE73 width (TFO05 TDBCSIZE), whatever the bars
  // take: a right-aligned bar code starts at edge − that width (ZWO_NA_HQ_WARRANTY_RETURN 50 mm)
  const w = /([\d.]+)\s*([A-Z]{2})?/i.exec(String(def?.width || ''));
  const f = { MM: 1, CM: 10, IN: 25.4, PT: 25.4 / 72, TW: 25.4 / 1440 }[String(w?.[2] || 'MM').toUpperCase()];
  const layoutMm = w && f ? Number(w[1]) * f : 0; // an unknown unit (CH, LN): the bars' own width
  return { moduleMm: Number(m[1]) * 25.4 / 600, heightMm: Number(m[2]) * 25.4 / 600, ...(layoutMm > 0 ? { layoutMm } : {}) };
}

/** Bars of a value as an inline SVG standing on the baseline. Without a definition
 *  0.3 mm module and 3.5 mm height are assumed. */
export function barcodeSvg(value, def = {}) {
  const mod = Number(def.moduleMm) || 0.3;
  const h = Number(def.heightMm) || 3.5;
  const codes = code128Codes(value);
  let x = 0;
  const bars = [];
  for (const c of codes) {
    [...CODE128[c]].forEach((w, i) => { if (i % 2 === 0) bars.push(`M${x} 0h${w}v1h-${w}z`); x += Number(w); });
  }
  // the bars rise from the baseline without making the line taller (as in SAP's print)
  const wmm = (x * mod).toFixed(2);
  const place = Number(def.layoutMm) > 0 ? Number(def.layoutMm).toFixed(2) : wmm;
  return `<span class="bcw" style="width:${place}mm"><svg class="bc" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x} 1" preserveAspectRatio="none" ` +
    `style="width:${wmm}mm;height:${h.toFixed(2)}mm"><path d="${bars.join('')}"/></svg></span>`;
}
const baseSymbol = (raw) => raw.replace(/\(.*\)$/, '').replace(/\+\d+$/, '').trim(); // &F+off(len)& → F
const styleClass = (name) => String(name || '').replace(/_/g, '-');

// ── style: paragraph font sizes (for the symbol list and line heights) ──────────
function paragraphFonts(styles) {
  const out = {};
  for (const s of styles || []) {
    for (const p of s.paragraphs || []) if (!out[p.tag]) out[p.tag] = (Number(p.size) || 0) / 10 || s.font?.pt || null;
  }
  for (const s of styles || []) {
    for (const m of String(s.css || '').matchAll(/div#([A-Z0-9*]{1,2})\.par\{([^}]*)\}/g)) {
      const pt = /font-size\s*:\s*([\d.]+)pt/.exec(m[2]);
      if (pt && !out[m[1]]) out[m[1]] = Number(pt[1]);
    }
  }
  return out;
}

// ── paragraphs from the stored style (SSFPARAS) ───────────────────────────────
// SAP's own CSS conversion is not reliable (0.10 CM left margin comes out as
// 2.54 mm), so paragraphs are rebuilt from the stored value + unit.
const FAMILY_CSS = (f) => {
  const s = String(f || '').toUpperCase();
  if (/^COUR/.test(s)) return "'Courier New', Courier, monospace";
  if (/^THANGSAN/.test(s)) return "'Angsana New', AngsanaUPC, 'SF Angsana fallback', sans-serif";
  if (/^THCORDIA/.test(s)) return "'Cordia New', CordiaUPC, 'Leelawadee UI', sans-serif";
  if (/^TH/.test(s)) return "Tahoma, 'Leelawadee UI', sans-serif";
  if (/^ANDALE/.test(s)) return "'Andale Mono', 'Courier New', 'MS Gothic', monospace"; // 0.6 em, like Courier
  if (/^TIME/.test(s)) return "'Times New Roman', Times, serif";
  if (/^(HELV|ARIAL)/.test(s)) return 'Arial, Helvetica, sans-serif';
  if (/^KPDODUM/.test(s)) return "'DotumChe', Dotum, '돋움체', '돋움', sans-serif";
  if (/^KPGULIM/.test(s)) return "'GulimChe', Gulim, '굴림체', '굴림', sans-serif";
  if (/^KPBATANG/.test(s)) return "'BatangChe', Batang, '바탕체', serif";
  // DBCS printer fonts are fixed pitch: Latin 0.5 em, CJK 1 em (ZMM_SF_FORM20 / ZWO_REPORT_STATEMENT3
  // KPSAMMUL "Document" 12 pt = 16.9 mm; ZFI_US_PAYMENT_LIST JPMINCHO "Company" 9 pt = 11.1 mm)
  if (/^KPSAMMUL/.test(s)) return "'GungsuhChe', 'BatangChe', '궁서체', '바탕체', monospace";
  if (/^JPMINCHO/.test(s)) return "'MS Mincho', 'ＭＳ 明朝', 'BatangChe', monospace";
  if (/^JPGOTHIC/.test(s)) return "'MS Gothic', 'ＭＳ ゴシック', 'DotumChe', monospace";
  if (/^KP/.test(s)) return "'DotumChe', '돋움체', monospace";
  if (/^CNSONG/.test(s)) return "SimSun, '宋体', serif";
  if (/^CNHEI/.test(s)) return "SimHei, 'Microsoft YaHei', sans-serif";
  if (/^CNKAI/.test(s)) return "KaiTi, '楷体', serif";
  if (/^TW(MING|SONG)/.test(s)) return "MingLiU, PMingLiU, serif";
  if (/^TWDPHEI|^TWKAI/.test(s)) return "'Microsoft JhengHei', sans-serif";
  return s ? `'${s.toLowerCase()}', Arial, sans-serif` : null;
};

function sapLenMm(v, style) {
  const m = /^\s*(-?[\d.]+)\s*([A-Z]{2})?/.exec(String(v || ''));
  if (!m) return 0;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'CM': return n * 10;
    case 'MM': return n;
    case 'IN': return n * 25.4;
    case 'PT': return (n * 25.4) / 72;
    case 'TW': return (n * 25.4) / 1440;
    case 'CH': return (n * 25.4) / (style.cpi || 10);
    case 'LN': return (n * 25.4) / (style.lpi || 6);
    default: return n * 10;
  }
}

/** The family the printer prints: one its device type has no font for comes out
 *  in COURIER — the TFO01 substitutes are not used (ZSD_EXP_CERT_01_ on KPPDF:
 *  KPGULIM → COURIER although its substitute KPSAMMUL exists). */
function printedFamily(family, printer, size10) {
  const f = String(family || '').trim().toUpperCase();
  if (!f || !printer?.fonts?.length) return f;
  const own = printer.fonts.filter((x) => String(x[0]).toUpperCase() === f);
  // a family the device type has only in fixed sizes (not scalable, size 0) prints a size it
  // lacks in COURIER (ZPM_BAR_PRINT on CNA60TP: LETGOTH 6/8/10/12/14/16 pt, asked 11 pt → COURIER)
  if (own.length && size10 && !own.some((x) => !Number(x[1]) || Number(x[1]) === Number(size10))) return 'COURIER';
  if (own.length) return f;
  // a TrueType family (proportional, no substitutes - installed with SE73) prints as
  // itself on any device type (ZSD_DECL_OF_ORIGIN_AP_AE: ARIAL / ARIAL_B on KPPDF)
  // (a family with no TFO01 entry at all is one too: ZSD_P_INVOICE ANDALE_J on PDFUC)
  const def = (printer.families || []).find((x) => String(x.family).toUpperCase() === f);
  if (!def) return f;
  if (def.proportional === 'X' && !(def.substitutes || []).some((s) => String(s).trim())) return f;
  // the Unicode PDF device type prints a missing CJK family in its Unicode font
  // (ZSD_P_INVOICE: KPDODUM on PDFUC → ANDALE_J); elsewhere COURIER (EXP_CERT on KPPDF) A_SIMP / A_TRAN / A_TRAD (Chinese) too: ZFI_SMT_PARK_DOCUMENT_PRN2
  // and the Thai families (THVIJIT, substitute THANGSAN that PDFUC has, still → ANDALE_J:
  // ZSMARTFORM_UTQG C1, ZFI_SMT_PARK_DOCUMENT_PRN_JP B7)
  if (printer.deviceType === 'PDFUC' && /^(KP|CN|TW|JP|DB|TH|A_(SIMP|TRAN|TRAD))/.test(f)) return 'ANDALE_J';
  return 'COURIER';
}

/** Blank widths (twips) SAP's OTF sent per device type, keyed "FAMILY|size×10|B" (bold) or
 *  "FAMILY|size×10|" — the widths of the device type's font metrics, which a browser font
 *  does not round alike (collected from the SW records of the learning-loop OTFs). */
/** Glyph widths (1/1000 em, index = code − 32, WinAnsi) SAP's PDF converter uses per device type
 *  and SAP family / bold, keyed "FAMILY|B" or "FAMILY|" — read from SAP's own PDFs
 *  (glyph-widths.json). Only device types whose widths do not depend on the size (PDFUC,
 *  SAPWIN); KPPDF stores per-size widths and is left to the browser. */
let GLYPH_WIDTHS = null;
function glyphWidths(deviceType) {
  if (!GLYPH_WIDTHS) {
    try { GLYPH_WIDTHS = JSON.parse(readFileSync(new URL('./glyph-widths.json', import.meta.url), 'utf8')).widths || {}; } catch { GLYPH_WIDTHS = {}; }
  }
  const dev = `${String(deviceType || '').trim().toUpperCase()}|`;
  const out = {};
  for (const [k, v] of Object.entries(GLYPH_WIDTHS)) if (k.startsWith(dev)) out[k.slice(dev.length)] = v;
  return out;
}

let BLANK_WIDTHS = null;
function blankWidths(deviceType) {
  if (!BLANK_WIDTHS) {
    try { BLANK_WIDTHS = JSON.parse(readFileSync(new URL('./blank-widths.json', import.meta.url), 'utf8')); } catch { BLANK_WIDTHS = {}; }
  }
  const dev = `${String(deviceType || '').trim().toUpperCase()}|`;
  const out = {};
  for (const [k, v] of Object.entries(BLANK_WIDTHS)) if (k.startsWith(dev)) out[k.slice(dev.length)] = v;
  return out;
}

/** A TrueType family installed with SE73 (proportional, no TFO01 substitutes, not a printer
 *  font of the device type) has no bold of its own — its bold is a family of its own (ARIAL_B):
 *  ZFI_JAX_AR_STATEMENT T1 ARIAL 12 pt bold on SAPWIN printed regular (FC flag blank).
 *  Families without a TFO01 entry (ANDALE_J) keep bold. */
function canBold(family, printer) {
  const f = String(family || '').trim().toUpperCase();
  if (!f || /_B$|_BD$/.test(f) || !printer?.fonts?.length || printer.fonts.some((x) => String(x[0]).toUpperCase() === f)) return true;
  const def = (printer.families || []).find((x) => String(x.family).toUpperCase() === f);
  return !(def && def.proportional === 'X' && !(def.substitutes || []).some((s) => String(s).trim()));
}

/** Legacy DBCS text kept in a Latin-1 form language: Korean / Chinese / Japanese bytes stored
 *  as Latin-1 characters ("ÀÇ ·á ºñ" = KSC5601 의 료 비). A DBCS printer font prints each byte
 *  pair as one full-width glyph (ZHR_YEA_MED_2011_T %TEXT1 on KPPDF: SAP's ST width 50.4 mm =
 *  8 syllables), so the text is read back in the family's code page. Only runs of 0xA1–0xFE
 *  pairs are decoded, and only when the result has no replacement character. */
const DBCS_PAGE = [[/^KP/, 'euc-kr'], [/^(CN|A_SIMP)/, 'gbk'], [/^(TW|A_TRA)/, 'big5'], [/^JP/, 'shift_jis']];
export function legacyDbcs(s, fam = '') {
  const page = DBCS_PAGE.find(([re]) => re.test(String(fam || '').trim().toUpperCase()))?.[1];
  if (!page || !/[¡-þ]{2}/.test(s)) return s;
  return s.replace(/(?:[¡-þ]{2})+/g, (run) => {
    try {
      const t = new TextDecoder(page, { fatal: true }).decode(Buffer.from(run, 'latin1'));
      return t.includes('�') ? run : t;
    } catch { return run; }
  });
}

/** Italic prints only when the device type has an italic printer font for the family
 *  (TFO03 TDITALIC); a TrueType family without one prints upright — SAP's OTF never carried
 *  italic in 26 forms, ZSD_DECL_OF_ORIGIN_AP_AE A2 (ARIAL_B italic) printed upright. */
function canItalic(family, printer) {
  if (!printer?.fonts?.length) return true;
  const f = printedFamily(family, printer);
  return printer.fonts.some((x) => String(x[0]).toUpperCase() === f && x[3] === 'X');
}

/** Bold in a DBCS printer font (KP*, CN*, JP*, TW*): those fonts are fixed pitch and SAP keeps
 *  the advance; the browser's synthetic bold widens SimSun / DotumChe (ZHR_ZHRFA0012_CP CNSONG
 *  22 pt bold: 2.6 mm too wide) — draw the weight with a stroke instead. */
const dbcsBold = (family) => (/^(KP|CN|JP|TW)/i.test(String(family || '').trim()) ? ';font-synthesis-weight:none;-webkit-text-stroke:0.03em currentColor' : '');

/** One CSS rule per character format, from its stored attributes: only what the format
 *  sets (empty family / size 0 / '*' = from the paragraph). SAP's CSS garbles DBCS
 *  family names (KPDODUM → "µ¸¿òã¼"), so it is overridden here. */
function stringCss(style, printer) {
  if (!Array.isArray(style.strings) || !style.strings.length) return '';
  const cls = styleClass(style.name);
  return style.strings.map((c) => {
    const parts = [];
    if (String(c.family || '').trim()) parts.push(`font-family:${FAMILY_CSS(printedFamily(c.family, printer, Number(c.size) || Math.round((style.font?.pt || 0) * 10))) || 'inherit'}`);
    else parts.push('font-family:inherit');
    const pt = (Number(c.size) || 0) / 10;
    parts.push(pt ? `font-size:${pt}pt` : 'font-size:inherit');
    const fbold = c.bold === 'X' ? dbcsBold(printedFamily(c.family || style.font?.family, printer)) : '';
    const noBold = c.bold === 'X' && String(c.family || '').trim() && !canBold(printedFamily(c.family, printer), printer);
    if (c.bold === 'X' && !noBold) parts.push('font-weight:bold' + fbold); else if (c.bold === ' ' || c.bold === '' || noBold) parts.push('font-weight:normal');
    // the stroke of a bold DBCS paragraph is inherited: a format that is not DBCS bold drops it
    if (!fbold && (c.bold === ' ' || c.bold === '' || c.bold === 'X' || String(c.family || '').trim())) parts.push('-webkit-text-stroke:0;font-synthesis-weight:auto');
    if (c.italic === 'X' && canItalic(c.family || style.font?.family, printer)) parts.push('font-style:italic'); else if (c.italic !== '*') parts.push('font-style:normal');
    if (c.underline === 'X') parts.push('text-decoration:underline'); else if (c.underline === ' ' || c.underline === '') parts.push('text-decoration:none');
    if (c.superscript === 'X') parts.push('vertical-align:super');
    if (c.subscript === 'X') parts.push('vertical-align:sub');
    if (c.hidden === 'X') parts.push('visibility:hidden');
    // the printer font, for its blank width (custom properties inherit what the format leaves open)
    if (String(c.family || '').trim()) parts.push(`--sapfam:${printedFamily(c.family, printer, Number(c.size) || Math.round((style.font?.pt || 0) * 10))}`);
    if (pt) parts.push(`--sappt:${Math.round(pt * 10)}`);
    if (c.bold === 'X') parts.push('--sapb:B'); else if (c.bold === ' ' || c.bold === '') parts.push('--sapb:N');
    return `.${cls} span#${c.tag}.char{${parts.join(';')}}`;
  }).join('\n');
}

/** One CSS rule per paragraph of a style, from its stored attributes. */
function paragraphCss(style, printer) {
  if (!Array.isArray(style.paragraphs) || !style.paragraphs.length) return '';
  const cls = styleClass(style.name);
  return style.paragraphs.map((p) => `.${cls} div#${p.tag}.par{${parDecl(p, style, printer)}}`).join('\n');
}

/** The CSS declarations of one paragraph format of a style. */
function parDecl(p, style, printer) {
  const head = style.font || {};
  {
    const pt = (Number(p.size) || 0) / 10 || head.pt || 10;
    const pt10 = Math.round(pt * 10);
    const fam = FAMILY_CSS(printedFamily(p.family || head.family, printer, pt10)) || 'Arial, sans-serif';
    const bold = (p.bold === 'X' || (p.bold === '*' && head.bold)) && canBold(printedFamily(p.family || head.family, printer, pt10), printer);
    const lh = sapLenMm(p.lineSpacing, style);
    const align = { LEFT: 'left', RIGHT: 'right', CENTER: 'center', BLOCK: 'justify' }[String(p.align).trim()] || 'left';
    return `font-family:${fam};font-size:${pt}pt;font-weight:${bold ? 'bold' + dbcsBold(printedFamily(p.family || head.family, printer, pt10)) : 'normal'};` +
      `font-style:${p.italic === 'X' && canItalic(p.family || head.family, printer) ? 'italic' : 'normal'};text-decoration:${p.underline === 'X' ? 'underline' : 'none'};` +
      `line-height:${lh.toFixed(3)}mm;text-align:${align};` +
      `margin:${sapLenMm(p.before, style).toFixed(3)}mm ${sapLenMm(p.right, style).toFixed(3)}mm ${sapLenMm(p.after, style).toFixed(3)}mm ${sapLenMm(p.left, style).toFixed(3)}mm;` +
      `text-indent:${sapLenMm(p.indent, style).toFixed(3)}mm;clear:both;` +
      // the printer font, for its blank width (page script below)
      `--sapfam:${printedFamily(p.family || head.family, printer, pt10) || 'X'};--sappt:${Math.round(pt * 10)};--sapb:${bold ? 'B' : 'N'}`;
  }
}

// ── symbols ─────────────────────────────────────────────────────────────────────
function listSymbols(content) {
  const fonts = paragraphFonts(content.styles);
  const found = new Map();
  const walk = (nodes, ctx) => {
    for (const n of nodes || []) {
      const inLoop = ctx.inLoop || n.kind === 'loop' || n.kind === 'table46';
      let widthMm = ctx.widthMm;
      if (n.tableCell && ctx.cells) {
        const c = ctx.cells.find((x) => x.column === n.tableCell.cell && x.line === ctx.lineName(n.tableCell.line));
        if (c) widthMm = c.widthMm;
      }
      let para = '*';
      for (const l of n.lines || []) {
        if (l.format === '/*') continue; // comment line, not printed
        const command = l.format === '/:';
        if (l.format && !command && l.format !== '=' && l.format !== '/') para = l.format;
        for (const m of l.text.matchAll(SYMBOL_RE)) {
          const name = baseSymbol(m[1]);
          if (!found.has(name)) found.set(name, { name, occurrences: [] });
          found.get(name).occurrences.push({
            window: ctx.window, node: n.name, caption: n.caption, paragraph: para,
            fontPt: fonts[para] ?? null, cellWidthMm: widthMm ?? null, inLoop,
            ...(command ? { inCommand: true } : {}),
          });
        }
      }
      for (const c of n.where || []) {
        const wa = String(n.attrs?.TABHEADER || n.dataTable || '').toUpperCase();
        for (const op of [c.OP1, c.OP2]) {
          const ref = condRef(op);
          if (!ref) continue;
          const name = op === c.OP1 && !ref.name.includes('-') ? `${wa}-${ref.name}` : ref.name;
          if (!found.has(name)) found.set(name, { name, occurrences: [] });
          found.get(name).occurrences.push({ window: ctx.window, node: n.name, caption: n.caption, condition: `WHERE ${c.OP1} ${c.COP} ${c.OP2}`, inLoop: true });
        }
      }
      for (const c of n.condition?.COND || []) {
        for (const op of [c.OP1, c.OP2]) {
          const ref = condRef(op);
          if (!ref) continue;
          if (!found.has(ref.name)) found.set(ref.name, { name: ref.name, occurrences: [] });
          found.get(ref.name).occurrences.push({ window: ctx.window, node: n.name, caption: n.caption, condition: `${c.OP1} ${c.COP} ${c.OP2}`, inLoop });
        }
      }
      const child = { ...ctx, inLoop };
      if (n.templateLines && n.cells) {
        child.cells = n.cells;
        child.lineName = (nr) => n.templateLines.find((t) => nr >= t.from && nr <= t.to)?.name;
      } else if (n.lineTypes && n.cells) {
        child.cells = n.cells;
        child.lineName = (name) => name;
      }
      walk(n.children, child);
    }
  };
  for (const p of content.pages || [])
    for (const w of p.windows) walk(w.content, { window: w.name, widthMm: w.widthMm, inLoop: false });
  const decls = content.data || [];
  const symbols = [...found.values()].sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
    const head = s.name.split('-')[0];
    const decl = decls.find((d) => d.name === head);
    return { ...s, declaration: decl ?? null, system: head === 'SFSY' };
  });
  return { form: content.form, data: decls, symbols };
}

// ── conditions (one-page document) ────────────────────────────────────────────
// Conditions tab flags: firstPage / notFirstPage, afterMainEnd / beforeMainEnd
// (lastPage / notLastPage = the same flags in content read before 2026-10-16).
const PAGE_FLAGS = {
  firstPage: () => true,
  notFirstPage: () => false,
  afterMainEnd: (inMain) => !inMain,
  lastPage: (inMain) => !inMain,
  beforeMainEnd: (inMain) => inMain,
  notLastPage: (inMain) => inMain,
};

/** A condition operand that names a field: NAME or NAME+off(len); null for a literal. */
function condRef(op) {
  const s = String(op ?? '').trim();
  if (!s || /^'.*'$/.test(s) || /^-?[\d.]+$/.test(s) || /^SPACE$/i.test(s)) return null;
  const m = /^([A-Z0-9_/<>-]+?)(?:\+(\d+))?(?:\((\d+)\))?$/i.exec(s);
  return m ? { name: m[1].toUpperCase(), off: m[2] ? Number(m[2]) : 0, len: m[3] ? Number(m[3]) : null } : null;
}

function asNumber(v) {
  const t = String(v).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?-?$/.test(t)) return null;
  return Number(t.endsWith('-') ? `-${t.slice(0, -1)}` : t);
}

/** CP / NP pattern: * any string, + any one character. */
function sapLike(v, pattern) {
  const body = String(pattern).split('').map((c) => (c === '*' ? '.*' : c === '+' ? '.' : c.replace(/[.?^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(`^${body}$`, 'i').test(String(v).trimEnd());
}

/** Horizontal place of a template / table in its window: APPMODE L (left), C (centred),
 *  R (right-aligned — ZSD_EXP_CERT_01_ %TEMPLATE2), plus the LEFT offset. */
function tplPlace(n) {
  const a = n.attrs || {};
  const off = sapLenMm(`${a.LEFT || a.LEFTMARGIN || 0} ${a.U_LEFT || 'MM'}`, {});
  switch (String(a.APPMODE || '').toUpperCase()) {
    case 'R': return `margin-left:auto;margin-right:${off.toFixed(2)}mm;`;
    case 'C': return 'margin-left:auto;margin-right:auto;';
    default: return off ? `margin-left:${off.toFixed(2)}mm;` : '';
  }
}

/** Lines a table pattern (PATTERN-PATTNUM) draws, as learned from SAP's output:
 *  0002 every line (frame, between cells and rows) — ZMM_SF_POFORM3 %TEMPLATE1;
 *  0007 frame + a line below the header rows — ZMM_SF_POFORM3 %TABLE1. */
const PATTERNS = {
  '0001': {},                              // nothing (ZMM_SF_FORM20 %TEMPLATE2, ZFI_STOCK_IN %TEMPLATE4/6)
  '0013': { edges: ['bottom'] },           // the bottom line of the template (ZSDM56240_01_CN %BANK / %INVOICE)
  '0015': { edges: ['right', 'bottom'] },  // its right side and bottom (ZSDM56240_01_CN ADDRESS / PORT / VESSEL …)
  '0002': { all: true, outer: true },     // every line + frame (POFORM3, FORM20 %TEMPLATE1/5)
  '0003': { rows: true },                  // lines between rows (ZFI_STOCK_IN %TEMPLATE5, ZMM_SF_FORM20 %TEMPLATE4)
  '0004': { cols: true },                  // lines between cells (ZFI_STOCK_IN %TEMPLATE2)
  '0007': { header: true, tableFrame: true }, // line below the header; frame only round a table (POFORM3 %TABLE1, not FORM20 %TEMPLATE6)
  '0008': { tops: true },                  // (HYPOTHESIS) a line above the row, per cell (ZSD_SALES_CONTRACT_2_CN %TEMPLATE2, one row)
};
function patternOf(n, r) {
  const num = n.frame?.pattern;
  if (!num || num === '0000') return {};
  const p = PATTERNS[num];
  if (!p) { r.approx.push(`${n.name}: table pattern ${num} not known — its lines are not drawn`); return {}; }
  // PATTERN-BORDER = 'X' is the outer frame for any pattern but 0000 (STOCK_IN 0002/0004 without it:
  // no frame; FORM20 0004, PROFORMA_IV02 0001 with it: frame); older content without the flag
  // falls back to the learned per-pattern guess
  const outer = typeof n.frame.border === 'boolean' ? n.frame.border : p.outer || (p.tableFrame && n.kind === 'table46');
  return { ...p, outer, th: n.frame.lineMm || 0.26 };
}

/** Box of a window / node: the lines as an overlay on its edges, the distance as padding. */
// a side switched on with thickness 0 is the printer's thinnest line (ZSDRA0390_CI_T %WINDOW3)
const sideMm = (s) => (s?.mm > 0 ? s.mm : s?.on ? 0.1 : 0);
function boxFrame(box) {
  const sides = ['top', 'right', 'bottom', 'left'].map((k) => (sideMm(box[k]) > 0 ? `border-${k}:${sideMm(box[k])}mm solid ${box[k].color || '#000'};` : '')).join('');
  return `<div class="frame" style="${sides}${box.fill ? `background:${box.fill};z-index:-1;` : ''}"></div>`;
}
/** A window's box lies outside the window by its distances; the window's text area stays as it is
 *  (ZSDRA0390_CI_T %WINDOW7: DISTANCE 0.05 CM → lines 0.5 mm outside, the PL_T "double frame"). */
function windowFrame(box) {
  const out = ['top', 'right', 'bottom', 'left'].map((k) => `${k}:-${(box[k]?.distanceMm || 0).toFixed(2)}mm;`).join('');
  return boxFrame(box).replace('<div class="frame" style="', `<div class="frame" style="${out}`);
}
function boxPadding(box) {
  return ['top', 'right', 'bottom', 'left'].map((k) => (box[k]?.distanceMm > 0 ? `padding-${k}:${box[k].distanceMm}mm;` : '')).join('') + 'box-sizing:border-box;';
}

// ── rendering ───────────────────────────────────────────────────────────────────
class Renderer {
  constructor(content, values) {
    this.c = content;
    this.values = values.values || {};
    this.rows = Number(values.rows ?? 3);
    this.defaultPara = values.defaultParagraph || null;
    this.mark = Boolean(values.mark);
    this.row = 0;
    this.filled = new Set();
    this.unfilled = new Set();
    this.approx = [];
    this.defaultParaUsed = false;
    this.fonts = paragraphFonts(content.styles);
    this.graphics = new Map((content.graphics || []).map((g) => [`${g.object}|${g.name}|${g.id}|${g.btype}`, g]));
    this.texts = new Map((content.includeTexts || []).map((t) => [`${t.object}|${t.name}|${t.id}`, t]));
    this.styleNames = new Set((content.styles || []).filter((x) => x.css).map((x) => x.name));
    this.styleStack = [content.stdStyles?.[0]];
    this.missingStyles = new Set();
    this.condMissing = new Set(); // condition fields not in the values (taken as initial)
    this.inMain = false;
    this.waRow = {}; // work area → current row of its loop
    this.loopDepth = 0; // inside a loop / table body: arrays give one value per row
    this.seq = {};      // outside loops: arrays give their values in order of appearance
  }

  /** A node's own style if the system has it; otherwise the style its parents pass down
   *  (output options STDSTYLE of window / template / …, then the form's style). */
  styleFor(own, node) {
    const inherited = this.styleStack[this.styleStack.length - 1];
    if (!own || own === inherited || this.styleNames.has(own)) return own || inherited;
    if (!this.missingStyles.has(own)) {
      this.missingStyles.add(own);
      this.approx.push(`${node}: SmartStyle ${own} not in the system — drawn with ${inherited}`);
    }
    return inherited;
  }

  symbol(raw) {
    const name = baseSymbol(raw);
    const up = name.toUpperCase(); // symbols are not case sensitive (&sy-uline& = &SY-ULINE&)
    // "NAME@%TEXT59": a value for one text node only (a total the code sets for the footer,
    // ZFIRH0072_FORM_AP L_WRBTR) — wins over the loop's array
    let v = this.values[`${name}@${this.curNode}`] ?? this.values[`${up}@${this.curNode}`];
    if (v === undefined) v = this.values[name] ?? this.values[raw] ?? this.values[up];
    if (v === undefined) {
      const k = Object.keys(this.values).find((x) => x.toUpperCase() === up);
      if (k) v = this.values[k];
    }
    if (Array.isArray(v)) {
      // a counter the form's code advances between texts (ZMMM20930 &G_COUNT&) is written as
      // an array outside any loop: one value per appearance
      const idx = this.rowIndexFor(up);
      if (idx !== null) v = v.length ? v[idx % v.length] : undefined;
      else { const i = this.seq[up] ?? 0; this.seq[up] = i + 1; v = v.length ? v[Math.min(i, v.length - 1)] : undefined; }
    }
    if (v === undefined && SYS_DEFAULTS[up] !== undefined) v = SYS_DEFAULTS[up];
    if (v === undefined || v === null) {
      this.unfilled.add(name);
      return `<span class="sym" title="${esc(name)}">&amp;${esc(name)}&amp;</span>`;
    }
    this.filled.add(name);
    v = formatSymbol(String(v), raw);
    return this.mark ? `<span class="val" title="${esc(name)}">${esc(v)}</span>` : esc(v);
  }

  inline(raw, style) {
    // <(> … <)> protects characters (a literal & , < >): hide them from the parsing below
    const PROTECT = { '&': '\u0001', '<': '\u0002', '>': '\u0003', ',': '\u0004' };
    const text = String(raw).replace(/<\(>([\s\S]*?)<\)>/g, (m, s) => s.replace(/[&<>,]/g, (c) => PROTECT[c]));
    return this.inlineParsed(text, style)
      .replace(/\u0001/g, '&amp;').replace(/\u0002/g, '&lt;').replace(/\u0003/g, '&gt;').replace(/\u0004/g, ',');
  }

  /** Character formats of a style that print as a bar code (SSFSTRINGS BARCODE). */
  barcodeTags(style) {
    const st = (this.c.styles || []).find((x) => x.name === style);
    // a bar code with no type (TFO05 TYPE empty) prints as plain text in SAP
    return new Map((st?.strings || []).filter((s) => String(s.barcode || '').trim() && (!s.barcodeDef || String(s.barcodeDef.type || '').trim()))
      .map((s) => [s.tag, { name: String(s.barcode).trim(), size: barcodeSize(s.barcodeDef), type: s.barcodeDef?.type }]));
  }

  /** Symbols (arrows, shapes, dingbats U+2190–U+2BFF) in the literal text of a form in a
   *  Latin-1 language print as '#' (ZSD_PROFORMA_IV02, language E: □ ◆ → "#Air #Sea");
   *  Hangul / CJK literals in such forms print fine (ZHR_ZHRRA010_KO3, ZFI_STOCK_IN). (1 form) */
  cp(s, fam = '') {
    s = legacyDbcs(s, fam);
    // only a Latin printer font lacks them (reviewer H: the form language never decided it)
    if (!/^(HELV|TIME|COUR|ARIAL|LETGOTH|OCR)/i.test(fam)) return s;
    return s.replace(/[←-⯿]/g, '#');
  }

  inlineParsed(text, style) {
    let out = '';
    let last = 0;
    const stack = []; // open character formats: { bc: bar code name, at: start in out, fam }
    const strFam = new Map((((this.c.styles || []).find((x) => x.name === style) || {}).strings || []).map((s) => [s.tag, String(s.family || '').trim() && printedFamily(String(s.family).trim(), this.c.printer)]));
    const fam = () => (stack.length ? stack[stack.length - 1].fam : this.parFam) || '';
    const bcTags = style ? this.barcodeTags(style) : new Map();
    const re = /<([A-Z0-9]{1,2})>|<\/>|&([^&\s][^&]*?)&/g;
    const close = () => {
      const o = stack.pop();
      if (!o.bc) { out += '</span>'; return; }
      // nested bar-code formats: the innermost prints the bars, the outer one nothing more
      // (ZWM_NA_HQ_WH_DFC_PO <BR><BB>&IS_HEAD-BARCD&</></>: SAP's bars are BB's)
      if (out.slice(o.at).includes('class="bcw"')) { out += '</span>'; return; }
      // SAP prints only the bars of a bar-code format, standing on the baseline
      const value = unesc(out.slice(o.at).replace(/<[^>]*>/g, ''));
      // an empty field prints no bar code at all (ZFI_SMT_VAT_0606_WTOUT_QR: no BC record in the OTF)
      // (an unfilled placeholder counts as empty; literal text beside it still prints)
      const filled = unesc(out.slice(o.at).replace(/<span class="sym"[^>]*>[\s\S]*?<\/span>/g, '').replace(/<[^>]*>/g, ''));
      if (!filled.trim()) { out = out.slice(0, o.at) + '</span>'; return; }
      if (/[^\x20-\x7e]/.test(value)) this.approx.push(`bar code ${o.bc.name}: characters outside ASCII left out of the bars`);
      out = out.slice(0, o.at) + barcodeSvg(filled.trim(), o.bc.size || {}) + '</span>';
      if (!o.bc.size) this.approx.push(`bar code ${o.bc.name}: no SE73 definition read — drawn as Code 128 with 0.3 mm bars, 3.5 mm high`);
      else if (o.bc.type && o.bc.type !== 'BRLC') this.approx.push(`bar code ${o.bc.name}: symbology ${o.bc.type} drawn as Code 128`);
    };
    for (let m = re.exec(text); m; m = re.exec(text)) {
      out += esc(this.cp(text.slice(last, m.index), fam())).split(',,').join('<span class="tab"></span>'); // ,, = tab
      if (m[1]) {
        const bc = bcTags.get(m[1]);
        out += `<span id="${m[1]}" class="char${bc ? ' barcode' : ''}">`;
        stack.push({ bc, at: out.length, fam: strFam.get(m[1]) || fam() });
      } else if (m[0] === '</>') { if (stack.length) close(); }
      else out += this.symbol(m[2]);
      last = re.lastIndex;
    }
    out += esc(this.cp(text.slice(last), fam())).split(',,').join('<span class="tab"></span>');
    while (stack.length) close();
    return out;
  }

  /** '' / '=' continue the paragraph, '/' breaks the line in it, '*' = standard paragraph.
   *  '/*' comment lines are not printed; '/:' IF … ENDIF prints its first branch (as SAP does),
   *  other '/:' commands are skipped (listed under approximations). */
  paragraphs(lines, style, node) {
    const paras = [];
    const resolved = this.styleFor(style, node);
    const firstPar = (this.c.styles || []).find((x) => x.name === resolved)?.firstParagraph;
    const branches = [];
    const printing = () => branches.every((b) => b.on);
    for (const l of lines || []) {
      let f = l.format;
      if (f === '/*') continue;
      if (f === '/:') {
        const cmd = l.text.trim().replace(/\.$/, '');
        const kw = cmd.match(/^(IF|ELSEIF|ELSE|ENDIF)\b\s*(.*)$/i);
        if (!kw) { if (printing()) this.approx.push(`${node}: text command "${cmd}" not applied`); continue; }
        const word = kw[1].toUpperCase();
        if (word === 'ENDIF') { branches.pop(); continue; }
        if (word === 'IF') branches.push({ on: false, done: false });
        const b = branches[branches.length - 1];
        if (!b) continue;
        if (b.done) { b.on = false; continue; }
        // SAP prints the first branch of an IF in a SmartForm text whatever the
        // values are (ZSDM43020_PACKING: KDGRP '01' and 'ZZ' both printed the THEN lines)
        const hit = true; // IF taken, so ELSEIF / ELSE never are (b.done above)
        if (word === 'IF') this.approx.push(`${node}: text IF "${cmd}" — first branch drawn, as SAP prints it`);
        b.on = hit;
        b.done = hit;
        continue;
      }
      if (!printing()) continue;
      // continuation lines are joined before the inline tags are read: a character
      // format runs on across the line end (ZSD_NA_EMPLOYEE_SALES_INVOICE "<B1>Bank" / "casher check </>")
      const last = paras[paras.length - 1];
      // a blank-format line goes on after one joining blank and keeps its own leading blanks
      // (ZFI_SMT_VAT_0601 "Total" + 26 blanks + ":"; R23's dropping of them was wrong)
      if ((f === '' || f === '=') && last) { last.raw += f === '' ? ` ${l.text}` : l.text; continue; }
      if (f === '/' && last) { last.raw += `\n${l.text}`; continue; }
      if (!f || f === '*' || f === '/' || f === '=') {
        this.defaultParaUsed = !firstPar;
        f = firstPar || this.defaultPara || '*';
      }
      paras.push({ f, raw: l.text });
    }
    this.curNode = node;
    const stR = (this.c.styles || []).find((x) => x.name === resolved);
    for (const p of paras) {
      // R78 only in a single-byte font (the character format's, else the paragraph's): a DBCS
      // font prints the symbol (ZFTA0550 ■ in KPDODUM; ZSD_PROFORMA_IV02 □ in <A1> HELVE → '#')
      const fam = (stR?.paragraphs || []).find((x) => x.tag === p.f)?.family || stR?.font?.family || '';
      this.parFam = printedFamily(String(fam).trim(), this.c.printer); // the family the device prints (reviewer I)
      p.html = this.inline(p.raw, resolved);
    }
    this.parFam = '';
    // SAP breaks lines at blanks only, never after a hyphen (ZWO_FLEET_PRINT_N2 ": DR-SAMPLE-0001"
    // goes to line 2 whole): a hyphenated word is kept together; the page script lets a word
    // longer than a whole line break at its hyphens again (R71)
    for (const p of paras) p.html = p.html.replace(/(^|<[^>]*>)([^<]+)/g, (m, g, s) => (g.includes('class="sym"') ? m
      : g + s.replace(/[^\s\-–—]*[^\s\-–—][\-–—]\S*/g, (w) => `<span class="nb">${w}</span>`)));
    // a run of hyphens (a drawn rule) advances each hyphen by its width rounded to whole
    // twips, as SAP's OTF does (HELVE 9 pt 59.94 → 59, HELV_I7 8 pt 53.28 → 53): page script .hy
    // (ZSD_PI_VIETNAMN / ZSD_PI_TAIWAN 188 hyphens 3 mm, ZMMM20840_PACK / ZLE_PACKING_LIST 203 fit 190 mm)
    for (const p of paras) p.html = p.html.replace(/(^|<[^>]*>)([^<]+)/g, (m, g, s) => (g.includes('class="sym"') ? m
      : g + s.replace(/-{5,}/g, (w) => `<span class="hy">${w}</span>`)));
    const cls = styleClass(resolved);
    // a line with a bar code is at least one style line (1/LPI) high: TMS_PICKING_LIST 0.5 LN
    // paragraph → bars on the baseline one full line down; ZPPM40250 1.0 LN → no change
    const st = (this.c.styles || []).find((x) => x.name === resolved);
    const bcLine = (p) => {
      if (!st || !p.html?.includes('class="bcw"')) return '';
      const full = 25.4 / (st.lpi || 6);
      const own = sapLenMm(st.paragraphs?.find((x) => x.tag === p.f)?.lineSpacing, st);
      return own && own < full ? ` style="line-height:${full.toFixed(2)}mm"` : '';
    };
    // a line whose fields are all empty still takes its line (ZSDRA0390_CI_MO %TEXT63 empty REMARK1)
    return paras.map((p) => `<div class="${cls}" style="display:flow-root"><div id="${esc(p.f)}" class="par" data-node="${esc(node)}"${this.tabAttrs(resolved, p.f)}${bcLine(p)}>${p.html && (unesc(p.html.replace(/<[^>]*>/g, '')) || /class="bcw"|<img|<svg/.test(p.html)) ? p.html : (p.html || '') + '&nbsp;'}</div></div>`).join('');
  }

  /** The style a text node prints in: its output options (STDSTYLE), else the style its parents
   *  pass down (window / template / … / form) — not the style stored with the text (Q5:
   *  ZFI_SMT_VAT_0611_3_NEW GST2 texts print in the form's GST3 L1 HELVE 11 pt, ZSD_A5_DELNOTE_STD
   *  LO_STYLE texts in ZSD_LO_STYLE IT 10 pt; ZMM_GR_PRINT, code-driven at 20 %, scores lower). */
  textStyle(n) { return n.output?.STDSTYLE || this.styleStack[this.styleStack.length - 1] || n.style; }

  text(n) {
    if (n.include) {
      const t = this.texts.get(`${n.include.object}|${n.include.name}|${n.include.id}`);
      if (t?.lines) return this.paragraphs(t.lines, this.textStyle(n), n.name);
      // "no error if the text does not exist": a document's own text prints nothing when it
      // has none (ZSD_INVOICE_CO VBBK &GS_HEAD-VBELN& ZN01) — the sample document has none
      if (n.attrs?.IGNORE === 'X' && n.include.resolved === false) {
        this.approx.push(`${n.name}: include text ${n.include.object} ${n.include.name} ${n.include.id} depends on the document — not drawn (empty when the document has none)`);
        return '';
      }
      this.approx.push(`${n.name}: include text ${n.include.name} not available — shown as its key`);
      return this.paragraphs([{ format: '*', text: `[${n.include.object} ${n.include.name} ${n.include.id}]` }], this.textStyle(n), n.name);
    }
    // a dynamic text (TTYPE D) prints the text table its REF_NAME names: values.json gives it as
    // lines (strings or {TDFORMAT, TDLINE}); an array of such arrays is one text per loop row
    // (ZSD_NA_DELIVERY_NOTICE &GV_TEXT&, &GV_POTXT& filled per item by %CODE1)
    if (n.textType === 'dynamic' && n.attrs?.REF_NAME) {
      const name = String(n.attrs.REF_NAME).replace(/&/g, '').trim();
      const key = Object.keys(this.values).find((k) => k.toUpperCase() === name.toUpperCase());
      let v = key ? this.values[key] : undefined;
      if (Array.isArray(v) && v.length && Array.isArray(v[0])) {
        const idx = this.rowIndexFor(name.toUpperCase());
        v = v[(idx ?? 0) % v.length];
      }
      if (!Array.isArray(v)) {
        this.approx.push(`${n.name}: dynamic text ${name} — no lines in the values, not drawn`);
        return '';
      }
      const lines = v.map((l) => (typeof l === 'string' ? { format: '*', text: l }
        // an explicit blank TDFORMAT continues the paragraph (reviewer MN); no format at all = '*'
        : { format: String(l.TDFORMAT ?? l.format ?? '*').trim(), text: String(l.TDLINE ?? l.text ?? '') }));
      return this.paragraphs(lines, this.textStyle(n), n.name);
    }
    return this.paragraphs(n.lines, this.textStyle(n), n.name);
  }

  graphic(n) {
    // a key holding a &symbol& takes the sample value (&IM_SIGN& → ZHANTA_NEW, ZFTA0540_KR05_OLD)
    const sub = (v) => String(v).replace(/&([^&]+)&/g, (m, k) => { const x = this.values[k.trim().toUpperCase()] ?? this.values[k.trim()]; return x === undefined || Array.isArray(x) ? m : String(x); });
    const g = n.graphic && this.graphics.get(`${sub(n.graphic.object)}|${sub(n.graphic.name)}|${sub(n.graphic.id)}|${sub(n.graphic.btype)}`);
    if (!g?.file || !existsSync(g.file)) {
      this.approx.push(`${n.name}: graphic ${n.graphic?.name || '?'} ${n.graphic?.dynamic ? '(key set at print time)' : 'not available'} — drawn as a box`);
      return `<div class="missing" title="${esc(n.graphic?.name || '')}">${esc(n.graphic?.name || 'graphic')}</div>`;
    }
    const b64 = readFileSync(g.file).toString('base64');
    // the graphic node's own resolution overrides the one stored with the SE78 graphic
    const dpi = Number(n.graphic.resolution) || 0;
    const [wMm, hMm] = dpi && g.widthPix ? [g.widthPix / dpi * 25.4, g.heightPix / dpi * 25.4] : [g.widthMm, g.heightMm];
    // ALIGNMENT L / C / R places the graphic in its window or cell (ZMM_SF_POFORM3 %GRAPHIC2 centred)
    const al = String(n.attrs?.ALIGNMENT || "L").toUpperCase();
    const place = al === "C" ? "margin-left:auto;margin-right:auto;" : al === "R" ? "margin-left:auto;" : "";
    return `<img src="data:image/bmp;base64,${b64}" style="width:${wMm.toFixed(2)}mm;height:${hMm.toFixed(2)}mm;${place}" alt="${esc(g.name)}">`;
  }

  grid(n, rows) {
    const at = {};
    // a folder inside a template only groups nodes that carry their own cells
    // (same for an alternative: the nodes of its chosen branch keep their cells)
    const flat = (list) => (list || []).flatMap((ch) => {
      // a folder's own cell does not hold its nodes when they name cells of their own
      // (ZFIRH0072_FORM_AP %FOLDER1 in [1,1], its texts in [1,2] — SAP prints them in [1,2])
      const ownCells = ch.kind === 'section-F' && (ch.children || []).some((k) => k.tableCell);
      if (ch.tableCell && !ownCells) return [ch];
      // a loop without a cell whose nodes name one prints its rows stacked in that cell
      // (ZSD_OFFER LOOP_MSSR → MESSRS in [1,2])
      // (children naming different cells: one loop per cell, with its children — reviewer I;
      // the cell may sit deeper, under a folder or condition)
      if (!ch.tableCell && ch.kind === 'loop') {
        const cellOf = (k) => k.tableCell || (k.children || []).map(cellOf).find(Boolean) || null;
        const key = (c) => JSON.stringify(c);
        const cells = [...new Map((ch.children || []).map(cellOf).filter(Boolean).map((c) => [key(c), c])).values()];
        if (cells.length === 1) return [{ ...ch, tableCell: cells[0] }];
        if (cells.length > 1) return cells.map((c) => ({ ...ch, tableCell: c, children: ch.children.filter((k) => key(cellOf(k)) === key(c)) }));
      }
      if (ch.kind === 'section-F') return this.printsHere(ch.condition) ? flat(ch.children) : [];
      if (ch.kind === 'condition' && this.printsHere(ch.condition)) {
        // an alternative without a test takes its TRUE branch, nodes in their own cells
        // (ZFI_INVOICE_CO EMPTY_LINE_CHECK → DATA_MATNR … DATA_NETWR in cells 1–5)
        const want = !ch.test || this.printsHere({ COND: ch.test }) ? '+' : '-';
        return flat((ch.children || []).find((e) => e.attrs?.EVTYPE === want)?.children);
      }
      return [ch];
    });
    for (const ch of flat(n.children)) {
      // a node without a cell of its own prints in the first cell of the first line
      const tc = ch.tableCell || (n.templateLines ? { line: 1, cell: 1 } : null);
      if (!tc) continue;
      const k = `${tc.line}/${tc.cell}`;
      (at[k] = at[k] || []).push(ch);
    }
    const pat = patternOf(n, this);
    let html = `<div class="tpl" data-node="${esc(n.name)}" style="width:${n.width?.mm ?? 0}mm;${tplPlace(n)}">`;
    rows.forEach((r, ri) => {
      html += `<div class="row" style="position:relative;${r.h ? `height:${r.h}mm` : ''}">`;
      r.cells.forEach((c, ci) => {
        // pattern lines between cells / rows; the frame comes as one outline below
        const b = pat.all ? { right: ci < r.cells.length - 1 ? pat.th : 0, bottom: ri < rows.length - 1 ? pat.th : 0 }
          : pat.tops ? { top: pat.th } : pat.rows ? { bottom: ri < rows.length - 1 ? pat.th : 0 } : pat.cols ? { right: ci < r.cells.length - 1 ? pat.th : 0 } : c.borders || {};
        const bs = ['top', 'right', 'bottom', 'left'].map((s) => (b[s] ? `border-${s}:${b[s]}mm solid #000;` : '')).join('');
        const inner = (at[`${r.key}/${c.column}`] || []).map((x) => this.node(x)).join('');
        html += `<div class="cell" style="width:${c.widthMm}mm;${c.fill ? `background:${c.fill};` : ''}">${inner}${bs ? `<div class="frame" style="${bs}"></div>` : ''}</div>`;
      });
      if (pat.header && ri === 0) html += `<div class="frame" style="border-bottom:${pat.th}mm solid #000"></div>`;
      html += '</div>';
    });
    if (pat.outer) html += `<div class="frame" style="border:${pat.th}mm solid #000"></div>`;
    else if (pat.edges) html += `<div class="frame" style="${pat.edges.map((s) => `border-${s}:${pat.th}mm solid #000;`).join('')}"></div>`;
    return `${html}</div>`;
  }

  template(n) {
    const byLine = {};
    for (const c of n.cells || []) (byLine[c.line] = byLine[c.line] || []).push(c);
    const rows = [];
    for (const tl of n.templateLines || []) {
      // a line type with a REFERENCE and no height of its own takes the referenced line's
      // height (and its cells when it has none) — ZFI_MS_PAYMENT_LIST %C2 → %C1 0.80 CM
      const ref = tl.reference && (n.templateLines || []).find((t) => t.name === tl.reference);
      const h = tl.heightMm || ref?.heightMm || tl.heightMm;
      const own = byLine[tl.name]?.length ? byLine[tl.name] : (ref && byLine[ref.name]) || [];
      for (let nr = tl.from; nr <= tl.to; nr++)
        // a line type covering several rows may give each row its own lines (cells[].rows)
        rows.push({ key: nr, h, cells: own.slice().sort((a, b) => a.column - b.column).map((c) => (c.rows ? { ...c, ...(c.rows[nr - tl.from] || {}) } : c)) });
    }
    // a template is never split over pages (ZHR_ZHRFA0012_CP: the 2nd certificate goes to page 2 whole)
    return this.grid(n, rows).replace('<div class="tpl"', '<div class="tpl tmpl"');
  }

  /** Table node: one row per line type its texts use, in the order they appear. */
  /** Table (4.6 style) whose nodes flow into cells: T_NEWLINE starts a row of line type
   *  T_LINETYPE in its first cell, T_NEWCELL moves to the next cell, otherwise the node
   *  joins the current cell (ZMM_SF_POFORM3 %TABLE1). */
  tableFlow(n, list) {
    const rows = [];
    let row = null;
    let ci = 1;
    list.forEach((ch, idx) => {
      const o = ch.output || {};
      if (o.T_NEWLINE === 'X' || !row) {
        row = { lt: o.T_LINETYPE || row?.lt || n.lineTypes?.[0]?.name, cells: {} };
        rows.push(row);
        // (HYPOTHESIS) a new line that also asks for a new cell starts in cell 2 when its cells
        // outnumber its nodes (ZMMOC0510 5 texts in 7 cells: 品명 at x 18.0 = cell 2), else in
        // cell 1 (ZMM_SF_POFORM3 6 texts in 6 cells)
        let k = idx + 1;
        while (k < list.length && list[k].output?.T_NEWLINE !== 'X') k++;
        const nCells = (n.cells || []).filter((c) => c.line === row.lt).length;
        ci = o.T_NEWLINE === 'X' && o.T_NEWCELL === 'X' && nCells > k - idx ? 2 : 1;
      } else if (o.T_NEWCELL === 'X') ci++;
      (row.cells[ci] = row.cells[ci] || []).push(ch);
    });
    return rows.map((r) => {
      const cells = (n.cells || []).filter((c) => c.line === r.lt).sort((a, b) => a.column - b.column);
      const h = n.lineTypes?.find((t) => t.name === r.lt)?.heightMm;
      const pat = patternOf(n, this);
      const html = cells.map((c) => {
        const b = pat.all ? { top: pat.th, right: pat.th, bottom: pat.th, left: pat.th }
          : pat.tops ? { top: pat.th } : pat.rows ? { bottom: r !== rows[rows.length - 1] ? pat.th : 0 } : pat.cols ? { right: c !== cells[cells.length - 1] ? pat.th : 0 } : c.borders || {};
        const bs = ['top', 'right', 'bottom', 'left'].map((s) => (b[s] ? `border-${s}:${b[s]}mm solid #000;` : '')).join('');
        return `<div class="cell" style="width:${c.widthMm}mm;${c.fill ? `background:${c.fill};` : ''}">${this.nodes(r.cells[c.column])}${bs ? `<div class="frame" style="${bs}"></div>` : ''}</div>`;
      }).join('');
      return `<div class="row${h ? '' : ' autoh'}" style="${h ? `height:${h}mm` : ''}">${html}</div>`;
    }).join('');
  }

  tableBody(n, children) {
    const byLine = {};
    for (const c of n.cells || []) (byLine[c.line] = byLine[c.line] || []).push(c);
    const order = [];
    for (const ch of children) if (ch.tableCell?.line && !order.includes(ch.tableCell.line)) order.push(ch.tableCell.line);
    const rows = order.map((lt) => ({ key: lt, h: n.lineTypes?.find((t) => t.name === lt)?.heightMm, cells: (byLine[lt] || []).sort((a, b) => a.column - b.column) }));
    return this.grid({ ...n, children }, rows);
  }

  repeat(n) {
    const kids = n.children || [];
    const ev = (t) => kids.filter((c) => c.kind === 'event' && c.attrs?.EVTYPE === t);
    const body = kids.filter((c) => c.kind !== 'event');
    const part = (list) => {
      // a loop inside a table's event prints its rows (section R) as rows of that table
      // (ZFIRH0072_FORM_AP %EVENT3 F → %LOOP1 → %ROW3 %LTYPE3)
      if (n.kind !== 'table46' && this.curTable && list.some((c) => c.kind === 'section-R'))
        return list.map((r) => this.tableRow(this.curTable, r)).join('');
      if (n.kind !== 'table46') return this.nodes(list);
      // (a cell number without a line — T_CELLNR alone — is not a placed cell: ZMMOC0510 %TABLE1
      // texts flow by T_NEWLINE / T_NEWCELL)
      if (list.some((c) => c.tableCell?.line)) return this.tableBody(n, list);
      if (list.some((c) => c.output?.T_LINETYPE || c.output?.T_NEWLINE)) return this.tableFlow(n, list);
      return this.nodes(list);
    };
    let html = ev('H').map((e) => part(e.children || [])).join('');
    const pat = n.kind === 'table46' ? patternOf(n, this) : {};
    if (pat.header && html) html = `<div style="position:relative">${html}<div class="frame" style="border-bottom:${pat.th}mm solid #000"></div></div>`;
    this.loopDepth++;
    // sort events: S before the first row of a group, E after its last row (a group = rows with
    // the same value of SFIELD in the work area; without values all rows are one group)
    const sortEv = (t) => kids.filter((c) => c.kind === 'event' && c.attrs?.EVTYPE === t && c.attrs?.SFIELD);
    const wa = String(n.attrs?.TABHEADER || n.dataTable || '').toUpperCase();
    const key = (i, f) => { const v = this.values[`${wa}-${f}`]; return Array.isArray(v) ? v[i % v.length] : v; };
    const before = this.waRow[wa];
    // WHERE (WCOND): OP1 is a field of this loop's row, OP2 a value or a field of an outer
    // row (ZLE_SHIPPING_REQUEST_AP_ID: XT_ITEM rows with TKNUM / VBELN of the XT_HEAD row)
    const where = (n.where || []).map((c) => ({ ...c, OP1: condRef(c.OP1) && !String(c.OP1).includes('-') ? `${wa}-${c.OP1}` : c.OP1 }));
    const rowsHere = [];
    // row range FIRSTLINE..LASTLINE (ZSD_P_INVOICE: row 1 with the label, rows 2-5 without)
    const firstRow = Math.max(1, Number(n.attrs?.FIRSTLINE) || 1);
    const lastRow = Number(n.attrs?.LASTLINE) || Infinity;
    for (let j = firstRow - 1; j < Math.min(this.rowsOf(wa), lastRow); j++) {
      this.waRow[wa] = j;
      if (!where.length || this.printsHere({ COND: where })) rowsHere.push(j);
    }
    rowsHere.forEach((i, k) => {
      this.row = i;
      this.waRow[wa] = i;
      const prevRow = rowsHere[k - 1];
      const nextRow = rowsHere[k + 1];
      for (const e of sortEv('S')) if (k === 0 || key(i, e.attrs.SFIELD) !== key(prevRow, e.attrs.SFIELD)) html += part(e.children || []);
      html += part(body);
      for (const e of sortEv('E')) if (k === rowsHere.length - 1 || key(i, e.attrs.SFIELD) !== key(nextRow, e.attrs.SFIELD)) html += part(e.children || []);
    });
    if (before === undefined) delete this.waRow[wa]; else this.waRow[wa] = before;
    this.loopDepth--;
    this.row = 0;
    html += ev('F').map((e) => part(e.children || [])).join('');
    if (n.kind !== 'table46') return html;
    return `<div class="tpl" data-node="${esc(n.name)}" style="width:${n.width?.mm ?? 0}mm;${tplPlace(n)}">${html}${pat.outer ? `<div class="frame" style="border:${pat.th}mm solid #000"></div>` : ''}</div>`;
  }

  /** Value of a condition operand: literal, or the field from the values (missing = initial). */
  /** Rows a loop over this work area prints: the longest value array given for its fields
   *  (a table with 1 sample row prints 1 row — ZSD_PI_TAIWAN XT_SUBT), else the default count. */
  rowsOf(wa) {
    const pre = `${String(wa).toUpperCase()}-`;
    const lens = Object.entries(this.values).filter(([k, v]) => k.toUpperCase().startsWith(pre) && !k.includes('@') && Array.isArray(v)).map(([, v]) => v.length);
    if (lens.length) return Math.max(...lens);
    // values given only as scalars: the work area is one record — one row, not the default count
    // (ZSD_SHIPMENT_CDC loop over GT_HEADER into its header line)
    return Object.keys(this.values).some((k) => k.toUpperCase().startsWith(pre) && !k.includes('@')) ? 1 : this.rows;
  }

  /** Row of the loop a symbol belongs to: its work area's current row in nested loops
   *  (XT_HEAD row 2 while XT_ITEM is at row 0), else the innermost loop row. */
  rowIndexFor(name) {
    const wa = String(name).toUpperCase().split('-')[0];
    if (this.waRow[wa] !== undefined) return this.waRow[wa];
    return this.loopDepth > 0 ? this.row : null;
  }

  condOperand(op) {
    const s = String(op ?? '').trim();
    if (/^'.*'$/.test(s)) return s.slice(1, -1);
    if (/^SPACE$/i.test(s)) return '';
    const ref = condRef(s);
    if (!ref) return s;
    let v = this.values[ref.name];
    if (Array.isArray(v)) v = v[(this.rowIndexFor(ref.name) ?? this.row) % v.length];
    if (v === undefined || v === null) { this.condMissing.add(ref.name); v = ''; }
    v = String(v);
    return ref.len !== null || ref.off ? v.substr(ref.off, ref.len ?? undefined) : v;
  }

  /** Does the node print on page 1 (page flags + field conditions)? */
  printsHere(cond) {
    if (!cond) return true;
    for (const [k, on] of Object.entries(cond)) {
      if (on === true && PAGE_FLAGS[k] && !PAGE_FLAGS[k](this.inMain)) return false;
    }
    // lines are AND-ed; an {LOP: OR} item starts another group, and the groups are OR-ed
    // (ZSD_INVOICE_CO: GV_CPAGE EQ GS_HEAD-TPAGE  OR  GS_HEAD-TPAGE EQ 0)
    const groups = [[]];
    for (const c of cond.COND || []) {
      if (String(c.LOP || '').toUpperCase() === 'OR') groups.push([]);
      if (c.COP) groups[groups.length - 1].push(c);
    }
    return groups.some((g) => this.allHold(g));
  }

  allHold(lines) {
    for (const c of lines) {
      const a = this.condOperand(c.OP1);
      const b = this.condOperand(c.OP2);
      const na = asNumber(a === '' ? '0' : a);
      const nb = asNumber(b === '' ? '0' : b);
      const num = na !== null && nb !== null && (asNumber(a) !== null || asNumber(b) !== null);
      const cmp = num ? Math.sign(na - nb) : String(a).trimEnd().localeCompare(String(b).trimEnd());
      let ok;
      switch (String(c.COP).toUpperCase()) {
        case 'EQ': ok = cmp === 0; break;
        case 'NE': ok = cmp !== 0; break;
        case 'LT': ok = cmp < 0; break;
        case 'LE': ok = cmp <= 0; break;
        case 'GT': ok = cmp > 0; break;
        case 'GE': ok = cmp >= 0; break;
        case 'CP': ok = sapLike(a, b); break;
        case 'NP': ok = !sapLike(a, b); break;
        default:
          this.approx.push(`condition operator ${c.COP} not evaluated — node shown`);
          ok = true;
      }
      if (!ok) return false; // the lines of a condition are AND-ed
    }
    return true;
  }

  /** Tab stops of a paragraph (mm from the cell / window edge) and the style's default distance. */
  tabAttrs(styleName, tag) {
    const st = (this.c.styles || []).find((s) => s.name === styleName);
    if (!st) return '';
    const p = (st.paragraphs || []).find((x) => x.tag === tag);
    const stops = (p?.tabs || []).map((t) => sapLenMm(t[0], st).toFixed(2));
    // alignment of each stop: L / R / C (ZSDR96040_02 DF: 12.0 RIGHT, 14.7 RIGHT …)
    const just = (p?.tabs || []).map((t) => String(t[1] || 'LEFT').trim().charAt(0).toUpperCase() || 'L');
    const dist = sapLenMm(st.tabDistance, st);
    return `${stops.length ? ` data-tabs="${stops.join(',')}"` : ''}${just.some((j) => j !== 'L') ? ` data-tabj="${just.join(',')}"` : ''}${dist > 0 ? ` data-tabdist="${dist.toFixed(2)}"` : ''}`;
  }

  /** Table of rows and cells (section C → events → section R rows → section E cells):
   *  a row takes the cells of its line type (output option T_LINETYPE) in order. */
  table(n) {
    const outer = this.curTable;
    this.curTable = n;
    try { return this.tableInner(n); } finally { this.curTable = outer; }
  }

  tableInner(n) {
    const kids = n.children || [];
    const rowsOf = (list) => list.map((r) => this.tableRow(n, r)).join('');
    const ev = (t) => kids.filter((c) => c.kind === 'event' && c.attrs?.EVTYPE === t);
    const loose = kids.filter((c) => c.kind !== 'event');
    let html = ev('H').map((e) => rowsOf(e.children || [])).join('');
    const body = [...ev('B').flatMap((e) => e.children || []), ...loose];
    const wa = String(n.attrs?.TABHEADER || n.dataTable || '').toUpperCase();
    // the rows the table prints: WHERE (WCOND) and the row range, as for loops (repeat)
    const rowsHere = [];
    const before = this.waRow[wa];
    if (n.dataTable) {
      // a WHERE line on a row field the values do not give cannot be decided: left out (the
      // rows print, as before tables took WHERE — ZFI_SMT_PARK_DOCUMENT_PRN2 GJAHR / BELNR)
      const where = (n.where || []).map((c) => ({ ...c, OP1: condRef(c.OP1) && !String(c.OP1).includes('-') ? `${wa}-${c.OP1}` : c.OP1 }))
        .filter((c) => {
          const ref = condRef(c.OP1);
          if (!ref || this.values[ref.name] !== undefined) return true;
          this.approx.push(`${n.name}: WHERE ${c.OP1} ${c.COP} ${c.OP2} not decided (no value) — all rows printed`);
          return false;
        });
      const firstRow = Math.max(1, Number(n.attrs?.FIRSTLINE) || 1);
      const lastRow = Number(n.attrs?.LASTLINE) || Infinity;
      for (let j = firstRow - 1; j < Math.min(this.rowsOf(wa), lastRow); j++) {
        this.waRow[wa] = j;
        if (!where.length || this.printsHere({ COND: where })) rowsHere.push(j);
      }
    } else rowsHere.push(0);
    // sort events (SFIELD): S rows before the first row of a group, E rows after its last row
    // (ZSD_NA_SHIPING_NOTICE %EVENT4 "PO Qty." per BSTNK). A variable printed in a sort event
    // takes one value per group (values.json: an array by group, V_POQTY ["30","5"])
    const sortEv = (t) => kids.filter((c) => c.kind === 'event' && c.attrs?.EVTYPE === t && c.attrs?.SFIELD);
    const key = (i, f) => { const v = this.values[`${wa}-${f}`]; return Array.isArray(v) ? v[i % v.length] : v; };
    // group number per sort field: counts up where a group starts
    const groups = {};
    const groupRows = (e) => { this.row = groups[e.attrs.SFIELD] ?? 0; return rowsOf(e.children || []); };
    if (n.dataTable) this.loopDepth++;
    rowsHere.forEach((i, k) => {
      if (n.dataTable) this.waRow[wa] = i;
      const prev = rowsHere[k - 1], next = rowsHere[k + 1];
      const fields = [...new Set(sortEv('S').concat(sortEv('E')).map((e) => e.attrs.SFIELD))];
      for (const f of fields) if (k === 0 || key(i, f) !== key(prev, f)) groups[f] = (groups[f] ?? -1) + 1;
      for (const e of sortEv('S')) if (k === 0 || key(i, e.attrs.SFIELD) !== key(prev, e.attrs.SFIELD)) html += groupRows(e);
      this.row = i;
      html += rowsOf(body);
      for (const e of sortEv('E')) if (k === rowsHere.length - 1 || key(i, e.attrs.SFIELD) !== key(next, e.attrs.SFIELD)) html += groupRows(e);
      this.row = i;
    });
    if (n.dataTable) this.loopDepth--;
    // the footer sees the work area the loop left: its last row (ZSDR54010_INVOICE %ROW3 tests
    // IT_ITEM-POSNR = 000000, the total row, last)
    const foot = ev('F');
    const last = rowsHere[rowsHere.length - 1];
    if (foot.length && n.dataTable && last !== undefined) {
      this.loopDepth++;
      this.row = last;
      this.waRow[wa] = last;
      try { html += foot.map((e) => rowsOf(e.children || [])).join(''); } finally { this.loopDepth--; }
    } else html += foot.map((e) => rowsOf(e.children || [])).join('');
    if (n.dataTable) { if (before === undefined) delete this.waRow[wa]; else this.waRow[wa] = before; }
    this.row = 0;
    return `<div class="tpl" data-node="${esc(n.name)}" style="width:${n.width?.mm ?? 0}mm;${tplPlace(n)}">${html}</div>`;
  }

  tableRow(table, r) {
    // a folder in a table event groups rows: each prints as a row of the table
    // (ZSDR32300_FTACO_PANAMA %TABLE2 %FOLDER2 → %ROW1/3/2… of their own line types)
    const holdsRows = (x) => (x.children || []).some((k) => k.kind === 'section-R' || (k.kind === 'section-F' && holdsRows(k)));
    if (r.kind === 'section-F' && holdsRows(r))
      return this.printsHere(r.condition) ? (r.children || []).map((k) => this.tableRow(table, k)).join('') : '';
    if (r.kind !== 'section-R') return this.node(r);
    if (!this.printsHere(r.condition)) return '';
    const lt = r.output?.T_LINETYPE;
    const cells = (table.cells || []).filter((c) => c.line === lt).sort((a, b) => a.column - b.column);
    const h = table.lineTypes?.find((t) => t.name === lt)?.heightMm;
    const own = r.output?.STDSTYLE;
    if (own) this.styleStack.push(this.styleFor(own, r.name));
    try {
      const contents = (r.children || []).filter((c) => c.kind === 'section-E');
      const html = cells.map((c, i) => {
        const b = c.borders || {};
        const bs = ['top', 'right', 'bottom', 'left'].map((s) => (b[s] ? `border-${s}:${b[s]}mm solid #000;` : '')).join('');
        const inner = contents[i] ? this.node(contents[i]) : '';
        return `<div class="cell" style="width:${c.widthMm}mm;${c.fill ? `background:${c.fill};` : ''}">${inner}${bs ? `<div class="frame" style="${bs}"></div>` : ''}</div>`;
      }).join('');
      return `<div class="row${h ? '' : ' autoh'}" style="${h ? `height:${h}mm` : ''}">${html}</div>`;
    } finally { if (own) this.styleStack.pop(); }
  }

  node(n) {
    if (!this.printsHere(n.condition)) return '';
    const own = n.output?.STDSTYLE;
    if (own) this.styleStack.push(this.styleFor(own, n.name));
    try {
      let html = this.nodeBody(n);
      // a template with its vertical position set (VPOS_USED, TOP) stands at that place in its
      // window, out of the flow (ZSD_ZSDR30460_01 %TEMPLATE3 at 1.70 CM beside %TEMPLATE2)
      const a = n.attrs || {};
      if (html && n.kind === 'template' && a.VPOS_USED === 'X' && Number(a.TOP)) {
        html = `<div class="vpos" style="position:absolute;left:0;right:0;top:${sapLenMm(`${a.TOP} ${a.U_TOP || 'MM'}`, {}).toFixed(2)}mm">${html}</div>`;
      }
      return n.box && html ? `<div class="boxed" style="${boxPadding(n.box)}">${html}${boxFrame(n.box)}</div>` : html;
    } finally { if (own) this.styleStack.pop(); }
  }

  nodeBody(n) {
    switch (n.kind) {
      case 'text': return this.text(n);
      case 'graphic': return this.graphic(n);
      case 'template': return this.template(n);
      case 'loop': case 'table46': return this.repeat(n);
      case 'section-C': return this.table(n);
      case 'condition': {
        // alternative: TRUE event (EVTYPE +) or FALSE event (EVTYPE -) by its test
        // an empty test is TRUE in SAP (R87): the + event
        if (!n.test) {
          const t = (n.children || []).find((c) => c.attrs?.EVTYPE === '+');
          return t ? this.nodes(t.children) : n.children?.length ? this.node(n.children[0]) : '';
        }
        const want = this.printsHere({ COND: n.test }) ? '+' : '-';
        const ev = (n.children || []).find((c) => c.attrs?.EVTYPE === want);
        return ev ? this.nodes(ev.children) : '';
      }
      case 'address':
        this.approx.push(`${n.name}: address node — drawn as a box`);
        return `<div class="missing">address ${esc(n.caption || n.name)}</div>`;
      case 'code': return '';
      // a command with NEWPAGE (its condition already held) starts the next page: what follows
      // in MAIN is not on page 1 (ZFI_SMT_VAT_0606_BK: one invoice per row)
      case 'command': return n.attrs?.NEWPAGE === 'X' && this.inMain ? '<div class="sfbreak"></div>' : '';
      default: return this.nodes(n.children);
    }
  }

  nodes(list) {
    let out = '';
    let textEnd = -1; // out.length right after a plain text node's paragraphs
    for (const n of list || []) {
      const h = this.node(n);
      // a text node "append directly" (APPMODE A) goes on in the last paragraph before it
      // (ZSD_A5_DELNOTE_STD SUB_TOTAL + SUB_QUNIT print "1266EA" on one line) — only when that
      // paragraph is the last thing written (not a box frame or a template — reviewer J)
      if (h && n.kind === 'text' && n.attrs?.APPMODE === 'A' && textEnd === out.length && out.endsWith('</div></div>')) {
        const m = /^<div class="([^"]*)" style="display:flow-root"><div [^>]*class="par"[^>]*>([\s\S]*?)<\/div><\/div>/.exec(h);
        if (m) {
          const inner = m[2].replace(/&nbsp;$/, '');
          const head = out.slice(0, -'</div></div>'.length).replace(/&nbsp;$/, '');
          // both empty: the line keeps its height
          const merged = `${head}<span class="${m[1]}">${inner}</span>`;
          out = `${merged}${unesc(merged.slice(merged.lastIndexOf('class="par"')).replace(/<[^>]*>/g, '').replace(/^[^>]*>/, '')).trim() || /class="bcw"|<img|<svg/.test(merged.slice(merged.lastIndexOf('class="par"'))) ? '' : '&nbsp;'}</div></div>${h.slice(m[0].length)}`;
          textEnd = out.length;
          continue;
        }
      }
      out += h;
      if (h && n.kind === 'text' && !n.box) textEnd = out.length;
    }
    return out;
  }

  windowNodes(win) {
    this.inMain = win.type === 'MAIN';
    if (!this.printsHere(win.condition)) return '';
    const own = win.output?.STDSTYLE;
    if (!own) return this.nodes(win.content);
    this.styleStack.push(this.styleFor(own, win.name));
    try { return this.nodes(win.content); } finally { this.styleStack.pop(); }
  }

  page() {
    const p = this.c.pages[0];
    if (this.c.pages.length > 1) this.approx.push(`form has ${this.c.pages.length} pages — first page drawn (${p.name})`);
    const landscape = p.orientation === 'landscape';
    const [w, h] = landscape ? [297, 210] : [210, 297];
    if (p.format && p.format !== 'DINA4') this.approx.push(`page format ${p.format} drawn as A4`);
    const body = p.windows.map((win) => `<div class="win${win.type === 'MAIN' ? ' main' : ''}${win.condition?.afterMainEnd || win.condition?.lastPage ? ' aftermain' : ''}" data-win="${esc(win.name)}" style="left:${win.leftMm}mm;top:${win.topMm}mm;width:${win.widthMm}mm;height:${win.heightMm}mm;">${this.windowNodes(win)}${win.box && (win.content?.length || win.type !== 'MAIN') ? windowFrame(win.box) : ''}</div>`).join(''); // an empty MAIN window prints no box (ZSDM43020_CMR); an empty secondary window does (ZSD_PACK_LIST FRAME)
    // SAP keeps the line spacing even when the font is taller (glyphs overlap the line above);
    // the baseline sits at the bottom of each line - see the script below.
    const css = (this.c.styles || []).map((s) => `${s.css || ''}\n${paragraphCss(s, this.c.printer)}
${stringCss(s, this.c.printer)}`).join('\n');
    return { w, h, html: `<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.c.form)} preview</title><style>
@page{size:${w}mm ${h}mm;margin:0}
html,body{margin:0;background:#fff}
.sheet{zoom:${ZOOM};position:relative;width:${w}mm;height:${h}mm;background:#fff;overflow:hidden}
.win{position:absolute;box-sizing:border-box}
.win img{display:block}
/* a graphic prints whole, past the cell it stands in (ZFI_SMT_VAT_0606_IND logo, ZSDRA0390_PL_T signature) */
.row:has(img),.cell:has(img),.tpl:has(img),.row:has(.bc),.cell:has(.bc),.tpl:has(.bc){overflow:visible}
.bcw{display:inline-block;position:relative;height:0;vertical-align:baseline}.bcw>svg{position:absolute;left:0;bottom:0}
.row{display:flex;overflow:hidden}
.cell{box-sizing:border-box;overflow:hidden;flex:none;position:relative}
.tpl,.boxed{position:relative}
.frame{position:absolute;inset:0;box-sizing:border-box;pointer-events:none}
/* SAP gives every glyph its full advance: no kerning pairs, no ligatures (ZSDR54190_INVOICE "1111111111" HELVE 9 pt: 24.7 mm, kerned 22.2) */
.par{white-space:pre-wrap;font-kerning:none;font-variant-ligatures:none}
.nb{white-space:nowrap}
/* Angsana (Thai) is not on most PCs: Arial at 61 % of the size has its widths (ZSDR54090_TAX_INVOICE3) */
@font-face{font-family:"SF Angsana fallback";src:local("Arial");size-adjust:61%}
/* a character format never changes the line spacing of its paragraph (ZMMM20930 9 pt spans in a 12 pt paragraph) */
.par .char{line-height:0}
.cell .par{overflow-wrap:anywhere}
.sym{color:#1a4f9c;background:#e8f0fb}
.val{background:#fff6c8}
.missing{font:8pt Arial,Helvetica,sans-serif;color:#b00;border:0.2mm dashed #b00;height:100%;box-sizing:border-box;padding:1mm}
${css}
</style></head><body><div class="sheet" data-zoom="${ZOOM}">${body}</div>
<script>(function(){
// a character format that only wraps other character formats prints nothing of its own: it makes
// no inline box when it is larger than all the text inside (a 48 pt outer format around 22 pt text grew
// a 1 LN line by 1.2 mm — ZLE_CTR_PRINT_CN_SPLIT; an 18 pt wrapper of 18 pt text stays: ZMMR03040N title)
document.querySelectorAll('.sheet .par span.char:not(.barcode)').forEach(function(e){
 for(var n=e.firstChild;n;n=n.nextSibling)if(n.nodeType===3||!(n.classList&&n.classList.contains('char')))return;
 var fs=parseFloat(getComputedStyle(e).fontSize),big=true,tw=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),tn;
 while((tn=tw.nextNode()))if(/\\S/.test(tn.nodeValue)&&parseFloat(getComputedStyle(tn.parentElement).fontSize)>=fs){big=false;break;}
 if(big)e.style.display='contents';});
// SAP advances a blank by the width its device type's font metrics give (SW in the OTF), in whole
// twips: from the table of widths SAP sent (blank-widths.json, by device / family / size / bold),
// else the browser's width rounded down (HELVE 12 pt bold 66.72 → 66); long runs of blanks drift
// otherwise (ZFI_SMT_VAT_0601 / _C: 86 leading blanks, 1 mm; KPPDF HELVE 10 pt 56, PDFUC 14 pt 78 — reviewer I)
if(!window.__sfNoSW){var cv=document.createElement('canvas').getContext('2d'),SW=${JSON.stringify(blankWidths(this.c.printer?.deviceType))},DEV=${JSON.stringify(String(this.c.printer?.deviceType || '').trim().toUpperCase())};
document.querySelectorAll('.sheet .par, .sheet .par span.char').forEach(function(e){var cs=getComputedStyle(e);
 cv.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;var px=cv.measureText(' ').width;var tw=px*15;
 var f=cs.getPropertyValue('--sapfam').trim()+'|'+cs.getPropertyValue('--sappt').trim()+'|',b=cs.getPropertyValue('--sapb').trim()==='B'?'B':'';
 // not in the table: KPPDF HELVE is round(0.28 em), TIMES 0.25 em in all its entries (reviewer J);
 // PDFUC HELVE / HELV_I7 round(0.277 em) at all 25 sizes seen (reviewer MN); else floor
 var fam=cs.getPropertyValue('--sapfam').trim(),p10=Number(cs.getPropertyValue('--sappt'))||0;
 var est=DEV==='KPPDF'&&p10&&fam==='HELVE'?Math.round(0.56*p10):DEV==='KPPDF'&&p10&&fam==='TIMES'?Math.round(0.5*p10)
  :DEV==='PDFUC'&&p10&&/^HELV(E|_I7)$/.test(fam)?Math.round(0.554*p10):Math.floor(tw+1e-6);
 var want=SW[f+b]!=null?SW[f+b]:SW[f+(b?'':'B')]!=null?SW[f+(b?'':'B')]:est;
 // always set: a character format must not inherit its paragraph's correction
 var d=want-tw;e.style.wordSpacing=(Math.abs(d)<0.001?0:d/15)+'px';});
document.querySelectorAll('.sheet .par span.hy').forEach(function(e){var cs=getComputedStyle(e);
 cv.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;var tw=cv.measureText('-').width*15;
 // PDFUC rounds to the nearest twip (HELV_I7 8 pt 53.28 → 53, HELVE 10 pt 66.6 → 67: ZSDR56010_CN);
 // KPPDF keeps its metric in hundredths of an em: round(round(w / em, 2) × em) (HELVE 9 pt
 // 0.333 → 0.33 × 180 = 59: ZSD_PI_VIETNAMN / _TAIWAN — reviewer MN)
 // (DBCS fonts keep the old rule: their hyphen is the FC width, item 24 — ZMM_FORM_CRMIN KPDODUM)
 var em=parseFloat(cs.fontSize)*15,dbcs=/^(KP|CN|JP|TW|ANDALE)/.test(cs.getPropertyValue('--sapfam').trim());
 var want=DEV==='KPPDF'&&dbcs?Math.floor(tw+1e-6):DEV==='KPPDF'&&em?Math.round(Math.round(tw/em*100)/100*em):Math.round(tw);
 var d=want-tw;if(Math.abs(d)>0.001)e.style.letterSpacing=(d/15)+'px';});
// words: SAP adds up the glyph widths of its device type's font metrics, each rounded to whole
// twips (PDFUC HELVCYR 10 pt "P215/60R16 95H" = 1530 tw, fits a 1531 tw cell — the browser's
// Arial is 1535 and wraps: ZSMARTFORM_UTQG). Widths from SAP's own PDFs (glyph-widths.json)
var GW=${JSON.stringify(glyphWidths(this.c.printer?.deviceType))};
if(Object.keys(GW).length){var tws=document.createTreeWalker(document.querySelector('.sheet'),NodeFilter.SHOW_TEXT),tn,list=[];
 while((tn=tws.nextNode())){var pe=tn.parentElement;if(!pe||!pe.closest('.par')||pe.closest('.hy')||pe.closest('.gw')||!/\\S/.test(tn.nodeValue))continue;list.push(tn);}
 list.forEach(function(tn){var pe=tn.parentElement,cs=getComputedStyle(pe);var fam=cs.getPropertyValue('--sapfam').trim(),p10=Number(cs.getPropertyValue('--sappt'))||0;
  var gk=fam+'|'+(cs.getPropertyValue('--sapb').trim()==='B'?'B':'');var w=GW[gk+'|'+p10]||GW[gk];if(!w||!p10)return;
  cv.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
  // one wrapper per text node (the metric reads runs per node): letter-spacing = the average
  // correction of its non-blank glyphs, word-spacing less by as much (blanks keep their SW width)
  // measured on the page (a canvas does not see fallback font faces: ZSDR54080_DEBIT_CREDIT
  // Angsana New → "SF Angsana fallback" drew 0.47 mm wider than the canvas measured)
  var Zm=Number((document.querySelector('.sheet')||{}).dataset.zoom)||1,rg=document.createRange();
  var want=0,have=0,n=0,re=/\\S+/g,m,v=tn.nodeValue;
  while((m=re.exec(v))){var s=m[0],ws=0;for(var i=0;i<s.length;i++){var c=s.charCodeAt(i),g=c>=32&&c<=255?w[c-32]:null;if(g==null)return;ws+=Math.round(g*p10/500);}
   rg.setStart(tn,m.index);rg.setEnd(tn,m.index+s.length);var px=0,rs=rg.getClientRects();for(var q=0;q<rs.length;q++)px+=rs[q].width;
   want+=ws;have+=px/Zm*15;n+=s.length;}
  if(!n)return;var ls=parseFloat(cs.letterSpacing)||0,d=(want-have)/n;if(Math.abs(d)<0.05)return;
  var sp=document.createElement('span');sp.className='gw';sp.style.letterSpacing=(ls+d/15)+'px';sp.style.wordSpacing=((parseFloat(cs.wordSpacing)||0)-d/15)+'px';
  pe.replaceChild(sp,tn);sp.appendChild(tn);});}}
})();</script>
<script>(function(){
// a hyphenated word longer than a whole line breaks at its hyphens as SAP does
// (ZSD_TRANSACTION_SPEC "MAT-" / "SAMPLE-"), on a line of its own (ZWO_FLEET_PRINT_N2)
document.querySelectorAll('.par .nb').forEach(function(s){var par=s.closest('.par');
 if(s.getBoundingClientRect().width<=par.getBoundingClientRect().width+0.5)return;
 var rg=document.createRange();rg.setStart(par,0);rg.setEndBefore(s);
 if(rg.toString().replace(/\\s/g,'')&&!/\\n\\s*$/.test(rg.toString()))s.parentNode.insertBefore(document.createElement('br'),s);
 while(s.firstChild)s.parentNode.insertBefore(s.firstChild,s);s.parentNode.removeChild(s);});})();</script>
<script>window.__sfPaginate=function(){
// MAIN overflows onto the next page: from the first row / paragraph that does not fit, the
// rest of MAIN belongs to page 2 and is not drawn on page 1 (ZMMM20930 closing text)
var cont=false;document.querySelectorAll('.win.main').forEach(function(w){var wb=w.getBoundingClientRect().bottom+0.5,gone=false,first=true;
w.querySelectorAll('.tmpl, .row, .par, img, .sfbreak').forEach(function(e){if(e.classList.contains('sfbreak')){if(!gone){gone=true;cont=true;}return;}if(!e.classList.contains('tmpl')&&e.parentElement.closest('.tmpl'))return;if(!e.classList.contains('row')&&!e.classList.contains('tmpl')&&e.closest('.row'))return;
var eb=e.getBoundingClientRect().bottom-(parseFloat(e.style.top)||0)*${ZOOM};if(!gone&&eb>wb&&!first){gone=true;cont=true;}first=false;if(gone)e.style.visibility='hidden';});});
// a cell or window cuts whole lines, never half a line (SAP prints the lines that fit);
// the first line of a window always prints (ZFI_US_PAYMENT_LIST %WINDOW4: 6.35 mm line in a 6 mm window)
document.querySelectorAll('.cell .par, .win:not(.main) > div > .par').forEach(function(p){var box=p.closest('.cell')||p.closest('.win');var bb=box.getBoundingClientRect().bottom+0.5;var r=p.getBoundingClientRect();var sh=(parseFloat(p.style.top)||0)*${ZOOM};var top=r.top-sh,bot=r.bottom-sh;
if(bot<=bb)return;var lh=parseFloat(getComputedStyle(p).lineHeight)*${ZOOM};if(!(lh>0))return;var fit=Math.floor((bb-top)/lh+0.01);if(box.classList.contains('win')&&box.querySelector('.par')===p)fit=Math.max(fit,1);p.style.maxHeight=Math.max(0,fit*lh/${ZOOM})+'px';p.style.overflow='hidden';});
// windows printed only after the end of MAIN wait for the page where MAIN ends (ZMMM20930 %WINDOW3)
if(cont)document.querySelectorAll('.win.aftermain').forEach(function(w){w.style.visibility='hidden';});
return cont;};</script>
<script>(function(){
// auto-height table row: SAP adds 1/4 of the largest printed font size below the text
// (5 twips per point: KPDODUM 8 pt +40 tw in ZFTA0540, TIMES 9 pt +45 tw in ZMMM20930)
document.querySelectorAll('.row.autoh').forEach(function(r){var mx=0;r.querySelectorAll('.par, .par *').forEach(function(e){var own=[].some.call(e.childNodes,function(n){return n.nodeType===3&&n.nodeValue.trim();});if(own){var s=parseFloat(getComputedStyle(e).fontSize);if(s>mx)mx=s;}});
if(mx)r.querySelectorAll(':scope>.cell').forEach(function(c){c.style.paddingBottom=(mx*0.25)+'px';});});})();</script>
<script>(function(){var Z=${ZOOM},PXMM=96/25.4;
// ,, tabs: up to the next tab stop of the paragraph, else the next multiple of the
// style's default distance, measured from the left edge of the cell / window
document.querySelectorAll('.tab').forEach(function(t){var p=t.closest('.par');var box=t.closest('.cell')||t.closest('.win');if(!p||!box)return;
var x=(t.getBoundingClientRect().left-box.getBoundingClientRect().left)/Z/PXMM;
var stops=(p.dataset.tabs||'').split(',').filter(Boolean).map(Number);var d=Number(p.dataset.tabdist)||0;
var next=stops.find(function(s){return s>x+0.05;});var ji=stops.indexOf(next);if(next===undefined&&d>0)next=(Math.floor((x+0.05)/d)+1)*d;if(next===undefined)next=x+2;
// a RIGHT / CENTER stop aligns the text up to the next tab on the stop, trailing blanks not
// counted (ZSDR96040_02 "HQ   " ends at 17.7 cm); text wider than the room starts where it is
var j=ji>=0?((p.dataset.tabj||'').split(',')[ji]||'L'):'L';var w=next-x;
if(j==='R'||j==='C'){var tabs=Array.prototype.slice.call(p.querySelectorAll('.tab'));var nt=tabs[tabs.indexOf(t)+1];
 var tw=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),tn,l=Infinity,r=-Infinity,top0=null,cr=document.createRange();
 while((tn=tw.nextNode())){if(t.compareDocumentPosition(tn)&Node.DOCUMENT_POSITION_PRECEDING)continue;if(nt&&(nt.compareDocumentPosition(tn)&Node.DOCUMENT_POSITION_FOLLOWING))break;
  for(var k=0;k<tn.nodeValue.length;k++){if(/\\s/.test(tn.nodeValue[k]))continue;cr.setStart(tn,k);cr.setEnd(tn,k+1);var q=cr.getClientRects()[0];if(!q)continue;
   if(top0===null)top0=q.top;if(Math.abs(q.top-top0)>2)continue;l=Math.min(l,q.left);r=Math.max(r,q.right);}}
 var seg=r>l?(r-l)/Z/PXMM:0;
 w=next-x-(j==='R'?seg:seg/2);
 // the text may run back over the trailing blanks before it, not over ink or an earlier tab
 // (ZSDR96040_02 "BOX" ends at 18.6 cm over the blanks of "HQ   "; reviewer H)
 // (ink of the tab's own line only, never left of the box — reviewer I)
 if(w<0){var bl=box.getBoundingClientRect().left,lim=0,tr=t.getBoundingClientRect(),tm=(tr.top+tr.bottom)/2,pw=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),pn,pr=document.createRange();
  while((pn=pw.nextNode())){if(!(t.compareDocumentPosition(pn)&Node.DOCUMENT_POSITION_PRECEDING))break;
   for(var k2=0;k2<pn.nodeValue.length;k2++){if(/\\s/.test(pn.nodeValue[k2]))continue;pr.setStart(pn,k2);pr.setEnd(pn,k2+1);var q2=pr.getClientRects()[0];if(q2&&Math.abs((q2.top+q2.bottom)/2-tm)<(q2.bottom-q2.top))lim=Math.max(lim,(q2.right-bl)/Z/PXMM);}}
  var pt=tabs[tabs.indexOf(t)-1];if(pt)lim=Math.max(lim,(pt.getBoundingClientRect().right-bl)/Z/PXMM);
  w=x+w>=lim?w:Math.max(0,lim-x);if(w>0)w=0;}}
// a tab with no ink after it in the paragraph makes no room and no new line (ZSMARTFORM_UTQG
// %TEXT3 lines ending ",,,,,," after ~85 mm of text: one line each in SAP)
var ink=false,aw=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),an;while((an=aw.nextNode())){if(t.compareDocumentPosition(an)&Node.DOCUMENT_POSITION_FOLLOWING&&/\\S/.test(an.nodeValue)){ink=true;break;}}
if(!ink)w=0;
if(w<0){t.style.display='inline-block';t.style.width='0';t.style.marginLeft=w+'mm';}
else{t.style.display='inline-block';t.style.width=w+'mm';}});})();</script>
<script>(function(){var c=document.createElement('canvas').getContext('2d');
document.querySelectorAll('.par').forEach(function(p){var cs=getComputedStyle(p);var L=parseFloat(cs.lineHeight);if(isNaN(L))return;
c.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;var m=c.measureText('Hg');
p.style.position='relative';p.style.top=((L-m.fontBoundingBoxAscent+m.fontBoundingBoxDescent)/2)+'px';});})();</script>
<script>(function(){var o=[];if(window.__sfPaginate&&window.__sfPaginate())o.push({kind:'page',node:'MAIN',text:'MAIN continues on the next page — the rest is not drawn'});
document.querySelectorAll('.cell').forEach(function(c){var cr=c.getBoundingClientRect();c.querySelectorAll('.par').forEach(function(p){var r=p.getBoundingClientRect();if(r.bottom>cr.bottom+1||p.scrollWidth>p.clientWidth+1)o.push({kind:'cell',node:p.dataset.node,text:p.textContent.trim()});});});
document.querySelectorAll('.win').forEach(function(w){if(w.scrollHeight>w.clientHeight+2)o.push({kind:'window',node:w.dataset.win,text:'content '+Math.round(w.scrollHeight/w.clientHeight*100)+'% of the window height'});});
// fonts the page asks for that this PC does not have: widths will differ from the print
var asked={};document.querySelectorAll('.par, .char').forEach(function(el){var f=getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g,'').trim();if(f)asked[f]=1;});
var cv=document.createElement('canvas').getContext('2d'),probe='abcdefghijklmnopqrstuvwxyz0123456789 ';function wd(f){cv.font='40px '+f;return cv.measureText(probe).width;}
Object.keys(asked).forEach(function(f){if(/^(serif|sans-serif|monospace|inherit)$/i.test(f))return;var q='"'+f+'"';if(wd(q+',monospace')===wd('monospace')&&wd(q+',serif')===wd('serif'))o.push({kind:'font',node:f,text:'font not installed on this PC'});});
var e=document.createElement('script');e.type='application/json';e.id='sf-overflow';e.textContent=JSON.stringify(o);document.body.appendChild(e);})();</script>
</body></html>` };
  }
}

// ── browser ─────────────────────────────────────────────────────────────────────
function findBrowser() {
  const env = process.env.SC4SAP_CHROME || process.env.CHROME_PATH;
  const list = env ? [env] : process.platform === 'win32' ? [
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  return list.find((p) => p && existsSync(p)) || null;
}

function runBrowser(browser, args, profileDir) {
  return spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    `--user-data-dir=${profileDir}`, ...args], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 * 1024 * 1024 });
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
function arg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
}

function main(argv) {
  const [cmd, contentFile] = argv;
  if (!cmd || !contentFile || !existsSync(contentFile)) {
    console.error('usage: build-preview.mjs symbols <content.json> | build <content.json> --values <values.json> --out-dir <dir> [--rows N] [--no-jpg] [--mark]');
    process.exit(2);
  }
  const content = JSON.parse(readFileSync(contentFile, 'utf8'));
  if (cmd === 'symbols') { console.log(JSON.stringify(listSymbols(content), null, 1)); return; }
  if (cmd !== 'build') { console.error(`unknown command ${cmd}`); process.exit(2); }

  const valuesFile = arg(argv, '--values');
  const values = valuesFile ? JSON.parse(readFileSync(valuesFile, 'utf8')) : {};
  if (arg(argv, '--rows')) values.rows = Number(arg(argv, '--rows'));
  if (argv.includes('--mark')) values.mark = true;
  const outDir = resolve(arg(argv, '--out-dir', '.'));
  mkdirSync(outDir, { recursive: true });

  const r = new Renderer(content, values);
  const page = r.page();
  const base = join(outDir, `${content.form}-preview`);
  writeFileSync(`${base}.html`, page.html);

  const report = {
    html: `${base}.html`, jpg: null, rows: r.rows,
    filled: [...r.filled].sort(), unfilled: [...r.unfilled].sort(),
    overflow: [], approximations: [...new Set(r.approx)],
    conditionFieldsInitial: [...r.condMissing].sort(),
    defaultParagraph: r.defaultParaUsed ? (r.defaultPara || 'not set — browser default font') : 'not used',
  };
  const browser = findBrowser();
  if (!browser) {
    report.approximations.push('no Chrome / Edge / Chromium found (set SC4SAP_CHROME) — HTML only');
  } else {
    const profile = join(tmpdir(), `sc4sap-smartform-preview-chrome-${process.pid}`);
    const url = pathToFileURL(`${base}.html`).href;
    const px = (mm) => Math.round((mm / 25.4) * 96 * ZOOM);
    const size = `--window-size=${px(page.w)},${px(page.h)}`;
    const dom = runBrowser(browser, [size, '--dump-dom', url], profile);
    const m = /<script type="application\/json" id="sf-overflow">([\s\S]*?)<\/script>/.exec(dom.stdout || '');
    if (m) {
      const all = JSON.parse(m[1]);
      report.overflow = all.filter((x) => x.kind !== 'font' && x.kind !== 'page');
      for (const pg of all.filter((x) => x.kind === 'page')) report.approximations.push(pg.text);
      for (const f of all.filter((x) => x.kind === 'font')) report.approximations.push(`font ${f.node} not installed on this PC — text widths differ from the print`);
    }
    if (!argv.includes('--no-jpg')) {
      runBrowser(browser, [size, `--force-device-scale-factor=${2 / ZOOM}`, `--screenshot=${base}.jpg`, url], profile);
      if (existsSync(`${base}.jpg`)) report.jpg = `${base}.jpg`;
      else report.approximations.push('the browser wrote no JPG');
    }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
  }
  console.log(JSON.stringify(report, null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));

export { listSymbols, Renderer, paragraphFonts, findBrowser, runBrowser };
