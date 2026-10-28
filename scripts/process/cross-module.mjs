// sc4sap:module-to-process — touchpoints between the process maps of several modules.
//
//   node cross-module.mjs --module SD=<state dir>[,<graph.json>] --module MM=<state dir>[,<graph.json>] --out <dir>
//                         [--plugin <plugin root>]
//
// Reads per module its process-model.json (L4 rows with TCodes / programs) and its reference graph
// (reads / writes / calls edges with source lines). For every L4 it walks from its entry programs through the
// customer code they include, call or submit, and collects the tables it reads or writes and the functions it
// calls. An object belongs to a module by its name (Z<module>…, Y<module>…) or by the module's configs
// (configs/<M>/tables.md, bapi.md). A touchpoint is an L4 of one module that reads, writes or calls an object of
// another module. When that module's map is given, the touchpoint is paired with its L4s that touch the same
// object the other way (writer ↔ reader); otherwise it stays a boundary stub. Objects many tasks only read
// (master data) and functions many tasks call that change no data (shared utilities) are summarised as hubs. The analysts' crossModule notes are attached by object.
//
// Writes <out>/integration-touchpoints.json and prints a one-line summary.

import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arr = (v) => (Array.isArray(v) ? v : []);
const uniq = (a) => [...new Set(a.filter(Boolean))];
const WALK = new Set(['calls', 'include', 'submits', 'starts', 'launches', 'dynamic']);
const TOUCH = { reads: 'reads', writes: 'writes', calls: 'calls' };

/** Module codes known to the plugin (configs/<M>/), longest first so ZSDX is SD, not S. */
export function moduleCodes(pluginRoot) {
  const dir = join(pluginRoot, 'configs');
  return fs.readdirSync(dir).filter(d => /^[A-Z]{2,3}$/.test(d) && fs.statSync(join(dir, d)).isDirectory()).sort((a, b) => b.length - a.length);
}

/** Standard objects named in configs/<M>/tables.md and bapi.md → module. */
export function standardOwners(pluginRoot, codes) {
  const own = new Map();
  for (const m of codes) for (const f of ['tables.md', 'bapi.md']) {
    const p = join(pluginRoot, 'configs', m, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const c = /^\|\s*([A-Z][A-Z0-9_/]{2,})\s*\|/.exec(line);
      if (c && !/^(TABLE|BAPI)/.test(c[1]) && !own.has(c[1])) own.set(c[1], m);
    }
  }
  return own;
}

/** Module of an object: customer prefix Z/Y + module code, else the configs list; '' when unknown. */
export function ownerOf(name, codes, std) {
  const n = String(name || '').toUpperCase();
  const c = /^[ZY]_?([A-Z]{2,3})/.exec(n);
  if (c) { const m = codes.find(k => c[1].startsWith(k)); if (m) return m; }
  return std.get(n) || '';
}

/** Graph → adjacency by source id. */
function adjacency(graph) {
  const out = new Map();
  for (const e of arr(graph.edges)) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e); }
  return out;
}

/** Entry node ids of an L4 row (TCodes, programs, function modules) that exist in the graph. */
function entries(row, ids) {
  const names = uniq([...arr(row.tcodes), ...arr(row.objects), ...arr(row.variants).flatMap(v => [...arr(v.tcodes), ...arr(v.objects)]),
    ...arr(row.task?.objects).filter(o => !o.usage || o.usage === 'used').map(o => o.name)]);
  const out = [];
  for (const n of names) for (const t of ['TRAN', 'PROG', 'FUNC', 'FUGR', 'CLAS']) if (ids.has(`${t}:${n}`)) out.push(`${t}:${n}`);
  return out;
}

