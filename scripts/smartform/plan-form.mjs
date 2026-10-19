#!/usr/bin/env node
// First draft of a form spec (write-form.mjs input) from a page layout
// (read-pdf.mjs output): ruled areas become templates, the texts in their
// cells become cell texts, the other texts become windows; every text gets the
// paragraph (and character format) of an existing SmartStyle that prints its
// font, size and weight. Fixed texts only — fields, loops and the interface
// are decided afterwards (the skill's main thread edits the spec).
//
//   node plan-form.mjs <layout.json> --styles <catalog.json> --form ZNAME [--out spec.json]
//
// catalog.json: [ SmartStyle as GetSmartFormContent returns it: { name, font,
//   lpi, paragraphs[], strings[] } ]
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mergeRules, mergeRuns } from './read-pdf.mjs';

const LN_MM = 25.4 / 6; // 1 LN at 6 LPI

// ── fonts → SAP families ────────────────────────────────────────────────────
// the family a PDF font stands for (PDFs from SAP name it in sapFont)
export function sapFamily(t) {
  if (t.sapFont?.family) return t.sapFont.family;
  const f = String(t.font || '').toLowerCase();
  if (/courier|mono/.test(f)) return 'COURIER';
  if (/times|serif|roman|georgia|garamond/.test(f)) return 'TIMES';
  if (/gothic|dotum|gulim|malgun|batang|myungjo|hy|korea/.test(f)) return 'KPDODUM';
  if (/song|hei|simsun|kai/.test(f)) return 'CNSONG';
  if (/mincho|gothic.*jp|ms ?p?gothic|meiryo/.test(f)) return 'JPMINCHO';
  return 'HELVE';
}
// families that print alike (a style rarely has the exact one)
const ALIKE = [['HELVE', 'HELV_I7', 'A_SIMP', 'ARIAL', 'HELVCYR'], ['TIMES', 'TIME_I7', 'TIMECYR'], ['COURIER', 'COUR_I7', 'COURCYR'], ['KPDODUM', 'KPGULIM', 'KPSAMMUL', 'KPBATANG', 'KPGUNGSE'], ['CNSONG', 'CNHEI', 'CNKAI'], ['JPMINCHO', 'DBGOTHIC', 'DBMINCHO']];
const alikeOf = (f) => ALIKE.find((g) => g.includes(f)) || [f];

// every (family, pt, bold) a style can print: paragraph alone, or paragraph + character format
export function styleChoices(catalog) {
  const out = [];
  for (const s of catalog) {
    const df = s.font || {};
    for (const p of s.paragraphs || []) {
      if (!p.tag) continue;
      const fam = p.family || df.family;
      const pt = p.size ? p.size / 10 : df.pt;
      const bold = p.bold === 'X' ? true : p.bold === '*' || !p.bold ? !!df.bold : false;
      const ls = lineSpacingMm(p.lineSpacing, s.lpi);
      const base = { style: s.name, para: p.tag, align: p.align, left: lenMm(p.left), right: lenMm(p.right), before: lenMm(p.before), ls, under: p.underline === 'X', decor: p.italic === 'X' };
      if (fam && pt) out.push({ ...base, fam, pt, bold });
      for (const c of s.strings || []) {
        if (!c.tag || c.barcode || c.hidden === 'X') continue;
        const f2 = c.family || fam, pt2 = c.size ? c.size / 10 : pt, b2 = c.bold === 'X' ? true : c.bold === '*' || !c.bold ? bold : false;
        const u2 = c.underline === 'X' ? true : c.underline === '*' || !c.underline ? base.under : false;
        if (f2 && pt2) out.push({ ...base, fam: f2, pt: pt2, bold: b2, char: c.tag, under: u2, decor: c.superscript === 'X' || c.subscript === 'X' || c.italic === 'X' });
      }
    }
  }
  return out;
}
function lenMm(v) {
  const m = /^\s*(-?[\d.]+)\s*([A-Z]{2})?/.exec(String(v || ''));
  if (!m) return 0;
  const n = Number(m[1]);
  return { CM: n * 10, MM: n, IN: n * 25.4, PT: (n * 25.4) / 72, TW: (n * 25.4) / 1440, LN: n * LN_MM, CH: n * 2.54 }[m[2] || 'CM'] ?? n * 10;
}
function lineSpacingMm(v, lpi) {
  const m = /^\s*([\d.]+)\s*([A-Z]{2})?/.exec(String(v || '1 LN'));
  if (!m) return LN_MM;
  return m[2] === 'LN' || !m[2] ? (Number(m[1]) * 25.4) / (lpi || 6) : lenMm(v);
}

