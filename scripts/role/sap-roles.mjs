// sc4sap:role-matrix — read the roles that exist in SAP and turn them into a role-matrix model. Read-only.
//
// Role design tables only: AGR_DEFINE, AGR_TEXTS, AGR_FLAGS, AGR_AGRS, AGR_TCODES, AGR_1251, AGR_1252, and — when the
// user assignment is asked for — AGR_USERS (user ID and validity dates only; no names, no logon data). Texts from
// TSTCT, TOBJT, AUTHX + DD04T, organizational levels from USORG. USR* (logon data, password hashes) is never read.
//
// The MCP server blocklist denies AGR_1251 / AGR_AGRS / AGR_USERS by default; this reader starts its own MCP server
// process with MCP_ALLOW_TABLE naming exactly the tables above (the server logs every bypass), so the exception
// covers this skill's reads only. On BASIS < 7.50 the reads go through ZMCP_ADT_DISPATCH TABLE_READ, which must allow
// the AGR_* role tables too (see abap/zmcp_adt_dispatch_ecc.abap).

import { connect, readTable, readIn } from '../config/sap-reader.mjs';
import { arr, MODULES, LEVEL_RANK, normalizeModel } from './role-model.mjs';

export const ROLE_TABLES = ['AGR_DEFINE', 'AGR_TEXTS', 'AGR_FLAGS', 'AGR_AGRS', 'AGR_TCODES', 'AGR_1251', 'AGR_1252'];
export const USER_TABLES = ['AGR_USERS'];
/** Every table readRoles reads — the fixed allow list a caller hands its own connection (never named by a request). */
export const ROLE_READ_TABLES = (withUsers = true) => [...ROLE_TABLES, ...(withUsers ? USER_TABLES : []), 'TSTCT', 'TOBJT', 'AUTHX', 'DD04T', 'USORG'];

const ORG_NAMES = { BUKRS: 'Company Code', WERKS: 'Plant', IWERK: 'Planning Plant', SWERK: 'Plant', VKORG: 'Sales Org', EKORG: 'Purchasing Org', KOKRS: 'Controlling Area',
  VTWEG: 'Distribution Channel', SPART: 'Division', LGNUM: 'Warehouse', GSBER: 'Business Area', PERSA: 'Personnel Area', BWKEY: 'Valuation Area', VSTEL: 'Shipping Point' };
const DISPLAY_RE = /display|show|anzeig|조회|표시|list|report|overview|리스트|현황|보고|照会|表示|一覧|レポート/i;
const sapDate = (s) => { const t = String(s || '').replace(/-/g, ''); return /^\d{8}$/.test(t) && t !== '00000000' ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : ''; };

/** SAP role-name patterns (Z*, Z_PM_*) → SQL LIKE conditions. */
export function likeOf(pattern) { return String(pattern).trim().toUpperCase().replace(/\*/g, '%').replace(/\?/g, '_'); }

/** Module of a role from its name tokens (Z_PM_PLANNER → PM), else the default. */
export function moduleOf(name, fallback = '') {
  const toks = String(name).toUpperCase().split(/[_\-:]/);
  return toks.find((t) => MODULES.includes(t)) || fallback;
}

/** Highest level a role's activities allow: 01/06 create · delete → F, 02 change → C, 03 only → D. */
export function levelFromActvt(acts) {
  const s = new Set(acts);
  if (!s.size) return 'C';
  if (s.has('*') || s.has('01') || s.has('06')) return 'F';
  if (s.has('02')) return 'C';
  return 'D';
}

/**
 * Raw rows → model parts. Pure, so the mapping is testable without SAP.
 * rows: { define, texts, flags, agrs, tcodes, auth, org, users, tstct, tobjt, fieldText, usorg }
 */
