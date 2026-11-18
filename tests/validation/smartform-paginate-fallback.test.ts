import { describe, it, expect, vi } from 'vitest';

// The page cut throws (a form the estimate cannot read): the preview must still draw the page, as before pagination.
vi.mock('../../scripts/smartform/preview-paginate.mjs', () => ({
  paginatePreview: () => {
    throw new Error('estimate failed');
  },
}));

// @ts-ignore — plain ESM
const { renderPreview } = await import('../../scripts/smartform/preview-workbench.mjs');

const st = 'ZX_STYLE';
const txt = (name: string, t: string) => ({ kind: 'text', name, caption: name, children: [], style: st, lines: [{ format: 'AA', text: t }] });
const content = {
  form: 'ZX_FALLBACK', stdStyles: [st], graphics: [], includeTexts: [],
  styles: [{ name: st, css: '.ZX-STYLE div#AA.par{ font-family:Arial; font-size:9pt; line-height:4.23mm;}' }],
  data: [{ name: 'G_COUNT', scope: 'global', typing: 'TYPE', typeName: 'CHAR10' }],
  pages: [{ name: 'FIRST', format: 'DINA4', orientation: 'portrait', nextPage: 'FIRST', windows: [
    { name: 'MAIN', type: 'MAIN', leftMm: 10, topMm: 40, widthMm: 100, heightMm: 60, content: [txt('%N1', 'No &G_COUNT&'), txt('%N2', 'No &G_COUNT&'), txt('%N3', 'No &G_COUNT&')] },
  ] }],
};
const values = { rows: 1, values: { G_COUNT: ['1', '2', '3'] } };

describe('renderPreview when the page cut fails', () => {
  it('draws the page on its own, with a note, the same as without pagination', () => {
    const out = renderPreview(content, values, {});
    const off = renderPreview(content, values, { paginate: false });
    expect(out.pages).toBe(1);
    expect(out.html).toBe(off.html);
    expect([...out.html.matchAll(/No (\d)/g)].map((m: RegExpMatchArray) => m[1]).join('')).toBe('123');
    expect(out.approximations.join(' ')).toMatch(/page breaks not estimated \(estimate failed\): one page drawn/);
    expect(off.approximations.join(' ')).not.toMatch(/page breaks not estimated/);
  });
});
