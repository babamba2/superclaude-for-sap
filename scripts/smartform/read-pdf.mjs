#!/usr/bin/env node
// Read the printed layout out of a PDF: every text piece with its position,
// font and size, the drawn lines and boxes, and the images — the input of the
// SmartForm-from-PDF skill. No dependencies (node:zlib only).
//
//   node read-pdf.mjs <file.pdf> [--page N] [--out layout.json]
//
// Result: { file, pages, page: { no, widthMm, heightMm, texts[], lines[], rects[], images[] } }
// Positions in mm from the page's top-left; a text's y is its baseline.
//   texts[]  { x, y, w, text, pt, font, bold, italic, sapFont? }  (w = advance width)
//   lines[]  { x1, y1, x2, y2, th }           stroked straight segments
//   rects[]  { x, y, w, h, fill?, stroke? }   re-rectangles (fill: gray 0..1 or #rrggbb)
//   images[] { x, y, w, h, px?: [w, h], mask? }
// PDFs written by SAP (RSTXPDF) name the SAP font of each PDF font in a comment
// ("%Devtype PDFUC Font HELVE bold"): kept as sapFont: { device, family, bold }.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PT = 25.4 / 72; // point → mm

// ── PDF objects ─────────────────────────────────────────────────────────────
class Ref { constructor(n, g) { this.n = n; this.g = g; } }
class Name { constructor(s) { this.s = s; } toString() { return this.s; } }
const isWs = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
const isDelim = (c) => c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

// tokenizer over a Buffer; used for object bodies and content streams
class Lexer {
  constructor(buf, pos = 0) { this.b = buf; this.p = pos; }
  skip() {
    const b = this.b;
    for (;;) {
      while (this.p < b.length && isWs(b[this.p])) this.p++;
      if (b[this.p] === 0x25) { while (this.p < b.length && b[this.p] !== 0x0a && b[this.p] !== 0x0d) this.p++; continue; }
      return;
    }
  }
  // next token: number | Name | string(Buffer) | '[' ']' '<<' '>>' | keyword string | null at end
  token() {
    this.skip();
    const b = this.b;
    if (this.p >= b.length) return null;
    const c = b[this.p];
    if (c === 0x2f) { // /Name
      let s = '';
      this.p++;
      while (this.p < b.length && !isWs(b[this.p]) && !isDelim(b[this.p])) {
        if (b[this.p] === 0x23 && /[0-9a-fA-F]{2}/.test(b.toString('latin1', this.p + 1, this.p + 3))) { s += String.fromCharCode(parseInt(b.toString('latin1', this.p + 1, this.p + 3), 16)); this.p += 3; } else s += String.fromCharCode(b[this.p++]);
      }
      return new Name(s);
    }
    if (c === 0x28) return { str: this.literal() };
    if (c === 0x3c) {
      if (b[this.p + 1] === 0x3c) { this.p += 2; return '<<'; }
      const end = b.indexOf(0x3e, this.p);
      const hex = b.toString('latin1', this.p + 1, end).replace(/[^0-9a-fA-F]/g, '');
      this.p = end + 1;
      return { str: Buffer.from(hex.length % 2 ? hex + '0' : hex, 'hex') };
    }
    if (c === 0x3e && b[this.p + 1] === 0x3e) { this.p += 2; return '>>'; }
    if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) { this.p++; return String.fromCharCode(c); }
    let s = '';
    while (this.p < b.length && !isWs(b[this.p]) && !isDelim(b[this.p])) s += String.fromCharCode(b[this.p++]);
    if (s === '') { this.p++; return this.token(); }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return Number(s);
    return s;
  }
  literal() {
    const b = this.b;
    const out = [];
    let depth = 0;
    this.p++;
    while (this.p < b.length) {
      const c = b[this.p++];
      if (c === 0x5c) {
        const n = b[this.p++];
        const map = { 0x6e: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12, 0x28: 0x28, 0x29: 0x29, 0x5c: 0x5c };
        if (map[n] !== undefined) out.push(map[n]);
        else if (n >= 0x30 && n <= 0x37) {
          let o = n - 0x30;
          for (let k = 0; k < 2 && b[this.p] >= 0x30 && b[this.p] <= 0x37; k++) o = o * 8 + (b[this.p++] - 0x30);
          out.push(o & 0xff);
        } else if (n === 0x0d) { if (b[this.p] === 0x0a) this.p++; } else if (n !== 0x0a) out.push(n);
        continue;
      }
      if (c === 0x28) depth++;
      if (c === 0x29) { if (depth === 0) break; depth--; }
      out.push(c);
    }
    return Buffer.from(out);
  }
  // one object: resolves "n g R", dicts and arrays
  object(tok = this.token()) {
    if (tok === '<<') {
      const d = {};
      for (;;) {
        const k = this.token();
        if (k === '>>' || k === null) return d;
        d[k.s ?? String(k)] = this.object();
      }
    }
    if (tok === '[') {
      const a = [];
      for (;;) {
        const t = this.token();
        if (t === ']' || t === null) return a;
        a.push(this.object(t));
      }
    }
    if (typeof tok === 'number') {
      const save = this.p;
      const t2 = this.token();
      if (typeof t2 === 'number' && Number.isInteger(tok)) {
        const t3 = this.token();
        if (t3 === 'R') return new Ref(tok, t2);
      }
      this.p = save;
      return tok;
    }
    if (tok === 'true') return true;
    if (tok === 'false') return false;
    if (tok === 'null') return null;
    return tok;
  }
}

