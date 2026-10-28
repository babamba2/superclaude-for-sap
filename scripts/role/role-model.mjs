// sc4sap:role-matrix — the model of a role & authorization document and what is derived from it.
//
// One JSON model per document; the page carries it and redraws every sheet from it (same code in Node and in the
// browser — no imports at run time beyond this file). Sheets follow the classic SAP role-matrix workbook:
//   broles  1. business roles        (who does what — business view)
//   troles  2. technical roles       (PFCG single / composite / derived / master, org levels)
//   tcodes  3. business role × T-code matrix (F / C / D)
//   users   4. user × business role assignment (X)
//   auths   5. authorization objects per technical role (object / field / value)
//   sod     6. segregation-of-duties rules + the users and roles that break them
//   revisions 7. change history

export const arr = (v) => (Array.isArray(v) ? v : []);
export const LEVELS = ['F', 'C', 'D'];
export const LEVEL_RANK = { F: 3, C: 2, D: 1 };
export const ROLE_TYPES = ['Single', 'Composite', 'Derived', 'Master'];
export const TROLE_STATUS = ['design', 'build', 'unit', 'integration', 'live', 'retired'];
export const APPROVAL = ['pending', 'approved', 'rejected'];
export const RISK = ['H', 'M', 'L'];
export const SOD_STATUS = ['open', 'mitigated', 'accepted', 'resolved'];
export const MODULES = ['PM', 'MM', 'PP', 'QM', 'SD', 'FI', 'CO', 'PS', 'WM', 'HR', 'BC', 'CROSS'];
export const ORG_LEVELS = ['Company Code', 'Plant', 'Planning Plant', 'Sales Org', 'Purchasing Org', 'Controlling Area', 'Work Center', 'Planner Group', 'none'];

const str = (v) => (v == null ? '' : String(v).trim());
const up = (v) => str(v).toUpperCase();
const pick = (v, list, d) => (list.includes(v) ? v : d);
// Values of the company layout's own columns (layout column `e:<name>`), per row.
const ext = (v) => Object.fromEntries(Object.entries(v && typeof v === 'object' && !Array.isArray(v) ? v : {}).map(([k, x]) => [k, str(x)]).filter(([, x]) => x));

/** Fills defaults so every sheet can be drawn from a partial model (new drafts, SAP reads, edited pages). */
export function normalizeModel(m = {}) {
  const doc = { project: '', system: '', module: '', author: '', org: '', date: '', reviewer: '', code: 'ROLES', mode: 'new', ...(m.doc || {}) };
  doc.code = str(doc.code) || 'ROLES';
  const broles = arr(m.broles).map((b, i) => ({ id: str(b.id) || `R-${String(i + 1).padStart(2, '0')}`, name: str(b.name), nameEn: str(b.nameEn), module: str(b.module),
    desc: str(b.desc), tasks: str(b.tasks), org: str(b.org), troles: arr(b.troles).map(up).filter(Boolean), users: b.users === '' || b.users == null ? '' : Number(b.users) || 0, note: str(b.note), ext: ext(b.ext) }));
  const troles = arr(m.troles).map((t) => ({ id: up(t.id), desc: str(t.desc), type: pick(t.type, ROLE_TYPES, 'Single'), parent: up(t.parent), module: str(t.module),
    brole: str(t.brole), orgLevel: str(t.orgLevel), orgValue: str(t.orgValue), owner: str(t.owner), status: pick(t.status, TROLE_STATUS, 'design'),
    children: arr(t.children).map(up).filter(Boolean), note: str(t.note), sap: t.sap || null, ext: ext(t.ext) }));
  const tcodes = arr(m.tcodes).map((c) => ({ tcode: up(c.tcode), module: str(c.module), area: str(c.area), text: str(c.text),
    levels: Object.fromEntries(Object.entries(c.levels || {}).map(([k, v]) => [k, up(v)]).filter(([, v]) => LEVELS.includes(v))), note: str(c.note), guess: !!c.guess, ext: ext(c.ext) }));
  const users = arr(m.users).map((u) => ({ empNo: str(u.empNo), uid: up(u.uid), name: str(u.name), dept: str(u.dept), pos: str(u.pos), plant: str(u.plant),
    roles: Object.fromEntries(Object.entries(u.roles || {}).filter(([, v]) => v === true || up(v) === 'X').map(([k]) => [k, 'X'])),
    approval: pick(u.approval, APPROVAL, 'pending'), note: str(u.note), valid: str(u.valid), ext: ext(u.ext) }));
  const auths = arr(m.auths).map((a) => ({ trole: up(a.trole), object: up(a.object), objText: str(a.objText), field: up(a.field), fieldText: str(a.fieldText), value: str(a.value), note: str(a.note), ext: ext(a.ext) }));
  const sod = arr(m.sod).map((s, i) => ({ id: str(s.id) || `SOD-${String(i + 1).padStart(2, '0')}`, a: str(s.a), b: str(s.b), kind: str(s.kind), risk: str(s.risk),
    level: pick(up(s.level), RISK, 'M'), mitigation: str(s.mitigation), approver: str(s.approver), status: pick(s.status, SOD_STATUS, 'open'), note: str(s.note),
    tcodesA: arr(s.tcodesA).map(up), tcodesB: arr(s.tcodesB).map(up), ext: ext(s.ext) }));
  const revisions = arr(m.revisions).map((r) => ({ ver: str(r.ver), date: str(r.date), author: str(r.author), change: str(r.change), approver: str(r.approver), note: str(r.note), ext: ext(r.ext) }));
  return { lang: m.lang === 'en' ? 'en' : 'ko', doc, broles, troles, tcodes, users, auths, sod, revisions, source: m.source || null,
    // company layout (sheets, columns, level codes, cover, theme) — see skills/role-matrix/layout.md; null = the default workbook
    layout: m.layout && typeof m.layout === 'object' ? m.layout : null };
}

