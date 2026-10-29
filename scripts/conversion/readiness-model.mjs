// sc4sap:s4-conversion-readiness — the report model: scan results plus what is worked out from them (per-object
// rating and rough effort, target-specific approach, extension evidence, the preparation checklist, totals).
// Isomorphic: plain data in, plain data out.

import { SEVS, sevRank } from './readiness-scan.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const isCustom = (n) => /^[ZY]/i.test(n) || /^\/[A-Z0-9_]+\//i.test(n);
const EFFORT_DAYS = { S: 0.5, M: 2, L: 5 };
export const TARGETS = ['2023', '2025', 'public', 'compare'];

/** Worst severity, finding count and rough effort per object (S ≤ 2 findings, M ≤ 9, L beyond or an L blocker). */
export function rateObjects(objects, findings, kb) {
  const items = new Map([...arr(kb.items), ...arr(kb.patterns)].map((x) => [x.id, x]));
  const by = new Map();
  for (const f of findings) { const l = by.get(f.object) || []; l.push(f); by.set(f.object, l); }
  return objects.filter((o) => o.type !== 'TRAN').map((o) => {
    const fs = by.get(o.id) || [];
    const worst = fs.reduce((w, f) => (sevRank(f.sev) < sevRank(w) ? f.sev : w), '');
    const distinct = new Set(fs.map((f) => f.item)).size;
    const bigBlocker = fs.some((f) => f.sev === 'blocker' && items.get(f.item)?.effort === 'L');
    const effort = !fs.length ? '' : bigBlocker || distinct >= 10 ? 'L' : distinct >= 3 ? 'M' : 'S';
    return { ...o, units: undefined, graph: undefined, findings: fs.length, items: [...new Set(fs.map((f) => f.item))], worst, effort,
      cloud: cloudApproach(o), level: cleanCoreLevel(o, fs) };
  });
}

/** Public cloud: how a classic Z object would be rebuilt (heuristic from what it does). */
export function cloudApproach(o) {
  if (o.bdc || o.writesStd) return 'api';        // writes SAP data → released APIs (or BTP)
  if (o.rfc) return 'integration';                // talks to other systems → released APIs / integration
  if (o.writesZ) return 'rap';                    // keeps its own data → RAP business object
  if (o.alv || o.readsStd) return 'fiori';        // a report → CDS + Fiori elements list
  return 'review';
}

/** Clean-core level (A–D, SAP's 2025 extensibility levels) — an estimate from the code facts, never a verdict. */
export function cleanCoreLevel(o, fs) {
  if (o.writesStd || o.bdc || fs.some((f) => f.kind === 'table-write' && !isCustom(f.target))) return 'D';
  if (o.readsStd || fs.length) return 'C';
  return 'B';
}

