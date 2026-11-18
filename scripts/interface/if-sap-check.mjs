// interface-mapping-spec — "SAP 오브젝트 점검": the open spec against the connected system, read-only.
//
// For each SAP side of the spec: does the object exist (and, for a function module, is it RFC-enabled — TFDIR
// FMODE 'R'); for every mapped row: does the SAP field exist with the type and length the spec says; is every
// mandatory receiving field mapped; and are the conversions plausible for the types (text → NUMC, truncation,
// date / time formats, decimals, the currency / unit reference field, ALPHA conversion exit, fixed values).
//
// Reads only, all fixed: readSapObject (tables, views, structures, FM signatures — the same reader as the
// spec's build), ddicObject for decimals, GetSqlQuery on TFDIR (one row) and DD03L (reference fields of the
// tables in play), GetDomain for the receiving fields' domains. No model: rows whose only answer is a free-text
// conversion rule come back `needsJudge`, for the caller to judge in one batch.
//
// sapCheck(client, m) → { at, system, objects: [...], rows: [...], counts }
//   row: { block, i, no, status: 'ok' | 'check' | 'mismatch', items: [{ code, sev, side, args }], proposals: [...],
//          needsJudge }
//   proposal: { kind: 'set-cell', path, value }  — the SAP-side cell as DDIC has it now
//             { kind: 'add-rule', ruleKind, path } — link a conversion rule of that kind (created when missing)

import { call, ddicObject, readSapObject } from './sap-fields.mjs';
import { ddicToDb } from './if-codes.mjs';

const UP = (v) => String(v ?? '').trim().toUpperCase();
const ddicType = (c) => UP(String(c?.ddic || '').split(' ')[0]);
const ddicLen = (c) => Number(String(c?.ddic || '').split(' ')[1]) || null;
const TEXT_DB = new Set(['CHAR', 'VARCHAR', 'VARCHAR2', 'NVARCHAR2', 'NCHAR', 'STRING', 'CLOB', 'TEXT']);
const isText = (c) => (c?.ddic ? ['CHAR', 'SSTR', 'STRG', 'STRING', 'LCHR'].includes(ddicType(c)) : TEXT_DB.has(UP(c?.type)));
const isDate = (c) => (c?.ddic ? ['DATS', 'DATN'].includes(ddicType(c)) : ['DATE', 'TIMESTAMP'].includes(UP(c?.type)));
const isTime = (c) => (c?.ddic ? ['TIMS', 'TIMN'].includes(ddicType(c)) : UP(c?.type) === 'TIME');
/** "15,2" → { p: 15, s: 2 }; "10" → { p: 10, s: 0 }. */
const precisionOf = (size) => {
  const m = /^\s*(\d+)\s*(?:[,.]\s*(\d+))?\s*$/.exec(String(size ?? ''));
  return m ? { p: Number(m[1]), s: Number(m[2] || 0) } : null;
};
const sqlRows = (res) => (Array.isArray(res?.rows) ? res.rows : []);
const quote = (v) => `'${UP(v).replace(/'/g, "''")}'`;

/** The spec's SAP sides: 'source' → s, 'target' → t, 'both' → both. */
const sapSides = (m) => (m.sap?.side === 'both' ? ['s', 't'] : [m.sap?.side === 'target' ? 't' : 's']);
const sideName = (sd) => (sd === 's' ? 'source' : 'target');

async function rfcMode(client, fm) {
  const res = await call(client, 'GetSqlQuery', { sql_query: `SELECT FMODE FROM TFDIR WHERE FUNCNAME = ${quote(fm)}`, row_number: 1 });
  if (res?.error) return { error: res.error };
  const row = sqlRows(res)[0];
  return { mode: row ? UP(row.FMODE) : null };
}

