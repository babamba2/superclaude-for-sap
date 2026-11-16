#!/usr/bin/env node
// sc4sap:ops-health-check — collect what the connected system says about its own health, and draw the report.
//
//   node scripts/ops/build-ops-check.mjs collect --from <YYYY-MM-DD> --to <YYYY-MM-DD> --out-dir <dir> [--system <SID>] [--sap-version <v>]
//   node scripts/ops/build-ops-check.mjs build --in <dir>/collect.json --out-dir <dir> [--lang ko|en|ja]
//
// collect — read-only, through the sc4sap MCP server (config/sap-reader.mjs): RuntimeListDumps for the period and
//   the period before it; E070 / E07T / E071 for requests from 7 days before the period on; TBTCO / TBTCP aborted
//   jobs, VBHDR update requests with an error, EDIDC IDocs in an error status. A table the system will not read
//   (BASIS < 7.50 reads customizing / system tables only) is recorded as not readable, never as empty.
//   No business document rows, no user names in the output (dump users are counted only).
// build — offline: ops-check-<to>-<lang>.html, ops-check-<to>-<lang>.md (summary) and model.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildModel, IDOC_ERROR_STATUS } from './ops-model.mjs';
import { renderHtml, renderSummary } from './ops-page.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const arr = (v) => (Array.isArray(v) ? v : []);
const sap = (iso) => iso.replace(/-/g, '');
const iso = (t) => {
  const s = String(t || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return /^\d{8}/.test(s) && !s.startsWith('00000000') ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '';
};
const hhmm = (t) => { const s = String(t || '').replace(/:/g, ''); return /^\d{4}/.test(s) ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : ''; };
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') || argv[i + 1] === undefined ? true : argv[(i += 1)];
    else out._.push(argv[i]);
  }
  return out;
}

/** Dumps of a period: the ST22 list (ECC, older than 24 h) and the ADT feed entries, one shape. */
export function dumpsOf(json) {
  const rows = arr(json?.st22?.dumps).map((d) => ({
    id: d.dump_id || '', date: d.date || '', time: d.time || '', error: d.runtime_error || '',
    program: d.program || '', include: d.include || '', user: d.user || '',
  }));
  let feed = json?.payload?.['atom:feed']?.['atom:entry'];
  if (feed && !Array.isArray(feed)) feed = [feed];
  // The dump key both lists share: the ST22 id, and the feed id's last segment once decoded, without blanks
  // (`20261116105611<host>_<SID>_<nr>   <user>   <client><nr>`). It starts with the local timestamp.
  const keyOf = (id) => {
    let s = String(id || '');
    try { s = decodeURIComponent(s.slice(s.lastIndexOf('/') + 1)); } catch { /* keep as is */ }
    return s.replace(/\s+/g, '');
  };
  const seen = new Set(rows.map((r) => keyOf(r.id)));
  for (const e of arr(feed)) {
    const cats = Array.isArray(e['atom:category']) ? e['atom:category'] : e['atom:category'] ? [e['atom:category']] : [];
    const cat = (re) => {
      const c = cats.find((x) => re.test(String(x?.label ?? x?.['@_label'] ?? '')));
      return String(c?.term ?? c?.['@_term'] ?? '');
    };
    const key = keyOf(e['atom:id']);
    if (seen.has(key)) continue;
    seen.add(key);
    // Local date and time from the key; the feed's own timestamps are UTC.
    const local = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(key);
    const at = String(e['atom:published'] || e['atom:updated'] || '');
    rows.push({
      id: key,
      date: local ? `${local[1]}-${local[2]}-${local[3]}` : at.slice(0, 10),
      time: local ? `${local[4]}:${local[5]}:${local[6]}` : at.slice(11, 19),
      error: cat(/runtime error/i), program: cat(/program/i), include: '',
      user: String(e['atom:author']?.['atom:name'] || ''),
    });
  }
  return rows;
}

/**
 * Every dump from `from` to `to`, in one RuntimeListDumps call. On ECC the ST22 list (`st22`) honours the
 * dates (`top` caps that list too, so it stays at 1000). The ADT feed (S/4, and ECC's last 24 h) ignores `$skip`
 * and pages by time; the MCP server (4.12+, 2026-11-16) follows its cursor back and says in `paging.reached`
 * whether it saw a dump older than `date_from` — a feed that just ends (retention) does not count.
 * `complete` is false when it did not — the caller must not compare against a period it did not reach.
 */
