import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildPackageGraph } from '../../scripts/graph/build-package-graph.mjs';
import { appendFieldQueries, appendQueries } from '../../scripts/graph/ddic-queries.mjs';
import { buildFieldModel, extractFields, fieldUsage, parseSelect, parseWrite, sqlSegments } from '../../scripts/graph/extract-fields.mjs';

const members = {
  package: 'ZFD',
  objects: [
    { name: 'ZFD_HEAD', type: 'TABL' },
    { name: 'ZFD_ITEM', type: 'TABL' },
    { name: 'ZFD_S_EXT', type: 'STRU' },
    { name: 'ZFD_PROG', type: 'PROG' },
  ],
};

const row = (t: string, f: string, pos: number, extra: Record<string, string> = {}) => ({ TABNAME: t, FIELDNAME: f, POSITION: pos, ...extra });
const fieldRows = [
  row('ZFD_HEAD', 'MANDT', 1, { KEYFLAG: 'X' }),
  row('ZFD_HEAD', 'DOCNR', 2, { KEYFLAG: 'X', ROLLNAME: 'ZFD_DE_DOC' }),
  row('ZFD_HEAD', 'STATUS', 3),
  row('ZFD_HEAD', 'ERDAT', 4),
  row('ZFD_HEAD', '.INCLUDE', 5, { PRECFIELD: 'ZFD_S_EXT' }),
  row('ZFD_HEAD', 'EXT1', 6),
  row('ZFD_HEAD', 'EXT2', 7),
  row('ZFD_S_EXT', 'EXT1', 1),
  row('ZFD_S_EXT', 'EXT2', 2),
  row('ZFD_ITEM', 'MANDT', 1, { KEYFLAG: 'X' }),
  row('ZFD_ITEM', 'DOCNR', 2, { KEYFLAG: 'X' }),
  row('ZFD_ITEM', 'POSNR', 3, { KEYFLAG: 'X' }),
  row('ZFD_ITEM', 'MATNR', 4),
  row('ZFD_ITEM', 'STATUS', 5),
  // standard table with a customer append (step 1 rows + the append structure's own rows)
  row('VBAK', '.APPEND', 200, { PRECFIELD: 'ZAVBAK' }),
  row('ZAVBAK', 'ZZPRIO', 1),
  row('ZAVBAK', 'ZZSRC', 2),
  // standard table with only a standard include: ignored
  row('MARA', '.INCLUDE', 3, { PRECFIELD: 'EMARA' }),
];

const SRC = `REPORT zfd_prog.
TABLES zfd_head.
DATA: ls_head TYPE zfd_head, lt_item TYPE STANDARD TABLE OF zfd_item.
SELECT SINGLE docnr status FROM zfd_head INTO (lv_doc, lv_stat) WHERE docnr = p_doc.
SELECT h~docnr, i~matnr FROM zfd_head AS h INNER JOIN zfd_item AS i ON h~docnr = i~docnr
  WHERE h~erdat >= @p_date AND i~status = 'A' INTO TABLE @DATA(lt_join).
SELECT * FROM zfd_item INTO TABLE lt_item FOR ALL ENTRIES IN lt_keys WHERE docnr = lt_keys-docnr.
SELECT COUNT(*) FROM zfd_item WHERE matnr IN s_matnr.
SELECT vbeln zzprio FROM vbak INTO TABLE lt_vbak WHERE zzsrc = 'X'.
UPDATE zfd_head SET status = 'C' erdat = sy-datum WHERE docnr = p_doc.
UPDATE zfd_item SET status = @lv_s WHERE docnr IN ( SELECT docnr FROM zfd_head WHERE status = 'C' ).
MODIFY zfd_head FROM ls_head.
INSERT zfd_item FROM TABLE lt_item.
DELETE FROM zfd_item WHERE posnr = '000010'.
MODIFY lt_item FROM ls_item INDEX 1 TRANSPORTING status.
DELETE lt_item WHERE status = 'X'.
INSERT ls_item INTO TABLE lt_item.
* SELECT erdat FROM zfd_head.
FUNCTION z_fd_post.
  UPDATE zfd_head FROM ls_head.
ENDFUNCTION.
`;