export function mapRoles(rows, { module = '', today = new Date().toISOString().slice(0, 10) } = {}) {
  const roles = arr(rows.define).map((r) => r.AGR_NAME);
  const parentOf = new Map(arr(rows.define).map((r) => [r.AGR_NAME, r.PARENT_AGR || '']));
  const text = new Map(); for (const t of arr(rows.texts)) if (!t.LINE || /^0+$/.test(String(t.LINE))) text.set(t.AGR_NAME, t.TEXT);
  const composite = new Set(arr(rows.flags).filter((f) => f.FLAG_TYPE === 'COLL_AGR' && f.FLAG_VALUE === 'X').map((f) => f.AGR_NAME));
  const children = new Map(); for (const a of arr(rows.agrs)) children.set(a.AGR_NAME, [...(children.get(a.AGR_NAME) || []), a.CHILD_AGR]);
  for (const c of children.keys()) composite.add(c);
  const masters = new Set([...parentOf.values()].filter(Boolean));
  const tcodesOf = new Map(); for (const t of arr(rows.tcodes)) if ((t.TYPE || 'TR') === 'TR' && !t.EXCLUDE) tcodesOf.set(t.AGR_NAME, [...(tcodesOf.get(t.AGR_NAME) || []), t.TCODE || t.LOW]);
  const live = arr(rows.auth).filter((a) => !a.DELETED);
  const actsOf = new Map(); for (const a of live) if (a.FIELD === 'ACTVT') actsOf.set(a.AGR_NAME, [...(actsOf.get(a.AGR_NAME) || []), a.LOW, ...(a.HIGH ? [a.HIGH] : [])]);
  const orgField = new Map(arr(rows.usorg).map((u) => [u.VARBL, u.FIELD]));
  const orgOf = new Map(); for (const o of arr(rows.org)) { const f = orgField.get(o.VARBL) || String(o.VARBL).replace(/^\$/, ''); const x = orgOf.get(o.AGR_NAME) || { fields: new Set(), values: new Set() }; x.fields.add(f); if (o.LOW) x.values.add(o.HIGH ? `${o.LOW}-${o.HIGH}` : o.LOW); orgOf.set(o.AGR_NAME, x); }
  const tsText = new Map(arr(rows.tstct).map((t) => [t.TCODE, t.TTEXT]));
  const objText = new Map(arr(rows.tobjt).map((t) => [t.OBJECT, t.TTEXT]));
  const fText = new Map(Object.entries(rows.fieldText || {}));

  // Technical roles
  const typeOf = (r) => (composite.has(r) ? 'Composite' : parentOf.get(r) ? 'Derived' : masters.has(r) ? 'Master' : 'Single');
  // Business role per technical role: derived → their master's; the rest → their own.
  const owner = (r) => (typeOf(r) === 'Derived' && roles.includes(parentOf.get(r)) ? parentOf.get(r) : r);
  const bOwners = [...new Set(roles.map(owner))];
  const counters = {};
  const bid = new Map();
  for (const r of bOwners) {
    const m = moduleOf(r, module) || 'R';
    counters[m] = (counters[m] || 0) + 1;
    bid.set(r, `${m}-${String(counters[m]).padStart(2, '0')}`);
  }
  const broleOf = (r) => bid.get(owner(r)) || '';
  const troles = roles.map((r) => {
    const o = orgOf.get(r);
    return { id: r, desc: text.get(r) || '', type: typeOf(r), parent: parentOf.get(r) || '', module: moduleOf(r, module), brole: broleOf(r),
      orgLevel: o ? [...o.fields].map((f) => ORG_NAMES[f] || f).join(', ') : '', orgValue: o ? [...o.values].join(', ') : '', children: children.get(r) || [],
      owner: '', status: 'live', note: '', sap: { tcodes: (tcodesOf.get(r) || []).length } };
  });
  const broles = bOwners.map((r) => ({ id: bid.get(r), name: text.get(r) || r, nameEn: '', module: moduleOf(r, module), desc: '', tasks: '', org: '',
    troles: roles.filter((x) => owner(x) === r), users: '', note: '' }));

  // T-code matrix: a business role's level on a T-code = highest level among its technical roles (composites through their children).
  const lv = new Map(); // tcode → { brole → level }
  const put = (tc, b, l) => { const x = lv.get(tc) || {}; if (!x[b] || LEVEL_RANK[l] > LEVEL_RANK[x[b]]) x[b] = l; lv.set(tc, x); };
  const via = (r) => (composite.has(r) ? [r, ...(children.get(r) || [])] : [r]);
  for (const r of roles) {
    const b = broleOf(r);
    for (const x of via(r)) {
      const roleLevel = levelFromActvt(actsOf.get(x) || []);
      for (const tc of tcodesOf.get(x) || []) put(tc, b, DISPLAY_RE.test(tsText.get(tc) || '') ? 'D' : roleLevel);
    }
  }
  const tcodes = [...lv.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([tc, levels]) => ({ tcode: tc, module: '', area: '', text: tsText.get(tc) || '', levels, note: '', guess: true }));
  for (const b of broles) for (const tc of tcodes) if (tc.levels[b.id] && !tc.module) tc.module = b.module;

  // Authorization objects: one row per role · object · field with the values joined (derived roles: org values only — the rest is the master's).
  const auths = [];
  const byKey = new Map();
  for (const a of live) {
    if (typeOf(a.AGR_NAME) === 'Derived') continue;
    const k = `${a.AGR_NAME}|${a.OBJECT}|${a.FIELD}`;
    const v = a.HIGH ? `${a.LOW}-${a.HIGH}` : a.LOW;
    if (!byKey.has(k)) { const row = { trole: a.AGR_NAME, object: a.OBJECT, objText: objText.get(a.OBJECT) || '', field: a.FIELD, fieldText: fText.get(a.FIELD) || '', value: [], note: '' }; byKey.set(k, row); auths.push(row); }
    if (v && !byKey.get(k).value.includes(v)) byKey.get(k).value.push(v);
  }
  for (const a of auths) a.value = a.value.join(', ');

  // Assignments: valid today, mapped to the business role of the assigned role.
  const users = new Map();
  for (const u of arr(rows.users)) {
    const to = sapDate(u.TO_DAT), from = sapDate(u.FROM_DAT);
    if (to && to < today) continue;
    const x = users.get(u.UNAME) || { uid: u.UNAME, roles: {}, approval: 'approved', valid: '' };
    const b = broleOf(u.AGR_NAME); if (b) x.roles[b] = 'X';
    x.valid = [from, to && to !== '9999-12-31' ? to : ''].filter(Boolean).join(' ~ ');
    users.set(u.UNAME, x);
  }
  for (const b of broles) b.users = [...users.values()].filter((u) => u.roles[b.id]).length;
  return { broles, troles, tcodes, auths, users: [...users.values()].sort((a, b) => (a.uid < b.uid ? -1 : 1)) };
}

