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
//              cells: { "1": "&GS_ITEM-POSNR&", "3": "&GS_ITEM-MATNR&" } }] }
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

export function shapeForm(spec, shape) {
  const out = JSON.parse(JSON.stringify(spec));
  const report = { fields: [], items: [], notFound: [] };
  for (const k of ['interface', 'tables', 'globals']) if (shape[k]) out[k] = [...(out[k] || []), ...shape[k]];

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
