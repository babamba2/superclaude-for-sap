// sc4sap:graph — one lookup over every stocked CBO graph (offline, read-only, no LLM, no SAP call).
//
// Other skills ask this instead of opening graph.json: what an object is and what it touches, who writes or
// reads a table (or one field), what a change reaches up to the TCodes. Rule for callers: common/cbo-graph-lookup.md.
//
//   node cbo-lookup.mjs --base <AB>/cbo [--base <dir2> …] [--system <SID>] object <NAME|TYPE:NAME> [<more> …] [--md]
//   node cbo-lookup.mjs --base … table <TABLE | TABLE-FIELD | STRUCTURE-FIELD> [--md]
//   node cbo-lookup.mjs --base … impact <NAME|TYPE:NAME> [--md]
//
// Graphs: every graph.json under the bases (depth ≤ 4, _prev-* skipped) — whole-package and used-TCode graphs,
// several packages and modules. A name can sit in more than one graph: each hit is listed with its graph
// (package, scope, system, SAP version, built date, age); the graph whose member it is comes first.
// Never says "none" when nothing was collected: `searched` counts the graphs read, `hits` = [] means
// "not in any stocked graph", not "not used".
//
// Output (JSON; --md = a short Markdown answer for a prompt):
//   { command, query, searched, graphs: [graph meta], hits: [{ graph (index), id, type, scope, desc, usage, … }], notes }

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeGraph, graphFiles } from '../relmap/relmap-find.mjs';
import { readSideInfo } from '../relmap/build-relation-map.mjs';
import { indexGraph, impactOf } from '../transport/cab-model.mjs';
import { loadGraph, resolveId, FLOW_KINDS } from './graph-query.mjs';
import { fieldUsage } from './extract-fields.mjs';

const DAY = 86_400_000;
export const STALE_DAYS = 30;
const CAP = 25;
const PROGRAM_TYPES = new Set(['PROG', 'FUNC', 'FUGR', 'CLAS', 'INTF']);
const CALL_KINDS = new Set([...FLOW_KINDS, 'uses']);
const TABLE_TYPES = ['TABL', 'VIEW', 'DDLS', 'STRU'];
const up = (s) => String(s ?? '').trim().toUpperCase();
const readJson = (p) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; } catch { return null; } };
const ev1 = (ev) => (ev && ev[0] ? `${ev[0].unit}:${ev[0].line}${ev[0].text ? ` ${String(ev[0].text).replace(/\s+/g, ' ').slice(0, 100)}` : ''}` : '');
const capped = (list) => ({ list: list.slice(0, CAP), total: list.length });

/** every graph under the bases, loaded once; meta per graph for the answer */
export function openGraphs(bases, { system = '', now = Date.now() } = {}) {
  // the active system by profile alias and / or SID (graphs carry either): '<alias>,<SID>'
  const systems = String(system).split(',').map(up).filter(Boolean);
  const seen = new Set(), out = [];
  for (const b of bases) for (const f of graphFiles(resolve(b))) {
    if (seen.has(f)) continue;
    seen.add(f);
    const d = describeGraph(f, now);
    if (!d) continue;
    // odd files (no edges array, nodes without fields) must not break the other graphs
    const raw = { ...readJson(f) };
    raw.edges = Array.isArray(raw.edges) ? raw.edges.filter((e) => e && e.from && e.to) : [];
    raw.nodes = raw.nodes.filter((n) => n && n.id);
    const built = Date.parse(raw.builtAt || '');
    const age = Number.isFinite(built) ? Math.floor((now - built) / DAY) : null;
    const meta = {
      dir: d.dir, package: d.package, module: d.module, scope: d.scope, system: raw.system || '', sapVersion: raw.sapVersion || d.sapVersion || '',
      builtAt: raw.builtAt || null, ageDays: age, stale: age === null || age > STALE_DAYS, parsed: d.parsed,
      otherSystem: !!(systems.length && raw.system && !systems.includes(up(raw.system))),
    };
    // merge key: every graph of the active system (alias, SID or untagged) is one pool; another system keeps its own
    meta.sysKey = systems.length && !meta.otherSystem ? '<active>' : up(raw.system) || '<untagged>';
    out.push({ meta, raw, G: null, C: null, info: null });
  }
  return out;
}
const fullIndex = (g) => (g.G ||= loadGraph(g.raw));
const custIndex = (g) => (g.C ||= indexGraph(g.raw));
const sideInfo = (g) => (g.info ||= readSideInfo(g.meta.dir));
function descOf(g, id) {
  const t = sideInfo(g).texts?.get(id);
  if (t && t.size) return t.get('E') || t.get('EN') || [...t.values()][0];
  return sideInfo(g).desc.get(id) || '';
}
const usageOf = (g, id) => sideInfo(g).usage.get(id) || '';

