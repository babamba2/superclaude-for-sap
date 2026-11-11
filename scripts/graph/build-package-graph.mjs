// sc4sap:graph — one call for the stocker flow's Step G: graph.json (+ usage) for one package.
//
//   node build-package-graph.mjs --dir <inventory dir> --src <MCP output src dir> [--system S] [--sap-version ECC|S4]
//
// <inventory dir> holds walk.json (required) and, when collected, tcodes.json (GetTransaction result),
// ddic-reads.json (Step G3 DD reads: [{ id, table, path, rows, truncated } | { id, table, error }], each path a
// GetSqlQuery output:"file" result), ddic.json (the ddic shape of ddic-edges.mjs), ddic-facts.md (Step G3 checker
// FACT lines, the fallback) — all three are merged,
// and usage.json ({ tcodes, jobs }).
// <MCP output src dir> is where GetProgFullCode output:"file" saved the sources (<name>.prog/, <name>.fugr/).
// Only folders of PROG / FUGR members are read — other programs in the shared output dir are ignored — plus
// <name>.incl.abap (GetInclude output:"file") of PROG/I members no folder holds (user-exit includes; --orphans lists
// the ones still to fetch).
// Writes graph.json, and usage-result.json + usage.md when usage.json exists. Prints a JSON summary.
// With DD03L rows (ddic-reads.json / ddic.json, plus ddic-appends.json + ddic-append-fields.json for the customer
// appends of standard tables) it also writes fields.json — field-level CRUD (extract-fields.mjs). --fields-ddic <dir>
// (repeatable) adds the DD03L reads and the DDIC members of another inventory folder — a used-TCode folder has
// sources but no DD03L of its own, the whole-package folder has the DD03L.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDdicReads, mergeDdic, parseDdicFacts } from './ddic-edges.mjs';
import { discoverUnits, extractGraph } from './extract-edges.mjs';
import { extractFields } from './extract-fields.mjs';
import { loadGraph, toMarkdown, usage } from './graph-query.mjs';

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

export function buildPackageGraph({ dir, src, system, sapVersion, builtAt, fieldsDdic = [] }) {
  const walk = readJson(join(dir, 'walk.json'));
  if (!walk) throw new Error(`walk.json not found in ${dir}`);
  const { units, missing } = loadMemberFolders(walk, src);
  // includes no fetched program pulls in (user-exit includes of SAP programs, leftovers): own unit, fetched in G1b
  const orphans = loadOrphanIncludes(walk, src, units);
  units.push(...orphans.units);
  const reads = loadDdicReads(readJson(join(dir, 'ddic-reads.json')), (p) => JSON.parse(readFileSync(p, 'utf8')));
  const ddic = mergeDdic(
    reads.ddic,
    readJson(join(dir, 'ddic.json')),
    existsSync(join(dir, 'ddic-facts.md')) ? parseDdicFacts(readFileSync(join(dir, 'ddic-facts.md'), 'utf8')) : null,
  );
  const graph = extractGraph(units, {
    members: walk,
    package: walk.package,
    module: walk.module,
    system,
    sapVersion,
    tcodes: readJson(join(dir, 'tcodes.json')),
    ddic,
    builtAt,
  });
  writeFileSync(join(dir, 'graph.json'), `${JSON.stringify(graph, null, 1)}\n`);
  const summary = { graph: join(dir, 'graph.json'), nodes: graph.nodes.length, edges: graph.edges.length, unresolved: graph.unresolved.length, sourcesMissing: missing };
  if (orphans.units.length || orphans.missing.length) summary.orphanIncludes = { read: orphans.units.length, missing: orphans.missing };
  // field map: member tables' DD03L rows + customer appends of standard tables (ddic-queries --only appends / append-fields)
  const loadReads = (d, f) => loadDdicReads(readJson(join(d, f)), (p) => JSON.parse(readFileSync(p, 'utf8'))).ddic?.fields || [];
  const fieldRows = [...(ddic?.fields || [])];
  // --fields-ddic: DD03L of another inventory folder (the whole-package one, for a used-TCode folder without its own)
  for (const d of [dir, ...fieldsDdic]) {
    if (d !== dir) fieldRows.push(...loadReads(d, 'ddic-reads.json'));
    fieldRows.push(...loadReads(d, 'ddic-appends.json'), ...loadReads(d, 'ddic-append-fields.json'));
  }
  let fieldMembers = walk;
  for (const d of fieldsDdic) {
    const w = readJson(join(d, 'walk.json'));
    if (w) fieldMembers = { ...walk, objects: [...(walk.objects || []), ...(w.objects || []).filter((o) => /^(TABL|VIEW|STRU)/i.test(String(o.type)))] };
  }
  if (fieldRows.length) {
    const fx = extractFields(units, { fieldRows, members: fieldMembers, package: walk.package, builtAt: graph.builtAt });
    writeFileSync(join(dir, 'fields.json'), `${JSON.stringify(fx)}\n`);
    summary.fields = { tables: fx.coverage.tables, structures: fx.coverage.structures, refs: fx.coverage.refs, dynamic: fx.coverage.dynamic };
  }
  if (reads.truncated.length || reads.failed.length) summary.ddicReads = { truncated: reads.truncated, failed: reads.failed };
  const usageIn = readJson(join(dir, 'usage.json'));
  if (usageIn) {
    const res = usage(loadGraph(graph), usageIn);
    writeFileSync(join(dir, 'usage-result.json'), `${JSON.stringify(res, null, 1)}\n`);
    writeFileSync(join(dir, 'usage.md'), `${toMarkdown('usage', res)}\n`);
    summary.usage = res.counts;
  }
  return summary;
}

