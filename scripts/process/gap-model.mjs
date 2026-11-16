// sc4sap:module-to-process — gap mode: process-model.json → gap model (the Gap analysis document's data).
//
// Offline: reads only the process model of the module (and optionally the scope graph for object types).
// Gap model shape (one language, SAP identifiers literal):
//   { schema: 1, kind: 'gap', module, modules, lang, title, system, sapVersion, scope: 'conversion' | 'new',
//     author, changeNote, source: { process, version },
//     usageBasis: { system, destination, tier: prd | non-prd | unknown, months, coverage, measuredAt, reliable, reason, jobs },
//     packages: [{ name, tcodes, used }], systems, lanes,
//     rows: [ L1–L3 { code, level, label, desc? }
//             L4 / variant (level 5, code "1.2.3.1a", parent = the L4) {
//               code, level, label, kind, usage, usageRaw?, usageWhy?, module, backbone?, tcodes, objects,
//               fit: fit | partial | gap | manual | external,
//               disposition: keep | adopt | retrofit | rebuild | standard | retire | review,
//               coverage: [{ name, type?, usage?, desc? }], statement, why: [{ text, source? }],
//               conversion: [text], tbd: [text], interfaces: n,
//               wricef: { on: bool, kind: R|I|C|E|F|W, reason }, note } ],
//     notEvidenced: [{ backbone, label, reason }], openQuestions: [text], edited: { "<code>": [field] } }
// Fields a consultant changes on the page (disposition, wricef.on / kind, statement, note) are carried by code
// into the next derivation (`prev`), and a consultant review file (`patch`) is merged the same way.
// Workbench (web /gap and blank documents): optional row fields req { id, text, source, priority H|M|L },
// effortMd, owner (free text), decision { by, at }, wbs { ownerRef, projectId, rowId }, wbsStatus — carried as they are;
// rows people add carry `manual: true` (task rows `kind: 'manual-req'`) and survive a new derivation.
// blankGap / addRow / removeRow / applyOps (AI suggestions, allowlisted fields) / modelFromPage live here too;
// this file has no imports so the workbench page can inline it.
//
// Usage is evidence only when it is the productive system's ST03N over a long enough window (usageBasis.reliable):
// otherwise "unused" becomes "unknown" (kept as usageRaw) and no row is proposed for retirement. Programs that run
// as background job steps count as used. Interfaces, forms, enhancements and external rows are never proposed for
// retirement from ST03N alone (RFC calls, output conditions, exits and BAdIs do not show as TCode usage).

const arr = (v) => (Array.isArray(v) ? v : []);
const str = (x) => (typeof x === 'string' ? x : x?.text ?? '');

export const FITS = ['fit', 'partial', 'gap', 'manual', 'external'];
export const DISPOSITIONS = ['keep', 'adopt', 'retrofit', 'rebuild', 'standard', 'retire', 'review'];
export const WRICEF = ['R', 'I', 'C', 'E', 'F', 'W'];
export const SCOPES = ['conversion', 'new'];
/** Fields carried from the previous gap model / a review patch; nested paths with a dot. */
export const CARRY = ['disposition', 'statement', 'note', 'wricef.on', 'wricef.kind'];

const FIT_OF = { std: 'fit', enh: 'partial', cbo: 'gap', manual: 'manual', ext: 'external' };
export const fitOf = (kind) => FIT_OF[kind] || 'gap';

/** Months of measured usage below which "unused" is not evidence. */
export const MIN_MONTHS = 3;
/** WRICEF kinds whose use does not show as TCode usage in ST03N. */
const HIDDEN_USE = ['I', 'F', 'E'];

/** Default disposition by scope, fit and usage (the consultant changes it on the page). */
export function defaultDisposition(scope, fit, usage, { interfaces = 0, wricefKind: wk = '' } = {}) {
  const conv = scope !== 'new';
  if (fit === 'fit') return conv ? 'keep' : 'adopt';
  if (fit === 'manual') return 'review';
  if (fit === 'external') return interfaces && usage !== 'unused' ? (conv ? 'retrofit' : 'rebuild') : 'review';
  if (usage === 'used') return conv ? 'retrofit' : 'rebuild';
  if (usage === 'unused') return fit === 'partial' || HIDDEN_USE.includes(wk) ? 'review' : 'retire';
  return 'review';
}

