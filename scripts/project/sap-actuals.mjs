// sc4sap:project-dashboard — SAP actuals, read-only: transport requests, the project packages' objects,
// inactive objects, and dumps after go-live. Read through the sc4sap MCP server (config/sap-reader.mjs);
// transport and repository tables only (E070, E07T, E071, TADIR, DWINACTV) — never business data.
//
// Customizing requests (E070-TRFUNCTION W) are the module consultants' configuration work; workbench
// requests (K) the development consultants'. The workstream comes from the request text by trPattern
// (default "[SD] …" — the sc4sap transport description rule).

import { connect, readTable, readIn } from '../config/sap-reader.mjs';
import { days, iso } from './project-model.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const sapDate = (s) => String(s || '').replace(/-/g, '');
// The SQL path answers YYYYMMDD or YYYY-MM-DD depending on the backend.
const fromSap = (s) => {
  const t = String(s || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10) === '0000-00-00' ? '' : t.slice(0, 10);
  return /^\d{8}$/.test(t) && t !== '00000000' ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : '';
};
const toolJson = async (client, name, args) => {
  const res = await client.callTool({ name, arguments: args });
  const text = res?.content?.[0]?.text ?? '';
  if (res?.isError) throw new Error(text.slice(0, 300));
  return JSON.parse(text);
};
export const DEFAULT_TR_PATTERN = '^\\s*\\[([A-Z0-9]{2,4})\\]';
const SIDE = { W: 'F', K: 'D' };
const STATUS = { D: 'open', L: 'open', O: 'released', R: 'released', N: 'released' };

/** Monday of the ISO week of a date. */
export function weekOf(d) {
  const t = Date.parse(`${d}T00:00:00Z`), wd = (new Date(t).getUTCDay() + 6) % 7;
  return iso(t - wd * 86400000);
}

/** E070 headers + E07T texts → [{ trkorr, side, status, user, date, text, ws }]. */
export function mapTransports(e070, e07t, { trPattern = DEFAULT_TR_PATTERN, workstreams = [] } = {}) {
  const re = new RegExp(trPattern || DEFAULT_TR_PATTERN, 'i');
  const known = new Set(arr(workstreams).map(w => String(w.code).toUpperCase()));
  const text = new Map(arr(e07t).map(r => [r.TRKORR, r.AS4TEXT]));
  return arr(e070).filter(r => !r.STRKORR && SIDE[r.TRFUNCTION]).map(r => {
    const t = text.get(r.TRKORR) || '';
    const g = re.exec(t)?.[1]?.toUpperCase() || '';
    return { trkorr: r.TRKORR, side: SIDE[r.TRFUNCTION], status: STATUS[r.TRSTATUS] || 'open', user: r.AS4USER, date: fromSap(r.AS4DATE), text: t, ws: known.size && !known.has(g) ? '' : g };
  });
}

