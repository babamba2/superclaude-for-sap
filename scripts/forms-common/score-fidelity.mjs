#!/usr/bin/env node
// Print fidelity score shared by the SmartForm and Adobe form skills: how close a candidate print (our preview,
// or the PDF of a converted form) comes to a reference print (SAP's own PDF). One number per form, 0..1, plus the
// differences behind it. No SAP call, no dependency: PDFs are read with read-pdf.mjs.
//
//   scoreFidelity(ref, cand, { tol, weights })  → { score, percent, parts, counts, diff, notMeasurable }
//   layoutOf(input)                             → { pages: [{ w, h, texts, lines, rects }] }  (PDF Buffer or JSON)
//   scoreCorpus(results, { target })            → { forms, average, passed }
//
// ref / cand are a PDF Buffer or positioned-text JSON (mm from the page's top-left, a text's y = its baseline):
//   { pages: [{ w, h, texts: [{ x, y, text, pt?, w? }], lines: [{ x1, y1, x2, y2 }], rects?: [{ x, y, w, h, fill?, stroke? }] }] }
//
// Text: each text block of the reference (pieces on one baseline that touch, read-pdf mergeRuns) counts as matched
// when the candidate has the same text (blanks normalised) on the same page with its left x and baseline within
// `tol` mm. A block split or joined differently on the other side still matches when neighbouring pieces on that
// baseline (each at most `joinGap` mm, default 3, after the previous one's right edge) spell the same text and the last piece ends where the joined block ends, or, for a piece read-pdf marks wEst (estimated width), starts where the block's average character width puts it (±tol; only when the block's width is known).
// text = matched / (reference blocks + extra candidate blocks); a block found farther away is listed as moved
// (with dx / dy) and counts once, as missing. Known limit: a block both split and moved counts as one missing
// plus its pieces as extra.
// Lines: drawn lines, edges of stroked boxes and thin filled bars that are not white (not barcode bars: 9 or more
// equal parallel bars within 15 mm; a table with that many narrow filled-bar columns loses its borders on both sides),
// collinear pieces merged;
// matched when direction is equal and position and both ends are within `tol`. lines = matched / (reference + extra).
// Pages: min / max of the page counts.
// score = weights.text × text + weights.lines × lines + weights.pages × pages (default 0.80 / 0.15 / 0.05);
// textPercent is reported next to it. A different page count sets pagesMismatch: the form fails the target
// whatever its score (the score is still computed).
//
// CLI
//   node score-fidelity.mjs <ref.pdf|json> <cand.pdf|json> [--tol 1] [--join-gap 3] [--out score.json]
//   node score-fidelity.mjs corpus <list.json> [--target 0.98] [--out corpus.json]
//        list.json: [{ "name", "ref", "cand" }] — paths relative to the list file
//   node score-fidelity.mjs layout <file.pdf> --out <layout.json>   (positioned-text JSON of a PDF)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPdf, mergeRuns, mergeRules } from '../smartform/read-pdf.mjs';

export const DEFAULTS = { tol: 1, joinGap: 3, weights: { text: 0.8, lines: 0.15, pages: 0.05 }, target: 0.98 };
const LIST_MAX = 200;

const norm = (s) => String(s ?? '').normalize('NFC').replace(/[\s ]+/g, ' ').trim();
const squash = (s) => norm(s).replace(/ /g, '');
const r2 = (v) => +Number(v).toFixed(2);

