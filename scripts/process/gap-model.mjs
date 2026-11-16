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

/** Copies the consultant-edited fields of `prev` (by code) into `gap`; also title / author / open questions. */
export function carry(gap, prev) {
  const by = new Map(arr(prev.rows).map(r => [r.code, r]));
  // a companion (other language) takes the decisions only; free text stays in the language of its own model
  const fields = prev.lang && prev.lang !== gap.lang ? CARRY.filter(f => f !== 'statement' && f !== 'note') : CARRY;
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
  }
  if (fields !== CARRY) return gap;
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
    if (!r.label) errors.push(`${at}: label missing`);
    if (r.level < 4) continue;
    if (!FITS.includes(r.fit)) errors.push(`${at}: fit "${r.fit}" not in ${FITS.join('/')}`);
    if (!DISPOSITIONS.includes(r.disposition)) errors.push(`${at}: disposition "${r.disposition}" not in ${DISPOSITIONS.join('/')}`);
    if (r.wricef && !WRICEF.includes(r.wricef.kind)) errors.push(`${at}: WRICEF kind "${r.wricef.kind}" not in ${WRICEF.join('')}`);
    if (r.wricef?.on && !isCandidate(r.disposition)) warnings.push(`${at}: WRICEF candidate with disposition "${r.disposition}"`);
    if (r.fit !== 'fit' && !arr(r.coverage).length && r.fit !== 'manual') warnings.push(`${at}: gap without a covering object`);
    if (r.disposition === 'review') warnings.push(`${at}: disposition to be decided`);
  }
  return { errors, warnings };
}

/** The rows that are WRICEF candidates (switched on), in document order. */
export const candidates = (gap) => arr(gap.rows).filter(r => r.level >= 4 && r.wricef?.on);

/** WRICEF list for `build-project-doc.mjs add-wricef --file` (scripts/project/project-template.mjs addWricef). */
/** Words of the WRICEF note (the row's disposition and usage), in the gap model's language. */
export const NOTE_WORDS = {
  ko: { keep: '표준 유지', adopt: '표준 적용', retrofit: 'CBO 이관', rebuild: '재개발', standard: '표준으로 대체', retire: '폐기', review: '검토 필요', used: '사용', unused: '미사용', unknown: '실적 없음' },
  en: { keep: 'keep standard', adopt: 'adopt standard', retrofit: 'retrofit CBO', rebuild: 'rebuild', standard: 'replace by standard', retire: 'retire', review: 'to be decided', used: 'used', unused: 'unused', unknown: 'no data' },
  ja: { keep: '標準維持', adopt: '標準適用', retrofit: 'CBO 移行', rebuild: '再開発', standard: '標準へ置換', retire: '廃止', review: '要検討', used: '利用', unused: '未使用', unknown: '実績なし' },
};
export const wricefNote = (r, lang) => { const w = NOTE_WORDS[String(lang || '').slice(0, 2)] || NOTE_WORDS.en; return `Gap ${r.code} · ${w[r.disposition] || r.disposition} · ${w[r.usage] || r.usage}`; };

/** `version` defaults to the version the gap model was built as (gap.version) — the dashboard skips re-imports by source. */
export function wricefItems(gap, version = '') {
  const ver = version || gap.version || '';
  return candidates(gap).map(r => ({
    label: r.label, kind: r.wricef.kind, module: r.module || gap.module,
    objects: [...new Set(arr(r.coverage).map(o => o.name))],
    note: wricefNote(r, gap.lang),
    source: { doc: 'gap', module: gap.module, code: r.code, version: ver },
  }));
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
