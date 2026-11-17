// sc4sap:transport-readiness — target merge check: can the requests merge into the target system?
// Read-only on both systems. The target is read through GetRemoteTableContents (RFC_READ_TABLE over an
// SM59 ABAP destination of the connected system); the source through config/sap-reader.mjs.
//
// Reads, for at most MAX_OBJECTS objects of the checked requests:
//   target TADIR  — does the object exist there, in which package
//   target VRSD   — the latest version of each code / DDIC part and the request that made it
//   source E070   — is that request known in the source system, and when was it changed
//   source D010TAB (if readable) + the dependency rows — customer DDIC objects the request's code uses
//   target TADIR  — do those exist in the target; else source E071 / E070 — is one in a released request
// A destination that does not answer is recorded as { ok: false } — never as "fine".

import { whereOf } from '../config/sap-reader.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const up = (s) => String(s ?? '').trim().toUpperCase();
export const MAX_OBJECTS = 200;
const PAGE = 5000;
const STATUS = { D: 'open', L: 'open', O: 'released', R: 'released', N: 'released' };

/** VRSD parts of one E071 entry (R3TR whole objects map to their main part; LIMU parts map 1:1). */
const R3TR_PARTS = { PROG: ['REPS'], CLAS: ['CLSD', 'CPUB'], INTF: ['INTF'], TABL: ['TABD'], DTEL: ['DTED'], DOMA: ['DOMD'], TTYP: ['TTYD'], VIEW: ['VIED'], SHLP: ['SHLD'] };
const LIMU = new Set(['REPS', 'REPT', 'METH', 'FUNC', 'CINC', 'CLSD', 'CPUB', 'CPRO', 'CPRI', 'INTF', 'DYNP', 'CUAD', 'TABD', 'DTED', 'DOMD', 'TTYD', 'VIED', 'SHLD']);
export function vrsdKeysOf(o) {
  const pgmid = up(o.pgmid); const type = up(o.object); const name = String(o.name ?? '').trimEnd();
  if (pgmid === 'R3TR') return arr(R3TR_PARTS[type]).map((t) => ({ objtype: t, objname: name }));
  if (pgmid === 'LIMU' && LIMU.has(type)) return [{ objtype: type, objname: name }];
  return [];
}

/** Digits only: GetSqlQuery answers 2026-11-16 / 11:57:24, RFC_READ_TABLE 20261116 / 115724. */
export const stamp = (date, time = '') => `${String(date ?? '').replace(/\D/g, '')}${String(time ?? '').replace(/\D/g, '')}`;

/**
 * The last change per VRSD part in the target. Versions run newest first (00000 = the active one);
 * a version made by a target-side transport of copies (TRFUNCTION T, unknown in the source) only
 * exported the object, so it is passed over (measured 2026-11-16: a PRD transport of copies stamped
 * every object of a package). `sourceHead` = source E070 rows by TRKORR, `targetReq` = target E070 of
 * the requests the source does not know ({ kind, owner, text }).
 */
export function currentChanges(rows, sourceHead, targetReq = new Map(), sourceRead = true, sid = '') {
  // Known in the source: started there, or reached it with the same header (same date and owner).
  const known = (korr) => {
    const h = sourceHead.get(korr);
    if (!h) return null;
    if (!sid || korr.slice(0, 3) === sid) return h;
    const t = targetReq.get(korr);
    return t && t.date === stamp(h.AS4DATE) && t.owner === up(h.AS4USER) ? h : null;
  };
  const parts = new Map();
  for (const r of arr(rows)) {
    const k = `${up(r.OBJTYPE)} ${String(r.OBJNAME ?? '').trimEnd()}`;
    parts.set(k, [...(parts.get(k) || []), r]);
  }
  const rank = (r) => (Number(r.VERSNO) === 0 ? 99999 : Number(r.VERSNO) || 0);
  const out = [];
  for (const list of parts.values()) {
    list.sort((a, b) => rank(b) - rank(a));
    let copies = 0;
    for (const r of list) {
      const korr = up(r.KORRNUM);
      const h = known(korr);
      const t = targetReq.get(korr);
      if (!korr) continue;
      if (!h && t?.kind === 'T') { copies += 1; continue; }
      out.push({ objtype: up(r.OBJTYPE), objname: String(r.OBJNAME).trimEnd(), versno: r.VERSNO, korrnum: korr, author: r.AUTHOR, date: stamp(r.DATUM), time: stamp(r.ZEIT),
        inSource: sourceRead ? !!h : null, sourceDate: h ? stamp(h.AS4DATE, h.AS4TIME) : '', targetKind: t?.kind || '', targetText: t?.text || '', copiesSkipped: copies });
      break;
    }
  }
  return out;
}

/** SID of the source system: the prefix the checked requests share (DEVK900123 → DEV). */
export function sourceSidOf(requests) {
  const sids = [...new Set(arr(requests).map((r) => up(r.trkorr).slice(0, 3)).filter(Boolean))];
  return sids.length === 1 ? sids[0] : '';
}

