#!/usr/bin/env node
// Turn a literal form spec (plan-form.mjs) into a form with data: fixed texts
// replaced by fields, the item rows of a grid made into a loop over an internal
// table, interface parameters and global data added. The decisions come from the
// skill's main thread (which texts are values, which rows are items, which DDIC
// types carry them); this script only applies them.
//
//   node shape-form.mjs <spec.json> <shape.json> [--out spec.json]
//
// shape.json:
// { interface?: [{ name, type, typing?, optional? }], tables?: [...], globals?: [{ name, type }],
//   fields?: [{ text: "4500000001", to: "&IS_HEAD-EBELN&", window?: "%TEXTWIN3", all?: false }],
//   items?: [{ window: "%WINDOW2", rows: [from, to], data: "IT_ITEMS", into: "GS_ITEM",
//              cells: { "1": "&GS_ITEM-POSNR&", "3": "&GS_ITEM-MATNR&" } }],
//   conditions?: [{ text: "Remark : &IS_HEAD-VBELF_ORG&", window?, cond: [{ op1: "IS_HEAD-CRDRF", cop: "EQ", op2: "'C'" }] }],
//   graphics?: [{ window: "%GRAPHIC1", name: "ZLOGO", btype?: "BCOL", resolution? }] }
// items: rows from..to of the template in `window` (1-based) are the printed item
// lines. The first of them becomes a one-row template inside a loop over `data`
// (read into `into`) — it keeps the source's fixed row height, which a table row
// would not (a table row is as high as its text). The template rows above and
// below stay templates printed before / after the loop. The window becomes the
// MAIN window, so the items flow onto further pages.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// the literal of a text line without its character format tags and <(> protections
const plainOf = (t) => String(t).replace(/<\(>(.)<\)>/g, '$1').replace(/<\/?[A-Z0-9]{0,2}>/g, '');
// a field in place of a line's text, in the character format the planner chose
const withField = (line, field) => {
  const m = /^<([A-Z0-9]{1,2})>.*<\/>$/.exec(line.t);
  line.t = m ? `<${m[1]}>${field}</>` : field;
};

function eachText(spec, fn) {
  for (const w of spec.windows) {
    for (const n of w.nodes || []) {
      if (n.kind === 'text') fn(n, w);
      else if (n.kind === 'template') for (const c of n.cells || []) for (const t of c.nodes || []) fn(t, w, c);
    }
  }
}

