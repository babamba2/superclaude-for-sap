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
    expect(s.ops).toContainEqual(expect.objectContaining({ op: 'picture', target: { protoId: 'FIRST_INFO', path: 'DATUM' }, format: 'date{MM/DD/YYYY}', rule: 'R3' }));
    // an evidence line carries no printed value
    expect(JSON.stringify(s.ops)).not.toMatch(/11\/17/);
  });
});
