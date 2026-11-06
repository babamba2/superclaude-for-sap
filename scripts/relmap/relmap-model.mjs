// sc4sap:cbo-relation-map — the page model: graph.json (analyze-cbo-obj Step G) → a compact, customer-only model.
//
// Only customer objects become nodes: scope `member` (in the package) and `custom` (Z / Y / namespace outside it).
// Standard and dynamic targets, and every edge that touches them, are dropped ([[feedback-graph-cbo-only]]) —
// standard check tables survive only as panel text (`std`). Each edge carries a basis: `ddic` (DD* row), `source`
// (literal in ABAP source) or `inferred` (confidence low). Includes are folded into the program / function group
// that owns them by default (their edges move to the owner; the evidence keeps the include name and line).
// Communities: Louvain on the undirected graph, typing links weighted low. Hubs: most distinct neighbours over
// business relations (everything but `types`); typing hubs are listed apart.
//
// Node row:  [name, type, scope(0 member | 1 custom), group, degree, bizDegree, parent, desc, usage, includes, std, pkg]
//            parent / desc / std / pkg = index or -1; usage 0 direct · 1 indirect · 2 unused · 3 no-evidence · -1 none
// Edge row:  [from, to, kind, count, basis, ops]   ops = index into `ops` or -1

import { isCustomName } from '../graph/ddic-edges.mjs';

export const KIND_ORDER = ['types', 'checks', 'valueTable', 'searchHelp', 'rowType', 'basedOn', 'selects', 'contains',
  'include', 'calls', 'submits', 'starts', 'launches', 'reads', 'writes', 'uses'];
export const TYPE_ORDER = ['TABL', 'STRU', 'VIEW', 'TTYP', 'DTEL', 'DOMA', 'SHLP', 'TRAN', 'PROG', 'INCL', 'FUGR', 'FUNC',
  'CLAS', 'INTF', 'ENQU', 'MSAG', 'SRFC', 'SPRX'];
export const USAGE = ['direct', 'indirect', 'unused', 'no-evidence'];
const KEEP_SCOPES = new Set(['member', 'custom']);
const EV_CHARS = 90;
const DESC_CHARS = 140;
const OWNER_TYPES = new Set(['PROG', 'FUGR', 'CLAS', 'INTF']);

// Includes inherit the scope of the program / function group that includes them, so a standard include
// (LSVIM*, MV45A*, RV*…) inside a Z function group shows up as `member`. Keep customer includes only:
// Z / Y / namespace, or a customer function group's L<group> include (LZ…, LY…, L/NS/…).
export const isCustomerName = (n) => isCustomName(n) || (/^L/.test(n) && isCustomName(String(n).slice(1)));
export const keepNode = (nd) => KEEP_SCOPES.has(nd.scope) && (nd.type !== 'INCL' || isCustomerName(nd.name));

const ordered = (seen, order) => [...order.filter((x) => seen.has(x)), ...[...seen].filter((x) => !order.includes(x)).sort()];
const cut = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function basisOf(e) {
  if (e.confidence === 'low') return 'inferred';
  const u = e.evidence?.[0]?.unit || '';
  return /^DD\d\d[A-Z]$/.test(u) || u === 'ddic-facts' || u === 'DDIC' ? 'ddic' : 'source';
}

function evidenceText(x) {
  if (!x) return '';
  const where = x.line ? `${x.unit}:${x.line}` : x.unit || '';
  return [where, cut(String(x.text || '').replace(/\s+/g, ' ').trim(), EV_CHARS)].filter(Boolean).join(' ');
}

