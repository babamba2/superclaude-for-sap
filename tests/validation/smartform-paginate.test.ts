import { describe, it, expect } from 'vitest';
// @ts-ignore — plain ESM
import { estimateBlocks, paginatePreview } from '../../scripts/smartform/preview-paginate.mjs';
// @ts-ignore — plain ESM
import * as BP from '../../scripts/smartform/build-preview.mjs';
// @ts-ignore — plain ESM
import { renderPreview } from '../../scripts/smartform/preview-workbench.mjs';

/** A page as the renderer writes it: a style block and a MAIN window with the given body. */
const page = (body: string, css = '.ZX-STYLE div#AA.par{font-family:Arial;font-size:9pt;line-height:4.230mm;margin:0.000mm 0.000mm 0.000mm 0.000mm;--sapfam:HELVE;--sappt:90;--sapb:N}') =>
  `<!doctype html><html><head><style>${css}</style></head><body><div class="sheet"><div class="win main" data-win="MAIN" style="left:10mm;top:40mm;width:100mm;height:60mm;">${body}</div></div></body></html>`;
const par = (text: string, id = 'AA') => `<div class="ZX-STYLE" style="display:flow-root"><div id="${id}" class="par">${text}</div></div>`;
const row = (h: number | null, cells: string[], widths = cells.map(() => 50)) =>
  `<div class="row${h ? '' : ' autoh'}" style="${h ? `height:${h}mm` : ''}">${cells.map((c, i) => `<div class="cell" style="width:${widths[i]}mm;">${c}</div>`).join('')}</div>`;
const tmpl = (rows: string) => `<div class="tpl tmpl" style="width:100mm;">${rows}</div>`;
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

describe('estimateBlocks — the blocks MEASURE_JS would report, from the HTML alone', () => {
  it('stacks paragraphs and templates in document order; a template is the sum of its rows', () => {
    const { blocks } = estimateBlocks(page(par('Intro') + tmpl(row(6, [par('A'), par('B')]) + row(4, [par('C'), par('D')])) + par('End')));
    expect(blocks).toHaveLength(3);
    expect(near(blocks[0].b, 4.23)).toBe(true);
    expect(near(blocks[1].t, 4.23) && near(blocks[1].b, 14.23)).toBe(true);
    expect(near(blocks[2].t, 14.23) && near(blocks[2].b, 18.46)).toBe(true);
    expect(blocks[1].tbl).toBe(0);
    expect(blocks[0].tbl).toBe(-1);
  });

  it('a NEWPAGE command is a break block with its target page', () => {
    const { blocks } = estimateBlocks(page(par('A') + '<div class="sfbreak" data-page="NEXT"></div>' + par('B')));
    expect(blocks.map((b: { brk: boolean }) => b.brk)).toEqual([false, true, false]);
    expect(blocks[1].page).toBe('NEXT');
    expect(near(blocks[1].b - blocks[1].t, 0)).toBe(true);
  });

  it('header rows of a table are marked head and share the table index', () => {
    const table = `<div class="tpl" style="width:100mm;"><div class="sfhead">${row(7, [par('H1'), par('H2')])}</div>${row(5, [par('1'), par('2')])}${row(5, [par('3'), par('4')])}</div>`;
    const { blocks } = estimateBlocks(page(table));
    expect(blocks.map((b: { head: boolean }) => b.head)).toEqual([true, false, false]);
    expect(new Set(blocks.map((b: { tbl: number }) => b.tbl))).toEqual(new Set([0]));
    expect(near(blocks[2].b, 17)).toBe(true);
  });

  it('a placed template (.vpos, absolute) sits at its top and takes no room in the flow', () => {
    const body = tmpl(row(10, [par('A')])) + `<div class="vpos" style="position:absolute;left:0;right:0;top:3.00mm">${tmpl(row(20, [par('B')]))}</div>` + par('C');
    const { blocks } = estimateBlocks(page(body));
    expect(near(blocks[1].t, 3) && near(blocks[1].b, 23)).toBe(true);
    expect(near(blocks[2].t, 10)).toBe(true);
  });

  it('auto-height rows: the tallest cell of stacked paragraphs plus 1/4 of the largest printed font', () => {
    const { blocks, approx } = estimateBlocks(page(row(null, [par('A') + par('B'), par('C')])));
    expect(near(blocks[0].b, 2 * 4.23 + (9 / 4) * (25.4 / 72), 0.01)).toBe(true);
    expect(approx.join(' ')).toMatch(/without a fixed height/);
  });

  it('character formats set the size that wraps and pads (nested spans, innermost wins)', () => {
    const css = '.ZX-STYLE div#AA.par{font-size:25pt;line-height:4.233mm;margin:0mm;--sapfam:HELVE} .ZX-STYLE span#T1.char{font-size:13pt} .ZX-STYLE span#T2.char{font-size:10pt}';
    const { blocks } = estimateBlocks(page(row(null, [par('<span id="T1" class="char"><span id="T2" class="char">12</span></span>')]), css));
    expect(near(blocks[0].b, 4.233 + (10 / 4) * (25.4 / 72), 0.01)).toBe(true);
  });

  it('wraps by SAP glyph widths; an empty paragraph has no line; a trailing <br> opens none', () => {
    const long = 'word '.repeat(60).trim();
    const { blocks, approx } = estimateBlocks(page(par(long) + par('') + par('one<br>')));
    expect(blocks[0].b).toBeGreaterThan(4.23 * 2);
    expect(near(blocks[1].b - blocks[1].t, 0)).toBe(true);
    expect(near(blocks[2].b - blocks[2].t, 4.23)).toBe(true);
    expect(approx.join(' ')).toMatch(/wrapped text/);
  });

  it('a word wider than its cell breaks between characters, at least one per line', () => {
    const css = '.ZX-STYLE div#AA.par{font-size:10pt;line-height:4.233mm;margin:0mm;font-family:Courier;--sapfam:COURIER}';
    const { blocks } = estimateBlocks(page(row(null, [par('ABCDEFGHIJ')], [0.1]), css));
    expect(near(blocks[0].b, 10 * 4.233 + (10 / 4) * (25.4 / 72), 0.05)).toBe(true);
  });

  it('no MAIN window: no blocks', () => {
    expect(estimateBlocks('<html><body><div class="sheet"></div></body></html>').blocks).toEqual([]);
  });
});