/** Customer DDIC names only (Z / Y / namespace). */
const customer = (n) => /^([ZY]|\/[A-Z0-9_]+\/)/.test(up(n));
/** Main program of a code object, as D010TAB lists it. */
export function masterOf(o) {
  const t = up(o.object); const n = up(o.name);
  if (t === 'PROG' || t === 'REPS') return n;
  if (t === 'CLAS') return `${n.padEnd(30, '=')}CP`;
  if (t === 'INTF') return `${n.padEnd(30, '=')}IP`;
  if (t === 'FUGR') return n.startsWith('/') ? n.replace(/^(\/[^/]+\/)/, '$1SAPL') : `SAPL${n}`;
  return '';
}

/** The MCP / ADT wrapper prefixes cut off: "MCP error -32603: ADT error: Error: REMOTE_READ: …" → "REMOTE_READ: …". */
export const cleanError = (m) => String(m ?? '').replace(/^(MCP error -?\d+:\s*)?(ADT error:\s*)?((Mcp)?Error:\s*)?(MCP error -?\d+:\s*)?/, '').slice(0, 300);

/** One remote read; returns { ok, rows, error, full } (full = the page was full, read again in halves). */
async function remoteRead(client, dest, table, { where = '', fields = [], maxRows = PAGE } = {}) {
  try {
    const res = await client.callTool({ name: 'GetRemoteTableContents', arguments: { table_name: table, destination: dest, fields, where, max_rows: maxRows } });
    const text = res?.content?.[0]?.text ?? '';
    if (res?.isError) return { ok: false, rows: [], error: cleanError(text) };
    const data = JSON.parse(text);
    const rows = arr(data.rows);
    return { ok: true, rows, full: rows.length >= maxRows };
  } catch (e) {
    return { ok: false, rows: [], error: cleanError(e?.message ?? e) };
  }
}

/** IN-list read on the target, split in chunks; a full page is read again in halves (like readIn). */
export async function remoteIn(client, dest, table, field, values, { extra = {}, fields = [], chunk = 20 } = {}) {
  // REMOTE_READ refuses SELECT / JOIN anywhere in the condition; such names are skipped and reported.
  const all = [...new Set(arr(values).filter(Boolean))];
  const skipped = all.filter((v) => /SELECT|JOIN/i.test(v));
  const uniq = all.filter((v) => !skipped.includes(v));
  const out = []; const errors = [];
  const grab = async (vals) => {
    const r = await remoteRead(client, dest, table, { where: whereOf({ ...extra, [field]: vals }), fields });
    if (!r.ok) { errors.push(r.error); return; }
    if (r.full && vals.length > 1) { const h = Math.ceil(vals.length / 2); await grab(vals.slice(0, h)); await grab(vals.slice(h)); return; }
    out.push(...r.rows);
  };
  for (let i = 0; i < uniq.length; i += chunk) {
    await grab(uniq.slice(i, i + chunk));
    if (errors.length && !out.length) break; // the destination does not answer — stop asking
  }
  return { ok: errors.length === 0, rows: out, errors, skipped };
}

/**
 * Collect the target side for the requests. `src` = { client, readIn }, `c` = the collect result so far
 * (requests, objects, deps). Returns the `target` block of collect.json.
 */
