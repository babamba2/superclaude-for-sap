import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRelationMap, readSideInfo } from '../../scripts/relmap/build-relation-map.mjs';
import { buildFieldBlock, FX_OPS, mergeFields } from '../../scripts/relmap/relmap-fields.mjs';
import { buildModel } from '../../scripts/relmap/relmap-model.mjs';
import { TEXT } from '../../scripts/relmap/relmap-page.mjs';

const ev = (unit: string, line: number, text: string) => [{ unit, line, text }];
const graph = {
  package: 'ZFM', module: 'SD', system: 'DEV', sapVersion: 'ECC', builtAt: '2026-11-11T00:00:00Z', coverage: { parsed: 2 },
  nodes: [
    { id: 'TABL:ZFM_HEAD', type: 'TABL', name: 'ZFM_HEAD', scope: 'member' },
    { id: 'PROG:ZFM_REPORT', type: 'PROG', name: 'ZFM_REPORT', scope: 'member' },
    { id: 'FUGR:ZFM01', type: 'FUGR', name: 'ZFM01', scope: 'member' },
    { id: 'FUNC:Z_FM_SAVE', type: 'FUNC', name: 'Z_FM_SAVE', scope: 'member', parent: 'FUGR:ZFM01' },
    { id: 'TRAN:ZFM1', type: 'TRAN', name: 'ZFM1', scope: 'member' },
  ],
  edges: [
    { from: 'PROG:ZFM_REPORT', to: 'TABL:ZFM_HEAD', kind: 'reads', evidence: ev('ZFM_REPORT', 5, 'SELECT …'), count: 1 },
    { from: 'FUGR:ZFM01', to: 'TABL:ZFM_HEAD', kind: 'writes', evidence: ev('LZFM01F01', 9, 'UPDATE …'), count: 1, ops: ['UPDATE'] },
    { from: 'PROG:ZFM_REPORT', to: 'FUNC:Z_FM_SAVE', kind: 'calls', evidence: ev('ZFM_REPORT', 7, "CALL FUNCTION 'Z_FM_SAVE'"), count: 1 },
    { from: 'TRAN:ZFM1', to: 'PROG:ZFM_REPORT', kind: 'launches', evidence: ev('TSTC', 0, 'TCODE ZFM1'), count: 1 },
  ],
  unresolved: [],
};
const fields = {
  tables: {
    ZFM_HEAD: { type: 'TABL', scope: 'member', fields: [{ name: 'DOCNR', pos: 1, key: true }, { name: 'STATUS', pos: 2 }, { name: 'EXT1', pos: 3, struct: 'ZFM_S_EXT' }, { name: 'NOTE', pos: 4 }] },
    VBAK: { type: 'TABL', scope: 'append', fields: [{ name: 'ZZPRIO', pos: 1, struct: 'ZAVBAK' }] },
    ZFM_IDLE: { type: 'TABL', scope: 'member', fields: [{ name: 'A', pos: 1 }] },
  },
  structures: { ZFM_S_EXT: { fields: ['EXT1'], tables: ['ZFM_HEAD'] }, ZAVBAK: { fields: ['ZZPRIO'], tables: ['VBAK'] } },
  refs: [
    { t: 'ZFM_HEAD', f: 'STATUS', op: 'R', from: 'PROG:ZFM_REPORT', count: 2, evidence: ev('ZFM_REPORT', 5, 'SELECT docnr status FROM zfm_head') },
    { t: 'ZFM_HEAD', f: 'DOCNR', op: 'R', from: 'PROG:ZFM_REPORT', count: 2, evidence: ev('ZFM_REPORT', 5, 'SELECT docnr status FROM zfm_head') },
    { t: 'ZFM_HEAD', f: 'DOCNR', op: 'F', from: 'PROG:ZFM_REPORT', count: 1, evidence: ev('ZFM_REPORT', 5, 'SELECT docnr status FROM zfm_head') },
    { t: 'ZFM_HEAD', f: 'STATUS', op: 'U', from: 'FUGR:ZFM01', count: 1, evidence: ev('LZFM01F01', 9, "UPDATE zfm_head SET status = 'C'") },
    { t: 'ZFM_HEAD', f: '*', op: 'C', from: 'FUNC:Z_FM_SAVE', count: 1, evidence: ev('LZFM01U01', 3, 'INSERT zfm_head FROM ls_head') },
    { t: 'VBAK', f: 'ZZPRIO', op: 'R', from: 'PROG:ZFM_OUTSIDE', count: 1, confidence: 'low', evidence: ev('ZFM_OUTSIDE', 4, 'SELECT zzprio FROM vbak') },
  ],
  coverage: {},
};