export class PdfFile {
  constructor(buf) {
    this.buf = buf;
    this.objs = new Map(); // n → { off } | { value, stream? }
    const text = buf.toString('latin1');
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(text))) this.objs.set(Number(m[1]), { off: m.index + m[0].length, raw: m.index });
    // object streams (PDF 1.5): their members are not found by the scan above
    for (const [n] of [...this.objs]) {
      const o = this.entry(n)?.value;
      if (o && o.Type?.s === 'ObjStm') {
        const data = this.streamData(n);
        const lx = new Lexer(data);
        const pairs = [];
        for (let i = 0; i < o.N; i++) pairs.push([lx.token(), lx.token()]);
        for (const [on, off] of pairs) if (!this.objs.has(on) || this.objs.get(on).inStm) this.objs.set(on, { value: new Lexer(data, o.First + off).object(), inStm: true });
      }
    }
  }
  entry(n) {
    const e = this.objs.get(n);
    if (!e) return null;
    if (!('value' in e)) {
      const lx = new Lexer(this.buf, e.off);
      e.value = lx.object();
      const save = lx.p;
      if (lx.token() === 'stream') {
        let p = lx.p;
        if (this.buf[p] === 0x0d) p++;
        if (this.buf[p] === 0x0a) p++;
        e.streamStart = p;
      } else lx.p = save;
    }
    return e;
  }
  // a value, with an indirect reference resolved (numbers are values, not object numbers)
  get(v) {
    return v instanceof Ref ? (this.entry(v.n)?.value ?? null) : v;
  }
  // decoded bytes of stream object n (Flate / ASCII85 / ASCIIHex)
  streamData(n) {
    if (n instanceof Ref) n = n.n;
    const e = this.entry(n);
    if (!e || e.streamStart === undefined) return Buffer.alloc(0);
    let len = this.get(e.value.Length);
    let end = typeof len === 'number' ? e.streamStart + len : -1;
    if (end < 0 || this.buf.toString('latin1', end, end + 20).indexOf('endstream') < 0) end = this.buf.indexOf('endstream', e.streamStart);
    return decodeFilters(this.buf.subarray(e.streamStart, end), this.get(e.value.Filter), this.get(e.value.DecodeParms));
  }
  // raw source text of object n (SAP writes comments into font dicts)
  rawText(n) {
    if (n instanceof Ref) n = n.n;
    const e = this.objs.get(n);
    if (!e || e.raw === undefined) return '';
    const end = this.buf.indexOf('endobj', e.raw);
    return this.buf.toString('latin1', e.raw, end < 0 ? e.raw + 2000 : Math.min(end, e.raw + 4000));
  }
  // RSTXPDF comments "%Devtype PDFUC Font CNSONG normal ... ->/C002": resource name → match
  sapFonts() {
    if (!this._sapFonts) {
      this._sapFonts = new Map();
      for (const m of this.buf.toString('latin1').matchAll(/%Devtype\s+(\S+)\s+Font\s+(\S+)\s+(normal|bold)[^\r\n]*?->\/(\S+)/g)) this._sapFonts.set(m[4], m);
    }
    return this._sapFonts;
  }
  pages() {
    const root = this.get(this.trailerRoot());
    const out = [];
    const walk = (node, inh) => {
      const d = this.get(node);
      if (!d) return;
      const i = { ...inh };
      for (const k of ['Resources', 'MediaBox', 'CropBox', 'Rotate']) if (d[k] !== undefined) i[k] = d[k];
      if (d.Type?.s === 'Pages' || d.Kids) for (const k of this.get(d.Kids) || []) walk(k, i);
      else out.push({ dict: d, ...i });
    };
    walk(root?.Pages, {});
    return out;
  }
  trailerRoot() {
    const t = this.buf.toString('latin1');
    const m = /\/Root\s+(\d+)\s+(\d+)\s+R/g;
    let r;
    let last = null;
    while ((r = m.exec(t))) last = new Ref(Number(r[1]), Number(r[2]));
    if (last) return last;
    for (const [n] of this.objs) if (this.entry(n)?.value?.Type?.s === 'Catalog') return new Ref(n, 0);
    return null;
  }
}

