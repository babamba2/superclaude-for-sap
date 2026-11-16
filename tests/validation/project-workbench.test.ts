import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { instantiate, addWricef } from '../../scripts/project/project-template.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { applyPatch, PATCH_FIELDS } from '../../scripts/project/project-patch.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { projectWorkbook, projectXlsx } from '../../scripts/project/project-xlsx.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { summary } from '../../scripts/project/project-model.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { unzipEntries } from '../../scripts/spec/xlsx-zip.mjs';
// @ts-expect-error — plain .mjs script, no type declarations
import { seedCutover } from '../../scripts/project/cutover-model.mjs';

// a fictitious project only: no customer names, systems or Z objects
const TEAM = [{ id: 'PM1', name: 'PM', role: 'pm' }, { id: 'SD1', name: 'SD consultant', role: 'module', module: 'SD' }, { id: 'DEV1', name: 'Developer', role: 'dev', module: 'SD' }];
const base = () => {
  const m = addWricef(instantiate({ code: 'DEMO1', name: 'Demo', type: 'implementation', start: '2027-01-04', goLive: '2027-06-01', modules: ['SD'], team: TEAM }),
    [{ label: 'Upload', kind: 'C', module: 'SD' }]).model;
  m.risks = [{ id: 'RK1', text: 'Data late', impact: 'H', status: 'open', owner: 'SD1', due: '2027-02-01' }];
  m.decisions = [{ id: 'DC1', text: 'Pick a tool', status: 'open' }];
  m.milestones[0].criteria = ['No blocked request [cts-blocked<=0]', 'Sign-off'];
  m.cutover = seedCutover(m, JSON.parse(readFileSync(join(__dirname, '..', '..', 'scripts', 'project', 'cutover-tasks.json'), 'utf8'))).model.cutover;
  return m;
};

describe('project workbench — applyPatch (AI text only)', () => {
  it('applies text ops and adds open risks / decisions without owner or due', () => {
    const m = base();
    const ms = m.milestones[0].id;
    const task = m.cutover?.tasks?.[0]?.id, gng = m.cutover?.goNoGo?.[0]?.id;
    expect(task && gng).toBeTruthy();
    const ops: any[] = [
      { op: 'set-text', target: 'risk', id: 'RK1', field: 'text', value: '  Master data arrives late  ' },
      { op: 'set-text', target: 'decision', id: 'DC1', field: 'note', value: 'Compare two options' },
      { op: 'set-text', target: 'milestone-criterion', id: ms, index: 0, field: 'text', value: 'No request blocked' },
      { op: 'set-text', target: 'status', field: 'comment', value: 'On track; data load at risk.' },
      { op: 'add-risk', text: 'Key user leave', impact: 'M' },
      { op: 'add-decision', text: 'Freeze date' },
      ...(task ? [{ op: 'set-text', target: 'cutover-task', id: task, field: 'label', value: 'Announce the freeze' }] : []),
      ...(gng ? [{ op: 'set-text', target: 'gonogo', id: gng, field: 'text', value: 'All P1 defects closed' }] : []),
    ];
    const r = applyPatch(m, ops, { today: '2027-01-10' });
    expect(r.skipped).toEqual([]);
    expect(r.applied).toHaveLength(ops.length);
    expect(r.model.risks[0].text).toBe('Master data arrives late');
    expect(r.model.risks[0]).toMatchObject({ owner: 'SD1', due: '2027-02-01', impact: 'H', status: 'open' });
    expect(r.model.milestones[0].criteria[0]).toBe('No request blocked [cts-blocked<=0]'); // the rule tag stays
    expect(r.model.status.comment).toBe('On track; data load at risk.');
    expect(r.model.risks.at(-1)).toEqual({ id: 'RK2', text: 'Key user leave', impact: 'M', status: 'open', raised: '2027-01-10' });
    expect(r.model.decisions.at(-1)).toEqual({ id: 'DC2', text: 'Freeze date', status: 'open' });
    if (task) expect(r.model.cutover.tasks[0].label).toBe('Announce the freeze');
    if (gng) expect(r.model.cutover.goNoGo[0].text).toBe('All P1 defects closed');
    expect(m.risks[0].text).toBe('Data late'); // input untouched
  });

  it('refuses dates, statuses, owners, progress, stages, baselines, ids and unknown ops', () => {
    const m = base();
    const w = m.wbs.find((x: any) => x.type === 'wricef');
    const bad: any[] = [
      { op: 'set-text', target: 'risk', id: 'RK1', field: 'due', value: '2027-09-09' },
      { op: 'set-text', target: 'risk', id: 'RK1', field: 'status', value: 'closed' },
      { op: 'set-text', target: 'risk', id: 'RK1', field: 'owner', value: 'DEV1' },
      { op: 'set-text', target: 'risk', id: 'RK1', field: 'impact', value: 'L' },
      { op: 'set-text', target: 'decision', id: 'DC1', field: 'status', value: 'decided' },
      { op: 'set-text', target: 'wbs', id: w.id, field: 'pct', value: '100' },
      { op: 'set-text', target: 'wbs', id: w.id, field: 'label', value: 'x' },
      { op: 'set-text', target: 'milestone', id: m.milestones[0].id, field: 'forecast', value: '2027-12-01' },
      { op: 'set-text', target: 'status', field: 'overall', value: 'green' },
      { op: 'set-text', target: 'cutover-task', id: 'X', field: 'durationH', value: '9' },
      { op: 'set-stage', id: w.id, value: 'done' },
      { op: 'add-risk', text: 'x', owner: 'SD1' },
      { op: 'add-risk', text: 'x', due: '2027-01-01' },
      { op: 'add-risk', text: 'x', impact: 'Z' },
      { op: 'add-decision', text: '' },
      { op: 'set-text', target: 'risk', id: 'NOPE', field: 'text', value: 'x' },
      { op: 'set-text', target: 'risk', id: 'RK1', field: 'text', value: 42 },
      { op: 'set-text', target: 'risk', id: 'RK1', field: 'text', value: 'x'.repeat(2001) },
      { op: 'set-text', target: 'milestone-criterion', id: m.milestones[0].id, index: 9, field: 'text', value: 'x' },
      null,
    ];
    const r = applyPatch(m, bad);
    expect(r.applied).toEqual([]);
    expect(r.skipped.map((s: any) => s.index)).toEqual(bad.map((_, i) => i));
    expect(r.model.risks).toEqual(m.risks);
    expect(Object.keys(PATCH_FIELDS)).toEqual(['risk', 'decision', 'milestone-criterion', 'cutover-task', 'gonogo', 'status']);
  });
});