const fx = extractFields([{ source: SRC, unit: 'ZFD_PROG', object: 'PROG:ZFD_PROG' }], { fieldRows, members, builtAt: 'T' });
type Ref = { t: string; f: string; op: string; from: string; confidence?: string; evidence: Array<{ line: number }> };
const refs = fx.refs as Ref[];
const has = (t: string, f: string, op: string, from = 'PROG:ZFD_PROG') => refs.some((r) => r.t === t && r.f === f && r.op === op && r.from === from);

describe('field model', () => {
  const m = buildFieldModel(fieldRows, new Map(members.objects.map((o) => [o.name, o.type])));
  it('keeps every field of a member table, marks its customer include', () => {
    const head = m.tables.get('ZFD_HEAD');
    expect(head.fields.map((f: { name: string }) => f.name)).toEqual(['MANDT', 'DOCNR', 'STATUS', 'ERDAT', 'EXT1', 'EXT2']);
    expect(head.fields.find((f: { name: string }) => f.name === 'EXT1').struct).toBe('ZFD_S_EXT');
    expect(head.fields.find((f: { name: string }) => f.name === 'DOCNR').key).toBe(true);
  });
  it('keeps only the customer append fields of a standard table, nothing for a standard include', () => {
    expect(m.tables.get('VBAK').fields.map((f: { name: string }) => f.name)).toEqual(['ZZPRIO', 'ZZSRC']);
    expect(m.tables.get('VBAK').scope).toBe('append');
    expect(m.tables.has('MARA')).toBe(false);
    expect(m.structs.get('ZAVBAK').tables).toEqual(['VBAK']);
    expect(m.structs.get('ZFD_S_EXT').tables).toEqual(['ZFD_HEAD']);
  });
});

describe('SQL parsing', () => {
  it('splits subqueries out of a statement', () => {
    const [outer, inner] = sqlSegments('UPDATE ZT SET A = 1 WHERE B IN ( SELECT B FROM ZU WHERE C = 2 )');
    expect(outer).not.toMatch(/ZU/);
    expect(inner).toBe('SELECT B FROM ZU WHERE C = 2');
  });
  it('reads tables, aliases and clauses of a join', () => {
    const p = parseSelect('SELECT H~DOCNR, I~MATNR FROM ZFD_HEAD AS H INNER JOIN ZFD_ITEM AS I ON H~DOCNR = I~DOCNR WHERE H~ERDAT >= @P INTO TABLE @DATA(X)');
    expect(p.tables).toEqual([{ name: 'ZFD_HEAD', alias: 'H' }, { name: 'ZFD_ITEM', alias: 'I' }]);
    expect(p.cols.filter((c: { op: string }) => c.op === 'R').map((c: { tok: string }) => c.tok)).toEqual(['H~DOCNR', 'I~MATNR']);
    expect(p.cols.filter((c: { op: string }) => c.op === 'F').map((c: { tok: string }) => c.tok)).toEqual(['H~DOCNR', 'I~DOCNR', 'H~ERDAT']);
  });
  it('flags a dynamic FROM', () => {
    expect(parseSelect("SELECT * FROM ( LV_TAB ) INTO TABLE LT").dynamic).toBe(true);
  });
  it('cluster tables: IMPORT / EXPORT / DELETE FROM DATABASE are row-level', () => {
    expect(parseWrite('EXPORT CLUSTER_DATA = GT_X TO DATABASE ZFD_CLU(Z1) FROM LS_C ID LV_K')).toMatchObject({ table: 'ZFD_CLU', ops: ['C', 'U'], row: true });
    expect(parseWrite('IMPORT CLUSTER_DATA = GT_X FROM DATABASE ZFD_CLU(Z1) ID LV_K')).toMatchObject({ table: 'ZFD_CLU', ops: ['R'], row: true });
    expect(parseWrite('DELETE FROM DATABASE ZFD_CLU(Z1) ID LV_K')).toMatchObject({ table: 'ZFD_CLU', ops: ['D'], row: true });
  });
  it('ignores internal-table statements', () => {
    expect(parseWrite('MODIFY LT_ITEM FROM LS_ITEM INDEX 1 TRANSPORTING STATUS')).toBeNull();
    expect(parseWrite('INSERT LS_ITEM INTO TABLE LT_ITEM')).toBeNull();
    expect(parseWrite('DELETE LT_ITEM WHERE STATUS = X')).toBeNull();
  });
});

