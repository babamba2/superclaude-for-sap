import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error — plain .mjs scripts, no type declarations
import { readContext, readInterface, readXdp, parseXml, unit } from '../../scripts/adobe/read-adobe.mjs';
// @ts-expect-error — plain .mjs script
import { buildRecord, toXmlValue, itfParagraphs, textsFromTables, evalConditions, ddicFromDdl, contextFields, runInitCoding } from '../../scripts/adobe/adobe-data.mjs';
// @ts-expect-error — plain .mjs script
import { layoutForm, imageSize, tabStops } from '../../scripts/adobe/adobe-layout.mjs';
// @ts-expect-error — plain .mjs script
import { formatValue } from '../../scripts/adobe/picture.mjs';
// @ts-expect-error — plain .mjs script
import { buildModel, renderHtml, recordFromXml, buildModelXdp, withOffPage } from '../../scripts/adobe/build-adobe-preview.mjs';
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

  it('treats a context folder as a data group with its condition', () => {
    const xml = '<?xml version="1.0"?><asx:abap xmlns:asx="http://www.sap.com/abapxml"><asx:values><INTERFACE>ZT</INTERFACE><CONTEXT href="#o1"/></asx:values><asx:heap xmlns:cls="x">'
      + '<cls:CL_FP_CONTEXT id="o1"><CL_FP_NODE><NAME>CONTEXT</NAME><STATE>A</STATE><CONDITION/><CHILD href="#o2"/></CL_FP_NODE></cls:CL_FP_CONTEXT>'
      + '<cls:CL_FP_FOLDER id="o2"><CL_FP_NODE><NAME>WIN1</NAME><STATE>A</STATE><CONDITION href="#c2"/><SUCCESSOR href="#o4"/><CHILD href="#o3"/></CL_FP_NODE><CL_FP_FOLDER/></cls:CL_FP_FOLDER>'
      + '<cls:CL_FP_CONDITION id="c2"><CL_FP_CONDITION><CONDITIONS><SFPCONDITION><LOPERATOR/><OPERAND1>FLAG</OPERAND1><COPERATOR>EQ</COPERATOR><OPERAND2>\'X\'</OPERAND2></SFPCONDITION></CONDITIONS></CL_FP_CONDITION></cls:CL_FP_CONDITION>'
      + '<cls:CL_FP_DATA id="o3"><CL_FP_NODE><NAME>NAME</NAME><STATE>A</STATE><CONDITION/><CHILD/></CL_FP_NODE><CL_FP_DATA><FIELD>NAME</FIELD></CL_FP_DATA></cls:CL_FP_DATA>'
      + '<cls:CL_FP_FOLDER id="o4"><CL_FP_NODE><NAME>WIN2</NAME><STATE>A</STATE><CONDITION href="#c4"/><CHILD/></CL_FP_NODE><CL_FP_FOLDER/></cls:CL_FP_FOLDER>'
      + '<cls:CL_FP_CONDITION id="c4"><CL_FP_CONDITION><CONDITIONS><SFPCONDITION><LOPERATOR/><OPERAND1>FLAG</OPERAND1><COPERATOR>NE</COPERATOR><OPERAND2>\'X\'</OPERAND2></SFPCONDITION></CONDITIONS></CL_FP_CONDITION></cls:CL_FP_CONDITION>'
      + '</asx:heap></asx:abap>';
    const { context } = readContext(xml);
    expect(context.children.map((c: any) => c.kind)).toEqual(['folder', 'folder']);
    const { record } = buildRecord(context, { values: { FLAG: 'X', NAME: 'Sample' } });
    expect(record.children).toEqual([{ name: 'WIN1', children: [{ name: 'NAME', value: 'Sample', field: 'NAME' }] }]);
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
    // HELVE is Arial in the XHTML SAP's form runtime hands ADS (FP_TEST_01 data XML, style S_TEST)
    expect(t.ZT.formats.FT).toMatchObject({ family: 'Arial', pt: 8, align: 'center' });
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
  const record = { name: 'data', children: [{ name: 'CODE', value: 'A-100' }, { name: 'TINY', value: 'B-200' }, { name: 'LOGO', value: png.toString('base64'), image: true }] };
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

  it('starts a legacy field value 1/32 inch down when its line box does not fit the box', () => {
    const posTop = 20 + VMETRICS.line * EM10 + 6 * PT;
    const tiny = t.find((x: any) => x.text === 'B-200');
    // h 5, margins 1: 3 mm < one 1.15 em line (4.06 mm) → top-aligned 1/32 inch below the content top
    close(tiny.y, posTop + 12 + 1 + 25.4 / 32 + (VMETRICS.gap + VMETRICS.ascent + 0.125) * EM10);
  });

  it('fits images by aspect and draws rounded boxes', () => {
    expect(imageSize(png.toString('base64'))).toMatchObject({ mime: 'image/png', w: 2, h: 4 });
    const img = out.pages[0].items.find((x: any) => x.type === 'image');
    close(img.w, 15); close(img.h, 30); close(img.x, 110);
    const box = out.pages[0].items.find((x: any) => x.type === 'rect' && x.stroke);
    expect(box).toMatchObject({ x: 120, y: 10, w: 60, h: 20, r: 3 });
  });
});

