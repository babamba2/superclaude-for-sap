#!/usr/bin/env node
// sc4sap:transport-readiness — is a transport request ready to move on? Read-only.
//
//   node scripts/transport/build-tr-check.mjs collect (--requests K1,K2 | --owner <USER> | --text "<like pattern>")
//        --out-dir <dir> [--system SID] [--target QAS] [--target-dest <SM59 destination>] [--cab]
//   node scripts/transport/build-tr-check.mjs build --in <dir>/collect.json --out-dir <dir> [--lang ko|en|ja]
//
// collect — through the sc4sap MCP server (config/sap-reader.mjs): the requests (E070 / E07T), their tasks,
//   their objects (E071, tasks folded into the request), the same objects in OTHER open requests, inactive
//   objects (DWINACTV, else ADT's list for the connection user — marked partial), the objects' packages
//   (TADIR), and DDIC objects of other open requests that this request's code uses (GetWhereUsed, ≤ 40
//   objects). With --target-dest: the target merge check (tr-target.mjs) — the target's TADIR / VRSD read
//   through GetRemoteTableContents over that SM59 destination. A read the system refuses is recorded as
//   not read, never as "none". With --cab: scheduled / released jobs (TBTCO status S / P) and their step
//   programs (TBTCP) for the CAB notes (build-cab-notes.mjs) — the only reads --cab adds.
// build — offline: tr-check-<lang>.html, tr-check-<lang>.md, model.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildModel } from './tr-model.mjs';
import { renderHtml, renderSummary } from './tr-page.mjs';
import { collectTarget } from './tr-target.mjs';

const TR = /^[A-Z0-9]{3}K[A-Z0-9]{6}$/;
const arr = (v) => (Array.isArray(v) ? v : []);
const up = (s) => String(s ?? '').trim().toUpperCase();
const STATUS = { D: 'open', L: 'open', O: 'released', R: 'released', N: 'released' };
const KIND = { K: 'workbench', W: 'customizing', T: 'transport of copies' };
const CODE = new Set(['PROG', 'REPS', 'CLAS', 'METH', 'CINC', 'FUGR', 'FUNC', 'LIMU', 'INTF']);
const DDIC = { TABL: ['table', 'structure'], DTEL: ['dataelement'], DOMA: ['domain'], TTYP: ['tabletype'], VIEW: ['view'] };
const MAX_DEPS = 40;

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] === undefined || argv[i + 1].startsWith('--') ? true : argv[(i += 1)];
    else out._.push(argv[i]);
  }
  return out;
}

/** The names a GetWhereUsed answer lists, upper case. */
export function referenceNames(json) {
  const refs = arr(json?.references ?? json?.result?.references ?? json?.data?.references);
  return refs.map((r) => up(r?.name ?? r?.objectName ?? r?.object_name ?? '')).filter(Boolean);
}

