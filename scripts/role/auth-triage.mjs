// sc4sap:role-matrix triage — why one user gets "no authorization" for one T-code. Read-only on SAP.
//
// CLI (prints one JSON line):
//   node auth-triage.mjs collect --user <ID> --tcode <TC> [--check <checks.json>] [--patterns "Z*"] --out-dir <dir> [--lang ko|en] [--system <SID>] [--confirm-prd]
//     (active profile tier PRD → stops unless --confirm-prd: the skill asks PRD_CONFIRM first)
//   node auth-triage.mjs build --in <dir>/collect.json --out-dir <dir> [--lang ko|en]
//
// --check: the failed checks from SU53, as the main thread transcribed them: [{ object, fields: { FIELD: value }, rc? }]
// (one object is accepted too). No --check → the T-code start checks (S_TCODE, TSTCA) are evaluated, SU24 (USOBT_C)
// proposals give an estimate.
//
// Reads (one MCP server with MCP_ALLOW_TABLE = ALLOW_TABLES, nothing else):
//   AGR_USERS  — UNAME = <the one user> only; AGR_NAME, FROM_DAT, TO_DAT. Other users are never listed.
//   AGR_AGRS, AGR_TCODES, AGR_1251, AGR_1252 of the user's roles; AGR_1251 of pattern roles for the missing objects.
//   TSTCA, USOBT_C of the T-code; TSTCT, TOBJT, AUTHX + DD04T for texts.
// Profiles assigned directly (UST04) and generated profiles (AGR_1016) are not read — a "held" verdict says so.
// Output file names carry the T-code and date, never the user ID. build never connects to SAP; both commands write
// only into --out-dir (collect: collect.json; build: the .html, .md and -model.json).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readActiveSapEnv, normalizeTier } from '../lib/profile-resolve.mjs';
import { arr, classify, candidates, sodImpact, tcodeGrantValues, assignmentsOf } from './auth-check.mjs';

export const ALLOW_TABLES = ['AGR_USERS', 'AGR_AGRS', 'AGR_TCODES', 'AGR_1251', 'AGR_1252', 'TSTCA', 'USOBT_C', 'TSTCT', 'TOBJT', 'AUTHX', 'DD04T'];
export const USER_RE = /^[A-Z0-9_.@&\-]{1,12}$/;
export const TCODE_RE = /^[A-Z0-9_/]{1,20}$/;
const here = dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));
// The local date of the machine running the triage (validity of assignments is judged by it; the page says so).
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => localDate();
const sq = (v) => `'${String(v).replace(/'/g, "''")}'`;
/** S_TCODE TCD rows maintained as a range (LOW–HIGH): one condition per role chunk, IN lists broken over lines. */
export function rangeWhere({ roles = null, like = '' }) {
  const who = roles ? `AGR_NAME IN (${roles.map(sq).join(',\n')})` : `AGR_NAME LIKE ${sq(like)}`;
  return `${who} AND OBJECT = 'S_TCODE' AND FIELD = 'TCD' AND HIGH <> ' '`;
}
const MAX_PRE = 15; // candidate roles whose T-codes / org values are read before the final top 5

/** Checks file → [{ object, fields }]; upper-cased, empty objects dropped. */
export function normalizeChecks(input) {
  const list = Array.isArray(input) ? input : input && typeof input === 'object' ? (Array.isArray(input.checks) ? input.checks : [input]) : [];
  return list
    .filter((c) => c && c.object)
    .map((c) => ({ object: String(c.object).trim().toUpperCase(), fields: Object.fromEntries(Object.entries(c.fields || {}).map(([k, v]) => [String(k).trim().toUpperCase(), String(v ?? '').trim()])), ...(c.rc != null ? { rc: c.rc } : {}), source: 'su53' }));
}