// Characters of role names in binary order; a name range splits into one sub-range per next character.
const NAME_CHARS = '-./0123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_';
const after = (s) => s.slice(0, -1) + String.fromCharCode(s.charCodeAt(s.length - 1) + 1);

/**
 * AGR_DEFINE rows for one pattern. One read returns at most `max` rows (the ECC dispatcher caps at 5000), so a
 * range that hits the cap is read again as one range per next character of the name, down to 30 characters.
 */
export async function readRoleNames(client, pattern, max = 5000) {
  const like = `AGR_NAME LIKE '${likeOf(pattern).replace(/'/g, "''")}'`;
  const prefix = likeOf(pattern).split(/[%_]/)[0];
  const q = (s) => `'${s.replace(/'/g, "''")}'`;
  const rows = [], errors = [], truncated = [];
  const read = async (lo, hi, p) => {
    const where = [like, lo ? `AGR_NAME >= ${q(lo)}` : '', hi ? `AGR_NAME < ${q(hi)}` : ''].filter(Boolean).join(' AND ');
    const r = await readTable(client, 'AGR_DEFINE', { where, fields: ['AGR_NAME', 'PARENT_AGR'], maxRows: max });
    if (!r.ok) { errors.push(r.error); return; }
    if (!r.truncated) { rows.push(...r.rows); return; }
    if (p.length >= 30) { truncated.push(p); rows.push(...r.rows); return; }
    // the name equal to the prefix, then [p+c, p+next c) for each character, then the rest up to the range end
    if (p) { const e = await readTable(client, 'AGR_DEFINE', { where: `${like} AND AGR_NAME = ${q(p)}`, fields: ['AGR_NAME', 'PARENT_AGR'], maxRows: 1 }); if (e.ok) rows.push(...e.rows); else errors.push(e.error); }
    const cuts = [...NAME_CHARS].map((c) => p + c);
    for (let i = 0; i < cuts.length; i++) {
      const top = i + 1 < cuts.length ? cuts[i + 1] : (hi || (p ? after(p) : ''));
      await read(cuts[i], top, cuts[i]);
    }
  };
  await read(prefix, prefix ? after(prefix) : '', prefix);
  return { ok: errors.length === 0, rows, error: errors[0], errors, truncated };
}