export async function readDumpRange(client, from, to) {
  try {
    const res = await client.callTool({ name: 'RuntimeListDumps', arguments: { date_from: from, date_to: to, top: 1000 } });
    const text = res?.content?.[0]?.text ?? '';
    if (res?.isError) throw new Error(text.slice(0, 300));
    const json = JSON.parse(text);
    const rows = dumpsOf(json);
    const complete = json?.st22
      ? !json.st22.truncated
      : json?.paging
        ? !!json.paging.reached
        // An older server: complete only if the page already reaches past `from`.
        : rows.some((d) => d.date && d.date < from);
    const oldest = json?.paging?.oldest ? iso(json.paging.oldest) : '';
    return { ok: true, complete, oldest, rows: rows.filter((d) => d.date >= from && d.date <= to) };
  } catch (e) {
    return { ok: false, complete: false, rows: [], error: String(e?.message ?? e).slice(0, 300) };
  }
}

const KIND = { K: 'workbench', W: 'customizing', T: 'transport of copies', S: 'task', R: 'repair', X: 'task', Q: 'task' };
const STATUS = { D: 'open', L: 'open', O: 'released', R: 'released', N: 'released' };
const CODE_OBJECTS = new Set(['PROG', 'REPS', 'FUGR', 'CLAS', 'FUNC', 'METH', 'LIMU', 'REPT', 'CINC']);

async function collect(o) {
  if (!DATE.test(o.from || '') || !DATE.test(o.to || '') || o.from > o.to) throw new Error('--from / --to must be YYYY-MM-DD, from ≤ to');
  if (!o['out-dir']) throw new Error('--out-dir is required');
  const { connect, readTable, readIn } = await import('../config/sap-reader.mjs');
  const span = Math.round((Date.parse(o.to) - Date.parse(o.from)) / 86400000) + 1;
  const prevTo = addDays(o.from, -1);
  const prevFrom = addDays(prevTo, -(span - 1));
  const lookbackFrom = addDays(o.from, -7);
  const client = await connect('ops-health-check');
  try {
    // One read over both periods, split after: the feed is paged newest first either way.
    const both = await readDumpRange(client, prevFrom, o.to);
    const dumps = { ok: both.ok, error: both.error, rows: both.rows.filter((d) => d.date >= o.from) };
    // The previous period only counts when the read reached back to its first day.
    const prevDumps = both.ok && both.complete
      ? { ok: true, rows: both.rows.filter((d) => d.date <= prevTo) }
      : { ok: false, rows: [], error: both.ok ? `the dump list did not reach back to ${prevFrom}${both.oldest ? ` (oldest kept: ${both.oldest})` : ''}` : both.error };

    // Requests (not tasks) from a week before the period on, their texts, and the code objects in them.
    const e070 = await readTable(client, 'E070', { where: `AS4DATE >= '${sap(lookbackFrom)}' AND AS4DATE <= '${sap(o.to)}' AND STRKORR = ' '`, maxRows: 5000 });
    let transports = { ok: e070.ok, rows: [], error: e070.error };
    let objects = { ok: e070.ok, rows: [], error: e070.error };
    if (e070.ok) {
      const heads = arr(e070.rows);
      const ids = heads.map((r) => r.TRKORR);
      const texts = await readIn(client, 'E07T', 'TRKORR', ids);
      const text = new Map(arr(texts.rows).map((r) => [r.TRKORR, r.AS4TEXT]));
      transports.rows = heads.map((r) => ({
        trkorr: r.TRKORR, kind: KIND[r.TRFUNCTION] || r.TRFUNCTION, status: STATUS[r.TRSTATUS] || r.TRSTATUS,
        date: iso(r.AS4DATE), text: text.get(r.TRKORR) || '',
      }));
      const tasks = await readIn(client, 'E070', 'STRKORR', ids);
      const parent = new Map(ids.map((id) => [id, id]));
      for (const t of arr(tasks.rows)) parent.set(t.TRKORR, t.STRKORR);
      const e071 = await readIn(client, 'E071', 'TRKORR', [...parent.keys()]);
      objects = {
        ok: e071.ok, error: e071.ok ? '' : arr(e071.errors).join('; ').slice(0, 300),
        rows: arr(e071.rows).filter((r) => CODE_OBJECTS.has(r.OBJECT)).map((r) => ({ trkorr: parent.get(r.TRKORR) || r.TRKORR, object: r.OBJECT, name: r.OBJ_NAME })),
      };
    }

    // Aborted jobs (status A) that ended in the period, with the program of their first step.
    const tbtco = await readTable(client, 'TBTCO', { where: `STATUS = 'A' AND ENDDATE >= '${sap(o.from)}' AND ENDDATE <= '${sap(o.to)}'`, fields: ['JOBNAME', 'JOBCOUNT', 'ENDDATE', 'ENDTIME'], maxRows: 5000 });
    const jobs = { ok: tbtco.ok, rows: [], error: tbtco.error };
    if (tbtco.ok) {
      const steps = await readIn(client, 'TBTCP', 'JOBCOUNT', arr(tbtco.rows).map((r) => r.JOBCOUNT), { fields: ['JOBNAME', 'JOBCOUNT', 'STEPCOUNT', 'PROGNAME'] });
      const prog = new Map();
      for (const s of arr(steps.rows).sort((a, b) => Number(a.STEPCOUNT) - Number(b.STEPCOUNT))) {
        const k = `${s.JOBNAME}|${s.JOBCOUNT}`;
        if (!prog.has(k)) prog.set(k, s.PROGNAME);
      }
      jobs.rows = arr(tbtco.rows).map((r) => ({ job: r.JOBNAME, program: prog.get(`${r.JOBNAME}|${r.JOBCOUNT}`) || '', endDate: iso(r.ENDDATE), endTime: hhmm(r.ENDTIME) }));
    }

    // Update requests that failed (return code ≠ 0) in the period. The user field is not read.
    const vbhdr = await readTable(client, 'VBHDR', { where: `VBRC <> 0 AND VBDATE >= '${sap(o.from)}000000' AND VBDATE <= '${sap(o.to)}235959'`, fields: ['VBKEY', 'VBDATE', 'VBTCODE', 'VBREPORT', 'VBRC'], maxRows: 5000 });
    const updates = { ok: vbhdr.ok, error: vbhdr.error, rows: arr(vbhdr.rows).map((r) => ({ key: r.VBKEY, date: iso(r.VBDATE), tcode: r.VBTCODE, report: r.VBREPORT, rc: r.VBRC })) };

    // IDocs created in the period that sit in an error status.
    const statuses = [...IDOC_ERROR_STATUS].map((s) => `'${s}'`).join(', ');
    const edidc = await readTable(client, 'EDIDC', { where: `CREDAT >= '${sap(o.from)}' AND CREDAT <= '${sap(o.to)}' AND STATUS IN (${statuses})`, fields: ['DOCNUM', 'STATUS', 'MESTYP', 'DIRECT', 'RCVPRN', 'SNDPRN', 'CREDAT'], maxRows: 5000 });
    const idocs = {
      ok: edidc.ok, error: edidc.error,
      rows: arr(edidc.rows).map((r) => ({ docnum: r.DOCNUM, status: r.STATUS, mestyp: r.MESTYP, direct: r.DIRECT, partner: String(r.DIRECT) === '2' ? r.SNDPRN : r.RCVPRN, date: iso(r.CREDAT) })),
    };

    const out = {
      system: o.system || '', sapVersion: o['sap-version'] || '', from: o.from, to: o.to, prevFrom, prevTo, lookbackFrom,
      readAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      dumps, prevDumps, transports, objects, jobs, updates, idocs,
    };
    mkdirSync(o['out-dir'], { recursive: true });
    const file = join(o['out-dir'], 'collect.json');
    writeFileSync(file, JSON.stringify(out, null, 1));
    const n = (s) => (s.ok ? s.rows.length : 'not readable');
    return { ok: true, file, dumps: n(dumps), transports: n(transports), jobs: n(jobs), updates: n(updates), idocs: n(idocs) };
  } finally {
    await client.close().catch(() => {});
  }
}

