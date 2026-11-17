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
    expect(p.map((x: any) => x.text)).toEqual(['1. One', '1.1. One one', '1.2. One two', '2. Two', '2.1. Two one', '?\tOgrave low <x>']);
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
