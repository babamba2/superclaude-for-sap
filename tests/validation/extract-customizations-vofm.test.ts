import { describe, it, expect } from 'vitest';
import {
  customerRange,
  vofmInclude,
  vofmModule,
  vofmRoutines,
  vofmForModule,
  VOFM_MODULES,
  // @ts-expect-error — plain .mjs script, no type declarations
} from '../../scripts/lib/customization-vofm.mjs';

describe('customization extraction — VOFM routines', () => {
  it('uses the customer ranges and include names of transaction VOFM', () => {
    expect(customerRange('PBED')).toEqual([600, 999]);
    expect(customerRange('PSTK')).toEqual([50, 99]);
    expect(customerRange('FOFU')).toEqual([900, 999]);
    expect(vofmInclude('PBED', 901)).toBe('RV61A901');
    expect(vofmInclude('ADAT', '600')).toBe('RV45C600');
    expect(vofmInclude('PSTK', 90)).toBe('RV65A090');
    expect(vofmInclude('TDAT', 51)).toBe('RV45TE51');
    expect(vofmInclude('MCV1', 600)).toBe('FMCV1600');
    expect(vofmInclude('XXXX', 600)).toBeNull();
  });

  it('files condition routines by KAPPL and the rest by group', () => {
    expect(vofmModule('PBED', 'V')).toBe('SD');
    expect(vofmModule('PBEN', 'V3')).toBe('SD');
    expect(vofmModule('PFRM', 'F')).toBe('SD');
    expect(vofmModule('PBED', 'M')).toBe('MM');
    expect(vofmModule('PBEN', 'EF')).toBe('MM');
    expect(vofmModule('PBED', 'TX')).toBe('FI');
    expect(vofmModule('PBED', '')).toBe('SD');
    expect(vofmModule('MCQ1', '')).toBe('QM');
    expect(vofmModule('PBED', 'J1')).toBe('SD');
    expect(vofmModule('MCW1', '')).toBeNull();
    expect([...VOFM_MODULES].sort()).toEqual(['FI', 'MM', 'PM', 'PP', 'QM', 'SD']);
  });

  it('keeps customer-range routines only, with English description and active flag', () => {
    const { routines, unmapped } = vofmRoutines(
      [
        { GRPZE: 'PBED', GRPNO: 2, AKTIV: 'X', KAPPL: 'V' },
        { GRPZE: 'PBED', GRPNO: 601, AKTIV: 'X', KAPPL: 'V' },
        { GRPZE: 'PBED', GRPNO: 602, AKTIV: 'X', KAPPL: 'M' },
        { GRPZE: 'PFRM', GRPNO: 603, AKTIV: '', KAPPL: '' },
        { GRPZE: 'PSTK', GRPNO: 90, AKTIV: 'X', KAPPL: '' },
        { GRPZE: 'FOFU', GRPNO: 650, AKTIV: 'X', KAPPL: '' },
        { GRPZE: 'MCW1', GRPNO: 600, AKTIV: 'X', KAPPL: '' },
      ],
      [
        { SPRAS: '3', GRPZE: 'PBED', GRPNO: 601, BEZEI: 'KR text' },
        { SPRAS: 'E', GRPZE: 'PBED', GRPNO: 601, BEZEI: 'Intercompany' },
        { SPRAS: '3', GRPZE: 'PBED', GRPNO: 602, BEZEI: 'KR only' },
      ],
    );
    expect(routines.map((r: { include: string }) => r.include)).toEqual(['RV61A601', 'RV61A602', 'RV64A603', 'RV65A090']);
    expect(routines[0]).toEqual({
      group: 'PBED', groupText: 'Pricing requirements', number: '601', description: 'Intercompany',
      application: 'V', active: true, include: 'RV61A601', module: 'SD',
    });
    expect(routines[1]).toMatchObject({ description: 'KR only', module: 'MM' });
    expect(routines[2]).toMatchObject({ active: false, description: '' });
    expect(unmapped).toEqual({ MCW1: 1 });
    expect(vofmForModule(routines, 'SD').map((r: { number: string }) => r.number)).toEqual(['601', '603', '090']);
    expect(vofmForModule(routines, 'MM').map((r: { number: string }) => r.number)).toEqual(['602']);
  });
});
