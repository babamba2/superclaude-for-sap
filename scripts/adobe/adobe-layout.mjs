// sc4sap:adobe-preview — XFA layout of an Adobe form template for a data tree, in mm (no browser, no I/O).
//
//   layoutForm(template, record, opts) → { pages: [{ w, h, name, items }], report }
//     template  readXdp(...).template      record  buildRecord(...).record (root "data")
//     opts      { locale: 'en_US', scripts: true }
//   items: { type: 'text', x, y (baseline), text, pt, bold, italic, font, color, som, bind? }
//          { type: 'line', x1, y1, x2, y2, th, color }   { type: 'rect', x, y, w, h, fill?, stroke?, th? }
//          { type: 'image', x, y, w, h, mime, data?, href? }
//   report: { approximations: [], unbound: [], overflow: [], pages }
//
// Covered (layout-subset.md): pageSet / pageArea (occur, master content) / contentArea; subform layouts position,
// tb, lr-tb (as tb), table / row (columnWidths, colSpan); occur min / max with data, implicit [*] instances,
// overflowLeader, break before / after (pageArea, contentArea), keep intact; field / draw: font, para (hAlign incl.
// radix, vAlign, spaceAbove / Below, margins, textIndent, lineHeight), margin, caption (left / right / top / bottom,
// reserve), border (edges, fill), value types with pictures (picture.mjs), rich text (xhtml p / span / br, embedded
// fields), images (base64 or data image fields); scripts via formcalc.mjs (the subset there), else approximation.

import { kids, kid, textOf, unit } from './read-adobe.mjs';
import { formatValue, LOCALES } from './picture.mjs';
import { runScripts } from './formcalc.mjs';
import { textWidthMm, VMETRICS } from '../forms-common/metrics.mjs';

const PT = 25.4 / 72;
const LEGACY_VINSET = 25.4 / 32; // XFA 2.1 field values: 1/32 inch above and below the text
const CONTAINERS = new Set(['subform', 'subformSet', 'field', 'draw', 'exclGroup', 'area', 'pageSet', 'pageArea', 'contentArea']);

// ── template access ────────────────────────────────────────────────────────────────
const prop = (el, tag) => kid(el, tag);
const attr = (el, name, dflt) => (el?.attrs?.[name] !== undefined ? el.attrs[name] : dflt);