/**
 * Where the usage comes from. `usage` = <SCOPE_DIR>/usage.json (optional), else the process model's
 * overview.usageBasis. Tier: an explicit `tier`, else "prd" when it was read through SAP_USAGE_RFCDEST
 * (destination set), else "unknown".
 */
export function usageBasisOf(pm, usage = null, tier = '') {
  const ob = pm?.overview?.usageBasis || {};
  const src = usage?.tcodes?.source || {};
  const b = {
    system: src.system || usage?.system || ob.system || '', destination: src.destination ?? ob.destination ?? '',
    months: usage?.tcodes?.months ?? ob.months ?? null, coverage: usage?.tcodes?.coverage ?? ob.coverage ?? null,
    measuredAt: usage?.measuredAt || ob.measuredAt || '',
  };
  b.tier = tier || ob.tier || (b.destination ? 'prd' : 'unknown');
  b.tierBy = tier ? 'user' : 'auto';
  const span = b.coverage ?? b.months;
  b.reliable = b.tier === 'prd' && (span == null || Number(span) >= MIN_MONTHS);
  b.reason = b.tier === 'non-prd' ? 'nonprd' : b.tier !== 'prd' ? 'unknown' : b.reliable ? '' : 'short';
  const jobs = Object.keys(usage?.jobs?.result || {}).filter(k => usage.jobs.result[k]).concat(arr(ob.jobs));
  b.jobs = [...new Set(jobs.map(x => String(x).toUpperCase()))];
  return b;
}

/** Row / object usage under the basis: job step → used; "unused" without reliable evidence → unknown. */
function judgeUsage(usage, names, basis) {
  const u = usage || 'unknown';
  if (u !== 'used' && names.some(n => basis.jobs.includes(String(n).toUpperCase()))) return { usage: 'used', usageWhy: 'job', ...(u !== 'unknown' ? { usageRaw: u } : {}) };
  if (u === 'unused' && !basis.reliable) return { usage: 'unknown', usageRaw: 'unused' };
  return { usage: u };
}
export const isCandidate = (disposition) => disposition === 'retrofit' || disposition === 'rebuild';

const FORM = /^(SSFO|SFPF|FORM|SSST)$/;
const WFLOW = /^(PDTS|PDWS|SWFO|WAPA_WF)$/;
const CONV_WORDS = /\b(lsmw|migrat\w*|data conversion|legacy load|initial load)\b|이관|마이그레이션|기초 ?데이터|移行/i;
const CUSTOMER = /^([ZY]|\/)/;

/**
 * WRICEF kind with the reason shown on the page. Order: interface → enhancement → form → workflow →
 * conversion (data migration: LSMW / migration step) → report. A daily upload program is a report (R), not C.
 */
export function wricefKind(row, typeOf = () => '') {
  const t = row.task || {};
  const names = [...arr(row.objects), ...arr(t.objects).map(o => o?.name)].filter(Boolean);
  const types = names.map(n => typeOf(n)).filter(Boolean);
  if (row.kind === 'ext' || arr(t.interfaces).length) return { kind: 'I', reason: 'interface' };
  if (row.kind === 'enh' || arr(t.exits).length) return { kind: 'E', reason: 'enhancement' };
  if (types.some(x => FORM.test(x)) || names.some(n => /(^|_)(SF|FORM|PRINT)(_|$)/i.test(n))) return { kind: 'F', reason: 'form' };
  if (types.some(x => WFLOW.test(x))) return { kind: 'W', reason: 'workflow' };
  const words = arr(t.steps).map(s => `${s.method || ''} ${s.name || ''}`).join(' ') + ` ${row.label || ''}`;
  if (CONV_WORDS.test(words)) return { kind: 'C', reason: 'migration' };
  return { kind: 'R', reason: 'program' };
}

/** name → object type from a scope graph.json (nodes `TYPE:NAME`); unknown → ''. */
export function graphTypes(graph) {
  const map = new Map();
  for (const n of arr(graph?.nodes)) {
    const [type, ...rest] = String(n.id || '').split(':');
    const name = n.name || rest.join(':');
    if (name && type && !map.has(name)) map.set(name, type);
  }
  return (name) => map.get(name) || '';
}

const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
const setPath = (o, p, v) => { const k = p.split('.'); const last = k.pop(); let x = o; for (const s of k) x = x[s] ??= {}; x[last] = v; };