describe('field block', () => {
  const model = buildModel(graph, {});
  const fx = buildFieldBlock(fields, model, { jobs: new Set(['PROG:ZFM_REPORT']) });
  const tab = (n: string) => fx.tabs.findIndex((t: unknown[]) => t[0] === n);
  it('keeps only tables with references, counts the rest', () => {
    expect(fx.tabs.map((t: unknown[]) => t[0])).toEqual(['VBAK', 'ZFM_HEAD']);
    expect(fx.idle).toEqual(['ZFM_IDLE']);
    expect(fx.idleCount).toBe(1);
    expect(fx.tabs[tab('VBAK')][1]).toBe(1); // append scope
  });
  it('links tables and objects to relation-map nodes', () => {
    const head = fx.tabs[tab('ZFM_HEAD')];
    expect(model.nodes[head[2]][0]).toBe('ZFM_HEAD');
    expect(fx.tabs[tab('VBAK')][2]).toBe(-1); // standard table: no node
    const oi = (id: string) => fx.oi[fx.o.indexOf(id)];
    expect(model.nodes[oi('FUNC:Z_FM_SAVE')][0]).toBe('Z_FM_SAVE');
    expect(oi('PROG:ZFM_OUTSIDE')).toBe(-1);
    expect(fx.job.map((i: number) => model.nodes[i][0])).toEqual(['ZFM_REPORT']);
  });
  it('encodes refs: row level, op, shared evidence, low confidence', () => {
    const h = tab('ZFM_HEAD');
    const row = fx.r.find((x: number[]) => x[0] === h && x[1] === -1);
    expect(FX_OPS[row[2]]).toBe('C');
    const sel = fx.r.filter((x: number[]) => x[0] === h && FX_OPS[x[2]] !== 'U' && x[1] >= 0);
    expect(new Set(sel.map((x: number[]) => x[5])).size).toBe(1); // one SELECT, one evidence text
    expect(fx.e[sel[0][5]]).toBe('ZFM_REPORT:5 SELECT docnr status FROM zfm_head');
    expect(fx.r.find((x: number[]) => x[0] === tab('VBAK'))[7]).toBe(1);
    expect(fx.st).toEqual(expect.arrayContaining(['ZFM_S_EXT', 'ZAVBAK']));
    expect(fx.stats).toMatchObject({ tables: 2, refs: 6, appendTables: 1, dropped: 0 });
  });
  it('drops a ref whose field is not in the table list', () => {
    const odd = buildFieldBlock({ ...fields, refs: [...fields.refs, { t: 'ZFM_HEAD', f: 'GONE', op: 'R', from: 'PROG:ZFM_REPORT', count: 1, evidence: [] }] }, model);
    expect(odd.stats.dropped).toBe(1);
  });
  it('no refs → no block', () => {
    expect(buildFieldBlock({ ...fields, refs: [] }, model)).toBeNull();
  });
});

describe('mergeFields', () => {
  it('sums counts per (table, field, op, object) and unions structure tables', () => {
    const a = { tables: { T: { fields: [] } }, structures: { S: { fields: ['X'], tables: ['T'] } }, refs: [{ t: 'T', f: 'X', op: 'R', from: 'P:A', count: 2, evidence: [] }] };
    const b = { tables: { U: { fields: [] } }, structures: { S: { fields: ['X'], tables: ['U'] } }, refs: [{ t: 'T', f: 'X', op: 'R', from: 'P:A', count: 3, evidence: [] }] };
    const m = mergeFields([a, b]);
    expect(m.refs).toHaveLength(1);
    expect(m.refs[0].count).toBe(5);
    expect(m.structures.S.tables).toEqual(['T', 'U']);
    expect(Object.keys(m.tables)).toEqual(['T', 'U']);
  });
});

describe('page', () => {
  it('fields.json beside graph.json → Fields tab data in the page; job reasons read from usage-result', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relmap-fx-'));
    try {
      writeFileSync(join(dir, 'graph.json'), JSON.stringify(graph));
      writeFileSync(join(dir, 'fields.json'), JSON.stringify(fields));
      writeFileSync(join(dir, 'usage-result.json'), JSON.stringify({ objects: [{ id: 'PROG:ZFM_REPORT', status: 'direct', reasons: ['job step'] }] }));
      expect([...readSideInfo(dir).jobs]).toEqual(['PROG:ZFM_REPORT']);
      const r = buildRelationMap({ graphs: [join(dir, 'graph.json')], dirs: [dir], lang: 'en' });
      expect(r.fields).toMatchObject({ tables: 2, refs: 6 });
      expect(r.html).toContain('data-tab="fields"');
      expect(r.html).toContain('id="tab-fields"');
      const data = JSON.parse(/id="relmap-data">(.*?)<\/script>/s.exec(r.html)![1]);
      expect(data.fx.tabs).toHaveLength(2);
      expect(data.fx.job).toHaveLength(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('without fields.json the tab shows the hint, nothing else changes', () => {
    const r = buildRelationMap({ graphs: [graph], lang: 'ko' });
    expect(r.fields).toBeNull();
    expect(JSON.parse(/id="relmap-data">(.*?)<\/script>/s.exec(r.html)![1]).fx).toBeUndefined();
  });
  it('every Fields string exists in both languages', () => {
    const keys = Object.keys(TEXT.en).filter((k) => /^(fx|hFields|tFields)/.test(k));
    expect(keys.length).toBeGreaterThan(15);
    for (const k of keys) expect(TEXT.ko).toHaveProperty(k);
  });
});
