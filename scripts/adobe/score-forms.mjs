// sc4sap:adobe-preview — layout score v2 (compare-layout v2): a reference print (SAP's own PDF) against a
// candidate (our preview printed to PDF), both read with read-pdf.mjs. A vector of metrics, never one total;
// a page that cannot be read is "not measurable", never 0. No SAP call; reads only the files it is given.
//
//   scoreLayouts(ref, cand, { model, profile })  → { pages, metrics, pass, failures, notMeasurable }
//     ref / cand  { pages: [{ texts, lines, rects, images }] }   (read-pdf page objects, one per page)
//     model       the preview's own items per page (build-adobe-preview model.json): labels which candidate
//                 texts are field values (bind), fixed texts and repeated rows — optional
//     profile     'A' (preview), 'C' (conversion), 'B' (PDF → form): thresholds of the build spec 9.2
//   readLayout(pdfBuffer)                        → { pages: [...] } with read-pdf, every page
//
// CLI  node score-forms.mjs <ref.pdf> <cand.pdf> [--model model.json] [--profile A] [--out score.json]
//
// Metrics: P1mm / P2mm (reference texts matched by the same text, anchor = left x + baseline, max |dx|,|dy|),
// FIELD (bound values found and matched ≤ 2 mm), FIXED (fixed texts found ≤ 2 mm), PAGES, ROWBRK (repeated row values
// on the same page), WRAP (lines of multi-line texts), FONT (size ± 0.5 pt, bold equal), RULE (lines: direction,
// position ≤ 0.5 mm, length ± 1 mm), IMG (IoU ≥ 0.9), EXTRA (candidate texts the reference does not have).
// Lines where SAP's PDF uses a fallback font (a character its font lacks) are not measurable: left out on both
// sides and listed under `excluded`; counts carry maxError / meanError of the matched texts.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPdf, mergeRuns } from '../smartform/read-pdf.mjs';

export const THRESHOLDS = {
  A: { P1mm: 0.95, P2mm: 0.99, FIELD: 1, FIXED: 0.99, PAGES: 1, ROWBRK: 1, WRAP: 0.95, FONT: 0.98, RULE: 0.95, IMG: 1, EXTRA: 0 },
  C: { P1mm: 0.9, P2mm: 0.97, FIELD: 1, FIXED: 0.98, PAGES: 1, ROWBRK: 1, WRAP: 0.9, FONT: 0.95, RULE: 0.9, IMG: 1, EXTRA: 2 },
  B: { P1mm: 0.95, P2mm: 0.99, FIELD: 1, FIXED: 0.99, PAGES: 1, ROWBRK: 1, WRAP: 0.95, FONT: 0.98, RULE: 0.95, IMG: 1, EXTRA: 0 },
};

const norm = (s) => String(s ?? '').normalize('NFC').replace(/[\s ]+/g, ' ').trim();

/** Every page of a PDF in read-pdf's layout format; a page that fails is { error }. */
export function readLayout(buf) {
  const first = readPdf(buf, 1);
  const pages = [];
  for (let i = 1; i <= (first.pages || 0); i++) {
    try { pages.push(i === 1 ? first.page : readPdf(buf, i).page); } catch (e) { pages.push({ error: String(e.message || e) }); }
  }
  return { pages };
}

/** Text runs of a page: pieces on one baseline that touch are one run (read-pdf mergeRuns). */
function runsOf(page) {
  if (!page || page.error) return [];
  const runs = page.runs || mergeRuns(page.texts || []);
  return runs.filter((r) => norm(r.text)).map((r) => ({ x: r.x, y: r.y, text: norm(r.text), pt: r.pt, bold: !!r.bold }));
}

/** Greedy one-to-one pairing of equal texts, nearest first. */
function pairTexts(a, b) {
  const cand = [];
  a.forEach((r, i) => b.forEach((c, j) => {
    if (r.text !== c.text) return;
    cand.push({ i, j, d: Math.max(Math.abs(r.x - c.x), Math.abs(r.y - c.y)) });
  }));
  cand.sort((p, q) => p.d - q.d);
  const ua = new Set(), ub = new Set(), pairs = [];
  for (const c of cand) {
    if (ua.has(c.i) || ub.has(c.j)) continue;
    ua.add(c.i); ub.add(c.j); pairs.push(c);
  }
  return pairs;
}

