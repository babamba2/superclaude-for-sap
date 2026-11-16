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
    expect(progress(next).byCycle['1st']).toEqual({ pass: 1, fail: 0, blocked: 0, 'n/a': 0, open: 4 });
  });
});

describe('uat-scenarios xlsx', () => {
  const sheetText = (buf: Buffer) => {
    const files = unzipEntries(buf);
    return Object.fromEntries(files.map((f: { name: string; data: Buffer }) => [f.name, f.data.toString('utf8')]));
  };

  it('layout A has a schedule, the activities and one sheet per scenario', () => {
    const files = sheetText(layoutA(normalize(sample()), progress(normalize(sample()))));
    expect(files['xl/workbook.xml']).toMatch(/name="Dashboard".*name="Scenario List".*name="Schedule".*name="Activities".*name="MM01".*name="Issue List"/);
    expect(files['xl/worksheets/sheet5.xml']).toContain('Test Procedure');
    expect(files['xl/worksheets/sheet5.xml']).toContain('■ Document type NB');
  });

  it('layout B is one flat list with a cycle column each and a test-user sheet of IDs', () => {
    const files = sheetText(layoutB(normalize(sample()), progress(normalize(sample()))));
    expect(files['xl/worksheets/sheet1.xml']).toContain('STEP-003');
    expect(files['xl/worksheets/sheet1.xml']).toContain('>1st<');
    expect(files['xl/worksheets/sheet4.xml']).toContain('MMTEST01');
  });

  it('escapes XML and keeps sheet names valid', () => {
    const set = normalize({ ...sample(), scenarios: [{ id: 'A/B', title: '<x> & "y"', steps: [{ activity: 'a\u0001b', tcode: 'X' }] }] });
    const files = sheetText(layoutA(set, progress(set)));
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

describe('uat-scenarios integration test (sit)', () => {
  const sit = () => normalize({
    id: 'O2C-SIT', kind: 'sit', module: 'SD', title: 'Order to cash',
    scenarios: [
      {
        id: 'SIT01', title: 'Standard order to payment',
        steps: [
          { module: 'SD', activity: 'Create sales order', tcode: 'VA01', outputs: ['Order number'] },
          { module: 'LE', activity: 'Delivery and goods issue', tcode: 'VL01N', outputs: ['Delivery number'] },
          { module: 'FI', activity: 'Check the goods issue posting', tcode: 'FB03', checks: ['COGS line posted'] },
        ],
      },
      { id: 'SIT02', title: 'One module only', steps: [{ activity: 'Billing', tcode: 'VF01', outputs: ['Invoice'] }] },
    ],
  });

  it('keeps the kind and gives every step a module, the set\'s by default', () => {
    const set = sit();
    expect(set.kind).toBe('sit');
    expect(set.scenarios[1].steps[0].module).toBe('SD');
    expect(normalize({ kind: 'nonsense' }).kind).toBe('uat');
  });

  it('flags a scenario that stays in one module and a hand-off without a check point', () => {
    const texts = validate(sit()).map((i) => `${i.path} ${i.text}`);
    expect(texts).toContain('SIT02 integration scenario stays in one module');
    expect(texts).toContain('SIT01/STEP-002 hand-off SD → LE without a check point');
    expect(texts.some((t) => t.startsWith('SIT01/STEP-003 hand-off'))).toBe(false);
    // A UAT set is not held to the integration rules.
    expect(validate(normalize({ ...sit(), kind: 'uat' })).some((i) => /hand-off|one module/.test(i.text))).toBe(false);
  });

  it('exports the module column and an integration-test title', () => {
    const files = Object.fromEntries(unzipEntries(layoutB(sit(), progress(sit()))).map((f: { name: string; data: Buffer }) => [f.name, f.data.toString('utf8')]));
    expect(files['xl/worksheets/sheet1.xml']).toContain('Order to cash');
    expect(files['xl/worksheets/sheet1.xml']).toContain('>Module<');
    expect(files['xl/worksheets/sheet1.xml']).toContain('>LE<');
  });
});

describe('uat-scenarios — phases, cycle scope, issues, dashboard', () => {
  const sit = () => normalize({
    id: 'O2C-SIT', kind: 'sit', module: 'SD', cycles: ['1st', '2nd', '3rd'],
    scenarios: [
      { id: 'E-100', title: 'Domestic order', company: '1000', leadModule: 'sd', date: '2026-11-01', actualDate: '2026-11-02', result: 'pass',
        steps: [
          { phase: 'I. Order intake', module: 'SD', activity: 'Create order', tcode: 'VA01', checks: ['order saved'], cycles: ['2nd', '3rd', 'bogus'] },
          { phase: 'II. Delivery', module: 'LE', activity: 'Delivery', tcode: 'VL01N', checks: ['delivery created'], results: { '1st': 'fail' } },
        ] },
      { id: 'E-200', title: 'Export order', company: '2000', date: '2099-01-01', steps: [{ module: 'SD', activity: 'Order', tcode: 'VA01', checks: ['x'], results: { '1st': 'n/a' } }] },
    ],
    issues: [{ scenario: 'E-100', step: 'STEP-002', module: 'le', text: 'Route not found', state: 'bogus' }],
  });

  it('keeps phases and cycle scope, numbers issues, and counts only the cycles a step runs in', () => {
    const set = sit();
    expect(set.scenarios[0].steps[0]).toMatchObject({ phase: 'I. Order intake', cycles: ['2nd', '3rd'] });
    expect(set.issues[0]).toMatchObject({ id: 'ISS-0001', module: 'LE', state: 'open' });
    const p = progress(set, '2026-11-16');
    expect(p.byCycle['1st']).toEqual({ pass: 0, fail: 1, blocked: 0, 'n/a': 1, open: 0 });
    expect(p.byModule.SD).toEqual({ plan: 2, due: 1, tested: 1, pass: 1, fail: 0 });
    expect(p.byCompany['2000']).toEqual({ plan: 1, due: 0, tested: 0, pass: 0, fail: 0 });
    expect(p.participation[0]).toEqual({ scenario: 'E-100', modules: ['LE', 'SD'] });
    expect(p.issues.open).toBe(1);
  });

  it('flags a passed scenario with a failed step and a failure with no issue', () => {
    const set = sit();
    expect(validate(set).map((i) => i.text)).toContain('scenario passed but a step failed in 1st');
    const noIssue = { ...set, issues: [] };
    expect(validate(noIssue).some((i) => i.text === 'failed without a logged issue')).toBe(true);
  });

  it('adds, changes and removes issues; issues follow their step when steps move', () => {
    const { set, applied } = applyPatch(sit(), [
      { op: 'add-issue', issue: { scenario: 'E-100', step: 'STEP-001', text: 'Price missing', type: 'data' } },
      { op: 'add-step', scenario: 'E-100', after: undefined, step: { activity: 'Billing', tcode: 'VF01' } },
      { op: 'remove-step', scenario: 'E-100', step: 'STEP-001' },
      { op: 'set-issue', issue: 'ISS-0001', field: 'state', value: 'done' },
    ]);
    expect(applied).toEqual([0, 1, 2, 3]);
    expect(set.issues.map((i) => [i.id, i.step, i.state])).toEqual([['ISS-0001', 'STEP-001', 'done'], ['ISS-0002', '', 'open']]);
    const removed = applyPatch(set, [{ op: 'remove-issue', issue: 'ISS-0002' }]).set;
    expect(removed.issues).toHaveLength(1);
  });
});
