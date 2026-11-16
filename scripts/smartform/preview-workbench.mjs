// sc4sap:smartform-preview — pure functions for the preview workbench (web) and the skill. No I/O, no SAP.
//
//   renderPreview(content, sample, { inspect, page, fields, graphics }) → { html, filled, unfilled, approximations, rows, w, h }
//       graphics = { NAME: { mime, base64 } }; no file path is ever read here (a graphic without data = a labelled box).
//       the Renderer of build-preview.mjs without a browser (no JPG, no overflow measure — that needs Chrome).
//       Without `inspect` the html is byte for byte the CLI's `build` HTML for the same values.json. With it:
//       every symbol span carries data-sym, every drawn node data-node, and <script type="application/json"
//       id="sf-index"> { windows, nodes, symbols } answers "what is here?" without a model.
//   fieldsFrom(content, ddic)            → { SYM: { type, length, decimals, desc, inLoop, windows } } (fields.json)
//   sampleValues(symbols, fields, opts)  → { rows, values } — deterministic, type-based, invented (no real parties)
//   applySampleOps(sample, ops, fields)  → { sample, applied, skipped, warnings } — allow-listed edits; never throws
//
// sample = values.json: { defaultParagraph?, rows, values: { SYM: value | [value per row] }, mark? }

import { listSymbols, Renderer } from './build-preview.mjs';

const arr = (v) => (Array.isArray(v) ? v : []), up = (s) => String(s ?? '').trim().toUpperCase();
const own = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
export const MAX_ROWS = 50;

export function renderPreview(content, sample = {}, { inspect = false, page = 1, fields = {}, graphics = {} } = {}) {
  const r = new Renderer(content, sample || {}, { inspect, graphics: graphics && typeof graphics === 'object' ? graphics : {}, fields: fields && typeof fields === 'object' ? fields : {} });
  const pg = r.page(Math.max(0, (Number(page) || 1) - 1));
  let { html } = pg;
  if (inspect) {
    const index = JSON.stringify(buildIndex(content, fields, Math.max(0, (Number(page) || 1) - 1))).replace(/</g, '\\u003c');
    html = html.replace(/<\/body>(?![\s\S]*<\/body>)/, `<script type="application/json" id="sf-index">${index}</script></body>`);
  }
  return { html, w: pg.w, h: pg.h, rows: r.rows, filled: [...r.filled].sort(), unfilled: [...r.unfilled].sort(), approximations: [...new Set(r.approx)] };
}

const condText = (c) => arr(c?.COND).map((x) => `${x.OP1 ?? ''} ${x.COP ?? ''} ${x.OP2 ?? ''}`.trim()).filter(Boolean).join(' AND ')
  || Object.entries(c || {}).filter(([k, v]) => k !== 'COND' && v === true).map(([k]) => k).join(', ');

/** What the page shows, by name: windows, nodes (with their window, kind, paragraph, loop), symbols (+ fields). */
export function buildIndex(content, fields = {}, pageIndex = 0) {
  const p = arr(content?.pages)[pageIndex] || arr(content?.pages)[0] || { windows: [] };
  const windows = {}, nodes = {};
  const walk = (list, win, inLoop) => {
    for (const n of arr(list)) {
      const loop = inLoop || n.kind === 'loop' || n.kind === 'table46';
      const para = arr(n.lines).find((l) => l.format && !['/*', '/:', '=', '/', '*'].includes(l.format))?.format || '';
      nodes[n.name] = { window: win, kind: n.kind || '', caption: n.caption || '', condition: condText(n.condition), paragraph: para, loop };
      walk(n.children, win, loop);
    }
  };
  for (const w of arr(p.windows)) {
    windows[w.name] = { type: w.type || '', mm: { left: w.leftMm, top: w.topMm, width: w.widthMm, height: w.heightMm }, condition: condText(w.condition) };
    walk(w.content, w.name, false);
  }
  const symbols = {};
  for (const s of listSymbols(content).symbols) {
    symbols[s.name] = { occurrences: s.occurrences.map((o) => ({ window: o.window, node: o.node, inLoop: !!o.inLoop, cellWidthMm: o.cellWidthMm ?? null })), ...(own(fields, s.name) ? fields[s.name] : {}) };
  }
  return { page: p.name || '', windows, nodes, symbols };
}

