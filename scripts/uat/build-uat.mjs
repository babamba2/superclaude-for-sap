#!/usr/bin/env node
// sc4sap:uat-scenarios — keep one UAT scenario set as JSON and turn it into what people use.
//
//   node scripts/uat/build-uat.mjs init   --answers <file.json> --dir <dir> [--force] [--no-xlsx]
//   node scripts/uat/build-uat.mjs check  --dir <dir> --id <ID>
//   node scripts/uat/build-uat.mjs patch  --dir <dir> --id <ID> --patch <ops.json> [--no-xlsx]
//   node scripts/uat/build-uat.mjs export --dir <dir> --id <ID> --layout A|B|both [--out-dir <dir>]
//   node scripts/uat/build-uat.mjs show   --dir <dir> --id <ID>
//   node scripts/uat/build-uat.mjs page   --dir <dir> --id <ID> [--out-dir <dir>]
//   node scripts/uat/build-uat.mjs import <edited.html> --dir <dir> [--no-xlsx]
//   node scripts/uat/build-uat.mjs defects --dir <dir> --id <ID> [--tr <transport-readiness model.json>] [--lang ko|en] [--at YYYY-MM-DD]
//   node scripts/uat/build-uat.mjs check-sap  --dir <dir> --id <ID> --plan <plan.json> [--months 3]
//   node scripts/uat/build-uat.mjs check-save --dir <dir> --id <ID> --judge <answer.json> [--system <SID>]
//
// The set lives in <dir>/<ID>/<ID>-uat.json (model: uat-model.mjs). `patch` applies a proposal — the
// module consultant's, or edits made elsewhere — and reports what it applied and what it skipped.
// `init`, `patch` and `import` also write the editable page <ID>-uat.html (uat-page.mjs) and both workbooks,
// <ID>-uat-A.xlsx and -B.xlsx, next to the JSON, so the
// `defects` (uat-defects.mjs) links each defect to its fixing requests, their CTS verdict (the model.json of a
// transport-readiness run, e.g. `collect --text "%ISS-%"`) and the retest cycle: <ID>-defects-<lang>.html, the
// dashboard feed <ID>-defects.json, and _patch/<ID>-links.json (links found in request texts — a proposal only).
// Excel in the folder is never older than the set; `export` writes them elsewhere (uat-xlsx.mjs). Every command prints one JSON line. Offline: no SAP.
// `check-sap` / `check-save` are the scenario check (uat-check.mjs, skills/uat-scenarios/check.md): the plan's values read
// from the connected system (key columns, one row each, no write) into <dir>/<ID>/_check/evidence.json; then the judge's
// answer merged on the reads' verdicts into the set's `lastCheck` (page badges) and its proposals into _patch/<ID>-check.json.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyPatch, normalize, progress, validate } from './uat-model.mjs';
import { layoutA, layoutB } from './uat-xlsx.mjs';
import { pageHtml, setFromPage } from './uat-page.mjs';
import { defectRows, kpiFeed, proposeLinks } from './uat-defects.mjs';
import { renderDefects, renderDefectSummary } from './uat-defects-page.mjs';
import { readerOver, runChecks, validatePlan } from './uat-check.mjs';
import { applyCheck, jsonOf, mergeJudge, ruleRows } from './uat-check-ai.mjs';

const ID = /^[A-Za-z0-9_-]{1,30}$/;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[(i += 1)];
    else out._.push(argv[i]);
  }
  return out;
}

const fileOf = (dir, id) => join(dir, id, `${id}-uat.json`);
function load(o) {
  if (!o.dir || !ID.test(String(o.id || ''))) throw new Error('--dir and --id (letters, digits, _ -) are required');
  const f = fileOf(o.dir, o.id);
  if (!existsSync(f)) throw new Error(`no scenario set ${o.id} in ${o.dir}`);
  const set = normalize(JSON.parse(readFileSync(f, 'utf8')));
  // every output path is built from set.id: the id inside the file must be the one asked for
  if (set.id !== o.id || !ID.test(set.id)) throw new Error(`${f} holds set id "${String(set.id).slice(0, 40)}", not ${o.id}`);
  return set;
}
function save(dir, set) {
  mkdirSync(join(dir, set.id), { recursive: true });
  writeFileSync(fileOf(dir, set.id), `${JSON.stringify(set, null, 1)}\n`);
  return fileOf(dir, set.id);
}

