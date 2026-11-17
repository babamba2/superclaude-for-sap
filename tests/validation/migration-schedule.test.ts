/**
 * Migration schedule (the web's /migration "이관 일정"): steps per object and round, the dependency order check,
 * the time view, the editable round list, and the /wbs write back (blanks never overwrite, add-only, flagged).
 */
import { describe, it, expect } from 'vitest';
import { checkMigrationDoc, migrationDocPage, migrationDocXlsx, normalizeMigrationDoc } from '../../scripts/project/migration-doc.mjs';
import { STEPS, ganttRows, issueText, normalizeSchedule, reconOf, rollupOf, scheduleIssues, spanOf, stepsOf } from '../../scripts/project/migration-schedule.mjs';
import { applyMigrationSync, migrationSyncPlan, migrationTaskId } from '../../scripts/project/migration-wbs.mjs';
import { checkModel } from '../../scripts/project/project-model.mjs';

const s = (objectId: string, runId: string, step: string, start: string, end: string, status = 'planned') => ({ objectId, runId, step, start, end, status });
const doc = normalizeMigrationDoc({
  id: 'MIG-1', lang: 'ko', title: '데이터 이관',
  objects: [
    { id: 'O01', name: 'BP 고객', category: 'master', owner: 'kim', ownerType: 'business', approach: 'cockpit' },
    { id: 'O02', name: '자재', category: 'master', owner: 'lee', ownerType: 'it' },
    { id: 'O03', name: '미결 판매오더', category: 'transaction', owner: 'kim', deps: 'O01, O02' },
  ],
  runs: [
    { id: 'M1', planStart: '2027-01-04', planEnd: '2027-01-29' },
    { id: 'FINAL', label: '컷오버', planStart: '2027-03-01', planEnd: '2027-03-07' },
  ],
  rules: [{ id: 'R01', objectId: 'O03', kind: 'count', table: 'VBAK' }],
  results: [{ id: 'x1', runId: 'M1', ruleId: 'R01', verdict: 'ok' }, { id: 'x2', runId: 'M1', ruleId: 'R01', verdict: 'ng' }],
  schedule: [
    s('O01', 'M1', 'extract', '2027-01-04', '2027-01-05', 'done'), s('O01', 'M1', 'load', '2027-01-06', '2027-01-08', 'inprogress'),
    s('O02', 'M1', 'load', '2027-01-05', '2027-01-07'),
    s('O03', 'M1', 'extract', '2027-01-07', '2027-01-09'), s('O03', 'M1', 'signoff', '2027-01-12', '2027-01-12'),
    s('O01', 'FINAL', 'load', '2027-03-01', '2027-03-02'), s('O03', 'FINAL', 'load', '2027-03-03', '2027-03-04'),
  ],
});

describe('schedule model', () => {
  it('normalizes: object fields, deps from text, one row per object / round / step, bad values dropped', () => {
    expect(doc.objects[2]!.deps).toEqual(['O01', 'O02']);
    expect([doc.objects[0]!.category, doc.objects[0]!.ownerType]).toEqual(['master', 'business']);
    expect(normalizeMigrationDoc({ objects: [{ id: 'A', category: 'x', ownerType: 'y' }] }).objects[0]).toMatchObject({ category: '', ownerType: '', deps: [] });
    const n = normalizeSchedule([s('A', 'M1', 'load', '2027-02-30', 'x'), s('A', 'M1', 'load', '2027-01-01', '2027-01-02'), s('A', 'M1', 'dance', '', ''), { objectId: 'A', runId: 'M1', step: 'load', status: 'weird' }]);
    expect(n).toEqual([{ objectId: 'A', runId: 'M1', step: 'load', start: '', end: '', status: 'planned', note: '' }]);
  });
  it('the five steps of a round, its span and roll-up status', () => {
    const st = stepsOf(doc, 'O01', 'M1');
    expect(st.map((x) => x.step)).toEqual(STEPS);
    expect(spanOf(st)).toEqual({ start: '2027-01-04', end: '2027-01-08' });
    expect(rollupOf(st)).toBe('inprogress');
    expect(rollupOf(STEPS.map(() => ({ status: 'done' })))).toBe('done');
    expect(rollupOf([{ status: 'done' }, { status: 'blocked' }])).toBe('blocked');
    expect(rollupOf(stepsOf(doc, 'O02', 'FINAL'))).toBe('planned');
  });
  it('rounds are an editable list: kept as listed, added ones get their id, none → the four defaults', () => {
    expect(doc.runs.map((r) => [r.id, r.label])).toEqual([['M1', '모의 1차'], ['FINAL', '컷오버']]);
    expect(normalizeMigrationDoc({ runs: [{ id: 'RUN05', label: 'Mock 4' }, { id: 'RUN05' }, { id: 'bad id' }] }).runs.map((r) => r.id)).toEqual(['RUN05']);
    expect(normalizeMigrationDoc({ lang: 'en' }).runs.map((r) => r.label)).toEqual(['Mock 1', 'Mock 2', 'Dress rehearsal', 'Cutover']);
  });
});

