import { describe, expect, it } from 'vitest';
import { buildModel } from '../../scripts/relmap/relmap-model.mjs';
import { buildTours, writeLetters } from '../../scripts/relmap/relmap-tour.mjs';
import { buildRelationMap } from '../../scripts/relmap/build-relation-map.mjs';

const ev = (unit: string, line = 1) => [{ unit, line, text: 'x' }];
const n = (type: string, name: string) => ({ id: `${type}:${name}`, type, name, scope: 'member' });
const e = (from: string, kind: string, to: string, ops?: string[]) => ({ from, to, kind, count: 1, evidence: ev(from.split(':')[1]), ...(ops ? { ops } : {}) });

// ZT1 → ZP1 → ZF1 → ZC1; ZF1 inserts ZT_A, ZC1 updates it, ZP1 reads ZT_B
// ZT4 runs ZP1 too (merged into ZT1's tour) · ZT2 → ZP2 deletes ZT_A (used directly) · ZT3 → ZP3 does nothing · ZR1 = root report calling ZF1
const graph = {
  package: 'ZTR', module: 'SD', system: 'DEV', sapVersion: 'S4', builtAt: '2026-11-24T00:00:00Z', coverage: { parsed: 5 },
  nodes: [
    n('TRAN', 'ZT1'), n('TRAN', 'ZT2'), n('TRAN', 'ZT3'), n('TRAN', 'ZT4'), n('PROG', 'ZP1'), n('PROG', 'ZP2'), n('PROG', 'ZP3'), n('PROG', 'ZR1'),
    n('FUNC', 'ZF1'), n('CLAS', 'ZC1'), n('TABL', 'ZT_A'), n('TABL', 'ZT_B'), { id: 'TABL:MARA', type: 'TABL', name: 'MARA', scope: 'standard' },
  ],
  edges: [
    e('TRAN:ZT1', 'launches', 'PROG:ZP1'), e('TRAN:ZT2', 'launches', 'PROG:ZP2'), e('TRAN:ZT3', 'launches', 'PROG:ZP3'), e('TRAN:ZT4', 'launches', 'PROG:ZP1'),
    e('PROG:ZP1', 'calls', 'FUNC:ZF1'), e('FUNC:ZF1', 'uses', 'CLAS:ZC1'), e('PROG:ZR1', 'calls', 'FUNC:ZF1'),
    e('FUNC:ZF1', 'writes', 'TABL:ZT_A', ['INSERT']), e('CLAS:ZC1', 'writes', 'TABL:ZT_A', ['UPDATE']),
    e('PROG:ZP2', 'writes', 'TABL:ZT_A', ['DELETE']), e('PROG:ZP1', 'reads', 'TABL:ZT_B'), e('PROG:ZR1', 'reads', 'TABL:ZT_B'),
    e('PROG:ZP1', 'reads', 'TABL:MARA'),
  ],
};
const info = { desc: new Map(), usage: new Map([['TRAN:ZT2', 'direct']]), std: new Map() };
const model: any = buildModel(graph, { info });
const tours = buildTours(model);
const name = (i: number) => model.nodes[i][0];
const shape = (t: any) => t.s.map((st: any) => [st[0], st[1].map(name), st[2], ...(st[3] ? [st[3]] : [])]);

describe('relation-map tours', () => {
  it('one tour per program a TCode runs (TCodes on the same program merged); root reports fill up below three', () => {
    expect(tours.map((t: any) => name(t.e))).toEqual(['ZT2', 'ZT1', 'ZR1']);
  });

  it('walks entry → program → calls per depth → writes (C/U/D) → reads → other TCodes on the same tables', () => {
    expect(shape(tours[1])).toEqual([
      ['entry', ['ZT1'], 1],
      ['program', ['ZP1'], 1],
      ['calls', ['ZF1'], 1],
      ['calls', ['ZC1'], 1],
      ['writes', ['ZT_A'], 1, ['CU']],
      ['reads', ['ZT_B'], 1],
      ['shared', ['ZT2'], 1],
    ]);
    expect(tours[1].s[3][4]).toBe(2);
    expect(tours[1].a.map(name)).toEqual(['ZT4']);
  });

  it('shared TCodes are found backwards from the other writers', () => {
    expect(shape(tours[0])).toEqual([
      ['entry', ['ZT2'], 1], ['program', ['ZP2'], 1], ['writes', ['ZT_A'], 1, ['D']], ['shared', ['ZT1', 'ZT4'], 2],
    ]);
  });

  it('a root report has no program step; standard tables never appear', () => {
    expect(shape(tours[2]).map((s: any) => s[0])).toEqual(['entry', 'calls', 'calls', 'writes', 'reads', 'shared']);
    expect(JSON.stringify(tours.map(shape))).not.toContain('MARA');
  });

  it('write letters follow the CRUD tab (MODIFY = CU, unknown = U)', () => {
    const m = { ops: ['MODIFY', 'SOMETHING'] };
    expect(writeLetters(m, [0, 0, 0, 1, 1, 0])).toBe('CU');
    expect(writeLetters(m, [0, 0, 0, 1, 1, 1])).toBe('U');
    expect(writeLetters(m, [0, 0, 0, 1, 1, -1])).toBe('U');
  });

  it('page: tours in the model, the Tours tab only when there is one', () => {
    const r: any = buildRelationMap({ graphs: [graph], lang: 'ko' });
    expect(r.tours).toBe(3);
    expect(r.html).toContain('data-tab="tours"');
    const m = JSON.parse(r.html.match(/id="relmap-data">(.*?)<\/script>/s)![1]);
    expect(m.tours).toHaveLength(3);
    const ddicOnly = { ...graph, nodes: graph.nodes.filter((x) => x.type === 'TABL'), edges: [] };
    const r2: any = buildRelationMap({ graphs: [ddicOnly], lang: 'en' });
    expect(r2.tours).toBe(0);
    expect(r2.html).not.toContain('data-tab="tours"');
  });
});
