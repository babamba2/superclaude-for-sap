import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { lexAbap, statementText } from '../../scripts/graph/abap-lexer.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { extractGraph, discoverUnits, runCli } from '../../scripts/graph/extract-edges.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { loadGraph, callers, reach, impact, flow, components, stats, usage, runQuery } from '../../scripts/graph/graph-query.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { buildPackageGraph } from '../../scripts/graph/build-package-graph.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { parseDdicFacts } from '../../scripts/graph/ddic-edges.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { importUsage, nameTokens, xlsxText } from '../../scripts/graph/import-usage.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { zipFiles } from '../../scripts/spec/xlsx-zip.mjs';

type Ev = { unit: string; line: number; text: string };
type Edge = { from: string; to: string; kind: string; evidence: Ev[]; count: number; [k: string]: unknown };
type Node = { id: string; type: string; scope: string; [k: string]: unknown };
type Graph = { nodes: Node[]; edges: Edge[]; unresolved: { from: string; via: string; token: string }[]; coverage: Record<string, unknown>; [k: string]: unknown };

const FIX = resolve(__dirname, '../fixtures/graph');
const SRC = join(FIX, 'src');
const walk = JSON.parse(readFileSync(join(FIX, 'walk.json'), 'utf8'));
const tcodes = JSON.parse(readFileSync(join(FIX, 'tcodes.json'), 'utf8'));
const fx: Graph = extractGraph(discoverUnits(SRC), { members: walk, package: 'ZGT', sapVersion: 'ECC', tcodes, builtAt: '2026-10-12T00:00:00Z' });

const edge = (g: Graph, from: string, kind: string, to: string) => g.edges.find((e) => e.from === from && e.kind === kind && e.to === to);
const targets = (g: Graph, kind: string, from = 'PROG:ZGT_ORDER') => g.edges.filter((e) => e.kind === kind && e.from === from).map((e) => e.to).sort();
const lineOf = (file: string, needle: string) => readFileSync(join(SRC, file), 'utf8').split(/\r?\n/).findIndex((l) => l.includes(needle)) + 1;

describe('abap-lexer', () => {
  it('drops comments, lifts literals, joins lines and keeps the start line', () => {
    const src = [
      '* full-line comment SELECT * FROM x.',
      "CALL FUNCTION 'Z_A' \" trailing comment CALL FUNCTION 'Z_B'",
      "  EXPORTING iv = 'it''s. a period'.",
      'WRITE `tick. tock` && |tpl. { lv }|.',
    ].join('\n');
    const { statements, lits } = lexAbap(src);
    expect(statements).toHaveLength(2);
    expect(statements[0].line).toBe(2);
    expect(statements[0].upper).toMatch(/^CALL FUNCTION '§0' EXPORTING IV = '§1'$/);
    expect(lits[0].value).toBe('Z_A');
    expect(lits[1].value).toBe("it's. a period");
    expect(statementText(statements[0], lits)).toBe("CALL FUNCTION 'Z_A' EXPORTING iv = 'it''s. a period'");
    expect(statements[1].line).toBe(4);
    expect(statements[1].upper).not.toMatch(/TICK/);
  });

  it('splits chained statements at top-level commas with each part on its own line', () => {
    const { statements } = lexAbap('DATA : a TYPE c,\n       b TYPE p DECIMALS 2,\n       c TYPE STANDARD TABLE OF x WITH KEY ( k1, k2 ).');
    expect(statements.map((s: { upper: string }) => s.upper)).toEqual([
      'DATA A TYPE C',
      'DATA B TYPE P DECIMALS 2',
      'DATA C TYPE STANDARD TABLE OF X WITH KEY ( K1, K2 )',
    ]);
    expect(statements.map((s: { line: number }) => s.line)).toEqual([1, 2, 3]);
  });
});