/** Every page of a PDF (Buffer) or of a positioned-text JSON, in one shape. */
export function layoutOf(input) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    const buf = Buffer.from(input);
    const first = readPdf(buf, 1);
    const pages = [];
    for (let i = 1; i <= (first.pages || 0); i++) {
      const p = i === 1 ? first.page : readPdf(buf, i).page;
      pages.push({ w: p.widthMm, h: p.heightMm, texts: p.texts, lines: p.lines, rects: p.rects });
    }
    return { pages };
  }
  const src = typeof input === 'string' ? JSON.parse(input) : input;
  const list = Array.isArray(src?.pages) ? src.pages : src?.page ? [src.page] : null;
  if (!list) throw new Error('layout: expected a PDF or JSON with pages[]');
  return {
    pages: list.map((p) => ({
      w: Number(p.w ?? p.widthMm ?? 0), h: Number(p.h ?? p.heightMm ?? 0),
      texts: (p.texts || []).filter((t) => t && Number.isFinite(+t.x) && Number.isFinite(+t.y)).map((t) => ({ ...t, x: +t.x, y: +t.y, text: String(t.text ?? '') })),
      lines: (p.lines || []).filter((l) => l && [l.x1, l.y1, l.x2, l.y2].every((v) => Number.isFinite(+v))).map((l) => ({ x1: +l.x1, y1: +l.y1, x2: +l.x2, y2: +l.y2 })),
      rects: (p.rects || []).filter((r) => r && [r.x, r.y, r.w, r.h].every((v) => Number.isFinite(+v))).map((r) => ({ ...r, x: +r.x, y: +r.y, w: +r.w, h: +r.h })),
    })),
  };
}

/** A layout with every length divided by `f` (a page printed at f times its size, e.g. a zoomed preview). */
export function scaleLayout(layout, f) {
  const s = (v) => r2(v / f);
  return {
    pages: layout.pages.map((p) => ({
      w: s(p.w), h: s(p.h),
      texts: p.texts.map((t) => ({ ...t, x: s(t.x), y: s(t.y), ...(t.w !== undefined ? { w: s(t.w) } : {}), ...(t.pt !== undefined ? { pt: r2(t.pt / f) } : {}) })),
      lines: p.lines.map((l) => ({ ...l, x1: s(l.x1), y1: s(l.y1), x2: s(l.x2), y2: s(l.y2), ...(l.th !== undefined ? { th: s(l.th) } : {}) })),
      rects: p.rects.map((r) => ({ ...r, x: s(r.x), y: s(r.y), w: s(r.w), h: s(r.h), ...(r.th !== undefined ? { th: s(r.th) } : {}) })),
    })),
  };
}

