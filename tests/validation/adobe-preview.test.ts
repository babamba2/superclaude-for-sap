import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs scripts, no type declarations
import { readContext, readInterface, readXdp, parseXml, unit } from '../../scripts/adobe/read-adobe.mjs';
// @ts-expect-error — plain .mjs script
import { buildRecord, toXmlValue, itfParagraphs, textsFromTables, evalConditions, ddicFromDdl, contextFields } from '../../scripts/adobe/adobe-data.mjs';
// @ts-expect-error — plain .mjs script
import { layoutForm, imageSize } from '../../scripts/adobe/adobe-layout.mjs';
// @ts-expect-error — plain .mjs script
import { formatValue } from '../../scripts/adobe/picture.mjs';
// @ts-expect-error — plain .mjs script
import { buildModel, renderHtml } from '../../scripts/adobe/build-adobe-preview.mjs';
// @ts-expect-error — plain .mjs script
import { scoreLayouts } from '../../scripts/adobe/score-forms.mjs';
// @ts-expect-error — plain .mjs script
import { parseDdl, parseDataElement } from '../../scripts/adobe/read-adobe-sap.mjs';
// @ts-expect-error — plain .mjs script
import { textWidthMm, VMETRICS } from '../../scripts/forms-common/metrics.mjs';

// Synthetic fixtures written for these tests (no SAP content). The expected positions follow the rules measured on
// SAP's ADS output (typo ascent 0.728 em, ascent + descent 0.938 em, 1.15 em lines, legacy 2.1 offsets).
const FIX = join(__dirname, '..', 'fixtures', 'adobe');
const read = (f: string) => readFileSync(join(FIX, f), 'utf8');
const PT = 25.4 / 72;
const EM10 = 10 * PT;
const close = (a: number, b: number, tol = 0.02) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);

const rows = Array.from({ length: 12 }, (_, i) => ({
  NAME: i === 3 ? 'HIDE' : `Item ${i + 1}`, DAT: `2026-01-${String(5 + i).padStart(2, '0')}`, AMT: i === 7 ? 0 : 1234.5 + i, CUR: 'EUR',
}));
const sampleA = { values: { TITLE: 'Order list', ITEMS: rows }, ddic: { 'ITEMS-AMT': { type: 'CURR', length: 15, decimals: 2 } } };

function modelA(sample: unknown = sampleA) {
  return buildModel({ formXml: read('synth-a.form.xml'), interfaceXml: read('synth-a.interface.xml'), layoutXdp: read('synth-a.layout.xdp') }, sample);
}
const texts = (page: any) => page.items.filter((t: any) => t.type === 'text');

describe('adobe-preview: readers', () => {
  it('reads the context tree, inactive nodes and WHERE conditions', () => {
    const { context, interface: ifn } = readContext(read('synth-a.form.xml'));
    expect(ifn).toBe('ZTEST_IF_A');
    expect(context.children.map((c: any) => `${c.kind}:${c.name}`)).toEqual(['data:TITLE', 'loop:ITEMS', 'text-module:FOOT']);
    const loop = context.children[1];
    expect(loop.where).toEqual([{ lop: '', op1: 'AMT', cop: 'NE', op2: 'INITIAL' }]);
    expect(loop.children[0].children.map((c: any) => [c.name, c.active])).toEqual([['NAME', true], ['DAT', true], ['AMT', true], ['MANDT', false]]);
    expect(contextFields(context).map((f: any) => f.path)).toEqual(['TITLE', 'ITEMS.DATA.NAME', 'ITEMS.DATA.DAT', 'ITEMS.DATA.AMT', 'FOOT']);
  });

  it('reads interface parameters, globals, references and coding', () => {
    const i = readInterface(read('synth-a.interface.xml'));
    expect(i.params.map((p: any) => [p.name, p.type, p.optional])).toEqual([['TITLE', 'C', false], ['ITEMS', 'ZTEST_T_ITEM', true]]);
    expect(i.globals[0].name).toBe('GV_TOTAL');
    expect(i.references).toEqual([{ datatype: 'CURR', value: 'ITEMS-AMT', unit: 'ITEMS-CUR' }]);
    expect(i.coding.init[0]).toContain('sum');
  });

  it('keeps mixed content in order and converts units', () => {
    const x = parseXml('<p>a<b>b</b>c</p>');
    expect(x.children[0].children.map((c: any) => c.tag === '#text' ? c.text : `<${c.tag}>`)).toEqual(['a', '<b>', 'c']);
    expect(unit('2cm')).toBe(20);
    close(unit('1in'), 25.4);
    close(unit('72pt'), 25.4);
    expect(readXdp(read('synth-a.layout.xdp')).template.tag).toBe('template');
  });

  it('parses DDL structures (multi-line foreign keys) and data elements', () => {
    const ddl = 'define table ztest {\n  key mandt : mandt not null\n    with foreign key t000\n      where mandt = ztest.mandt;\n  @EndUserText.label : \'x\'\n  amount : abap.curr(15,2);\n  name : ztest_name;\n}';
    expect(parseDdl(ddl)).toEqual({ MANDT: { element: 'MANDT' }, AMOUNT: { type: 'CURR', length: 15, decimals: 2 }, NAME: { element: 'ZTEST_NAME' } });
    expect(ddicFromDdl('define structure s {\n  n : abap.numc(10);\n}')).toEqual({ N: { type: 'NUMC', length: 10, decimals: 0 } });
    expect(parseDataElement('<x><dtel:dataType>CHAR</dtel:dataType><dtel:dataTypeLength>000025</dtel:dataTypeLength><dtel:dataTypeDecimals>000000</dtel:dataTypeDecimals></x>'))
      .toEqual({ type: 'CHAR', length: 25, decimals: 0 });
  });
});