/** Evidence for each extension the user may adopt — question [2] of the skill and its section in the report. */
export function extensionEvidence({ used = [], findings = [], exits = [], objects = [], facts = {}, target = '' }) {
  const u = new Set(used.map((t) => String(t).toUpperCase()));
  const usedLike = (re) => [...u].filter((t) => re.test(t)).sort();
  const objs = (pred) => objects.filter(pred);
  const fItems = (id) => findings.filter((f) => f.item === id);
  const ev = {};
  const put = (k, lines, extra = {}) => { ev[k] = { evidence: lines.filter(Boolean), recommend: lines.filter(Boolean).length > 0, ...extra }; };
  const wm = usedLike(/^(LT0|LT1|LT2|LB|LS0|LX|LI)/);
  put('EWM', [wm.length && { k: 'usedTcodes', n: wm.length, list: wm.slice(0, 12) }, facts.warehouses != null && facts.warehouses > 0 && { k: 'warehouses', n: facts.warehouses },
    fItems('LE-WM').length && { k: 'codeObjects', n: new Set(fItems('LE-WM').map((f) => f.object)).size }, exits.filter((x) => /^MWM/.test(x.standard)).length && { k: 'exits', n: exits.filter((x) => /^MWM/.test(x.standard)).length }]);
  const zt = [...u].filter((t) => /^[ZY]/.test(t));
  put('RAP', [zt.length && { k: 'usedZTcodes', n: zt.length }, objs((o) => o.alv).length && { k: 'alvObjects', n: objs((o) => o.alv).length },
    objs((o) => o.writesZ).length && { k: 'zDataObjects', n: objs((o) => o.writesZ).length }]);
  const std = [...u].filter((t) => !/^[ZY]/.test(t));
  put('FLP', [std.length && { k: 'usedStdTcodes', n: std.length }]);
  put('OUTPUT', [facts.customOutputs && { k: 'customOutputs', n: facts.customOutputs }, u.has('NACE') && { k: 'usedTcodes', n: 1, list: ['NACE'] },
    fItems('SD-OUTPUT').length && { k: 'codeObjects', n: new Set(fItems('SD-OUTPUT').map((f) => f.object)).size }]);
  const tm = usedLike(/^VT0[123]N$/);
  put('TM', [tm.length && { k: 'usedTcodes', n: tm.length, list: tm }, fItems('LE-TRA').length && { k: 'codeObjects', n: new Set(fItems('LE-TRA').map((f) => f.object)).size }]);
  const gts = usedLike(/^(VX0[123]N|VE01)$/);
  put('GTS', [gts.length && { k: 'usedTcodes', n: gts.length, list: gts }]);
  const reb = usedLike(/^(VBO[123F])$/);
  put('SETTLEMENT', [reb.length && { k: 'usedTcodes', n: reb.length, list: reb }, fItems('SD-REBATE').length && { k: 'codeObjects', n: new Set(fItems('SD-REBATE').map((f) => f.object)).size }]);
  put('BTP', [target === 'public' && { k: 'publicTarget', n: 1 }, objs((o) => o.rfc).length && { k: 'rfcObjects', n: objs((o) => o.rfc).length }]);
  const nObj = (id) => new Set(fItems(id).map((f) => f.object)).size;
  put('INTSUITE', [nObj('INT-PO') && { k: 'proxyObjects', n: nObj('INT-PO') }, arr(facts.idoc).length && { k: 'idocTypes', n: arr(facts.idoc).length },
    nObj('INT-IDOC') && { k: 'idocObjects', n: nObj('INT-IDOC') }, objs((o) => o.rfc).length && { k: 'rfcObjects', n: objs((o) => o.rfc).length }]);
  put('EVENTMESH', [nObj('INT-EVENT') && { k: 'eventObjects', n: nObj('INT-EVENT') }, facts.customEventLinks && { k: 'eventLinks', n: facts.customEventLinks }]);
  return ev;
}

/**
 * Customer fields per table and what each table needs: the DDIC read (facts.customFields, every table of the
 * knowledge base) first, the append extract of setup for the rest. kind: proxy (extend the proxy CDS view),
 * move (add the fields to the new table), bp, cds (standard CDS view to extend for Fiori — optional), none.
 */
export function tableExtensionRows(kb, facts = {}, appends = []) {
  const byTab = new Map();
  for (const g of arr(kb.tableExtensions?.groups)) for (const t of g.tables) byTab.set(t, g);
  const mod = new Map(appends.map((a) => [a.table, a.module]));
  const cf = { ...(facts.customFields || {}) };
  for (const a of appends) if (!cf[a.table] && (arr(a.fields).length || arr(a.structures).length)) cf[a.table] = { fields: arr(a.fields), includes: arr(a.structures) };
  const SEV = { move: 'blocker', proxy: 'functional', bp: 'check', cds: 'info', none: 'info' };
  const ORDER = { move: 0, proxy: 1, bp: 2, cds: 3, none: 4 };
  return Object.entries(cf).filter(([, v]) => arr(v.fields).length || arr(v.includes).length).map(([table, v]) => {
    const g = byTab.get(table), cds = arr(kb.cds?.[table]);
    const kind = g ? g.kind : cds.length ? 'cds' : 'none';
    return { table, module: mod.get(table) || '', fields: arr(v.fields), includes: arr(v.includes), kind, item: g?.item || '', group: g?.id || '', to: g?.to || '', object: g?.object || '', cds, sev: SEV[kind] };
  }).sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || a.table.localeCompare(b.table));
}

/** Message types of the partner profiles with what the conversion does to each (knowledge base `idoc`). */
export function integrationRows(facts, kb) {
  return arr(facts.idoc).map((x) => { const k = kb.idoc?.[x.mestyp]; return { ...x, item: k?.item || '', note: k ? { ko: k.ko, en: k.en } : null, sev: k ? 'check' : 'info' }; });
}