describe('dependency order and other findings', () => {
  it('a dependent object starting before its predecessor finishes, in the same round, is named', () => {
    const order = scheduleIssues(doc).filter((x) => x.kind === 'order');
    expect(order).toEqual([
      { kind: 'order', objectId: 'O03', dep: 'O01', runId: 'M1', start: '2027-01-07', depEnd: '2027-01-08' },
      { kind: 'order', objectId: 'O03', dep: 'O02', runId: 'M1', start: '2027-01-07', depEnd: '2027-01-07' },
      { kind: 'order', objectId: 'O03', dep: 'O01', runId: 'FINAL', start: '2027-03-03', depEnd: '2027-03-02' },
    ].filter((x) => x.start < x.depEnd));
    expect(issueText(order[0], 'ko')).toBe('O03 / M1: 선행 O01가 끝나기(2027-01-08) 전에 시작해요 (2027-01-07)');
  });
  it('a predecessor without dates, or a round where the dependent has none, raises nothing', () => {
    expect(scheduleIssues(doc).some((x) => x.kind === 'order' && x.dep === 'O02' && x.runId === 'FINAL')).toBe(false);
  });
  it('dates, round window, unknown references, self and loops', () => {
    const odd = normalizeMigrationDoc({
      id: 'X', objects: [{ id: 'A', deps: ['B', 'A', 'Z'] }, { id: 'B', deps: ['A'] }],
      runs: [{ id: 'M1', planStart: '2027-01-10', planEnd: '2027-01-20' }],
      schedule: [s('A', 'M1', 'load', '2027-01-09', '2027-01-08'), s('B', 'M1', 'load', '2027-01-15', '2027-01-25'), s('C', 'M1', 'load', '', ''), s('A', 'M9', 'load', '', '')],
    });
    const kinds = scheduleIssues(odd).map((x) => x.kind).sort();
    expect(kinds).toEqual(['dates', 'loop', 'order', 'self-dep', 'unknown-dep', 'unknown-object', 'unknown-run', 'window', 'window'].sort());
    const c = checkMigrationDoc(odd);
    expect(c.errors.some((e: string) => e.startsWith('dependency loop: A → B → A'))).toBe(true);
    expect(c.errors.some((e: string) => e.includes('end 2027-01-08 before start 2027-01-09'))).toBe(true);
    expect(c.warnings.some((w: string) => w.includes('before its predecessor'))).toBe(true);
  });
});

describe('time view, reconciliation, page and export', () => {
  it('rows per object and round, filtered by owner / round / category, with the overall range', () => {
    const all = ganttRows(doc);
    expect(all.rows.length).toBe(6);
    expect([all.from, all.to]).toEqual(['2027-01-04', '2027-03-04']);
    expect(ganttRows(doc, { owner: 'kim' }).rows.map((r) => `${r.objectId}/${r.runId}`)).toEqual(['O01/M1', 'O03/M1', 'O01/FINAL', 'O03/FINAL']);
    expect(ganttRows(doc, { runId: 'FINAL', category: 'transaction' }).rows.map((r) => r.objectId)).toEqual(['O03']);
    expect(ganttRows(doc).rows.find((r) => r.objectId === 'O03' && r.runId === 'M1')!.issues).toBe(1);
  });
  it('reconciliation beside validate: counts of the round\'s results for the object\'s rules only', () => {
    expect(reconOf(doc, 'O03', 'M1')).toEqual({ results: 2, ok: 1, check: 0, ng: 1 });
    expect(reconOf(doc, 'O03', 'FINAL').results).toBe(0);
  });
  it('the page draws the time view (and says so when there is none); the workbook has a schedule sheet', () => {
    const html = migrationDocPage(doc, { embed: true });
    expect(html).toContain('이관 일정');
    expect(html).toContain('min-width:520px');
    expect(migrationDocPage({ id: 'E' }, { embed: true })).toContain('아직 일정이 없어요');
    expect(migrationDocXlsx(doc).byteLength).toBeGreaterThan(1000);
  });
});