describe('project workbench — Excel export', () => {
  it('writes the eight sheets as a valid xlsx package (ko / en names)', () => {
    const m = base();
    m.statusLog = [{ weekEnd: '2027-03-05', overall: 'amber', computed: 'green', ws: { SD: 'amber' }, risks: ['RK1'], decisions: [], comment: 'c' }];
    for (const [lang, names] of [['ko', ['요약', '마일스톤과 기준', 'WBS', '리스크', '결정', '컷오버 작업', 'Go-No-Go', '주간 현황 이력']],
      ['en', ['Summary', 'Milestones and criteria', 'WBS', 'Risks', 'Decisions', 'Cutover tasks', 'Go-No-Go', 'Weekly status log']]] as const) {
      const buf = projectWorkbook(m, { today: '2027-03-06', lang });
      const files = unzipEntries(buf).map((e: any) => e.name);
      expect(files).toEqual(expect.arrayContaining(['[Content_Types].xml', 'xl/workbook.xml', 'xl/styles.xml', ...names.map((_, i) => `xl/worksheets/sheet${i + 1}.xml`)]));
      const wb = Buffer.from(unzipEntries(buf).find((e: any) => e.name === 'xl/workbook.xml').data).toString('utf8');
      expect([...wb.matchAll(/<sheet name="([^"]+)"/g)].map((x) => x[1])).toEqual(names);
      const wbs = Buffer.from(unzipEntries(buf).find((e: any) => e.name === 'xl/worksheets/sheet3.xml').data).toString('utf8');
      expect(wbs).toContain('Upload');
      const log = Buffer.from(unzipEntries(buf).find((e: any) => e.name === 'xl/worksheets/sheet8.xml').data).toString('utf8');
      expect(log).toContain('2027-03-05');
    }
  });
});

describe('project workbench — web call forms', () => {
  it('a criterion addressed as "<milestone id>:<index>", a status op with an id, projectXlsx and the list card summary', () => {
    const m = base();
    const ms = m.milestones[0].id;
    const r = applyPatch(m, [
      { op: 'set-text', target: 'milestone-criterion', id: `${ms}:1`, field: 'text', value: 'Signed by the sponsor' },
      { op: 'set-text', target: 'status', id: '2027-03-05', field: 'comment', value: 'Fine' },
      { op: 'set-text', target: 'milestone-criterion', id: `${ms}:7`, field: 'text', value: 'x' },
    ]);
    expect(r.model.milestones[0].criteria[1]).toBe('Signed by the sponsor');
    expect(r.model.status.comment).toBe('Fine');
    expect(r.skipped).toEqual([{ index: 2, why: 'criterion index not found' }]);
    expect(Buffer.isBuffer(projectXlsx(m, { today: '2027-03-06' }))).toBe(true);
    const s = summary({ ...m, statusLog: [{ weekEnd: '2027-03-05' }, { weekEnd: '2027-02-26' }] }, '2027-03-06');
    expect(s).toMatchObject({ kind: 'project', code: 'DEMO1', name: 'Demo', type: 'implementation', goLive: '2027-06-01', dDay: 87, lastWeek: '2027-03-05', risksOpen: 1 });
    expect(['red', 'amber', 'green']).toContain(s.overall);
  });
});

describe('project workbench — prototype keys never reach the allow-list', () => {
  it('a target named constructor / __proto__ / toString is skipped, the rest of the batch applies', () => {
    const m = base();
    const ops: any[] = [];
    for (const t of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) ops.push({ op: 'set-text', target: t, id: 'RK1', field: 'text', value: 'x' });
    for (const f of ['constructor', '__proto__', 'toString']) ops.push({ op: 'set-text', target: 'risk', id: 'RK1', field: f, value: 'x' });
    ops.push(JSON.parse('{"op":"add-risk","text":"y","__proto__":{"owner":"SD1"}}'));
    ops.push({ op: 'set-text', target: 'risk', id: 'RK1', field: 'text', value: 'still applied' });
    const r = applyPatch(m, ops);
    expect(r.skipped.map((s: any) => s.index)).toEqual(ops.slice(0, -1).map((_, i) => i));
    expect(r.applied).toHaveLength(1);
    expect(r.model.risks[0].text).toBe('still applied');
    expect(({} as any).owner).toBeUndefined();
  });
});
