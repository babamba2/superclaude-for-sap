// sc4sap:uat-scenarios — the model of one UAT scenario set, and the operations on it. Pure: no I/O.
//
// set       { id, kind ('uat' | 'sit' — user acceptance or integration test), project, module, title, lang,
//             cycles: ['1st','2nd','3rd'], systems: ['SAP', …],
//             schedule: { from, to, place }, version, scenarios: [...] }
// scenario  { id, theme (L2 process chain), process (L3), task (L4), title, description, variant,
//             owner (business PI), consultant, date, time, place, steps: [...] }
// step      { id ('STEP-001'), module (SD, MM, FI … — who runs it; an integration test crosses them), activity, system, tcode, checks: [..], inputs: [..], outputs: [..],
//             user (test user ID), results: { '1st': 'pass' | 'fail' | 'blocked' | '' }, status,
//             followUp, issue }
//
// A proposal (the AI's, or anybody's) is a patch: a list of operations the reader accepts or rejects
// one by one — see `applyPatch`. Nothing in the model is a person's name except `owner` / `consultant`,
// which the reader types; test users are IDs.

export const STEP_FIELDS = ['module', 'activity', 'system', 'tcode', 'checks', 'inputs', 'outputs', 'user', 'status', 'followUp', 'issue'];
export const LIST_FIELDS = new Set(['checks', 'inputs', 'outputs']);
export const SCENARIO_FIELDS = ['theme', 'process', 'task', 'title', 'description', 'variant', 'owner', 'consultant', 'date', 'time', 'place'];
export const RESULTS = ['pass', 'fail', 'blocked', ''];
export const STATUSES = ['open', 'in-progress', 'done', 'on-hold'];
export const KINDS = ['uat', 'sit'];
const DEFAULT_CYCLES = ['1st', '2nd', '3rd'];

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === undefined || v === null ? '' : String(v).trim());
/** A list field from a string ("■ a / ■ b", one per line) or an array. */
export const listOf = (v) =>
  (Array.isArray(v) ? v : str(v).split(/\r?\n|\s\/\s/))
    .map((x) => str(x).replace(/^[■•\-*]\s*/, ''))
    .filter(Boolean);
const stepId = (n) => `STEP-${String(n).padStart(3, '0')}`;

