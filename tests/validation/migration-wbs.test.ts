/**
 * Migration schedule → /wbs: a predecessor link to itself or on a loop never becomes a /wbs task dependency
 * (verifier note on 1d7020e); clean links still do.
 */
import { describe, it, expect } from 'vitest';
import { applyMigrationSync, migrationSyncPlan } from '../../scripts/project/migration-wbs.mjs';
import { scheduleIssues } from '../../scripts/project/migration-schedule.mjs';
import { normalizeMigrationDoc } from '../../scripts/project/migration-doc.mjs';

const step = (objectId: string) => ({ objectId, runId: 'M1', step: 'load', start: '2027-01-04', end: '2027-01-05' });
const doc = {
  id: 'MIG-L', lang: 'en',
  objects: [
    { id: 'O1', name: 'A', deps: ['O2'] }, { id: 'O2', name: 'B', deps: ['O1'] }, // a loop
    { id: 'O3', name: 'C', deps: ['O3', 'O4'] }, // itself + a clean link
    { id: 'O4', name: 'D' },
    { id: 'O5', name: 'E', deps: ['O1', 'O4'] }, // waits for a loop member: that link is clean (O1 never reaches O5)
  ],
  runs: [{ id: 'M1' }],
  schedule: ['O1', 'O2', 'O3', 'O4', 'O5'].map(step),
};
const depsOf = (plan: { added: { tasks: { id: string; deps?: string[] }[] } }, obj: string) => plan.added.tasks.find((t) => t.id === `MIG.MIG-L.${obj}.M1`)!.deps;

describe('migration → /wbs dependencies', () => {
  it('the plan still names the loop and the self link as errors', () => {
    const kinds = scheduleIssues(normalizeMigrationDoc(doc)).map((x: { kind: string }) => x.kind);
    expect(kinds).toContain('loop');
    expect(kinds).toContain('self-dep');
  });
  it('drops self links and links on a loop; keeps clean links, also to a loop member', () => {
    const p = migrationSyncPlan(doc, { wbs: [] });
    expect(depsOf(p, 'O1')).toEqual([]);
    expect(depsOf(p, 'O2')).toEqual([]);
    expect(depsOf(p, 'O3')).toEqual(['MIG.MIG-L.O4.M1']);
    expect(depsOf(p, 'O5')).toEqual(['MIG.MIG-L.O1.M1', 'MIG.MIG-L.O4.M1']);
  });
  it('a longer loop (A → B → C → A) leaves no link of it in /wbs; the written project has no cycle', () => {
    const long = { ...doc, objects: [{ id: 'A', deps: ['C'] }, { id: 'B', deps: ['A'] }, { id: 'C', deps: ['B'] }], schedule: ['A', 'B', 'C'].map(step) };
    const next = applyMigrationSync({ wbs: [] }, migrationSyncPlan(long, { wbs: [] })) as { wbs: { id: string; deps?: string[] }[] };
    expect(next.wbs.flatMap((w) => w.deps ?? [])).toEqual([]);
  });
});
