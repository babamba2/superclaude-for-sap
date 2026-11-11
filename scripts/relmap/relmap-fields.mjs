// sc4sap:cbo-relation-map — the field tab's model: fields.json (extract-fields.mjs) → a compact block `M.fx`.
//
// Only tables with at least one SQL reference carry their field list; the others are counted (`idle`). Evidence
// texts are shared (one SELECT names many fields), objects are resolved to relation-map node indexes so the
// page can reach their TCodes through the impact walk.
//
//   tabs: [name, scope 0 member | 1 append, node index | -1, [[field, key 0|1, struct index | -1], …]]
//   r:    [table, field index | -1 (whole row), op 0..4 (C R U D F), object, count, evidence, snippet | -1, low 0|1]
//   o:    object ids ("PROG:X"), oi: their node index | -1      e: evidence texts      st: structure names
//   job:  node indexes of programs that ran as job steps (usage-result reasons)

export const FX_OPS = ['C', 'R', 'U', 'D', 'F'];
const EV_CHARS = 110;
const IDLE_CAP = 500;

const cut = (t, n) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const evText = (x) => (x ? [x.line ? `${x.unit}:${x.line}` : x.unit, cut(String(x.text || '').replace(/\s+/g, ' ').trim(), EV_CHARS)].filter(Boolean).join(' ') : '');

/** several fields.json (one per package) → one: tables by first sight, refs summed per (table, field, op, object) */
export function mergeFields(list) {
  const out = { tables: {}, structures: {}, refs: [] };
  const refs = new Map();
  for (const fx of list.filter(Boolean)) {
    for (const [t, v] of Object.entries(fx.tables || {})) out.tables[t] ||= v;
    for (const [s, v] of Object.entries(fx.structures || {})) {
      const cur = out.structures[s] || (out.structures[s] = { fields: v.fields, tables: [] });
      for (const t of v.tables) if (!cur.tables.includes(t)) cur.tables.push(t);
    }
    for (const r of fx.refs || []) {
      const k = `${r.t}|${r.f}|${r.op}|${r.from}`;
      const cur = refs.get(k);
      if (!cur) refs.set(k, { ...r, evidence: [...(r.evidence || [])] });
      else { cur.count += r.count; if (!r.confidence) delete cur.confidence; }
    }
  }
  out.refs = [...refs.values()];
  return out;
}

/**
 * @param fx      merged fields.json
 * @param model   relmap model (nodes, types; snip / sn when the page carries snippets)
 * @param opts    { snippets: (unit, line) → { start, text } | null, jobs: Set<node id> }
 */
export function buildFieldBlock(fx, model, { snippets = null, jobs = new Set() } = {}) {
  if (!fx || !fx.refs?.length) return null;
  const nodeIx = new Map(model.nodes.map((n, i) => [`${model.types[n[1]]}:${n[0]}`, i]));
  const used = new Set(fx.refs.map((r) => r.t));
  const tabNames = Object.keys(fx.tables).filter((t) => used.has(t)).sort();
  const tabIx = new Map(tabNames.map((t, i) => [t, i]));
  const st = [], stIx = new Map();
  const structOf = (s) => {
    if (!s) return -1;
    if (!stIx.has(s)) stIx.set(s, st.push(s) - 1);
    return stIx.get(s);
  };
  const fieldIx = new Map();
  const tabs = tabNames.map((t) => {
    const v = fx.tables[t];
    const fields = v.fields.map((f, k) => { fieldIx.set(`${t}|${f.name}`, k); return [f.name, f.key ? 1 : 0, structOf(f.struct)]; });
    const n = nodeIx.get(`TABL:${t}`) ?? nodeIx.get(`VIEW:${t}`) ?? -1;
    return [t, v.scope === 'append' ? 1 : 0, n, fields];
  });
  const o = [], oIx = new Map(), e = [], eIx = new Map();
  const objOf = (id) => { if (!oIx.has(id)) oIx.set(id, o.push(id) - 1); return oIx.get(id); };
  const evOf = (s) => { if (!eIx.has(s)) eIx.set(s, e.push(s) - 1); return eIx.get(s); };
  // snippets share the relation map's store
  let snipIx = null;
  if (snippets) {
    model.snip ||= [];
    snipIx = new Map(model.snip.map((s, i) => [`${s[0]}|${s[2]}`, i]));
  }
  const snipOf = (x) => {
    if (!snippets || !x?.line) return -1;
    const key = `${x.unit}|${x.line}`;
    if (!snipIx.has(key)) {
      const s = snippets(x.unit, x.line);
      snipIx.set(key, s ? model.snip.push([x.unit, s.start, x.line, s.text]) - 1 : -1);
    }
    return snipIx.get(key);
  };
  const r = [];
  let dropped = 0;
  for (const ref of fx.refs) {
    const ti = tabIx.get(ref.t);
    const fi = ref.f === '*' ? -1 : fieldIx.get(`${ref.t}|${ref.f}`);
    if (ti === undefined || fi === undefined) { dropped++; continue; }
    const x = ref.evidence?.[0];
    r.push([ti, fi, FX_OPS.indexOf(ref.op), objOf(ref.from), ref.count, evOf(evText(x)), snipOf(x), ref.confidence === 'low' ? 1 : 0]);
  }
  r.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const idleAll = Object.keys(fx.tables).filter((t) => !used.has(t) && fx.tables[t].scope !== 'append').sort();
  const oi = o.map((id) => nodeIx.get(id) ?? -1);
  return {
    tabs, st, o, oi, e, r,
    job: [...jobs].map((id) => nodeIx.get(id)).filter((i) => i !== undefined),
    idle: idleAll.slice(0, IDLE_CAP), idleCount: idleAll.length,
    stats: { tables: tabs.length, fields: tabs.reduce((s, t) => s + t[3].length, 0), refs: r.length, appendTables: tabs.filter((t) => t[1]).length, dropped },
  };
}
