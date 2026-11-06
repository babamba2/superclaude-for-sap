// sc4sap:cbo-relation-map — build the relation map page from analyze-cbo-obj's graph.json.
//
//   node build-relation-map.mjs --dir <inventory dir> [--dir <dir2> …] [--lang ko|en] [--out <file.html>]
//                               [--snippets [--src <MCP output src dir>]] [--includes keep] [--hubs 40] [--groups 60]
//   node build-relation-map.mjs --graph <graph.json> [--graph …] --out <file.html>   (no side files)
//
// Per --dir it reads graph.json and, when present: walk.json / inventory.json (descriptions), usage-result.json
// (used / unused), ddic-reads.json (standard check tables, shown as text only). Several --dir → one merged map
// (scripts/process/merge-graphs.mjs); default output then <module dir>/_relmap/<A+B+…>-relation-map-<lang>.html,
// else <dir>/<PACKAGE>-relation-map-<lang>.html. --snippets embeds ±10 source lines per source relation, read
// from the local MCP output (default <artifactBase>/mcp-output/src) — never from SAP.
//
// Prints one JSON line: { page, bytes, nodes, edges, members, custom, groups, isolated, droppedEdges,
// foldedIncludes, byBasis, usage, stdChecks, snippets, sourcesParsed, packages }.
// Exit 2 = graph.json missing or no customer object. Never calls SAP.

import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildModel } from './relmap-model.mjs';
import { renderPage } from './relmap-page.mjs';
import { isCustomName } from '../graph/ddic-edges.mjs';
import { mergeGraphs } from '../process/merge-graphs.mjs';

const readJson = (p) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };
const SNIPPET_BYTES = 6_000_000;

/** descriptions, usage and standard check tables from the side files of one inventory folder */
export function readSideInfo(dir, info = { desc: new Map(), usage: new Map(), std: new Map() }) {
  const walk = readJson(join(dir, 'walk.json')), inv = readJson(join(dir, 'inventory.json'));
  for (const o of inv?.objects || []) {
    const id = `${String(o.type).split('/')[0]}:${o.name}`;
    const d = String(o.description || '').split(' | ')[0].trim() || String(o.purpose || '').split('. ')[0].trim();
    if (d && !info.desc.has(id)) info.desc.set(id, d);
  }
  for (const o of walk?.objects || []) {
    const id = `${String(o.type).split('/')[0]}:${o.name}`;
    if (o.description) info.desc.set(id, String(o.description).trim());
  }
  for (const o of readJson(join(dir, 'usage-result.json'))?.objects || []) if (o.id && o.status) info.usage.set(o.id, o.status);
  const reads = readJson(join(dir, 'ddic-reads.json'));
  for (const r of (Array.isArray(reads) ? reads : reads?.reads) || []) {
    if (r.table !== 'DD08L' || !r.path) continue;
    for (const row of readJson(r.path)?.rows || []) {
      const t = String(row.TABNAME || ''), c = String(row.CHECKTABLE || '').trim();
      if (!t || !c || c === '*' || isCustomName(c)) continue;
      const list = info.std.get(t) || [];
      const s = `${row.FIELDNAME}→${c}`;
      if (!list.includes(s)) list.push(s);
      info.std.set(t, list);
    }
  }
  return info;
}