function coverage(row, typeOf, basis) {
  const t = row.task || {};
  const seen = new Map();
  for (const o of arr(t.objects)) if (o?.name) seen.set(o.name, { name: o.name, usage: o.usage, desc: o.desc });
  for (const n of arr(row.objects)) if (!seen.has(n)) seen.set(n, { name: n });
  for (const c of arr(row.tcodes)) if (/^[ZY]/.test(c) && !seen.has(c)) seen.set(c, { name: c, type: 'TRAN', usage: row.usage });
  for (const x of arr(t.exits)) if (!seen.has(x)) seen.set(x, { name: x, type: 'EXIT', usage: row.usage });
  // customer objects only (Z / Y / namespace) — standard BAPIs and FMs the CBO calls are not what covers the gap; exits are customer code
  return [...seen.values()].filter(o => o.type === 'EXIT' || CUSTOMER.test(o.name)).map(o => {
    const j = o.usage || basis.jobs.includes(String(o.name).toUpperCase()) ? judgeUsage(o.usage, [o.name], basis) : {};
    return { ...o, ...(j.usage ? { usage: j.usage } : {}), type: o.type || typeOf(o.name) || undefined };
  });
}

function taskRow(m, scope, row, typeOf, basis, base = {}) {
  const t = row.task || {};
  const fit = fitOf(row.kind);
  const interfaces = arr(t.interfaces).length;
  const wk = wricefKind(row, typeOf);
  const u = judgeUsage(row.usage, [...arr(row.objects), ...arr(t.objects).map(o => o?.name)].filter(Boolean), basis);
  const disposition = defaultDisposition(scope, fit, u.usage, { interfaces, wricefKind: wk.kind });
  const module = String(row.backbone || '').split('.')[0] || m.module;
  return {
    code: row.code, level: row.level, label: row.label, kind: row.kind || 'cbo', ...u, module,
    ...(row.backbone ? { backbone: row.backbone } : {}),
    tcodes: arr(row.tcodes).filter(c => !/^[ZY]/.test(c)), objects: arr(row.objects),
    fit, disposition, coverage: fit === 'fit' ? [] : coverage(row, typeOf, basis),
    statement: str(t.definition), why: arr(t.rules).slice(0, 3).map(r => (typeof r === 'string' ? { text: r } : { text: r.text, ...(r.source ? { source: r.source } : {}) })),
    conversion: arr(t.conversion).map(str).filter(Boolean), tbd: arr(t.tbd).map(str).filter(Boolean), interfaces,
    wricef: { on: fit !== 'fit' && isCandidate(disposition), kind: wk.kind, reason: wk.reason }, note: '',
    ...base,
  };
}

/**
 * Process model → gap model. `prev` = the gap model of the previous version (consultant edits carried by
 * code), `patch` = `{ "<code>": { disposition?, statement?, note?, wricefKind?, wricef?: { on, kind } } }`.
 */
export function deriveGap(pm, { scope = 'conversion', graph = null, prev = null, patch = null, source = '', usage = null, usageTier = '' } = {}) {
  if (!SCOPES.includes(scope)) throw new Error(`scope must be ${SCOPES.join(' | ')}`);
  if (usageTier && !['prd', 'non-prd', 'unknown'].includes(usageTier)) throw new Error('usage tier must be prd | non-prd | unknown');
  const typeOf = graphTypes(graph);
  const basis = usageBasisOf(pm, usage, usageTier);
  const rows = [];
  for (const r of arr(pm.rows)) {
    const level = Number(r.level) || String(r.code).split('.').length;
    const row = { ...r, code: String(r.code), level };
    if (level < 4) { rows.push({ code: row.code, level, label: row.label, ...(row.desc ? { desc: row.desc } : {}) }); continue; }
    rows.push(taskRow(pm, scope, row, typeOf, basis));
    for (const v of arr(row.variants)) {
      const vr = { ...row, code: `${row.code}${v.id}`, label: `${row.label} — ${v.label}`, kind: v.kind || row.kind, usage: v.usage || row.usage,
        objects: arr(v.objects), tcodes: arr(v.tcodes), task: { ...row.task, definition: v.desc || row.task?.definition, objects: [] } };
      rows.push(taskRow(pm, scope, vr, typeOf, basis, { level: 5, parent: row.code, variant: v.id }));
    }
  }
  const gap = {
    schema: 1, kind: 'gap', module: pm.module, modules: arr(pm.modules).length ? pm.modules : [pm.module], lang: pm.lang || 'ko',
    title: '', system: pm.system || '', sapVersion: pm.sapVersion || '', scope, author: pm.author || '', changeNote: '',
    source: { process: source, version: pm.version || '' }, usageBasis: basis,
    packages: arr(pm.scope?.packages).map(p => (typeof p === 'string' ? { name: p } : { name: p.name, tcodes: p.tcodes, used: p.used })),
    systems: arr(pm.scope?.systems), lanes: arr(pm.lanes),
    rows, notEvidenced: arr(pm.notEvidenced), openQuestions: arr(pm.openQuestions).map(str).filter(Boolean), edited: {},
  };
  if (prev) carry(gap, prev);
  if (patch) applyPatch(gap, patch);
  return gap;
}

