// sc4sap:project-dashboard — the migration schedule: who loads which object, when, in which round (the web's
// /migration "이관 일정"). Pure functions over a normalized migration document (`migration-doc.mjs`).
//
//   normalizeSchedule(list)                 the step rows: { objectId, runId, step, start, end, status, note }
//   stepsOf(doc, objectId, runId)           the five steps of one object in one round (blank ones filled in)
//   spanOf(steps) / rollupOf(steps)         first start / last end; the round's status from its steps
//   scheduleIssues(doc)                     structured findings: dates, run window, unknown references,
//                                           dependency loops and the dependency order (a dependent object
//                                           starting before its predecessor finishes, in the same round)
//   issueText(issue, lang)                  one line for the checks panel
//   ganttRows(doc, { owner, runId, category })  rows for the time view (filters optional) and its date range
//   reconOf(doc, objectId, runId)           the reconciliation results of that object in that round (counts only)
//
// Steps: extract → cleanse → load → validate → sign-off. Dates are YYYY-MM-DD; status planned | inprogress | done |
// blocked. An object's predecessors are `deps` (object ids): "BP before sales orders".

// No imports: the web's schedule dialog runs this in the browser (`@plugin/project/migration-schedule.mjs`).
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v, max = 4000) => (v == null ? '' : String(v)).slice(0, max);