// ── items over free texts (no ruled grid) ─────────────────────────────────────
// textItems: { header?: [top, bottom], items: [top, bottom], count, footer?: [top, bottom],
//              data, into, cells: [{ text, x?, to }] }   (mm, page coordinates)
// The one-text windows in each band become a borderless template: a row per text top,
// per row a cell per text — where the text's alignment needs it (a left text from its
// left edge, a centred one around its centre, a right one up to its right edge), at
// least as wide as it prints; filler cells between. Of the item band only the first of
// `count` equal items is kept, as the template of a loop over `data`; `cells` turn its
// texts into fields (to: "" leaves the cell empty). header / loop / footer go into one
// MAIN window, so the footer moves down with the items.
function textItems(out, it) {
  const one = (w) => w.nodes?.length === 1 && w.nodes[0].kind === 'text' && w.type !== 'M';
  const inBand = (b) => (w) => one(w) && w.y >= b[0] - 0.05 && w.y < b[1] - 0.05;
  const take = (b) => (b ? out.windows.filter(inBand(b)) : []);
  const pitch = (it.items[1] - it.items[0]) / (it.count || 1);
  // a sample text mapped to "" prints nothing: it neither gets a cell nor narrows its neighbours
  const dropped = (w) => (it.cells || []).some((c) => c.to === '' && String(c.text).trim() === plainOf(w.nodes[0].lines[0].t).trim());
  const head = take(it.header), items = take([it.items[0], it.items[0] + pitch]).filter((w) => !dropped(w)), foot = take(it.footer);
  const all = take(it.items).concat(head, foot);
  // the interval a text needs in its row
  // the room a text needs: its printed width, the paragraph's indents, and slack — a
  // field's value may run wider than the sample the source shows
  const need = (w) => {
    const t = w.nodes[0], pw = (t.pw || w.w) + (t.ind || 0) + Math.max(1.5, 0.15 * (t.pw || 0));
    if (t.align === 'CENTER') { const c = w.x + w.w / 2; return { a: c - pw / 2, b: c + pw / 2, c, k: 'C' }; }
    if (t.align === 'RIGHT') return { a: w.x + w.w - pw, b: w.x + w.w, k: 'R' };
    return { a: w.x, b: w.x + pw, k: 'L' };
  };
  const ws = [...head, ...items, ...foot];
  const left = Math.min(...ws.map((w) => need(w).a)), right = Math.max(...ws.map((w) => need(w).b));
  const r2 = (v) => Math.round(v * 100) / 100;
  // a band → template rows / cells; mapField(window) → field or undefined
  const template = (list, top, bottom, mapField) => {
    // one row per printed line: texts of other sizes on the same line start a little
    // lower (smaller line spacing) — tops within 2.2 mm share the row (a row thinner
    // than a text's line would not print it)
    const ys = [...new Set(list.map((w) => r2(w.y)))].sort((a, b) => a - b);
    const starts = [];
    for (const y of ys) if (!starts.length || y - starts[starts.length - 1] >= 2.2) starts.push(y);
    const groupOf = (w) => starts.filter((t) => t <= r2(w.y) + 0.05).pop();
    // the row's top is where most of its texts start: a text in another line spacing (no
    // equal format in the styles) is the one that prints a little higher or lower
    const tops = starts.map((s0) => {
      const n = {};
      for (const w of list) if (groupOf(w) === s0) n[r2(w.y)] = (n[r2(w.y)] || 0) + 1;
      return Number(Object.entries(n).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
    });
    const rowOf = (w) => tops[starts.indexOf(groupOf(w))];
    const rowTops = tops.length && tops[0] > top + 0.05 ? [top, ...tops] : tops.length ? tops : [top];
    const rows = [], cells = [];
    rowTops.forEach((y, i) => {
      const h = r2((rowTops[i + 1] ?? bottom) - y);
      const here = list.filter((w) => rowOf(w) === y).map((w) => ({ w, ...need(w) })).sort((p, q) => p.a - q.a);
      // overlapping needs: a left text's start never moves (the cell before it gives way);
      // two others meet half-way
      for (let k = 1; k < here.length; k++) {
        if (here[k].a >= here[k - 1].b) continue;
        if (here[k].k === 'L' || here[k - 1].k === 'L') here[k - 1].b = here[k].a;
        else { const m = (here[k].a + here[k - 1].b) / 2; here[k - 1].b = m; here[k].a = m; }
      }
      // cells grow beyond the sample's width (a wider cell does not move the text, and a
      // longer value still fits): a right text (an amount) to the left up to its neighbour's
      // text first, so that a left text next to it does not take the room; then a left text
      // to the right up to its neighbour
      here.forEach((p, k) => { if (p.k === 'R') p.a = Math.min(p.a, Math.max(here[k - 1]?.b ?? left, left)); });
      here.forEach((p, k) => { if (p.k === 'L') p.b = Math.max(p.b, here[k + 1]?.a ?? right); });
      const cols = [];
      let x = left, col = 0;
      for (const p of here) {
        if (p.a > x + 0.05) { cols.push(r2(p.a - x)); col++; }
        cols.push(r2(p.b - Math.max(x, p.a))); col++;
        const t = JSON.parse(JSON.stringify(p.w.nodes[0]));
        const f = mapField ? mapField(p.w) : undefined;
        if (f !== '') { if (f) withField(t.lines[0], f); t.lines.splice(1); cells.push({ row: i + 1, col, borders: {}, nodes: [t] }); }
        x = Math.max(x, p.b);
      }
      if (right > x + 0.05) cols.push(r2(right - x));
      // every row has the template's width exactly
      const sum = cols.reduce((s, c) => s + c, 0), want = r2(right - left);
      if (cols.length) cols[cols.length - 1] = r2(cols[cols.length - 1] + want - sum);
      rows.push({ h: Math.max(0.1, h), cols: cols.length ? cols : [want], need: Math.max(0, ...here.map((p) => (p.w.nodes[0].ls || 0) + 0.02)) });
    });
    // a cell prints a line only when the whole line fits: a row thinner than its texts'
    // line spacing grows, the rows after it give the difference back (the band keeps its height)
    let owe = 0;
    for (const r of rows) {
      if (r.h < r.need) { owe += r.need - r.h; r.h = r2(r.need); }
      else if (owe > 0) { const give = Math.min(owe, r.h - Math.max(r.need, 0.1)); r.h = r2(r.h - give); owe -= give; }
      delete r.need;
    }
    return { kind: 'template', rows, cells };
  };
  const field = (w) => {
    const plain = plainOf(w.nodes[0].lines[0].t).trim();
    const hits = (it.cells || []).filter((c) => String(c.text).trim() === plain);
    if (!hits.length) return undefined;
    const c = hits.length > 1 && hits.some((h) => h.x !== undefined) ? hits.sort((p, q) => Math.abs((p.x ?? 1e9) - w.x) - Math.abs((q.x ?? 1e9) - w.x))[0] : hits[0];
    return c.to;
  };
  const nodes = [];
  if (it.header) nodes.push(template(head, it.header[0], it.header[1]));
  nodes.push({ kind: 'loop', name: '%ITEMS', data: it.data, into: it.into, nodes: [template(items, it.items[0], it.items[0] + pitch, field)] });
  if (it.footer) nodes.push(template(foot, it.footer[0], it.footer[1]));
  const top = it.header ? it.header[0] : it.items[0];
  const bottom = it.footer ? it.footer[1] : it.items[1];
  // the main window reaches down to the next window below it (page footer texts)
  const below = out.windows.filter((w) => !all.includes(w) && w.type !== 'M' && w.y >= bottom - 0.05 && w.x < right && w.x + w.w > left).map((w) => w.y);
  const pageBottom = Math.min(...below, 287);
  out.windows = out.windows.filter((w) => !all.includes(w) && !(w.type === 'M' && !(w.nodes || []).length));
  out.windows.push({ name: 'MAIN', type: 'M', caption: 'Items', x: r2(left), y: r2(top), w: r2(right - left + 0.5), h: r2(pageBottom - top - 0.5), nodes });
  return { textItems: it.data, header: head.length, itemTexts: items.length, footer: foot.length, removed: all.length - head.length - items.length - foot.length };
}

export function shapeForm(spec, shape) {
  const out = JSON.parse(JSON.stringify(spec));
  const report = { fields: [], items: [], notFound: [] };
  for (const k of ['interface', 'tables', 'globals', 'refFields']) if (shape[k]) out[k] = [...(out[k] || []), ...shape[k]];

  for (const f of shape.fields || []) {
    let hits = 0;
    eachText(out, (t, w) => {
      if (f.window && w.name !== f.window) return;
      if (!f.all && hits) return;
      for (const l of t.lines) {
        if (plainOf(l.t).trim() !== String(f.text).trim()) continue;
        withField(l, f.to);
        hits++;
        if (!f.all) return;
      }
    });
    (hits ? report.fields : report.notFound).push({ text: f.text, to: f.to, hits });
  }

  // a window whose text became a field was as wide as the sample: it grows the way its text
  // is aligned — up to the next window on the line (or the page edge) — so a longer value fits
  const PW = { DINA4: [210, 297], DINA3: [297, 420], DINA5: [148, 210], LETTER: [215.9, 279.4], LEGAL: [215.9, 355.6] }[out.pageFormat] || [210, 297];
  const pageW = out.orientation === 'L' ? PW[1] : PW[0];
  // what a neighbour's text covers (its window may be wider than its text)
  const extent = (o) => {
    const n = o.nodes?.length === 1 && o.nodes[0].kind === 'text' ? o.nodes[0] : null;
    if (!n || !n.pw) return [o.x, o.x + o.w];
    const pw = n.pw + (n.ind || 0);
    if (n.align === 'RIGHT') return [o.x + o.w - pw, o.x + o.w];
    if (n.align === 'CENTER') { const c = o.x + o.w / 2; return [c - pw / 2, c + pw / 2]; }
    return [o.x, o.x + pw];
  };
  const isField = (s) => /&[A-Z_][A-Z0-9_-]*(\([^)]*\))?&/i.test(String(s).replace(/<\(>.<\)>/g, ''));
  const lineOf = (w) => out.windows.filter((o) => o !== w && o.nodes?.length && o.y < w.y + w.h && o.y + o.h > w.y);
  for (const w of out.windows) {
    const t = w.nodes?.length === 1 && w.nodes[0].kind === 'text' ? w.nodes[0] : null;
    if (!t || !t.align || !t.lines?.some((l) => isField(l.t))) continue;
    const [a0, b0] = extent(w);
    const others = lineOf(w).map(extent);
    const leftEnd = Math.max(0.5, ...others.filter(([, b]) => b <= a0 + 0.3).map(([, b]) => b + 0.5));
    const rightEnd = Math.min(pageW - 1, ...others.filter(([a]) => a >= b0 - 0.3).map(([a]) => a - 0.5));
    if (t.align === 'RIGHT') { const r = w.x + w.w; w.x = +leftEnd.toFixed(2); w.w = +(r - w.x).toFixed(2); }
    else if (t.align === 'CENTER') { const c = w.x + w.w / 2, half = Math.min(c - leftEnd, rightEnd - c); w.x = +(c - half).toFixed(2); w.w = +(2 * half).toFixed(2); }
    else w.w = +(rightEnd - w.x).toFixed(2);
  }

  // conditions: the text node whose text (after the fields above) is `text` prints only when
  // every condition holds — the node's own Conditions tab, so it keeps its cell
  report.conditions = [];
  for (const c of shape.conditions || []) {
    let hits = 0;
    eachText(out, (t, w) => {
      if (c.window && w.name !== c.window) return;
      if (!t.lines.some((l) => plainOf(l.t).trim() === String(c.text).trim())) return;
      t.cond = [...(t.cond || []), ...c.cond];
      hits++;
    });
    (hits ? report.conditions : report.notFound).push({ condition: c.text, hits });
  }

  // graphics: an existing SE78 graphic in an image window of the planner (%GRAPHICn)
  report.graphics = [];
  for (const g of shape.graphics || []) {
    const w = out.windows.find((x) => x.name === g.window);
    if (!w) { report.notFound.push({ graphic: g.window }); continue; }
    w.nodes = [{ kind: 'graphic', graphic: g.name, id: g.id || 'BMAP', btype: g.btype || 'BCOL', resolution: g.resolution || w.image?.resolution || 200 }];
    report.graphics.push({ window: g.window, graphic: g.name });
  }

  for (const it of shape.textItems || []) report.items.push(textItems(out, it));

  // modules: fixed blocks kept outside the form (letterhead, footer — SAP's ADRS_* way): the
  // one-text windows inside `box` (mm) give way to one window showing the text module
  if (shape.init) out.init = shape.init;
  report.modules = [];
  for (const m of shape.modules || []) {
    const [x0, y0, x1, y1] = m.box;
    const inside = (w) => w.nodes?.length === 1 && w.nodes[0].kind === 'text' && !w.nodes[0].module && w.type !== 'M' && w.x >= x0 - 0.3 && w.y >= y0 - 0.3 && w.x < x1 && w.y < y1;
    const gone = out.windows.filter(inside);
    out.windows = out.windows.filter((w) => !inside(w));
    // a name built at run time (&GV_X&) may name no module (a company code without one, an
    // empty key): a missing module stops the print — Initialization clears a name with no
    // text module behind it, and the node prints only with a name
    const field = /^&([A-Z0-9_]+)&$/i.exec(m.module)?.[1];
    if (field && out.init) {
      const v = field.toLowerCase();
      out.init.code = [...out.init.code,
        `SELECT SINGLE formname FROM stxfadm INTO ${v} WHERE formname = ${v} AND formtype = 'T'.`,
        `IF sy-subrc <> 0. CLEAR ${v}. ENDIF.`];
      if (!out.init.input.includes(field) && !out.init.output.includes(field)) out.init.output.push(field);
    }
    const cond = field ? [{ op1: field, cop: 'NE', op2: "' '" }] : undefined;
    out.windows.push({ name: m.window, caption: m.caption || m.window, x: x0, y: y0, w: +(x1 - x0).toFixed(2), h: +(y1 - y0).toFixed(2), nodes: [{ kind: 'text', module: m.module, moduleStyle: m.moduleStyle, ignore: m.ignore, cond, lines: [] }] });
    report.modules.push({ window: m.window, module: m.module, replaced: gone.length, texts: gone.sort((a, b) => a.y - b.y || a.x - b.x).map((w) => plainOf(w.nodes[0].lines[0].t)) });
  }

  for (const it of shape.items || []) {
    const w = out.windows.find((x) => x.name === it.window);
    const tp = w?.nodes?.find((n) => n.kind === 'template');
    if (!tp) { report.notFound.push({ items: it.window }); continue; }
    const [from, to] = it.rows;
    const cellsOf = (i) => (tp.cells || []).filter((c) => c.row === i);
    // template rows i0..i1 as a template of their own; fill: column → field (item row)
    const sub = (i0, i1, fill) => {
      const rows = [], cells = [];
      for (let i = i0; i <= i1; i++) {
        rows.push(tp.rows[i - 1]);
        for (const c of cellsOf(i)) {
          const q = JSON.parse(JSON.stringify(c));
          q.row = i - i0 + 1;
          const field = fill?.[String(c.col)];
          if (field) {
            if (q.nodes.length) { withField(q.nodes[0].lines[0], field); q.nodes.splice(1); }
            else q.nodes.push({ kind: 'text', lines: [{ f: '*', t: field }] });
          }
          cells.push(q);
        }
        if (fill) for (const [col, field] of Object.entries(fill)) if (!cellsOf(i).some((c) => c.col === Number(col))) cells.push({ row: i - i0 + 1, col: Number(col), nodes: [{ kind: 'text', lines: [{ f: '*', t: field }] }] });
      }
      return { kind: 'template', rows, cells };
    };
    const header = from > 1 ? [sub(1, from - 1)] : [];
    const footer = to < tp.rows.length ? [sub(to + 1, tp.rows.length)] : [];
    const item = sub(from, from, it.cells);
    // the first item row's top border is the header's bottom line: printed once per item it
    // would rule every line — the borders between items are those of an inner item row
    if (to > from) for (const c of item.cells) c.borders = { ...(c.borders || {}), t: cellsOf(from + 1).find((q) => q.col === c.col)?.borders?.t || 0 };
    const loop = { kind: 'loop', name: '%ITEMS', data: it.data, into: it.into, nodes: [item] };
    w.nodes = w.nodes.flatMap((n) => (n === tp ? [...header, loop, ...footer] : [n]));
    // the items flow: their window is the main window (the planner's empty MAIN goes)
    out.windows = out.windows.filter((x) => !(x.type === 'M' && x !== w && !(x.nodes || []).length));
    w.type = 'M';
    w.name = 'MAIN';
    report.items.push({ window: it.window, headerRows: from - 1, footerRows: tp.rows.length - to, data: it.data });
  }
  return { spec: out, report };
}

function main(argv) {
  if (argv.length < 2) { console.error('usage: node shape-form.mjs <spec.json> <shape.json> [--out spec.json]'); process.exit(2); }
  const { spec, report } = shapeForm(JSON.parse(readFileSync(argv[0], 'utf8')), JSON.parse(readFileSync(argv[1], 'utf8')));
  const i = argv.indexOf('--out');
  if (i >= 0) writeFileSync(argv[i + 1], JSON.stringify(spec, null, 1));
  else process.stdout.write(JSON.stringify(spec, null, 1) + '\n');
  console.error(JSON.stringify(report, null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
