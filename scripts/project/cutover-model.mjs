// sc4sap:project-dashboard — cutover readiness (pure functions, no I/O, no SAP).
//
//   seedCutover(model, tpl, { window, freeze, lang })   generic runbook of the project type → model.cutover (idempotent by id)
//   cutDueOf(task, cutover, goLive)                    planned day (pre / freeze / post) — offset in days from go-live or a freeze date
//   criticalPath(tasks, durationOf?)                   window tasks: earliest start / finish per task, longest path, total hours
//   rehearsalFit(cutover, rehearsalId?)                plan and rehearsal against the window length: fits / tight (< 10 % slack) / exceeds
//   cutRuleValue(name, arg, ctx)                       go / no-go rules of this module: jobs-released, tasks-open:<phase>, rehearsal-fit
//   goNoGoView(cutover, gateRows, ctx)                 per item: rule result (gateCheck rows + the rules above), human status wins; suggestion
//   importList(transports, cts)                        project requests in release order + CTS verdict / overlap warnings (never an import order)
//   tMinus(today, cutover, goLive)                     D-day and the tasks that are late today
//
// Model (project.cutover, checked by project-model.mjs checkModel):
//   { window: { start, end } (YYYY-MM-DDTHH:MM), freeze: { code, config } (YYYY-MM-DD), rehearsals: [{ id, date, note }],
//     tasks: [{ id, phase: pre|freeze|window|post, offset?, anchor?, label, ws, owner, durationH, deps, check?, status, actual?: { <rehearsal id | live>: { start, end } }, note }],
//     goNoGo: [{ id, text (criterion with an optional [rule] tag), owner, status: open|go|nogo|waived, evidence? }] }
// Rule tags follow project-status.mjs ("… [name<=N]"); a rule this module does not know stays manual.
// Names are prefixed (cut…) because this file is inlined into the dashboard page next to project-model / project-render.

import { arr, days } from './project-model.mjs';

export const CUT_PHASES = ['pre', 'freeze', 'window', 'post'];
export const CUT_STATUS = ['planned', 'done', 'skipped', 'failed'];
export const GNG_STATUS = ['open', 'go', 'nogo', 'waived'];

/** Defaults filled (status, deps, lists); a model without a cutover stays without one. */
export function normalizeCutover(c) {
  if (!c) return c;
  // window times typed with a space ("2027-01-02 18:00") are stored with T; anything unreadable stays as typed (checkCutover reports it)
  const w = { ...c.window };
  for (const k of ['start', 'end']) if (w[k] && cutDT(w[k])) w[k] = cutDT(w[k]);
  return { ...c, window: w, freeze: { ...c.freeze }, rehearsals: arr(c.rehearsals),
    tasks: arr(c.tasks).map(t => ({ status: 'planned', deps: [], ...t })), goNoGo: arr(c.goNoGo).map(g => ({ status: 'open', ...g })) };
}

