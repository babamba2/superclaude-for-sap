#!/usr/bin/env node
// sc4sap:analyze-symptom — the facts of one background-job failure or one IDoc in error. Read-only.
//
//   node scripts/ops/incident.mjs collect --job <NAME> [--date YYYY-MM-DD] --out-dir <dir> [--system SID] [--sap-version v]
//   node scripts/ops/incident.mjs collect --idoc <DOCNUM> --out-dir <dir> [...]
//   node scripts/ops/incident.mjs collect --mestyp <MT> [--partner <P>] [--date YYYY-MM-DD] [--process-code <EVCODE>] --out-dir <dir> [...]
//   node scripts/ops/incident.mjs build --in <dir>/collect.json --out-dir <dir> [--lang ko|en]
//
// collect — through the sc4sap MCP server, explicit field lists only (never SELECT *):
//   job:  TBTCO (runs of the job, 30 days; other jobs aborted ±30 min), TBTCP (steps: program, variant, external
//         program, status — never the step user AUTHCKNAM / SDLUNAME), RuntimeListDumps around the failure,
//         E071 / E070 / E07T (requests that changed a step program).
//   idoc: EDIDC (the IDoc, or the newest one in error of a message type; the same type + partner over 7 days),
//         TEDS2 status texts, TBD52 (inbound function of a process code when given), E071 / E070 / E07T for that function.
//   A table the system will not read (BASIS < 7.50 dispatcher) is recorded as not read, never as empty.
// build — offline: facts.json (read by analyze-symptom) and incident-<kind>-<key>-<stamp>-<lang>.html / .md.
// Phase 1: no job log and no IDoc status records (they need SAP-side helpers) — the facts say so.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFacts, jobRuns, failureOf, lastOkBefore, objectNamesOf, minutesOf } from './incident-model.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const JOB_RE = /^[^'\n\r]{1,32}$/;
export const MESTYP_RE = /^[A-Z0-9_/]{1,30}$/;
export const PARTNER_RE = /^[A-Z0-9_/.-]{1,10}$/;
const arr = (v) => (Array.isArray(v) ? v : []);
const sap = (iso) => iso.replace(/-/g, '');
const sq = (v) => `'${String(v).replace(/'/g, "''")}'`;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const inList = (field, values) => `${field} IN (${values.map(sq).join(',\n')})`;

// Field lists — the only fields this script ever asks SAP for (tests pin them).
export const FIELDS = {
  TBTCO: ['JOBNAME', 'JOBCOUNT', 'STATUS', 'STRTDATE', 'STRTTIME', 'ENDDATE', 'ENDTIME', 'PERIODIC', 'PRDMINS', 'PRDHOURS', 'PRDDAYS', 'PRDWEEKS', 'PRDMONTHS'],
  TBTCO_OTHERS: ['JOBNAME', 'JOBCOUNT', 'STATUS', 'STRTDATE', 'STRTTIME', 'ENDDATE', 'ENDTIME'],
  TBTCP: ['JOBNAME', 'JOBCOUNT', 'STEPCOUNT', 'PROGNAME', 'VARIANT', 'XPGPROG', 'STATUS'],
  EDIDC: ['DOCNUM', 'STATUS', 'MESTYP', 'IDOCTP', 'CIMTYP', 'DIRECT', 'SNDPOR', 'SNDPRT', 'SNDPRN', 'RCVPOR', 'RCVPRT', 'RCVPRN', 'CREDAT', 'CRETIM', 'UPDDAT', 'UPDTIM'],
  EDIDC_VOLUME: ['DOCNUM', 'STATUS', 'MESTYP', 'DIRECT', 'SNDPRN', 'RCVPRN', 'CREDAT'],
  TEDS2: ['STATUS', 'LANGUA', 'DESCRP'],
  TBD52: ['EVCODE', 'FUNCNAME'],
  E071: ['TRKORR', 'OBJECT', 'OBJ_NAME'],
  E070: ['TRKORR', 'STRKORR', 'TRFUNCTION', 'TRSTATUS', 'AS4DATE'],
  E07T: ['TRKORR', 'AS4TEXT'],
};
const CODE_OBJECTS = ['PROG', 'REPS', 'FUGR', 'CLAS', 'FUNC', 'METH', 'LIMU', 'REPT', 'CINC'];
const KIND = { K: 'workbench', W: 'customizing', T: 'transport of copies', S: 'task', R: 'repair', X: 'task', Q: 'task' };
const STATUS = { D: 'open', L: 'open', O: 'released', R: 'released', N: 'released' };