/** Business roles a T-code row gives, and the highest level among them. */
/**
 * SoD hits. A rule names two business roles (a, b) — or, from the SoD library, two T-code sets (tcodesA / tcodesB):
 *  · users holding both sides (by assignment)
 *  · business roles that hold both sides on their own (inherent conflict)
 */
export function sodHits(m) {
  const sideRoles = (ids, codes) => {
    const set = new Set(arr(ids).filter(Boolean));
    const want = new Set(codes || []);
    if (want.size) for (const c of m.tcodes) if (want.has(c.tcode)) for (const [r, v] of Object.entries(c.levels)) if (v === 'F' || v === 'C') set.add(r);
    return set;
  };
  return m.sod.map((s) => {
    const A = sideRoles(s.a ? s.a.split(/[,\s]+/) : [], s.tcodesA), B = sideRoles(s.b ? s.b.split(/[,\s]+/) : [], s.tcodesB);
    const inherent = [...A].filter((r) => B.has(r) && (s.tcodesA.length || s.tcodesB.length));
    const has = (u, S) => Object.keys(u.roles).some((r) => u.roles[r] && S.has(r));
    const users = m.users.filter((u) => has(u, A) && has(u, B)).map((u) => u.uid || u.name);
    return { id: s.id, users, inherent, a: [...A], b: [...B] };
  });
}