describe('extract-edges on the synthetic package', () => {
  it('include edges come from the unit holding the INCLUDE; commented / <icon> includes are ignored', () => {
    expect(targets(fx, 'include')).toEqual(['INCL:ZGT_ORDERF01', 'INCL:ZGT_ORDERTOP']);
    expect(edge(fx, 'FUGR:ZGT_POST', 'include', 'INCL:LZGT_POSTUXX')).toBeTruthy();
    expect(edge(fx, 'INCL:LZGT_POSTUXX', 'include', 'INCL:LZGT_POSTU01')).toBeTruthy();
    expect(fx.nodes.find((n) => n.id === 'INCL:ZGT_ORDEROLD')).toBeUndefined();
  });

  it('calls: literal FMs with BAPI / destination / update-task flags; PERFORM IN PROGRAM; no comment or string hits', () => {
    expect(targets(fx, 'calls')).toEqual([
      'FUNC:BAPI_GT_ORDER_CREATE', 'FUNC:BAPI_TRANSACTION_COMMIT', 'FUNC:Z_GT_CONST_FM', 'FUNC:Z_GT_POST_ORDER', 'FUNC:Z_GT_READ_ORDER',
      'PROG:ZGT_CHAIN1', 'PROG:ZGT_CHAIN2', 'PROG:ZGT_FORMS', 'PROG:ZGT_FORMS2',
    ]);
    const bapi = edge(fx, 'PROG:ZGT_ORDER', 'calls', 'FUNC:BAPI_GT_ORDER_CREATE')!;
    expect(bapi).toMatchObject({ bapi: true, destination: ['NONE'] });
    expect(bapi.evidence[0]).toMatchObject({ unit: 'ZGT_ORDERF01', line: lineOf('zgt_order.prog/zgt_orderf01.incl.abap', "'BAPI_GT_ORDER_CREATE'") });
    expect(edge(fx, 'PROG:ZGT_ORDER', 'calls', 'FUNC:Z_GT_POST_ORDER')).toMatchObject({ update: true });
    expect(edge(fx, 'PROG:ZGT_ORDER', 'calls', 'FUNC:Z_GT_CONST_FM')).toMatchObject({ confidence: 'low', constant: 'GC_FM' });
    expect(edge(fx, 'PROG:ZGT_ORDER', 'calls', 'PROG:ZGT_FORMS')).toMatchObject({ form: ['LOG_IT'] });
    const all = JSON.stringify(fx.edges.map((e) => e.to));
    for (const trap of ['Z_GT_COMMENTED_OUT', 'Z_GT_IN_COMMENT', 'Z_GT_IN_STRING', 'ZGT_FAKE', 'ZGT_TPL', 'ZGT_BACKTICK', 'ZFAKE', 'ZGT_TRAP', 'ZGT_IN_HEADER_COMMENT']) {
      expect(all).not.toContain(trap);
    }
  });

  it('chained PERFORM parts keep their own line', () => {
    const f = 'zgt_order.prog/zgt_orderf01.incl.abap';
    expect(edge(fx, 'PROG:ZGT_ORDER', 'calls', 'PROG:ZGT_CHAIN1')!.evidence[0].line).toBe(lineOf(f, 'a1 IN PROGRAM'));
    expect(edge(fx, 'PROG:ZGT_ORDER', 'calls', 'PROG:ZGT_CHAIN2')!.evidence[0].line).toBe(lineOf(f, 'a2 IN PROGRAM'));
  });

  it('submits and starts', () => {
    expect(targets(fx, 'submits')).toEqual(['PROG:ZGT_CONST_PROG', 'PROG:ZGT_READER', 'PROG:ZGT_REPORT']);
    expect(edge(fx, 'PROG:ZGT_ORDER', 'submits', 'PROG:ZGT_READER')).toMatchObject({ andReturn: true });
    expect(edge(fx, 'PROG:ZGT_ORDER', 'submits', 'PROG:ZGT_REPORT')).toMatchObject({ viaSelectionScreen: true });
    expect(targets(fx, 'starts')).toEqual(['TRAN:VA03', 'TRAN:ZGT1']);
    expect(edge(fx, 'PROG:ZGT_ORDER', 'starts', 'TRAN:VA03')).toMatchObject({ skipFirstScreen: true });
  });

  it('reads: new Open SQL with @ hosts, JOINs, subquery, FAE; FROM @itab and literals excluded; multi-line start line', () => {
    expect(targets(fx, 'reads')).toEqual(['TABL:MAKT', 'TABL:MARA', 'TABL:VBAK', 'TABL:VBAP', 'TABL:VBEP', 'TABL:ZGT_AUART', 'TABL:ZGT_CFG', 'TABL:ZGT_HEAD']);
    expect(edge(fx, 'PROG:ZGT_ORDER', 'reads', 'TABL:VBAP')!.evidence[0].line).toBe(lineOf('zgt_order.prog/zgt_orderf01.incl.abap', 'SELECT a~vbeln'));
    expect(fx.nodes.find((n) => n.id.endsWith(':LT_JOIN'))).toBeUndefined();
    expect(edge(fx, 'PROG:ZGT_READER', 'reads', 'TABL:ZGT_LOG')).toBeTruthy();
    expect(edge(fx, 'CLAS:ZCL_GT_UTIL', 'reads', 'TABL:ZGT_CFG')).toBeTruthy();
  });

  it('writes: DB targets only, with ops and confidence; internal tables never', () => {
    expect(targets(fx, 'writes')).toEqual(['TABL:ZGT_CFG', 'TABL:ZGT_HEAD', 'TABL:ZGT_HIST', 'TABL:ZGT_LOG', 'TABL:ZGT_OLD', 'TABL:ZGT_TMP', 'TABL:ZGT_UNKNOWN']);
    const log = edge(fx, 'PROG:ZGT_ORDER', 'writes', 'TABL:ZGT_LOG')!;
    expect(log).toMatchObject({ ops: ['INSERT'], count: 2 });
    expect(log.confidence).toBeUndefined();
    expect(edge(fx, 'PROG:ZGT_ORDER', 'writes', 'TABL:ZGT_HEAD')).toMatchObject({ ops: ['UPDATE'] });
    expect(edge(fx, 'PROG:ZGT_ORDER', 'writes', 'TABL:ZGT_CFG')!.confidence).toBeUndefined(); // read elsewhere → known DB
    expect(edge(fx, 'PROG:ZGT_ORDER', 'writes', 'TABL:ZGT_UNKNOWN')).toMatchObject({ confidence: 'low' });
    expect(edge(fx, 'PROG:ZGT_ORDER', 'writes', 'TABL:ZGT_TMP')).toMatchObject({ ops: ['DELETE'] });
    // declared itab with a Z-like name, prefixed itabs, field-symbol / component targets
    const all = JSON.stringify(fx.edges.filter((e) => e.kind === 'writes').map((e) => e.to));
    for (const itab of ['ZGT_BUFFER', 'GT_ITEM', 'LT_KEYS', 'SCREEN', 'GT_QUEUE']) expect(all).not.toContain(itab);
    // FUNCTION … ENDFUNCTION is attributed to the FM
    expect(edge(fx, 'FUNC:Z_GT_POST_ORDER', 'writes', 'TABL:ZGT_LOG')).toMatchObject({ ops: ['MODIFY'] });
    expect(edge(fx, 'FUGR:ZGT_POST', 'calls', 'FUNC:Z_GT_NOTIFY')).toBeTruthy();
  });

  it('uses: REF TO / NEW / => / CREATE OBJECT TYPE / CATCH / RAISING / INHERITING / INTERFACES; local classes and self skipped', () => {
    expect(targets(fx, 'uses')).toEqual([
      'CLAS:CL_SALV_TABLE', 'CLAS:CX_SY_ARITHMETIC_ERROR', 'CLAS:ZCL_GT_FACTORY', 'CLAS:ZCL_GT_UTIL', 'CLAS:ZCX_GT_ERROR', 'INTF:ZIF_GT_CONST',
    ]);
    expect(targets(fx, 'uses', 'CLAS:ZCL_GT_UTIL')).toEqual(['CLAS:ZCL_GT_BASE', 'INTF:ZIF_GT_API']);
    expect(edge(fx, 'CLAS:ZCL_GT_UTIL', 'uses', 'CLAS:ZCL_GT_BASE')).toMatchObject({ inherits: true });
    expect(JSON.stringify(fx.edges.map((e) => e.to))).not.toContain('LCL_APP');
  });

  it('types: DDIC names only, ranked TABL > STRU > DTEL(guess); local TYPES / built-ins / ABAP_* skipped', () => {
    const t = targets(fx, 'types');
    expect(t).toEqual(expect.arrayContaining(['TABL:ZGT_HEAD', 'TABL:ZGT_LOG', 'TABL:ZGT_CFG', 'STRU:ZGT_SCR', 'STRU:ZGT_EXT_S', 'STRU:ZGT_ITEM_S', 'DTEL:ZGT_QTY', 'DTEL:VBELN_VA']));
    const names = t.map((id) => id.split(':')[1]);
    for (const no of ['TY_ITEM', 'TT_ITEM', 'ABAP_BOOL', 'C', 'LCL_APP']) expect(names).not.toContain(no);
    expect(fx.nodes.find((n) => n.id === 'DTEL:ZGT_QTY')).toMatchObject({ guess: true });
    expect(fx.nodes.find((n) => n.id === 'STRU:ZGT_EXT_S')).toMatchObject({ scope: 'member' }); // walk.json type wins
    expect(edge(fx, 'FUNC:Z_GT_POST_ORDER', 'types', 'TABL:ZGT_HEAD')).toBeTruthy(); // inline FM signature
  });

  it('dynamic: DYN nodes + unresolved[]; constants resolve with low confidence', () => {
    expect(fx.unresolved.map((u) => `${u.via}:${u.token}`).sort()).toEqual([
      'calls:LV_FM', 'calls:LV_PROG', 'reads:LV_TAB', 'starts:LV_PROG', 'submits:LV_PROG', 'uses:LV_CLS', 'writes:LV_DYN',
    ]);
    expect(fx.nodes.find((n) => n.id === 'DYN:CALLS:LV_FM')).toMatchObject({ scope: 'dynamic' });
    expect(edge(fx, 'PROG:ZGT_ORDER', 'submits', 'PROG:ZGT_CONST_PROG')).toMatchObject({ confidence: 'low', constant: 'GC_PROG' });
  });

  it('scopes, TCode launches, coverage and graph header', () => {
    const scope = (id: string) => fx.nodes.find((n) => n.id === id)?.scope;
    expect(scope('PROG:ZGT_ORDER')).toBe('member');
    expect(scope('INCL:ZGT_ORDERTOP')).toBe('member');
    expect(scope('FUNC:Z_GT_POST_ORDER')).toBe('member');
    expect(scope('FUNC:Z_GT_READ_ORDER')).toBe('custom');
    expect(scope('TABL:VBAK')).toBe('standard');
    expect(edge(fx, 'TRAN:ZGT1', 'launches', 'PROG:ZGT_ORDER')).toBeTruthy();
    expect(fx).toMatchObject({ package: 'ZGT', sapVersion: 'ECC', extractor: 'extract-edges@1', builtAt: '2026-10-12T00:00:00Z' });
    expect(fx.coverage).toMatchObject({ members: 8, parsed: 4, units: 9, skipped: ['PROG:ZGT_MISSING'], whereUsed: 'unavailable (ECC 404)' });
    expect(fx.nodes.find((n) => n.id === 'PROG:ZGT_ORDER')).toMatchObject({ srcHash: expect.stringMatching(/^[0-9a-f]{16}$/), units: ['ZGT_ORDER', 'ZGT_ORDERF01', 'ZGT_ORDERTOP'] });
    // deterministic: same input, same graph (apart from timing)
    const again = extractGraph(discoverUnits(SRC), { members: walk, package: 'ZGT', sapVersion: 'ECC', tcodes, builtAt: '2026-10-12T00:00:00Z' });
    expect(JSON.stringify({ ...again, coverage: 0 })).toBe(JSON.stringify({ ...fx, coverage: 0 }));
  });

  it('evidence is capped at 5 per edge while count keeps the total', () => {
    const src = Array.from({ length: 8 }, () => "CALL FUNCTION 'Z_GT_MANY'.").join('\n');
    const g: Graph = extractGraph([{ source: src, unit: 'ZGT_CAP', object: 'PROG:ZGT_CAP' }], {});
    const e = edge(g, 'PROG:ZGT_CAP', 'calls', 'FUNC:Z_GT_MANY')!;
    expect(e.count).toBe(8);
    expect(e.evidence).toHaveLength(5);
    expect(e.evidence.map((x) => x.line)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('graph-query', () => {
  const G = loadGraph(fx);

  it('callers / reach / impact', () => {
    expect(callers(G, 'ZCL_GT_UTIL').callers.map((c: { from: string }) => c.from)).toEqual(['PROG:ZGT_ORDER', 'PROG:ZGT_READER']);
    expect(callers(G, 'ZGT_LOG', { kinds: 'writes' }).callers.map((c: { from: string }) => c.from).sort()).toEqual(['FUNC:Z_GT_POST_ORDER', 'PROG:ZGT_ORDER']);
    const r = reach(G, 'TRAN:ZGT1', { kinds: 'launches,calls,submits', depth: 2 });
    const ids = r.nodes.map((n: { id: string }) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['PROG:ZGT_ORDER', 'FUNC:Z_GT_POST_ORDER', 'FUGR:ZGT_POST', 'PROG:ZGT_READER']));
    expect(ids).not.toContain('FUNC:Z_GT_NOTIFY'); // depth 3 through the FM's group
    expect(reach(G, 'TRAN:ZGT1', { kinds: 'launches,calls' }).nodes.map((n: { id: string }) => n.id)).toContain('FUNC:Z_GT_NOTIFY');
    const imp = impact(G, 'ZGT_LOG').nodes.map((n: { id: string }) => n.id);
    expect(imp).toEqual(expect.arrayContaining(['FUNC:Z_GT_POST_ORDER', 'PROG:ZGT_ORDER', 'PROG:ZGT_READER', 'FUGR:ZGT_POST', 'TRAN:ZGT1', 'TRAN:ZGT2']));
  });

  it('flow: writers → readers with the programs reaching each', () => {
    const f = flow(G, 'ZGT_LOG');
    expect(f.table).toBe('TABL:ZGT_LOG');
    expect(f.writers.map((w: { id: string }) => w.id)).toEqual(['FUNC:Z_GT_POST_ORDER', 'PROG:ZGT_ORDER']);
    expect(f.writers[0].programs).toEqual(['PROG:ZGT_ORDER', 'TRAN:ZGT1']);
    expect(f.readers.map((r: { id: string }) => r.id)).toEqual(['PROG:ZGT_READER']);
    expect(f.readers[0].programs).toEqual(expect.arrayContaining(['TRAN:ZGT2', 'PROG:ZGT_READER']));
    expect(f.sequence).toContainEqual({ writer: 'FUNC:Z_GT_POST_ORDER', reader: 'PROG:ZGT_READER' });
  });

  it('components: TRAN entry points joined by the shared written table', () => {
    const c = components(G);
    expect(c.source).toBe('launches');
    expect(c.components).toHaveLength(1);
    expect(c.components[0].entries).toEqual(['TRAN:ZGT1', 'TRAN:ZGT2']);
    expect(c.components[0].members).toEqual(expect.arrayContaining(['PROG:ZGT_ORDER', 'PROG:ZGT_READER', 'FUGR:ZGT_POST', 'CLAS:ZCL_GT_UTIL', 'TABL:ZGT_LOG']));
    expect(c.components[0].sharedTables.find((t: { table: string }) => t.table === 'TABL:ZGT_LOG')).toMatchObject({ writers: ['TRAN:ZGT1'], readers: ['TRAN:ZGT2'] });
    expect(c.unreached).toEqual([]);
  });

  it('usage: TCode / job roots → direct, reach → indirect, measured false → unused', () => {
    const u = usage(G, {
      tcodes: { months: 12, coverage: 3, result: { ZGT1: true, ZGT2: false } },
      jobs: { months: 12, oldest: '20260928', complete: false, result: { ZGT_READER: false, ZGT_MISSING: false } },
    });
    const st = (id: string) => u.objects.find((o: { id: string }) => o.id === id);
    expect(st('TRAN:ZGT1')).toMatchObject({ status: 'direct', reasons: ['tcode ZGT1'] });
    expect(st('PROG:ZGT_ORDER')).toMatchObject({ status: 'direct', reasons: ['tcode ZGT1'] });
    expect(st('FUGR:ZGT_POST').status).toBe('indirect');
    expect(st('TABL:ZGT_LOG').status).toBe('indirect');
    expect(st('PROG:ZGT_READER')).toMatchObject({ status: 'indirect' }); // submitted by ZGT_ORDER
    expect(st('PROG:ZGT_READER').via[0]).toBe('PROG:ZGT_ORDER');
    expect(st('TRAN:ZGT2').status).toBe('unused');
    expect(u.counts.direct).toBe(2);
    expect(u.caveats.join(' ')).toMatch(/3 of 12 months/);
    expect(u.caveats.join(' ')).toMatch(/since 20260928/);
    // a job step alone makes a program direct
    const j = usage(G, { jobs: { result: { ZGT_READER: true } } });
    expect(j.objects.find((o: { id: string }) => o.id === 'PROG:ZGT_READER')).toMatchObject({ status: 'direct', reasons: ['job step'] });
    expect(j.objects.find((o: { id: string }) => o.id === 'PROG:ZGT_ORDER').status).toBe('no-evidence');
    // listed members without source / references are still nodes; TCodes without a mapping still listed
    expect(fx.nodes.find((n) => n.id === 'PROG:ZGT_MISSING')).toMatchObject({ scope: 'member', unreferenced: true });
    const m = usage(G, { tcodes: { result: { ZGT9: false } } });
    expect(m.objects.find((o: { id: string }) => o.id === 'TRAN:ZGT9')).toMatchObject({ status: 'unused', unmapped: true });
  });

  it('DDIC (DD03L / DD04L) and GetTransaction TCodes become edges; usage follows them', () => {
    const ddic = {
      fields: {
        rows: [
          { TABNAME: 'ZGT_LOG', FIELDNAME: 'MANDT', ROLLNAME: 'MANDT' }, // standard DTEL: skipped
          { TABNAME: 'ZGT_LOG', FIELDNAME: 'STATUS', ROLLNAME: 'ZGT_DE_STATUS' },
          { TABNAME: 'ZGT_LOG', FIELDNAME: '.INCLUDE', ROLLNAME: '', PRECFIELD: 'ZGT_EXT_S' },
          { TABNAME: 'MARA', FIELDNAME: 'ZZFLAG', ROLLNAME: 'ZGT_DE_FLAG' }, // standard table: skipped
        ],
      },
      dtels: [{ ROLLNAME: 'ZGT_DE_STATUS', DOMNAME: 'ZGT_DO_STATUS' }],
    };
    const tcodesTx = {
      success: true,
      transactions: [
        { tcode: 'ZGT1', found: true, kind: 'program', program: 'ZGT_ORDER' },
        { tcode: 'ZGT9', found: true, kind: 'parameter', target_tcode: 'SM30', parameters: { VIEWNAME: 'ZGT_V_LOG', UPDATE: 'X' } },
        { tcode: 'ZGT0', found: false },
      ],
    };
    const g2: Graph = extractGraph(discoverUnits(SRC), { members: walk, package: 'ZGT', tcodes: tcodesTx, ddic, builtAt: '2026-10-12T00:00:00Z' });
    expect(edge(g2, 'TABL:ZGT_LOG', 'types', 'DTEL:ZGT_DE_STATUS')?.evidence[0].unit).toBe('DD03L');
    expect(edge(g2, 'TABL:ZGT_LOG', 'types', 'STRU:ZGT_EXT_S')).toBeTruthy();
    expect(edge(g2, 'DTEL:ZGT_DE_STATUS', 'types', 'DOMA:ZGT_DO_STATUS')).toBeTruthy();
    expect(g2.edges.some((e) => e.to === 'DTEL:MANDT' && e.evidence[0]?.unit === 'DD03L')).toBe(false);
    expect(g2.edges.some((e) => e.from === 'TABL:MARA')).toBe(false);
    expect(edge(g2, 'TRAN:ZGT9', 'launches', 'VIEW:ZGT_V_LOG')).toMatchObject({ via: 'SM30' });
    expect(g2.coverage.ddic).toEqual({ fields: 2, dtels: 1 });
    const u = usage(loadGraph(g2), { tcodes: { result: { ZGT1: true } } });
    const st = (id: string) => u.objects.find((o: { id: string }) => o.id === id);
    expect(st('TABL:ZGT_LOG').status).toBe('indirect');
    expect(st('STRU:ZGT_EXT_S').status).toBe('indirect');
  });

  it('parseDdicFacts: checker FACT lines → DD03L / DD04L-shaped rows', () => {
    const d = parseDdicFacts([
      'CHECKER scout scope=ZGT_LOG status=OK',
      'FACT obj=ZGT_LOG kind=TABL key="types" value="STATUS=ZGT_DE_STATUS/ZGT_DO_STATUS"',
      'FACT obj=ZGT_LOG kind=TABL key="types" value="FLAG=ZGT_DE_FLAG"',
      'FACT obj=ZGT_DE_X kind=DTEL key="domain" value="ZGT_DO_X"',
      'FACT obj=ZGT_DE_Y kind=DTEL key="domain" value="-"',
      'END count=4',
    ].join('\r\n'));
    expect(d.fields).toEqual([
      { TABNAME: 'ZGT_LOG', FIELDNAME: 'STATUS', ROLLNAME: 'ZGT_DE_STATUS' },
      { TABNAME: 'ZGT_LOG', FIELDNAME: 'FLAG', ROLLNAME: 'ZGT_DE_FLAG' },
    ]);
    expect(d.dtels).toEqual([
      { ROLLNAME: 'ZGT_DE_STATUS', DOMNAME: 'ZGT_DO_STATUS' },
      { ROLLNAME: 'ZGT_DE_X', DOMNAME: 'ZGT_DO_X' },
    ]);
  });

  it('build-package-graph: member folders only, graph + usage files next to walk.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc4sap-pkg-'));
    try {
      writeFileSync(join(dir, 'walk.json'), JSON.stringify(walk));
      writeFileSync(join(dir, 'tcodes.json'), JSON.stringify(tcodes));
      writeFileSync(join(dir, 'usage.json'), JSON.stringify({ tcodes: { result: { ZGT1: true, ZGT2: false } } }));
      const s = buildPackageGraph({ dir, src: SRC, system: 'DEV', sapVersion: 'ECC', builtAt: '2026-10-12T00:00:00Z' });
      expect(s.sourcesMissing).toEqual(['PROG:ZGT_MISSING']);
      expect(s.usage.direct).toBe(2);
      const g = JSON.parse(readFileSync(join(dir, 'graph.json'), 'utf8'));
      expect(g.nodes.some((n: Node) => n.id === 'FUGR:ZGT_POST')).toBe(true);
      expect(readFileSync(join(dir, 'usage.md'), 'utf8')).toMatch(/direct 2/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('import-usage: user-submitted QA list (text / xlsx) → usage.json side + source caveat', () => {
    const w = { objects: [{ name: 'ZGT1', type: 'TRAN' }, { name: 'ZGT2', type: 'TRAN' }, { name: 'ZGT_READER', type: 'PROG' }] };
    const st03n = 'Transaction\tSteps\tResp. time\nzgt1\t1,204\t310\nVA01\t88\t200\nZOTHER9\t3\t10\n';
    const r = importUsage({ walk: w, text: st03n, system: 'QAS', months: 6, file: 'C:/x/st03n.txt', today: '2026-10-12' });
    expect(r.side.result).toEqual({ ZGT1: true, ZGT2: false });
    expect(r.notInPackage).toEqual(['ZOTHER9']);
    expect(r.side).toMatchObject({ months: 6, coverage: 6, source: { system: 'QAS', file: 'st03n.txt', kind: 'user-file' } });
    expect(importUsage({ walk: w, text: 'ZGT_READER', kind: 'jobs', system: 'QAS' }).side).toMatchObject({ complete: true, result: { ZGT_READER: true } });

    const sheet = '<worksheet><sheetData><row><c t="s"><v>0</v></c><c t="inlineStr"><is><t>ZGT2</t></is></c></row></sheetData></worksheet>';
    const xlsx = zipFiles([
      { name: 'xl/sharedStrings.xml', data: Buffer.from('<sst><si><t>Tx &amp; profile</t></si></sst>') },
      { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(sheet) },
    ]);
    expect(nameTokens(xlsxText(xlsx)).has('ZGT2')).toBe(true);

    const u = usage(G, { tcodes: { months: 6, coverage: 6, result: { ZGT1: true }, source: r.side.source } });
    expect(u.window.tcodes.source.system).toBe('QAS');
    expect(u.caveats.some((c: string) => c.startsWith('TCode usage measured on QAS'))).toBe(true);
  });

  it('stats + CLI round trip (extract → query, JSON and Markdown)', () => {
    const s = stats(G);
    expect(s.edgesByKind).toMatchObject({ include: 5, launches: 2, submits: 3, writes: 8, dynamic: 7 });
    expect(s.unresolved).toBe(7);
    expect(s.degree.find((d: { id: string }) => d.id === 'TABL:ZGT_LOG').inByKind).toMatchObject({ writes: 2, reads: 1 });

    const dir = mkdtempSync(join(tmpdir(), 'sc4sap-graph-'));
    try {
      const out = join(dir, 'graph.json');
      const res = runCli(['--prog-dir', SRC, '--members', join(FIX, 'walk.json'), '--tcodes', join(FIX, 'tcodes.json'), '--out', out, '--sap-version', 'ECC']);
      expect(res).toMatchObject({ nodes: fx.nodes.length, edges: fx.edges.length, unresolved: 7 });
      expect(JSON.parse(readFileSync(out, 'utf8')).package).toBe('ZGT'); // taken from walk.json
      const units = join(dir, 'units.json');
      writeFileSync(units, JSON.stringify([{ file: join(SRC, 'zgt_reader.prog/zgt_reader.prog.abap'), unit: 'ZGT_READER', object: 'PROG:ZGT_READER' }]));
      runCli(['--units', units, '--members', 'ZGT_READER:PROG,ZGT_LOG:TABL', '--out', out]);
      expect(JSON.parse(runQuery([out, 'callers', 'ZGT_LOG'])).callers[0].from).toBe('PROG:ZGT_READER');
      expect(runQuery([out, 'stats', '--md'])).toMatch(/\| reads \| 1 \|/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
