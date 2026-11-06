import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPackageGraph } from '../../scripts/graph/build-package-graph.mjs';
import { CHUNKS, ddicQueries, slices } from '../../scripts/graph/ddic-queries.mjs';
import { matchReads } from '../../scripts/graph/collect-ddic-reads.mjs';
import { loadDdicReads, mergeDdic, parseDdicFacts } from '../../scripts/graph/ddic-edges.mjs';
import { EDGE_KINDS, extractGraph } from '../../scripts/graph/extract-edges.mjs';

type Edge = { from: string; to: string; kind: string; card?: string; frkart?: string; evidence: Array<{ unit: string; text: string }> };
type Graph = { edges: Edge[]; nodes: Array<{ id: string }>; coverage: { ddic?: Record<string, number> } };
const edge = (g: Graph, from: string, kind: string, to: string) => g.edges.find((e) => e.from === from && e.kind === kind && e.to === to);

const walk = {
  package: 'ZGD',
  objects: [
    { name: 'ZGD_HEAD', type: 'TABL' },
    { name: 'ZGD_ITEM', type: 'TABL' },
    { name: 'ZGD_S_EXT', type: 'STRU' },
    { name: 'ZGD_V_ITEM', type: 'VIEW' },
    { name: 'ZGD_TT_ITEM', type: 'TTYP' },
    { name: 'ZGD_DE_STAT', type: 'DTEL' },
    { name: 'ZGD_DO_STAT', type: 'DOMA' },
    { name: 'ZGD_SH_HEAD', type: 'SHLP' },
    { name: 'ZGD_SH_ALL', type: 'SHLP' },
  ],
};

