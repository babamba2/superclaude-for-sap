import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs module without type declarations
import { tablesFromSource, sourceIsReadChannel, stripAbapNoise } from '../../scripts/hooks/block-forbidden-tables.mjs';

const ROOT = join(__dirname, '..', '..');
const HOOK = join(ROOT, 'scripts', 'hooks', 'block-forbidden-tables.mjs');

// Hermetic: the hook walks up from its cwd to the first .sc4sap/ with profile state. From the OS temp
// folder that walk reached the developer's ~/.sc4sap (active profile, e.g. blocklistProfile "off") and
// the deny cases passed or failed by machine. Each test workspace now holds its own profile, and
// SC4SAP_HOME_DIR points at an empty folder, so no real profile is ever read.
function workspace(profile: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'sc4sap-hook-'));
  mkdirSync(join(dir, '.sc4sap'));
  writeFileSync(join(dir, '.sc4sap', 'config.json'), JSON.stringify({ blocklistProfile: profile }));
  return dir;
}
const HOME = mkdtempSync(join(tmpdir(), 'sc4sap-home-'));
const CWD = workspace('strict');

function run(tool: string, input: Record<string, unknown>, cwd = CWD): string | null {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd,
    env: { ...process.env, SC4SAP_HOME_DIR: HOME },
    input: JSON.stringify({ tool_name: `mcp__plugin_sc4sap_sap__${tool}`, tool_input: input }),
    encoding: 'utf8',
  });
  if (!r.stdout.trim()) return null;
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

describe('blocklist hook — tests run in their own workspace', () => {
  it("reads the test workspace's profile, not the machine's", () => {
    // The same deny-tier read: denied under the workspace's strict profile, let through only when that
    // same workspace says off. If the hook read any other profile, one of the two would not hold.
    const read = { table_name: 'USR02', destination: 'PRDCLNT100' };
    expect(run('GetRemoteTableContents', read)).toBe('deny');
    expect(run('GetRemoteTableContents', read, workspace('off'))).toBeNull();
  });
});

const probe = (select: string) => `REPORT yprobe.
CLASS ltcl DEFINITION FINAL FOR TESTING DURATION SHORT RISK LEVEL HARMLESS.
  PRIVATE SECTION. METHODS run FOR TESTING.
ENDCLASS.
CLASS ltcl IMPLEMENTATION.
  METHOD run.
    ${select}
    cl_abap_unit_assert=>fail( msg = |x| ).
  ENDMETHOD.
ENDCLASS.`;

describe('blocklist hook — remote table read', () => {
  it('denies a deny-tier table read over an RFC destination', () => {
    expect(run('GetRemoteTableContents', { table_name: 'USR02', destination: 'PRDCLNT100' })).toBe('deny');
  });

  it('lets an unlisted table through', () => {
    expect(run('GetRemoteTableContents', { table_name: 'T001', destination: 'PRDCLNT100' })).toBeNull();
  });
});

