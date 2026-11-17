// sc4sap:smartform-to-adobe — the plan against what SAP's own migration really wrote (P2): context, layout,
// interface and log, node by node. Read-only; no SAP call, no I/O in the functions.
//
//   compareMigration({ plan, formXml, layoutXdp, interfaceXml?, log? }) → {
//     context   { matched, onlyPlan [{ path, kind }], onlyReal [{ path, kind, cls }], kindDiffs, fieldDiffs, conditionDiffs }
//     layout    { matched, onlyPlan [{ path, el }], onlyReal [{ path, el }] }
//     interface { onlyPlan [names], onlyReal [names] }
//     log       { matched, orderBreaks, onlyPlan [{ code, node }], onlyReal [{ type, text }] }   (log: SAP's BAL lines, optional)
//     byMethod  { <CL_SSF_MIGRATION method>: { nodes, contextDiffs, layoutDiffs } }   — where a rule of mapping.md is wrong
//     summary   { contextMatch, layoutMatch, interfaceMatch, logMatch }   (shares, 0…1)
//   }
// formXml / layoutXdp / interfaceXml: the SFP downloads FP_CONTENT returns for the migrated form (GetAdobeFormContent).
// Paths are the node names from the root, joined with "/" (loop data and folders included); the layout path keeps only
// named elements (subform, subformSet, pageSet, pageArea, contentArea, draw, field, exclGroup).

import { readContext, readInterface, readXdp, kids } from './read-adobe.mjs';

// plan context types → the kinds read-adobe gives the CL_FP_* classes (unknown classes by class name)
const PLAN_KIND = { folder: 'folder', data: 'data', loop: 'loop', 'loop-data': 'loop-data', 'text-module': 'text-module', 'text-include': 'text',
  'text-dynamic': 'text-dynamic', 'graphic-url': 'graphic-url', address: 'address', command: 'command', 'program-lines': 'program-lines', alternative: 'alternative' };
const realKind = (n) => {
  if (n.kind && n.kind !== 'unknown' && n.kind !== 'graphic') return n.kind;
  const c = String(n.cls || '');
  if (/PROGRAM/i.test(c)) return 'program-lines';
  if (/COMMAND/i.test(c)) return 'command';
  if (/DYNAMIC/i.test(c)) return 'text-dynamic';
  if (/GRAPHIC/i.test(c)) return 'graphic-url';
  return n.kind || c;
};
const condText = (rows) => (rows || []).map((r) => (typeof r === 'string' ? r : [r.loperator || r.lop || '', r.operand1 || r.op1 || '', r.coperator || r.cop || '', r.operand2 || r.op2 || ''].join(' ')).replace(/\s+/g, ' ').trim()).filter(Boolean);

function flattenPlan(root) {
  const out = new Map();
  const walk = (n, path) => {
    for (const c of [...(n.children || []), ...Object.entries(n.branches || {}).flatMap(([b, list]) => list.map((x) => ({ ...x, branch: b })))]) {
      const p = [...path, c.name].join('/');
      out.set(p, { path: p, kind: PLAN_KIND[c.type] || c.type, field: c.field || '', condition: condText(c.condition), from: c.from || '' });
      walk(c, [...path, c.name]);
    }
  };
  walk(root, []);
  return out;
}

function flattenReal(root) {
  const out = new Map();
  const walk = (n, path) => {
    for (const c of n.children || []) {
      const p = [...path, c.name].join('/');
      out.set(p, { path: p, kind: realKind(c), cls: c.cls, field: c.field || '', condition: condText(c.conditions) });
      walk(c, [...path, c.name]);
    }
  };
  if (root) walk(root, []);
  return out;
}

const NAMED = new Set(['subform', 'subformSet', 'pageSet', 'pageArea', 'contentArea', 'draw', 'field', 'exclGroup']);
function flattenLayoutPlan(root) {
  const out = [];
  const walk = (n, path) => {
    for (const c of n.children || []) {
      const here = c.name ? [...path, c.name] : path;
      if (NAMED.has(c.el)) out.push({ path: here.join('/'), el: c.el, from: c.from || '' });
      walk(c, here);
    }
  };
  walk(root, []);
  return out;
}
function flattenLayoutReal(template) {
  const out = [];
  const walk = (el, path) => {
    for (const c of kids(el)) {
      const tag = c.tag;
      const name = c.attrs?.name || '';
      const here = name ? [...path, name] : path;
      if (NAMED.has(tag)) out.push({ path: here.join('/'), el: tag });
      walk(c, here);
    }
  };
  if (template) walk(template, []);
  return out;
}

