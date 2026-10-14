// sc4sap:graph — queries over graph.json (built by extract-edges.mjs). The
// judging agents read these answers instead of the source or the whole graph.
//
//   callers <id> [--kinds k,…]            incoming edges + evidence
//   reach <id> [--kinds k,…] [--depth n]  forward reachable sub-graph (default: control-flow kinds)
//   impact <id> [--kinds k,…] [--depth n] reverse reach — what is affected when <id> changes
//   flow <table>                          writers → readers of a table, with the programs / TCodes reaching each
//   components [--entries a,b]            entry points (TRAN launches, else given ids, else root member PROGs)
//                                         grouped by reach + table hand-offs; shared written tables listed
//   stats                                 degrees, isolated members, unresolved count, coverage
//   usage <usage.json>                    used-object list: direct (TCode / job step) → indirect (reach) / unused / no-evidence
//
// <id> is TYPE:NAME or a bare NAME (member first, then any unique match).
// FUNC nodes with `parent` (a parsed FUGR) also follow their group's outgoing edges
// in reach/flow (the group's global code — TOP, forms — is shared by its FMs).
//
// CLI: node graph-query.mjs <graph.json> <command> [arg] [--kinds …] [--depth n] [--entries …] [--md]
//      JSON on stdout by default; --md prints a short Markdown table.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FLOW_KINDS = ['launches', 'include', 'calls', 'submits', 'starts'];
const SOURCE_TYPES = ['PROG', 'FUGR', 'FUNC', 'CLAS', 'INTF'];
const DEFAULT_REACH = [...FLOW_KINDS, 'reads', 'writes', 'uses'];

export function loadGraph(input) {
  const g = typeof input === 'string' ? JSON.parse(readFileSync(input, 'utf8')) : input;
  const nodes = new Map(g.nodes.map((n) => [n.id, n]));
  const out = new Map();
  const inc = new Map();
  for (const e of g.edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    if (!inc.has(e.to)) inc.set(e.to, []);
    out.get(e.from).push(e);
    inc.get(e.to).push(e);
  }
  return { graph: g, nodes, out, inc };
}

const kindsOf = (k, dflt) => {
  if (!k) return dflt ? new Set(dflt) : null;
  return new Set((Array.isArray(k) ? k : String(k).split(',')).map((s) => s.trim()).filter(Boolean));
};

export function resolveId(G, ref) {
  const r = String(ref || '').trim().toUpperCase();
  if (G.nodes.has(r)) return r;
  const byName = [...G.nodes.values()].filter((n) => n.name === r || n.id.endsWith(`:${r}`));
  if (!byName.length) return null;
  const member = byName.filter((n) => n.scope === 'member');
  const pick = (member.length ? member : byName).sort((a, b) => rankType(a.type) - rankType(b.type));
  return pick[0].id;
}
const TYPE_ORDER = ['TRAN', 'PROG', 'FUGR', 'FUNC', 'CLAS', 'INTF', 'TABL', 'VIEW', 'STRU', 'TTYP', 'DTEL', 'INCL'];
const rankType = (t) => (TYPE_ORDER.indexOf(t) + 1 || 99);

const mustId = (G, ref) => {
  const id = resolveId(G, ref);
  if (!id) throw new Error(`unknown node: ${ref}`);
  return id;
};

/** outgoing edges, including the parent FUGR's edges for a FUNC */
function outEdges(G, id) {
  const own = G.out.get(id) || [];
  const parent = G.nodes.get(id)?.parent;
  if (parent && G.nodes.get(id)?.type === 'FUNC') return [...own, ...(G.out.get(parent) || [])];
  return own;
}

export function callers(G, ref, { kinds } = {}) {
  const id = mustId(G, ref);
  const ks = kindsOf(kinds);
  const edges = (G.inc.get(id) || []).filter((e) => !ks || ks.has(e.kind));
  return {
    id,
    callers: edges.map((e) => ({ from: e.from, kind: e.kind, scope: G.nodes.get(e.from)?.scope, count: e.count, evidence: e.evidence })),
  };
}