/** Resolve use="#id" prototypes: the element's own attributes and properties win. */
function resolveUse(el, ids) {
  if (!el || el.tag === '#text') return el;
  const u = el.attrs?.use;
  if (!u || !/^#/.test(u)) return el;
  const base = ids.get(u.slice(1));
  if (!base || base === el) return el;
  const b = resolveUse(base, ids);
  const own = new Set(kids(el).map((c) => c.tag));
  const containerKids = kids(el).some((c) => CONTAINERS.has(c.tag));
  const inherited = kids(b).filter((c) => !own.has(c.tag) && (!CONTAINERS.has(c.tag) || !containerKids));
  return { tag: el.tag, attrs: { ...b.attrs, ...el.attrs, id: el.attrs.id }, children: [...inherited, ...el.children] };
}

function collectIds(el, ids = new Map()) {
  if (!el || el.tag === '#text') return ids;
  if (el.attrs?.id) ids.set(el.attrs.id, el);
  for (const c of el.children || []) collectIds(c, ids);
  return ids;
}

function fontOf(el) {
  const f = prop(el, 'font');
  return {
    face: attr(f, 'typeface', 'Arial'),
    pt: Math.round((unit(attr(f, 'size', '10pt'), 10 * PT) / PT) * 1000) / 1000,
    bold: attr(f, 'weight', 'normal') === 'bold',
    italic: attr(f, 'posture', 'normal') === 'italic',
    underline: attr(f, 'underline', '0') !== '0',
    color: colorOf(prop(prop(f, 'fill'), 'color')) || '#000000',
  };
}

function colorOf(c) {
  const v = attr(c, 'value');
  if (!v) return null;
  const p = v.split(',').map((x) => Math.max(0, Math.min(255, Number(x) || 0)));
  return `#${p.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function marginOf(el) {
  const m = prop(el, 'margin');
  return { l: unit(attr(m, 'leftInset'), 0), t: unit(attr(m, 'topInset'), 0), r: unit(attr(m, 'rightInset'), 0), b: unit(attr(m, 'bottomInset'), 0) };
}

function paraOf(el) {
  const p = prop(el, 'para');
  return {
    hAlign: attr(p, 'hAlign', 'left'), vAlign: attr(p, 'vAlign', 'top'),
    marginLeft: unit(attr(p, 'marginLeft'), 0), marginRight: unit(attr(p, 'marginRight'), 0),
    spaceAbove: unit(attr(p, 'spaceAbove'), 0), spaceBelow: unit(attr(p, 'spaceBelow'), 0),
    textIndent: unit(attr(p, 'textIndent'), 0), lineHeight: attr(p, 'lineHeight') ? unit(attr(p, 'lineHeight'), 0) : 0,
    radixOffset: unit(attr(p, 'radixOffset'), 0),
  };
}

/** Border: four edges (top, right, bottom, left; a missing one repeats the last given) and the fill. */
function borderOf(el) {
  const b = prop(el, 'border');
  if (!b || attr(b, 'presence', 'visible') !== 'visible') return null;
  const es = kids(b, 'edge');
  const edges = [];
  for (let i = 0; i < 4; i++) {
    const e = es[Math.min(i, es.length - 1)];
    if (!e) { edges.push(null); continue; }
    const visible = attr(e, 'presence', 'visible') === 'visible';
    edges.push(visible ? { th: unit(attr(e, 'thickness', '0.5pt'), 0.5 * PT), color: colorOf(prop(e, 'color')) || '#000000', stroke: attr(e, 'stroke', 'solid') } : null);
  }
  const f = prop(b, 'fill');
  const fill = f && attr(f, 'presence', 'visible') === 'visible' ? (colorOf(prop(f, 'color')) || '#ffffff') : null;
  // rounded corners (join="round" with a radius); other corner shapes draw square
  const c0 = kids(b, 'corner')[0];
  const radius = c0 && attr(c0, 'join', 'square') === 'round' && attr(c0, 'inverted', '0') !== '1' ? unit(attr(c0, 'radius'), 0) : 0;
  return { edges, fill, radius };
}

function occurOf(el) {
  const o = prop(el, 'occur');
  const min = Number(attr(o, 'min', '1'));
  const max = Number(attr(o, 'max', String(min > 1 ? min : 1)));
  const initial = Number(attr(o, 'initial', String(min)));
  return { min, max, initial };
}

function bindOf(el) {
  const b = prop(el, 'bind');
  return { match: attr(b, 'match', 'once'), ref: attr(b, 'ref', '') };
}

function breakOf(el) {
  const b = prop(el, 'break');
  const bb = prop(el, 'breakBefore');
  const ba = prop(el, 'breakAfter');
  const out = { before: null, after: null, overflowLeader: null, overflowTrailer: null, startNew: false };
  if (b) {
    if (attr(b, 'before', 'auto') !== 'auto') out.before = attr(b, 'beforeTarget') || attr(b, 'before');
    if (attr(b, 'after', 'auto') !== 'auto') out.after = attr(b, 'afterTarget') || attr(b, 'after');
    out.overflowLeader = attr(b, 'overflowLeader') || null;
    out.overflowTrailer = attr(b, 'overflowTrailer') || null;
    out.startNew = attr(b, 'startNew', '0') === '1';
  }
  if (bb) { out.before = attr(bb, 'targetType', 'auto') === 'auto' ? null : attr(bb, 'target') || attr(bb, 'targetType'); out.startNew = attr(bb, 'startNew', '0') === '1'; }
  if (ba && attr(ba, 'targetType', 'auto') !== 'auto') out.after = attr(ba, 'target') || attr(ba, 'targetType');
  const ov = prop(el, 'overflow');
  if (ov) { out.overflowLeader = attr(ov, 'leader') || out.overflowLeader; out.overflowTrailer = attr(ov, 'trailer') || out.overflowTrailer; }
  return out;
}

// ── data tree helpers ─────────────────────────────────────────────────────────────
// parents of the data tree's nodes (the record has no back links; set in layoutForm)
const DATA_PARENT = new WeakMap();
function setDataParents(n) { for (const c of n.children || []) { DATA_PARENT.set(c, n); setDataParents(c); } }
/** Is `node` the data context or one of its ancestors? */
function inChain(ctx, node) {
  for (let p = ctx; p; p = DATA_PARENT.get(p)) if (p === node) return true;
  return false;
}

function resolveRef(ref, ctx, root, starIndex) {
  let r = String(ref || '').trim();
  if (!r) return [];
  let base;
  if (/^\$record\b/.test(r)) { base = [root]; r = r.replace(/^\$record\.?/, ''); }
  else if (/^\$data\b/.test(r)) {
    base = [{ name: '$data', children: [root] }];
    r = r.replace(/^\$data\.?/, '');
  } else if (/^\$\./.test(r) || r === '$') { base = [ctx]; r = r.replace(/^\$\.?/, ''); }
  else if (/^!/.test(r)) return [];
  else base = [ctx];
  if (!r) return base.filter(Boolean);
  let cur = base.filter(Boolean);
  let stars = 0;
  for (const seg of r.split('.')) {
    const m = /^([^[\]]+)(?:\[(\*|\d+)\])?$/.exec(seg.trim());
    if (!m) return [];
    const next = [];
    for (const n of cur) {
      const hits = (n.children || []).filter((c) => c.name === m[1]);
      if (m[2] === '*') {
        // inside a repeated instance, a [*] step of an absolute path takes that instance (ADS: the current
        // instance of the enclosing repeated subform), e.g. $record.TABLE.WA[*].FIELD in row 3 → WA[2]
        const own = hits.find((h) => inChain(ctx, h));
        if (own) { next.push(own); stars++; continue; }
        if (stars === 0 && starIndex !== undefined) { if (hits[starIndex]) next.push(hits[starIndex]); }
        else next.push(...hits);
        stars++;
      } else {
        const i = m[2] === undefined ? 0 : Number(m[2]);
        if (hits[i]) next.push(hits[i]);
      }
    }
    cur = next;
  }
  return cur;
}

// ── merge: template + data → form tree ───────────────────────────────────────────────
let SEQ = 0;
function formNode(t, kind, data) {
  return { id: ++SEQ, t, kind, name: attr(t, 'name', ''), data, children: [], presence: attr(t, 'presence', 'visible'), over: {} };
}

/** Descendant field refs with [*] (implicit instances of a repeatable subform without its own binding). */
function starCount(t, ctx, root, ids) {
  let n = -1;
  const walk = (el) => {
    for (const c0 of kids(el)) {
      const c = resolveUse(c0, ids);
      if (!CONTAINERS.has(c.tag)) continue;
      const b = bindOf(c);
      if (b.match === 'dataRef' && /\[\*\]/.test(b.ref)) {
        const first = b.ref.slice(0, b.ref.indexOf('[*]') + 3);
        n = Math.max(n, resolveRef(first, ctx, root).length);
      }
      // a nested repeatable subform without its own binding takes the [*] instances itself
      const nested = (c.tag === 'subform' || c.tag === 'subformSet') && occurOf(c).max !== 1 && bindOf(c).match !== 'dataRef';
      if (c.tag !== 'field' && c.tag !== 'draw' && !nested) walk(c);
    }
  };
  walk(t);
  return n;
}

function mergeContainer(t0, ctx, root, ids, report, starIndex) {
  const t = resolveUse(t0, ids);
  const tag = t.tag;
  if (tag === 'draw') return [formNode(t, 'draw', null)];
  if (tag === 'field') {
    const b = bindOf(t);
    let data = null;
    if (b.match === 'dataRef') data = resolveRef(b.ref, ctx, root, starIndex)[0] || null;
    else if (b.match === 'once' && t.attrs.name) data = (ctx?.children || []).find((c) => c.name === t.attrs.name && !c.children?.length) || null;
    else if (b.match === 'global' && t.attrs.name) data = findByName(root, t.attrs.name);
    if (b.match === 'dataRef' && !data) report.unbound.push(b.ref);
    return [formNode(t, 'field', data)];
  }
  if (tag === 'subform' || tag === 'subformSet' || tag === 'exclGroup' || tag === 'area') {
    const b = bindOf(t);
    const occ = occurOf(t);
    let datas = [];
    let star = false;
    if (b.match === 'dataRef') {
      star = /\[\*\]\s*$/.test(b.ref);
      datas = resolveRef(b.ref, ctx, root, star ? undefined : starIndex);
      if (!star) datas = datas.slice(0, 1);
    } else if (b.match === 'once' && t.attrs.name && tag === 'subform') {
      const hits = (ctx?.children || []).filter((c) => c.name === t.attrs.name && c.children);
      datas = occ.max === 1 ? hits.slice(0, 1) : hits;
    }
    const out = [];
    const make = (d, idx) => {
      const n = formNode(t, tag, d);
      n.index = idx;
      const inner = d || ctx;
      for (const c of kids(t)) {
        const cu = resolveUse(c, ids);
        if (!CONTAINERS.has(cu.tag) || cu.tag === 'pageSet') continue;
        n.children.push(...mergeContainer(c, inner, root, ids, report, n.starIndex ?? starIndex));
      }
      return n;
    };
    if (datas.length) {
      const k = occ.max < 0 ? datas.length : Math.min(datas.length, occ.max);
      for (let i = 0; i < k; i++) out.push(make(datas[i], i));
      return out;
    }
    // no own data: a repeatable subform takes one instance per [*] match of its descendants
    if (occ.max !== 1 && b.match !== 'none') {
      const n = starCount(t, ctx, root, ids);
      if (n >= 0) {
        const k = Math.max(occ.min, occ.max < 0 ? n : Math.min(n, occ.max));
        for (let i = 0; i < k; i++) {
          const node = formNode(t, tag, null);
          node.index = i;
          node.starIndex = i;
          for (const c of kids(t)) {
            const cu = resolveUse(c, ids);
            if (!CONTAINERS.has(cu.tag) || cu.tag === 'pageSet') continue;
            node.children.push(...mergeContainer(c, ctx, root, ids, report, i));
          }
          out.push(node);
        }
        return out;
      }
    }
    const k = b.match === 'dataRef' || (b.match === 'once' && t.attrs.name && occ.max !== 1) ? occ.min : Math.max(occ.min, occ.initial);
    for (let i = 0; i < k; i++) out.push(make(null, i));
    return out;
  }
  return [];
}

function findByName(n, name) {
  if (!n) return null;
  for (const c of n.children || []) {
    if (c.name === name && !c.children?.length) return c;
    const r = findByName(c, name);
    if (r) return r;
  }
  return null;
}

// ── text ───────────────────────────────────────────────────────────────────────────────
function parseStyle(s) {
  const out = {};
  for (const part of String(s || '').split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

function runFont(base, st) {
  const f = { ...base };
  if (st['font-size']) f.pt = Math.round((unit(st['font-size'], f.pt * PT) / PT) * 1000) / 1000;
  if (st['font-weight']) f.bold = /bold|[6-9]00/.test(st['font-weight']);
  if (st['font-style']) f.italic = /italic|oblique/.test(st['font-style']);
  if (st['font-family']) f.face = st['font-family'].replace(/['"]/g, '').split(',')[0].trim();
  if (st.color) f.color = st.color;
  if (st['text-decoration']) f.underline = /underline/.test(st['text-decoration']);
  if (st['vertical-align']) f.valign = /super|top/.test(st['vertical-align']) ? 'super' : /sub|bottom/.test(st['vertical-align']) ? 'sub' : '';
  if (st.visibility) f.hidden = /hidden/.test(st.visibility);
  return f;
}

/** CSS tab stops ("tab-stop : left 3.5cm decimal 4cm …") → [{ align, pos (mm) }] sorted by position. */
export function tabStops(css) {
  const out = [];
  const t = String(css || '').trim().split(/\s+/);
  for (let i = 0; i + 1 < t.length; i += 2) {
    const align = /^(left|right|center|decimal)$/i.test(t[i]) ? t[i].toLowerCase() : 'left';
    const pos = unit(t[i + 1], NaN);
    if (Number.isFinite(pos)) out.push({ align, pos });
  }
  return out.sort((a, b) => a.pos - b.pos);
}

/** The XFA default tab distance is not known from SAP's sources; half an inch is used and reported. */
const DEFAULT_TAB = 12.7;

/** Paragraphs of a rich data value (text modules): a newline is a line break, style a CSS string. */
function dataParagraphs(rich, font) {
  return rich.map((p) => {
    const st = parseStyle(p.style);
    const f = runFont(font, st);
    const runs = [];
    String(p.text).split('\n').forEach((piece, i) => { if (i) runs.push({ br: true, font: f }); runs.push({ text: piece, font: f }); });
    return { runs, st };
  });
}

/** Rich text (xhtml body) → paragraphs [{ runs: [{ text, font }], style }] ; embedded fields via lookup. */
function richParagraphs(body, font, para, lookup) {
  const paras = [];
  let cur = null;
  const startPara = (st) => { cur = { runs: [], st, tabs: tabStops(st['tab-stop']) }; paras.push(cur); };
  const walk = (el, f, hard) => {
    for (const c of el.children || []) {
      if (c.tag === '#text') {
        // xfa-spacerun:yes keeps its blanks (as no-break spaces); other white space collapses to one blank
        const t = hard ? c.text.replace(/ /g, ' ') : c.text.replace(/[ \t\r\n]+/g, ' ');
        if (!cur) { if (!t.replace(/ /g, '')) continue; startPara({}); }
        cur.runs.push({ text: t, font: f });
        continue;
      }
      const tag = c.tag.replace(/^.*:/, '');
      const st = parseStyle(c.attrs?.style);
      if (tag === 'p' || tag === 'div' || tag === 'li') {
        startPara(st);
        walk(c, runFont(f, st), false);
        cur = null;
      } else if (tag === 'br') {
        if (!cur) startPara({});
        cur.runs.push({ br: true, font: f });
      } else if (tag === 'span' && st['xfa-tab-count'] !== undefined) {
        // SAP's migration writes every ",," as its own <span style="xfa-tab-count : 1 ;"/>
        if (!cur) startPara({});
        const k = Math.max(1, Math.min(20, Number(st['xfa-tab-count']) || 1));
        for (let i = 0; i < k; i++) cur.runs.push({ tab: true, text: '', font: runFont(f, st) });
        walk(c, runFont(f, st), hard);
      } else if (tag === 'span' && (c.attrs['xfa:embed'] || c.attrs.embed)) {
        if (!cur) startPara({});
        cur.runs.push({ text: lookup(String(c.attrs['xfa:embed'] || c.attrs.embed)), font: runFont(f, st), embed: true });
      } else if (tag === 'b') walk(c, { ...runFont(f, st), bold: true }, hard);
      else if (tag === 'i') walk(c, { ...runFont(f, st), italic: true }, hard);
      else walk(c, runFont(f, st), hard || /yes/i.test(st['xfa-spacerun'] || ''));
    }
  };
  walk(body, font, false);
  // a collapsible blank right before a kept blank, or right after another blank, goes
  // (ADS: "Page<spacerun> </spacerun>⏎#page" prints two blanks, "#count⏎<spacerun> </spacerun>⏎" one)
  for (const p of paras) {
    const texts = p.runs.filter((r) => r.text);
    texts.forEach((r, i) => {
      const next = texts[i + 1];
      if (next && /^ /.test(next.text)) r.text = r.text.replace(/ +$/, '');
      const prev = texts[i - 1];
      if (prev && / $/.test(prev.text)) r.text = r.text.replace(/^ +/, '');
    });
  }
  // trim the collapsible blanks HTML white space adds at paragraph starts / ends
  for (const p of paras) {
    while (p.runs.length && !p.runs[0].br && !p.runs[0].embed && !p.runs[0].tab && !p.runs[0].text.replace(/ /g, '')) p.runs.shift();
    if (p.runs[0] && p.runs[0].text) p.runs[0] = { ...p.runs[0], text: p.runs[0].text.replace(/^ +/, '') };
    const l = p.runs[p.runs.length - 1];
    if (l && l.text) p.runs[p.runs.length - 1] = { ...l, text: l.text.replace(/ +$/, '') };
  }
  void para;
  return paras;
}

/** Drop the blanks a line ends with (they neither print nor count for alignment). */
function trimTail(line) {
  const last = line.runs[line.runs.length - 1];
  if (!last || last.br) return;
  const t = last.text.replace(/[  ]+$/, '');
  if (t !== last.text) {
    line.w -= textWidthMm(last.text.slice(t.length), last.font.pt, { bold: last.font.bold, face: last.font.face });
    if (t) last.text = t; else line.runs.pop();
  }
}

/** Break paragraphs into lines for a width: [{ runs: [{ text, font }], w, para }] */
function wrapParagraphs(paras, width0, wrap) {
  const lines = [];
  for (const p of paras) {
    const st = p.st || {};
    const width = width0 - (st['margin-left'] ? unit(st['margin-left']) : 0) - (st['margin-right'] ? unit(st['margin-right']) : 0);
    let line = { runs: [], w: 0, para: p, first: true };
    const push = () => { lines.push(line); line = { runs: [], w: 0, para: p, first: false }; };
    for (const r of p.runs) {
      line.font0 = line.font0 || r.font;
      if (r.br) { trimTail(line); push(); line.font0 = r.font; continue; }
      if (r.tab) {
        // the tab takes the room up to the next stop (exact alignment of right / centre / decimal stops is done
        // when the line is placed); past the last stop the default distance
        const stop = (p.tabs || []).find((t) => t.pos > line.w + 0.01);
        const pos = stop ? stop.pos : (Math.floor(line.w / DEFAULT_TAB) + 1) * DEFAULT_TAB;
        const tw = Math.max(0, pos - line.w);
        line.runs.push({ tab: true, text: '', font: r.font, stop: stop || { align: 'left', pos, dflt: true } });
        line.w += tw;
        continue;
      }
      const words = String(r.text).split(/( +)/);
      for (const w of words) {
        if (w === '') continue;
        const ww = textWidthMm(w, r.font.pt, { bold: r.font.bold, face: r.font.face });
        const space = /^ +$/.test(w);
        if (wrap && !space && line.w + ww > width + 0.01 && line.w > 0) {
          // drop trailing blanks of the full line
          trimTail(line);
          push();
        }
        if (space && line.w === 0 && !line.first) continue;
        if (wrap && !space && ww > width + 0.01 && line.w === 0) {
          // a word longer than the line breaks by characters
          let chunk = '';
          for (const ch of w) {
            const cw = textWidthMm(chunk + ch, r.font.pt, { bold: r.font.bold, face: r.font.face });
            if (cw > width && chunk) { line.runs.push({ text: chunk, font: r.font }); line.w += textWidthMm(chunk, r.font.pt, { bold: r.font.bold, face: r.font.face }); push(); chunk = ch; } else chunk += ch;
          }
          if (chunk) { line.runs.push({ text: chunk, font: r.font }); line.w += textWidthMm(chunk, r.font.pt, { bold: r.font.bold, face: r.font.face }); }
          continue;
        }
        const prev = line.runs[line.runs.length - 1];
        if (prev && !prev.tab && prev.font === r.font && !!prev.embed === !!r.embed) prev.text += w; else line.runs.push({ text: w, font: r.font, ...(r.embed ? { embed: true } : {}) });
        line.w += ww;
      }
    }
    trimTail(line);
    lines.push(line);
  }
  return lines;
}

// ── measuring and drawing of fields / draws ────────────────────────────────────────────
function valueInfo(t) {
  const v = prop(t, 'value');
  const c = kids(v)[0];
  if (!c) return { type: 'text' };
  const type = c.tag;
  return { type, el: c, fracDigits: c.attrs?.fracDigits !== undefined ? Number(c.attrs.fracDigits) : undefined, maxChars: c.attrs?.maxChars !== undefined ? Number(c.attrs.maxChars) : undefined };
}

function pictureOf(t, which = 'format') {
  const p = prop(prop(t, which), 'picture');
  return p ? textOf(p).trim() : '';
}

function uiOf(t) {
  const ui = prop(t, 'ui');
  const w = kids(ui).find((c) => c.tag !== 'picture' && c.tag !== 'extras');
  return { kind: w?.tag || 'textEdit', multiLine: attr(w, 'multiLine', '0') === '1', el: w, comb: prop(w, 'comb') };
}

function captionOf(t, ids, lookup) {
  const c = prop(t, 'caption');
  if (!c || attr(c, 'presence', 'visible') !== 'visible') return null;
  const v = prop(c, 'value');
  const ve = kids(v)[0];
  const font = prop(c, 'font') ? fontOf(c) : fontOf(t);
  const para = prop(c, 'para') ? paraOf(c) : { ...paraOf({ children: [] }), vAlign: 'top' };
  let paras;
  if (ve?.tag === 'exData') {
    const body = kids(ve).find((x) => /body$/.test(x.tag)) || ve;
    paras = richParagraphs(body, font, para, lookup);
  } else paras = [{ runs: [{ text: textOf(ve), font }], st: {} }];
  return { placement: attr(c, 'placement', 'left'), reserve: attr(c, 'reserve') !== undefined ? unit(attr(c, 'reserve')) : null, font, para, paras, margin: marginOf(c) };
}

/** The content (paragraphs) of a field or draw; '' when nothing prints. */
function contentOf(n, ctx) {
  const t = n.t;
  const font = fontOf(t);
  const para = paraOf(t);
  const vi = valueInfo(t);
  const lookup = ctx.lookupEmbed;
  if (vi.type === 'image') return { image: true, vi, data: n.kind === 'field' && n.data ? n.data.value : undefined };
  if (vi.type === 'exData' && !(n.kind === 'field' && n.data && !n.data.rich && n.data.value !== undefined)) {
    let body = kids(vi.el).find((x) => /body$/.test(x.tag));
    if (n.kind === 'field' && n.data?.rich) return { paras: dataParagraphs(n.data.rich, font), font, para, vi, rich: true };
    if (n.over.rawValue !== undefined) return { paras: [{ runs: [{ text: String(n.over.rawValue), font }], st: {} }], font, para, vi };
    if (!body) return { paras: [], font, para, vi };
    return { paras: richParagraphs(body, font, para, (ref) => lookup(ref, n)), font, para, vi };
  }
  let raw;
  if (n.over.rawValue !== undefined) raw = n.over.rawValue;
  else if (n.kind === 'field' && n.data) raw = n.data.rich ? n.data.rich.map((p) => p.text).join('\n') : n.data.value;
  else raw = vi.el ? textOf(vi.el) : '';
  if (n.kind === 'field' && n.data?.image) return { image: true, vi, data: n.data.value };
  let text;
  if (n.kind === 'draw') text = String(raw ?? '');
  else {
    const type = vi.type === 'text' || vi.type === 'exData' ? 'text' : vi.type;
    const pic = n.over.picture ?? pictureOf(t, 'format');
    text = formatValue(raw, { type, picture: pic, fracDigits: vi.fracDigits, locale: ctx.locale });
    if (vi.maxChars > 0 && text.length > vi.maxChars) text = text.slice(0, vi.maxChars);
  }
  const paras = String(text).split(/\r?\n/).map((s) => ({ runs: [{ text: s, font }], st: {} }));
  return { paras, font, para, vi, text };
}

/** Lines and block height of content for an inner width. */
function shapeText(content, width, multi, factor = VMETRICS.line) {
  const { font, para } = content;
  const lines = wrapParagraphs(content.paras, Math.max(0, width - para.marginLeft - para.marginRight), multi);
  const fpt = (l) => (l.runs.length ? Math.max(...l.runs.map((r) => r.font.pt)) : (l.font0?.pt ?? font.pt));
  const face = (l) => (l.runs[0]?.font || l.font0 || font).face;
  let h = 0;
  const out = [];
  lines.forEach((l, i) => {
    const pt = fpt(l);
    // Arial (TrueType) lines are 1.15 em; the PDF standard Helvetica (Type 1, no line gap) 1.2 em
    const st = l.para.st || {};
    // a paragraph's own CSS line-height (SAP's migration: the SmartStyle line spacing) wins
    const lh = st['line-height'] && unit(st['line-height'], 0) > 0 ? unit(st['line-height'])
      : para.lineHeight > 0 ? para.lineHeight : (/^helvetica$/i.test(face(l)) ? 1.2 : factor) * pt * PT;
    const above = l.first ? (st['margin-top'] ? unit(st['margin-top']) : 0) + (st['space-before'] ? unit(st['space-before']) : 0) + (i > 0 || para.spaceAbove ? para.spaceAbove : 0) : 0;
    h += above;
    out.push({ ...l, pt, top: h, lh });
    h += lh;
    const lastOfPara = i === lines.length - 1 || lines[i + 1].para !== l.para;
    if (lastOfPara) {
      h += (st['margin-bottom'] ? unit(st['margin-bottom']) : 0) + (st['space-after'] ? unit(st['space-after']) : 0);
      h += para.spaceBelow;
    }
  });
  // spacing after the last paragraph: part of the height, not of the text block
  const last = lines[lines.length - 1];
  const after = last ? para.spaceBelow + (last.para.st?.['margin-bottom'] ? unit(last.para.st['margin-bottom']) : 0) + (last.para.st?.['space-after'] ? unit(last.para.st['space-after']) : 0) : 0;
  return { lines: out, h, after };
}

/** Height of a text block: line steps to the last line, which counts to its descent only. */
function blockHeight(shape) {
  const lines = shape?.lines || [];
  if (!lines.length) return 0;
  const last = lines[lines.length - 1];
  return shape.h - (shape.after || 0) - last.lh + (VMETRICS.ascent + VMETRICS.descent) * last.pt * PT;
}

/** XFA template version of a template element (xmlns …/xfa-template/2.1/ → 2.1). */
function templateVersion(t) {
  const m = /xfa-template\/(\d+)\.(\d+)/.exec(String(t?.attrs?.xmlns || ''));
  return m ? Number(m[1]) + Number(m[2]) / 10 : 2.8;
}

/** Pixel size and type of a base64 image (JPEG, PNG, BMP, GIF); null when unknown. */
export function imageSize(b64) {
  let b;
  try { b = Buffer.from(String(b64 || ''), 'base64'); } catch { return null; }
  if (b.length < 26) return null;
  if (b[0] === 0x89 && b[1] === 0x50) return { mime: 'image/png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0x42 && b[1] === 0x4d) return { mime: 'image/bmp', w: Math.abs(b.readInt32LE(18)), h: Math.abs(b.readInt32LE(22)) };
  if (b[0] === 0x47 && b[1] === 0x49) return { mime: 'image/gif', w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const mk = b[i + 1];
      if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { mime: 'image/jpeg', w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Where an image goes in its box: aspect fit (default, top-left), width, height, none (stretch), actual (72 dpi). */
function imageBox(data, aspect, x, y, w, h) {
  const sz = imageSize(data);
  if (!sz || !sz.w || !sz.h || aspect === 'none') return { x, y, w, h };
  const r = sz.w / sz.h;
  if (aspect === 'actual') return { x, y, w: sz.w * PT, h: sz.h * PT };
  if (aspect === 'width') return { x, y, w, h: w / r };
  if (aspect === 'height') return { x, y, w: h * r, h };
  const k = Math.min(w / sz.w, h / sz.h);
  return { x, y, w: sz.w * k, h: sz.h * k };
}

function edgeItems(x, y, w, h, border, items) {
  if (!border) return;
  const e = border.edges;
  const r = Math.min(border.radius || 0, w / 2, h / 2);
  if (border.fill) items.push({ type: 'rect', x, y, w, h, fill: border.fill, ...(r > 0 ? { r } : {}) });
  if (e.every((v) => v && v.th === e[0].th && v.color === e[0].color)) {
    items.push({ type: 'rect', x, y, w, h, stroke: e[0].color, th: e[0].th, ...(r > 0 ? { r } : {}) });
    return;
  }
  const [top, right, bottom, left] = e;
  if (top) items.push({ type: 'line', x1: x - top.th / 2, y1: y, x2: x + w + top.th / 2, y2: y, th: top.th, color: top.color });
  if (right) items.push({ type: 'line', x1: x + w, y1: y - right.th / 2, x2: x + w, y2: y + h + right.th / 2, th: right.th, color: right.color });
  if (bottom) items.push({ type: 'line', x1: x - bottom.th / 2, y1: y + h, x2: x + w + bottom.th / 2, y2: y + h, th: bottom.th, color: bottom.color });
  if (left) items.push({ type: 'line', x1: x, y1: y - left.th / 2, x2: x, y2: y + h + left.th / 2, th: left.th, color: left.color });
}

// ── layout engine ──────────────────────────────────────────────────────────────────────
class Layout {
  constructor(template, record, opts) {
    this.template = template;
    this.record = record;
    this.locale = opts.locale || 'en_US';
    this.ids = collectIds(template);
    this.report = { approximations: [], unbound: [], overflow: [], pages: 0 };
    this.lookupEmbed = (ref, n) => this.embed(ref, n);
    this.version = templateVersion(template);
    this.legacy = this.version < 2.4;
  }

  embed(ref, n) {
    const r = String(ref);
    const id = r.replace(/^#/, '');
    const hit = (!r.startsWith('#') && this.somFind(r, n)) || this.byTemplateId?.get(id) || this.findField(id, n);
    if (!hit) return '';
    if (hit.over.rawValue !== undefined) return String(hit.over.rawValue);
    const c = contentOf(hit, this);
    return c.text ?? '';
  }

  /** A relative SOM path (SAP's migration: <span xfa:embed="WA_BOOKING.FORCURAM"/>) from the node's parent up. */
  somFind(path, from) {
    const segs = String(path).replace(/^\$\.?/, '').split('.').filter(Boolean).map((sg) => {
      const m = /^([^[\]]+)(?:\[(\d+)\])?$/.exec(sg);
      return m ? { name: m[1], idx: m[2] === undefined ? 0 : Number(m[2]) } : null;
    });
    if (!segs.length || segs.some((sg) => !sg)) return null;
    for (let p = from?.parent; p; p = p.parent) {
      let cur = p;
      for (const sg of segs) {
        const hits = (cur.children || []).filter((c) => c.name === sg.name);
        cur = hits[sg.idx] || null;
        if (!cur) break;
      }
      if (cur && cur !== p) return cur;
    }
    return null;
  }

  findField(id, from) {
    const target = this.ids.get(id);
    if (!target) return null;
    let best = null;
    const walk = (n) => { if (n.t === target || n.t?.attrs?.id === id) best = best || n; for (const c of n.children) walk(c); };
    // prefer the instance on the same page (master fields)
    if (from?.page) walk({ children: from.page.masters, t: null });
    if (!best && this.form) walk(this.form);
    return best;
  }

  /** Line pitch factor: legacy (XFA 2.1) text and plain field values 1.15 em, other text (draws, rich text,
   *  captions) of newer templates 1.1376 em — both measured on SAP's PDFs. */
  pitch(n, content) {
    if (this.legacy) return VMETRICS.line;
    return n.kind === 'field' && !content?.rich ? VMETRICS.line : VMETRICS.richLine;
  }

  /** Size of a node for an available width: { w, h } (and per-kind data on the node). */
  measure(n, availW) {
    const t = n.t;
    if (n.presence === 'hidden' || n.presence === 'inactive') { n.w = 0; n.h = 0; n.gone = true; return n; }
    n.gone = false;
    const m = marginOf(t);
    n.margin = m;
    n.border = borderOf(t);
    const fixedW = attr(t, 'w') !== undefined ? unit(attr(t, 'w')) : null;
    const fixedH = attr(t, 'h') !== undefined ? unit(attr(t, 'h')) : null;
    const minH = unit(attr(t, 'minH'), 0), maxH = attr(t, 'maxH') !== undefined ? unit(attr(t, 'maxH')) : Infinity;
    const minW = unit(attr(t, 'minW'), 0), maxW = attr(t, 'maxW') !== undefined ? unit(attr(t, 'maxW')) : Infinity;
    if (n.kind === 'field' || n.kind === 'draw') {
      const cap = n.kind === 'field' || prop(t, 'caption') ? captionOf(t, this.ids, (ref) => this.embed(ref, n)) : null;
      const ui = uiOf(t);
      const content = contentOf(n, this);
      n.content = content; n.caption = cap; n.ui = ui;
      const um = marginOf(ui.el);
      n.uiMargin = um;
      const capW = cap && (cap.placement === 'left' || cap.placement === 'right') ? (cap.reserve ?? 0) : 0;
      const capH = cap && (cap.placement === 'top' || cap.placement === 'bottom') ? (cap.reserve ?? (cap.font.pt * PT * VMETRICS.line)) : 0;
      let w = fixedW ?? availW ?? 0;
      const multi = n.kind === 'draw' ? true : ui.multiLine || !!content.rich;
      if (fixedW === null && !content.image) {
        // growable width: the text's own width
        const one = shapeText(content, Infinity, false, this.pitch(n, content));
        const tw = Math.max(0, ...one.lines.map((l) => l.w));
        w = Math.min(maxW, Math.max(minW, tw + m.l + m.r + capW + um.l + um.r + content.para.marginLeft + content.para.marginRight));
      }
      const innerW = w - m.l - m.r - capW - um.l - um.r;
      if (!content.image) { n.shape = shapeText(content, innerW, multi, this.pitch(n, content)); n.shape.rich = !!content.rich; }
      let h = fixedH;
      if (h === null) {
        // grown height: the text block (last line to its descent), plus the line gap a plain multi-line field starts with
        const lead = n.kind === 'field' && ui.multiLine && !content.rich && n.shape?.lines.length ? VMETRICS.gap * n.shape.lines[0].pt * PT : 0;
        const textH = content.image ? 0 : this.legacy ? n.shape.h + (n.kind === 'field' ? 2 * LEGACY_VINSET : 0) : blockHeight(n.shape) + lead + (n.shape?.after || 0);
        h = Math.min(maxH, Math.max(minH, textH + m.t + m.b + capH + um.t + um.b));
      }
      n.w = w; n.h = h;
      return n;
    }
    // containers
    const layout = attr(t, 'layout', 'position');
    n.layout = layout;
    const all = flowKids(n);
    const vis = all.filter((c) => c.presence !== 'hidden' && c.presence !== 'inactive');
    for (const c of all) if (!vis.includes(c)) this.measure(c, 0);
    let w = fixedW;
    const innerAvail = (w ?? availW ?? 0) - m.l - m.r;
    if (layout === 'table') {
      const cols = String(attr(t, 'columnWidths', '')).trim().split(/\s+/).filter(Boolean).map((v) => (v === '-1' ? -1 : unit(v)));
      n.cols = cols;
      let y = 0;
      for (const row of vis) {
        this.measureRow(row, cols, innerAvail);
        row.rx = 0; row.ry = y;
        y += row.h;
      }
      const cw = cols.reduce((s, v) => s + Math.max(0, v), 0);
      if (w === null) w = Math.max(minW, cw + m.l + m.r);
      n.contentH = y;
    } else if (layout === 'row') {
      this.measureRow(n, n.parentCols || [], innerAvail);
      return n;
    } else if (layout === 'tb' || layout === 'lr-tb' || layout === 'rl-tb') {
      let y = 0, maxw = 0;
      for (const c of vis) {
        this.measure(c, innerAvail);
        c.rx = attr(c.t, 'x') !== undefined && layout !== 'tb' ? unit(attr(c.t, 'x')) : 0;
        c.ry = y;
        y += c.h;
        maxw = Math.max(maxw, c.w);
      }
      if (w === null) w = Math.max(minW, Math.min(maxW, maxw + m.l + m.r));
      n.contentH = y;
    } else {
      // positioned
      let maxx = 0, maxy = 0;
      for (const c of vis) {
        this.measure(c, attr(c.t, 'w') !== undefined ? unit(attr(c.t, 'w')) : innerAvail);
        const [ax, ay] = this.anchor(c);
        c.rx = ax; c.ry = ay;
        maxx = Math.max(maxx, ax + c.w);
        maxy = Math.max(maxy, ay + c.h);
      }
      if (w === null) w = Math.max(minW, Math.min(maxW, maxx + m.l + m.r));
      n.contentH = maxy;
    }
    n.w = w;
    n.h = fixedH ?? Math.min(maxH, Math.max(minH, n.contentH + m.t + m.b));
    return n;
  }

  /** x / y of a positioned child, after its anchor point. */
  anchor(c) {
    const x = unit(attr(c.t, 'x'), 0), y = unit(attr(c.t, 'y'), 0);
    const a = attr(c.t, 'anchorType', 'topLeft');
    const dx = /Center$/.test(a) ? -c.w / 2 : /Right$/.test(a) ? -c.w : 0;
    const dy = /^middle/.test(a) ? -c.h / 2 : /^bottom/.test(a) ? -c.h : 0;
    return [x + dx, y + dy];
  }

  measureRow(row, cols, avail) {
    const t = row.t;
    const m = marginOf(t);
    row.margin = m;
    row.border = borderOf(t);
    row.layout = 'row';
    const all = flowKids(row);
    const vis = all.filter((c) => c.presence !== 'hidden' && c.presence !== 'inactive');
    for (const c of all) if (!vis.includes(c)) this.measure(c, 0);
    let x = 0, ci = 0, h = 0;
    for (const c of vis) {
      const span = Number(attr(c.t, 'colSpan', '1'));
      let cw = 0;
      const take = span < 0 ? cols.length - ci : span;
      for (let k = 0; k < take && ci < cols.length; k++, ci++) cw += Math.max(0, cols[ci]);
      if (!take || ci > cols.length) cw = c.w || 0;
      // a cell takes its column's width
      const saved = c.t.attrs.w;
      c.t = { ...c.t, attrs: { ...c.t.attrs, w: `${cw}mm` } };
      this.measure(c, cw);
      c.t = { ...c.t, attrs: { ...c.t.attrs, w: saved } };
      c.w = cw;
      c.rx = x; c.ry = 0;
      x += cw;
      h = Math.max(h, c.h);
    }
    // every cell grows to the row height
    for (const c of vis) c.h = h;
    row.w = attr(t, 'w') !== undefined ? unit(attr(t, 'w')) : x + m.l + m.r;
    row.h = h + m.t + m.b;
    row.contentH = h;
    return row;
  }

  // ── drawing ──
  draw(n, ox, oy, items, page) {
    if (n.gone) return;
    const x = ox, y = oy;
    n.page = page;
    if (n.kind === 'field' || n.kind === 'draw') return this.drawContent(n, x, y, items);
    if (n.presence !== 'invisible') edgeItems(x, y, n.w, n.h, n.border, items);
    const m = n.margin || { l: 0, t: 0 };
    for (const c of flowKids(n)) {
      if (c.gone || c.rx === undefined) continue;
      this.draw(c, x + m.l + c.rx, y + m.t + c.ry, items, page);
    }
  }

  drawContent(n, x, y, items) {
    const invisible = n.presence === 'invisible';
    const m = n.margin;
    if (!invisible) edgeItems(x, y, n.w, n.h, n.border, items);
    let cx = x + m.l, cy = y + m.t, cw = n.w - m.l - m.r, ch = n.h - m.t - m.b;
    const cap = n.caption;
    if (cap && !invisible) {
      const r = cap.reserve ?? 0;
      let box;
      if (cap.placement === 'left') { box = [cx, cy, r, ch]; cx += r; cw -= r; }
      else if (cap.placement === 'right') { box = [cx + cw - r, cy, r, ch]; cw -= r; }
      else if (cap.placement === 'top') { box = [cx, cy, cw, r]; cy += r; ch -= r; }
      else { box = [cx, cy + ch - r, cw, r]; ch -= r; }
      if (r > 0 || cap.placement === 'top' || cap.placement === 'bottom') {
        const cm = cap.margin;
        const shape = shapeText({ paras: cap.paras, font: cap.font, para: cap.para }, box[2] - cm.l - cm.r, true, this.legacy ? VMETRICS.line : VMETRICS.richLine);
        this.placeLines(shape, { ...cap.para }, box[0] + cm.l, box[1] + cm.t, box[2] - cm.l - cm.r, box[3] - cm.t - cm.b, items, n, true, true);
      }
    } else if (cap && invisible) {
      const r = cap.reserve ?? 0;
      if (cap.placement === 'left') { cx += r; cw -= r; } else if (cap.placement === 'right') cw -= r;
      else if (cap.placement === 'top') { cy += r; ch -= r; } else ch -= r;
    }
    const um = n.uiMargin || { l: 0, t: 0, r: 0, b: 0 };
    cx += um.l; cy += um.t; cw -= um.l + um.r; ch -= um.t + um.b;
    if (invisible) return;
    const uiBorder = borderOf(n.ui?.el);
    if (uiBorder) edgeItems(cx - um.l, cy - um.t, cw + um.l + um.r, ch + um.t + um.b, uiBorder, items);
    if (n.content.image) {
      const data = n.content.data ?? this.imageData(n);
      if (data || n.content.vi.el?.attrs?.href) {
        const ar = attr(n.content.vi.el, 'aspect', 'fit');
        const box = imageBox(data, ar, cx, cy, cw, ch);
        items.push({ type: 'image', x: box.x, y: box.y, w: box.w, h: box.h, aspect: ar, data: data || '', href: n.content.vi.el?.attrs?.href || '', mime: attr(n.content.vi.el, 'contentType', n.data?.mime || '') , som: this.som(n) });
      }
      return;
    }
    const multi = n.kind === 'draw' ? true : n.ui.multiLine || !!n.content.rich;
    this.placeLines(n.shape, n.content.para, cx, cy, cw, ch, items, n, multi);
  }

  imageData(n) {
    const el = n.content.vi.el;
    const t = el ? textOf(el).replace(/\s+/g, '') : '';
    return t;
  }

  placeLines(shape, para, cx, cy, cw, ch, items, n, multi, caption = false) {
    if (!shape || !shape.lines.length) return;
    const lines = shape.lines;
    const first = lines[0];
    const em = first.pt * PT;
    let asc = VMETRICS.ascent * em;
    let top;
    if (this.legacy) {
      // XFA 2.1 (Designer 6 forms): whole 1.15 em line boxes, baseline a line gap plus the ascent below the box
      // top; a field's value and caption sit 1/8 em lower still (measured on SAP's PDFs)
      const blockH = shape.h - (shape.after || 0);
      asc = (VMETRICS.gap + VMETRICS.ascent) * em + (n?.kind === 'field' ? 0.125 * em : 0);
      // a legacy field value keeps 1/32 inch above and below: centred text does not move, text that fills or
      // overflows its box starts 1/32 inch lower (measured: rows and a grown rich-text field, 10 pt and 6 pt)
      if (n?.kind === 'field' && !caption) { cy += LEGACY_VINSET; ch -= 2 * LEGACY_VINSET; }
      if (para.vAlign === 'middle') top = cy + Math.max(0, (ch - blockH) / 2);
      else if (para.vAlign === 'bottom') top = cy + Math.max(0, ch - blockH);
      else top = cy;
    } else {
      // XFA 2.4+: one line = ascent + descent; a plain multi-line field starts one line gap lower
      const blockH = blockHeight(shape);
      const lead = n?.kind === 'field' && n.ui?.multiLine && !shape.rich && !caption ? VMETRICS.gap * em : 0;
      // text taller than its box starts at the top (measured: a two-line caption in a smaller reserve)
      if (para.vAlign === 'middle') top = cy + Math.max(0, (ch - blockH) / 2);
      else if (para.vAlign === 'bottom') top = cy + Math.max(0, ch - blockH);
      else top = cy + lead;
    }
    // legacy fields keep their value 1 pt off the left and right edge
    if (this.legacy && n?.kind === 'field' && !caption) { cx += PT; cw -= 2 * PT; }
    const som = this.som(n);
    // labels for the score: a field value (or a line with embedded field values), a repeated row
    const row = repeated(n);
    for (const l of lines) {
      const role = (n?.kind === 'field' && !caption) || l.runs.some((r) => r.embed) ? 'field' : 'fixed';
      const text = l.runs.map((r) => r.text).join('');
      if (!text.trim()) continue;
      const baseline = top + l.top + (l === first ? asc : (this.legacy ? asc / em * l.pt * PT : VMETRICS.ascent * l.pt * PT));
      const pst = l.para.st || {};
      const pml = pst['margin-left'] ? unit(pst['margin-left']) : 0, pmr = pst['margin-right'] ? unit(pst['margin-right']) : 0;
      const avail = cw - para.marginLeft - para.marginRight - pml - pmr - (l.first ? para.textIndent : 0);
      let x = cx + para.marginLeft + pml + (l.first ? para.textIndent : 0);
      const left0 = x;
      const lead0 = l.runs[0]?.text.match(/^ */)[0] || '';
      const lw = l.w;
      const st = l.para.st || {};
      const align = st['text-align'] || para.hAlign;
      if (align === 'right') x += avail - lw;
      else if (align === 'center') x += (avail - lw) / 2;
      else if (align === 'radix') {
        // the radix point sits radixOffset from the right edge; the integer part ends there
        const s = text;
        const ri = s.indexOf('.');
        const intPart = ri < 0 ? s : s.slice(0, ri);
        const f0 = l.runs[0].font;
        x = cx + cw - para.radixOffset - textWidthMm(intPart, f0.pt, { bold: f0.bold, face: f0.face });
      }
      let rx = x;
      const merged = [];
      for (const r of l.runs) {
        const prev = merged[merged.length - 1];
        if (r.tab) { merged.push({ tab: true, text: '', font: r.font, stop: r.stop }); continue; }
        if (prev && !prev.tab && prev.font.pt === r.font.pt && !!prev.font.hidden === !!r.font.hidden && (prev.font.valign || '') === (r.font.valign || '') && prev.font.bold === r.font.bold && prev.font.italic === r.font.italic && prev.font.face === r.font.face && prev.font.color === r.font.color && !!prev.font.underline === !!r.font.underline) prev.text += r.text;
        else merged.push({ text: r.text, font: r.font });
      }
      for (let mi = 0; mi < merged.length; mi++) {
        const r = merged[mi];
        if (r.tab) {
          // the text up to the next tab is aligned on the stop: left starts, right / centre end / centre there,
          // decimal puts the radix there; text already past a stop is not pulled back
          const seg = [];
          for (let k = mi + 1; k < merged.length && !merged[k].tab; k++) seg.push(merged[k]);
          const segText = seg.map((q) => q.text).join('');
          const segW = seg.reduce((sum, q) => sum + textWidthMm(q.text, q.font.pt, { bold: q.font.bold, face: q.font.face }), 0);
          const pos = left0 + r.stop.pos;
          let start = pos;
          if (r.stop.align === 'right') start = pos - segW;
          else if (r.stop.align === 'center') start = pos - segW / 2;
          else if (r.stop.align === 'decimal') {
            const ri = segText.search(/[.,](?=\d+\D*$)/);
            const f0 = seg[0]?.font || r.font;
            start = pos - textWidthMm(ri < 0 ? segText.replace(/\s+$/, '') : segText.slice(0, ri), f0.pt, { bold: f0.bold, face: f0.face });
          }
          if (r.stop.dflt) this.report.approximations.push('tab past the last tab stop: default distance 12.7 mm assumed');
          rx = Math.max(rx, start);
          continue;
        }
        const piece = r.text;
        const pw = textWidthMm(piece, r.font.pt, { bold: r.font.bold, face: r.font.face });
        const trimmed = piece.replace(/^ +/, '');
        const skip = piece.length - trimmed.length;
        const sx = rx + textWidthMm(piece.slice(0, skip), r.font.pt, { bold: r.font.bold, face: r.font.face });
        if (r.font.valign) this.report.approximations.push(`${r.font.valign}script text: raised / lowered by 1/3 em (not measured)`);
        const vshift = r.font.valign === 'super' ? -0.33 * r.font.pt * PT : r.font.valign === 'sub' ? 0.2 * r.font.pt * PT : 0;
        if (trimmed.trim() && !r.font.hidden) items.push({ type: 'text', x: sx, y: baseline + vshift, text: trimmed.replace(/ +$/, '').replace(/ /g, ' '), pt: r.font.pt, bold: r.font.bold, italic: r.font.italic, font: r.font.face, color: r.font.color, som, ...(n?.data?.field ? { bind: n.data.field } : {}), role, ...(row ? { row: true } : {}), lines: lines.length });
        if (r.font.underline && trimmed.trim()) {
          // measured on ADS output: 0.09 em below the baseline, 0.033 em thick
          const uw = textWidthMm(trimmed.replace(/[  ]+$/, ''), r.font.pt, { bold: r.font.bold, face: r.font.face });
          items.push({ type: 'line', x1: sx, y1: baseline + 0.09 * r.font.pt * PT, x2: sx + uw, y2: baseline + 0.09 * r.font.pt * PT, th: 0.033 * r.font.pt * PT, color: r.font.color || '#000000' });
        }
        rx += pw;
      }
      void lead0;
    }
  }

  som(n) {
    const parts = [];
    for (let p = n; p; p = p.parent) if (p.name) parts.unshift(`${p.name}[${p.index || 0}]`);
    return parts.join('.');
  }
}

/** Children as the parent's layout sees them: a subformSet is transparent. */
function flowKids(n) {
  const out = [];
  for (const c of n.children) { if (c.kind === 'subformSet') out.push(...flowKids(c)); else out.push(c); }
  return out;
}

/** Inside a repeated instance (a repeatable subform, or an instance after the first)? */
function repeated(n) {
  for (let p = n; p; p = p.parent) {
    if (p.index > 0) return true;
    if ((p.kind === 'subform' || p.kind === 'subformSet') && occurOf(p.t).max !== 1) return true;
  }
  return false;
}

function setParents(n, parent) {
  n.parent = parent;
  for (const c of n.children) setParents(c, n);
}

/** Lay out a form: pagination of the root subform's flowed content into the pageSet's content areas. */
export function layoutForm(template, record, opts = {}) {
  const L = new Layout(template, record, opts);
  const rootT = resolveUse(kids(template, 'subform')[0], L.ids);
  if (!rootT) return { pages: [], report: { ...L.report, error: 'no root subform' } };
  // pageSet: the first one under the root (or nested)
  const pageSet = kids(rootT, 'pageSet')[0];
  const pageAreas = kids(pageSet, 'pageArea').map((p) => resolveUse(p, L.ids));
  if (!pageAreas.length) return { pages: [], report: { ...L.report, error: 'no pageArea' } };
  // the root's data context is the record itself
  // a locale without its own tables formats with en_US patterns — reported, never silent
  if (!LOCALES[L.locale]) L.report.approximations.push(`locale ${L.locale}: no date / number tables here — en_US patterns used`);
  setDataParents(record);
  L.today = opts.today && /^\d{4}-?\d{2}-?\d{2}$/.test(String(opts.today)) ? String(opts.today) : null;
  const form = formNode(rootT, 'subform', record);
  for (const c of kids(rootT)) {
    const cu = resolveUse(c, L.ids);
    if (!CONTAINERS.has(cu.tag) || cu.tag === 'pageSet') continue;
    form.children.push(...mergeContainer(c, record, record, L.ids, L.report));
  }
  setParents(form, null);
  L.form = form;
  if (opts.scripts !== false) runScripts(L, form, 'form', L.report);
  // flowed content of the root, flattened to blocks that can move to the next page
  const blocks = [];
  const flatten = (n, depth) => {
    if (n.kind === 'subformSet') { for (const c of flowKids(n)) flatten(c, depth); return; }
    // a tb subform without own border splits into its children; tables split between rows
    const lay = attr(n.t, 'layout', 'position');
    const br = breakOf(n.t);
    const keep = attr(prop(n.t, 'keep'), 'intact', 'none');
    const splittable = (lay === 'tb' || lay === 'table') && n.kind !== 'field' && n.kind !== 'draw' && keep !== 'contentArea' && keep !== 'pageArea';
    if (splittable && depth < 12) {
      const m = marginOf(n.t);
      blocks.push({ kind: 'open', n, m, br });
      const leaderId = br.overflowLeader ? br.overflowLeader.replace(/^#/, '') : null;
      for (const c of flowKids(n)) flatten(c, depth + 1);
      blocks.push({ kind: 'close', n, m, leaderId });
      return;
    }
    blocks.push({ kind: 'leaf', n, br });
  };
  for (const c of flowKids(form)) flatten(c, 0);
  // pages
  const pages = [];
  let areaIdx = 0;
  const usedOf = new Map();
  const nextPageArea = () => {
    for (let i = areaIdx; i < pageAreas.length; i++) {
      const occ = occurOf(pageAreas[i]);
      const maxOcc = prop(pageAreas[i], 'occur') ? occ.max : -1;
      const used = usedOf.get(i) || 0;
      if (maxOcc < 0 || used < maxOcc) { usedOf.set(i, used + 1); areaIdx = i; return pageAreas[i]; }
    }
    usedOf.set(pageAreas.length - 1, (usedOf.get(pageAreas.length - 1) || 0) + 1);
    return pageAreas[pageAreas.length - 1];
  };
  let page = null, area = null, cursor = 0;
  const contentAreaOf = (pa) => {
    const ca = kids(pa, 'contentArea')[0];
    return { x: unit(attr(ca, 'x'), 0), y: unit(attr(ca, 'y'), 0), w: unit(attr(ca, 'w'), 0), h: unit(attr(ca, 'h'), 0) };
  };
  const newPage = () => {
    const pa = nextPageArea();
    const med = prop(pa, 'medium');
    const short = unit(attr(med, 'short', '210mm')), long = unit(attr(med, 'long', '297mm'));
    const landscape = attr(med, 'orientation', 'portrait') === 'landscape';
    page = { pa, w: landscape ? long : short, h: landscape ? short : long, name: attr(pa, 'name', ''), items: [], masters: [], flows: [] };
    pages.push(page);
    area = contentAreaOf(pa);
    cursor = 0;
    page.area = area;
  };
  newPage();
  // ancestors' x offsets / margins while descending into split containers
  const stack = [];
  const openX = () => stack.reduce((s, b) => s + b.m.l, 0);
  const openW = () => area.w - stack.reduce((s, b) => s + b.m.l + b.m.r, 0);
  const leaders = [];
  const placeLeaf = (n) => {
    if (n.presence === 'hidden' || n.presence === 'inactive') { L.measure(n, 0); return; }
    const parent = stack[stack.length - 1];
    const parentLay = parent ? attr(parent.n.t, 'layout', 'position') : 'tb';
    if (parentLay === 'table') {
      n.parentCols = parent.n.cols || String(attr(parent.n.t, 'columnWidths', '')).trim().split(/\s+/).filter(Boolean).map((v) => (v === '-1' ? -1 : unit(v)));
      parent.n.cols = n.parentCols;
      L.measureRow(n, n.parentCols, openW());
    } else L.measure(n, openW());
    const br = breakOf(n.t);
    if (n.over.breakBefore) br.before = n.over.breakBefore;
    if (br.before && /pageArea|contentArea/.test(br.before) && cursor > 0) { newPage(); repeatLeaders(); }
    if (cursor + n.h > area.h + 0.01 && cursor > 0) { newPage(); repeatLeaders(); }
    if (n.h > area.h + 0.01) L.report.overflow.push(L.som(n));
    page.flows.push({ n, x: area.x + openX(), y: area.y + cursor });
    markPage(n, page);
    cursor += n.h;
    if (br.after && /pageArea|contentArea/.test(br.after)) { newPage(); repeatLeaders(); }
  };
  const markPage = (n, p) => { n.page = p; for (const c of n.children) markPage(c, p); };
  const repeatLeaders = () => {
    for (const ld of leaders) {
      if (!ld) continue;
      const parentLay = 'table';
      void parentLay;
      page.flows.push({ n: ld.n, x: area.x + ld.x, y: area.y + cursor, leader: true });
      cursor += ld.n.h;
    }
  };
  for (const b of blocks) {
    if (b.kind === 'open') {
      L.measure(b.n, openW());
      const br = b.br;
      if (br.before && /pageArea|contentArea/.test(br.before) && cursor > 0) { newPage(); repeatLeaders(); }
      stack.push(b);
      cursor += b.m.t;
      b.startPage = pages.length;
      b.startY = cursor;
      b.startX = openX() - b.m.l;
      // the border of a split container is drawn per page piece
      b.pieces = [{ page, y: area.y + cursor - b.m.t }];
      const leaderId = b.br.overflowLeader ? b.br.overflowLeader.replace(/^#/, '') : null;
      b.leaderId = leaderId;
      leaders.push(null);
      continue;
    }
    if (b.kind === 'close') {
      cursor += b.m.b;
      stack.pop();
      leaders.pop();
      b.n.splitBorder = true;
      continue;
    }
    placeLeaf(b.n);
    // the first row with the leader id becomes the repeated leader of its table
    const top = stack[stack.length - 1];
    if (top && top.leaderId && !leaders[leaders.length - 1] && (b.n.t.attrs?.id === top.leaderId || b.n.name === top.leaderId)) {
      leaders[leaders.length - 1] = { n: b.n, x: openX() };
    }
  }
  // borders of containers that flow: one box per page from their first to last leaf
  L.report.pages = pages.length;
  // master content per page, then flows
  pages.forEach((p, i) => {
    p.index = i;
    p.count = pages.length;
    const masters = [];
    for (const c of kids(p.pa)) {
      const cu = resolveUse(c, L.ids);
      if (!CONTAINERS.has(cu.tag) || cu.tag === 'contentArea') continue;
      masters.push(...mergeContainer(c, record, record, L.ids, L.report));
    }
    p.masters = masters;
    const mark = (n) => { n.page = p; for (const c of n.children) mark(c); };
    for (const mn of masters) { setParents(mn, null); mark(mn); }
    // master content runs its initialize / ready $form scripts too (a date set by script in a page header)
    if (opts.scripts !== false) for (const mn of masters) runScripts(L, mn, 'form', L.report);
  });
  if (opts.scripts !== false) runScripts(L, form, 'layout', L.report, pages);
  for (const p of pages) {
    for (const mn of p.masters) {
      L.measure(mn, unit(attr(mn.t, 'w'), 0) || p.w);
      const [ax, ay] = L.anchor(mn);
      L.draw(mn, ax, ay, p.items, p);
    }
    for (const f of p.flows) {
      L.draw(f.n, f.x + (f.n.margin ? 0 : 0), f.y, p.items, p);
    }
  }
  // split container borders (tables): from the first to the last flow of their descendants per page
  const boxes = new Map();
  for (const p of pages) {
    for (const f of p.flows) {
      for (let a = f.n.parent; a; a = a.parent) {
        if (!a.border || a === form) continue;
        const key = `${a.id}|${p.index}`;
        const bx = boxes.get(key) || { a, p, y0: Infinity, y1: -Infinity, x: f.x };
        bx.y0 = Math.min(bx.y0, f.y);
        bx.y1 = Math.max(bx.y1, f.y + f.n.h);
        boxes.set(key, bx);
      }
    }
  }
  for (const bx of boxes.values()) {
    const m = marginOf(bx.a.t);
    const depthX = bx.x - m.l;
    edgeItems(depthX, bx.y0 - m.t, bx.a.w || unit(attr(bx.a.t, 'w'), 0), bx.y1 - bx.y0 + m.t + m.b, bx.a.border, bx.p.items);
  }
  return { pages: pages.map((p) => ({ w: p.w, h: p.h, name: p.name, items: p.items })), report: L.report };
}
