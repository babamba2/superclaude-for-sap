// sc4sap:project-dashboard — project model: shape, checks and the figures the page shows.
//
// Model (one JSON per project; ids are stable so a later sync to SAP / Notion can match rows):
//   { schema: 1, lang, title, author?, changeNote?, today?,
//     project: { code, name, type, sponsor?, pm?, pmo?, start, goLive, end?, system?, modules: [], packages: [],
//                trPattern? (regex source; group 1 = workstream, default ^\[([A-Z0-9]{2,4})\]) },
//     team: [{ id, name, role, module?, sapUser?, company?, from?, to?, note? }]   — members leave by `to`, never by deletion,
//           so finished items keep who did them; open items of a member who left are flagged (orphans) until reassigned,
//     workstreams: [{ code, label, kind: 'module' | 'cross' }],
//     wbs: [{ id, parent?, label, type: 'phase' | 'deliverable' | 'task' | 'wricef', ws?, owner?, fnOwner?, devOwner?,
//             start?, finish?, baseStart?, baseFinish?, actualStart?, actualFinish?, pct?, status?, deps?: [id],
//             wricef?: { kind: R|I|C|E|F|W, stage, stageDates?: { <stage>: date }, objects?: [name], trs?: [trkorr] }, note? }],
//     milestones: [{ id, label, kind, phase?, base, forecast?, actual?, status, approver?, criteria?: [text] }],
//     kpis?: [{ id, label, group, unit?, target?, actual?, dir: 'up' | 'down', note?, history?: [{ date, value }] }]  — manual KPIs
//     actuals?: { readAt, system, transports: [...], objects: [...], inactive: [...], dumps?: [{ date, count }] },
//     snapshots?: [{ date, planned, actual, kpi?: { <auto KPI id>: value } }] }
// Auto KPIs (schedule, WRICEF, transports, team, hypercare) are computed by autoKpis() and trended through snapshots.
//
// A WRICEF item passes the stages below; fnOwner (module consultant) owns the F stages, devOwner (development
// consultant) the D stages. `stage` is the last stage finished — the hand-off queue is fs (waiting for
// development) and ut (waiting for the functional unit test).

export const arr = (v) => (Array.isArray(v) ? v : []);
const DAY = 86400000;
export const iso = (d) => new Date(d).toISOString().slice(0, 10);
const time = (s) => (s ? Date.parse(`${s}T00:00:00Z`) : NaN);
export const days = (a, b) => Math.round((time(b) - time(a)) / DAY);
export const addDays = (s, n) => iso(time(s) + n * DAY);

