#!/usr/bin/env node
// Compare two page layouts (read-pdf.mjs output): the source the form was made
// from and what SAP printed from the generated form. Every source text run is
// looked up in the print by its text, position (mm), size and weight; every
// source rule by its direction, position and extent.
//
//   node compare-layout.mjs <source.json|.pdf> <printed.json|.pdf> [--out report.json]
//
// Report: { score, texts: { source, matched, moved[], font[], missing[], extra[] },
//           rules: { source, matched, missing[], extra[] } }
// score = 0.75 × text score + 0.25 × rule score (0..100); a text found at the
// wrong place / in the wrong size counts half.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mergeRules, readPdf } from './read-pdf.mjs';

const POS = 0.6;  // mm
const RULE = 0.4; // mm

const load = (f) => (/\.pdf$/i.test(f) ? readPdf(readFileSync(f)).page : JSON.parse(readFileSync(f, 'utf8')).page);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

function rules(page) {
  const out = [];
  const add = (dir, pos, a, b) => { if (b - a > 0.3) out.push({ dir, pos, a, b }); };
  for (const l of page.lines || []) {
    if (Math.abs(l.y1 - l.y2) < 0.05) add('H', l.y1, Math.min(l.x1, l.x2), Math.max(l.x1, l.x2));
    else if (Math.abs(l.x1 - l.x2) < 0.05) add('V', l.x1, Math.min(l.y1, l.y2), Math.max(l.y1, l.y2));
  }
  for (const r of page.rects || []) {
    if (r.fill !== undefined && r.h < 0.8 && r.w > r.h) add('H', r.y + r.h / 2, r.x, r.x + r.w);
    else if (r.fill !== undefined && r.w < 0.8) add('V', r.x + r.w / 2, r.y, r.y + r.h);
    else if (r.stroke !== undefined) { add('H', r.y, r.x, r.x + r.w); add('H', r.y + r.h, r.x, r.x + r.w); add('V', r.x, r.y, r.y + r.h); add('V', r.x + r.w, r.y, r.y + r.h); }
  }
  return mergeRules(out);
}

export function compareLayouts(src, out) {
  const S = src.runs || src.texts, O = (out.runs || out.texts).map((t) => ({ ...t, used: false }));
  const tx = { source: S.length, matched: 0, moved: [], font: [], missing: [], extra: [] };
  let pts = 0;
  for (const t of S) {
    const want = norm(t.text);
    const same = O.filter((o) => !o.used && norm(o.text) === want);
    const near = same.sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
    if (!near) {
      // a run split or joined differently: credit by the pieces found near its place
      const part = O.filter((o) => !o.used && Math.abs(o.y - t.y) < POS && o.x >= t.x - POS && o.x <= t.x + t.w && want.includes(norm(o.text)));
      const got = part.reduce((n, o) => n + norm(o.text).length, 0);
      if (got >= want.length * 0.8) { part.forEach((o) => { o.used = true; }); pts += 0.8; tx.matched++; continue; }
      tx.missing.push({ x: t.x, y: t.y, text: want });
      continue;
    }
    near.used = true;
    const dx = near.x - t.x, dy = near.y - t.y;
    const posOk = Math.abs(dx) <= POS && Math.abs(dy) <= POS;
    const fontOk = Math.abs((near.pt || 0) - (t.pt || 0)) <= 0.6 && !!near.bold === !!t.bold;
    if (posOk && fontOk) { pts += 1; tx.matched++; continue; }
    pts += 0.5;
    if (!posOk) tx.moved.push({ text: want, dx: +dx.toFixed(2), dy: +dy.toFixed(2) });
    if (!fontOk) tx.font.push({ text: want, want: `${t.pt}${t.bold ? 'B' : ''}`, got: `${near.pt}${near.bold ? 'B' : ''}` });
  }
  tx.extra = O.filter((o) => !o.used).map((o) => ({ x: o.x, y: o.y, text: norm(o.text) }));
  const textScore = S.length ? (100 * pts) / (S.length + tx.extra.length * 0.5) : 100;

  const RS = rules(src), RO = rules(out).map((r) => ({ ...r, used: false }));
  const rl = { source: RS.length, matched: 0, missing: [], extra: [] };
  for (const r of RS) {
    const o = RO.find((q) => !q.used && q.dir === r.dir && Math.abs(q.pos - r.pos) <= RULE && Math.abs(q.a - r.a) <= RULE + 0.3 && Math.abs(q.b - r.b) <= RULE + 0.3);
    if (o) { o.used = true; rl.matched++; } else rl.missing.push(r);
  }
  rl.extra = RO.filter((q) => !q.used);
  const ruleScore = RS.length || rl.extra.length ? (100 * rl.matched) / (RS.length + rl.extra.length * 0.5) : 100;
  return { score: +(0.75 * textScore + 0.25 * ruleScore).toFixed(1), textScore: +textScore.toFixed(1), ruleScore: +ruleScore.toFixed(1), texts: tx, rules: rl };
}

function main(argv) {
  if (argv.length < 2) { console.error('usage: node compare-layout.mjs <source.json|.pdf> <printed.json|.pdf> [--out report.json]'); process.exit(2); }
  const r = compareLayouts(load(argv[0]), load(argv[1]));
  const i = argv.indexOf('--out');
  if (i >= 0) writeFileSync(argv[i + 1], JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ score: r.score, textScore: r.textScore, ruleScore: r.ruleScore, texts: { source: r.texts.source, matched: r.texts.matched, moved: r.texts.moved.length, font: r.texts.font.length, missing: r.texts.missing.length, extra: r.texts.extra.length }, rules: { source: r.rules.source, matched: r.rules.matched, missing: r.rules.missing.length, extra: r.rules.extra.length } }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