/** A form whose MAIN takes a loop of fixed-height rows (6 mm) under a 6 mm header, in a 60 mm MAIN. */
function longForm(rows: number) {
  const st = 'ZX_STYLE';
  const txt = (name: string, t: string) => ({ kind: 'text', name, caption: name, children: [], style: st, lines: [{ format: 'AA', text: t }] });
  return {
    content: {
      form: 'ZX_LONG', stdStyles: [st], graphics: [], includeTexts: [],
      styles: [{ name: st, css: '.ZX-STYLE div#AA.par{ font-family:Arial; font-size:9pt; line-height:4.23mm;}' }],
      data: [{ name: 'GT', scope: 'import', typing: 'TYPE', typeName: 'ZT' }, { name: 'GS', scope: 'global', typing: 'TYPE', typeName: 'ZS' }],
      pages: [{ name: 'FIRST', format: 'DINA4', orientation: 'portrait', nextPage: 'FIRST', windows: [
        { name: 'PAGENO', type: 'SECONDARY', leftMm: 150, topMm: 10, widthMm: 40, heightMm: 6, content: [txt('%PG', '&SFSY-PAGE& / &SFSY-FORMPAGES&')] },
        { name: 'MAIN', type: 'MAIN', leftMm: 10, topMm: 40, widthMm: 100, heightMm: 60, content: [
          { kind: 'loop', name: '%LOOP', caption: 'l', dataTable: 'GT', attrs: { TABHEADER: 'GS' }, children: [
            { kind: 'template', name: '%ROW', caption: 'r', width: { mm: 100 }, templateLines: [{ name: '%L1', from: 1, to: 1, heightMm: 6 }],
              cells: [{ line: '%L1', column: 1, widthMm: 100, borders: {} }], children: [{ ...txt('%C', '&GS-A&'), tableCell: { line: 1, cell: 1 } }] }] }] }] }],
    },
    values: { rows, values: { 'GS-A': Array.from({ length: rows }, (_, i) => `Item ${i + 1}`) } },
  };
}

