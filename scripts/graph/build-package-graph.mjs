// sc4sap:graph — one call for the stocker flow's Step G: graph.json (+ usage) for one package.
//
//   node build-package-graph.mjs --dir <inventory dir> --src <MCP output src dir> [--system S] [--sap-version ECC|S4]
//
// <inventory dir> holds walk.json (required) and, when collected, tcodes.json (GetTransaction result),
// ddic.json ({ fields: DD03L rows, dtels: DD04L rows }) or ddic-facts.md (Step G3 checker FACT lines),
// and usage.json ({ tcodes, jobs }).
// <MCP output src dir> is where GetProgFullCode output:"file" saved the sources (<name>.prog/, <name>.fugr/).
// Only folders of PROG / FUGR members are read — other programs in the shared output dir are ignored.
// Writes graph.json, and usage-result.json + usage.md when usage.json exists. Prints a JSON summary.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDdicFacts } from './ddic-edges.mjs';
import { discoverUnits, extractGraph } from './extract-edges.mjs';
import { loadGraph, toMarkdown, usage } from './graph-query.mjs';

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null);

export function buildPackageGraph({ dir, src, system, sapVersion, builtAt }) {
  const walk = readJson(join(dir, 'walk.json'));
  if (!walk) throw new Error(`walk.json not found in ${dir}`);
  const units = [];
  const missing = [];
  for (const o of walk.objects || []) {
    const type = String(o.type || '').split('/')[0].toUpperCase();
    if (type !== 'PROG' && type !== 'FUGR') continue;
    const folder = join(src, `${String(o.name).toLowerCase()}.${type.toLowerCase()}`);
    if (existsSync(folder)) units.push(...discoverUnits(folder));
    else missing.push(`${type}:${String(o.name).toUpperCase()}`);
  }
  const graph = extractGraph(units, {
    members: walk,
    package: walk.package,
    module: walk.module,
    system,
    sapVersion,
    tcodes: readJson(join(dir, 'tcodes.json')),
    ddic: readJson(join(dir, 'ddic.json')) ?? (existsSync(join(dir, 'ddic-facts.md')) ? parseDdicFacts(readFileSync(join(dir, 'ddic-facts.md'), 'utf8')) : null),
    builtAt,
  });
  writeFileSync(join(dir, 'graph.json'), `${JSON.stringify(graph, null, 1)}\n`);
  const summary = { graph: join(dir, 'graph.json'), nodes: graph.nodes.length, edges: graph.edges.length, unresolved: graph.unresolved.length, sourcesMissing: missing };
  const usageIn = readJson(join(dir, 'usage.json'));
  if (usageIn) {
    const res = usage(loadGraph(graph), usageIn);
    writeFileSync(join(dir, 'usage-result.json'), `${JSON.stringify(res, null, 1)}\n`);
    writeFileSync(join(dir, 'usage.md'), `${toMarkdown('usage', res)}\n`);
    summary.usage = res.counts;
  }
  return summary;
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
  }
  if (!a.dir || !a.src) throw new Error('usage: build-package-graph.mjs --dir <inventory dir> --src <MCP output src dir> [--system S] [--sap-version ECC|S4]');
  return a;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    process.stdout.write(`${JSON.stringify(buildPackageGraph(parseArgs(process.argv.slice(2))))}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
