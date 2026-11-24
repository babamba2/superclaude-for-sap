// sc4sap:cbo-relation-map — process areas: the module-to-process model (L2 → L3 → L4) laid onto the map.
//
// Understand-Anything shows business domains → flows → steps (an LLM guesses them, MIT, Egonex-AI/Understand-Anything).
// Here they come from the consultant-reviewed process-model.json of /sc4sap:module-to-process: domain = L2 process
// chain, flow = L3 process, step = L4 task. A step's TCodes and objects are matched to map nodes by name; from
// there code relations (launches, calls, submits, …, depth ≤ REACH) lead to the tables the step changes and reads.
// Hand-offs between domains come from the source, not from a model: domain A changes a table that domain B reads.
// Without a process model the Louvain groups stand in as domains (no flows).
//
// Output: { kind: 'process' | 'groups', src, doms: [{ c, l, l1, f: [{ c, l, s: [step] }], g?, n: [steps, objs, w, r] }],
//           hand: [[fromDom, toDom, tables[], count]], stats }
// step = { c, l, k: kind, u: usage, t: [TRAN nodes], o: [other nodes], w: [[table, 'CUD']], r: [tables] (each list up to
//          CAP), nn: [t, o, w, r totals], m: unmatched names count, std: [first standard TCodes], ln: [[code, note]] }

import { writeLetters } from './relmap-tour.mjs';

const CODE_KINDS = ['launches', 'starts', 'calls', 'submits', 'include', 'uses'];
const DATA = new Set(['TABL', 'VIEW']);
const PREFER = ['PROG', 'FUNC', 'CLAS', 'FUGR', 'INTF', 'TABL', 'VIEW', 'STRU', 'TTYP', 'TRAN', 'DTEL', 'DOMA'];
const REACH = 2;
const CAP = 30;
const HAND_TABLES = 8;

const arr = (v) => (Array.isArray(v) ? v : []);
const segs = (c) => String(c ?? '').split('.').filter(Boolean);

function graphIndex(model) {
  const N = model.nodes.length, type = (i) => model.types[model.nodes[i][1]];
  const out = Array.from({ length: N }, () => []);
  model.edges.forEach((e, k) => out[e[0]].push(k));
  const byName = new Map();
  for (let i = 0; i < N; i++) { const n = String(model.nodes[i][0]).toUpperCase(); (byName.get(n) || byName.set(n, []).get(n)).push(i); }
  const code = new Set(CODE_KINDS.map((k) => model.kinds.indexOf(k)).filter((x) => x >= 0));
  const kW = model.kinds.indexOf('writes'), kR = model.kinds.indexOf('reads');
  return { N, type, out, byName, code, kW, kR };
}

/** tables changed (with C / U / D) and read from a start set, over code relations up to REACH steps */
function tablesFrom(model, gx, start) {
  const seen = new Set(start);
  let q = [...start];
  for (let d = 0; d < REACH && q.length; d++) {
    const next = [];
    for (const x of q) for (const k of gx.out[x]) {
      const e = model.edges[k];
      if (gx.code.has(e[2]) && !seen.has(e[1]) && !DATA.has(gx.type(e[1]))) { seen.add(e[1]); next.push(e[1]); }
    }
    q = next;
  }
  const w = new Map(), r = new Set();
  for (const x of seen) for (const k of gx.out[x]) {
    const e = model.edges[k];
    if (!DATA.has(gx.type(e[1]))) continue;
    if (e[2] === gx.kW) w.set(e[1], (w.get(e[1]) || '') + writeLetters(model, e));
    else if (e[2] === gx.kR) r.add(e[1]);
  }
  const letters = (s) => ['C', 'U', 'D'].filter((c) => s.includes(c)).join('');
  return { w: new Map([...w].map(([t, s]) => [t, letters(s)])), r: new Set([...r].filter((t) => !w.has(t))) };
}

/** hand-offs: domain a changes a table that domain b reads (a ≠ b), most tables first */
function handOffs(doms, wOf, rOf) {
  const hand = [];
  doms.forEach((_, a) => doms.forEach((__, b) => {
    if (a === b) return;
    const ts = [...wOf[a].keys()].filter((t) => rOf[b].has(t));
    if (ts.length) hand.push([a, b, ts.slice(0, HAND_TABLES), ts.length]);
  }));
  return hand.sort((x, y) => y[3] - x[3] || x[0] - y[0] || x[1] - y[1]);
}

export function buildDomains(model, pm, { file = '' } = {}) {
  const gx = graphIndex(model);
  if (pm && arr(pm.rows).length) return fromProcess(model, gx, pm, file);
  return fromGroups(model, gx);
}

