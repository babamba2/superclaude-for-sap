// sc4sap:module-to-process — one module graph from the graph.json of several packages.
//
//   node merge-graphs.mjs --graph <pkgA/graph.json> --graph <pkgB/graph.json> --module MM --out module-graph.json
//
// Each package graph (scripts/graph/extract-edges.mjs) only parses its own members, so an
// object of package B appears in package A's graph as a `custom` leaf. Merging:
//   · nodes by id; a node that is a member of any package becomes `member`, `packages[]`
//     lists every package that owns it (normally one)
//   · edges by (from, kind, to); the same edge seen twice keeps the higher count and up to
//     5 evidence lines; `crossPackage: true` when both ends are members of different packages
//   · unresolved[] concatenated; coverage kept per package
// Deterministic, no SAP call.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arr = (v) => (Array.isArray(v) ? v : []);
const SCOPE_RANK = { member: 3, custom: 2, standard: 1, dynamic: 0 };

export function mergeGraphs(graphs, { module = '', system = '', builtAt = new Date().toISOString() } = {}) {
  if (!graphs.length) throw new Error('mergeGraphs: no graph given');
  const nodes = new Map();
  const edges = new Map();
  const unresolved = [];
  const coverage = {};
  const packages = [];
  for (const g of graphs) {
    const pkg = String(g.package || `#${packages.length + 1}`).toUpperCase();
    if (packages.includes(pkg)) throw new Error(`mergeGraphs: package ${pkg} given twice`);
    packages.push(pkg);
    coverage[pkg] = g.coverage || {};
    for (const n of arr(g.nodes)) {
      const prev = nodes.get(n.id);
      const own = n.scope === 'member' ? [pkg] : [];
      if (!prev) { nodes.set(n.id, { ...n, packages: own }); continue; }
      const pick = (SCOPE_RANK[n.scope] ?? 0) > (SCOPE_RANK[prev.scope] ?? 0) ? { ...prev, ...n } : { ...n, ...prev };
      pick.scope = (SCOPE_RANK[n.scope] ?? 0) > (SCOPE_RANK[prev.scope] ?? 0) ? n.scope : prev.scope;
      pick.packages = [...new Set([...arr(prev.packages), ...own])];
      if (prev.unreferenced && !n.unreferenced) delete pick.unreferenced;
      nodes.set(n.id, pick);
    }
    for (const e of arr(g.edges)) {
      const key = `${e.from}|${e.kind}|${e.to}`;
      const prev = edges.get(key);
      if (!prev) { edges.set(key, { ...e, evidence: arr(e.evidence).slice(0, 5) }); continue; }
      const seen = new Set(prev.evidence.map(x => `${x.unit}:${x.line}`));
      const more = arr(e.evidence).filter(x => !seen.has(`${x.unit}:${x.line}`));
      edges.set(key, { ...prev, ...e, count: Math.max(prev.count || 0, e.count || 0), evidence: [...prev.evidence, ...more].slice(0, 5) });
    }
    for (const u of arr(g.unresolved)) unresolved.push({ ...u, package: pkg });
  }
  for (const e of edges.values()) {
    const a = nodes.get(e.from), b = nodes.get(e.to);
    const pa = arr(a?.packages), pb = arr(b?.packages);
    if (pa.length && pb.length && !pa.some(p => pb.includes(p))) e.crossPackage = true;
    else delete e.crossPackage;
  }
  const first = graphs[0];
  return {
    module: module || first.module || '',
    packages,
    system: system || first.system || '',
    sapVersion: first.sapVersion || '',
    builtAt,
    extractor: first.extractor || '',
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    unresolved,
    coverage,
  };
}

/** Edges between members of different packages, for the overview's "package hand-offs". */
export const crossPackageEdges = (g) => arr(g.edges).filter(e => e.crossPackage);

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const files = [];
  let out = '', module = '', system = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--graph') files.push(args[++i]);
    else if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--module') module = args[++i];
    else if (args[i] === '--system') system = args[++i];
  }
  if (!files.length || !out) {
    console.error('Usage: node merge-graphs.mjs --graph <graph.json> [--graph …] --out <module-graph.json> [--module MM] [--system DEV]');
    process.exit(2);
  }
  try {
    const missing = files.filter(f => !existsSync(f));
    if (missing.length) throw new Error(`graph not found: ${missing.join(', ')}`);
    const merged = mergeGraphs(files.map(f => JSON.parse(readFileSync(f, 'utf8'))), { module, system });
    writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({
      out: resolve(out), packages: merged.packages,
      nodes: merged.nodes.length, members: merged.nodes.filter(n => n.scope === 'member').length,
      edges: merged.edges.length, crossPackage: crossPackageEdges(merged).length, unresolved: merged.unresolved.length,
    }, null, 2));
  } catch (e) {
    console.error(`merge-graphs: ${e.message}`);
    process.exit(1);
  }
}
