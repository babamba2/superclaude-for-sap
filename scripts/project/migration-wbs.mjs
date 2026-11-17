// sc4sap:project-dashboard — the migration schedule → the /wbs project (the web's /migration "WBS에 반영"; button
// only, after a preview), by the write-back rules every document follows (`doc-kit.mjs syncDiff`):
//
//   migrationSyncPlan(doc, project)          { tasks, added: { tasks }, flagged, empty }
//   applyMigrationSync(project, plan, accept) the project with exactly that plan written (flagged only when ticked)
//
// One deliverable per plan (MIG.<doc>), under the project's build / migration phase when its name says so, and one
// task per object and round that has a dated step (MIG.<doc>.<object>.<round>): label, owner (a team member, else
// the name goes into the note), start / finish (the round's first start and last end), status (rolled up from the
// steps), the predecessor objects' tasks of the same round as dependencies (on add only). A blank value never
// overwrites the project's, the note gets the document's line once, and a status moving backwards is only flagged.
// Nothing the plan does not name changes; nothing is removed.

import { acceptedFlags, arr, str, syncDiff } from './doc-kit.mjs';
import { normalizeMigrationDoc } from './migration-doc.mjs';
import { ganttRows } from './migration-schedule.mjs';

const STATUS = { planned: 'notstarted', inprogress: 'inprogress', done: 'done', blocked: 'blocked' };
const RANK = { notstarted: 0, inprogress: 1, blocked: 1, onhold: 1, done: 2 };
const FIELDS = ['label', 'owner', 'start', 'finish', 'status', 'note'];
const PHASE = /realiz|build|construct|구축|구현|실현|이관|migrat/i;
const safe = (s) => String(s).replace(/[^A-Za-z0-9_.:-]/g, '_');
export const migrationTaskId = (docId, objectId, runId) => `MIG.${safe(docId)}.${safe(objectId)}.${safe(runId)}`;
export const migrationDeliverableId = (docId) => `MIG.${safe(docId)}`;

function memberOf(project, name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return '';
  const m = arr(project?.team).find((t) => String(t.id || '').toLowerCase() === n || String(t.name || '').toLowerCase() === n);
  return m ? m.id : '';
}

export function migrationSyncPlan(doc, project) {
  const d = normalizeMigrationDoc(doc);
  const wbs = arr(project?.wbs);
  const ko = d.lang !== 'en';
  const parent = migrationDeliverableId(d.id);
  const rows = ganttRows(d).rows.filter((r) => r.start || r.end);
  const tasks = [], added = { tasks: [] }, flagged = [];
  const has = (id) => wbs.some((w) => w.id === id);
  const willHave = new Set(rows.map((r) => migrationTaskId(d.id, r.objectId, r.runId)));
  if (rows.length && !has(parent)) {
    const phase = wbs.find((w) => w.type === 'phase' && PHASE.test(String(w.label || '')));
    added.tasks.push({ id: parent, type: 'deliverable', label: str(d.title, 200), ...(phase ? { parent: phase.id } : {}), status: 'notstarted', note: `/migration ${d.id}`, source: `migration:${d.id}` });
  }
  for (const r of rows) {
    const id = migrationTaskId(d.id, r.objectId, r.runId);
    const owner = memberOf(project, r.owner);
    const note = `/migration ${d.id}: ${r.objectId}${r.approach ? ` · ${r.approach}` : ''}${r.owner && !owner ? ` · ${ko ? '담당' : 'owner'}: ${r.owner}` : ''}`;
    const want = { label: str(`${r.name || r.objectId} · ${r.runLabel}`, 200), owner, start: r.start, finish: r.end, status: STATUS[r.status], note };
    const have = wbs.find((w) => w.id === id);
    if (!have) {
      const deps = r.deps.map((x) => migrationTaskId(d.id, x, r.runId)).filter((x) => has(x) || willHave.has(x));
      added.tasks.push({ id, type: 'task', parent, ...want, deps, source: `migration:${d.id}:${r.objectId}:${r.runId}` });
      continue;
    }
    const diff = syncDiff('tasks', id, want, have, FIELDS, { append: ['note'], rank: { status: RANK } });
    if (diff.changes.length) tasks.push({ id, changes: diff.changes });
    flagged.push(...diff.flagged);
  }
  return { tasks, added, flagged, empty: !tasks.length && !added.tasks.length && !flagged.length };
}

export function applyMigrationSync(project, plan, accept = []) {
  const m = JSON.parse(JSON.stringify(project || {}));
  m.wbs = arr(m.wbs);
  const put = (id, field, to) => {
    const t = m.wbs.find((w) => w.id === id);
    if (t && FIELDS.includes(field)) t[field] = to;
  };
  for (const x of arr(plan?.tasks)) for (const ch of arr(x.changes)) put(x.id, ch.field, ch.to);
  for (const f of acceptedFlags(plan, 'tasks', accept)) put(f.id, f.field, f.to);
  for (const t of arr(plan?.added?.tasks)) if (t && t.id && !m.wbs.some((w) => w.id === t.id)) m.wbs.push(t);
  return m;
}
