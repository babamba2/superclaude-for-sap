import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { listSymbols, Renderer, paragraphFonts, barcodeSvg, code128Codes, barcodeSize, legacyDbcs, printedFamily, tabNextStop, tabDecimalWidth } from '../../scripts/smartform/build-preview.mjs';
import { compare } from '../../scripts/smartform/compare-otf.mjs';

// Shape of GetSmartFormContent's content.json; names and values are invented.
const CSS =
  ".ZTEST-STYLE  div#AA.par{    font-family : 'Arial' ;    font-size : 10pt ;    line-height : 4.23mm ;}" +
  ".ZTEST-STYLE  div#BJ.par{    font-family : 'Arial' ;    font-size : 20pt ;    line-height : 4.23mm ;}" +
  ".ZTEST-STYLE  div#C8.par{    font-family : 'Arial' ;    font-size : 8pt ;    line-height : 4.23mm ;}";

const text = (name: string, format: string, t: string, cell?: [number, number]) => ({
  kind: 'text', name, caption: name, children: [], style: 'ZTEST_STYLE',
  lines: [{ format, text: t }],
  ...(cell ? { tableCell: { line: cell[0], cell: cell[1] } } : {}),
});

const CONTENT = {
  form: 'ZTEST_FORM',
  stdStyles: ['ZTEST_STYLE'],
  data: [
    { name: 'HEADER', scope: 'import', typing: 'TYPE', typeName: 'ZTEST_S_HEAD' },
    { name: 'GS_ITEM', scope: 'global', typing: 'TYPE', typeName: 'ZTEST_S_ITEM' },
  ],
  styles: [{ name: 'ZTEST_STYLE', css: CSS }],
  graphics: [],
  includeTexts: [],
  pages: [{
    name: '%PAGE1', format: 'DINA4', orientation: 'portrait',
    windows: [
      { name: '%WINDOW1', type: 'SECONDARY', leftMm: 10, topMm: 10, widthMm: 190, heightMm: 10,
        content: [text('%TEXT1', 'BJ', '<AA>ORDER</> &HEADER-EBELN&')] },
      { name: '%WINDOW2', type: 'SECONDARY', leftMm: 10, topMm: 20, widthMm: 190, heightMm: 5,
        content: [text('%TEXT2', 'C8', 'Page &SFSY-PAGE(4Z)& of &SFSY-FORMPAGES(4Z)&')] },
      { name: 'MAIN', type: 'MAIN', leftMm: 10, topMm: 30, widthMm: 190, heightMm: 200,
        content: [{
          kind: 'loop', name: '%LOOP1', caption: 'Items', dataTable: 'ITEM', children: [{
            kind: 'template', name: '%TEMPLATE1', caption: 'Row', width: { mm: 50 },
            templateLines: [{ name: '%C1', from: 1, to: 1, heightMm: 5 }],
            cells: [
              { line: '%C1', column: 1, widthMm: 30, fill: '#d4d4d4', borders: { left: 0.26, top: 0, right: 0, bottom: 0 } },
              { line: '%C1', column: 2, widthMm: 20, borders: { left: 0, top: 0, right: 0, bottom: 0 } },
            ],
            children: [
              text('%TEXT3', 'AA', '&GS_ITEM-MATNR&', [1, 1]),
              text('%TEXT4', '*', '&GS_ITEM-MENGE&', [1, 2]),
            ],
          }],
        }] },
    ],
  }],
};

describe('smartform-preview: symbols', () => {
  const r = listSymbols(CONTENT);

  it('lists every printed symbol once, without formatting options', () => {
    expect(r.symbols.map((s: any) => s.name)).toEqual([
      'GS_ITEM-MATNR', 'GS_ITEM-MENGE', 'HEADER-EBELN', 'SFSY-FORMPAGES', 'SFSY-PAGE',
    ]);
  });

  it('links a symbol to its declaration and where it prints', () => {
    const s = r.symbols.find((x: any) => x.name === 'GS_ITEM-MATNR');
    expect(s.declaration.typeName).toBe('ZTEST_S_ITEM');
    expect(s.occurrences[0]).toMatchObject({ window: 'MAIN', paragraph: 'AA', fontPt: 10, cellWidthMm: 30, inLoop: true });
    expect(r.symbols.find((x: any) => x.name === 'SFSY-PAGE').system).toBe(true);
  });
});

