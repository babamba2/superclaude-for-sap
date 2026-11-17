import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { cutPages, pagePlan, Renderer } from '../../scripts/smartform/build-preview.mjs';

// Page definitions in the shape of GetSmartFormContent's content.json (invented names); blocks = MAIN rows / paragraphs
// as the measuring pass reports them (mm from the top of MAIN).
const win = (name: string, type: string, h = 100) => ({ name, type, leftMm: 20, topMm: 50, widthMm: 170, heightMm: h, content: [] });
const page = (name: string, nextPage: string, wins: any[]) => ({ name, nextPage, orientation: 'portrait', windows: wins });
const rows = (n: number, h = 10) => Array.from({ length: n }, (_, i) => ({ t: i * h, b: (i + 1) * h, brk: false }));
const nextOf = (pages: any[]) => (p: any) => pages.find((q) => q.name === p.nextPage) || p;

describe('smartform-preview: pages', () => {
  it('cuts MAIN before the first block that does not end inside the page; the first block always prints', () => {
    expect(cutPages(rows(25), () => 100).sheets).toEqual([{ from: 0, to: 10 }, { from: 10, to: 20 }, { from: 20, to: 25 }]);
    expect(cutPages([{ t: 0, b: 150, brk: false }, ...rows(2).map((r) => ({ ...r, t: r.t + 150, b: r.b + 150 }))], () => 100).sheets)
      .toEqual([{ from: 0, to: 1 }, { from: 1, to: 3 }]);
  });

  it('a NEWPAGE command ends the page; following pages take their own MAIN height', () => {
    const b = [...rows(3), { t: 30, b: 30, brk: true }, ...rows(3).map((r) => ({ ...r, t: r.t + 30, b: r.b + 30 }))];
    expect(cutPages(b, () => 100).sheets).toEqual([{ from: 0, to: 4 }, { from: 4, to: 7 }]);
    expect(cutPages(rows(12), (k: number) => (k === 0 ? 50 : 200)).sheets).toEqual([{ from: 0, to: 5 }, { from: 5, to: 12 }]);
  });

  it('follows the page order: a cover page without MAIN, MAIN pages on the next page; the print ends with MAIN', () => {
    const pages = [page('COVER', 'BODY', [win('LOGO', 'SECONDARY')]), page('BODY', 'TERMS', [win('MAIN', 'MAIN', 50)]), page('TERMS', 'TERMS', [win('T', 'SECONDARY')])];
    const plan = pagePlan(pages, rows(8), nextOf(pages));
    expect(plan.sheets.map((s: any) => s.def.name)).toEqual(['COVER', 'BODY', 'BODY']);
    expect(plan.sheets.filter((s: any) => s.def.name === 'BODY').map((s: any) => [s.from, s.to])).toEqual([[0, 5], [5, 8]]);
    // a form that fits on its one page stays one page
    const one = [page('P1', 'P1', [win('MAIN', 'MAIN', 200)])];
    expect(pagePlan(one, rows(5), nextOf(one)).sheets).toHaveLength(1);
  });

  it('page symbols and page conditions follow the sheet: page k of n, first-page-only windows on sheet 1 only', () => {
    const content = { form: 'ZTEST_PAGES', styles: [], pages: [
      page('FIRST', 'NEXT', [win('MAIN', 'MAIN', 50), { ...win('HEAD', 'SECONDARY'), topMm: 10, heightMm: 10, condition: { firstPage: true }, content: [{ kind: 'text', name: 'T1', lines: [{ format: '*', text: 'Cover head' }] }] },
        { ...win('PAGENO', 'SECONDARY'), topMm: 270, heightMm: 10, content: [{ kind: 'text', name: 'T2', lines: [{ format: '*', text: 'Page &SFSY-PAGE& of &SFSY-FORMPAGES&' }] }] }]),
      page('NEXT', 'NEXT', [win('MAIN', 'MAIN', 200), { ...win('PAGENO', 'SECONDARY'), topMm: 270, heightMm: 10, content: [{ kind: 'text', name: 'T3', lines: [{ format: '*', text: 'Page &SFSY-PAGE& of &SFSY-FORMPAGES&' }] }] }]),
    ] };
    const r = new Renderer(content, {});
    const plan = { sheets: [{ def: content.pages[0], from: 0, to: 1 }, { def: content.pages[1], from: 1, to: 2 }] };
    const doc = r.pages(plan);
    expect(doc.pages).toBe(2);
    const sheets = doc.html.split('class="sheet"').slice(1);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toContain('Cover head');
    expect(sheets[1]).not.toContain('Cover head');
    expect(sheets[0].replace(/<[^>]*>/g, '')).toMatch(/Page\s*1\s*of\s*2/);
    expect(sheets[1].replace(/<[^>]*>/g, '')).toMatch(/Page\s*2\s*of\s*2/);
    expect(sheets[1]).toContain('class="mainflow" data-from="1" data-to="2"');
    // one-page rendering is unchanged: no mainflow wrapper, page 1 of 1
    const single = new Renderer(content, {}).page();
    expect(single.html).not.toContain('mainflow');
    expect(single.html.replace(/<[^>]*>/g, '')).toMatch(/Page\s*1\s*of\s*1/);
  });
});
