// sc4sap:smartform-preview — page breaks without a browser (the web's preview workbench has no Chrome).
//
//   estimateBlocks(html)        → { blocks, approx } — the blocks the browser's measuring pass (MEASURE_JS) would
//                                 report for the page's MAIN window: { t, b, brk, page, tbl, head } in mm from the
//                                 top of MAIN, estimated from the drawn HTML alone
//   paginatePreview(r, { pagesFromBlocks, measure })
//                               → the multi-page document of Renderer r ({ html, w, h, pages }) or null when the
//                                 print fits on one page; `approx` lists what was estimated rather than measured.
//                                 measure() builds a fresh Renderer of the same form for the measuring pass (a render
//                                 advances a renderer's state, so r itself draws only the result)
//
// Blocks follow sfBlocks() of build-preview.mjs exactly: every .tmpl, .row, .par, img and .sfbreak inside MAIN, in
// document order, without a .row / .par / img that sits inside a .tmpl and without a .par / img that sits inside a
// .row. Heights:
//   .tmpl / .row  the rows' own `height:<n>mm` (a template is the sum of its rows) — exact, the renderer fixes them
//   .par          margin-top + margin-bottom + lines × line-height of its paragraph format (the page's <style>);
//                 lines = explicit breaks + the wrap estimated from SAP's glyph widths (glyph-widths.json, Latin) or
//                 1 em (CJK) against the width of the cell / template / window it sits in — an estimate
//   img           its `height:<n>mm`;  .sfbreak  0 (a NEWPAGE command; data-page = the page it goes to)
// Blocks stack in document order (MAIN is normal flow). Pure: no I/O beyond reading the glyph table once.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tabNextStop } from './build-preview.mjs';

const here = dirname(fileURLToPath(import.meta.url));
let GLYPH = null, BLANK = null;
const glyphs = () => (GLYPH ??= JSON.parse(readFileSync(join(here, 'glyph-widths.json'), 'utf8')).widths || {});
const blanks = () => (BLANK ??= JSON.parse(readFileSync(join(here, 'blank-widths.json'), 'utf8')));

const PT_MM = 25.4 / 72;
/** The renderer's Angsana fallback: Arial at 61 % of the size (build-preview.mjs @font-face "SF Angsana fallback"). */
const THAI_SCALE = 0.61;
/** A Thai letter's advance in the system Thai face (Leelawadee / Tahoma), in em. */
const THAI_LETTER_EM = 0.5;
const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'col', 'wbr']);

/** mm from a CSS length ("4.230mm", "12pt", "0.5cm"); null when it is none of those. */
function mm(v) {
  const m = /^\s*(-?[\d.]+)\s*(mm|pt|cm|in|px)?\s*$/.exec(String(v ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return { mm: n, pt: n * PT_MM, cm: n * 10, in: n * 25.4, px: (n * 25.4) / 96 }[m[2] || 'px'];
}
const styleOf = (attrs) => {
  const s = /\bstyle="([^"]*)"/.exec(attrs)?.[1] || '';
  const o = {};
  for (const d of s.split(';')) { const i = d.indexOf(':'); if (i > 0) o[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim(); }
  return o;
};
const classOf = (attrs) => new Set((/\bclass="([^"]*)"/.exec(attrs)?.[1] || '').split(/\s+/).filter(Boolean));
const attrOf = (attrs, name) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1] ?? '';
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

