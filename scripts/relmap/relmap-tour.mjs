// sc4sap:cbo-relation-map — guided tours: one per business entry point, built from the graph only (no LLM).
//
// The tour UX (numbered steps, the step's objects lit on the drawing, prev / next, a progress bar) follows
// Understand-Anything's LearnPanel (MIT, Egonex-AI/Understand-Anything); the steps here are not chosen by a
// model but walked deterministically, in the order a consultant reads a CBO flow:
//
//   entry    the TCode (or a root report no other object calls)
//   program  what the TCode launches
//   calls    code reached from there, one step per depth (1–3), most connected first
//   writes   tables the flow creates / updates / deletes (C / U / D letters per table)
//   reads    tables it only reads
//   shared   other TCodes that change the same tables (test them together)
//
// Entries: TCodes that launch something, ranked used-directly first, then by what they reach; root reports
// (no incoming call / submit / launch / include) fill up when fewer than MIN_TCODE_TOURS TCodes qualify.
// Tour row: { e: entry node, s: [[step kind, nodes[], total, letters[]?, depth?]], a?: other TCodes running the same
// program(s) } — texts come from the page. Up to 200 tours; the page lists them with a search.

const CODE_KINDS = ['launches', 'starts', 'calls', 'submits', 'include', 'uses'];
const CODE_TYPES = new Set(['PROG', 'FUGR', 'FUNC', 'CLAS', 'INTF', 'TRAN', 'INCL']);
const DATA_TYPES = new Set(['TABL', 'VIEW']);
const OP_LETTER = { INSERT: 'C', MODIFY: 'CU', UPDATE: 'U', DELETE: 'D' };
const MIN_TCODE_TOURS = 3;
const MAX_DEPTH = 3;
const PER_STEP = 5;
const SHARED_DEPTH = 4;

export const TOUR_STEPS = ['entry', 'program', 'calls', 'writes', 'reads', 'shared'];

/** C / U / D letters of one writes edge (unknown op → U, as in the CRUD tab) */
export function writeLetters(model, e) {
  const ops = e[5] >= 0 ? String(model.ops[e[5]]).split('/') : [];
  const s = new Set();
  for (const o of ops) for (const c of OP_LETTER[o] || 'U') s.add(c);
  return ['C', 'U', 'D'].filter((c) => s.has(c)).join('') || 'U';
}

