// sc4sap:uat-scenarios — defects and their fixes: each UAT issue linked to the request that fixes it, that
// request's CTS verdict (transport-readiness model.json) and the retest cycle. Pure: no I/O.
//
// Row status (one per defect issue — type defect / empty, or logged on a failed step):
//   retest-pass / retest-fail — the step has a result in the retest cycle (wins over everything else)
//   no-fix          — no fixing request named
//   fix-unchecked   — a request is named but not in the CTS check given (or no check given)
//   fix-in-progress — a named request is open with CTS blocked / check
//   fix-ready       — every named request is CTS ready or released ("이관 준비됨": ready to move — whether it was
//                     imported into QA is not read; TMS logs stay with people)
//   retest-due      — fix ready and the retest cycle has no result yet
// Requests found by text (a request text naming ISS-0003 or <SET>/ISS-0003) are never linked here: they come
// back as a proposed patch (set-issue transports) the user accepts or rejects.
//
// KPI feed (agreed with the project dashboard; ids stable for its snapshots):
//   { kind: 'uat-defect-feed', set, project, at, kpi: { 'uat-defects-open', 'uat-defects-no-fix', 'uat-fix-ready',
//     'uat-retest-due', 'uat-retest-pass-rate' (%, null when nothing was retested) },
//     notes: { toClose: [issues retested OK but still open — not counted open], retestUnchecked: [retested issues whose
//     fixing requests were not all CTS-checked — left out of the pass rate] }, rows }

import { TRKORR_RE, requestsOf, runsIn } from './uat-model.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
export const STATUSES = ['no-fix', 'fix-unchecked', 'fix-in-progress', 'fix-ready', 'retest-due', 'retest-pass', 'retest-fail'];

/** CTS state of one request from a transport-readiness model: ready | released | check | blocked | unknown. */
export function ctsOf(trkorr, trModel) {
  const r = arr(trModel?.requests).find((x) => x.trkorr === trkorr);
  if (!r) return { trkorr, state: 'unknown', verdict: '', text: '' };
  // a released request only warns "released"; it is done on the source side
  const onlyReleased = r.status === 'released' && arr(r.findings).every((f) => f.kind === 'released');
  return { trkorr, state: onlyReleased ? 'released' : r.verdict, verdict: r.verdict, text: r.text || '' };
}

/** The cycle a fix is retested in: the issue's own, else the cycle after the step's last failed one. */
export function retestCycleOf(issue, step, cycles) {
  if (issue.retest && cycles.includes(issue.retest)) return issue.retest;
  if (!step) return '';
  const failed = cycles.filter((c) => step.results?.[c] === 'fail');
  const last = failed.length ? cycles.indexOf(failed.at(-1)) : -1;
  return last >= 0 ? cycles.slice(last + 1).find((c) => runsIn(step, c)) || '' : '';
}

export function statusOf(row) {
  if (row.retestResult === 'pass') return 'retest-pass';
  if (row.retestResult === 'fail' || row.retestResult === 'blocked') return 'retest-fail';
  if (!row.transports.length) return 'no-fix';
  if (row.transports.some((t) => t.state === 'unknown')) return 'fix-unchecked';
  if (row.transports.some((t) => t.state === 'blocked' || t.state === 'check')) return 'fix-in-progress';
  return row.retest ? 'retest-due' : 'fix-ready';
}

/** One row per defect issue of the set (normalized by uat-model). */
export function defectRows(set, trModel = null) {
  const out = [];
  for (const i of arr(set.issues)) {
    const sc = arr(set.scenarios).find((s) => s.id === i.scenario);
    const st = arr(sc?.steps).find((x) => x.id === i.step);
    const failed = st ? set.cycles.filter((c) => st.results?.[c] === 'fail') : [];
    if (!(i.type === 'defect' || !i.type || failed.length)) continue;
    if (i.state === 'n/a') continue;
    const retest = retestCycleOf(i, st, set.cycles);
    const row = {
      issue: i.id, scenario: i.scenario, step: i.step, module: i.module, text: i.text, state: i.state, failed,
      transports: requestsOf(i.transports).filter((t) => TRKORR_RE.test(t)).map((t) => ctsOf(t, trModel)),
      retest, retestResult: retest && st ? st.results?.[retest] || '' : '',
    };
    row.status = statusOf(row);
    out.push(row);
  }
  return out;
}

/**
 * Requests whose text names an issue of this set (ISS-0003 or <SET>/ISS-0003) and that the
 * issue does not list yet → set-issue operations for the user to accept. A text naming another set is skipped.
 */
export function proposeLinks(set, trModel) {
  const ids = new Set(arr(set.issues).map((i) => i.id));
  const add = new Map();
  for (const r of arr(trModel?.requests)) {
    const text = String(r.text || '').toUpperCase();
    for (const m of text.matchAll(/(?:([A-Z0-9_-]{1,30})\/)?\b(ISS-\d{4})\b/g)) {
      const [, prefix, id] = m;
      if (prefix && prefix !== String(set.id).toUpperCase()) continue;
      if (!ids.has(id)) continue;
      const issue = set.issues.find((i) => i.id === id);
      if (requestsOf(issue.transports).includes(r.trkorr)) continue;
      add.set(id, [...new Set([...(add.get(id) || requestsOf(issue.transports)), r.trkorr])]);
    }
  }
  return [...add].map(([issue, value]) => ({ op: 'set-issue', issue, field: 'transports', value }));
}

/** The dashboard feed. `at` = the date the feed was made (YYYY-MM-DD). */
export function kpiFeed(set, rows, at = new Date().toISOString().slice(0, 10)) {
  const n = (s) => rows.filter((r) => s.includes(r.status)).length;
  // a defect whose retest passed is not open any more, even before someone closes it (toClose)
  const open = rows.filter((r) => (r.state === 'open' || r.state === 'waiting') && r.status !== 'retest-pass');
  // the pass rate counts only retests whose fixing requests were all CTS-checked; the rest are shown apart
  const checked = (r) => r.transports.length && r.transports.every((t) => t.state !== 'unknown');
  const retested = rows.filter((r) => r.status === 'retest-pass' || r.status === 'retest-fail');
  const pass = retested.filter((r) => checked(r) && r.status === 'retest-pass').length;
  const fail = retested.filter((r) => checked(r) && r.status === 'retest-fail').length;
  return {
    kind: 'uat-defect-feed', set: set.id, project: set.project || '', at,
    kpi: {
      'uat-defects-open': open.length,
      'uat-defects-no-fix': open.filter((r) => r.status === 'no-fix').length,
      'uat-fix-ready': n(['fix-ready']),
      'uat-retest-due': n(['retest-due']),
      'uat-retest-pass-rate': pass + fail ? Math.round((pass / (pass + fail)) * 100) : null,
    },
    notes: {
      toClose: rows.filter((r) => r.status === 'retest-pass' && (r.state === 'open' || r.state === 'waiting')).map((r) => r.issue),
      retestUnchecked: retested.filter((r) => !checked(r)).map((r) => r.issue),
    },
    rows: rows.map((r) => ({ issue: r.issue, scenario: r.scenario, step: r.step, status: r.status, state: r.state,
      transports: r.transports.map((t) => ({ trkorr: t.trkorr, verdict: t.state })), retest: r.retest, retestResult: r.retestResult })),
  };
}