/** The paragraph formats of the page's <style>: ".CLS div#TAG.par{…}" → { lh, mt, mb, pt, fam, bold }; later rules win. */
function paragraphRules(html) {
  const rules = new Map();
  for (const st of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    for (const m of st[1].matchAll(/\.([A-Za-z0-9_-]+)\s+(div|span)#([^.\s{]+)\.(par|char)\s*\{([^}]*)\}/g)) {
      if ((m[2] === 'div') !== (m[4] === 'par')) continue;
      const key = m[4] === 'par' ? `${m[1]}|${m[3]}` : `${m[1]}|char|${m[3]}`;
      const r = { ...(rules.get(key) || {}) };
      for (const d of m[5].split(';')) {
        const i = d.indexOf(':');
        if (i < 0) continue;
        const k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim();
        if (k === 'line-height') r.lh = mm(v) ?? r.lh;
        else if (k === 'font-size') r.pt = /pt$/.test(v) ? Number(v.replace(/pt$/, '')) : (mm(v) ?? 0) / PT_MM;
        else if (k === 'margin') { const p = v.split(/\s+/).map(mm); r.mt = p[0] ?? 0; r.mb = p[2] ?? p[0] ?? 0; r.ml = p[3] ?? p[1] ?? p[0] ?? 0; r.mr = p[1] ?? p[0] ?? 0; }
        else if (k === 'margin-top') r.mt = mm(v) ?? 0;
        else if (k === 'margin-bottom') r.mb = mm(v) ?? 0;
        else if (k === 'font-weight') r.bold = /bold/.test(v);
        else if (k === 'font-family') r.fam = v;
        else if (k === '--sapfam') r.sapfam = v;
      }
      rules.set(key, r);
    }
  }
  return rules;
}

/** The element tree of the MAIN window's HTML (div / span / img …, text). */
function parse(html) {
  const root = { tag: '#root', cls: new Set(), style: {}, attrs: '', kids: [], parent: null };
  let cur = root;
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) { cur.kids.push({ text: unesc(m[5]) }); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) {
      let n = cur;
      while (n && n.tag !== tag && n.parent) n = n.parent;
      if (n && n.parent) cur = n.parent;
      continue;
    }
    if (tag === 'script' || tag === 'style') continue;
    const el = { tag, cls: classOf(m[3]), style: styleOf(m[3]), attrs: m[3], kids: [], parent: cur };
    cur.kids.push(el);
    if (!VOID.has(tag) && !m[4]) cur = el;
  }
  return root;
}

/** The MAIN window element of the first sheet (".win.main"). */
function mainOf(root) {
  const find = (n) => {
    if (n.cls?.has('win') && n.cls.has('main')) return n;
    for (const k of n.kids || []) if (k.tag) { const r = find(k); if (r) return r; }
    return null;
  };
  return find(root);
}

const closest = (n, f) => { for (let p = n; p; p = p.parent) if (p.tag && f(p)) return p; return null; };
const hasCls = (c) => (n) => n.cls?.has(c);

/** The explicit lines of an element: each a list of tokens, text strings and TAB for a ",," tab span. */
const TAB = Symbol('tab');
function linesOf(el, charRule = () => null) {
  const out = [[]];
  const walk = (n, fmt) => {
    for (const k of n.kids || []) {
      if (k.text !== undefined) out[out.length - 1].push({ text: k.text, fmt });
      else if (k.tag === 'br') out.push([]);
      else if (k.cls?.has('tab')) out[out.length - 1].push(TAB);
      else walk(k, k.cls?.has('char') ? { ...(fmt || {}), ...(charRule(k) || {}) } : fmt);
    }
  };
  walk(el, null);
  return out;
}

/** The printed width (mm) of one blank: blank-widths.json (twips by device|family|size×10|bold), else the glyph table. */
function blankMm(pt, rule) {
  const fam = String(rule?.sapfam || '').toUpperCase();
  const key = `|${fam}|${Math.round(pt * 10)}|${rule?.bold ? 'B' : ''}`;
  const hit = fam && Object.entries(blanks()).find(([k]) => k.endsWith(key));
  return hit ? (hit[1] / 20) * PT_MM : null;
}