/** (unit, line) → { start, text } from the MCP output source folder; ±10 lines; stops at SNIPPET_BYTES */
export function snippetReader(srcDir, { around = 10, budget = SNIPPET_BYTES } = {}) {
  const files = new Map();
  const walkDir = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walkDir(p);
      else if (f.endsWith('.abap')) { const k = f.split('.')[0]; if (!files.has(k)) files.set(k, p); }
    }
  };
  if (srcDir && existsSync(srcDir)) walkDir(srcDir);
  const cache = new Map();
  let used = 0;
  return (unit, line) => {
    if (used >= budget) return null;
    const p = files.get(String(unit).toLowerCase().replace(/\//g, '#'));
    if (!p) return null;
    if (!cache.has(p)) cache.set(p, readFileSync(p, 'utf8').replace(/\r/g, '').split('\n'));
    const lines = cache.get(p);
    if (line < 1 || line > lines.length) return null;
    const start = Math.max(1, line - around);
    const text = lines.slice(start - 1, Math.min(lines.length, line + around)).join('\n');
    used += text.length;
    return { start, text };
  };
}

export function buildRelationMap({ graphs, dirs = [], out, lang = 'ko', hubs = 40, groups = 60, fold = true, snippets = false, src }) {
  const gs = graphs.map((g) => (typeof g === 'string' ? JSON.parse(readFileSync(g, 'utf8')) : g));
  let graph = gs[0];
  if (gs.length > 1) {
    // the same package twice (its whole-package DDIC graph + its used-TCode code graph) is one package:
    // merge under a temporary name, then fold the name back
    const seen = new Map();
    const named = gs.map((g) => {
      const p = String(g.package || 'PACKAGE').toUpperCase(), n = (seen.get(p) || 0) + 1;
      seen.set(p, n);
      return n === 1 ? g : { ...g, package: `${p}~${n}` };
    });
    graph = mergeGraphs(named, { module: gs[0].module, system: gs[0].system });
    const base = (p) => String(p).replace(/~\d+$/, '');
    for (const n of graph.nodes) if (n.packages) n.packages = [...new Set(n.packages.map(base))];
    graph.packages = [...seen.keys()];
    graph.package = graph.packages.join(' + ');
    graph.sapVersion = gs[0].sapVersion;
    graph.builtAt = gs.map((g) => g.builtAt).sort()[0];
  }
  const info = { desc: new Map(), usage: new Map(), std: new Map() };
  for (const d of dirs) readSideInfo(d, info);
  const reader = snippets ? snippetReader(src) : null;
  const model = buildModel(graph, { hubs, groups, fold, info, snippets: reader });
  const html = renderPage(model, { lang });
  if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, html, 'utf8'); }
  const s = model.stats;
  return {
    page: out || null, bytes: Buffer.byteLength(html), nodes: s.nodes, edges: s.edges, members: s.members, custom: s.custom,
    groups: s.groups, isolated: s.isolated, droppedEdges: s.droppedEdges, foldedIncludes: s.foldedIncludes, byBasis: s.byBasis,
    usage: model.meta.hasUsage ? s.usage : null, stdChecks: s.stdChecks, snippets: snippets ? s.snippets : null,
    sourcesParsed: model.meta.sourcesParsed, packages: model.meta.packages,
    html: out ? undefined : html,
  };
}

function args(argv) {
  const a = { lang: 'ko', hubs: 40, groups: 60, dirs: [], graphs: [], fold: true, snippets: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === '--graph') a.graphs.push(resolve(v()));
    else if (k === '--dir') a.dirs.push(resolve(v()));
    else if (k === '--out') a.out = resolve(v());
    else if (k === '--lang') a.lang = v();
    else if (k === '--hubs') a.hubs = Number(v());
    else if (k === '--groups') a.groups = Number(v());
    else if (k === '--includes') { const x = v(); if (x !== 'keep' && x !== 'fold') throw new Error('--includes keep|fold'); a.fold = x === 'fold'; }
    else if (k === '--snippets') a.snippets = true;
    else if (k === '--src') a.src = resolve(v());
    else throw new Error(`unknown option ${k}`);
  }
  if (!['ko', 'en'].includes(a.lang)) throw new Error('--lang must be ko or en');
  for (const d of a.dirs) a.graphs.push(join(d, 'graph.json'));
  if (!a.graphs.length) throw new Error('usage: build-relation-map.mjs --dir <inventory dir> [--dir …] | --graph <graph.json> [--out file] [--lang ko|en]');
  return a;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const a = args(process.argv.slice(2));
    const missing = a.graphs.filter((g) => !existsSync(g));
    if (missing.length) { console.error(`graph.json not found: ${missing.join(', ')} — run /sc4sap:analyze-cbo-obj on the package first`); process.exit(2); }
    const graphs = a.graphs.map((g) => JSON.parse(readFileSync(g, 'utf8')));
    const first = a.dirs[0] || dirname(a.graphs[0]);
    if (!a.out) {
      a.out = graphs.length > 1
        ? join(dirname(first), '_relmap', `${[...new Set(graphs.map((g) => String(g.package || 'package').toUpperCase()))].join('+')}-relation-map-${a.lang}.html`)
        : join(first, `${graphs[0].package || 'package'}-relation-map-${a.lang}.html`);
    }
    // <artifactBase>/cbo/<MODULE>/<PACKAGE> → <artifactBase>/mcp-output/src
    if (a.snippets && !a.src) a.src = join(first, '..', '..', '..', 'mcp-output', 'src');
    const r = buildRelationMap({ ...a, graphs });
    if (!r.nodes) { console.error('graph.json has no customer (Z/Y/namespace) object'); process.exit(2); }
    console.log(JSON.stringify(r));
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

