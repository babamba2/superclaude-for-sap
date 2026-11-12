import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { sampleRows, profileView, customerTransports, queryRows, badiContext, ALL_ROWS } from '../../scripts/config/notes-context.mjs';

const view = (n: number) => ({
  cols: [
    { name: 'WERKS', label: 'Plant', dom: '' },
    { name: 'KZ', label: 'Flag', dom: 'DKZ' },
    { name: 'NOTE', label: 'Note', dom: '' },
  ],
  rows: Array.from({ length: n }, (_, i) => [`P${String(i).padStart(3, '0')}`, i % 3 === 0 ? 'A' : 'B', '']),
  cust: [n - 1],
  trOf: { [n - 1]: ['DEVK900123', 'DEVK900124'] },
});
const domains = { DKZ: { A: 'Active', B: 'Blocked' } };

describe('config-to-document — writer context (notes-context)', () => {
  it('gives every row of a small view, with transports on customer rows', () => {
    const rows = sampleRows(view(5), domains);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({ Plant: 'P000', Flag: 'A (Active)' });
    expect(rows[4]._tr).toBe('DEVK900123 DEVK900124');
    expect(profileView(view(5), domains)).toBeUndefined();
  });

  it('samples 15 rows of a large view, customer rows first, and profiles every column over all rows', () => {
    const v = view(ALL_ROWS + 20);
    const rows = sampleRows(v, domains);
    expect(rows).toHaveLength(15);
    expect(rows[0].Plant).toBe(`P0${ALL_ROWS + 19}`);
    const p = profileView(v, domains);
    expect(p.Plant).toEqual({ distinct: ALL_ROWS + 20 });
    expect(p.Flag.distinct).toBe(2);
    expect(p.Flag.top['B (Blocked)']).toBe(40);
    expect(p.Note).toBe('all blank');
    expect(customerTransports(v)).toEqual({ DEVK900123: 1, DEVK900124: 1 });
  });

  it('queries a raw table with filters, counts and customer transports only', () => {
    const snap = {
      tables: { T1: { rows: [
        { A: '1', B: 'x', _tr: ['DEVK900001', 'SAPK-12345'] },
        { A: '1', B: 'y' },
        { A: '2', B: 'x' },
      ] } },
      labels: {}, fieldDocs: {}, domains: {}, domainsEn: {},
    };
    const r = queryRows(snap, { table: 't1', where: { A: '1' } });
    expect(r.matched).toBe(2);
    expect(r.list[0]).toEqual({ A: '1', B: 'x', _tr: 'DEVK900001' });
    expect(queryRows(snap, { table: 'T1', countBy: 'B' }).counts).toEqual({ x: 2, y: 1 });
    expect(queryRows(snap, { table: 'NOPE' }).error).toMatch(/not in the snapshot/);
  });

  it('lists the customer implementations of an activity BAdI with their method code', () => {
    const snap = {
      badiImpls: { B1: [{ name: 'ZIMPL', class: 'ZCL_IMPL', active: true, user: 'U', date: '20250304' }] },
      badiSources: { ZCL_IMPL: { methods: [{ name: 'M1', lines: 3, source: 'x'.repeat(2000) }, { name: 'M2', empty: true }] } },
    };
    const [b] = badiContext(snap, ['B1', 'B2']);
    expect(b).toMatchObject({ badi: 'B1', impl: 'ZIMPL', active: true, emptyMethods: ['M2'] });
    expect(b.methods[0].source).toMatch(/… \(cut\)$/);
    expect(badiContext(snap, ['B2'])).toEqual([]);
    const [e] = badiContext({ badiImpls: { B3: [{ name: 'ZENH', class: '', active: true }] } }, ['B3']);
    expect(e.codeNotRead).toMatch(/unknown/);
  });
});