describe('adobe-preview: data XML values', () => {
  it('converts sample values the way the generated function module writes them', () => {
    expect(toXmlValue('123', { ddic: { type: 'NUMC', length: 10 } })).toBe('0000000123');
    expect(toXmlValue('0815', { ddic: { type: 'NUMC', length: 1 } })).toBe('5');
    expect(toXmlValue(99.95, { ddic: { type: 'DEC', length: 8, decimals: 0 } })).toBe('100');
    expect(toXmlValue(1234.5, { ddic: { type: 'DEC', length: 10, decimals: 3 } })).toBe('1234.500');
    expect(toXmlValue(89013, { currency: 'JPY', ddic: { type: 'CURR', decimals: 2 } })).toBe('8901300');
    expect(toXmlValue(1500.75, { currency: 'EUR', ddic: { type: 'CURR', decimals: 3 } })).toBe('15007.50');
    expect(toXmlValue('E', { ddic: { type: 'LANG' } })).toBe('EN');
    expect(toXmlValue('Too long a name', { ddic: { type: 'CHAR', length: 8 } })).toBe('Too long');
    expect(toXmlValue('20260131')).toBe('2026-01-31');
  });

  it('joins SAPscript lines and maps SmartStyle paragraphs', () => {
    const p = itfParagraphs([{ f: 'FT', t: '' }, { f: '/', t: 'line one ends' }, { f: '', t: 'with a blank' }, { f: '=', t: 'NO-BLANK' }, { f: 'SD', t: 'second' }],
      { FT: { pt: 6, align: 'center', family: 'Helvetica' }, SD: { pt: 6, underline: true } });
    expect(p).toEqual([
      { text: '\nline one ends with a blankNO-BLANK', style: 'font-family:Helvetica;font-size:6pt;text-align:center' },
      { text: 'second', style: 'font-size:6pt;text-decoration:underline' },
    ]);
    const t = textsFromTables([{ FORMNAME: 'ZT', LINENR: '000001', TDFORMAT: 'FT', TDLINE: 'a' }], [{ TDPARGRAPH: 'FT', TDPJUSTIFY: 'CENTER', TDFAMILY: 'HELVE', TDHEIGHT: '080' }]);
    expect(t.ZT.formats.FT).toMatchObject({ family: 'Helvetica', pt: 8, align: 'center' });
  });

  it('evaluates node conditions: AND inside a group, OR between groups', () => {
    const scope = { lookup: (k: string) => ({ 'A': 'X', 'B': '' } as Record<string, string>)[k] };
    expect(evalConditions([{ op1: 'A', cop: 'EQ', op2: "'X'" }, { op1: 'B', cop: 'NE', op2: 'INITIAL' }], scope)).toBe(false);
    expect(evalConditions([{ op1: 'A', cop: 'EQ', op2: "'Y'" }, { lop: 'OR', op1: 'B', cop: 'EQ', op2: 'INITIAL' }], scope)).toBe(true);
  });

  it('builds the record: loops with WHERE, inactive nodes left out, missing text modules reported', () => {
    const { context } = readContext(read('synth-a.form.xml'));
    const { record, missingTexts } = buildRecord(context, sampleA, { references: readInterface(read('synth-a.interface.xml')).references });
    const items = record.children.find((c: any) => c.name === 'ITEMS');
    expect(items.children).toHaveLength(11); // AMT 0 left out by the WHERE condition
    expect(items.children[0].children.map((c: any) => c.name)).toEqual(['NAME', 'DAT', 'AMT']);
    expect(items.children[0].children[2].value).toBe('1234.50');
    expect(missingTexts).toEqual(['ZTEST_FOOTER']);
  });
});