/** { errors, warnings } of the cutover part; errors stop the cutover command. A dependency loop is an error. */
export function checkCutover(c, team = []) {
  const errors = [], warnings = [];
  if (!c) return { errors, warnings };
  // a real calendar day (2027-02-30 / 2027-13-40 fail), not only the shape
  const realDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && cutDT(`${s}T00:00`) !== '';
  const D = { test: realDay };
  for (const k of ['start', 'end']) if (c.window?.[k] && !cutDT(c.window[k])) errors.push(`cutover.window.${k} must be YYYY-MM-DD HH:MM (is "${String(c.window[k]).slice(0, 40)}")`);
  if (cutDT(c.window?.start) && cutDT(c.window?.end) && cutDT(c.window.end) <= cutDT(c.window.start)) errors.push('cutover.window.end must be after its start');
  for (const k of ['code', 'config']) if (c.freeze?.[k] && !D.test(c.freeze[k])) errors.push(`cutover.freeze.${k} must be YYYY-MM-DD`);
  const ids = new Set(arr(c.tasks).map(t => t.id)), seen = new Set(), people = new Set(arr(team).map(t => t.id));
  for (const t of arr(c.tasks)) {
    if (!t.id) { errors.push(`cutover task without id ("${t.label || ''}")`); continue; }
    if (seen.has(t.id)) errors.push(`duplicate cutover task id ${t.id}`);
    seen.add(t.id);
    if (!CUT_PHASES.includes(t.phase)) errors.push(`cutover task ${t.id}: phase must be one of ${CUT_PHASES.join(', ')}`);
    if (t.status && !CUT_STATUS.includes(t.status)) errors.push(`cutover task ${t.id}: unknown status "${t.status}"`);
    if (t.durationH != null && !(Number(t.durationH) >= 0)) errors.push(`cutover task ${t.id}: durationH must be a number of hours`);
    for (const d of arr(t.deps)) if (!ids.has(d)) warnings.push(`cutover task ${t.id}: dependency ${d} not found`);
    if (t.owner && people.size && !people.has(t.owner)) warnings.push(`cutover task ${t.id}: owner ${t.owner} is not in the team`);
  }
  for (const g of arr(c.goNoGo)) if (g.status && !GNG_STATUS.includes(g.status)) errors.push(`go/no-go ${g.id}: unknown status "${g.status}"`);
  try { criticalPath(c.tasks); } catch (e) { errors.push(e.message); }
  return { errors, warnings };
}

export const CUT_TIGHT_PCT = 10;
/** "YYYY-MM-DDTHH:MM" of a window time typed with T or a space; '' when it is not a real date-time (free text, 2027-13-40 …). */
export const cutDT = (s) => {
  const x = String(s ?? '').trim().replace(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/, '$1T$2');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(x)) return '';
  const t = Date.parse(`${x}:00Z`);
  return Number.isNaN(t) || new Date(t).toISOString().slice(0, 16) !== x ? '' : x;
};
export const CUT_WARN = {
  en: 'Release order, not a verified import order — check the order with the transport team (dependencies, overlapping objects).',
  ko: '릴리스 순서 목록이지 검증된 이관 순서가 아닙니다. 순서는 이관 담당과 확인하세요 (의존성, 겹치는 객체).',
};
const cutTypeOf = (type) => (['implementation', 'conversion', 'rollout'].includes(type) ? type : 'small');
const cutHours = (a, b) => (Date.parse(`${b}:00Z`) - Date.parse(`${a}:00Z`)) / 3600000;
const cutAddDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const cutAddHours = (dt, h) => new Date(Date.parse(`${dt}:00Z`) + Math.round(h * 60) * 60000).toISOString().slice(0, 16);
const cutR1 = (n) => Math.round(n * 10) / 10;

/** Default window and freeze dates from go-live and the template (byType[type].window / .freeze override). */
export function cutDefaults(goLive, tpl, type = '') {
  const w = tpl?.byType?.[type]?.window || tpl?.window || { startDaysBefore: 2, startTime: '18:00', endTime: '06:00' }, f = tpl?.byType?.[type]?.freeze || tpl?.freeze || { codeDaysBefore: 14, configDaysBefore: 7 };
  return {
    window: { start: `${cutAddDays(goLive, -w.startDaysBefore)}T${w.startTime}`, end: `${goLive}T${w.endTime}` },
    freeze: { code: cutAddDays(goLive, -f.codeDaysBefore), config: cutAddDays(goLive, -f.configDaysBefore) },
  };
}

/**
 * Adds the template's tasks and go / no-go items of the project type that are not in the model yet (by id),
 * fills window / freeze when absent (or from the arguments). Never changes an existing task.
 */
