import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs script, no type declarations
import { collectActuals, noteTruncated } from '../../scripts/project/sap-actuals.mjs';

// A fake MCP client answering GetSqlQuery per table; no SAP. Fictitious names only.
function fakeClient(heads: number) {
  const calls: string[] = [];
  const client = {
    cache: new Map(),
    async callTool({ name, arguments: a }: any) {
      if (name !== 'GetSqlQuery') return { isError: true, content: [{ text: 'no such tool here' }] };
      const sql: string = a.sql_query;
      calls.push(sql);
      const table = /FROM (\w+)/.exec(sql)![1];
      let rows: any[] = [], truncated = false;
      if (table === 'E070' && sql.includes("STRKORR = ' '")) rows = Array.from({ length: heads }, (_, i) => ({ TRKORR: `DEVK9${String(i).padStart(5, '0')}`, STRKORR: ' ', TRFUNCTION: 'K', TRSTATUS: 'R', AS4USER: 'U1', AS4DATE: '20270110' }));
      if (table === 'E07T') rows = [...sql.matchAll(/'(DEVK9\d{5})'/g)].map((m) => ({ TRKORR: m[1], AS4TEXT: '[SD] change' }));
      if (table === 'TADIR') {
        if (sql.includes("'$TMP'")) { truncated = true; rows = Array.from({ length: 5 }, (_, i) => ({ OBJECT: 'PROG', OBJ_NAME: `ZTMP_${i}`, DEVCLASS: '$TMP', AUTHOR: 'U1', CREATED_ON: '20270110' })); }
        else rows = [{ OBJECT: 'PROG', OBJ_NAME: 'ZSD_TEST_UPLOAD', DEVCLASS: 'ZTEST', AUTHOR: 'U1', CREATED_ON: '20270110' }];
      }
      return { content: [{ text: JSON.stringify({ rows, truncated }) }] };
    },
    async close() {},
  };
  return { client, calls };
}
const model = { project: { code: 'DEMO1', start: '2027-01-04', goLive: '2027-09-01', packages: ['$TMP', 'ZTEST'] },
  workstreams: [{ code: 'SD' }], wbs: [{ id: 'W1', type: 'wricef', label: 'Upload', wricef: { kind: 'C', stage: 'build', objects: ['ZSD_TEST_UPLOAD'] } }] };

describe('project actuals — reads that hit the row limit are said; texts in 200-key reads', () => {
  it('a package that alone fills a read ($TMP) → an errors line and truncated: ["TADIR"]; E07T in 200-key reads', async () => {
    const { client, calls } = fakeClient(450);
    const a = await collectActuals(model, { client, today: '2027-03-01' });
    expect(a.transports).toHaveLength(450);
    expect(calls.filter((s) => s.includes('FROM E07T'))).toHaveLength(3); // 450 keys → 200 + 200 + 50
    expect(a.truncated).toEqual(['TADIR']);
    expect(a.errors.find((e: string) => e.startsWith('TADIR:'))).toMatch(/^TADIR: first 5000 rows only for \$TMP — /);
    expect(a.objects).toBe(6);
  });

  it('nothing cut → no truncated field and no note', async () => {
    const { client } = fakeClient(3);
    const a = await collectActuals({ ...model, project: { ...model.project, packages: ['ZTEST'] } }, { client, today: '2027-03-01' });
    expect(a.truncated).toBeUndefined();
    expect(a.errors.filter((e: string) => /rows only/.test(e))).toEqual([]);
  });

  it('the task / request reads after E071 report a cut too; readIn reports a LIKE-path value (SELECT / JOIN / FROM in it) that fills a read', async () => {
    const calls: string[] = [];
    const client = {
      cache: new Map(),
      async callTool({ arguments: a }: any) {
        const sql: string = a.sql_query; calls.push(sql);
        const table = /FROM (\w+)/.exec(sql)![1];
        let rows: any[] = [], truncated = false;
        if (table === 'E071') rows = [{ TRKORR: 'DEVK900003', OBJ_NAME: 'ZSD_TEST_UPLOAD' }];
        if (table === 'E070' && sql.includes("'DEVK900003'")) { truncated = true; rows = [{ TRKORR: 'DEVK900003', STRKORR: 'DEVK900002' }]; } // the task read is cut
        if (table === 'E070' && sql.includes("'DEVK900002'") && !sql.includes('DEVK900003')) rows = [{ TRKORR: 'DEVK900002', TRSTATUS: 'R' }];
        if (table === 'TADIR' && / LIKE /.test(sql)) { truncated = true; rows = [{ OBJECT: 'PROG', OBJ_NAME: 'ZSELECT_TOOL', DEVCLASS: 'ZSELECT_JOIN', AUTHOR: 'U1', CREATED_ON: '20270110' }]; }
        return { content: [{ text: JSON.stringify({ rows, truncated }) }] };
      },
      async close() {},
    };
    const a = await collectActuals({ ...model, project: { ...model.project, packages: ['ZSELECT_JOIN'] } }, { client, today: '2027-03-01' });
    expect(calls.some((s) => / LIKE /.test(s))).toBe(true); // the guard path ran for the package name
    expect(a.truncated).toEqual(['TADIR', 'E070']);
    expect(a.errors.find((e: string) => e.startsWith('TADIR:'))).toMatch(/for ZSELECT_JOIN — /);
    expect(a.errors.find((e: string) => e.startsWith('E070:'))).toMatch(/for DEVK900003 — /);
    expect(a.evidence[0].trs).toEqual(['DEVK900002']);
  });

  it('an answer without a truncated flag (GetSqlQuery on S/4) that comes back full is taken as cut; DWINACTV in 200-name reads', async () => {
    const calls: string[] = [];
    const client = {
      cache: new Map(),
      async callTool({ arguments: a }: any) {
        const sql: string = a.sql_query; calls.push(sql);
        const table = /FROM (\w+)/.exec(sql)![1];
        let rows: any[] = [];
        // no `truncated` in any answer — only the row count tells
        if (table === 'TADIR' && sql.includes("'$TMP'")) rows = Array.from({ length: a.row_number }, (_, i) => ({ OBJECT: 'PROG', OBJ_NAME: `ZTMP_${i}`, DEVCLASS: '$TMP', AUTHOR: 'U1', CREATED_ON: '20270110' }));
        return { content: [{ text: JSON.stringify({ rows }) }] };
      },
      async close() {},
    };
    const a = await collectActuals({ ...model, project: { ...model.project, packages: ['$TMP'] } }, { client, today: '2027-03-01' });
    expect(a.objects).toBe(5000);
    expect(a.truncated).toEqual(['TADIR']);
    expect(a.errors.find((e: string) => e.startsWith('TADIR:'))).toMatch(/for \$TMP — /);
    expect(calls.filter((s) => s.includes('FROM DWINACTV'))).toHaveLength(26); // 5001 names → 25 × 200 + 1
  });

  it('noteTruncated: readTable (true) and readIn (values) forms, one table listed once', () => {
    const errors: string[] = [], t: string[] = [];
    noteTruncated('E070', { truncated: true }, errors, t);
    noteTruncated('E070', { truncated: true }, errors, t);
    noteTruncated('E071', { truncated: ['A', 'B', 'C', 'D', 'E', 'F'] }, errors, t);
    noteTruncated('E07T', { truncated: [] }, errors, t);
    expect(t).toEqual(['E070', 'E071']);
    expect(errors[2]).toMatch(/^E071: first 5000 rows only for A, B, C, D, E … — /);
  });
});