function fromProcess(model, gx, pm, file) {
  const rows = arr(pm.rows).map((r) => ({ ...r, code: String(r.code ?? ''), level: Number(r.level) || segs(r.code).length }));
  const l1Of = new Map(rows.filter((r) => r.level === 1).map((r) => [r.code, r.label || r.code]));
  const pick = (name, tcode) => {
    const hit = gx.byName.get(String(name).trim().toUpperCase());
    if (!hit) return -1;
    if (tcode) { const t = hit.find((i) => gx.type(i) === 'TRAN'); if (t !== undefined) return t; }
    return hit.slice().sort((a, b) => (PREFER.indexOf(gx.type(a)) + 99) % 99 - (PREFER.indexOf(gx.type(b)) + 99) % 99)[0];
  };
  const doms = [], wOf = [], rOf = [];
  let steps = 0, matched = 0;
  for (const d of rows.filter((r) => r.level === 2)) {
    const dom = { c: d.code, l: d.label || d.code, l1: l1Of.get(segs(d.code)[0]) || '', f: [] };
    const dw = new Map(), dr = new Set(), dObj = new Set();
    for (const fl of rows.filter((r) => r.level === 3 && segs(r.code).slice(0, 2).join('.') === d.code)) {
      const flow = { c: fl.code, l: fl.label || fl.code, s: [] };
      for (const st of rows.filter((r) => r.level === 4 && segs(r.code).slice(0, 3).join('.') === fl.code)) {
        const tcNames = [...new Set([...arr(st.tcodes), ...arr(st.variants).flatMap((v) => arr(v.tcodes))].map(String))];
        const obNames = [...new Set([...arr(st.objects), ...arr(st.variants).flatMap((v) => arr(v.objects))].map(String))];
        const t = new Set(), o = new Set(), std = [];
        let miss = 0;
        for (const n of tcNames) { const i = pick(n, true); if (i < 0) { miss++; if (!/^[ZY]/i.test(n) && std.length < 6) std.push(n); } else (gx.type(i) === 'TRAN' ? t : o).add(i); }
        for (const n of obNames) { const i = pick(n, false); if (i < 0) miss++; else if (!t.has(i)) (gx.type(i) === 'TRAN' ? t : o).add(i); }
        const start = [...t, ...o];
        const { w, r } = start.length ? tablesFrom(model, gx, start) : { w: new Map(), r: new Set() };
        for (const i of o) if (DATA.has(gx.type(i))) { o.delete(i); if (!w.has(i)) r.add(i); }
        // a program named like one of the step's TCodes is what that TCode runs: listed once, under TCodes
        const tNames = new Set([...t].map((i) => String(model.nodes[i][0])));
        for (const i of o) if (gx.type(i) === 'PROG' && tNames.has(String(model.nodes[i][0]))) o.delete(i);
        steps++; if (start.length) matched++;
        for (const [k, v] of w) dw.set(k, v); for (const k of r) dr.add(k); for (const i of start) dObj.add(i);
        flow.s.push({
          c: st.code, l: st.label || st.code, k: st.kind || '', u: st.usage || '',
          t: [...t].slice(0, CAP), o: [...o].slice(0, CAP), w: [...w].slice(0, CAP), r: [...r].slice(0, CAP), nn: [t.size, o.size, w.size, r.size], m: miss, std,
          ln: arr(st.task?.links).map((x) => (typeof x === 'string' ? [x, ''] : [String(x.code || ''), String(x.note || '')])).filter((x) => x[0]),
        });
      }
      if (flow.s.length) dom.f.push(flow);
    }
    for (const k of dw.keys()) dr.delete(k);
    dom.n = [dom.f.reduce((s, f) => s + f.s.length, 0), dObj.size, dw.size, dr.size];
    doms.push(dom); wOf.push(dw); rOf.push(dr);
  }
  return {
    kind: 'process',
    src: { file, module: pm.module || '', title: pm.title || '', lang: pm.lang || '', system: pm.system || '', version: pm.version || '' },
    doms, hand: handOffs(doms, wOf, rOf), stats: { domains: doms.length, steps, matched },
  };
}

function fromGroups(model, gx) {
  const doms = [], wOf = [], rOf = [];
  for (const c of model.comms || []) {
    const members = [];
    for (let i = 0; i < model.nodes.length; i++) if (model.nodes[i][3] === c.id) members.push(i);
    const w = new Map(), r = new Set();
    for (const x of members) for (const k of gx.out[x]) {
      const e = model.edges[k];
      if (!DATA.has(gx.type(e[1]))) continue;
      if (e[2] === gx.kW) w.set(e[1], 1); else if (e[2] === gx.kR) r.add(e[1]);
    }
    for (const k of w.keys()) r.delete(k);
    doms.push({ c: `G${c.id + 1}`, l: c.label || `G${c.id + 1}`, l1: '', f: [], g: c.id, n: [0, members.length, w.size, r.size] });
    wOf.push(w); rOf.push(r);
  }
  return { kind: 'groups', src: {}, doms, hand: handOffs(doms, wOf, rOf), stats: { domains: doms.length, steps: 0, matched: 0 } };
}
