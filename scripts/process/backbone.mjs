// sc4sap:module-to-process — standard process backbone + where each CBO entry point fits.
//
//   node backbone.mjs <plugin-root> --modules MM[,SD] --graph module-graph.json --lang ko --out attach.json
//
// configs/<MODULE>/process-backbone.json holds the standard SAP process tree of a module
// (L1 mega process > L2 process chain > L3 process > L4 task) with anchors per L4 task:
// standard TCodes, BAPIs / FMs and tables. Generic SAP content only.
//
// candidates() scores every entry point of the module graph (Z TCodes that launch a
// program, else root member programs) against each L4 task:
//   TCode the program starts (CALL TRANSACTION)   3
//   BAPI / FM it calls                            3
//   table it writes                               2
//   table it reads                                0.5 (at most 2 per task)
// Features of objects the entry reaches (calls / submits / include / starts / uses) count 0.6×.
// The top 3 tasks with score ≥ 2 are proposals for the analyst — it decides, this only ranks.
// Deterministic, no SAP call.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOW_KINDS, loadGraph, reach } from '../graph/graph-query.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const W = { tcode: 3, bapi: 3, write: 2, read: 0.5, readCap: 2, indirect: 0.6, min: 2, top: 3 };

export const labelOf = (label, lang = 'en') => (typeof label === 'string' ? label : label?.[lang] || label?.en || '');

/** Loads configs/<M>/process-backbone.json for each module that has one. */
export function loadBackbone(pluginRoot, modules) {
  const trees = [];
  const missing = [];
  for (const m of modules) {
    const p = join(pluginRoot, 'configs', String(m).toUpperCase(), 'process-backbone.json');
    if (existsSync(p)) trees.push(JSON.parse(readFileSync(p, 'utf8')));
    else missing.push(String(m).toUpperCase());
  }
  return { trees, missing };
}

/** Flat list of every node with its level (1–4) and the labels of its parents. */
export function flattenBackbone(trees, lang = 'en') {
  const out = [];
  const walk = (node, level, path, module) => {
    const label = labelOf(node.label, lang);
    out.push({ id: node.id, level, module, label, path: [...path, label], tcodes: arr(node.tcodes), bapis: arr(node.bapis),
      tables: arr(node.tables), modules: arr(node.modules), s4: node.s4 || '' });
    for (const c of arr(node.children)) walk(c, level + 1, [...path, label], module);
  };
  for (const t of arr(trees)) for (const n of arr(t.tree)) walk(n, 1, [], t.module);
  return out;
}

const nameOf = (id) => String(id).split(':').slice(1).join(':');
const typeOf = (id) => String(id).split(':')[0];

function outEdges(G, id) {
  const own = G.out.get(id) || [];
  const parent = G.nodes.get(id)?.parent;
  return parent && G.nodes.get(id)?.type === 'FUNC' ? [...own, ...(G.out.get(parent) || [])] : own;
}

/** Entry points: Z TCodes that launch a program, else member programs nobody calls. */
export function entryPoints(G) {
  const trans = [...G.nodes.values()].filter(n => n.type === 'TRAN' && (G.out.get(n.id) || []).some(e => e.kind === 'launches'));
  const launched = new Set(trans.flatMap(t => (G.out.get(t.id) || []).filter(e => e.kind === 'launches').map(e => e.to)));
  const roots = [...G.nodes.values()]
    .filter(n => n.scope === 'member' && n.type === 'PROG' && !launched.has(n.id))
    .filter(n => !(G.inc.get(n.id) || []).some(e => FLOW_KINDS.includes(e.kind)));
  return [...trans, ...roots].map(n => n.id).sort();
}