/**
 * Workbench fields of a row, carried as they are (never derived): the to-be requirement, effort in man-days,
 * owner (free text), decision { by, at }, the WBS link { ownerRef, projectId, rowId } and its cached status.
 * Absent until someone sets them, so a model that never used them is unchanged.
 */
export const ROW_FIELDS = ['req', 'effortMd', 'owner', 'decision', 'wbs', 'wbsStatus'];
export const PRIORITIES = ['H', 'M', 'L'];

/**
 * Copies the consultant-edited fields of `prev` (by code) into `gap`; also title / author / open questions.
 * Rows a person added (`manual: true`) that the new derivation does not have are kept at their place
 * (after their parent's last row; a code the derivation now uses gets the next free code under the same parent).
 */
export function carry(gap, prev) {
  const by = new Map(arr(prev.rows).map(r => [r.code, r]));
  const other = prev.lang && prev.lang !== gap.lang;
  // a companion (other language) takes the decisions only; free text stays in the language of its own model
  const fields = other ? CARRY.filter(f => f !== 'statement' && f !== 'note') : CARRY;
  for (const r of gap.rows) {
    const p = by.get(r.code);
    if (!p || r.level < 4) continue;
    for (const f of fields) {
      const v = getPath(p, f);
      if (v !== undefined && v !== '' && JSON.stringify(v) !== JSON.stringify(getPath(r, f))) {
        setPath(r, f, v);
        (gap.edited[r.code] ??= []).includes(f) || gap.edited[r.code].push(f);
      }
    }
    for (const f of ROW_FIELDS) {
      if (p[f] === undefined) continue;
      // the requirement text is prose: a companion keeps its own (id, source and priority are carried)
      const v = f === 'req' && other ? { ...p.req, text: r.req?.text ?? '' } : p[f];
      r[f] = JSON.parse(JSON.stringify(v));
    }
  }
  // rows a person added survive a new derivation
  const have = new Set(gap.rows.map(r => r.code));
  for (const p of arr(prev.rows)) {
    if (!p.manual) continue;
    const there = gap.rows.find(r => r.code === p.code);
    if (there?.manual) continue; // already carried
    const row = JSON.parse(JSON.stringify(p));
    const parent = gapParentOf(row);
    if (there || (parent && !gap.rows.some(r => r.code === parent))) {
      // the parent is gone: keep the row under the nearest ancestor that exists (or at the top)
      const anc = (there ? [parent] : []).concat(ancestorsOf(row.code)).find(c => c && gap.rows.some(r => r.code === c)) || '';
      const ancLevel = anc ? gap.rows.find(r => r.code === anc).level : 0;
      const level = row.level === 5 && ancLevel === 4 ? 5 : Math.min(ancLevel + 1, 4);
      row.renamedFrom = row.code;
      row.code = nextGapCode(gap, anc, level);
      row.level = level;
      if (level === 5) row.parent = anc; else delete row.parent;
    }
    gap.rows.splice(insertAt(gap, gapParentOf(row)), 0, row);
    have.add(row.code);
  }
  if (other) return gap;
  if (prev.title) gap.title = prev.title;
  if (prev.scope && SCOPES.includes(prev.scope) && prev.scope !== gap.scope) gap.scopeChangedFrom = prev.scope;
  const oq = new Set(gap.openQuestions);
  gap.openQuestions.push(...arr(prev.openQuestions).filter(q => !oq.has(q)));
  return gap;
}