/**
 * The roles read from SAP (readRoles rows) laid onto the existing document — the merge of `build-role-doc sync`, shared
 * with the web workbench. Without `replace`, what people wrote stays: business-role names / texts, user names and
 * departments, SoD rules, authorization notes; SAP decides roles, T-codes, levels and assignments.
 * Returns the new model (`old` is not changed).
 */
export function mergeSync(oldModel, rows, { module = '', replace = false, patterns = [], withUsers = true, system = '', today = new Date().toISOString().slice(0, 10), doc = {}, code = '' } = {}) {
  const old = normalizeModel(JSON.parse(JSON.stringify(oldModel || {})));
  const got = mapRoles(rows, { module, today });
  const keep = (list, key, fresh, fields) => fresh.map((x) => { const o = replace ? null : list.find((y) => y[key] === x[key]); if (!o) return x; for (const k of fields) if (o[k]) x[k] = o[k]; return x; });
  return normalizeModel({
    ...old,
    doc: { ...old.doc, ...Object.fromEntries(Object.entries(doc || {}).filter(([, x]) => x)), code: code || old.doc.code, mode: 'sap' },
    broles: keep(old.broles, 'id', got.broles, ['name', 'nameEn', 'desc', 'tasks', 'org', 'note', 'ext']),
    troles: keep(old.troles, 'id', got.troles, ['owner', 'note', 'status', 'ext']),
    tcodes: keep(old.tcodes, 'tcode', got.tcodes, ['area', 'note', 'module', 'ext']),
    users: keepShared(old.users, keep(old.users, 'uid', got.users, ['empNo', 'name', 'dept', 'pos', 'plant', 'note', 'approval', 'ext'])),
    auths: got.auths.map((a) => { const o = replace ? null : old.auths.find((y) => y.trole === a.trole && y.object === a.object && y.field === a.field); return o ? { ...a, note: o.note, ext: o.ext } : a; }),
    sod: old.sod,
    source: { system, readAt: today, patterns, users: withUsers, roles: arr(rows?.define).length },
  });
}

/**
 * A shared user ID (several people on one ID in the workbook) is one user in SAP: keep() fills the first of those
 * rows; the other rows stay, with what people wrote, and take the roles SAP gives that ID.
 */
export function keepShared(old, fresh) {
  if (!old.length) return fresh;
  const out = [];
  for (const x of fresh) {
    out.push(x);
    for (const o of old.filter((y) => y.uid && y.uid === x.uid).slice(1)) out.push({ ...o, roles: { ...x.roles }, valid: x.valid });
  }
  return out;
}

/**
 * Reads the roles matching the patterns from the connected system — or, with `names`, exactly those roles
 * (AGR_DEFINE in IN lists; "SAP 반영 확인" reads the document's own roles this way, role-verify.mjs).
 */