/** Lines of a page as segments { dir, pos, a, b }: drawn lines and the edges of stroked rectangles. */
function segmentsOf(page) {
  if (!page || page.error) return [];
  const out = [];
  for (const l of page.lines || []) {
    if (Math.abs(l.y1 - l.y2) < 0.2) out.push({ dir: 'H', pos: (l.y1 + l.y2) / 2, a: Math.min(l.x1, l.x2), b: Math.max(l.x1, l.x2) });
    else if (Math.abs(l.x1 - l.x2) < 0.2) out.push({ dir: 'V', pos: (l.x1 + l.x2) / 2, a: Math.min(l.y1, l.y2), b: Math.max(l.y1, l.y2) });
  }
  for (const r of page.rects || []) {
    if (r.stroke === undefined) continue;
    out.push({ dir: 'H', pos: r.y, a: r.x, b: r.x + r.w }, { dir: 'H', pos: r.y + r.h, a: r.x, b: r.x + r.w },
      { dir: 'V', pos: r.x, a: r.y, b: r.y + r.h }, { dir: 'V', pos: r.x + r.w, a: r.y, b: r.y + r.h });
  }
  return out.filter((s) => s.b - s.a > 0.3);
}

const iou = (p, q) => {
  const x = Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x));
  const y = Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
  const i = x * y;
  return i / (p.w * p.h + q.w * q.h - i || 1);
};

// font family of a PDF text piece: subset prefix and style suffix dropped (ABCDEF+Helvetica-Bold → Helvetica)
const family = (f) => String(f || '').replace(/^[A-Z]{6}\+/, '').replace(/[-,](Bold|Italic|Oblique|BoldItalic|BoldOblique|Regular|Roman|MT|PS|PSMT)+$/i, '').replace(/(MT|PSMT|PS)$/, '').toLowerCase();

/** Baselines of a reference page where ADS substituted a fallback font for a few characters: a line that mixes
 *  two font families, the minority family covering at most 3 characters with one beyond Latin-1 (measured: '€' in Helvetica printed in
 *  Myriad Pro). A page set entirely in another font (a Korean form, a corporate font) is never excluded. */
function fallbackLines(page) {
  const out = [];
  const texts = (page?.texts || []).filter((t) => norm(t.text));
  const seen = new Set();
  for (const t of texts) {
    if (seen.has(t)) continue;
    const line = texts.filter((x) => Math.abs(x.y - t.y) < 0.6);
    for (const x of line) seen.add(x);
    const chars = new Map();
    for (const x of line) chars.set(family(x.font), (chars.get(family(x.font)) || 0) + norm(x.text).replace(/\s/g, '').length);
    if (chars.size < 2) continue;
    const fams = [...chars.entries()].sort((a, b) => b[1] - a[1]);
    // a substitution only: the minority piece carries a character beyond Latin-1 (a glyph the main font lacks:
    // '€', '₩', CJK …); a deliberate short value in another font ('12' in Courier) stays measured
    const beyond = (fam) => line.some((x) => family(x.font) === fam && [...norm(x.text)].some((ch) => ch.codePointAt(0) > 0xff));
    const minority = fams.slice(1).filter(([fam, n]) => n <= 3 && beyond(fam));
    if (!minority.length) continue;
    const piece = line.find((x) => family(x.font) === minority[0][0]);
    out.push({ y: t.y, text: norm(line.sort((a, b) => a.x - b.x).map((x) => x.text).join(' ')), font: piece.font });
  }
  return out;
}

const ratio = (ok, n) => (n ? ok / n : 1);