export function reach(G, ref, { kinds, depth = Infinity, reverse = false } = {}) {
  const id = mustId(G, ref);
  const ks = kindsOf(kinds, reverse ? null : DEFAULT_REACH);
  const seen = new Map([[id, 0]]);
  const edges = [];
  let frontier = [id];
  for (let d = 1; frontier.length && d <= depth; d++) {
    const next = [];
    for (const cur of frontier) {
      const list = reverse ? G.inc.get(cur) || [] : outEdges(G, cur);
      for (const e of list) {
        if (ks && !ks.has(e.kind)) continue;
        const other = reverse ? e.from : e.to;
        edges.push({ from: e.from, to: e.to, kind: e.kind });
        if (seen.has(other)) continue;
        seen.set(other, d);
        next.push(other);
        // reaching an FM loads its function group
        const parent = !reverse && G.nodes.get(other)?.type === 'FUNC' ? G.nodes.get(other).parent : null;
        if (parent && !seen.has(parent)) seen.set(parent, d);
      }
    }
    frontier = next;
  }
  const nodes = [...seen.entries()]
    .filter(([n]) => n !== id)
    .map(([n, d]) => ({ id: n, depth: d, type: G.nodes.get(n)?.type, scope: G.nodes.get(n)?.scope }))
    .sort((a, b) => a.depth - b.depth || (a.id < b.id ? -1 : 1));
  return { id, direction: reverse ? 'reverse' : 'forward', kinds: ks ? [...ks] : 'all', nodes, edges: dedupe(edges) };
}

export const impact = (G, ref, opts = {}) => reach(G, ref, { ...opts, reverse: true });

function dedupe(edges) {
  const m = new Map();
  for (const e of edges) m.set(`${e.from}|${e.kind}|${e.to}`, e);
  return [...m.values()];
}

/** programs and TCodes that reach `id` through control-flow edges (id itself when it is one) */
function programsReaching(G, id) {
  // a FUGR-level edge belongs to every FM of the group: start from the group's FUNC nodes too
  const starts = [id, ...[...G.nodes.values()].filter((n) => n.parent === id && n.type === 'FUNC').map((n) => n.id)];
  const all = new Set(starts);
  for (const s of starts) for (const n of reach(G, s, { kinds: FLOW_KINDS, reverse: true }).nodes) all.add(n.id);
  return [...all].filter((n) => ['PROG', 'TRAN'].includes(G.nodes.get(n)?.type)).sort();
}

export function flow(G, ref) {
  const id = resolveTable(G, ref);
  const ins = G.inc.get(id) || [];
  const side = (kind) =>
    ins
      .filter((e) => e.kind === kind)
      .map((e) => ({
        id: e.from,
        ops: e.ops,
        confidence: e.confidence || 'high',
        evidence: e.evidence,
        programs: programsReaching(G, e.from),
      }));
  const writers = side('writes');
  const readers = side('reads');
  const sequence = [];
  for (const w of writers) for (const r of readers) if (w.id !== r.id) sequence.push({ writer: w.id, reader: r.id });
  return { table: id, writers, readers, sequence };
}

function resolveTable(G, ref) {
  const r = String(ref || '').trim().toUpperCase();
  if (G.nodes.has(r)) return r;
  for (const t of ['TABL', 'VIEW', 'DDLS', 'STRU']) if (G.nodes.has(`${t}:${r}`)) return `${t}:${r}`;
  return mustId(G, ref);
}