describe('smartform-preview: rendering', () => {
  const render = (values: any) => {
    const r = new Renderer(CONTENT, values);
    return { r, html: r.page().html as string };
  };

  it('fills symbols with sample values, one array entry per loop row', () => {
    const { r, html } = render({
      rows: 2, defaultParagraph: 'AA',
      values: { 'HEADER-EBELN': '4500001234', 'GS_ITEM-MATNR': ['100234', '100235'], 'GS_ITEM-MENGE': ['1.000', '2.000'] },
    });
    expect(html).toContain('4500001234');
    expect(html.indexOf('100234')).toBeLessThan(html.indexOf('100235'));
    expect(html).toContain('2.000');
    // (4Z): the page left-justified in 4 characters; the page total right-justified in a
    // place 4 digits wide (figure spaces), as SAP fills it in at the end
    expect(html).toContain('Page 1    of    1');
    expect(r.unfilled.size).toBe(0);
    expect(html).toContain('<span id="AA" class="char">ORDER</span>');
  });

  it('keeps unfilled symbols as placeholders and reports them', () => {
    const { r, html } = render({ rows: 1, values: {} });
    expect(html).toContain('class="sym" title="HEADER-EBELN">&amp;HEADER-EBELN&amp;');
    expect([...r.unfilled].sort()).toEqual(['GS_ITEM-MATNR', 'GS_ITEM-MENGE', 'HEADER-EBELN']);
  });

  it('draws template cells in mm with fill and borders; * uses the default paragraph', () => {
    const { r, html } = render({ rows: 1, defaultParagraph: 'C8', values: {} });
    expect(html).toContain('width:30mm;background:#d4d4d4;');
    expect(html).toContain('<div class="frame" style="border-left:0.26mm solid #000;"></div>'); // lines over the cell (R19)
    expect(html).toMatch(/<div id="C8" class="par" data-node="%TEXT4">/);
    expect(r.defaultParaUsed).toBe(true);
  });

  it('skips /* comments and /: commands; a text IF prints its first branch, as SAP does', () => {
    const form = (style: string) => ({
      ...CONTENT,
      pages: [{ ...CONTENT.pages[0], windows: [{
        name: '%W', type: 'SECONDARY', leftMm: 0, topMm: 0, widthMm: 100, heightMm: 50,
        content: [{ kind: 'folder', name: '%F', output: { STDSTYLE: 'ZTEST_STYLE' }, children: [{
          kind: 'text', name: '%TX', style, children: [], lines: [
            { format: 'AA', text: 'Remarks' },
            { format: '/*', text: '&HEADER-OLD&' },
            { format: '/:', text: "IF &HEADER-KDGRP& = 'F1'." },
            { format: 'AA', text: 'branch one' },
            { format: '/:', text: 'ELSE.' },
            { format: 'AA', text: 'branch two' },
            { format: '/:', text: 'ENDIF.' },
          ] }] }] }] }],
    });
    const r = new Renderer(form('ZMISSING_STYLE'), { values: { 'HEADER-KDGRP': '01' } });
    const html = r.page().html as string;
    expect(html).toContain('branch one');
    expect(html).not.toContain('branch two');
    expect(html).not.toContain('HEADER-OLD');
    expect(html).not.toContain('IF ');
    // the style stored with the text does not print; the folder's passes down (Q5)
    expect(html).toContain('class="ZTEST-STYLE"');
    expect(html).not.toContain('ZMISSING-STYLE');
    expect(listSymbols(form('ZTEST_STYLE')).symbols.map((s: any) => s.name)).toEqual(['HEADER-KDGRP']);
  });

  it('keeps the line spacing of a taller font and puts the baseline at the bottom of the line', () => {
    const { html } = render({ values: {} });
    expect(html).toMatch(/div#BJ.par{[^}]*line-height : 4.23mm/);
    expect(html).toContain('fontBoundingBoxAscent');
    expect(paragraphFonts(CONTENT.styles)).toEqual({ AA: 10, BJ: 20, C8: 8 });
  });

  it('prints a bar-code character format as bars, not as text', () => {
    const c = JSON.parse(JSON.stringify(CONTENT));
    c.styles[0].strings = [{ tag: 'BR', family: '', size: 0, bold: '*', italic: '*', underline: '*', barcode: 'ZTEST_BC', hidden: '*' }];
    c.pages[0].windows[1].content = [text('%TEXT2', 'C8', '<BR>&HEADER-EBELN&</>')];
    const r = new Renderer(c, { values: { 'HEADER-EBELN': 'AB123' } });
    const html = r.page().html as string;
    expect(html).toMatch(/<span id="BR" class="char barcode"><span class="bcw"[^>]*><svg class="bc"[^>]*width:\d+\.\d+mm;height:3.50mm/);
    expect(r.approx.join()).toContain('no SE73 definition read');
    expect(html).not.toContain('>AB123<');
    // Code 128: start + 5 characters + check = 7 symbols of 11 modules, stop 13
    expect(barcodeSvg('AB123')).toContain('viewBox="0 0 90 1"');
  });

  it('ORs condition groups, prefers output-options styles and node-scoped values', () => {
    const c = JSON.parse(JSON.stringify(CONTENT));
    c.styles.push({ name: 'ZOTHER_STYLE', css: CSS });
    const t = text('%TEXT9', 'AA', '&GV_SUM&');
    Object.assign(t, {
      output: { STDSTYLE: 'ZOTHER_STYLE' },
      condition: { COND: [{ OP1: 'GV_A', COP: 'EQ', OP2: '1' }, { LOP: 'OR' }, { OP1: 'GV_B', COP: 'EQ', OP2: '0' }] },
    });
    c.pages[0].windows[1].content = [t];
    const r = new Renderer(c, { values: { GV_A: '1', GV_B: '7', GV_SUM: '1.00', 'GV_SUM@%TEXT9': '99.00' } });
    const html = r.page().html as string;
    expect(html).toContain('99.00');                 // 1 = 1 OR 7 = 0 → printed, node value wins
    expect(html).toContain('class="ZOTHER-STYLE"');  // output options over the text's own style
  });

  it('reads protected text and pre / post texts the SAPscript way', () => {
    const c = JSON.parse(JSON.stringify(CONTENT));
    c.pages[0].windows[1].content = [
      text('%TEXT2', 'C8', "<(>&<)>GV_LIT& &GV_NO&&'/ 'GV_DATE& &'('GV_QTY(C)')'&"),
      text('%TEXT5', 'C8', "X&' - 'GV_EMPTY&Y"),
    ];
    const names = listSymbols(c).symbols.map((s: any) => s.name);
    expect(names).toEqual(expect.arrayContaining(['GV_NO', 'GV_DATE', 'GV_QTY', 'GV_EMPTY']));
    expect(names).not.toContain('GV_LIT');
    expect(names.some((n: string) => n.includes("'") || n.startsWith('<'))).toBe(false);
    const html = new Renderer(c, { values: { GV_NO: '42', GV_DATE: '2026.01.31', GV_QTY: '  5 ', GV_EMPTY: '' } }).page().html as string;
    const plain = html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
    expect(plain).toContain('&GV_LIT& 42/ 2026.01.31 (5 )');
    expect(plain).toContain('XY'); // initial value: no pre / post text
  });

  it('treats a zero of a numeric / date DDIC type as initial and && as a literal ampersand', () => {
    const c = JSON.parse(JSON.stringify(CONTENT));
    c.pages[0].windows[1].content = [
      text('%TEXT2', 'C8', "A&' EUR 'GV_AMT&B &' / 'GV_DAT&C &' # 'GV_TXT&D"),
      text('%TEXT5', 'C8', "R&&D &GV_NO& &&GV_NO& &' * 'GV_ZERO&E"),
    ];
    const fields = { GV_AMT: { type: 'CURR' }, GV_DAT: { type: 'DATS' }, GV_TXT: { type: 'CHAR' } };
    const values = { values: { GV_AMT: '0.00', GV_DAT: '00000000', GV_TXT: '0', GV_NO: '42', GV_ZERO: 0 } };
    const plainOf = (r: any) => (r.page().html as string).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
    const typed = plainOf(new Renderer(c, values, { fields }));
    expect(typed).toContain('A0.00B'); // CURR 0.00 is initial: no " EUR "
    expect(typed).toContain('B 00000000C'); // DATS 00000000 is initial: no ' / '
    expect(typed).toContain('C  # 0D'); // CHAR "0" is not initial
    expect(typed).toContain('R&D 42 &GV_NO&'); // && prints '&'; "&&GV_NO&" is no symbol
    expect(typed).toContain('&GV_NO& 0E'); // the number 0 is initial without a type: no ' * '
    expect(typed).not.toContain(' * ');
    const untyped = plainOf(new Renderer(c, values));
    expect(untyped).toContain('A EUR 0.00B'); // without the DDIC type a "0.00" string is not taken as initial
    expect(listSymbols(c).symbols.map((s: any) => s.name)).not.toContain('GV_NO& ');
  });

  it('appends an APPMODE A text to the paragraph before it, and keeps a bar code of nested formats', () => {
    const c = JSON.parse(JSON.stringify(CONTENT));
    const unit = Object.assign(text('%TEXT8', '*', 'EA'), { attrs: { APPMODE: 'A' } });
    c.pages[0].windows[1].content = [text('%TEXT7', 'C8', '1266'), unit];
    let html = new Renderer(c, { values: {} }).page().html as string;
    expect(html).toMatch(/data-node="%TEXT7"[^>]*>1266<span class="ZTEST-STYLE">EA<\/span><\/div>/); // R84: one line
    // R92: <BR><BB>…</></> — the inner format's bars stay
    c.styles[0].strings = ['BR', 'BB'].map((tag) => ({ tag, family: '', size: 0, bold: '*', italic: '*', underline: '*', barcode: `ZTEST_${tag}`, hidden: '*' }));
    c.pages[0].windows[1].content = [text('%TEXT2', 'C8', '<BR><BB>&HEADER-EBELN&</></>')];
    html = new Renderer(c, { values: { 'HEADER-EBELN': 'AB123' } }).page().html as string;
    expect(html).toMatch(/<span id="BR" class="char barcode"><span id="BB" class="char barcode"><span class="bcw"/);
  });

  it('places a template with VPOS_USED / TOP at its place in the window', () => {
    const c = JSON.parse(JSON.stringify(CONTENT));
    const tpl = c.pages[0].windows[2].content[0].children[0];
    tpl.attrs = { VPOS_USED: 'X', TOP: '1.70', U_TOP: 'CM', LEFTMARGIN: '3.40', U_LEFT: 'CM' };
    const html = new Renderer(c, { values: { 'GS_ITEM-MATNR': ['M1'] } }).page().html as string;
    expect(html).toContain('<div class="vpos" style="position:absolute;left:0;right:0;top:17.00mm">'); // R89
    expect(html).toContain('margin-left:34.00mm'); // R90: LEFTMARGIN like LEFT
  });

  it('reads legacy Korean bytes in Latin-1 text back as Hangul only in a Korean printer font', () => {
    const latin1 = Buffer.from('의 료 비', 'utf8').length ? 'ÀÇ ·á ºñ' : '';
    expect(legacyDbcs(latin1, 'KPDODUM')).toBe('의 료 비');
    expect(legacyDbcs(latin1, 'HELVE')).toBe(latin1);          // a Latin font prints the characters
    expect(legacyDbcs('Größe 12', 'KPDODUM')).not.toContain('�');
  });

  it('sizes bar codes like SAP: set C for digit runs, module and height in 1/600 inch', () => {
    const modules = (v: string) => code128Codes(v).reduce((s: number, c: number) => s + (c === 106 ? 13 : 11), 0);
    expect(modules('BC12345')).toBe(101);      // measured on SAP's PDF
    expect(modules('BC0012345678')).toBe(123);
    expect(barcodeSize({ aux: 'N08X00080A' })).toEqual({ moduleMm: 8 * 25.4 / 600, heightMm: 80 * 25.4 / 600 });
    expect(barcodeSize({})).toBeNull();
  });
});

describe('smartform-preview: compare with the SAP OTF', () => {
  const run = (text: string, x: number, widthMm: number) => ({ text, x, y: 50, widthMm, family: 'HELVE', pt: 10, bold: false, italic: false, window: 'W' });
  const page = (runs: any[]) => ({ runs, lines: [], bitmaps: [], images: [] });

  it('matches one OTF run against neighbouring preview spans, and the other way round', () => {
    const one = compare(page([run('2026.10.19 06:19:06', 100, 34)]), page([run('2026.10.19', 100, 18), run('06:19:06', 119, 15)]));
    expect(one.score).toBe(100);
    const split = compare(page([run('10', 100, 4), run('EA', 105, 4)]), page([run('10 EA', 100, 9)]));
    expect(split.texts.extra).toEqual([]);
    expect(split.texts.missing).toEqual([]);
    // one preview run far wider than the two SAP cells is a width error, not a match
    const wide = compare(page([run('12', 10, 3), run('EA', 15.5, 3)]), page([run('12 EA', 10, 30)]));
    expect(wide.texts.font.length).toBe(1);
    expect(wide.score).toBeLessThan(100);
  });

  it('joins pieces over a long blank run only when every piece stands where SAP has it (R85)', () => {
    // SAP: one run "Qty 10 EA" from three ST pieces at 100 / 120 / 140 mm (blanks between)
    const sap = { ...run('Qty 10 EA', 100, 45), parts: [{ x: 100, text: 'Qty' }, { x: 120, text: '10' }, { x: 140, text: 'EA' }] };
    const good = compare(page([sap]), page([run('Qty', 100, 5), run('10', 120, 4), run('EA', 140, 5)]));
    expect(good.score).toBe(100);
    const bad = compare(page([sap]), page([run('Qty', 100, 5), run('10', 125, 4), run('EA', 140, 5)]));
    expect(bad.score).toBeLessThan(100);
  });

  it('does not match spaced digits against the unspaced number far away', () => {
    const r = compare(page([run('0 0 1 2', 200, 10), run('0012', 10, 6)]), page([run('0012', 10, 6), run('0 0 1 2', 200, 10)]));
    expect(r.texts.moved).toEqual([]);
  });
});

describe('smartform-preview: printer fonts of the output device', () => {
  const families = [{ family: 'COURIER', proportional: '', substitutes: ['LETGOTH'] }, { family: 'TIMES', proportional: 'X', substitutes: ['HELVE'] }, { family: 'HELVE', proportional: 'X', substitutes: ['TIMES'] }];
  it('a device type with none of the form\'s families prints them in COURIER (S4-DEV LP01 / I7PDF)', () => {
    const p = { device: 'LP01', deviceType: 'I7PDF', families, fonts: [] };
    expect(printedFamily('TIMES', p, 140)).toBe('COURIER');
    expect(printedFamily('HELVE', p, 120)).toBe('COURIER');
  });
  it('keeps the family when the fonts were not read (no printer, no device type, or an error)', () => {
    expect(printedFamily('TIMES', undefined, 140)).toBe('TIMES');
    expect(printedFamily('TIMES', { error: 'x' }, 140)).toBe('TIMES');
    expect(printedFamily('TIMES', { families, fonts: [] }, 140)).toBe('TIMES');
  });
  it('keeps a family the device type has', () => {
    expect(printedFamily('TIMES', { deviceType: 'X', families, fonts: [['TIMES', '000', '', '']] }, 140)).toBe('TIMES');
  });
});

describe('smartform-preview: a loop with sort events runs over its rows sorted (S4-DEV SF_SUBTOTALS)', () => {
  const loopContent = (kind: string) => ({
    ...CONTENT,
    pages: [{ ...CONTENT.pages[0], windows: [{ name: 'MAIN', type: 'MAIN', leftMm: 10, topMm: 30, widthMm: 190, heightMm: 200, content: [{
      kind, name: 'L1', caption: 'Flights', dataTable: 'T_FLIGHT', attrs: { TABHEADER: 'GS_FLIGHT' }, children: [
        { kind: 'event', name: '%EVENT1', caption: 'Begin', attrs: { EVTYPE: 'S', SFIELD: 'CARRID' }, children: [text('%TEXT1', 'AA', 'Group &GS_FLIGHT-CARRID&')] },
        text('%TEXT2', 'AA', 'Row &GS_FLIGHT-PRICE&'),
      ],
    }] }] }],
  });
  const values = { rows: 4, values: { 'GS_FLIGHT-CARRID': ['ZZ', 'ZZ', 'ZY', 'ZY'], 'GS_FLIGHT-PRICE': ['1', '2', '3', '4'] } };
  it('prints the ZY group before ZZ, rows stable inside a group', () => {
    const r = new Renderer(loopContent('loop'), values);
    const html = r.page().html as string;
    const at = (s: string) => html.indexOf(s);
    expect(at('Group ZY')).toBeGreaterThan(-1);
    expect(at('Group ZY')).toBeLessThan(at('Group ZZ'));
    expect(at('Row 3')).toBeLessThan(at('Row 4'));
    expect(at('Row 4')).toBeLessThan(at('Row 1'));
    expect(r.approx.join(' ')).toMatch(/rows sorted by CARRID/);
  });
});

describe('smartform-preview: an empty "/" line that ends a paragraph prints as a blank line (SF_EXAMPLE_01 intro)', () => {
  it('keeps the trailing line break with a zero-width character to stand on', () => {
    const c = {
      ...CONTENT,
      pages: [{ ...CONTENT.pages[0], windows: [{ name: 'MAIN', type: 'MAIN', leftMm: 10, topMm: 30, widthMm: 190, heightMm: 200, content: [
        { kind: 'text', name: '%T1', caption: 'T1', children: [], style: 'ZTEST_STYLE', lines: [{ format: 'AA', text: 'Dear Sir or Madam,' }, { format: '/', text: '' }, { format: 'AA', text: 'Next' }] },
      ] }] }],
    };
    const html = new Renderer(c, { values: {} }).page().html as string;
    expect(html).toMatch(/Dear Sir or Madam,\n\u200b/);
    expect(html).not.toMatch(/Next\n/);
  });
});

describe('smartform-preview: tab stop math the page script runs (SF_EXAMPLE_01 TB: DECIMAL 4 cm, LEFT 5 cm)', () => {
  const glyphs = (text: string, left: number, w = 2.54) => [...text].map((ch, i) => ({ ch, after: text.charAt(i + 1), left: left + i * w, right: left + (i + 1) * w })).filter((g) => g.ch.trim());
  it('a DECIMAL stop puts the last decimal sign before a digit on the stop', () => {
    // "250.00" measured from the tab at 0: its '.' is at 3 × 2.54 = 7.62 → room 40 - 7.62
    expect(tabDecimalWidth(40, glyphs('250.00', 0))).toBeCloseTo(32.38, 2);
    // "1,230.50": the '.' counts, not the grouping comma
    expect(tabDecimalWidth(40, glyphs('1,230.50', 0))).toBeCloseTo(40 - 5 * 2.54, 2);
    // no decimal sign: the text ends on the stop; past the stop: no room; no ink: null
    expect(tabDecimalWidth(40, glyphs('EUR', 0))).toBeCloseTo(40 - 3 * 2.54, 2);
    expect(tabDecimalWidth(5, glyphs('250.00', 0))).toBe(0);
    expect(tabDecimalWidth(40, [])).toBeNull();
  });
  it('trailing blanks do not pass a stop: the next stop is found from the ink end', () => {
    // "250.00 " ends 50.17 mm with its sign blank, its ink at 47.63: the currency goes to the 5 cm stop
    expect(tabNextStop([40, 50], 10, 50.17, 47.63)).toEqual({ next: 50, ji: 1 });
    // without the ink end the 5 cm stop is passed: the default distance gives 60
    expect(tabNextStop([40, 50], 10, 50.17, null)).toEqual({ next: 60, ji: -1 });
    // no default distance: 2 mm on
    expect(tabNextStop([], 0, 12, null)).toEqual({ next: 14, ji: -1 });
  });
  it('the page script carries both functions as written', () => {
    const html = new Renderer(CONTENT, { values: {} }).page().html as string;
    expect(html).toContain(String(tabNextStop));
    expect(html).toContain(String(tabDecimalWidth));
  });
});