function decodeFilters(data, filter, parms) {
  const fs = Array.isArray(filter) ? filter : filter ? [filter] : [];
  const ps = Array.isArray(parms) ? parms : [parms];
  fs.forEach((f, i) => {
    const name = f?.s ?? String(f);
    if (name === 'FlateDecode' || name === 'Fl') {
      try { data = inflateSync(data); } catch { data = inflateLoose(data); }
      const p = ps[i];
      if (p && p.Predictor >= 10) data = unpredict(data, p.Columns || 1, p.Colors || 1);
    } else if (name === 'ASCII85Decode' || name === 'A85') data = a85(data);
    else if (name === 'ASCIIHexDecode' || name === 'AHx') data = Buffer.from(data.toString('latin1').replace(/[^0-9a-fA-F]/g, ''), 'hex');
  });
  return data;
}
function inflateLoose(data) {
  try { return inflateSync(data, { finishFlush: 2 }); } catch { return Buffer.alloc(0); }
}
function unpredict(data, cols, colors) {
  const row = cols * colors;
  const out = [];
  let prev = new Array(row).fill(0);
  for (let p = 0; p + row < data.length + 1; p += row + 1) {
    const t = data[p];
    const cur = [];
    for (let i = 0; i < row; i++) {
      const raw = data[p + 1 + i] ?? 0;
      const left = i >= colors ? cur[i - colors] : 0;
      const up = prev[i];
      const ul = i >= colors ? prev[i - colors] : 0;
      let v = raw;
      if (t === 1) v = raw + left;
      else if (t === 2) v = raw + up;
      else if (t === 3) v = raw + ((left + up) >> 1);
      else if (t === 4) { const pa = Math.abs(up - ul), pb = Math.abs(left - ul), pc = Math.abs(left + up - 2 * ul); v = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : ul); }
      cur.push(v & 0xff);
    }
    out.push(...cur);
    prev = cur;
  }
  return Buffer.from(out);
}
function a85(buf) {
  const s = buf.toString('latin1').replace(/\s/g, '').replace(/^<~/, '').replace(/~>.*$/, '');
  const out = [];
  let grp = [];
  const flush = (n) => {
    let v = 0;
    for (let i = 0; i < 5; i++) v = v * 85 + (grp[i] ?? 84);
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n));
    grp = [];
  };
  for (const ch of s) {
    if (ch === 'z' && grp.length === 0) { out.push(0, 0, 0, 0); continue; }
    grp.push(ch.charCodeAt(0) - 33);
    if (grp.length === 5) flush(4);
  }
  if (grp.length) flush(grp.length - 1);
  return Buffer.from(out);
}

