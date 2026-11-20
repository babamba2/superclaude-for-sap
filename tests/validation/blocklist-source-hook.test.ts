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