describe('blocklist hook — source uploads', () => {
  it('denies a test class that reads a deny-tier table', () => {
    const src = probe(`SELECT SINGLE persnumber FROM usr21 WHERE bname = 'X' INTO @DATA(lv).`);
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_code: src })).toBe('deny');
  });

  it('denies a JOIN onto a deny-tier table in a test class', () => {
    const src = probe(`SELECT a~bname FROM usr02 AS a INNER JOIN adrp AS p ON p~persnumber = a~bname INTO TABLE @DATA(lt).`);
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_code: src })).toBe('deny');
  });

  it('denies a CDS view over a deny-tier table', () => {
    const ddl = `define view entity ZI_USERLINK as select from usr21 { key bname, persnumber }`;
    expect(run('CreateView', { view_name: 'ZI_USERLINK', ddl_source: ddl })).toBe('deny');
  });

  it('denies a local test class upload that reads a deny-tier table', () => {
    const src = `CLASS ltcl DEFINITION FOR TESTING. ENDCLASS. CLASS ltcl IMPLEMENTATION. METHOD m. SELECT * FROM kna1 INTO TABLE @DATA(lt). ENDMETHOD. ENDCLASS.`;
    expect(run('UpdateLocalTestClass', { class_name: 'ZCL_X', test_class_source: src })).toBe('deny');
  });

  it('allows normal business code that reads customer master (no test class)', () => {
    const src = `REPORT zreport.\nSELECT kunnr, name1 FROM kna1 INTO TABLE @DATA(lt) UP TO 10 ROWS.`;
    expect(run('UpdateProgram', { program_name: 'ZREPORT', source_code: src })).toBeNull();
  });

  it('allows a test class that reads warn-tier tables only', () => {
    const src = probe(`SELECT vbeln FROM vbak INTO TABLE @DATA(lt) UP TO 5 ROWS.`);
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_code: src })).toBeNull();
  });

  it('ignores table names inside literals and comments', () => {
    const src = probe(`" SELECT * FROM usr21\n    DATA(lv) = 'read FROM usr21'.`);
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_code: src })).toBeNull();
  });

  it('denies a test-class implementation include (definition in another include) reading a deny-tier table', () => {
    const src = 'CLASS ltcl_x IMPLEMENTATION.\n  METHOD t1.\n    SELECT bname FROM usr21 INTO TABLE @DATA(lt).\n' +
      '    cl_abap_unit_assert=>fail( msg = |{ lines( lt ) }| ).\n  ENDMETHOD.\nENDCLASS.';
    expect(run('UpdateInclude', { include_name: 'ZPROBE_T99', source_code: src })).toBe('deny');
  });

  it('denies test code hidden behind a literal holding another quote kind', () => {
    const src = "lv = `don't`. CLASS ltcl DEFINITION FOR TESTING. lv2 = 'x'.\n" +
      'CLASS ltcl IMPLEMENTATION.\n  METHOD t.\n    SELECT bname FROM usr21 INTO TABLE @DATA(lt).\n  ENDMETHOD.\nENDCLASS.';
    expect(run('UpdateProgram', { program_name: 'ZPROBE', source_code: src })).toBe('deny');
  });

  it('still denies GetSqlQuery on a deny-tier table', () => {
    expect(run('GetSqlQuery', { sql_query: 'SELECT bname FROM usr21' })).toBe('deny');
  });
});

