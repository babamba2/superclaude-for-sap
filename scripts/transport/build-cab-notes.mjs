#!/usr/bin/env node
// sc4sap:transport-readiness (cab mode) — change notes for the change advisory board. Offline: no SAP call.
//
//   node scripts/transport/build-cab-notes.mjs prepare --in <dir>/collect.json --out-dir <dir>
//        [--graph-base <dir>]… [--graph-dir <inventory dir>]… [--packages "<list>"] [--evidence <file>]… [--uat <set file>]…
//        [--uat-base <dir>/uat] [--cab-date YYYY-MM-DD]
//   node scripts/transport/build-cab-notes.mjs save --in <dir>/cab-input.json --file <writer answer .txt>
//   node scripts/transport/build-cab-notes.mjs build --in <dir>/cab-input.json --out-dir <dir> [--lang ko|en] [--cab-date YYYY-MM-DD]
//   node scripts/transport/build-cab-notes.mjs import <edited.html> --out-dir <dir>
//
// prepare — collect.json (build-tr-check.mjs collect [--cab]) + the CBO graphs of the requests' packages
//   (relmap-find findGraphs under --graph-base, or --graph-dir; --packages takes `*` or `%`, e.g. ZSD%) + evidence
//   files (project dashboard page / model, UAT page / set; the sets a dashboard lists in project.uatSets are read
//   from --uat-base — no other set is ever scanned) → cab-input.json (cab-model.mjs) and writer batches cab-writer-<n>.json (10 requests each).
// save — the writer's answer (`@@ <request>` + 2–3 sentences): each text is linted against its input
//   (cab-evidence.mjs lintNote); refused texts are not saved; a text a person edited is never overwritten.
// build — cab-notes-<date>-<lang>.html (cab-page.mjs), .md summary, model.json.
// import — a page saved from edit mode: its edits go into cab-input.json and the page is built again.
// Every command prints one JSON line.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCabModel, indexGraph } from './cab-model.mjs';
import { UAT_ID, evidenceFor, lintNote, parseEvidence, parseWriter, uatSetsOf } from './cab-evidence.mjs';
import { applyEdits, fromPage, renderHtml, renderSummary } from './cab-page.mjs';
import { findGraphs, packagesOf } from '../relmap/relmap-find.mjs';
import { applyTexts, readSideInfo } from '../relmap/build-relation-map.mjs';

const BATCH = 10;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const REPEAT = new Set(['graph-base', 'graph-dir', 'evidence', 'uat']);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) { out._.push(argv[i]); continue; }
    const k = argv[i].slice(2);
    const v = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[(i += 1)];
    if (REPEAT.has(k)) (out[k] ||= []).push(v); else out[k] = v;
  }
  return out;
}

/** The graphs for the requests: explicit inventory dirs, else findGraphs over the bases by the TADIR packages. */
export function loadGraphs({ bases = [], dirs = [], packages = '' }) {
  let found = { dirs: [], missing: [], ambiguous: [] };
  if (bases.length && packages) {
    const r = findGraphs({ bases, packages });
    if (r.ok) found = r;
  }
  const all = [...new Set([...dirs, ...found.dirs])];
  const graphs = [];
  for (const d of all) {
    const f = join(d, 'graph.json');
    if (!existsSync(f)) continue;
    const g = readJson(f);
    const info = applyTexts(readSideInfo(d));
    graphs.push({ dir: d, G: indexGraph(g, packagesOf(d, g)), info });
  }
  return { graphs, missing: found.missing, ambiguous: found.ambiguous };
}