describe('paginatePreview / renderPreview — every page drawn without a browser', () => {
  const hasSplit = typeof (BP as Record<string, unknown>).pagesFromBlocks === 'function';

  it('a loop that fits stays one page and the output is the one-page drawing', () => {
    const { content, values } = longForm(5);
    const out = renderPreview(content, values, {});
    expect(out.pages).toBe(1);
    expect(out.html).toBe(renderPreview(content, values, { paginate: false }).html);
  });

  it.runIf(hasSplit)('a loop of 25 rows of 6 mm in a 60 mm MAIN is 3 pages, with the page counter of each sheet', () => {
    const { content, values } = longForm(25);
    const out = renderPreview(content, values, {});
    expect(out.pages).toBe(3);
    expect((out.html.match(/class="sheet"/g) || []).length).toBe(3);
    expect(out.html).toContain('1 / 3');
    expect(out.html).toContain('3 / 3');
    expect(out.approximations.join(' ')).toMatch(/page breaks estimated/);
    expect(out.approximations.join(' ')).not.toMatch(/first page drawn/);
  });

  it.runIf(hasSplit)('paginatePreview measures on the fresh renderer measure() builds: the drawing renderer is untouched until it draws', () => {
    const { content, values } = longForm(25);
    const R = (BP as { Renderer: new (c: unknown, v: unknown, o: unknown) => { approx: string[]; seq: Record<string, number> } }).Renderer;
    const r = new R(content, values, {});
    let built = 0;
    const doc = paginatePreview(r, { pagesFromBlocks: (BP as { pagesFromBlocks: unknown }).pagesFromBlocks, measure: () => (built++, new R(content, values, {})) });
    expect(doc.pages).toBe(3);
    expect(built).toBe(1);
    expect(() => paginatePreview(r, { pagesFromBlocks: (BP as { pagesFromBlocks: unknown }).pagesFromBlocks })).toThrow(/measure/);
  });

  /** &G_COUNT& as an array outside a loop: the renderer gives its values in order of appearance (Renderer.seq). */
  function counterForm(rows: number) {
    const { content, values } = longForm(rows);
    const main = content.pages[0]!.windows[1]!;
    const txt = (name: string) => ({ kind: 'text', name, caption: name, children: [], style: 'ZX_STYLE', lines: [{ format: 'AA', text: 'No &G_COUNT&' }] });
    (main.content as unknown[]).unshift(txt('%N1'), txt('%N2'), txt('%N3'));
    return { content, values: { ...values, values: { ...values.values, G_COUNT: ['1', '2', '3'] } } };
  }
  const order = (html: string) => [...html.matchAll(/No (\d)/g)].map((m) => m[1]).join('');

  it('values in order of appearance print the same with paginate on and off (one page)', () => {
    const { content, values } = counterForm(2);
    const on = renderPreview(content, values, {});
    const off = renderPreview(content, values, { paginate: false });
    expect(on.pages).toBe(1);
    expect(order(off.html)).toBe('123');
    expect(on.html).toBe(off.html);
  });

  it.runIf(hasSplit)('values in order of appearance start at the first value on a multi-page print too', () => {
    const { content, values } = counterForm(25);
    const out = renderPreview(content, values, {});
    expect(out.pages).toBeGreaterThan(1);
    // every sheet holds the whole flow (its own blocks shown): the first sheet's flow reads 1, 2, 3
    const first = out.html.split('class="sheet"')[1] ?? '';
    expect(order(first)).toBe('123');
  });
});

describe('tabs (SAPscript ",,") in the wrap estimate', () => {
  const tabPar = (attrs: string, body: string, width: number) =>
    page(`<div class="cell" style="width:${width}mm;"><div class="ZX-STYLE" style="display:flow-root"><div id="AA" class="par"${attrs}>${body}</div></div></div>`);
  const lines = (html: string) => Math.round(estimateBlocks(html).blocks[0].b / 4.23);

  it('a DECIMAL stop puts the decimal sign on the stop (the amount does not start there)', () => {
    const body = 'A<span class="tab"></span>12345.67';
    expect(lines(tabPar(' data-tabs="38" data-tabj="D"', body, 45))).toBe(1);
    expect(lines(tabPar(' data-tabs="38"', body, 45))).toBe(2);
  });

  it('trailing blanks do not pass a stop: the next stop is searched from the end of the ink', () => {
    // "WWW" ends at ~9 mm, its three blanks take the pen past the 10 mm stop: the X still goes on the stop
    const body = 'WWW   <span class="tab"></span>X';
    expect(lines(tabPar(' data-tabs="10"', body, 12.5))).toBe(1);
  });
});
