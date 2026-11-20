// sc4sap:role-matrix — "SAP 반영 확인": is the document what the connected system holds? Read-only.
//
// The document's technical roles are read with sap-roles.mjs readRoles (its fixed tables; user assignments only when
// asked, ID and validity only) and compared with the document, role by role:
//   status per technical role: ok (no difference) · diff · missing (not in AGR_DEFINE)
//   difference rows:
//     tcode-doc / tcode-sap   a T-code the business role has in the document but none of its roles in SAP, and back
//     level                   the D / C / F level SAP's activities suggest differs — reference only, never counted
//     auth-diff / auth-doc / auth-sap   an object · field whose values differ, or that one side only has
//                             (only for roles the document lists authorizations for; derived roles: org values only)
//     org                     the organizational level values differ (AGR_1252)
//     user-doc / user-sap     an assignment (user ID → business role) on one side only (when users are read)
// Roles that exist in SAP but not in the document are out of scope (sync reads them).
// `applyVerify` takes SAP's side for the rows the reader accepts — into the document only; nothing goes to SAP.
// Pure: no file, no network (the rows come from readRoles or a test).
import { arr, normalizeModel, LEVEL_RANK } from './role-model.mjs';
import { levelFromActvt } from './sap-roles.mjs';

const str = (v) => (v == null ? '' : String(v).trim());
const sapDate = (s) => { const t = String(s || '').replace(/-/g, ''); return /^\d{8}$/.test(t) && t !== '00000000' ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : ''; };
const split = (v) => [...new Set(str(v).split(/\s*,\s*/).map((x) => x.trim().toUpperCase()).filter(Boolean))].sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const DISPLAY_RE = /display|show|anzeig|조회|표시|list|report|overview|리스트|현황|보고|照会|表示|一覧|レポート/i;
export const COUNTED = new Set(['tcode-doc', 'tcode-sap', 'auth-diff', 'auth-doc', 'auth-sap', 'org', 'user-doc', 'user-sap']);

/** The document's technical role names — what verify reads. */
export const docRoleNames = (model) => [...new Set(normalizeModel(model).troles.map((t) => t.id).filter(Boolean))];

/**
 * Compare. `rows`: readRoles rows ({ define, flags, agrs, tcodes, auth, org, users, tstct, usorg }).
 * Returns { roles: [{ id, status }], diffs: [{ id, kind, roles, brole, key, doc, sap, text, counted }], counts }.
 */