/**
 * fields.json from the form and the DDIC answers of skill Step 4. `ddic` per type name:
 *   structure  { fields: { NAME: { type, length, decimals, desc } } }  (or fields as an array of { name, … })
 *   element    { type, length, decimals, desc }
 *   table type { lineType: 'ZX_S_LINE' }
 * A symbol whose type is not in `ddic` gets type '' (unknown) — never a guess.
 */
export function fieldsFrom(content, ddic = {}) {
  const lookup = (name) => (own(ddic, up(name)) ? ddic[up(name)] : own(ddic, name) ? ddic[name] : null);
  const resolve = (t, depth = 0) => { const d = lookup(t); return d && d.lineType && depth < 3 ? resolve(d.lineType, depth + 1) : d; };
  const fieldOf = (d, comp) => {
    if (!d) return null;
    if (!comp) return d.fields ? null : d;
    const f = Array.isArray(d.fields) ? d.fields.find((x) => up(x.name) === up(comp)) : own(d.fields || {}, up(comp)) ? d.fields[up(comp)] : null;
    return f || null;
  };
  const out = {};
  for (const s of listSymbols(content).symbols) {
    if (s.system) continue;
    const [head, ...rest] = s.name.split('-');
    const d = s.declaration ? resolve(s.declaration.typeName || '') : null;
    const f = fieldOf(d, rest.join('-'));
    out[s.name] = {
      type: up(f?.type || f?.datatype || ''), length: Number(f?.length ?? f?.leng ?? 0) || 0, decimals: Number(f?.decimals ?? 0) || 0,
      desc: String(f?.desc ?? f?.description ?? ''), inLoop: s.occurrences.some((o) => o.inLoop),
      windows: [...new Set(s.occurrences.map((o) => o.window))], declaration: head,
    };
  }
  return out;
}

// ---------------------------------------------------------------- invented sample values

const WORDS = ['Sample', 'Alpha', 'Bravo', 'Delta', 'Harbor', 'Summit', 'Item', 'Order', 'Service', 'Parts', 'Supply', 'Model', 'Unit', 'Line', 'Note', 'Text', 'Grade', 'Block'];
const UNITS = ['EA', 'PC', 'KG', 'M', 'BOX'], CURRS = ['USD', 'EUR', 'KRW', 'JPY'];
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
const NUMBER_TYPES = new Set(['CURR', 'QUAN', 'DEC', 'FLTP', 'P']), INT_TYPES = new Set(['INT1', 'INT2', 'INT4', 'INT8', 'I']);

