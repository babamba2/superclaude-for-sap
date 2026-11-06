import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { basisOf, buildModel, groupLabel, includeOwners, isCustomerName, keepNode, louvain } from '../../scripts/relmap/relmap-model.mjs';
import { renderPage } from '../../scripts/relmap/relmap-page.mjs';
import { buildRelationMap, readSideInfo, snippetReader } from '../../scripts/relmap/build-relation-map.mjs';

const ev = (unit: string, text: string, line = 0) => [{ unit, line, text }];
const graph = {
  package: 'ZGD', module: 'SD', system: 'DEV', sapVersion: 'ECC', builtAt: '2026-11-06T00:00:00Z', coverage: { parsed: 2 },
  nodes: [
    { id: 'TABL:ZGD_HEAD', type: 'TABL', name: 'ZGD_HEAD', scope: 'member' },
    { id: 'TABL:ZGD_ITEM', type: 'TABL', name: 'ZGD_ITEM', scope: 'member' },
    { id: 'DTEL:ZGD_NO', type: 'DTEL', name: 'ZGD_NO', scope: 'member' },
    { id: 'DOMA:ZGD_NO', type: 'DOMA', name: 'ZGD_NO', scope: 'member' },
    { id: 'PROG:ZGD_REPORT', type: 'PROG', name: 'ZGD_REPORT', scope: 'member' },
    { id: 'INCL:LZGD01TOP', type: 'INCL', name: 'LZGD01TOP', scope: 'member', parent: 'FUGR:ZGD01' },
    { id: 'FUGR:ZGD01', type: 'FUGR', name: 'ZGD01', scope: 'member' },
    { id: 'INCL:LSVIMFXX', type: 'INCL', name: 'LSVIMFXX', scope: 'member', parent: 'FUGR:ZGD01' },
    { id: 'TABL:ZCM_CONFIG', type: 'TABL', name: 'ZCM_CONFIG', scope: 'custom' },
    { id: 'TABL:KNA1', type: 'TABL', name: 'KNA1', scope: 'standard' },
    { id: 'PROG:?', type: 'PROG', name: '?', scope: 'dynamic' },
    { id: 'TABL:ZGD_LONE', type: 'TABL', name: 'ZGD_LONE', scope: 'member' },
    { id: 'TRAN:ZGD1', type: 'TRAN', name: 'ZGD1', scope: 'member' },
  ],
  edges: [
    { from: 'TABL:ZGD_HEAD', to: 'DTEL:ZGD_NO', kind: 'types', evidence: ev('DD03L', 'ZGD_HEAD-GDNO TYPE ZGD_NO'), count: 1 },
    { from: 'TABL:ZGD_ITEM', to: 'DTEL:ZGD_NO', kind: 'types', evidence: ev('DD03L', 'ZGD_ITEM-GDNO TYPE ZGD_NO'), count: 1 },
    { from: 'DTEL:ZGD_NO', to: 'DOMA:ZGD_NO', kind: 'types', evidence: ev('DD04L', 'ZGD_NO DOMAIN ZGD_NO'), count: 1 },
    { from: 'TABL:ZGD_ITEM', to: 'TABL:ZGD_HEAD', kind: 'checks', evidence: ev('DD08L', 'ZGD_ITEM-GDNO CHECK ZGD_HEAD'), count: 1 },
    { from: 'PROG:ZGD_REPORT', to: 'TABL:ZGD_HEAD', kind: 'reads', evidence: ev('ZGD_REPORT', 'SELECT * FROM zgd_head INTO TABLE gt_head', 12), count: 3 },
    { from: 'PROG:ZGD_REPORT', to: 'TABL:ZCM_CONFIG', kind: 'reads', evidence: ev('ZGD_REPORT', 'SELECT (lv_tab)', 20), count: 1, confidence: 'low' },
    { from: 'PROG:ZGD_REPORT', to: 'TABL:KNA1', kind: 'reads', evidence: ev('ZGD_REPORT', 'SELECT * FROM kna1', 30), count: 1 },
    { from: 'PROG:ZGD_REPORT', to: 'PROG:?', kind: 'dynamic', evidence: ev('ZGD_REPORT', 'SUBMIT (lv)', 40), count: 1 },
    { from: 'FUGR:ZGD01', to: 'INCL:LZGD01TOP', kind: 'include', evidence: ev('SAPLZGD01', 'INCLUDE lzgd01top', 1), count: 1 },
    { from: 'FUGR:ZGD01', to: 'INCL:LSVIMFXX', kind: 'include', evidence: ev('SAPLZGD01', 'INCLUDE lsvimfxx', 2), count: 1 },
    { from: 'INCL:LZGD01TOP', to: 'TABL:ZGD_ITEM', kind: 'writes', evidence: ev('LZGD01TOP', 'MODIFY zgd_item FROM ls_item ' + 'x'.repeat(200), 9), count: 1, ops: ['MODIFY'] },
    { from: 'FUGR:ZGD01', to: 'TABL:ZGD_ITEM', kind: 'writes', evidence: ev('LZGD01F01', 'DELETE zgd_item', 4), count: 2, ops: ['DELETE'] },
    { from: 'TRAN:ZGD1', to: 'PROG:ZGD_REPORT', kind: 'launches', evidence: ev('TSTC', 'TCODE ZGD1 → ZGD_REPORT'), count: 1 },
  ],
};

