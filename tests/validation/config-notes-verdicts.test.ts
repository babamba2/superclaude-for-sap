import { describe, expect, it } from 'vitest';
import { dataTokens, verdictProblems } from '../../scripts/config/notes-verdicts.mjs';
import { parseNotes } from '../../scripts/config/notes.mjs';

// generic batch input item: one view with sample rows, a customer transport, a check
const ITEM = {
  id: 'A',
  objects: [{ table: 'TXX1', rows: 12, customerRows: 2, sample: [{ 'Block type': '1 (Exclusive)', Plant: 'PL01', _tr: 'TSTK900001' }, { 'Block type': '2 (Late)', Plant: 'PL02' }],
    customerTransports: { TSTK900001: 2 } }],
  checks: [{ title: 'Late block without plant', items: ['PLANT=PL09'] }],
};

describe('notes lint — verdicts must rest on the data', () => {
  it('collects sample values and their codes, counts, transports and check values', () => {
    const t = dataTokens(ITEM);
    for (const v of ['1 (Exclusive)', 'Exclusive', 'PL01', 'Late', '12', 'TSTK900001', 'PL09']) expect(t.has(v), v).toBe(true);
    expect(t.has('Block type')).toBe(false); // column names are not values
    // one-character codes and counts appear in any sentence: not quotable on their own
    for (const v of ['1', '2']) expect(t.has(v), v).toBe(false);
    expect([...t.rowCounts]).toEqual(['12', '2']);
  });

  it('a one-character value is no evidence; a short row count is, when written as a count', () => {
    const item = { id: 'B', objects: [{ rows: 0, customerRows: 3, sample: [{ KZ: 'X', N: '1', BSART: 'NB' }] }] };
    const v = (s: string) => verdictProblems({ cases: { list: [{ thisSystem: s }] } }, item).map((p: any) => p.problem);
    expect(v('yes — the setting is active in 1 place')).toEqual(['no-data-quoted']);
    expect(v('yes — X')).toEqual(['no-data-quoted']);
    expect(v('yes — standard behaviour, see 3 notes')).toEqual(['no-data-quoted']);
    expect(v('yes — document type NB is used')).toEqual([]);
    expect(v('yes — 3 rows are customer entries')).toEqual([]);
    expect(v('yes — 고객 행 3건')).toEqual([]);
  });

  it('flags a verdict without evidence and a "yes" that quotes no value; a "no" may rest on an absence', () => {
    const full = parseNotes([
      '@@ A', '## purpose', 'p',
      '## cases Which lock?',
      '### case CASE 1 — Exclusive', 'flow: a > b', 'desc: d', 'this: yes — block type 1 on PL01',
      '### case CASE 2 — Late', 'flow: a > c', 'desc: d', 'this: yes — the system clearly uses it',
      '### case CASE 3 — None', 'flow: a', 'desc: d', 'this: no —',
      '### case CASE 4 — Mixed', 'flow: a', 'desc: d', 'this: no — no row uses a third type', '',
    ].join('\n'), 'draft').items.A;
    expect(verdictProblems(full, ITEM)).toEqual([
      { case: 2, value: 'yes', problem: 'no-data-quoted', text: 'yes — the system clearly uses it' },
      { case: 3, value: 'no', problem: 'no-evidence', text: 'no —' },
    ]);
  });

  it('checks the CASE n verdicts of a system-only note the same way', () => {
    const sys = parseNotes('@@ A\n## impact\n- x\n## verdicts\n- CASE 1: yes — 12 rows, 2 of them customer\nCASE 2: yes — see SAP note\nCASE 3: no — not in the sample\n', 'draft').items.A;
    expect(verdictProblems(sys, ITEM).map((p: any) => [p.case, p.problem])).toEqual([[2, 'no-data-quoted']]);
  });

  it('an item without data cannot be quoted: only missing evidence counts', () => {
    const sys = parseNotes('@@ A\n## impact\n- x\n## verdicts\n- CASE 1: yes — anything\nCASE 2: yes\n', 'draft').items.A;
    expect(verdictProblems(sys, { id: 'A', objects: [] }).map((p: any) => [p.case, p.problem])).toEqual([[2, 'no-evidence']]);
  });
});
