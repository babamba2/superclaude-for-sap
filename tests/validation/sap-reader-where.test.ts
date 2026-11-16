import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { whereOf } from '../../scripts/config/sap-reader.mjs';

describe('sap-reader whereOf', () => {
  it('breaks a long IN list over lines of at most 255 characters (S/4 ADT data preview limit)', () => {
    const names = Array.from({ length: 42 }, (_, i) => `Z_TEST_ROLE_WITH_A_LONG_NAME_${String(i).padStart(2, '0')}`);
    const w = whereOf({ AGR_NAME: names, OBJECT: ['S_TCODE', 'V_VBAK_AAT'] });
    expect(w.length).toBeGreaterThan(1000);
    for (const line of w.split('\n')) expect(line.length).toBeLessThanOrEqual(255);
    expect(w.startsWith("AGR_NAME IN ('Z_TEST_ROLE_WITH_A_LONG_NAME_00',\n'Z_TEST_ROLE_WITH_A_LONG_NAME_01',")).toBe(true);
  });

  it('keeps a short IN list on one line (callers and mocks parse "IN (a, b)")', () => {
    expect(whereOf({ TABNAME: ['ZT1', 'ZT2'], AS4LOCAL: 'A' })).toBe("TABNAME IN ('ZT1', 'ZT2') AND AS4LOCAL = 'A'");
  });

  it('keeps single values, LIKE and quoting unchanged', () => {
    expect(whereOf({ UNAME: 'TESTUSER01', AGR_NAME: { like: 'Z%' } })).toBe("UNAME = 'TESTUSER01' AND AGR_NAME LIKE 'Z%'");
    expect(whereOf({ AGR_NAME: ["Z_O'B"] })).toBe("AGR_NAME IN ('Z_O''B')");
    expect(whereOf({ AGR_NAME: [] })).toBeNull();
  });
});
