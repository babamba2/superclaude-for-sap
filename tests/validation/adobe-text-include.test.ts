import { describe, it, expect } from 'vitest';
// @ts-ignore — plain ESM script
import { readContext } from '../../scripts/adobe/read-adobe.mjs';
// @ts-ignore — plain ESM script
import { buildRecord } from '../../scripts/adobe/adobe-data.mjs';

// Synthetic context (no SAP content): an SO10 include text node as SFP downloads it — class CL_FP_TEXT_INCLUDE,
// TEXT_OBJECT / TEXT_ID as { value, field } structures, a fixed language — next to a text module.
const formXml = `<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><VERSION>1</VERSION><INTERFACE>ZTEST_IF</INTERFACE><CONTEXT href="#o1"/></asx:values><asx:heap xmlns:cls="http://www.sap.com/abapxml/classes/global">
<cls:CL_FP_CONTEXT id="o1"><CL_FP_NODE><NAME>CONTEXT</NAME><STATE>A</STATE><CONDITION/><PARENT/><SUCCESSOR/><CHILD href="#o2"/></CL_FP_NODE><CL_FP_CONTEXT/></cls:CL_FP_CONTEXT>
<cls:CL_FP_TEXT_INCLUDE id="o2"><CL_FP_NODE><NAME>INCL</NAME><STATE>A</STATE><CONDITION/><PARENT href="#o1"/><SUCCESSOR href="#o3"/><CHILD/></CL_FP_NODE><CL_FP_TEXT><APPEND_MODE>P</APPEND_MODE></CL_FP_TEXT><CL_FP_TEXT_INCLUDE><STYLE_NAME>ZTEST_STYLE</STYLE_NAME><TEXT_NAME><NAME>ZTEST_SO10</NAME><NAMEFIELD/></TEXT_NAME><TEXT_LANGUAGE><LANGUAGE>D</LANGUAGE><LANGUAGEFIELD/></TEXT_LANGUAGE><TEXT_OBJECT><OBJECT>TEXT</OBJECT><OBJECTFIELD/></TEXT_OBJECT><TEXT_ID><ID>ST</ID><IDFIELD/></TEXT_ID></CL_FP_TEXT_INCLUDE></cls:CL_FP_TEXT_INCLUDE>
<cls:CL_FP_TEXT_MODULE id="o3"><CL_FP_NODE><NAME>MODULE</NAME><STATE>A</STATE><CONDITION/><PARENT href="#o1"/><SUCCESSOR/><CHILD/></CL_FP_NODE><CL_FP_TEXT><APPEND_MODE>P</APPEND_MODE></CL_FP_TEXT><CL_FP_TEXT_MODULE><STYLE_NAME/><TEXT_NAME><NAME>ZTEST_TM</NAME><NAMEFIELD/></TEXT_NAME><TEXT_LANGUAGE><LANGUAGE>D</LANGUAGE><LANGUAGEFIELD/></TEXT_LANGUAGE><TEXT_STYLE>X</TEXT_STYLE></CL_FP_TEXT_MODULE></cls:CL_FP_TEXT_MODULE>
</asx:heap></asx:abap>`;

describe('adobe-preview: SO10 include texts in the context (CL_FP_TEXT_INCLUDE)', () => {
  const ctx = readContext(formXml);
  const root = ctx.context || ctx;

  it('reads an include text node as a text with name, language, object and id', () => {
    const incl = root.children.find((n: any) => n.name === 'INCL');
    expect(incl).toMatchObject({
      kind: 'text',
      cls: 'CL_FP_TEXT_INCLUDE',
      text: { name: 'ZTEST_SO10', language: 'D', object: 'TEXT', objectField: '', id: 'ST', idField: '', style: 'ZTEST_STYLE' },
    });
    expect(root.children.find((n: any) => n.name === 'MODULE')).toMatchObject({ kind: 'text-module', text: { name: 'ZTEST_TM' } });
  });

  it('prints the include text from the sample texts (it printed nothing before)', () => {
    const { record, missingTexts } = buildRecord(root, { texts: { ZTEST_SO10: { itf: [{ f: 'AL', t: 'Line one' }, { f: '/', t: 'Line two' }] } } });
    const incl = record.children.find((n: any) => n.name === 'INCL');
    expect(incl.rich.map((p: any) => p.text)).toEqual(['Line one\nLine two']);
    expect(missingTexts).toEqual(['ZTEST_TM']);
  });
});