/** Reads everything one triage needs. Returns the collect object (also written as collect.json by the CLI). */
export async function collect({ user, tcode, checks = [], patterns = ['Z*'], lang = 'ko', system = '' }) {
  if (!USER_RE.test(user || '')) throw new Error('--user <ID> is required (one SAP user ID)');
  if (!TCODE_RE.test(tcode || '')) throw new Error('--tcode <T-code> is required');
  const { connect, readTable, readIn } = await import('../config/sap-reader.mjs');
  const { likeOf } = await import('./sap-roles.mjs');
  const client = await connect('role-matrix', { allowTables: ALLOW_TABLES });
  const notRead = new Set(), readErrors = [], truncated = [];
  const need = (r, table) => {
    if (!r.ok) { notRead.add(table); readErrors.push(`${table}: ${String(r.error || arr(r.errors).join(' | ')).slice(0, 240)}`); }
    if (r.truncated === true || arr(r.truncated).length) truncated.push(table);
    return r.rows || [];
  };
  const spras = lang === 'en' ? 'E' : '3';
  const c = { user, tcode, lang, today: today(), system, checks, patterns };
  try {
    // 1. the one user's role assignments — UNAME = user, never a list of users
    c.users = need(await readTable(client, 'AGR_USERS', { where: { UNAME: user }, fields: ['AGR_NAME', 'FROM_DAT', 'TO_DAT'] }), 'AGR_USERS');
    const direct = [...new Set(c.users.map((u) => u.AGR_NAME))];
    c.agrs = need(await readIn(client, 'AGR_AGRS', 'AGR_NAME', direct), 'AGR_AGRS');
    const roles = [...new Set([...direct, ...c.agrs.map((a) => a.CHILD_AGR)])];
    // only the T-codes that matter (this one + the SoD library's): an all-access role holds thousands
    const sodTcodes = readJson(join(here, 'sod-library.json')).rules.flatMap((r) => [...r.tcodesA, ...r.tcodesB]);
    c.roleTcodes = need(await readIn(client, 'AGR_TCODES', 'AGR_NAME', roles, { extra: { TYPE: 'TR', TCODE: [...new Set([tc(tcode), ...sodTcodes])] }, fields: ['AGR_NAME', 'TCODE', 'EXCLUDE'], chunk: 20 }), 'AGR_TCODES');
    c.tstca = need(await readTable(client, 'TSTCA', { where: { TCODE: tc(tcode) } }), 'TSTCA');
    c.usobt = need(await readTable(client, 'USOBT_C', { where: { NAME: tc(tcode), TYPE: 'TR' } }), 'USOBT_C');
    const objects = [...new Set(['S_TCODE', ...checks.map((k) => k.object), ...c.tstca.map((t) => t.OBJCT), ...c.usobt.map((u) => u.OBJECT)].filter(Boolean))];
    // S_TCODE only for the values that can grant the T-codes asked (VA02 → *, V*, VA*, VA0*, VA02) — never a role's whole T-code list
    const tcds = [...new Set([tc(tcode), ...checks.filter((k) => k.object === 'S_TCODE').map((k) => k.fields.TCD).filter(Boolean)])];
    const sTcode = need(await readIn(client, 'AGR_1251', 'AGR_NAME', roles, { extra: { OBJECT: 'S_TCODE', FIELD: 'TCD', LOW: [...new Set(tcds.flatMap(tcodeGrantValues))] }, chunk: 20 }), 'AGR_1251');
    const others = objects.filter((o) => o !== 'S_TCODE');
    const rest = others.length ? need(await readIn(client, 'AGR_1251', 'AGR_NAME', roles, { extra: { OBJECT: others }, chunk: 20 }), 'AGR_1251') : [];
    // S_TCODE ranges (VA01 to VA03) are not found by the value list above
    const ranges = [];
    for (let i = 0; i < roles.length; i += 20) ranges.push(...need(await readTable(client, 'AGR_1251', { where: rangeWhere({ roles: roles.slice(i, i + 20) }) }), 'AGR_1251'));
    c.auth = [...sTcode, ...ranges, ...rest];
    c.vars = need(await readIn(client, 'AGR_1252', 'AGR_NAME', roles), 'AGR_1252');
    c.notRead = [...notRead];
    c.partial = [...new Set(truncated)]; // the user's own reads that hit the row limit — no "missing" verdict on them

    // 2. candidates for the checks that are missing (A) or only held through an expired assignment (C)
    const v = classify(c);
    const missing = v.results.filter((r) => r.verdict === 'A' || r.verdict === 'C').map((r) => r.check);
    c.cand = { rows: [], vars: [], tcodes: [], truncated: [] };
    for (const k of missing) {
      for (const p of patterns) {
        const wheres = k.object === 'S_TCODE'
          ? [{ OBJECT: 'S_TCODE', FIELD: 'TCD', LOW: tcodeGrantValues(k.fields.TCD || tcode), AGR_NAME: { like: likeOf(p) } }, rangeWhere({ like: likeOf(p) })]
          : [{ OBJECT: k.object, AGR_NAME: { like: likeOf(p) } }];
        for (const where of wheres) {
          const r = await readTable(client, 'AGR_1251', { where });
          if (!r.ok) { readErrors.push(`AGR_1251 candidates ${k.object}: ${String(r.error).slice(0, 200)}`); continue; }
          if (r.truncated) c.cand.truncated.push(k.object);
          c.cand.rows.push(...r.rows);
        }
      }
    }
    const withVars = [...new Set(c.cand.rows.filter((r) => String(r.LOW || '').startsWith('$')).map((r) => r.AGR_NAME))];
    if (withVars.length) c.cand.vars = need(await readIn(client, 'AGR_1252', 'AGR_NAME', withVars), 'AGR_1252');
    if (missing.length) {
      const held = assignmentsOf(c.users, c.agrs, c.today).filter((a) => a.valid).map((a) => a.role);
      const pre = candidates({ missing, rows: c.cand.rows, vars: c.cand.vars, tcode, held, max: MAX_PRE });
      const top = pre.list.map((x) => x.role);
      const r = await readIn(client, 'AGR_TCODES', 'AGR_NAME', top, { extra: { TYPE: 'TR' }, fields: ['AGR_NAME', 'TCODE', 'EXCLUDE'] });
      if (!r.ok) readErrors.push(`AGR_TCODES candidates: ${arr(r.errors).join(' | ').slice(0, 200)}`);
      c.cand.tcodes = r.rows || [];
      c.cand.tcodesRead = top.filter((x) => !arr(r.errors).length);
      c.cand.tcodesPartial = arr(r.truncated); // roles with more T-codes than one read returns: count shown as ≥
    }

    // 3. texts
    c.texts = { tcode: '', objects: {}, fields: {} };
    const tt = need(await readTable(client, 'TSTCT', { where: { TCODE: tc(tcode), SPRSL: spras } }), 'TSTCT');
    c.texts.tcode = tt[0]?.TTEXT || '';
    const objs = [...new Set([...objects, ...missing.map((k) => k.object)])];
    for (const o of need(await readIn(client, 'TOBJT', 'OBJECT', objs, { extra: { LANGU: spras } }), 'TOBJT')) c.texts.objects[o.OBJECT] = o.TTEXT;
    const fields = [...new Set([...checks, ...startOf(c)].flatMap((k) => Object.keys(k.fields || {})))];
    const authx = need(await readIn(client, 'AUTHX', 'FIELDNAME', fields), 'AUTHX');
    const rolls = [...new Set(authx.map((a) => a.ROLLNAME).filter(Boolean))];
    const dd = need(await readIn(client, 'DD04T', 'ROLLNAME', rolls, { extra: { DDLANGUAGE: spras, AS4LOCAL: 'A' } }), 'DD04T');
    const dt = new Map(dd.map((d) => [d.ROLLNAME, d.SCRTEXT_M || d.DDTEXT]));
    for (const a of authx) c.texts.fields[a.FIELDNAME] = dt.get(a.ROLLNAME) || '';
    c.notRead = [...notRead];
    c.readErrors = readErrors;
    c.truncated = truncated;
    return c;
  } finally {
    await client.close().catch(() => {});
  }
}