const id = (m: any, i: number) => `${m.types[m.nodes[i][1]]}:${m.nodes[i][0]}`;
const ix = (m: any, name: string) => m.nodes.findIndex((_: any, i: number) => id(m, i) === name);
const edgeOf = (m: any, from: string, kind: string, to: string) => m.edges.findIndex((e: number[]) => m.kinds[e[2]] === kind && e[0] === ix(m, from) && e[1] === ix(m, to));

describe('cbo-relation-map model (includes kept)', () => {
  const m: any = buildModel(graph, { fold: false });

  it('keeps customer objects only (member + custom, customer-named includes)', () => {
    const ids = m.nodes.map((_: any, i: number) => id(m, i));
    expect(ids).toContain('TABL:ZCM_CONFIG');
    expect(ids).toContain('INCL:LZGD01TOP');
    expect(ids).not.toContain('TABL:KNA1');
    expect(ids).not.toContain('PROG:?');
    expect(ids).not.toContain('INCL:LSVIMFXX');
    expect(m.stats.droppedEdges).toBe(3);
    expect(m.stats.members).toBe(9);
    expect(m.stats.custom).toBe(1);
  });

  it('customer include names', () => {
    expect(isCustomerName('LZXY40000TOP')).toBe(true);
    expect(isCustomerName('L/ABC/FG01TOP')).toBe(true);
    expect(isCustomerName('ZINC')).toBe(true);
    expect(isCustomerName('LSVIMFXX')).toBe(false);
    expect(isCustomerName('MZFOO')).toBe(false);
    expect(keepNode({ type: 'FUNC', name: 'TABLEFRAME_ZGD', scope: 'member' })).toBe(true);
  });

  it('labels each edge ddic / source / inferred', () => {
    expect(basisOf(graph.edges[0])).toBe('ddic');
    expect(basisOf(graph.edges[4])).toBe('source');
    expect(basisOf(graph.edges[5])).toBe('inferred');
    expect(m.stats.byBasis).toEqual({ ddic: 4, source: 5, inferred: 1 });
  });

  it('edges carry kind, count, basis, ops and cut evidence', () => {
    const k = edgeOf(m, 'PROG:ZGD_REPORT', 'reads', 'TABL:ZGD_HEAD');
    expect(m.edges[k][3]).toBe(3);
    expect(m.ev[k]).toBe('ZGD_REPORT:12 SELECT * FROM zgd_head INTO TABLE gt_head');
    const w = edgeOf(m, 'INCL:LZGD01TOP', 'writes', 'TABL:ZGD_ITEM');
    expect(m.ev[w].length).toBeLessThanOrEqual('LZGD01TOP:9 '.length + 90);
    expect(m.ev[w].endsWith('…')).toBe(true);
    expect(m.ops[m.edges[w][5]]).toBe('MODIFY');
    expect(m.kinds.slice(0, 3)).toEqual(['types', 'checks', 'include']);
  });

  it('degree = distinct neighbours, business degree without types; parent kept', () => {
    const d = ix(m, 'DTEL:ZGD_NO');
    expect(m.nodes[d][4]).toBe(3);
    expect(m.nodes[d][5]).toBe(0);
    expect(m.typeHubs[0]).toBe(d);
    expect(m.hubs).not.toContain(d);
    expect(m.stats.isolated).toBe(1);
    expect(m.nodes[ix(m, 'INCL:LZGD01TOP')][6]).toBe(ix(m, 'FUGR:ZGD01'));
  });

  it('groups: singletons get -1, the rest are numbered by size', () => {
    expect(m.nodes[ix(m, 'TABL:ZGD_LONE')][3]).toBe(-1);
    expect(m.comms.length).toBe(m.stats.groups);
    for (let i = 1; i < m.comms.length; i++) expect(m.comms[i - 1].size).toBeGreaterThanOrEqual(m.comms[i].size);
  });
});