// a bare name means the code object before its TCode (a dump, a review, a spec name the program)
const NAME_ORDER = ['PROG', 'FUGR', 'FUNC', 'CLAS', 'INTF', 'TABL', 'VIEW', 'DDLS', 'STRU', 'TTYP', 'TRAN', 'DTEL', 'DOMA', 'SHLP', 'INCL'];
const ROW_ORDER = ['TRAN', 'PROG', 'FUNC', 'CLAS', 'INTF', 'FUGR'];
const SCOPE_ORDER = { member: 0, custom: 1, standard: 2, dynamic: 3 };
function resolveIn(G, ref, types) {
  const r = up(ref);
  if (r.includes(':')) return G.nodes.has(r) ? r : null;
  const cands = (types || NAME_ORDER).map((t) => `${t}:${r}`).filter((x) => G.nodes.has(x));
  if (!cands.length) return types ? null : resolveId(G, ref);
  const rank = (x) => (SCOPE_ORDER[G.nodes.get(x).scope] ?? 4) * 100 + (types || NAME_ORDER).indexOf(x.split(':')[0]);
  return cands.sort((a, b) => rank(a) - rank(b))[0];
}

/**
 * graphs holding `ref`: the best one first (the object's home — member scope; this system; whole-package over used
 * graph; newest), the others only named in `alsoIn` — the same object in two graphs is one answer.
 */
function locate(graphs, ref, types = null) {
  const hits = [];
  graphs.forEach((g, gi) => {
    const id = resolveIn(fullIndex(g), ref, types);
    if (id) hits.push({ gi, id, node: fullIndex(g).nodes.get(id) });
  });
  const rank = (h) => {
    const m = graphs[h.gi].meta;
    return (m.otherSystem ? 1000 : 0) + (SCOPE_ORDER[h.node.scope] ?? 4) * 100 + (m.scope === 'package' ? 0 : 10) + (m.parsed ? 0 : 5);
  };
  hits.sort((a, b) => rank(a) - rank(b) || String(graphs[b.gi].meta.builtAt).localeCompare(String(graphs[a.gi].meta.builtAt)));
  // a bare name resolves the same way in every graph: the code object wins over a TCode another graph holds
  let keep = hits;
  if (!up(ref).includes(':') && hits.length) {
    const order = types || NAME_ORDER, ti = (h) => { const i = order.indexOf(h.id.split(':')[0]); return i < 0 ? 99 : i; };
    // decided on this system's hits when there are any: another system must not take the answer away
    const own = hits.filter((h) => !graphs[h.gi].meta.otherSystem);
    const top = Math.min(...(own.length ? own : hits).map(ti));
    keep = hits.filter((h) => ti(h) === top);
  }
  // one answer per object id; the losing graphs are listed with it
  const best = new Map();
  for (const h of keep) {
    if (!best.has(h.id)) best.set(h.id, { ...h, alsoIn: [] });
    else best.get(h.id).alsoIn.push(h.gi);
  }
  return [...best.values()];
}

/** TCodes, programs and job programs a change of `id` reaches (relmap / CAB impact rule, customer objects only) */
function impactIn(g, id) {
  const C = custIndex(g);
  if (!C.nodes.has(id)) return { tcodes: [], programs: [], jobs: [] };
  // a function group's own edges stand for every FM in it: start from the group and its FMs (graph-query programsReaching)
  const G = fullIndex(g);
  const fms = id.startsWith('FUGR:') ? [...G.nodes.values()].filter((n) => n.parent === id && n.type === 'FUNC' && C.nodes.has(n.id)).map((n) => n.id) : [];
  const im = impactOf(C, [id, ...fms]);
  const tc = [...im.tcodes, ...(id.startsWith('TRAN:') ? [id] : [])];
  const progs = [...im.progs, ...(PROGRAM_TYPES.has(id.split(':')[0]) ? [id] : [])];
  return {
    tcodes: [...new Set(tc)].sort().map((t) => ({ name: t.slice(5), desc: descOf(g, t), usage: usageOf(g, t) })),
    programs: [...new Set(progs)].sort(),
    jobs: [...new Set(progs.filter((p) => sideInfo(g).jobs?.has(p)).map((p) => p.split(':')[1]))].sort(),
  };
}