/** Everything the sheets show besides the raw rows: counts, matrix totals, SoD hits, checks. */
export function deriveView(model) {
  const m = normalizeModel(model);
  const ids = m.broles.map((b) => b.id);
  const tcCount = Object.fromEntries(ids.map((id) => [id, { all: 0, F: 0, C: 0, D: 0 }]));
  // linear in the filled cells: a synced model can hold thousands of roles and T-codes
  for (const c of m.tcodes) for (const [id, v] of Object.entries(c.levels)) if (v && tcCount[id]) { tcCount[id].all++; if (tcCount[id][v] != null) tcCount[id][v]++; }
  const userCount = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const u of m.users) for (const id of Object.keys(u.roles)) if (u.roles[id] && userCount[id] != null) userCount[id]++;
  const idSet = new Set(ids);
  const hits = sodHits(m);
  const hitById = new Map(hits.map((h) => [h.id, h]));
  const sodUsers = new Map();
  for (const h of hits) for (const u of h.users) sodUsers.set(u, [...(sodUsers.get(u) || []), h.id]);
  const checks = [];
  const add = (sheet, sev, text, ref = '') => checks.push({ sheet, sev, text, ref });
  const trIds = new Set(m.troles.map((t) => t.id));
  const dup = (list) => { const seen = new Set(), out = new Set(); for (const x of list) { if (x && seen.has(x)) out.add(x); seen.add(x); } return out; };
  for (const d of new Set(dup(ids))) add('broles', 'err', `dupBrole`, d);
  for (const d of new Set(dup(m.troles.map((t) => t.id)))) add('troles', 'err', 'dupTrole', d);
  for (const d of new Set(dup(m.tcodes.map((c) => c.tcode)))) add('tcodes', 'warn', 'dupTcode', d);
  for (const b of m.broles) {
    if (!b.troles.length) add('broles', 'warn', 'noTrole', b.id);
    for (const t of b.troles) if (!trIds.has(t)) add('broles', 'warn', 'unknownTrole', `${b.id} → ${t}`);
    if (!tcCount[b.id]?.all) add('tcodes', 'warn', 'noTcode', b.id);
  }
  for (const t of m.troles) {
    if (t.type === 'Derived' && !t.parent) add('troles', 'warn', 'noParent', t.id);
    if (t.type === 'Derived' && t.parent && !trIds.has(t.parent)) add('troles', 'info', 'parentNotListed', `${t.id} → ${t.parent}`);
    if (t.brole && !idSet.has(t.brole)) add('troles', 'warn', 'unknownBrole', `${t.id} → ${t.brole}`);
  }
  for (const c of m.tcodes) if (c.tcode && !Object.keys(c.levels).some((k) => idSet.has(k))) add('tcodes', 'info', 'tcodeNoRole', c.tcode);
  for (const u of m.users) if (!Object.keys(u.roles).some((k) => idSet.has(k))) add('users', 'info', 'userNoRole', u.uid || u.name);
  // one ID on several rows: a shared (team / position) ID in a planning workbook — allowed, but flagged
  for (const d of new Set(dup(m.users.map((u) => u.uid)))) add('users', 'warn', 'dupUser', d);
  for (const a of m.auths) if (a.trole && !trIds.has(a.trole)) add('auths', 'warn', 'authUnknownTrole', `${a.trole} · ${a.object}`);
  for (const s of m.sod) {
    const h = hitById.get(s.id);
    if (h.users.length && s.status !== 'accepted' && s.status !== 'mitigated') add('sod', s.level === 'H' ? 'err' : 'warn', 'sodUsers', `${s.id}: ${h.users.join(', ')}`);
    if (h.inherent.length) add('sod', 'warn', 'sodInherent', `${s.id}: ${h.inherent.join(', ')}`);
  }
  return {
    m, ids, idSet, tcCount, userCount, hits, hitById, sodUsers, checks,
    totals: { broles: m.broles.length, troles: m.troles.length, tcodes: m.tcodes.filter((c) => c.tcode).length, users: m.users.filter((u) => u.uid || u.name).length,
      auths: m.auths.length, sod: m.sod.length, sodBroken: hits.filter((h) => h.users.length).length },
  };
}

/** Renames a business role everywhere it is referenced (matrix columns, assignments, technical roles, SoD). */
export function renameBrole(model, from, to) {
  if (!from || !to || from === to) return model;
  const sw = (s) => s.split(/([,\s]+)/).map((p) => (p === from ? to : p)).join('');
  for (const b of model.broles) if (b.id === from) b.id = to;
  for (const c of model.tcodes) if (c.levels && from in c.levels) { c.levels[to] = c.levels[from]; delete c.levels[from]; }
  for (const u of model.users) if (u.roles && from in u.roles) { u.roles[to] = u.roles[from]; delete u.roles[from]; }
  for (const t of model.troles) if (t.brole === from) t.brole = to;
  for (const s of model.sod) { s.a = sw(s.a || ''); s.b = sw(s.b || ''); }
  return model;
}

/** Renames a technical role in the business-role mapping, parents, composites and the authorization rows. */
export function renameTrole(model, from, to) {
  if (!from || !to || from === to) return model;
  for (const b of model.broles) b.troles = arr(b.troles).map((t) => (t === from ? to : t));
  for (const t of model.troles) { if (t.parent === from) t.parent = to; t.children = arr(t.children).map((c) => (c === from ? to : c)); }
  for (const a of model.auths) if (a.trole === from) a.trole = to;
  return model;
}

/** Next document version: 0.1 steps (drafts start at 0.1), --major → next whole number. */
export function nextVersion(last, { major = false } = {}) {
  if (!last) return '0.1';
  const [a, b] = String(last).replace(/^v/i, '').split('.').map((n) => Number(n) || 0);
  return major ? `${a + 1}.0` : `${a}.${b + 1}`;
}

/** RFC 4180 CSV with a BOM so Excel opens Korean text correctly. */
export function toCsv(head, rows) {
  const q = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return `﻿${[head, ...rows].map((r) => r.map(q).join(',')).join('\r\n')}\r\n`;
}
