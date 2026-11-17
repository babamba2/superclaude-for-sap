// sc4sap:uat-scenarios — the model of one UAT scenario set, and the operations on it. Pure: no I/O.
//
// set       { id, kind ('uat' | 'sit' — user acceptance or integration test), project, module, title, lang,
//             cycles: ['1st','2nd','3rd'], systems: ['SAP', …],
//             schedule: { from, to, place }, version, scenarios: [...], issues: [...] }
// scenario  { id, theme (L2 process chain), process (L3), task (L4), title, description, variant,
//             company (legal entity / company code), channel (distribution channel), productGroup,
//             leadModule, focus (key check point), legacyId (the scenario ID of an earlier test),
//             owner (business PI), consultant, date (planned), actualDate, time, place,
//             result ('pass' | 'fail' | '' — the scenario's own verdict), steps: [...] }
// step      { id ('STEP-001'), phase (section the step belongs to, e.g. "I. Order intake"),
//             module (SD, MM, FI … — who runs it; an integration test crosses them), activity, system, tcode,
//             checks: [..], inputs: [..], outputs: [..], user (test user ID), tester (who runs it),
//             cycles: [..] (the test cycles the step runs in; empty = every cycle),
//             results: { '1st': 'pass' | 'fail' | 'blocked' | 'n/a' | '' }, status, followUp, issue }
// issue     { id ('ISS-0001'), scenario, step, module, type (defect | change | data | authorization |
//             interface | question), text, raisedOn, raisedBy, followUp, state (open | waiting | done | n/a), owner,
//             transports: [request numbers that fix it, <SID>K<6> only], transportsBad: [values given there that are not
//             request numbers — never linked, named by `check`], retest (the cycle the fix is retested in) }
//
// A proposal (the AI's, or anybody's) is a patch: a list of operations the reader accepts or rejects
// one by one — see `applyPatch`. Nothing in the model is a person's name except `owner` / `consultant`,
// which the reader types; test users are IDs.

export const STEP_FIELDS = ['phase', 'module', 'activity', 'system', 'tcode', 'checks', 'inputs', 'outputs', 'user', 'tester', 'cycles', 'status', 'followUp', 'issue'];
export const LIST_FIELDS = new Set(['checks', 'inputs', 'outputs', 'cycles']);
export const SCENARIO_FIELDS = ['theme', 'process', 'task', 'title', 'description', 'variant', 'company', 'channel', 'productGroup', 'leadModule', 'focus', 'legacyId', 'owner', 'consultant', 'date', 'actualDate', 'time', 'place', 'result'];
export const RESULTS = ['pass', 'fail', 'blocked', 'n/a', ''];
export const SCENARIO_RESULTS = ['pass', 'fail', ''];
export const ISSUE_FIELDS = ['scenario', 'step', 'module', 'type', 'text', 'raisedOn', 'raisedBy', 'followUp', 'state', 'owner', 'transports', 'retest'];
/** A transport request number of any system: <SID>K<6>. */
export const TRKORR_RE = /^[A-Z0-9]{3}K[A-Z0-9]{6}$/;
/** Request numbers from a list or a string (comma, space, slash or new line between them), upper case, once each. */
export const requestsOf = (v) => [...new Set((Array.isArray(v) ? v : [v]).flatMap((x) => String(x ?? '').split(/[\s,;/]+/)).map((x) => x.trim().toUpperCase()).filter(Boolean))];
export const ISSUE_TYPES = ['defect', 'change', 'data', 'authorization', 'interface', 'question'];
export const ISSUE_STATES = ['open', 'waiting', 'done', 'n/a'];
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
const issueId = (n) => `ISS-${String(n).padStart(4, '0')}`;
/** Whether a step runs in a cycle: every cycle when it names none. */
export const runsIn = (step, cycle) => !step.cycles?.length || step.cycles.includes(cycle);

