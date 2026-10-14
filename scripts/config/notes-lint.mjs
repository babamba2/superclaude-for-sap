#!/usr/bin/env node
// config-to-document — mechanical checks of one notes batch, run before the
// reviewers so they spend their effort on SAP meaning, not on counting.
//
//   node scripts/config/notes-lint.mjs --module MM --batch b028 [--kind draft|revised] [--sap]
//        → notes/<batch>.lint.json + one summary line on stdout (`unchecked`: tokens to look up)
//   node scripts/config/notes-lint.mjs --module MM --put-tcodes <file>
//        → merges a saved GetTransaction answer into the t-code cache (no second MCP session)
//
// Per activity:
//   sources  'verified' (accepted by an earlier review, same summary), 'changed' or 'new'
//   tcodes   upper-case tokens that are transactions: the IMG activity that uses them
//            (snapshot) or TSTC/TSTCP via GetTransaction (--sap; cached per system);
//            `notFound` lists tokens cited as a transaction that do not exist
//   counts   "<TABLE> … <n>행/rows" statements against the snapshot: table rows,
//            customer rows (customer transports only), the view's rows from the input
//   checks   check findings whose title or values the note never mentions

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { resolveArtifactBase, sc4sapHome } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';
import { isCustomerTr } from './build-config-doc.mjs';
import { readSources, sourceStatus } from './notes-sources.mjs';

function opts(argv) {
  const o = { module: '', batch: '', kind: 'draft', sap: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') o.module = String(argv[++i]).toUpperCase();
    else if (a === '--batch') o.batch = argv[++i];
    else if (a === '--kind') o.kind = argv[++i];
    else if (a === '--sap') o.sap = true;
    else if (a === '--put-tcodes') o.put = argv[++i];
  }
  if (o.put && !o.module) throw new Error('--put-tcodes needs --module <M> (the snapshot names the system)');
  if (o.put) return o;
  if (!o.module || !/^b\d{3}$/.test(o.batch) || !['draft', 'revised'].includes(o.kind)) throw new Error('--module <M> --batch bNNN [--kind draft|revised] [--sap]');
  return o;
}

const TOKEN = /(?<![A-Za-z0-9_/])(\/[A-Z0-9]+\/[A-Z0-9_]+|[A-Z][A-Z0-9_]{2,19})(?![A-Za-z0-9_/])/g;
// A token reads as a transaction when it is a reference bullet's subject or stands next to the word.
const TX_CONTEXT = /(T-?code|TCode|트랜잭션|transaction)/i;
const COUNT = /(\/[A-Z0-9]+\/[A-Z0-9_]+|[A-Z][A-Z0-9_]{2,15})[^0-9\n.]{0,25}?(\d[\d,]*)\s*(?:개\s*)?(?:행|rows?|건)/g;

/** Every text of one note with the section it sits in. */
function textsOf(note) {
  const out = [];
  const add = (sec, v) => (Array.isArray(v) ? v.forEach((x) => add(sec, x)) : v && typeof v === 'object' ? Object.values(v).forEach((x) => add(sec, x)) : v && out.push([sec, String(v)]));
  for (const [k, v] of Object.entries(note)) if (k !== 'sources') add(k, v);
  return out;
}

const tcodeCacheFile = (system) => join(sc4sapHome(), 'kb', 'tcodes', `${String(system || 'default').replace(/[^A-Za-z0-9_-]/g, '_')}.json`);

async function lookupTcodes(names, system, useSap) {
  const f = tcodeCacheFile(system);
  const cache = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const todo = names.filter((n) => !(n in cache));
  if (useSap && todo.length) {
    const { connect } = await import('./sap-reader.mjs');
    const client = await connect('config-notes-lint');
    try {
      for (let i = 0; i < todo.length; i += 50) {
        const res = await client.callTool({ name: 'GetTransaction', arguments: { transaction_names: todo.slice(i, i + 50) } });
        const data = JSON.parse(res?.content?.[0]?.text ?? '{}');
        for (const t of data.transactions || []) cache[t.tcode] = t.found ? (({ tcode, ...rest }) => rest)(t) : { found: false };
      }
    } finally {
      await client.close();
    }
    ensureDirSync(dirname(f));
    atomicWriteFileSync(f, JSON.stringify(cache, null, 1));
  }
  return cache;
}

