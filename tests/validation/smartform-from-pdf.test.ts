import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { readPdf, mergeRules, mergeRuns } from '../../scripts/smartform/read-pdf.mjs';
// @ts-expect-error — plain .mjs script
import { planForm, pickFormat, styleChoices, literal } from '../../scripts/smartform/plan-form.mjs';
// @ts-expect-error — plain .mjs script
import { writeForm, tdlines } from '../../scripts/smartform/write-form.mjs';
// @ts-expect-error — plain .mjs script
import { compareLayouts } from '../../scripts/smartform/compare-layout.mjs';
// @ts-expect-error — plain .mjs script
import { shapeForm } from '../../scripts/smartform/shape-form.mjs';

// A one-page PDF the way SAP's converter writes one: Type1 font with a %Devtype
// comment, text by Td/Tj, a stroked rule. All values are invented.
function samplePdf(): Buffer {
  const content = ' /F001 10.00 Tf 0 g BT 56.69 785.20 Td 0 Tw <494E564F494345>Tj ET 0 g BT 56.69 770.00 Td 0 Tw (Total:  \\(EUR\\)) Tj ET q 0 0 0 RG 0.75 w 56.69 760.00 m 283.46 760.00 l S Q';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /MediaBox [0 0 595 842] /Parent 2 0 R /Resources << /Font << /F001 4 0 R >> >> /Contents 5 0 R >>',
    '<<\n%Devtype PDFUC    Font HELVE    bold Lang EN\n/Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /FirstChar 32 /LastChar 126 /Widths [' + Array(95).fill(556).join(' ') + '] /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.3\n';
  objs.forEach((o, i) => { pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  pdf += 'trailer\n<< /Root 1 0 R >>\n%%EOF\n';
  return Buffer.from(pdf, 'latin1');
}

const PT = 25.4 / 72;
const STYLES = [{
  name: 'ZTEST_STYLE', font: { family: 'HELVE', pt: 10, bold: false }, lpi: 6,
  paragraphs: [
    { tag: 'AA', align: 'LEFT', lineSpacing: '1.00 LN', left: '0.00 CM', before: '0.00 CM', family: 'HELVE', size: 100, bold: '*', underline: '*' },
    { tag: 'AB', align: 'LEFT', lineSpacing: '1.00 LN', left: '0.00 CM', before: '0.00 CM', family: 'HELVE', size: 100, bold: 'X', underline: '*' },
    { tag: 'CA', align: 'CENTER', lineSpacing: '1.00 LN', left: '0.00 CM', before: '0.00 CM', family: 'HELVE', size: 100, bold: '*', underline: 'X' },
  ],
  strings: [{ tag: 'C1', family: 'HELVE', size: 140, bold: 'X', italic: '*', underline: '*' }],
}];

describe('read-pdf', () => {
  it('reads texts (blanks trimmed, escapes decoded), SAP font names and rules in mm from the top-left', () => {
    const { pages, page } = readPdf(samplePdf());
    expect(pages).toBe(1);
    expect(page.widthMm).toBeCloseTo(595 * PT, 1);
    const inv = page.texts.find((t: any) => t.text === 'INVOICE');
    expect(inv.x).toBeCloseTo(56.69 * PT, 1);
    expect(inv.y).toBeCloseTo((842 - 785.2) * PT, 1);
    expect(inv.pt).toBe(10);
    expect(inv.sapFont).toEqual({ device: 'PDFUC', family: 'HELVE', bold: true });
    expect(inv.w).toBeCloseTo(7 * 5.56 * PT, 1);
    expect(page.texts.map((t: any) => t.text)).toContain('Total:  (EUR)');
    expect(page.lines).toHaveLength(1);
    expect(page.lines[0].y1).toBeCloseTo((842 - 760) * PT, 1);
  });

  it('joins collinear rule pieces whatever their order and tiny position differences', () => {
    const m = mergeRules([
      { dir: 'V', pos: 112.01, a: 140, b: 150 }, { dir: 'V', pos: 111.97, a: 120, b: 130 },
      { dir: 'V', pos: 111.99, a: 130, b: 140 }, { dir: 'H', pos: 50, a: 0, b: 10 }, { dir: 'H', pos: 50, a: 12, b: 20 },
    ]);
    expect(m.filter((s: any) => s.dir === 'V')).toEqual([expect.objectContaining({ a: 120, b: 150 })]);
    expect(m.filter((s: any) => s.dir === 'H')).toHaveLength(2);
  });

  it('joins pieces of one line across a blank only, not across a column gap, when asked', () => {
    const t = (x: number, w: number, text: string) => ({ x, y: 20, w, text, pt: 10, font: 'Helvetica' });
    expect(mergeRuns([t(10, 10, 'Sample'), t(21, 8, 'Text')])).toHaveLength(1);
    expect(mergeRuns([t(10, 10, 'Sample'), t(23, 8, 'Text')], 1.1)).toHaveLength(2);
  });
});

describe('plan-form', () => {
  it('picks the paragraph (and character format) that prints the font, avoiding underlined ones', () => {
    const ch = styleChoices(STYLES);
    expect(pickFormat(ch, { text: 'x', pt: 10, bold: true, sapFont: { family: 'HELVE' } })).toMatchObject({ para: 'AB' });
    expect(pickFormat(ch, { text: 'x', pt: 14, bold: true, sapFont: { family: 'HELVE' } })).toMatchObject({ char: 'C1', pt: 14 });
    expect(pickFormat(ch, { text: 'x', pt: 10, bold: false, sapFont: { family: 'HELVE' } }, 'CENTER')).toMatchObject({ para: 'AA' });
  });

  it('protects & and < of a fixed text', () => {
    expect(literal('A&B <x>')).toBe('A<(>&<)>B <(><<)>x>');
  });

  it('turns a ruled box into a template with the text in its cell, a free text into a window one line above its baseline', () => {
    const layout = { page: { widthMm: 210, heightMm: 297, texts: [
      { x: 21, y: 25, w: 20, text: 'Label', pt: 10, bold: false, sapFont: { family: 'HELVE' } },
      { x: 120, y: 60, w: 30, text: 'Free text', pt: 10, bold: true, sapFont: { family: 'HELVE' } },
    ], lines: [
      { x1: 20, y1: 20, x2: 80, y2: 20, th: 0.26 }, { x1: 20, y1: 30, x2: 80, y2: 30, th: 0.26 },
      { x1: 20, y1: 20, x2: 20, y2: 30, th: 0.26 }, { x1: 80, y1: 20, x2: 80, y2: 30, th: 0.26 },
    ], rects: [] } };
    const { spec, report } = planForm(layout, STYLES, { form: 'ZTEST' });
    expect(report.templates).toBe(1);
    expect(report.inCells).toBe(1);
    const grid = spec.windows.find((w: any) => w.nodes[0]?.kind === 'template');
    expect(grid.x).toBe(20);
    const tp = grid.nodes[0];
    expect(tp.rows.every((r: any) => r.cols.reduce((s: number, c: number) => s + c, 0) === 60)).toBe(true);
    const free = spec.windows.find((w: any) => w.caption === 'Free text');
    expect(free.y).toBeCloseTo(60 - 25.4 / 6, 2);
    expect(free.nodes[0].lines[0]).toEqual({ f: 'AB', t: 'Free text' });
  });
});

describe('write-form', () => {
  it('cuts lines longer than 132 characters into = lines, never inside a tag', () => {
    expect(tdlines('-'.repeat(200)).map((l: string) => l.length)).toEqual([132, 68]);
    const parts = tdlines('a'.repeat(130) + '&GS_X-YY&');
    expect(parts[0]).toBe('a'.repeat(130));
  });

  it('writes windows (type T, frame in twips), output-option styles and table events', () => {
    const xml = writeForm({ form: 'ZTEST', style: 'ZTEST_STYLE', windows: [
      { name: 'W1', x: 10, y: 10, w: 50, h: 10, border: { th: 1 }, nodes: [{ kind: 'text', lines: [{ f: 'AA', t: 'Hi' }], style: 'ZOTHER' }] },
      { name: 'MAIN', type: 'M', x: 10, y: 30, w: 100, h: 100, nodes: [{ kind: 'table', data: 'IT_X', into: 'GS_X', lineTypes: [{ name: '%L1', cols: [50, 50] }], body: [{ type: '%L1', cells: [[{ kind: 'text', lines: [{ f: 'AA', t: '&GS_X-A&' }] }], []] }] }] },
    ] });
    expect(xml).toContain('<WTYPE>T</WTYPE>');
    expect(xml).toContain('<LEFTLINE>X</LEFTLINE><LEFTATTR><THICKNESS>20.00</THICKNESS><THICKNESSU>TW</THICKNESSU>');
    expect(xml).toContain('<STDSTYLE>ZOTHER</STDSTYLE>');
    expect(xml).toMatch(/<SECTTYPE>C<\/SECTTYPE><DATATYPE>L<\/DATATYPE><TABNAME>IT_X<\/TABNAME><TABHTYPE>I<\/TABHTYPE><TABHEADER>GS_X<\/TABHEADER>/);
    expect(xml).toContain('<EVTYPE>B</EVTYPE>');
    expect(xml).toContain('<T_LINETYPE>%L1</T_LINETYPE>');
  });
});

describe('compare-layout', () => {
  it('scores a print that matches its source 100 and a moved text half', () => {
    const page = { runs: [{ x: 10, y: 20, w: 20, text: 'Total', pt: 10, bold: false }], lines: [{ x1: 10, y1: 30, x2: 80, y2: 30 }], rects: [] };
    expect(compareLayouts(page, page).score).toBe(100);
    const moved = { ...page, runs: [{ ...page.runs[0], x: 15 }] };
    expect(compareLayouts(page, moved).textScore).toBe(50);
  });
});

describe('shape-form', () => {
  it('replaces a fixed text with a field, keeping the character format, and makes item rows a loop', () => {
    const spec = { form: 'ZT', style: 'S', windows: [
      { name: 'MAIN', type: 'M', x: 1, y: 1, w: 1, h: 1, nodes: [] },
      { name: '%TEXTWIN1', x: 0, y: 0, w: 50, h: 5, nodes: [{ kind: 'text', lines: [{ f: 'AB', t: '<C1>4500000001</>' }] }] },
      { name: '%WINDOW1', x: 10, y: 50, w: 100, h: 30, nodes: [{ kind: 'template', rows: [{ h: 5, cols: [20, 80] }, { h: 5, cols: [20, 80] }, { h: 5, cols: [20, 80] }],
        cells: [{ row: 1, col: 1, nodes: [{ kind: 'text', lines: [{ f: 'AB', t: 'Item' }] }] }, { row: 2, col: 1, borders: { l: 1 }, nodes: [{ kind: 'text', lines: [{ f: 'AA', t: '10' }] }] }] }] },
    ] };
    const { spec: out, report } = shapeForm(spec, {
      fields: [{ text: '4500000001', to: '&IS_HEAD-EBELN&' }],
      items: [{ window: '%WINDOW1', rows: [2, 3], data: 'IT_ITEMS', into: 'GS_ITEM', cells: { 1: '&GS_ITEM-POSNR&' } }],
      interface: [{ name: 'IS_HEAD', type: 'ZTEST_S_HEAD' }],
    });
    expect(report.notFound).toEqual([]);
    expect(out.windows.find((w: any) => w.name === '%TEXTWIN1').nodes[0].lines[0].t).toBe('<C1>&IS_HEAD-EBELN&</>');
    const main = out.windows.filter((w: any) => w.type === 'M');
    expect(main).toHaveLength(1);
    // header rows as a template, then the loop with the item row as a one-row template
    const [head, loop] = main[0].nodes;
    expect(head).toMatchObject({ kind: 'template', rows: [{ h: 5 }] });
    expect(loop).toMatchObject({ kind: 'loop', data: 'IT_ITEMS', into: 'GS_ITEM' });
    const row = loop.nodes[0];
    expect(row.rows).toHaveLength(1);
    expect(row.cells.find((c: any) => c.col === 1).nodes[0].lines[0].t).toBe('&GS_ITEM-POSNR&');
    // its top border is that of an inner item row (none), not the header's bottom line
    expect(row.cells.find((c: any) => c.col === 1).borders.t).toBe(0);
    expect(out.interface).toEqual([{ name: 'IS_HEAD', type: 'ZTEST_S_HEAD' }]);
  });
});
