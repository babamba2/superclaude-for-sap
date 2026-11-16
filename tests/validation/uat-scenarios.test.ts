import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyPatch, listOf, normalize, progress, validate } from '../../scripts/uat/uat-model.mjs';
import { layoutA, layoutB } from '../../scripts/uat/uat-xlsx.mjs';
import { unzipEntries } from '../../scripts/spec/xlsx-zip.mjs';

const sample = () => ({
  id: 'MM-UAT', module: 'mm', title: 'MM purchasing UAT', cycles: ['1st', '2nd'],
  scenarios: [
    {
      id: 'MM01', theme: 'Procure to pay', process: 'Purchase order', title: 'Standard PO to goods receipt',
      steps: [
        { activity: 'Create purchase requisition', tcode: 'me51n', checks: '■ Document type NB / ■ Fixed vendor', inputs: ['Plant', 'Material'], outputs: ['PR number'], user: 'MMTEST01' },
        { activity: 'Convert PR to PO', tcode: 'ME21N', outputs: 'PO number' },
        { activity: 'Goods receipt from the warehouse system', system: 'WMS', checks: ['Movement type 101'] },
      ],
    },
  ],
});

describe('uat-scenarios model', () => {
  it('normalizes ids, step numbers, lists and T-codes', () => {
    const set = normalize(sample());
    expect(set.module).toBe('MM');
    expect(set.scenarios[0].steps.map((s) => s.id)).toEqual(['STEP-001', 'STEP-002', 'STEP-003']);
    expect(set.scenarios[0].steps[0]).toMatchObject({ tcode: 'ME51N', checks: ['Document type NB', 'Fixed vendor'], status: 'open', results: { '1st': '', '2nd': '' } });
    expect(listOf('■ a\n■ b')).toEqual(['a', 'b']);
  });

  it('flags what a reviewer would flag', () => {
    const issues = validate(normalize(sample()));
    expect(issues.some((i) => i.path === 'MM01/STEP-003' && /T-code/.test(i.text))).toBe(false); // WMS step: no T-code needed
    const noCheck = normalize({ ...sample(), scenarios: [{ id: 'X', title: 'x', steps: [{ activity: 'a', tcode: 'VA01' }] }] });
    expect(validate(noCheck).map((i) => i.text)).toContain('nothing to check: no expected output and no check point');
  });

  it('applies a proposal operation by operation and skips what it cannot place', () => {
    const set = normalize(sample());
    const { set: next, applied, skipped } = applyPatch(set, [
      { op: 'set-step', scenario: 'MM01', step: 'STEP-002', field: 'checks', value: ['Release strategy triggered'] },
      { op: 'add-step', scenario: 'MM01', after: 'STEP-001', step: { activity: 'Release purchase requisition', tcode: 'ME54N' } },
      { op: 'set-step', scenario: 'MM01', step: 'STEP-009', field: 'activity', value: 'x' },
      { op: 'set-step', scenario: 'MM01', step: 'STEP-001', field: 'result', cycle: '1st', value: 'pass' },
      { op: 'add-scenario', scenario: { id: 'MM02', title: 'Return to vendor', steps: [{ activity: 'Return delivery', tcode: 'MIGO' }] } },
    ]);
    expect(applied).toEqual([0, 1, 3, 4]);
    expect(skipped).toEqual([{ index: 2, op: 'set-step', why: 'step not found' }]);
    const steps = next.scenarios[0].steps;
    expect(steps.map((s) => s.activity)).toEqual(['Create purchase requisition', 'Release purchase requisition', 'Convert PR to PO', 'Goods receipt from the warehouse system']);
    expect(steps.map((s) => s.id)).toEqual(['STEP-001', 'STEP-002', 'STEP-003', 'STEP-004']);
    expect(steps[2].checks).toEqual(['Release strategy triggered']);
    expect(steps[0].results['1st']).toBe('pass');
    expect(next.scenarios[1].id).toBe('MM02');
    expect(set.scenarios[0].steps).toHaveLength(3); // the original is untouched
    expect(progress(next).byCycle['1st']).toEqual({ pass: 1, fail: 0, blocked: 0, open: 4 });
  });
});

describe('uat-scenarios xlsx', () => {
  const sheetText = (buf: Buffer) => {
    const files = unzipEntries(buf);
    return Object.fromEntries(files.map((f: { name: string; data: Buffer }) => [f.name, f.data.toString('utf8')]));
  };

  it('layout A has a schedule, the activities and one sheet per scenario', () => {
    const files = sheetText(layoutA(normalize(sample())));
    expect(files['xl/workbook.xml']).toMatch(/name="Schedule".*name="Activities".*name="MM01"/);
    expect(files['xl/worksheets/sheet3.xml']).toContain('Test Procedure');
    expect(files['xl/worksheets/sheet3.xml']).toContain('■ Document type NB');
  });

  it('layout B is one flat list with a cycle column each and a test-user sheet of IDs', () => {
    const files = sheetText(layoutB(normalize(sample())));
    expect(files['xl/worksheets/sheet1.xml']).toContain('STEP-003');
    expect(files['xl/worksheets/sheet1.xml']).toContain('>1st<');
    expect(files['xl/worksheets/sheet2.xml']).toContain('MMTEST01');
  });

  it('escapes XML and keeps sheet names valid', () => {
    const set = normalize({ ...sample(), scenarios: [{ id: 'A/B', title: '<x> & "y"', steps: [{ activity: 'a\u0001b', tcode: 'X' }] }] });
    const files = sheetText(layoutA(set));
    expect(files['xl/workbook.xml']).toContain('name="A B"');
    expect(files['xl/worksheets/sheet3.xml']).toContain('&lt;x&gt; &amp; &quot;y&quot;');
    expect(files['xl/worksheets/sheet3.xml']).not.toContain('\u0001');
  });
});

describe('uat-scenarios CLI', () => {
  it('init → patch → export round trip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'uat-'));
    const cli = (...a: string[]) => JSON.parse(execFileSync(process.execPath, [join(__dirname, '..', '..', 'scripts', 'uat', 'build-uat.mjs'), ...a], { encoding: 'utf8' }));
    try {
      writeFileSync(join(dir, 'answers.json'), JSON.stringify(sample()));
      expect(cli('init', '--answers', join(dir, 'answers.json'), '--dir', dir)).toMatchObject({ ok: true });
      writeFileSync(join(dir, 'ops.json'), JSON.stringify([{ op: 'set-scenario', scenario: 'MM01', field: 'owner', value: 'Purchasing lead' }]));
      expect(cli('patch', '--dir', dir, '--id', 'MM-UAT', '--patch', join(dir, 'ops.json'))).toMatchObject({ ok: true, applied: 1 });
      expect(JSON.parse(readFileSync(join(dir, 'MM-UAT', 'MM-UAT-uat.json'), 'utf8')).scenarios[0].owner).toBe('Purchasing lead');
      const out = cli('export', '--dir', dir, '--id', 'MM-UAT', '--layout', 'B');
      expect(out.file).toMatch(/MM-UAT-uat-B\.xlsx$/);
      expect(readFileSync(out.file).subarray(0, 2).toString()).toBe('PK');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
