// sc4sap:project-dashboard — the migration plan's loads as cutover runbook tasks (the web's /migration → /cutover
// document or the /wbs project's cutover; button-only, after a preview).
//
//   migrationCutoverTasks(doc)            one window task per migration object (load + reconcile), in the objects'
//                                         sequence (same sequence = parallel, each waits for the previous group),
//                                         plus one closing task: review the reconciliation before go / no-go
//   migrationCutoverPlan(doc, cutover)    { add, kept, differ, empty } — only tasks the cutover does not have yet
//                                         (by id) are added; a task already there is never changed
//   applyMigrationCutover(cutover, plan)  the cutover with the plan's tasks appended
//
// Owner, status, dates and durations are never written: the tasks arrive planned, without an owner — the runbook
// owner decides those in /cutover or /wbs. Nothing in the cutover is removed or reordered.

import { arr, str } from './doc-kit.mjs';
import { normalizeMigrationDoc } from './migration-doc.mjs';
import { normalizeCutover } from './cutover-model.mjs';

export const MIG_TASK_PREFIX = 'CT.MIG.';
const RECON_ID = `${MIG_TASK_PREFIX}RECON`;
const WS = 'Data migration';

const T = {
  ko: {
    load: (o) => `데이터 이관: ${o.name || o.id} 적재·검증`,
    recon: '데이터 이관 검증 결과 확인 (Go / No-Go 근거)',
    from: (d, o) => `← /migration ${d.id}${o ? ` · ${o.id}${o.approach ? ` · ${o.approach}` : ''}` : ''}`,
  },
  en: {
    load: (o) => `Data migration: load and reconcile ${o.name || o.id}`,
    recon: 'Review the migration reconciliation (go / no-go input)',
    from: (d, o) => `← /migration ${d.id}${o ? ` · ${o.id}${o.approach ? ` · ${o.approach}` : ''}` : ''}`,
  },
};

/** Sequence groups: objects with a number in sequence order, the rest after them in document order. */
function groups(objects) {
  const seq = (o) => {
    const n = Number(String(o.sequence).trim());
    return String(o.sequence).trim() !== '' && Number.isFinite(n) ? n : Infinity;
  };
  const sorted = objects.map((o, i) => ({ o, i, s: seq(o) })).sort((a, b) => a.s - b.s || a.i - b.i);
  const out = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && last.s === x.s && x.s !== Infinity) last.list.push(x.o);
    else out.push({ s: x.s, list: [x.o] });
  }
  return out.map((g) => g.list);
}

export function migrationCutoverTasks(doc0) {
  const d = normalizeMigrationDoc(doc0);
  const L = T[d.lang];
  const objects = d.objects.filter((o) => o.id);
  const tasks = [];
  let prev = [];
  for (const g of groups(objects)) {
    const ids = [];
    for (const o of g) {
      const id = `${MIG_TASK_PREFIX}${o.id}`;
      if (tasks.some((t) => t.id === id)) continue;
      tasks.push({ id, phase: 'window', label: str(L.load(o), 500), ws: WS, owner: '', status: 'planned', deps: [...prev], note: str(L.from(d, o), 1000) });
      ids.push(id);
    }
    if (ids.length) prev = ids;
  }
  if (tasks.length) tasks.push({ id: RECON_ID, phase: 'window', label: L.recon, ws: WS, owner: '', status: 'planned', deps: [...prev], note: str(L.from(d, null), 1000) });
  return tasks;
}

export function migrationCutoverPlan(doc, cutover) {
  const have = normalizeCutover(cutover && typeof cutover === 'object' ? cutover : { tasks: [] }).tasks;
  const add = [], kept = [], differ = [];
  for (const t of migrationCutoverTasks(doc)) {
    const p = have.find((x) => x.id === t.id);
    if (!p) add.push(t);
    else if (String(p.label ?? '') === t.label) kept.push({ id: t.id, label: t.label });
    else differ.push({ id: t.id, label: t.label, theirs: str(p.label, 200) });
  }
  return { add, kept, differ, flagged: [], empty: !add.length };
}

export function applyMigrationCutover(cutover0, plan) {
  const c = normalizeCutover(cutover0 && typeof cutover0 === 'object' ? cutover0 : { window: {}, freeze: {}, rehearsals: [], tasks: [], goNoGo: [] });
  const ids = new Set(c.tasks.map((t) => t.id));
  const add = arr(plan?.add).filter((t) => t && t.id && !ids.has(t.id));
  return { ...c, tasks: [...c.tasks, ...add] };
}