describe('include folding', () => {
  const m: any = buildModel(graph);

  it('folds a customer include into its owner and moves its relations there', () => {
    expect(ix(m, 'INCL:LZGD01TOP')).toBe(-1);
    expect(m.stats.foldedIncludes).toBe(1);
    const w = edgeOf(m, 'FUGR:ZGD01', 'writes', 'TABL:ZGD_ITEM');
    expect(w).toBeGreaterThanOrEqual(0);
    expect(m.edges[w][3]).toBe(3);
    expect(m.ops[m.edges[w][5]]).toBe('DELETE/MODIFY');
    expect(m.edges.filter((e: number[]) => m.kinds[e[2]] === 'include')).toHaveLength(0);
    expect(m.inc[ix(m, 'FUGR:ZGD01')]).toEqual(['LZGD01TOP']);
    expect(m.nodes[ix(m, 'FUGR:ZGD01')][9]).toBe(1);
  });

  it('drops the unconnected PROG twin of an include (TADIR PROG/I)', () => {
    const g = { ...graph, nodes: [...graph.nodes, { id: 'PROG:LZGD01TOP', type: 'PROG', name: 'LZGD01TOP', scope: 'member' }] };
    const m2: any = buildModel(g);
    expect(ix(m2, 'PROG:LZGD01TOP')).toBe(-1);
    expect(m2.stats.nodes).toBe(m.stats.nodes);
  });

  it('follows include chains and the include statement when there is no parent', () => {
    const own = includeOwners(
      [{ id: 'PROG:ZP', type: 'PROG' }, { id: 'INCL:ZP_A', type: 'INCL' }, { id: 'INCL:ZP_B', type: 'INCL' }, { id: 'INCL:ZORPHAN', type: 'INCL' }],
      [{ from: 'PROG:ZP', to: 'INCL:ZP_A', kind: 'include' }, { from: 'INCL:ZP_A', to: 'INCL:ZP_B', kind: 'include' }],
    );
    expect(own.get('INCL:ZP_A')).toBe('PROG:ZP');
    expect(own.get('INCL:ZP_B')).toBe('PROG:ZP');
    expect(own.has('INCL:ZORPHAN')).toBe(false);
  });
});