// @ts-ignore — plain ESM script
import { styleFormats, itfParagraphs } from '../../scripts/adobe/adobe-data.mjs';
// @ts-ignore — plain ESM script
import { readXdp } from '../../scripts/adobe/read-adobe.mjs';
// @ts-ignore — plain ESM script
import { layoutForm } from '../../scripts/adobe/adobe-layout.mjs';

describe('adobe-preview: SmartStyle paragraphs as SAP hands them to ADS (styleFormats)', () => {
  // synthetic style rows in the shape of STXSPARA / STXSHEAD / STXSTAB (values as in FP_TEST_01's style)
  const head = { TDFIRSTPAR: 'AL', LPI: '6.00', CPI: '10.00', TDFAMILY: 'COURIER', TDHEIGHT: '120', TDBOLD: '*' };
  const para = [
    { TDPARGRAPH: 'AL', TDPJUSTIFY: 'LEFT', TDPLDIST: '1.00', TDPLDISTU: 'LN', TDPBOT: '1.00', TDPBOTU: 'LN', TDBOLD: '*' },
    { TDPARGRAPH: 'H1', TDPJUSTIFY: 'LEFT', TDPLDIST: '1.00', TDPLDISTU: 'LN', TDPTOP: '1.00', TDPTOPU: 'LN', TDPBOT: '1.00', TDPBOTU: 'LN',
      TDPLEFT: '1.00', TDPLEFTU: 'CM', TDNUMLEFT: '0.00', TDNUMBERIN: 'A', TDLFIRSTPA: 'H1', TDLDEPTH: '01', TDLCHAINED: 'X', TDLLASTC: '.',
      TDFAMILY: 'HELVE', TDHEIGHT: '160', TDBOLD: 'X' },
    { TDPARGRAPH: 'H2', TDPJUSTIFY: 'LEFT', TDPLDIST: '1.00', TDPLDISTU: 'LN', TDPLEFT: '1.50', TDPLEFTU: 'CM', TDNUMBERIN: 'A',
      TDLFIRSTPA: 'H1', TDLDEPTH: '02', TDLCHAINED: 'X', TDLLASTC: '.', TDFAMILY: 'HELVE', TDHEIGHT: '160', TDBOLD: 'X' },
    { TDPARGRAPH: 'TZ', TDPJUSTIFY: 'BLOCK', TDPLDIST: '1.00', TDPLDISTU: 'LN', TDPLEFT: '1.00', TDPLEFTU: 'CM' },
  ];
  const tabs = [{ TDPARGRAPH: 'TZ', TDPOSITION: '02', TDTABPOS: '10.00', TDTABPOSU: 'CM', TDTJUSTIFY: 'LEFT' },
    { TDPARGRAPH: 'TZ', TDPOSITION: '01', TDTABPOS: '1.50', TDTABPOSU: 'CM', TDTJUSTIFY: 'RIGHT' }];
  const f = styleFormats(para, head, tabs);

  it('fonts from the paragraph or the header, lengths in mm (LN = 1/LPI inch), tabs, the default paragraph', () => {
    expect(f.H1).toMatchObject({ family: 'Arial', pt: 16, bold: true, left: 10, top: 25.4 / 6, bottom: 25.4 / 6, indent: -10 });
    expect(f.TZ).toMatchObject({ family: 'Courier New', pt: 12, bold: false, align: 'justify', left: 10, tabs: [{ align: 'right', pos: 15 }, { align: 'left', pos: 100 }] });
    expect(f['*']).toBe(f.AL);
  });

  it('numbers outline paragraphs (chained, closing character) and turns SAPscript codes into text', () => {
    const p = itfParagraphs([{ f: 'H1', t: 'One' }, { f: 'H2', t: 'One one' }, { f: 'H2', t: 'One two' }, { f: 'H1', t: 'Two' }, { f: 'H2', t: 'Two one' },
      { f: 'TZ', t: '<280>,,Ograve <ZT>low</> <(>x<)>' }], f);
    expect(p.map((x: any) => x.text)).toEqual(['1. One', '1.1. One one', '1.2. One two', '2. Two', '2.1. Two one', 'Ò\tOgrave low <x>']);
    expect(p[5].style).toContain('tab-stops:right 15mm left 100mm');
    expect(p[0].style).toContain('margin-left:10mm');
  });
});

