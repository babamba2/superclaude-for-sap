import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ledgerEntry, parseAunit } from '../../scripts/evidence/lib.mjs';
import { decide as guard, onlyPluginPt } from '../../scripts/evidence/guard.mjs';
import { activePath, capture } from '../../scripts/program-test/pt-capture.mjs';
import { gate, serverMaskingProven } from '../../scripts/program-test/pt-gate.mjs';
import {
  abapRows, buildHarness, buildMutant, buildTamper, checkCases, checkExpected, checkPlan, decide, evidenceLines, exitCode,
  ddicFromGetTable, extractRows, fingerprint, harnessNames, isRefusedTable, lintHarness, maskRows, maskValue, mutationCandidates, parseSelect, MASKING_RELEASE_PINNED, PERSONAL_DOMAIN, PERSONAL_DTEL, PERSONAL_EXACT, PRD_LOCKED, srcSha, tablesInSql,
} from '../../scripts/program-test/pt-lib.mjs';

const ROOT = join(__dirname, '..', '..');
const NS = 'mcp__plugin_sc4sap_sap__';
const mcp = (data: unknown, isError = false) => ({ isError, content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data) }] });
const tmp = mkdtempSync(join(tmpdir(), 'pt-test-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const MAIN = `REPORT zsc4sap_pt_demo LINE-SIZE 120.
INCLUDE zsc4sap_pt_demo_top.
INCLUDE zsc4sap_pt_demo_f01.
`;
const F01 = `FORM filter_open USING it_in TYPE tt_po CHANGING ct_out TYPE tt_po.
  LOOP AT it_in INTO DATA(ls).
    IF ls-menge > ls-wemng.
      APPEND ls TO ct_out.
    ENDIF.
  ENDLOOP.
ENDFORM.
`;
const CASES = {
  program: 'ZSC4SAP_PT_DEMO',
  cases: [
    { id: 'C01', method: 'C01_OPEN_ONLY', rule: 'spec 4.1 open = ordered > received', kind: 'positive', source: ['ZSC4SAP_PT_DEMO_F01:3'], tables: ['EKPO'], double: 'param' },
    { id: 'C02', method: 'C02_NONE_OPEN', rule: 'spec 4.1', kind: 'negative', source: ['ZSC4SAP_PT_DEMO_F01:3'], tables: ['EKPO'], double: 'param' },
    { id: 'C03', rule: 'spec 4.3 authority check', kind: 'negative', testable: false, not_testable_reason: 'AUTHORITY-CHECK cannot be doubled on this release' },
  ],
};
const EXPECTED = { cases: { C01: { basis: '2 of 3 rows have MENGE > WEMNG', values: [{ what: 'lines( lt_out )', value: 2 }] }, C02: { basis: 'all received', values: [{ what: 'lines( lt_out )', value: 0 }] } } };
const TEST_CLASS = `CLASS ltcl_pt DEFINITION FINAL FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.
  PRIVATE SECTION.
    METHODS c01_open_only FOR TESTING.
    METHODS c02_none_open FOR TESTING.
ENDCLASS.
CLASS ltcl_pt IMPLEMENTATION.
  METHOD c01_open_only.
    DATA lt_out TYPE tt_po.
    PERFORM filter_open USING VALUE tt_po( ( ebeln = '4500000001' menge = 10 wemng = 5 ) ) CHANGING lt_out.
    cl_abap_unit_assert=>assert_equals( act = lines( lt_out ) exp = 2 ).
  ENDMETHOD.
  METHOD c02_none_open.
    DATA lt_out TYPE tt_po.
    cl_abap_unit_assert=>assert_equals( act = lines( lt_out ) exp = 0 ).
  ENDMETHOD.
ENDCLASS.
`;
const PLAN = { source: 'dev', tables: [{ table: 'EKPO', fields: ['EBELN', 'EBELP', 'MENGE', 'WEMNG'], max_rows: 20, cases: ['C01', 'C02'] }] };

describe('masking', () => {
  it('masks personal fields deterministically and keeps others', () => {
    const { rows, masked, fingerprints } = maskRows([{ LIFNR: '0000100001', NAME1: 'Hong Gildong', TELF1: '0212345678', MENGE: '10' }, { LIFNR: '0000100002', NAME1: 'Hong Gildong' }], 's1');
    expect(rows[0].LIFNR).toBe('0000100001');
    expect(rows[0].MENGE).toBe('10');
    expect(rows[0].NAME1).not.toBe('Hong Gildong');
    expect(rows[0].NAME1).toBe(rows[1].NAME1);
    expect(rows[0].TELF1).toMatch(/^\d{10}$/);
    expect(masked).toEqual(['NAME1', 'TELF1']);
    expect(fingerprints).toContain(fingerprint('Hong Gildong', 's1'));
    expect(maskValue('19800101', 'GBDAT', 's')).toBe('19000101');
    expect(maskRows([{ ZZOWNER: 'Kim' }], 's', ['zzowner']).rows[0].ZZOWNER).not.toBe('Kim');
  });

  it('refuses personal / credential tables', () => {
    for (const t of ['PA0002', 'USR02', 'ADR6', 'LFBK', 'HRP1000', 'AGR_USERS']) expect(isRefusedTable(t)).toBe(true);
    for (const t of ['EKPO', 'VBAK', 'LFA1', 'MARA']) expect(isRefusedTable(t)).toBe(false);
  });

  it('reads rows from every table-read response shape', () => {
    expect(extractRows(JSON.stringify({ columns: ['A'], rows: [{ A: '1' }] }))?.rows).toEqual([{ A: '1' }]);
    expect(extractRows(JSON.stringify({ result: { table: 'T', rows: [{ A: '2' }] } }))?.rows).toEqual([{ A: '2' }]);
    expect(extractRows(JSON.stringify(JSON.stringify({ rows: [['x']], fields: [{ name: 'F' }] })))?.rows).toEqual([{ F: 'x' }]);
    expect(extractRows('not json')).toBeNull();
  });
});

describe('plan / cases / expected checks', () => {
  it('accepts a clean DEV plan and cases', () => {
    expect(checkPlan(PLAN, ['C01', 'C02', 'C03'])).toEqual([]);
    expect(checkCases(CASES)).toEqual([]);
    expect(checkExpected(CASES, EXPECTED)).toEqual([]);
  });

  it('rejects unsafe plans', () => {
    const p = checkPlan({ source: 'prd', tables: [{ table: 'USR02', fields: [], max_rows: 999, cases: [] }] });
    expect(p.join('\n')).toMatch(/needs the SM59 destination/);
    expect(p.join('\n')).toMatch(/USR02: personal/);
    expect(p.join('\n')).toMatch(/list the fields/);
    expect(p.join('\n')).toMatch(/max_rows 999/);
    expect(p.join('\n')).toMatch(/WHERE on key/);
    expect(checkPlan({ source: 'qa', destination: 'QAS', tables: [{ table: 'LFA1', fields: ['LIFNR', 'NAME1'], where: "LIFNR = '1'", cases: ['C01'] }] }).join()).toMatch(/personal_reason/);
  });

  it('rejects vacuous cases and expectations', () => {
    expect(checkCases({ cases: [{ id: 'C01', method: 'X', rule: 'r', kind: 'positive', double: 'osql' }] }).join()).toMatch(/must start with the case id/);
    expect(checkCases({ cases: [{ id: 'C01', method: 'C01_A', rule: 'r', kind: 'positive', double: 'osql' }] }).join()).toMatch(/no negative case/);
    expect(checkExpected(CASES, { cases: { C01: { basis: 'b', values: [] } } }).join()).toMatch(/C01: at least one concrete/);
  });
});

describe('harness', () => {
  it('names stay in the customer namespace and ≤ 30 chars', () => {
    const n = harnessNames('ZSC4SAP_PT_DEMO_WITH_A_LONG_NAME');
    for (const x of [n.harness, n.tamper, ...n.mutants]) expect(x.length).toBeLessThanOrEqual(30);
    expect(harnessNames('/ABC/PROG').harness).toMatch(/^ZPT_/);
  });

  it('builds the harness from the main program without copying includes', () => {
    const h = buildHarness(MAIN, 'ZSC4SAP_PT_DEMO_PT', TEST_CLASS);
    expect(h).toMatch(/^REPORT ZSC4SAP_PT_DEMO_PT LINE-SIZE 120\./);
    expect(h).toContain('INCLUDE zsc4sap_pt_demo_f01.');
    expect(h).toContain('ltcl_pt');
    expect(() => buildHarness('* nothing', 'X', '')).toThrow();
  });

  it('lint passes a sound test class and catches weak ones', () => {
    expect(lintHarness(TEST_CLASS, CASES, EXPECTED, PLAN)).toEqual([]);
    const noAssert = TEST_CLASS.replace('cl_abap_unit_assert=>assert_equals( act = lines( lt_out ) exp = 2 ).', '');
    expect(lintHarness(noAssert, CASES, EXPECTED, PLAN).join()).toMatch(/C01: no value assertion/);
    const wrongExp = TEST_CLASS.replace('exp = 2 )', 'exp = 3 )');
    expect(lintHarness(wrongExp, CASES, EXPECTED, PLAN).join()).toMatch(/expected value 2/);
    expect(lintHarness(TEST_CLASS.replace('RISK LEVEL HARMLESS', 'RISK LEVEL DANGEROUS') + 'COMMIT WORK.', CASES, EXPECTED, PLAN).join()).toMatch(/HARMLESS.*COMMIT WORK/);
    const osql = { cases: CASES.cases.map((c) => ({ ...c, double: c.double ? 'osql' : undefined })) };
    expect(lintHarness(TEST_CLASS, osql, EXPECTED, PLAN).join()).toMatch(/cl_osql_test_environment=>create.*EKPO is not in the osql dependency list/);
  });

  it('finds unmasked personal values that leaked into the test class', () => {
    const leaky = TEST_CLASS.replace("ebeln = '4500000001'", "ebeln = '4500000001' name1 = 'Hong Gildong'");
    expect(lintHarness(leaky, CASES, EXPECTED, PLAN, [fingerprint('Hong Gildong', 'salt')], 'salt').join()).toMatch(/1 unmasked personal value/);
  });

  it('abap-rows turns masked rows into a VALUE expression', () => {
    expect(abapRows([{ EBELN: '45', BEDAT: '2026-01-02', TXZ01: "it's" }], [])).toBe("VALUE #(\n    ( ebeln = '45' bedat = '20260102' txz01 = 'it''s' )\n  )");
  });
});

describe('mutants and tamper', () => {
  const H = buildHarness(MAIN, 'ZSC4SAP_PT_DEMO_PT', TEST_CLASS);
  const srcs = { ZSC4SAP_PT_DEMO_F01: F01 };

  it('mutates the condition line a case cites', () => {
    const c = mutationCandidates(srcs, ['ZSC4SAP_PT_DEMO_F01:3']);
    expect(c).toEqual([{ include: 'ZSC4SAP_PT_DEMO_F01', line: 3, before: 'IF ls-menge > ls-wemng.', after: 'IF ls-menge <= ls-wemng.' }]);
    const m = buildMutant(H, 'ZSC4SAP_PT_DEMO_M1', c[0], srcs, 'ZSC4SAP_PT_DEMO');
    expect(m).toMatch(/^REPORT ZSC4SAP_PT_DEMO_M1/);
    expect(m).toContain('IF ls-menge <= ls-wemng. " program-test mutant');
    expect(m).not.toContain('INCLUDE zsc4sap_pt_demo_f01.');
    expect(m).toContain('INCLUDE zsc4sap_pt_demo_top.');
    expect(mutationCandidates(srcs, ['ZSC4SAP_PT_DEMO_F01:1'])[0]?.line).toBe(3); // nearest condition ≤ 3 lines below
    expect(mutationCandidates(srcs, ['ZSC4SAP_PT_DEMO_F01:5', 'NOPE:1', 'bad'])).toEqual([]);
  });

  it('tamper flips one asserted expected value', () => {
    const t = buildTamper(H, 'ZSC4SAP_PT_DEMO_TX', CASES, EXPECTED);
    expect(t?.case).toBe('C01');
    expect(t?.source).toContain('exp = 3 )');
    expect(t?.source).toMatch(/^REPORT ZSC4SAP_PT_DEMO_TX/);
  });
});

// ── verdict from ledger lines ───────────────────────────────────────────

let clock = 0;
const at = () => new Date(Date.UTC(2026, 10, 17, 9, 0, clock++));
const led = (tool: string, input: unknown, resp?: unknown) => ledgerEntry({ tool_name: NS + tool, tool_input: input, tool_response: resp, session_id: 's' }, at());
const aunit = (prog: string, methods: Record<string, boolean>) => `<aunit:runResult xmlns:aunit="x" xmlns:adtcore="y"><program adtcore:name="${prog}"><testClasses><testClass adtcore:name="LTCL_PT"><testMethods>${Object.entries(methods)
  .map(([m, ok]) => (ok ? `<testMethod adtcore:name="${m}"/>` : `<testMethod adtcore:name="${m}"><alerts><alert kind="failedAssertion" severity="critical"><title>Assertion failed ${m}</title></alert></alerts></testMethod>`))
  .join('')}</testMethods></testClass></testClasses></program></aunit:runResult>`;
function uploadRun(name: string, src: string, methods: Record<string, boolean>) {
  return [
    led('CreateProgram', { program_name: name, package_name: '$TMP' }),
    led('UpdateProgram', { program_name: name, source_code: src.replace(/\n/g, '\r\n') + '\r\n' }),
    led('ActivateObjects', { objects: [{ name, type: 'PROG/P' }] }, mcp({ success: true, objects: [{ name, status: 'activated' }] })),
    led('RunUnitTest', { tests: [{ container_class: name, test_class: 'LTCL_PT', container_type: 'PROG' }] }, mcp({ success: true, run_id: 'legacy-sync', run_result: aunit(name, methods) })),
  ];
}

describe('verdict', () => {
  const H = buildHarness(MAIN, 'ZSC4SAP_PT_DEMO_PT', TEST_CLASS);
  const srcs = { ZSC4SAP_PT_DEMO_F01: F01 };
  const mut = mutationCandidates(srcs, ['ZSC4SAP_PT_DEMO_F01:3'])[0];
  const M1 = buildMutant(H, 'ZSC4SAP_PT_DEMO_M1', mut, srcs, 'ZSC4SAP_PT_DEMO');
  const TX = buildTamper(H, 'ZSC4SAP_PT_DEMO_TX', CASES, EXPECTED)!.source;
  const state = () => ({
    program: 'ZSC4SAP_PT_DEMO', source: 'dev', created_at: '2026-11-17T08:00:00.000Z', srcNames: ['ZSC4SAP_PT_DEMO', 'ZSC4SAP_PT_DEMO_F01'],
    frozen: { expected_sha: 'E1' }, plan_tables: ['EKPO'], rows: { EKPO: { count: 3, sources: ['dev'] } },
    harness: { name: 'ZSC4SAP_PT_DEMO_PT', sha: srcSha(H) },
    mutants: [{ name: 'ZSC4SAP_PT_DEMO_M1', include: mut.include, line: mut.line, sha: srcSha(M1) }],
    tamper: { name: 'ZSC4SAP_PT_DEMO_TX', sha: srcSha(TX), case: 'C01', method: 'C01_OPEN_ONLY' },
  });
  const good = () => [
    ...uploadRun('ZSC4SAP_PT_DEMO_PT', H, { C01_OPEN_ONLY: true, C02_NONE_OPEN: true }),
    ...uploadRun('ZSC4SAP_PT_DEMO_M1', M1, { C01_OPEN_ONLY: false, C02_NONE_OPEN: true }),
    ...uploadRun('ZSC4SAP_PT_DEMO_TX', TX, { C01_OPEN_ONLY: false, C02_NONE_OPEN: true }),
  ];

  it('per-method results and upload hashes reach the ledger', () => {
    expect(parseAunit(aunit('P', { A: true, B: false }))?.method_results).toEqual([{ name: 'A', failed: false }, { name: 'B', failed: true, alert: 'Assertion failed B' }]);
    expect(led('UpdateProgram', { program_name: 'P', source_code: 'a  \r\nb\r\n' })?.source_sha256).toBe(srcSha('a\nb'));
  });

  it('all green + mutant killed + tamper caught, one case not testable → PARTIAL with the share shown', () => {
    const r = decide(state(), CASES, 'E1', good());
    expect(r.verdict).toBe('PARTIAL');
    expect(r.counts).toMatchObject({ pass: 2, fail: 0, not_testable: 1, not_testable_share: 33 });
    expect(exitCode(r.verdict)).toBe(4);
    expect(evidenceLines(r, CASES, EXPECTED)).toMatch(/NOT TESTABLE 1 \(33%\)/);
  });

  it('PASS only when every case is testable', () => {
    const all = { cases: CASES.cases.filter((c) => c.testable !== false) };
    expect(decide(state(), all, 'E1', good()).verdict).toBe('PASS');
  });

  it('known-bad program: a failing case → PROGRAM_DEFECT', () => {
    const L = [...uploadRun('ZSC4SAP_PT_DEMO_PT', H, { C01_OPEN_ONLY: false, C02_NONE_OPEN: true }), ...good().slice(4)];
    const r = decide(state(), CASES, 'E1', L);
    expect(r.verdict).toBe('PROGRAM_DEFECT');
    expect(r.cases.find((c: { id: string }) => c.id === 'C01')).toMatchObject({ status: 'FAIL', why: 'Assertion failed C01_OPEN_ONLY' });
  });

  it('surviving mutant or missed tamper → TEST_WEAK', () => {
    const L = good();
    L.splice(4, 4, ...uploadRun('ZSC4SAP_PT_DEMO_M1', M1, { C01_OPEN_ONLY: true, C02_NONE_OPEN: true }));
    expect(decide(state(), CASES, 'E1', L).verdict).toBe('TEST_WEAK');
    // a mutant failing only a method that is already red on the real harness is not killed
    const L1 = [...uploadRun('ZSC4SAP_PT_DEMO_PT', H, { C01_OPEN_ONLY: true, C02_NONE_OPEN: false }), ...uploadRun('ZSC4SAP_PT_DEMO_M1', M1, { C01_OPEN_ONLY: true, C02_NONE_OPEN: false })];
    expect(decide(state(), CASES, 'E1', L1).mutants[0].status).toBe('SURVIVED');
    const L2 = good();
    L2.splice(8, 4, ...uploadRun('ZSC4SAP_PT_DEMO_TX', TX, { C01_OPEN_ONLY: true, C02_NONE_OPEN: true }));
    expect(decide(state(), CASES, 'E1', L2).verdict).toBe('TEST_WEAK');
  });

  it('expected changed, program changed, foreign rows → INVALID', () => {
    expect(decide(state(), CASES, 'E2', good()).verdict).toBe('INVALID');
    expect(decide(state(), CASES, 'E1', [...good(), led('UpdateInclude', { include_name: 'ZSC4SAP_PT_DEMO_F01', source_code: 'x' })]).verdict).toBe('INVALID');
    const s = state();
    s.rows.EKPO.sources = ['remote:PRD100'];
    expect(decide(s, CASES, 'E1', good()).verdict).toBe('INVALID');
  });

  it('a run between upload and activation (old active version) does not count', () => {
    const [create, update, activate, run] = uploadRun('ZSC4SAP_PT_DEMO_PT', H, { C01_OPEN_ONLY: true, C02_NONE_OPEN: true });
    const early = [create, update, { ...run, t: update!.t }, { ...activate, t: new Date(Date.UTC(2026, 10, 17, 9, 30)).toISOString() }];
    const r = decide(state(), CASES, 'E1', [...early, ...good().slice(4)]);
    expect(r.verdict).toBe('INCOMPLETE');
    expect(r.cases[0].why).toMatch(/no ABAP Unit result after its activation/);
  });

  it('edited upload, missing activation, empty double, no run → INCOMPLETE', () => {
    const L = good();
    L[1] = led('UpdateProgram', { program_name: 'ZSC4SAP_PT_DEMO_PT', source_code: H + '\n* edited' });
    expect(decide(state(), CASES, 'E1', L).verdict).toBe('INCOMPLETE');
    const s = state();
    s.rows = {};
    expect(decide(s, CASES, 'E1', good()).problems[0].text).toMatch(/EKPO: no rows captured/);
    expect(decide(state(), CASES, 'E1', []).verdict).toBe('INCOMPLETE');
  });
});

describe('capture hook side', () => {
  // ECC bridge shape of GetTable (DD03L rows) and the S/4 table source shape
  const KNA1_ECC = JSON.stringify({ success: true, table_name: 'KNA1', table_data: JSON.stringify({ fields: [
    { FIELDNAME: 'KUNNR', ROLLNAME: 'KUNNR', DOMNAME: 'KUNNR' },
    { FIELDNAME: 'NAME1', ROLLNAME: 'NAME1_GP', DOMNAME: 'NAME' },
    { FIELDNAME: 'LAND1', ROLLNAME: 'LAND1_GP', DOMNAME: 'LAND1' },
    { FIELDNAME: 'ZZCONTACT', ROLLNAME: 'ZZ_CONTACT', DOMNAME: 'AD_SMTPADR' },
  ] }) });
  const EKPO_S4 = JSON.stringify({ success: true, table_name: 'EKPO', table_data: 'define table ekpo {\n  key mandt : mandt not null;\n  key ebeln : ebeln not null;\n  key ebelp : ebelp not null;\n  menge : bstmg;\n  include zekpo_s;\n}' });

  function setupRun(name: string) {
    const root = join(tmp, name);
    const run = join(root, '.sc4sap', 'program', 'ZP', 'test', 'R1');
    mkdirSync(run, { recursive: true });
    writeFileSync(join(run, 'state.json'), JSON.stringify({ program: 'ZP', source: 'dev', salt: 'abc', mask_extra: [] }));
    mkdirSync(join(root, '.sc4sap', 'program-test'), { recursive: true });
    writeFileSync(activePath(root), JSON.stringify({ run_dir: run }));
    return { root, run };
  }
  const sqlResp = (cols: string[], rows: Record<string, string>[]) => JSON.stringify({ columns: cols.map((name) => ({ name })), rows });

  it('reads DDIC from both GetTable shapes', () => {
    expect(ddicFromGetTable(KNA1_ECC)).toMatchObject({ NAME1: { rollname: 'NAME1_GP', domname: 'NAME' }, ZZCONTACT: { domname: 'AD_SMTPADR' } });
    expect(Object.keys(ddicFromGetTable(EKPO_S4)!)).toEqual(['MANDT', 'EBELN', 'EBELP', 'MENGE']);
    expect(ddicFromGetTable('nothing')).toBeNull();
  });

  it('accepts SELECTs of the strict grammar only', () => {
    const a = parseSelect("SELECT kunnr, name1 AS n FROM kna1 AS a WHERE a~land1 = 'KR' AND ( kunnr IN ( '1', '2' ) OR erdat BETWEEN '20200101' AND '20201231' ) AND name2 IS NOT INITIAL UP TO 5 ROWS ORDER BY kunnr");
    expect(a.ok).toBe(true);
    expect([...a.columns]).toEqual([['KUNNR', 'KUNNR'], ['N', 'NAME1']]);
    expect(a.table).toBe('KNA1');
    expect(parseSelect('SELECT * FROM ekpo')).toMatchObject({ ok: true, star: true });
    expect(parseSelect('SELECT SINGLE kunnr name1 AS n FROM kna1')).toMatchObject({ ok: true });
    // a quote inside a literal is data, not syntax
    expect(parseSelect("SELECT kunnr FROM kna1 WHERE name1 = 'a'' UNION SELECT name1 FROM kna1 --'").ok).toBe(true);
    expect(tablesInSql('SELECT a~kunnr FROM kna1 AS a INNER JOIN usr02 AS b ON b~bname = a~ernam WHERE x IN ( SELECT y FROM pa0002 )')).toEqual(['KNA1', 'USR02', 'PA0002']);
  });

  // verifier repro (round 1b): UNION mapped only the first select list; now everything outside the grammar is refused
  it.each([
    ['UNION', 'SELECT kunnr, land1 FROM kna1 UNION SELECT kunnr, name1 FROM kna1'],
    ['INTERSECT', 'SELECT kunnr FROM kna1 INTERSECT SELECT kunnr FROM knvv'],
    ['EXCEPT', 'SELECT kunnr FROM kna1 EXCEPT SELECT kunnr FROM knvv'],
    ['sub-query', 'SELECT kunnr FROM kna1 WHERE kunnr IN ( SELECT kunnr FROM knvv )'],
    ['WITH / CTE', 'WITH +x AS ( SELECT kunnr, name1 AS land1 FROM kna1 ) SELECT * FROM +x'],
    ['JOIN', 'SELECT a~kunnr FROM kna1 AS a INNER JOIN knvv AS b ON b~kunnr = a~kunnr'],
    ['comma join', 'SELECT kunnr FROM kna1, knvv'],
    ['expression', 'SELECT kunnr, concat( name1, land1 ) AS full FROM kna1'],
    ['function in WHERE', "SELECT kunnr FROM kna1 WHERE upper( name1 ) = 'X'"],
    ['quote comment', 'SELECT kunnr "UNION SELECT name1\nFROM kna1'],
    ['star comment line', 'SELECT kunnr\n* FROM usr02\nFROM kna1'],
    ['dash comment', 'SELECT kunnr FROM kna1 -- x'],
    ['block comment', 'SELECT kunnr /* x */ FROM kna1'],
    ['semicolon', 'SELECT kunnr FROM kna1; SELECT name1 FROM kna1'],
    ['host variable', 'SELECT kunnr FROM kna1 WHERE kunnr = @lv_kunnr'],
    ['template', 'SELECT kunnr FROM kna1 WHERE name1 = |{ x }|'],
    ['unterminated literal', "SELECT kunnr FROM kna1 WHERE name1 = 'x"],
    ['GROUP BY', 'SELECT land1 FROM kna1 GROUP BY land1'],
    ['repeated output name', 'SELECT name1 AS a, land1 AS a FROM kna1'],
    ['repeated output name, other case', 'SELECT name1 AS land1, land1 FROM kna1'],
    ['repeated output name, mixed case', 'SELECT name1 AS a, land1 AS A FROM kna1'],
    ['repeated field', 'SELECT kunnr, kunnr FROM kna1'],
    ['star plus named column', 'SELECT *, name1 AS land1 FROM kna1'],
  ])('refuses %s', (_kind, sql) => {
    expect(parseSelect(sql).ok).toBe(false);
  });

  it('saves nothing outside an active run, and nothing the server did not mask', () => {
    const root = join(tmp, 'idle');
    mkdirSync(root, { recursive: true });
    expect(capture(root, 'GetTableContents', { table_name: 'lfa1' }, JSON.stringify({ rows: [{ LIFNR: '1' }] }), false)).toBeNull();
    const { root: r2, run } = setupRun('unmasked');
    // an older MCP server ignores `mask`: the raw answer is never saved, for any source
    expect(capture(r2, 'GetSqlQuery', { sql_query: 'SELECT kunnr, name1 FROM kna1', mask: { salt: 'abc' } }, sqlResp(['KUNNR', 'NAME1'], [{ KUNNR: '1', NAME1: 'Real Person' }]), false)).toMatchObject({ error: expect.stringMatching(/without server masking/) });
    expect(existsSync(join(run, 'rows'))).toBe(false);
    expect(readFileSync(join(run, 'capture.jsonl'), 'utf-8')).not.toMatch(/Real Person/);
  });

  // the masking rules (the MCP server runs the same code, asserted by the shared vectors)
  it('masks by name, data element / domain, and default-denies unmapped columns', () => {
    const ddic = ddicFromGetTable(KNA1_ECC)!;
    const { rows, masked, fingerprints } = maskRows(
      [{ KUNNR: '0000001', NAME1: 'Real Person', LAND1: 'KR', ZZCONTACT: 'me@example.com', ZZOTHER: 'free text' }], 'abc', [], { ddic },
    );
    expect(masked).toEqual(['NAME1', 'ZZCONTACT', 'ZZOTHER']);
    expect(rows[0]).toMatchObject({ KUNNR: '0000001', LAND1: 'KR' });
    expect(JSON.stringify(rows)).not.toMatch(/Real Person|me@example|free text/);
    expect(fingerprints).toContain(fingerprint('Real Person', 'abc'));
    // the capture keeps a server-masked answer as it came, for this run's salt
    const { root, run } = setupRun('server-masked');
    const answer = JSON.stringify({ rows, masking: { version: 'hmac-v1', default_deny: true, masked_columns: masked } });
    expect(capture(root, 'GetSqlQuery', { sql_query: 'SELECT kunnr, name1, land1, zzcontact, zzother FROM kna1', mask: { salt: 'abc' } }, answer, false))
      .toMatchObject({ kind: 'data', table: 'KNA1', source: 'dev', count: 1, masked: ['NAME1', 'ZZCONTACT', 'ZZOTHER'], server_masked: true });
    expect(JSON.parse(readFileSync(join(run, 'rows', 'KNA1.json'), 'utf-8')).rows).toEqual(rows);
    expect(existsSync(join(run, 'fingerprints.json'))).toBe(false);
  });

  // verifier repro 1: alias / computed column saved unmasked
  it('masks aliased columns by their source field, saves nothing for computed or UNION SELECTs', () => {
    const ddic = ddicFromGetTable(KNA1_ECC)!;
    const sel = parseSelect('SELECT kunnr, name1 AS n, land1 AS country FROM kna1');
    const out = maskRows([{ KUNNR: '1', N: 'Hong Gildong', COUNTRY: 'KR' }], 'abc', [], { ddic, columns: sel.columns, star: sel.star });
    expect(JSON.stringify(out.rows)).not.toMatch(/Hong Gildong/);
    expect(out.masked).toEqual(['N']);
    expect(out.rows[0].COUNTRY).toBe('KR');
    const { root, run } = setupRun('alias');
    const masked = JSON.stringify({ rows: [{ KUNNR: '2', LAND1: 'MXX' }], masking: { version: 'hmac-v1', default_deny: true, masked_columns: ['LAND1'] } });
    for (const sql of ['SELECT kunnr, concat( name1, land1 ) AS full FROM kna1', 'SELECT kunnr, land1 FROM kna1 UNION SELECT kunnr, name1 FROM kna1']) {
      expect(capture(root, 'GetSqlQuery', { sql_query: sql, mask: { salt: 'abc' } }, masked, false)).toMatchObject({ error: expect.stringMatching(/SELECT not saved/) });
    }
    expect(existsSync(join(run, 'rows'))).toBe(false);
  });

  // verifier repro 2: array rows without column names → COLn keys, nothing masked
  it('refuses array rows with unnamed columns', () => {
    expect(extractRows(JSON.stringify({ rows: [['1', 'Hong Gildong', '010-1234-5678']] }))).toBeNull();
    expect(extractRows(JSON.stringify({ columns: ['KUNNR'], rows: [['1', 'Hong Gildong']] }))).toBeNull();
    const { root, run } = setupRun('unnamed');
    capture(root, 'GetTable', { table_name: 'KNA1' }, KNA1_ECC, false);
    expect(capture(root, 'GetTableContents', { table_name: 'KNA1' }, JSON.stringify({ rows: [['1', 'Hong Gildong']] }), false)).toMatchObject({ error: expect.stringMatching(/not parsed/) });
    expect(existsSync(join(run, 'rows'))).toBe(false);
  });

  // verifier repro 3: personal / credential tables were saved at capture
  it('discards rows of personal / credential tables and of joins at capture', () => {
    const { root, run } = setupRun('refused');
    for (const [tool, input] of [
      ['GetSqlQuery', { sql_query: 'SELECT pernr, nachn FROM pa0002' }],
      ['GetSqlQuery', { sql_query: 'SELECT a~kunnr, b~bname FROM kna1 AS a INNER JOIN usr02 AS b ON b~bname = a~ernam' }],
      ['GetRemoteTableContents', { table_name: 'ADR6', destination: 'QAS100' }],
      ['GetTableContents', { table_name: 'usr02' }],
    ] as const) {
      expect(capture(root, tool, input, sqlResp(['X'], [{ X: 'secret' }]), false)).toMatchObject({ refused: expect.any(Array) });
    }
    capture(root, 'GetTable', { table_name: 'KNA1' }, KNA1_ECC, false);
    expect(capture(root, 'GetSqlQuery', { sql_query: 'SELECT a~kunnr FROM kna1 AS a INNER JOIN knvv AS b ON b~kunnr = a~kunnr' }, sqlResp(['KUNNR'], [{ KUNNR: '1' }]), false)).toMatchObject({ error: expect.stringMatching(/SELECT not saved/) });
    expect(existsSync(join(run, 'rows'))).toBe(false);
    expect(readFileSync(join(run, 'capture.jsonl'), 'utf-8')).not.toMatch(/secret/);
  });

  it('saves the source of a GetInclude and logs errors', () => {
    const { root, run } = setupRun('src');
    capture(root, 'GetInclude', { include_name: 'zp_f01' }, F01, false);
    expect(readFileSync(join(run, 'src', 'ZP_F01.abap'), 'utf-8')).toBe(F01);
    expect(capture(root, 'GetRemoteTableContents', { table_name: 'EKPO', destination: 'X' }, 'ADT error', true)).toMatchObject({ error: true });
  });
});

describe('guard and CLI', () => {
  const PT = join(ROOT, 'scripts', 'program-test', 'pt.mjs');
  it('guard protects run files but not the agent inputs', () => {
    const w = (p: string) => guard({ tool_name: 'Write', tool_input: { file_path: p } });
    const base = 'C:/p/.sc4sap/program/ZP/test/20261117-0900/';
    for (const f of ['state.json', 'rows/EKPO.json', 'src/ZP.abap', 'ddic/EKPO.json', 'harness/ZP_PT.abap', 'pt-receipt.json', 'fingerprints.json']) expect(w(base + f)).toBeTruthy();
    expect(w('C:/p/.sc4sap/program-test/active.json')).toBeTruthy();
    expect(w('C:/p/.sc4sap/work/DEV-1/program/ZP/test/R1/rows/EKPO.json')).toBeTruthy();
    expect(w('C:/p/.sc4sap/work/DEV-1/program/ZP/test/R1/expected.json')).toBeNull();
    for (const f of ['cases.json', 'expected.json', 'plan.json', 'test-class.abap']) expect(w(base + f)).toBeNull();
    // a run under another base folder (pt.mjs init --base, e.g. a web run's output folder)
    const web = 'C:/ws/.sc4sap/out/3f2a/program/ZP/test/20261117-093000/';
    for (const f of ['state.json', 'rows/EKPO.json', 'src/ZP.abap', 'ddic/EKPO.json', 'harness/ZP_PT.abap', 'pt-receipt.json', 'capture.jsonl']) expect(w(web + f)).toBeTruthy();
    for (const f of ['cases.json', 'expected.json', 'plan.json', 'test-class.abap']) expect(w(web + f)).toBeNull();
    expect(guard({ tool_name: 'Bash', tool_input: { command: `echo x > ${base}state.json` } })).toBeTruthy();
  });

  it('guard keeps the MCP masking key away from the model', () => {
    const home = join(tmp, 'sc4sap-home');
    const prev = process.env.SC4SAP_HOME_DIR;
    process.env.SC4SAP_HOME_DIR = home;
    try {
      const key = join(home, 'profiles', 'S4-DEV', 'mask.key');
      const g = (tool_name: string, tool_input: Record<string, unknown>, cwd = 'C:/p') => guard({ tool_name, tool_input, cwd });
      // any tool naming the key file
      for (const [tool, input] of [
        ['Read', { file_path: key }],
        ['Read', { file_path: 'C:/Users/x/.sc4sap/mask.key' }],
        ['Grep', { pattern: 'x', path: key }],
        ['Grep', { pattern: '.', glob: '**/mask.key', path: 'C:/p' }],
        ['Bash', { command: `cat ${key}` }],
        ['Bash', { command: 'type %USERPROFILE%\\.sc4sap\\profiles\\S4-DEV\\Mask.KEY' }],
        ['PowerShell', { command: `Get-Content ${key}` }],
        ['Write', { file_path: key, content: 'x' }],
      ] as const) expect(g(tool, input as Record<string, unknown>), `${tool} ${JSON.stringify(input)}`).toMatch(/masking key/);
      // a grep whose search root holds the profile folders, or sits inside one
      for (const path of [home, join(home, 'profiles'), join(home, 'profiles', 'S4-DEV'), join(home, '..')]) expect(g('Grep', { pattern: '[0-9a-f]{64}', path })).toMatch(/masking key/);
      // shell reads of the sc4sap home with a wildcard or recursion
      for (const command of [
        'cat ~/.sc4sap/profiles/S4-DEV/*',
        'grep -r . ~/.sc4sap',
        'Get-ChildItem -Recurse $env:USERPROFILE\\.sc4sap | Get-Content',
        'tar czf /tmp/x.tgz ~/.sc4sap',
        'cp -r ~/.sc4sap/profiles/S4-DEV /tmp/p',
        'ls $SC4SAP_HOME_DIR/profiles/S4-DEV/?ask*',
      ]) expect(g('Bash', { command }), command).toMatch(/masking key/);
      // still allowed: the profile's own files by name, moving / deleting a profile, project greps
      expect(g('Read', { file_path: join(home, 'profiles', 'S4-DEV', 'config.json') })).toBeNull();
      expect(g('Read', { file_path: join(home, 'profiles', 'S4-DEV', 'sap.env') })).toBeNull();
      expect(g('Bash', { command: 'cat ~/.sc4sap/profiles/S4-DEV/config.json' })).toBeNull();
      expect(g('Bash', { command: 'rm -rf ~/.sc4sap/profiles/OLD-DEV' })).toBeNull();
      expect(g('Bash', { command: 'mv ~/.sc4sap/profiles/OLD-DEV ~/.sc4sap/profiles/.trash/OLD-DEV-1' })).toBeNull();
      expect(g('Grep', { pattern: 'mask', path: 'C:/p/src' })).toBeNull();
      expect(g('Grep', { pattern: 'x' }, 'C:/p')).toBeNull();
      expect(g('Bash', { command: 'grep -r foo src' })).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.SC4SAP_HOME_DIR;
      else process.env.SC4SAP_HOME_DIR = prev;
    }
  });

  it('guard lets only the plugin\'s own pt.mjs write run files', () => {
    // the commands name a protected file, so only the pt.mjs exception can let them through
    const base = 'C:/p/.sc4sap/program/ZP/test/20261117-0900/state.json';
    const sh = (command: string, cwd?: string) => guard({ tool_name: 'Bash', tool_input: { command }, cwd });
    expect(sh(`node "${PT}" verdict --run ${base}`)).toBeNull();
    expect(sh(`node ${PT.replace(/\\/g, '/')} freeze --run ${base}`)).toBeNull();
    expect(sh(`node scripts/program-test/pt.mjs verdict --run ${base}`, ROOT)).toBeNull();
    expect(onlyPluginPt(`node C:/tmp/evil/program-test/pt.mjs verdict --run ${base}`, ROOT)).toBe(false);
    expect(sh(`node C:/tmp/evil/program-test/pt.mjs verdict --run ${base}`)).toBeTruthy();
    expect(sh(`node "${PT}" verdict --run ${base} && echo x > ${base}/state.json`)).toBeTruthy();
  });

  it('init refuses QA without a destination and explains the SM59 setup', () => {
    const root = join(tmp, 'cli');
    mkdirSync(join(root, '.sc4sap'), { recursive: true });
    writeFileSync(join(root, '.sc4sap', 'config.json'), JSON.stringify({ sapVersion: 'ECC' }));
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt.mjs'), 'init', 'ZP', '--source', 'qa', '--root', root], { encoding: 'utf-8', env: { ...process.env, SC4SAP_HOME_DIR: join(tmp, 'home') } });
    expect(r.status).toBe(5);
    expect(r.stderr).toMatch(/SM59/);
    // production: locked until the masking MCP release is pinned and installed (MASKING_RELEASE_PINNED)
    writeFileSync(join(root, '.sc4sap', 'config.json'), JSON.stringify({ sapVersion: 'ECC', testDataSources: { prd: 'PRD100' } }));
    const prd = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt.mjs'), 'init', 'ZP', '--source', 'prd', '--root', root], { encoding: 'utf-8', env: { ...process.env, SC4SAP_HOME_DIR: join(tmp, 'home') } });
    expect(MASKING_RELEASE_PINNED).toBe(false);
    expect(prd.status).toBe(7);
    expect(prd.stderr.trim()).toBe(PRD_LOCKED);
    expect(checkPlan({ source: 'prd', destination: 'PRD100', tables: [{ table: 'EKPO', fields: ['EBELN'], where: "EBELN = '1'", cases: ['C01'] }] })).toEqual([PRD_LOCKED]);
    expect(checkPlan({ source: 'prd', destination: 'PRD100', tables: [{ table: 'EKPO', fields: ['EBELN'], cases: ['C01'] }] }).join()).toMatch(/WHERE on key/);
    const ok = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt.mjs'), 'init', 'ZP', '--source', 'dev', '--root', root], { encoding: 'utf-8', env: { ...process.env, SC4SAP_HOME_DIR: join(tmp, 'home') } });
    expect(ok.status).toBe(0);
    expect(existsSync(activePath(root))).toBe(true);
    expect(JSON.parse(ok.stdout).harness).toBe('ZP_PT');
    // --program / --base: the run folder goes under the named base (a web run's own folder)
    const base = join(tmp, 'web-out', 'S1');
    const viaBase = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt.mjs'), 'init', '--program', 'zp2', '--source', 'dev', '--base', base, '--root', root], { encoding: 'utf-8', env: { ...process.env, SC4SAP_HOME_DIR: join(tmp, 'home') } });
    expect(viaBase.status).toBe(0);
    const runDir = JSON.parse(viaBase.stdout).run as string;
    expect(runDir.replace(/\\/g, '/')).toMatch(new RegExp(`${base.replace(/\\/g, '/')}/program/ZP2/test/\\d{8}-\\d{6}$`));
    expect(existsSync(join(runDir, 'state.json'))).toBe(true);
    const bad = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt.mjs'), 'init', '--program', 'ABC;rm', '--root', root], { encoding: 'utf-8' });
    expect(bad.status).toBe(3);
  });
});

describe('server-side masking (MCP mask argument)', () => {
  const V = JSON.parse(readFileSync(join(ROOT, 'tests', 'validation', 'fixtures', 'mask-vectors.json'), 'utf-8'));

  it('pt-lib follows the shared masking rules the MCP server asserts too', () => {
    expect([...PERSONAL_EXACT].sort()).toEqual(V.lists.exact);
    expect([...PERSONAL_DTEL].sort()).toEqual(V.lists.dtel);
    expect([...PERSONAL_DOMAIN].sort()).toEqual(V.lists.domain);
    for (const c of V.refused_tables) expect(isRefusedTable(c.table)).toBe(c.refused);
    for (const c of V.strict_select) {
      const r = parseSelect(c.sql);
      expect(r.ok).toBe(c.ok);
      if (r.ok) expect([...r.columns]).toEqual(c.columns);
    }
    const sel = parseSelect(V.mask_rows_select.sql);
    expect(maskRows(V.mask_rows_select.rows, V.salt, V.mask_rows_select.extra, { ddic: V.ddic, columns: sel.columns, star: sel.star }).masked).toEqual(V.mask_rows_select.expected_masked);
    expect(maskRows(V.mask_rows_plain.rows, V.salt, [], { ddic: V.ddic }).masked).toEqual(V.mask_rows_plain.expected_masked);
    // tokens are the server's (HMAC with its own key): not in the shared vectors
    expect(Object.keys(V)).not.toContain('mask_value');
  });

  function run(name: string, source = 'dev', extra: string[] = []) {
    const root = join(tmp, name);
    const runDir = join(root, '.sc4sap', 'program', 'ZP', 'test', 'R1');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'state.json'), JSON.stringify({ program: 'ZP', source, destination: source === 'dev' ? null : 'PRD100', salt: SALT, mask_extra: extra }));
    mkdirSync(join(root, '.sc4sap', 'program-test'), { recursive: true });
    writeFileSync(activePath(root), JSON.stringify({ run_dir: runDir }));
    return { root, runDir };
  }
  const SALT = '0123456789abcdef0123456789abcdef';
  const sap = (tool: string, input: unknown, cwd: string) => ({ tool_name: `mcp__plugin_sc4sap_sap__${tool}`, tool_input: input, cwd });
  const masked = (rows: Record<string, string>[], cols: string[], version = 'hmac-v1') => JSON.stringify({ table: 'X', rows, masking: { version, default_deny: true, masked_columns: cols, ddic_fields: 3 } });

  it('the read gate: no run → allow; run → the run\'s mask is required', () => {
    expect(gate(sap('GetSqlQuery', { sql_query: 'SELECT kunnr FROM kna1' }, join(tmp, 'nothing-here')))).toBeNull();
    const { root } = run('gate-dev', 'dev', ['ZZNOTE']);
    expect(gate(sap('GetSqlQuery', { sql_query: 'SELECT kunnr FROM kna1' }, root))).toMatch(/must be masked by the MCP server/);
    expect(gate(sap('GetTableContents', { table_name: 'KNA1', mask: { salt: 'ffff' } }, root))).toMatch(/pass mask/);
    expect(gate(sap('GetTableContents', { table_name: 'KNA1', mask: { salt: SALT } }, root))).toMatch(/lacks ZZNOTE/);
    expect(gate(sap('GetTableContents', { table_name: 'KNA1', mask: { salt: SALT, extra_fields: ['zznote'] } }, root))).toBeNull();
    expect(gate(sap('GetProgram', { program_name: 'ZP' }, root))).toBeNull();
    expect(gate({ tool_name: 'Bash', tool_input: {}, cwd: root })).toBeNull();
  });

  it('the gate fails closed inside a run', () => {
    const { root, runDir } = run('gate-closed', 'dev');
    const read = sap('GetTableContents', { table_name: 'KNA1', mask: { salt: SALT } }, root);
    expect(gate(read)).toBeNull();
    writeFileSync(join(runDir, 'state.json'), '{ broken');
    expect(gate(read)).toMatch(/state unreadable/);
    writeFileSync(activePath(root), 'not json');
    expect(gate(read)).toMatch(/marker unreadable/);
    // the hook process: a payload it cannot decide on inside a run is denied, not allowed
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt-gate.mjs')], { input: JSON.stringify(read), encoding: 'utf-8' });
    expect(JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('production reads wait for proof that the server masks', () => {
    const { root, runDir } = run('gate-prd', 'prd');
    const read = sap('GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100', mask: { salt: SALT } }, root);
    expect(gate(read)).toMatch(/need proof that the MCP server masks/);
    // an old server ignores `mask`: the probe comes back unmasked → still no proof
    capture(root, 'GetSqlQuery', { sql_query: 'SELECT mandt FROM t000', mask: { salt: SALT } }, JSON.stringify({ rows: [{ MANDT: '100' }] }), false);
    expect(serverMaskingProven(runDir)).toBe(false);
    expect(gate(read)).toMatch(/need proof/);
    // a masked probe proves it
    capture(root, 'GetSqlQuery', { sql_query: 'SELECT mandt FROM t000', mask: { salt: SALT } }, masked([{ MANDT: '100' }], []), false);
    expect(serverMaskingProven(runDir)).toBe(true);
    expect(gate(read)).toBeNull();
  });

  it('capture keeps server-masked rows as they came, for this salt only; production rows must be server-masked', () => {
    const { root, runDir } = run('cap-prd', 'prd');
    expect(capture(root, 'GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100' }, JSON.stringify({ rows: [{ EBELN: '45', ERNAM: 'REALUSER' }] }), false)).toMatchObject({ error: expect.stringMatching(/without server masking/) });
    expect(existsSync(join(runDir, 'rows', 'EKPO.json'))).toBe(false);
    expect(capture(root, 'GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100' }, masked([{ EBELN: '45', ERNAM: 'MAB12' }], ['ERNAM'], 'sha-v0'), false)).toMatchObject({ error: expect.stringMatching(/without server masking/) });
    const ok = capture(root, 'GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100' }, masked([{ EBELN: '45', ERNAM: 'MAB12' }], ['ERNAM']), false);
    expect(ok).toMatchObject({ kind: 'data', table: 'EKPO', source: 'prd', count: 1, masked: ['ERNAM'], server_masked: true, mask_version: 'hmac-v1' });
    const saved = JSON.parse(readFileSync(join(runDir, 'rows', 'EKPO.json'), 'utf-8'));
    expect(saved.rows).toEqual([{ EBELN: '45', ERNAM: 'MAB12' }]);
    expect(existsSync(join(runDir, 'fingerprints.json'))).toBe(false);
    // the strict SELECT grammar still applies to server-masked answers
    expect(capture(root, 'GetSqlQuery', { sql_query: 'SELECT ebeln FROM ekpo UNION SELECT ernam FROM ekpo' }, masked([{ EBELN: 'x' }], []), false)).toMatchObject({ error: expect.stringMatching(/SELECT not saved/) });
  });
});