export const TYPES = ['implementation', 'conversion', 'rollout', 'ams', 'task'];
export const ROLES = ['pm', 'pmo', 'lead', 'module', 'dev', 'basis', 'security', 'data', 'test', 'ocm', 'business', 'other'];
export const WBS_TYPES = ['phase', 'deliverable', 'task', 'wricef'];
export const STATUS = ['notstarted', 'inprogress', 'done', 'blocked', 'onhold'];
export const MS_KINDS = ['qgate', 'golive', 'cutover', 'signoff', 'other'];
export const MS_STATUS = ['planned', 'passed', 'conditional', 'failed'];
export const WRICEF_KINDS = ['R', 'I', 'C', 'E', 'F', 'W'];
export const STAGES = ['req', 'fs', 'ts', 'build', 'ut', 'fut', 'sit', 'done'];
export const STAGE_SIDE = { req: 'F', fs: 'F', ts: 'D', build: 'D', ut: 'D', fut: 'F', sit: 'F', done: '' };
export const STAGE_PCT = { req: 0, fs: 15, ts: 25, build: 50, ut: 65, fut: 80, sit: 90, done: 100 };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fills defaults, keeps unknown fields. Returns a new model. */
export function normalizeModel(m) {
  const out = JSON.parse(JSON.stringify(m || {}));
  out.schema = 1;
  out.lang = out.lang || 'ko';
  out.project = { modules: [], packages: [], ...out.project };
  out.team = arr(out.team);
  out.workstreams = arr(out.workstreams);
  out.wbs = arr(out.wbs).map(w => {
    const r = { status: 'notstarted', pct: 0, deps: [], ...w, pct: clampPct(w.pct ?? (w.status === 'done' ? 100 : 0)) };
    // A WRICEF item's progress and status follow its stage (the PM moves the stage, not the %).
    if (r.type === 'wricef' && r.wricef && STAGES.includes(r.wricef.stage || 'req')) {
      const st = r.wricef.stage || 'req';
      r.pct = STAGE_PCT[st];
      if (r.status !== 'blocked' && r.status !== 'onhold') r.status = st === 'done' ? 'done' : st === 'req' ? 'notstarted' : 'inprogress';
    }
    return r;
  });
  out.milestones = arr(out.milestones).map(x => ({ status: 'planned', criteria: [], ...x }));
  out.snapshots = arr(out.snapshots);
  out.kpis = arr(out.kpis).map(k => ({ dir: 'up', history: [], ...k }));
  return out;
}
const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/** { errors, warnings } — errors stop the build. */
export function checkModel(m) {
  const errors = [], warnings = [];
  const p = m?.project || {};
  if (!p.code) errors.push('project.code missing');
  if (!p.name) errors.push('project.name missing');
  if (!TYPES.includes(p.type)) errors.push(`project.type "${p.type}" is not one of ${TYPES.join(', ')}`);
  for (const k of ['start', 'goLive']) if (!DATE.test(p[k] || '')) errors.push(`project.${k} must be YYYY-MM-DD`);
  const team = new Set(), ws = new Set(arr(m?.workstreams).map(w => w.code)), ids = new Set();
  for (const t of arr(m?.team)) {
    if (!t.id) errors.push('team member without id');
    if (team.has(t.id)) errors.push(`duplicate team id ${t.id}`);
    team.add(t.id);
    if (!ROLES.includes(t.role)) errors.push(`team ${t.id}: unknown role "${t.role}"`);
    for (const k of ['from', 'to']) if (t[k] && !DATE.test(t[k])) errors.push(`team ${t.id}: ${k} must be YYYY-MM-DD`);
    if (t.from && t.to && t.to < t.from) errors.push(`team ${t.id}: to before from`);
  }
  for (const w of arr(m?.wbs)) {
    if (!w.id) { errors.push(`WBS row without id ("${w.label || ''}")`); continue; }
    if (ids.has(w.id)) errors.push(`duplicate WBS id ${w.id}`);
    ids.add(w.id);
  }
  for (const w of arr(m?.wbs)) {
    if (!w.label) errors.push(`WBS ${w.id}: label missing`);
    if (!WBS_TYPES.includes(w.type)) errors.push(`WBS ${w.id}: unknown type "${w.type}"`);
    if (w.parent && !ids.has(w.parent)) errors.push(`WBS ${w.id}: parent ${w.parent} not found`);
    if (w.status && !STATUS.includes(w.status)) errors.push(`WBS ${w.id}: unknown status "${w.status}"`);
    for (const k of ['start', 'finish', 'baseStart', 'baseFinish', 'actualStart', 'actualFinish'])
      if (w[k] && !DATE.test(w[k])) errors.push(`WBS ${w.id}: ${k} must be YYYY-MM-DD`);
    if (w.start && w.finish && w.finish < w.start) errors.push(`WBS ${w.id}: finish before start`);
    for (const d of arr(w.deps)) if (!ids.has(d)) warnings.push(`WBS ${w.id}: dependency ${d} not found`);
    for (const k of ['owner', 'fnOwner', 'devOwner']) if (w[k] && !team.has(w[k])) warnings.push(`WBS ${w.id}: ${k} ${w[k]} is not in the team`);
    if (w.ws && ws.size && !ws.has(w.ws)) warnings.push(`WBS ${w.id}: workstream ${w.ws} not defined`);
    if (w.type === 'wricef') {
      if (!WRICEF_KINDS.includes(w.wricef?.kind)) errors.push(`WBS ${w.id}: WRICEF kind must be one of ${WRICEF_KINDS.join('')}`);
      if (w.wricef?.stage && !STAGES.includes(w.wricef.stage)) errors.push(`WBS ${w.id}: unknown stage "${w.wricef.stage}"`);
      if (!w.fnOwner) warnings.push(`WBS ${w.id}: WRICEF without module consultant (fnOwner)`);
      if (!w.devOwner) warnings.push(`WBS ${w.id}: WRICEF without development consultant (devOwner)`);
    }
    if (w.type !== 'phase' && !w.parent) warnings.push(`WBS ${w.id}: ${w.type} without parent`);
  }
  const ms = new Set();
  for (const x of arr(m?.milestones)) {
    if (!x.id) errors.push('milestone without id');
    if (ms.has(x.id)) errors.push(`duplicate milestone id ${x.id}`);
    ms.add(x.id);
    if (!MS_KINDS.includes(x.kind)) errors.push(`milestone ${x.id}: unknown kind "${x.kind}"`);
    if (!MS_STATUS.includes(x.status || 'planned')) errors.push(`milestone ${x.id}: unknown status "${x.status}"`);
    if (!DATE.test(x.base || '')) errors.push(`milestone ${x.id}: base must be YYYY-MM-DD`);
    if (x.phase && !ids.has(x.phase)) warnings.push(`milestone ${x.id}: phase ${x.phase} not found`);
  }
  return { errors, warnings };
}