/**
 * The graphs one answer draws on: the best graph and every other graph of the same system holding the object.
 * What points AT an object (callers, writers, readers, impact) is spread over the graphs of every package that
 * uses it; what the object itself does sits in its own graph.
 */
const poolOf = (graphs, h) => [h.gi, ...h.alsoIn].filter((i) => graphs[i].meta.sysKey === graphs[h.gi].meta.sysKey);

/** impactIn over several graphs, merged */
function impactAll(graphs, gis, id) {
  const tc = new Map(), progs = new Set(), jobs = new Set();
  for (const i of gis) {
    const im = impactIn(graphs[i], id);
    for (const t of im.tcodes) { const had = tc.get(t.name); if (!had) tc.set(t.name, { ...t }); else { had.desc ||= t.desc; if (!had.usage || t.usage === 'direct') had.usage = t.usage || had.usage; } }
    im.programs.forEach((p) => progs.add(p));
    im.jobs.forEach((j) => jobs.add(j));
  }
  return { tcodes: [...tc.values()].sort((a, b) => a.name.localeCompare(b.name)), programs: [...progs].sort(), jobs: [...jobs].sort() };
}

/** incoming edges of `id` of the given kinds over several graphs, one per (from, kind); ops merged */
function incomingAll(graphs, gis, id, keep) {
  const m = new Map();
  for (const i of gis) {
    const G = fullIndex(graphs[i]);
    for (const e of G.inc.get(id) || []) {
      if (!keep(e, G)) continue;
      const k = `${e.from}|${e.kind}`, had = m.get(k);
      if (!had) m.set(k, { id: e.from, kind: e.kind, ops: [...(e.ops || [])], confidence: e.confidence || 'high', ev: ev1(e.evidence) });
      else had.ops = [...new Set([...had.ops, ...(e.ops || [])])];
    }
  }
  const tr = (x) => { const i = ROW_ORDER.indexOf(x.split(':')[0]); return i < 0 ? 99 : i; };
  return [...m.values()].sort((a, b) => tr(a.id) - tr(b.id) || a.id.localeCompare(b.id));
}

export function objectCard(graphs, ref) {
  return locate(graphs, ref).map((h) => {
    const { gi, id, node, alsoIn } = h, g = graphs[gi], G = fullIndex(g), pool = poolOf(graphs, h);
    // an FM also runs its function group's global code (TOP, forms): the group's edges count for it
    const seenOut = new Set();
    const outs = [...(G.out.get(id) || []), ...(node.type === 'FUNC' && node.parent ? G.out.get(node.parent) || [] : [])]
      .filter((e) => e.to !== id && !seenOut.has(e.kind + '|' + e.to) && seenOut.add(e.kind + '|' + e.to));
    const im = impactAll(graphs, pool, id);
    return {
      graph: gi, alsoIn, id, type: node.type, scope: node.scope, desc: descOf(g, id), usage: usageOf(g, id),
      callers: capped(incomingAll(graphs, pool, id, (e, GG) => e.from !== id && e.kind !== 'types' && GG.nodes.get(e.from)?.scope !== 'standard')),
      // customer calls first; includes are part of the object itself, not something it calls
      calls: capped(outs.filter((e) => CALL_KINDS.has(e.kind) && e.kind !== 'include').map((e) => ({ id: e.to, kind: e.kind, scope: G.nodes.get(e.to)?.scope, ev: ev1(e.evidence) }))
        .sort((a, b) => (SCOPE_ORDER[a.scope] ?? 4) - (SCOPE_ORDER[b.scope] ?? 4))),
      writes: capped(outs.filter((e) => e.kind === 'writes').map((e) => ({ id: e.to, ops: e.ops || [], ev: ev1(e.evidence) }))),
      reads: capped(outs.filter((e) => e.kind === 'reads').map((e) => ({ id: e.to, ev: ev1(e.evidence) }))),
      ddic: capped(outs.filter((e) => !CALL_KINDS.has(e.kind) && !['reads', 'writes', 'types', 'dynamic'].includes(e.kind) && !String(e.to).startsWith('DYN:')).map((e) => ({ id: e.to, kind: e.kind }))),
      tcodes: capped(im.tcodes), programs: capped(im.programs), jobs: im.jobs,
    };
  });
}