// Louvain (Blondel et al. 2008): local moves, then aggregate, until modularity stops rising.
// adj: Array<Map<neighbour, weight>> (undirected). Returns community per node.
export function louvain(adj, { maxPasses = 10 } = {}) {
  let n = adj.length;
  let membership = Array.from({ length: n }, (_, i) => i);
  let level = adj.map((m) => new Map(m));
  let selfW = new Array(n).fill(0);
  for (let pass = 0; pass < maxPasses; pass++) {
    const k = level.map((m, i) => { let s = selfW[i] * 2; for (const w of m.values()) s += w; return s; });
    const m2 = k.reduce((a, b) => a + b, 0);
    if (m2 === 0) break;
    const comm = Array.from({ length: n }, (_, i) => i);
    const tot = k.slice();
    let moved = false;
    for (let sweep = 0; sweep < 20; sweep++) {
      let changed = 0;
      for (let i = 0; i < n; i++) {
        const ci = comm[i];
        const links = new Map();
        for (const [j, w] of level[i]) { const cj = comm[j]; links.set(cj, (links.get(cj) || 0) + w); }
        tot[ci] -= k[i];
        let best = ci, bestGain = (links.get(ci) || 0) - (tot[ci] * k[i]) / m2;
        for (const [c, w] of links) {
          const gain = w - (tot[c] * k[i]) / m2;
          if (gain > bestGain + 1e-12) { best = c; bestGain = gain; }
        }
        tot[best] += k[i];
        if (best !== ci) { comm[i] = best; changed++; }
      }
      if (!changed) break;
      moved = true;
    }
    if (!moved) break;
    const remap = new Map();
    for (const c of comm) if (!remap.has(c)) remap.set(c, remap.size);
    const nn = remap.size;
    membership = membership.map((c) => remap.get(comm[c]));
    if (nn === n) break;
    const next = Array.from({ length: nn }, () => new Map());
    const nextSelf = new Array(nn).fill(0);
    for (let i = 0; i < n; i++) {
      const a = remap.get(comm[i]);
      nextSelf[a] += selfW[i];
      for (const [j, w] of level[i]) {
        const b = remap.get(comm[j]);
        if (a === b) nextSelf[a] += w / 2; else next[a].set(b, (next[a].get(b) || 0) + w);
      }
    }
    level = next; selfW = nextSelf; n = nn;
  }
  return membership;
}

/** include id → owner id (PROG / FUGR / CLAS / INTF), following include chains; unowned includes stay */
export function includeOwners(nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const includer = new Map();
  for (const e of edges) if (e.kind === 'include' && byId.get(e.to)?.type === 'INCL' && !includer.has(e.to)) includer.set(e.to, e.from);
  const owner = new Map();
  const resolve = (id, seen = new Set()) => {
    if (owner.has(id)) return owner.get(id);
    if (seen.has(id)) return null;
    seen.add(id);
    const n = byId.get(id);
    if (!n) return null;
    if (OWNER_TYPES.has(n.type)) return id;
    const up = (n.parent && byId.has(n.parent) ? n.parent : null) || includer.get(id) || null;
    const r = up ? resolve(up, seen) : null;
    owner.set(id, r);
    return r;
  };
  const out = new Map();
  for (const n of nodes) if (n.type === 'INCL') { const o = resolve(n.id); if (o) out.set(n.id, o); }
  return out;
}

/** a short label per group: shared name prefix of its members + the description of its main transaction / program */
export function groupLabel(names, descOf) {
  const sorted = names.filter(Boolean);
  let prefix = '';
  if (sorted.length > 1) {
    const counts = new Map();
    for (const nm of sorted) for (let l = 4; l <= Math.min(nm.length, 12); l++) counts.set(nm.slice(0, l), (counts.get(nm.slice(0, l)) || 0) + 1);
    let best = ['', 0];
    for (const [p, c] of counts) if (c >= Math.max(2, sorted.length * 0.5) && (p.length > best[0].length || (p.length === best[0].length && c > best[1]))) best = [p, c];
    prefix = best[0];
  }
  const d = descOf();
  return [prefix ? `${prefix}*` : '', d ? cut(d, 48) : ''].filter(Boolean).join(' · ');
}

/**
 * info: { desc: Map<id, text>, usage: Map<id, status>, std: Map<tableName, string[]> }
 * snippets: (unit, line) → { start, text } | null   (only when the page carries source snippets)
 */