/** Rows in tree order with depth; children of a parent keep their model order. */
export function tree(m) {
  const kids = new Map();
  for (const w of arr(m.wbs)) { const k = w.parent || ''; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(w); }
  const out = [];
  const walk = (k, depth, num) => arr(kids.get(k)).forEach((w, i) => {
    const n = num ? `${num}.${i + 1}` : `${i + 1}`;
    out.push({ ...w, depth, num: n, leaf: !kids.has(w.id) });
    walk(w.id, depth + 1, n);
  });
  walk('', 0, '');
  return out;
}

/** Leaf rows carry their own dates / pct; a parent takes min start, max finish, duration-weighted pct. */
export function rollup(m) {
  const rows = tree(m), byId = new Map(rows.map(r => [r.id, r]));
  for (const r of [...rows].sort((a, b) => b.depth - a.depth)) {
    if (r.leaf) { r.weight = Math.max(1, days(r.start, r.finish) + 1 || 1); continue; }
    const ch = rows.filter(x => x.parent === r.id);
    const starts = ch.map(c => c.start).filter(Boolean).sort(), fins = ch.map(c => c.finish).filter(Boolean).sort();
    r.start = r.start && !starts.length ? r.start : starts[0] || r.start;
    r.finish = r.finish && !fins.length ? r.finish : fins.at(-1) || r.finish;
    r.weight = ch.reduce((s, c) => s + c.weight, 0) || 1;
    r.pct = Math.round(ch.reduce((s, c) => s + c.pct * c.weight, 0) / r.weight);
    r.status = ch.every(c => c.status === 'done') ? 'done' : ch.some(c => c.status === 'blocked') ? 'blocked'
      : ch.some(c => c.status !== 'notstarted') ? 'inprogress' : 'notstarted';
  }
  return { rows, byId };
}

/** Schedule RAG of one row on `today`: red = finish passed and not done, or blocked;
 *  amber = start passed with nothing done, or behind its planned share by 20 points or more. */
export function rag(r, today) {
  if (r.status === 'done' || r.pct >= 100) return 'green';
  if (r.status === 'blocked') return 'red';
  if (r.finish && r.finish < today) return 'red';
  if (r.start && r.start <= today) {
    if (!r.pct) return 'amber';
    if (plannedShare(r, today) - r.pct >= 20) return 'amber';
  }
  return 'green';
}