/** SELECT <fields> FROM <table> WHERE <where> — the SQL text sent to GetSqlQuery. */
export function fieldSql(table, fields, where) {
  return `SELECT ${fields.join(', ')} FROM ${table}${where ? ` WHERE ${where}` : ''}`;
}

/** One read with an explicit field list. Returns { ok, rows, truncated, error }. */
export async function selectFields(client, table, fields, where, maxRows = 5000) {
  try {
    const res = await client.callTool({ name: 'GetSqlQuery', arguments: { sql_query: fieldSql(table, fields, where), row_number: maxRows } });
    const text = res?.content?.[0]?.text ?? '';
    if (res?.isError) return { ok: false, rows: [], error: text.slice(0, 300) };
    const data = JSON.parse(text);
    return { ok: true, truncated: !!data.truncated, rows: arr(data.rows).map((r) => Object.fromEntries(fields.map((f) => [f, r[f] ?? '']))) };
  } catch (e) {
    return { ok: false, rows: [], error: String(e?.message ?? e).slice(0, 300) };
  }
}

/** Requests that changed the named code objects: E071 → E070 (task → request) → E07T. */
async function readChanges(client, names) {
  if (!names.length) return { transports: { ok: true, rows: [] }, objects: { ok: true, rows: [] } };
  const e071 = await selectFields(client, 'E071', FIELDS.E071, `${inList('OBJ_NAME', names)} AND ${inList('OBJECT', CODE_OBJECTS)}`);
  if (!e071.ok) return { transports: { ok: false, rows: [], error: e071.error }, objects: { ok: false, rows: [], error: e071.error } };
  const ids = [...new Set(e071.rows.map((r) => r.TRKORR))];
  const heads = [];
  for (let i = 0; i < ids.length; i += 20) {
    const r = await selectFields(client, 'E070', FIELDS.E070, inList('TRKORR', ids.slice(i, i + 20)));
    if (!r.ok) return { transports: { ok: false, rows: [], error: r.error }, objects: { ok: false, rows: [], error: r.error } };
    heads.push(...r.rows);
  }
  const parentOf = new Map(heads.map((h) => [h.TRKORR, String(h.STRKORR || '').trim() || h.TRKORR]));
  const reqIds = [...new Set([...parentOf.values()])];
  const reqs = [...heads.filter((h) => !String(h.STRKORR || '').trim())];
  const missing = reqIds.filter((id) => !reqs.some((r) => r.TRKORR === id));
  for (let i = 0; i < missing.length; i += 20) { const r = await selectFields(client, 'E070', FIELDS.E070, inList('TRKORR', missing.slice(i, i + 20))); if (r.ok) reqs.push(...r.rows); }
  const texts = new Map();
  for (let i = 0; i < reqIds.length; i += 20) { const r = await selectFields(client, 'E07T', FIELDS.E07T, inList('TRKORR', reqIds.slice(i, i + 20))); for (const t of r.rows) texts.set(t.TRKORR, t.AS4TEXT); }
  const iso = (s) => { const x = String(s || ''); return /^\d{8}$/.test(x) && x !== '00000000' ? `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}` : ''; };
  return {
    transports: { ok: true, rows: reqs.map((r) => ({ trkorr: r.TRKORR, kind: KIND[r.TRFUNCTION] || r.TRFUNCTION, status: STATUS[r.TRSTATUS] || r.TRSTATUS, date: iso(r.AS4DATE), text: texts.get(r.TRKORR) || '' })) },
    objects: { ok: true, rows: e071.rows.map((r) => ({ trkorr: parentOf.get(r.TRKORR) || r.TRKORR, object: r.OBJECT, name: r.OBJ_NAME })) },
  };
}

/** Saved interface specs (<artifactBase>/interfaces/<IF_ID>/*.json) whose IDoc message type matches. */
export function interfacesFor(dir, mestyp) {
  if (!dir || !mestyp || !existsSync(dir)) return [];
  const out = [];
  for (const id of readdirSync(dir)) {
    const d = join(dir, id);
    let files = [];
    try { files = readdirSync(d).filter((f) => f.endsWith('.json')); } catch { continue; }
    for (const f of files) {
      try {
        const m = JSON.parse(readFileSync(join(d, f), 'utf8'));
        const mt = String(m?.header?.idoc?.mestyp || m?.idoc?.mestyp || '').toUpperCase();
        if (mt && mt === mestyp) { out.push({ ifId: m.ifId || id, name: m?.header?.name || '', file: join(d, f) }); break; }
      } catch { /* not a model */ }
    }
  }
  return out;
}