describe('adobe-preview: a growable field longer than the page splits between its lines', () => {
  const lines = Array.from({ length: 120 }, (_, i) => `Line ${i + 1}`).join('\n');
  const xdp = `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform layout="tb" name="data"><pageSet><pageArea name="P1"><contentArea x="10mm" y="10mm" w="190mm" h="200mm"/><medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>
<subform layout="tb" name="S" w="190mm"><draw name="HEAD" w="190mm" h="20mm"><ui><textEdit/></ui><value><text>Heading</text></value><font typeface="Arial" size="10pt"/></draw>
<field name="LONG" w="190mm" minH="7mm"><ui><textEdit multiLine="1"/></ui><value><text>${lines}</text></value><font typeface="Arial" size="10pt"/><margin topInset="1mm" bottomInset="1mm" leftInset="1mm" rightInset="1mm"/></field></subform></subform></template></xdp:xdp>`;
  const out = layoutForm(readXdp(xdp).template, { name: 'data', children: [] }, {});
  const texts = (p: any) => p.items.filter((i: any) => i.type === 'text');
  it('starts under the heading on page 1 and goes on at the next page top; every line once', () => {
    expect(out.pages.length).toBeGreaterThan(1);
    const p1 = texts(out.pages[0]), p2 = texts(out.pages[1]);
    expect(p1.some((t: any) => t.text === 'Heading')).toBe(true);
    expect(p1.some((t: any) => t.text === 'Line 1')).toBe(true);
    // the continuation starts at the content area's top (10 mm + the line's ascent), no line twice
    expect(p2[0].y).toBeLessThan(10 + 6);
    const all = out.pages.flatMap((p: any) => texts(p).map((t: any) => t.text)).filter((s: string) => s.startsWith('Line '));
    expect(all.length).toBe(120);
    expect(new Set(all).size).toBe(120);
    for (const p of out.pages) for (const t of texts(p)) expect(t.y).toBeLessThanOrEqual(10 + 200 + 0.01);
  });
});