export function components(G, { entries } = {}) {
  let ids = entries ? kindsOf(entries) : null;
  let source = 'given';
  if (!ids || !ids.size) {
    const trans = [...G.nodes.values()].filter((n) => n.type === 'TRAN' && (G.out.get(n.id) || []).some((e) => e.kind === 'launches'));
    if (trans.length) {
      ids = new Set(trans.map((n) => n.id));
      source = 'launches';
    } else {
      // root member programs: nobody in the graph includes / calls / submits / starts them
      ids = new Set(
        [...G.nodes.values()]
          .filter((n) => n.scope === 'member' && ['PROG', 'FUGR', 'CLAS'].includes(n.type))
          .filter((n) => !(G.inc.get(n.id) || []).some((e) => FLOW_KINDS.includes(e.kind)))
          .map((n) => n.id),
      );
      source = 'roots';
    }
  }
  const list = [...ids].map((x) => mustId(G, x)).sort();
  const info = new Map();
  for (const e of list) {
    const r = reach(G, e, { kinds: [...FLOW_KINDS, 'uses'] });
    const objs = new Set([e, ...r.nodes.map((n) => n.id)]);
    const writes = new Set();
    const reads = new Set();
    for (const o of objs) {
      for (const ed of outEdges(G, o)) {
        if (ed.kind === 'writes') writes.add(ed.to);
        if (ed.kind === 'reads') reads.add(ed.to);
      }
    }
    const touched = [...objs, ...writes, ...reads];
    const members = [...new Set(touched)].filter((o) => G.nodes.get(o)?.scope === 'member' && G.nodes.get(o)?.type !== 'INCL');
    info.set(e, { objs, members, writes, reads });
  }
  // union-find: invocation overlap or a table one side writes and the other reads / writes
  const parent = new Map(list.map((e) => [e, e]));
  const find = (x) => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x))), parent.get(x)));
  const link = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = info.get(list[i]);
      const b = info.get(list[j]);
      const invokes = a.objs.has(list[j]) || b.objs.has(list[i]);
      const handoff = [...a.writes].filter((t) => b.reads.has(t) || b.writes.has(t)).concat([...b.writes].filter((t) => a.reads.has(t)));
      if (invokes || handoff.length) {
        parent.set(find(list[i]), find(list[j]));
        link.push({ a: list[i], b: list[j], invokes, tables: [...new Set(handoff)].sort() });
      }
    }
  }
  const groups = new Map();
  for (const e of list) {
    const root = find(e);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(e);
  }
  const comps = [...groups.values()].map((es) => {
    const members = new Set();
    const writtenBy = new Map();
    const readBy = new Map();
    for (const e of es) {
      const inf = info.get(e);
      inf.members.forEach((m) => members.add(m));
      for (const t of inf.writes) writtenBy.set(t, [...(writtenBy.get(t) || []), e]);
      for (const t of inf.reads) readBy.set(t, [...(readBy.get(t) || []), e]);
    }
    const sharedTables = [...writtenBy.entries()]
      .map(([t, w]) => ({ table: t, writers: w.sort(), readers: (readBy.get(t) || []).filter((r) => !w.includes(r) || w.length > 1).sort() }))
      .filter((x) => x.readers.length || x.writers.length > 1)
      .sort((a, b) => (a.table < b.table ? -1 : 1));
    return {
      entries: es.sort(),
      members: [...members].sort(),
      writes: [...writtenBy.keys()].sort(),
      sharedTables,
      links: link.filter((l) => es.includes(l.a)),
    };
  });
  const reached = new Set(comps.flatMap((c) => c.members));
  const unreached = [...G.nodes.values()]
    .filter((n) => n.scope === 'member' && SOURCE_TYPES.includes(n.type) && !n.unreferenced && !reached.has(n.id))
    .map((n) => n.id)
    .sort();
  return { source, components: comps.sort((a, b) => b.members.length - a.members.length || (a.entries[0] < b.entries[0] ? -1 : 1)), unreached };
}

