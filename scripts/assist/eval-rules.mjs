// Evaluate a system's customer check rules (.sc4sap/work/<profile>/biz-rules/<MODULE>.json)
// for one business action, before the BAPI runs. Used by the /sc4sap:assist preview
// (PRECHECK) and by the scenario tests.
//
// Three-valued result per rule: fires = true | false | 'unknown'.
//   - 'unknown' when a needed fact is missing, an exists query was not answered,
//     or the condition is 'custom' / not machine-checkable.
//
// Facts:  { header: { 'EKKO-BSART': 'NB', 'SY-UNAME': 'X', ... }, items: [ { 'EKPO-WERKS': '1150', ... } ] }
//         A reference resolves in the item first (item-level tables), then in the header.
//         facts.multi: { 'JEST-STAT': ['I0001', 'I0002', ...] } holds facts with several values
//         (e.g. the active statuses of an order). A condition { foreach: 'JEST-STAT', cond: C }
//         evaluates C once per value (the value is bound to the reference 'JEST-STAT') and is
//         true when C is true for any value, false when it is false for all (or there is no value),
//         unknown when the multi fact is missing or an undecided value remains.
// Exists answers: { '<query key>': true | false } where the key comes from existsQueries().
//
// Rule scope: a rule may carry scope_condition (the IF wrappers of the code that raises the message,
// same condition syntax). A scope that is false means the rule does not apply: fires = false,
// scope = 'out'. A scope that is true or unknown keeps a rule that is not machine-checkable at
// 'unknown' (scope = 'in' / 'unknown'). For a machine-checkable rule the scope is a further
// condition: fires = scope AND condition, evaluated per item when either one reads item fields.
//
// Field reference syntax used by the rule catalog:
//   TABLE-FIELD          whole value
//   TABLE-FIELD(n)       first n characters
//   TABLE-FIELD(o:n)     n characters from offset o
//
// Leaf ops: eq ne in not_in initial not_initial lt le gt ge between len_le len_ge custom exists_in_table.
// exists_in_table key values: a literal, a TABLE-FIELD reference, $UNAME, $DATUM, or
//   { op: lt|le|gt|ge|ne|eq, value | ref } for a comparison (e.g. a valid-to date < posting date).
// A plain condition may compare two facts: { field: 'A-X', op: 'lt', ref: 'B-Y' }.

const REF_RE = /^([A-Z0-9_/]+)-([A-Z0-9_/]+)(?:\((\d+)(?::(\d+))?\))?$/;

export function parseRef(ref) {
  const m = REF_RE.exec(String(ref ?? '').trim());
  if (!m) return null;
  const [, table, field, a, b] = m;
  const base = `${table}-${field}`;
  if (a === undefined) return { base, table, field };
  if (b === undefined) return { base, table, field, off: 0, len: Number(a) };
  return { base, table, field, off: Number(a), len: Number(b) };
}

function lookup(ref, facts, item, bind) {
  const p = parseRef(ref);
  if (!p) return { known: false };
  let v;
  if (bind && Object.prototype.hasOwnProperty.call(bind, p.base)) v = bind[p.base];
  else if (item && Object.prototype.hasOwnProperty.call(item, p.base)) v = item[p.base];
  else if (facts?.header && Object.prototype.hasOwnProperty.call(facts.header, p.base)) v = facts.header[p.base];
  else return { known: false };
  v = v === null || v === undefined ? '' : String(v);
  if (p.len !== undefined) v = v.substr(p.off, p.len);
  return { known: true, value: v };
}

const isInitial = (v) => v === '' || /^0+(\.0+)?$/.test(v) || /^\s+$/.test(v);

function cmp(a, b) {
  const na = Number(a), nb = Number(b);
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
}