describe('adobe-preview: FP_TEST_01 calibration (SAP characters, character formats, spacing, justify, split pieces)', () => {
  // synthetic rows in the shape of STXSPARA / STXSHEAD / STXSCHAR (values as in FP_TEST_01's style)
  const head = { TDFIRSTPAR: 'AL', LPI: '6.00', CPI: '10.00', TDFAMILY: 'COURIER', TDHEIGHT: '120' };
  const para = [
    { TDPARGRAPH: 'AL', TDPJUSTIFY: 'LEFT', TDPLDIST: '1.00', TDPLDISTU: 'LN', TDPBOT: '1.00', TDPBOTU: 'LN' },
    { TDPARGRAPH: 'TZ', TDPJUSTIFY: 'LEFT', TDPLDIST: '1.00', TDPLDISTU: 'LN', TDPLEFT: '1.00', TDPLEFTU: 'CM' },
    { TDPARGRAPH: 'AB', TDPJUSTIFY: 'BLOCK', TDPLDIST: '1.00', TDPLDISTU: 'LN', TDPBOT: '1.00', TDPBOTU: 'LN' },
  ];
  const chars = [
    { TDSTRING: 'FH', TDFAMILY: 'HELVE', TDHEIGHT: '000', TDBOLD: '*' },
    { TDSTRING: 'K8', TDHEIGHT: '080', TDBOLD: '*' },
    { TDSTRING: 'ZF', TDHEIGHT: '000', TDBOLD: 'X' },
    { TDSTRING: 'ZH', TDHEIGHT: '000', TDSUPER: 'X' },
  ];
  const f = styleFormats(para, head, [], chars);
  it('prints SAP characters by their TCP01 number; an unknown 3-digit one keeps its width as ?', () => {
    const p = itfParagraphs([{ f: 'TZ', t: '<33>,,exclam,,<303>,,brokenbar <999>' }], f);
    expect(p[0].text).toBe('!\texclam\t¦\tbrokenbar ?');
  });
  it('turns character formats into spans that run to the end of the paragraph unless closed', () => {
    const p = itfParagraphs([{ f: 'AL', t: '<FH><K8>Small Helvetica' }, { f: '', t: 'still small' }, { f: '/', t: '<ZF>bold</> plain <ZH>up</>' }], f);
    expect(p[0].text).toBe('Small Helvetica still small\nbold plain up');
    const s = p[0].spans;
    expect(s[0]).toEqual({ text: 'Small Helvetica still small\n', style: 'font-family:Arial;font-size:8pt' });
    expect(s.find((x: any) => x.text === 'bold').style).toBe('font-family:Arial;font-size:8pt;font-weight:bold');
    expect(s.find((x: any) => x.text === 'up').style).toContain('vertical-align:+6pt');
    // a paragraph without character formats keeps plain text only
    expect(itfParagraphs([{ f: 'AL', t: 'plain' }], f)[0].spans).toBeUndefined();
  });
  it('takes a missing margin from the default paragraph, as ADS inherits it from the wrapping div', () => {
    const p = itfParagraphs([{ f: 'TZ', t: 'A B C' }], f);
    expect(p[0].style).toContain('margin-bottom:4.23mm');
    expect(p[0].style).toContain('margin-left:10mm');
  });
  const page = (body: string, orig = '') => `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.4/">
<subform layout="tb" name="data"><pageSet><pageArea name="P1"><contentArea x="10mm" y="10mm" w="100mm" h="60mm"/><medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>
<subform layout="tb" name="S" w="100mm">${body}</subform></subform>${orig}</template></xdp:xdp>`;
  const field = (name: string, para = '') => `<field name="${name}" w="100mm" minH="7mm"><ui><textEdit multiLine="1"/></ui><value><exData contentType="text/html"/></value><font typeface="Courier New" size="12pt"/><margin topInset="1mm" bottomInset="1mm" leftInset="1mm" rightInset="1mm"/>${para}</field>`;
  const texts = (p: any) => p.items.filter((i: any) => i.type === 'text');
  it('moves a super- / subscript span by the CSS length SAP writes (+6pt / -6pt)', () => {
    const rich = [{ text: 'a up b', style: 'font-family:Courier New;font-size:12pt', spans: [{ text: 'a ', style: '' }, { text: 'up', style: 'vertical-align:+6pt' }, { text: ' b', style: '' }] }];
    const out = layoutForm(readXdp(page(field('T'))).template, { name: 'data', children: [{ name: 'T', rich, text: '' }] }, {});
    const t = texts(out.pages[0]);
    const up = t.find((x: any) => x.text === 'up'), a = t.find((x: any) => x.text.startsWith('a'));
    expect(a.y - up.y).toBeCloseTo(6 * 25.4 / 72, 2);
  });
  it('spreads the word gaps of a justified line except a paragraph\'s last line', () => {
    const words = Array.from({ length: 14 }, (_, i) => `w${i}`).join(' ');
    const rich = [{ text: words, style: 'font-family:Courier New;font-size:12pt;text-align:justify' }];
    const out = layoutForm(readXdp(page(field('T'))).template, { name: 'data', children: [{ name: 'T', rich, text: '' }] }, {});
    const t = texts(out.pages[0]);
    expect(t.length).toBeGreaterThan(1);
    expect(t[0].ws).toBeGreaterThan(0);
    expect(t[t.length - 1].ws).toBeUndefined();
  });
  it('keeps a value 1 pt off the field edge in a template upgraded from XFA 2.1', () => {
    const rich = [{ text: 'x', style: 'font-family:Courier New;font-size:12pt' }];
    const rec = { name: 'data', children: [{ name: 'T', rich, text: '' }] };
    const plain = texts(layoutForm(readXdp(page(field('T'))).template, rec, {}).pages[0])[0].x;
    const old = texts(layoutForm(readXdp(page(field('T'), '<?originalXFAVersion http://www.xfa.org/schema/xfa-template/2.1/?>')).template, rec, {}).pages[0])[0].x;
    expect(old - plain).toBeCloseTo(25.4 / 72, 2);
  });
  it('aligns a split middle field by its first piece; continuation pages start at the top; a paragraph keeps its space after on the page', () => {
    const rich = Array.from({ length: 30 }, (_, i) => ({ text: `L${i}`, style: 'font-family:Courier New;font-size:12pt;line-height:4.23mm' }));
    const out = layoutForm(readXdp(page(field('T', '<para vAlign="middle"/>'))).template, { name: 'data', children: [{ name: 'T', rich, text: '' }] }, {});
    expect(out.pages.length).toBeGreaterThan(1);
    // page 2 starts at the content area's top (10 mm + the Courier line's baseline under a 4.23 mm line-height)
    expect(texts(out.pages[1])[0].y).toBeCloseTo(10 + 2.66, 1);
    // no paragraph's line box plus its space after runs past the content area
    for (const p of out.pages) for (const t of texts(p)) expect(t.y).toBeLessThanOrEqual(70);
  });
});