// best choice for a text: same family group, nearest size, same weight; then the
// wanted alignment; a paragraph without a character format and without a
// left margin is preferred
// the script a text needs a family for (a Latin family prints CJK / Thai as #)
const SCRIPT_FAMILIES = { hangul: /^KP/, han: /^(CN|TW|JP|DB|KP)/, kana: /^(JP|DB)/, thai: /^TH/ };
function scriptOf(s) {
  if (/[가-힯㄰-㆏]/.test(s)) return 'hangul';
  if (/[぀-ヿ]/.test(s)) return 'kana';
  if (/[一-鿿㐀-䶿]/.test(s)) return 'han';
  if (/[฀-๿]/.test(s)) return 'thai';
  return '';
}

export function pickFormat(choices, t, align = 'LEFT', preferStyle) {
  const fam = sapFamily(t);
  const group = alikeOf(fam);
  const script = scriptOf(t.text || '');
  let best = null;
  for (const c of choices) {
    let cost = Math.abs(c.pt - t.pt) * 4;
    // Latin look-alikes print on any device; CJK families are device fonts — one the
    // printer lacks comes out as # (KPGULIM on KPPDF), so a CJK stand-in costs more than a point of size
    cost += c.fam === fam ? 0 : group.includes(c.fam) ? (/^(KP|CN|TW|JP|DB|TH)/.test(fam) ? 5 : 1) : 12;
    if (script && !SCRIPT_FAMILIES[script].test(c.fam)) cost += 40;
    cost += c.bold === !!t.bold ? 0 : 6;
    cost += c.under === !!t.underline ? 0 : 8;
    cost += c.decor ? 8 : 0;
    cost += c.align === align ? 0 : align === 'LEFT' && c.align === 'BLOCK' ? 0.2 : 3;
    cost += c.char ? 0.3 : 0;
    cost += c.left ? 0.5 + c.left : 0;
    cost += c.before ? 2 : 0;
    cost += Math.abs(c.ls - LN_MM) > 0.05 ? 0.5 : 0;
    // a line spacing below the font height (0.00 LN exists) prints the text over the window top
    cost += c.ls < (c.pt * 25.4) / 72 ? 3 : 0;
    cost += preferStyle && c.style !== preferStyle ? 0.4 : 0;
    if (!best || cost < best.cost) best = { ...c, cost };
  }
  return best;
}

// ── rules → grids ───────────────────────────────────────────────────────────
// stroked segments, filled thin boxes and box outlines as horizontal / vertical rules
function rulesOf(page) {
  const H = [], V = [];
  const add = (dir, pos, a, b, th) => { if (b - a > 0.3) (dir === 'H' ? H : V).push({ pos, a, b, th }); };
  for (const l of page.lines) {
    if (Math.abs(l.y1 - l.y2) < 0.05) add('H', l.y1, Math.min(l.x1, l.x2), Math.max(l.x1, l.x2), l.th);
    else if (Math.abs(l.x1 - l.x2) < 0.05) add('V', l.x1, Math.min(l.y1, l.y2), Math.max(l.y1, l.y2), l.th);
  }
  for (const r of page.rects) {
    if (r.fill !== undefined && r.h < 0.8 && r.w > r.h) add('H', r.y + r.h / 2, r.x, r.x + r.w, r.h);
    else if (r.fill !== undefined && r.w < 0.8) add('V', r.x + r.w / 2, r.y, r.y + r.h, r.w);
    else if (r.stroke !== undefined) {
      add('H', r.y, r.x, r.x + r.w, r.th); add('H', r.y + r.h, r.x, r.x + r.w, r.th);
      add('V', r.x, r.y, r.y + r.h, r.th); add('V', r.x + r.w, r.y, r.y + r.h, r.th);
    }
  }
  // SAP draws a cell border twice (both neighbours) and lets lines overlap by half
  // their width: merge collinear rules that touch
  const m = mergeRules([...H.map((s) => ({ ...s, dir: 'H' })), ...V.map((s) => ({ ...s, dir: 'V' }))]);
  return { H: m.filter((s) => s.dir === 'H'), V: m.filter((s) => s.dir === 'V') };
}

