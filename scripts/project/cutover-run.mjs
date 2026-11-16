// sc4sap:project-dashboard — one cutover run as a pure function, shared by the CLI (`build-project-doc.mjs cutover`)
// and the web project workbench (/pm). No file, network or SAP access: the caller reads the evidence texts,
// the rehearsal actuals text and (optionally) the jobs (cutover-jobs.mjs readJobs) and passes them in.
//
//   computeCutover(model, { seed, window, freeze, rehearsal, actualsText, evidence, jobs, lang, today, template })
//     → { model, html, summary, warnings }
//
//   model       the project model (normalized here; not changed in place)
//   seed        true → add the template tasks / go-no-go items not in the model yet (a model without a runbook is always seeded)
//   window      "<start>/<end>" (YYYY-MM-DD HH:MM or with T) or { start, end }
//   freeze      { code?, config? } (YYYY-MM-DD)
//   rehearsal   rehearsal id (R1, R2 …) or "live"; with actualsText the times go into the tasks under that id
//   actualsText CSV "task id,start,end" or JSON [{ id, start, end }]
//   evidence    [{ name, text }] — CTS check page / model.json, UAT page / set JSON / defect feed, operations report;
//               an entry with `error` instead of `text` is shown as not read
//   jobs        null (keep the last read in the model) or a readJobs result { ok, rows, error?, stepsRead? } plus
//               { system, at } — written to model.cutover.jobsRead
//   template    the runbook template (default: cutover-tasks.json of this folder)
// Errors in the model or the runbook throw (the CLI exits 1 with the same message).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkModel, normalizeModel, viewModel, iso, arr } from './project-model.mjs';
import { readEvidence, statusEntry, gateCheck, weekEndOf } from './project-status.mjs';
import { normalizeCutover, checkCutover, seedCutover, rehearsalFit, goNoGoView, taskChecks, importList, tMinus, parseActuals, applyActuals } from './cutover-model.mjs';
import { renderCutoverPage } from './cutover-page.mjs';

const here = dirname(fileURLToPath(import.meta.url));
/** The generic runbook of this plugin version (a file of the plugin itself, not user data). */
export const loadCutoverTemplate = () => JSON.parse(readFileSync(join(here, 'cutover-tasks.json'), 'utf8'));
const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** The question before a jobs read on a PRD profile (CLI --confirm-prd, web second confirmation). */
export const PRD_CONFIRM = {
  en: 'PRD: the released and scheduled jobs are read (TBTCO / TBTCP, read-only; no job is changed). Go?',
  ko: 'PRD에서 릴리스·예약된 잡 목록만 읽어요 (TBTCO / TBTCP, 읽기 전용, 잡은 바꾸지 않아요). 진행할까요?',
};

/** "2027-01-02T18:00/2027-01-04T06:00" (a space instead of T is fine) or { start, end } → { start, end }. */
export function parseWindow(s) {
  const [a, b] = (typeof s === 'object' && s ? [s.start, s.end] : String(s || '').split('/')).map((x) => String(x || '').trim().replace(' ', 'T').slice(0, 16));
  if (!DT.test(a || '') || !DT.test(b || '') || b <= a) throw new Error('--window must be "YYYY-MM-DDTHH:MM/YYYY-MM-DDTHH:MM" with the end after the start');
  return { start: a, end: b };
}

/** CTS requests (with findings when the text is the CTS model JSON, verdict only from a page's tr-summary). */
export function ctsRequests(text) {
  try { const j = JSON.parse(text); if (j && Array.isArray(j.requests)) return { requests: j.requests }; } catch { /* a page */ }
  const m = /<script type="application\/json" id="tr-summary">([\s\S]*?)<\/script>/.exec(String(text));
  if (!m) return null;
  try { return { requests: arr(JSON.parse(m[1]).requests) }; } catch { return null; }
}

/** Evidence texts → the readEvidence summaries and the CTS request lists (shared with the weekly status if wanted). */
export function readEvidenceTexts(evidence = []) {
  const read = arr(evidence).map((x) => (x?.error != null || typeof x?.text !== 'string'
    ? { ok: false, kind: 'unknown', code: 'read-error', reason: x?.error || 'no text' } : readEvidence(x.text)));
  const cts = arr(evidence).map((x) => (typeof x?.text === 'string' ? ctsRequests(x.text) : null)).filter(Boolean);
  return { read, cts };
}

