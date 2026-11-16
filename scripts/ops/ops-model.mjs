// sc4sap:ops-health-check — the model of one check, from what the collector read. Pure: no I/O.
//
// Input (collect.json, see build-ops-check.mjs collect):
//   { system, sapVersion, from, to, prevFrom, prevTo, lookbackFrom,
//     dumps:      { ok, rows: [{ id, date, time, error, program, include, user }], error? },
//     prevDumps:  { ok, rows: [...] },
//     transports: { ok, rows: [{ trkorr, kind, status, date, text }], error? },
//     objects:    { ok, rows: [{ trkorr, object, name }], error? },
//     jobs:       { ok, rows: [{ job, count, program, endDate, endTime }], prevRows?, error? },
//     updates:    { ok, rows: [{ key, date, tcode, report, rc }], prevRows?, error? },
//     idocs:      { ok, rows: [{ docnum, status, mestyp, direct, partner, date }], prevRows?, error? } }
// `prevRows` (the same read for the previous period) is missing in a collect.json written before 2026-11-16:
// the report then shows no change for that figure, never a made-up one.
// A section with ok:false was not readable on this system (e.g. the BASIS < 7.50 dispatcher reads
// customizing / system tables only); the page says where to look instead, never "no problems".

const arr = (v) => (Array.isArray(v) ? v : []);

/** IDoc statuses that need someone: outbound errors and inbound errors (WE47). */
export const IDOC_ERROR_STATUS = new Set(['02', '04', '05', '25', '26', '29', '51', '56', '60', '61', '63', '65']);

/** Where a person looks when a section could not be read. */
export const FALLBACK_TCODE = { dumps: 'ST22', jobs: 'SM37', updates: 'SM13', idocs: 'WE02 / BD87', transports: 'STMS / SE01' };

/** Upper-case, trimmed. */
const up = (s) => String(s ?? '').trim().toUpperCase();

/**
 * The repository objects a dumping program can come from, as transport entries name them
 * (E071 OBJECT / OBJ_NAME): the program itself, its include, the function group behind SAPL<FG>
 * or L<FG>…, the class behind <CLASS>====…CP / CM… includes.
 */
export function objectKeysOf(program, include = '') {
  const keys = new Set();
  for (const raw of [program, include]) {
    const name = up(raw);
    if (!name) continue;
    keys.add(`PROG:${name}`);
    keys.add(`REPS:${name}`);
    const fg = /^SAPL(\S+)$/.exec(name) || /^(\/\w+\/)?L(\w+?)(?:U\d\d|F\d\d|TOP|O\d\d|I\d\d|UXX)$/.exec(name);
    if (fg) keys.add(`FUGR:${fg[1] && fg[2] ? fg[1] + fg[2] : fg[2] ?? fg[1]}`);
    const cls = /^(\S+?)=+(?:CP|CU|CI|CO|CT|CCDEF|CCIMP|CCMAC|CCAU|CM\w+)$/.exec(name);
    if (cls) keys.add(`CLAS:${cls[1]}`);
  }
  return keys;
}

/** Dumps grouped by runtime error + program, newest first within the window. */
/** `prevRows` null: the previous period was not read completely — nothing is called new, `previous` is null. */
export function groupDumps(rows, prevRows = []) {
  const key = (d) => `${up(d.error)}|${up(d.program)}`;
  const before = new Map();
  for (const d of arr(prevRows)) before.set(key(d), (before.get(key(d)) || 0) + 1);
  const groups = new Map();
  for (const d of arr(rows)) {
    const k = key(d);
    const g = groups.get(k) || {
      error: up(d.error) || '(unknown)', program: up(d.program), include: up(d.include),
      count: 0, users: new Set(), first: '', last: '',
    };
    g.count += 1;
    if (d.user) g.users.add(up(d.user));
    const at = `${d.date || ''} ${d.time || ''}`.trim();
    if (!g.first || at < g.first) g.first = at;
    if (!g.last || at > g.last) { g.last = at; if (d.include) g.include = up(d.include); }
    groups.set(k, g);
  }
  // No dump id in the model: an ST22 id carries the user name.
  return [...groups.entries()].map(([k, g]) => ({
    error: g.error, program: g.program, include: g.include, count: g.count,
    // How many people hit it — user IDs themselves stay out of the report.
    users: g.users.size, first: g.first, last: g.last,
    previous: prevRows === null ? null : before.get(k) || 0, isNew: prevRows === null ? null : !before.has(k),
  })).sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}