/** Width in mm of a string at pt size: SAP's glyph widths for Latin (Helvetica unless the family says Times / Courier), 1 em for CJK. */
function textMm(s, pt, rule) {
  const fam = String(rule?.sapfam || rule?.fam || '').toUpperCase();
  const key = /COUR/.test(fam) ? 'COURIE' : /TIMES|ROMAN/.test(fam) ? 'TIMES' : 'HELVE';
  const table = Object.entries(glyphs()).find(([k]) => k.includes(`|${key}|`) && k.endsWith(rule?.bold ? '|B' : '|N'))?.[1]
    || Object.entries(glyphs()).find(([k]) => k.includes(`|${key}|`))?.[1];
  if (key === 'COURIE' && !table) return [...s].length * 0.6 * pt * PT_MM;
  // Thai faces (Angsana / Cordia / Browallia, SAP THANGSAN …) have no SAP glyph table: the renderer draws Angsana
  // as Arial at 61 % of the size ("SF Angsana fallback", size-adjust 61 %) — the same here
  const thai = /ANGSA|THANG|CORDIA|BROWAL|SARABUN/.test(fam);
  let em = 0;
  for (const ch of s) {
    // combining marks (Thai vowels and tones, accents) take no width of their own
    if (/\p{M}/u.test(ch)) continue;
    const c = ch.codePointAt(0);
    if (c >= 0x1100 && (c <= 0x11ff || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef))) em += 1;
    // a Thai letter is not in the Angsana fallback (Arial): the system's Thai face draws it at the full size
    else if (thai && c >= 0x0e00 && c <= 0x0e7f) em += THAI_LETTER_EM / THAI_SCALE;
    else if (table && c >= 32 && c - 32 < table.length) em += (table[c - 32] || 556) / 1000;
    else em += 0.556;
  }
  return em * pt * PT_MM * (thai ? THAI_SCALE : 1);
}

/** The width (mm) a paragraph wraps in: its cell / template / window width, less its own margins. */
function widthOf(el, rule) {
  for (let p = el.parent; p; p = p.parent) {
    const w = mm(p.style?.width);
    if (w) return Math.max(0.01, w - (rule?.ml || 0) - (rule?.mr || 0));
  }
  return 1000;
}

/**
 * The blocks MEASURE_JS would report for the page's MAIN window, estimated from the HTML.
 * `approx`: the reasons an estimate replaced a measurement (wrapped text, a row without a height).
 */
