// sc4sap:project-dashboard — `build-project-doc.mjs cutover`: cutover readiness of one project.
//
//   cutover --project <CODE> [--seed] [--window "<start>/<end>"] [--freeze-code YYYY-MM-DD] [--freeze-config YYYY-MM-DD]
//           [--rehearsal <id> --actuals <file.csv|json>] [--evidence <file>]… [--uat <ID>]… [--uat-dir <dir>] [--jobs [--confirm-prd]] [--lang ko|en] [--dir <projects>]
// UAT sets: project.uatSets (or --uat) → <artifact base>/uat/<ID>/<ID>-uat.json (+ <ID>-defects.json), like the weekly status.
//
// Offline unless --jobs. --jobs reads TBTCO / TBTCP only (cutover-jobs.mjs) on the active profile; a PRD profile
// stops unless --confirm-prd (the skill asks first). Never imports, never changes a job, never locks a user.
// Writes the model (seeded tasks, window, rehearsal actuals, the last jobs read), rebuilds the dashboard
// (same version) and writes <CODE>-cutover-<lang>.html. Prints one JSON line:
//   { html, dashboard, dDay, suggest, open, nogo, fit, criticalH, windowH, jobs: { ok, n, released }, late, seeded, applied }

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkModel, normalizeModel, viewModel, iso, arr } from './project-model.mjs';
import { readEvidence, statusEntry, gateCheck, weekEndOf } from './project-status.mjs';
import { normalizeCutover, checkCutover, seedCutover, rehearsalFit, goNoGoView, taskChecks, importList, tMinus, parseActuals, applyActuals } from './cutover-model.mjs';
import { renderCutoverPage } from './cutover-page.mjs';
import { readActiveSapEnv, readActiveAlias, normalizeTier, resolveArtifactBase } from '../lib/profile-resolve.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const loadCutoverTemplate = () => JSON.parse(readFileSync(join(here, 'cutover-tasks.json'), 'utf8'));
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, o) => writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`, 'utf8');
const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const PRD_CONFIRM = {
  en: 'PRD: the released and scheduled jobs are read (TBTCO / TBTCP, read-only; no job is changed). Go?',
  ko: 'PRD에서 릴리스·예약된 잡 목록만 읽어요 (TBTCO / TBTCP, 읽기 전용, 잡은 바꾸지 않아요). 진행할까요?',
};
/** PRD tier without --confirm-prd → the stop message. */
export const prdStop = ({ tier, confirmed }) => (tier === 'PRD' && !confirmed ? `active profile tier is PRD — ask the user "${PRD_CONFIRM.en}" and rerun with --confirm-prd on yes` : '');

/** "2027-01-02T18:00/2027-01-04T06:00" (a space instead of T is fine) → { start, end }. */
export function parseWindow(s) {
  const [a, b] = String(s || '').split('/').map((x) => x.trim().replace(' ', 'T').slice(0, 16));
  if (!DT.test(a || '') || !DT.test(b || '') || b <= a) throw new Error('--window must be "YYYY-MM-DDTHH:MM/YYYY-MM-DDTHH:MM" with the end after the start');
  return { start: a, end: b };
}

/** CTS requests (with findings when the file is the CTS model JSON, verdict only from a page's tr-summary). */
export function ctsRequests(text) {
  try { const j = JSON.parse(text); if (j && Array.isArray(j.requests)) return { requests: j.requests }; } catch { /* a page */ }
  const m = /<script type="application\/json" id="tr-summary">([\s\S]*?)<\/script>/.exec(String(text));
  if (!m) return null;
  try { return { requests: arr(JSON.parse(m[1]).requests) }; } catch { return null; }
}

/** Released / scheduled jobs from the active profile (an MCP read); { ok: false, error } when it cannot be read. */
async function readJobsLive() {
  const { connect } = await import('../config/sap-reader.mjs');
  const { readJobs } = await import('./cutover-jobs.mjs');
  let client;
  try {
    client = await connect('project-dashboard');
    return await readJobs(client);
  } catch (e) {
    return { ok: false, rows: [], error: String(e.message || e).slice(0, 300) };
  } finally { await client?.close?.().catch(() => {}); }
}

export async function cmdCutover({ code, root, seed = false, window = '', freezeCode = '', freezeConfig = '', rehearsal = '', actuals = '', evidence = [], jobs = false,
  uat = [], uatDir = '', confirmPrd = false, lang = '', today = iso(Date.now()), buildProject, readJobsFn = readJobsLive, tier = null }) {
  const modelPath = join(root, code, `${code}-project.json`);
  if (!existsSync(modelPath)) throw new Error(`no model for ${code} — import the dashboard page first`);
  let model = normalizeModel(readJson(modelPath));
  model.cutover = normalizeCutover(model.cutover);
  if (jobs) {
    const t = tier ?? normalizeTier(process.env.SAP_TIER || readActiveSapEnv(process.cwd())?.env?.SAP_TIER);
    const stop = prdStop({ tier: t, confirmed: confirmPrd });
    if (stop) throw new Error(stop);
  }
  // 1. runbook: seed (first run or --seed; idempotent), window, freeze
  let seeded = null;
  if (seed || !model.cutover) {
    const r = seedCutover(model, loadCutoverTemplate(), { lang: model.lang });
    model = normalizeModel(r.model);
    model.cutover = normalizeCutover(model.cutover);
    seeded = { type: r.type, tasks: r.added.length, goNoGo: r.addedGoNoGo.length };
  }
  if (window) model.cutover.window = parseWindow(window);
  if (freezeCode) model.cutover.freeze = { ...model.cutover.freeze, code: freezeCode };
  if (freezeConfig) model.cutover.freeze = { ...model.cutover.freeze, config: freezeConfig };
  // 2. rehearsal (or live) actuals
  let applied = null;
  if (actuals) {
    if (!rehearsal) throw new Error('--actuals needs --rehearsal <id> (or live)');
    const pa = parseActuals(readFileSync(actuals, 'utf8'));
    const r = applyActuals(model.cutover, rehearsal, pa.rows);
    model.cutover = r.cutover;
    applied = { rehearsal, rows: r.applied, unknown: r.unknown, errors: pa.errors };
  }
  const errors = [...checkModel(model).errors, ...checkCutover(model.cutover, model.team).errors];
  if (errors.length) throw new Error(`model has ${errors.length} error(s):\n  · ${errors.join('\n  · ')}`);
  // 3. jobs (optional SAP read) — kept in the model so later offline runs still show the last read
  if (jobs) {
    const j = await readJobsFn();
    // system = the active profile the read went to (alias), so the page says where the list comes from
    model.cutover.jobsRead = { at: `${today}`, ok: !!j.ok, rows: arr(j.rows), error: j.ok ? '' : j.error || 'not read', stepsRead: j.stepsRead !== false,
      system: readActiveAlias(process.cwd()) || readActiveSapEnv(process.cwd())?.env?.SAP_SID || '' };
  }
  writeJson(modelPath, model);
  const dash = buildProject ? buildProject({ modelPath, root, sameVersion: true, today }) : null;
  // 4. evaluation
  // UAT sets of the project (project.uatSets, or --uat), read the same way as the weekly status
  const ids = uat.length ? uat : arr(model.project.uatSets).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
  const ur = uatDir || (ids.length ? join(resolveArtifactBase(process.cwd()), 'uat') : '');
  const uatFiles = ids.flatMap((id) => { const f = join(ur, id, `${id}-uat.json`), d = join(ur, id, `${id}-defects.json`); return [f, ...(existsSync(d) ? [d] : [])]; });
  const ev = [...evidence, ...uatFiles].map((p) => { try { return { file: p, text: readFileSync(p, 'utf8') }; } catch (e) { return { file: p, error: e.message }; } });
  const read = ev.map((x) => (x.error ? { ok: false, kind: 'unknown', code: 'read-error', reason: x.error } : readEvidence(x.text)));
  const cts = ev.map((x) => (x.text ? ctsRequests(x.text) : null)).filter(Boolean);
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
  const html = join(root, code, `${code}-cutover-${L}.html`);
  writeFileSync(html, renderCutoverPage({ view: v, cutover: c, gng, fit, tm, jobs: jobsRead, imports, checks, lang: L }), 'utf8');
  return {
    html, dashboard: dash?.html || '', dDay: tm.dDay, suggest: gng.suggest, open: gng.open, nogo: gng.nogo, fit: fit.verdict,
    criticalH: (fit.rehearsal || fit.plan).totalH, windowH: fit.windowH,
    jobs: jobsRead ? { ok: jobsRead.ok, n: jobsRead.rows.length, released: jobsRead.rows.filter((j) => j.status === 'released').length } : { ok: false, n: null, notAsked: true },
    late: tm.late.length, seeded, applied, evidence: read.map((e) => ({ kind: e.kind, ok: e.ok })), warnings: dash?.warnings || [],
  };
}