/** Planned % complete of one dated row on a day (linear over its duration). */
export function plannedShare(r, day) {
  if (!r.start || !r.finish) return 0;
  if (day < r.start) return 0;
  if (day >= r.finish) return 100;
  return Math.round(((days(r.start, day) + 1) / (days(r.start, r.finish) + 1)) * 100);
}

/** Planned % of the whole project per week (duration-weighted leaves) — the S-curve; the actual
 *  points come from `snapshots` (one per build / refresh). */
export function sCurve(m, rows) {
  const leaves = rows.filter(r => r.leaf && r.start && r.finish);
  const total = leaves.reduce((s, r) => s + r.weight, 0) || 1;
  const p = m.project, end = p.end || p.goLive;
  const pts = [];
  for (let d = p.start; d <= end; d = addDays(d, 7)) pts.push({ date: d, planned: Math.round(leaves.reduce((s, r) => s + plannedShare(r, d) * r.weight, 0) / total) });
  if (pts.at(-1)?.date !== end) pts.push({ date: end, planned: Math.round(leaves.reduce((s, r) => s + plannedShare(r, end) * r.weight, 0) / total) });
  return pts;
}

/** Milestone figures: slip (forecast − base, days), RAG. */
export function milestoneView(x, today) {
  const fc = x.actual || x.forecast || x.base;
  const slip = days(x.base, fc) || 0;
  let r = 'green';
  if (x.status === 'failed') r = 'red';
  else if (!x.actual && x.status !== 'passed') {
    if (fc < today) r = 'red';
    else if (slip > 14) r = 'red';
    else if (slip > 0 || x.status === 'conditional') r = 'amber';
  } else if (x.status === 'conditional') r = 'amber';
  return { ...x, date: fc, slip, rag: r };
}

/** WRICEF hand-off queue: items whose last finished stage hands the work to the other side. */
export function handoffQueue(rows, today) {
  const q = { toDev: [], toFn: [] };
  for (const r of rows) {
    if (r.type !== 'wricef' || !r.wricef) continue;
    const st = r.wricef.stage, since = r.wricef.stageDates?.[st];
    const item = { id: r.id, label: r.label, ws: r.ws, kind: r.wricef.kind, fnOwner: r.fnOwner, devOwner: r.devOwner, since, waiting: since ? days(since, today) : null };
    if (st === 'fs') q.toDev.push(item);
    else if (st === 'ut') q.toFn.push(item);
  }
  const byWait = (a, b) => (b.waiting ?? -1) - (a.waiting ?? -1);
  q.toDev.sort(byWait); q.toFn.sort(byWait);
  return q;
}

/** WRICEF counts per kind × stage, and per workstream × side (F = module consultant, D = development). */
export function wricefStats(rows) {
  const items = rows.filter(r => r.type === 'wricef' && r.wricef);
  const byKind = {}, byWs = {};
  for (const r of items) {
    const { kind, stage = 'req' } = r.wricef;
    byKind[kind] = byKind[kind] || Object.fromEntries(STAGES.map(s => [s, 0]));
    byKind[kind][stage]++;
    const w = r.ws || '—'; byWs[w] = byWs[w] || { total: 0, done: 0, F: 0, D: 0 };
    byWs[w].total++;
    if (stage === 'done') byWs[w].done++;
    else { const next = STAGES[STAGES.indexOf(stage) + 1]; byWs[w][STAGE_SIDE[next] || 'F']++; }
  }
  return { total: items.length, done: items.filter(r => r.wricef.stage === 'done').length, byKind, byWs };
}

/** A member is active on a day when the day is inside [from, to] (open ends count as active). */
export const isActive = (t, day) => !!t && (!t.from || t.from <= day) && (!t.to || t.to >= day);