export function seedCutover(model, tpl, { window = null, freeze = null, lang = '' } = {}) {
  const m = JSON.parse(JSON.stringify(model));
  const L = String(lang || m.lang || 'ko').slice(0, 2);
  const type = cutTypeOf(m.project?.type);
  const goLive = m.project?.goLive;
  if (!goLive) throw new Error('project.goLive is required to seed the cutover');
  const def = cutDefaults(goLive, tpl, type);
  const c = m.cutover || {};
  c.window = { ...def.window, ...c.window, ...(window || {}) };
  c.freeze = { ...def.freeze, ...c.freeze, ...(freeze || {}) };
  c.rehearsals = arr(c.rehearsals);
  c.tasks = arr(c.tasks);
  c.goNoGo = arr(c.goNoGo);
  const have = new Set(c.tasks.map(t => t.id)), haveG = new Set(c.goNoGo.map(g => g.id));
  const text = (x) => (typeof x === 'string' ? x : x?.[L] || x?.en || '');
  // the type's tasks: the common list + byType[type].tasks, minus byType[type].skip; deps overridden by byType[type].deps
  const bt = tpl?.byType?.[type] || {};
  const skip = new Set(arr(bt.skip));
  const all = [...arr(tpl?.tasks), ...arr(bt.tasks)];
  const picked = all.filter(t => !skip.has(t.id));
  const ids = new Set(picked.map(t => t.id));
  const depsOf = new Map(all.map(t => [t.id, arr(bt.deps?.[t.id] ?? t.deps)]));
  // a skipped (or unknown) dependency passes its own dependencies on, so the network keeps its order
  const resolve = (d, seen = new Set()) => (ids.has(d) ? [d] : seen.has(d) ? [] : (seen.add(d), arr(depsOf.get(d)).flatMap(x => resolve(x, seen))));
  const added = [];
  for (const t of picked) {
    if (have.has(t.id)) continue;
    const deps = [...new Set(arr(depsOf.get(t.id)).flatMap(d => resolve(d)))].filter(d => d !== t.id);
    const row = { id: t.id, phase: t.phase, label: text(t.label), ws: t.ws || '', owner: '', status: 'planned', deps, note: text(t.note) };
    if (t.phase === 'window') row.durationH = Number(t.durationH) || 0;
    else { row.offset = Number(t.offset) || 0; if (t.anchor) row.anchor = t.anchor; }
    if (t.check) row.check = text(t.check);
    c.tasks.push(row);
    added.push(t.id);
  }
  const addedG = [];
  for (const g of arr(tpl?.goNoGo)) {
    if (haveG.has(g.id)) continue;
    c.goNoGo.push({ id: g.id, text: text(g.text), owner: '', status: 'open' });
    addedG.push(g.id);
  }
  // template order inside each phase; tasks people added keep their place at the end of their phase
  const order = new Map(all.map((t, i) => [t.id, i]));
  c.tasks.sort((a, b) => CUT_PHASES.indexOf(a.phase) - CUT_PHASES.indexOf(b.phase) || (order.get(a.id) ?? 1e6) - (order.get(b.id) ?? 1e6));
  m.cutover = c;
  return { model: m, added, addedGoNoGo: addedG, type };
}

/** Planned day of a pre / freeze / post task: an anchored freeze task sits on its freeze date, else go-live + offset days. */
export function cutDueOf(t, c, goLive) {
  if (t.phase === 'window') return c?.window?.start ? c.window.start.slice(0, 10) : '';
  if (t.phase === 'freeze' && t.anchor && c?.freeze?.[t.anchor]) return c.freeze[t.anchor];
  return goLive ? cutAddDays(goLive, Number(t.offset) || 0) : '';
}

/**
 * Window tasks (not skipped) as a network: earliest start / finish by deps (deps outside the window are ignored),
 * the longest path and its hours. A loop → Error naming it.
 */