/** writers / readers of a table (graph edges), or C R U D F per field (fields.json) for TABLE-FIELD */
export function tableUse(graphs, ref) {
  const r = up(ref), dash = r.indexOf('-');
  const table = dash > 0 ? r.slice(0, dash) : r, field = dash > 0 ? r.slice(dash + 1) : '';
  const out = [];
  for (const h of locate(graphs, table, TABLE_TYPES)) {
    const { gi, id, node, alsoIn } = h;
    if (!TABLE_TYPES.includes(node.type)) continue;
    const g = graphs[gi], pool = poolOf(graphs, h);
    // TCodes / jobs only for the rows shown: a standard table can have hundreds of readers
    const side = (kind) => {
      const c = capped(incomingAll(graphs, pool, id, (e) => e.kind === kind));
      c.list = c.list.map((x) => { const im = impactAll(graphs, pool, x.id); return { ...x, tcodes: im.tcodes.map((t) => t.name), jobs: im.jobs }; });
      return c;
    };
    const hit = { graph: gi, alsoIn, id, type: node.type, scope: node.scope, desc: descOf(g, id), writers: side('writes'), readers: side('reads') };
    if (field) hit.field = fieldsAll(graphs, pool, `${table}-${field}`);
    out.push(hit);
  }
  return out;
}

/** fieldUsage over the fields.json of several graphs, per field the references merged by object */
function fieldsAll(graphs, gis, target) {
  const found = gis.map((i) => readJson(resolve(graphs[i].meta.dir, 'fields.json'))).filter(Boolean).map((fx) => fieldUsage(fx, target)).filter((u) => u.found && u.fields.length);
  if (!found.length) return { target, found: false, reason: gis.some((i) => existsSync(resolve(graphs[i].meta.dir, 'fields.json'))) ? 'field not in fields.json' : 'no fields.json' };
  const byField = new Map();
  for (const u of found) for (const f of u.fields) {
    const k = `${f.table}-${f.field}`;
    if (!byField.has(k)) { byField.set(k, { table: f.table, field: f.field, ops: Object.fromEntries(Object.entries(f.ops).map(([o, l]) => [o, [...l]])) }); continue; }
    const had = byField.get(k);
    for (const [o, l] of Object.entries(f.ops)) for (const x of l) if (!(had.ops[o] ||= []).some((y) => y.from === x.from && y.row === x.row)) had.ops[o].push(x);
  }
  return { target, found: true, tables: [...new Set(found.flatMap((u) => u.tables))], fields: [...byField.values()] };
}

export function impact(graphs, ref) {
  return locate(graphs, ref).map((h) => {
    const im = impactAll(graphs, poolOf(graphs, h), h.id);
    return { graph: h.gi, alsoIn: h.alsoIn, id: h.id, type: h.node.type, scope: h.node.scope, desc: descOf(graphs[h.gi], h.id), tcodes: capped(im.tcodes), programs: capped(im.programs), jobs: im.jobs };
  });
}

/** notes a caller must relay: no graph, stale graphs, another system, scope limits */
function notesFor(graphs, hits) {
  const notes = [];
  if (!graphs.length) notes.push('no stocked graph under the given bases — not collected (run /sc4sap:stock-cbo); never read as "not used"');
  else if (!hits.length) notes.push(`not in any of ${graphs.length} stocked graph(s) — the object may sit in a package that was not stocked`);
  // every graph an answer drew on: the best one and the merged graphs of the same system
  const used = [...new Set(hits.flatMap((h) => poolOf(graphs, { gi: h.graph, alsoIn: h.alsoIn })))].map((i) => graphs[i].meta);
  for (const m of used) {
    if (m.stale) notes.push(`${m.package}: graph built ${String(m.builtAt || '?').slice(0, 10)}${m.ageDays !== null ? ` (${m.ageDays} days)` : ''} — may be out of date`);
    if (m.otherSystem) notes.push(`${m.package}: graph of ${m.system}, not of the active system`);
    if (!m.system) notes.push(`${m.package}: graph has no system tag — taken as the active system`);
    if (!m.parsed) notes.push(`${m.package}: DDIC relations only — no code relations (callers, CRUD) in this graph`);
  }
  if (hits.length) notes.push('callers outside the stocked packages, RFC, dynamic calls and standard code are not in the graph');
  return [...new Set(notes)];
}

export function lookup({ bases = [], system = '', command, refs = [], now = Date.now() }) {
  const graphs = openGraphs(bases, { system, now });
  const fn = { object: objectCard, table: tableUse, impact }[command];
  if (!fn) throw new Error(`unknown command: ${command} (object | table | impact)`);
  if (!refs.length) throw new Error(`${command} needs a name`);
  const answers = refs.map((q) => {
    const hits = fn(graphs, q);
    return { query: up(q), hits, notes: notesFor(graphs, hits) };
  });
  const usedIx = [...new Set(answers.flatMap((a) => a.hits.flatMap((h) => [h.graph, ...h.alsoIn])))].sort((a, b) => a - b);
  return { command, searched: graphs.length, graphs: Object.fromEntries(usedIx.map((i) => [i, graphs[i].meta])), answers };
}