/** DD03L reference fields of one table / structure: FIELDNAME → "REFTABLE-REFFIELD". */
async function refFields(client, tab) {
  const res = await call(client, 'GetSqlQuery', {
    sql_query: `SELECT FIELDNAME, REFTABLE, REFFIELD FROM DD03L WHERE TABNAME = ${quote(tab)} AND AS4LOCAL = 'A' AND REFFIELD <> ' '`,
    row_number: 500,
  });
  const out = new Map();
  for (const r of sqlRows(res)) out.set(UP(r.FIELDNAME), { table: UP(r.REFTABLE), field: UP(r.REFFIELD) });
  return res?.error ? null : out;
}

async function domainOf(client, dom) {
  const res = await call(client, 'GetDomain', { domain_name: dom });
  let d = res?.domain_data;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
  if (!d || typeof d !== 'object') return null;
  return { convexit: UP(d.convexit), fixed: Array.isArray(d.fixed_values) ? d.fixed_values.map((v) => UP(v.low)).filter(Boolean) : [] };
}

/** Fresh SAP rows of one side, keyed by `group|table|field` and by `|table|field`. */
function index(fresh) {
  const byKey = new Map();
  const byField = new Map();
  const byName = new Map();
  for (const G of fresh.groups || []) {
    for (const c of G.rows || []) {
      const hit = { c, G };
      byKey.set(`${UP(G.name)}|${UP(c.table)}|${UP(c.field)}`, hit);
      const k = `|${UP(c.table)}|${UP(c.field)}`;
      byField.set(k, byField.has(k) ? null : hit); // ambiguous across groups → no field-only match
      byName.set(UP(c.field), byName.has(UP(c.field)) ? null : hit); // a table's rows carry its name; a hand-typed cell may not
    }
  }
  return { byKey, byField, byName };
}