export function criticalPath(tasks, durationOf = (t) => Number(t.durationH) || 0) {
  const win = arr(tasks).filter(t => t.phase === 'window' && t.status !== 'skipped');
  const by = new Map(win.map(t => [t.id, t]));
  const sched = {};
  const state = new Map();
  const visit = (t, trail) => {
    if (state.get(t.id) === 2) return sched[t.id].ef;
    if (state.get(t.id) === 1) throw new Error(`cutover window tasks form a loop: ${[...trail, t.id].join(' → ')}`);
    state.set(t.id, 1);
    let es = Number(t.offsetH) || 0, from = '';
    for (const d of arr(t.deps)) {
      const p = by.get(d);
      if (!p) continue;
      const ef = visit(p, [...trail, t.id]);
      if (ef > es || (ef === es && !from)) { es = ef; from = d; }
    }
    const dur = durationOf(t);
    sched[t.id] = { es: cutR1(es), ef: cutR1(es + dur), dur: cutR1(dur), from };
    state.set(t.id, 2);
    return es + dur;
  };
  for (const t of win) visit(t, []);
  let end = null;
  for (const t of win) if (!end || sched[t.id].ef > sched[end].ef) end = t.id;
  const path = [];
  for (let id = end; id; id = sched[id].from) path.unshift(id);
  return { totalH: end ? sched[end].ef : 0, path, schedule: sched };
}

/** Hours a task took in a rehearsal (or live), null when not measured. */
export const cutActualH = (t, rid) => { const a = t.actual?.[rid]; return a?.start && a?.end ? cutR1(cutHours(a.start, a.end)) : null; };

/** Plan and the latest (or given) rehearsal against the window: fits / tight (slack < 10 %) / exceeds. */
export function rehearsalFit(c, rehearsalId = '') {
  const ws = cutDT(c?.window?.start), we = cutDT(c?.window?.end);
  const windowH = ws && we && we > ws ? cutR1(cutHours(ws, we)) : null; // an unreadable window = no window (never NaN)
  const verdict = (h) => (windowH == null ? 'unknown' : h > windowH ? 'exceeds' : (windowH - h) / windowH * 100 < CUT_TIGHT_PCT ? 'tight' : 'fits');
  const slack = (h) => (windowH ? cutR1((windowH - h) / windowH * 100) : null);
  const plan = criticalPath(c?.tasks);
  const rid = rehearsalId || arr(c?.rehearsals).map(r => r.id).filter(id => arr(c?.tasks).some(t => cutActualH(t, id) != null)).at(-1) || '';
  let rehearsal = null;
  if (rid) {
    const estimated = [];
    const cp = criticalPath(c.tasks, (t) => { const h = cutActualH(t, rid); if (h == null) { estimated.push(t.id); return Number(t.durationH) || 0; } return h; });
    rehearsal = { id: rid, totalH: cp.totalH, path: cp.path, schedule: cp.schedule, estimated, measured: arr(c.tasks).filter(t => t.phase === 'window' && cutActualH(t, rid) != null).length,
      verdict: verdict(cp.totalH), slackPct: slack(cp.totalH) };
  }
  const basis = rehearsal || { totalH: plan.totalH };
  return { windowH, plan: { totalH: plan.totalH, path: plan.path, schedule: plan.schedule, verdict: verdict(plan.totalH), slackPct: slack(plan.totalH) },
    rehearsal, verdict: verdict(basis.totalH), slackPct: slack(basis.totalH), basis: rehearsal ? 'rehearsal' : 'plan' };
}

const cutOpen = (t) => t.status !== 'done' && t.status !== 'skipped';

/** Values of this module's rules; null value = no evidence; unknown rule → null (stays manual). */
export function cutRuleValue(name, arg, ctx) {
  switch (name) {
    // released jobs only: a scheduled (P) job does not run until someone releases it
    case 'jobs-released': return { value: ctx.jobs?.ok ? arr(ctx.jobs.rows).filter(j => j.status === 'released').length : null, source: ctx.jobs?.ok ? 'jobs (TBTCO)' : 'jobs not read' };
    case 'tasks-open': {
      if (arg && !CUT_PHASES.includes(arg)) return null;
      return { value: arr(ctx.cutover?.tasks).filter(t => (!arg || t.phase === arg) && cutOpen(t)).length, source: 'runbook' };
    }
    case 'rehearsal-fit': { const r = ctx.fit?.rehearsal; return { value: r ? r.slackPct : null, source: r ? `rehearsal ${r.id}` : 'no rehearsal measured' }; }
    default: return null;
  }
}
// same tag form as project-status.mjs: [name<=N], [name:arg>=N]; signed numbers for rehearsal-fit
const CUT_RULE = /\[\s*([a-z-]+)(?::([^\]<>=]+))?\s*(<=|>=)\s*(-?\d+(?:\.\d+)?)\s*\]\s*$/i;