/** Objects one L4 touches: { name → { role, type, ev } } (writes beat calls beat reads). */
function touches(row, adj, nodes, depth = 5) {
  const seen = new Set(), got = new Map();
  let front = entries(row, nodes);
  front.forEach(f => seen.add(f));
  const rank = { writes: 3, calls: 2, reads: 1 };
  for (let d = 0; d < depth && front.length; d++) {
    const next = [];
    for (const id of front) for (const e of adj.get(id) || []) {
      const to = nodes.get(e.to);
      if (TOUCH[e.kind] && to && (to.type === 'TABL' || to.type === 'VIEW' || (e.kind === 'calls' && to.type === 'FUNC'))) {
        const prev = got.get(to.name);
        if (!prev || rank[e.kind] > rank[prev.role]) got.set(to.name, { role: e.kind, type: to.type, ev: { from: id.split(':')[1], ...(e.evidence?.[0] ? { unit: e.evidence[0].unit, line: e.evidence[0].line } : {}) } });
      }
      // walk only through customer code (members of the scope or custom objects), never into the standard
      if (WALK.has(e.kind) && to && to.scope !== 'standard' && !seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
    }
    front = next;
  }
  return got;
}

// standard functions that change data: a customer function calling one of them hands data over, it is no utility
const CHANGES = /^BAPI_w*(POST|CREATE|CHANGE|SAVE|CANCEL|REVERSE|DELETE|UPDATE)|POSTING_INTERFACE|DIRECT_INPUT|_POST(ING)?$|_(CREATE|UPDATE|CHANGE)(_|$)/;
/** Does a function write a table or call a data-changing standard function within a few calls? */
function changesData(id, adj, nodes, depth = 3) {
  // a function's code is recorded on its function group: walk the group too
  const start = [id, nodes.get(id)?.parent].filter(Boolean);
  const seen = new Set(start); let front = start;
  for (let d = 0; d < depth && front.length; d++) {
    const next = [];
    for (const x of front) for (const e of adj.get(x) || []) {
      if (e.kind === 'writes') return true;
      const to = nodes.get(e.to);
      if (e.kind === 'calls' && to?.type === 'FUNC' && CHANGES.test(to.name)) return true;
      if (WALK.has(e.kind) && to && to.scope !== 'standard' && !seen.has(e.to)) { seen.add(e.to); next.push(e.to); }
    }
    front = next;
  }
  return false;
}

/** crossModule note → L4 codes: a code, a backbone id ("SD.1.3.1"), or a program / TCode of a row. */
function notesByObject(model) {
  const rows = arr(model.rows).filter(r => r.level === 4);
  const byBackbone = new Map(rows.filter(r => r.backbone).map(r => [r.backbone, r.code]));
  const byObj = new Map();
  for (const r of rows) for (const o of [...arr(r.tcodes), ...arr(r.objects)]) if (!byObj.has(o)) byObj.set(o, r.code);
  const out = [];
  for (const c of arr(model.crossModule)) {
    const f = String(c.from || '');
    const code = rows.some(r => r.code === f) ? f : byBackbone.get(f) || byObj.get(f) || '';
    for (const o of String(c.object || '').split(/[\s/,·]+/).filter(Boolean)) out.push({ code, object: o.replace(/-.*$/, '').toUpperCase(), to: c.to || c.module || '', desc: c.desc || c.note || '' });
  }
  return out;
}

export function buildTouchpoints(mods, { pluginRoot, hubShare = 0.12, hubMin = 8, utilMin = 8, maxPairs = 4 } = {}) {
  const codes = moduleCodes(pluginRoot);
  const std = standardOwners(pluginRoot, codes);
  const names = new Set(mods.map(m => m.module));
  // per module and L4: the objects it touches
  const per = mods.map(m => {
    const nodes = new Map(arr(m.graph.nodes).map(n => [n.id, n]));
    const adj = adjacency(m.graph);
    const l4 = arr(m.model.rows).filter(r => r.level === 4);
    return { ...m, l4, touch: new Map(l4.map(r => [r.code, touches(r, adj, nodes)])), notes: notesByObject(m.model) };
  });
  // how many L4s of each module touch an object (to spot hubs)
  // all graphs together, to ask whether a called function changes data
  const allNodes = new Map(), allAdj = new Map();
  for (const p of per) for (const n of arr(p.graph.nodes)) allNodes.set(n.id, n);
  for (const p of per) for (const e of arr(p.graph.edges)) { if (!allAdj.has(e.from)) allAdj.set(e.from, []); allAdj.get(e.from).push(e); }
  const acts = new Map();
  const actsOf = (name) => { if (!acts.has(name)) acts.set(name, changesData(`FUNC:${name}`, allAdj, allNodes)); return acts.get(name); };
  const users = new Map();
  for (const p of per) for (const [code, t] of p.touch) for (const [name, x] of t) {
    const k = name; if (!users.has(k)) users.set(k, []); users.get(k).push({ module: p.module, code, role: x.role, from: x.ev?.from || '' });
  }
  const touchpoints = [], hubs = new Map(), stubs = {};
  for (const p of per) for (const [code, t] of p.touch) for (const [name, x] of t) {
    const owner = ownerOf(name, codes, std);
    if (!owner || owner === p.module) continue;
    const all = users.get(name) || [];
    const readers = all.filter(u => u.role === 'reads').length;
    const callers = all.filter(u => u.role === 'calls').length;
    const hubTable = readers >= hubMin && readers / Math.max(1, per.reduce((n, q) => n + q.l4.length, 0)) >= hubShare;
    // a widely read table (master data) and a function many tasks call (a shared utility) are summarised, not paired
    const kind = (x.role === 'reads' && hubTable) ? 'master' : (x.role === 'calls' && callers >= utilMin && !actsOf(name)) ? 'utility' : '';
    if (kind) {
      const h = hubs.get(name) || { object: name, type: x.type, owner, kind, users: {} };
      h.users[p.module] = (h.users[p.module] || 0) + 1; hubs.set(name, h); continue;
    }
    const tp = { from: { module: p.module, code }, object: name, type: x.type, owner, role: x.role, evidence: x.ev };
    const note = p.notes.find(n => n.object === name && (!n.code || n.code === code));
    if (note?.desc) tp.desc = note.desc;
    if (names.has(owner)) {
      // the other side: L4s of the owner module touching the same object, writers for a read, readers for a write
      // a write to a widely read table pairs with the tasks that create that data too, not with every reader
      // a call pairs with the owner's tasks that call the same function (they post the same way)
      const want = x.role === 'reads' ? ['writes', 'calls'] : x.role === 'calls' ? ['calls', 'writes'] : hubTable ? ['writes', 'calls'] : ['reads', 'writes'];
      const other = all.filter(u => u.module === owner && want.includes(u.role));
      const pick = other.sort((a, b) => want.indexOf(a.role) - want.indexOf(b.role)).slice(0, maxPairs);
      tp.to = pick.map(u => ({ module: owner, code: u.code, role: u.role, ...(u.from ? { program: u.from } : {}) }));
      if (!tp.to.length) tp.to = null;
    } else {
      tp.to = null; tp.stub = true;
      stubs[owner] = (stubs[owner] || 0) + 1;
    }
    touchpoints.push(tp);
  }
  // notes that name an object no graph edge reached still say something: keep them unpaired
  const known = new Set(touchpoints.map(t => `${t.from.code}|${t.object}`));
  const notesOnly = per.flatMap(p => p.notes.filter(n => n.code && names.has(n.to) && n.to !== p.module && !known.has(`${n.code}|${n.object}`))
    .map(n => ({ from: { module: p.module, code: n.code }, object: n.object, owner: n.to, role: 'note', desc: n.desc, to: null })));
  const pairs = touchpoints.filter(t => t.to);
  // per task: the program that touches each object of a touchpoint (where a step of an E2E scenario runs)
  const inTp = new Set([...touchpoints.map(t => t.object), ...hubs.keys()]);
  const programs = {};
  for (const [name, us] of users) if (inTp.has(name)) for (const u of us) if (u.from) (programs[`${u.module}|${u.code}`] ||= {})[name] = u.from;
  return {
    schema: 1, modules: mods.map(m => m.module), builtAt: new Date().toISOString(),
    states: Object.fromEntries(mods.map(m => [m.module, m.state || ''])),
    touchpoints: [...touchpoints, ...notesOnly],
    programs,
    hubs: [...hubs.values()].sort((a, b) => a.object.localeCompare(b.object)),
    stubs,
    counts: { touchpoints: touchpoints.length, paired: pairs.length, stubs: touchpoints.filter(t => t.stub).length, notesOnly: notesOnly.length, hubs: hubs.size },
  };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const args = process.argv.slice(2);
  const val = (k) => args[args.indexOf(k) + 1];
  const mods = [];
  args.forEach((a, i) => {
    if (a !== '--module') return;
    const [mod, rest] = args[i + 1].split('=');
    const [state, graphPath] = rest.split(',');
    const model = JSON.parse(fs.readFileSync(join(state, 'process-model.json'), 'utf8'));
    const graph = graphPath ? JSON.parse(fs.readFileSync(graphPath, 'utf8')) : { nodes: [], edges: [] };
    mods.push({ module: mod, state, model, graph });
  });
  const out = val('--out');
  if (mods.length < 1 || !out) {
    console.error('Usage: node cross-module.mjs --module SD=<state dir>[,<graph.json>] --module MM=<state dir>[,<graph.json>] --out <dir> [--plugin <root>]');
    process.exit(2);
  }
  const pluginRoot = args.includes('--plugin') ? val('--plugin') : resolve(dirname(thisFile), '../..');
  const res = buildTouchpoints(mods, { pluginRoot });
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(join(out, 'integration-touchpoints.json'), JSON.stringify(res, null, 1));
  console.log(JSON.stringify({ modules: res.modules, ...res.counts, stubsByModule: res.stubs }));
}