describe('adobe-preview: SmartForm migration rich text (CSS divs, tabs, SOM embeds)', () => {
  const { template } = readXdp(read('synth-c.layout.xdp'));
  const record = { name: 'data', children: [
    { name: 'CUSTOMER', children: [{ name: 'NAME', value: 'Example Ltd' }, { name: 'AMOUNT', value: '1234.50' }] },
    { name: 'ITEMS', children: ['First', 'Second', 'Third'].map((n, i) => ({ name: 'WA', children: [{ name: 'NAME', value: n }, { name: 'DAT', value: `2027-03-1${i}` }] })) },
  ] };
  const out = layoutForm(template, record, { today: '2026-01-31' });
  const t = texts(out.pages[0]);
  const at = (s: string) => t.find((x: any) => x.text === s);

  it('reads "prop : value ;" CSS: fonts, line-height, margins; Courier is monospaced', () => {
    expect(tabStops('left 3.5cm decimal 4cm right 8cm')).toEqual([{ align: 'left', pos: 35 }, { align: 'decimal', pos: 40 }, { align: 'right', pos: 80 }]);
    expect(at('Clerk')).toMatchObject({ pt: 8, font: 'Arial' });
    expect(at('Mr. Sample')).toMatchObject({ pt: 12, font: 'Courier New' });
    close(textWidthMm('abc', 10, { face: 'Courier New' }), 3 * 0.6 * EM10);
    // the first paragraph is one 5 mm line (its own line-height); a CSS line-height L up to 1.25 × the line's
    // largest pitch n adds L − n above the text, down to the ascender; a larger L is not applied (calibration
    // rounds 1–3, ADS on S/4; the fonts of a line = its runs plus the paragraph font on all but the draw's last line):
    // line 1 Arial 8 pt + Courier 12 pt (n 1.2 em of 12 pt) at 5 mm → Courier ascent − 0.08 mm, not above the
    // Courier ascender; line 2 Courier 10 pt values + Arial 10 pt paragraph at 6 mm > 1.25 × 4.23 mm → the Arial ascent
    const l1 = Math.max(0.654 * 12 * PT + (5 - 1.2 * 12 * PT), 0.629 * 12 * PT);
    const l2 = 0.728 * 10 * PT;
    close(at('1234.50').y - at('Clerk').y, 5 + l2 - l1);
  });

  it('places tab stops: left, decimal (radix on the stop) and right, relative to the paragraph margin', () => {
    close(at('Mr. Sample').x, 20 + 35);
    // embedded by SOM path: the value prints in its field's font — no <font>, so the XFA default Courier 10 pt
    expect(at('1234.50')).toMatchObject({ pt: 10, font: 'Courier' });
    close(at('1234.50').x + textWidthMm('1234', 10, { face: 'Courier' }), 20 + 2 + 40);
    close(at('Example Ltd').x + textWidthMm('Example Ltd', 10, { face: 'Courier' }), 20 + 2 + 80);
    expect(at('1234.50').role).toBe('field');
  });

  it('keeps hidden spans out but their room in, raises superscript, reports the default tab distance', () => {
    expect(t.some((x: any) => /HIDDEN/.test(x.text))).toBe(false);
    const a = t.find((x: any) => x.text === 'A');
    const b = t.find((x: any) => x.text === 'B');
    close(b.x, a.x + textWidthMm('AHIDDEN', 10));
    expect(t.find((x: any) => x.text === '2').y).toBeLessThan(b.y);
    expect(out.report.approximations.join(' ')).toMatch(/default distance 12.7 mm/);
    expect(out.report.approximations.join(' ')).toMatch(/superscript/);
    const c = t.find((x: any) => x.text === 'C');
    close(c.x, 20 + 12.7 * Math.ceil((textWidthMm('AHIDDENB2', 10) + 0.001) / 12.7));
  });
});

