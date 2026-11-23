import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { valuesFromRaw } from '../../scripts/smartform/preview-values.mjs';

// Interface values the way a SAP render gets them → the "as printed" preview values; invented data.
const content = { pages: [{ windows: [{ name: 'MAIN', type: 'MAIN', content: [
  { kind: 'section-C', name: 'TABLE', dataTable: 'ITEMS', attrs: { TABHEADER: 'WA_ITEM' }, children: [] },
] }] }] };
const ddic = {
  'HEAD-DOCDATE': { type: 'DATS' }, 'HEAD-TIME': { type: 'TIMS' }, 'HEAD-NAME': { type: 'CHAR', length: 20 },
  'ITEMS-AMOUNT': { type: 'CURR', decimals: 2 }, 'ITEMS-CURR': { type: 'CUKY' }, 'ITEMS-QTY': { type: 'QUAN', decimals: 3 },
};
const raw = {
  HEAD: { DOCDATE: '2026-12-01', TIME: '183000', NAME: 'Sample Ltd' },
  ITEMS: [{ AMOUNT: 1230.5, CURR: 'EUR', QTY: 2 }, { AMOUNT: 1500, CURR: 'JPY', QTY: -1.5 }],
};

describe('smartform-preview: values from interface values', () => {
  it('formats structure fields by DDIC type and the print user\'s date format', () => {
    const { values } = valuesFromRaw(content, raw, { ddic });
    expect(values['HEAD-DOCDATE']).toBe('12/01/2026');
    expect(values['HEAD-TIME']).toBe('18:30:00');
    expect(values['HEAD-NAME']).toBe('Sample Ltd');
    expect(valuesFromRaw(content, raw, { ddic, dateFormat: 'DD.MM.YYYY' }).values['HEAD-DOCDATE']).toBe('01.12.2026');
  });
  it('gives table rows to the work area the form loops into; amounts by currency, sign place after (blank or minus)', () => {
    const { values, rows } = valuesFromRaw(content, raw, { ddic });
    expect(rows).toBe(2);
    expect(values['WA_ITEM-AMOUNT']).toEqual(['1,230.50 ', '1,500 ']);
    expect(values['ITEMS-AMOUNT']).toEqual(['1,230.50 ', '1,500 ']);
    expect(values['WA_ITEM-QTY']).toEqual(['2.000 ', '1.500-']);
  });
  it('keeps the sign place only for a signed type when the domain sign flag is known', () => {
    const dd = { 'H-A': { type: 'CURR', decimals: 2 }, 'H-B': { type: 'CURR', decimals: 2, signed: false }, 'H-C': { type: 'QUAN', decimals: 3, signed: true } };
    const { values } = valuesFromRaw(content, { H: { A: 5, B: 5, C: -2 } }, { ddic: dd });
    expect(values['H-A']).toBe('5.00 ');   // unknown: the place is kept (today's rule)
    expect(values['H-B']).toBe('5.00');    // no sign flag: no sign place
    expect(values['H-C']).toBe('2.000-');
  });
});