/** Merges a consultant review patch; unknown codes are reported, never invented as rows. */
export function applyPatch(gap, patch) {
  const by = new Map(gap.rows.map(r => [r.code, r]));
  const unknown = [];
  for (const [code, p] of Object.entries(patch || {})) {
    const r = by.get(code);
    if (!r || r.level < 4) { unknown.push(code); continue; }
    const mark = (f) => { (gap.edited[code] ??= []).includes(f) || gap.edited[code].push(f); };
    if (p.disposition && DISPOSITIONS.includes(p.disposition)) { r.disposition = p.disposition; mark('disposition'); if (p.wricef?.on == null) r.wricef.on = r.fit !== 'fit' && isCandidate(p.disposition); }
    for (const f of ['statement', 'note']) if (typeof p[f] === 'string' && p[f]) { r[f] = p[f]; mark(f); }
    const k = p.wricefKind || p.wricef?.kind;
    if (k && WRICEF.includes(k)) { r.wricef.kind = k; r.wricef.reason = 'review'; mark('wricef.kind'); }
    if (typeof p.wricef?.on === 'boolean') { r.wricef.on = p.wricef.on; mark('wricef.on'); }
  }
  if (unknown.length) gap.patchUnknown = unknown;
  return gap;
}

// ── rows people add (workbench / blank documents) ──
// Codes: "1", "1.2", "1.2.3", "1.2.3.4" by level; a variant (level 5) is its L4 code + a letter ("1.2.3.4a").
const segs = (code) => String(code).split('.');
export const GAP_CODE = /^\d+(\.\d+){0,3}[a-z]{0,2}$/;
/** The code of a row's parent ('' for an L1). */
export const gapParentOf = (r) => (r.level === 5 ? r.parent || String(r.code).replace(/[a-z]+$/, '') : segs(r.code).slice(0, -1).join('.'));
const ancestorsOf = (code) => { const s = segs(String(code).replace(/[a-z]+$/, '')); const out = [s.join('.')]; while (s.length > 1) { s.pop(); out.push(s.join('.')); } return out.filter(c => c !== String(code)); };
/** The next free code under a parent ('' = top level) for a row of `level` (5 = variant letter). */
export function nextGapCode(gap, parentCode, level) {
  const codes = new Set(arr(gap.rows).map(r => r.code));
  if (level === 5) {
    for (let i = 0; i < 26 * 26; i += 1) {
      const id = i < 26 ? String.fromCharCode(97 + i) : String.fromCharCode(96 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
      if (!codes.has(`${parentCode}${id}`)) return `${parentCode}${id}`;
    }
    throw new Error(`no free variant code under ${parentCode}`);
  }
  const prefix = parentCode ? `${parentCode}.` : '';
  let n = 1;
  for (const c of codes) if (c.startsWith(prefix) && /^\d+$/.test(c.slice(prefix.length))) n = Math.max(n, Number(c.slice(prefix.length)) + 1);
  return `${prefix}${n}`;
}
/** Index after the last row under `parentCode` (document order: a parent before its children); end when none. */
function insertAt(gap, parentCode) {
  if (!parentCode) return gap.rows.length;
  let at = -1;
  gap.rows.forEach((r, i) => { if (r.code === parentCode || r.code.startsWith(`${parentCode}.`) || (r.level === 5 && gapParentOf(r) === parentCode) || (r.level === 5 && r.code.startsWith(`${parentCode}.`))) at = i; });
  return at < 0 ? gap.rows.length : at + 1;
}

/** A gap document without a process map: no rows yet; people add L1–L4 rows (usage unknown, nothing derived). */
export function blankGap({ module = '', modules = [], scope = 'conversion', lang = 'ko', title = '' } = {}) {
  if (!SCOPES.includes(scope)) throw new Error(`scope must be ${SCOPES.join(' | ')}`);
  if (!module) throw new Error('module is required');
  return {
    schema: 1, kind: 'gap', blank: true, module, modules: arr(modules).length ? modules : [module], lang, title, system: '', sapVersion: '', scope, author: '', changeNote: '',
    source: { process: '', version: '' }, usageBasis: usageBasisOf({}, null, 'unknown'),
    packages: [], systems: [], lanes: [], rows: [], notEvidenced: [], openQuestions: [], edited: {},
  };
}

/**
 * A row a person adds (manual). parent = the code of an L1–L3 row ('' for an L1) or of an L4 for a variant (level 5).
 * Task rows (L4 / variant) start as gap / to be decided / usage unknown with no WRICEF candidate.
 * Returns { gap, code } — a new gap object; the input is not changed.
 */
export function addRow(gap0, { parent = '', level = 0, label = '', req = null } = {}) {
  const gap = JSON.parse(JSON.stringify(gap0));
  gap.rows = arr(gap.rows);
  const p = parent ? gap.rows.find(r => r.code === parent) : null;
  if (parent && !p) throw new Error(`parent ${parent} not found`);
  const lv = Number(level) || (p ? p.level + 1 : 1);
  if (p ? !(lv === p.level + 1 && lv <= 5) || (lv === 5 && p.level !== 4) : lv !== 1) throw new Error(`a level ${lv} row cannot go under ${parent || 'the top'}`);
  const text = String(label || '').trim();
  if (!text) throw new Error('label is required');
  const code = nextGapCode(gap, parent, lv);
  const row = lv < 4 ? { code, level: lv, label: text, manual: true }
    : { code, level: lv, label: text, manual: true, kind: 'manual-req', usage: 'unknown', module: (p?.module) || gap.module,
      ...(lv === 5 ? { parent, variant: code.slice(parent.length) } : {}),
      tcodes: [], objects: [], fit: 'gap', disposition: 'review', coverage: [], statement: '', why: [], conversion: [], tbd: [], interfaces: 0,
      wricef: { on: false, kind: 'R', reason: 'manual' }, note: '' };
  if (lv >= 4 && req) row.req = cleanReq(req);
  gap.rows.splice(insertAt(gap, parent), 0, row);
  return { gap, code };
}

/** Removes a row and everything under it (children, variants). Returns { gap, removed: [codes] }. */
export function removeRow(gap0, code) {
  const gap = JSON.parse(JSON.stringify(gap0));
  const under = (r) => r.code === code || r.code.startsWith(`${code}.`) || (r.level === 5 && gapParentOf(r) === code);
  const removed = arr(gap.rows).filter(under).map(r => r.code);
  if (!removed.length) throw new Error(`row ${code} not found`);
  gap.rows = gap.rows.filter(r => !under(r));
  for (const c of removed) if (gap.edited && Object.hasOwn(gap.edited, c)) delete gap.edited[c];
  return { gap, removed };
}

const cleanReq = (q) => {
  const r = typeof q === 'string' ? { text: q } : q || {};
  return { id: String(r.id ?? ''), text: String(r.text ?? ''), source: String(r.source ?? ''), priority: PRIORITIES.includes(r.priority) ? r.priority : 'M' };
};

// ── AI suggestions (row by row; every op is accepted one at a time by a person) ──
export const OP_FIELDS = ['statement', 'req.text', 'req.priority', 'fit', 'disposition', 'wricef.on', 'wricef.kind', 'effortMd', 'why', 'note', 'tbd'];
const REFUSED = ['owner', 'decision', 'wbs', 'wbsStatus', 'usage', 'usageBasis', 'coverage', 'objects', 'code', 'level', 'parent', 'tcodes', 'manual', 'kind', 'module', 'interfaces', 'usageRaw', 'usageWhy'];

/**
 * ops: [{ op: 'set', code, field, value } | { op: 'add-row', parent, level, label, req }].
 * Only the fields of OP_FIELDS on task rows (L4 / variant) are set; owner, decision, the WBS link, usage,
 * coverage, objects and codes are refused. Rows are looked up by their own code only (no inherited keys).
 * Returns { gap, applied, skipped: [{ index, why }] } — a new gap object.
 */
export function applyOps(gap0, ops) {
  let gap = JSON.parse(JSON.stringify(gap0));
  const applied = [], skipped = [];
  arr(ops).forEach((o, index) => {
    const skip = (why) => skipped.push({ index, why });
    if (!o || typeof o !== 'object') return skip('not an op');
    if (o.op === 'add-row') {
      try { const r = addRow(gap, { parent: String(o.parent ?? ''), level: o.level, label: o.label, req: o.req }); gap = r.gap; applied.push({ index, op: 'add-row', code: r.code }); } catch (e) { skip(e.message); }
      return;
    }
    if (o.op !== 'set') return skip(`unknown op "${String(o.op).slice(0, 20)}"`);
    const field = String(o.field ?? '');
    if (!OP_FIELDS.includes(field)) return skip(REFUSED.includes(field.split('.')[0]) ? `field "${field}" is not changed by suggestions` : `unknown field "${field.slice(0, 30)}"`);
    const byCode = new Map(arr(gap.rows).map(r => [String(r.code), r]));
    const code = String(o.code ?? '');
    if (!GAP_CODE.test(code)) return skip('code must look like 1.2.3.4 (or 1.2.3.4a)');
    const r = byCode.has(code) ? byCode.get(code) : null;
    if (!r) return skip(`row ${code.slice(0, 30)} not found`);
    if (r.level < 4) return skip(`row ${code} is a group row`);
    const v = o.value;
    switch (field) {
      case 'statement': case 'note': if (typeof v !== 'string') return skip(`${field} must be text`); r[field] = v; break;
      case 'req.text': if (typeof v !== 'string') return skip('req.text must be text'); r.req = { ...cleanReq(r.req), text: v }; break;
      case 'req.priority': if (!PRIORITIES.includes(v)) return skip(`priority must be ${PRIORITIES.join(' / ')}`); r.req = { ...cleanReq(r.req), priority: v }; break;
      case 'fit': if (!FITS.includes(v)) return skip(`fit must be ${FITS.join(' / ')}`); r.fit = v; break;
      case 'disposition': if (!DISPOSITIONS.includes(v)) return skip(`disposition must be ${DISPOSITIONS.join(' / ')}`); r.disposition = v; break;
      case 'wricef.on': if (typeof v !== 'boolean') return skip('wricef.on must be true / false'); r.wricef = { ...r.wricef, on: v }; break;
      case 'wricef.kind': if (!WRICEF.includes(v)) return skip(`WRICEF kind must be ${WRICEF.join('')}`); r.wricef = { ...r.wricef, kind: v, reason: 'review' }; break;
      case 'effortMd': { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10000) return skip('effortMd must be a number of man-days (0–10000)'); r.effortMd = Math.round(n * 10) / 10; break; }
      case 'why': case 'tbd': {
        const list = typeof v === 'string' ? [v] : Array.isArray(v) && v.every(x => typeof x === 'string' || typeof x?.text === 'string') ? v : null;
        if (!list) return skip(`${field} must be text or a list of texts`);
        r[field] = field === 'why' ? list.map(x => ({ text: typeof x === 'string' ? x : x.text, estimated: true })) : list.map(x => (typeof x === 'string' ? x : x.text));
        break;
      }
      default: return skip(`field "${field}" is not changed by suggestions`);
    }
    (gap.edited ??= {});
    (Object.hasOwn(gap.edited, code) ? gap.edited[code] : (gap.edited[code] = [])).includes(field) || gap.edited[code].push(field);
    applied.push({ index, op: 'set', code, field });
  });
  return { gap, applied, skipped };
}