export function stats(G) {
  const g = G.graph;
  const byKind = {};
  for (const e of g.edges) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  const nodesBy = {};
  for (const n of g.nodes) {
    const k = `${n.scope}:${n.type}`;
    nodesBy[k] = (nodesBy[k] || 0) + 1;
  }
  const degree = g.nodes
    .filter((n) => n.scope === 'member' && n.type !== 'INCL')
    .map((n) => {
      const ins = (G.inc.get(n.id) || []).filter((e) => e.kind !== 'include');
      const outs = G.out.get(n.id) || [];
      const inBy = {};
      for (const e of ins) inBy[e.kind] = (inBy[e.kind] || 0) + 1;
      return { id: n.id, in: ins.length, out: outs.length, inByKind: inBy };
    })
    .sort((a, b) => b.in - a.in || b.out - a.out || (a.id < b.id ? -1 : 1));
  const isolated = degree.filter((d) => d.in === 0 && d.out === 0).map((d) => d.id);
  const lowConfidence = g.edges.filter((e) => e.confidence === 'low').length;
  return {
    package: g.package,
    system: g.system,
    builtAt: g.builtAt,
    nodes: g.nodes.length,
    edges: g.edges.length,
    edgesByKind: byKind,
    nodesByScopeType: nodesBy,
    degree,
    isolated,
    unresolved: g.unresolved?.length || 0,
    lowConfidence,
    coverage: g.coverage,
  };
}

// ---------------------------------------------------------------- usage

export const USAGE_KINDS = [...FLOW_KINDS, 'uses', 'reads', 'writes', 'types'];

/** { tcodes?: GetTcodeUsage response, jobs?: GetJobUsage response } — `result` maps NAME → bool */
function normalizeUsage(u) {
  const side = (s) => (s && typeof s === 'object' ? { ...s, result: Object.fromEntries(Object.entries(s.result || {}).map(([k, v]) => [k.toUpperCase(), v === true])) } : null);
  return { tcodes: side(u?.tcodes), jobs: side(u?.jobs) };
}

/**
 * Used-object list. Roots: TCodes used in the window (ST03N) and programs run as job steps.
 * A program launched by a used TCode is direct too. Everything reached from a root through
 * USAGE_KINDS edges is indirect (with the shortest path). Members measured false and not
 * reached are unused; the rest have no evidence either way (callers outside the package,
 * RFC and dynamic calls are invisible to source parsing).
 */