/** TCodes, FMs, written and read tables of an entry and of what it reaches (weight per item). */
export function featuresOf(G, id) {
  const r = reach(G, id, { kinds: [...FLOW_KINDS, 'uses'], depth: 4 });
  const f = { tcodes: new Map(), bapis: new Map(), writes: new Map(), reads: new Map(), reached: r.nodes.map(n => n.id) };
  const put = (m, k, w) => m.set(k, Math.max(m.get(k) || 0, w));
  const objs = [[id, 1], ...r.nodes.map(n => [n.id, n.depth <= 1 && typeOf(n.id) === 'PROG' && typeOf(id) === 'TRAN' ? 1 : W.indirect])];
  for (const [o, w] of objs) {
    if (typeOf(o) === 'TRAN') put(f.tcodes, nameOf(o), o === id ? 0 : w); // own Z TCode is not evidence
    for (const e of outEdges(G, o)) {
      if (e.kind === 'starts') put(f.tcodes, nameOf(e.to), w);
      else if (e.kind === 'calls' && typeOf(e.to) === 'FUNC') put(f.bapis, nameOf(e.to), w);
      else if (e.kind === 'writes') put(f.writes, nameOf(e.to), w * (e.confidence === 'low' ? 0.5 : 1));
      else if (e.kind === 'reads') put(f.reads, nameOf(e.to), w);
    }
  }
  return f;
}

export function scoreTask(task, f) {
  let score = 0;
  const why = [];
  for (const t of task.tcodes) if (f.tcodes.get(t)) { score += W.tcode * f.tcodes.get(t); why.push(`starts ${t}`); }
  for (const b of task.bapis) if (f.bapis.get(b)) { score += W.bapi * f.bapis.get(b); why.push(`calls ${b}`); }
  for (const t of task.tables) if (f.writes.get(t)) { score += W.write * f.writes.get(t); why.push(`writes ${t}`); }
  let rs = 0;
  for (const t of task.tables) if (!f.writes.get(t) && f.reads.get(t)) { rs += W.read * f.reads.get(t); why.push(`reads ${t}`); }
  score += Math.min(rs, W.readCap);
  return { score: Math.round(score * 100) / 100, why };
}

/** Proposals: per entry the best L4 tasks; per task the entries proposed for it. */
export function candidates(graph, trees, { lang = 'en' } = {}) {
  const G = loadGraph(graph);
  const tasks = flattenBackbone(trees, lang).filter(t => t.level === 4);
  const entries = entryPoints(G).map(id => {
    const f = featuresOf(G, id);
    const prog = typeOf(id) === 'TRAN' ? (G.out.get(id) || []).find(e => e.kind === 'launches')?.to || null : id;
    const scored = tasks.map(t => ({ task: t.id, label: t.label, path: t.path.join(' > '), ...scoreTask(t, f) }))
      .filter(c => c.score >= W.min).sort((a, b) => b.score - a.score || (a.task < b.task ? -1 : 1)).slice(0, W.top);
    return {
      id, name: nameOf(id), type: typeOf(id), program: prog ? nameOf(prog) : null,
      packages: G.nodes.get(id)?.packages || G.nodes.get(prog)?.packages || [],
      candidates: scored,
      features: { tcodes: [...f.tcodes.keys()].filter(k => f.tcodes.get(k)).sort(), bapis: [...f.bapis.keys()].sort(),
        writes: [...f.writes.keys()].sort(), reads: [...f.reads.keys()].sort() },
    };
  });
  const byTask = {};
  for (const e of entries) for (const c of e.candidates) (byTask[c.task] ||= []).push({ entry: e.id, score: c.score });
  return { tasks: tasks.length, entries, byTask, unmatched: entries.filter(e => !e.candidates.length).map(e => e.id) };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [root, ...args] = process.argv.slice(2);
  let modules = [], graphPath = '', lang = 'en', out = '';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--modules') modules = String(args[++i]).split(',').map(s => s.trim()).filter(Boolean);
    else if (args[i] === '--graph') graphPath = args[++i];
    else if (args[i] === '--lang') lang = args[++i];
    else if (args[i] === '--out') out = args[++i];
  }
  if (!root || !modules.length || !graphPath || !out) {
    console.error('Usage: node backbone.mjs <plugin-root> --modules MM[,SD] --graph <module-graph.json> --out <attach.json> [--lang ko]');
    process.exit(2);
  }
  try {
    const { trees, missing } = loadBackbone(resolve(root), modules);
    if (!trees.length) throw new Error(`no process-backbone.json for ${modules.join(', ')}`);
    const res = candidates(JSON.parse(readFileSync(graphPath, 'utf8')), trees, { lang });
    writeFileSync(out, `${JSON.stringify({ modules, missing, ...res }, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ out: resolve(out), missing, tasks: res.tasks, entries: res.entries.length, unmatched: res.unmatched.length }, null, 2));
  } catch (e) {
    console.error(`backbone: ${e.message}`);
    process.exit(1);
  }
}