async function lint(o) {
  const dir = join(resolveArtifactBase(process.cwd()), 'config-docs', o.module);
  const input = JSON.parse(readFileSync(join(dir, 'notes', '_in', `${o.batch}.json`), 'utf8'));
  const notes = JSON.parse(readFileSync(join(dir, 'notes', `${o.batch}.${o.kind}.json`), 'utf8')).items;
  const snap = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8'));
  const sources = readSources(o.module, input.lang || 'ko');

  // Transactions that start an IMG activity, with up to three activity titles. Transactions an
  // activity only lists among its objects say nothing about their purpose (OBYC sits under a
  // rebate activity), so they are looked up in TSTC like any other token.
  const imgTx = {};
  const addTx = (t, a) => t && (imgTx[t] ||= []).length < 3 && !imgTx[t].includes(a.title || a.titleEn) && imgTx[t].push(a.title || a.titleEn);
  for (const a of Object.values(snap.activities)) addTx(a.tcode, a);
  const tables = snap.tables || {};
  const fields = new Set(Object.values(tables).flatMap((t) => (t.fields || []).map((x) => x.name)));
  const facts = (name) => {
    const t = tables[name];
    if (!t) return null;
    return { rows: t.rows.length, customerRows: t.rows.filter((r) => (r._tr || []).some(isCustomerTr)).length, truncated: !!t.truncated };
  };

  const tokens = new Map();
  const scan = Object.entries(notes).filter(([id]) => input.items.some((x) => x.id === id)).map(([id, note]) => {
    const texts = textsOf(note);
    for (const [sec, t] of texts) {
      for (const m of t.matchAll(TOKEN)) {
        const w = m[1];
        // Tables, fields and the case labels of the notes themselves ("CASE 2" — also a real t-code).
        if (tables[w] || fields.has(w) || w === 'CASE' || w === 'IMG') continue;
        const near = t.slice(Math.max(0, m.index - 15), m.index + w.length + 15);
        const cited = (sec === 'refs' && /^\s*[A-Z/]/.test(t) && t.trimStart().startsWith(w)) || TX_CONTEXT.test(near);
        const prev = tokens.get(w) || { ids: new Set(), cited: new Set() };
        prev.ids.add(id);
        if (cited) prev.cited.add(id);
        tokens.set(w, prev);
      }
    }
    return [id, note, texts];
  });
  const tx = await lookupTcodes([...tokens.keys()].filter((w) => !imgTx[w]), snap.meta.system, o.sap);

  const out = {};
  let nNew = 0, nTx = 0, nCount = 0, nChecks = 0;
  for (const [id, note, texts] of scan) {
    const item = input.items.find((x) => x.id === id);
    const r = { sources: [], tcodes: [], notFound: [], unchecked: [], counts: [], checksMissing: [] };
    for (const s of note.sources || []) r.sources.push({ url: s.url, status: sourceStatus(sources, s) });
    for (const [w, t] of tokens) {
      if (!t.ids.has(id)) continue;
      if (imgTx[w]) r.tcodes.push({ tcode: w, imgActivities: imgTx[w], ...(tx[w]?.found ? tx[w] : {}) });
      else if (tx[w]?.found) r.tcodes.push({ tcode: w, ...tx[w] });
      else if (t.cited.has(id)) (tx[w] ? r.notFound : r.unchecked).push(w);
    }
    const all = texts.map(([, t]) => t).join('\n');
    for (const m of all.matchAll(COUNT)) {
      const f = facts(m[1]);
      if (!f) continue;
      const n = Number(m[2].replace(/,/g, ''));
      const obs = item.objects.filter((ob) => ob.table === m[1]);
      const views = obs.flatMap((ob) => [ob.rows, ob.customerRows]);
      // "… 392행 전체가 고객 운송에 기록": a count said about customer rows must be a customer-row count.
      // The rest of the sentence. A customer word belongs to this count when it comes before the
      // next number, or when the next count is joined by 와/과/및 ("T156 392행 전체와 T158 14행이
      // 고객 운송에 기록"); "41행(customer 37행)" gives the customer count separately.
      const around = all.slice(m.index, m.index + 160).split(/(?<=[.다])\s|\n/)[0];
      // Clauses end at the next count ("14행"), not at any digit (COR6, T158).
      const NEXT = /\d[\d,]*\s*(?:개\s*)?(?:행|rows?|건)/;
      const after = around.slice(m[0].length);
      // "(customer 37행)" / "중 고객 7행" introduce the next count, not this one.
      const own = after.split(NEXT)[0].replace(/(\(|중)\s*(고객|customer)[^)]*$/i, '');
      const next = after.split(NEXT).slice(1).join(' ').split(NEXT)[0];
      const aboutCustomer = /고객|customer/i.test(own) || (/^[^,(]*?(와|과|및)\s/.test(own) && /고객|customer/i.test(next));
      // Customer counts are taken from the table itself (customer transports only), never from the
      // input, so batches built before a rule change are checked by the current rule; a view
      // variant may cover fewer rows, so a smaller number passes. Counts on a truncated table are
      // partial either way.
      const ok = !f.truncated && (aboutCustomer ? n <= f.customerRows : [f.rows, f.customerRows, ...views].includes(n));
      r.counts.push({ table: m[1], said: n, aboutCustomer, ...f, viewCounts: views, ok, text: around.slice(0, 90) });
    }
    for (const c of item.checks || []) {
      const vals = c.items.map((x) => String(x).split('=').pop()).filter((v) => v.length > 1);
      if (!all.includes(c.title) && !vals.some((v) => all.includes(v))) r.checksMissing.push(c.title);
    }
    nNew += r.sources.filter((s) => s.status !== 'verified').length;
    nTx += r.notFound.length;
    nCount += r.counts.filter((c) => !c.ok).length;
    nChecks += r.checksMissing.length;
    out[id] = r;
  }
  const file = join(dir, 'notes', `${o.batch}.lint.json`);
  atomicWriteFileSync(file, JSON.stringify({ batch: o.batch, kind: o.kind, savedAt: new Date().toISOString(), sap: o.sap, items: out }, null, 1));
  process.stdout.write(JSON.stringify({ ok: true, file, activities: Object.keys(out).length, sourcesToOpen: nNew, tcodesNotFound: nTx, countsToCheck: nCount, checksMissing: nChecks }) + '\n');
}

/** Merge a saved GetTransaction answer ({ transactions: [...] }) into the system's cache. */
function putTcodes(o) {
  const dir = join(resolveArtifactBase(process.cwd()), 'config-docs', o.module);
  const system = JSON.parse(readFileSync(join(dir, 'snapshot.json'), 'utf8')).meta.system;
  const f = tcodeCacheFile(system);
  const cache = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  const data = JSON.parse(readFileSync(o.put, 'utf8'));
  for (const t of data.transactions || []) cache[t.tcode] = t.found ? (({ tcode, ...rest }) => rest)(t) : { found: false };
  ensureDirSync(dirname(f));
  atomicWriteFileSync(f, JSON.stringify(cache, null, 1));
  process.stdout.write(JSON.stringify({ ok: true, cache: f, tcodes: Object.keys(cache).length }) + '\n');
}

const o = opts(process.argv.slice(2));
(o.put ? Promise.resolve().then(() => putTcodes(o)) : lint(o)).catch((e) => {
  process.stderr.write(`[notes-lint] ${e.message}\n`);
  process.exit(1);
});