describe('adobe-preview: pictures', () => {
  it('formats dates, times and numbers like ADS (en_US defaults, picture clauses)', () => {
    expect(formatValue('2026-01-03', { type: 'date' })).toBe('Jan 3, 2026');
    expect(formatValue('14:30:00', { type: 'time' })).toBe('2:30:00 PM');
    expect(formatValue('08:05:00', { type: 'time', picture: 'HH:MM' })).toBe('08:05');
    expect(formatValue('2026-12-24', { type: 'date', picture: 'date{DD.MM.YYYY}' })).toBe('24.12.2026');
    expect(formatValue('1243.25', { type: 'decimal', picture: 'zzz,zzz,zz9.888' }).trim()).toBe('1,243.25');
    expect(formatValue('830.50', { type: 'decimal', fracDigits: -1 })).toBe('830.50');
    expect(formatValue('830.50', { type: 'decimal' })).toBe('830.5');
    expect(formatValue('8901300', { type: 'decimal', fracDigits: -1 })).toBe('8,901,300');
    expect(formatValue('4711', { type: 'integer' })).toBe('4,711');
  });
});

describe('adobe-preview: layout (XFA 2.4)', () => {
  const m = modelA();

  it('paginates the table with the overflow leader and runs the FormCalc script', () => {
    expect(m.pages).toHaveLength(2);
    const all = m.pages.flatMap((p: any) => texts(p).map((t: any) => t.text));
    expect(all.filter((t: string) => t === 'Name')).toHaveLength(2); // header repeated on page 2
    expect(all).not.toContain('HIDE'); // hidden by the script
    expect(all.filter((t: string) => /^Item \d+$/.test(t))).toHaveLength(10);
    expect(m.missingTexts).toEqual(['ZTEST_FOOTER']);
  });

  it('places field values on the measured baselines', () => {
    const p1 = texts(m.pages[0]);
    const title = p1.find((t: any) => t.text === 'Order list');
    // field h 10, no margins, middle: (10 - 0.938 em) / 2 + 0.728 em, 12 pt
    close(title.y, 30 + (10 - 0.938 * 12 * PT) / 2 + 0.728 * 12 * PT);
    const item1 = p1.find((t: any) => t.text === 'Item 1');
    // table at 40 (+0.2 mm border is drawn, not an inset), header row 8 mm, row cell 1 mm margins
    close(item1.y, 48 + 1 + (6 - 0.938 * EM10) / 2 + 0.728 * EM10);
    close(item1.x, 21);
    expect(item1.role).toBe('field');
    expect(item1.row).toBe(true);
    const date = p1.find((t: any) => t.text === 'Jan 5, 2026');
    close(date.x, 61);
    const amt = p1.find((t: any) => t.text === '1,234.50');
    // radix: the integer part ends radixOffset (10 mm) left of the content's right edge (130 - 1)
    close(amt.x + textWidthMm('1,234', 10), 119);
  });

  it('draws master content, embedded page numbers and the page count', () => {
    const p1 = texts(m.pages[0]);
    const head = p1.find((t: any) => t.text === 'Sample Company Header');
    close(head.y, 10 + 0.728 * 12 * PT);
    expect(head.bold).toBe(true);
    const pg = p1.find((t: any) => /^Page/.test(t.text));
    // ADS keeps the spacerun blank and the collapsed line break after it: two blanks (SAP prints "Page  1 /  39")
    expect(pg.text).toBe('Page  1 / 2');
    close(pg.x + textWidthMm('Page  1 / 2', 10), 190); // right aligned, trailing blanks not counted
    expect(texts(m.pages[1]).find((t: any) => /^Page/.test(t.text)).text).toBe('Page  2 / 2');
  });

  it('renders SVG pages with inspect attributes', () => {
    const html = renderHtml(m, { inspect: true });
    expect((html.match(/<section class="page"/g) || []).length).toBe(2);
    expect(html).toContain('data-som="data[0].Main[0].Items[0].Row[0].NAME[0]"');
    expect(html).toContain('id="sf-index"');
    expect(html).toContain('font-kerning:none');
  });
});