/** The gap model embedded in a gap page (a page built or saved from edit mode); null when the html has none. */
export function modelFromPage(html) {
  const m = /<script type="application\/json" id="process-model">([\s\S]*?)<\/script>/.exec(String(html));
  if (!m) return null;
  try {
    const d = JSON.parse(m[1]);
    return d?.model?.kind === 'gap' ? { model: d.model, version: d.version || d.model.version || '', history: arr(d.history) } : null;
  } catch { return null; }
}

/** Errors stop the build; warnings are printed. */
export function checkGap(gap) {
  const errors = [], warnings = [];
  if (gap?.kind !== 'gap') errors.push('not a gap model (kind !== "gap")');
  if (!gap?.module) errors.push('module missing');
  if (!SCOPES.includes(gap?.scope)) errors.push(`scope must be ${SCOPES.join(' | ')}`);
  const seen = new Set();
  for (const r of arr(gap?.rows)) {
    const at = `row ${r.code}`;
    if (seen.has(r.code)) errors.push(`${at}: duplicate code`);
    seen.add(r.code);
    if (r.manual && !GAP_CODE.test(String(r.code))) errors.push(`${at}: code must look like 1.2.3.4`);
    if (!r.label) errors.push(`${at}: label missing`);
    if (r.level < 4) continue;
    if (!FITS.includes(r.fit)) errors.push(`${at}: fit "${r.fit}" not in ${FITS.join('/')}`);
    if (!DISPOSITIONS.includes(r.disposition)) errors.push(`${at}: disposition "${r.disposition}" not in ${DISPOSITIONS.join('/')}`);
    if (r.wricef && !WRICEF.includes(r.wricef.kind)) errors.push(`${at}: WRICEF kind "${r.wricef.kind}" not in ${WRICEF.join('')}`);
    if (r.wricef?.on && !isCandidate(r.disposition)) warnings.push(`${at}: WRICEF candidate with disposition "${r.disposition}"`);
    if (r.fit !== 'fit' && !arr(r.coverage).length && r.fit !== 'manual' && r.kind !== 'manual-req') warnings.push(`${at}: gap without a covering object`);
    // workbench fields (optional)
    if (r.req != null && (typeof r.req !== 'object' || (r.req.priority && !PRIORITIES.includes(r.req.priority)))) errors.push(`${at}: req.priority must be ${PRIORITIES.join(' / ')}`);
    if (r.effortMd != null && r.effortMd !== '' && !(Number(r.effortMd) >= 0)) errors.push(`${at}: effortMd must be a number of man-days`);
    if (r.owner != null && typeof r.owner !== 'string') errors.push(`${at}: owner must be text`);
    if (r.disposition === 'review') warnings.push(`${at}: disposition to be decided`);
  }
  return { errors, warnings };
}

