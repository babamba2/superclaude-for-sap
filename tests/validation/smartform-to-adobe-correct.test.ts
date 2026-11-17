import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { correctionSpec, xdpTargets } from '../../scripts/adobe/sf-to-adobe-correct.mjs';

// A synthetic template in the shape SAP's migration writes (invented names, no SAP content): MAIN as lr-tb,
// page-area windows as use="#id" references to <proto> subforms, a repeated name, a date field with DateFmt.
const XDP = `<?xml version="1.0" encoding="utf-8"?>
<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform name="ZDEMO_FORM" layout="tb"><pageSet><pageArea name="FIRST"><contentArea x="2cm" y="10cm" w="16cm" h="16cm"/>
<subform name="FIRST_INFO" use="#FIRST_INFO"/></pageArea></pageSet>
<proto><subform id="FIRST_INFO" name="FIRST_INFO" layout="lr-tb" x="11cm" y="4.5cm" w="8cm" h="4cm">
<field name="DATUM"><event activity="initialize"><script>$.format.picture = DateFmt(2, $.locale);</script></event></field></subform>
<subform id="FIRST_ADDR" name="FIRST_ADDR" layout="lr-tb" x="2cm" y="4.5cm" w="8cm" h="4cm"/></proto>
<subform name="MAIN" layout="lr-tb"><subform name="ROW" layout="tb"><field name="append_mode__"/><field name="append_mode__"/></subform></subform>
</subform></template></xdp:xdp>`;
const content = { pages: [{ windows: [
  { name: 'MAIN', type: 'MAIN', leftMm: 20, topMm: 100, widthMm: 160, heightMm: 160 },
  { name: 'INFO', type: 'SECONDARY', leftMm: 110, topMm: 45, widthMm: 80, heightMm: 40 },
  { name: 'ADDR', type: 'SECONDARY', leftMm: 20, topMm: 45, widthMm: 80, heightMm: 40 },
] }] };
// positioned-text "prints": the migrated one has INFO 2.4 mm higher, ADDR 1.5 mm lower and a medium date
const page = (texts: [number, number, string][]) => ({ pages: [{ w: 210, h: 297, texts: texts.map(([x, y, text]) => ({ x, y, text })), lines: [] }] });
const sf = page([[110, 50, 'Clerk'], [110, 55, 'Phone'], [110, 60, '11/17/2026'], [20, 50, 'Sample Ltd'], [20, 55, '1 Road'], [20, 110, 'Dear customer']]);
const af = page([[110, 47.6, 'Clerk'], [110, 52.6, 'Phone'], [110, 57.6, 'Nov 17, 2026'], [20, 51.5, 'Sample Ltd'], [20, 56.5, '1 Road'], [20, 110, 'Dear customer']]);

describe('smartform-to-adobe: correction spec v1', () => {
  it('names targets by path from the root and by proto id; a repeated name carries [n] on every instance', () => {
    const t = xdpTargets(XDP);
    expect([...t.byPath.keys()]).toContain('ZDEMO_FORM.MAIN.ROW.append_mode__[0]');
    expect([...t.byPath.keys()]).toContain('ZDEMO_FORM.MAIN.ROW.append_mode__[1]');
    expect([...t.protos.keys()].sort()).toEqual(['FIRST_ADDR', 'FIRST_INFO']);
  });

  it('R1: MAIN flows top to bottom', () => {
    const s = correctionSpec({ content, layoutXdp: XDP, source: 'ZDEMO' });
    expect(s).toMatchObject({ version: 1, source: 'ZDEMO' });
    expect(s.ops).toEqual([{ op: 'layout', target: { path: 'ZDEMO_FORM.MAIN' }, value: 'tb', rule: 'R1' }]);
  });

  it('R2 / R3 from a calibration: top inset for content printed too high, window up for content too low, date picture', () => {
    const s = correctionSpec({ content, layoutXdp: XDP, sfPdf: sf, afPdf: af });
    expect(s.ops).toContainEqual(expect.objectContaining({ op: 'margin', target: { protoId: 'FIRST_INFO' }, topInset: '2.4mm', rule: 'R2' }));
    expect(s.ops).toContainEqual(expect.objectContaining({ op: 'geometry', target: { protoId: 'FIRST_ADDR' }, y: '43.5mm', rule: 'R2' }));
    // DATUM sets its picture in an initialize script (DateFmt), which would override a template picture: datePicture
    expect(s.ops).toContainEqual(expect.objectContaining({ op: 'datePicture', target: { protoId: 'FIRST_INFO', path: 'DATUM' }, picture: 'date{MM/DD/YYYY}', rule: 'R3' }));
    // an evidence line carries no printed value
    expect(JSON.stringify(s.ops)).not.toMatch(/11\/17/);
  });
});