// ── fonts ───────────────────────────────────────────────────────────────────
const WIN1252 = new TextDecoder('windows-1252');
function parseCMap(data) {
  // ToUnicode: bfchar / bfrange → Map(code → string); also the code byte lengths
  const s = data.toString('latin1');
  const map = new Map();
  let codeLen = 1;
  const u16 = (h) => {
    const b = Buffer.from(h, 'hex');
    let out = '';
    for (let i = 0; i + 1 < b.length; i += 2) out += String.fromCharCode(b.readUInt16BE(i));
    return out;
  };
  for (const blk of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) { map.set(parseInt(m[1], 16), u16(m[2])); codeLen = Math.max(codeLen, m[1].length / 2); }
  for (const blk of s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const a = parseInt(m[1], 16), z = parseInt(m[2], 16);
      codeLen = Math.max(codeLen, m[1].length / 2);
      if (m[3].startsWith('[')) [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].forEach((d, i) => map.set(a + i, u16(d[1])));
      else {
        const base = Buffer.from(m[3].slice(1, -1), 'hex');
        for (let c = a; c <= z && c - a < 65536; c++) {
          const b = Buffer.from(base);
          b.writeUInt16BE((b.readUInt16BE(b.length - 2) + (c - a)) & 0xffff, b.length - 2);
          map.set(c, u16(b.toString('hex')));
        }
      }
    }
  }
  return { map, codeLen };
}
// glyph names of /Differences → text (Adobe Glyph List, the part forms use):
// ASCII names, Latin-1 and Latin Extended-A built from Unicode decomposition
// (Agrave = A + grave, Ohungarumlaut = O + hungarumlaut), the rest by hand
const GLYPH = (() => {
  const g = {};
  const ascii = 'space exclam quotedbl numbersign dollar percent ampersand quotesingle parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at'.split(' ');
  ascii.forEach((n, i) => { g[n] = String.fromCharCode(0x20 + i); });
  for (let c = 0x41; c <= 0x5a; c++) { g[String.fromCharCode(c)] = String.fromCharCode(c); g[String.fromCharCode(c + 32)] = String.fromCharCode(c + 32); }
  Object.assign(g, { bracketleft: '[', backslash: '\\', bracketright: ']', asciicircum: '^', underscore: '_', grave: '`', braceleft: '{', bar: '|', braceright: '}', asciitilde: '~', quoteleft: '‘', quoteright: '’', quotedblleft: '“', quotedblright: '”', quotesinglbase: '‚', quotedblbase: '„', bullet: '•', endash: '–', emdash: '—', ellipsis: '…', dagger: '†', daggerdbl: '‡', perthousand: '‰', guilsinglleft: '‹', guilsinglright: '›', trademark: '™', Euro: '€', florin: 'ƒ', circumflex: 'ˆ', tilde: '˜', exclamdown: '¡', cent: '¢', sterling: '£', currency: '¤', yen: '¥', brokenbar: '¦', section: '§', dieresis: '¨', copyright: '©', ordfeminine: 'ª', guillemotleft: '«', logicalnot: '¬', registered: '®', macron: '¯', degree: '°', ring: '˚', plusminus: '±', twosuperior: '²', threesuperior: '³', acute: '´', mu: 'µ', paragraph: '¶', periodcentered: '·', cedilla: '¸', onesuperior: '¹', ordmasculine: 'º', guillemotright: '»', onequarter: '¼', onehalf: '½', threequarters: '¾', questiondown: '¿', multiply: '×', divide: '÷', AE: 'Æ', ae: 'æ', Oslash: 'Ø', oslash: 'ø', Eth: 'Ð', eth: 'ð', Thorn: 'Þ', thorn: 'þ', germandbls: 'ß', Dcroat: 'Đ', dcroat: 'đ', Dslash: 'Đ', dmacron: 'đ', Hbar: 'Ħ', hbar: 'ħ', dotlessi: 'ı', IJ: 'Ĳ', ij: 'ĳ', kgreenlandic: 'ĸ', Ldot: 'Ŀ', ldot: 'ŀ', Lslash: 'Ł', lslash: 'ł', napostrophe: 'ŉ', Eng: 'Ŋ', eng: 'ŋ', OE: 'Œ', oe: 'œ', Tbar: 'Ŧ', tbar: 'ŧ', longs: 'ſ', nbspace: ' ', uni00A0: ' ', minus: '−', fraction: '⁄', fi: 'fi', fl: 'fl' });
  const mark = { '̀': ['grave'], '́': ['acute'], '̂': ['circumflex'], '̃': ['tilde'], '̄': ['macron'], '̆': ['breve'], '̇': ['dotaccent'], '̈': ['dieresis'], '̊': ['ring'], '̋': ['hungarumlaut'], '̌': ['caron'], '̦': ['commaaccent'], '̧': ['cedilla', 'commaaccent'], '̨': ['ogonek'] };
  for (let c = 0xc0; c <= 0x17f; c++) {
    const ch = String.fromCharCode(c);
    const d = ch.normalize('NFD');
    if (d.length === 2 && mark[d[1]]) for (const m of mark[d[1]]) g[d[0] + m] ??= ch;
  }
  return g;
})();
const glyphText = (n) => GLYPH[n] ?? (/^uni([0-9A-Fa-f]{4})$/.test(n) ? String.fromCharCode(parseInt(n.slice(3), 16)) : /^u([0-9A-Fa-f]{4,6})$/.test(n) ? String.fromCodePoint(parseInt(n.slice(1), 16)) : undefined);

function loadFont(pdf, ref, resName) {
  const d = pdf.get(ref) || {};
  const sub = d.Subtype?.s;
  const base = (d.BaseFont?.s || '').replace(/^[A-Z]{6}\+/, '');
  const raw = ref instanceof Ref ? pdf.rawText(ref) : '';
  // the comment sits in the font dict (KPPDF) or between objects, naming the resource (PDFUC "->/C002")
  const sm = /%Devtype\s+(\S+)\s+Font\s+(\S+)\s+(normal|bold)/.exec(raw) || (resName ? pdf.sapFonts().get(resName) : null);
  const f = {
    base,
    bold: /bold|black|heavy|semibold|demi|-B$|,B/i.test(base) || (sm ? sm[3] === 'bold' : false),
    italic: /italic|oblique/i.test(base),
    sapFont: sm ? { device: sm[1], family: sm[2], bold: sm[3] === 'bold' } : undefined,
    type0: sub === 'Type0',
  };
  if (d.ToUnicode) f.toUni = parseCMap(pdf.streamData(d.ToUnicode));
  if (f.type0) {
    const enc = d.Encoding?.s || '';
    f.enc = enc;
    const desc = pdf.get((pdf.get(d.DescendantFonts) || [])[0]) || {};
    f.dw = desc.DW ?? 1000;
    f.w = new Map();
    const W = pdf.get(desc.W) || [];
    for (let i = 0; i < W.length;) {
      const a = pdf.get(W[i]);
      const b = pdf.get(W[i + 1]);
      if (Array.isArray(b)) { b.forEach((v, k) => f.w.set(a + k, pdf.get(v))); i += 2; } else { for (let c = a; c <= b; c++) f.w.set(c, pdf.get(W[i + 2])); i += 3; }
    }
  } else {
    f.first = d.FirstChar ?? 0;
    f.widths = (pdf.get(d.Widths) || []).map((v) => pdf.get(v));
    f.mono = /courier|mono/i.test(base);
    const enc = pdf.get(d.Encoding);
    f.diff = new Map();
    if (enc && typeof enc === 'object' && !(enc instanceof Name)) {
      let code = 0;
      for (const v of pdf.get(enc.Differences) || []) {
        if (typeof v === 'number') code = v;
        else { f.diff.set(code, v.s); code++; }
      }
    }
  }
  return f;
}