async function collect(o) {
  if (!o['out-dir']) throw new Error('--out-dir is required');
  const { connect, readTable, readIn } = await import('../config/sap-reader.mjs');
  const client = await connect('transport-readiness');
  try {
    // 1. The requests.
    let heads;
    if (o.requests) {
      const list = String(o.requests).split(/[\s,]+/).map(up).filter(Boolean);
      if (!list.length || list.some((t) => !TR.test(t))) throw new Error('--requests: request numbers like DEVK900123');
      heads = await readIn(client, 'E070', 'TRKORR', list);
    } else if (o.owner) {
      if (!/^[A-Z0-9_]{1,12}$/.test(up(o.owner))) throw new Error('--owner: an SAP user name');
      heads = await readTable(client, 'E070', { where: { AS4USER: up(o.owner), STRKORR: ' ', TRSTATUS: ['D', 'L'] } });
    } else if (o.text) {
      if (/['"]/.test(String(o.text))) throw new Error('--text must not contain quotes');
      const texts = await readTable(client, 'E07T', { where: { AS4TEXT: { like: String(o.text) } }, maxRows: 500 });
      if (!texts.ok) throw new Error(`E07T: ${texts.error}`);
      heads = await readIn(client, 'E070', 'TRKORR', arr(texts.rows).map((r) => r.TRKORR));
    } else throw new Error('one of --requests, --owner, --text is required');
    if (!heads.ok) throw new Error(`E070: ${arr(heads.errors).join('; ') || heads.error}`);
    const reqRows = arr(heads.rows).filter((r) => !String(r.STRKORR || '').trim());
    const ids = reqRows.map((r) => r.TRKORR);
    const texts = await readIn(client, 'E07T', 'TRKORR', ids);
    const text = new Map(arr(texts.rows).map((r) => [r.TRKORR, r.AS4TEXT]));
    const requests = reqRows.map((r) => ({ trkorr: r.TRKORR, kind: KIND[r.TRFUNCTION] || r.TRFUNCTION, status: STATUS[r.TRSTATUS] || r.TRSTATUS, owner: r.AS4USER, date: r.AS4DATE, time: r.AS4TIME || '', text: text.get(r.TRKORR) || '' }));

    // 2. Tasks and objects (task objects belong to their request).
    const taskRows = arr((await readIn(client, 'E070', 'STRKORR', ids)).rows);
    const tasks = taskRows.map((t) => ({ trkorr: t.TRKORR, parent: t.STRKORR, status: STATUS[t.TRSTATUS] || t.TRSTATUS, owner: t.AS4USER }));
    const parentOf = new Map([...ids.map((id) => [id, id]), ...tasks.map((t) => [t.trkorr, t.parent])]);
    const e071 = await readIn(client, 'E071', 'TRKORR', [...parentOf.keys()]);
    const objects = arr(e071.rows).map((r) => ({ trkorr: parentOf.get(r.TRKORR), pgmid: r.PGMID, object: r.OBJECT, name: r.OBJ_NAME }));
    const names = [...new Set(objects.map((x) => x.name))];

    // 3. The same objects in other open requests.
    let others = { ok: true, rows: [] };
    if (names.length) {
      const hits = await readIn(client, 'E071', 'OBJ_NAME', names);
      const foreign = arr(hits.rows).filter((r) => !parentOf.has(r.TRKORR));
      const h1 = await readIn(client, 'E070', 'TRKORR', [...new Set(foreign.map((r) => r.TRKORR))]);
      const parent2 = new Map(arr(h1.rows).map((r) => [r.TRKORR, String(r.STRKORR || '').trim() || r.TRKORR]));
      const h2 = await readIn(client, 'E070', 'TRKORR', [...new Set(parent2.values())]);
      const head2 = new Map(arr(h2.rows).map((r) => [r.TRKORR, r]));
      others = {
        ok: hits.ok && h1.ok && h2.ok, error: [...arr(hits.errors), ...arr(h1.errors), ...arr(h2.errors)].join('; '),
        rows: foreign.map((r) => {
          const req = parent2.get(r.TRKORR) || r.TRKORR;
          const h = head2.get(req);
          return { trkorr: req, status: STATUS[h?.TRSTATUS] || '?', owner: h?.AS4USER || '', object: r.OBJECT, name: r.OBJ_NAME };
        }).filter((r) => r.status === 'open' && !parentOf.has(r.trkorr)),
      };
    }

    // 4. Inactive objects: everybody's where the table reads, else the connection user's.
    let inactive;
    const ina = names.length ? await readIn(client, 'DWINACTV', 'OBJ_NAME', names) : { ok: true, rows: [] };
    if (ina.ok) inactive = { ok: true, scope: 'all', rows: arr(ina.rows).map((r) => ({ object: r.OBJECT, name: r.OBJ_NAME, user: r.UNAME })) };
    else {
      try {
        const res = await client.callTool({ name: 'GetInactiveObjects', arguments: {} });
        const j = JSON.parse(res?.content?.[0]?.text || '{}');
        const list = arr(j.objects || j.inactive_objects || j);
        inactive = { ok: true, scope: 'own', rows: list.map((x) => ({ object: up(String(x.type || x.object_type || '').split('/')[0]), name: up(x.name || x.object_name || ''), user: '' })) };
      } catch (e) {
        inactive = { ok: false, scope: 'none', rows: [], error: String(e?.message ?? e).slice(0, 200) };
      }
    }

    // 5. Packages.
    const t = names.length ? await readIn(client, 'TADIR', 'OBJ_NAME', names, { extra: { PGMID: 'R3TR' } }) : { ok: true, rows: [] };
    const tadir = { ok: t.ok, rows: arr(t.rows).map((r) => ({ object: r.OBJECT, name: r.OBJ_NAME, package: r.DEVCLASS })) };

    // 6. DDIC objects of other open requests that this request's code uses.
    const code = new Map(objects.filter((x) => CODE.has(up(x.object))).map((x) => [up(x.name), x.trkorr]));
    const candidates = [...new Map(others.rows.concat(await otherOpenDdic(client, readTable, readIn, parentOf))
      .filter((r) => DDIC[up(r.object)] && /^[ZY/]/.test(up(r.name)))
      .map((r) => [`${up(r.object)} ${up(r.name)}`, r])).values()].slice(0, MAX_DEPS);
    const deps = { ok: true, rows: [] };
    for (const c of candidates) {
      for (const type of DDIC[up(c.object)]) {
        try {
          const res = await client.callTool({ name: 'GetWhereUsed', arguments: { object_name: c.name, object_type: type, max_results: 200 } });
          if (res?.isError) continue;
          for (const user of referenceNames(JSON.parse(res?.content?.[0]?.text || '{}'))) {
            const tr = code.get(user) || code.get(user.replace(/=+\w*$/, ''));
            if (tr) deps.rows.push({ trkorr: tr, object: 'CODE', name: user, needs: `${up(c.object)} ${up(c.name)}`, in: c.trkorr, status: c.status });
          }
          break;
        } catch { deps.ok = false; }
      }
    }

    // 7. Target merge check (only with a destination; read-only on the target).
    let targetSystem = null;
    if (o['target-dest'] !== undefined) {
      const dest = String(o['target-dest'] === true ? '' : o['target-dest']).trim();
      if (!/^[A-Za-z0-9_.%-]{1,32}$/.test(dest)) throw new Error('--target-dest: an SM59 destination name');
      targetSystem = await collectTarget({ client, readIn }, { requests, objects, deps }, { dest, label: o.target || '' });
    }

    // 8. With --cab: scheduled / released jobs and the programs of their steps (CAB notes: jobs an import affects).
    const jobs = o.cab ? await scheduledJobs(client, readTable, readIn) : null;

    const out = { system: o.system || '', target: o.target || '', readAt: new Date().toISOString().slice(0, 16).replace('T', ' '), requests, tasks, objects, others, inactive, tadir, deps, targetSystem, ...(jobs ? { jobs } : {}) };
    mkdirSync(o['out-dir'], { recursive: true });
    const file = join(o['out-dir'], 'collect.json');
    writeFileSync(file, JSON.stringify(out, null, 1));
    return { file, requests: requests.length, objects: objects.length, others: others.rows.length, inactive: inactive.ok ? `${inactive.rows.length} (${inactive.scope})` : 'not read', deps: deps.rows.length,
      ...(jobs ? { jobs: jobs.ok ? jobs.rows.length : 'not read' } : {}),
      ...(targetSystem ? { target: targetSystem.ok ? { dest: targetSystem.dest, checked: targetSystem.checked, inTarget: targetSystem.tadir.length, versions: targetSystem.versions.length, used: targetSystem.needs.length, notes: targetSystem.notes } : { dest: targetSystem.dest, ok: false, error: targetSystem.error } } : {}) };
  } finally {
    await client.close().catch(() => {});
  }
}

/** TBTCO jobs scheduled (P) or released (S) and their step programs (TBTCP). A refused read → { ok: false }. */
export async function scheduledJobs(client, readTable, readIn) {
  const heads = await readTable(client, 'TBTCO', { where: "STATUS IN ('S', 'P')", fields: ['JOBNAME', 'JOBCOUNT', 'STATUS'], maxRows: 5000 });
  if (!heads.ok) return { ok: false, rows: [], error: String(heads.error || 'TBTCO not read').slice(0, 200) };
  const status = new Map(arr(heads.rows).map((r) => [`${r.JOBNAME}|${r.JOBCOUNT}`, r.STATUS]));
  const steps = await readIn(client, 'TBTCP', 'JOBCOUNT', [...new Set(arr(heads.rows).map((r) => r.JOBCOUNT))], { fields: ['JOBNAME', 'JOBCOUNT', 'STEPCOUNT', 'PROGNAME'] });
  const rows = arr(steps.rows).filter((s) => status.has(`${s.JOBNAME}|${s.JOBCOUNT}`) && String(s.PROGNAME || '').trim())
    .map((s) => ({ job: s.JOBNAME, program: up(s.PROGNAME), status: status.get(`${s.JOBNAME}|${s.JOBCOUNT}`) }));
  return { ok: !!steps.ok, rows, truncated: arr(heads.rows).length >= 5000, ...(steps.ok ? {} : { error: arr(steps.errors).join('; ').slice(0, 200) }) };
}

/** Customer DDIC objects in other open requests of the last 90 days — what this request's code might need. */
async function otherOpenDdic(client, readTable, readIn, parentOf) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10).replace(/-/g, '');
  const open = await readTable(client, 'E070', { where: `TRSTATUS IN ('D', 'L') AND AS4DATE >= '${since}'`, maxRows: 500 });
  if (!open.ok) return [];
  const rows = arr(open.rows).filter((r) => !parentOf.has(r.TRKORR) && !parentOf.has(String(r.STRKORR || '').trim()));
  const head = new Map(rows.map((r) => [r.TRKORR, String(r.STRKORR || '').trim() || r.TRKORR]));
  const objs = await readIn(client, 'E071', 'TRKORR', [...head.keys()], { extra: {} });
  return arr(objs.rows).filter((r) => DDIC[up(r.OBJECT)]).map((r) => ({ trkorr: head.get(r.TRKORR), status: 'open', object: r.OBJECT, name: r.OBJ_NAME }));
}