/** An issue with every field present; state and type from their lists. */
export function normalizeIssue(raw, id) {
  const out = { id: str(raw?.id) || id };
  for (const f of ISSUE_FIELDS) out[f] = f === 'transports' ? [] : str(raw?.[f]);
  // fixing requests: only <SID>K<6> values; anything else is kept apart (transportsBad) so `check` names it
  const given = requestsOf(raw?.transports);
  out.transports = given.filter((t) => TRKORR_RE.test(t));
  out.transportsBad = requestsOf([...given.filter((t) => !TRKORR_RE.test(t)), ...requestsOf(raw?.transportsBad)]);
  out.module = out.module.toUpperCase();
  if (!ISSUE_STATES.includes(out.state)) out.state = 'open';
  if (out.type && !ISSUE_TYPES.includes(out.type)) out.type = 'defect';
  return out;
}

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
    issues: [],
  };
  const seen = new Set();
  arr(set?.scenarios).forEach((s, i) => {
    let id = str(s?.id) || `${out.module || 'S'}${String(i + 1).padStart(2, '0')}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    const sc = { id };
    for (const f of SCENARIO_FIELDS) sc[f] = str(s?.[f]);
    sc.leadModule = sc.leadModule.toUpperCase();
    if (!SCENARIO_RESULTS.includes(sc.result)) sc.result = '';
    sc.steps = arr(s?.steps).map((st, j) => {
      const step = { id: stepId(j + 1) };
      for (const f of STEP_FIELDS) step[f] = LIST_FIELDS.has(f) ? listOf(st?.[f]) : str(st?.[f]);
      step.tcode = step.tcode.toUpperCase();
      // A step without its own module belongs to the set's.
      step.module = (step.module || out.module).toUpperCase();
      if (!STATUSES.includes(step.status)) step.status = 'open';
      step.cycles = step.cycles.filter((c) => cycles.includes(c));
      step.results = Object.fromEntries(cycles.map((c) => {
        const r = str(st?.results?.[c]).toLowerCase();
        return [c, RESULTS.includes(r) ? r : ''];
      }));
      return step;
    });
    out.scenarios.push(sc);
  });
  const ids = new Set();
  arr(set?.issues).forEach((raw, i) => {
    let issue = normalizeIssue(raw, issueId(i + 1));
    if (ids.has(issue.id)) issue = { ...issue, id: issueId(ids.size + 1) };
    while (ids.has(issue.id)) issue.id = `${issue.id}-${i + 1}`;
    ids.add(issue.id);
    out.issues.push(issue);
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
      if (set.cycles.some((c) => st.results[c] === 'fail') && !st.issue && !set.issues.some((i) => i.scenario === s.id && i.step === st.id)) {
        add('warn', p, 'failed without a logged issue');
      }
      for (const c of set.cycles) if (st.results[c] && st.results[c] !== 'n/a' && !runsIn(st, c)) add('warn', p, `result in ${c}, a cycle the step does not run in`);
    }
    if (s.actualDate && !s.result) add('warn', s.id, 'tested (actual date) but no scenario result');
    const last = [...set.cycles].reverse().find((c) => s.steps.some((st) => st.results[c]));
    if (s.result === 'pass' && last && s.steps.some((st) => st.results[last] === 'fail')) add('warn', s.id, `scenario passed but a step failed in ${last}`);
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
  for (const i of set.issues) {
    if (i.scenario && !set.scenarios.some((s) => s.id === i.scenario)) add('warn', `issue:${i.id}`, `issue names an unknown scenario ${i.scenario}`);
    if (!i.text) add('warn', `issue:${i.id}`, 'issue has no description');
    if (i.state === 'done' && !i.followUp) add('warn', `issue:${i.id}`, 'closed without a follow-up');
    for (const t of i.transportsBad || []) add('warn', `issue:${i.id}`, `${t} is not a transport request number (not linked)`);
    if (i.type === 'defect' && i.state === 'done' && !i.transports.length) add('warn', `issue:${i.id}`, 'defect closed without a fixing request');
    if (i.retest && !set.cycles.includes(i.retest)) add('warn', `issue:${i.id}`, `retest cycle ${i.retest} is not a cycle of the set`);
  }
  return issues;
}

/** Counts per cycle and result, and steps per status — the page's progress bar. */
export function progress(set, today = new Date().toISOString().slice(0, 10)) {
  const steps = set.scenarios.flatMap((s) => s.steps);
  const byCycle = Object.fromEntries(set.cycles.map((c) => [c, { pass: 0, fail: 0, blocked: 0, 'n/a': 0, open: 0 }]));
  for (const st of steps) for (const c of set.cycles) if (runsIn(st, c)) byCycle[c][st.results[c] || 'open'] += 1;
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, steps.filter((x) => x.status === s).length]));
  // The dashboard: scenarios per lead module and per company — planned, tested, pass, fail —
  // and how many were due by today. A scenario is tested when it has an actual date or a result.
  const tally = () => ({ plan: 0, due: 0, tested: 0, pass: 0, fail: 0 });
  const byModule = {};
  const byCompany = {};
  for (const s of set.scenarios) {
    const lead = s.leadModule || s.steps[0]?.module || set.module || '-';
    for (const [map, key] of [[byModule, lead], [byCompany, s.company || '-']]) {
      const t = (map[key] ||= tally());
      t.plan += 1;
      if (s.date && s.date <= today) t.due += 1;
      if (s.actualDate || s.result) t.tested += 1;
      if (s.result === 'pass') t.pass += 1;
      if (s.result === 'fail') t.fail += 1;
    }
  }
  // Which modules take part in each scenario — the participation matrix of an integration test.
  const modules = [...new Set(steps.map((st) => st.module).filter(Boolean))].sort();
  const participation = set.scenarios.map((s) => ({ scenario: s.id, modules: modules.filter((m) => s.steps.some((st) => st.module === m)) }));
  const issues = Object.fromEntries(ISSUE_STATES.map((st) => [st, set.issues.filter((i) => i.state === st).length]));
  return { scenarios: set.scenarios.length, steps: steps.length, byCycle, byStatus, byModule, byCompany, modules, participation, issues };
}

/**
 * Apply a proposal. Operations (each one accepted or rejected on its own by the reader):
 *   { op: 'set-scenario', scenario, field, value }        — a scenario field
 *   { op: 'set-step', scenario, step, field, value }       — a step field (lists as arrays)
 *   { op: 'add-step', scenario, after?, step }             — a new step after `after` (or at the end)
 *   { op: 'remove-step', scenario, step }
 *   { op: 'add-scenario', after?, scenario }               — a whole new scenario with its steps
 *   { op: 'add-issue', issue }                              — a new issue, numbered ISS-0001 …
 *   { op: 'set-issue', issue, field, value } · { op: 'remove-issue', issue }
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
        if (op.field === 'result' && !SCENARIO_RESULTS.includes(str(op.value))) { skip('bad scenario result'); continue; }
        sc[op.field] = op.field === 'leadModule' ? str(op.value).toUpperCase() : str(op.value);
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
      case 'add-issue': {
        const n = next.issues.reduce((m, x) => Math.max(m, Number(/^ISS-(\d+)$/.exec(x.id)?.[1] || 0)), 0) + 1;
        next.issues.push(normalizeIssue({ ...op.issue, id: '' }, issueId(n)));
        break;
      }
      case 'set-issue': {
        const issue = next.issues.find((x) => x.id === op.issue);
        if (!issue) { skip('issue not found'); continue; }
        if (!ISSUE_FIELDS.includes(op.field)) { skip(`unknown field ${op.field}`); continue; }
        if (op.field === 'transports') {
          const bad = requestsOf(op.value).filter((t) => !TRKORR_RE.test(t));
          if (bad.length) { skip(`not a transport request number: ${bad.join(', ')}`); continue; }
          Object.assign(issue, normalizeIssue({ ...issue, transports: op.value, transportsBad: [] }, issue.id));
          break;
        }
        Object.assign(issue, normalizeIssue({ ...issue, [op.field]: op.value }, issue.id));
        break;
      }
      case 'remove-issue': {
        const at = next.issues.findIndex((x) => x.id === op.issue);
        if (at < 0) { skip('issue not found'); continue; }
        next.issues.splice(at, 1);
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
  // Steps are renumbered; the issues that name a step follow it to its new number.
  for (const s of next.scenarios) {
    const moved = new Map();
    s.steps.forEach((st, j) => { moved.set(st.id, stepId(j + 1)); st.id = stepId(j + 1); });
    // An issue on a removed step keeps its scenario and loses the step.
    for (const i of next.issues) if (i.scenario === s.id && i.step) i.step = moved.get(i.step) ?? '';
  }
  return { set: next, applied, skipped };
}