/** Open leaf items whose owner (any side) left the project or is not in the team → [{ id, label, side, owner, left }]. */
export function orphans(m, rows, today) {
  const team = new Map(arr(m.team).map(t => [t.id, t]));
  const out = [];
  for (const r of rows) {
    if (!r.leaf || r.status === 'done') continue;
    for (const [side, k] of [['', 'owner'], ['F', 'fnOwner'], ['D', 'devOwner']]) {
      const id = r[k]; if (!id) continue;
      const t = team.get(id);
      if (!t || !isActive(t, today)) out.push({ id: r.id, num: r.num, label: r.label, ws: r.ws, side, field: k, owner: id, name: t?.name || id, left: t?.to || '' });
    }
  }
  return out;
}

/** Moves the open items of one member to another (finished items keep their owner).
 *  side: 'F' | 'D' | '' (all fields). Returns { model, moved: [ids] }. */
export function reassign(model, fromId, toId, { side = '', today = iso(Date.now()), includeDone = false } = {}) {
  const m = normalizeModel(model);
  if (!m.team.some(t => t.id === toId)) throw new Error(`team member ${toId} not found`);
  const { rows } = rollup(m);
  const leafDone = new Map(rows.map(r => [r.id, r.leaf && r.status === 'done']));
  const fields = side === 'F' ? ['fnOwner'] : side === 'D' ? ['devOwner'] : ['owner', 'fnOwner', 'devOwner'];
  const moved = [];
  for (const w of m.wbs) {
    if (!includeDone && leafDone.get(w.id)) continue;
    let hit = false;
    for (const k of fields) if (w[k] === fromId) { w[k] = toId; hit = true; }
    if (hit) { moved.push(w.id); w.note = [w.note, `${today} ${fromId} → ${toId}`].filter(Boolean).join(' · '); }
  }
  return { model: m, moved };
}

/** KPI RAG from actual vs target and direction: green when met, amber within 10 % of the target, else red. */
export function kpiRag(k) {
  const a = Number(k.actual), t = Number(k.target);
  if (k.actual === '' || k.actual == null || !Number.isFinite(a)) return 'none';
  if (k.target === '' || k.target == null || !Number.isFinite(t)) return 'none';
  const met = k.dir === 'down' ? a <= t : a >= t;
  if (met) return 'green';
  const gap = Math.abs(a - t) / (Math.abs(t) || 1);
  return gap <= 0.1 ? 'amber' : 'red';
}

/** KPIs computed from the plan and the SAP actuals. ids are stable so their trend lives in snapshots[].kpi. */
export function autoKpis(m, x) {
  const avg = (l) => (l.length ? Math.round(l.reduce((s, n) => s + n, 0) / l.length) : null);
  const due = x.milestones.filter(s => s.base <= x.today);
  const onTime = due.filter(s => (s.status === 'passed' || s.actual) && (s.actual || s.forecast || s.base) <= s.base);
  const open = x.rows.filter(r => r.leaf && r.status !== 'done');
  const people = new Map();
  for (const r of open) for (const id of new Set([r.owner, r.fnOwner, r.devOwner].filter(Boolean))) people.set(id, (people.get(id) || 0) + 1);
  const a = m.actuals;
  const recent = arr(a?.throughput).slice(-4);
  const dumps = arr(a?.dumps);
  const k = [
    ['spi', 'schedule', x.progress.planned ? +(x.progress.actual / x.progress.planned).toFixed(2) : null, 1, 'up', ''],
    ['ms-ontime', 'schedule', due.length ? Math.round((onTime.length / due.length) * 100) : null, 90, 'up', '%'],
    ['late', 'schedule', x.late.length, 0, 'down', ''],
    ['wricef-done', 'wricef', x.wricef.total ? Math.round((x.wricef.done / x.wricef.total) * 100) : null, x.wricef.total ? Math.min(100, x.progress.planned) : null, 'up', '%'],
    ['wait-dev', 'wricef', avg(x.handoff.toDev.map(i => i.waiting).filter(n => n != null)), 5, 'down', 'd'],
    ['wait-fut', 'wricef', avg(x.handoff.toFn.map(i => i.waiting).filter(n => n != null)), 5, 'down', 'd'],
    ['tr-week-F', 'transport', a ? avg(recent.map(w => w.F)) ?? 0 : null, null, 'up', ''],
    ['tr-week-D', 'transport', a ? avg(recent.map(w => w.D)) ?? 0 : null, null, 'up', ''],
    ['tr-open', 'transport', a ? arr(a.transports).filter(t => t.status === 'open').length : null, null, 'down', ''],
    ['orphans', 'team', x.orphans.length, 0, 'down', ''],
    ['load-max', 'team', people.size ? Math.max(...people.values()) : null, null, 'down', ''],
    ['dumps-day', 'hypercare', m.project.goLive <= x.today && a ? (dumps.length ? Math.round(dumps.reduce((s, d) => s + d.count, 0) / Math.max(1, days(m.project.goLive, x.today) + 1)) : 0) : null, null, 'down', ''],
  ];
  return k.map(([id, group, actual, target, dir, unit]) => ({ id, group, actual, target, dir, unit, auto: true,
    history: arr(m.snapshots).filter(s => s.kpi && s.kpi[id] != null).map(s => ({ date: s.date, value: s.kpi[id] })) }))
    .map(k2 => ({ ...k2, rag: kpiRag(k2) }));
}

