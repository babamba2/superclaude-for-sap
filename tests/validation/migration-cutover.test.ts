/**
 * Migration plan → cutover runbook (the web's /migration push, B3): one window task per object in sequence order,
 * a closing reconciliation review, add-only against what the cutover already has; owner / status never set.
 */
import { describe, it, expect } from 'vitest';
import { applyMigrationCutover, migrationCutoverPlan, migrationCutoverTasks } from '../../scripts/project/migration-cutover.mjs';
import { checkCutover } from '../../scripts/project/cutover-model.mjs';

const doc = {
  id: 'MIG-01', lang: 'en',
  objects: [
    { id: 'O3', name: 'Open sales orders', sequence: '3', owner: 'kim', status: 'done' },
    { id: 'O1', name: 'Customers', sequence: '1', approach: 'cockpit' },
    { id: 'O2', name: 'Materials', sequence: '1' },
    { id: 'O4', name: 'Bank master', sequence: '' },
    { id: '', name: 'no id' },
  ],
};

describe('migrationCutoverTasks', () => {
  it('orders by sequence; same sequence runs in parallel; no number goes last; a closing review waits for all', () => {
    const t = migrationCutoverTasks(doc);
    expect(t.map((x) => x.id)).toEqual(['CT.MIG.O1', 'CT.MIG.O2', 'CT.MIG.O3', 'CT.MIG.O4', 'CT.MIG.RECON']);
    expect(t[0].deps).toEqual([]);
    expect(t[1].deps).toEqual([]);
    expect(t[2].deps).toEqual(['CT.MIG.O1', 'CT.MIG.O2']);
    expect(t[3].deps).toEqual(['CT.MIG.O3']);
    expect(t[4].deps).toEqual(['CT.MIG.O4']);
    expect(t[0].label).toBe('Data migration: load and reconcile Customers');
    expect(t[0].note).toBe('← /migration MIG-01 · O1 · cockpit');
  });
  it('never sets an owner, a status other than planned, dates or durations', () => {
    for (const x of migrationCutoverTasks(doc)) {
      expect(x.owner).toBe('');
      expect(x.status).toBe('planned');
      expect(x.phase).toBe('window');
      expect(x).not.toHaveProperty('durationH');
      expect(x).not.toHaveProperty('offset');
    }
  });
  it('a plan without objects gives no tasks (no lone review task)', () => {
    expect(migrationCutoverTasks({ id: 'X', objects: [] })).toEqual([]);
  });
  it('Korean labels', () => {
    expect(migrationCutoverTasks({ id: 'X', lang: 'ko', objects: [{ id: 'A', name: '고객' }] })[0].label).toBe('데이터 이관: 고객 적재·검증');
  });
});

describe('migrationCutoverPlan / applyMigrationCutover', () => {
  const cutover = { window: {}, freeze: {}, rehearsals: [], goNoGo: [], tasks: [
    { id: 'CT.PRE.01', phase: 'pre', label: 'Freeze', owner: 'lee', status: 'done' },
    { id: 'CT.MIG.O1', phase: 'window', label: 'Data migration: load and reconcile Customers', owner: 'park', status: 'done' },
    { id: 'CT.MIG.O2', phase: 'window', label: 'Materials (edited by the runbook owner)', status: 'planned' },
  ] };
  it('adds only the tasks the cutover lacks; tasks already there are kept or listed as different, never changed', () => {
    const p = migrationCutoverPlan(doc, cutover);
    expect(p.add.map((x) => x.id)).toEqual(['CT.MIG.O3', 'CT.MIG.O4', 'CT.MIG.RECON']);
    expect(p.kept.map((x) => x.id)).toEqual(['CT.MIG.O1']);
    expect(p.differ).toEqual([{ id: 'CT.MIG.O2', label: 'Data migration: load and reconcile Materials', theirs: 'Materials (edited by the runbook owner)' }]);
    expect(p.empty).toBe(false);
    const next = applyMigrationCutover(cutover, p);
    expect(next.tasks.slice(0, 3)).toEqual(cutover.tasks.map((t) => ({ deps: [], ...t })));
    expect(next.tasks.find((t) => t.id === 'CT.MIG.O1')!.owner).toBe('park');
    expect(next.tasks.map((t) => t.id).slice(3)).toEqual(['CT.MIG.O3', 'CT.MIG.O4', 'CT.MIG.RECON']);
    expect(checkCutover(next).errors).toEqual([]);
  });
  it('pushing twice adds nothing more', () => {
    const once = applyMigrationCutover(cutover, migrationCutoverPlan(doc, cutover));
    const again = migrationCutoverPlan(doc, once);
    expect(again.empty).toBe(true);
    expect(applyMigrationCutover(once, again).tasks.length).toBe(once.tasks.length);
  });
  it('an empty or missing cutover gets the whole runbook part, valid for the cutover checks', () => {
    const next = applyMigrationCutover(undefined, migrationCutoverPlan(doc, undefined));
    expect(next.tasks.length).toBe(5);
    expect(checkCutover(next).errors).toEqual([]);
  });
  it('a plan cannot smuggle a task id the cutover already has', () => {
    const forged = { add: [{ id: 'CT.PRE.01', phase: 'window', label: 'overwrite', owner: 'x' }] };
    expect(applyMigrationCutover(cutover, forged).tasks.filter((t) => t.id === 'CT.PRE.01')).toEqual([{ deps: [], ...cutover.tasks[0] }]);
  });
});