/** Text blocks of a page: pieces merged per baseline when every piece carries its width and size. */
function blocksOf(page) {
  // a text outside the page box (content a writer keeps off the sheet) is not printed
  const inPage = (t) => !(page.w > 0 && page.h > 0) || (t.x >= -1 && t.x <= page.w + 1 && t.y >= -1 && t.y <= page.h + 1);
  // the same text drawn twice at one spot is one printed text (synthetic bold: a writer draws the glyphs twice)
  const seen = new Set();
  const texts = (page.texts || []).filter((t) => {
    if (!norm(t.text) || !inPage(t)) return false;
    const k = `${t.text}|${Math.round(t.x * 10)}|${Math.round(t.y * 10)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const merge = texts.length && texts.every((t) => Number.isFinite(+t.w) && Number.isFinite(+t.pt));
  // raw keeps the blanks inside a block (a gap the block itself prints, e.g. "Total" + 26 blanks + ":")
  return (merge ? mergeRuns(texts) : texts).filter((b) => norm(b.text)).map((b) => ({ x: r2(b.x), y: r2(b.y), text: norm(b.text),
    raw: String(b.text).normalize('NFC').replace(/[\t ]/g, ' ').trim(),
    ...(Number.isFinite(+b.w) ? { w: r2(b.w) } : {}), ...(Number.isFinite(+b.pt) ? { pt: +b.pt } : {}), ...(b.wEst ? { wEst: true } : {}) }));
}

const PT = 25.4 / 72;
// right edge of a block: its width when known, else its characters at about 0.6 em (2.5 mm a character without a size)
const rightOf = (b) => b.x + (Number.isFinite(b.w) ? b.w : squash(b.text).length * (b.pt ? 0.6 * b.pt * PT : 2.5));
const isWhite = (f) => f === 1 || /^#?f{6}$/i.test(String(f ?? ''));

/** Rules of a page as merged segments { dir, pos, a, b }. */
function rulesOf(page, tol = DEFAULTS.tol) {
  const segs = [];
  for (const l of page.lines || []) {
    if (Math.abs(l.y1 - l.y2) < 0.2) segs.push({ dir: 'H', pos: (l.y1 + l.y2) / 2, a: Math.min(l.x1, l.x2), b: Math.max(l.x1, l.x2) });
    else if (Math.abs(l.x1 - l.x2) < 0.2) segs.push({ dir: 'V', pos: (l.x1 + l.x2) / 2, a: Math.min(l.y1, l.y2), b: Math.max(l.y1, l.y2) });
  }
  const rects = page.rects || [];
  for (const r of rects) {
    if (r.stroke !== undefined) {
      segs.push({ dir: 'H', pos: r.y, a: r.x, b: r.x + r.w }, { dir: 'H', pos: r.y + r.h, a: r.x, b: r.x + r.w },
        { dir: 'V', pos: r.x, a: r.y, b: r.y + r.h }, { dir: 'V', pos: r.x + r.w, a: r.y, b: r.y + r.h });
    }
  }
  // thin filled bars are rules (ADS and browsers draw borders this way); a row of parallel bars is a barcode
  // a white bar erases, it draws nothing
  const bars = rects.filter((r) => r.stroke === undefined && !isWhite(r.fill) && Math.min(r.w, r.h) <= 0.6 && Math.max(r.w, r.h) >= 1);
  const isV = (r) => r.h > r.w;
  for (const r of bars) {
    const twins = bars.filter((q) => q !== r && isV(q) === isV(r)
      && (isV(r) ? Math.abs(q.y - r.y) < 0.2 && Math.abs(q.h - r.h) < 0.2 && Math.abs(q.x - r.x) < 15
        : Math.abs(q.x - r.x) < 0.2 && Math.abs(q.w - r.w) < 0.2 && Math.abs(q.y - r.y) < 15));
    if (twins.length >= 8) continue;
    if (isV(r)) segs.push({ dir: 'V', pos: r.x + r.w / 2, a: r.y, b: r.y + r.h });
    else segs.push({ dir: 'H', pos: r.y + r.h / 2, a: r.x, b: r.x + r.w });
  }
  // pieces of one visual line merge: parallel within 0.3 mm, gaps up to the tolerance (writers draw a ruled line
  // per cell, a shared border twice, slightly offset)
  return mergeRules(segs.filter((s) => s.b - s.a > 0.3), 0.3, tol).map((s) => ({ dir: s.dir, pos: r2(s.pos), a: r2(s.a), b: r2(s.b) }));
}

const dist = (p, q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));

/** Greedy one-to-one pairing, nearest first, of items for which `ok(i, j)` holds. */
function pairGreedy(A, B, ok, d) {
  const cand = [];
  A.forEach((a, i) => B.forEach((b, j) => { if (ok(a, b, i, j)) cand.push({ i, j, d: d(a, b) }); }));
  cand.sort((p, q) => p.d - q.d || p.i - q.i || p.j - q.j);
  const ua = new Set(), ub = new Set(), out = [];
  for (const c of cand) {
    if (ua.has(c.i) || ub.has(c.j)) continue;
    ua.add(c.i); ub.add(c.j); out.push(c);
  }
  return out;
}

/** One block of `one` spelled by several neighbouring blocks of `many` on its baseline (split differently).
 *  Neighbours: each piece starts at most `joinGap` mm after the previous piece's right edge, plus the width of the
 *  blanks the joined block itself has at that point (0.6 em each, the widest common blank: Courier). */
function joinMatch(one, many, freeMany, tol, joinGap) {
  const want = squash(one.text);
  // blanks before each non-blank character of the joined block
  const raw = one.raw ?? one.text;
  const blanksBefore = [];
  let run = 0;
  for (const ch of raw) { if (/\s/.test(ch)) run++; else { blanksBefore.push(run); run = 0; } }
  const blankW = one.pt ? 0.6 * one.pt * PT : 2.5;
  const line = many.map((m, j) => ({ m, j })).filter(({ m, j }) => freeMany.has(j) && Math.abs(m.y - one.y) <= tol).sort((p, q) => p.m.x - q.m.x);
  const start = line.findIndex(({ m }) => Math.abs(m.x - one.x) <= tol);
  if (start < 0) return null;
  let got = '';
  const used = [];
  for (let k = start; k < line.length; k++) {
    const s = squash(line[k].m.text);
    if (k > start && line[k].m.x - rightOf(line[k - 1].m) > joinGap + (blanksBefore[got.length] || 0) * blankW) return null;
    if (!want.startsWith(got + s)) return null;
    got += s; used.push(line[k].j);
    if (got === want) {
      if (used.length < 2) return null;
      // the pieces must also end where the block ends: the blank allowance is only an upper bound on each gap
      // (a ':' printed 30 mm left of the reference's ':' is not the same print)
      // Two measures, either one within the tolerance: the last piece's right edge at the block's right edge, or
      // the last piece's start where the block's own average character width puts it (a PDF whose font has no
      // width table gives read-pdf estimated piece widths, so the right edge of such a piece is not reliable)
      const last = line[k].m;
      if (Number.isFinite(one.w)) {
        const end = one.x + one.w;
        const chars = [...String(one.raw ?? one.text)].length || 1;
        const avg = one.w / chars;
        const lastLen = [...String(last.raw ?? last.text)].length;
        const byEdge = Math.abs(rightOf(last) - end) <= tol;
        // only for a piece whose width read-pdf estimated (its font has no width table), within the tolerance
        const byStart = !!last.wEst && Math.abs(last.x - (end - lastLen * avg)) <= tol;
        if (!byEdge && !byStart) return null;
        if (!byEdge) used.byStartOnly = true;
      }
      return used;
    }
  }
  return null;
}

function scorePage(R, C, tol, joinGap) {
  const freeR = new Set(R.keys()), freeC = new Set(C.keys());
  let matched = 0, byStart = 0;
  // 1. same text within the tolerance
  for (const p of pairGreedy(R, C, (a, b) => a.text === b.text && dist(a, b) <= tol, dist)) { freeR.delete(p.i); freeC.delete(p.j); matched++; }
  // 2. split differently: one reference block = several candidate blocks, or the other way round
  for (const i of [...freeR]) {
    const js = joinMatch(R[i], C, freeC, tol, joinGap);
    if (js) { freeR.delete(i); js.forEach((j) => freeC.delete(j)); matched++; if (js.byStartOnly) byStart++; }
  }
  for (const j of [...freeC]) {
    const is = joinMatch(C[j], R, freeR, tol, joinGap);
    if (is) { freeC.delete(j); is.forEach((i) => freeR.delete(i)); matched += is.length; if (is.byStartOnly) byStart += is.length; }
  }
  return { matched, byStart, freeR, freeC };
}

function scoreRules(RS, CS, tol) {
  const ok = (a, b) => a.dir === b.dir && Math.abs(a.pos - b.pos) <= tol && Math.abs(a.a - b.a) <= tol && Math.abs(a.b - b.b) <= tol;
  const pairs = pairGreedy(RS, CS, ok, (a, b) => Math.abs(a.pos - b.pos) + Math.abs(a.a - b.a) + Math.abs(a.b - b.b));
  const ui = new Set(pairs.map((p) => p.i)), uj = new Set(pairs.map((p) => p.j));
  return { matched: pairs.length, missing: RS.filter((_, i) => !ui.has(i)), extra: CS.filter((_, j) => !uj.has(j)) };
}

/** Fidelity of a candidate print against a reference print. */
export function scoreFidelity(refIn, candIn, { tol = DEFAULTS.tol, weights = DEFAULTS.weights, joinGap = DEFAULTS.joinGap } = {}) {
  const ref = layoutOf(refIn);
  const cand = layoutOf(candIn);
  const w = { ...DEFAULTS.weights, ...weights };
  const n = Math.max(ref.pages.length, cand.pages.length);
  const missing = [], extra = [], lineMissing = [], lineExtra = [];
  let refBlocks = 0, matched = 0, joinsByStart = 0, refRules = 0, ruleMatched = 0, extraRules = 0;
  for (let p = 0; p < n; p++) {
    const rp = ref.pages[p] || { texts: [], lines: [], rects: [] }, cp = cand.pages[p] || { texts: [], lines: [], rects: [] };
    const R = blocksOf(rp), C = blocksOf(cp);
    refBlocks += R.length;
    const s = scorePage(R, C, tol, joinGap);
    matched += s.matched; joinsByStart += s.byStart;
    for (const i of s.freeR) missing.push({ page: p + 1, text: R[i].text, x: R[i].x, y: R[i].y });
    for (const j of s.freeC) extra.push({ page: p + 1, text: C[j].text, x: C[j].x, y: C[j].y });
    const RS = rulesOf(rp, tol), CS = rulesOf(cp, tol);
    const rr = scoreRules(RS, CS, tol);
    refRules += RS.length; ruleMatched += rr.matched; extraRules += rr.extra.length;
    rr.missing.forEach((l) => lineMissing.push({ page: p + 1, ...l }));
    rr.extra.forEach((l) => lineExtra.push({ page: p + 1, ...l }));
  }
  // 3. moved: a missing block whose text the candidate printed elsewhere (same page first, then the nearest)
  const moves = pairGreedy(missing, extra, (a, b) => a.text === b.text, (a, b) => (a.page === b.page ? 0 : 1000) + dist(a, b));
  const movedM = new Set(moves.map((m) => m.i)), movedE = new Set(moves.map((m) => m.j));
  const moved = moves.map(({ i, j }) => ({ page: missing[i].page, text: missing[i].text, at: [missing[i].x, missing[i].y],
    candPage: extra[j].page, found: [extra[j].x, extra[j].y], dx: r2(extra[j].x - missing[i].x), dy: r2(extra[j].y - missing[i].y) }));
  const missingOnly = missing.filter((_, i) => !movedM.has(i));
  const extraOnly = extra.filter((_, j) => !movedE.has(j));
  const notMeasurable = [];
  if (!ref.pages.length) notMeasurable.push('the reference has no page');
  else if (!refBlocks) notMeasurable.push('the reference has no text');
  const textScore = refBlocks + extraOnly.length ? matched / (refBlocks + extraOnly.length) : 1;
  const lineScore = refRules + extraRules ? ruleMatched / (refRules + extraRules) : 1;
  const pageScore = Math.max(ref.pages.length, cand.pages.length) ? Math.min(ref.pages.length, cand.pages.length) / Math.max(ref.pages.length, cand.pages.length) : 0;
  const score = notMeasurable.length ? null : +(w.text * textScore + w.lines * lineScore + w.pages * pageScore).toFixed(4);
  return {
    score, percent: score === null ? null : +(score * 100).toFixed(2),
    textPercent: notMeasurable.length ? null : +(textScore * 100).toFixed(2),
    // a different page count fails the form whatever the score
    pagesMismatch: ref.pages.length !== cand.pages.length, tol, weights: w,
    parts: { text: +textScore.toFixed(4), lines: +lineScore.toFixed(4), pages: +pageScore.toFixed(4) },
    counts: { refPages: ref.pages.length, candPages: cand.pages.length, refBlocks, matched, missing: missingOnly.length, moved: moved.length, extra: extraOnly.length,
      joinsByStart, refRules, rulesMatched: ruleMatched, rulesMissing: lineMissing.length, rulesExtra: extraRules },
    diff: {
      pages: ref.pages.length === cand.pages.length ? null : { ref: ref.pages.length, cand: cand.pages.length },
      missing: missingOnly.slice(0, LIST_MAX), moved: moved.slice(0, LIST_MAX), extra: extraOnly.slice(0, LIST_MAX),
      lines: { missing: lineMissing.slice(0, LIST_MAX), extra: lineExtra.slice(0, LIST_MAX) },
    },
    notMeasurable,
  };
}

/** Corpus summary: per-form scores, their average and the target check. A form not measurable is listed, not averaged.
 *  A form passes with score ≥ target and the same page count; the corpus passes with average ≥ target, every form
 *  measured and no page-count mismatch. */
export function scoreCorpus(results, { target = DEFAULTS.target } = {}) {
  const forms = results.map((r) => {
    const score = r.score ?? null;
    const text = r.parts?.text ?? null;
    return { name: r.name, score, percent: r.percent ?? null, textPercent: r.textPercent ?? (text === null ? null : +(text * 100).toFixed(2)),
      pagesMismatch: !!r.pagesMismatch, passed: score !== null && score >= target - 1e-9 && !r.pagesMismatch,
      ...(r.error ? { error: r.error } : {}), ...(r.notMeasurable?.length ? { notMeasurable: r.notMeasurable } : {}) };
  });
  const measured = forms.filter((f) => f.score !== null);
  // the text average from the text parts (4 decimals; textPercent has 2)
  const textOf = (i) => results[i].parts?.text ?? (forms[i].textPercent ?? 0) / 100;
  const idx = forms.map((f, i) => i).filter((i) => forms[i].score !== null);
  const average = measured.length ? +(measured.reduce((s, f) => s + f.score, 0) / measured.length).toFixed(4) : null;
  const textAverage = idx.length ? +(idx.reduce((s, i) => s + textOf(i), 0) / idx.length).toFixed(4) : null;
  const pagesMismatch = forms.filter((f) => f.pagesMismatch).map((f) => f.name);
  return { target, forms, measured: measured.length, notMeasured: forms.length - measured.length, average,
    averagePercent: average === null ? null : +(average * 100).toFixed(2), textAveragePercent: textAverage === null ? null : +(textAverage * 100).toFixed(2),
    pagesMismatch, passed: average !== null && average >= target - 1e-9 && measured.length === forms.length && !pagesMismatch.length };
}

const readInput = (file) => {
  const buf = readFileSync(file);
  return buf.subarray(0, 5).toString('latin1') === '%PDF-' ? buf : JSON.parse(buf.toString('utf8'));
};

function main(argv) {
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const out = (obj) => {
    const json = JSON.stringify(obj, null, 1);
    if (opt('--out')) writeFileSync(opt('--out'), `${json}\n`);
    process.stdout.write(`${json}\n`);
  };
  const tol = opt('--tol') !== undefined ? Number(opt('--tol')) : DEFAULTS.tol;
  const joinGap = opt('--join-gap') !== undefined ? Number(opt('--join-gap')) : DEFAULTS.joinGap;
  if (!(joinGap >= 0)) { console.error('score-fidelity: --join-gap must be 0 or more mm'); process.exit(2); }
  if (!(tol > 0)) { console.error('score-fidelity: --tol must be a positive number of mm'); process.exit(2); }
  if (argv[0] === 'layout') {
    if (!argv[1] || !opt('--out')) { console.error('usage: node score-fidelity.mjs layout <file.pdf> --out <layout.json>'); process.exit(2); }
    writeFileSync(opt('--out'), `${JSON.stringify(layoutOf(readFileSync(argv[1])), null, 1)}\n`);
    return;
  }
  if (argv[0] === 'corpus') {
    if (!argv[1]) { console.error('usage: node score-fidelity.mjs corpus <list.json> [--target 0.98] [--out corpus.json]'); process.exit(2); }
    const base = dirname(resolve(argv[1]));
    const list = JSON.parse(readFileSync(argv[1], 'utf8'));
    if (!Array.isArray(list)) { console.error('score-fidelity: the list must be an array of { name, ref, cand }'); process.exit(2); }
    const results = list.map((e) => {
      try {
        const r = scoreFidelity(readInput(resolve(base, e.ref)), readInput(resolve(base, e.cand)), { tol, joinGap });
        return { name: e.name, ...r };
      } catch (err) { return { name: e.name, score: null, error: String(err.message || err) }; }
    });
    const target = opt('--target') !== undefined ? Number(opt('--target')) : DEFAULTS.target;
    out({ ...scoreCorpus(results, { target }), details: results });
    return;
  }
  if (!argv[0] || !argv[1]) {
    console.error('usage: node score-fidelity.mjs <ref.pdf|json> <cand.pdf|json> [--tol 1] [--join-gap 3] [--out score.json]\n       node score-fidelity.mjs corpus <list.json> [--target 0.98] [--out corpus.json]\n       node score-fidelity.mjs layout <file.pdf> --out <layout.json>');
    process.exit(2);
  }
  out({ ref: resolve(argv[0]), cand: resolve(argv[1]), ...scoreFidelity(readInput(argv[0]), readInput(argv[1]), { tol, joinGap }) });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