/** The set with every field present, IDs and step numbers filled in, lists as arrays. */
export function normalize(set) {
  const cycles = arr(set?.cycles).length ? arr(set.cycles).map(str) : DEFAULT_CYCLES;
  const out = {
    id: str(set?.id) || 'UAT', kind: KINDS.includes(str(set?.kind)) ? str(set.kind) : 'uat',
    project: str(set?.project), module: str(set?.module).toUpperCase(),
    title: str(set?.title), lang: str(set?.lang) || 'en', cycles,
    systems: arr(set?.systems).length ? arr(set.systems).map(str) : ['SAP'],
    schedule: { from: str(set?.schedule?.from), to: str(set?.schedule?.to), place: str(set?.schedule?.place) },
    version: str(set?.version) || '0.1',
    scenarios: [],
  };
  const seen = new Set();
  arr(set?.scenarios).forEach((s, i) => {
    let id = str(s?.id) || `${out.module || 'S'}${String(i + 1).padStart(2, '0')}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    const sc = { id };
    for (const f of SCENARIO_FIELDS) sc[f] = str(s?.[f]);
    sc.steps = arr(s?.steps).map((st, j) => {
      const step = { id: stepId(j + 1) };
      for (const f of STEP_FIELDS) step[f] = LIST_FIELDS.has(f) ? listOf(st?.[f]) : str(st?.[f]);
      step.tcode = step.tcode.toUpperCase();
      // A step without its own module belongs to the set's.
      step.module = (step.module || out.module).toUpperCase();
      if (!STATUSES.includes(step.status)) step.status = 'open';
      step.results = Object.fromEntries(cycles.map((c) => {
        const r = str(st?.results?.[c]).toLowerCase();
        return [c, RESULTS.includes(r) ? r : ''];
      }));
      return step;
    });
    out.scenarios.push(sc);
  });
  return out;
}

/** What a reviewer would flag: per scenario / step, with a path the page can jump to. */
export function validate(set) {
  const issues = [];
  const add = (level, path, text) => issues.push({ level, path, text });
  if (!set.scenarios.length) add('error', '', 'no scenario');
  for (const s of set.scenarios) {
    if (!s.title) add('error', s.id, 'scenario has no title');
    if (!s.steps.length) add('error', s.id, 'scenario has no step');
    for (const st of s.steps) {
      const p = `${s.id}/${st.id}`;
      if (!st.activity) add('error', p, 'step has no activity');
      if (st.system === 'SAP' || !st.system) {
        if (!st.tcode) add('warn', p, 'SAP step without a T-code');
      }
      if (!st.outputs.length && !st.checks.length) add('warn', p, 'nothing to check: no expected output and no check point');
      if (st.status === 'done' && set.cycles.every((c) => !st.results[c])) add('warn', p, 'done but no cycle result');
      if (set.cycles.some((c) => st.results[c] === 'fail') && !st.followUp) add('warn', p, 'failed without a follow-up action');
    }
    // An integration test proves the hand-offs: it crosses modules, and the step where the work
    // changes hands checks what arrived (a document, a posting, a status).
    if (set.kind === 'sit' && s.steps.length) {
      const modules = new Set(s.steps.map((st) => st.module).filter(Boolean));
      if (modules.size < 2) add('warn', s.id, 'integration scenario stays in one module');
      s.steps.forEach((st, j) => {
        if (j > 0 && st.module && st.module !== s.steps[j - 1].module && !st.checks.length) {
          add('warn', `${s.id}/${st.id}`, `hand-off ${s.steps[j - 1].module} → ${st.module} without a check point`);
        }
      });
    }
  }
  return issues;
}

/** Counts per cycle and result, and steps per status — the page's progress bar. */
export function progress(set) {
  const steps = set.scenarios.flatMap((s) => s.steps);
  const byCycle = Object.fromEntries(set.cycles.map((c) => [c, { pass: 0, fail: 0, blocked: 0, open: 0 }]));
  for (const st of steps) for (const c of set.cycles) byCycle[c][st.results[c] || 'open'] += 1;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, steps.filter((x) => x.status === s).length]));
  return { scenarios: set.scenarios.length, steps: steps.length, byCycle, byStatus };
}

/**
 * Apply a proposal. Operations (each one accepted or rejected on its own by the reader):
 *   { op: 'set-scenario', scenario, field, value }        — a scenario field
 *   { op: 'set-step', scenario, step, field, value }       — a step field (lists as arrays)
 *   { op: 'add-step', scenario, after?, step }             — a new step after `after` (or at the end)
 *   { op: 'remove-step', scenario, step }
 *   { op: 'add-scenario', after?, scenario }               — a whole new scenario with its steps
 * Step IDs are renumbered after adds and removes. Returns { set, applied, skipped } — an operation that
 * names something missing is skipped with the reason, never guessed.
 */
export function applyPatch(set, ops) {
  const next = structuredClone(set);
  const applied = [];
  const skipped = [];
  const find = (id) => next.scenarios.find((s) => s.id === id);
  for (const [i, op] of arr(ops).entries()) {
    const skip = (why) => skipped.push({ index: i, op: op?.op, why });
    const sc = op?.scenario && typeof op.scenario === 'string' ? find(op.scenario) : null;
    switch (op?.op) {
      case 'set-scenario':
        if (!sc) { skip('scenario not found'); continue; }
        if (!SCENARIO_FIELDS.includes(op.field)) { skip(`unknown field ${op.field}`); continue; }
        sc[op.field] = str(op.value);
        break;
      case 'set-step': {
        if (!sc) { skip('scenario not found'); continue; }
        const st = sc.steps.find((x) => x.id === op.step);
        if (!st) { skip('step not found'); continue; }
        if (op.field === 'result') {
          if (!next.cycles.includes(op.cycle) || !RESULTS.includes(str(op.value))) { skip('bad cycle or result'); continue; }
          st.results[op.cycle] = str(op.value);
        } else if (STEP_FIELDS.includes(op.field)) {
          st[op.field] = LIST_FIELDS.has(op.field) ? listOf(op.value) : str(op.value);
          if (op.field === 'tcode') st.tcode = st.tcode.toUpperCase();
        } else { skip(`unknown field ${op.field}`); continue; }
        break;
      }
      case 'add-step': {
        if (!sc) { skip('scenario not found'); continue; }
        const at = op.after ? sc.steps.findIndex((x) => x.id === op.after) + 1 : sc.steps.length;
        if (op.after && at === 0) { skip('step to insert after not found'); continue; }
        const [step] = normalize({ cycles: next.cycles, scenarios: [{ id: 'x', steps: [op.step] }] }).scenarios[0].steps;
        // A temporary ID until the patch is done, so a later operation cannot hit it by an old number.
        step.id = `NEW-${i}`;
        sc.steps.splice(at, 0, step);
        break;
      }
      case 'remove-step': {
        if (!sc) { skip('scenario not found'); continue; }
        const at = sc.steps.findIndex((x) => x.id === op.step);
        if (at < 0) { skip('step not found'); continue; }
        sc.steps.splice(at, 1);
        break;
      }
      case 'add-scenario': {
        const [made] = normalize({ module: next.module, cycles: next.cycles, scenarios: [op.scenario] }).scenarios;
        if (find(made.id)) made.id = `${made.id}-${next.scenarios.length + 1}`;
        const at = op.after ? next.scenarios.findIndex((s) => s.id === op.after) + 1 : next.scenarios.length;
        next.scenarios.splice(at > 0 ? at : next.scenarios.length, 0, made);
        break;
      }
      default:
        skip(`unknown op ${op?.op}`);
        continue;
    }
    applied.push(i);
  }
  for (const s of next.scenarios) s.steps.forEach((st, j) => { st.id = stepId(j + 1); });
  return { set: next, applied, skipped };
}