describe('smartform-to-adobe: hidden-field holders (R6) and the font of embedded values (R7)', () => {
  // a table cell as MIGRATE writes it: a holder subform of hidden fields and a draw embedding them (invented names)
  const cell = (proto = false) => `<subform layout="lr-tb" name="CELL" w="16mm"><field name="append_mode__" presence="hidden"/>
<subform name="WA"><field name="FLD" presence="hidden"><bind match="dataRef" ref="$record.ROWS[*].FLD"/></field></subform>
<draw name="TXT" w="16mm"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml"><div style="font-family:'Courier New';font-size:12pt;"><span style="font-family:'Arial';font-size:10pt;font-weight:bold;"><span xfa:embed="WA.FLD"/></span></div></div></exData></value></draw>
<subform name="KEEP"><field name="SHOWN"/></subform></subform>${proto ? '' : ''}`;
  const xdp = `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform name="ZDEMO" layout="tb"><pageSet><pageArea name="P1"><contentArea x="2cm" y="2cm" w="16cm" h="20cm"/></pageArea></pageSet>
<proto><subform id="FOOT" name="FOOT" layout="tb">${cell(true)}</subform></proto>
<subform name="MAIN" layout="tb">${cell()}</subform></subform></template></xdp:xdp>`;
  const ops = correctionSpec({ content: { pages: [] }, layoutXdp: xdp }).ops;
  it('hides the holder (path or proto target) and gives its field the embedding span font', () => {
    expect(ops.filter((o: any) => o.rule === 'R6').map((o: any) => o.target)).toEqual([
      { path: 'ZDEMO.MAIN.CELL.WA' }, { protoId: 'FOOT', path: 'CELL.WA' }]);
    expect(ops.find((o: any) => o.rule === 'R6').basis).toBeTruthy();
    expect(ops.filter((o: any) => o.rule === 'R7')).toEqual([
      expect.objectContaining({ op: 'font', target: { path: 'ZDEMO.MAIN.CELL.WA.FLD' }, typeface: 'Arial', size: '10pt', weight: 'bold' }),
      expect.objectContaining({ op: 'font', target: { protoId: 'FOOT', path: 'CELL.WA.FLD' }, typeface: 'Arial', size: '10pt', weight: 'bold' })]);
  });
  it('leaves a subform with a visible field alone', () => {
    expect(ops.some((o: any) => JSON.stringify(o.target).includes('KEEP'))).toBe(false);
  });
});

describe('smartform-to-adobe: embedLead (R8), row pitch (R9), date ops (R3)', () => {
  const xdp = `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform name="ZDEMO" layout="tb"><pageSet><pageArea name="P1"><contentArea x="2cm" y="2cm" w="16cm" h="20cm"/></pageArea></pageSet>
<subform name="MAIN" layout="tb"><subform name="TAB" layout="table"><subform name="layout_row" layout="row"><margin bottomInset="0.5mm"/>
<draw name="AMT"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml"><div style="text-align : right ;"><span style="font-size:10pt"><span xfa:embed="WA.AMT"/></span></div></div></exData></value></draw>
<draw name="KEY"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml"><div style="text-align : left ;"><span xfa:embed="WA.KEY"/></div></div></exData></value></draw>
<draw name="LBL"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml"><div style="text-align : center ;">Total <span xfa:embed="WA.SUM"/></div></div></exData></value></draw>
</subform></subform></subform></subform></template></xdp:xdp>`;
  // rows at 5.12 mm in the SmartForm, 3.53 mm in the migrated print (three columns)
  const rows = (pitch: number) => ({ pages: [{ w: 210, h: 297, lines: [], texts: [0, 1, 2, 3].flatMap((i) => [[30, `K${i}`], [60, `A${i}`], [90, `S${i}`]].map(([x, text]) => ({ x, y: 30 + i * pitch, text }))) }] });
  const ops = correctionSpec({ content: { pages: [] }, layoutXdp: xdp, sfPdf: rows(5.12), afPdf: rows(3.53) }).ops;
  it('R8: embedLead only on a right / center paragraph holding embedded values only', () => {
    expect(ops.filter((o: any) => o.rule === 'R8')).toEqual([{ op: 'embedLead', target: { path: 'ZDEMO.MAIN.TAB.layout_row.AMT' }, rule: 'R8' }]);
  });
  it('R9: the pitch difference adds to the row bottom inset', () => {
    expect(ops.filter((o: any) => o.rule === 'R9')).toEqual([expect.objectContaining({ op: 'margin', target: { path: 'ZDEMO.MAIN.TAB.layout_row' }, bottomInset: '2.09mm' })]);
    // equal pitch: nothing
    expect(correctionSpec({ content: { pages: [] }, layoutXdp: xdp, sfPdf: rows(5), afPdf: rows(5) }).ops.some((o: any) => o.rule === 'R9')).toBe(false);
  });
});