describe('smartform-preview: SAP print rules for numbers and empty tables (S4-DEV LB_BIL_INVOICE)', () => {
  const c = { pages: [{ windows: [{ name: 'MAIN', type: 'MAIN', content: [
    { kind: 'table46', name: 'T', dataTable: 'IS_INV-IT_GEN', attrs: { TABHEADER: 'GS_IT' }, children: [] },
    { kind: 'loop', name: 'L', dataTable: 'IS_INV-IT_BATCH', attrs: { TABHEADER: 'GS_BATCH' }, children: [] },
  ] }] }] };
  it('a quantity in a unit without decimals drops its zero decimals (WRITE … UNIT), not others', () => {
    const dd = { 'IS_INV-IT_GEN-QTY': { type: 'QUAN', decimals: 3 }, 'IS_INV-IT_GEN-UNIT': { type: 'UNIT' } };
    const raw = { IS_INV: { IT_GEN: [{ QTY: 1, UNIT: 'EA' }, { QTY: 1.5, UNIT: 'EA' }, { QTY: 1, UNIT: 'KG' }] } };
    expect(valuesFromRaw(c, raw, { ddic: dd }).values['GS_IT-QTY']).toEqual(['1 ', '1.500 ', '1.000 ']);
    // a known reference unit field wins over the other unit fields of the row
    const dr = { ...dd, 'IS_INV-IT_GEN-QTY': { type: 'QUAN', decimals: 3, refField: 'UNIT' }, 'IS_INV-IT_GEN-WUNIT': { type: 'UNIT' } };
    const rr = { IS_INV: { IT_GEN: [{ QTY: 1, UNIT: 'EA', WUNIT: 'KG' }, { QTY: 1, UNIT: 'KG', WUNIT: 'EA' }] } };
    expect(valuesFromRaw(c, rr, { ddic: dr }).values['GS_IT-QTY']).toEqual(['1 ', '1.000 ']);
  });
  it('pads a number with a DDIC length to its output length (digits, separators, decimal point, sign place)', () => {
    const dd = { 'H-AMT': { type: 'CURR', length: 15, decimals: 2 }, 'H-QTY': { type: 'QUAN', length: 13, decimals: 3, signed: false } };
    const { values } = valuesFromRaw(c, { H: { AMT: 0, QTY: 2 } }, { ddic: dd });
    expect(values['H-AMT']).toBe(`${' '.repeat(16)}0.00 `);
    expect(values['H-QTY']).toBe(`${' '.repeat(12)}2.000`);
  });
  it('prints an unfilled numeric field outside loops as its initial value; initials: false leaves it out', () => {
    const dd = { 'GS_KOMK-NET': { type: 'CURR', decimals: 2 }, 'GS_IT-PRICE': { type: 'CURR', decimals: 2 } };
    const { values } = valuesFromRaw(c, { IS_INV: { IT_GEN: [{ X: 'a' }] } }, { ddic: dd });
    expect(values['GS_KOMK-NET']).toBe('0.00 ');
    expect(values['GS_IT-PRICE']).toBeUndefined();
    expect(valuesFromRaw(c, {}, { ddic: dd, initials: false }).values['GS_KOMK-NET']).toBeUndefined();
  });
  it('a loop over a table the given interface parameter leaves out has 0 rows', () => {
    const { values } = valuesFromRaw(c, { IS_INV: { IT_GEN: [{ X: 'a' }] } }, { ddic: {} });
    expect(values['GS_BATCH-%ROWS']).toEqual([]);
    expect(values['GS_IT-%ROWS']).toBeUndefined();
    expect(valuesFromRaw(c, { IS_INV: { IT_GEN: [{ X: 'a' }], IT_BATCH: [] } }, { ddic: {} }).values['GS_BATCH-%ROWS']).toEqual([]);
    expect(valuesFromRaw(c, {}, { ddic: {} }).values['GS_BATCH-%ROWS']).toBeUndefined(); // parameter not given: unknown
  });
});

describe('smartform-preview: values from a deep interface structure', () => {
  it('walks structures and tables inside a structure; a loop over the table component fills its work area', () => {
    const c = { pages: [{ windows: [{ name: 'MAIN', type: 'MAIN', content: [{ kind: 'table46', name: 'T', dataTable: 'IS_INV-IT_GEN', attrs: { TABHEADER: 'GS_IT' }, children: [] }] }] }] };
    const raw = { IS_INV: { HD_GEN: { NUMBER: 'ZZ1', DATE: '2026-11-17' }, IT_GEN: [{ ITM: '10' }, { ITM: '20' }] } };
    const { values, rows } = valuesFromRaw(c, raw, { ddic: { 'IS_INV-HD_GEN-DATE': { type: 'DATS' } } });
    expect(values['IS_INV-HD_GEN-NUMBER']).toBe('ZZ1');
    expect(values['IS_INV-HD_GEN-DATE']).toBe('11/17/2026');
    expect(values['GS_IT-ITM']).toEqual(['10', '20']);
    expect(rows).toBe(2);
  });
});