export async function readRoles({ patterns = ['Z*'], names: exact = null, withUsers = true, lang = 'ko', maxRoles = 5000, client: given = null } = {}) {
  // A caller's own connection (e.g. a backend with its own guards) is used as given and left open; else one is opened
  // here with ROLE_READ_TABLES as its allow list and closed at the end.
  const client = given || await connect('role-matrix', { allowTables: ROLE_READ_TABLES(withUsers) });
  const errors = [];
  const need = (r, what) => {
    if (!r.ok) errors.push(`${what}: ${String(r.error || arr(r.errors).join(' | ')).slice(0, 240)}`);
    // one role with more rows than one read returns (5000) — usually an all-access role; its first rows are kept
    const t = Array.isArray(r.truncated) ? r.truncated : r.truncated ? ['?'] : [];
    if (t.length) errors.push(`${what}: ${t.length} role(s) over the 5000-row read limit, partly read: ${t.slice(0, 5).join(', ')}${t.length > 5 ? ' …' : ''}`);
    return r.rows || [];
  };
  try {
    const spras = lang === 'en' ? 'E' : lang === 'ja' ? 'J' : '3';
    const define = [], seen = new Set();
    if (Array.isArray(exact)) {
      const wanted = [...new Set(exact.map((n) => String(n).trim().toUpperCase()).filter(Boolean))];
      for (const x of need(await readIn(client, 'AGR_DEFINE', 'AGR_NAME', wanted), 'AGR_DEFINE')) if (!seen.has(x.AGR_NAME)) { seen.add(x.AGR_NAME); define.push(x); }
    } else for (const p of patterns) {
      const r = await readRoleNames(client, p, maxRoles);
      for (const x of need(r, `AGR_DEFINE ${p}`)) if (!seen.has(x.AGR_NAME)) { seen.add(x.AGR_NAME); define.push(x); }
    }
    const names = define.map((d) => d.AGR_NAME);
    if (!names.length) return { rows: { define }, errors: errors.length ? errors : [Array.isArray(exact) ? 'none of the roles is in the system' : `no role matches ${patterns.join(', ')}`] };
    const rows = { define };
    rows.texts = need(await readIn(client, 'AGR_TEXTS', 'AGR_NAME', names, { extra: { SPRAS: spras } }), 'AGR_TEXTS');
    if (!rows.texts.length && spras !== 'E') rows.texts = need(await readIn(client, 'AGR_TEXTS', 'AGR_NAME', names, { extra: { SPRAS: 'E' } }), 'AGR_TEXTS');
    rows.flags = need(await readIn(client, 'AGR_FLAGS', 'AGR_NAME', names, { extra: { FLAG_TYPE: 'COLL_AGR' } }), 'AGR_FLAGS');
    rows.agrs = need(await readIn(client, 'AGR_AGRS', 'AGR_NAME', names), 'AGR_AGRS');
    rows.tcodes = need(await readIn(client, 'AGR_TCODES', 'AGR_NAME', names), 'AGR_TCODES');
    rows.auth = need(await readIn(client, 'AGR_1251', 'AGR_NAME', names, { chunk: 10 }), 'AGR_1251');
    rows.org = need(await readIn(client, 'AGR_1252', 'AGR_NAME', names), 'AGR_1252');
    if (withUsers) rows.users = need(await readIn(client, 'AGR_USERS', 'AGR_NAME', names, { fields: ['AGR_NAME', 'UNAME', 'FROM_DAT', 'TO_DAT'] }), 'AGR_USERS');
    const tcs = [...new Set(rows.tcodes.map((t) => t.TCODE || t.LOW).filter(Boolean))];
    // A language not installed on the system (often Japanese) has no texts: English then.
    const texts = async (table, key, keys, langField, extra = {}) => {
      const got = need(await readIn(client, table, key, keys, { extra: { [langField]: spras, ...extra } }), table);
      return got.length || spras === 'E' || !keys.length ? got : need(await readIn(client, table, key, keys, { extra: { [langField]: 'E', ...extra } }), table);
    };
    rows.tstct = await texts('TSTCT', 'TCODE', tcs, 'SPRSL');
    const objs = [...new Set(rows.auth.map((a) => a.OBJECT))];
    rows.tobjt = await texts('TOBJT', 'OBJECT', objs, 'LANGU');
    const fields = [...new Set(rows.auth.map((a) => a.FIELD))];
    const authx = need(await readIn(client, 'AUTHX', 'FIELDNAME', fields), 'AUTHX');
    const rolls = [...new Set(authx.map((a) => a.ROLLNAME).filter(Boolean))];
    const dd04t = await texts('DD04T', 'ROLLNAME', rolls, 'DDLANGUAGE', { AS4LOCAL: 'A' });
    const dt = new Map(dd04t.map((d) => [d.ROLLNAME, d.SCRTEXT_M || d.DDTEXT]));
    rows.fieldText = Object.fromEntries(authx.map((a) => [a.FIELDNAME, dt.get(a.ROLLNAME) || '']));
    rows.usorg = need(await readTable(client, 'USORG', {}), 'USORG');
    return { rows, errors };
  } finally {
    if (!given) await client.close().catch(() => {});
  }
}