describe('field CRUD', () => {
  it('reads: select list and conditions', () => {
    expect(has('ZFD_HEAD', 'DOCNR', 'R')).toBe(true);
    expect(has('ZFD_HEAD', 'STATUS', 'R')).toBe(true);
    expect(has('ZFD_HEAD', 'DOCNR', 'F')).toBe(true);
    expect(has('ZFD_HEAD', 'ERDAT', 'F')).toBe(true);
    expect(has('ZFD_ITEM', 'MATNR', 'R')).toBe(true);
    expect(has('ZFD_ITEM', 'STATUS', 'F')).toBe(true);
    expect(has('ZFD_ITEM', 'MATNR', 'F')).toBe(true);
  });
  it('SELECT * is a row read; COUNT(*) is not', () => {
    const star = refs.find((r) => r.t === 'ZFD_ITEM' && r.f === '*' && r.op === 'R');
    expect(star?.evidence.map((e) => e.line)).toEqual([7]);
  });
  it('host variables are not columns', () => {
    expect(refs.some((r) => r.f === 'P_DOC' || r.f === 'LV_DOC')).toBe(false);
  });
  it('UPDATE SET changes only the named fields', () => {
    expect(has('ZFD_HEAD', 'STATUS', 'U')).toBe(true);
    expect(has('ZFD_HEAD', 'ERDAT', 'U')).toBe(true);
    expect(has('ZFD_HEAD', 'DOCNR', 'U')).toBe(false);
    expect(has('ZFD_ITEM', 'STATUS', 'U')).toBe(true);
  });
  it('subquery inside UPDATE reads its own table', () => {
    expect(has('ZFD_HEAD', 'STATUS', 'F')).toBe(true);
  });
  it('MODIFY / INSERT / DELETE / UPDATE FROM are row-level', () => {
    expect(has('ZFD_HEAD', '*', 'C')).toBe(true);
    expect(has('ZFD_HEAD', '*', 'U')).toBe(true);
    expect(has('ZFD_ITEM', '*', 'C')).toBe(true);
    expect(has('ZFD_ITEM', '*', 'D')).toBe(true);
    expect(has('ZFD_ITEM', 'POSNR', 'F')).toBe(true);
    expect(has('ZFD_HEAD', '*', 'U', 'FUNC:Z_FD_POST')).toBe(true);
  });
  it('customer append fields of a standard table', () => {
    expect(has('VBAK', 'ZZPRIO', 'R')).toBe(true);
    expect(has('VBAK', 'ZZSRC', 'F')).toBe(true);
    expect(refs.some((r) => r.t === 'VBAK' && r.f === 'VBELN')).toBe(false);
  });
  it('commented statements and internal tables leave nothing', () => {
    expect(refs.some((r) => r.evidence.some((e) => e.line === 18))).toBe(false);
    expect(refs.some((r) => r.t === 'LT_ITEM')).toBe(false);
  });
});

