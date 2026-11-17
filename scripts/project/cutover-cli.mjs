// sc4sap:project-dashboard — `build-project-doc.mjs cutover`: cutover readiness of one project.
//
//   cutover --project <CODE> [--seed] [--window "<start>/<end>"] [--freeze-code YYYY-MM-DD] [--freeze-config YYYY-MM-DD]
//           [--rehearsal <id> --actuals <file.csv|json>] [--evidence <file>]… [--uat <ID>]… [--uat-dir <dir>] [--jobs [--confirm-prd]] [--lang ko|en] [--dir <projects>]
// UAT sets: project.uatSets (or --uat) → <artifact base>/uat/<ID>/<ID>-uat.json (+ <ID>-defects.json), like the weekly status.
//
// Offline unless --jobs. --jobs reads TBTCO / TBTCP only (cutover-jobs.mjs) on the active profile; a PRD profile
// stops unless --confirm-prd (the skill asks first). Never imports, never changes a job, never locks a user.
// The run itself is computeCutover (cutover-run.mjs, shared with the web workbench); this file only reads the
// files, reads the jobs when asked, writes the model and <CODE>-cutover-<lang>.html and rebuilds the dashboard
// (same version). Prints one JSON line:
//   { html, dashboard, dDay, suggest, open, nogo, fit, criticalH, windowH, jobs: { ok, n, released }, late, seeded, applied, evidence }

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeModel, iso, arr } from './project-model.mjs';
import { computeCutover, PRD_CONFIRM } from './cutover-run.mjs';
import { readActiveSapEnv, readActiveAlias, normalizeTier, resolveArtifactBase } from '../lib/profile-resolve.mjs';

export { loadCutoverTemplate, parseWindow, ctsRequests, PRD_CONFIRM } from './cutover-run.mjs';
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
const writeJson = (f, o) => writeFileSync(f, `${JSON.stringify(o, null, 2)}\n`, 'utf8');

/** PRD tier without --confirm-prd → the stop message. */
export const prdStop = ({ tier, confirmed }) => (tier === 'PRD' && !confirmed ? `active profile tier is PRD — ask the user "${PRD_CONFIRM.en}" and rerun with --confirm-prd on yes` : '');

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

/** UAT set files of the project (project.uatSets, or --uat), the same lookup as the weekly status. */
function uatFiles(model, uat, uatDir) {
  const ids = uat.length ? uat : arr(model.project?.uatSets).map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
  const ur = uatDir || (ids.length ? join(resolveArtifactBase(process.cwd()), 'uat') : '');
  return ids.flatMap((id) => { const f = join(ur, id, `${id}-uat.json`), d = join(ur, id, `${id}-defects.json`); return [f, ...(existsSync(d) ? [d] : [])]; });
}

export async function cmdCutover({ code, root, seed = false, window = '', freezeCode = '', freezeConfig = '', rehearsal = '', actuals = '', evidence = [], jobs = false,
  uat = [], uatDir = '', confirmPrd = false, lang = '', today = iso(Date.now()), buildProject, readJobsFn = readJobsLive, tier = null }) {
  const modelPath = join(root, code, `${code}-project.json`);
  if (!existsSync(modelPath)) throw new Error(`no model for ${code} — import the dashboard page first`);
  const model = normalizeModel(readJson(modelPath));
  if (jobs) {
    const t = tier ?? normalizeTier(process.env.SAP_TIER || readActiveSapEnv(process.cwd())?.env?.SAP_TIER);
    const stop = prdStop({ tier: t, confirmed: confirmPrd });
    if (stop) throw new Error(stop);
  }
  if (actuals && !rehearsal) throw new Error('--actuals needs --rehearsal <id> (or live)');
  const actualsText = actuals ? readFileSync(actuals, 'utf8') : '';
  const ev = [...evidence, ...uatFiles(model, uat, uatDir)].map((p) => { try { return { name: p, text: readFileSync(p, 'utf8') }; } catch (e) { return { name: p, error: e.message }; } });
  // the jobs are read only after the runbook checks passed (a bad model must not trigger a SAP read)
  const base = { seed, window, freeze: { code: freezeCode, config: freezeConfig }, rehearsal, actualsText, evidence: ev, lang, today };
  computeCutover(model, base); // throws on model / runbook errors before any SAP read
  const jobsRead = jobs ? { ...(await readJobsFn()), at: today, system: readActiveAlias(process.cwd()) || readActiveSapEnv(process.cwd())?.env?.SAP_SID || '' } : null;
  const r = computeCutover(model, { ...base, jobs: jobsRead });
  writeJson(modelPath, r.model);
  const dash = buildProject ? buildProject({ modelPath, root, sameVersion: true, today }) : null;
  const L = lang || r.model.lang || 'ko';
  const html = join(root, code, `${code}-cutover-${L}.html`);
  writeFileSync(html, r.html, 'utf8');
  return { html, dashboard: dash?.html || '', ...r.summary, warnings: dash?.warnings || [] };
}