export function scoreLayouts(ref, cand, { model = null, profile = 'A' } = {}) {
  const th = THRESHOLDS[profile] || THRESHOLDS.A;
  const failures = { P1mm: [], FIELD: [], FIXED: [], ROWBRK: [], WRAP: [], FONT: [], RULE: [], IMG: [], EXTRA: [] };
  const notMeasurable = [];
  const n = Math.max(ref.pages.length, cand.pages.length);
  let refTexts = 0, p1 = 0, p2 = 0, fontOk = 0, fontN = 0, extra = 0;
  let fieldN = 0, fieldOk = 0, fixedN = 0, fixedOk = 0, rowN = 0, rowOk = 0, wrapN = 0, wrapOk = 0;
  let ruleN = 0, ruleOk = 0, imgN = 0, imgOk = 0;
  let errSum = 0, errMax = 0, errN = 0;
  const excluded = [];
  for (let p = 0; p < n; p++) {
    // a page only one side has: its texts count as unmatched / extra (PAGES says the counts differ)
    const rp = ref.pages[p] || { texts: [], lines: [], rects: [], images: [] }, cp = cand.pages[p] || { texts: [], lines: [], rects: [], images: [] };
    if (rp.error || cp.error) { notMeasurable.push({ page: p + 1, error: rp.error || cp.error }); continue; }
    // lines where the reference uses a fallback font (ADS prints a character its font lacks, e.g. '€' in
    // Helvetica, in Myriad Pro with other widths): not measurable — left out on both sides and listed
    const fb = fallbackLines(rp);
    const onFb = (y) => fb.some((f) => Math.abs(f.y - y) < 0.6);
    for (const f of fb) excluded.push({ page: p + 1, y: f.y, text: f.text.slice(0, 60), font: f.font, reason: 'reference uses a fallback font on this line' });
    const R = runsOf(rp).filter((r) => !onFb(r.y)), C = runsOf(cp).filter((c) => !onFb(c.y));
    const pairs = pairTexts(R, C);
    const byRef = new Map(pairs.map((q) => [q.i, q]));
    const byCand = new Map(pairs.map((q) => [q.j, q]));
    refTexts += R.length;
    R.forEach((r, i) => {
      const q = byRef.get(i);
      if (q) { errSum += q.d; errMax = Math.max(errMax, q.d); errN++; }
      if (q && q.d <= 1.0) p1++;
      if (q && q.d <= 2.0) p2++;
      if (!q || q.d > 1.0) failures.P1mm.push({ page: p + 1, text: r.text.slice(0, 60), expected: [r.x, r.y], actual: q ? [C[q.j].x, C[q.j].y] : null, error: q ? +q.d.toFixed(2) : null });
      if (q) {
        fontN++;
        const c = C[q.j];
        if (Math.abs((c.pt || 0) - (r.pt || 0)) <= 0.5 && c.bold === r.bold) fontOk++;
        else failures.FONT.push({ page: p + 1, text: r.text.slice(0, 40), expected: [r.pt, r.bold], actual: [c.pt, c.bold] });
      }
    });
    C.forEach((c, j) => { if (!byCand.has(j)) { extra++; failures.EXTRA.push({ page: p + 1, text: c.text.slice(0, 60), at: [c.x, c.y] }); } });
    // labels from the model: field values, fixed texts, repeated rows, multi-line texts
    const items = (model?.pages?.[p]?.items || []).filter((t) => t.type === 'text');
    const found = (t, tol) => R.some((r) => r.text.includes(norm(t.text)) && Math.abs(r.x - t.x) <= tol + (r.text === norm(t.text) ? 0 : 200) && Math.abs(r.y - t.y) <= tol);
    for (const t of items) {
      if (!norm(t.text) || onFb(t.y)) continue;
      if (t.role === 'field') {
        fieldN++;
        if (found(t, 2)) fieldOk++; else failures.FIELD.push({ page: p + 1, som: t.som, text: norm(t.text).slice(0, 40), at: [+t.x.toFixed(2), +t.y.toFixed(2)] });
        if (t.row) { rowN++; if (found(t, 2)) rowOk++; else failures.ROWBRK.push({ page: p + 1, som: t.som, text: norm(t.text).slice(0, 40) }); }
      } else {
        fixedN++;
        if (found(t, 2)) fixedOk++; else failures.FIXED.push({ page: p + 1, som: t.som, text: norm(t.text).slice(0, 40), at: [+t.x.toFixed(2), +t.y.toFixed(2)] });
      }
      if (t.lines > 1) { wrapN++; if (R.some((r) => r.text === norm(t.text) && Math.abs(r.y - t.y) <= 1)) wrapOk++; else failures.WRAP.push({ page: p + 1, som: t.som, text: norm(t.text).slice(0, 40) }); }
    }
    // rules
    const RS = segmentsOf(rp), CS = segmentsOf(cp);
    const used = new Set();
    for (const s of RS) {
      ruleN++;
      const k = CS.findIndex((c, i) => !used.has(i) && c.dir === s.dir && Math.abs(c.pos - s.pos) <= 0.5 && Math.abs((c.b - c.a) - (s.b - s.a)) <= 1 && Math.abs(c.a - s.a) <= 1);
      if (k >= 0) { used.add(k); ruleOk++; } else failures.RULE.push({ page: p + 1, dir: s.dir, pos: +s.pos.toFixed(2), from: +s.a.toFixed(2), to: +s.b.toFixed(2) });
    }
    // images
    for (const im of rp.images || []) {
      imgN++;
      if ((cp.images || []).some((c) => iou(im, c) >= 0.9)) imgOk++;
      else failures.IMG.push({ page: p + 1, at: [im.x, im.y, im.w, im.h] });
    }
  }
  const metrics = {
    P1mm: ratio(p1, refTexts), P2mm: ratio(p2, refTexts), FIELD: ratio(fieldOk, fieldN), FIXED: ratio(fixedOk, fixedN),
    PAGES: ref.pages.length === cand.pages.length ? 1 : 0, ROWBRK: ratio(rowOk, rowN), WRAP: ratio(wrapOk, wrapN),
    FONT: ratio(fontOk, fontN), RULE: ratio(ruleOk, ruleN), IMG: ratio(imgOk, imgN), EXTRA: extra,
  };
  const counts = { excluded: excluded.length, maxError: +errMax.toFixed(3), meanError: errN ? +(errSum / errN).toFixed(3) : 0, refTexts, fieldN, fixedN, rowN, wrapN, fontN, ruleN, imgN, refPages: ref.pages.length, candPages: cand.pages.length };
  const pass = {};
  for (const [k, v] of Object.entries(th)) pass[k] = k === 'EXTRA' ? metrics.EXTRA <= v : metrics[k] >= v - 1e-9;
  for (const k of Object.keys(failures)) failures[k] = failures[k].slice(0, 20);
  // a score that measured (almost) nothing is no pass: no reference text left, or more than a tenth of the reference
  // lines excluded as fallback-font lines
  const refLines = Math.max(1, refTexts + excluded.length);
  if (notMeasurable.length) { /* already not measurable */ } else if (refTexts === 0) notMeasurable.push({ page: 0, error: 'no reference text left to measure' });
  else if (excluded.length / refLines > 0.1) notMeasurable.push({ page: 0, error: `${excluded.length} of ${refLines} reference lines excluded (fallback fonts) — more than 10 %` });
  return { profile, pages: n, metrics, counts, excluded: excluded.slice(0, 50), pass, passed: Object.values(pass).every(Boolean) && !notMeasurable.length, failures, notMeasurable };
}

function main(argv) {
  const [refFile, candFile] = argv;
  if (!refFile || !candFile) { console.error('usage: node score-forms.mjs <ref.pdf> <cand.pdf> [--model model.json] [--profile A] [--out score.json]'); process.exit(2); }
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const model = opt('--model') ? JSON.parse(readFileSync(opt('--model'), 'utf8')) : null;
  const res = scoreLayouts(readLayout(readFileSync(refFile)), readLayout(readFileSync(candFile)), { model, profile: opt('--profile') || 'A' });
  const json = JSON.stringify({ ref: resolve(refFile), cand: resolve(candFile), ...res }, null, 1);
  if (opt('--out')) writeFileSync(opt('--out'), json);
  process.stdout.write(json + '\n');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2));