const tc = (t) => String(t).toUpperCase();
const startOf = (c) => [{ fields: { TCD: c.tcode } }, ...arr(c.tstca).map((t) => ({ fields: { [t.FIELD]: t.VALUE } })), ...arr(c.usobt).map((u) => ({ fields: { [u.FIELD]: u.LOW } }))];
const groupTcodes = (rows) => { const m = {}; for (const r of arr(rows)) if (!String(r.EXCLUDE || '').trim()) (m[r.AGR_NAME] ||= []).push(r.TCODE || r.LOW); return m; };

/** collect object → triage model (pure; what the page and the summary show). */
export function triage(c, { library = null } = {}) {
  const lib = library || readJson(join(here, 'sod-library.json')).rules;
  const v = classify(c);
  const missing = v.results.filter((r) => r.verdict === 'A' || r.verdict === 'C').map((r) => r.check);
  const userRoleTcodes = groupTcodes(c.roleTcodes);
  const valid = v.assignments.filter((a) => a.valid).map((a) => a.role);
  const userTcodes = [...new Set(valid.flatMap((r) => userRoleTcodes[r] || []))];
  const candTcodes = groupTcodes(c.cand?.tcodes);
  for (const r of arr(c.cand?.tcodesRead)) candTcodes[r] ||= []; // read, none assigned
  const partialT = new Set(arr(c.cand?.tcodesPartial));
  const cand = missing.length ? candidates({ missing, rows: c.cand?.rows, vars: c.cand?.vars, roleTcodes: candTcodes, tcode: c.tcode, held: valid, max: 5 }) : { list: [], total: 0 };
  for (const x of cand.list) {
    x.tcodesPartial = partialT.has(x.role);
    x.sod = x.tcodes == null ? null : sodImpact(userTcodes, candTcodes[x.role], lib, c.lang === 'en' ? 'en' : 'ko');
  }
  const relevant = new Set([...v.results, ...v.estimates].map((r) => r.check.object));
  const roleObjects = {};
  for (const r of arr(c.auth)) if (relevant.has(r.OBJECT) && !String(r.DELETED || '').trim()) (roleObjects[r.AGR_NAME] ||= new Set()).add(r.OBJECT);
  return {
    user: c.user, tcode: c.tcode, tcodeText: c.texts?.tcode || '', lang: c.lang, date: c.today, system: c.system || '',
    mode: v.mode, verdict: v.verdict, reason: v.reason || '', results: v.results, estimates: v.estimates,
    assignments: v.assignments.map((a) => ({ ...a, objects: [...(roleObjects[a.role] || [])] })),
    candidates: cand.list, candidateTotal: cand.total, candidateTruncated: arr(c.cand?.truncated), patterns: arr(c.patterns),
    sodExisting: sodImpact(userTcodes, [], lib, c.lang === 'en' ? 'en' : 'ko').existing,
    texts: c.texts || { objects: {}, fields: {} }, notRead: arr(c.notRead), partial: arr(c.partial), readErrors: arr(c.readErrors), truncated: arr(c.truncated),
  };
}