// Resolve the key of an exists_in_table condition into a query.
function resolveKey(cond, facts, item, bind) {
  const where = {};
  for (const [col, raw] of Object.entries(cond.key ?? {})) {
    if (raw && typeof raw === 'object') {
      let v = raw.value;
      if (raw.ref !== undefined) {
        if (raw.ref === '$UNAME' || raw.ref === '$DATUM') v = raw.ref;
        else { const r = lookup(raw.ref, facts, item, bind); if (!r.known) return null; v = r.value; }
      }
      where[col] = { op: raw.op ?? 'eq', value: String(v ?? '') };
      continue;
    }
    const s = String(raw);
    if (s === 'today' || s === '$DATUM') { where[col] = '$DATUM'; continue; }
    if (s === '$UNAME' || s === 'SY-UNAME') { where[col] = '$UNAME'; continue; }
    if (parseRef(s)) {
      const r = lookup(s, facts, item, bind);
      if (!r.known) return null;
      where[col] = r.value;
    } else {
      where[col] = s;
    }
  }
  return { table: cond.table, where };
}

// Wire format shared with SAP (PRECHECK mode, also on 7.31 where only flat
// strings travel): TABLE?COL=value&COL:op:value  (op = ne lt le gt ge; eq is '=').
// Columns may carry a suffix #n for a second condition on the same column.
// Values are percent-encoded for % & = : ? (and spaces stay as they are).
const enc = (v) => String(v).replace(/[%&=:?]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
export function queryKey(q) {
  const parts = Object.keys(q.where).sort().map((k) => {
    const w = q.where[k];
    if (w && typeof w === 'object' && w.op && w.op !== 'eq') return `${k}:${w.op}:${enc(w.value)}`;
    return `${k}=${enc(w && typeof w === 'object' ? w.value : w)}`;
  });
  return `${q.table}?${parts.join('&')}`;
}

function evalLeaf(c, facts, item, answers, unknowns, bind) {
  if (c.op === 'custom') { unknowns.push(`custom: ${c.text ?? ''}`); return 'unknown'; }
  if (c.op === 'exists_in_table') {
    const q = resolveKey(c, facts, item, bind);
    if (!q) { unknowns.push(`key of ${c.table} needs missing facts`); return 'unknown'; }
    const k = queryKey(q);
    if (!(k in (answers ?? {}))) { unknowns.push(`exists ${k} not answered`); return 'unknown'; }
    const found = !!answers[k];
    return c.negate ? !found : found;
  }
  const r = lookup(c.field, facts, item, bind);
  if (!r.known) { unknowns.push(`fact ${c.field} missing`); return 'unknown'; }
  const v = r.value;
  let vals = (c.values ?? (c.value !== undefined ? [c.value] : [])).map(String);
  if (c.ref !== undefined) {
    // field-to-field comparison: { field, op, ref: 'TABLE-FIELD' }
    const o = lookup(c.ref, facts, item, bind);
    if (!o.known) { unknowns.push(`fact ${c.ref} missing`); return 'unknown'; }
    vals = [String(o.value)];
  }
  switch (c.op) {
    case 'eq': case 'in': return vals.includes(v);
    case 'ne': case 'not_in': return !vals.includes(v);
    case 'initial': return isInitial(v);
    case 'not_initial': return !isInitial(v);
    case 'lt': return cmp(v, vals[0]) < 0;
    case 'le': return cmp(v, vals[0]) <= 0;
    case 'gt': return cmp(v, vals[0]) > 0;
    case 'ge': return cmp(v, vals[0]) >= 0;
    case 'between': return cmp(v, vals[0]) >= 0 && cmp(v, vals[1]) <= 0;
    case 'len_le': return v.trimEnd().length <= Number(vals[0]);
    case 'len_ge': return v.trimEnd().length >= Number(vals[0]);
    default: unknowns.push(`unsupported op ${c.op}`); return 'unknown';
  }
}

export function evalCondition(c, facts, item, answers, unknowns = [], bind = null) {
  if (!c) { unknowns.push('no machine condition'); return 'unknown'; }
  if (c.foreach !== undefined) {
    const vals = facts?.multi?.[c.foreach];
    if (!Array.isArray(vals)) { unknowns.push(`fact ${c.foreach} (several values) missing`); return 'unknown'; }
    let res = false;
    for (const v of vals) {
      const r = evalCondition(c.cond, facts, item, answers, unknowns, { ...(bind ?? {}), [c.foreach]: String(v) });
      if (r === true) return true;
      if (r === 'unknown') res = 'unknown';
    }
    return res;
  }
  if (Array.isArray(c.all)) {
    let res = true;
    for (const x of c.all) {
      const r = evalCondition(x, facts, item, answers, unknowns, bind);
      if (r === false) return false;
      if (r === 'unknown') res = 'unknown';
    }
    return res;
  }
  if (Array.isArray(c.any)) {
    let res = false;
    for (const x of c.any) {
      const r = evalCondition(x, facts, item, answers, unknowns, bind);
      if (r === true) return true;
      if (r === 'unknown') res = 'unknown';
    }
    return res;
  }
  if (c.not) {
    const r = evalCondition(c.not, facts, item, answers, unknowns, bind);
    return r === 'unknown' ? 'unknown' : !r;
  }
  return evalLeaf(c, facts, item, answers, unknowns, bind);
}

// Tables whose rows are the items of a document: the rule is evaluated once per item.
// MM / PP: EKPO EKET EKKN MSEG AFPO RESB MARA MARC MBEW T001W; SD: VBAP VBEP VBUP VBRP LIPS;
// FI: BSEG; CO: COEP, CORP (document lines; CORP = the line of a CO posting as the BAPI receives it).
const ITEM_TABLES = /^(EKPO|EKET|EKKN|MSEG|AFPO|RESB|VBAP|VBEP|VBUP|VBRP|LIPS|BSEG|COEP|CORP|MARA|MARC|MBEW|T001W)-/;

function usesItem(c) {
  if (!c) return false;
  if (c.all) return c.all.some(usesItem);
  if (c.any) return c.any.some(usesItem);
  if (c.not) return usesItem(c.not);
  if (c.foreach !== undefined) return usesItem(c.cond);
  const refs = [c.field, c.ref, ...Object.values(c.key ?? {}).map((x) => (x && typeof x === 'object' ? x.ref : x))].filter(Boolean).map(String);
  return refs.some((r) => ITEM_TABLES.test(r));
}

export function rulesFor(catalog, bapi, phases = ['check', 'post']) {
  return (catalog.rules ?? []).filter((r) => (r.bapis ?? []).includes(bapi) && phases.includes(r.phase));
}

// One condition over the items of the document: true when it is true for any item, unknown when
// no item makes it true and one is undecided, false otherwise. Without items it runs on the header facts.
function evalOverItems(cond, facts, answers, unknowns) {
  if (usesItem(cond) && (facts.items ?? []).length) {
    let res = false;
    for (const it of facts.items) {
      const x = evalCondition(cond, facts, it, answers, unknowns);
      if (x === true) return true;
      if (x === 'unknown') res = 'unknown';
    }
    return res;
  }
  return evalCondition(cond, facts, null, answers, unknowns);
}

// Evaluate every rule of a BAPI. Item-level rules fire when any item fires.
// Result per rule: fires, scope ('out' | 'in' | 'unknown' | undefined when the rule has no scope_condition).
export function evaluate(catalog, bapi, facts, answers = {}, opts = {}) {
  const out = [];
  for (const r of rulesFor(catalog, bapi, opts.phases)) {
    const unknowns = [];
    let fires;
    let scope;
    const machine = r.machine_checkable && r.condition;
    if (r.scope_condition) {
      if (machine) {
        // scope AND condition, per item
        const all = { all: [r.scope_condition, r.condition] };
        const sc = evalOverItems(r.scope_condition, facts, answers, []);
        scope = sc === true ? 'in' : sc === false ? 'out' : 'unknown';
        fires = scope === 'out' ? false : evalOverItems(all, facts, answers, unknowns);
      } else {
        const sc = evalOverItems(r.scope_condition, facts, answers, unknowns);
        scope = sc === true ? 'in' : sc === false ? 'out' : 'unknown';
        if (scope === 'out') fires = false;
        else {
          fires = 'unknown';
          unknowns.push('not machine-checkable');
        }
      }
    } else if (!machine) {
      fires = 'unknown';
      unknowns.push('not machine-checkable');
    } else {
      fires = evalOverItems(r.condition, facts, answers, unknowns);
    }
    out.push({
      id: r.id, fires, scope, phase: r.phase, type: r.message?.type ?? 'E',
      message: r.message, applies_when: r.applies_when,
      unknowns: fires === 'unknown' ? [...new Set(unknowns)] : [],
    });
  }
  return out;
}

// Blocking verdict for a preview: 'blocked' when an E/A rule fires,
// 'review' when an E/A rule is unknown, else 'clear'.
export function verdict(results) {
  const blocking = results.filter((r) => ['E', 'A'].includes(r.type));
  if (blocking.some((r) => r.fires === true)) return 'blocked';
  if (blocking.some((r) => r.fires === 'unknown')) return 'review';
  return 'clear';
}

// The exists queries a PRECHECK call must answer (deduplicated), for the given facts.
export function existsQueries(catalog, bapi, facts, opts = {}) {
  const seen = new Map();
  const visit = (c, item, bind) => {
    if (!c) return;
    if (c.foreach !== undefined) {
      const vals = facts?.multi?.[c.foreach];
      if (Array.isArray(vals)) vals.forEach((v) => visit(c.cond, item, { ...(bind ?? {}), [c.foreach]: String(v) }));
      return;
    }
    if (c.all) {
      // A fact condition that is already false makes the rest irrelevant (no query is asked for it).
      for (const x of c.all) {
        if (evalCondition(x, facts, item, {}, [], bind) === false) return;
        visit(x, item, bind);
      }
      return;
    }
    if (c.any) return c.any.forEach((x) => visit(x, item, bind));
    if (c.not) return visit(c.not, item, bind);
    if (c.op !== 'exists_in_table') return;
    const q = resolveKey(c, facts, item, bind);
    if (q) seen.set(queryKey(q), q);
  };
  for (const r of rulesFor(catalog, bapi, opts.phases)) {
    if (!r.machine_checkable) continue;
    const cond = r.scope_condition ? { all: [r.scope_condition, r.condition] } : r.condition;
    if (usesItem(cond) && (facts.items ?? []).length) facts.items.forEach((it) => visit(cond, it, null));
    else visit(cond, null, null);
  }
  return [...seen.entries()].map(([key, q]) => ({ key, ...q }));
}

// The document facts the rules of a BAPI read (TABLE-FIELD, offsets removed).
export function factsNeeded(catalog, bapi, opts = {}) {
  const set = new Set();
  const visit = (c) => {
    if (!c) return;
    if (c.all) return c.all.forEach(visit);
    if (c.any) return c.any.forEach(visit);
    if (c.not) return visit(c.not);
    if (c.foreach !== undefined) { set.add(c.foreach); return visit(c.cond); }
    const refs = [c.field, c.ref, ...Object.values(c.key ?? {}).map((x) => (x && typeof x === 'object' ? x.ref : x))].filter(Boolean).map(String);
    for (const r of refs) { const p = parseRef(r); if (p) set.add(p.base); }
  };
  // The scope of every rule is needed (a false scope settles a rule that cannot be evaluated otherwise).
  for (const r of rulesFor(catalog, bapi, opts.phases)) {
    if (r.scope_condition) visit(r.scope_condition);
    if (r.machine_checkable) visit(r.condition);
  }
  return [...set].sort();
}