export async function sapCheck(client, m) {
  const objects = [];
  const fresh = {};
  for (const sd of sapSides(m)) {
    const side = sideName(sd);
    const name = UP(m.request?.[side]?.object || m.sap?.[side]?.object);
    if (!name) continue;
    const kind = UP(m.sap?.[side]?.kind);
    const o = await readSapObject(client, name, { kind: kind === 'FUNCTION' ? 'FUNCTION' : '', lines: m.sap?.[side]?.lines || {} });
    const entry = { side, object: name, kind: o.kind || kind || '', status: 'ok', items: [] };
    if (o.error) {
      entry.status = 'mismatch';
      entry.items.push({ code: 'OBJ_MISSING', sev: 'mismatch', args: { object: name, error: o.error } });
    } else {
      fresh[sd] = { ...o, idx: index(o) };
      if (o.kind === 'FUNCTION') {
        const r = await rfcMode(client, name);
        if (r.error) entry.items.push({ code: 'FM_RFC_UNREAD', sev: 'check', args: { object: name } });
        else if (r.mode !== 'R') entry.items.push({ code: 'FM_NOT_RFC', sev: 'mismatch', args: { object: name, fmode: r.mode ?? '' } });
        else entry.items.push({ code: 'FM_RFC', sev: 'ok', args: { object: name } });
      }
      for (const u of o.unresolved || []) entry.items.push({ code: 'PARAM_UNREAD', sev: 'check', args: { param: u.param, why: u.why } });
    }
    objects.push(entry);
  }

  const rules = new Map((m.rules || []).map((r) => [UP(r.id), r]));
  const rows = [];
  const refCache = new Map();
  const decCache = new Map();
  const domCache = new Map();
  const mappedFields = new Set();

  for (const bk of ['request', 'response']) {
    const b = m[bk];
    if (!b?.rows) continue;
    const gName = (id, sd) => UP((b.groups || []).find((g) => g.id === id)?.[sd]?.name);
    b.rows.forEach((r, i) => {
      for (const sd of ['s', 't']) if (r[sd]?.field) mappedFields.add(`${bk}|${sd}|${gName(r.g, sd)}|${UP(r[sd].table)}|${UP(r[sd].field)}`);
    });
    for (let i = 0; i < b.rows.length; i++) {
      const r = b.rows[i];
      const items = [];
      const proposals = [];
      const kinds = String(r.r || '').split(/[\s,]+/).filter(Boolean).map((id) => rules.get(UP(id))).filter(Boolean);
      const hasKind = (k) => kinds.some((x) => String(x.kind || '').startsWith(k));
      const freeText = kinds.some((x) => !x.kind);
      const flag = (code, sev, side, args, ruleKind) => {
        // a rule of the matching kind settles it; a free-text rule might — the judge decides
        if (ruleKind && hasKind(ruleKind)) return;
        items.push({ code, sev, side, args, ...(freeText && sev === 'check' ? { judge: true } : {}) });
        // -in: SAP receives the value (the receiving column, which is the source in the response block)
        const inbound = bk === 'response' ? side === 's' : side === 't';
        if (ruleKind && sev === 'check' && !freeText) proposals.push({ kind: 'add-rule', ruleKind: `${ruleKind}-${inbound ? 'in' : 'out'}`, path: `${bk}.rows.${i}.r` });
      };
      for (const sd of sapSides(m)) {
        const c = r[sd];
        if (!c?.field || !fresh[sd]) continue;
        const key = `${gName(r.g, sd)}|${UP(c.table)}|${UP(c.field)}`;
        const hit = fresh[sd].idx.byKey.get(key) ?? fresh[sd].idx.byField.get(`|${UP(c.table)}|${UP(c.field)}`) ?? fresh[sd].idx.byName.get(UP(c.field));
        if (!hit) { items.push({ code: 'FIELD_MISSING', sev: 'mismatch', side: sd, args: { field: c.field, object: fresh[sd].object } }); continue; }
        const n = hit.c;
        if (c.ddic && (ddicType(c) !== ddicType(n) || ddicLen(c) !== ddicLen(n))) {
          items.push({ code: 'TYPE_CHANGED', sev: 'mismatch', side: sd, args: { field: c.field, spec: c.ddic, sap: n.ddic } });
          proposals.push({ kind: 'set-cell', path: `${bk}.rows.${i}.${sd}`, value: { type: n.type, size: n.size, ddic: n.ddic, ...(n.dom ? { dom: n.dom } : {}) } });
        } else if (!c.ddic) {
          const want = ddicToDb(ddicType(n), ddicLen(n));
          if (UP(c.type) !== UP(want.type) || String(c.size || '') !== String(want.size || '')) {
            items.push({ code: 'TYPE_CHANGED', sev: 'mismatch', side: sd, args: { field: c.field, spec: `${c.type} ${c.size}`.trim(), sap: n.ddic } });
            proposals.push({ kind: 'set-cell', path: `${bk}.rows.${i}.${sd}`, value: { type: n.type, size: n.size, ddic: n.ddic } });
          }
        }
        // The receiving column: the target in the request; in the response the data flows back, so the source
        // receives — whichever side SAP is on, the call being synchronous (verifier-3, 2026-11-18).
        const recv = bk === 'response' ? sd === 's' : sd === 't';
        // a mandatory receiving field needs a mapping or a rule
        if (recv && n.nul === 'N' && !r.map && !r.r && ddicType(n) !== 'CLNT') {
          items.push({ code: 'MANDATORY_UNMAPPED', sev: 'mismatch', side: sd, args: { field: c.field } });
        }
        const o = sd === 's' ? 't' : 's';
        const other = r[o];
        const t = ddicType(n);
        if (other?.field && r.map) {
          if (recv && t === 'NUMC' && isText(other)) flag('NUMC_FROM_TEXT', 'check', sd, { field: c.field, from: other.type || ddicType(other) }, 'alpha');
          if ((t === 'DATS' || t === 'DATN') && !isDate(other)) flag('DATE_FORMAT', 'check', sd, { field: c.field, other: other.type || ddicType(other) }, 'date');
          if ((t === 'TIMS' || t === 'TIMN') && !isTime(other)) flag('TIME_FORMAT', 'check', sd, { field: c.field, other: other.type || ddicType(other) }, 'time');
          const from = recv ? other : c;
          const to = recv ? c : other;
          const nf = Number(from.size);
          const nt = Number(to.size);
          if (nf > 0 && nt > 0 && nt < nf && !['DATS', 'TIMS'].includes(t)) flag('TRUNC', 'check', sd, { field: c.field, from: nf, to: nt }, null);
        }
        // decimals and the reference field of CURR / QUAN / DEC
        if (['DEC', 'CURR', 'QUAN'].includes(t)) {
          const tab = UP(c.table) || UP(hit.G.ddic) || (fresh[sd].kind !== 'FUNCTION' ? fresh[sd].object : '');
          if (tab) {
            if (!decCache.has(tab)) decCache.set(tab, await ddicObject(client, tab));
            const f = decCache.get(tab)?.def?.fields?.find((x) => UP(x.fieldname) === UP(c.field));
            const dec = f ? Number(f.decimals) || 0 : null;
            const op = other?.field ? precisionOf(other.size) : null;
            if (dec !== null && op && op.s < dec) flag('DEC_PRECISION', 'check', sd, { field: c.field, sapDecimals: dec, other: other.size }, null);
            if (t !== 'DEC') {
              if (!refCache.has(tab)) refCache.set(tab, await refFields(client, tab));
              const ref = refCache.get(tab)?.get(UP(c.field));
              if (ref) {
                const mapped = b.rows.some((x) => UP(x[sd]?.field) === ref.field && (x.map || x.r));
                if (!mapped) flag('REF_UNMAPPED', 'check', sd, { field: c.field, ref: `${ref.table}-${ref.field}` }, t === 'CURR' ? 'curr' : 'quan');
              }
            }
          }
        }
        // the receiving field's domain: ALPHA conversion exit, fixed values
        if (recv && n.dom && ['CHAR', 'NUMC'].includes(t) && other?.field && !fresh[o]) {
          const dom = UP(n.dom);
          if (!domCache.has(dom)) domCache.set(dom, await domainOf(client, dom));
          const d = domCache.get(dom);
          if (d?.convexit === 'ALPHA') flag('ALPHA_EXIT', 'check', sd, { field: c.field, domain: dom }, 'alpha');
          if (d?.fixed?.length) flag('FIXED_VALUES', 'check', sd, { field: c.field, domain: dom, values: d.fixed.slice(0, 12), more: Math.max(0, d.fixed.length - 12) }, null);
        }
      }
      const status = items.some((x) => x.sev === 'mismatch') ? 'mismatch' : items.length ? 'check' : 'ok';
      // a row is checked only against an object that was read (a missing one is reported once, on the object)
      if (sapSides(m).some((sd) => r[sd]?.field && fresh[sd])) rows.push({ block: bk, i, no: r.no, status, items, proposals, needsJudge: items.some((x) => x.judge) });
    }
  }

  // mandatory receiving fields the spec has no row for (FM import parameters, table / structure fields)
  for (const sd of sapSides(m)) {
    if (sd !== 't' || !fresh[sd]) continue;
    const entry = objects.find((x) => x.side === 'target');
    for (const G of fresh[sd].groups || []) {
      if (fresh[sd].kind === 'FUNCTION' && !['IMPORTING', 'TABLES', 'CHANGING'].includes(UP(G.section))) continue;
      if (fresh[sd].kind === 'FUNCTION' && G.optional) continue;
      for (const c of G.rows || []) {
        if (c.nul !== 'N' || ddicType(c) === 'CLNT') continue;
        // by field name: a hand-typed cell may lack the table the fresh row carries
        // the request's receiving column only: a field mapped in the response does not supply an import (verifier-3)
        const known = [...mappedFields].some((k) => k.startsWith('request|t|') && k.endsWith(`|${UP(c.field)}`));
        if (!known) entry?.items.push({ code: 'MANDATORY_NO_ROW', sev: 'mismatch', args: { group: G.name || '', field: c.field } });
      }
    }
  }
  for (const e of objects) if (e.status === 'ok') e.status = e.items.some((x) => x.sev === 'mismatch') ? 'mismatch' : e.items.some((x) => x.sev === 'check') ? 'check' : 'ok';

  const counts = { ok: 0, check: 0, mismatch: 0 };
  for (const r of rows) counts[r.status]++;
  return { at: new Date().toISOString(), system: m.sap?.system || '', objects, rows, counts };
}

