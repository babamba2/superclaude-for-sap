import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildModel } from '../../scripts/relmap/relmap-model.mjs';
import { buildDomains } from '../../scripts/relmap/relmap-domain.mjs';
import { buildRelationMap, findProcessModel } from '../../scripts/relmap/build-relation-map.mjs';

const ev = (unit: string) => [{ unit, line: 1, text: 'x' }];
const n = (type: string, name: string) => ({ id: `${type}:${name}`, type, name, scope: 'member' });
const e = (from: string, kind: string, to: string, ops?: string[]) => ({ from, to, kind, count: 1, evidence: ev(from.split(':')[1]), ...(ops ? { ops } : {}) });

// order: ZO1 → ZOP inserts ZORD, reads ZCFG · billing: ZB1 → ZBP reads ZORD, updates ZBIL · reporting: ZREP reads ZBIL
const graph = {
  package: 'ZDOM', module: 'SD', system: 'DEV', sapVersion: 'S4', builtAt: '2026-11-24T00:00:00Z', coverage: { parsed: 3 },
  nodes: [n('TRAN', 'ZO1'), n('TRAN', 'ZB1'), n('PROG', 'ZOP'), n('PROG', 'ZBP'), n('PROG', 'ZREP'), n('TABL', 'ZORD'), n('TABL', 'ZCFG'), n('TABL', 'ZBIL')],
  edges: [
    e('TRAN:ZO1', 'launches', 'PROG:ZOP'), e('TRAN:ZB1', 'launches', 'PROG:ZBP'),
    e('PROG:ZOP', 'writes', 'TABL:ZORD', ['INSERT']), e('PROG:ZOP', 'reads', 'TABL:ZCFG'),
    e('PROG:ZBP', 'reads', 'TABL:ZORD'), e('PROG:ZBP', 'writes', 'TABL:ZBIL', ['UPDATE']), e('PROG:ZREP', 'reads', 'TABL:ZBIL'),
  ],
};
const row = (code: string, label: string, extra: any = {}) => ({ code, level: code.split('.').length, label, ...extra });
const pm = {
  schema: 1, module: 'SD', lang: 'en',
  rows: [
    row('1', 'Sales'),
    row('1.1', 'Order'), row('1.1.1', 'Create order'),
    row('1.1.1.1', 'Enter order', { kind: 'cbo', usage: 'used', tcodes: ['ZO1', 'VA01'], objects: ['ZOP'], task: { links: [{ code: '1.2.1.1', note: 'billed later' }] } }),
    row('1.2', 'Billing'), row('1.2.1', 'Bill'), row('1.2.1.1', 'Create invoice', { kind: 'cbo', tcodes: ['ZB1', 'VF01'] }),
    row('1.3', 'Reporting'), row('1.3.1', 'Report'), row('1.3.1.1', 'Billing report', { kind: 'cbo', objects: ['ZREP'] }),
    row('1.4', 'Shipping'), row('1.4.1', 'Deliver'), row('1.4.1.1', 'Create delivery', { kind: 'std', tcodes: ['VL01N'] }),
  ],
};
const model: any = buildModel(graph);
const name = (i: number) => model.nodes[i][0];

describe('relation-map process areas', () => {
  const D: any = buildDomains(model, pm, { file: 'process-model.json' });

  it('L2 → domain, L3 → flow, L4 → step, matched by name', () => {
    expect(D.kind).toBe('process');
    expect(D.doms.map((d: any) => d.c)).toEqual(['1.1', '1.2', '1.3', '1.4']);
    expect(D.doms[0].l1).toBe('Sales');
    const s = D.doms[0].f[0].s[0];
    expect(s.t.map(name)).toEqual(['ZO1']);
    expect(s.o.map(name)).toEqual(['ZOP']);
    expect(s.w.map(([t, l]: any) => `${name(t)}:${l}`)).toEqual(['ZORD:C']);
    expect(s.r.map(name)).toEqual(['ZCFG']);
    expect(s.nn).toEqual([1, 1, 1, 1]);
    expect(s.m).toBe(1);
    expect(s.std).toEqual(['VA01']);
    expect(s.ln).toEqual([['1.2.1.1', 'billed later']]);
    expect(D.stats).toEqual({ domains: 4, steps: 4, matched: 3 });
  });

  it('a step with nothing on the map keeps no objects; its standard TCodes stay as text', () => {
    expect(D.doms[3].n).toEqual([1, 0, 0, 0]);
    expect(D.doms[3].f[0].s[0].std).toEqual(['VL01N']);
  });

  it('hand-offs: one area changes a table another area reads', () => {
    expect(D.hand.map(([a, b, ts, c]: any) => `${D.doms[a].c}>${D.doms[b].c}:${ts.map(name).join(',')}:${c}`)).toEqual(['1.1>1.2:ZORD:1', '1.2>1.3:ZBIL:1']);
  });

  it('a hand-off counts when the reading area also changes the table', () => {
    const g2 = { ...graph, edges: [...graph.edges, e('PROG:ZBP', 'writes', 'TABL:ZORD', ['UPDATE'])] };
    const D2: any = buildDomains(buildModel(g2), pm);
    const m2: any = buildModel(g2);
    expect(D2.hand.map(([a, b, ts]: any) => `${D2.doms[a].c}>${D2.doms[b].c}:${ts.map((i: number) => m2.nodes[i][0]).join(',')}`)).toContain('1.1>1.2:ZORD');
    expect(D2.doms[1].f[0].s[0].w.map(([t, l]: any) => `${m2.nodes[t][0]}:${l}`)).toContain('ZORD:U');
  });

  it('no process model → the Louvain groups stand in, no flows', () => {
    const G: any = buildDomains(model, null);
    expect(G.kind).toBe('groups');
    expect(G.doms.length).toBe(model.comms.length);
    expect(G.doms.every((d: any) => d.f.length === 0 && d.g >= 0)).toBe(true);
  });

  it('page: Process areas tab with the model; found next to the inventory folder; none turns it off', () => {
    const r: any = buildRelationMap({ graphs: [graph], lang: 'en', processModel: pm });
    expect(r.domains).toMatchObject({ kind: 'process', domains: 4, steps: 4, matched: 3, handOffs: 2 });
    expect(r.html).toContain('data-tab="domains"');
    const base = mkdtempSync(join(tmpdir(), 'relmap-dom-'));
    try {
      const dir = join(base, 'cbo', 'SD', 'ZDOM');
      mkdirSync(dir, { recursive: true });
      expect(findProcessModel([dir])).toBeNull();
      mkdirSync(join(base, 'processes', 'SD', '_state'), { recursive: true });
      writeFileSync(join(base, 'processes', 'SD', '_state', 'process-model.json'), JSON.stringify(pm));
      expect(findProcessModel([dir])).toContain('process-model.json');
      expect(findProcessModel([dir], 'none')).toBeNull();
      writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph));
      const r2: any = buildRelationMap({ graphs: [graph], dirs: [dir], lang: 'ko' });
      expect(r2.domains.kind).toBe('process');
      const r3: any = buildRelationMap({ graphs: [graph], dirs: [dir], lang: 'ko', processModel: 'none' });
      expect(r3.domains.kind).toBe('groups');
    } finally { rmSync(base, { recursive: true, force: true }); }
  });
});