// bytes of a shown string → [{ text, adv (in 1/1000 em), space }] per character code
function decodeString(f, bytes) {
  const out = [];
  if (f.type0) {
    const enc = f.enc;
    if (/UTF16|UCS2/.test(enc)) {
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const c = bytes.readUInt16BE(i);
        const ch = String.fromCharCode(c);
        out.push({ text: ch, adv: c < 0x100 || /HW/.test(enc) && c < 0x3000 ? f.dw / 2 : f.dw, space: c === 0x20 });
      }
      return out;
    }
    if (/EUC|KSC|GB-EUC|GBK|B5|90ms|RKSJ|UHC/.test(enc)) {
      const label = /KSC|UHC/.test(enc) ? 'euc-kr' : /GB/.test(enc) ? 'gbk' : /B5/.test(enc) ? 'big5' : 'shift_jis';
      const dec = new TextDecoder(label);
      for (let i = 0; i < bytes.length;) {
        const c = bytes[i];
        const two = label === 'shift_jis' ? (c >= 0x81 && c <= 0x9f) || (c >= 0xe0 && c <= 0xfc) : c >= 0x81;
        const n = two && i + 1 < bytes.length ? 2 : 1;
        out.push({ text: dec.decode(bytes.subarray(i, i + n)), adv: n === 2 ? f.dw : f.dw / 2, space: n === 1 && c === 0x20 });
        i += n;
      }
      return out;
    }
    // Identity-H or another 2-byte CMap: CIDs; text from ToUnicode
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const c = bytes.readUInt16BE(i);
      out.push({ text: f.toUni?.map.get(c) ?? '', adv: f.w.get(c) ?? f.dw, space: f.toUni?.map.get(c) === ' ' });
    }
    return out;
  }
  for (const c of bytes) {
    let t = f.toUni?.map.get(c);
    if (t === undefined) {
      const dn = f.diff.get(c);
      t = (dn && glyphText(dn)) ?? WIN1252.decode(Buffer.from([c]));
    }
    const w = f.widths[c - f.first];
    out.push({ text: t, adv: w ?? (f.mono ? 600 : 500), space: c === 0x20 });
  }
  return out;
}