// ---------------------------------------------------------------- Markdown

const names = (c, f = (x) => x.id) => (c.total ? `${c.list.map(f).join(', ')}${c.total > c.list.length ? ` … (+${c.total - c.list.length})` : ''}` : '—');
const graphLine = (m) => `${m.package} · ${m.module} · ${m.scope} graph · ${m.system || '?'} ${m.sapVersion || ''} · built ${String(m.builtAt || '?').slice(0, 10)}${m.stale ? ' ⚠ stale' : ''}${m.otherSystem ? ' ⚠ other system' : ''}`;

export function toMarkdown(res) {
  const out = [`Searched ${res.searched} stocked graph(s).`];
  for (const a of res.answers) {
    out.push('', `### ${a.query}`);
    if (!a.hits.length) out.push('Not found.');
    for (const h of a.hits) {
      const m = res.graphs[h.graph];
      out.push(`**${h.id}**${h.desc ? ` — ${h.desc}` : ''} (${h.scope}${h.usage ? `, ${h.usage}` : ''}) · ${graphLine(m)}`);
      if (h.alsoIn.length) out.push(`- also in: ${h.alsoIn.map((i) => `${res.graphs[i].package} (${res.graphs[i].scope})`).join(', ')}`);
      if (res.command === 'object') {
        out.push(`- called / used by: ${names(h.callers, (x) => `${x.id} (${x.kind})`)}`);
        out.push(`- calls: ${names(h.calls, (x) => `${x.id} (${x.kind})`)}`);
        out.push(`- writes: ${names(h.writes, (x) => `${x.id}${x.ops.length ? ` ${x.ops.join('/')}` : ''}`)} · reads: ${names(h.reads)}`);
        if (h.ddic.total) out.push(`- DDIC: ${names(h.ddic, (x) => `${x.id} (${x.kind})`)}`);
      }
      if (res.command === 'object' || res.command === 'impact') {
        out.push(`- reached from TCodes: ${names(h.tcodes, (t) => `${t.name}${t.usage ? ` [${t.usage}]` : ''}`)}${h.jobs.length ? ` · jobs: ${h.jobs.join(', ')}` : ''}`);
        if (res.command === 'impact') out.push(`- programs affected: ${names(h.programs, (p) => p)}`);
      }
      if (res.command === 'table') {
        const side = (c) => names(c, (x) => `${x.id}${x.ops.length ? ` ${x.ops.join('/')}` : ''}${x.tcodes.length ? ` ← ${x.tcodes.slice(0, 4).join(', ')}${x.tcodes.length > 4 ? '…' : ''}` : ''}`);
        out.push(`- written by: ${side(h.writers)}`, `- read by: ${side(h.readers)}`);
        if (h.field) {
          if (!h.field.found) out.push(`- field ${h.field.target}: ${h.field.reason || 'not in fields.json'}`);
          else for (const f of h.field.fields) out.push(`- ${f.table}-${f.field}: ${['C', 'R', 'U', 'D', 'F'].map((o) => `${o} ${[...new Set((f.ops[o] || []).map((x) => x.from + (x.row ? ' (row)' : '')))].join(', ') || '—'}`).join(' · ')}`);
        }
      }
    }
    for (const n of a.notes) out.push(`> ${n}`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- CLI

export function parseArgs(argv) {
  const a = { bases: [], system: '', md: false, command: '', refs: [] };
  const value = (i, k) => { const v = argv[i]; if (v === undefined || v.startsWith('--')) throw new Error(`${k} needs a value`); return v; };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--base') a.bases.push(value(++i, k));
    else if (k === '--system') a.system = value(++i, k);
    else if (k === '--md') a.md = true;
    else if (k.startsWith('--')) throw new Error(`unknown option ${k}`);
    else if (!a.command) a.command = k;
    else a.refs.push(k);
  }
  if (!a.bases.length || !a.command) throw new Error('usage: cbo-lookup.mjs --base <AB>/cbo [--base …] [--system <SID>] <object|table|impact> <NAME> [<NAME> …] [--md]');
  return a;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const a = parseArgs(process.argv.slice(2));
    const res = lookup(a);
    process.stdout.write(`${a.md ? toMarkdown(res) : JSON.stringify(res)}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