// connected groups of rules (a rule touches another when they cross or meet)
function groups({ H, V }) {
  const all = [...H.map((s) => ({ ...s, dir: 'H' })), ...V.map((s) => ({ ...s, dir: 'V' }))];
  const parent = all.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const touch = (h, v) => v.pos >= h.a - 0.4 && v.pos <= h.b + 0.4 && h.pos >= v.a - 0.4 && h.pos <= v.b + 0.4;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const a = all[i], b = all[j];
    const t = a.dir !== b.dir ? touch(a.dir === 'H' ? a : b, a.dir === 'H' ? b : a) : Math.abs(a.pos - b.pos) < 0.15 && a.a <= b.b + 0.4 && b.a <= a.b + 0.4;
    if (t) parent[find(i)] = find(j);
  }
  const m = new Map();
  all.forEach((s, i) => { const r = find(i); if (!m.has(r)) m.set(r, []); m.get(r).push(s); });
  return [...m.values()];
}

const uniq = (vals, tol = 0.25) => {
  const s = [...vals].sort((a, b) => a - b);
  const out = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v); else out[out.length - 1] = (out[out.length - 1] + v) / 2;
  return out;
};

// literal text in a SmartForm text line: & and < start a field / a format,
// <( … <) protects them
export const literal = (s) => String(s).replace(/[&<]/g, (c) => `<(>${c}<)>`);

// the width a text will print with: the PDF's width scaled to the chosen size (a
// family other than the source's runs a little wider or narrower — allow for it)
const printedWidth = (t) => t.w * (t.fmt.pt / (t.pt || t.fmt.pt)) * (t.fmt.fam === sapFamily(t) ? 1.01 : 1.08);

