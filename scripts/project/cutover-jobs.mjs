// sc4sap:project-dashboard — jobs to suspend during the cutover window (cutover --jobs). Read-only:
// TBTCO (released S / scheduled P) and the first step's program from TBTCP. Never changes a job.
// A failed read is { ok: false, error } — the page says "not read (SM37)", never zero.

import { readTable as sapReadTable, readIn as sapReadIn } from '../config/sap-reader.mjs';

const period = (j) => {
  if (j.PERIODIC !== 'X') return '';
  const parts = [['PRDMONTHS', 'mo'], ['PRDWEEKS', 'w'], ['PRDDAYS', 'd'], ['PRDHOURS', 'h'], ['PRDMINS', 'min']]
    .map(([k, u]) => (Number(j[k]) ? `${Number(j[k])}${u}` : '')).filter(Boolean);
  return parts.join(' ') || 'periodic';
};
// The SQL path answers YYYYMMDD / HHMMSS or YYYY-MM-DD / HH:MM:SS depending on the backend.
const when = (d, t) => {
  const ds = String(d || '').replace(/-/g, ''), ts = String(t || '').replace(/:/g, '');
  if (!/^\d{8}$/.test(ds) || ds === '00000000') return '';
  return `${ds.slice(0, 4)}-${ds.slice(4, 6)}-${ds.slice(6, 8)}${/^\d{4}/.test(ts) ? ` ${ts.slice(0, 2)}:${ts.slice(2, 4)}` : ''}`;
};

export const JOBS_WHERE = "STATUS IN ('S', 'P')";

/**
 * Released and scheduled jobs with their first program. `client` = an MCP client (sap-reader connect);
 * `readTable` / `readIn` can be replaced (tests). Rows: { job, count, status: released | scheduled, next, event, program, period }.
 * A job started by an event has no date: `event` holds the event id. TBTCP is read by job count (digits only — job
 * names may hold characters the older read path rejects), one value per line, and the lowest step per job is kept.
 */
export async function readJobs(client, { readTable = sapReadTable, readIn = sapReadIn } = {}) {
  const head = await readTable(client, 'TBTCO', { where: JOBS_WHERE,
    fields: ['JOBNAME', 'JOBCOUNT', 'STATUS', 'SDLSTRTDT', 'SDLSTRTTM', 'EVENTID', 'PERIODIC', 'PRDMINS', 'PRDHOURS', 'PRDDAYS', 'PRDWEEKS', 'PRDMONTHS'], maxRows: 5000 });
  if (!head.ok) return { ok: false, rows: [], error: head.error || 'TBTCO not read' };
  const steps = await readIn(client, 'TBTCP', 'JOBCOUNT', head.rows.map((j) => j.JOBCOUNT), { fields: ['JOBNAME', 'JOBCOUNT', 'STEPCOUNT', 'PROGNAME'] });
  const prog = new Map();
  for (const s of [...(steps.rows || [])].sort((a, b) => Number(a.STEPCOUNT) - Number(b.STEPCOUNT))) {
    const k = `${s.JOBNAME}|${s.JOBCOUNT}`;
    if (!prog.has(k)) prog.set(k, s.PROGNAME);
  }
  const rows = head.rows.map((j) => ({ job: j.JOBNAME, count: j.JOBCOUNT, status: j.STATUS === 'S' ? 'released' : 'scheduled',
    next: when(j.SDLSTRTDT, j.SDLSTRTTM), event: String(j.EVENTID || '').trim(), program: prog.get(`${j.JOBNAME}|${j.JOBCOUNT}`) || '', period: period(j) }))
    // released first, then by next run (jobs without a date after)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'released' ? -1 : 1) || (!a.next - !b.next) || (a.next < b.next ? -1 : a.next > b.next ? 1 : 0) || (a.job < b.job ? -1 : 1));
  return { ok: true, rows, released: rows.filter((r) => r.status === 'released').length, truncated: !!head.truncated, stepsRead: steps.ok !== false,
    ...(steps.ok === false ? { stepsError: String((steps.errors || []).join('; ') || steps.error || '').slice(0, 300) } : {}) };
}