export function computeCutover(input, { seed = false, window = '', freeze = {}, rehearsal = '', actualsText = '', evidence = [], jobs = null,
  lang = '', today = iso(Date.now()), template = null } = {}) {
  let model = normalizeModel(input);
  model.cutover = normalizeCutover(model.cutover);
  // 1. runbook: seed (first run or seed; idempotent), window, freeze
  let seeded = null;
  if (seed || !model.cutover) {
    const r = seedCutover(model, template || loadCutoverTemplate(), { lang: model.lang });
    model = normalizeModel(r.model);
    model.cutover = normalizeCutover(model.cutover);
    seeded = { type: r.type, tasks: r.added.length, goNoGo: r.addedGoNoGo.length };
  }
  if (window) model.cutover.window = parseWindow(window);
  if (freeze?.code) model.cutover.freeze = { ...model.cutover.freeze, code: freeze.code };
  if (freeze?.config) model.cutover.freeze = { ...model.cutover.freeze, config: freeze.config };
  // 2. rehearsal (or live) actuals
  let applied = null;
  if (actualsText) {
    if (!rehearsal) throw new Error('--actuals needs --rehearsal <id> (or live)');
    const pa = parseActuals(actualsText);
    const r = applyActuals(model.cutover, rehearsal, pa.rows);
    model.cutover = r.cutover;
    applied = { rehearsal, rows: r.applied, unknown: r.unknown, errors: pa.errors };
  }
  const errors = [...checkModel(model).errors, ...checkCutover(model.cutover, model.team).errors];
  if (errors.length) throw new Error(`model has ${errors.length} error(s):\n  · ${errors.join('\n  · ')}`);
  // 3. jobs read by the caller — kept in the model so later runs without a read still show it
  if (jobs) {
    model.cutover.jobsRead = { at: jobs.at || `${today}`, ok: !!jobs.ok, rows: arr(jobs.rows), error: jobs.ok ? '' : jobs.error || 'not read', stepsRead: jobs.stepsRead !== false,
      system: jobs.system || '' };
  }
  // 4. evaluation
  const { read, cts } = readEvidenceTexts(evidence);
  const v = viewModel(model, today);
  const entry = statusEntry(v, read, weekEndOf(today));
  const c = model.cutover;
  const fit = rehearsalFit(c, rehearsal && rehearsal !== 'live' ? rehearsal : '');
  const jobsRead = c.jobsRead ? { ok: c.jobsRead.ok, rows: arr(c.jobsRead.rows), error: c.jobsRead.error, at: c.jobsRead.at, system: c.jobsRead.system, stepsRead: c.jobsRead.stepsRead } : null;
  const ctx = { cutover: c, fit, jobs: jobsRead };
  const gate = gateCheck({ id: 'GNG', label: 'go / no-go', criteria: arr(c.goNoGo).map((g) => g.text) }, entry, v);
  const gng = goNoGoView(c, gate.rows, ctx);
  const one = (text) => { const r = gateCheck({ id: 'T', criteria: [text] }, entry, v).rows[0]; return r && r.source !== 'manual' ? r : null; };
  const checks = taskChecks(c, one, ctx);
  const tm = tMinus(today, c, model.project.goLive);
  const L = lang || model.lang || 'ko';
  const imports = importList(model.actuals?.transports, cts, L);
  const html = renderCutoverPage({ view: v, cutover: c, gng, fit, tm, jobs: jobsRead, imports, checks, lang: L });
  const summary = {
    dDay: tm.dDay, suggest: gng.suggest, open: gng.open, nogo: gng.nogo, fit: fit.verdict,
    criticalH: (fit.rehearsal || fit.plan).totalH, windowH: fit.windowH,
    jobs: jobsRead ? { ok: jobsRead.ok, n: jobsRead.rows.length, released: jobsRead.rows.filter((j) => j.status === 'released').length } : { ok: false, n: null, notAsked: true },
    late: tm.late.length, seeded, applied, evidence: read.map((e) => ({ kind: e.kind, ok: e.ok })),
  };
  return { model, html, summary, warnings: [...checkModel(model).warnings, ...checkCutover(model.cutover, model.team).warnings] };
}