// a group of rules (with the texts inside it) as a template. Rows lie between
// the distinct y's of the rules; per row the columns lie between the vertical
// rules crossing it. A text prints one line below its cell's top, at the cell's
// left edge: borderless cuts at each text's top and left put it where the PDF has it.
function gridOf(rules, texts) {
  const H = rules.filter((s) => s.dir === 'H'), V = rules.filter((s) => s.dir === 'V');
  const xs = uniq([...V.map((s) => s.pos), ...H.flatMap((s) => [s.a, s.b])]);
  const ys0 = uniq([...H.map((s) => s.pos), ...V.flatMap((s) => [s.a, s.b])]);
  if (xs.length < 2 || ys0.length < 2) return null;
  const x0 = xs[0], x1 = xs[xs.length - 1], y0 = ys0[0], y1 = ys0[ys0.length - 1];
  // a cell prints a line only when the whole line height fits in it: a text goes into
  // the grid when [top, top + line] crosses no rule and no other text's start —
  // the others are left for windows over the grid
  const cand = texts.filter((t) => t.x >= x0 - 0.3 && t.x < x1 - 0.3 && t.y > y0 + 0.3 && t.y <= y1 + 0.3).sort((a, b) => a.top - b.top);
  const mine = [];
  const hr = (t) => H.filter((s) => s.a <= t.x + 0.3 && s.b >= t.x + 0.3);
  for (const t of cand) {
    const ls = t.fmt.ls ?? LN_MM;
    const ruleAbove = Math.max(-1e9, ...hr(t).filter((s) => s.pos <= t.y).map((s) => s.pos));
    if (t.top < ruleAbove - 0.05) continue; // the line would start above the cell
    // any y of the grid (also where a vertical rule starts or ends elsewhere) cuts the whole template row
    if (ys0.some((y) => y > t.top + 0.05 && y < t.top + ls - 0.05)) continue;
    const clash = mine.some((o) => Math.abs(o.top - t.top) > 0.2 && ((o.top > t.top && o.top < t.top + ls - 0.05) || (t.top > o.top && t.top < o.top + (o.fmt.ls ?? LN_MM) - 0.05)));
    if (clash) continue;
    mine.push(t);
  }
  const ys = uniq([...ys0, ...mine.map((t) => Math.max(y0, t.top))], 0.2);
  const covers = (list, pos, a, b) => list.find((s) => Math.abs(s.pos - pos) < 0.3 && s.a <= a + 0.4 && s.b >= b - 0.4);
  const th = (r) => (r ? Math.max(0.1, (r.th * 72) / 25.4) : 0); // mm → pt
  const rows = [];
  const placed = [];
  for (let i = 0; i + 1 < ys.length; i++) {
    const top = ys[i], bot = ys[i + 1];
    if (bot - top < 0.2) continue;
    const mid = (top + bot) / 2;
    // the texts that start in this row
    const here = mine.filter((t) => Math.abs(Math.max(y0, t.top) - top) < 0.25);
    // columns end at the vertical rules crossing the row and where a rule along its top or
    // bottom edge starts or ends (a cell border is all or nothing)
    const edgeEnds = H.filter((s) => Math.abs(s.pos - top) < 0.3 || Math.abs(s.pos - bot) < 0.3).flatMap((s) => [s.a, s.b]);
    const ruleCuts = uniq([x0, x1, ...V.filter((s) => s.a <= mid && s.b >= mid).map((s) => s.pos), ...edgeEnds]);
    // the outer edges stay where they are (every row has the grid's width)
    const cuts = [x0, ...uniq([...ruleCuts, ...here.map((t) => t.left)], 0.3).filter((x) => x > x0 + 0.2 && x < x1 - 0.2), x1];
    const cells = [];
    for (let j = 0; j + 1 < cuts.length; j++) {
      const a = cuts[j], b = cuts[j + 1];
      // a sliver between two cuts goes to the cell before it (rows must keep their width)
      if (b - a < 0.2 && cells.length) { cells[cells.length - 1].w = b - cells[cells.length - 1].x; continue; }
      if (b - a < 0.2) continue;
      const cell = { x: a, w: b - a, borders: { l: th(covers(V, a, top, bot)), r: th(covers(V, b, top, bot)), t: th(covers(H, top, a, b)), b: th(covers(H, bot, a, b)) }, texts: [] };
      // the text must fit the cell in the size it will print in, else SAP wraps it
      // (at a blank or a hyphen) onto a line the cell cuts off
      for (const t of here) if (Math.abs(t.left - a) < 0.35 && (t.fmt.align === 'LEFT' || t.fmt.align === 'BLOCK') && printedWidth(t) <= b - a - (t.fmt.left || 0) - 0.2) { cell.texts.push(t); placed.push(t); }
      cells.push(cell);
    }
    rows.push({ y: top, h: bot - top, cells });
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rows, placed };
}

// page formats (SPAD) by the size SAP prints them at, portrait width x height;
// a system's own formats come in through opts.pageFormats
export const PAGE_FORMATS = [
  { name: 'DINA4', w: 210, h: 297 }, { name: 'DINA3', w: 297, h: 420 }, { name: 'DINA5', w: 148, h: 210 },
  { name: 'LETTER', w: 215.9, h: 279.4 }, { name: 'LEGAL', w: 215.9, h: 355.6 },
];
function pageFormatOf(w, h, extra = []) {
  for (const f of [...extra, ...PAGE_FORMATS]) {
    if (Math.abs(f.w - w) < 1.5 && Math.abs(f.h - h) < 1.5) return { name: f.name, orientation: 'P', exact: true };
    if (Math.abs(f.h - w) < 1.5 && Math.abs(f.w - h) < 1.5) return { name: f.name, orientation: 'L', exact: true };
  }
  return { name: 'DINA4', orientation: w > h ? 'L' : 'P', exact: false };
}