describe('side information', () => {
  it('descriptions, usage and standard check tables (text only)', () => {
    const info = {
      desc: new Map([['TRAN:ZGD1', 'Goods document report'], ['TABL:ZGD_HEAD', 'GD header']]),
      usage: new Map([['TRAN:ZGD1', 'direct'], ['PROG:ZGD_REPORT', 'indirect']]),
      std: new Map([['ZGD_HEAD', ['BUKRS→T001', 'KUNNR→KNA1']]]),
    };
    const m: any = buildModel(graph, { info });
    const h = ix(m, 'TABL:ZGD_HEAD');
    expect(m.desc[m.nodes[h][7]]).toBe('GD header');
    expect(m.std[m.nodes[h][10]]).toEqual(['BUKRS→T001', 'KUNNR→KNA1']);
    expect(m.nodes[ix(m, 'TRAN:ZGD1')][8]).toBe(0);
    expect(m.nodes[ix(m, 'PROG:ZGD_REPORT')][8]).toBe(1);
    expect(m.nodes[h][8]).toBe(-1);
    expect(m.stats.usage).toEqual({ direct: 1, indirect: 1, unused: 0, 'no-evidence': 0 });
    expect(m.stats.stdChecks).toBe(2);
    expect(m.meta.hasUsage).toBe(true);
    expect(m.nodes.map((_: any, i: number) => id(m, i))).not.toContain('TABL:T001');
  });

  it('group label: shared name prefix + a description that says something', () => {
    expect(groupLabel(['ZSDM34410', 'ZSDM34420', 'ZSDM34430', 'ZFOO'], () => 'Shipping report')).toBe('ZSDM344* · Shipping report');
    expect(groupLabel(['ZA', 'QB'], () => '')).toBe('');
    const m: any = buildModel(graph, { info: { desc: new Map([['TRAN:ZGD1', 'program ZGD_REPORT screen 1000'], ['PROG:ZGD_REPORT', 'GD list']]) } });
    const g = m.comms[m.nodes[ix(m, 'TRAN:ZGD1')][3]];
    expect(g.label).toContain('GD list');
    const m2: any = buildModel(graph, { info: { desc: new Map([['TRAN:ZGD1', 'SM34 VCLDIR-VCLNAME=ZGDV UPDATE=X'], ['PROG:ZGD_REPORT', 'GD list']]) } });
    expect(m2.comms[m2.nodes[ix(m2, 'TRAN:ZGD1')][3]].label).not.toContain('SM34');
  });

  it('reads walk / inventory / usage-result / DD08L reads from an inventory folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relmap-'));
    try {
      const sql = join(dir, 'dd08l-1.json');
      writeFileSync(sql, JSON.stringify({ rows: [
        { TABNAME: 'ZGD_HEAD', FIELDNAME: 'BUKRS', CHECKTABLE: 'T001' },
        { TABNAME: 'ZGD_ITEM', FIELDNAME: 'GDNO', CHECKTABLE: 'ZGD_HEAD' },
        { TABNAME: 'ZGD_HEAD', FIELDNAME: 'X', CHECKTABLE: '*' },
      ] }));
      writeFileSync(join(dir, 'ddic-reads.json'), JSON.stringify([{ id: 'dd08l-1', table: 'DD08L', path: sql, rows: 3 }]));
      writeFileSync(join(dir, 'walk.json'), JSON.stringify({ objects: [{ name: 'ZGD1', type: 'TRAN', description: 'GD report' }] }));
      writeFileSync(join(dir, 'inventory.json'), JSON.stringify({ objects: [{ name: 'ZGD_HEAD', type: 'TABL', description: 'GD header | TRANSP | key MANDT' }] }));
      writeFileSync(join(dir, 'usage-result.json'), JSON.stringify({ objects: [{ id: 'TRAN:ZGD1', status: 'direct' }] }));
      const info = readSideInfo(dir);
      expect(info.desc.get('TRAN:ZGD1')).toBe('GD report');
      expect(info.desc.get('TABL:ZGD_HEAD')).toBe('GD header');
      expect(info.usage.get('TRAN:ZGD1')).toBe('direct');
      expect(info.std.get('ZGD_HEAD')).toEqual(['BUKRS→T001']);
      expect(info.std.has('ZGD_ITEM')).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('source snippets: ±10 lines around the evidence line, from the MCP output folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'relmap-src-'));
    try {
      mkdirSync(join(dir, 'zgd_report.prog'));
      writeFileSync(join(dir, 'zgd_report.prog', 'zgd_report.prog.abap'), Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\r\n'));
      const read = snippetReader(dir);
      expect(read('ZGD_REPORT', 12)).toEqual({ start: 2, text: Array.from({ length: 21 }, (_, i) => `line ${i + 2}`).join('\n') });
      expect(read('ZNOPE', 1)).toBeNull();
      const m: any = buildModel(graph, { snippets: read });
      const k = edgeOf(m, 'PROG:ZGD_REPORT', 'reads', 'TABL:ZGD_HEAD');
      expect(m.snip[m.sn[k]][0]).toBe('ZGD_REPORT');
      expect(m.snip[m.sn[k]][2]).toBe(12);
      expect(m.sn[edgeOf(m, 'TABL:ZGD_ITEM', 'checks', 'TABL:ZGD_HEAD')]).toBe(-1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('louvain', () => {
  it('splits two cliques joined by one bridge', () => {
    const adj: Map<number, number>[] = Array.from({ length: 8 }, () => new Map());
    const link = (a: number, b: number) => { adj[a].set(b, 1); adj[b].set(a, 1); };
    for (const g of [[0, 1, 2, 3], [4, 5, 6, 7]]) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) link(g[i], g[j]);
    link(3, 4);
    const c = louvain(adj);
    expect(new Set([c[0], c[1], c[2], c[3]]).size).toBe(1);
    expect(new Set([c[4], c[5], c[6], c[7]]).size).toBe(1);
    expect(c[0]).not.toBe(c[4]);
  });
});

describe('cbo-relation-map page', () => {
  it('is one self-contained page with the model inline and no external script', () => {
    const html = renderPage(buildModel(graph), { lang: 'ko' });
    expect(html).toContain('<script type="application/json" id="relmap-data">');
    expect(html).toContain('<script type="application/json" id="relmap-colors">');
    expect(html).toContain('CBO 관계도');
    expect(html).toContain('data-tab="crud"');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    const data = html.match(/id="relmap-data">(.*?)<\/script>/s)![1];
    expect(data).not.toContain('</');
    expect(JSON.parse(data).meta.package).toBe('ZGD');
  });

  it('English companion and build summary', () => {
    const r: any = buildRelationMap({ graphs: [graph], lang: 'en' });
    expect(r.html).toContain('CBO relation map');
    expect(r.nodes).toBe(9);
    expect(r.foldedIncludes).toBe(1);
    expect(r.sourcesParsed).toBe(2);
  });

  it('several packages merge into one map with the package per node', () => {
    const other = {
      package: 'ZGE', module: 'SD', system: 'DEV', sapVersion: 'ECC', builtAt: '2026-11-05T00:00:00Z', coverage: { parsed: 1 },
      nodes: [{ id: 'PROG:ZGE_SYNC', type: 'PROG', name: 'ZGE_SYNC', scope: 'member' }, { id: 'TABL:ZGD_HEAD', type: 'TABL', name: 'ZGD_HEAD', scope: 'custom' }],
      edges: [{ from: 'PROG:ZGE_SYNC', to: 'TABL:ZGD_HEAD', kind: 'writes', evidence: ev('ZGE_SYNC', 'UPDATE zgd_head', 5), count: 1, ops: ['UPDATE'] }],
    };
    const r: any = buildRelationMap({ graphs: [graph, other], lang: 'ko' });
    const m = JSON.parse(r.html.match(/id="relmap-data">(.*?)<\/script>/s)![1]);
    expect(r.packages).toEqual(['ZGD', 'ZGE']);
    expect(m.meta.package).toBe('ZGD + ZGE');
    expect(m.pkgs[m.nodes[ix(m, 'PROG:ZGE_SYNC')][11]]).toBe('ZGE');
    expect(m.pkgs[m.nodes[ix(m, 'TABL:ZGD_HEAD')][11]]).toBe('ZGD');
    expect(m.nodes[ix(m, 'TABL:ZGD_HEAD')][2]).toBe(0);
    expect(edgeOf(m, 'PROG:ZGE_SYNC', 'writes', 'TABL:ZGD_HEAD')).toBeGreaterThanOrEqual(0);
  });
});