function build(o) {
  if (!o.in || !o['out-dir']) throw new Error('--in and --out-dir are required');
  const lang = ['ko', 'en', 'ja'].includes(o.lang) ? o.lang : 'en';
  const model = buildModel(JSON.parse(readFileSync(o.in, 'utf8')));
  mkdirSync(o['out-dir'], { recursive: true });
  const base = join(o['out-dir'], `tr-check-${lang}`);
  writeFileSync(`${base}.html`, renderHtml(model, lang));
  const summary = renderSummary(model, lang);
  writeFileSync(`${base}.md`, `${summary}\n`);
  writeFileSync(join(o['out-dir'], 'model.json'), JSON.stringify(model, null, 1));
  return { html: `${base}.html`, md: `${base}.md`, summary: model.summary, text: summary };
}

const USAGE = 'usage: build-tr-check.mjs collect (--requests K1,K2 | --owner USER | --text PATTERN) --out-dir <dir> [--system SID] [--target QAS] [--target-dest DEST] [--cab] | build --in <dir>/collect.json --out-dir <dir> [--lang ko|en|ja]';

if (process.argv[1] && /build-tr-check\.mjs$/.test(process.argv[1])) {
  const o = args(process.argv.slice(2));
  const verb = o._[0];
  (async () => {
    if (!verb || o.help) return process.stdout.write(`${USAGE}\n`);
    const result = verb === 'collect' ? await collect(o) : verb === 'build' ? build(o) : null;
    if (!result) throw new Error(USAGE);
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
  })().catch((e) => { process.stdout.write(`${JSON.stringify({ ok: false, error: String(e?.message ?? e) })}\n`); process.exit(1); });
}
