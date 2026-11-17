import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { scoreFidelity, scoreCorpus, layoutOf, scaleLayout, DEFAULTS } from '../../scripts/forms-common/score-fidelity.mjs';

// Tiny synthetic PDFs (A4, Helvetica, uncompressed): positions in mm from the top-left, a text's y = its baseline.
const PT = 25.4 / 72;
type Txt = [number, number, string, number?];
type Pg = { texts?: Txt[]; lines?: [number, number, number, number][]; bars?: [number, number, number, number][] };
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const p = (mm: number) => (mm / PT).toFixed(2);
const py = (mm: number) => ((297 - mm) / PT).toFixed(2);

function pdf(pages: Pg[]): Buffer {
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('PAGES');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const pg of pages) {
    let c = '';
    for (const [x, y, t, pt = 10] of pg.texts || []) c += `BT /F1 ${pt} Tf ${p(x)} ${py(y)} Td (${esc(t)}) Tj ET\n`;
    for (const [x1, y1, x2, y2] of pg.lines || []) c += `0.5 w ${p(x1)} ${py(y1)} m ${p(x2)} ${py(y2)} l S\n`;
    for (const [x, y, w, h] of pg.bars || []) c += `${p(x)} ${py(y + h)} ${p(w)} ${p(h)} re f\n`;
    const content = add(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const BASE: Pg = {
  texts: [[20, 30, 'INVOICE', 14], [20, 50, 'Customer'], [120, 50, 'ZZ-0001'], [20, 80, 'Total amount'], [150, 80, '1,234.50']],
  lines: [[20, 60, 190, 60], [20, 90, 190, 90]],
};
const clone = (pg: Pg): Pg => JSON.parse(JSON.stringify(pg));

describe('score-fidelity', () => {
  it('scores a print against itself as 100 % with an empty diff', () => {
    const r = scoreFidelity(pdf([BASE]), pdf([BASE]));
    expect(r.score).toBe(1);
    expect(r.counts).toMatchObject({ refBlocks: 5, matched: 5, missing: 0, moved: 0, extra: 0, refRules: 2, rulesMatched: 2 });
    expect(r.diff.pages).toBeNull();
  });

  it('matches within 1 mm; farther is moved with dx / dy and counts once as missing', () => {
    const near = clone(BASE); near.texts![1] = [20.8, 50.6, 'Customer'];
    expect(scoreFidelity(pdf([BASE]), pdf([near])).parts.text).toBe(1);
    const far = clone(BASE); far.texts![1] = [20, 52.5, 'Customer'];
    const r = scoreFidelity(pdf([BASE]), pdf([far]));
    expect(r.counts).toMatchObject({ matched: 4, moved: 1, missing: 0, extra: 0 });
    expect(r.parts.text).toBeCloseTo(4 / 5, 4);
    expect(r.diff.moved[0]).toMatchObject({ page: 1, text: 'Customer', candPage: 1, dy: 2.5 });
    expect(r.diff.moved[0].dx).toBeCloseTo(0, 1);
  });

  it('lists missing and extra texts; extra texts lower the text part', () => {
    const c = clone(BASE); c.texts!.splice(2, 1); c.texts!.push([20, 120, 'Page 1 of 1']);
    const r = scoreFidelity(pdf([BASE]), pdf([c]));
    expect(r.diff.missing.map((m: { text: string }) => m.text)).toEqual(['ZZ-0001']);
    expect(r.diff.extra.map((m: { text: string }) => m.text)).toEqual(['Page 1 of 1']);
    expect(r.parts.text).toBeCloseTo(4 / 6, 4);
  });

  it('matches a block split or joined differently on the other side', () => {
    const split = clone(BASE); split.texts![3] = [20, 80, 'Total']; split.texts!.push([40, 80, 'amount']);
    expect(scoreFidelity(pdf([BASE]), pdf([split])).parts.text).toBe(1);
    expect(scoreFidelity(pdf([split]), pdf([BASE])).parts.text).toBe(1);
  });

  it('counts a different page count in the pages part and the texts of the missing page as missing', () => {
    const r = scoreFidelity(pdf([BASE, { texts: [[20, 30, 'Page 2']] }]), pdf([BASE]));
    expect(r.diff.pages).toEqual({ ref: 2, cand: 1 });
    expect(r.parts.pages).toBe(0.5);
    expect(r.diff.missing).toEqual([expect.objectContaining({ page: 2, text: 'Page 2' })]);
    expect(r.score).toBeCloseTo(0.8 * 5 / 6 + 0.15 * 1 + 0.05 * 0.5, 4);
    expect(r.pagesMismatch).toBe(true);
    expect(r.textPercent).toBeCloseTo(500 / 6, 1);
    const c = scoreCorpus([{ name: 'P', ...r, score: 0.99 }, { name: 'Q', score: 1, parts: { text: 1 } }]);
    expect(c).toMatchObject({ pagesMismatch: ['P'], passed: false });
    expect(c.textAveragePercent).toBeCloseTo((500 / 6 + 100) / 2, 1);
    expect(c.forms[0]).toMatchObject({ passed: false, pagesMismatch: true });
  });

  it('compares rules by direction, position and both ends within 1 mm; thin filled bars count, barcodes do not', () => {
    const c = clone(BASE); c.lines = [[20, 60.5, 190.5, 60.5]];
    const r = scoreFidelity(pdf([BASE]), pdf([c]));
    expect(r.counts).toMatchObject({ refRules: 2, rulesMatched: 1, rulesMissing: 1, rulesExtra: 0 });
    expect(r.diff.lines.missing[0]).toMatchObject({ dir: 'H', pos: 90 });
    const bar = clone(BASE); bar.lines = [[20, 60, 190, 60]]; bar.bars = [[20, 89.8, 170, 0.4]];
    expect(scoreFidelity(pdf([BASE]), pdf([bar])).parts.lines).toBe(1);
    const code = clone(BASE); code.bars = Array.from({ length: 20 }, (_, i) => [100 + i * 0.8, 200, 0.3, 10] as [number, number, number, number]);
    expect(scoreFidelity(pdf([BASE]), pdf([code])).counts.rulesExtra).toBe(0);
  });

  it('reads positioned-text JSON, ignores texts outside the page and scales a zoomed print back', () => {
    const json = { pages: [{ w: 210, h: 297, texts: BASE.texts!.map(([x, y, text]) => ({ x, y, text })).concat([{ x: 575, y: 10, text: 'hidden' }]),
      lines: BASE.lines!.map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 })) }] };
    const r = scoreFidelity(pdf([BASE]), json);
    expect(r.parts.text).toBe(1);
    expect(r.diff.extra).toEqual([]);
    const big = layoutOf({ pages: [{ w: 840, h: 1188, texts: [{ x: 80, y: 120, text: 'INVOICE', pt: 56, w: 40 }], lines: [{ x1: 80, y1: 240, x2: 760, y2: 240 }] }] });
    const back = scaleLayout(big, 4);
    expect(back.pages[0]).toMatchObject({ w: 210, h: 297, texts: [{ x: 20, y: 30, pt: 14, w: 10 }], lines: [{ x1: 20, y1: 60, x2: 190, y2: 60 }] });
  });

  it('is not measurable without reference text, and the corpus averages only measured forms', () => {
    const empty = scoreFidelity(pdf([{ lines: [[20, 60, 190, 60]] }]), pdf([BASE]));
    expect(empty.score).toBeNull();
    expect(empty.notMeasurable.length).toBe(1);
    const c = scoreCorpus([{ name: 'A', score: 1 }, { name: 'B', score: 0.97 }, { name: 'C', ...empty }], { target: DEFAULTS.target });
    expect(c).toMatchObject({ measured: 2, notMeasured: 1, average: 0.985, passed: false });
    expect(c.forms.map((f: { passed: boolean }) => f.passed)).toEqual([true, false, false]);
    expect(scoreCorpus([{ name: 'A', score: 1 }, { name: 'B', score: 0.97 }]).passed).toBe(true);
  });
});