export function estimateBlocks(html, { trace = null } = {}) {
  const rules = paragraphRules(html);
  const main = mainOf(parse(html));
  if (!main) return { blocks: [], approx: [] };
  const tpls = [];
  const all = [];
  const visit = (n) => {
    for (const k of n.kids) {
      if (!k.tag) continue;
      if (k.cls.has('tpl')) tpls.push(k);
      if (k.cls.has('tmpl') || k.cls.has('row') || k.cls.has('par') || k.tag === 'img' || k.cls.has('sfbreak')) all.push(k);
      visit(k);
    }
  };
  visit(main);
  // sfBlocks(): a break always; nothing inside a template but the template; nothing inside a row but the row
  const picked = all.filter((e) => e.cls.has('sfbreak') || ((e.cls.has('tmpl') || !closest(e.parent, hasCls('tmpl'))) && (e.cls.has('row') || e.cls.has('tmpl') || !closest(e.parent, hasCls('row')))));
  const approx = new Set();
  const styleClassOf = (e, key) => {
    for (let p = e.parent; p; p = p.parent) for (const c of p.cls || []) if (rules.has(key(c))) return c;
    return null;
  };
  /** { h, pt }: a paragraph's height and the largest font size it prints (character formats included). */
  const parInfo = (e) => {
    const id = attrOf(e.attrs, 'id');
    const cls = styleClassOf(e, (c) => `${c}|${id}`);
    const rule = cls ? rules.get(`${cls}|${id}`) : null;
    const charRule = (span) => {
      const cid = attrOf(span.attrs, 'id');
      const c2 = styleClassOf(span, (c) => `${c}|char|${cid}`);
      return c2 ? rules.get(`${c2}|char|${cid}`) : null;
    };
    const pt0 = rule?.pt || 10;
    const lh = rule?.lh || pt0 * PT_MM * 1.2;
    if (!rule?.lh) approx.add('a paragraph without a line height of its own: 1.2 × font size used');
    const w = widthOf(e, rule);
    const stops = attrOf(e.attrs, 'data-tabs').split(',').filter(Boolean).map(Number);
    const just = attrOf(e.attrs, 'data-tabj').split(',');
    const dist = Number(attrOf(e.attrs, 'data-tabdist')) || 0;
    const fmtOf = (tok) => (tok.fmt ? { ...rule, ...tok.fmt, bold: tok.fmt.bold ?? rule?.bold } : rule);
    // the text after a tab up to the next one: its width, and the width up to its decimal sign (the last '.' / ','
    // before a digit — tabDecimalWidth's anchor), for a right / centre / DECIMAL stop
    const segment = (toks, from) => {
      let w = 0, dec = null;
      for (let i = from; i < toks.length && toks[i] !== TAB; i++) {
        const r = fmtOf(toks[i]), pt = r?.pt || pt0, s = toks[i].text;
        for (let k = 0; k < s.length; k++) {
          if (/[.,]/.test(s[k]) && /[0-9]/.test(s[k + 1] || '')) dec = w;
          w += textMm(s[k], pt, r);
        }
      }
      return { w, dec };
    };
    let lines = 0, big = 0;
    // .par is pre-wrap: blanks keep their line, but a paragraph with no text at all has no line box, and a
    // <br> with nothing after it opens no line (the renderer adds U+200B where SAP prints the empty line)
    const all = linesOf(e, charRule);
    const empty = (toks) => toks.every((t) => t !== TAB && t.text === '');
    while (all.length > 1 && empty(all[all.length - 1])) all.pop();
    if (all.length === 1 && empty(all[0])) all.pop();
    for (const toks of all) {
      // greedy word wrap of one explicit line; a tab moves to the renderer's own next stop; leading blanks print
      // at the printer's blank width; a word longer than the line breaks between characters (R22)
      // x = the pen, ink = the end of the last non-blank glyph (trailing blanks do not pass a stop, R16)
      let n = 1, x = 0, ink = null, lead = true;
      toks.forEach((tok, ti) => {
        if (tok === TAB) {
          const { next, ji } = tabNextStop(stops, dist, x, ink);
          const j = ji >= 0 ? just[ji] || 'L' : 'L';
          let at = next;
          if (j !== 'L') {
            // a right / centre / DECIMAL stop: the text up to the next tab ends / centres / puts its decimal sign on
            // the stop (no decimal sign: it ends there); text that would start left of the pen stays at the pen
            const seg = segment(toks, ti + 1);
            at = j === 'C' ? next - seg.w / 2 : j === 'D' && seg.dec != null ? next - seg.dec : next - seg.w;
            at = Math.max(x, at);
          }
          x = at;
          lead = false;
          return;
        }
        const r = fmtOf(tok);
        const pt = r?.pt || pt0;
        if (tok.text.trim()) big = Math.max(big, pt);
        const blank = blankMm(pt, r) ?? textMm(' ', pt, r);
        for (const part of tok.text.split(/( +)/)) {
          if (!part) continue;
          if (/^ +$/.test(part)) { x += part.length * (lead ? blank : textMm(' ', pt, r)); continue; }
          lead = false;
          const pw = textMm(part, pt, r);
          if (x > 0 && x + pw > w + 0.05) { n++; x = 0; }
          if (pw <= w + 0.05) { x += pw; ink = x; continue; }
          // a word wider than the line breaks between characters (overflow-wrap:anywhere), at least one per line
          for (const ch of part) {
            const cw = textMm(ch, pt, r);
            if (x > 0 && x + cw > w + 0.05) { n++; x = 0; }
            x += cw;
          }
          ink = x;
        }
      });
      if (n > 1) approx.add('wrapped text: line breaks estimated from SAP glyph widths (no browser measure)');
      if (trace) trace.push({ node: attrOf(e.attrs, 'data-node'), width: +w.toFixed(2), lines: n, text: toks.map((t) => (t === TAB ? '	' : t.text)).join('').slice(0, 60), pt: big });
      lines += n;
    }
    return { h: (rule?.mt || 0) + (rule?.mb || 0) + lines * lh, pt: big };
  };
  const parHeight = (e) => parInfo(e).h;
  const rowHeight = (row) => {
    const h = mm(row.style.height) ?? mm(row.style['min-height']);
    if (h != null) return h;
    approx.add('a row without a fixed height: height estimated from its text');
    // auto height (R19): the tallest cell's stacked paragraphs, plus 1/4 of the largest printed font size below
    let max = 0, big = 0;
    const cells = row.kids.filter((k) => k.tag && k.cls.has('cell'));
    for (const cell of cells.length ? cells : [row]) {
      let sum = 0;
      const walk = (n) => { for (const k of n.kids) if (k.tag) { if (k.cls.has('par')) { const i = parInfo(k); sum += i.h; big = Math.max(big, i.pt); } else walk(k); } };
      walk(cell);
      max = Math.max(max, sum);
    }
    return max + (row.cls.has('autoh') ? (big / 4) * PT_MM : 0);
  };
  const heightOf = (e) => {
    if (e.cls.has('sfbreak')) return 0;
    if (e.tag === 'img') return mm(e.style.height) ?? 0;
    if (e.cls.has('row')) return rowHeight(e);
    if (e.cls.has('tmpl')) {
      const rows = [];
      const walk = (n) => { for (const k of n.kids) if (k.tag) { if (k.cls.has('row')) rows.push(k); else if (!k.cls.has('tmpl')) walk(k); } };
      walk(e);
      return rows.reduce((s, r) => s + rowHeight(r), 0);
    }
    return parHeight(e);
  };
  let y = 0;
  const placedEnd = new Map();
  const blocks = picked.map((e) => {
    const off = (mm(e.style['margin-top']) || 0) + (e.style.position === 'relative' ? mm(e.style.top) || 0 : 0);
    // a template with a vertical position (.vpos, position:absolute; top) sits at that offset from the top of MAIN
    // and takes no room in the flow; blocks inside one placed wrapper stack from its top
    const vp = closest(e.parent, (p) => p.cls?.has('vpos') && p.style.position === 'absolute');
    if (vp) {
      const t = (placedEnd.get(vp) ?? (mm(vp.style.top) || 0)) + off;
      const b = t + heightOf(e);
      placedEnd.set(vp, b);
      const t0 = closest(e, hasCls('tpl'));
      const headWrap = closest(e, hasCls('sfhead'));
      return { t: Math.round(t * 1000) / 1000, b: Math.round(b * 1000) / 1000, brk: e.cls.has('sfbreak'), page: attrOf(e.attrs, 'data-page'), tbl: t0 ? tpls.indexOf(t0) : -1, head: !!(headWrap && t0 && closest(headWrap, (p) => p === t0)) };
    }
    const t = y + off;
    const b = t + heightOf(e);
    y = b + (mm(e.style['margin-bottom']) || 0);
    const t0 = closest(e, hasCls('tpl'));
    const headWrap = closest(e, hasCls('sfhead'));
    return {
      t: Math.round(t * 1000) / 1000, b: Math.round(b * 1000) / 1000,
      brk: e.cls.has('sfbreak'), page: attrOf(e.attrs, 'data-page'),
      tbl: t0 ? tpls.indexOf(t0) : -1,
      head: !!(headWrap && t0 && closest(headWrap, (p) => p === t0)),
    };
  });
  return { blocks, approx: [...approx] };
}

/**
 * The multi-page print of Renderer r without a browser: MAIN's blocks estimated (estimateBlocks), cut by the
 * renderer's own pagePlan and drawn by its own pages() (pagesFromBlocks of build-preview.mjs). null = one page.
 */
export function paginatePreview(r, { pagesFromBlocks, measure }) {
  if (typeof measure !== 'function') throw new Error('paginatePreview: measure() must build a fresh Renderer of the same form');
  const mIdx = r.c.pages.findIndex((p) => (p.windows || []).some((w) => w.type === 'MAIN'));
  let blocks = [];
  let approx = [];
  if (mIdx >= 0) {
    // the measuring pass runs on a Renderer of its own: a render advances the renderer's state (array values
    // outside a loop, filled / unfilled, notes), so the drawn pages must start from a renderer nothing drew yet
    const m = measure();
    m.markHeads = true;
    ({ blocks, approx } = estimateBlocks(m.page(mIdx).html));
  }
  const doc = pagesFromBlocks(r, blocks);
  if (!doc) return null;
  return { ...doc, approx: ['page breaks estimated from the layout (no browser measure)', ...approx] };
}