// ── content streams ─────────────────────────────────────────────────────────
const mul = (a, b) => [a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3], a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3], a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function runContent(pdf, data, resources, ctm0, out, fontCache, depth = 0) {
  const lx = new Lexer(data);
  const ops = [];
  const res = pdf.get(resources) || {};
  const fonts = pdf.get(res.Font) || {};
  const xobjs = pdf.get(res.XObject) || {};
  let gs = { ctm: ctm0, lw: 1, stroke: 0, fill: 0 };
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = [1, 0, 0, 1, 0, 0];
  let tf = null;
  let tfs = 0;
  let tc = 0, tw = 0, th = 1, tl = 0, rise = 0;
  let path = [];
  let cur = null;
  let start = null;
  const color = (args) => (args.length === 1 ? args[0] : args.length === 3 ? '#' + args.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : args.length === 4 ? Math.max(0, 1 - Math.min(1, args[3] + (args[0] + args[1] + args[2]) / 3)) : 0);
  const font = (name) => {
    const ref = fonts[name];
    const key = ref instanceof Ref ? ref.n : name + depth;
    if (!fontCache.has(key)) fontCache.set(key, loadFont(pdf, ref, name));
    return fontCache.get(key);
  };
  const show = (bytes, adjustAfter = []) => {
    if (!tf) return;
    // one text piece per show operator; a TJ adjustment of more than an em splits it
    // blanks at either end are dropped: x / w are where the ink starts and ends
    // (SAP prints numeric fields with their leading blanks)
    let piece = null;
    const emit = () => {
      if (piece) {
        const gl = piece.g;
        let a = 0, z = gl.length - 1;
        while (a <= z && !gl[a].t.trim()) a++;
        while (z >= a && !gl[z].t.trim()) z--;
        if (a <= z) out.texts.push({ x0: gl[a].x, y0: piece.y0, x1: gl[z].x1, text: gl.slice(a, z + 1).map((q) => q.t).join(''), pt: piece.pt, f: piece.f });
      }
      piece = null;
    };
    const glyphs = decodeString(tf, bytes);
    glyphs.forEach((g, i) => {
      const trm = mul([tfs * th, 0, 0, tfs, 0, rise], mul(tm, gs.ctm));
      const [x, y] = [trm[4], trm[5]];
      const pt = Math.hypot(trm[2], trm[3]);
      if (!piece) piece = { y0: y, pt, f: tf, g: [] };
      const adv = ((g.adv / 1000) * tfs + tc + (g.space ? tw : 0)) * th;
      tm = mul([1, 0, 0, 1, adv, 0], tm);
      const e = apply(mul(tm, gs.ctm), 0, 0);
      piece.g.push({ x, x1: e[0], t: g.text });
      const adj = adjustAfter[i];
      if (adj) {
        tm = mul([1, 0, 0, 1, (-adj / 1000) * tfs * th, 0], tm);
        if (Math.abs(adj) > 1000) emit();
      }
    });
    emit();
  };
  const finishText = () => {
    for (const p of out.texts) if (p.f) {
      const f = p.f;
      Object.assign(p, { font: f.base, bold: f.bold, italic: f.italic, ...(f.type0 ? { cid: true } : {}), ...(f.sapFont ? { sapFont: f.sapFont } : {}) });
      delete p.f;
    }
  };
  const paint = (strokeIt, fillIt) => {
    for (const sp of path) {
      if (sp.rect) {
        const [a, b, w, h] = sp.rect;
        const p1 = apply(gs.ctm, a, b);
        const p2 = apply(gs.ctm, a + w, b + h);
        const r = { x0: Math.min(p1[0], p2[0]), y0: Math.min(p1[1], p2[1]), x1: Math.max(p1[0], p2[0]), y1: Math.max(p1[1], p2[1]) };
        if (fillIt) r.fill = gs.fill;
        if (strokeIt) { r.stroke = gs.stroke; r.lw = gs.lw * Math.hypot(gs.ctm[0], gs.ctm[1]); }
        out.rects.push(r);
      } else if (strokeIt) {
        for (let i = 1; i < sp.pts.length; i++) {
          const [x1, y1] = sp.pts[i - 1];
          const [x2, y2] = sp.pts[i];
          out.lines.push({ x1, y1, x2, y2, lw: gs.lw * Math.hypot(gs.ctm[0], gs.ctm[1]), stroke: gs.stroke });
        }
      } else if (fillIt && sp.pts.length >= 4) {
        // a filled closed polygon that is an axis-parallel box (thin boxes = rules)
        const xs = sp.pts.map((p) => p[0]), ys = sp.pts.map((p) => p[1]);
        out.rects.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), fill: gs.fill, poly: true });
      }
    }
    path = [];
    cur = null;
  };
  const imageBox = (px) => {
    const c = gs.ctm;
    const pts = [apply(c, 0, 0), apply(c, 1, 0), apply(c, 0, 1), apply(c, 1, 1)];
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    out.images.push({ x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), ...px });
  };
  for (;;) {
    const t = lx.token();
    if (t === null) break;
    if (typeof t === 'string' && t !== '[' && t !== '<<' && !/^[\]>]/.test(t)) {
      const a = ops;
      const n = (i) => Number(a[i]);
      switch (t) {
        case 'q': stack.push({ ...gs }); break;
        case 'Q': if (stack.length) gs = stack.pop(); break;
        case 'cm': gs.ctm = mul([n(0), n(1), n(2), n(3), n(4), n(5)], gs.ctm); break;
        case 'w': gs.lw = n(0); break;
        case 'G': case 'RG': case 'K': case 'SC': case 'SCN': gs.stroke = color(a.filter((v) => typeof v === 'number')); break;
        case 'g': case 'rg': case 'k': case 'sc': case 'scn': gs.fill = color(a.filter((v) => typeof v === 'number')); break;
        case 'BT': tm = [1, 0, 0, 1, 0, 0]; tlm = tm; break;
        case 'Tf': tf = font(a[0]?.s); tfs = n(1); break;
        case 'Tc': tc = n(0); break;
        case 'Tw': tw = n(0); break;
        case 'Tz': th = n(0) / 100; break;
        case 'TL': tl = n(0); break;
        case 'Ts': rise = n(0); break;
        case 'Td': tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm; break;
        case 'TD': tl = -n(1); tlm = mul([1, 0, 0, 1, n(0), n(1)], tlm); tm = tlm; break;
        case 'Tm': tlm = [n(0), n(1), n(2), n(3), n(4), n(5)]; tm = tlm; break;
        case 'T*': tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; break;
        case 'Tj': if (a[0]?.str) show(a[0].str); break;
        case "'": tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; if (a[0]?.str) show(a[0].str); break;
        case '"': tw = n(0); tc = n(1); tlm = mul([1, 0, 0, 1, 0, -tl], tlm); tm = tlm; if (a[2]?.str) show(a[2].str); break;
        case 'TJ': {
          const arr = Array.isArray(a[0]) ? a[0] : [];
          // join the strings, an adjustment belongs to the last glyph before it
          const parts = [];
          const adj = [];
          for (const v of arr) {
            if (v?.str) { const g = decodeString(tf || { widths: [], diff: new Map() }, v.str).length; parts.push(v.str); for (let i = 0; i < g; i++) adj.push(0); } else if (typeof v === 'number' && adj.length) adj[adj.length - 1] += v;
            else if (typeof v === 'number') tm = mul([1, 0, 0, 1, (-v / 1000) * tfs * th, 0], tm);
          }
          show(Buffer.concat(parts), adj);
          break;
        }
        case 'm': cur = [apply(gs.ctm, n(0), n(1))]; start = cur[0]; path.push({ pts: cur }); break;
        case 'l': if (cur) cur.push(apply(gs.ctm, n(0), n(1))); break;
        case 'c': if (cur) cur.push(apply(gs.ctm, n(4), n(5))); break;
        case 'v': case 'y': if (cur) cur.push(apply(gs.ctm, n(2), n(3))); break;
        case 'h': if (cur && start) cur.push(start); break;
        case 're': path.push({ rect: [n(0), n(1), n(2), n(3)] }); cur = null; break;
        case 'S': paint(true, false); break;
        case 's': if (cur && start) cur.push(start); paint(true, false); break;
        case 'f': case 'F': case 'f*': paint(false, true); break;
        case 'B': case 'B*': case 'b': case 'b*': paint(true, true); break;
        case 'n': path = []; cur = null; break;
        case 'Do': {
          const xo = xobjs[a[0]?.s];
          const d = pdf.get(xo);
          if (d?.Subtype?.s === 'Image') imageBox({ px: [d.Width, d.Height], ...(d.ImageMask ? { mask: true } : {}) });
          else if (d?.Subtype?.s === 'Form' && depth < 8) {
            const m = (pdf.get(d.Matrix) || [1, 0, 0, 1, 0, 0]).map((v) => pdf.get(v));
            runContent(pdf, pdf.streamData(xo), d.Resources || resources, mul(m, gs.ctm), out, fontCache, depth + 1);
          }
          break;
        }
        case 'BI': {
          // inline image: dict until ID, binary until EI
          const dict = {};
          for (;;) {
            const k = lx.token();
            if (k === 'ID' || k === null) break;
            dict[k.s ?? String(k)] = lx.object();
          }
          lx.p++;
          const end = data.indexOf(Buffer.from('EI'), lx.p);
          let e = end;
          while (e >= 0 && !(isWs(data[e - 1] ?? 0x20) && (e + 2 >= data.length || isWs(data[e + 2])))) e = data.indexOf(Buffer.from('EI'), e + 2);
          lx.p = e < 0 ? data.length : e + 2;
          imageBox({ px: [dict.W ?? dict.Width, dict.H ?? dict.Height], ...(dict.IM || dict.ImageMask ? { mask: true } : {}) });
          break;
        }
        default: break;
      }
      ops.length = 0;
      continue;
    }
    ops.push(lx.object(t));
  }
  finishText();
}