/** One criterion text → { text, rule, value, met, source } with this module's rules (null when the rule is not one of them). */
export function cutEvalRule(text, ctx) {
  const m = CUT_RULE.exec(String(text || ''));
  if (!m) return null;
  const rv = cutRuleValue(m[1].toLowerCase(), (m[2] || '').trim(), ctx);
  if (!rv) return null;
  const limit = Number(m[4]);
  const met = rv.value == null ? null : m[3] === '<=' ? rv.value <= limit : rv.value >= limit;
  return { text: String(text).replace(CUT_RULE, '').trim(), rule: m[0].trim().slice(1, -1), value: rv.value, met, source: rv.value == null ? `no evidence (${rv.source})` : rv.source };
}

/**
 * Go / no-go: `gateRows` = project-status gateCheck rows for the items (same order). A row gateCheck left manual
 * whose tag is one of this module's rules is evaluated here. The human status wins (go / nogo / waived); the
 * suggestion: nogo when a criterion is not met, conditional while one is open, go when all are met or waived.
 */
export function goNoGoView(c, gateRows, ctx) {
  const items = arr(c?.goNoGo).map((g, i) => {
    let r = arr(gateRows)[i] || { text: g.text, rule: '', value: null, met: null, source: 'manual' };
    if (r.source === 'manual') r = cutEvalRule(g.text, ctx) || r;
    const auto = r.met === true ? 'go' : r.met === false ? 'nogo' : 'open';
    const status = g.status && g.status !== 'open' ? g.status : auto;
    return { id: g.id, owner: g.owner || '', human: g.status || 'open', text: r.text || g.text, rule: r.rule, value: r.value, met: r.met, source: r.source, auto, status };
  });
  const nogo = items.filter(x => x.status === 'nogo').length, open = items.filter(x => x.status === 'open').length;
  return { items, nogo, open, go: items.length - nogo - open, suggest: !items.length ? 'open' : nogo ? 'nogo' : open ? 'conditional' : 'go' };
}

/** Task checks ([rule] in task.check) with the same evaluation; unknown / untagged → manual. */
export function taskChecks(c, gateOf, ctx) {
  return arr(c?.tasks).filter(t => t.check).map(t => {
    const r = cutEvalRule(t.check, ctx) || gateOf(t.check) || { text: t.check, rule: '', value: null, met: null, source: 'manual' };
    return { id: t.id, ...r };
  });
}

/**
 * Project requests in release order (date, then number), open ones after them, then CTS-only requests.
 * CTS evidence adds the verdict and the overlap findings per request. The warning text always goes with it.
 */
export function importList(transports, cts = [], lang = 'en') {
  const verdicts = new Map();
  for (const e of arr(cts)) for (const r of arr(e.requests)) verdicts.set(r.trkorr, { verdict: r.verdict || '', findings: arr(r.findings).map(f => f.kind || f).filter(k => ['other-request', 'dependency', 'dependency-unread'].includes(k)) });
  const rows = arr(transports).map(t => ({ trkorr: t.trkorr, text: t.text || '', side: t.side || '', ws: t.ws || '', status: t.status || '', date: t.date || '' }));
  const known = new Set(rows.map(r => r.trkorr));
  for (const k of verdicts.keys()) if (!known.has(k)) rows.push({ trkorr: k, text: '', side: '', ws: '', status: '', date: '', ctsOnly: true });
  const rank = (r) => (r.status === 'released' && r.date ? 0 : r.ctsOnly ? 2 : 1);
  rows.sort((a, b) => rank(a) - rank(b) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || (a.trkorr < b.trkorr ? -1 : 1));
  const out = rows.map((r, i) => ({ seq: i + 1, ...r, ...(verdicts.get(r.trkorr) || { verdict: '', findings: [] }) }));
  return { warning: CUT_WARN[String(lang).slice(0, 2)] || CUT_WARN.en, rows: out, released: out.filter(r => rank(r) === 0).length,
    flagged: out.filter(r => r.verdict === 'blocked' || r.findings.length).length };
}