/** The rows that are WRICEF candidates (switched on), in document order. */
export const candidates = (gap) => arr(gap.rows).filter(r => r.level >= 4 && r.wricef?.on);

/** Words of the WRICEF note (the row's disposition and usage), in the gap model's language. */
export const NOTE_WORDS = {
  ko: { keep: '표준 유지', adopt: '표준 적용', retrofit: 'CBO 이관', rebuild: '재개발', standard: '표준으로 대체', retire: '폐기', review: '검토 필요', used: '사용', unused: '미사용', unknown: '실적 없음' },
  en: { keep: 'keep standard', adopt: 'adopt standard', retrofit: 'retrofit CBO', rebuild: 'rebuild', standard: 'replace by standard', retire: 'retire', review: 'to be decided', used: 'used', unused: 'unused', unknown: 'no data' },
  ja: { keep: '標準維持', adopt: '標準適用', retrofit: 'CBO 移行', rebuild: '再開発', standard: '標準へ置換', retire: '廃止', review: '要検討', used: '利用', unused: '未使用', unknown: '実績なし' },
};
export const wricefNote = (r, lang) => { const w = NOTE_WORDS[String(lang || '').slice(0, 2)] || NOTE_WORDS.en; return `Gap ${r.code} · ${w[r.disposition] || r.disposition} · ${w[r.usage] || r.usage}`; };

