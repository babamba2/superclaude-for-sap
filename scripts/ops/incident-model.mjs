// sc4sap:analyze-symptom job / IDoc incidents — facts from what incident.mjs collect read. Pure: no I/O.
//
// The script states facts and flags; the hypotheses and the verdict stay with analyze-symptom (sap-debugger).
// Phase 1 limits: no job log (SM37) and no IDoc status records (WE02) — both are named as "not read" in the facts.

import { suspectsFor, objectKeysOf, IDOC_ERROR_STATUS } from './ops-model.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const up = (s) => String(s ?? '').trim().toUpperCase();
const d8 = (s) => String(s ?? '').replace(/-/g, '').slice(0, 8);
const t6 = (s) => String(s ?? '').replace(/:/g, '').padEnd(6, '0').slice(0, 6);
const isoD = (s) => { const x = d8(s); return /^\d{8}$/.test(x) && x !== '00000000' ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : ''; };
const isoT = (s) => { const x = t6(s); return /^\d{6}$/.test(x) ? `${x.slice(0, 2)}:${x.slice(2, 4)}` : ''; };

/** Minutes since 1970 for a SAP date + time (server time; only differences are used). */
export function minutesOf(date, time = '000000') {
  const d = d8(date), t = t6(time);
  if (!/^\d{8}$/.test(d) || d === '00000000') return null;
  return Math.round(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4), +t.slice(4, 6)) / 60000);
}

export const JOB_STATUS = { F: 'finished', A: 'aborted', R: 'active', S: 'released', P: 'scheduled', Y: 'ready', Z: 'put active', X: 'unknown' };

/** TBTCO rows of one job → runs, newest first. */
export function jobRuns(rows) {
  return arr(rows).map((r) => {
    const start = minutesOf(r.STRTDATE, r.STRTTIME), end = minutesOf(r.ENDDATE, r.ENDTIME);
    return {
      job: up(r.JOBNAME), count: String(r.JOBCOUNT || ''), status: up(r.STATUS), statusText: JOB_STATUS[up(r.STATUS)] || up(r.STATUS),
      startDate: isoD(r.STRTDATE), startTime: isoT(r.STRTTIME), endDate: isoD(r.ENDDATE), endTime: isoT(r.ENDTIME),
      start, end, minutes: start != null && end != null ? end - start : null,
      periodic: up(r.PERIODIC) === 'X',
      period: ['PRDMONTHS', 'PRDWEEKS', 'PRDDAYS', 'PRDHOURS', 'PRDMINS'].map((k) => [k.slice(3).toLowerCase(), Number(r[k] || 0)]).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(' '),
    };
  }).sort((a, b) => (b.start ?? -1) - (a.start ?? -1));
}

/** The failed run in question: the newest aborted run (on `date` when given). */
export function failureOf(runs, date = '') {
  return runs.find((r) => r.status === 'A' && (!date || r.endDate === date || r.startDate === date)) || null;
}

/** The newest finished run that started before the failure. */
export function lastOkBefore(runs, failure) {
  if (!failure) return runs.find((r) => r.status === 'F') || null;
  return runs.find((r) => r.status === 'F' && r.start != null && failure.start != null && r.start < failure.start) || null;
}

/** Other jobs aborted within ±minutes of the failure's end — a system / environment signal. */
export function concurrentAborts(otherRows, failure, job, minutes = 30) {
  if (!failure || failure.end == null) return [];
  return jobRuns(otherRows).filter((r) => r.job !== up(job) && r.status === 'A' && r.end != null && Math.abs(r.end - failure.end) <= minutes);
}

/** Dumps from failure start − 10 min to failure end + 10 min; `matched` = the dump's program is a step program. */
export function dumpsInWindow(dumps, failure, programs, minutes = 10) {
  if (!failure || failure.start == null) return [];
  const from = failure.start - minutes, to = (failure.end ?? failure.start) + minutes;
  const progs = new Set(arr(programs).map(up));
  return arr(dumps).map((d) => ({ ...d, at: minutesOf(d.date, d.time) }))
    .filter((d) => d.at != null && d.at >= from && d.at <= to)
    .map(({ user, ...d }) => ({ ...d, matched: progs.has(up(d.program)) || progs.has(up(d.include)) }));
}