function build(o) {
  if (!o.in || !o['out-dir']) throw new Error('--in and --out-dir are required');
  const lang = ['ko', 'en', 'ja'].includes(o.lang) ? o.lang : 'en';
  const model = buildModel(JSON.parse(readFileSync(o.in, 'utf8')));
  mkdirSync(o['out-dir'], { recursive: true });
  const base = join(o['out-dir'], `ops-check-${model.to}-${lang}`);
  writeFileSync(`${base}.html`, renderHtml(model, lang));
  const summary = renderSummary(model, lang);
  writeFileSync(`${base}.md`, `${summary}\n`);
  writeFileSync(join(o['out-dir'], 'model.json'), JSON.stringify(model, null, 1));
  return { ok: true, html: `${base}.html`, md: `${base}.md`, verdict: model.verdict, summary };
}

const USAGE = 'usage: build-ops-check.mjs collect --from YYYY-MM-DD --to YYYY-MM-DD --out-dir <dir> [--system SID] [--sap-version v] | build --in <dir>/collect.json --out-dir <dir> [--lang ko|en|ja]';

async function main() {
  const o = args(process.argv.slice(2));
  const verb = o._[0];
  if (!verb || o.help) { process.stdout.write(`${USAGE}\n`); return; }
  const result = verb === 'collect' ? await collect(o) : verb === 'build' ? build(o) : null;
  if (!result) throw new Error(USAGE);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && /build-ops-check\.mjs$/.test(process.argv[1])) {
  main().catch((e) => { process.stdout.write(`${JSON.stringify({ ok: false, error: String(e?.message ?? e) })}\n`); process.exit(1); });
}