export function buildTours(model, { max = 200 } = {}) {
  const N = model.nodes.length;
  const type = (i) => model.types[model.nodes[i][1]];
  const biz = (i) => model.nodes[i][5];
  const usage = (i) => model.nodes[i][8];
  const kix = (k) => model.kinds.indexOf(k);
  const code = new Set(CODE_KINDS.map(kix).filter((x) => x >= 0));
  const kLaunch = kix('launches'), kWrite = kix('writes'), kRead = kix('reads');
  const out = Array.from({ length: N }, () => []), inn = Array.from({ length: N }, () => []);
  model.edges.forEach((e, k) => { out[e[0]].push(k); inn[e[1]].push(k); });
  const byBiz = (a, b) => biz(b) - biz(a) || String(model.nodes[a][0]).localeCompare(String(model.nodes[b][0]));

  // TCodes that reach a node over code relations, walked backwards (for "shared")
  const tcodeMemo = new Map();
  const tcodesOf = (start) => {
    if (tcodeMemo.has(start)) return tcodeMemo.get(start);
    const seen = new Set([start]), found = new Set();
    let q = [start];
    for (let d = 0; d < SHARED_DEPTH && q.length; d++) {
      const next = [];
      for (const x of q) for (const k of inn[x]) {
        const e = model.edges[k];
        if (!code.has(e[2]) || seen.has(e[0])) continue;
        seen.add(e[0]);
        if (type(e[0]) === 'TRAN') found.add(e[0]); else next.push(e[0]);
      }
      q = next;
    }
    if (type(start) === 'TRAN') found.add(start);
    tcodeMemo.set(start, found);
    return found;
  };

  function walk(entry) {
    const steps = [], reach = new Set([entry]);
    steps.push(['entry', [entry], 1]);
    let frontier = [entry];
    if (type(entry) === 'TRAN') {
      const progs = [...new Set(out[entry].filter((k) => model.edges[k][2] === kLaunch).map((k) => model.edges[k][1]))].sort(byBiz);
      if (!progs.length) return null;
      for (const p of progs) reach.add(p);
      steps.push(['program', progs.slice(0, PER_STEP), progs.length]);
      frontier = progs;
    }
    for (let d = 1; d <= MAX_DEPTH && frontier.length; d++) {
      const next = [];
      for (const x of frontier) for (const k of out[x]) {
        const e = model.edges[k], j = e[1];
        if (!code.has(e[2]) || reach.has(j) || !CODE_TYPES.has(type(j))) continue;
        reach.add(j); next.push(j);
      }
      if (!next.length) break;
      next.sort(byBiz);
      steps.push(['calls', next.slice(0, PER_STEP), next.length, null, d]);
      frontier = next;
    }
    // tables: written (C / U / D merged over every writer in the flow) and read-only
    const written = new Map(), read = new Set();
    for (const x of reach) for (const k of out[x]) {
      const e = model.edges[k], t = e[1];
      if (!DATA_TYPES.has(type(t))) continue;
      if (e[2] === kWrite) written.set(t, (written.get(t) || '') + writeLetters(model, e));
      else if (e[2] === kRead) read.add(t);
    }
    const letters = (s) => ['C', 'U', 'D'].filter((c) => s.includes(c)).join('');
    if (written.size) {
      const w = [...written.keys()].sort((a, b) => letters(written.get(b)).length - letters(written.get(a)).length || byBiz(a, b));
      steps.push(['writes', w.slice(0, PER_STEP), w.length, w.slice(0, PER_STEP).map((t) => letters(written.get(t)))]);
    }
    const r = [...read].filter((t) => !written.has(t)).sort(byBiz);
    if (r.length) steps.push(['reads', r.slice(0, PER_STEP), r.length]);
    // other TCodes that change the same tables
    if (written.size) {
      const hits = new Map();
      for (const t of written.keys()) for (const k of inn[t]) {
        const e = model.edges[k];
        if (e[2] !== kWrite || reach.has(e[0])) continue;
        for (const tc of tcodesOf(e[0])) if (tc !== entry) hits.set(tc, (hits.get(tc) || 0) + 1);
      }
      const sh = [...hits.keys()].sort((a, b) => hits.get(b) - hits.get(a) || byBiz(a, b));
      if (sh.length) steps.push(['shared', sh.slice(0, PER_STEP), sh.length]);
    }
    const tables = written.size + r.length;
    const key = type(entry) === 'TRAN' ? steps[1][1].slice().sort((a, b) => a - b).join(',') : `p${entry}`;
    return steps.length >= 3 ? { e: entry, s: steps, reach: reach.size - 1 + tables, writes: written.size, key } : null;
  }

  const rankUsage = (i) => (usage(i) === 0 ? 0 : usage(i) === 1 ? 1 : usage(i) === 2 ? 3 : 2);
  const rank = (a, b) => rankUsage(a.e) - rankUsage(b.e) || b.writes - a.writes || b.reach - a.reach || byBiz(a.e, b.e);
  let tours = [];
  for (let i = 0; i < N; i++) if (type(i) === 'TRAN') { const t = walk(i); if (t) tours.push(t); }
  // TCodes that run the same program(s) walk the same flow: one tour, the others named on its entry step
  tours.sort(rank);
  const byKey = new Map();
  tours = tours.filter((t) => {
    const first = byKey.get(t.key);
    if (first) { (first.a ||= []).push(t.e); return false; }
    byKey.set(t.key, t);
    return true;
  });
  if (tours.length < MIN_TCODE_TOURS) {
    for (let i = 0; i < N; i++) {
      if (type(i) !== 'PROG' || inn[i].some((k) => code.has(model.edges[k][2]))) continue;
      const t = walk(i); if (t) tours.push(t);
    }
    tours.sort(rank);
  }
  return tours.slice(0, max).map(({ e, s, a }) => (a ? { e, s, a } : { e, s }));
}