async function collect(o, deps = {}) {
  const out = o['out-dir'];
  if (!out) throw new Error('--out-dir is required');
  if (o.date && !DATE.test(o.date)) throw new Error('--date must be YYYY-MM-DD');
  const kind = o.job ? 'job' : o.idoc || o.mestyp ? 'idoc' : '';
  if (!kind) throw new Error('--job <NAME>, --idoc <DOCNUM> or --mestyp <MT> is required');
  if (kind === 'job' && !JOB_RE.test(o.job)) throw new Error('--job: up to 32 characters, no quotes');
  if (o.idoc && !/^\d{1,16}$/.test(o.idoc)) throw new Error('--idoc: the IDoc number (digits)');
  if (o.mestyp && !MESTYP_RE.test(String(o.mestyp).toUpperCase())) throw new Error('--mestyp: a message type');
  if (o.partner && !PARTNER_RE.test(String(o.partner).toUpperCase())) throw new Error('--partner: a partner number');
  const { connect } = await import('../config/sap-reader.mjs');
  const { readDumpRange } = await import('./build-ops-check.mjs');
  const to = o.date || localDate();
  const c = { kind, system: o.system || '', sapVersion: o['sap-version'] || '', lang: o.lang || 'en', date: o.date || '', readAt: new Date().toISOString().slice(0, 16).replace('T', ' ') };
  const client = deps.client || await connect('incident');
  try {
    if (kind === 'job') {
      c.job = o.job;
      c.runs = await selectFields(client, 'TBTCO', FIELDS.TBTCO, `JOBNAME = ${sq(o.job)} AND STRTDATE >= '${sap(addDays(to, -30))}' AND STRTDATE <= '${sap(to)}'`);
      const runs = jobRuns(c.runs.rows);
      const failure = failureOf(runs, o.date || '');
      const lastOk = lastOkBefore(runs, failure);
      const counts = [failure?.count, lastOk?.count].filter(Boolean);
      const skip = (why) => ({ ok: null, skipped: true, why, rows: [] });
      const noRun = c.runs.ok ? 'no failed run found' : 'the runs could not be read';
      c.steps = counts.length ? await selectFields(client, 'TBTCP', FIELDS.TBTCP, `JOBNAME = ${sq(o.job)} AND ${inList('JOBCOUNT', counts)}`) : skip(noRun);
      if (failure?.endDate) {
        const days = [addDays(failure.endDate, -1), failure.endDate, addDays(failure.endDate, 1)].map(sap);
        c.others = await selectFields(client, 'TBTCO', FIELDS.TBTCO_OTHERS, `STATUS = 'A' AND ${inList('ENDDATE', days)}`);
        const d = await readDumpRange(client, addDays(failure.startDate || failure.endDate, -1), failure.endDate);
        c.dumps = { ok: d.ok, error: d.error, rows: arr(d.rows).map(({ user, ...x }) => x) }; // dump users are never kept
      } else { c.others = skip(noRun); c.dumps = skip(noRun); }
      const programs = [...new Set(c.steps.rows.map((s) => s.PROGNAME).filter(Boolean))];
      if (programs.length) Object.assign(c, await readChanges(client, objectNamesOf(programs)));
      else { c.transports = skip('no step program'); c.objects = skip('no step program'); }
    } else {
      c.idoc = o.idoc || ''; c.mestyp = String(o.mestyp || '').toUpperCase(); c.partner = String(o.partner || '').toUpperCase(); c.processCode = String(o['process-code'] || '').toUpperCase();
      c.idocs = o.idoc
        ? await selectFields(client, 'EDIDC', FIELDS.EDIDC, `DOCNUM = ${sq(String(o.idoc).padStart(16, '0'))}`)
        : await selectFields(client, 'EDIDC', FIELDS.EDIDC, `MESTYP = ${sq(c.mestyp)} AND CREDAT >= '${sap(addDays(to, -7))}' AND CREDAT <= '${sap(to)}'`);
      const { idocFacts } = await import('./incident-model.mjs');
      const focus = idocFacts({ ...c, volume: null }).focus;
      if (focus) {
        const pf = focus.direction === 'in' ? 'SNDPRN' : 'RCVPRN';
        const day = focus.createdDate || to;
        c.volume = await selectFields(client, 'EDIDC', FIELDS.EDIDC_VOLUME, `MESTYP = ${sq(focus.mestyp)} AND ${pf} = ${sq(focus.partner)} AND DIRECT = '${focus.direction === 'in' ? '2' : '1'}' AND CREDAT >= '${sap(addDays(day, -7))}' AND CREDAT <= '${sap(day)}'`);
        const statuses = [...new Set([focus.status, ...c.idocs.rows.map((r) => r.STATUS)])].filter(Boolean);
        c.statusTexts = await selectFields(client, 'TEDS2', FIELDS.TEDS2, `${inList('STATUS', statuses)} AND LANGUA = '${c.lang === 'ko' ? '3' : 'E'}'`);
      } else { c.volume = { ok: null, skipped: true, why: c.idocs.ok ? 'no IDoc matched' : 'the IDoc could not be read', rows: [] }; c.statusTexts = { ok: null, skipped: true, rows: [] }; }
      c.inboundFm = c.processCode ? await selectFields(client, 'TBD52', FIELDS.TBD52, `EVCODE = ${sq(c.processCode)}`) : { ok: true, rows: [] };
      const fm = c.inboundFm.rows[0]?.FUNCNAME;
      if (fm) Object.assign(c, await readChanges(client, [fm]));
      else { c.transports = { ok: null, skipped: true, why: 'no inbound function (process code not given)', rows: [] }; c.objects = { ...c.transports }; }
      c.interfaces = interfacesFor(o['if-dir'] || '', focus?.mestyp || c.mestyp);
    }
  } finally {
    if (!deps.client) await client.close().catch(() => {});
  }
  mkdirSync(out, { recursive: true });
  const file = join(out, 'collect.json');
  writeFileSync(file, `${JSON.stringify(c, null, 1)}\n`, 'utf8');
  const f = buildFacts(c);
  return { ok: true, file, kind, notRead: f.notRead.map((n) => n.section), dispatcherClosed: f.dispatcherClosed,
    ...(kind === 'job' ? { failure: f.failure ? `${f.failure.endDate} ${f.failure.endTime}` : null, flags: f.flags } : { idoc: f.focus?.docnum || null, status: f.focus?.status || null, flags: f.flags }) };
}

