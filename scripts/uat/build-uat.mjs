#!/usr/bin/env node
// sc4sap:uat-scenarios — keep one UAT scenario set as JSON and turn it into what people use.
//
//   node scripts/uat/build-uat.mjs init   --answers <file.json> --dir <dir> [--force]
//   node scripts/uat/build-uat.mjs check  --dir <dir> --id <ID>
//   node scripts/uat/build-uat.mjs patch  --dir <dir> --id <ID> --patch <ops.json>
//   node scripts/uat/build-uat.mjs export --dir <dir> --id <ID> --layout A|B [--out-dir <dir>]
//   node scripts/uat/build-uat.mjs show   --dir <dir> --id <ID>
//
// The set lives in <dir>/<ID>/<ID>-uat.json (model: uat-model.mjs). `patch` applies a proposal — the
// module consultant's, or edits made elsewhere — and reports what it applied and what it skipped.
// `export` writes <ID>-uat-<A|B>.xlsx (uat-xlsx.mjs). Every command prints one JSON line. Offline: no SAP.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyPatch, normalize, progress, validate } from './uat-model.mjs';
import { layoutA, layoutB } from './uat-xlsx.mjs';

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
  return normalize(JSON.parse(readFileSync(f, 'utf8')));
}
function save(dir, set) {
  mkdirSync(join(dir, set.id), { recursive: true });
  writeFileSync(fileOf(dir, set.id), `${JSON.stringify(set, null, 1)}\n`);
  return fileOf(dir, set.id);
}

const commands = {
  init(o) {
    if (!o.answers || !o.dir) throw new Error('--answers and --dir are required');
    const set = normalize(JSON.parse(readFileSync(o.answers, 'utf8')));
    if (!ID.test(set.id)) throw new Error(`id ${set.id}: letters, digits, _ - only, ≤ 30`);
    if (existsSync(fileOf(o.dir, set.id)) && !o.force) throw new Error(`${set.id} exists — use patch, or --force to start over`);
    return { file: save(o.dir, set), issues: validate(set), progress: progress(set) };
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
    return { file: save(o.dir, next), applied: applied.length, skipped, issues: validate(next) };
  },
  export(o) {
    const set = load(o);
    const layout = String(o.layout || 'A').toUpperCase();
    if (!['A', 'B'].includes(layout)) throw new Error('--layout A or B');
    const out = o['out-dir'] || join(o.dir, set.id);
    mkdirSync(out, { recursive: true });
    const file = join(out, `${set.id}-uat-${layout}.xlsx`);
    writeFileSync(file, layout === 'A' ? layoutA(set, progress(set)) : layoutB(set, progress(set)));
    return { file };
  },
  show(o) {
    const set = load(o);
    return { set, issues: validate(set), progress: progress(set) };
  },
};

const USAGE = 'usage: build-uat.mjs init|check|patch|export|show — see the header of this file';

if (process.argv[1] && /build-uat\.mjs$/.test(process.argv[1])) {
  try {
    const o = args(process.argv.slice(2));
    const run = commands[o._[0]];
    if (!run || o.help) process.stdout.write(`${USAGE}\n`);
    else process.stdout.write(`${JSON.stringify({ ok: true, ...run(o) })}\n`);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: String(e?.message ?? e) })}\n`);
    process.exit(1);
  }
}