export function usage(G, input) {
  const u = normalizeUsage(typeof input === 'string' ? JSON.parse(readFileSync(input, 'utf8')) : input);
  const reasons = new Map();
  const addReason = (id, r) => reasons.set(id, [...(reasons.get(id) || []), r]);
  for (const [t, used] of Object.entries(u.tcodes?.result || {})) {
    const id = `TRAN:${t}`;
    if (!used || !G.nodes.has(id)) continue;
    addReason(id, `tcode ${t}`);
    for (const e of G.out.get(id) || []) if (e.kind === 'launches') addReason(e.to, `tcode ${t}`);
  }
  for (const [p, used] of Object.entries(u.jobs?.result || {})) {
    const id = resolveId(G, p);
    if (used && id) addReason(id, 'job step');
  }
  // multi-source BFS: first visit keeps the shortest path back to a root
  const kinds = new Set(USAGE_KINDS);
  const prev = new Map([...reasons.keys()].map((id) => [id, null]));
  let frontier = [...reasons.keys()].sort();
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) {
      for (const e of outEdges(G, cur)) {
        if (!kinds.has(e.kind) || prev.has(e.to)) continue;
        prev.set(e.to, { from: cur, kind: e.kind });
        next.push(e.to);
        const parent = G.nodes.get(e.to)?.type === 'FUNC' ? G.nodes.get(e.to).parent : null;
        if (parent && !prev.has(parent)) prev.set(parent, { from: e.to, kind: 'parent' });
      }
    }
    frontier = next;
  }
  const pathTo = (id) => {
    const p = [];
    for (let c = id; prev.get(c); c = prev.get(c).from) p.unshift({ kind: prev.get(c).kind, to: c, from: prev.get(c).from });
    return p.length ? [p[0].from, ...p.map((s) => `-${s.kind}-> ${s.to}`)] : [];
  };
  const measuredFalse = (n) =>
    (n.type === 'TRAN' && u.tcodes?.result[n.name] === false) || (n.type === 'PROG' && u.jobs?.result[n.name] === false);
  const objects = [...G.nodes.values()]
    .filter((n) => n.scope === 'member' && n.type !== 'INCL')
    .map((n) => {
      const o = { id: n.id, type: n.type };
      if (n.type === 'TRAN' && !(G.out.get(n.id) || []).some((e) => e.kind === 'launches')) o.unmapped = true;
      if (reasons.has(n.id)) return { ...o, status: 'direct', reasons: reasons.get(n.id) };
      if (prev.has(n.id)) return { ...o, status: 'indirect', via: pathTo(n.id) };
      return { ...o, status: measuredFalse(n) ? 'unused' : 'no-evidence' };
    });
  // measured TCodes without a TRAN node (no program mapping, e.g. SM30 parameter transactions)
  for (const [t, used] of Object.entries(u.tcodes?.result || {})) {
    if (G.nodes.has(`TRAN:${t}`)) continue;
    objects.push(used ? { id: `TRAN:${t}`, type: 'TRAN', status: 'direct', reasons: [`tcode ${t}`], unmapped: true } : { id: `TRAN:${t}`, type: 'TRAN', status: 'unused', unmapped: true });
  }
  objects.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || rankType(a.type) - rankType(b.type) || (a.id < b.id ? -1 : 1));
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, objects.filter((o) => o.status === s).length]));
  const caveats = [];
  if (!u.tcodes) caveats.push('no TCode usage given');
  else if (u.tcodes.coverage != null && u.tcodes.months && u.tcodes.coverage < u.tcodes.months)
    caveats.push(`TCode statistics cover ${u.tcodes.coverage} of ${u.tcodes.months} months — a false TCode means "not used in the kept months"`);
  if (!u.jobs) caveats.push('no job usage given');
  else if (u.jobs.complete === false) caveats.push(`finished jobs kept only since ${u.jobs.oldest} — a false program means "no job since ${u.jobs.oldest}" (scheduled jobs are always seen)`);
  if (G.graph.unresolved?.length) caveats.push(`${G.graph.unresolved.length} dynamic call(s) unresolved — their targets may be used without an edge`);
  caveats.push('callers outside the package (other packages, RFC, workflow, BAdI) are invisible: no-evidence ≠ unused');
  for (const [k, s] of [['TCode', u.tcodes], ['job', u.jobs]])
    if (s?.source) caveats.push(`${k} usage measured on ${s.source.system} (user-submitted ${s.source.file || 'list'}, ${s.source.importedAt}), not on ${G.graph.system || 'this system'} — names absent from the file count as not used`);
  const src = (s) => (s?.source ? { source: s.source } : {});
  const window = {
    tcodes: u.tcodes ? { months: u.tcodes.months, coverage: u.tcodes.coverage, ...src(u.tcodes) } : null,
    jobs: u.jobs ? { months: u.jobs.months, oldest: u.jobs.oldest, complete: u.jobs.complete, ...src(u.jobs) } : null,
  };
  return { package: G.graph.package, system: G.graph.system, window, counts, objects, caveats };
}
const STATUS_ORDER = ['direct', 'indirect', 'unused', 'no-evidence'];

// ---------------------------------------------------------------- Markdown

const ev1 = (ev) => (ev && ev[0] ? `${ev[0].unit}:${ev[0].line}` : '');
const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