const ddic = {
  fields: [
    { TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', ROLLNAME: 'ZGD_DE_DOC', CHECKTABLE: 'ZGD_HEAD' },
    { TABNAME: 'ZGD_ITEM', FIELDNAME: 'BUKRS', ROLLNAME: 'BUKRS', CHECKTABLE: 'T001' }, // standard check table: skipped
    { TABNAME: 'ZGD_ITEM', FIELDNAME: 'STAT', ROLLNAME: 'ZGD_DE_STAT', CHECKTABLE: '*' }, // generic: no check edge
    { TABNAME: 'ZGD_ITEM', FIELDNAME: '.INCLUDE', PRECFIELD: 'ZGD_S_EXT' },
  ],
  fks: [{ TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', CHECKTABLE: 'ZGD_HEAD', FRKART: 'KEY', CARD: 'CN', CARDLEFT: '1' }],
  fkFields: [
    { TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', PRIMPOS: '0002', CHECKFIELD: 'DOCNR', FORTABLE: 'ZGD_ITEM', FORKEY: 'DOCNR' },
    { TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', PRIMPOS: '0001', CHECKFIELD: 'MANDT', FORTABLE: 'ZGD_ITEM', FORKEY: 'MANDT' },
  ],
  shlpFields: [{ TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', SHLPNAME: 'ZGD_SH_HEAD' }],
  dtels: [{ ROLLNAME: 'ZGD_DE_STAT', DOMNAME: 'ZGD_DO_STAT', SHLPNAME: 'ZGD_SH_ALL', SHLPFIELD: 'STAT' }],
  domains: [{ DOMNAME: 'ZGD_DO_STAT', ENTITYTAB: 'ZGD_STATUS_T' }],
  ttyps: [{ TYPENAME: 'ZGD_TT_ITEM', ROWTYPE: 'ZGD_ITEM', ROWKIND: 'S' }],
  viewBases: [
    { VIEWNAME: 'ZGD_V_ITEM', TABNAME: 'ZGD_ITEM', TABPOS: '0001' },
    { VIEWNAME: 'ZGD_V_ITEM', TABNAME: 'ZGD_HEAD', TABPOS: '0002' },
  ],
  shlps: [{ SHLPNAME: 'ZGD_SH_HEAD', SELMETHOD: 'ZGD_HEAD' }],
  shlpIncludes: [
    { SHLPNAME: 'ZGD_SH_ALL', SUBSHLP: 'ZGD_SH_HEAD' },
    { SHLPNAME: 'ZGD_SH_HEAD', SUBSHLP: 'ZGD_SH_HEAD' }, // ECC: elementary search help points to itself — no edge
  ],
};

describe('graph DDIC relations', () => {
  it('DD rows become typed edges of every new kind', () => {
    const g: Graph = extractGraph([], { members: walk, package: 'ZGD', ddic, builtAt: '2026-11-06T00:00:00Z' });
    const fk = edge(g, 'TABL:ZGD_ITEM', 'checks', 'TABL:ZGD_HEAD');
    expect(fk).toMatchObject({ card: '1:CN', frkart: 'KEY' });
    expect(fk?.evidence[0]).toMatchObject({ unit: 'DD08L', text: 'ZGD_ITEM-DOCNR CHECK ZGD_HEAD (ZGD_ITEM-MANDT=MANDT, ZGD_ITEM-DOCNR=DOCNR)' });
    expect(g.edges.some((e) => e.kind === 'checks' && e.to === 'TABL:T001')).toBe(false);
    expect(g.edges.filter((e) => e.kind === 'checks')).toHaveLength(1);
    expect(edge(g, 'TABL:ZGD_ITEM', 'types', 'STRU:ZGD_S_EXT')).toBeTruthy();
    expect(edge(g, 'TABL:ZGD_ITEM', 'searchHelp', 'SHLP:ZGD_SH_HEAD')?.evidence[0].unit).toBe('DD35L');
    expect(edge(g, 'DTEL:ZGD_DE_STAT', 'types', 'DOMA:ZGD_DO_STAT')).toBeTruthy();
    expect(edge(g, 'DTEL:ZGD_DE_STAT', 'searchHelp', 'SHLP:ZGD_SH_ALL')?.evidence[0].text).toBe('ZGD_DE_STAT SEARCH HELP ZGD_SH_ALL-STAT');
    expect(edge(g, 'DOMA:ZGD_DO_STAT', 'valueTable', 'TABL:ZGD_STATUS_T')).toBeTruthy();
    expect(edge(g, 'TTYP:ZGD_TT_ITEM', 'rowType', 'TABL:ZGD_ITEM')).toBeTruthy();
    expect(edge(g, 'VIEW:ZGD_V_ITEM', 'basedOn', 'TABL:ZGD_ITEM')).toBeTruthy();
    expect(edge(g, 'VIEW:ZGD_V_ITEM', 'basedOn', 'TABL:ZGD_HEAD')).toBeTruthy();
    expect(edge(g, 'SHLP:ZGD_SH_HEAD', 'selects', 'TABL:ZGD_HEAD')).toBeTruthy();
    expect(edge(g, 'SHLP:ZGD_SH_ALL', 'contains', 'SHLP:ZGD_SH_HEAD')).toBeTruthy();
    expect(edge(g, 'SHLP:ZGD_SH_HEAD', 'contains', 'SHLP:ZGD_SH_HEAD')).toBeUndefined();
    expect(g.coverage.ddic).toMatchObject({ checks: 1, valueTables: 1, searchHelps: 2, rowTypes: 1, viewBases: 2, shlps: 2 });
    for (const e of g.edges) expect(EDGE_KINDS).toContain(e.kind);
  });

  it('DD05S without CHECKFIELD (ECC) takes the check table key field by PRIMPOS', () => {
    const fields = [
      { TABNAME: 'ZGD_HEAD', FIELDNAME: 'MANDT', POSITION: '0001', KEYFLAG: 'X' },
      { TABNAME: 'ZGD_HEAD', FIELDNAME: 'DOCNR', POSITION: '0002', KEYFLAG: 'X' },
      { TABNAME: 'ZGD_HEAD', FIELDNAME: 'TEXT', POSITION: '0003' },
    ];
    const fkFields = [
      { TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', PRIMPOS: '0001', FORTABLE: 'ZGD_ITEM', FORKEY: 'MANDT' },
      { TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', PRIMPOS: '0002', FORTABLE: 'ZGD_ITEM', FORKEY: 'DOCNR' },
      { TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', PRIMPOS: '0003', FORTABLE: "'OR'" },
      { TABNAME: 'ZGD_ITEM', FIELDNAME: 'DOCNR', PRIMPOS: '0004', FORTABLE: '*' },
    ];
    const g: Graph = extractGraph([], { members: walk, ddic: { fks: ddic.fks, fkFields, fields }, builtAt: 'x' });
    expect(edge(g, 'TABL:ZGD_ITEM', 'checks', 'TABL:ZGD_HEAD')?.evidence[0].text)
      .toBe("ZGD_ITEM-DOCNR CHECK ZGD_HEAD (ZGD_ITEM-MANDT=MANDT, ZGD_ITEM-DOCNR=DOCNR, 'OR'=#3)");
    const g2: Graph = extractGraph([], { members: walk, ddic: { fks: ddic.fks, fkFields: fkFields.slice(0, 2) }, builtAt: 'x' });
    expect(edge(g2, 'TABL:ZGD_ITEM', 'checks', 'TABL:ZGD_HEAD')?.evidence[0].text)
      .toBe('ZGD_ITEM-DOCNR CHECK ZGD_HEAD (ZGD_ITEM-MANDT=#1, ZGD_ITEM-DOCNR=#2)');
  });

  it('DD08L without its DD03L row still gives the check edge', () => {
    const g: Graph = extractGraph([], { members: walk, ddic: { fks: ddic.fks }, builtAt: 'x' });
    expect(edge(g, 'TABL:ZGD_ITEM', 'checks', 'TABL:ZGD_HEAD')).toMatchObject({ card: '1:CN' });
  });

  it('checker FACT fallback lines map to the same rows', () => {
    const d = parseDdicFacts([
      'FACT obj=ZGD_ITEM kind=TABL key="include" value="ZGD_S_EXT"',
      'FACT obj=ZGD_ITEM kind=TABL key="check" value="DOCNR=ZGD_HEAD"',
      'FACT obj=ZGD_ITEM kind=TABL key="shlp" value="DOCNR=ZGD_SH_HEAD"',
      'FACT obj=ZGD_DE_STAT kind=DTEL key="domain" value="ZGD_DO_STAT"',
      'FACT obj=ZGD_DE_STAT kind=DTEL key="shlp" value="ZGD_SH_ALL"',
      'FACT obj=ZGD_DO_STAT kind=DOMA key="valtab" value="ZGD_STATUS_T"',
      'FACT obj=ZGD_TT_ITEM kind=TTYP key="rowtype" value="ZGD_ITEM"',
      'FACT obj=ZGD_V_ITEM kind=VIEW key="base" value="ZGD_ITEM"',
    ].join('\n'));
    const g: Graph = extractGraph([], { members: walk, ddic: d, builtAt: 'x' });
    expect(edge(g, 'TABL:ZGD_ITEM', 'types', 'STRU:ZGD_S_EXT')).toBeTruthy();
    expect(edge(g, 'TABL:ZGD_ITEM', 'checks', 'TABL:ZGD_HEAD')?.evidence[0].unit).toBe('DD03L');
    expect(edge(g, 'TABL:ZGD_ITEM', 'searchHelp', 'SHLP:ZGD_SH_HEAD')).toBeTruthy();
    expect(edge(g, 'DTEL:ZGD_DE_STAT', 'searchHelp', 'SHLP:ZGD_SH_ALL')).toBeTruthy();
    expect(edge(g, 'DOMA:ZGD_DO_STAT', 'valueTable', 'TABL:ZGD_STATUS_T')).toBeTruthy();
    expect(edge(g, 'TTYP:ZGD_TT_ITEM', 'rowType', 'TABL:ZGD_ITEM')).toBeTruthy();
    expect(edge(g, 'VIEW:ZGD_V_ITEM', 'basedOn', 'TABL:ZGD_ITEM')).toBeTruthy();
  });

  it('ddicQueries: DD tables only, single-table IN lists, chunked', () => {
    const q = ddicQueries(walk, { chunk: 1, fieldsChunk: 2 });
    expect(new Set(q.map((x: { table: string }) => x.table))).toEqual(
      new Set(['DD03L', 'DD08L', 'DD05S', 'DD35L', 'DD04L', 'DD01L', 'DD40L', 'DD26S', 'DD30L', 'DD31S']),
    );
    for (const x of q) {
      expect(x.table).toMatch(/^DD\d\d[A-Z]$/);
      expect(x.sql).toMatch(/^SELECT [A-Z0-9_, ]+ FROM DD\w+ WHERE AS4LOCAL = 'A' AND \w+ IN \('[^)]+'\)$/);
      expect(x.sql).not.toMatch(/JOIN|UNION|GROUP BY/);
      expect(x.row_number).toBe(5000);
    }
    // DD03L covers TABL + STRU + VIEW (4 names) in chunks of 2
    expect(q.filter((x: { table: string }) => x.table === 'DD03L').map((x: { id: string }) => x.id)).toEqual(['dd03l-1', 'dd03l-2']);
    expect(q.filter((x: { table: string }) => x.table === 'DD30L')).toHaveLength(2);
    expect(ddicQueries({ objects: [{ name: 'ZP', type: 'PROG' }] })).toEqual([]);
  });

  it('loadDdicReads + mergeDdic: rows per DD table, failed and truncated reported', () => {
    const files: Record<string, unknown> = { a: { rows: ddic.fks, truncated: true }, b: { rows: ddic.domains } };
    const r = loadDdicReads(
      [
        { id: 'dd08l-1', table: 'DD08L', path: 'a', rows: 1 },
        { id: 'dd01l-1', table: 'DD01L', path: 'b', rows: 1 },
        { id: 'dd40l-1', table: 'DD40L', error: 'TABLE_READ: table DD40L is not allowed' },
        { id: 'dd26s-1', table: 'DD26S', path: 'missing', rows: 2 },
        { id: 'x', table: 'MARA', path: 'a' },
      ],
      (p: string) => {
        if (!(p in files)) throw new Error('ENOENT');
        return files[p];
      },
    );
    expect(r.truncated).toEqual(['dd08l-1']);
    expect(r.failed).toEqual(['dd40l-1', 'dd26s-1']);
    expect(Object.keys(r.ddic ?? {}).sort()).toEqual(['domains', 'fks']);
    const m = mergeDdic(r.ddic, { domains: { rows: [{ DOMNAME: 'ZX', ENTITYTAB: 'ZY' }] } }, null);
    expect(m?.domains).toHaveLength(2);
    expect(mergeDdic(null, {})).toBeNull();
  });

  it('S4 packs more names per statement; slices split the plan for the dd-read checkers', () => {
    const big = { objects: Array.from({ length: 250 }, (_, i) => ({ name: `ZT${i}`, type: 'TABL/DT' })) };
    const ecc = ddicQueries(big, CHUNKS.ECC);
    const s4 = ddicQueries(big, CHUNKS.S4);
    expect(ecc.filter((q: { table: string }) => q.table === 'DD08L')).toHaveLength(5);
    expect(s4.filter((q: { table: string }) => q.table === 'DD08L')).toHaveLength(2);
    expect(ecc.filter((q: { table: string }) => q.table === 'DD03L')).toHaveLength(13);
    expect(s4.filter((q: { table: string }) => q.table === 'DD03L')).toHaveLength(5);
    expect(slices(478)).toHaveLength(8);
    expect(slices(478)[7]).toEqual({ from: 421, to: 478 });
    expect(slices(0)).toEqual([]);
  });

  it('collect matches result files to plan entries by exact SQL text', () => {
    const plan = [
      { id: 'dd08l-1', table: 'DD08L', sql: 'SELECT A FROM DD08L WHERE X IN (1)', row_number: 3 },
      { id: 'dd05s-1', table: 'DD05S', sql: 'SELECT B FROM DD05S WHERE X IN (1)', row_number: 5000 },
      { id: 'dd35l-1', table: 'DD35L', sql: 'SELECT C FROM DD35L WHERE X IN (1)', row_number: 5000 },
    ];
    const results = [
      { path: 'old.json', mtimeMs: 50, sql_query: plan[0].sql, rows: [1] },
      { path: 'a.json', mtimeMs: 200, sql_query: plan[0].sql, rows: [1, 2, 3] },
      { path: 'b0.json', mtimeMs: 150, sql_query: plan[1].sql, rows: [1] },
      { path: 'b.json', mtimeMs: 300, sql_query: plan[1].sql, rows: [1, 2] },
      { path: 'c.json', mtimeMs: 300, sql_query: 'SELECT C FROM DD35L WHERE X IN (2)', rows: [] }, // altered by the checker
    ];
    expect(matchReads(plan, results, 100)).toEqual([
      { id: 'dd08l-1', table: 'DD08L', path: 'a.json', rows: 3, truncated: true },
      { id: 'dd05s-1', table: 'DD05S', path: 'b.json', rows: 2, truncated: false },
      { id: 'dd35l-1', table: 'DD35L', error: 'no result file (statement failed, skipped or altered)' },
    ]);
  });

  it('build-package-graph reads ddic-reads.json files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc4sap-ddic-'));
    try {
      writeFileSync(join(dir, 'walk.json'), JSON.stringify(walk));
      const f = join(dir, 'dd26s.json');
      writeFileSync(f, JSON.stringify({ columns: [], rows: ddic.viewBases }));
      writeFileSync(join(dir, 'ddic-reads.json'), JSON.stringify([
        { id: 'dd26s-1', table: 'DD26S', path: f, rows: 2, truncated: false },
        { id: 'dd08l-1', table: 'DD08L', error: 'not allowed' },
      ]));
      const s = buildPackageGraph({ dir, src: dir, builtAt: 'x' });
      expect(s.ddicReads).toEqual({ truncated: [], failed: ['dd08l-1'] });
      const g = JSON.parse(readFileSync(join(dir, 'graph.json'), 'utf8')) as Graph;
      expect(edge(g, 'VIEW:ZGD_V_ITEM', 'basedOn', 'TABL:ZGD_HEAD')).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