describe('blocklist hook — helpers and wiring', () => {
  it('extracts FROM / JOIN targets from cleaned source', () => {
    const t = tablesFromSource({ source_code: `SELECT a FROM usr21 AS u JOIN adrp AS p ON 1 = 1. " FROM bkpf` });
    expect([...t].sort()).toEqual(['ADRP', 'USR21']);
    expect(stripAbapNoise(`* comment FROM x\nDATA(a) = 'FROM y'.`)).not.toMatch(/FROM [xy]/);
  });

  it('treats plain source as not a read channel', () => {
    expect(sourceIsReadChannel('mcp__plugin_sc4sap_sap__UpdateProgram', { source_code: 'REPORT z.' })).toBe(false);
    expect(sourceIsReadChannel('mcp__plugin_sc4sap_sap__UpdateView', {})).toBe(true);
  });

  it('literal stripping is one left-to-right scan: a quote inside one literal never opens another', () => {
    const rc = (s: string) => sourceIsReadChannel('mcp__plugin_sc4sap_sap__UpdateProgram', { source_code: s });
    expect(rc("lv = `don't`. CLASS ltcl DEFINITION FOR TESTING. lv2 = 'x'.")).toBe(true);
    expect(rc("lv = |'|. CLASS ltcl DEFINITION FOR TESTING. lv2 = 'x'.")).toBe(true);
    expect(rc("lv = 'FOR TESTING'. \" FOR TESTING")).toBe(false);
    expect(stripAbapNoise("a = '\"'. b = 1. \" c")).toBe("a = ''. b = 1. ");
  });

  it('a | inside an embedded expression of a template hides neither test code nor tables (verifier F1)', () => {
    const rc = (s: string) => sourceIsReadChannel('mcp__plugin_sc4sap_sap__UpdateProgram', { source_code: s });
    expect(rc("DATA(s) = |{ '|' }|. CLASS ltc DEFINITION FOR TESTING. ENDCLASS. DATA(t) = |x|.")).toBe(true);
    expect(rc("DATA(u) = |{ '|' }|. CLASS ltc IMPLEMENTATION. METHOD m. ENDMETHOD. ENDCLASS. DATA(v) = |x|.")).toBe(true);
    expect(rc("lv = |FOR TESTING { 'FOR TESTING' }|.")).toBe(false);
    expect([...tablesFromSource({ source_code: "DATA(s) = |{ '|' }|. SELECT * FROM usr02. DATA(t) = |x|." })]).toEqual(['USR02']);
    expect(stripAbapNoise("x = |a{ y }b|. \" c\n* z\nw = 'q'.")).toBe("x = |{ y }|. \n\nw = ''.");
  });

  it('colon chaining, LOCAL FRIENDS and // outside CDS (verifier F2, F4, F5)', () => {
    const rc = (s: string) => sourceIsReadChannel('mcp__plugin_sc4sap_sap__UpdateProgram', { source_code: s });
    expect(rc('CLASS ltc DEFINITION FOR: TESTING.')).toBe(true);
    expect(rc('CLASS: ltc IMPLEMENTATION.\nENDCLASS.')).toBe(true);
    expect(rc('CLASS zcl_a DEFINITION LOCAL FRIENDS ltc.\nCLASS ltc IMPLEMENTATION.\nENDCLASS.')).toBe(true);
    expect(rc("WRITE // 'x'. CLASS ltc DEFINITION FOR TESTING.")).toBe(true);
    expect([...tablesFromSource({ ddl_source: 'select from kna1 // from usr02' }, 'mcp__plugin_sc4sap_sap__CreateView')]).toEqual(['KNA1']);
  });

  it('a class implementation without its definition in the same text is test code; with it, not', () => {
    const rc = (s: string) => sourceIsReadChannel('mcp__plugin_sc4sap_sap__UpdateInclude', { source_code: s });
    const impl = 'CLASS lcl_a IMPLEMENTATION.\nENDCLASS.';
    expect(rc(impl)).toBe(true);
    expect(rc('CLASS lcl_a DEFINITION DEFERRED.\n' + impl)).toBe(true);
    expect(rc('CLASS lcl_a DEFINITION FINAL.\nENDCLASS.\n' + impl)).toBe(false);
    expect(rc("lv = 'CLASS x IMPLEMENTATION'.")).toBe(false);
  });

  it('is registered in the plugin hooks for source uploads and row reads', () => {
    const hooks = JSON.parse(readFileSync(join(ROOT, 'hooks', 'hooks.json'), 'utf8'));
    const entry = hooks.hooks.PreToolUse.find((e: { hooks: { command: string }[] }) =>
      e.hooks.some((h) => h.command.includes('block-forbidden-tables.mjs')));
    expect(entry).toBeTruthy();
    const re = new RegExp(`^(?:${entry.matcher})$`);
    for (const t of ['GetSqlQuery', 'GetTableContents', 'UpdateProgram', 'CreateView', 'UpdateLocalTestClass', 'UpdateClass']) {
      expect(re.test(`mcp__plugin_sc4sap_sap__${t}`), t).toBe(true);
    }
    expect(re.test('mcp__plugin_sc4sap_sap__GetProgram')).toBe(false);
  });
});

