import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ledgerEntry, parseAunit } from '../../scripts/evidence/lib.mjs';
import { decide as guard, onlyPluginPt, allowListedCommand } from '../../scripts/evidence/guard.mjs';
import { activePath, capture } from '../../scripts/program-test/pt-capture.mjs';
import { gate, serverMaskingProven } from '../../scripts/program-test/pt-gate.mjs';
import {
  abapRows, buildHarness, buildMutant, buildTamper, checkCases, checkExpected, checkPlan, decide, evidenceLines, exitCode,
  ddicFromGetTable, extractRows, fingerprint, harnessNames, isRefusedTable, lintHarness, maskRows, maskValue, mutationCandidates, parseSelect, MASKING_RELEASE_PINNED, CLEAR_DATATYPES, CLEAR_DDIC, isClearField, isPersonalField, MASK_VERSIONS, PERSONAL_DDIC_PATTERNS, PERSONAL_DOMAIN, PERSONAL_DTEL, PERSONAL_EXACT, PERSONAL_NAME_PATTERNS, PRD_LOCKED, srcSha, tablesInSql,
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
    const { rows, masked, fingerprints } = maskRows([{ LIFNR: '0000100001', NAME1: 'Hong Gildong', TELF1: '0212345678', MENGE: '10' }, { LIFNR: '0000100002', NAME1: 'Hong Gildong' }], 's1', [], { ddic: { LIFNR: { rollname: 'LIFNR', domname: 'LIFNR' }, NAME1: { rollname: 'NAME1_GP', domname: 'NAME' }, TELF1: { rollname: 'TELF1', domname: 'TELF1' }, MENGE: { rollname: 'BSTMG', domname: 'MENG13', datatype: 'QUAN' } } });
    expect(rows[0].LIFNR).toBe('0000100001');
    expect(rows[0].MENGE).toBe('10');
    expect(rows[0].NAME1).not.toBe('Hong Gildong');
    expect(rows[0].NAME1).toBe(rows[1].NAME1);
    expect(rows[0].TELF1).toMatch(/^\d{10}$/);
    expect(masked).toEqual(['NAME1', 'TELF1']);
    expect(fingerprints).toContain(fingerprint('Hong Gildong', 's1'));
    expect(maskValue('19800101', 'GBDAT', 's')).toBe('19000101');
    expect(maskRows([{ ZZOWNER: 'Kim' }], 's', ['zzowner']).rows[0].ZZOWNER).not.toBe('Kim');
    // without the table's DDIC nothing is known to be clear
    expect(maskRows([{ LIFNR: '1', MENGE: '10' }], 's').masked).toEqual(['LIFNR', 'MENGE']);
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
    const answer = JSON.stringify({ rows, masking: { version: 'hmac-v2', default_deny: true, masked_columns: masked } });
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
    const masked = JSON.stringify({ rows: [{ KUNNR: '2', LAND1: 'MXX' }], masking: { version: 'hmac-v2', default_deny: true, masked_columns: ['LAND1'] } });
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
      // the single file the Grep refusal points to (Windows backslashes too)
      expect(g('Grep', { pattern: 'abapRelease|sapVersion', path: join(home, 'profiles', 'S4-DEV', 'config.json') })).toBeNull();
      expect(g('Grep', { pattern: 'SAP_URL', path: join(home, 'profiles', 'S4-DEV', 'sap.env').replace(/\//g, '\\') })).toBeNull();
      // but not another file of the profile, nor a config.json deeper down
      expect(g('Grep', { pattern: 'x', path: join(home, 'profiles', 'S4-DEV', 'other.json') })).toMatch(/masking key/);
      expect(g('Grep', { pattern: 'x', path: join(home, 'profiles', 'S4-DEV', 'sub', 'config.json') })).toMatch(/masking key/);
      expect(g('Grep', { pattern: 'mask', path: 'C:/p/src' })).toBeNull();
      expect(g('Grep', { pattern: 'x' }, 'C:/p')).toBeNull();
      expect(g('Bash', { command: 'grep -r foo src' })).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.SC4SAP_HOME_DIR;
      else process.env.SC4SAP_HOME_DIR = prev;
    }
  });

  // verifier-3's U1 probes: quoting / globs / variables / concatenation / interpreters / cwd
  it('guard holds against key-name tricks, interpreters and a shell sitting in a profile folder', () => {
    const home = join(tmp, 'sc4sap-home-u2');
    const prev = process.env.SC4SAP_HOME_DIR;
    process.env.SC4SAP_HOME_DIR = home;
    try {
      const P = join(home, 'profiles', 'S4-DEV').replace(/\\/g, '/');
      const sh = (command: string, tool = 'Bash', cwd = 'C:/p') => guard({ tool_name: tool, tool_input: { command }, cwd });
      for (const [command, tool] of [
        [`cat ${P}/mask.ke[y]`, 'Bash'],
        [`cat ${P}/mas"k".key`, 'Bash'],
        [`cat ${P}/mas''k.key`, 'Bash'],
        [`cat ${P}/mas\\k.key`, 'Bash'],
        [`f=mask; cat ${P}/$f.key`, 'Bash'],
        [`node -e "require('fs').readFileSync(require('os').homedir()+'/.sc4'+'sap/profiles/S4-DEV/mas'+'k.key')"`, 'Bash'],
        [`python -c "print(open(__import__('os').path.expanduser('~/.sc4sap/profiles/S4-DEV/x')).read())"`, 'Bash'],
        [`bash -c 'cat ~/.sc4sap/profiles/S4-DEV/x'`, 'Bash'],
        [`cd ${P}/`, 'Bash'],
        [`pushd ~/.sc4sap`, 'Bash'],
        ['cat mas""k.key', 'Bash'],
        [`Get-Content (Join-Path $env:USERPROFILE ("mask"+".key"))`, 'PowerShell'],
        ['powershell -EncodedCommand ZQBjAGgAbwA=', 'PowerShell'],
        ['Set-Location ~/.sc4sap/profiles/S4-DEV', 'PowerShell'],
        [`cat ${P}/config.json && cat ${P}/x`, 'Bash'],
        [`cat ${P}/other.txt`, 'Bash'],
      ] as const) expect(sh(command, tool), command).toMatch(/masking key/);
      // a shell whose working directory is already a profile folder: nothing goes through
      expect(sh('cat x', 'Bash', P)).toMatch(/leave the profile folder/);
      // still allowed
      for (const command of [`cat ${P}/config.json`, `cat ${P}/sap.env`, 'rm -rf ~/.sc4sap/profiles/OLD', 'mkdir -p ~/.sc4sap/profiles/NEW', 'npm test', 'node scripts/x.mjs --dir src', 'node -e "console.log(1)"'])
        expect(sh(command), command).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.SC4SAP_HOME_DIR;
      else process.env.SC4SAP_HOME_DIR = prev;
    }
  });

  // 2026-11-23 follow-up of PR #64: the gaps HEAD already had (globs, 8.3 names, recursive reads, links, variables)
  it('guard refuses globs, 8.3 names, recursive reads and links that reach the sc4sap home', () => {
    // a path only (nothing is created): it must sit under the user's home on every OS
    const home = join(homedir(), '.sc4sap-test-gaps').replace(/\\/g, '/');
    const prev = process.env.SC4SAP_HOME_DIR;
    process.env.SC4SAP_HOME_DIR = home;
    try {
      const U = homedir().replace(/\\/g, '/');
      const sh = (command: string, tool = 'Bash') => guard({ tool_name: tool, tool_input: { command }, cwd: 'C:/p' });
      for (const command of [
        `cat ${home.replace(/test-gaps$/, 'test-gap?')}/pr?files/*/m?sk.k?y`,
        `cat ${home}/p*/*/m*`,
        'cat /tmp/h/.sc4sa?/pr?files/*/*',
        'cat x/profiles/*/*.key',
        `cat ${home}/PROFIL~1/S4-DEV/MASK~1.KEY`,
        'type C:\\Users\\x\\SC4SAP~1\\PROFIL~1\\S4-DEV\\sap.env',
        'find ~ -type f | xargs cat',
        'cp -a ~ /tmp/h',
        'rsync -a ~/ /tmp/h',
        '7z a /tmp/h.7z ~',
        'grep -r . ~',
        'rg . ~',
        'find / -name "*.key"',
        `robocopy ${U} C:\\tmp\\h /E`,
        'Get-ChildItem -Recurse $env:USERPROFILE | Get-Content',
        'ln -s ~ /tmp/h',
        'mklink /J C:\\tmp\\h %USERPROFILE%',
        'subst X: %USERPROFILE%',
        'New-PSDrive -Name H -PSProvider FileSystem -Root $env:USERPROFILE',
        'cat ${SC4SAP_HOME_DIR}/profiles/*/*',
        'node -e "require(\'fs\').readdirSync(process.env.HOME)"',
        // verifier round 2: braces, split variables, joins, ~user, other home variables, long flags, .NET calls
        `cat ${home}/pro{f,}iles/S4-DEV/ma{s,}k.key`,
        `a=pro; b=files; cat ${home}/$a$b/S4-DEV/x`,
        'x=.sc4; cat ~/${x}sap/profiles/S4-DEV/y',
        `$d=('.sc4','sap') -join ''; gc "$HOME\\$d\\profiles\\S4-DEV\\x"`,
        `find ~${U.split('/').pop()} -name '*.key' -exec cat {} +`,
        "find $HOMEDRIVE$HOMEPATH -name '*.key' -exec cat {} +",
        'find "$APPDATA/../.." -name "*.key" -exec cat {} +',
        'grep --recursive "" ~',
        'du --all ~ | xargs cat',
        'Get-ChildItem $HOME -Depth 9 -Include *.key | Get-Content',
        "[IO.Directory]::EnumerateFiles($HOME,'*.key','AllDirectories') | % { gc $_ }",
        'gci (Split-Path (Split-Path (Split-Path $PROFILE))) -Recurse | gc',
        // the home held in a variable first, or a cd ending in `;`
        'h=~; x=.sc4; cat $h/${x}sap/profiles/S4-DEV/y',
        `h=${home}; p=pro; cat $h/\${p}files/S4-DEV/x`,
        'h=$HOME; cat $h/$d/$p/S4-DEV/$k',
        'cd ~; cat $d/$p/S4-DEV/$k',
        // an admin share maps to a drive only on Windows
        ...(process.platform === 'win32' ? [`cat //localhost/${U[0].toLowerCase()}$${U.slice(2)}/*/*/*/*`] : []),
      ]) expect(sh(command), command).toMatch(/masking key/);
      // Grep through \\?\ or an admin share
      expect(guard({ tool_name: 'Grep', tool_input: { pattern: '.', path: `\\\\?\\${U.replace(/\//g, '\\')}`, glob: '*.key' }, cwd: 'C:/p' })).toMatch(/masking key/);
      // still allowed
      for (const command of ['ls src/*', 'cat src/*/*/*.ts', 'grep -rn foo src', 'rg foo', 'find . -name "*.mjs"', 'cp -r dist /tmp/x', 'ls ~', 'cat ~/.claude/settings.json',
        'ln -s ../shared node_modules/shared', 'cat config/profiles/*/settings.json', 'ls PROGRA~1', 'cat C:/Users/ABCDEF~1/AppData/Local/Temp/x.txt', 'ls src/m*', 'echo a / b',
        `cat ${home}/profiles/S4-DEV/sap.env`, 'node -e "console.log(1)"',
        // a lone ~ in prose next to shell variables is not a path built at run time
        'T=$(date +%H:%M) && echo "- $T git -C ~ add still open" >> notes/journal.md',
        'cp $SRC/a ~/Documents/x', 'cat ~/.claude/$F', 'p=src; ls $p/*', 'S=/tmp/x; node "$S/a.mjs"',
        // a backslash escape in a search pattern is not a root path
        'grep -rn "SELECT \\*`|BREAK-POINT" skills/analyze-code/*.md', 'rg "\\(x\\)" src', 'grep -rnE "foo\\|bar" scripts',
        'rg -n "^\\s*\\*" scripts', 'grep -E "\\.\\./x" -r scripts', 'find . -name "*.md" -exec grep -l "\\*\\*" {} \\;'])
        expect(sh(command), command).toBeNull();
      // PowerShell: a backslash is a path separator, never an escape
      expect(sh(`gc ${U.replace(/\//g, '\\')}\\*\\*\\*\\*`, 'PowerShell'), 'PowerShell backslash glob').toMatch(/masking key/);
      // a near miss of the allow-list says what the allowed shape is
      expect(sh(`node /x/scripts/spec/md-to-html.mjs ${home}/program/Z/r.md; echo "exit=$?"`)).toMatch(/nothing before or after it/);
    } finally {
      if (prev === undefined) delete process.env.SC4SAP_HOME_DIR;
      else process.env.SC4SAP_HOME_DIR = prev;
    }
  });

  // create-program live run: the plugin scripts on a program state folder were refused after `cd <project>`.
  // Only the two allow-listed whole commands pass; nothing is cut out of other commands.
  it('guard allows exactly the allow-listed md-to-html / build-receipt commands', () => {
    const home = join(tmp, 'sc4sap-home-run1');
    const prev = process.env.SC4SAP_HOME_DIR;
    process.env.SC4SAP_HOME_DIR = home;
    try {
      const H = home.replace(/\\/g, '/');
      const PROJ = '/c/Users/dev/Documents/Projects/p';
      const sh = (command: string, tool = 'Bash', cwd = 'C:/Users/dev/Documents/Projects/p') => guard({ tool_name: tool, tool_input: { command }, cwd });
      const PS = `${PROJ}/.sc4sap/program/ZPROG_DEMO`;
      // only the plugin's own scripts are allow-listed: the repo is the plugin root here
      const PLUGIN = ROOT.replace(/\\/g, '/');
      const MD = `node "${PLUGIN}/scripts/spec/md-to-html.mjs" "C:/Users/dev/Documents/Projects/p/.sc4sap/program/ZPROG_DEMO/report.md"`;
      const BR = `node "${PLUGIN}/scripts/evidence/build-receipt.mjs" ZPROG_DEMO`;
      const allowed = [
        MD,
        `cd ${PROJ} && ${MD}`,
        `cd "${PROJ}" && ${MD}`,
        `node ${PLUGIN}/scripts/spec/md-to-html.mjs .sc4sap/program/ZPROG_DEMO/report.md`,
        BR,
        `cd ${PROJ} && ${BR}`,
        `cd ${PROJ} && ${BR} --also ZCL_DEMO_A,ZFG_DEMO_B --unit-test required`,
        `${BR} --unit-test required`,
      ];
      for (const command of allowed) {
        expect(allowListedCommand(command), command).toBe(true);
        expect(sh(command), command).toBeNull();
      }
      expect(sh(MD, 'PowerShell')).toBeNull();
      // each allowed shape with anything extra is not allow-listed and is refused
      const PROF = '~/.sc4sap/profiles/S4-DEV/x';
      for (const base of [MD, `cd ${PROJ} && ${MD}`, `cd ${PROJ} && ${BR}`]) {
        for (const command of [
          `${base}; cat ${PROF}`, `${base} && cat ${PROF}`, `${base} | cat ${PROF}`, `${base} & cat ${PROF}`,
          `${base} $x`, `${base} > /tmp/o`, `${base}\ncat ${PROF}`, `${base} \`cat ${PROF}\``,
        ]) {
          expect(allowListedCommand(command), command).toBe(false);
          // refused when it names the profiles, or changes directory and names the home
          // (`cd <project> && build-receipt … $x` names neither; `md-to-html … > /tmp/o` is as in HEAD)
          if (command.includes(PROF) || (base.startsWith('cd ') && base.includes('.sc4sap'))) expect(sh(command), command).toMatch(/masking key/);
        }
      }
      for (const command of [
        `cd ${PROJ}/.. && ${MD}`,
        `cd ~/.sc4sap/program/ZPROG_DEMO && ${MD}`,
        `cd ${H}/program/ZPROG_DEMO && ${BR}`,
        `node "${PLUGIN}/scripts/spec/md-to-html.mjs" "C:/Users/dev/p/.sc4sap/program/ZPROG_DEMO/../../profiles/S4-DEV/x.md"`,
        `node "${PLUGIN}/../x/scripts/spec/md-to-html.mjs" "C:/Users/dev/p/.sc4sap/program/ZPROG_DEMO/report.md"`,
        `node "${PLUGIN}/scripts/spec/md-to-html.mjs" "C:/Users/dev/p/.sc4sap/program/ZPROG_DEMO/sap.env"`,
        `node "${PLUGIN}/scripts/spec/md-to-html.mjs" "C:/Users/dev/.sc4sap/profiles/S4/.sc4sap/program/ZPROG_DEMO/a.md"`,
        `node "${PLUGIN}/scripts/spec/md-to-html.mjs" "C:/Users/dev/p/.sc4sap/program/ZPROG_DEMO/*.md"`,
        `node "${PLUGIN}/scripts/spec/md-to-html.mjs" "C:/Users/dev/p/.sc4sap/program/ZPROG_DEMO/report.md" --out x`,
        `cd ${PROJ} && cd ~/.sc4sap && ${BR}`,
        `${BR} ZPROG_DEMO/../..`,
      ]) expect(allowListedCommand(command), command).toBe(false);
      for (const command of [
        `cd ${PROJ}/.. && ${MD}`, `cd ~/.sc4sap/program/ZPROG_DEMO && ${MD}`,
        `node "${PLUGIN}/scripts/spec/md-to-html.mjs" "C:/Users/dev/p/.sc4sap/program/ZPROG_DEMO/*.md"`,
        `cd ${PROJ} && cd ~/.sc4sap && ${BR}`,
      ]) expect(sh(command), command).toMatch(/masking key/);
      // suffix spoof: a same-named script outside the plugin, reached through `cd` or a relative path
      for (const [command, cwd] of [
        ['cd /tmp/evil && node scripts/spec/md-to-html.mjs C:/Users/x/.sc4sap/program/ZP/a.md', undefined],
        ['cd /tmp/evil && node scripts/evidence/build-receipt.mjs ZP', undefined],
        ['node /tmp/evil/scripts/spec/md-to-html.mjs .sc4sap/program/ZP/a.md', 'C:/Users/dev/Documents/Projects/p'],
        ['node scripts/evidence/build-receipt.mjs ZP', 'C:/tmp/evil'],
        [`cd ${PLUGIN}/.. && node scripts/spec/md-to-html.mjs .sc4sap/program/ZP/a.md`, undefined],
      ] as const) expect(allowListedCommand(command, cwd), command).toBe(false);
      expect(sh('cd /tmp/evil && node scripts/spec/md-to-html.mjs C:/Users/x/.sc4sap/program/ZP/a.md')).toMatch(/masking key/);
      // the plugin's own script by a relative path from the plugin root, also after `cd` (Git Bash /c/ form)
      expect(allowListedCommand('node scripts/spec/md-to-html.mjs .sc4sap/program/ZP/a.md', PLUGIN)).toBe(true);
      if (process.platform === 'win32')
        expect(allowListedCommand(`cd ${PLUGIN.replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`)} && node scripts/evidence/build-receipt.mjs ZP`)).toBe(true);
      // shell writes / cd into a state folder that HEAD already refused stay refused
      for (const command of [
        `cd ${PS} && printf x >> spec.md`,
        `cat >> ${PS}/verify-phase4.md <<'EOF'\n## Phase 4\n* bullet one\nEOF`,
        'cd ~/.sc4sap/program/ZP && cat spec.md',
      ]) expect(sh(command), command).toMatch(/masking key/);
      // documented setup steps (setup wizard steps 04 and 12) pass as in HEAD
      for (const command of [
        `printf '%s' "$alias" > "$PWD/.sc4sap/active-profile.txt"`,
        `printf '%s' "DEMO-DEV" > "/c/Users/dev/p/.sc4sap/active-profile.txt"`,
        `mkdir -p "$TMP/.sc4sap" "$HOME/.sc4sap/profiles/_SMOKE_QA"`,
        `printf '_SMOKE_QA' > "$TMP/.sc4sap/active-profile.txt"`,
        String.raw`printf 'SAP_TIER=QA\nSAP_URL=http://x\nSAP_CLIENT=100\n' > "$HOME/.sc4sap/profiles/_SMOKE_QA/sap.env"`,
        `rm -rf "$TMP" "$HOME/.sc4sap/profiles/_SMOKE_QA"`,
        'mkdir -p /c/Users/dev/.sc4sap/profiles/DEMO-DEV',
      ]) for (const tool of ['Bash', 'PowerShell']) expect(sh(command, tool), command).toBeNull();
      // still refused: the profile folders by glob, cd, variable, climbing out of a state folder
      for (const command of [
        'cat ~/.sc4sap/profiles/S4-DEV/*',
        'cd ~/.sc4sap/profiles/S4-DEV',
        'cd ~/.sc4sap',
        'ls ~/.sc4sap/*',
        'D=~/.sc4sap/profiles/S4-DEV; cat $D/*',
        'D=~/.sc4sap; cat $D/profiles/S4-DEV/x',
        'cd ~/.sc4sap/program/ZP && cat ../../profiles/S4-DEV/x',
        'cat ~/.sc4sap/program/ZP/../../profiles/S4-DEV/x',
        `cd ${PS} && cat ~/.sc4sap/profiles/S4-DEV/x`,
        `cat ${PS}/spec.md; cat ~/.sc4sap/profiles/S4-DEV/*`,
        `cat ${PS}/../../../.sc4sap/profiles/S4-DEV/mask.key`,
        // a heredoc append through a variable
        `D=${PS}; cat >> $D/decisions.md <<'EOF'\n- **D1** cd is not needed; see *spec.md* -r\nEOF`,
        // a heredoc fed to a shell is code, not data
        `bash <<'EOF'\ncd ~/.sc4sap/program/ZP\ncat ../../profiles/S4-DEV/*\nEOF`,
      ]) expect(sh(command), command).toMatch(/masking key/);
      // a shell sitting in a state folder inside the home must not climb or name profiles
      expect(sh('cat ../../profiles/S4-DEV/x', 'Bash', `${H}/program/ZP`)).toMatch(/leave the sc4sap folder/);
      expect(sh('cat spec.md', 'Bash', `${H}/program/ZP`)).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.SC4SAP_HOME_DIR;
      else process.env.SC4SAP_HOME_DIR = prev;
    }
  });

  // verifier probes against the state-folder cut: dots rebuilt by escapes / variables / braces, links
  it('guard does not let a program state folder path climb into the profile folders', () => {
    const home = join(tmp, 'sc4sap-home-run2');
    const prev = process.env.SC4SAP_HOME_DIR;
    process.env.SC4SAP_HOME_DIR = home;
    try {
      const H = home.replace(/\\/g, '/');
      const HW = home.replace(/\//g, '\\');
      const sh = (command: string, tool = 'Bash', cwd = 'C:/p') => guard({ tool_name: tool, tool_input: { command }, cwd });
      for (const [command, tool] of [
        [String.raw`cat ~/.sc4sap/program/ZP/.\./.\./profiles/S4-DEV/*`, 'Bash'],
        [String.raw`cat ~/.sc4sap/program/ZP/$'\x2e\x2e'/$'\x2e\x2e'/profiles/S4-DEV/*`, 'Bash'],
        ['P=..; cat ~/.sc4sap/program/ZP/$P/$P/profiles/S4-DEV/*', 'Bash'],
        ['cat ~/.sc4sap/program/ZP/${P}/${P}/profiles/S4-DEV/*', 'Bash'],
        ['cat ~/.sc4sap/program/ZP/.{.,.}/profiles/S4-DEV/*', 'Bash'],
        ['cp -r ~/.sc4sap/program/ZP/$P/$P/profiles /tmp/x', 'Bash'],
        ['grep -r . ~/.sc4sap/program/ZP/$P/$P/', 'Bash'],
        ['Get-Content ~/.sc4sap/program/ZP/$p/$p/profiles/S4-DEV/*', 'PowerShell'],
        ['Get-ChildItem -Recurse ~/.sc4sap/program/ZP/$p/$p | Get-Content', 'PowerShell'],
        [String.raw`cat ~/.sc4sap/program/ZP/.\./.\./profiles/S4-DEV/mask.ke?`, 'Bash'],
        [`cat ${HW}\\program\\ZP\\..\\..\\profiles\\S4-DEV\\*`, 'Bash'],
        [String.raw`cat ${H}/program/ZP/.\./.\./profiles/S4-DEV/*`, 'Bash'],
        [String.raw`cat "$HOME/.sc4sap/program/ZP/.\./.\./profiles/S4-DEV/"*`, 'Bash'],
        ['cat ~/.sc4sap/config.json ~/.sc4sap/profiles/S4-DEV/*', 'Bash'],
        [String.raw`cat ~/.sc4sap/active-profile.txt; cat ~/.sc4sap/prof\iles/S4-DEV/*`, 'Bash'],
        [String.raw`cd ~/.sc4sap/program/ZP && cat $P/$P/prof\iles/S4-DEV/*`, 'Bash'],
        // symlink chain: a link in a program folder, then a glob / archive read through it
        ['ln -s ~/.sc4sap/profiles/S4-DEV ~/.sc4sap/program/L', 'Bash'],
        [String.raw`ln -s ../prof\iles/S4-DEV ~/.sc4sap/program/L`, 'Bash'],
        ['New-Item -ItemType SymbolicLink -Path ~/.sc4sap/program/L -Target ../x', 'PowerShell'],
        ['cat ~/.sc4sap/program/L/*', 'Bash'],
        ['cat ~/.sc4sap/program/L/ma*', 'Bash'],
        ['tar cf - ~/.sc4sap/program/L/ | cat', 'Bash'],
        ['cat ~/.sc4sap/program/L/[a-z][a-z][a-z][a-z].[a-z][a-z][a-z]', 'Bash'],
      ] as const) expect(sh(command, tool), command).toMatch(/masking key/);
      // a shell already inside the home: escaped dots, variables, backslash-split names
      for (const command of [String.raw`cat $P/$P/prof\iles/S4-DEV/*`, String.raw`cat .\./.\./profiles/S4-DEV/*`, String.raw`ls -R .\./.\.`, 'ln -s ../x L'])
        expect(sh(command, 'Bash', `${H}/program/ZP`), command).toMatch(/leave the sc4sap folder/);
    } finally {
      if (prev === undefined) delete process.env.SC4SAP_HOME_DIR;
      else process.env.SC4SAP_HOME_DIR = prev;
    }
  });

  // second verifier pass: climbing from a program folder, interpreters on a state path, heredoc scripts
  it('guard refuses climbs, interpreters and heredoc scripts around a program state folder', () => {
    const home = join(tmp, 'sc4sap-home-run3');
    const prev = process.env.SC4SAP_HOME_DIR;
    process.env.SC4SAP_HOME_DIR = home;
    try {
      const H = home.replace(/\\/g, '/');
      const sh = (command: string, tool = 'Bash', cwd = 'C:/p') => guard({ tool_name: tool, tool_input: { command }, cwd });
      for (const [command, tool] of [
        ['cd ~/.sc4sap/program/ZP && pwd | xargs dirname | xargs dirname | xargs -I D find D -type f | xargs cat', 'Bash'],
        ['Set-Location ~/.sc4sap/program/ZP; (Get-Item .).Parent.Parent.GetDirectories().GetDirectories().GetFiles() | Get-Content', 'PowerShell'],
        [`python -c "import os,sys;d=os.path.dirname;w=os.walk(d(d(d(sys.argv.pop()))))" ~/.sc4sap/program/ZP/x`, 'Bash'],
        [`node -p "require('fs').readdirSync(process.argv.at(-1))" ~/.sc4sap/program/ZP/x`, 'Bash'],
        [`cat >/tmp/x.sh <<'EOF'\ncat ~/.sc4sap/pro*/*/*\nEOF\nbash /tmp/x.sh`, 'Bash'],
        [`cat >/tmp/x.sh <<'EOF'\ncd ~/.sc4sap/program/ZP\ncat ../../x\nEOF\nsh /tmp/x.sh`, 'Bash'],
        [`cat <<'EOF' | bash\ncat ~/.sc4sap/program/ZP/x/../../profiles/S4-DEV/*\nEOF`, 'Bash'],
        [`cat <<'EOF' >/tmp/y.sh\ncd ~/.sc4sap\nEOF\n. /tmp/y.sh`, 'Bash'],
        ['realpath -m ~/.sc4sap/program/ZP/x | xargs dirname | xargs dirname | xargs -I D grep -r . D', 'Bash'],
        ['cd ~/.sc4sap/program/ZP && grep -r . ~+/../..', 'Bash'],
        ['cd ~/.sc4sap/program/ZP && cd - && ls', 'Bash'],
        ['cd ~/.sc4sap/program && cd ZP && cd ../.. && ls', 'Bash'],
        ['Set-Location ~/.sc4sap/program/ZP; Get-ChildItem (Split-Path (Split-Path (Get-Location))) -Directory | Get-Content', 'PowerShell'],
        ['cat ~/.sc4sap/program/ZP/x ~/.sc4sap/p"r"ofiles/S4-DEV/x', 'Bash'],
        ['cat $HOME/.sc4sap/program/ZP/x $HOME/.sc4sap/PROFILES/S4-DEV/x', 'Bash'],
        ['cat ~/.sc4sap/program/ZP/x ~/.sc4sap/work/A/program/ZP/../../../../profiles/x', 'Bash'],
        ['Get-Content -Path ~/.sc4sap/program/ZP/x -Include mask.k*', 'PowerShell'],
        ['robocopy ~/.sc4sap/program/ZP /tmp/o', 'Bash'],
      ] as const) expect(sh(command, tool), command).toMatch(/masking key/);
      // a shell already inside a program folder of the home must not walk up from it
      for (const [command, tool] of [
        ['pwd | xargs dirname | xargs dirname | xargs -I D find D -type f | xargs cat', 'Bash'],
        ['(Get-Item .).Parent.Parent.GetDirectories().GetDirectories().GetFiles() | Get-Content', 'PowerShell'],
      ] as const) expect(sh(command, tool, `${H}/program/ZP`), command).toMatch(/leave the sc4sap folder/);
      expect(sh('cat spec.md', 'Bash', `${H}/program/ZP`)).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.SC4SAP_HOME_DIR;
      else process.env.SC4SAP_HOME_DIR = prev;
    }
  });

  it('guard refuses commands that decode a hidden path or command', () => {
    const sh = (command: string, tool = 'Bash') => guard({ tool_name: tool, tool_input: { command }, cwd: 'C:/p' });
    for (const [command, tool] of [
      ['cat $(echo L2hvbWUveC8uc2M0c2FwL3Byb2ZpbGVzL1MvbWFzay5rZXk= | base64 -d)', 'Bash'],
      ['cat $(echo aGk= | base64 --decode)', 'Bash'],
      ['echo aGk= | base64 -D', 'Bash'],
      ['certutil -decode in.b64 out.txt', 'PowerShell'],
      ['certutil.exe /decodehex in.hex out.bin', 'Bash'],
      ['Get-Content ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String("aGk=")))', 'PowerShell'],
      ['openssl base64 -d -in x.b64', 'Bash'],
      ['openssl enc -base64 -d -in x', 'Bash'],
      ['echo 6869 | xxd -r -p', 'Bash'],
    ] as const) expect(sh(command, tool), command).toMatch(/decoded command or path/);
    for (const command of ['base64 file.bin > file.b64', 'npm run build', 'git log --oneline -1'])
      expect(sh(command), command).toBeNull();
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
    // the same holds for build-receipt.mjs on a protected path: the plugin's own copy only
    const receipt = 'C:/p/.sc4sap/program/ZP/receipt.json';
    expect(sh(`node "${join(ROOT, 'scripts', 'evidence', 'build-receipt.mjs')}" ZP ${receipt}`)).toBeNull();
    expect(sh(`node scripts/evidence/build-receipt.mjs ZP ${receipt}`, ROOT)).toBeNull();
    expect(sh(`node C:/tmp/evil/scripts/evidence/build-receipt.mjs ZP ${receipt}`)).toBeTruthy();
    expect(sh(`node scripts/evidence/build-receipt.mjs ZP ${receipt}`, 'C:/tmp/evil')).toBeTruthy();
  });

  it('init refuses QA without a destination and explains the SM59 setup', () => {
    const root = join(tmp, 'cli');
    mkdirSync(join(root, '.sc4sap'), { recursive: true });
    writeFileSync(join(root, '.sc4sap', 'config.json'), JSON.stringify({ sapVersion: 'ECC' }));
    const r = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt.mjs'), 'init', 'ZP', '--source', 'qa', '--root', root], { encoding: 'utf-8', env: { ...process.env, SC4SAP_HOME_DIR: join(tmp, 'home') } });
    expect(r.status).toBe(5);
    expect(r.stderr).toMatch(/SM59/);
    // production: the user's choice per run since the masking MCP release is pinned (0.6.70, user
    // 2026-11-18) — with its destination from the profile, and every plan rule still applied
    expect(MASKING_RELEASE_PINNED).toBe(true);
    const noPrdDest = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt.mjs'), 'init', 'ZP', '--source', 'prd', '--root', root], { encoding: 'utf-8', env: { ...process.env, SC4SAP_HOME_DIR: join(tmp, 'home') } });
    expect(noPrdDest.status).toBe(5);
    expect(noPrdDest.stderr).toMatch(/testDataSources\.prd/);
    writeFileSync(join(root, '.sc4sap', 'config.json'), JSON.stringify({ sapVersion: 'ECC', testDataSources: { prd: 'PRD100' } }));
    const prd = spawnSync(process.execPath, [join(ROOT, 'scripts/program-test/pt.mjs'), 'init', 'ZP', '--source', 'prd', '--root', root], { encoding: 'utf-8', env: { ...process.env, SC4SAP_HOME_DIR: join(tmp, 'home') } });
    expect(prd.status).toBe(0);
    expect(JSON.parse(prd.stdout)).toMatchObject({ source: 'prd', destination: 'PRD100' });
    expect(checkPlan({ source: 'prd', destination: 'PRD100', tables: [{ table: 'EKPO', fields: ['EBELN'], where: "EBELN = '1'", cases: ['C01'] }] })).toEqual([]);
    expect(checkPlan({ source: 'prd', destination: 'PRD100', tables: [{ table: 'EKPO', fields: ['EBELN'], cases: ['C01'] }] }).join()).toMatch(/WHERE on key/);
    expect(checkPlan({ source: 'prd', tables: [{ table: 'EKPO', fields: ['EBELN'], where: "EBELN = '1'", cases: ['C01'] }] }).join()).toMatch(/needs the SM59 destination/);
    expect(checkPlan({ source: 'prd', destination: 'PRD100', tables: [{ table: 'EKPO', fields: ['EBELN'], where: "EBELN = '1'", max_rows: 201, cases: ['C01'] }] }).join()).toMatch(/max_rows 201 outside 1\.\.200/);
    expect(checkPlan({ source: 'prd', destination: 'PRD100', tables: [{ table: 'PA0002', fields: ['PERNR'], where: "PERNR = '1'", cases: ['C01'] }] }).join()).toMatch(/personal \/ credential table/);
    // the lock still works when switched back: PRD_LOCKED is the message then
    expect(PRD_LOCKED).toMatch(/locked/);
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

  it('pt-lib classifies the pinned columns (SCUSTOM, KNA1, LFA1, ADRC, BUT000, ADR6, ADR2, KNVK, SBOOK, Z-shaped tables) like the server', () => {
    expect(PERSONAL_NAME_PATTERNS.map((re) => re.source)).toEqual(V.patterns.name);
    expect(PERSONAL_DDIC_PATTERNS.map((re) => re.source)).toEqual(V.patterns.ddic);
    const wrong: string[] = [];
    for (const [table, fields] of Object.entries(V.pinned_tables as Record<string, Record<string, { rollname: string; domname: string; personal: boolean }>>))
      for (const [f, d] of Object.entries(fields)) if (isClearField(f, [], d) === d.personal) wrong.push(`${table}-${f}`);
    expect(wrong).toEqual([]);
    expect([...CLEAR_DDIC].sort()).toEqual(V.lists.clear_ddic);
    expect([...CLEAR_DATATYPES].sort()).toEqual(V.lists.clear_datatypes);
    // allow-list: an unlisted data element stays masked even when nothing about it looks personal
    expect(isClearField('ZZINFO', [], { rollname: 'ZZ_NEW_DTEL', domname: 'CHAR30' })).toBe(false);
    expect(isClearField('TELEPHONE', [], { rollname: 'MANDT', domname: '' })).toBe(false);
    expect(isClearField('KUNNR', [], { rollname: 'KUNNR', domname: '' })).toBe(true);
    expect(MASK_VERSIONS).toEqual(['hmac-v2']);
    for (const n of V.name_probe.personal) expect([n, isPersonalField(n)]).toEqual([n, true]);
    for (const n of V.name_probe.not_personal) expect([n, isPersonalField(n)]).toEqual([n, false]);
    for (const f of ['NAME', 'TELEPHONE', 'EMAIL', 'STREET', 'CITY', 'POSTCODE', 'WEBUSER']) expect(V.pinned_tables.SCUSTOM[f].personal).toBe(true);
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
  const masked = (rows: Record<string, string>[], cols: string[], version = 'hmac-v2') => JSON.stringify({ table: 'X', rows, masking: { version, default_deny: true, masked_columns: cols, ddic_fields: 3 } });

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

  it('remote rows come only through the run\'s own destination (no production by the back door)', () => {
    const masks = { mask: { salt: SALT } };
    // a dev run reads the connected system only
    const dev = run('gate-dest-dev', 'dev');
    expect(gate(sap('GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100', ...masks }, dev.root))).toMatch(/no remote reads in this run/);
    expect(gate(sap('GetSqlQuery', { sql_query: 'SELECT ebeln FROM ekpo', ...masks }, dev.root))).toBeNull();
    // a QA run (destination PRD100 in this fixture) cannot name another destination
    const qa = run('gate-dest-qa', 'qa');
    expect(gate(sap('GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRDCLNT100', ...masks }, qa.root))).toMatch(/through PRD100 only — not PRDCLNT100/);
    expect(gate(sap('GetRemoteTableContents', { table_name: 'EKPO', ...masks }, qa.root))).toMatch(/not \(no destination\)/);
    expect(gate(sap('GetRemoteTableContents', { table_name: 'EKPO', destination: 'prd100', ...masks }, qa.root))).toMatch(/through PRD100 only/);
    expect(gate(sap('GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100', ...masks }, qa.root))).toBeNull();
    // a production run: its own destination, and only after the masked probe
    const prd = run('gate-dest-prd', 'prd');
    expect(gate(sap('GetRemoteTableContents', { table_name: 'EKPO', destination: 'OTHER', ...masks }, prd.root))).toMatch(/through PRD100 only/);
    expect(gate(sap('GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100', ...masks }, prd.root))).toMatch(/need proof/);
  });

  it('the test class never reads another system', () => {
    const tc = (body: string) =>
      `CLASS ltc DEFINITION FOR TESTING RISK LEVEL HARMLESS DURATION SHORT.\n  PRIVATE SECTION.\n    METHODS c01_x FOR TESTING.\nENDCLASS.\nCLASS ltc IMPLEMENTATION.\n  METHOD c01_x.\n${body}\n    cl_abap_unit_assert=>assert_equals( act = lv exp = 2 ).\n  ENDMETHOD.\nENDCLASS.`;
    const cases = { cases: [{ id: 'C01', method: 'C01_X', double: 'param' }] };
    const expected = { cases: { C01: { values: [{ what: 'lv', value: 2 }] } } };
    expect(lintHarness(tc("    CALL FUNCTION 'RFC_READ_TABLE' DESTINATION 'PRD100' EXPORTING query_table = 'EKPO'."), cases, expected, null).join()).toMatch(/remote call/);
    expect(lintHarness(tc("    CALL FUNCTION 'Z_GET' DESTINATION lv_dest."), cases, expected, null).join()).toMatch(/remote call/);
    expect(lintHarness(tc('    " a comment that says DESTINATION is fine'), cases, expected, null).join()).not.toMatch(/remote call/);
  });

  it('capture keeps server-masked rows as they came, for this salt only; production rows must be server-masked', () => {
    const { root, runDir } = run('cap-prd', 'prd');
    expect(capture(root, 'GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100' }, JSON.stringify({ rows: [{ EBELN: '45', ERNAM: 'REALUSER' }] }), false)).toMatchObject({ error: expect.stringMatching(/without server masking/) });
    expect(existsSync(join(runDir, 'rows', 'EKPO.json'))).toBe(false);
    expect(capture(root, 'GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100' }, masked([{ EBELN: '45', ERNAM: 'MAB12' }], ['ERNAM'], 'sha-v0'), false)).toMatchObject({ error: expect.stringMatching(/without server masking/) });
    // a 4.14.0-era server (v1 rules kept unlisted fields clear) is not accepted either
    expect(capture(root, 'GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100' }, masked([{ EBELN: '45', ERNAM: 'MAB12' }], ['ERNAM'], 'hmac-v1'), false)).toMatchObject({ error: expect.stringMatching(/without server masking/) });
    const ok = capture(root, 'GetRemoteTableContents', { table_name: 'EKPO', destination: 'PRD100' }, masked([{ EBELN: '45', ERNAM: 'MAB12' }], ['ERNAM']), false);
    expect(ok).toMatchObject({ kind: 'data', table: 'EKPO', source: 'prd', count: 1, masked: ['ERNAM'], server_masked: true, mask_version: 'hmac-v2' });
    const saved = JSON.parse(readFileSync(join(runDir, 'rows', 'EKPO.json'), 'utf-8'));
    expect(saved.rows).toEqual([{ EBELN: '45', ERNAM: 'MAB12' }]);
    expect(existsSync(join(runDir, 'fingerprints.json'))).toBe(false);
    // the strict SELECT grammar still applies to server-masked answers
    expect(capture(root, 'GetSqlQuery', { sql_query: 'SELECT ebeln FROM ekpo UNION SELECT ernam FROM ekpo' }, masked([{ EBELN: 'x' }], []), false)).toMatchObject({ error: expect.stringMatching(/SELECT not saved/) });
  });
});