describe('adobe-preview: repeated rows with absolute [*] paths, FormCalc date patterns', () => {
  const { template } = readXdp(read('synth-c.layout.xdp'));
  const record = { name: 'data', children: [
    { name: 'CUSTOMER', children: [{ name: 'NAME', value: 'X' }, { name: 'AMOUNT', value: '1' }] },
    { name: 'ITEMS', children: ['First', 'Second', 'Third'].map((n, i) => ({ name: 'WA', children: [{ name: 'NAME', value: n }, { name: 'DAT', value: `2027-03-1${i}` }] })) },
  ] };
  const out = layoutForm(template, record, { today: '2026-01-31' });
  const all = texts(out.pages[0]).map((x: any) => x.text);

  it('gives every instance its own row: $record.ITEMS.WA[*].NAME inside WA[i] → WA[i]', () => {
    expect(all.filter((s: string) => ['First', 'Second', 'Third'].includes(s))).toEqual(['First', 'Second', 'Third']);
  });

  it('reports a locale without tables instead of using en_US silently', () => {
    const ko = layoutForm(template, record, { today: '2026-01-31', locale: 'ko_KR' });
    expect(ko.report.approximations.join(' ')).toMatch(/locale ko_KR: no date \/ number tables here — en_US patterns used/);
    expect(ko.report.approximations.join(' ')).toMatch(/locale ko_KR: no date \/ time patterns here/);
    expect(out.report.approximations.join(' ')).not.toMatch(/locale/);
  });

  it('reports time() as an approximation (no silent 00:00)', () => {
    const tpl = readXdp(read('synth-c.layout.xdp').replace('$ = Num2Date( date(), $.format.picture );', '$ = Num2Time( time(), TimeFmt(1) );')).template;
    const r = layoutForm(tpl, record, { today: '2026-01-31' });
    expect(r.report.approximations.join(' ')).toMatch(/time\(\): 00:00:00 used/);
    expect(texts(r.pages[0]).map((x: any) => x.text)).toContain('12:00 AM');
  });

  it('runs DateFmt / Num2Date / date() and $.format.picture, also in master content', () => {
    expect(all).toEqual(expect.arrayContaining(['3/10/27', '3/11/27', '3/12/27']));
    expect(all).toContain('Jan 31, 2026'); // the master field: Num2Date(date(), DateFmt(2)) with the sample date
    expect(out.report.approximations.join(' ')).not.toMatch(/not run|ui.picture|toolTip/);
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

  it('leaves lines in a fallback font out on both sides and lists them', () => {
    const ref = { pages: [{ texts: [{ x: 20, y: 50, w: 20, text: 'Total ß', pt: 10, font: 'Helvetica' }, { x: 41, y: 50, w: 1, text: '€', pt: 10, font: 'MyriadPro-Regular' }, { x: 43, y: 50, w: 5, text: '100', pt: 10, font: 'Helvetica' }, { x: 20, y: 30, w: 10, text: 'Fixed', pt: 10, font: 'Helvetica' }], lines: [], rects: [], images: [] }] };
    const cand = { pages: [{ texts: [{ x: 20, y: 49.9, w: 30, text: 'Total ß € 100', pt: 10 }, { x: 20, y: 30, w: 10, text: 'Fixed', pt: 10 }], lines: [], rects: [], images: [] }] };
    const r = scoreLayouts(ref, cand, {});
    expect(r.metrics).toMatchObject({ P1mm: 1, EXTRA: 0 });
    expect(r.excluded).toEqual([{ page: 1, y: 50, text: 'Total ß € 100', font: 'MyriadPro-Regular', reason: 'reference uses a fallback font on this line' }]);
    expect(r.counts.excluded).toBe(1);
  });

  it('never excludes a page set in another font, and measuring nothing is no pass', () => {
    const line = (y: number, text: string, font: string, x = 20) => ({ x, y, w: 30, text, pt: 10, font });
    // a whole form in a non-listed font: nothing excluded, a wrong candidate fails
    const ko = { pages: [{ texts: [line(30, '주문서', 'ABCDEF+MalgunGothic'), line(40, '품목', 'ABCDEF+MalgunGothic'), line(50, '금액', 'ABCDEF+MalgunGothic-Bold')], lines: [], rects: [], images: [] }] };
    const wrong = { pages: [{ texts: [line(30, 'other', 'Arial', 90), line(40, 'texts', 'Arial', 90), line(50, 'here', 'Arial', 90)], lines: [], rects: [], images: [] }] };
    const r1 = scoreLayouts(ko, wrong, {});
    expect(r1.excluded).toEqual([]);
    expect(r1.passed).toBe(false);
    // no reference text at all → not measurable
    const r2 = scoreLayouts({ pages: [{ texts: [], lines: [], rects: [], images: [] }] }, { pages: [{ texts: [], lines: [], rects: [], images: [] }] }, {});
    expect(r2.notMeasurable[0].error).toMatch(/no reference text/);
    expect(r2.passed).toBe(false);
    // more than a tenth of the lines excluded → not measurable
    const mixed = (y: number) => [line(y, 'Total', 'Helvetica'), line(y, '€', 'MyriadPro-Regular', 40)];
    const ref3 = { pages: [{ texts: [...mixed(30), ...mixed(40), line(50, 'Fine', 'Helvetica')], lines: [], rects: [], images: [] }] };
    const r3 = scoreLayouts(ref3, { pages: [{ texts: [line(50, 'Fine', 'Arial')], lines: [], rects: [], images: [] }] }, {});
    expect(r3.counts.excluded).toBe(2);
    expect(r3.notMeasurable[0].error).toMatch(/more than 10 %/);
    expect(r3.passed).toBe(false);
  });

  it('keeps a deliberate short value in another font measured (only beyond-Latin-1 substitutions are excluded)', () => {
    const line = (y: number, text: string, font: string, x = 20) => ({ x, y, w: 10, text, pt: 10, font });
    const ref = { pages: [{ texts: [line(30, 'Qty', 'Helvetica'), line(30, '12', 'Courier', 60), line(40, 'Fine', 'Helvetica')], lines: [], rects: [], images: [] }] };
    const cand = { pages: [{ texts: [line(30, 'Qty', 'Arial'), line(30, '99', 'Courier', 90), line(40, 'Fine', 'Arial')], lines: [], rects: [], images: [] }] };
    const r = scoreLayouts(ref, cand, {});
    expect(r.excluded).toEqual([]);
    expect(r.passed).toBe(false);
    expect(r.failures.P1mm.map((f: any) => f.text)).toContain('12');
  });

  it('marks unreadable pages as not measurable instead of zero', () => {
    const r = scoreLayouts({ pages: [{ error: 'bad stream' }] }, { pages: [page()] }, {});
    expect(r.notMeasurable).toEqual([{ page: 1, error: 'bad stream' }]);
    expect(r.passed).toBe(false);
  });
});

describe('adobe-preview: layouts SAP migration writes (div rich text without body, row cells without columnWidths, lr-tb)', () => {
  const xdp = (body: string) => `<?xml version="1.0" encoding="utf-8"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform layout="tb" name="data"><pageSet><pageArea name="P1"><contentArea x="20mm" y="20mm" w="170mm" h="250mm"/>
<medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>${body}</subform></template></xdp:xdp>`;
  const rich = (name: string, w: string, text: string) => `<draw name="${name}" w="${w}"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml"><div style=" font-family : 'Arial' ; font-size : 10pt ;">${text}</div></div></exData></value><ui><textEdit multiLine="1"/></ui></draw>`;
  const run = (body: string) => texts(layoutForm(readXdp(xdp(body)).template, { name: 'data', children: [] }, {}).pages[0]);

  it('reads XHTML div paragraphs straight under exData (no body element)', () => {
    expect(run(`<subform layout="tb" name="S" w="170mm">${rich('T', '100mm', 'Dear customer')}</subform>`).map((t: any) => t.text)).toEqual(['Dear customer']);
  });

  it('gives a row cell its own width when the table has no columnWidths', () => {
    const t = run(`<subform layout="table" name="TAB" w="170mm"><subform layout="row" name="R">${rich('A', '30mm', 'Left')}${rich('B', '50mm', 'Right')}</subform></subform>`);
    close(t.find((x: any) => x.text === 'Right').x - t.find((x: any) => x.text === 'Left').x, 30);
  });

  it('flows lr-tb children left to right and starts a new line for a child that does not fit', () => {
    const t = run(`<subform layout="lr-tb" name="F" w="100mm">${rich('A', '60mm', 'One')}${rich('B', '30mm', 'Two')}${rich('C', '30mm', 'Three')}</subform>`);
    const one = t.find((x: any) => x.text === 'One'), two = t.find((x: any) => x.text === 'Two'), three = t.find((x: any) => x.text === 'Three');
    close(two.x - one.x, 60);
    close(two.y, one.y);
    close(three.x, one.x);
    expect(three.y).toBeGreaterThan(one.y + 3);
  });
});

describe('adobe-preview: ADS rules measured on the calibration form and on migrated SmartForms', () => {
  const xdp = (body: string, ver = '2.8') => `<?xml version="1.0" encoding="utf-8"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/${ver}/">
<subform layout="tb" name="data"><pageSet><pageArea name="P1"><contentArea x="20mm" y="20mm" w="170mm" h="250mm"/>
<medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>${body}</subform></template></xdp:xdp>`;
  const div = (css: string, inner: string) => `<div style=" ${css}">${inner}</div>`;
  const draw = (name: string, inner: string, w = '150mm') => `<draw name="${name}" w="${w}"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml">${inner}</div></exData></value><ui><textEdit multiLine="1"/></ui></draw>`;
  const run = (body: string, ver?: string) => texts(layoutForm(readXdp(xdp(body, ver)).template, { name: 'data', children: [] }, {}).pages[0]);
  const by = (t: any[], s: string) => t.find((x: any) => x.text === s);
  const cour12 = "font-family : 'Courier New' ; font-size : 12pt ; line-height : 4.23mm ;";

  it('prints a wrapper div with child divs as the child lines only', () => {
    const t = run(`<subform layout="tb" name="S" w="150mm">${draw('D', div(cour12, 'One') + div(cour12, 'Two'))}</subform>`);
    // Courier 12 pt at 4.23 mm: the first baseline is the Courier ascender (0.629 em), the second one line lower
    close(by(t, 'One').y, 20 + 0.629 * 12 * PT);
    close(by(t, 'Two').y - by(t, 'One').y, 4.23);
  });

  it('applies a later paragraph margin-top exactly (+1.61 mm, -2 mm)', () => {
    const t = run(`<subform layout="tb" name="S" w="150mm">${draw('D', div(cour12, 'A') + div(`${cour12} margin-top : 1.61mm ;`, 'B') + div(`${cour12} margin-top : -2mm ;`, 'C'))}</subform>`);
    close(by(t, 'B').y - by(t, 'A').y, 4.23 + 1.61);
    close(by(t, 'C').y - by(t, 'B').y, 4.23 - 2);
  });

  it('uses per-face pitch and ascent for plain draws: Courier 1.2 em, Times 1.111 em, Arial / Helvetica 1.1376 em', () => {
    const plain = (n: string, face: string, y: number) => `<draw name="${n}" x="0mm" y="${y}mm" w="150mm" h="12mm"><ui><textEdit multiLine="1"/></ui><value><text>${n} one\n${n} two</text></value><font typeface="${face}" size="10pt"/><margin topInset="0mm" bottomInset="0mm" leftInset="0mm" rightInset="0mm"/></draw>`;
    const t = run(`<subform layout="position" name="S" w="170mm" h="100mm">${plain('C', 'Courier New', 0)}${plain('T', 'Times New Roman', 20)}${plain('H', 'Helvetica', 40)}</subform>`);
    close(by(t, 'C one').y, 20 + 0.654 * EM10); close(by(t, 'C two').y - by(t, 'C one').y, 1.2 * EM10);
    close(by(t, 'T one').y, 40 + 0.709 * EM10); close(by(t, 'T two').y - by(t, 'T one').y, 1.111 * EM10);
    close(by(t, 'H two').y - by(t, 'H one').y, 1.1376 * EM10);
  });

  it('counts a CSS line-height against the paragraph font, not the run font', () => {
    // an Arial 8 pt run in a Courier 10 pt paragraph at 4.23 mm (= Courier 10 pt's pitch) sits at the Arial ascent
    const t = run(`<subform layout="tb" name="S" w="150mm">${draw('D', div("font-family : 'Courier New' ; font-size : 10pt ; line-height : 4.23mm ;", "<span style=\" font-family : 'Arial' ; font-size : 8pt ;\">Label</span>"))}</subform>`);
    close(by(t, 'Label').y, 20 + 0.728 * 8 * PT);
  });

  it('opens no line for a <br/> that ends a block, and reads tab-stops as well as tab-stop', () => {
    const t = run(`<subform layout="tb" name="S" w="150mm">${draw('D', div(`${cour12} tab-stops : left 3.50cm ;`, 'Head<br/><br/>') + div(`${cour12} tab-stops : left 3.50cm ;`, "Key<span style=\"xfa-tab-count : 1 ;\"/>Value"))}</subform>`);
    close(by(t, 'Key').y - by(t, 'Head').y, 2 * 4.23);
    close(by(t, 'Value').x - by(t, 'Key').x, 35);
  });

  it('gives a positioned subform of hidden fields one em of their font (Courier 10 pt by default)', () => {
    const t = run(`<subform layout="lr-tb" name="S" w="80mm"><subform name="H"><field name="F" presence="hidden"><ui><textEdit/></ui></field></subform>${draw('D', div(cour12, 'Below'), '80mm')}</subform>`);
    close(by(t, 'Below').y, 20 + EM10 + 0.629 * 12 * PT);
  });

  it('grows an lr-tb container without a width sideways instead of wrapping', () => {
    const t = run(`<subform layout="lr-tb" name="MAIN">${draw('A', div(cour12, 'Intro'), '160mm')}${draw('B', div(cour12, 'Table'), '160mm')}</subform>`);
    close(by(t, 'Table').x - by(t, 'Intro').x, 160);
    close(by(t, 'Table').y, by(t, 'Intro').y);
  });

  it('makes blanks that lead a draw line half an em wide (not in field values, not in Courier)', () => {
    // rich text collapses the blanks to one (EX10: one blank before a value); plain text keeps all ten
    const plain = `<draw name="P" w="150mm"><value><text>          Plain</text></value><font typeface="Arial" size="10pt"/><ui><textEdit/></ui></draw>`;
    const field = `<field name="F" w="150mm"><value><text>          Field</text></value><font typeface="Arial" size="10pt"/><ui><textEdit><margin/></textEdit></ui><margin topInset="0mm" bottomInset="0mm" leftInset="0mm" rightInset="0mm"/></field>`;
    const t = run(`<subform layout="tb" name="S" w="150mm">${draw('D', div("font-family : 'Arial' ; font-size : 10pt ;", '<span>   Ten</span>'))}${plain}${field}</subform>`);
    close(by(t, 'Ten').x, 20 + 0.5 * EM10);
    close(by(t, 'Plain').x, 20 + 10 * 0.5 * EM10);
    close(by(t, 'Field').x, 20 + textWidthMm('          ', 10));
  });

  it('prints a formatted embed in its field font, an embedMode="raw" one in the run font', () => {
    const hidden = `<subform name="H"><field name="V" presence="hidden"><ui><textEdit/></ui><value><text>1234</text></value></field></subform>`;
    const span = (attrs: string) => `<span style="font-family : 'Arial' ; font-size : 10pt ;"> <span xfa:embed="H.V"${attrs}/></span>`;
    const body = (attrs: string, n: string) => `<subform layout="tb" name="${n}" w="150mm">${hidden}<draw name="D" w="150mm"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">${div(cour12, span(attrs))}</div></exData></value><ui><textEdit multiLine="1"/></ui></draw></subform>`;
    // EX10 / EX14 (no embedMode): Courier 10 pt (the field has no <font>); calibration 2 (raw): the span's Arial 10 pt
    expect(by(run(body('', 'F')), '1234')).toMatchObject({ font: 'Courier', pt: 10 });
    expect(by(run(body(' xfa:embedMode="raw"', 'R')), '1234')).toMatchObject({ font: 'Arial', pt: 10 });
  });

  // an EX10 table cell: hidden field V (in H) shown through a draw at 4.23 mm Courier 12 pt, then a draw "Next"
  const cell = (n: string, field: string, inner: string, css = '') => `<subform layout="tb" name="${n}" w="60mm"><subform layout="lr-tb" name="C" w="30mm"><subform name="H">${field}</subform><draw name="D" w="30mm"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml" xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">${div(cour12 + css, `<span style="font-family : 'Arial' ; font-size : 10pt ;">${inner}</span>`)}</div></exData></value><ui><textEdit multiLine="1"/></ui></draw></subform><draw name="N" w="60mm"><ui><textEdit/></ui><value><text>Next ${n}</text></value><font typeface="Arial" size="10pt"/><margin topInset="0mm" bottomInset="0mm" leftInset="0mm" rightInset="0mm"/></draw></subform>`;
  const dateField = (pic: string) => `<field name="V" presence="hidden"><ui><textEdit/></ui><value><text>2026-12-01</text></value>${pic}</field>`;
  const embedV = '<span xfa:embed="H.V"/>';

  it('lowers a date-pictured value alone on its line by 0.15 em and grows its cell as much (calibration 4 / 5)', () => {
    const pic = '<format><picture>date{M/D/YY}</picture></format>';
    const one = (n: string, field: string, inner: string) => run(cell(n, field, inner));
    const plain = one('P', dateField(''), embedV), dated = one('Q', dateField(pic), embedV);
    const num = one('R', `<field name="V" presence="hidden"><ui><textEdit/></ui><value><text>250.00</text></value><format><picture>num{z,zz9.99}</picture></format></field>`, embedV);
    const label = one('S', dateField(pic), `Date ${embedV}`), labelPlain = one('T', dateField(''), `Date ${embedV}`);
    const lift = 0.15 * EM10;
    close(by(dated, '12/1/26').y - by(plain, '2026-12-01').y, lift);
    close(by(dated, 'Next Q').y - by(plain, 'Next P').y, lift);
    // a num picture adds nothing; a typed label on the line neither (calibration 3 H6: "Date" + tab + SY.DATUM)
    close(by(num, 'Next R').y, by(plain, 'Next P').y);
    close(by(label, 'Next S').y, by(labelPlain, 'Next T').y);
  });

  it('starts a line of embedded values only at the content edge: no CSS margin-left, no text-align (calibration 4 / 5)', () => {
    const field = `<field name="V" presence="hidden"><ui><textEdit/></ui><value><text>EUR</text></value></field>`;
    const t = run(cell('A', field, embedV, ' margin-left : 0.71mm ; text-align : right ;'));
    close(by(t, 'EUR').x, 20);
    // one typed blank before the value brings margin and alignment back (X1)
    const b = run(cell('B', field, ` ${embedV}`, ' margin-left : 0.71mm ;'));
    expect(by(b, 'EUR').x).toBeGreaterThan(20.71);
  });

  it('lays out XFA 2.2 (SAP migration) by the 2.4+ rules, not the 2.1 line boxes', () => {
    const t = run(`<subform layout="tb" name="S" w="150mm">${draw('D', div(cour12, 'Mig'))}</subform>`, '2.2');
    close(by(t, 'Mig').y, 20 + 0.629 * 12 * PT);
  });
});

describe('adobe-preview: off-page content in the layout JSON', () => {
  it('replaces texts the browser clipped at the page edge with the model text, flagged offPage (not wEst); adds off-page rules', () => {
    // the browser writes CID text glyph by glyph: '0' '0' '0' clipped from '0001'
    const g = (x: number, s: string) => ({ x, y: 21.7, w: 2.1, text: s, pt: 10 });
    const layout = { pages: [{ w: 210, h: 297, texts: [g(203.7, '0'), g(205.8, '0'), g(207.9, '0'), { x: 20, y: 30, w: 10, text: 'Keep', pt: 10 }], lines: [], rects: [] }] };
    const model = { pages: [{ w: 210, h: 297, items: [
      { type: 'text', x: 203.7, y: 21.7, text: '0001', pt: 10, font: 'Courier New' },
      { type: 'text', x: 20, y: 30, text: 'Keep', pt: 10, font: 'Arial' },
      { type: 'line', x1: 200, y1: 12, x2: 230, y2: 12, th: 0.26 },
    ] }] };
    const out = withOffPage(layout, model).pages[0];
    expect(out.texts.map((t: any) => t.text).sort()).toEqual(['0001', 'Keep']);
    const sub = out.texts.find((t: any) => t.text === '0001');
    expect(sub).toMatchObject({ offPage: true });
    expect(sub.wEst).toBeUndefined();
    expect(out.lines).toHaveLength(1);
  });

  it('keeps an unrelated text of ours at the page edge (only pieces that start the model text go)', () => {
    const layout = { pages: [{ w: 210, h: 297, texts: [{ x: 204, y: 21.7, w: 4, text: 'XY', pt: 10 }], lines: [], rects: [] }] };
    const model = { pages: [{ w: 210, h: 297, items: [{ type: 'text', x: 203.7, y: 21.7, text: '0001', pt: 10, font: 'Courier New' }] }] };
    expect(withOffPage(layout, model).pages[0].texts.map((t: any) => t.text).sort()).toEqual(['0001', 'XY']);
  });
});

describe('adobe-preview: designer template + data XML (no SAP form object)', () => {
  const xdp = `<?xml version="1.0" encoding="utf-8"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform layout="tb" name="form1"><pageSet><pageArea name="P1"><contentArea x="20mm" y="20mm" w="170mm" h="250mm"/>
<medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>
<subform name="Head" layout="tb" w="170mm"><field name="Title" w="100mm" h="8mm"><ui><textEdit/></ui><font typeface="Arial"/><bind match="dataRef" ref="$record.Head.Title"/></field></subform>
</subform></template></xdp:xdp>`;
  const data = `<?xml version="1.0"?><xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/"><xfa:data><form1><Head><Title>Sample ticket</Title></Head></form1></xfa:data></xfa:datasets>`;
  it('reads the record under xfa:datasets / xfa:data: groups and values, attributes ignored', () => {
    expect(recordFromXml(data)).toEqual({ name: 'form1', children: [{ name: 'Head', children: [{ name: 'Title', value: 'Sample ticket' }] }] });
    expect(recordFromXml('<root a="1"><v>x</v></root>')).toEqual({ name: 'root', children: [{ name: 'v', value: 'x' }] });
  });
  it('lays the template out with that record', () => {
    const m = buildModelXdp({ layoutXdp: xdp, dataXml: data });
    expect(m.pages).toHaveLength(1);
    expect(texts(m.pages[0]).map((t: any) => t.text)).toContain('Sample ticket');
  });
});

describe('adobe-preview: ABAP and ADS value defaults', () => {
  it('an elementary TYPE C / TYPE N parameter without a length is 1 character long (ABAP default)', () => {
    expect(toXmlValue('Sample text', { ddic: { type: 'CHAR' } })).toBe('S');
    expect(toXmlValue('000123', { ddic: { type: 'NUMC' } })).toBe('3');
    expect(toXmlValue('Sample text', { ddic: { type: 'CHAR', length: 20 } })).toBe('Sample text');
    expect(toXmlValue('123', { ddic: { type: 'NUMC', length: 10 } })).toBe('0000000123');
  });
  it('a numericEdit field without a <value> prints the data as a number: grouping, no trailing zeros', () => {
    expect(formatValue('830.50', { type: 'float', fracDigits: -2 })).toBe('830.5');
    expect(formatValue('8901300', { type: 'float', fracDigits: -2 })).toBe('8,901,300');
    const xdp = `<?xml version="1.0" encoding="utf-8"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform layout="tb" name="data"><pageSet><pageArea name="P1"><contentArea x="20mm" y="20mm" w="170mm" h="250mm"/>
<medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>
<field name="AMT" w="40mm" h="6mm"><ui><numericEdit/></ui><font typeface="Arial"/><bind match="dataRef" ref="$record.AMT"/></field>
</subform></template></xdp:xdp>`;
    const out = layoutForm(readXdp(xdp).template, { name: 'data', children: [{ name: 'AMT', value: '1243.25' }] }, {});
    expect(texts(out.pages[0]).map((t: any) => t.text)).toEqual(['1,243.25']);
  });
});

describe('adobe-preview: interface initialization code (simple statements only)', () => {
  const code = ['* sums per currency', 'data: l_sums like line of t_sums,', '      l_row type zdemo_row.', 'loop at rows into l_row.',
    '  l_sums-amount = l_row-amount.  " the amount', '  l_sums-curr   = l_row-curr.', '  collect l_sums into t_sums.', 'endloop.'];
  const values = { ROWS: [{ AMOUNT: 10.5, CURR: 'EUR' }, { AMOUNT: 2, CURR: 'USD' }, { AMOUNT: 4.25, CURR: 'EUR' }] };
  it('runs LOOP / assignments / COLLECT: numeric fields summed per equal other fields', () => {
    expect(runInitCoding(code, values)).toMatchObject({ ok: true, tables: { T_SUMS: [{ AMOUNT: 14.75, CURR: 'EUR' }, { AMOUNT: 2, CURR: 'USD' }] } });
  });
  it('runs the G5 initSumByKey template of ZMCP_FP_MIGRATE (FIELD-SYMBOLS, LOOP … ASSIGNING <fs>)', () => {
    const g5 = ['* sc4sap G5 initSumByKey (generated) GT_TOTAL', 'DATA ls_sc4sap_g5_0 LIKE LINE OF gt_total.',
      'FIELD-SYMBOLS <ls_sc4sap_g5_0> LIKE LINE OF t_rows.', 'CLEAR gt_total.', 'LOOP AT t_rows ASSIGNING <ls_sc4sap_g5_0>.',
      '  CLEAR ls_sc4sap_g5_0.', '  ls_sc4sap_g5_0-curr = <ls_sc4sap_g5_0>-curr.', '  ls_sc4sap_g5_0-amount = <ls_sc4sap_g5_0>-amount.',
      '  COLLECT ls_sc4sap_g5_0 INTO gt_total.', 'ENDLOOP.'];
    const rows = { T_ROWS: [{ CURR: 'EUR', AMOUNT: 250 }, { CURR: 'EUR', AMOUNT: 980.5 }, { CURR: 'USD', AMOUNT: 120 }, { CURR: 'USD', AMOUNT: 75.25 }] };
    expect(runInitCoding(g5, rows)).toMatchObject({ ok: true, tables: { GT_TOTAL: [{ CURR: 'EUR', AMOUNT: 1230.5 }, { CURR: 'USD', AMOUNT: 195.25 }] } });
    // writing through the field symbol would change the table row in ABAP: not run (no stale preview values)
    const write = [...g5.slice(0, 5), '  <ls_sc4sap_g5_0>-amount = 0.', ...g5.slice(5)];
    expect(runInitCoding(write, rows)).toMatchObject({ ok: false });
  });
  it('stops at anything else and fills nothing', () => {
    expect(runInitCoding([...code, 'select * from zdemo_tab into table t_x.'], values)).toMatchObject({ ok: false });
    expect(runInitCoding(['loop at missing into l_row.', 'endloop.'], values)).toMatchObject({ ok: false });
  });
});

describe('adobe-preview / smartform: program lines the runner understands', () => {
  const values = { ROWS: [{ AMOUNT: 10.5, CURR: 'EUR' }, { AMOUNT: 2, CURR: 'USD' }, { AMOUNT: 4.25, CURR: 'EUR' }] };
  it('keeps a quote inside a literal (only a " outside literals starts a comment)', () => {
    const r = runInitCoding(['l_x-text = \'say "hi"\'.  " a comment', 'append l_x to t_x.'], {});
    expect(r).toMatchObject({ ok: true, tables: { T_X: [{ TEXT: 'say "hi"' }] } });
  });
  it('splits at the period that ends a statement, not inside 1.5', () => {
    expect(runInitCoding(['l_x-amount = 1.5. append l_x to t_x.'], {})).toMatchObject({ ok: true, tables: { T_X: [{ AMOUNT: 1.5 }] } });
  });
  it('runs a delayed COLLECT with IF NOT … IS INITIAL, REFRESH, colon chains, and keeps state between runs', () => {
    const init = runInitCoding(['refresh gt_total.', 'clear: gs_total, gs_next.'], values);
    const body = runInitCoding(['loop at rows into gs_row.', 'if not gs_next is initial.', 'collect gs_next into gt_total.', 'endif.',
      'gs_next-amount = gs_row-amount.', 'gs_next-curr = gs_row-curr.', 'endloop.'], values, {}, init);
    const last = runInitCoding(['if not gs_next is initial.', 'collect gs_next into gt_total.', 'endif.'], values, {}, body);
    expect(last).toMatchObject({ ok: true, tables: { GT_TOTAL: [{ AMOUNT: 14.75, CURR: 'EUR' }, { AMOUNT: 2, CURR: 'USD' }] } });
    expect(runInitCoding(['clear t_x[].', 'append l_y to t_x.'], {}, {}, { tables: { T_X: [{ A: 1 }] } }).tables.T_X).toEqual([{}]);
  });
});