/** A multiset match of { path, el } lists: each real element used once. */
function matchLists(plan, real) {
  const pool = new Map();
  for (const r of real) { const k = `${r.el}|${r.path}`; pool.set(k, (pool.get(k) || 0) + 1); }
  const onlyPlan = [];
  let matched = 0;
  for (const p of plan) {
    const k = `${p.el}|${p.path}`;
    if (pool.get(k)) { pool.set(k, pool.get(k) - 1); matched++; } else onlyPlan.push(p);
  }
  const onlyReal = [];
  for (const [k, n] of pool) for (let i = 0; i < n; i++) { const [el, path] = k.split('|'); onlyReal.push({ el, path }); }
  return { matched, onlyPlan, onlyReal };
}

/** Plan vs SAP's migrated form (see the header). */
export function compareMigration({ plan, formXml, layoutXdp, interfaceXml = '', log = [] }) {
  // context
  const p = flattenPlan(plan.context);
  const r = flattenReal(readContext(formXml).context);
  const kindDiffs = [], fieldDiffs = [], conditionDiffs = [];
  let cMatched = 0;
  for (const [path, x] of p) {
    const y = r.get(path);
    if (!y) continue;
    cMatched++;
    if (x.kind !== y.kind) kindDiffs.push({ path, plan: x.kind, real: y.kind, cls: y.cls, from: x.from });
    if (x.field && y.field && x.field.toUpperCase() !== y.field.toUpperCase()) fieldDiffs.push({ path, plan: x.field, real: y.field, from: x.from });
    if (JSON.stringify(x.condition) !== JSON.stringify(y.condition)) conditionDiffs.push({ path, plan: x.condition, real: y.condition, from: x.from });
  }
  const onlyPlanC = [...p.values()].filter((x) => !r.has(x.path)).map((x) => ({ path: x.path, kind: x.kind, from: x.from }));
  const onlyRealC = [...r.values()].filter((y) => !p.has(y.path)).map((y) => ({ path: y.path, kind: y.kind, cls: y.cls }));

  // layout
  const lp = flattenLayoutPlan(plan.layout);
  const lr = flattenLayoutReal(readXdp(layoutXdp).template);
  const L = matchLists(lp, lr);

  // interface
  let iface = null;
  if (interfaceXml && plan.interface) {
    const real = new Set(readInterface(interfaceXml).params.map((x) => x.name));
    const mine = new Set([...plan.interface.import, ...plan.interface.export, ...plan.interface.tables, ...plan.interface.exceptions]);
    iface = { onlyPlan: [...mine].filter((x) => !real.has(x)), onlyReal: [...real].filter((x) => !mine.has(x)), total: new Set([...mine, ...real]).size };
  }

  // SAP log (BAL texts) vs the predicted messages: same type (E / W) when the line has one, the node name and the field
  // (when the message names one) in the text; matched lines must keep the plan's order (orderBreaks counts the misses)
  let logCmp = null;
  if (log.length) {
    const used = new Set();
    const onlyPlan = [];
    let matched = 0, orderBreaks = 0, last = -1;
    for (const m of plan.log) {
      const field = /Field (\S+)/.exec(m.text)?.[1];
      const i = log.findIndex((l, j) => !used.has(j) && (!l.type || l.type === m.type) && String(l.text || l).includes(m.node) && (!field || String(l.text || l).includes(field)));
      if (i >= 0) { used.add(i); matched++; if (i < last) orderBreaks++; last = i; } else onlyPlan.push({ code: m.code, node: m.node });
    }
    logCmp = { matched, orderBreaks, onlyPlan, onlyReal: log.filter((_, j) => !used.has(j)).map((l) => (typeof l === 'string' ? { text: l } : l)) };
  }

  // where a rule is wrong: the differences grouped by the method of the plan node they come from
  const methodOf = new Map(plan.nodes.map((n) => [n.id, n.method]));
  const byMethod = {};
  const add = (from, key) => { const m = methodOf.get(from) || '(no plan node)'; (byMethod[m] ||= { contextDiffs: 0, layoutDiffs: 0 })[key]++; };
  for (const d of [...onlyPlanC, ...kindDiffs, ...fieldDiffs, ...conditionDiffs]) add(d.from, 'contextDiffs');
  for (const d of L.onlyPlan) add(d.from, 'layoutDiffs');

  const share = (m, a, b) => (a + b ? (2 * m) / (a + b) : 1);
  return {
    form: plan.form,
    context: { matched: cMatched, onlyPlan: onlyPlanC, onlyReal: onlyRealC, kindDiffs, fieldDiffs, conditionDiffs },
    layout: L,
    interface: iface,
    log: logCmp,
    byMethod,
    summary: {
      contextMatch: share(cMatched - kindDiffs.length, p.size, r.size),
      layoutMatch: share(L.matched, lp.length, lr.length),
      interfaceMatch: iface ? 1 - (iface.onlyPlan.length + iface.onlyReal.length) / Math.max(1, iface.total) : null,
      logMatch: logCmp ? share(logCmp.matched, plan.log.length, log.length) : null,
    },
  };
}