/** collect.json → <out>/auth-triage-<tcode>-<yyyymmdd-hhmm>-<lang>.{html,md} + -model.json. No user ID in names. */
export async function build({ input, outDir, lang = '', now = new Date() }) {
  const c = readJson(input);
  if (lang) c.lang = lang;
  const model = triage(c);
  const { renderTriagePage, renderTriageMd } = await import('./auth-triage-page.mjs');
  mkdirSync(outDir, { recursive: true });
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}`; // local time
  const base = join(outDir, `auth-triage-${String(c.tcode).replace(/[^A-Za-z0-9_-]/g, '_')}-${stamp}-${model.lang}`);
  writeFileSync(`${base}.html`, renderTriagePage(model), 'utf8');
  writeFileSync(`${base}.md`, renderTriageMd(model), 'utf8');
  writeFileSync(`${base}-model.json`, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  return { html: `${base}.html`, md: `${base}.md`, model: `${base}-model.json`, verdict: model.verdict, mode: model.mode,
    checks: model.results.length, estimates: model.estimates.length, candidates: model.candidates.map((x) => `${x.role} (${x.covers.join('+')}${x.sod?.added.length ? `, SoD +${x.sod.added.length}` : ''})`),
    notRead: model.notRead, readErrors: model.readErrors };
}

export const PRD_CONFIRM = {
  en: "PRD: only this one user's role assignments are read (read-only). Go?",
  ko: 'PRD에서는 이 사용자 한 명의 역할 할당만 읽어요 (읽기 전용). 진행할까요?',
};

/** PRD tier without --confirm-prd → the stop message (the skill asks PRD_CONFIRM first, then passes the flag). */
export function prdGuard({ tier, confirmed }) {
  return tier === 'PRD' && !confirmed ? `active profile tier is PRD — ask the user "${PRD_CONFIRM.en}" and rerun with --confirm-prd on yes` : '';
}

function activeTier() {
  const env = readActiveSapEnv(process.cwd())?.env || {};
  return normalizeTier(process.env.SAP_TIER || env.SAP_TIER);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, ...args] = process.argv.slice(2);
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  (async () => {
    const outDir = get('--out-dir') ? resolve(get('--out-dir')) : '';
    if (!outDir) throw new Error('--out-dir <dir> is required');
    let r;
    if (cmd === 'collect') {
      const prd = prdGuard({ tier: activeTier(), confirmed: args.includes('--confirm-prd') });
      if (prd) throw new Error(prd);
      const checks = get('--check') ? normalizeChecks(readJson(resolve(get('--check')))) : [];
      const c = await collect({ user: String(get('--user') || '').toUpperCase(), tcode: String(get('--tcode') || '').toUpperCase(), checks,
        patterns: String(get('--patterns') || 'Z*').split(/[,\s]+/).filter(Boolean), lang: get('--lang') || 'ko', system: get('--system') || process.env.SAP_SID || '' });
      mkdirSync(outDir, { recursive: true });
      const file = join(outDir, 'collect.json');
      writeFileSync(file, `${JSON.stringify(c, null, 2)}\n`, 'utf8');
      const v = classify(c);
      r = { collect: file, verdict: v.verdict, mode: v.mode, roles: c.users.length, notRead: c.notRead, readErrors: c.readErrors, truncated: c.truncated };
    } else if (cmd === 'build') {
      if (!get('--in') || !existsSync(resolve(get('--in')))) throw new Error('--in <collect.json> is required');
      r = await build({ input: resolve(get('--in')), outDir, lang: get('--lang') || '' });
    } else { console.error('Usage: node auth-triage.mjs collect|build … (see the header)'); process.exit(2); }
    console.log(JSON.stringify(r));
  })().catch((e) => { console.error(`auth-triage: ${e.message}`); process.exit(1); });
}
