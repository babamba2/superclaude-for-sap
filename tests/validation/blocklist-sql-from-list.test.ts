import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// @ts-expect-error — plain .mjs module without type declarations
import { tablesFromSql } from '../../scripts/hooks/block-forbidden-tables.mjs';

const ROOT = join(__dirname, '..', '..');
const HOOK = join(ROOT, 'scripts', 'hooks', 'block-forbidden-tables.mjs');
// Hermetic (see blocklist-source-hook.test.ts): an own workspace with the strict profile, and an empty
// SC4SAP_HOME_DIR, so the developer's ~/.sc4sap profile is never read.
const CWD = mkdtempSync(join(tmpdir(), 'sc4sap-hook-sql-'));
mkdirSync(join(CWD, '.sc4sap'));
writeFileSync(join(CWD, '.sc4sap', 'config.json'), JSON.stringify({ blocklistProfile: 'strict' }));
const HOME = mkdtempSync(join(tmpdir(), 'sc4sap-home-'));

function run(tool: string, input: Record<string, unknown>): string | null {
  const r = spawnSync(process.execPath, [HOOK], {
    cwd: CWD,
    env: { ...process.env, SC4SAP_HOME_DIR: HOME },
    input: JSON.stringify({ tool_name: `mcp__plugin_sc4sap_sap__${tool}`, tool_input: input }),
    encoding: 'utf8',
  });
  if (!r.stdout.trim()) return null;
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}

// Same cases as the MCP server's tableBlocklistSqlFromList.test.ts.
const cases: [string, string[]][] = [
  ['SELECT * FROM AGR_1251, USR02 WHERE x = 1', ['AGR_1251', 'USR02']],
  ['SELECT * FROM AGR_1251 AS a, USR02 AS u WHERE a~x = u~y', ['AGR_1251', 'USR02']],
  ['SELECT * FROM AGR_1251 a, /ABC/T1 b', ['AGR_1251', '/ABC/T1']],
  ['SELECT * FROM AGR_1251 INNER JOIN AGR_AGRS ON AGR_1251~AGR_NAME = AGR_AGRS~AGR_NAME , USR02', ['AGR_1251', 'AGR_AGRS', 'USR02']],
  ['SELECT * FROM ( AGR_1251 ), USR02', ['AGR_1251', 'USR02']],
  ['select * from agr_1251,usr02', ['AGR_1251', 'USR02']],
];

describe('blocklist hook — every name of a FROM clause counts', () => {
  it.each(cases)('%s', (sql, expected) => {
    const got: string[] = tablesFromSql(sql);
    expect(got[0]).toBe(expected[0]);
    expect([...got].sort()).toEqual([...expected].sort());
  });

  it('keeps the first FROM name first and stops at WHERE / sub-query ends', () => {
    expect(tablesFromSql("SELECT a, b FROM T000 WHERE mandt IN ( SELECT mandt FROM T001 WHERE x IN ( 'A', 'B' ) ) ORDER BY a, b")).toEqual(['T000', 'T001']);
    expect(tablesFromSql('SELECT FROM TADIR FIELDS obj_name, devclass')).toEqual(['TADIR']);
  });

  it('denies a blocklisted table hidden behind an unlisted one in a comma join', () => {
    expect(run('GetSqlQuery', { sql_query: 'SELECT * FROM T001 AS a, USR02 AS u' })).toBe('deny');
    expect(run('GetSqlQuery', { sql_query: 'SELECT * FROM ( T001 ), USR02' })).toBe('deny');
    expect(run('GetSqlQuery', { sql_query: 'SELECT * FROM T001' })).toBeNull();
  });
});