/** Released requests per week and side (F = configuration, D = development) → [{ week, F, D }]. */
export function throughput(transports) {
  const by = new Map();
  for (const t of arr(transports)) {
    if (t.status !== 'released' || !t.date) continue;
    const w = weekOf(t.date); const x = by.get(w) || { week: w, F: 0, D: 0 };
    x[t.side]++; by.set(w, x);
  }
  return [...by.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
}

/** Per WRICEF item: evidence in the system and the stage it suggests (never written over the PM's stage). */
export function wricefEvidence(model, { objects = [], inactive = [], objectTrs = [] } = {}) {
  const tadir = new Map(arr(objects).map(o => [o.name, o]));
  const inact = new Set(arr(inactive).map(o => o.name));
  const trsOf = new Map();
  for (const t of arr(objectTrs)) { if (!trsOf.has(t.name)) trsOf.set(t.name, []); trsOf.get(t.name).push(t); }
  const order = ['req', 'fs', 'ts', 'build', 'ut', 'fut', 'sit', 'done'];
  const out = [];
  for (const w of arr(model.wbs)) {
    if (w.type !== 'wricef') continue;
    const names = arr(w.wricef?.objects);
    if (!names.length) { out.push({ id: w.id, objects: [], suggest: '', note: 'no objects linked' }); continue; }
    const found = names.filter(n => tadir.has(n)), open = names.filter(n => inact.has(n));
    const trs = names.flatMap(n => trsOf.get(n) || []);
    const released = trs.some(t => t.status === 'released');
    const suggest = released ? 'ut' : found.length ? 'build' : '';
    const cur = w.wricef?.stage || 'req';
    out.push({
      id: w.id, objects: names, found: found.length, inactive: open, trs: [...new Set(trs.map(t => t.trkorr))], released,
      authors: [...new Set(found.map(n => tadir.get(n).author).filter(Boolean))],
      suggest, behind: suggest && order.indexOf(cur) < order.indexOf(suggest),
    });
  }
  return out;
}

/** Reads everything for the model's project. Returns the `actuals` block. */
export async function collectActuals(model, { client: given, today = iso(Date.now()) } = {}) {
  const p = model.project || {};
  const client = given || await connect('project-dashboard');
  const errors = [];
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.start || '')) throw new Error('project.start missing');
    // Request headers since the project start (dates are validated above, so the raw condition is safe).
    const e070r = await readTable(client, 'E070', { where: `AS4DATE >= '${sapDate(p.start)}' AND STRKORR = ' '`, maxRows: 5000 });
    if (!e070r.ok) errors.push(`E070: ${e070r.error}`);
    const heads = arr(e070r.rows).filter(r => SIDE[r.TRFUNCTION]);
    const e07t = await readIn(client, 'E07T', 'TRKORR', heads.map(r => r.TRKORR));
    const transports = mapTransports(heads, e07t.rows, { trPattern: p.trPattern, workstreams: model.workstreams });

    // Package objects: TADIR (author, created on) where the SQL path allows it (BASIS ≥ 7.50); on older releases
    // the dispatcher refuses repository tables, so the ADT package listing is used (no author).
    let objects = [];
    if (arr(p.packages).length) {
      const t = await readIn(client, 'TADIR', 'DEVCLASS', p.packages, { extra: { PGMID: 'R3TR' } });
      if (t.ok) objects = t.rows.map(r => ({ type: r.OBJECT, name: r.OBJ_NAME, package: r.DEVCLASS, author: r.AUTHOR, created: fromSap(r.CREATED_ON) }));
      else {
        for (const pkg of p.packages) {
          try {
            const list = await toolJson(client, 'GetPackageContents', { package_name: pkg, include_subpackages: true, include_descriptions: false });
            objects.push(...arr(list).filter(o => !o.isPackage).map(o => ({ type: String(o.adtType || o.type || '').split('/')[0], name: o.name, package: o.packageName || pkg, author: '', created: '' })));
          } catch (e) { errors.push(`package ${pkg}: ${String(e.message || e).slice(0, 200)}`); }
        }
      }
    }
    const names = [...new Set([...objects.map(o => o.name), ...arr(model.wbs).flatMap(w => arr(w.wricef?.objects))])];
    // Inactive objects: DWINACTV for everybody where allowed, else ADT's list (the connection user's objects only).
    let inactive = [];
    const ina = names.length ? await readIn(client, 'DWINACTV', 'OBJ_NAME', names) : { ok: true, rows: [] };
    if (ina.ok) inactive = arr(ina.rows).map(r => ({ type: r.OBJECT, name: r.OBJ_NAME, user: r.UNAME }));
    else {
      try {
        const j = await toolJson(client, 'GetInactiveObjects', {});
        const list = arr(j.objects || j.inactive_objects || j);
        const want = new Set(names);
        inactive = list.map(o => ({ type: o.type || o.object_type || '', name: o.name || o.object_name || '', user: o.user || '' })).filter(o => want.has(o.name));
      } catch (e) { errors.push(`inactive: ${String(e.message || e).slice(0, 200)}`); }
    }

    // Requests that carry the WRICEF objects (E071 tasks → their request in E070).
    const wNames = [...new Set(arr(model.wbs).flatMap(w => arr(w.wricef?.objects)))];
    let objectTrs = [];
    if (wNames.length) {
      const e071 = await readIn(client, 'E071', 'OBJ_NAME', wNames);
      const tasks = await readIn(client, 'E070', 'TRKORR', [...new Set(e071.rows.map(r => r.TRKORR))]);
      const parent = new Map(tasks.rows.map(r => [r.TRKORR, r.STRKORR || r.TRKORR]));
      const reqs = await readIn(client, 'E070', 'TRKORR', [...new Set([...parent.values()])]);
      const st = new Map(reqs.rows.map(r => [r.TRKORR, STATUS[r.TRSTATUS] || 'open']));
      objectTrs = e071.rows.map(r => { const tr = parent.get(r.TRKORR) || r.TRKORR; return { name: r.OBJ_NAME, trkorr: tr, status: st.get(tr) || 'open' }; });
    }

    // Dumps per day after go-live (hypercare).
    let dumps = [];
    if (p.goLive && p.goLive <= today) {
      try {
        const res = await client.callTool({ name: 'RuntimeListDumps', arguments: { date_from: p.goLive, date_to: today, top: 1000 } });
        const j = JSON.parse(res?.content?.[0]?.text || '{}');
        const st22 = arr(j.st22?.dumps).map(d => d.date);
        const feed = arr(j.payload?.['atom:feed']?.['atom:entry']).map(e => String(e['atom:published'] || '').slice(0, 10));
        const per = new Map();
        for (const d of [...st22, ...feed]) if (d) per.set(d, (per.get(d) || 0) + 1);
        dumps = [...per].map(([date, count]) => ({ date, count })).sort((a, b) => (a.date < b.date ? -1 : 1));
      } catch (e) { errors.push(`dumps: ${String(e.message || e).slice(0, 200)}`); }
    }

    const evidence = wricefEvidence(model, { objects, inactive, objectTrs });
    return {
      readAt: today, system: p.system || '', transports, throughput: throughput(transports),
      objects: objects.length, objectsByAuthor: countBy(objects, 'author'), objectsByType: countBy(objects, 'type'),
      inactive, evidence, dumps, errors,
    };
  } finally {
    if (!given) await client.close().catch(() => {});
  }
}

const countBy = (rows, k) => Object.entries(rows.reduce((m, r) => ({ ...m, [r[k] || '—']: (m[r[k] || '—'] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);

/** Days since the last released request of a workstream side — "is anything moving". */
export function lastMove(transports, ws, side, today) {
  const d = arr(transports).filter(t => t.ws === ws && t.side === side && t.status === 'released').map(t => t.date).sort().at(-1);
  return d ? days(d, today) : null;
}