export async function collectTarget(src, c, { dest, label }) {
  const { client, readIn } = src;
  const out = { label: label || '', dest, ok: true, error: '', truncated: false, checked: 0, tadir: [], versions: [], needs: [], notes: [] };
  const own = arr(c.objects).filter((o) => ['R3TR', 'LIMU'].includes(up(o.pgmid)));
  let names = [...new Set(own.map((o) => String(o.name).trimEnd()))];
  if (names.length > MAX_OBJECTS) { names = names.slice(0, MAX_OBJECTS); out.truncated = true; }
  const inScope = new Set(names);
  out.checked = names.length;

  // 1. Target TADIR of the request objects — also the probe: no answer → stop here.
  const r3 = [...new Set(own.filter((o) => up(o.pgmid) === 'R3TR' && inScope.has(String(o.name).trimEnd())).map((o) => up(o.name)))];
  const probe = await remoteIn(client, dest, 'TADIR', 'OBJ_NAME', r3.length ? r3 : [names[0] || 'Z'], { extra: { PGMID: 'R3TR' }, fields: ['PGMID', 'OBJECT', 'OBJ_NAME', 'DEVCLASS'] });
  if (!probe.ok) return { ...out, ok: false, error: probe.errors[0] || 'no answer' };
  out.tadir = probe.rows.map((r) => ({ object: up(r.OBJECT), name: up(r.OBJ_NAME), package: up(r.DEVCLASS) }));

  // 2. Target VRSD: the latest version of each part, and whether its request is known here.
  const keys = own.filter((o) => inScope.has(String(o.name).trimEnd())).flatMap(vrsdKeysOf);
  const vrsdNames = [...new Set(keys.map((k) => k.objname))];
  const v = await remoteIn(client, dest, 'VRSD', 'OBJNAME', vrsdNames, { fields: ['OBJTYPE', 'OBJNAME', 'VERSNO', 'KORRNUM', 'AUTHOR', 'DATUM', 'ZEIT'] });
  if (!v.ok) out.notes.push(`VRSD: ${v.errors[0]}`);
  const wanted = new Set(keys.map((k) => `${k.objtype} ${k.objname}`));
  const rows = v.rows.filter((r) => wanted.has(`${up(r.OBJTYPE)} ${String(r.OBJNAME ?? '').trimEnd()}`));
  const korr = [...new Set(rows.map((r) => up(r.KORRNUM)).filter(Boolean))];
  const heads = korr.length ? await readIn(client, 'E070', 'TRKORR', korr) : { ok: true, rows: [] };
  if (!heads.ok) out.notes.push(`source E070: ${arr(heads.errors)[0]}`);
  const head = new Map(arr(heads.rows).map((r) => [up(r.TRKORR), r]));
  // Requests that did not start in the source system: read their target header too (a transport of
  // copies only exports; the same number in both systems with another date is another request).
  const sid = sourceSidOf(c.requests);
  const foreign = korr.filter((k) => k.slice(0, 3) !== sid || !head.has(k));
  const th = foreign.length ? await remoteIn(client, dest, 'E070', 'TRKORR', foreign, { fields: ['TRKORR', 'TRFUNCTION', 'AS4USER', 'AS4DATE'] }) : { ok: true, rows: [] };
  const tt = foreign.length ? await remoteIn(client, dest, 'E07T', 'TRKORR', foreign, { fields: ['TRKORR', 'AS4TEXT'] }) : { ok: true, rows: [] };
  if (!th.ok) out.notes.push(`target E070: ${th.errors[0]}`);
  const targetReq = new Map(th.rows.map((r) => [up(r.TRKORR), { kind: up(r.TRFUNCTION), owner: up(r.AS4USER), date: stamp(r.AS4DATE) }]));
  for (const r of tt.rows) if (targetReq.has(up(r.TRKORR))) targetReq.get(up(r.TRKORR)).text = r.AS4TEXT;
  out.versions = currentChanges(rows, head, targetReq, heads.ok, sid);
  out.vrsdOk = v.ok && heads.ok;

  // 3. Customer DDIC objects the request's code uses: dependency rows + D010TAB of the main programs.
  const needs = new Map();
  for (const d of arr(c.deps?.rows)) {
    const [object, name] = String(d.needs).split(' ');
    if (customer(name)) needs.set(`${d.trkorr} ${up(name)}`, { trkorr: d.trkorr, object: up(object), name: up(name), by: d.name });
  }
  const masters = new Map(own.map((o) => [masterOf(o), o]).filter(([m]) => m));
  if (masters.size) {
    const used = await readIn(client, 'D010TAB', 'MASTER', [...masters.keys()]);
    if (!used.ok) out.notes.push(`source D010TAB: ${arr(used.errors)[0]}`);
    for (const r of arr(used.rows)) {
      const o = masters.get(up(r.MASTER));
      if (o && customer(r.TABNAME)) needs.set(`${o.trkorr} ${up(r.TABNAME)}`, { trkorr: o.trkorr, object: 'TABL', name: up(r.TABNAME), by: `${up(o.object)} ${up(o.name)}` });
    }
  }
  const ownNames = new Map(own.map((o) => [`${o.trkorr} ${up(o.name)}`, true]));
  const open = [...needs.values()].filter((n) => !ownNames.has(`${n.trkorr} ${n.name}`)).slice(0, MAX_OBJECTS);
  if (open.length) {
    const t2 = await remoteIn(client, dest, 'TADIR', 'OBJ_NAME', [...new Set(open.map((n) => n.name))], { extra: { PGMID: 'R3TR' }, fields: ['OBJECT', 'OBJ_NAME', 'DEVCLASS'] });
    if (!t2.ok) out.notes.push(`target TADIR (used objects): ${t2.errors[0]}`);
    const there = new Set(t2.rows.map((r) => up(r.OBJ_NAME)));
    const missing = open.filter((n) => !there.has(n.name));
    // Is a missing one in a released source request (then it only has to be imported first)?
    const hits = missing.length ? await readIn(client, 'E071', 'OBJ_NAME', [...new Set(missing.map((n) => n.name))]) : { rows: [] };
    const hh = await readIn(client, 'E070', 'TRKORR', [...new Set(arr(hits.rows).map((r) => r.TRKORR))]);
    const parent = new Map(arr(hh.rows).map((r) => [up(r.TRKORR), r]));
    const released = new Map();
    for (const r of arr(hits.rows)) {
      const h = parent.get(up(r.TRKORR));
      const req = h && String(h.STRKORR || '').trim() ? up(h.STRKORR) : up(r.TRKORR);
      if (h && STATUS[h.TRSTATUS] === 'released') released.set(up(r.OBJ_NAME), req);
    }
    out.needs = open.map((n) => ({ ...n, inTarget: t2.ok ? there.has(n.name) : null, releasedIn: released.get(n.name) || '' }));
    out.needsOk = t2.ok;
  } else out.needsOk = true;
  return out;
}