/**
 * WRICEF list for `build-project-doc.mjs add-wricef --file` (scripts/project/project-template.mjs addWricef).
 * `version` defaults to the version the gap model was built as (gap.version) — the dashboard skips re-imports by source.
 * The workbench fields go along when a row has them: the requirement (id, text) and the effort in the note, the
 * requirement id and the effort in `source` (a row without them gives exactly the earlier item).
 */
export function wricefItems(gap, version = '') {
  const ver = version || gap.version || '';
  const L = String(gap.lang || '').slice(0, 2);
  const md = L === 'ko' ? '공수' : L === 'ja' ? '工数' : 'effort';
  return candidates(gap).map(r => {
    const req = r.req && (r.req.id || r.req.text) ? `${r.req.id ? `${r.req.id}: ` : ''}${r.req.text || ''}`.trim() : '';
    const eff = r.effortMd != null && r.effortMd !== '' && Number(r.effortMd) >= 0 ? Number(r.effortMd) : null;
    return {
      label: r.label, kind: r.wricef.kind, module: r.module || gap.module,
      objects: [...new Set(arr(r.coverage).map(o => o.name))],
      note: wricefNote(r, gap.lang) + (req ? ` · ${req}` : '') + (eff != null ? ` · ${md} ${eff} MD` : ''),
      source: { doc: 'gap', module: gap.module, code: r.code, version: ver, ...(r.req?.id ? { reqId: r.req.id } : {}), ...(eff != null ? { effortMd: eff } : {}) },
    };
  });
}

/** Totals for the summary: per fit, per usage of the gap rows, per WRICEF kind, per L2. */
export function gapStats(gap) {
  const tasks = arr(gap.rows).filter(r => r.level >= 4);
  const count = (xs, key) => xs.reduce((o, r) => ((o[key(r)] = (o[key(r)] || 0) + 1), o), {});
  const l2 = arr(gap.rows).filter(r => r.level === 2).map(b => {
    const under = tasks.filter(t => t.code.startsWith(`${b.code}.`));
    return { code: b.code, label: b.label, total: under.length, byFit: count(under, r => r.fit) };
  }).filter(x => x.total);
  const cand = candidates(gap);
  return {
    tasks: tasks.length, byFit: count(tasks, r => r.fit), byDisposition: count(tasks, r => r.disposition),
    gapUsage: count(tasks.filter(r => r.fit !== 'fit'), r => r.usage), wricef: cand.length, byKind: count(cand, r => r.wricef.kind), l2,
  };
}
