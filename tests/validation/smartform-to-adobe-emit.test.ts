import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { paragraphCss, charCss, itfToXhtml, measureMm } from '../../scripts/adobe/sf-to-adobe-emit.mjs';

// The fallback emitter writes texts the way CL_SSF_XFA_XHTML / CL_SSF_CSS do (read on ECC and S/4 DEV). Self-written
// style values only.
const STYLE = { cpi: 10, lpi: 6, firstParagraph: 'AS',
  paragraphs: [
    { tag: 'AS', family: 'COURIER', size: 120, bold: '*', italic: '*', lineSpacing: '1.00 LN', align: 'LEFT', tabs: [['3.50 CM', 'LEFT']] },
    { tag: 'TB', lineSpacing: '1.00 LN', align: 'LEFT', left: '2.00 MM', tabs: [['4.00 CM', 'DECIMAL'], ['5.00 CM', 'LEFT']] },
  ],
  strings: [{ tag: 'S', family: 'HELVE', size: 80, bold: '*', italic: '*' }, { tag: 'B', bold: 'X' }] };

describe('smartform-to-adobe — fallback emitter text rules', () => {
  it('measures: LN from lpi, CH from cpi, PT, CM, MM', () => {
    expect(measureMm('1.00 LN', { lpi: 6 })).toBeCloseTo(4.2333, 3);
    expect(measureMm('2.00 CH', { cpi: 10 })).toBeCloseTo(5.08, 3);
    expect(measureMm('12.00 PT')).toBeCloseTo(4.2333, 3);
    expect(measureMm('0.50 CM')).toBe(5);
  });

  it('paragraph CSS as CL_SSF_CSS renders it: "prop : value ;", win32 family, line-height in mm, tab stops in cm', () => {
    expect(paragraphCss(STYLE.paragraphs[0], STYLE)).toBe("font-family : 'Courier New' ; font-size : 12pt ; line-height : 4.233mm ; text-align : left ; clear : both ; tab-stop : left 3.5cm ;");
    expect(paragraphCss(STYLE.paragraphs[1], STYLE)).toBe('line-height : 4.233mm ; text-align : left ; margin-left : 2mm ; clear : both ; tab-stop : decimal 4cm left 5cm ;');
    expect(charCss(STYLE.strings[0])).toBe("font-family : 'Arial' ; font-size : 8pt ;");
  });

  it('ITF → divs: "/" a new line in the paragraph, ",," one tab span each, <X>…</> a span, &f& an embed with dots, comments skipped', () => {
    const { html, fields } = itfToXhtml([
      { format: 'AS', text: '<S>Clerk,,</>Mr. Demo' },
      { format: '/', text: '&GS_ITEM-MATNR&' },
      { format: '/*', text: '&HIDDEN&' },
      { format: 'TB', text: ",,,,&'No. 'GS_ITEM-POSNR(Z)&" },
    ], STYLE);
    expect(html).toContain('<span style="font-family : \'Arial\' ; font-size : 8pt ;">Clerk<span style="xfa-tab-count : 1 ;"/></span>Mr. Demo<br/><span xfa:embed="GS_ITEM.MATNR"/>');
    expect(html).toContain('<span style="xfa-tab-count : 1 ;"/><span style="xfa-tab-count : 1 ;"/>No. <span xfa:embed="GS_ITEM.POSNR"/>');
    expect(html.match(/<div /g)).toHaveLength(2);
    expect(fields.map((f: any) => f.itf)).toEqual(['GS_ITEM-MATNR', 'GS_ITEM-POSNR']);
    expect(html).not.toContain('HIDDEN');
  });
});