export function toMarkdown(cmd, res) {
  switch (cmd) {
    case 'callers':
      return `**${res.id}** — ${res.callers.length} caller edge(s)\n\n${table(['from', 'kind', 'scope', 'count', 'evidence'], res.callers.map((c) => [c.from, c.kind, c.scope, c.count, ev1(c.evidence)]))}`;
    case 'reach':
    case 'impact':
      return `**${res.id}** — ${res.direction} reach, ${res.nodes.length} node(s)\n\n${table(['depth', 'id', 'type', 'scope'], res.nodes.map((n) => [n.depth, n.id, n.type, n.scope]))}`;
    case 'flow':
      return [
        `**${res.table}**`,
        '',
        table(['role', 'object', 'ops', 'confidence', 'programs', 'evidence'], [
          ...res.writers.map((w) => ['writes', w.id, (w.ops || []).join('/'), w.confidence, w.programs.join(', '), ev1(w.evidence)]),
          ...res.readers.map((r) => ['reads', r.id, '', r.confidence, r.programs.join(', '), ev1(r.evidence)]),
        ]),
      ].join('\n');
    case 'components':
      return `Entry source: ${res.source}\n\n${table(['#', 'entries', 'members', 'writes', 'shared tables'], res.components.map((c, i) => [i + 1, c.entries.join(', '), c.members.length, c.writes.join(', '), c.sharedTables.map((t) => `${t.table} (${t.writers.join('+')} → ${t.readers.join('+') || '—'})`).join('; ')]))}${res.unreached.length ? `\n\nUnreached members: ${res.unreached.join(', ')}` : ''}`;
    case 'stats':
      return [
        `**${res.package || '(package)'}** ${res.system || ''} — ${res.nodes} nodes, ${res.edges} edges, ${res.unresolved} unresolved, ${res.lowConfidence} low-confidence`,
        '',
        table(['kind', 'edges'], Object.entries(res.edgesByKind).sort().map(([k, v]) => [k, v])),
        '',
        table(['member', 'in', 'out'], res.degree.slice(0, 20).map((d) => [d.id, d.in, d.out])),
        res.isolated.length ? `\nIsolated members: ${res.isolated.join(', ')}` : '',
      ].join('\n');
    case 'usage':
      return [
        `**${res.package || '(package)'}** ${res.system || ''} — ${STATUS_ORDER.map((s) => `${s} ${res.counts[s]}`).join(', ')}`,
        '',
        table(['status', 'object', 'evidence'], res.objects.map((o) => [o.status, o.id, o.reasons ? o.reasons.join(', ') : o.via ? o.via.join(' ') : ''])),
        '',
        ...res.caveats.map((c) => `- ${c}`),
      ].join('\n');
    default:
      return JSON.stringify(res, null, 2);
  }
}

// ---------------------------------------------------------------- CLI

export function runQuery(argv) {
  const [file, cmd, ...rest] = argv;
  const opts = {};
  const pos = [];
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k === '--kinds') opts.kinds = rest[++i];
    else if (k === '--depth') opts.depth = Number(rest[++i]);
    else if (k === '--entries') opts.entries = rest[++i];
    else if (k === '--md') opts.md = true;
    else pos.push(k);
  }
  if (!file || !cmd) throw new Error('usage: graph-query.mjs <graph.json> <callers|reach|impact|flow|components|stats|usage> [id | usage.json] [--kinds k,…] [--depth n] [--entries a,b] [--md]');
  const G = loadGraph(file);
  const fn = { callers, reach, impact, flow, components, stats, usage }[cmd];
  if (!fn) throw new Error(`unknown command: ${cmd}`);
  const needsId = ['callers', 'reach', 'impact', 'flow', 'usage'].includes(cmd);
  if (needsId && !pos[0]) throw new Error(`${cmd} needs ${cmd === 'usage' ? 'a usage.json' : 'an id'}`);
  const res = needsId ? fn(G, pos[0], opts) : fn(G, opts);
  return opts.md ? toMarkdown(cmd, res) : JSON.stringify(res, null, 2);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    process.stdout.write(`${runQuery(process.argv.slice(2))}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