/** D-day (days to go-live, negative after) and the tasks late today. */
export function tMinus(today, c, goLive) {
  const late = [];
  for (const t of arr(c?.tasks)) {
    if (!cutOpen(t)) continue;
    const due = t.phase === 'window' ? cutDT(c.window?.end).slice(0, 10) : cutDueOf(t, c, goLive);
    if (due && due < today) late.push({ id: t.id, label: t.label, phase: t.phase, due });
  }
  return { dDay: goLive ? days(today, goLive) : null, late };
}

/** Planned start / finish of window tasks as date-times (window start + earliest start). */
export function cutWindowTimes(c, schedule) {
  const out = {};
  const ws = cutDT(c?.window?.start);
  if (!ws) return out; // an unreadable start (free text typed in the tab) gives no times instead of an Invalid Date error
  for (const [id, s] of Object.entries(schedule || {})) out[id] = { start: cutAddHours(ws, s.es), end: cutAddHours(ws, s.ef) };
  return out;
}

/**
 * Rehearsal / live actuals from a CSV ("task id,start,end" — date-times YYYY-MM-DD HH:MM or ISO) or JSON
 * ([{ id, start, end }] or { "<id>": { start, end } }) → { rows: [{ id, start, end }], errors }.
 */
export function parseActuals(text) {
  const t = String(text || '').replace(/^﻿/, '').trim();
  const norm = (s) => String(s || '').trim().replace(' ', 'T').slice(0, 16);
  const ok = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s);
  let rows = [];
  if (/^[[{]/.test(t)) {
    const j = JSON.parse(t);
    rows = Array.isArray(j) ? j.map(x => ({ id: x.id || x.task, start: norm(x.start), end: norm(x.end) })) : Object.entries(j).map(([id, x]) => ({ id, start: norm(x.start), end: norm(x.end) }));
  } else {
    for (const line of t.split(/\r?\n/)) {
      const [id, s, e] = line.split(/[,;\t]/).map(x => x.trim().replace(/^"|"$/g, ''));
      if (!id || /^task/i.test(id)) continue;
      rows.push({ id, start: norm(s), end: norm(e) });
    }
  }
  const errors = rows.filter(r => !r.id || !ok(r.start) || !ok(r.end) || r.end < r.start).map(r => `${r.id || '?'}: start / end must be YYYY-MM-DD HH:MM and end after start`);
  return { rows: rows.filter(r => r.id && ok(r.start) && ok(r.end) && r.end >= r.start), errors };
}

/** Writes actuals into the tasks under a rehearsal id (or "live"); adds the rehearsal when it is new. */
export function applyActuals(c, rid, rows, date = '') {
  const out = JSON.parse(JSON.stringify(c));
  const by = new Map(arr(out.tasks).map(t => [t.id, t]));
  const unknown = [];
  for (const r of rows) {
    const t = by.get(r.id);
    if (!t) { unknown.push(r.id); continue; }
    t.actual = { ...t.actual, [rid]: { start: r.start, end: r.end } };
  }
  if (rid !== 'live' && !arr(out.rehearsals).some(x => x.id === rid)) out.rehearsals = [...arr(out.rehearsals), { id: rid, date: date || rows.map(r => r.start).sort()[0]?.slice(0, 10) || '', note: '' }];
  return { cutover: out, applied: rows.length - unknown.length, unknown };
}