/** Requests that changed a step program, flagged when released / dated between the last good run and the failure. */
export function jobSuspects(programs, transports, objects, failure, lastOk) {
  const last = failure ? `${failure.endDate || failure.startDate}` : '';
  const seen = new Map();
  for (const p of arr(programs)) {
    for (const t of suspectsFor({ program: p, include: '', last }, transports, objects)) {
      const between = !!lastOk && !!t.date && t.date >= lastOk.startDate && (!last || t.date <= last);
      const x = seen.get(t.trkorr) || { ...t, programs: [], betweenRuns: between };
      if (!x.programs.includes(up(p))) x.programs.push(up(p));
      seen.set(t.trkorr, x);
    }
  }
  return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Object names (E071 OBJ_NAME) that can carry a change of these programs. */
export function objectNamesOf(programs) {
  const names = new Set();
  for (const p of arr(programs)) for (const k of objectKeysOf(p)) names.add(k.split(':')[1]);
  return [...names];
}

/** Fact flags for a job failure. The hypotheses are written by analyze-symptom, not here. */
/** How a section of the collect object stands: read, notRead (SAP refused / failed) or skipped (not attempted). */
export function sectionState(s) {
  if (!s) return 'skipped';
  if (s.ok === false) return 'notRead';
  if (s.skipped) return 'skipped';
  return 'read';
}

/**
 * Signals as facts: true / false only when their facts were read; null = unknown (not read, skipped, or nothing to
 * compare against — e.g. no failed run, no good run before it). analyze-symptom must never read null as "not the cause".
 */
export function jobFlags({ suspects, dumps, concurrent, failure, lastOk, state = {} }) {
  const ok = (k) => state[k] === undefined || state[k] === 'read';
  const f = {
    codeChange: failure && lastOk && ok('steps') && ok('changes') ? arr(suspects).some((s) => s.betweenRuns) : null,
    dump: failure && ok('steps') && ok('dumps') ? arr(dumps).some((d) => d.matched) : null,
    system: failure && ok('others') ? arr(concurrent).length > 0 : null,
  };
  // needs the job log (phase 2) — SM37 for now; only when the three other signals are known and all false
  f.dataOrVariant = f.codeChange === false && f.dump === false && f.system === false ? true : f.codeChange || f.dump || f.system ? false : null;
  return f;
}

/** The job facts from the collect object. */
export function jobFacts(c) {
  const runs = jobRuns(c.runs?.rows);
  const failure = failureOf(runs, c.date || '');
  const lastOk = lastOkBefore(runs, failure);
  const steps = arr(c.steps?.rows).filter((s) => !failure || s.JOBCOUNT === failure.count)
    .sort((a, b) => Number(a.STEPCOUNT) - Number(b.STEPCOUNT))
    .map((s) => ({ step: Number(s.STEPCOUNT), program: up(s.PROGNAME), variant: up(s.VARIANT), external: up(s.XPGPROG), status: up(s.STATUS) }));
  const programs = [...new Set(steps.map((s) => s.program).filter(Boolean))];
  const concurrent = concurrentAborts(c.others?.rows, failure, c.job);
  const dumps = dumpsInWindow(c.dumps?.rows, failure, programs);
  const suspects = jobSuspects(programs, c.transports?.rows, c.objects?.rows, failure, lastOk);
  const window = runs.filter((r) => !failure || r.start == null || failure.start == null || r.start <= failure.start);
  const changes = sectionState(c.transports) === 'read' && sectionState(c.objects) === 'read' ? 'read' : sectionState(c.transports) === 'notRead' || sectionState(c.objects) === 'notRead' ? 'notRead' : 'skipped';
  const state = { runs: sectionState(c.runs), steps: sectionState(c.steps), others: sectionState(c.others), dumps: sectionState(c.dumps), changes };
  return {
    kind: 'job', job: up(c.job), state, failure, lastOk, steps, programs,
    // cut: the 30-day read hit the row limit — counts are lower bounds; recentCut: even the re-read of the aborted runs /
    // the finished runs around the failure did
    history: { cut: !!c.runs?.truncated, recentCut: !!c.runs?.recentTruncated, runs: runs.length, aborted: runs.filter((r) => r.status === 'A').length, finished: runs.filter((r) => r.status === 'F').length,
      abortedInRow: (() => { let n = 0; for (const r of window) { if (r.status === 'A') n++; else if (r.status === 'F') break; } return n; })(),
      periodic: runs.some((r) => r.periodic), period: runs.find((r) => r.period)?.period || '' },
    recent: runs.slice(0, 10),
    concurrent: concurrent.slice(0, 10).map((r) => ({ job: r.job, endDate: r.endDate, endTime: r.endTime })), concurrentTotal: concurrent.length,
    dumps, suspects, flags: jobFlags({ suspects, dumps, concurrent, failure, lastOk, state }),
  };
}

/** Short texts of the IDoc statuses (WE47) — used when TEDS2 cannot be read. */
export const IDOC_STATUS_TEXT = {
  '02': 'Error passing data to port', '03': 'Data passed to port OK', '04': 'Error within control information of EDI subsystem',
  '05': 'Error during translation', '12': 'Dispatch OK', '25': 'Processing despite syntax error (outbound)',
  '26': 'Error during syntax check of IDoc (outbound)', '29': 'Error in ALE service', '30': 'IDoc ready for dispatch (ALE service)',
  '51': 'Application document not posted', '52': 'Application document not fully posted', '53': 'Application document posted',
  '56': 'IDoc with errors added', '60': 'Error during syntax check of IDoc (inbound)', '61': 'Processing despite syntax error (inbound)',
  '62': 'IDoc passed to application', '63': 'Error passing IDoc to application', '64': 'IDoc ready to be transferred to application',
  '65': 'Error in ALE service', '68': 'Error - no further processing', '69': 'IDoc was edited',
};

/** EDIDC row → IDoc header (partner = sender for inbound, receiver for outbound). */
export function idocOf(r) {
  const inbound = String(r.DIRECT) === '2';
  return {
    docnum: String(r.DOCNUM || '').replace(/^0+/, ''), status: String(r.STATUS || ''), mestyp: up(r.MESTYP), idoctp: up(r.IDOCTP), cimtyp: up(r.CIMTYP),
    direction: inbound ? 'in' : 'out', partner: up(inbound ? r.SNDPRN : r.RCVPRN), partnerType: up(inbound ? r.SNDPRT : r.RCVPRT),
    port: up(inbound ? r.SNDPOR : r.RCVPOR), created: `${isoD(r.CREDAT)} ${isoT(r.CRETIM)}`.trim(), updated: `${isoD(r.UPDDAT)} ${isoT(r.UPDTIM)}`.trim(),
    createdDate: isoD(r.CREDAT),
  };
}

/** Same message type + partner over the read window: how many in the same status, how many in any error, how many in total. */
export function idocVolume(rows, focus) {
  const same = arr(rows).map(idocOf).filter((i) => i.mestyp === focus.mestyp && i.partner === focus.partner && i.direction === focus.direction);
  return {
    total: same.length,
    sameStatus: same.filter((i) => i.status === focus.status).length,
    anyError: same.filter((i) => IDOC_ERROR_STATUS.has(i.status)).length,
    days: [...new Set(same.filter((i) => i.status === focus.status).map((i) => i.createdDate))].sort(),
  };
}

/** The IDoc facts from the collect object. */
export function idocFacts(c) {
  const all = arr(c.idocs?.rows).map(idocOf).sort((a, b) => (a.created < b.created ? 1 : -1));
  const want = String(c.idoc || '').replace(/^0+/, '');
  const focus = want ? all.find((i) => i.docnum === want) || null
    : all.find((i) => IDOC_ERROR_STATUS.has(i.status) && (!c.partner || i.partner === up(c.partner))) || null;
  const texts = new Map(arr(c.statusTexts?.rows).map((t) => [String(t.STATUS), t.DESCRP]));
  const statusText = (s) => texts.get(s) || IDOC_STATUS_TEXT[s] || '';
  const volume = focus ? idocVolume(c.volume?.rows, focus) : null;
  const fm = arr(c.inboundFm?.rows)[0]?.FUNCNAME || '';
  const changes = sectionState(c.transports) === 'read' && sectionState(c.objects) === 'read' ? 'read' : sectionState(c.transports) === 'notRead' || sectionState(c.objects) === 'notRead' ? 'notRead' : 'skipped';
  const state = { idocs: sectionState(c.idocs), volume: sectionState(c.volume), changes };
  return {
    kind: 'idoc', state, focus: focus ? { ...focus, statusText: statusText(focus.status), error: IDOC_ERROR_STATUS.has(focus.status) } : null,
    volume, volumeTruncated: !!c.volume?.truncated,
    others: all.filter((i) => !focus || i.docnum !== focus.docnum).slice(0, 10).map((i) => ({ ...i, statusText: statusText(i.status) })),
    inboundFm: fm, processCode: up(c.processCode),
    interfaces: arr(c.interfaces),
    suspects: fm ? jobSuspects([fm], c.transports?.rows, c.objects?.rows, focus ? { endDate: focus.createdDate } : null, null) : [],
    // null = unknown: the IDoc or the volume read was refused, or no IDoc matched the input
    flags: {
      error: focus ? IDOC_ERROR_STATUS.has(focus.status) : null,
      mass: focus && state.volume === 'read' ? volume.sameStatus >= 5 : null,
      single: focus && state.volume === 'read' ? volume.sameStatus <= 1 : null,
    },
  };
}

/** Everything the page and analyze-symptom read. Sections not read are listed with the TCode to use instead. */
export function buildFacts(c) {
  const facts = c.kind === 'idoc' ? idocFacts(c) : jobFacts(c);
  const notRead = Object.entries(c).filter(([, v]) => v && typeof v === 'object' && v.ok === false).map(([k, v]) => ({ section: k, error: String(v.error || '').slice(0, 200) }));
  const skipped = Object.entries(facts.state || {}).filter(([, s]) => s === 'skipped').map(([k]) => k);
  return {
    ...facts, system: c.system || '', sapVersion: c.sapVersion || '', readAt: c.readAt || '', lang: c.lang || 'en',
    notRead, skipped,
    dispatcherClosed: notRead.some((n) => /not allowed/i.test(n.error) && /^(runs|steps|idocs|volume|others)$/.test(n.section)),
    phase1Limits: c.kind === 'idoc' ? ['statusRecords', 'partnerProfile'] : ['jobLog', 'owners'],
  };
}