const group = (intPart, sep) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
/** Last-component names of document / partner / address keys — same list as ZMCP_SSF_RENDER's lc_key_re. */
export const DOCUMENT_KEY_RE = /^(?:VBELN.*|BIL_NUMBER|OBJKY|ADDR_NO|ADRNR|ADDRNUMBER|ADDR_NUMB|PERS_NO|PERSNUMBER|DELIV_NUMB|ORDER_NUMB|PAYER|SOLD_TO|SHIP_TO|BILL_TO|KUNNR|KUNAG|KUNRG|KUNWE|PARTN_NUMB|PARNR|MNDID|.*IBAN)$/;
export const isDocumentKey = (name) => DOCUMENT_KEY_RE.test(up(String(name ?? '').split('-').pop()));
/** One invented value of a field, as printed. `seed` makes it repeatable; `row` varies loop rows. */
export function sampleOf(name, f = {}, row = 0, opts = {}) {
  const h = hash(`${name}#${row}`);
  const type = up(f.type);
  const len = Number(f.length) || 0;
  const dec = Number(f.decimals) || 0;
  const [ts, ds] = opts.numberFormat === 'de' ? ['.', ','] : [',', '.'];
  if (type === 'DATS' || type === 'D') {
    const d = new Date(Date.UTC(2026, h % 12, 1 + (h >>> 4) % 28));
    const [y, m, dd] = [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')];
    return opts.dateFormat === 'DD.MM.YYYY' ? `${dd}.${m}.${y}` : opts.dateFormat === 'MM/DD/YYYY' ? `${m}/${dd}/${y}` : `${y}.${m}.${dd}`;
  }
  if (type === 'TIMS' || type === 'T') return `${String(8 + h % 10).padStart(2, '0')}:${String((h >>> 3) % 60).padStart(2, '0')}:00`;
  if (type === 'NUMC' || type === 'N') return String(h % 10 ** Math.min(Math.max(len, 1), 9)).padStart(Math.max(len, 1), '0').slice(-Math.max(len, 1));
  if (type === 'CUKY' || type === 'UNIT') return (type === 'CUKY' ? CURRS : UNITS)[h % (type === 'CUKY' ? CURRS : UNITS).length];
  if (type === 'LANG') return 'E';
  if (INT_TYPES.has(type)) return String(1 + h % 99);
  if (NUMBER_TYPES.has(type)) {
    const digits = Math.max(1, Math.min((len || 13) - dec, 9));
    const intPart = String(1 + h % Math.min(10 ** Math.min(digits, 6), 999999));
    const frac = dec ? String((h >>> 7) % 10 ** dec).padStart(dec, '0') : '';
    const signed = type === 'CURR' || type === 'DEC' || type === 'P';
    const text = `${group(intPart, ts)}${dec ? ds + frac : ''}${signed ? ' ' : ''}`;
    // printed right-justified in its output length (digits, separators, sign)
    const width = len ? len + Math.floor(Math.max(len - dec - 1, 0) / 3) + (dec ? 1 : 0) + (signed ? 1 : 0) : text.length;
    return text.padStart(width);
  }
  // document / partner / address keys: 'ZZ…' never matches a real document (SD numbers are numeric), so the
  // same values can feed a SAP render whose program lines read by these keys (ZMCP_SSF_RENDER requires it)
  if (isDocumentKey(name) && (len === 0 || len >= 4)) {
    const n = (len || 10) - 2;
    return `ZZ${String(h).padStart(n, '0').slice(-n)}`;
  }
  // CHAR / STRING / unknown: a code for short fields, invented words for text fields (50–90 % of the length)
  const max = len || 20;
  if (max <= 4) return 'ABCD'.slice(0, max);
  if (max <= 12) return `${'A'}${String(h).padStart(max - 1, '0').slice(-(max - 1))}`;
  const target = Math.max(3, Math.round(max * (0.5 + (h % 40) / 100)));
  let s = '';
  for (let i = 0; s.length < target; i += 1) s += (s ? ' ' : '') + WORDS[(h + i * 7) % WORDS.length];
  return s.slice(0, target).trimEnd();
}

/** Values for every symbol of the form (listSymbols(...).symbols or names): loop symbols get one value per row. */
export function sampleValues(symbols, fields = {}, { rows = 3, dateFormat, numberFormat } = {}) {
  const n = Math.min(Math.max(1, Number(rows) || 3), MAX_ROWS);
  const values = {};
  for (const s of arr(symbols)) {
    const name = typeof s === 'string' ? s : s?.name;
    if (!name || /^(SFSY|SY)-/.test(up(name))) continue; // page numbers and system fields have their defaults
    const f = own(fields, name) ? fields[name] : {};
    const inLoop = f.inLoop ?? (typeof s === 'object' && arr(s.occurrences).some((o) => o.inLoop));
    values[name] = inLoop ? Array.from({ length: n }, (_, i) => sampleOf(name, f, i, { dateFormat, numberFormat })) : sampleOf(name, f, 0, { dateFormat, numberFormat });
  }
  return { rows: n, values };
}

// ---------------------------------------------------------------- edits (AI proposals and the field list)

const CHAR_TYPES = new Set(['CHAR', 'C', 'STRING', 'SSTRING', 'LCHR', 'NUMC', 'N', '']), scalar = (v) => typeof v === 'string' || typeof v === 'number';

/**
 * Applies allow-listed operations to a sample (values.json). Ops:
 *   set-value { sym, value }                — a value (string / number), or an array (one per row) for a loop symbol
 *   set-row-value { sym, row, value }       — row 1 = the first row
 *   set-rows { n }                          — 1…50; loop arrays grow (repeating their values) or shrink
 *   add-row { after? }                      — a copy of row `after` (default the last) after it
 *   remove-row { row }
 *   set-default-paragraph { value }         — paragraph for '*' lines (1–2 characters)
 * A symbol not in `fields`, a bad row or anything else is skipped with its reason; a value longer than the
 * field's DDIC length is applied with a warning (to see the overflow). Never throws; `sample` is not changed.
 */
export function applySampleOps(sample, ops, fields = {}) {
  const next = { ...(sample && typeof sample === 'object' ? sample : {}) };
  let values = {};
  try { values = structuredClone(own(next, 'values') && next.values && typeof next.values === 'object' ? next.values : {}); } catch { values = {}; }
  next.values = values;
  next.rows = Math.min(Math.max(1, Number(next.rows) || 3), MAX_ROWS);
  const applied = [], skipped = [], warnings = [];
  const loopNames = () => Object.keys(values).filter((k) => Array.isArray(values[k]));
  const tooLong = (sym, v, i) => {
    const f = fields[sym];
    if (f && CHAR_TYPES.has(up(f.type)) && f.length && String(v).length > f.length) warnings.push({ index: i, sym, why: `${String(v).length} characters, the field holds ${f.length} — kept to show the overflow` });
  };
  const resize = (n) => {
    for (const k of loopNames()) {
      const a = values[k];
      values[k] = Array.from({ length: n }, (_, i) => (i < a.length ? a[i] : a.length ? a[i % a.length] : ''));
    }
    next.rows = n;
  };
  arr(ops).forEach((op, i) => {
    const skip = (why) => skipped.push({ index: i, op: op && typeof op === 'object' ? String(op.op ?? '') : '', why });
    try {
      if (!op || typeof op !== 'object' || typeof op.op !== 'string') return skip('not an operation');
      const symOk = () => typeof op.sym === 'string' && own(fields, op.sym);
      switch (op.op) {
        case 'set-value': {
          if (!symOk()) return skip(`unknown symbol ${String(op.sym ?? '')}`);
          if (Array.isArray(op.value)) {
            if (!op.value.every(scalar)) return skip('values must be text or numbers');
            if (op.value.length > MAX_ROWS) return skip(`more than ${MAX_ROWS} rows`);
            values[op.sym] = op.value.map(String);
            op.value.forEach((v) => tooLong(op.sym, v, i));
          } else {
            if (!scalar(op.value)) return skip('value must be text or a number');
            values[op.sym] = fields[op.sym]?.inLoop ? Array.from({ length: next.rows }, () => String(op.value)) : String(op.value);
            tooLong(op.sym, op.value, i);
          }
          break;
        }
        case 'set-row-value': {
          if (!symOk()) return skip(`unknown symbol ${String(op.sym ?? '')}`);
          const row = Number(op.row);
          if (!Number.isInteger(row) || row < 1 || row > next.rows) return skip(`row ${String(op.row)} is not 1…${next.rows}`);
          if (!scalar(op.value)) return skip('value must be text or a number');
          const cur = values[op.sym];
          const a = Array.isArray(cur) ? cur.slice() : Array.from({ length: next.rows }, () => (cur === undefined ? '' : String(cur)));
          while (a.length < next.rows) a.push(a.length ? a[a.length - 1] : '');
          a[row - 1] = String(op.value);
          values[op.sym] = a;
          tooLong(op.sym, op.value, i);
          break;
        }
        case 'set-rows': {
          const n = Number(op.n);
          if (!Number.isInteger(n) || n < 1 || n > MAX_ROWS) return skip(`rows must be 1…${MAX_ROWS}`);
          resize(n);
          break;
        }
        case 'add-row': {
          if (next.rows >= MAX_ROWS) return skip(`at most ${MAX_ROWS} rows`);
          const after = op.after === undefined ? next.rows : Number(op.after);
          if (!Number.isInteger(after) || after < 1 || after > next.rows) return skip(`row ${String(op.after)} is not 1…${next.rows}`);
          for (const k of loopNames()) { const a = values[k].slice(0, next.rows); while (a.length < next.rows) a.push(a.length ? a[a.length - 1] : ''); a.splice(after, 0, a[after - 1]); values[k] = a; }
          next.rows += 1;
          break;
        }
        case 'remove-row': {
          const row = Number(op.row);
          if (next.rows <= 1) return skip('the last row stays');
          if (!Number.isInteger(row) || row < 1 || row > next.rows) return skip(`row ${String(op.row)} is not 1…${next.rows}`);
          for (const k of loopNames()) { const a = values[k].slice(0, next.rows); while (a.length < next.rows) a.push(a.length ? a[a.length - 1] : ''); a.splice(row - 1, 1); values[k] = a; }
          next.rows -= 1;
          break;
        }
        case 'set-default-paragraph': {
          if (typeof op.value !== 'string' || !/^[A-Za-z0-9]{1,2}$/.test(op.value)) return skip('a paragraph name of 1–2 letters or digits');
          next.defaultParagraph = op.value.toUpperCase();
          break;
        }
        default: return skip(`unknown op ${op.op}`);
      }
      applied.push(i);
    } catch (e) {
      skip(`refused: ${String(e?.message ?? e).slice(0, 80)}`);
    }
  });
  return { sample: next, applied, skipped, warnings };
}
