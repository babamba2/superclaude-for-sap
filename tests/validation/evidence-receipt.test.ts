import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildReceipt, ledgerEntry, parseAunit, projectRoot, responseText } from '../../scripts/evidence/lib.mjs';
import { decide } from '../../scripts/evidence/guard.mjs';

const ROOT = join(__dirname, '..', '..');
const NS = 'mcp__plugin_sc4sap_sap__';
// MCP handlers answer { isError, content: [{ type: 'text', text: JSON }] } (return_response).
const mcp = (data: unknown, isError = false) => ({ isError, content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

const AUNIT_OK = `<?xml version="1.0" encoding="utf-8"?><aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit" xmlns:adtcore="http://www.sap.com/adt/core">
<program adtcore:uri="/sap/bc/adt/programs/programs/zmmr0010" adtcore:type="PROG/P" adtcore:name="ZMMR0010"><testClasses>
<testClass adtcore:name="LTCL_CALC"><testMethods>
<testMethod adtcore:name="SUM_OK" executionTime="0"/>
<testMethod adtcore:name="EMPTY_INPUT" executionTime="0"><alerts><alert kind="warning" severity="tolerable"><title>Slow</title></alert></alerts></testMethod>
</testMethods></testClass></testClasses></program></aunit:runResult>`;
const AUNIT_FAIL = AUNIT_OK.replace('<testMethod adtcore:name="SUM_OK" executionTime="0"/>',
  '<testMethod adtcore:name="SUM_OK" executionTime="0"><alerts><alert kind="failedAssertion" severity="critical"><title>Critical Assertion Error: Sum</title></alert></alerts></testMethod>');

let clock = 0;
const at = () => new Date(Date.UTC(2026, 10, 10, 9, 0, clock++));
const entry = (tool: string, tool_input: unknown, tool_response?: unknown) =>
  ledgerEntry({ tool_name: NS + tool, tool_input, tool_response, session_id: 's1' }, at());

const write = (name: string) => entry('UpdateProgram', { program_name: name, source_code: '...', transport_request: 'HKDK900001' });
const activate = (names: string[], failed: string[] = []) =>
  entry('ActivateObjects', { objects: names.map((name) => ({ name, type: 'PROG/P' })) },
    mcp({ success: failed.length === 0, objects: names.map((name) => ({ name, status: failed.includes(name) ? 'failed' : 'activated' })), errors: failed.map((n) => ({ message: `${n}: syntax error line 12` })) }));
const inactive = (names: string[]) => entry('GetInactiveObjects', {}, mcp({ success: true, count: names.length, objects: names.map((name) => ({ name, type: 'PROG/I' })) }));
const legacyRun = (xml: string) => entry('RunUnitTest', { tests: [{ container_class: 'ZMMR0010', test_class: 'LTCL_CALC', container_type: 'PROG' }] },
  mcp({ success: true, run_id: 'legacy-sync', run_result: xml }));
const byId = (r: { checks: { id: string; status: string; result: string }[] }, id: string) => r.checks.find((c) => c.id === id)!;

describe('evidence ledger entries', () => {
  it('reads every response shape Claude Code may pass', () => {
    expect(responseText(mcp({ a: 1 }))).toContain('"a": 1');
    expect(responseText(mcp({ a: 1 }).content)).toContain('"a": 1');
    expect(responseText('plain')).toBe('plain');
  });

  it('ignores non-SAP and read-only calls, records writes by name', () => {
    expect(ledgerEntry({ tool_name: 'Bash', tool_input: {} })).toBeNull();
    expect(entry('GetProgram', { program_name: 'ZMMR0010' })).toBeNull();
    expect(entry('CreateTransport', { description: 'x' })).toBeNull();
    expect(write('zmmr0010top')).toMatchObject({ kind: 'write', names: ['ZMMR0010TOP'] });
  });

  it('parses ABAP Unit XML — tolerable alerts pass, critical alerts fail', () => {
    expect(parseAunit(AUNIT_OK)).toMatchObject({ methods: 2, failed: 0, programs: ['ZMMR0010'] });
    expect(parseAunit(AUNIT_FAIL)).toMatchObject({ methods: 2, failed: 1, failed_methods: ['SUM_OK'] });
    expect(parseAunit('not xml')).toBeNull();
  });
});

describe('receipt verdicts', () => {
  it('PASS when activation, inactive list and tests all line up', () => {
    const r = buildReceipt([write('ZMMR0010'), write('ZMMR0010F01'), activate(['ZMMR0010', 'ZMMR0010F01']), inactive(['ZOTHER']), legacyRun(AUNIT_OK)], 'zmmr0010', { unitTestRequired: true });
    expect(r.verdict).toBe('PASS');
    expect(byId(r, 'unit_test').result).toBe('2 test method(s), 0 failed');
  });

  it('FAIL when an object failed or changed after activation', () => {
    expect(byId(buildReceipt([write('ZMMR0010'), activate(['ZMMR0010'], ['ZMMR0010'])], 'ZMMR0010'), 'activation').status).toBe('FAIL');
    const r = buildReceipt([write('ZMMR0010F01'), activate(['ZMMR0010F01']), write('ZMMR0010F01'), inactive([])], 'ZMMR0010');
    expect(byId(r, 'activation').result).toContain('changed after its last activation: ZMMR0010F01');
    expect(r.verdict).toBe('FAIL');
  });

  it('FAIL names objects written but never activated separately from stale ones', () => {
    const r = buildReceipt([write('ZMMR0010'), write('ZMMR0010TOP'), activate(['ZMMR0010']), inactive([])], 'ZMMR0010');
    expect(byId(r, 'activation').status).toBe('FAIL');
    expect(byId(r, 'activation').result).toContain('no activation recorded after the write: ZMMR0010TOP');
    expect(byId(r, 'activation').result).not.toContain('changed after its last activation');
  });

  it('FAIL when an own object is still inactive; an inactive list older than the last change does not count', () => {
    expect(byId(buildReceipt([write('ZMMR0010'), activate(['ZMMR0010']), inactive(['ZMMR0010I01'])], 'ZMMR0010'), 'inactive').status).toBe('FAIL');
    const old = buildReceipt([activate(['ZMMR0010']), inactive([]), write('ZMMR0010'), activate(['ZMMR0010'])], 'ZMMR0010');
    expect(byId(old, 'inactive').status).toBe('NOT RUN');
  });

  it('unit tests: failure, zero methods, async result by run_id, stale run', () => {
    expect(byId(buildReceipt([legacyRun(AUNIT_FAIL)], 'ZMMR0010'), 'unit_test').result).toContain('SUM_OK');
    expect(byId(buildReceipt([legacyRun('<aunit:runResult></aunit:runResult>')], 'ZMMR0010'), 'unit_test').status).toBe('NOT RUN');
    const run = entry('RunUnitTest', { tests: [{ container_class: 'ZCL_MM_CALC', test_class: 'LTCL' }] }, mcp({ success: true, run_id: 'R42' }));
    const res = entry('GetUnitTestResult', { run_id: 'R42' }, mcp({ success: true, run_id: 'R42', run_result: AUNIT_OK.replace(/ZMMR0010/g, 'ZCL_MM_CALC') }));
    expect(byId(buildReceipt([run, res], 'ZMMR0010', { also: ['ZCL_MM_CALC'] }), 'unit_test').status).toBe('PASS');
    const stale = buildReceipt([legacyRun(AUNIT_OK), write('ZMMR0010')], 'ZMMR0010');
    expect(byId(stale, 'unit_test').result).toContain('code changed after this run');
  });

  it('INCOMPLETE without any evidence; optional unit test NOT RUN does not block', () => {
    expect(buildReceipt([], 'ZMMR0010').verdict).toBe('INCOMPLETE');
    const r = buildReceipt([write('ZMMR0010'), activate(['ZMMR0010']), inactive([])], 'ZMMR0010');
    expect(r.verdict).toBe('PASS');
    expect(buildReceipt([write('ZMMR0010'), activate(['ZMMR0010']), inactive([])], 'ZMMR0010', { unitTestRequired: true }).verdict).toBe('INCOMPLETE');
  });

  it('other programs never leak into the receipt', () => {
    const r = buildReceipt([write('ZSDR0001'), activate(['ZSDR0001'], ['ZSDR0001']), inactive(['ZSDR0001'])], 'ZMMR0010');
    expect(byId(r, 'activation').status).toBe('NOT RUN');
    expect(byId(r, 'inactive').status).toBe('NOT RUN');
  });
});

describe('hooks end to end', () => {
  const run = (script: string, payload: unknown, args: string[] = []) =>
    spawnSync(process.execPath, [join(ROOT, 'scripts', 'evidence', script), ...args], { input: JSON.stringify(payload), encoding: 'utf-8', env: { ...process.env, DISABLE_SC4SAP: '' } });

  it('record.mjs writes the ledger, build-receipt.mjs writes the receipt', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc4sap-evidence-'));
    const call = (tool: string, tool_input: unknown, tool_response?: unknown) => run('record.mjs', { tool_name: NS + tool, tool_input, tool_response, cwd: dir, session_id: 's1' });
    call('UpdateProgram', { program_name: 'ZMMR0010' });
    call('ActivateObjects', { objects: [{ name: 'ZMMR0010' }] }, mcp({ success: true, objects: [{ name: 'ZMMR0010', status: 'activated' }] }));
    call('GetInactiveObjects', {}, mcp({ success: true, count: 0, objects: [] }));
    expect(readFileSync(join(dir, '.sc4sap', 'evidence', 'ledger.jsonl'), 'utf-8').trim().split('\n')).toHaveLength(3);
    const b = spawnSync(process.execPath, [join(ROOT, 'scripts', 'evidence', 'build-receipt.mjs'), 'ZMMR0010', '--root', dir], { encoding: 'utf-8' });
    expect(b.status).toBe(0);
    expect(b.stdout).toContain('PASS');
    expect(existsSync(join(dir, '.sc4sap', 'program', 'ZMMR0010', 'receipt.json'))).toBe(true);
    expect(spawnSync(process.execPath, [join(ROOT, 'scripts', 'evidence', 'build-receipt.mjs'), 'ZMMR0010', '--root', dir, '--unit-test', 'required'], { encoding: 'utf-8' }).status).toBe(2);
  });

  it('project root never climbs into the home profile store', () => {
    const dir = mkdtempSync(join(homedir(), '.sc4sap-root-test-'));
    try {
      expect(projectRoot(dir)).toBe(dir);
      mkdirSync(join(dir, '.sc4sap'));
      expect(projectRoot(join(dir, '.sc4sap'))).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('project root ignores a stray .sc4sap nested inside the state tree', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sc4sap-nested-root-'));
    try {
      const progDir = join(dir, '.sc4sap', 'program', 'ZMMR0010');
      mkdirSync(join(progDir, '.sc4sap', 'state'), { recursive: true });
      expect(projectRoot(progDir)).toBe(dir);
      expect(projectRoot(join(progDir, '.sc4sap'))).toBe(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('guard denies agent writes to the ledger and receipts only', () => {
    expect(decide({ tool_name: 'Write', tool_input: { file_path: 'C:/p/.sc4sap/program/ZMMR0010/receipt.json' } })).toBeTruthy();
    expect(decide({ tool_name: 'Edit', tool_input: { file_path: '/p/.sc4sap/evidence/ledger.jsonl' } })).toBeTruthy();
    expect(decide({ tool_name: 'Bash', tool_input: { command: 'echo {} >> .sc4sap/evidence/ledger.jsonl' } })).toBeTruthy();
    expect(decide({ tool_name: 'PowerShell', tool_input: { command: 'Remove-Item -Recurse .sc4sap\\evidence' } })).toBeTruthy();
    expect(decide({ tool_name: 'Write', tool_input: { file_path: '/p/.sc4sap/program/ZMMR0010/report.md' } })).toBeNull();
    expect(decide({ tool_name: 'Write', tool_input: { file_path: '/other/receipt.json' } })).toBeNull();
    expect(decide({ tool_name: 'Bash', tool_input: { command: 'node "C:/x/scripts/evidence/build-receipt.mjs" ZMMR0010 --also ZCL_A' } })).toBeNull();
    expect(decide({ tool_name: 'Read', tool_input: { file_path: '/p/.sc4sap/evidence/ledger.jsonl' } })).toBeNull();
    const out = JSON.parse(run('guard.mjs', { tool_name: 'Write', tool_input: { file_path: '/p/.sc4sap/evidence/x' } }).stdout);
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
  });
});