describe('/wbs write back', () => {
  const project = {
    project: { code: 'P1' }, team: [{ id: 'kim', name: 'Kim' }],
    wbs: [{ id: 'P3', type: 'phase', label: 'Realize' }],
  };
  it('adds one deliverable under the build phase and one task per dated object and round, with deps of the same round', () => {
    const p = migrationSyncPlan(doc, project);
    expect(p.added.tasks.map((t: { id: string }) => t.id)).toEqual(['MIG.MIG-1', 'MIG.MIG-1.O01.M1', 'MIG.MIG-1.O02.M1', 'MIG.MIG-1.O03.M1', 'MIG.MIG-1.O01.FINAL', 'MIG.MIG-1.O03.FINAL']);
    const o3 = p.added.tasks.find((t: { id: string }) => t.id === 'MIG.MIG-1.O03.M1');
    expect(o3).toMatchObject({ type: 'task', parent: 'MIG.MIG-1', start: '2027-01-07', finish: '2027-01-12', status: 'notstarted', deps: ['MIG.MIG-1.O01.M1', 'MIG.MIG-1.O02.M1'], owner: 'kim' });
    // O02 in FINAL has no dates: no task, so O03 / FINAL depends on O01 only
    expect(p.added.tasks.find((t: { id: string }) => t.id === 'MIG.MIG-1.O03.FINAL').deps).toEqual(['MIG.MIG-1.O01.FINAL']);
    // lee is not in the team: no owner set, the name goes into the note
    const o2 = p.added.tasks.find((t: { id: string }) => t.id === 'MIG.MIG-1.O02.M1');
    expect([o2.owner, o2.note]).toEqual(['', '/migration MIG-1: O02 · 담당: lee']);
    expect(p.added.tasks[0].parent).toBe('P3');
    const next = applyMigrationSync(project, p);
    expect(checkModel(next).errors.filter((e: string) => /WBS|duplicate/.test(e))).toEqual([]);
  });
  it('on an existing project: blanks never overwrite, the note is appended once, a status going back is only flagged', () => {
    const once = applyMigrationSync(project, migrationSyncPlan(doc, project));
    const t = once.wbs.find((w: { id: string }) => w.id === migrationTaskId('MIG-1', 'O01', 'M1'));
    Object.assign(t, { status: 'done', owner: 'kim', note: 'PM: on track', finish: '2027-01-09' });
    const later = normalizeMigrationDoc({ ...doc, objects: doc.objects.map((o) => (o.id === 'O01' ? { ...o, owner: '' } : o)) });
    const p = migrationSyncPlan(later, once);
    const ch = p.tasks.find((x: { id: string }) => x.id === t.id)!.changes;
    expect(ch.map((c: { field: string }) => c.field).sort()).toEqual(['finish', 'note']);
    expect(ch.find((c: { field: string }) => c.field === 'note').to).toBe('PM: on track\n/migration MIG-1: O01 · cockpit');
    expect(p.flagged).toEqual([{ key: `tasks:${t.id}:status`, list: 'tasks', id: t.id, field: 'status', from: 'done', to: 'inprogress' }]);
    const kept = applyMigrationSync(once, p);
    expect(kept.wbs.find((w: { id: string }) => w.id === t.id)).toMatchObject({ status: 'done', owner: 'kim', finish: '2027-01-08' });
    expect(applyMigrationSync(once, p, [`tasks:${t.id}:status`]).wbs.find((w: { id: string }) => w.id === t.id).status).toBe('inprogress');
  });
  it('writing twice changes nothing more; nothing is removed', () => {
    const once = applyMigrationSync(project, migrationSyncPlan(doc, project));
    const again = migrationSyncPlan(doc, once);
    expect(again.empty).toBe(true);
    const fewer = normalizeMigrationDoc({ ...doc, schedule: [] });
    expect(migrationSyncPlan(fewer, once).empty).toBe(true);
    expect(applyMigrationSync(once, migrationSyncPlan(fewer, once)).wbs.length).toBe(once.wbs.length);
  });
});