/** The preparation checklist: SAP's own checks first, then what the findings and facts call for. */
export function checklist({ findings = [], usage = [], appends = [], facts = {}, objects = [], extensions = [], measured = null }) {
  const has = (id) => findings.some((f) => f.item === id) || usage.some((x) => x.item === id);
  const addons = arr(facts.components).filter((c) => c.foreign || /^IS-|^INSURANCE|^IS_/.test(c.name));
  const out = [];
  const add = (id, area, status, extra = {}) => out.push({ id, area, status, ...extra });
  add('readinessCheck', 'BASIS', 'todo');
  add('siCheck', 'BASIS', 'todo');
  add('atc', 'DEV', 'todo', { n: objects.length });
  add('unused', 'DEV', measured ? 'attention' : 'todo', measured || {});
  add('addons', 'BASIS', addons.length ? 'attention' : facts.components ? 'ok' : 'todo', { list: addons.map((c) => `${c.name} ${c.release}`).slice(0, 20) });
  add('unicode', 'BASIS', 'todo');
  add('bp', 'MD', has('BP-CVI') ? 'attention' : 'todo');
  add('credit', 'FI', has('SD-CREDIT') ? 'attention' : facts.creditAreas ? 'attention' : 'na', { n: facts.creditAreas });
  add('ml', 'CO', facts.mlInactive ? 'attention' : facts.mlInactive === 0 ? 'ok' : 'todo', { n: facts.mlInactive });
  add('aa', 'FI', 'todo');
  add('code', 'DEV', findings.some((f) => f.sev === 'blocker') ? 'attention' : 'ok', { n: findings.filter((f) => f.sev === 'blocker').length });
  add('appends', 'DEV', appends.some((a) => a.item) ? 'attention' : appends.length ? 'ok' : 'na', { n: appends.filter((a) => a.item).length });
  add('output', 'CROSS', has('SD-OUTPUT') || extensions.includes('OUTPUT') ? 'attention' : 'todo');
  add('wm', 'LE', has('LE-WM') ? 'attention' : facts.warehouses ? 'attention' : 'na');
  add('interfaces', 'INT', has('INT-PO') || has('INT-IDOC') || arr(facts.idoc).length ? 'attention' : 'todo', { n: arr(facts.idoc).length || '' });
  add('workflow', 'INT', has('INT-EVENT') || facts.customEventLinks ? 'attention' : 'todo', { n: facts.customEventLinks || '' });
  add('fiori', 'UX', 'todo');
  add('volume', 'BASIS', 'todo');
  add('rehearsal', 'PMO', 'todo');
  return out;
}

/** Counts for the summary: findings by severity and area, objects by rating, rough effort in person-days. */
export function totals({ findings = [], objects = [], exits = [], appends = [], usage = [] }) {
  const bySev = Object.fromEntries(SEVS.map((s) => [s, findings.filter((f) => f.sev === s).length]));
  const areas = {};
  for (const f of findings) { const a = (areas[f.area] ||= { area: f.area, n: 0, objects: new Set(), worst: '' }); a.n++; a.objects.add(f.object); if (!a.worst || sevRank(f.sev) < sevRank(a.worst)) a.worst = f.sev; }
  const hit = objects.filter((o) => o.findings);
  const days = hit.reduce((n, o) => n + (EFFORT_DAYS[o.effort] || 0), 0);
  return { bySev, areas: Object.values(areas).map((a) => ({ ...a, objects: a.objects.size })).sort((x, y) => sevRank(x.worst) - sevRank(y.worst) || y.n - x.n),
    objects: objects.length, hit: hit.length, blockerObjects: objects.filter((o) => o.worst === 'blocker').length, days: Math.round(days),
    exits: exits.length, exitsHit: exits.filter((x) => x.item).length, appends: appends.length, appendsHit: appends.filter((a) => a.item).length, usageHits: usage.length };
}

/** A 0–100 readiness indicator: 100 minus weighted share of objects with findings (blocker 1, functional .6, other .25). */
export function readinessScore(objects) {
  const n = objects.length; if (!n) return null;
  const w = { blocker: 1, functional: 0.6, performance: 0.25, check: 0.25, info: 0 };
  const load = objects.reduce((s, o) => s + (w[o.worst] || 0), 0);
  return Math.max(0, Math.round(100 - (load / n) * 100));
}