describe('smartform-to-adobe: block offsets (R10) and the exact DateFmt form (R3)', () => {
  const xdp = (script: string) => `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform name="ZDEMO" layout="tb"><pageSet><pageArea name="P1"><contentArea x="2cm" y="2cm" w="16cm" h="20cm"/></pageArea></pageSet>
<proto><subform id="HEAD" name="HEAD" layout="tb"><margin topInset="0.5mm"/><draw name="H1"><value><text>Carr.</text></value><desc><text>Carrier</text></desc></draw></subform></proto>
<subform name="MAIN" layout="tb"><subform name="INTRO" layout="tb"><draw name="T"><value><text>Intro line</text></value></draw></subform>
<subform name="ROW" layout="tb"><field name="FLDATE"><event activity="initialize"><script>${script}</script></event></field></subform></subform></subform></template></xdp:xdp>`;
  const page = (texts: [number, number, string][]) => ({ pages: [{ w: 210, h: 297, lines: [], texts: texts.map(([x, y, text]) => ({ x, y, text })) }] });
  // the SmartForm: intro at 20, header at 30, date 12/01/2026; the migrated print: intro 1.5 mm higher, header 3 mm higher (a shift within the 1 mm window is matched, not moved: no anchor)
  const sf = page([[20, 20, 'Intro line'], [20, 30, 'Carr.'], [60, 40, '12/01/2026']]);
  const af = page([[20, 18.5, 'Intro line'], [20, 27, 'Carr.'], [60, 40, '12/1/26']]);
  it('R10: top inset per block in print order, earlier insets counted; the header text is the value, not the desc', () => {
    const ops = correctionSpec({ content: { pages: [] }, layoutXdp: xdp('$.format.picture = DateFmt(1, $.locale);'), sfPdf: sf, afPdf: af }).ops.filter((o: any) => o.rule === 'R10');
    expect(ops).toEqual([
      expect.objectContaining({ op: 'margin', target: { path: 'ZDEMO.MAIN.INTRO' }, topInset: '1.5mm' }),
      // the header needs 3 mm, 1.5 mm of it comes from the intro inset; 0.5 mm was there already
      expect.objectContaining({ op: 'margin', target: { protoId: 'HEAD' }, topInset: '2mm' }),
    ]);
  });
  it('R3: datePicture only for exactly one "$.format.picture = DateFmt(n, $.locale)"; other DateFmt scripts get no op', () => {
    const one = correctionSpec({ content: { pages: [] }, layoutXdp: xdp('$.format.picture = DateFmt(1, $.locale);'), sfPdf: sf, afPdf: af }).ops;
    expect(one).toContainEqual(expect.objectContaining({ op: 'datePicture', target: { path: 'ZDEMO.MAIN.ROW.FLDATE' }, picture: 'date{MM/DD/YYYY}' }));
    const other = correctionSpec({ content: { pages: [] }, layoutXdp: xdp('$.rawValue = DateFmt(1);'), sfPdf: sf, afPdf: af });
    expect(other.ops.some((o: any) => o.rule === 'R3')).toBe(false);
    expect(other.notes.join(' ')).toMatch(/DateFmt script is not the one form datePicture takes/);
  });
});

describe('smartform-to-adobe: R9 / R3 guards (conv-r4)', () => {
  const xdp = (script = '') => `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform name="ZDEMO" layout="tb"><pageSet><pageArea name="P1"><contentArea x="2cm" y="2cm" w="16cm" h="20cm"/></pageArea></pageSet>
<subform name="MAIN" layout="tb"><subform name="TAB" layout="table">
<subform name="HEAD_ROW" layout="row"><draw name="H"><value><text>Amount</text></value></draw></subform>
<subform name="DATA_ROW" layout="row"><draw name="A"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml"><div><span xfa:embed="WA.AMT"/></div></div></exData></value></draw></subform>
</subform><subform name="INFO" layout="tb"><field name="DATUM"><event activity="initialize"><script>${script}</script></event></field></subform></subform></subform></template></xdp:xdp>`;
  const page = (texts: [number, number, string][]) => ({ pages: [{ w: 210, h: 297, lines: [], texts: texts.map(([x, y, text]) => ({ x, y, text })) }] });
  // data rows at 5.12 mm (SmartForm) / 3.53 mm (migrated) inside MAIN; an address column outside MAIN at 4.23 mm in both
  const rows = (p: number) => [0, 1, 2, 3].flatMap((i) => [[30, 100 + i * p, `K${i}`], [60, 100 + i * p, `A${i}`]] as [number, number, string][]);
  const addr = [0, 1, 2, 3, 4].map((i) => [20, 40 + i * 4.23, `Line ${i}`] as [number, number, string]);
  const content = { pages: [{ windows: [{ name: 'MAIN', type: 'MAIN', leftMm: 20, topMm: 90, widthMm: 160, heightMm: 150 }] }] };
  it('R9 measures inside the MAIN window only and pads data rows only (not a static header row)', () => {
    const ops = correctionSpec({ content, layoutXdp: xdp(), sfPdf: page([...addr, ...rows(5.12)]), afPdf: page([...addr, ...rows(3.53)]) }).ops.filter((o: any) => o.rule === 'R9');
    expect(ops).toEqual([expect.objectContaining({ target: { path: 'ZDEMO.MAIN.TAB.DATA_ROW' }, bottomInset: '1.59mm' })]);
  });
  it('R3 leaves a script that converts with Num2Date alone (it printed the picture braces)', () => {
    const script = '$.format.picture = DateFmt(2, $.locale); $ = Num2Date( date(), $.format.picture );';
    const s = correctionSpec({ content, layoutXdp: xdp(script), sfPdf: page([[120, 60, '11/17/2026']]), afPdf: page([[120, 60, 'Nov 17, 2026']]) });
    expect(s.ops.some((o: any) => o.rule === 'R3')).toBe(false);
    expect(s.notes.join(' ')).toMatch(/DATUM: its script converts with Num2Date/);
  });
});