// ── page layout ─────────────────────────────────────────────────────────────
// pieces on one baseline that touch (gap up to about a blank) are one run:
// how a PDF writer splits a line (per font change, per kerning pair) says
// nothing about the form; a gap is a blank in the run's text
export function mergeRuns(texts, maxGapBlanks = 1.6) {
  const ts = texts.map((t, i) => ({ ...t, i })).sort((a, b) => a.y - b.y || a.x - b.x);
  const runs = [];
  for (const t of ts) {
    const blank = (t.cid ? 0.5 : 0.28) * t.pt * PT; // a CID (CJK) font's blank is half an em
    const r = runs.find((q) => Math.abs(q.y - t.y) < 0.15 && Math.abs(q.pt - t.pt) < 0.3 && t.x - (q.x + q.w) > -0.3 && t.x - (q.x + q.w) < maxGapBlanks * blank);
    if (!r) { runs.push({ x: t.x, y: t.y, w: t.w, text: t.text, pt: t.pt, font: t.font, bold: t.bold, italic: t.italic, ...(t.sapFont ? { sapFont: t.sapFont } : {}), pieces: [t.i] }); continue; }
    const gap = t.x - (r.x + r.w);
    r.text += (gap > 0.4 * blank ? ' '.repeat(Math.max(1, Math.round(gap / blank))) : '') + t.text;
    r.w = +(t.x + t.w - r.x).toFixed(2);
    r.pieces.push(t.i);
  }
  return runs;
}