/** units of the PROG / FUGR member folders (GetProgFullCode output:"file"); PROG/I members are includes, not folders */
function loadMemberFolders(walk, src) {
  const units = [];
  const missing = [];
  for (const o of walk.objects || []) {
    if (String(o.type || '').toUpperCase() === 'PROG/I') continue;
    const type = String(o.type || '').split('/')[0].toUpperCase();
    if (type !== 'PROG' && type !== 'FUGR') continue;
    const folder = join(src, `${String(o.name).toLowerCase()}.${type.toLowerCase()}`);
    if (existsSync(folder)) units.push(...discoverUnits(folder));
    else missing.push(`${type}:${String(o.name).toUpperCase()}`);
  }
  return { units, missing };
}

/** file name GetInclude output:"file" writes: lower case, namespace slashes as # */
const includeFile = (src, name) => join(src, `${name.toLowerCase().replace(/\//g, '#')}.incl.abap`);

/**
 * PROG/I members that no fetched PROG / FUGR folder holds. Those with a GetInclude file in <src> become units of their
 * own (object PROG:<name>, the member node); the rest are returned as missing — the G1b fetch list.
 */
export function loadOrphanIncludes(walk, src, units) {
  const seen = new Set(units.map((u) => String(u.unit).toUpperCase()));
  const out = { units: [], missing: [] };
  for (const o of walk.objects || []) {
    if (String(o.type || '').toUpperCase() !== 'PROG/I') continue;
    const name = String(o.name).toUpperCase();
    if (seen.has(name)) continue;
    seen.add(name);
    const file = includeFile(src, name);
    if (existsSync(file)) out.units.push({ file, unit: name, object: `PROG:${name}`, isMain: true });
    else out.missing.push(name);
  }
  return out;
}

/** --orphans: the G1b fetch list, without building anything */
export function listOrphanIncludes({ dir, src }) {
  const walk = readJson(join(dir, 'walk.json'));
  if (!walk) throw new Error(`walk.json not found in ${dir}`);
  const { units: read, missing } = loadOrphanIncludes(walk, src, loadMemberFolders(walk, src).units);
  return { orphans: missing, alreadyRead: read.length };
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--dir') a.dir = resolve(v());
    else if (k === '--src') a.src = resolve(v());
    else if (k === '--system') a.system = v();
    else if (k === '--sap-version') a.sapVersion = v();
    else if (k === '--built-at') a.builtAt = v();
    else if (k === '--fields-ddic') (a.fieldsDdic ||= []).push(resolve(v()));
    else if (k === '--orphans') a.orphans = true;
  }
  if (!a.dir || !a.src) throw new Error('usage: build-package-graph.mjs --dir <inventory dir> --src <MCP output src dir> [--system S] [--sap-version ECC|S4] [--fields-ddic <inventory dir>] [--orphans]');
  return a;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    const args = parseArgs(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(args.orphans ? listOrphanIncludes(args) : buildPackageGraph(args))}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
