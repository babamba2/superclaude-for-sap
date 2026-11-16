// sc4sap:cbo-relation-map — find the graphs of some packages (offline, read-only).
//
//   node build-relation-map.mjs find --base <dir> [--base <dir2> …] --packages "ZMM*, ZSD_CBO"
//   (`%` works like `*`: ZMM% = ZMM*, for command lines that refuse `*`)
//
// Walks every base (depth ≤ 4) for graph.json — the plugin layout <artifactBase>/cbo/<MODULE>/<PACKAGE>[.used]
// and the web's knowledge base <kb>/cbo/<MODULE>/<PACKAGE> both fit. Folders named _prev-* (kept old graphs)
// and node_modules are skipped.
//
// Scope "used" (a used-TCode graph) when the folder name or the graph's package ends in .used / _USED, starts
// with _USED_, or holds a "+"; else "package". Package names: graph.json packages / package, then
// scope.json / walk.json beside it, then the folder name (_USED_<PKG> → PKG, A+B → A, B). A module-wide
// used graph (package "_USED", no list) has no package names and matches nothing.
//
// Prints one JSON line: { ok, graphs: [{ package, packages, module, scope, dir, builtAt, sapVersion, nodes, edges,
// parsed, kinds, hasFields, notes }], missing: [pattern], ambiguous: [{ package, scope, modules, dirs }], dirs }.
// `dirs` is the --dir list for the build: per matched package its whole-package graph and its used graph;
// an ambiguous package adds nothing. Never writes, never calls SAP.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const DDIC_RELATIONS = ['checks', 'searchHelp', 'rowType', 'basedOn', 'valueTable'];
const DAY = 86_400_000;
const readJson = (p) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };

const isUsedName = (s) => /(\.used|_USED)$/i.test(s) || /^_USED_/i.test(s) || s.includes('+');
const cleanPkg = (s) => String(s || '').trim().toUpperCase();
const realPkg = (s) => !!s && !/^_USED/i.test(s) && !/^_ALL$/i.test(s) && !s.startsWith('$');

/** package names a graph folder stands for */
export function packagesOf(dir, g) {
  const fromGraph = (g?.packages?.length ? g.packages : [g?.package]).map(cleanPkg).filter(realPkg);
  if (fromGraph.length) return [...new Set(fromGraph.flatMap((p) => p.split('+')).map(cleanPkg).filter(realPkg))];
  const scope = readJson(join(dir, 'scope.json'));
  const fromScope = (scope?.packages || []).map(cleanPkg).filter(realPkg);
  if (fromScope.length) return [...new Set(fromScope)];
  const walk = readJson(join(dir, 'walk.json'));
  if (realPkg(cleanPkg(walk?.package))) return [cleanPkg(walk.package)];
  const f = basename(dir).replace(/\.used$/i, '').replace(/^_USED_/i, '').replace(/_USED$/i, '');
  return [...new Set(f.split('+').map(cleanPkg).filter(realPkg))];
}

/** "ZMM*, ZSD_CBO" → [{ text, re }] */
export function packagePatterns(text) {
  return String(text || '').split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean).map((p) => ({
    text: p,
    // `*` or `%` (SQL style, for command lines that refuse `*`) = any characters
    re: new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*')}$`),
  }));
}

function graphFiles(base, depth = 4, out = []) {
  let names;
  try { names = readdirSync(base); } catch { return out; }
  if (names.includes('graph.json')) out.push(join(base, 'graph.json'));
  if (depth <= 0) return out;
  for (const n of names) {
    if (n === 'node_modules' || /^_prev/i.test(n) || n.startsWith('.')) continue;
    const p = join(base, n);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) graphFiles(p, depth - 1, out);
  }
  return out;
}