describe('adobe-preview: a width-less lr-tb line broken over pages (calibration lrtb: SAP SmartForm migrations)', () => {
  const rows = Array.from({ length: 10 }, (_, i) => `<draw name="R${i}" w="50mm" h="8mm"><value><text>Row ${i}</text></value><font typeface="Arial" size="10pt"/></draw>`).join('');
  const xdp = (n: number) => `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform layout="tb" name="data"><pageSet><pageArea name="P1"><contentArea x="10mm" y="10mm" w="160mm" h="60mm"/><medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>
<subform name="MAIN" layout="lr-tb"><draw name="INTRO" w="80mm" h="10mm"><value><text>Intro</text></value><font typeface="Arial" size="10pt"/></draw>
<subform name="TABLE" layout="tb">${rows.split('</draw>').slice(0, n).join('</draw>')}</draw></subform>
<draw name="END" w="40mm" h="10mm"><value><text>End</text></value><font typeface="Arial" size="10pt"/></draw></subform></subform></template></xdp:xdp>`;
  const texts = (p: any) => p.items.filter((i: any) => i.type === 'text');
  it('a line that fits stays one line: intro, table, end side by side on one page', () => {
    const out = layoutForm(readXdp(xdp(5)).template, { name: 'data', children: [] }, {});
    expect(out.pages.length).toBe(1);
    const t = texts(out.pages[0]);
    expect(t.find((x: any) => x.text === 'Row 0').x).toBeGreaterThan(10 + 80 - 0.5);
  });
  it('an overflowing table goes first at the line start; intro and end wait for the next page, the rest of the table between them', () => {
    const out = layoutForm(readXdp(xdp(10)).template, { name: 'data', children: [] }, {});
    expect(out.pages.length).toBe(2);
    const p1 = texts(out.pages[0]), p2 = texts(out.pages[1]);
    expect(p1.some((x: any) => x.text === 'Intro')).toBe(false);
    expect(p1.find((x: any) => x.text === 'Row 0').x).toBeLessThan(10 + 5);
    expect(p2.find((x: any) => x.text === 'Intro').x).toBeLessThan(10 + 5);
    const rest = p2.filter((x: any) => /^Row /.test(x.text));
    expect(rest.length).toBeGreaterThan(0);
    for (const r of rest) expect(r.x).toBeGreaterThan(10 + 80 - 0.5);
    expect(p2.find((x: any) => x.text === 'End').x).toBeGreaterThan(10 + 80 + 50 - 0.5);
    const all = out.pages.flatMap((p: any) => texts(p).map((x: any) => x.text)).filter((s: string) => /^Row /.test(s));
    expect(new Set(all).size).toBe(10);
    expect(out.report.approximations.join(' ')).toMatch(/lr-tb line broken over pages/);
  });
});