export function compareRoles(model, rows, { withUsers = false, today = new Date().toISOString().slice(0, 10) } = {}) {
  const m = normalizeModel(model);
  const inSap = new Set(arr(rows.define).map((d) => str(d.AGR_NAME).toUpperCase()));
  const parentOf = new Map(arr(rows.define).map((d) => [str(d.AGR_NAME).toUpperCase(), str(d.PARENT_AGR).toUpperCase()]));
  const children = new Map();
  for (const a of arr(rows.agrs)) children.set(str(a.AGR_NAME).toUpperCase(), [...(children.get(str(a.AGR_NAME).toUpperCase()) || []), str(a.CHILD_AGR).toUpperCase()]);
  const via = (r) => [r, ...(children.get(r) || [])];
  const tcodesOf = new Map();
  for (const t of arr(rows.tcodes)) if ((t.TYPE || 'TR') === 'TR' && !t.EXCLUDE) { const r = str(t.AGR_NAME).toUpperCase(); tcodesOf.set(r, [...(tcodesOf.get(r) || []), str(t.TCODE || t.LOW).toUpperCase()]); }
  const live = arr(rows.auth).filter((a) => !a.DELETED);
  const actsOf = new Map();
  for (const a of live) if (a.FIELD === 'ACTVT') { const r = str(a.AGR_NAME).toUpperCase(); actsOf.set(r, [...(actsOf.get(r) || []), a.LOW, ...(a.HIGH ? [a.HIGH] : [])]); }
  const tsText = new Map(arr(rows.tstct).map((t) => [str(t.TCODE).toUpperCase(), str(t.TTEXT)]));

  // Business role → its technical roles: the business role's own list, and roles that name it.
  const trolesOf = new Map(m.broles.map((b) => [b.id, new Set(b.troles)]));
  for (const t of m.troles) if (t.brole) { if (!trolesOf.has(t.brole)) trolesOf.set(t.brole, new Set()); trolesOf.get(t.brole).add(t.id); }
  const broleOfTrole = new Map();
  for (const [b, set] of trolesOf) for (const t of set) if (!broleOfTrole.has(t)) broleOfTrole.set(t, b);

  const diffs = [];
  const add = (kind, roles, key, doc, sap, extra = {}) => diffs.push({ id: `${kind}|${extra.brole || roles.join('+')}|${key}`, kind, roles, brole: extra.brole || '', key, doc, sap, text: extra.text || '', counted: COUNTED.has(kind), ...(extra.level ? { level: extra.level } : {}) });

  // T-codes per business role
  for (const [b, set] of trolesOf) {
    const roles = [...set].filter((r) => inSap.has(r));
    if (!roles.length) continue;
    const sapCodes = new Map(); // tcode → { roles, level }
    for (const r of roles) for (const x of via(r)) {
      const lvl = levelFromActvt(actsOf.get(x) || []);
      for (const tc of tcodesOf.get(x) || []) {
        const level = DISPLAY_RE.test(tsText.get(tc) || '') ? 'D' : lvl;
        const e = sapCodes.get(tc) || { roles: new Set(), level: 'D' };
        e.roles.add(r);
        if (LEVEL_RANK[level] > LEVEL_RANK[e.level]) e.level = level;
        sapCodes.set(tc, e);
      }
    }
    const docCodes = new Map(m.tcodes.filter((c) => c.tcode && c.levels[b]).map((c) => [c.tcode, c.levels[b]]));
    for (const [tc, lv] of docCodes) {
      if (!sapCodes.has(tc)) add('tcode-doc', roles, tc, lv, '', { brole: b, text: tsText.get(tc) || '' });
      else if (sapCodes.get(tc).level !== lv) add('level', [...sapCodes.get(tc).roles], tc, lv, sapCodes.get(tc).level, { brole: b, text: tsText.get(tc) || '' });
    }
    for (const [tc, e] of sapCodes) if (!docCodes.has(tc)) add('tcode-sap', [...e.roles], tc, '', e.level, { brole: b, text: tsText.get(tc) || '', level: e.level });
  }

  // Authorization values: roles the document lists authorizations for; derived roles carry org values only.
  const docAuthRoles = new Set(m.auths.map((a) => a.trole));
  const sapAuth = new Map();
  for (const a of live) {
    const r = str(a.AGR_NAME).toUpperCase();
    if (!docAuthRoles.has(r) || parentOf.get(r)) continue;
    const k = `${r}|${str(a.OBJECT).toUpperCase()}|${str(a.FIELD).toUpperCase()}`;
    const v = a.HIGH ? `${a.LOW}-${a.HIGH}` : str(a.LOW);
    sapAuth.set(k, [...(sapAuth.get(k) || []), v]);
  }
  const docAuth = new Map(m.auths.filter((a) => inSap.has(a.trole) && !parentOf.get(a.trole)).map((a) => [`${a.trole}|${a.object}|${a.field}`, split(a.value)]));
  for (const [k, dv] of docAuth) {
    const [r, o, f] = k.split('|');
    const sv = sapAuth.has(k) ? [...new Set(sapAuth.get(k).map((x) => x.toUpperCase()).filter(Boolean))].sort() : null;
    if (!sv) add('auth-doc', [r], `${o} · ${f}`, dv.join(', '), '');
    else if (!same(dv, sv)) add('auth-diff', [r], `${o} · ${f}`, dv.join(', '), sv.join(', '));
  }
  for (const [k, sv] of sapAuth) if (!docAuth.has(k)) { const [r, o, f] = k.split('|'); add('auth-sap', [r], `${o} · ${f}`, '', [...new Set(sv.map((x) => x.toUpperCase()).filter(Boolean))].sort().join(', ')); }

  // Organizational levels
  const orgOf = new Map();
  for (const o of arr(rows.org)) { const r = str(o.AGR_NAME).toUpperCase(); if (o.LOW) orgOf.set(r, [...(orgOf.get(r) || []), o.HIGH ? `${o.LOW}-${o.HIGH}` : str(o.LOW)]); }
  for (const t of m.troles) {
    if (!inSap.has(t.id) || (!t.orgValue && !orgOf.has(t.id))) continue;
    const dv = split(t.orgValue);
    const sv = [...new Set((orgOf.get(t.id) || []).map((x) => x.toUpperCase()))].sort();
    if (!same(dv, sv)) add('org', [t.id], t.orgLevel || 'org', dv.join(', '), sv.join(', '));
  }

  // Assignments (user ID → business role), valid today
  if (withUsers) {
    const sapUsers = new Map();
    for (const u of arr(rows.users)) {
      const to = sapDate(u.TO_DAT);
      if (to && to < today) continue;
      const b = broleOfTrole.get(str(u.AGR_NAME).toUpperCase());
      if (!b) continue;
      const uid = str(u.UNAME).toUpperCase();
      const x = sapUsers.get(uid) || new Map();
      x.set(b, [sapDate(u.FROM_DAT), to && to !== '9999-12-31' ? to : ''].filter(Boolean).join(' ~ '));
      sapUsers.set(uid, x);
    }
    const docUsers = new Map();
    for (const u of m.users) if (u.uid) { const s = docUsers.get(u.uid) || new Set(); for (const b of Object.keys(u.roles)) if (trolesOf.has(b)) s.add(b); docUsers.set(u.uid, s); }
    for (const [uid, set] of docUsers) for (const b of set) if (!sapUsers.get(uid)?.has(b) && [...(trolesOf.get(b) || [])].some((r) => inSap.has(r))) add('user-doc', [...trolesOf.get(b)].filter((r) => inSap.has(r)), uid, 'X', '', { brole: b });
    for (const [uid, map] of sapUsers) for (const [b, valid] of map) if (!docUsers.get(uid)?.has(b)) add('user-sap', [...trolesOf.get(b)].filter((r) => inSap.has(r)), uid, '', 'X', { brole: b, text: valid });
  }

  const touched = new Set(diffs.filter((d) => d.counted).flatMap((d) => d.roles));
  const roles = m.troles.filter((t) => t.id).map((t) => ({ id: t.id, status: !inSap.has(t.id) ? 'missing' : touched.has(t.id) ? 'diff' : 'ok' }));
  const counts = { ok: 0, diff: 0, missing: 0 };
  for (const r of roles) counts[r.status] += 1;
  return { roles, diffs, counts };
}

