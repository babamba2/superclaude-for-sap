import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDdMetadataQuery } from '../../scripts/lib/dd-metadata-query.mjs';
import { ddicQueries } from '../../scripts/graph/ddic-queries.mjs';

const ROOT = join(__dirname, '..', '..');
const ok = (sql_query: string, extra: Record<string, unknown> = {}) => isDdMetadataQuery({ sql_query, output: 'file', row_number: 5000, ...extra });
const G3A = "SELECT TABNAME, FIELDNAME, PRIMPOS, FORTABLE, FORKEY FROM DD05S WHERE AS4LOCAL = 'A' AND TABNAME IN ('ZTAB1','Z''Q','/NS/TAB')";

function runHook(tool_name: string, tool_input: Record<string, unknown>) {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'permission-approver.mjs')], {
    input: JSON.stringify({ tool_name, tool_input }),
    encoding: 'utf-8',
    env: { ...process.env, DISABLE_SC4SAP: '' },
  });
  return JSON.parse(r.stdout.trim().split('\n').pop() || '{}');
}

describe('permission-approver DD* metadata exception', () => {
  it('accepts every statement ddic-queries prints', () => {
    const walk = {
      objects: [
        ...Array.from({ length: 60 }, (_, i) => ({ name: `ZT${i}`, type: 'TABL/DT' })),
        { name: 'ZS1', type: 'TABL/DS' }, { name: 'ZE1', type: 'DTEL/DE' }, { name: 'ZD1', type: 'DOMA/DD' },
        { name: 'ZTT1', type: 'TTYP/DA' }, { name: 'ZV1', type: 'VIEW/DV' }, { name: 'ZH1', type: 'SHLP/DH' },
      ],
    };
    const plan = ddicQueries(walk);
    expect(new Set(plan.map((q: { table: string }) => q.table)).size).toBe(10);
    for (const q of plan) expect(ok(q.sql), q.sql).toBe(true);
    expect(ok(G3A)).toBe(true);
  });

  it('rejects everything outside the G3a shape', () => {
    expect(ok(G3A.replace('DD05S', 'VBAK'))).toBe(false);
    expect(ok("SELECT * FROM DD03L WHERE TABNAME = 'ZT'")).toBe(false);
    expect(ok(`${G3A}; DELETE FROM DD03L`)).toBe(false);
    expect(ok("SELECT TABNAME FROM DD03L WHERE TABNAME IN (SELECT TABNAME FROM DD02L)")).toBe(false);
    expect(ok("SELECT TABNAME FROM DD03L JOIN DD04L ON DD03L~ROLLNAME = DD04L~ROLLNAME WHERE TABNAME = 'Z'")).toBe(false);
    expect(ok("SELECT TABNAME FROM DD03L WHERE TABNAME = 'Z' UNION SELECT MANDT FROM USR02")).toBe(false);
    expect(ok("SELECT TABNAME FROM DD03L WHERE TABNAME LIKE 'Z%'")).toBe(false);
    expect(ok("SELECT TABNAME FROM DD03L WHERE TABNAME = @lv")).toBe(false);
    expect(ok("SELECT TABNAME FROM DD03L WHERE TABNAME = 'Z")).toBe(false);
    expect(ok("SELECT TABNAME FROM DD03L")).toBe(false);
    expect(isDdMetadataQuery({ sql_query: G3A })).toBe(false); // inline output
    expect(ok(G3A, { acknowledge_risk: true })).toBe(false);
    expect(isDdMetadataQuery(undefined)).toBe(false);
  });

  it('keyword text inside literals is inert, keywords outside are not', () => {
    expect(ok("SELECT TABNAME FROM DD03L WHERE TABNAME IN ('SELECT','UNION ALL','A;B')")).toBe(true);
    expect(ok("SELECT TABNAME FROM DD03L WHERE TABNAME = 'Z' ORDER BY TABNAME")).toBe(false);
  });

  it('hook: allows the G3a call, passes other GetSqlQuery and GetTableContents through', () => {
    const allow = runHook('mcp__plugin_sc4sap_sap__GetSqlQuery', { sql_query: G3A, output: 'file' });
    expect(allow.hookSpecificOutput?.permissionDecision).toBe('allow');
    const vbak = runHook('mcp__plugin_sc4sap_sap__GetSqlQuery', { sql_query: G3A.replace('DD05S', 'VBAK'), output: 'file' });
    expect(vbak.hookSpecificOutput).toBeUndefined();
    const inline = runHook('mcp__plugin_sc4sap_sap__GetSqlQuery', { sql_query: G3A });
    expect(inline.hookSpecificOutput).toBeUndefined();
    const contents = runHook('mcp__plugin_sc4sap_sap__GetTableContents', { table_name: 'DD03L' });
    expect(contents.hookSpecificOutput).toBeUndefined();
    const other = runHook('mcp__plugin_sc4sap_sap__GetTable', { table_name: 'T001W' });
    expect(other.hookSpecificOutput?.permissionDecision).toBe('allow');
  });
});