describe('smartform-to-adobe: header row height (R11) and the R9 consistency guard (conv-r5)', () => {
  const xdp = `<?xml version="1.0" encoding="utf-8"?><xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template xmlns="http://www.xfa.org/schema/xfa-template/2.8/">
<subform name="ZDEMO" layout="tb"><pageSet><pageArea name="P1"><contentArea x="2cm" y="2cm" w="16cm" h="20cm"/></pageArea></pageSet>
<proto><subform id="HEAD" name="HEAD" layout="table"><subform name="HROW" layout="row"><margin bottomInset="0.5mm"/><draw name="H1"><value><text>Carr.</text></value></draw><draw name="H2"><value><text>Price</text></value></draw></subform></subform></proto>
<subform name="MAIN" layout="tb"><subform name="TAB" layout="table"><subform name="DROW" layout="row"><draw name="A"><value><exData contentType="text/html"><div xmlns="http://www.w3.org/1999/xhtml"><div><span xfa:embed="WA.A"/></div></div></exData></value></draw></subform></subform></subform></subform></template></xdp:xdp>`;
  const page = (texts: [number, number, string][]) => ({ pages: [{ w: 210, h: 297, lines: [], texts: texts.map(([x, y, text]) => ({ x, y, text })) }] });
  const content = { pages: [{ windows: [{ name: 'MAIN', type: 'MAIN', leftMm: 20, topMm: 90, widthMm: 160, heightMm: 150 }] }] };
  const rows = (top: number, p: number) => [0, 1, 2].flatMap((i) => [[30, top + i * p, `K${i}`], [60, top + i * p, `A${i}`]] as [number, number, string][]);
  it('R11: the first data line 2.2 mm too close under the header adds 2.2 mm to the header row (add-only)', () => {
    const sf = page([[30, 100, 'Carr.'], [60, 100, 'Price'], ...rows(105.29, 5.12)]);
    const af = page([[30, 100, 'Carr.'], [60, 100, 'Price'], ...rows(103.09, 5.12)]);
    const ops = correctionSpec({ content, layoutXdp: xdp, sfPdf: sf, afPdf: af }).ops.filter((o: any) => o.rule === 'R11');
    expect(ops).toEqual([expect.objectContaining({ op: 'margin', target: { protoId: 'HEAD', path: 'HROW' }, bottomInset: '2.7mm' })]);
    // a header row already too tall: a note, no op
    const low = correctionSpec({ content, layoutXdp: xdp, sfPdf: sf, afPdf: page([[30, 100, 'Carr.'], [60, 100, 'Price'], ...rows(107.29, 5.12)]) });
    expect(low.ops.some((o: any) => o.rule === 'R11')).toBe(false);
    expect(low.notes.join(' ')).toMatch(/header row 2 mm taller/);
  });
  it('R9: column pitches that disagree (mixed row kinds) correct nothing, with a note', () => {
    const mixed = (p: number) => page([...[0, 1, 2, 3].map((i) => [30, 100 + i * p, `K${i}`] as [number, number, string]), ...[0, 1, 2, 3].map((i) => [60, 100 + i * 2 * p, `C${i}`] as [number, number, string])]);
    const s = correctionSpec({ content, layoutXdp: xdp, sfPdf: mixed(5.3), afPdf: mixed(4.2) });
    expect(s.ops.some((o: any) => o.rule === 'R9')).toBe(false);
    expect(s.notes.join(' ')).toMatch(/row pitch not corrected/);
  });
});
