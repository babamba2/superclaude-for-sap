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

export function pickFormat(choices, t, align = 'LEFT', preferStyle, preferLs) {
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
    // (0.75 LN at 6 LPI is exactly 9 pt: equal is no shortfall)
    cost += c.ls < (c.pt * 25.4) / 72 - 0.05 ? 3 : 0;
    cost += preferStyle && c.style !== preferStyle ? 0.4 : 0;
    // texts on one line in a template row share its top: another line spacing prints them
    // higher or lower than their neighbours
    cost += preferLs !== undefined && Math.abs(c.ls - preferLs) > 0.05 ? 1 : 0;
    if (!best || cost < best.cost) best = { ...c, cost };
  }
  return best;
}

// ── rules → grids ───────────────────────────────────────────────────────────
// stroked segments, filled thin boxes and box outlines as horizontal / vertical rules
// a colour read-pdf gives (grey 0..1 or #rrggbb) that prints (almost) white
export function isLight(c) {
  if (c === undefined || c === null) return false;
  if (typeof c === 'number') return c > 0.95;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(c));
  return !!m && [m[1], m[2], m[3]].every((h) => parseInt(h, 16) > 242);
}

function rulesOf(page) {
  const H = [], V = [];
  const add = (dir, pos, a, b, th) => { if (b - a > 0.3) (dir === 'H' ? H : V).push({ pos, a, b, th }); };
  // a white rule does not show (Form Builder draws a border it hides in white), nor does a
  // zero-width one (a window frame of thickness 0 — SAP's PDF still writes it)
  for (const l of page.lines.filter((q) => !isLight(q.color) && q.th !== 0)) {
    if (Math.abs(l.y1 - l.y2) < 0.05) add('H', l.y1, Math.min(l.x1, l.x2), Math.max(l.x1, l.x2), l.th);
    else if (Math.abs(l.x1 - l.x2) < 0.05) add('V', l.x1, Math.min(l.y1, l.y2), Math.max(l.y1, l.y2), l.th);
  }
  for (const r of page.rects) {
    if (r.fill !== undefined && isLight(r.fill) && (r.h < 0.8 || r.w < 0.8)) continue;
    if (r.fill !== undefined && r.h < 0.8 && r.w > r.h) add('H', r.y + r.h / 2, r.x, r.x + r.w, r.h);
    else if (r.fill !== undefined && r.w < 0.8) add('V', r.x + r.w / 2, r.y, r.y + r.h, r.w);
    else if (r.stroke !== undefined && !isLight(r.stroke) && r.th !== 0) {
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
// positions from rule positions (exact) and rule ends (SAP draws a rule half its width
// past the crossing rule): where both meet, the rule position wins
const uniqPos = (exact, ends, tol = 0.25) => {
  const all = [...exact.map((v) => ({ v, x: true })), ...ends.map((v) => ({ v, x: false }))].sort((a, b) => a.v - b.v);
  const groups = [];
  for (const p of all) { const g = groups[groups.length - 1]; if (g && p.v - g[g.length - 1].v <= tol) g.push(p); else groups.push([p]); }
  return groups.map((g) => { const ex = g.filter((p) => p.x); const use = ex.length ? ex : g; return use.reduce((s, p) => s + p.v, 0) / use.length; });
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
  const xs = uniqPos(V.map((s) => s.pos), H.flatMap((s) => [s.a, s.b]));
  const ys0 = uniqPos(H.map((s) => s.pos), V.flatMap((s) => [s.a, s.b]));
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
    const ruleCuts = uniqPos([x0, x1, ...V.filter((s) => s.a <= mid && s.b >= mid).map((s) => s.pos)], edgeEnds);
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

// item lines: lines (texts on one baseline) whose column starts repeat at a fixed pitch
// — at least 2 records, the first line of each with ≥ 3 texts; a later record may fill
// fewer columns (a freight line). A record runs to the next record's first line, so a
// second description line belongs to it. Reported for Step 5: every candidate must
// become a loop (`items` over a ruled grid, `textItems` over free texts).
export function itemCandidates(runs, tol = 1.2) {
  const lines = [];
  for (const t of [...runs].sort((a, b) => a.y - b.y)) {
    const l = lines.find((q) => Math.abs(q.y - t.y) < 0.4);
    if (l) l.texts.push(t); else lines.push({ y: t.y, top: t.top, texts: [t] });
  }
  for (const l of lines) { l.xs = l.texts.map((t) => t.x).sort((a, b) => a - b); l.top = Math.min(...l.texts.map((t) => t.top)); }
  // columns two lines share: same start and the same size / weight (a bold column
  // header above regular item lines is no record of them)
  // (a column of numbers is right-aligned: its right edge counts as well)
  const same = (t, u) => (Math.abs(t.x - u.x) <= tol || Math.abs(t.x + t.w - (u.x + u.w)) <= tol) && t.pt === u.pt && !!t.bold === !!u.bold;
  const shared = (a, b) => b.texts.filter((u) => a.texts.some((t) => same(t, u))).length;
  const isNum = (s) => /^[-+(]?[\d.,]+[-%)]?(\s+[A-Z]{3})?$/.test(String(s).trim()) && /\d/.test(s); // 1,000.00 / 4.3100- / 19% / 130.00 USD
  const out = [], used = new Set();
  lines.forEach((first, i) => {
    if (used.has(i) || first.xs.length < 3) return;
    for (let j = i + 1; j < lines.length; j++) {
      const second = lines[j];
      // the second record repeats most of the first line's columns
      if (shared(first, second) < 3 || shared(first, second) < 0.6 * first.xs.length) continue;
      const pitch = second.y - first.y;
      if (pitch < 2) continue;
      // further records at the same pitch: most of their own texts in the columns (a
      // freight line may fill fewer of them)
      const recs = [i, j];
      for (let k = j + 1; k < lines.length; k++) {
        const want = lines[recs[recs.length - 1]].y + pitch;
        if (lines[k].y > want + 0.8) break;
        if (Math.abs(lines[k].y - want) <= 0.8 && shared(first, lines[k]) >= Math.max(2, 0.6 * lines[k].xs.length)) recs.push(k);
      }
      // the lines between two record starts must look alike in every record
      const inner = lines.slice(i + 1, j).length;
      // a record may begin above its line of numbers (a reference line): lines before each
      // record start that repeat at the same pitch belong to the record
      const alike = (p, q) => p.texts.length === q.texts.length && shared(p, q) === q.texts.length && Math.abs(q.y - p.y - pitch) <= 0.8;
      let shift = 0;
      while (shift < inner && i - shift - 1 >= 0 && !used.has(i - shift - 1) && recs.every((r, k) => r - shift - 1 >= 0 && (k === 0 || alike(lines[recs[k - 1] - shift - 1], lines[r - shift - 1])))) shift++;
      if (shift) for (let k = 0; k < recs.length; k++) recs[k] -= shift;
      const last = recs[recs.length - 1];
      let end = last + 1;
      while (end < lines.length && end - last <= inner && lines[end].y - lines[last].y < pitch - 0.4) end++;
      for (let k = recs[0]; k < end; k++) used.add(k);
      out.push({
        top: +lines[recs[0]].top.toFixed(2), bottom: +(end < lines.length ? lines[end].top : lines[end - 1].y + 1).toFixed(2),
        pitch: +pitch.toFixed(2), count: recs.length, linesPerItem: inner + 1,
        // numbers in the first line: item lines carry quantities / amounts, a repeated
        // label block does not — the main thread decides, asking when unsure
        kind: first.texts.filter((t) => isNum(t.text)).length >= 2 ? 'items' : 'repeated',
        firstLine: first.texts.sort((a, b) => a.x - b.x).map((t) => t.text),
      });
      break;
    }
  });
  return out;
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
  // right-aligned columns (amounts, values under each other): the right edges of 3+ texts
  // meet while their left edges differ — a value of another length must end there too
  for (const t of runs) {
    const col = runs.filter((o) => o !== t && Math.abs(o.x + o.w - (t.x + t.w)) <= 0.6 && Math.abs(o.x - t.x) > 1 && o.y !== t.y);
    if (col.length >= 2) t.wantAlign = 'RIGHT';
  }
  // every text's format, and from it where its cell / window must start
  for (const t of runs) t.fmt = pickFormat(choices, t, t.wantAlign || 'LEFT', formStyle);
  // one line spacing per line (the most common one): a text whose format has another takes an
  // equal format with that spacing when the styles have one
  for (const t of runs) {
    const line = runs.filter((o) => Math.abs(o.y - t.y) < 0.4);
    const n = {};
    for (const o of line) n[o.fmt.ls] = (n[o.fmt.ls] || 0) + 1;
    const ls = Number(Object.entries(n).sort((a, b) => b[1] - a[1])[0][0]);
    if (Math.abs(t.fmt.ls - ls) <= 0.05) continue;
    const alt = pickFormat(choices, t, t.wantAlign || 'LEFT', formStyle, ls);
    if (Math.abs(alt.ls - ls) <= 0.05 && alt.pt === t.fmt.pt && alt.bold === t.fmt.bold && alt.fam === t.fmt.fam && alt.align === t.fmt.align) t.fmt = alt;
  }
  for (const t of runs) {
    const ls = t.fmt.ls ?? LN_MM;
    t.top = +(t.y - ls).toFixed(2);
    t.left = +(t.x - (t.fmt.left || 0)).toFixed(2);
    const key = `${sapFamily(t)} ${t.pt}${t.bold ? 'B' : ''} → ${t.fmt.style}/${t.fmt.para}${t.fmt.char ? '+' + t.fmt.char : ''} (${t.fmt.fam} ${t.fmt.pt}${t.fmt.bold ? 'B' : ''})`;
    report.fonts[key] = (report.fonts[key] || 0) + 1;
  }
  // align / pw (printed width) / ls (line spacing) / ind (left + right indent), all mm, go
  // along for shape-form, which moves texts into cells
  const textNode = (t) => ({ kind: 'text', lines: [{ f: t.fmt.para, t: t.fmt.char ? `<${t.fmt.char}>${literal(t.text)}</>` : literal(t.text) }], style: t.fmt.style !== formStyle ? t.fmt.style : undefined, align: t.fmt.align, pw: +printedWidth(t).toFixed(2), ls: +(t.fmt.ls ?? LN_MM).toFixed(2), ind: +((t.fmt.left || 0) + (t.fmt.right || 0)).toFixed(2) });

  const windows = [];
  const pageW = page.widthMm, pageH = page.heightMm;
  // a form needs a main window: an empty one at the bottom margin
  windows.push({ name: 'MAIN', type: 'M', x: 10, y: +(pageH - 8).toFixed(2), w: 20, h: 4, nodes: [] });

  // filled boxes (not the thin ones rulesOf reads as rules, not white) shade the template
  // cells they cover: a grey value as black at (1 - grey) %, a colour as itself at 100 %
  // — the two ways Form Builder shades a cell, and the two ways its PDF writes them
  const fills = (page.rects || []).filter((r) => r.fill !== undefined && r.w >= 0.8 && r.h >= 0.8).map((r) => {
    if (typeof r.fill === 'number') return r.fill < 0.995 ? { ...r, shade: { shade: Math.round((1 - r.fill) * 100) } } : null;
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(r.fill));
    if (!m) return null;
    const [cr, cg, cb] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16));
    if (cr > 252 && cg > 252 && cb > 252) return null;
    return { ...r, shade: { fill: { r: cr, g: cg, b: cb } } };
  }).filter(Boolean);
  report.shaded = 0;
  // the fill under most of a cell (its centre inside, 60 % of its area covered)
  const shadeOf = (x, y, w, h) => {
    const cx = x + w / 2, cy = y + h / 2;
    let best = null, bestA = 0;
    for (const f of fills) {
      if (cx < f.x || cx > f.x + f.w || cy < f.y || cy > f.y + f.h) continue;
      const a = Math.max(0, Math.min(x + w, f.x + f.w) - Math.max(x, f.x)) * Math.max(0, Math.min(y + h, f.y + f.h) - Math.max(y, f.y));
      if (a > bestA) { best = f; bestA = a; }
    }
    return best && bestA >= 0.6 * w * h ? best.shade : null;
  };

  // images: a window each, at the image's place — the graphic is an existing SE78 one the
  // user names later (shape-form `graphics`); resolution from the image's pixels per inch
  const RES = [75, 100, 150, 200, 300, 600];
  (page.images || []).forEach((im, k) => {
    const dpi = im.px ? im.px[0] / (im.w / 25.4) : 200;
    const resolution = RES.reduce((p, r) => (Math.abs(r - dpi) < Math.abs(p - dpi) ? r : p), 200);
    windows.push({ name: `%GRAPHIC${k + 1}`, caption: 'Graphic', x: +im.x.toFixed(2), y: +im.y.toFixed(2), w: +Math.min(im.w + 0.5, pageW - im.x).toFixed(2), h: +Math.min(im.h + 0.5, pageH - im.y).toFixed(2), image: { px: im.px, resolution }, nodes: [] });
  });
  report.images = (page.images || []).length;

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
      const sh = shadeOf(c.x, r.y, c.w, r.h);
      if (!c.texts.length && !b.l && !b.r && !b.t && !b.b && !sh) return;
      cells.push({ row: i + 1, col: j + 1, borders: b, ...(sh || {}), nodes: c.texts.map(textNode) });
      if (sh) report.shaded++;
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
  report.itemCandidates = itemCandidates(runs);
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