async function build(o) {
  if (!o.in || !o['out-dir']) throw new Error('--in and --out-dir are required');
  const c = JSON.parse(readFileSync(o.in, 'utf8'));
  if (o.lang) c.lang = o.lang;
  const facts = buildFacts(c);
  const { renderIncidentPage, renderIncidentMd } = await import('./incident-page.mjs');
  mkdirSync(o['out-dir'], { recursive: true });
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}`;
  const key = String(facts.kind === 'job' ? facts.job : facts.focus?.docnum || String(c.idoc || '').replace(/^0+/, '') || c.mestyp || 'idoc').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);
  const lang = facts.lang === 'ko' ? 'ko' : 'en';
  const base = join(o['out-dir'], `incident-${facts.kind}-${key}-${stamp}-${lang}`);
  writeFileSync(join(o['out-dir'], 'facts.json'), `${JSON.stringify(facts, null, 1)}\n`, 'utf8');
  writeFileSync(`${base}.html`, renderIncidentPage(facts), 'utf8');
  writeFileSync(`${base}.md`, renderIncidentMd(facts), 'utf8');
  return { ok: true, facts: join(o['out-dir'], 'facts.json'), html: `${base}.html`, md: `${base}.md`, kind: facts.kind, flags: facts.flags, notRead: facts.notRead.map((n) => n.section) };
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[(i += 1)];
    else out._.push(argv[i]);
  }
  return out;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const o = args(process.argv.slice(2));
  const verb = o._[0];
  (verb === 'collect' ? collect(o) : verb === 'build' ? build(o) : Promise.reject(new Error('usage: incident.mjs collect --job <NAME> | --idoc <DOCNUM> | --mestyp <MT> … --out-dir <dir> | build --in <collect.json> --out-dir <dir> [--lang]')))
    .then((r) => process.stdout.write(`${JSON.stringify(r)}\n`))
    .catch((e) => { process.stdout.write(`${JSON.stringify({ ok: false, error: String(e?.message ?? e) })}\n`); process.exit(1); });
}

export { collect as _collect, build as _build, minutesOf };