function prepare(o) {
  if (!o.in || !o['out-dir']) throw new Error('--in and --out-dir are required');
  const c = readJson(o.in);
  const pkgs = o.packages && o.packages !== true ? String(o.packages)
    : [...new Set((c.tadir?.rows || []).map((t) => t.package).filter((p) => p && !String(p).startsWith('$')))].join(',');
  const { graphs, missing, ambiguous } = loadGraphs({ bases: o['graph-base'] || [], dirs: o['graph-dir'] || [], packages: pkgs });
  // Evidence only from what is named: --evidence / --uat files, and the UAT sets a given dashboard lists
  // (project.uatSets, read under --uat-base). Never a scan of every set (another project's results would mix in).
  const sources = [];
  const evidenceFiles = [];
  const uatMissing = [];
  const uatUnread = [];
  for (const f of [...(o.evidence || []), ...(o.uat || [])]) {
    const s = parseEvidence(readFileSync(f, 'utf8'));
    evidenceFiles.push({ file: f, kind: s?.kind || 'unknown', ...(s?.kind === 'uat' ? { set: s.set?.id || '' } : {}) });
    if (s) sources.push(s);
  }
  const have = new Set(sources.filter((s) => s.kind === 'uat').map((s) => s.set?.id));
  for (const id of sources.filter((s) => s.kind === 'project').flatMap((s) => uatSetsOf(s.model))) {
    if (have.has(id)) continue;
    if (!UAT_ID.test(id)) { uatUnread.push({ id: id.slice(0, 60), reason: 'invalid-id' }); continue; }
    const f = o['uat-base'] && o['uat-base'] !== true ? join(o['uat-base'], id, `${id}-uat.json`) : '';
    const s = f && existsSync(f) ? parseEvidence(readFileSync(f, 'utf8')) : null;
    if (s?.kind !== 'uat') { uatMissing.push(id); uatUnread.push({ id, reason: 'missing' }); continue; }
    have.add(id);
    sources.push(s);
    evidenceFiles.push({ file: f, kind: 'uat', set: id, from: 'project.uatSets' });
  }
  const cabDate = DATE.test(String(o['cab-date'])) ? o['cab-date'] : '';
  const m = buildCabModel(c, { graphs, evidenceOf: (r) => evidenceFor(r, sources), cabDate });
  m.graphs = graphs.map((g) => ({ dir: g.dir, packages: [...g.G.packages] }));
  m.graphsMissing = missing;
  m.graphsAmbiguous = ambiguous;
  m.evidenceFiles = evidenceFiles;
  m.uatUnread = uatUnread;
  mkdirSync(o['out-dir'], { recursive: true });
  const file = join(o['out-dir'], 'cab-input.json');
  writeFileSync(file, JSON.stringify(m, null, 1));
  const batches = [];
  for (let i = 0; i < m.requests.length; i += BATCH) {
    const b = join(o['out-dir'], `cab-writer-${batches.length + 1}.json`);
    writeFileSync(b, JSON.stringify(m.requests.slice(i, i + BATCH).map((r) => r.writer), null, 1));
    batches.push(b);
  }
  return { file, batches, requests: m.requests.length, summary: m.summary, graphs: m.graphs.length, graphsMissing: missing,
    impact: Object.fromEntries(m.requests.map((r) => [r.trkorr, r.impact.status])), jobsRead: !!c.jobs?.ok, evidence: evidenceFiles, uatSetsMissing: uatMissing, uatSetsInvalid: uatUnread.filter((x) => x.reason === 'invalid-id').map((x) => x.id) };
}

function save(o) {
  if (!o.in || !o.file) throw new Error('--in and --file are required');
  const m = readJson(o.in);
  const texts = parseWriter(readFileSync(o.file, 'utf8'));
  const saved = [], refused = [], unknown = [], kept = [];
  for (const [trkorr, text] of texts) {
    const r = m.requests.find((x) => x.trkorr === trkorr);
    if (!r) { unknown.push(trkorr); continue; }
    if (r.note?.source === 'human') { kept.push(trkorr); continue; }
    const lint = lintNote(text, r.writer);
    if (!lint.ok) { refused.push({ trkorr, problems: lint.problems }); continue; }
    r.note = { text, source: 'ai' };
    saved.push(trkorr);
  }
  writeFileSync(o.in, JSON.stringify(m, null, 1));
  const missing = m.requests.filter((r) => !r.note?.text).map((r) => r.trkorr);
  return { file: o.in, saved: saved.length, refused, unknown, keptHuman: kept, withoutText: missing };
}

function write(m, outDir, lang) {
  mkdirSync(outDir, { recursive: true });
  const date = m.cabDate || new Date().toISOString().slice(0, 10);
  const base = join(outDir, `cab-notes-${date}-${lang}`);
  writeFileSync(`${base}.html`, renderHtml(m, lang));
  const text = renderSummary(m, lang);
  writeFileSync(`${base}.md`, `${text}\n`);
  writeFileSync(join(outDir, 'model.json'), JSON.stringify(m, null, 1));
  return { html: `${base}.html`, md: `${base}.md`, summary: m.summary, text };
}

function build(o) {
  if (!o.in || !o['out-dir']) throw new Error('--in and --out-dir are required');
  const lang = ['ko', 'en'].includes(o.lang) ? o.lang : 'en';
  const m = readJson(o.in);
  if (DATE.test(String(o['cab-date']))) m.cabDate = o['cab-date'];
  return write(m, o['out-dir'], lang);
}

function importPage(o) {
  const html = o._[1];
  if (!html || !o['out-dir']) throw new Error('usage: import <edited.html> --out-dir <dir>');
  const text = readFileSync(html, 'utf8');
  const got = fromPage(text);
  if (!got) throw new Error(`${html} has no CAB notes model — was it saved from the page's Save button?`);
  const m = applyEdits(got.model, got.edits);
  const lang = /<html lang="ko"/.test(text) ? 'ko' : 'en';
  mkdirSync(o['out-dir'], { recursive: true });
  const file = join(o['out-dir'], 'cab-input.json');
  writeFileSync(file, JSON.stringify(m, null, 1));
  return { file, ...write(m, o['out-dir'], lang), edited: m.requests.filter((r) => r.note.source === 'human').length, decided: m.requests.filter((r) => r.decision).length };
}

const USAGE = 'usage: build-cab-notes.mjs prepare|save|build|import — see the header of this file';
const COMMANDS = { prepare, save, build, import: importPage };

if (process.argv[1] && /build-cab-notes\.mjs$/.test(process.argv[1])) {
  try {
    const o = args(process.argv.slice(2));
    const run = COMMANDS[o._[0]];
    if (!run || o.help) process.stdout.write(`${USAGE}\n`);
    else process.stdout.write(`${JSON.stringify({ ok: true, ...run(o) })}\n`);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ ok: false, error: String(e?.message ?? e) })}\n`);
    process.exit(1);
  }
}

export { args as parseArgs, prepare, save, build, importPage };