// ── page → spec ─────────────────────────────────────────────────────────────
export function planForm(layout, catalog, opts = {}) {
  const page = layout.page;
  const choices = styleChoices(catalog);
  if (!choices.length) throw new Error('no usable paragraph in the style catalog');
  // pieces joined only across a single blank: a wider gap is a column gap (in a
  // template the second part would wrap in the first part's cell)
  const runs = (page.texts ? mergeRuns(page.texts, 1.1) : page.runs).map((t, i) => ({ ...t, i }));
  const report = { templates: 0, windows: 0, rules: 0, texts: runs.length, inCells: 0, fonts: {} };
  // the form style: the one that serves most texts best
  const votes = {};
  for (const t of runs) { const c = pickFormat(choices, t); votes[c.style] = (votes[c.style] || 0) + 1; }
  const formStyle = opts.style || Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  // every text's format, and from it where its cell / window must start
  for (const t of runs) {
    t.fmt = pickFormat(choices, t, 'LEFT', formStyle);
    const ls = t.fmt.ls ?? LN_MM;
    t.top = +(t.y - ls).toFixed(2);
    t.left = +(t.x - (t.fmt.left || 0)).toFixed(2);
    const key = `${sapFamily(t)} ${t.pt}${t.bold ? 'B' : ''} → ${t.fmt.style}/${t.fmt.para}${t.fmt.char ? '+' + t.fmt.char : ''} (${t.fmt.fam} ${t.fmt.pt}${t.fmt.bold ? 'B' : ''})`;
    report.fonts[key] = (report.fonts[key] || 0) + 1;
  }
  const textNode = (t) => ({ kind: 'text', lines: [{ f: t.fmt.para, t: t.fmt.char ? `<${t.fmt.char}>${literal(t.text)}</>` : literal(t.text) }], style: t.fmt.style !== formStyle ? t.fmt.style : undefined });

  const windows = [];
  const pageW = page.widthMm, pageH = page.heightMm;
  // a form needs a main window: an empty one at the bottom margin
  windows.push({ name: 'MAIN', type: 'M', x: 10, y: +(pageH - 8).toFixed(2), w: 20, h: 4, nodes: [] });

  const used = new Set();
  const { H, V } = rulesOf(page);
  let gi = 0, ri = 0;
  for (const g of groups({ H, V })) {
    const grid = gridOf(g, runs.filter((t) => !used.has(t.i)));
    if (!grid) {
      // a lone rule: a one-cell template whose cell border is the rule (a window frame
      // prints only when the window prints something, a template border always)
      for (const s of g) {
        ri++;
        const pt = Math.max(0.1, (s.th * 72) / 25.4);
        const len = +(s.b - s.a).toFixed(2);
        windows.push(s.dir === 'H'
          ? { name: `%RULE${ri}`, caption: 'Rule', x: +s.a.toFixed(2), y: +s.pos.toFixed(2), w: +Math.min(len + 0.5, pageW - s.a).toFixed(2), h: 1, nodes: [{ kind: 'template', rows: [{ h: 0.3, cols: [len] }], cells: [{ row: 1, col: 1, borders: { t: pt }, nodes: [] }] }] }
          : { name: `%RULE${ri}`, caption: 'Rule', x: +s.pos.toFixed(2), y: +s.a.toFixed(2), w: 1, h: +Math.min(len + 0.5, pageH - s.a).toFixed(2), nodes: [{ kind: 'template', rows: [{ h: len, cols: [0.3] }], cells: [{ row: 1, col: 1, borders: { l: pt }, nodes: [] }] }] });
      }
      continue;
    }
    gi++;
    for (const t of grid.placed) used.add(t.i);
    report.inCells += grid.placed.length;
    // columns from the rounded cut positions: every row adds up to the same width
    const rd = (v) => Math.round(v * 100) / 100;
    const rows = grid.rows.map((r) => ({ h: rd(r.h), cols: r.cells.map((c) => +(rd(c.x + c.w) - rd(c.x)).toFixed(2)) }));
    // a grid running into the page edge: its window ends there, the last columns give way
    const maxW = rd(Math.min(grid.w, pageW - grid.x - 0.5));
    for (const r of rows) { let over = +(r.cols.reduce((s, w) => s + w, 0) - maxW).toFixed(2); for (let k = r.cols.length - 1; k >= 0 && over > 0; k--) { const cut = Math.min(over, r.cols[k] - 0.1); r.cols[k] = +(r.cols[k] - cut).toFixed(2); over = +(over - cut).toFixed(2); } }
    const cells = [];
    grid.rows.forEach((r, i) => r.cells.forEach((c, j) => {
      const b = c.borders;
      if (!c.texts.length && !b.l && !b.r && !b.t && !b.b) return;
      cells.push({ row: i + 1, col: j + 1, borders: b, nodes: c.texts.map(textNode) });
    }));
    windows.push({ name: `%WINDOW${gi}`, caption: `Grid ${gi}`, x: +grid.x.toFixed(2), y: +grid.y.toFixed(2), w: +Math.min(grid.w + 0.5, pageW - grid.x).toFixed(2), h: +Math.min(grid.h + 0.5, pageH - grid.y).toFixed(2), nodes: [{ kind: 'template', rows, cells }] });
  }

  // free texts: one window each
  let wi = 0;
  for (const t of runs) {
    if (used.has(t.i)) continue;
    wi++;
    const ls = t.fmt.ls ?? LN_MM;
    // as wide as the line allows: SAP's font may run wider than the PDF's, and a
    // window too narrow wraps the text onto a line that is cut off
    let right = pageW - 1;
    for (const o of runs) if (o !== t && o.x > t.x + 0.5 && o.y > t.top && o.top < t.y) right = Math.min(right, o.left - 0.3);
    for (const v of V) if (v.pos > t.x + 0.5 && v.a < t.y && v.b > t.top) right = Math.min(right, v.pos - 0.2);
    // (it may overlap a neighbour rather than wrap: SAP's font can run wider)
    let x = t.left;
    let w = Math.max(t.w * 1.3 + 2, right - t.left);
    // a centred / right-aligned paragraph (the only one with the font): the window is
    // placed so that the alignment puts the text where the PDF has it
    const pw = printedWidth(t);
    if (t.fmt.align === 'CENTER') { const c = t.x + t.w / 2; w = Math.min(pw * 1.3 + 4, 2 * c, 2 * (pageW - c) - 0.4); x = c - w / 2; }
    else if (t.fmt.align === 'RIGHT') { const r = t.x + t.w + (t.fmt.right || 0); w = Math.min(pw * 1.3 + 4, r); x = r - w; }
    windows.push({ name: `%TEXTWIN${wi}`, caption: String(t.text).slice(0, 30), x: +Math.max(0, x).toFixed(2), y: t.top, w: +Math.min(w, pageW - Math.max(0, x) - 0.2).toFixed(2), h: +Math.min(ls + 0.6, pageH - t.top - 0.2).toFixed(2), nodes: [textNode(t)] });
  }
  report.templates = gi;
  report.rules = ri;
  report.windows = windows.length;
  const pf = pageFormatOf(pageW, pageH, opts.pageFormats);
  if (!pf.exact) report.pageFormat = `no page format of ${pageW} x ${pageH} mm — ${pf.name} used`;
  return {
    spec: { form: opts.form || 'ZSC4SAP_DRAFT', caption: opts.caption || 'Form from PDF', language: opts.language || 'EN', pageFormat: pf.name, orientation: pf.orientation, style: formStyle, windows },
    report,
  };
}

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  if (!argv[0] || !opt('--styles')) { console.error('usage: node plan-form.mjs <layout.json> --styles <catalog.json> --form ZNAME [--out spec.json]'); process.exit(2); }
  const layout = JSON.parse(readFileSync(argv[0], 'utf8'));
  const catalog = JSON.parse(readFileSync(opt('--styles'), 'utf8'));
  const pageFormats = opt('--page-formats') ? JSON.parse(readFileSync(opt('--page-formats'), 'utf8')) : [];
  const { spec, report } = planForm(layout, catalog, { form: opt('--form'), style: opt('--style'), pageFormats });
  if (opt('--out')) writeFileSync(opt('--out'), JSON.stringify(spec, null, 1));
  else process.stdout.write(JSON.stringify(spec, null, 1) + '\n');
  console.error(JSON.stringify(report, null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