describe('adobe-preview: layout (XFA 2.1 legacy)', () => {
  const { template } = readXdp(read('synth-b.layout.xdp'));
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]).copy(png);
  png.writeUInt32BE(2, 16); png.writeUInt32BE(4, 20);
  const record = { name: 'data', children: [{ name: 'CODE', value: 'A-100' }, { name: 'LOGO', value: png.toString('base64'), image: true }] };
  const out = layoutForm(template, record, {});
  const t = texts(out.pages[0]);

  it('starts top-aligned text a line gap down and counts whole 1.15 em lines', () => {
    const intro = t.find((x: any) => x.text === 'Legacy start text');
    close(intro.y, 20 + (VMETRICS.gap + VMETRICS.ascent) * EM10);
  });

  it('puts legacy field values 1 pt in and 1/8 em lower, centered on line boxes', () => {
    const posTop = 20 + VMETRICS.line * EM10 + 6 * PT; // intro: one line + spaceBelow
    const val = t.find((x: any) => x.text === 'A-100');
    close(val.x, 10 + 1 + 25 + PT);
    close(val.y, posTop + 1 + (7 - VMETRICS.line * EM10) / 2 + (VMETRICS.gap + VMETRICS.ascent + 0.125) * EM10);
    const cap = t.find((x: any) => x.text === 'Code');
    close(cap.x, 11);
    close(cap.y, val.y);
  });

  it('fits images by aspect and draws rounded boxes', () => {
    expect(imageSize(png.toString('base64'))).toMatchObject({ mime: 'image/png', w: 2, h: 4 });
    const img = out.pages[0].items.find((x: any) => x.type === 'image');
    close(img.w, 15); close(img.h, 30); close(img.x, 110);
    const box = out.pages[0].items.find((x: any) => x.type === 'rect' && x.stroke);
    expect(box).toMatchObject({ x: 120, y: 10, w: 60, h: 20, r: 3 });
  });
});

describe('adobe-preview: score v2', () => {
  const page = (dx = 0, extra = false) => ({
    texts: [{ x: 20 + dx, y: 30, w: 10, text: 'Fixed', pt: 10, bold: false }, { x: 20 + dx, y: 40, w: 10, text: '42', pt: 10, bold: false },
      ...(extra ? [{ x: 100, y: 100, w: 10, text: 'Ghost', pt: 10, bold: false }] : [])],
    lines: [{ x1: 20, y1: 50, x2: 120, y2: 50, th: 0.2 }], rects: [], images: [{ x: 10, y: 10, w: 20, h: 20 }],
  });
  const model = { pages: [{ items: [{ type: 'text', x: 20, y: 30, text: 'Fixed', role: 'fixed' }, { type: 'text', x: 20, y: 40, text: '42', role: 'field', row: true }] }] };

  it('scores identical layouts as full marks', () => {
    const r = scoreLayouts({ pages: [page()] }, { pages: [page()] }, { model });
    expect(r.metrics).toMatchObject({ P1mm: 1, P2mm: 1, FIELD: 1, FIXED: 1, PAGES: 1, ROWBRK: 1, FONT: 1, RULE: 1, IMG: 1, EXTRA: 0 });
    expect(r.passed).toBe(true);
  });

  it('separates 1 mm and 2 mm, counts extra texts and page differences', () => {
    const r = scoreLayouts({ pages: [page()] }, { pages: [page(1.5, true), page()] }, { model });
    expect(r.metrics.P1mm).toBe(0);
    expect(r.metrics.P2mm).toBe(1);
    expect(r.metrics.EXTRA).toBe(1 + 2); // the ghost text + the second page's texts
    expect(r.metrics.PAGES).toBe(0);
    expect(r.passed).toBe(false);
    expect(r.failures.P1mm[0]).toMatchObject({ text: 'Fixed', error: 1.5 });
  });

  it('marks unreadable pages as not measurable instead of zero', () => {
    const r = scoreLayouts({ pages: [{ error: 'bad stream' }] }, { pages: [page()] }, {});
    expect(r.notMeasurable).toEqual([{ page: 1, error: 'bad stream' }]);
    expect(r.passed).toBe(false);
  });
});
