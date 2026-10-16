import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { listSymbols, Renderer, paragraphFonts } from '../../scripts/smartform/build-preview.mjs';

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
    expect(html).toContain('Page 1 of 1');
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
    expect(html).toContain('width:30mm;background:#d4d4d4;border-left:0.26mm solid #000;');
    expect(html).toMatch(/<div id="C8" class="par" data-node="%TEXT4">/);
    expect(r.defaultParaUsed).toBe(true);
  });

  it('gives a paragraph taller than its line spacing room for the glyphs', () => {
    const { html } = render({ values: {} });
    expect(html).toMatch(/div#BJ\.par\{[^}]*line-height : 8\.11mm/);
    expect(paragraphFonts(CONTENT.styles)).toEqual({ AA: 10, BJ: 20, C8: 8 });
  });
});