/** one graph folder → its summary line */
export function describeGraph(file, now = Date.now()) {
  const dir = dirname(file), g = readJson(file);
  if (!g || !Array.isArray(g.nodes)) return null;
  const kinds = {};
  for (const e of g.edges || []) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  const parsed = g.coverage?.parsed ?? 0, hasFields = existsSync(join(dir, 'fields.json'));
  const scope = isUsedName(basename(dir)) || isUsedName(String(g.package || '')) ? 'used' : 'package';
  const notes = [];
  if (!parsed) notes.push('DDIC relations only — no code relations, no CRUD or Fields tab');
  else if (!hasFields) notes.push('no fields.json — no Fields tab');
  if (!DDIC_RELATIONS.some((k) => kinds[k])) notes.push('typing only — the graph predates the DDIC relation reads');
  const built = Date.parse(g.builtAt || '');
  if (Number.isFinite(built) && now - built > 30 * DAY) notes.push(`built ${String(g.builtAt).slice(0, 10)} — older than 30 days`);
  const packages = packagesOf(dir, g);
  // a module-wide used graph (_USED, <MODULE>_USED, _ALL): its folder does not name its packages
  const named = basename(dir).replace(/\.used$/i, '').replace(/^_USED_/i, '').toUpperCase().split('+');
  const moduleWide = scope === 'used' && !named.every((p) => packages.includes(p));
  return {
    package: (packages.length <= 3 ? packages.join('+') : `${basename(dir)} (${packages.length} packages)`) || cleanPkg(g.package) || basename(dir), packages,
    module: cleanPkg(g.module) || basename(dirname(dir)), scope, dir,
    builtAt: g.builtAt || null, sapVersion: g.sapVersion || null,
    nodes: g.nodes.length, edges: (g.edges || []).length, parsed, kinds, hasFields, moduleWide, notes,
  };
}

export function findGraphs({ bases = [], packages = '', now = Date.now() }) {
  const pats = packagePatterns(packages);
  if (!bases.length || !pats.length) return { ok: false, error: 'usage: build-relation-map.mjs find --base <dir> [--base …] --packages "ZMM*, ZSD_CBO"' };
  const seen = new Set(), all = [];
  for (const b of bases) for (const f of graphFiles(resolve(b))) {
    if (seen.has(f)) continue;
    seen.add(f);
    const d = describeGraph(f, now);
    if (d) all.push(d);
  }
  const matches = (g) => g.packages.some((p) => pats.some((x) => x.re.test(p)));
  const graphs = all.filter(matches);
  const missing = pats.filter((x) => !graphs.some((g) => g.packages.some((p) => x.re.test(p)))).map((x) => x.text);

  // per (package, scope): one folder — the folder named like the package wins (ZPKG over ZPKG-sample),
  // then the graph covering the fewest packages; a tie is ambiguous and leaves only that scope of the package
  // out of `dirs`. A module-wide used graph is a candidate only for a package with no graph of its own (it
  // brings every package of the module into the map).
  const byKey = new Map();
  const add = (g, p) => {
    const k = `${p}|${g.scope}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(g);
  };
  const wanted = (p) => pats.some((x) => x.re.test(p));
  for (const g of graphs) if (!g.moduleWide) for (const p of g.packages) if (wanted(p)) add(g, p);
  const own = new Set([...byKey.keys()].map((k) => k.split('|')[0]));
  for (const g of graphs) if (g.moduleWide) for (const p of g.packages) if (wanted(p) && !own.has(p)) add(g, p);
  const folderPkg = (g) => basename(g.dir).replace(/\.used$/i, '').replace(/^_USED_/i, '').toUpperCase();
  const ambiguous = [], pick = new Set();
  for (const [k, list] of byKey) {
    const [pkg, scope] = k.split('|');
    let chosen = list;
    if (chosen.length > 1) {
      const exact = chosen.filter((g) => folderPkg(g) === pkg);
      if (exact.length) chosen = exact;
    }
    if (chosen.length > 1) {
      const least = Math.min(...chosen.map((g) => g.packages.length));
      chosen = chosen.filter((g) => g.packages.length === least);
    }
    if (chosen.length === 1) pick.add(chosen[0].dir);
    else ambiguous.push({ package: pkg, scope, modules: [...new Set(chosen.map((g) => g.module))], dirs: chosen.map((g) => g.dir) });
  }
  const dirs = graphs.filter((g) => pick.has(g.dir)).map((g) => g.dir);
  return { ok: true, graphs, missing, ambiguous, dirs };
}