describe('append read plan', () => {
  const graph = {
    nodes: [
      { id: 'PROG:ZFD_PROG', type: 'PROG', scope: 'member' },
      { id: 'TABL:VBAK', type: 'TABL', scope: 'standard' },
      { id: 'TABL:MARA', type: 'TABL', scope: 'standard' },
      { id: 'TABL:ZFD_HEAD', type: 'TABL', scope: 'member' },
      { id: 'STRU:BAPIRET2', type: 'STRU', scope: 'standard' },
    ],
    edges: [
      { from: 'PROG:ZFD_PROG', to: 'TABL:VBAK', kind: 'reads' },
      { from: 'PROG:ZFD_PROG', to: 'TABL:MARA', kind: 'writes' },
      { from: 'PROG:ZFD_PROG', to: 'TABL:ZFD_HEAD', kind: 'reads' },
      { from: 'PROG:ZFD_PROG', to: 'STRU:BAPIRET2', kind: 'types' },
    ],
  };
  it('round 1 asks for the include / append rows of standard tables read or written', () => {
    const plan = appendQueries(graph, { chunk: 50 });
    expect(plan).toHaveLength(1);
    expect(plan[0].id).toBe('dd03l-app-1');
    expect(plan[0].sql).toBe("SELECT TABNAME, FIELDNAME, POSITION, PRECFIELD FROM DD03L WHERE AS4LOCAL = 'A' AND FIELDNAME IN ('.APPEND','.INCLUDE') AND TABNAME IN ('MARA','VBAK')");
  });
  it('round 2 reads the customer structures only', () => {
    const plan = appendFieldQueries([{ TABNAME: 'VBAK', FIELDNAME: '.APPEND', PRECFIELD: 'ZAVBAK' }, { TABNAME: 'MARA', FIELDNAME: '.INCLUDE', PRECFIELD: 'EMARA' }, { TABNAME: 'EKKO', FIELDNAME: '.INCLUDE', PRECFIELD: 'CI_EKKODB' }]);
    expect(plan).toHaveLength(1);
    expect(plan[0].sql).toMatch(/FROM DD03L WHERE AS4LOCAL = 'A' AND TABNAME IN \('CI_EKKODB','ZAVBAK'\)$/);
  });
});

describe('build-package-graph writes fields.json', () => {
  it('own DD03L, or the whole-package folder via fieldsDdic (used-TCode folder)', () => {
    const root = mkdtempSync(join(tmpdir(), 'fx-build-'));
    try {
      const src = join(root, 'src'), pkg = join(root, 'ZFD'), used = join(root, 'ZFD.used');
      for (const d of [src, join(src, 'zfd_prog.prog'), pkg, used]) mkdirSync(d, { recursive: true });
      writeFileSync(join(src, 'zfd_prog.prog', 'zfd_prog.prog.abap'), SRC);
      const rowsFile = join(root, 'dd03l.json');
      writeFileSync(rowsFile, JSON.stringify({ rows: fieldRows }));
      writeFileSync(join(pkg, 'walk.json'), JSON.stringify(members));
      writeFileSync(join(pkg, 'ddic-reads.json'), JSON.stringify([{ id: 'dd03l-1', table: 'DD03L', path: rowsFile, rows: fieldRows.length }]));
      writeFileSync(join(used, 'walk.json'), JSON.stringify({ package: 'ZFD', objects: [{ name: 'ZFD_PROG', type: 'PROG/P' }] }));
      const own = buildPackageGraph({ dir: pkg, src, builtAt: 'T' });
      expect(own.fields.refs).toBeGreaterThan(10);
      const none = buildPackageGraph({ dir: used, src, builtAt: 'T' });
      expect(none.fields).toBeUndefined();
      const via = buildPackageGraph({ dir: used, src, builtAt: 'T', fieldsDdic: [pkg] });
      expect(via.fields.refs).toBe(own.fields.refs);
      const fx = JSON.parse(readFileSync(join(used, 'fields.json'), 'utf8'));
      expect(fx.tables.ZFD_HEAD.fields.map((f: { name: string }) => f.name)).toContain('STATUS');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe('fieldUsage', () => {
  it('a table field collects its own refs and the row-level ones', () => {
    const u = fieldUsage(fx, 'zfd_head-status');
    expect(u.fields).toHaveLength(1);
    const ops = u.fields[0].ops;
    expect(ops.U.map((x: { from: string; row: boolean }) => [x.from, x.row])).toEqual(expect.arrayContaining([['PROG:ZFD_PROG', false], ['PROG:ZFD_PROG', true], ['FUNC:Z_FD_POST', true]]));
    expect(ops.C.every((x: { row: boolean }) => x.row)).toBe(true);
  });
  it('a structure field resolves through the tables that include it', () => {
    const u = fieldUsage(fx, 'ZFD_S_EXT-EXT1');
    expect(u.tables).toEqual(['ZFD_HEAD']);
    expect(u.fields[0].ops.C.length).toBeGreaterThan(0);
    expect(fieldUsage(fx, 'ZAVBAK').fields.map((f: { field: string }) => f.field)).toEqual(['ZZPRIO', 'ZZSRC']);
  });
  it('unknown target', () => {
    expect(fieldUsage(fx, 'ZNOPE-X').found).toBe(false);
  });
});
