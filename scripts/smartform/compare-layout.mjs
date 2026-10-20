#!/usr/bin/env node
// Compare two page layouts (read-pdf.mjs output): the source the form was made
// from and what SAP printed from the generated form. Every source text run is
// looked up in the print by its text, position (mm), size and weight; every
// source rule by its direction, position and extent.
//
//   node compare-layout.mjs <source.json|.pdf> <printed.json|.pdf> [--out report.json]
//
// Report: { score, texts: { source, matched, moved[], font[], missing[], extra[] },
//           rules: { source, matched, missing[], extra[] },
//           shading: { source, matched %, otherGrey %, extraMm2 }, images: { source, matched, missing[], extra[] } }
// score = 0.75 × text score + 0.25 × rule score (0..100); a text found at the
// wrong place / in the wrong size counts half.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { mergeRules, readPdf } from './read-pdf.mjs';
import { isLight } from './plan-form.mjs';

const POS = 0.6;  // mm
const RULE = 0.4; // mm

const load = (f) => (/\.pdf$/i.test(f) ? readPdf(readFileSync(f)).page : JSON.parse(readFileSync(f, 'utf8')).page);
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

function rules(page) {
  const out = [];
  const add = (dir, pos, a, b) => { if (b - a > 0.3) out.push({ dir, pos, a, b }); };
  // a white or zero-width rule does not show: it is no rule of the page
  for (const l of (page.lines || []).filter((q) => !isLight(q.color) && q.th !== 0)) {
    if (Math.abs(l.y1 - l.y2) < 0.05) add('H', l.y1, Math.min(l.x1, l.x2), Math.max(l.x1, l.x2));
    else if (Math.abs(l.x1 - l.x2) < 0.05) add('V', l.x1, Math.min(l.y1, l.y2), Math.max(l.y1, l.y2));
  }
  for (const r of page.rects || []) {
    if ((r.fill !== undefined && isLight(r.fill) && (r.h < 0.8 || r.w < 0.8)) || (r.stroke !== undefined && r.fill === undefined && (isLight(r.stroke) || r.th === 0))) continue;
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
  return { score: +(0.75 * textScore + 0.25 * ruleScore).toFixed(1), textScore: +textScore.toFixed(1), ruleScore: +ruleScore.toFixed(1), texts: tx, rules: rl, shading: shadingOf(src, out), images: imagesOf(src, out) };
}

// shading and images are reported, not scored (the score stays comparable with earlier runs)
// shading: the source's shaded area sampled every 0.5 mm — share printed in the same grey
const greyOf = (f) => {
  if (typeof f === 'number') return f;
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(f));
  return m ? (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 : 1;
};
const fillsOf = (page) => (page.rects || []).filter((r) => r.fill !== undefined && r.w >= 0.8 && r.h >= 0.8).map((r) => ({ ...r, grey: greyOf(r.fill) })).filter((r) => r.grey < 0.99);
function shadingOf(src, out) {
  const FS = fillsOf(src), FO = fillsOf(out);
  const at = (list, x, y) => list.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  let n = 0, same = 0, other = 0, extra = 0;
  for (const r of FS) for (let x = r.x + 0.25; x < r.x + r.w; x += 0.5) for (let y = r.y + 0.25; y < r.y + r.h; y += 0.5) {
    n++;
    const o = at(FO, x, y);
    if (o && Math.abs(o.grey - r.grey) <= 0.03) same++; else if (o) other++;
  }
  for (const r of FO) for (let x = r.x + 0.25; x < r.x + r.w; x += 0.5) for (let y = r.y + 0.25; y < r.y + r.h; y += 0.5) if (!at(FS, x, y)) extra++;
  return { source: FS.length, matched: n ? +((100 * same) / n).toFixed(1) : 100, otherGrey: n ? +((100 * other) / n).toFixed(1) : 0, extraMm2: +(extra * 0.25).toFixed(1) };
}
function imagesOf(src, out) {
  const IO = (out.images || []).map((i) => ({ ...i, used: false }));
  const r = { source: (src.images || []).length, matched: 0, missing: [], extra: [] };
  for (const i of src.images || []) {
    const o = IO.find((q) => !q.used && Math.abs(q.x - i.x) <= POS && Math.abs(q.y - i.y) <= POS && Math.abs(q.w - i.w) <= 1 && Math.abs(q.h - i.h) <= 1);
    if (o) { o.used = true; r.matched++; } else r.missing.push({ x: i.x, y: i.y, w: i.w, h: i.h });
  }
  r.extra = IO.filter((q) => !q.used).map((q) => ({ x: q.x, y: q.y, w: q.w, h: q.h }));
  return r;
}

function main(argv) {
  if (argv.length < 2) { console.error('usage: node compare-layout.mjs <source.json|.pdf> <printed.json|.pdf> [--out report.json]'); process.exit(2); }
  const r = compareLayouts(load(argv[0]), load(argv[1]));
  const i = argv.indexOf('--out');
  if (i >= 0) writeFileSync(argv[i + 1], JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ score: r.score, textScore: r.textScore, ruleScore: r.ruleScore, texts: { source: r.texts.source, matched: r.texts.matched, moved: r.texts.moved.length, font: r.texts.font.length, missing: r.texts.missing.length, extra: r.texts.extra.length }, rules: { source: r.rules.source, matched: r.rules.matched, missing: r.rules.missing.length, extra: r.rules.extra.length }, shading: r.shading, images: { source: r.images.source, matched: r.images.matched, missing: r.images.missing.length, extra: r.images.extra.length } }));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