/** The check kept on the model (`sapCheck`): when, where, the version it was made against, and the comparison. */
export function withCheck(model, result, { date = new Date().toISOString().slice(0, 10), system = '', tier = '', withUsers = false } = {}) {
  const m = normalizeModel(JSON.parse(JSON.stringify(model || {})));
  m.sapCheck = { date, system: str(system), tier: str(tier), withUsers: !!withUsers, version: str(arr(m.revisions).at(-1)?.ver), counts: result.counts, roles: result.roles, diffs: result.diffs, applied: [] };
  return normalizeModel(m);
}

/**
 * SAP's side into the document for the accepted rows of the kept check (`ids`). The level rows are reference only
 * and are not applied. Returns { model, applied: [id…], skipped: [{ id, why }] } — the check stays, with the ids
 * marked applied.
 */
export function applyVerify(model, ids) {
  const m = normalizeModel(JSON.parse(JSON.stringify(model || {})));
  const check = m.sapCheck;
  const applied = [];
  const skipped = [];
  if (!check) return { model: m, applied, skipped: arr(ids).map((id) => ({ id, why: 'no SAP check on the document' })) };
  const byId = new Map(check.diffs.map((d) => [d.id, d]));
  for (const id of arr(ids)) {
    const d = byId.get(id);
    if (!d) { skipped.push({ id, why: 'not a difference of the last check' }); continue; }
    if (!d.counted) { skipped.push({ id, why: 'reference only' }); continue; }
    if (check.applied.includes(id)) { skipped.push({ id, why: 'already applied' }); continue; }
    const [obj, field] = d.key.split(' · ');
    switch (d.kind) {
      case 'tcode-doc': { const c = m.tcodes.find((x) => x.tcode === d.key); if (c) delete c.levels[d.brole]; break; }
      case 'tcode-sap': {
        let c = m.tcodes.find((x) => x.tcode === d.key);
        if (!c) { c = { tcode: d.key, module: '', area: '', text: d.text, levels: {}, note: '', guess: true, ext: {} }; m.tcodes.push(c); }
        c.levels[d.brole] = d.level || d.sap || 'D';
        break;
      }
      case 'auth-diff': case 'auth-sap': {
        const a = m.auths.find((x) => x.trole === d.roles[0] && x.object === obj && x.field === field);
        if (a) a.value = d.sap;
        else m.auths.push({ trole: d.roles[0], object: obj, objText: '', field, fieldText: '', value: d.sap, note: '', ext: {} });
        break;
      }
      case 'auth-doc': m.auths = m.auths.filter((x) => !(x.trole === d.roles[0] && x.object === obj && x.field === field)); break;
      case 'org': { const t = m.troles.find((x) => x.id === d.roles[0]); if (t) t.orgValue = d.sap; break; }
      case 'user-doc': for (const u of m.users.filter((x) => x.uid === d.key)) delete u.roles[d.brole]; break;
      case 'user-sap': {
        const rows = m.users.filter((x) => x.uid === d.key);
        if (rows.length) for (const u of rows) u.roles[d.brole] = 'X';
        else m.users.push({ empNo: '', uid: d.key, name: '', dept: '', pos: '', plant: '', roles: { [d.brole]: 'X' }, approval: 'approved', note: '', valid: d.text, ext: {} });
        break;
      }
      default: skipped.push({ id, why: `unknown kind ${d.kind}` }); continue;
    }
    applied.push(id);
  }
  m.sapCheck = { ...check, applied: [...check.applied, ...applied] };
  return { model: normalizeModel(m), applied, skipped };
}