export function buildModel(graph, { hubs = 40, groups = 60, fold = true, info = {}, snippets = null } = {}) {
  const descOf = info.desc || new Map(), usageOf = info.usage || new Map(), stdOf = info.std || new Map();
  // TADIR lists includes as PROG too (walk type PROG/I): the same include then appears twice — as the INCL its
  // owner includes, and as a PROG that nothing calls. Drop that twin.
  const inclNames = new Set(graph.nodes.filter((n) => n.type === 'INCL').map((n) => n.name));
  const touched = new Set();
  for (const e of graph.edges) { touched.add(e.from); touched.add(e.to); }
  let all = graph.nodes.filter((nd) => keepNode(nd) && !(nd.type === 'PROG' && inclNames.has(nd.name) && !touched.has(nd.id)));
  const keptIds = new Set(all.map((n) => n.id));
  let dropped = 0;
  const rawEdges = [];
  for (const e of graph.edges) {
    if (!keptIds.has(e.from) || !keptIds.has(e.to) || e.kind === 'dynamic') { dropped++; continue; }
    rawEdges.push(e);
  }

  // fold includes into their owner
  const owners = fold ? includeOwners(all, rawEdges) : new Map();
  const folded = new Map();
  for (const [inc, own] of owners) folded.set(own, (folded.get(own) || []).concat(inc));
  const mapId = (id) => owners.get(id) || id;
  all = all.filter((n) => !owners.has(n.id));
  const index = new Map(all.map((nd, i) => [nd.id, i]));

  const merged = new Map();
  for (const e of rawEdges) {
    const from = mapId(e.from), to = mapId(e.to);
    if (from === to) continue;
    if (e.kind === 'include' && owners.has(e.to)) continue;
    const key = `${from}|${e.kind}|${to}`;
    const m = merged.get(key);
    if (m) {
      m.count += e.count || 1;
      if (m.confidence === 'low' && e.confidence !== 'low') { m.confidence = undefined; m.evidence = e.evidence; }
      for (const op of e.ops || []) if (!m.ops.includes(op)) m.ops.push(op);
    } else merged.set(key, { from, to, kind: e.kind, count: e.count || 1, confidence: e.confidence, evidence: e.evidence, ops: [...(e.ops || (e.op ? [e.op] : []))] });
  }

  const kindsSeen = new Set([...merged.values()].map((e) => e.kind)), typesSeen = new Set(all.map((nd) => nd.type));
  const kinds = ordered(kindsSeen, KIND_ORDER), types = ordered(typesSeen, TYPE_ORDER);
  const kindIx = new Map(kinds.map((k, i) => [k, i])), typeIx = new Map(types.map((t, i) => [t, i]));
  const BASES = ['ddic', 'source', 'inferred'];
  const typesKind = kindIx.get('types');

  const adj = all.map(() => new Map()), nb = all.map(() => new Set()), nbBiz = all.map(() => new Set());
  const edges = [], ev = [], ops = [], opsIx = new Map(), snip = [], snipIx = new Map(), sn = [];
  for (const e of merged.values()) {
    const a = index.get(e.from), b = index.get(e.to), kd = kindIx.get(e.kind);
    let oi = -1;
    if (e.ops.length) {
      const s = e.ops.slice().sort().join('/');
      if (!opsIx.has(s)) { opsIx.set(s, ops.length); ops.push(s); }
      oi = opsIx.get(s);
    }
    edges.push([a, b, kd, e.count, BASES.indexOf(basisOf(e)), oi]);
    const x = e.evidence?.[0];
    ev.push(evidenceText(x));
    if (snippets) {
      let si = -1;
      if (x && x.line && basisOf(e) !== 'ddic') {
        const key = `${x.unit}:${x.line}`;
        if (snipIx.has(key)) si = snipIx.get(key);
        else {
          const s = snippets(x.unit, x.line);
          si = s ? snip.push([x.unit, s.start, x.line, s.text]) - 1 : -1;
          snipIx.set(key, si);
        }
      }
      sn.push(si);
    }
    const w = kd === typesKind ? 0.3 : 1;
    adj[a].set(b, (adj[a].get(b) || 0) + w); adj[b].set(a, (adj[b].get(a) || 0) + w);
    nb[a].add(b); nb[b].add(a);
    if (kd !== typesKind) { nbBiz[a].add(b); nbBiz[b].add(a); }
  }
  const membership = louvain(adj);
  const sizes = new Map();
  for (const c of membership) sizes.set(c, (sizes.get(c) || 0) + 1);
  const order = [...sizes.entries()].filter(([, s]) => s > 1).sort((x, y) => y[1] - x[1]).map(([c]) => c);
  const commId = new Map(order.map((c, i) => [c, i]));
  const degree = nb.map((s) => s.size), biz = nbBiz.map((s) => s.size);

  const desc = [], descIx = new Map(), std = [], pkgs = [], pkgIx = new Map();
  const strIx = (arr, ix, s) => { if (!ix.has(s)) { ix.set(s, arr.length); arr.push(s); } return ix.get(s); };
  const usageCounts = { direct: 0, indirect: 0, unused: 0, 'no-evidence': 0 };
  const nodes = all.map((nd, i) => {
    const d = descOf.get(nd.id);
    const u = USAGE.indexOf(usageOf.get(nd.id));
    if (u >= 0) usageCounts[USAGE[u]]++;
    const s = (nd.type === 'TABL' || nd.type === 'VIEW') && stdOf.get(nd.name);
    let stdI = -1;
    if (s && s.length) stdI = std.push(s) - 1;
    const pkg = nd.packages?.[0] || (nd.scope === 'member' ? graph.package : '');
    return [nd.name, typeIx.get(nd.type), nd.scope === 'member' ? 0 : 1, commId.has(membership[i]) ? commId.get(membership[i]) : -1,
      degree[i], biz[i], nd.parent && index.has(nd.parent) ? index.get(nd.parent) : -1, d ? strIx(desc, descIx, cut(d, DESC_CHARS)) : -1,
      u, (folded.get(nd.id) || []).length, stdI, pkg ? strIx(pkgs, pkgIx, pkg) : -1];
  });
  const inc = {};
  for (const [own, list] of folded) if (index.has(own)) inc[index.get(own)] = list.map((id) => id.slice(5)).sort();

  const comms = order.slice(0, Math.max(groups, 0)).map((c, gi) => {
    const members = [];
    for (let i = 0; i < membership.length; i++) if (membership[i] === c) members.push(i);
    members.sort((x, y) => biz[y] - biz[x] || degree[y] - degree[x]);
    const mix = {};
    for (const i of members) mix[all[i].type] = (mix[all[i].type] || 0) + 1;
    let inner = 0;
    for (const [a, b] of edges) if (membership[a] === c && membership[b] === c) inner++;
    // a TCode description that only names its program ("program ZX screen 1000") says nothing — skip it
    // nor does a parameter TCode's call string ("SM34 VCLDIR-VCLNAME=… UPDATE=X")
    const said = (i) => {
      const d = descOf.get(all[i].id);
      return d && !/^(program|report|transaction|tcode)\s+\S+(\s+screen\s+\d+)?$/i.test(d.trim()) && !/^\/?\*?(SM3[04]|SE16N?|SE54)\b|VIEWNAME=|VCLNAME=/i.test(d.trim());
    };
    const lead = members.find((i) => all[i].type === 'TRAN' && said(i)) ?? members.find((i) => all[i].type === 'PROG' && said(i)) ?? members.find(said);
    const label = groupLabel(members.slice(0, 60).map((i) => all[i].name), () => (lead !== undefined ? descOf.get(all[lead].id) : ''));
    return { id: gi, size: members.length, top: members.slice(0, 8), mix, inner, label };
  });

  const rank = (deg) => deg.map((d, i) => [i, d]).filter(([, d]) => d > 0).sort((x, y) => y[1] - x[1]).slice(0, hubs).map(([i]) => i);
  const typeDeg = degree.map((d, i) => d - biz[i]);
  const byKind = {}, byBasis = { ddic: 0, source: 0, inferred: 0 }, byType = {};
  for (const ed of edges) { byKind[kinds[ed[2]]] = (byKind[kinds[ed[2]]] || 0) + 1; byBasis[BASES[ed[4]]]++; }
  for (const nd of all) byType[nd.type] = (byType[nd.type] || 0) + 1;

  return {
    meta: {
      package: graph.package, packages: graph.packages || (graph.package ? [graph.package] : []), module: graph.module, system: graph.system,
      sapVersion: graph.sapVersion, graphBuiltAt: graph.builtAt, sourcesParsed: graph.coverage?.parsed ?? (graph.coverage ? Object.values(graph.coverage).reduce((s, c) => s + (c?.parsed || 0), 0) : null),
      folded: fold, hasUsage: usageOf.size > 0, hasDesc: descOf.size > 0, snippets: Boolean(snippets),
    },
    types, kinds, bases: BASES, usage: USAGE, nodes, edges, ev, ops, desc, std, pkgs, inc, comms,
    hubs: rank(biz), typeHubs: rank(typeDeg),
    ...(snippets ? { sn, snip } : {}),
    stats: {
      nodes: nodes.length, edges: edges.length, members: all.filter((nd) => nd.scope === 'member').length,
      custom: all.filter((nd) => nd.scope === 'custom').length, isolated: degree.filter((d) => d === 0).length, groups: order.length,
      droppedEdges: dropped, foldedIncludes: owners.size, byKind, byBasis, byType, usage: usageCounts,
      stdChecks: std.reduce((s, x) => s + x.length, 0), snippets: snip.length,
    },
  };
}