/** Transports whose objects match a dump group's program, with the request header. */
export function suspectsFor(group, transports, objects) {
  const keys = objectKeysOf(group.program, group.include);
  const head = new Map(arr(transports).map((t) => [t.trkorr, t]));
  const hits = new Map();
  for (const o of arr(objects)) {
    if (!keys.has(`${up(o.object)}:${up(o.name)}`)) continue;
    const t = head.get(o.trkorr);
    if (!t) continue;
    const h = hits.get(t.trkorr) || { ...t, objects: [] };
    if (!h.objects.includes(`${up(o.object)} ${up(o.name)}`)) h.objects.push(`${up(o.object)} ${up(o.name)}`);
    hits.set(t.trkorr, h);
  }
  // Only a change made before the dumps were last seen can explain them.
  return [...hits.values()].filter((t) => !group.last || !t.date || t.date <= group.last.slice(0, 10))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Aborted jobs grouped by job name. */
export function groupJobs(rows) {
  const m = new Map();
  for (const j of arr(rows)) {
    const k = up(j.job);
    const g = m.get(k) || { job: k, program: up(j.program), count: 0, last: '' };
    g.count += 1;
    const at = `${j.endDate || ''} ${j.endTime || ''}`.trim();
    if (at > g.last) g.last = at;
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}

/** Update errors grouped by transaction + program. */
export function groupUpdates(rows) {
  const m = new Map();
  for (const u of arr(rows)) {
    const k = `${up(u.tcode)}|${up(u.report)}`;
    const g = m.get(k) || { tcode: up(u.tcode), report: up(u.report), count: 0, last: '' };
    g.count += 1;
    if (String(u.date || '') > g.last) g.last = String(u.date || '');
    m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

/** IDocs in an error status grouped by message type, status and direction. */
export function groupIdocs(rows) {
  const m = new Map();
  for (const i of arr(rows)) {
    if (!IDOC_ERROR_STATUS.has(String(i.status || ''))) continue;
    const dir = String(i.direct) === '2' ? 'in' : 'out';
    const k = `${up(i.mestyp)}|${i.status}|${dir}`;
    const g = m.get(k) || { mestyp: up(i.mestyp), status: String(i.status), direction: dir, count: 0, partners: new Set(), last: '' };
    g.count += 1;
    if (i.partner) g.partners.add(up(i.partner));
    if (String(i.date || '') > g.last) g.last = String(i.date || '');
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ ...g, partners: [...g.partners].slice(0, 5) }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Overall verdict: red when something new keeps breaking (a new dump group with ≥ 5 dumps, a dump group
 * with a suspect transport, ≥ 3 aborts of one job, any update error); amber when anything at all needs a
 * look or a section could not be read; green otherwise.
 */
export function verdictOf(m) {
  const red = m.dumps.groups.some((g) => (g.isNew && g.count >= 5) || g.suspects.length > 0)
    || m.jobs.groups.some((g) => g.count >= 3)
    || m.updates.groups.length > 0;
  if (red) return 'red';
  const amber = m.dumps.groups.length > 0 || m.jobs.groups.length > 0 || m.idocs.groups.length > 0
    || ['dumps', 'jobs', 'updates', 'idocs', 'transports'].some((s) => !m[s].ok);
  return amber ? 'amber' : 'green';
}

/** Every date from `from` to `to` (YYYY-MM-DD), at most 62. */
export function daysOf(from, to) {
  const out = [];
  if (!from || !to) return out;
  for (let t = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); t <= end && out.length < 62; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** Dumps per day over `days`, zero for a day without one. */
export function perDay(rows, days) {
  const n = new Map(days.map((d) => [d, 0]));
  for (const r of arr(rows)) if (n.has(r.date)) n.set(r.date, n.get(r.date) + 1);
  return days.map((date) => ({ date, count: n.get(date) }));
}

/** Rows of the previous period, or null when the collector did not read it (older collect.json, read failed). */
const prevOf = (s) => (s?.ok && Array.isArray(s.prevRows) ? s.prevRows : null);

/** One KPI tile: the figure, the previous period's (null = not read) and the change. */
const kpi = (key, value, previous, ok = true) => ({
  key, ok, value: ok ? value : null, previous: ok ? previous : null,
  delta: ok && previous !== null && previous !== undefined ? value - previous : null,
});

/** The model the page is drawn from. */
export function buildModel(c) {
  const section = (s) => ({ ok: !!s?.ok, error: s?.ok ? '' : String(s?.error || 'not read') });
  const transports = arr(c.transports?.rows);
  const objects = arr(c.objects?.rows);
  const groups = groupDumps(c.dumps?.rows, c.prevDumps?.ok ? c.prevDumps.rows : null)
    .map((g) => ({ ...g, suspects: c.transports?.ok && c.objects?.ok ? suspectsFor(g, transports, objects) : [] }));
  const m = {
    system: c.system || '', sapVersion: c.sapVersion || '', from: c.from, to: c.to,
    prevFrom: c.prevFrom || '', prevTo: c.prevTo || '', lookbackFrom: c.lookbackFrom || '', readAt: c.readAt || '',
    dumps: { ...section(c.dumps), total: arr(c.dumps?.rows).length, previousTotal: c.prevDumps?.ok ? arr(c.prevDumps.rows).length : null, groups },
    transports: { ...section(c.transports), list: transports.filter((t) => t.date >= c.from) },
    jobs: { ...section(c.jobs), groups: groupJobs(c.jobs?.rows) },
    updates: { ...section(c.updates), groups: groupUpdates(c.updates?.rows) },
    idocs: { ...section(c.idocs), groups: groupIdocs(c.idocs?.rows) },
  };
  // Per-day dumps for the trend chart: the previous period (when read) and this one, on one time axis.
  const days = daysOf(m.from, m.to);
  m.dumps.byDay = perDay(c.dumps?.rows, days);
  m.dumps.prevByDay = c.prevDumps?.ok ? perDay(c.prevDumps.rows, daysOf(m.prevFrom, m.prevTo)) : null;
  m.dumps.previousGroups = c.prevDumps?.ok ? groupDumps(c.prevDumps.rows, []).length : null;
  const total = (groups) => groups.reduce((s, g) => s + g.count, 0);
  m.jobs.total = total(m.jobs.groups);
  m.updates.total = total(m.updates.groups);
  m.idocs.total = total(m.idocs.groups);
  const prevTotal = (s, group) => (prevOf(s) ? total(group(prevOf(s))) : null);
  m.jobs.previousTotal = prevTotal(c.jobs, groupJobs);
  m.updates.previousTotal = prevTotal(c.updates, groupUpdates);
  m.idocs.previousTotal = prevTotal(c.idocs, groupIdocs);
  m.kpis = [
    kpi('dumps', m.dumps.total, m.dumps.previousTotal, m.dumps.ok),
    kpi('dumpGroups', m.dumps.groups.length, m.dumps.previousGroups, m.dumps.ok),
    // "New" is itself a comparison — it has no previous figure of its own.
    kpi('newGroups', m.dumps.groups.filter((g) => g.isNew).length, null, m.dumps.ok && m.dumps.previousTotal !== null),
    kpi('jobs', m.jobs.total, m.jobs.previousTotal, m.jobs.ok),
    kpi('updates', m.updates.total, m.updates.previousTotal, m.updates.ok),
    kpi('idocs', m.idocs.total, m.idocs.previousTotal, m.idocs.ok),
  ];
  m.verdict = verdictOf(m);
  m.next = nextSteps(m);
  m.issues = issuesOf(m);
  m.worst = m.issues.find((i) => i.area !== 'unread')?.area || null;
  return m;
}

const RANK = { high: 0, medium: 1, low: 2 };

/**
 * The issues & actions of the report, most severe first. Each names its area, a severity and the figures the
 * page words in the reader's language (`kind` picks the wording); `action` is the skill or TCode to use.
 */
export function issuesOf(m) {
  const out = [];
  for (const g of m.dumps.groups.slice(0, 15)) {
    const base = { area: 'dumps', error: g.error, program: g.program, count: g.count, previous: g.previous, last: g.last };
    const action = `/sc4sap:analyze-symptom ${g.error} in ${g.program || '?'} at ${g.last}`;
    if (g.suspects.length) out.push({ ...base, kind: 'dumpChanged', severity: 'high', trkorr: g.suspects.map((s) => s.trkorr).slice(0, 3), action });
    else if (g.isNew) out.push({ ...base, kind: 'dumpNew', severity: g.count >= 5 ? 'high' : 'medium', action });
    else if (g.previous !== null && g.count > g.previous) out.push({ ...base, kind: 'dumpRising', severity: 'medium', action });
  }
  for (const g of m.jobs.groups.slice(0, 5)) out.push({ area: 'jobs', kind: 'job', severity: g.count >= 3 ? 'high' : 'medium', job: g.job, program: g.program, count: g.count, action: 'SM37', command: incidentCommand('job', g), next: incidentNext('job', g) });
  for (const g of m.updates.groups.slice(0, 5)) out.push({ area: 'updates', kind: 'update', severity: 'high', tcode: g.tcode, program: g.report, count: g.count, action: 'SM13' });
  for (const g of m.idocs.groups.slice(0, 5)) out.push({ area: 'idocs', kind: 'idoc', severity: 'medium', mestyp: g.mestyp, status: g.status, direction: g.direction, count: g.count, action: 'WE02 / BD87', command: incidentCommand('idoc', g), next: incidentNext('idoc', g) });
  for (const s of Object.keys(FALLBACK_TCODE)) if (!m[s].ok) out.push({ area: 'unread', kind: 'unread', severity: 'medium', section: s, action: FALLBACK_TCODE[s] });
  return out.sort((a, b) => RANK[a.severity] - RANK[b.severity]).slice(0, 20);
}

/**
 * Prefill mark for the web viewer (data-sc4sap-next): the analyze-symptom form of a job or an IDoc failure. Labels are
 * the web form's field labels; values are the job name / message type / partner / date only.
 */
export function incidentNext(kind, g) {
  const date = String(g.last || '').slice(0, 10);
  const fill = kind === 'job'
    ? { 'Incident type': 'Background job', 'Job name': g.job }
    : { 'Incident type': 'IDoc', 'Message type': g.mestyp, ...(arr(g.partners).length === 1 ? { Partner: g.partners[0] } : {}) };
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) fill['Incident date'] = date;
  return { skill: 'analyze-symptom', fill };
}

/** The analyze-symptom command of a job / IDoc failure (the TCode stays the fallback). */
export function incidentCommand(kind, g) {
  return kind === 'job' ? `/sc4sap:analyze-symptom job ${g.job}` : `/sc4sap:analyze-symptom idoc ${g.mestyp}${arr(g.partners).length === 1 ? ` partner ${g.partners[0]}` : ''}`;
}

/** What to do next, most urgent first — each a skill or a transaction. */
export function nextSteps(m) {
  const out = [];
  for (const g of m.dumps.groups.filter((x) => x.suspects.length || x.isNew).slice(0, 5)) {
    out.push({ kind: 'dump', text: `${g.error} in ${g.program || '?'}`, action: `/sc4sap:analyze-symptom ${g.error} in ${g.program || '?'} at ${g.last}` });
  }
  for (const g of m.jobs.groups.slice(0, 3)) out.push({ kind: 'job', text: `${g.job} aborted ${g.count}×`, action: `${incidentCommand('job', g)} (or SM37 → job log)`, next: incidentNext('job', g) });
  for (const g of m.updates.groups.slice(0, 3)) out.push({ kind: 'update', text: `${g.tcode || g.report} update error ×${g.count}`, action: 'SM13' });
  for (const g of m.idocs.groups.slice(0, 3)) out.push({ kind: 'idoc', text: `${g.mestyp} status ${g.status} ×${g.count}`, action: `${incidentCommand('idoc', g)} (or WE02 / BD87)`, next: incidentNext('idoc', g) });
  for (const [s, t] of Object.entries(FALLBACK_TCODE)) if (!m[s].ok) out.push({ kind: 'unread', text: `${s} not readable here`, action: t });
  return out;
}