/** Everything the page needs, computed once. */
export function viewModel(model, today = iso(Date.now())) {
  const m = normalizeModel(model);
  const t = m.today || today;
  const { rows, byId } = rollup(m);
  for (const r of rows) r.rag = rag(r, t);
  const phases = rows.filter(r => r.depth === 0);
  const leaves = rows.filter(r => r.leaf);
  const totalW = leaves.reduce((s, r) => s + r.weight, 0) || 1;
  const actual = Math.round(leaves.reduce((s, r) => s + r.pct * r.weight, 0) / totalW);
  const planned = Math.round(leaves.reduce((s, r) => s + plannedShare(r, t) * r.weight, 0) / totalW);
  const milestones = m.milestones.map(x => milestoneView(x, t)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const late = leaves.filter(r => r.rag === 'red').sort((a, b) => (a.finish < b.finish ? -1 : 1));
  const wsRag = {};
  for (const r of leaves) { const w = r.ws || '—'; wsRag[w] = wsRag[w] || { red: 0, amber: 0, green: 0, total: 0 }; wsRag[w][r.rag]++; wsRag[w].total++; }
  const overall = late.length > leaves.length * 0.1 || milestones.some(x => x.rag === 'red' && x.date >= t) ? 'red'
    : orphans(m, rows, t).length ? 'amber'
    : planned - actual >= 10 || milestones.some(x => x.rag === 'amber') ? 'amber' : 'green';
  const out = {
    m, today: t, rows, byId, phases, milestones, late, wsRag, overall,
    progress: { planned, actual }, curve: sCurve(m, rows), snapshots: m.snapshots,
    handoff: handoffQueue(rows, t), wricef: wricefStats(rows), orphans: orphans(m, rows, t),
    upcoming: milestones.filter(x => !x.actual && x.status !== 'passed' && x.date >= t).slice(0, 5),
    span: { start: m.project.start, end: [m.project.end, m.project.goLive, ...rows.map(r => r.finish)].filter(Boolean).sort().at(-1) },
  };
  out.kpis = [...autoKpis(m, out), ...m.kpis.map(k => ({ ...k, auto: false, rag: kpiRag(k) }))];
  return out;
}

/** Adds or replaces today's snapshot (planned / actual % of the whole project). */
export function withSnapshot(model, today = iso(Date.now())) {
  const v = viewModel(model, today);
  const snaps = arr(model.snapshots).filter(s => s.date !== v.today);
  const kpi = Object.fromEntries(v.kpis.filter(k => k.auto && k.actual != null).map(k => [k.id, k.actual]));
  snaps.push({ date: v.today, planned: v.progress.planned, actual: v.progress.actual, kpi });
  snaps.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ...model, snapshots: snaps };
}