export const STEPS = ['extract', 'cleanse', 'load', 'validate', 'signoff'];
export const STEP_STATUS = ['planned', 'inprogress', 'done', 'blocked'];
export const CATEGORIES = ['master', 'transaction', 'balance'];
export const OWNER_TYPES = ['business', 'it'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const day = (v) => {
  const s = String(v || '');
  if (!DAY.test(s)) return '';
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s ? '' : s;
};
const pick = (v, list, dflt) => (list.includes(v) ? v : dflt);

/** The step rows, one per (object, round, step); the first of duplicates wins; unknown steps are dropped. */
export function normalizeSchedule(list) {
  const seen = new Set(), out = [];
  for (const x0 of arr(list)) {
    const x = x0 && typeof x0 === 'object' ? x0 : {};
    const row = {
      objectId: str(x.objectId, 40), runId: str(x.runId, 12), step: pick(x.step, STEPS, ''),
      start: day(x.start), end: day(x.end), status: pick(x.status, STEP_STATUS, 'planned'), note: str(x.note, 1000),
    };
    if (!row.objectId || !row.runId || !row.step) continue;
    const k = `${row.objectId}|${row.runId}|${row.step}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
  }
  return out;
}

export function stepsOf(doc, objectId, runId) {
  const rows = arr(doc?.schedule);
  return STEPS.map((step) => rows.find((r) => r.objectId === objectId && r.runId === runId && r.step === step) || { objectId, runId, step, start: '', end: '', status: 'planned', note: '' });
}

export function spanOf(steps) {
  const starts = arr(steps).map((s) => s.start || s.end).filter(Boolean).sort();
  const ends = arr(steps).map((s) => s.end || s.start).filter(Boolean).sort();
  return { start: starts[0] || '', end: ends.at(-1) || '' };
}

/** The round's status: blocked if any step is; done when every step is; in progress once any step moved; else planned. */
export function rollupOf(steps) {
  const s = arr(steps).map((x) => x.status);
  if (s.includes('blocked')) return 'blocked';
  if (s.length && s.every((x) => x === 'done')) return 'done';
  if (s.some((x) => x === 'inprogress' || x === 'done')) return 'inprogress';
  return 'planned';
}

/** Dependency loops among the objects (each loop once, as its object ids). */
function loops(objects) {
  const deps = new Map(objects.map((o) => [o.id, arr(o.deps).filter((d) => d !== o.id && objects.some((x) => x.id === d))]));
  const state = new Map(), found = [], keys = new Set();
  const walk = (id, path) => {
    state.set(id, 1);
    for (const d of deps.get(id) || []) {
      if (state.get(d) === 1) {
        const loop = path.slice(path.indexOf(d));
        const key = [...loop].sort().join(',');
        if (!keys.has(key)) { keys.add(key); found.push(loop); }
      } else if (!state.get(d)) walk(d, [...path, d]);
    }
    state.set(id, 2);
  };
  for (const o of objects) if (!state.get(o.id)) walk(o.id, [o.id]);
  return found;
}

export function scheduleIssues(doc) {
  const objects = arr(doc?.objects).filter((o) => o.id), runs = arr(doc?.runs);
  const objIds = new Set(objects.map((o) => o.id)), runIds = new Set(runs.map((r) => r.id));
  const out = [];
  for (const r of arr(doc?.schedule)) {
    if (!objIds.has(r.objectId)) out.push({ kind: 'unknown-object', objectId: r.objectId, runId: r.runId, step: r.step });
    else if (!runIds.has(r.runId)) out.push({ kind: 'unknown-run', objectId: r.objectId, runId: r.runId, step: r.step });
    if (r.start && r.end && r.end < r.start) out.push({ kind: 'dates', objectId: r.objectId, runId: r.runId, step: r.step, start: r.start, end: r.end });
  }
  for (const o of objects) for (const d of arr(o.deps)) {
    if (d === o.id) out.push({ kind: 'self-dep', objectId: o.id });
    else if (!objIds.has(d)) out.push({ kind: 'unknown-dep', objectId: o.id, dep: d });
  }
  for (const loop of loops(objects)) out.push({ kind: 'loop', objectId: loop[0], loop });
  for (const run of runs) {
    for (const o of objects) {
      const span = spanOf(stepsOf(doc, o.id, run.id));
      if (span.start && run.planStart && span.start < run.planStart) out.push({ kind: 'window', objectId: o.id, runId: run.id, start: span.start, edge: run.planStart, side: 'before' });
      if (span.end && run.planEnd && span.end > run.planEnd) out.push({ kind: 'window', objectId: o.id, runId: run.id, end: span.end, edge: run.planEnd, side: 'after' });
      if (!span.start) continue;
      for (const d of arr(o.deps)) {
        if (d === o.id || !objIds.has(d)) continue;
        const pre = spanOf(stepsOf(doc, d, run.id));
        if (pre.end && span.start < pre.end) out.push({ kind: 'order', objectId: o.id, dep: d, runId: run.id, start: span.start, depEnd: pre.end });
      }
    }
  }
  return out;
}

const TXT = {
  ko: {
    'unknown-object': (x) => `일정 ${x.objectId} / ${x.runId} / ${x.step}: 이관 대상 ${x.objectId}가 없어요`,
    'unknown-run': (x) => `일정 ${x.objectId} / ${x.runId} / ${x.step}: 회차 ${x.runId}가 없어요`,
    dates: (x) => `일정 ${x.objectId} / ${x.runId} / ${x.step}: 종료(${x.end})가 시작(${x.start})보다 빨라요`,
    'self-dep': (x) => `이관 대상 ${x.objectId}: 자기 자신을 선행으로 두었어요`,
    'unknown-dep': (x) => `이관 대상 ${x.objectId}: 선행 대상 ${x.dep}가 없어요`,
    loop: (x) => `선행 관계가 돌고 있어요: ${x.loop.join(' → ')} → ${x.loop[0]}`,
    window: (x) => (x.side === 'before' ? `${x.objectId} / ${x.runId}: 회차 시작(${x.edge})보다 먼저 시작해요 (${x.start})` : `${x.objectId} / ${x.runId}: 회차 종료(${x.edge}) 뒤에 끝나요 (${x.end})`),
    order: (x) => `${x.objectId} / ${x.runId}: 선행 ${x.dep}가 끝나기(${x.depEnd}) 전에 시작해요 (${x.start})`,
  },
  en: {
    'unknown-object': (x) => `schedule ${x.objectId} / ${x.runId} / ${x.step}: object ${x.objectId} not found`,
    'unknown-run': (x) => `schedule ${x.objectId} / ${x.runId} / ${x.step}: round ${x.runId} not found`,
    dates: (x) => `schedule ${x.objectId} / ${x.runId} / ${x.step}: end ${x.end} before start ${x.start}`,
    'self-dep': (x) => `object ${x.objectId}: depends on itself`,
    'unknown-dep': (x) => `object ${x.objectId}: predecessor ${x.dep} not found`,
    loop: (x) => `dependency loop: ${x.loop.join(' → ')} → ${x.loop[0]}`,
    window: (x) => (x.side === 'before' ? `${x.objectId} / ${x.runId}: starts ${x.start}, before the round starts (${x.edge})` : `${x.objectId} / ${x.runId}: ends ${x.end}, after the round ends (${x.edge})`),
    order: (x) => `${x.objectId} / ${x.runId}: starts ${x.start}, before its predecessor ${x.dep} finishes (${x.depEnd})`,
  },
};
export const issueText = (issue, lang) => (TXT[lang === 'en' ? 'en' : 'ko'][issue.kind] || (() => issue.kind))(issue);
/** Errors stop nothing but are wrong data; the rest are warnings. */
export const issueIsError = (issue) => issue.kind === 'dates' || issue.kind === 'loop' || issue.kind === 'self-dep';

/** The reconciliation of one object in one round, as counts (never the numbers themselves). */
export function reconOf(doc, objectId, runId) {
  const rules = new Set(arr(doc?.rules).filter((r) => r.objectId === objectId).map((r) => r.id));
  const rows = arr(doc?.results).filter((x) => x.runId === runId && rules.has(x.ruleId));
  return { results: rows.length, ok: rows.filter((x) => x.verdict === 'ok').length, check: rows.filter((x) => x.verdict === 'check').length, ng: rows.filter((x) => x.verdict === 'ng').length };
}

/** The time view: one row per object and round (filtered), with its steps, span, status and finding count. */
export function ganttRows(doc, { owner = '', runId = '', category = '' } = {}) {
  const issues = scheduleIssues(doc);
  const rows = [];
  for (const run of arr(doc?.runs)) {
    if (runId && run.id !== runId) continue;
    for (const o of arr(doc?.objects)) {
      if (!o.id || (owner && o.owner !== owner) || (category && o.category !== category)) continue;
      const steps = stepsOf(doc, o.id, run.id);
      const span = spanOf(steps);
      rows.push({
        objectId: o.id, name: o.name, category: o.category || '', owner: o.owner || '', ownerType: o.ownerType || '', approach: o.approach || '',
        deps: arr(o.deps), runId: run.id, runLabel: run.label || run.id, ...span, status: rollupOf(steps), steps,
        issues: issues.filter((x) => x.objectId === o.id && (!x.runId || x.runId === run.id)).length,
      });
    }
  }
  const dates = rows.flatMap((r) => [r.start, r.end]).filter(Boolean).sort();
  return { rows, from: dates[0] || '', to: dates.at(-1) || '' };
}