describe('blocklist hook — patch mode (source_file)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sc4sap-src-'));
  const file = (name: string, text: string) => { const p = join(dir, name); writeFileSync(p, text); return p; };

  it('scans the file the server will upload', () => {
    const bad = file('bad.prog.abap', probe(`SELECT SINGLE persnumber FROM usr21 WHERE bname = 'X' INTO @DATA(lv).`));
    const good = file('good.prog.abap', probe(`SELECT SINGLE bukrs FROM t001 INTO @DATA(lv).`));
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_file: bad })).toBe('deny');
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_file: good })).toBeNull();
  });

  it('refuses a source_file it cannot read (relative or missing) instead of skipping the scan', () => {
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_file: 'src/bad.prog.abap' })).toBe('deny');
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_file: join(dir, 'missing.abap') })).toBe('deny');
  });
});

describe('blocklist hook — server-side patch (source_patches)', () => {
  const patch = (old_string: string, new_string: string) => ({ old_string, new_string });

  it('business code: a patch reading or typing KNA1 / USR21 passes (same as a full upload)', () => {
    expect(run('UpdateProgram', {
      program_name: 'YPROBE',
      source_patches: [patch('FROM t001', 'FROM kna1'), patch('lv = 1.', 'DATA ls_kna1 TYPE kna1.')],
    })).toBeNull();
    expect(run('UpdateClass', {
      class_name: 'YCL_PROBE',
      source_patches: [patch('t001 INTO', 'usr21 INTO')],
    })).toBeNull();
  });

  it('visible test code is refused: FOR TESTING in a new_string or an old_string', () => {
    const SEND_FULL = /send the full source_code so the blocklist hook can check it/;
    const out = (input: Record<string, unknown>) => spawnSync(process.execPath, [HOOK], {
      cwd: CWD, env: { ...process.env, SC4SAP_HOME_DIR: HOME },
      input: JSON.stringify({ tool_name: 'mcp__plugin_sc4sap_sap__UpdateProgram', tool_input: input }), encoding: 'utf8',
    }).stdout;
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_patches: [patch('ENDCLASS.', probe('lv = 1.'))] })).toBe('deny');
    expect(out({ program_name: 'YPROBE', source_patches: [patch('ENDCLASS.', probe('lv = 1.'))] })).toMatch(SEND_FULL);
    // removing FOR TESTING: the marker is in old_string
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_patches: [patch('FINAL FOR TESTING', 'FINAL')] })).toBe('deny');
    // FOR TESTING only in a comment / literal is not test code
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_patches: [patch('WRITE 1.', `WRITE 'FOR TESTING'. " FOR TESTING`)] })).toBeNull();
  });

  it('refuses malformed source_patches', () => {
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_patches: 'WRITE 2.' })).toBe('deny');
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_patches: [] })).toBe('deny');
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_patches: [{ old_string: '', new_string: 'x' }] })).toBe('deny');
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_patches: [{ old_string: 'a' }] })).toBe('deny');
  });

  it('denies source_patches next to a source field or source_file, whatever the value ("" / blank)', () => {
    const p = [patch('WRITE 1.', 'WRITE 2.')];
    for (const source_code of ['', '   ', 'REPORT yprobe.'])
      expect(run('UpdateProgram', { program_name: 'YPROBE', source_code, source_patches: p })).toBe('deny');
    expect(run('UpdateProgram', { program_name: 'YPROBE', source_file: '', source_patches: p })).toBe('deny');
    expect(run('UpdateLocalTestClass', { class_name: 'YCL_PROBE', test_class_code: '', source_patches: p })).toBe('deny');
  });

  it('UpdateLocalTestClass patches are refused, whatever they change', () => {
    expect(run('UpdateLocalTestClass', { class_name: 'YCL_PROBE', source_patches: [patch('lv = 1.', 'lv = 2.')] })).toBe('deny');
    expect(run('UpdateLocalTestClass', { class_name: 'YCL_PROBE', source_patches: [patch('t001 INTO', 'usr21 INTO')] })).toBe('deny');
  });

  it('scans the local test class field of UpdateLocalTestClass', () => {
    expect(run('UpdateLocalTestClass', { class_name: 'YCL_PROBE', test_class_code: probe(`SELECT SINGLE persnumber FROM usr21 INTO @DATA(lv).`) })).toBe('deny');
  });
});