// ── texts (the CLI summary and the web panel) ───────────────────────────────────────────────────────────────
const TEXT = {
  OBJ_MISSING: ['{object}: SAP에서 찾을 수 없어요 ({error})', '{object}: not found in SAP ({error})'],
  FM_NOT_RFC: ['{object}: RFC 가능 FM이 아니에요 (TFDIR FMODE "{fmode}")', '{object}: not RFC-enabled (TFDIR FMODE "{fmode}")'],
  FM_RFC_UNREAD: ['{object}: RFC 여부를 읽지 못했어요 (TFDIR)', '{object}: could not read whether it is RFC-enabled (TFDIR)'],
  FM_RFC: ['{object}: RFC 가능 FM이에요', '{object}: RFC-enabled'],
  PARAM_UNREAD: ['파라미터 {param}의 타입을 읽지 못했어요 ({why})', 'parameter {param}: type not read ({why})'],
  MANDATORY_NO_ROW: ['필수 필드 {field}({group})가 명세에 없어요', 'mandatory field {field} ({group}) has no row in the spec'],
  FIELD_MISSING: ['{field}: {object}에 없는 필드예요', '{field}: no such field in {object}'],
  TYPE_CHANGED: ['{field}: 명세 {spec} ≠ SAP {sap}', '{field}: spec {spec} ≠ SAP {sap}'],
  MANDATORY_UNMAPPED: ['{field}: 필수 필드인데 매핑도 규칙도 없어요', '{field}: mandatory, but neither mapped nor ruled'],
  NUMC_FROM_TEXT: ['{field}: 문자({from}) → NUMC — 숫자만 오는지, 앞자리 0을 채울지 규칙이 필요해요', '{field}: text ({from}) → NUMC — needs a rule (digits only, leading zeros)'],
  DATE_FORMAT: ['{field}: 날짜 ↔ {other} — 날짜 형식 규칙이 필요해요', '{field}: date ↔ {other} — needs a date-format rule'],
  TIME_FORMAT: ['{field}: 시간 ↔ {other} — 시간 형식 규칙이 필요해요', '{field}: time ↔ {other} — needs a time-format rule'],
  TRUNC: ['{field}: 길이 {from} → {to} — 잘릴 수 있어요', '{field}: length {from} → {to} — may be cut'],
  DEC_PRECISION: ['{field}: SAP 소수 {sapDecimals}자리 ↔ {other} — 반올림될 수 있어요', '{field}: SAP has {sapDecimals} decimals ↔ {other} — may be rounded'],
  REF_UNMAPPED: ['{field}: 참조 필드 {ref}(통화/단위)가 매핑되지 않았어요', '{field}: its reference field {ref} (currency / unit) is not mapped'],
  ALPHA_EXIT: ['{field}: 도메인 {domain}에 ALPHA 변환(앞자리 0)이 있어요', '{field}: domain {domain} has the ALPHA conversion (leading zeros)'],
  FIXED_VALUES: ['{field}: 도메인 {domain} 고정값만 받아요 — {values}', '{field}: domain {domain} accepts fixed values only — {values}'],
};
export function checkText(item, lang = 'ko') {
  const t = (TEXT[item.code] || [item.code, item.code])[lang === 'ko' ? 0 : 1];
  const args = { ...item.args };
  if (Array.isArray(args.values)) args.values = args.values.join(', ') + (args.more ? ` …(+${args.more})` : '');
  return t.replace(/\{(\w+)\}/g, (_, k) => String(args[k] ?? ''));
}