/** Both workbooks next to the set (user, 2026-11-16: a new set comes with its Excel). */
function writeXlsx(out, set, layouts = ['A', 'B']) {
  mkdirSync(out, { recursive: true });
  const stats = progress(set);
  return layouts.map((l) => {
    const file = join(out, `${set.id}-uat-${l}.xlsx`);
    writeFileSync(file, l === 'A' ? layoutA(set, stats) : layoutB(set, stats));
    return file;
  });
}

/** The editable page next to the set (user, 2026-11-16: HTML first, Excel as well). */
function writePage(out, set) {
  mkdirSync(out, { recursive: true });
  const file = join(out, `${set.id}-uat.html`);
  writeFileSync(file, pageHtml(set));
  return file;
}
const outputs = (o, set) => ({
  page: writePage(join(o.dir, set.id), set),
  xlsx: o['no-xlsx'] ? [] : writeXlsx(join(o.dir, set.id), set),
});

const commands = {
  init(o) {
    if (!o.answers || !o.dir) throw new Error('--answers and --dir are required');
    const set = normalize(JSON.parse(readFileSync(o.answers, 'utf8')));
    if (!ID.test(set.id)) throw new Error(`id ${set.id}: letters, digits, _ - only, ≤ 30`);
    if (existsSync(fileOf(o.dir, set.id)) && !o.force) throw new Error(`${set.id} exists — use patch, or --force to start over`);
    const file = save(o.dir, set);
    return { file, ...outputs(o, set), issues: validate(set), progress: progress(set) };
  },
  check(o) {
    const set = load(o);
    return { issues: validate(set), progress: progress(set) };
  },
  patch(o) {
    const set = load(o);
    if (!o.patch) throw new Error('--patch <ops.json> is required');
    const raw = JSON.parse(readFileSync(o.patch, 'utf8'));
    const { set: next, applied, skipped } = applyPatch(set, Array.isArray(raw) ? raw : raw.ops);
    const file = save(o.dir, next);
    // The page and the workbooks follow the set, so nothing in the folder is older than the JSON.
    return { file, ...outputs(o, next), applied: applied.length, skipped, issues: validate(next) };
  },
  /** The page again (after a plugin update), or into another folder. */
  page(o) {
    const set = load(o);
    return { page: writePage(o['out-dir'] || join(o.dir, set.id), set) };
  },
  /** A page edited in the browser and saved: its set becomes the set; page and workbooks are rewritten. */
  import(o) {
    const html = o._[1];
    if (!html || !o.dir) throw new Error('usage: import <edited.html> --dir <dir>');
    const raw = setFromPage(readFileSync(html, 'utf8'));
    if (!raw) throw new Error(`${html} has no scenario set in it — was it saved from the page's Save button?`);
    const set = normalize(raw);
    if (!ID.test(set.id)) throw new Error(`id ${set.id}: letters, digits, _ - only, ≤ 30`);
    const file = save(o.dir, set);
    return { file, ...outputs(o, set), issues: validate(set), progress: progress(set) };
  },
  export(o) {
    const set = load(o);
    const layout = String(o.layout || 'A').toUpperCase();
    if (layout === 'BOTH') return { files: writeXlsx(o['out-dir'] || join(o.dir, set.id), set) };
    if (!['A', 'B'].includes(layout)) throw new Error('--layout A, B or both');
    const out = o['out-dir'] || join(o.dir, set.id);
    mkdirSync(out, { recursive: true });
    const file = join(out, `${set.id}-uat-${layout}.xlsx`);
    writeFileSync(file, layout === 'A' ? layoutA(set, progress(set)) : layoutB(set, progress(set)));
    return { file };
  },
  /** Defects ↔ fixing requests ↔ retest; the dashboard feed; text-found links as a proposed patch. */
  defects(o) {
    const set = load(o);
    const lang = ['ko', 'en'].includes(o.lang) ? o.lang : 'en';
    const tr = o.tr && o.tr !== true ? JSON.parse(readFileSync(o.tr, 'utf8')) : null;
    if (tr && !Array.isArray(tr.requests)) throw new Error(`${o.tr} is not a transport-readiness model.json`);
    const rows = defectRows(set, tr);
    const at = /^\d{4}-\d{2}-\d{2}$/.test(String(o.at)) ? o.at : new Date().toISOString().slice(0, 10);
    const feed = kpiFeed(set, rows, at);
    const proposals = tr ? proposeLinks(set, tr) : [];
    const out = o['out-dir'] || join(o.dir, set.id);
    mkdirSync(out, { recursive: true });
    const view = { set, rows, feed, proposals, trLabel: tr ? `${tr.system || ''}${tr.readAt ? ` ${tr.readAt}` : ''}`.trim() : '' };
    const page = join(out, `${set.id}-defects-${lang}.html`);
    writeFileSync(page, renderDefects(view, lang));
    const feedFile = join(out, `${set.id}-defects.json`);
    writeFileSync(feedFile, `${JSON.stringify(feed, null, 1)}
`);
    let patch = null;
    if (proposals.length) {
      mkdirSync(join(o.dir, '_patch'), { recursive: true });
      patch = join(o.dir, '_patch', `${set.id}-links.json`);
      writeFileSync(patch, `${JSON.stringify(proposals, null, 1)}
`);
    }
    return { page, feed: feedFile, patch, kpi: feed.kpi, proposals: proposals.length, text: renderDefectSummary(view, lang) };
  },
  show(o) {
    const set = load(o);
    return { set, issues: validate(set), progress: progress(set) };
  },
  /** The scenario check, reads: the plan's values looked up in the connected system. No model, no write. */
  async 'check-sap'(o) {
    const set = load(o);
    if (!o.plan) throw new Error('--plan <plan.json> is required');
    const plan = validatePlan(jsonOf(readFileSync(o.plan, 'utf8')) ?? {}, set);
    const months = Math.min(12, Math.max(1, Number(o.months) || 3));
    const { connect, readIn, readTable } = await import('../config/sap-reader.mjs');
    const client = await connect('uat-check');
    let ev;
    try {
      ev = await runChecks(plan, readerOver(client, { readIn, readTable }), { months });
    } finally {
      await client.close().catch(() => {});
    }
    const rows = ruleRows(plan, ev);
    const out = join(o.dir, set.id, '_check');
    mkdirSync(out, { recursive: true });
    const file = join(out, 'evidence.json');
    writeFileSync(file, `${JSON.stringify({ months, dropped: plan.dropped, rows }, null, 1)}\n`);
    const counts = { ok: 0, check: 0, mismatch: 0 };
    for (const r of rows) counts[r.rule] += 1;
    return { file, steps: rows.length, targets: Object.keys(ev).length, dropped: plan.dropped.length, rule: counts };
  },
  /** The scenario check, result: the judge's answer on the reads; lastCheck on the set; proposals as a patch file. */
  'check-save'(o) {
    const set = load(o);
    if (!o.judge) throw new Error('--judge <answer.json> is required');
    const evidence = JSON.parse(readFileSync(join(o.dir, set.id, '_check', 'evidence.json'), 'utf8'));
    const rows = mergeJudge(evidence.rows, jsonOf(readFileSync(o.judge, 'utf8')) ?? {});
    const next = applyCheck(set, rows, { system: o.system && o.system !== true ? String(o.system) : '', months: evidence.months, models: { plan: 'cli', judge: 'cli' } });
    const file = save(o.dir, next);
    const proposals = rows.flatMap((r) => r.proposals);
    let patch = null;
    if (proposals.length) {
      mkdirSync(join(o.dir, '_patch'), { recursive: true });
      patch = join(o.dir, '_patch', `${set.id}-check.json`);
      writeFileSync(patch, `${JSON.stringify(proposals, null, 1)}\n`);
    }
    return { file, ...outputs(o, next), counts: next.lastCheck.counts, proposals: proposals.length, patch };
  },
};

const USAGE = 'usage: build-uat.mjs init|check|patch|export|show|page|import|defects|check-sap|check-save — see the header of this file';

if (process.argv[1] && /build-uat\.mjs$/.test(process.argv[1])) {
  try {
    const o = args(process.argv.slice(2));
    const run = commands[o._[0]];
    if (!run || o.help) process.stdout.write(`${USAGE}\n`);
    else {
      // check-sap reads SAP and is async; every other command is plain.
      Promise.resolve(run(o))
        .then((r) => process.stdout.write(`${JSON.stringify({ ok: true, ...r })}\n`))
        .catch((e) => {
          process.stdout.write(`${JSON.stringify({ ok: false, error: String(e?.message ?? e) })}\n`);
          process.exitCode = 1;
        });
    }
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: String(e?.message ?? e) })}\n`);
    process.exit(1);
  }
}