describe('adobe-preview: lr-tb break — an item taller than the room whose rows fit (verifier probe)', () => {
  const xdp = (attrs: string) => `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform layout="tb" name="data"><pageSet><pageArea name="P1"><contentArea x="10mm" y="10mm" w="160mm" h="60mm"/><medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>
<subform name="MAIN" layout="lr-tb"><draw name="INTRO" w="80mm" h="10mm"><value><text>Intro</text></value><font typeface="Arial" size="10pt"/></draw>
<subform name="TABLE" layout="tb" ${attrs}>${[0, 1, 2].map((i) => `<draw name="R${i}" w="50mm" h="8mm"><value><text>Row ${i}</text></value><font typeface="Arial" size="10pt"/></draw>`).join('')}</subform>
<draw name="END" w="40mm" h="10mm"><value><text>End</text></value><font typeface="Arial" size="10pt"/></draw></subform></subform></template></xdp:xdp>`;
  for (const a of ['h="100mm"', 'minH="100mm"']) {
    it(`TABLE ${a}: no text is lost — intro, rows and end are all drawn`, () => {
      const out = layoutForm(readXdp(xdp(a)).template, { name: 'data', children: [] }, {});
      const all = out.pages.flatMap((p: any) => p.items.filter((i: any) => i.type === 'text').map((i: any) => i.text));
      for (const t of ['Intro', 'Row 0', 'Row 1', 'Row 2', 'End']) expect(all).toContain(t);
      expect(all.filter((t: string) => t === 'Row 0').length).toBe(1);
    });
  }
});

describe('adobe-preview: a template that keeps XFA 2.1 positioning (originalXFAVersion … LegacyPositioning:1, FP_TEST_03)', () => {
  const xdp = (pi = '') => `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.4/">
<subform layout="tb" name="data"><pageSet><pageArea name="P1"><contentArea x="10mm" y="10mm" w="150mm" h="200mm"/><medium short="210mm" long="297mm" stock="a4"/></pageArea></pageSet>
${['A', 'B', 'C'].map((n) => `<field name="${n}" w="40mm" minH="5mm"><ui><textEdit><border><edge presence="hidden"/></border><margin/></textEdit></ui><font typeface="Arial"/><margin topInset="1mm" bottomInset="1mm" leftInset="1mm" rightInset="1mm"/><para vAlign="middle"/></field>`).join('')}
<draw name="D1" w="40mm"><value><text>d1</text></value><font typeface="Arial"/></draw><draw name="D2" w="40mm"><value><text>d2</text></value><font typeface="Arial"/></draw>
</subform>${pi}</template></xdp:xdp>`;
  const rec = { name: 'data', children: ['A', 'B', 'C'].map((n) => ({ name: n, value: n.toLowerCase() })) };
  const ys = (pi: string) => {
    const t = layoutForm(readXdp(xdp(pi)).template, rec, {}).pages[0].items.filter((i: any) => i.type === 'text');
    const y = (s: string) => t.find((x: any) => x.text === s).y;
    return { pitch: y('b') - y('a'), draws: y('d2') - y('d1') };
  };
  it('grows a minH field to 1.15 em + 1/32 inch above and below + insets (7.64 mm for Arial 10, 1 mm insets), as ADS', () => {
    const legacy = ys('<?originalXFAVersion http://www.xfa.org/schema/xfa-template/2.1/ LegacyPositioning:1 LegacyEventModel:1?>');
    expect(legacy.pitch).toBeCloseTo(10 * 1.15 * 25.4 / 72 + 25.4 / 16 + 2, 1);
    // draws keep the 2.4+ rules; a 2.1 upgrade without the flag is unchanged
    const upgraded = ys('<?originalXFAVersion http://www.xfa.org/schema/xfa-template/2.1/?>');
    const plain = ys('');
    expect(upgraded.pitch).toBeCloseTo(plain.pitch, 3);
    expect(legacy.draws).toBeCloseTo(plain.draws, 3);
    expect(legacy.pitch - plain.pitch).toBeGreaterThan(2);
  });
});