export function readPdf(buf, pageNo = 1) {
  const pdf = new PdfFile(buf);
  const pages = pdf.pages();
  const pg = pages[pageNo - 1];
  if (!pg) return { pages: pages.length, page: null };
  const box = (pdf.get(pg.CropBox) || pdf.get(pg.MediaBox) || [0, 0, 595, 842]).map((v) => pdf.get(v));
  const [bx, by, bx2, by2] = box;
  const H = by2 - by;
  const out = { texts: [], lines: [], rects: [], images: [] };
  let contents = pdf.get(pg.dict.Contents);
  const refs = Array.isArray(contents) ? contents : [pg.dict.Contents];
  const data = Buffer.concat(refs.map((r) => Buffer.concat([pdf.streamData(r), Buffer.from('\n')])));
  runContent(pdf, data, pg.Resources, [1, 0, 0, 1, -bx, -by], out, new Map());
  // to mm, origin top-left
  const X = (v) => +(v * PT).toFixed(2);
  const Y = (v) => +((H - v) * PT).toFixed(2);
  const page = {
    no: pageNo,
    widthMm: X(bx2 - bx),
    heightMm: X(H),
    texts: out.texts.map((t) => ({ x: X(t.x0), y: Y(t.y0), w: X(t.x1 - t.x0), text: t.text, pt: +t.pt.toFixed(2), font: t.font, bold: t.bold, italic: t.italic, ...(t.cid ? { cid: true } : {}), ...(t.sapFont ? { sapFont: t.sapFont } : {}) })),
    lines: out.lines.map((l) => ({ x1: X(l.x1), y1: Y(l.y1), x2: X(l.x2), y2: Y(l.y2), th: X(l.lw), ...(l.stroke ? { color: l.stroke } : {}) })),
    rects: out.rects.map((r) => ({ x: X(r.x0), y: Y(r.y1), w: X(r.x1 - r.x0), h: X(r.y1 - r.y0), ...(r.fill !== undefined ? { fill: r.fill } : {}), ...(r.stroke !== undefined ? { stroke: r.stroke, th: X(r.lw) } : {}) })),
    images: out.images.map((i) => ({ x: X(i.x0), y: Y(i.y1), w: X(i.x1 - i.x0), h: X(i.y1 - i.y0), ...(i.px ? { px: i.px } : {}), ...(i.mask ? { mask: true } : {}) })),
  };
  page.runs = mergeRuns(page.texts);
  return { pages: pages.length, page };
}

// collinear rule pieces ({ dir, pos, a, b, th? }) that touch or overlap are one rule —
// SAP draws a shared cell border twice and in pieces: cluster by position, then
// sweep along the rule
export function mergeRules(segs, posTol = 0.15, gapTol = 0.4) {
  const out = [];
  for (const dir of ['H', 'V']) {
    const list = segs.filter((s) => s.dir === dir).sort((p, q) => p.pos - q.pos);
    const clusters = [];
    for (const s of list) {
      const c = clusters[clusters.length - 1];
      if (c && s.pos - c[c.length - 1].pos < posTol) c.push(s); else clusters.push([s]);
    }
    for (const c of clusters) {
      c.sort((p, q) => p.a - q.a);
      let cur = null;
      for (const s of c) {
        if (cur && s.a <= cur.b + gapTol) { cur.b = Math.max(cur.b, s.b); cur.th = Math.max(cur.th || 0, s.th || 0); cur.n++; cur.sum += s.pos; }
        else { if (cur) out.push(cur); cur = { ...s, n: 1, sum: s.pos }; }
      }
      if (cur) out.push(cur);
    }
  }
  return out.map(({ n, sum, ...s }) => ({ ...s, pos: +(sum / n).toFixed(2) }));
}

function main(argv) {
  const file = argv[0];
  if (!file) { console.error('usage: node read-pdf.mjs <file.pdf> [--page N] [--out layout.json]'); process.exit(2); }
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const r = readPdf(readFileSync(file), Number(opt('--page') || 1));
  const json = JSON.stringify({ file: resolve(file), ...r }, null, 1);
  if (opt('--out')) writeFileSync(opt('--out'), json);
  else process.stdout.write(json + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
