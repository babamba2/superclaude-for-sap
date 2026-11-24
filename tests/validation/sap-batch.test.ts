import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM script without types
import { buildCalls, isReadTool, pickValue, refuseDataRead } from '../../scripts/lib/sap-batch.mjs';

describe('sap-batch: read-only allow list', () => {
  it('passes reads, refuses writes and code execution', () => {
    const tool = (name: string, description = '') => ({ name, description });
    for (const n of ['GetProgFullCode', 'GetTable', 'ReadClass', 'SearchObject', 'ListTransports', 'DescribeByList'])
      expect(isReadTool(tool(n))).toBe(true);
    expect(isReadTool(tool('RunBusinessQuery', '[read-only] Run a query business action'))).toBe(true);
    for (const n of ['UpdateProgram', 'DeleteProgram', 'CreateTransport', 'ActivateObjects', 'PreviewBusinessAction',
      'ExecuteBusinessAction', 'RunUnitTest', 'RuntimeRunProgramWithProfiling', 'PatchGuiStatus', 'WriteTextElementsBulk'])
      expect(isReadTool(tool(n, 'Changes things'))).toBe(false);
  });
});

describe('sap-batch: data reads stay with the permission flow', () => {
  const dd = { sql_query: "SELECT TABNAME, FIELDNAME FROM DD03L WHERE TABNAME IN ( 'ZA', 'ZB' )", row_number: 500, output: 'file' };
  it('runs GetSqlQuery only in the DD metadata shape', () => {
    expect(refuseDataRead({ tool: 'GetSqlQuery', args: dd })).toBeNull();
    expect(refuseDataRead({ tool: 'GetSqlQuery', args: { ...dd, output: undefined } })).toMatch(/DD\* metadata/);
    expect(refuseDataRead({ tool: 'GetSqlQuery', args: { sql_query: 'SELECT EBELN FROM EKKO', output: 'file' } }))
      .toMatch(/DD\* metadata/);
  });
  it('never sends acknowledge_risk and never reads table contents', () => {
    expect(refuseDataRead({ tool: 'GetSqlQuery', args: { ...dd, acknowledge_risk: true } })).toMatch(/acknowledge_risk/);
    expect(refuseDataRead({ tool: 'GetTableContents', args: { table_name: 'T001' } })).toMatch(/reads rows/);
    expect(refuseDataRead({ tool: 'GetRemoteTableContents', args: {} })).toMatch(/reads rows/);
    expect(refuseDataRead({ tool: 'GetProgFullCode', args: { name: 'Z1', type: 'PROG/P' } })).toBeNull();
  });
});

describe('sap-batch: pick and call building', () => {
  const result = { folder: 'C:\\out\\src\\z1.prog', code_objects: [{ path: 'C:\\out\\src\\z1.prog\\z1.abap' }, { path: 'x' }],
    fields: [{ name: 'MANDT' }, { name: 'EBELN' }] };
  it('picks dotted paths, array wildcards and parent folders', () => {
    expect(pickValue(result, 'folder')).toBe('C:\\out\\src\\z1.prog');
    expect(pickValue(result, 'fields.*.name')).toBe('["MANDT","EBELN"]');
    expect(pickValue(result, 'dir:code_objects.0.path')).toMatch(/z1\.prog$/);
    expect(pickValue(result, 'missing.key')).toBeUndefined();
  });
  it('builds one call per --each item', () => {
    const argv = process.argv;
    process.argv = ['node', 'sap-batch.mjs', '--tool', 'GetProgFullCode', '--each', 'Z1:PROG/P, Z2:FUGR',
      '--keys', 'name,type', '--args', '{"output":"file"}'];
    try {
      expect(buildCalls()).toEqual([
        { id: 'Z1', tool: 'GetProgFullCode', args: { output: 'file', name: 'Z1', type: 'PROG/P' } },
        { id: 'Z2', tool: 'GetProgFullCode', args: { output: 'file', name: 'Z2', type: 'FUGR' } },
      ]);
    } finally {
      process.argv = argv;
    }
  });
});
