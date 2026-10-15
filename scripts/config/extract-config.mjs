#!/usr/bin/env node
// config-to-document — extract one module's configuration from the live system.
//
// Walks the module's IMG tree (TNODEIMG / TNODEIMGT / TNODEIMGR), resolves every
// IMG activity to its customizing objects (CUS_IMGACH / CUS_IMGACT / CUS_ACTOBJ →
// views, view clusters, tables), reads the DDIC definition and the actual rows of
// each table, the customer transports that touched it (E071K / E070 / E07T) and
// SAP's own IMG documentation (DOKHL / DOKTL). Writes one snapshot JSON.
//
// Usage:
//   node scripts/config/extract-config.mjs --module MM [--areas "Purchasing,Inventory Management…"]
//        [--lang ko] [--max-rows 1000] [--no-full] [--full-tables "T683S,T685A"] [--no-docs] [--list-areas] [--fresh]
//   A table with more rows than --max-rows is read again up to the TABLE_READ cap (5000), split by
//   its key fields when it reaches the cap, text tables in the document language and English only;
//   --no-full keeps such tables at --max-rows (--full-tables then names the ones read in full).
//   node scripts/config/extract-config.mjs --module MM --field-docs | --badi   (adds column F1 docs / BAdI implementations to an existing snapshot)
//
// Output: <artifactBase>/config-docs/<MODULE>/snapshot.json (artifactBase = active profile).
// A read cache (_cache.json) next to it lets an interrupted run resume; --fresh clears it.

import { existsSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connect, readTable, readIn } from './sap-reader.mjs';
import { itfToBlocks } from './itf.mjs';
import { loadRules } from './config-checks.mjs';
import { resolveArtifactBase, readActiveAlias, readActiveSapEnv } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT_TEXT = {
  MM: 'Materials Management', SD: 'Sales and Distribution', PP: 'Production',
  PM: 'Plant Maintenance and Customer Service', QM: 'Quality Management',
  LE: 'Logistics Execution', PS: 'Project System', CO: 'Controlling',
};
const LANG_KEY = { ko: '3', en: 'E', ja: 'J', de: 'D', zh: '1' };
// Customer requests are <SID>K<6 characters> (HKDK900133, HKDK9A2OEJ); SAP delivery
// records (SAPK…, command files such as P30A_C_SFC) are skipped so they never count as customer rows.
const CUSTOMER_TR = /^(?!SAP)[A-Z][A-Z0-9]{2}K[A-Z0-9]{6}$/;

function args(argv) {
  const out = { module: '', areas: [], lang: 'ko', maxRows: 1000, fullTables: new Set(), autoFull: true, docs: true, listAreas: false, fresh: false, rootText: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--module') out.module = String(next()).toUpperCase();
    else if (a === '--areas') out.areas = String(next()).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--lang') out.lang = String(next()).toLowerCase();
    else if (a === '--max-rows') out.maxRows = Math.max(1, Math.min(5000, Number(next()) || 1000));
    // Tables read up to the TABLE_READ cap (5000) instead of --max-rows (pricing: T683S, T685A …).
    else if (a === '--full-tables') out.fullTables = new Set(String(next()).split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
    else if (a === '--no-full') out.autoFull = false;
    else if (a === '--no-docs') out.docs = false;
    else if (a === '--list-areas') out.listAreas = true;
    else if (a === '--fresh') out.fresh = true;
    else if (a === '--field-docs') out.fieldDocsOnly = true;
    else if (a === '--badi') out.badiOnly = true;
    else if (a === '--root-text') out.rootText = String(next());
    else throw new Error(`unknown option ${a}`);
  }
  if (!out.module) throw new Error('--module is required (e.g. --module MM)');
  out.rootText ||= ROOT_TEXT[out.module] || '';
  if (!out.rootText) throw new Error(`no IMG root text known for ${out.module}; pass --root-text "<English IMG node text>"`);
  out.langKey = LANG_KEY[out.lang] || 'E';
  out.langs = [...new Set([out.langKey, 'E'])];
  return out;
}

const log = (...m) => process.stderr.write(m.join(' ') + '\n');
const byKey = (rows, key) => rows.reduce((m, r) => (m[r[key]] ??= []).push(r) && m, {});
const pickText = (rows, langs, field) => {
  for (const l of langs) { const r = rows?.find((x) => x.SPRAS === l || x.DDLANGUAGE === l || x.LANGU === l || x.LANGUAGE === l); if (r) return r[field] || ''; }
  return '';
};

// ── IMG tree ────────────────────────────────────────────────────────────────
async function findModuleRoot(c, o) {
  const cand = (await readTable(c, 'TNODEIMGT', { where: { SPRAS: 'E', TEXT: o.rootText } })).rows;
  const roots = (await readIn(c, 'TNODEIMG', 'NODE_ID', cand.map((r) => r.NODE_ID))).rows.filter((n) => !n.PARENT_ID);
  const refd = (await readIn(c, 'TNODEIMG', 'REFTREE_ID', roots.map((r) => r.TREE_ID))).rows;
  const referenced = new Set(refd.map((r) => r.REFTREE_ID));
  let best = null;
  for (const r of roots.filter((x) => referenced.has(x.TREE_ID))) {
    const n = (await readTable(c, 'TNODEIMG', { where: { TREE_ID: r.TREE_ID } })).rows.length;
    if (!best || n > best.n) best = { tree: r.TREE_ID, node: r.NODE_ID, n };
  }
  if (!best) throw new Error(`IMG root "${o.rootText}" not found`);
  return best;
}

export function orderSiblings(list) {
  const byPrev = new Map(list.map((n) => [n.BROTHER_ID || '', n]));
  const out = [];
  const seen = new Set();
  let cur = byPrev.get('');
  while (cur && !seen.has(cur.NODE_ID)) { out.push(cur); seen.add(cur.NODE_ID); cur = byPrev.get(cur.NODE_ID); }
  for (const n of list) if (!seen.has(n.NODE_ID)) out.push(n); // broken chains keep table order
  return out;
}

async function walkTree(c, o, treeId, ctx, depth = 0) {
  if (ctx.trees.has(treeId) || depth > 12) return [];
  ctx.trees.add(treeId);
  const nodes = (await readTable(c, 'TNODEIMG', { where: { TREE_ID: treeId } })).rows;
  const ids = nodes.map((n) => n.NODE_ID);
  const texts = byKey((await readIn(c, 'TNODEIMGT', 'NODE_ID', ids, { extra: { SPRAS: o.langs } })).rows, 'NODE_ID');
  const refs = byKey((await readIn(c, 'TNODEIMGR', 'NODE_ID', nodes.filter((n) => n.NODE_TYPE === 'IMG').map((n) => n.NODE_ID))).rows, 'NODE_ID');
  const kids = byKey(nodes, 'PARENT_ID');
  const build = async (n) => {
    const node = { id: n.NODE_ID, text: pickText(texts[n.NODE_ID], o.langs, 'TEXT'), textEn: pickText(texts[n.NODE_ID], ['E'], 'TEXT') };
    if (n.NODE_TYPE === 'IMG') {
      const r = refs[n.NODE_ID] || [];
      const cobj = r.find((x) => x.REF_TYPE === 'COBJ')?.REF_OBJECT;
      const acti = r.find((x) => x.REF_TYPE === 'ACTI')?.REF_OBJECT;
      node.kind = 'activity';
      node.activity = cobj || (acti ? acti.replace(/^SIMG/, '') : '');
      ctx.activities.add(node.activity);
      return node;
    }
    node.kind = 'folder';
    if (n.NODE_TYPE === 'REF' && n.REFTREE_ID) {
      const sub = await walkTree(c, o, n.REFTREE_ID, ctx, depth + 1);
      node.children = sub.length === 1 && sub[0].kind === 'folder' ? sub[0].children : sub;
      if (!node.text && sub[0]) { node.text = sub[0].text; node.textEn = sub[0].textEn; }
    } else {
      node.children = [];
      for (const k of orderSiblings(kids[n.NODE_ID] || [])) node.children.push(await build(k));
    }
    return node;
  };
  const out = [];
  for (const r of orderSiblings(kids[''] || [])) out.push(await build(r));
  log(`  tree ${treeId.slice(0, 8)}… ${nodes.length} nodes`);
  return out;
}

// ── activities and objects ────────────────────────────────────────────────────
async function readActivities(c, o, ids) {
  const head = byKey((await readIn(c, 'CUS_IMGACH', 'ACTIVITY', ids)).rows, 'ACTIVITY');
  const texts = byKey((await readIn(c, 'CUS_IMGACT', 'ACTIVITY', ids, { extra: { SPRAS: o.langs } })).rows, 'ACTIVITY');
  const custIds = ids.map((id) => head[id]?.[0]?.C_ACTIVITY || id);
  const objs = byKey((await readIn(c, 'CUS_ACTOBJ', 'ACT_ID', custIds)).rows, 'ACT_ID');
  const out = {};
  for (const id of ids) {
    const h = head[id]?.[0] || {};
    const cact = h.C_ACTIVITY || id;
    out[id] = {
      id, custActivity: cact, tcode: h.TCODE || '', docuId: h.DOCU_ID || '',
      title: pickText(texts[id], o.langs, 'TEXT'), titleEn: pickText(texts[id], ['E'], 'TEXT'),
      changed: h.LDATE || '',
      objects: (objs[cact] || []).sort((a, b) => Number(a.IMG_POS) - Number(b.IMG_POS))
        .map((x) => ({ type: x.OBJECTTYPE, name: x.OBJECTNAME, tcode: x.TCODE, sub: x.SUBOBJNAME })),
    };
  }
  await addBadiNames(c, out);
  return out;
}

/** BAdI definitions behind the enhancement-type IMG activities (CUS_ACTEXT: activity → BAdI). */
async function addBadiNames(c, activities) {
  const byCust = byKey((await readIn(c, 'CUS_ACTEXT', 'ACT_ID', Object.values(activities).map((a) => a.custActivity))).rows, 'ACT_ID');
  for (const a of Object.values(activities)) {
    const names = (byCust[a.custActivity] || []).map((x) => String(x.EXIT_NAME || '').trim()).filter(Boolean);
    if (names.length) a.badis = [...new Set(names)];
  }
}

// Customer implementations (Z*/Y*) of the BAdIs the IMG names: classic ones from SXC_EXIT /
// SXC_ATTR / SXC_CLASS, enhancement-framework ones from BADIIMPL_ENH. A table the read
// cannot open (the dispatcher's allow list) is reported, never taken as "no implementation".
const CUSTOMER = /^[ZY]/;
export async function readBadiImpls(c, names) {
  const out = {};
  const errors = {};
  const add = (badi, impl) => (out[badi] ??= []).push(impl);
  const exits = await readIn(c, 'SXC_EXIT', 'EXIT_NAME', names);
  if (!exits.ok) errors.classic = String(exits.errors?.[0] || '').slice(0, 200);
  const rows = exits.rows.filter((r) => CUSTOMER.test(String(r.IMP_NAME)));
  const impls = [...new Set(rows.map((r) => r.IMP_NAME))];
  const attr = byKey((await readIn(c, 'SXC_ATTR', 'IMP_NAME', impls)).rows, 'IMP_NAME');
  const cls = byKey((await readIn(c, 'SXC_CLASS', 'IMP_NAME', impls)).rows, 'IMP_NAME');
  for (const imp of impls) {
    const a = attr[imp]?.[0] || {};
    const filters = rows.filter((r) => r.IMP_NAME === imp).map((r) => String(r.FLT_VAL || '').trim()).filter(Boolean);
    add(rows.find((r) => r.IMP_NAME === imp).EXIT_NAME, {
      name: imp, kind: 'classic', class: cls[imp]?.[0]?.IMP_CLASS || '', active: a.ACTIVE === 'X' || a.ACTIVE === true,
      filters, user: a.UNAME || '', date: String(a.UDATE || '').replace(/-/g, ''),
    });
  }
  const enh = await readIn(c, 'BADIIMPL_ENH', 'BADI_NAME', names);
  if (!enh.ok) errors.enh = String(enh.errors?.[0] || '').slice(0, 200);
  for (const r of enh.rows.filter((x) => CUSTOMER.test(String(x.ENHNAME)))) {
    if ((out[r.BADI_NAME] || []).some((x) => x.name === r.ENHNAME)) continue;
    add(r.BADI_NAME, { name: r.ENHNAME, kind: 'enh', class: r.BADI_IMPL || '', active: r.ACTIVE === 'X' || r.ACTIVE === true, filters: [], user: '', date: '' });
  }
  return { impls: out, errors };
}

async function readViews(c, o, viewNames, clusterNames) {
  const clusters = {};
  // Dialog structure of a view cluster: VCLSTRUC (order, level, parent), VCLSTRUCT
  // (node texts), VCLDIRT (cluster title). Stand-alone view titles live in DD25T,
  // which TABLE_READ does not open — the builder falls back to the activity title.
  const members = byKey((await readIn(c, 'VCLSTRUC', 'VCLNAME', clusterNames)).rows, 'VCLNAME');
  const nodeTexts = (await readIn(c, 'VCLSTRUCT', 'VCLNAME', clusterNames, { extra: { SPRAS: o.langs } })).rows;
  const clusterText = byKey((await readIn(c, 'VCLDIRT', 'VCLNAME', clusterNames, { extra: { SPRAS: o.langs } })).rows, 'VCLNAME');
  const nodeTitle = (vc, v) => pickText(nodeTexts.filter((x) => x.VCLNAME === vc && x.OBJECT === v), o.langs, 'OBJECTTEXT');
  for (const vc of clusterNames) {
    clusters[vc] = (members[vc] || []).sort((a, b) => Number(a.OBJPOS) - Number(b.OBJPOS))
      .map((m) => ({ view: m.OBJECT, title: nodeTitle(vc, m.OBJECT), pos: Number(m.OBJPOS), parent: m.PREDOBJECT === m.OBJECT ? '' : m.PREDOBJECT || '', level: Number(m.OBJLEVEL || 1), start: m.STARTOBJ === 'X' }));
    clusters[vc].forEach((m) => viewNames.push(m.view));
  }
  // A view variant (VV_*) has another view as its root: follow roots until they are tables.
  const names = [...new Set(viewNames)];
  const head = {};
  for (let todo = names; todo.length;) {
    Object.assign(head, byKey((await readIn(c, 'DD25L', 'VIEWNAME', todo, { extra: { AS4LOCAL: 'A' } })).rows, 'VIEWNAME'));
    const roots = todo.map((v) => head[v]?.[0]?.ROOTTAB).filter(Boolean);
    const rootViews = byKey((await readIn(c, 'DD25L', 'VIEWNAME', roots.filter((r) => !head[r]), { extra: { AS4LOCAL: 'A' } })).rows, 'VIEWNAME');
    todo = Object.keys(rootViews);
    Object.assign(head, rootViews);
    names.push(...todo);
  }
  const fields = byKey((await readIn(c, 'DD27S', 'VIEWNAME', names, { extra: { AS4LOCAL: 'A' } })).rows, 'VIEWNAME');
  // Selection conditions (constants only: a variant such as BSTYP = 'F').
  const conds = byKey((await readIn(c, 'DD28S', 'CONDNAME', names, { extra: { AS4LOCAL: 'A' } })).rows, 'CONDNAME');
  const views = {};
  for (const v of names) {
    const h = head[v]?.[0];
    if (!h) continue;
    views[v] = {
      name: v, root: h.ROOTTAB, rootIsView: !!head[h.ROOTTAB], title: Object.values(clusters).flat().find((m) => m.view === v)?.title || '',
      conds: (conds[v] || []).filter((x) => /^'.*'$/.test(String(x.CONSTANTS ?? '').trim()) && (x.OPERATOR || 'EQ') === 'EQ' && !x.NEGATION)
        .map((x) => ({ table: x.TABNAME, field: x.FIELDNAME, value: String(x.CONSTANTS).trim().slice(1, -1) })),
      fields: (fields[v] || []).sort((a, b) => Number(a.OBJPOS) - Number(b.OBJPOS))
        .map((f) => ({ field: f.VIEWFIELD, table: f.TABNAME, tabField: f.FIELDNAME, key: f.KEYFLAG === 'X' || f.KEYFLAG === true, rollname: f.ROLLNAME, rdonly: f.RDONLY || '' })),
    };
  }
  const clusterTitles = Object.fromEntries(clusterNames.map((vc) => [vc, pickText(clusterText[vc], o.langs, 'TEXT')]));
  return { views, clusters, clusterTitles };
}

// ── tables: definition, rows, customer transports ─────────────────────────────
export function keyString(row, keyFields) {
  return keyFields.map((f) => {
    let v = row[f.name];
    if (v === true) v = 'X'; else if (v === false || v == null) v = '';
    v = String(v);
    if (f.type === 'NUMC') v = v.padStart(f.leng, '0');
    if (f.type === 'DATS') v = v.replace(/-/g, '');
    if (f.type === 'TIMS') v = v.replace(/:/g, '');
    return v.padEnd(f.leng, ' ').slice(0, f.leng);
  }).join('');
}

const PARTITION_TOTAL = 50000;

/** Key value of a check-table row: the same field name, else its first non-client column (TVCPF-FKARN → TVFK-FKART). */
function checkValue(row, name) {
  if (name in row) return row[name];
  const first = Object.keys(row).find((k) => k !== 'MANDT' && k !== 'CLIENT');
  return first ? row[first] : undefined;
}

/**
 * Read a capped table again, one partition per value of its first key field.
 * Values: the domain's fixed values plus the values already seen. Each partition
 * is still capped at 5000; `truncated` stays true when one of them hits the cap
 * or when the first key has no fixed values to split on.
 */
export async function readByFirstKey(c, table, fields, first, langs = [], base = {}) {
  const key = fields.find((f) => f.key && f.type !== 'CLNT' && !(f.name in base));
  if (!key) return { ...first, truncated: true };
  // A text table keyed by language: only the document language and English are shown.
  if (key.type === 'LANG' && langs.length) {
    const rows = [];
    let truncated = false;
    for (const l of langs) {
      const part = await readTable(c, table, { where: { [key.name]: l } });
      if (part.ok) rows.push(...part.rows);
      if (part.rows.length >= 5000) truncated = true;
    }
    log(`  ${table}: read by ${key.name} (${langs.join(', ')}) → ${rows.length} rows${truncated ? ', still capped' : ''}`);
    return { ok: true, rows, partitioned: true, truncated };
  }
  // Values to split on: the domain's fixed values, else the keys of the field's
  // check table (KVEWE → T681V), plus the values already seen.
  let fixed = key.domname ? (await readTable(c, 'DD07L', { where: { DOMNAME: key.domname, AS4LOCAL: 'A' } })).rows.map((r) => r.DOMVALUE_L) : [];
  let ctCapped = false;
  if (!fixed.length && key.checktable && /^[A-Z0-9_/]+$/.test(key.checktable)) {
    const ct = await readTable(c, key.checktable, { maxRows: 1000 });
    fixed = ct.rows.map((r) => checkValue(r, key.name)).filter((v) => v != null);
    ctCapped = ct.rows.length >= 1000;
  }
  const seen = (first.rows || []).map((r) => r[key.name]);
  const all = [...new Set([...fixed, ...seen].map((v) => (v == null ? '' : String(v))))];
  const values = all.slice(0, 300);
  if (!fixed.length) { log(`  ${table}: capped at 5000, no values to split ${key.name} on`); return { ...first, truncated: true }; }
  const rows = [];
  // Values past the first 300 are not read, so the table stays incomplete.
  let truncated = ctCapped || all.length > values.length;
  for (const v of values) {
    let part = await readTable(c, table, { where: { ...base, [key.name]: v } });
    if (!part.ok) continue;
    // A partition at the cap (T683S usage A) is split again by the following key fields.
    if (part.rows.length >= 5000) part = await readByNextKey(c, table, fields, { ...base, [key.name]: v }, part);
    rows.push(...part.rows);
    if (part.truncated) truncated = true;
  }
  log(`  ${table}: read by ${key.name} (${values.length} values) → ${rows.length} rows${truncated ? ', still capped' : ''}`);
  return { ok: true, rows, partitioned: true, truncated: truncated || rows.length > PARTITION_TOTAL };
}

/**
 * Split a capped partition (`where` fixes the leading keys) by the next key field,
 * recursively, at most three levels deep. Values: the domain's fixed values, else the
 * check table's keys restricted to the fixed leading keys (T683S A/V → T683 KALSM).
 */
async function readByNextKey(c, table, fields, where, capped, depth = 0) {
  const key = fields.filter((f) => f.key && f.type !== 'CLNT').find((f) => !(f.name in where));
  if (!key || depth >= 3) return { ...capped, truncated: true };
  let values = key.domname ? (await readTable(c, 'DD07L', { where: { DOMNAME: key.domname, AS4LOCAL: 'A' } })).rows.map((r) => r.DOMVALUE_L) : [];
  if (!values.length && key.checktable && /^[A-Z0-9_/]+$/.test(key.checktable)) {
    let ct = await readTable(c, key.checktable, { where });
    if (!ct.ok) ct = await readTable(c, key.checktable);
    values = ct.rows.map((r) => checkValue(r, key.name)).filter((v) => v != null);
  }
  values = [...new Set([...values, ...capped.rows.map((r) => r[key.name])].map((v) => (v == null ? '' : String(v))))];
  if (!values.length) return { ...capped, truncated: true };
  const rows = [];
  let truncated = false;
  for (const v of values) {
    const w = { ...where, [key.name]: v };
    let part = await readTable(c, table, { where: w });
    if (!part.ok) continue;
    if (part.rows.length >= 5000) part = await readByNextKey(c, table, fields, w, part, depth + 1);
    rows.push(...part.rows);
    if (part.truncated) truncated = true;
  }
  log(`  ${table}: ${JSON.stringify(where)} split by ${key.name} (${values.length} values) → ${rows.length} rows${truncated ? ', still capped' : ''}`);
  return { ok: true, rows, truncated };
}

/**
 * Whether a table read with more rows than --max-rows is read again in full: up to the
 * TABLE_READ cap, restricted to the document languages when a key field is the language.
 * Returns null when the first read stands (--no-full, already full, or within the limit).
 */
export function fullReadPlan(fields, rowCount, maxRows, o) {
  if (!o.autoFull || maxRows >= 5000 || rowCount <= maxRows) return null;
  const lang = fields.find((f) => f.key && f.type === 'LANG');
  return { maxRows: 5000, base: lang ? { [lang.name]: o.langs } : {} };
}

async function readTables(c, o, tables) {
  const defs = byKey((await readIn(c, 'DD03L', 'TABNAME', tables, { extra: { AS4LOCAL: 'A' } })).rows, 'TABNAME');
  const desc = byKey((await readIn(c, 'DD02T', 'TABNAME', tables, { extra: { DDLANGUAGE: o.langs, AS4LOCAL: 'A' } })).rows, 'TABNAME');
  const out = {};
  const trkorrs = new Set();
  let i = 0;
  for (const t of tables) {
    i++;
    const fields = (defs[t] || []).filter((f) => !String(f.FIELDNAME).startsWith('.'))
      .sort((a, b) => Number(a.POSITION) - Number(b.POSITION))
      .map((f) => ({ name: f.FIELDNAME, key: f.KEYFLAG === 'X' || f.KEYFLAG === true, rollname: f.ROLLNAME, domname: f.DOMNAME, checktable: f.CHECKTABLE && f.CHECKTABLE !== '*' ? f.CHECKTABLE : '', type: f.DATATYPE, leng: Number(f.LENG) || 0 }));
    let maxRows = o.fullTables.has(t) ? 5000 : o.maxRows;
    let rows = await readTable(c, t, { maxRows: maxRows + 1 });
    // More rows than --max-rows (per-plant tables on a system with many plants): read the
    // whole table up to the TABLE_READ cap; a text table keyed by language only in the
    // document language and English, wherever the language field sits in the key.
    const plan = fullReadPlan(fields, (rows.rows || []).length, maxRows, o);
    let base = {};
    if (plan) {
      ({ maxRows, base } = plan);
      rows = await readTable(c, t, { where: Object.keys(base).length ? base : '', maxRows: 5001 });
    }
    // At the TABLE_READ cap (5000) the rows are the first key values only (T683S:
    // pricing usage A, never output usage B) — read again per value of the first key.
    if ((rows.rows || []).length >= 5000) rows = await readByFirstKey(c, t, fields, rows, o.langs, base);
    const hist = await readTable(c, 'E071K', { where: `OBJNAME = '${t}' AND TRKORR NOT LIKE 'SAP%'` });
    // TABKEY starts with the client the change was recorded in, which is often
    // not the client read here (customizing client vs. test client), so keys
    // are compared without it.
    const clientDep = fields[0]?.type === 'CLNT';
    const keyFields = fields.filter((f) => f.key && f.type !== 'CLNT');
    const custKeys = new Map();
    for (const k of hist.rows) {
      if (!CUSTOMER_TR.test(k.TRKORR)) continue;
      trkorrs.add(k.TRKORR);
      const tk = clientDep ? String(k.TABKEY).slice(3) : String(k.TABKEY);
      (custKeys.get(tk) || custKeys.set(tk, new Set()).get(tk)).add(k.TRKORR);
    }
    const generic = [...custKeys.keys()].filter((k) => k.endsWith('*')).map((k) => [k.slice(0, -1), custKeys.get(k)]);
    const limit = rows.partitioned ? PARTITION_TOTAL : maxRows;
    const data = (rows.rows || []).slice(0, limit).map((r) => {
      const ks = keyString(r, keyFields);
      const trs = new Set(custKeys.get(ks) || custKeys.get(ks.trimEnd()) || []);
      for (const [p, s] of generic) if (ks.startsWith(p)) s.forEach((x) => trs.add(x));
      return trs.size ? { ...r, _tr: [...trs] } : r;
    });
    out[t] = {
      name: t, title: pickText(desc[t], o.langs, 'DDTEXT'), fields,
      // TABLE_READ returns at most 5000 rows, so 5000 rows also means "maybe more".
      rows: data, truncated: rows.partitioned ? rows.truncated : (rows.rows || []).length > maxRows || (rows.rows || []).length >= 5000, error: rows.ok ? '' : rows.error,
      customerKeys: hist.rows.length, historyTruncated: !!hist.truncated,
      transports: [...new Set(hist.rows.map((k) => k.TRKORR))],
    };
    if (i % 10 === 0 || i === tables.length) log(`  tables ${i}/${tables.length}`);
  }
  return { tables: out, trkorrs: [...trkorrs] };
}

// Number ranges: "Define number ranges" activities call SNUM through a parameter
// transaction that names the object (TSTCP: /NSNUM TNRO-OBJECT=EINKBELEG). The
// intervals are NRIV rows; customer transports record them under OBJNAME NRIV.
const NRIV_KEY = [
  { name: 'OBJECT', type: 'CHAR', leng: 10 }, { name: 'SUBOBJECT', type: 'CHAR', leng: 6 },
  { name: 'NRRANGENR', type: 'CHAR', leng: 2 }, { name: 'TOYEAR', type: 'NUMC', leng: 4 },
];
async function readNumberRanges(c, o, activities, trkorrs) {
  const tcodes = [...new Set(Object.values(activities).flatMap((a) => a.objects.filter((ob) => ob.type === 'T').map((ob) => ob.tcode || ob.name)))];
  const params = (await readIn(c, 'TSTCP', 'TCODE', tcodes)).rows;
  const objOf = Object.fromEntries(params.map((p) => [p.TCODE, /(?:TNRO|NRIV)-OBJECT=([A-Z0-9_/]+)/.exec(p.PARAM || '')?.[1]]).filter(([, v]) => v));
  for (const a of Object.values(activities)) {
    const objs = [...new Set(a.objects.filter((ob) => ob.type === 'T').map((ob) => objOf[ob.tcode || ob.name]).filter(Boolean))];
    if (objs.length) a.numberRanges = objs;
  }
  const objs = [...new Set(Object.values(activities).flatMap((a) => a.numberRanges || []))];
  if (!objs.length) return {};
  const rows = byKey((await readIn(c, 'NRIV', 'OBJECT', objs, { chunk: 20 })).rows, 'OBJECT');
  const texts = byKey((await readIn(c, 'TNROT', 'OBJECT', objs, { extra: { LANGU: o.langs } })).rows, 'OBJECT');
  const hist = await readTable(c, 'E071K', { where: `OBJNAME = 'NRIV' AND TRKORR NOT LIKE 'SAP%'` });
  const custKeys = new Map();
  for (const k of hist.rows) {
    if (!CUSTOMER_TR.test(k.TRKORR)) continue;
    const tk = String(k.TABKEY).slice(3);
    (custKeys.get(tk) || custKeys.set(tk, new Set()).get(tk)).add(k.TRKORR);
  }
  const out = {};
  for (const obj of objs) {
    const list = (rows[obj] || []).map((r) => {
      const trs = custKeys.get(keyString(r, NRIV_KEY));
      if (trs) trs.forEach((t) => trkorrs.push(t));
      return trs ? { ...r, _tr: [...trs] } : r;
    });
    out[obj] = { object: obj, title: pickText(texts[obj], o.langs, 'TXT') || pickText(texts[obj], o.langs, 'TXTSHORT'), rows: list,
      transports: [...new Set(list.flatMap((r) => r._tr || []))] };
  }
  log(`[config] ${objs.length} number range objects`);
  return out;
}

async function readTransports(c, o, trkorrs) {
  const head = (await readIn(c, 'E070', 'TRKORR', trkorrs)).rows;
  const parents = [...new Set(head.map((h) => h.STRKORR).filter(Boolean))];
  const phead = (await readIn(c, 'E070', 'TRKORR', parents)).rows;
  const all = [...head, ...phead];
  const texts = byKey((await readIn(c, 'E07T', 'TRKORR', all.map((h) => h.TRKORR), { extra: { LANGU: o.langs } })).rows, 'TRKORR');
  const anyText = byKey((await readIn(c, 'E07T', 'TRKORR', all.map((h) => h.TRKORR).filter((t) => !texts[t]))).rows, 'TRKORR');
  return Object.fromEntries(all.map((h) => [h.TRKORR, {
    trkorr: h.TRKORR, request: h.STRKORR || h.TRKORR, type: h.TRFUNCTION, status: h.TRSTATUS,
    user: h.AS4USER, date: h.AS4DATE, text: pickText(texts[h.TRKORR], o.langs, 'AS4TEXT') || anyText[h.TRKORR]?.[0]?.AS4TEXT || '',
  }]));
}

async function readLabels(c, o, rollnames, domnames) {
  const dd04 = byKey((await readIn(c, 'DD04T', 'ROLLNAME', rollnames, { extra: { DDLANGUAGE: o.langs, AS4LOCAL: 'A' } })).rows, 'ROLLNAME');
  const labels = {};
  for (const r of rollnames) {
    const rows = dd04[r];
    if (!rows) continue;
    const pick = (f) => pickText(rows, o.langs, f);
    labels[r] = { s: pick('SCRTEXT_S'), m: pick('SCRTEXT_M'), l: pick('SCRTEXT_L'), h: pick('REPTEXT'), d: pick('DDTEXT') };
  }
  const dd07 = (await readIn(c, 'DD07T', 'DOMNAME', domnames, { extra: { DDLANGUAGE: o.langs, AS4LOCAL: 'A' } })).rows;
  const domains = {};
  for (const r of dd07) {
    const d = (domains[r.DOMNAME] ??= {});
    if (!(r.DOMVALUE_L in d) || r.DDLANGUAGE === o.langKey) d[r.DOMVALUE_L] = r.DDTEXT;
  }
  return { labels, domains };
}

async function readDocs(c, o, activities) {
  const ids = [...new Set(Object.values(activities).map((a) => a.docuId).filter(Boolean))];
  const heads = (await readIn(c, 'DOKHL', 'OBJECT', ids, { extra: { ID: 'HY', LANGU: o.langs, DOKSTATE: 'A' } })).rows;
  const best = {};
  for (const h of heads) {
    const cur = best[h.OBJECT];
    const rank = (x) => (x.LANGU === o.langKey ? 1e6 : 0) + Number(x.DOKVERSION);
    if (!cur || rank(h) > rank(cur)) best[h.OBJECT] = h;
  }
  const docs = {};
  let i = 0;
  for (const [obj, h] of Object.entries(best)) {
    const ver = String(h.DOKVERSION).padStart(4, '0');
    const r = await readTable(c, 'DOKTL', { where: { ID: 'HY', OBJECT: obj, LANGU: h.LANGU, TYP: h.TYP || 'E', DOKVERSION: ver } });
    if (r.ok) docs[obj] = { lang: h.LANGU, blocks: itfToBlocks(r.rows) };
    if (++i % 25 === 0) log(`  docs ${i}/${Object.keys(best).length}`);
  }
  return docs;
}

// F1 documentation of the data elements behind the value-table columns (DOKTL, ID 'DE'):
// the document language when SAP has it, else English; the latest version, as plain text.
const FIELD_DOC_CHARS = 1500;
export async function readFieldDocs(c, o, rolls) {
  const out = {};
  const take = (rows) => {
    const best = {};
    for (const r of rows) {
      const k = `${r.OBJECT}|${r.LANGU}`;
      if (!best[k] || Number(r.DOKVERSION) > best[k]) best[k] = Number(r.DOKVERSION);
    }
    for (const obj of new Set(rows.map((r) => r.OBJECT))) {
      const lang = o.langs.find((l) => best[`${obj}|${l}`]);
      if (!lang) continue;
      const lines = rows.filter((r) => r.OBJECT === obj && r.LANGU === lang && Number(r.DOKVERSION) === best[`${obj}|${lang}`]);
      const text = itfToBlocks(lines).filter((b) => b.t !== 'h').map((b) => b.text).join(' ').slice(0, FIELD_DOC_CHARS);
      if (text) out[obj] = { lang, text };
    }
  };
  const list = [...new Set(rolls)].filter(Boolean).sort();
  for (let i = 0; i < list.length; i += 10) {
    const part = list.slice(i, i + 10);
    const r = await readTable(c, 'DOKTL', { where: { ID: 'DE', LANGU: o.langs, OBJECT: part } });
    if (r.ok && !r.truncated) take(r.rows);
    else for (const obj of part) take((await readTable(c, 'DOKTL', { where: { ID: 'DE', LANGU: o.langs, OBJECT: obj } })).rows);
    if ((i / 10) % 25 === 0) log(`  field docs ${i}/${list.length}`);
  }
  return out;
}

/** Data elements of the columns a document shows: view fields and table fields. */
export function columnRolls(snap) {
  const rolls = new Set();
  for (const t of Object.values(snap.tables)) for (const f of t.fields || []) if (f.rollname && f.type !== 'CLNT') rolls.add(f.rollname);
  for (const v of Object.values(snap.views)) for (const f of v.fields) if (f.rollname && f.rollname !== 'MANDT') rolls.add(f.rollname);
  return [...rolls];
}

// On Windows the rename fails with EPERM while another process (a reader,
// the virus scanner) holds the old file for a moment: wait and try again.
// A watcher that keeps the file open without delete sharing blocks the rename
// for good; the file itself stays writable, so the last try writes in place.
function writeWithRetry(file, content, tries = 3) {
  for (let i = 1; ; i++) {
    try { return atomicWriteFileSync(file, content); } catch (e) {
      if (!/EPERM|EBUSY|EACCES/.test(e?.code || e?.message)) throw e;
      if (i >= tries) { log(`[config] rename blocked — writing ${file} in place`); return writeFileSync(file, content); }
      log(`[config] ${e.code || 'write'} on ${file} — retry ${i}/${tries - 1}`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000 * i);
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const o = args(process.argv.slice(2));
  const cwd = process.cwd();
  const outDir = join(resolveArtifactBase(cwd), 'config-docs', o.module);
  ensureDirSync(outDir);
  const cachePath = join(outDir, '_cache.json');
  if (o.fresh && existsSync(cachePath)) rmSync(cachePath);
  const c = await connect();
  c.cache = new Map(existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : []);
  const saveCache = () => atomicWriteFileSync(cachePath, JSON.stringify([...c.cache]));
  const timer = setInterval(saveCache, 30000);
  try {
    // --field-docs / --badi: add the column F1 documentation / the BAdIs of the IMG activities
    // with their customer implementations to an existing snapshot without reading it again.
    if (o.fieldDocsOnly || o.badiOnly) {
      const file = join(outDir, 'snapshot.json');
      const snap = JSON.parse(readFileSync(file, 'utf8'));
      if (o.fieldDocsOnly) snap.fieldDocs = await readFieldDocs(c, o, columnRolls(snap));
      if (o.badiOnly) {
        await addBadiNames(c, snap.activities);
        const badi = await readBadiImpls(c, [...new Set(Object.values(snap.activities).flatMap((a) => a.badis || []))]);
        snap.badiImpls = badi.impls;
        snap.badiErrors = badi.errors;
      }
      writeWithRetry(file, JSON.stringify(snap));
      process.stdout.write(JSON.stringify({ ok: true, file, fieldDocs: Object.keys(snap.fieldDocs || {}).length, badiActivities: Object.values(snap.activities).filter((a) => a.badis).length, badiWithImpls: Object.keys(snap.badiImpls || {}).length, badiErrors: snap.badiErrors || {} }) + '\n');
      return;
    }
    log(`[config] ${o.module}: finding IMG root "${o.rootText}"`);
    const root = await findModuleRoot(c, o);
    const ctx = { trees: new Set(), activities: new Set() };
    const top = (await readTable(c, 'TNODEIMG', { where: { TREE_ID: root.tree } })).rows;
    const topTexts = byKey((await readIn(c, 'TNODEIMGT', 'NODE_ID', top.map((n) => n.NODE_ID), { extra: { SPRAS: o.langs } })).rows, 'NODE_ID');
    const areas = orderSiblings(top.filter((n) => n.PARENT_ID === root.node))
      .map((n) => ({ node: n, text: pickText(topTexts[n.NODE_ID], o.langs, 'TEXT'), textEn: pickText(topTexts[n.NODE_ID], ['E'], 'TEXT') }));
    if (o.listAreas) {
      process.stdout.write(JSON.stringify(areas.map((a) => ({ text: a.text, textEn: a.textEn })), null, 2) + '\n');
      return;
    }
    const want = (a) => !o.areas.length || o.areas.some((x) => [a.text, a.textEn].some((t) => t.toLowerCase() === x.toLowerCase()));
    const tree = [];
    ctx.trees.add(root.tree);
    for (const a of areas.filter(want)) {
      log(`[config] walking ${a.textEn}`);
      const kids = a.node.REFTREE_ID ? await walkTree(c, o, a.node.REFTREE_ID, ctx) : [];
      const children = kids.length === 1 && kids[0].kind === 'folder' ? kids[0].children : kids;
      tree.push({ id: a.node.NODE_ID, kind: 'folder', text: a.text, textEn: a.textEn, children });
    }
    const actIds = [...ctx.activities].filter(Boolean);
    log(`[config] ${actIds.length} IMG activities`);
    const activities = await readActivities(c, o, actIds);
    const viewNames = [], clusterNames = [], tableNames = [];
    for (const a of Object.values(activities)) for (const ob of a.objects) {
      if (ob.type === 'V') viewNames.push(ob.name);
      else if (ob.type === 'C') clusterNames.push(ob.name);
      else if (ob.type === 'S') tableNames.push(ob.name);
    }
    const { views, clusters, clusterTitles } = await readViews(c, o, viewNames, [...new Set(clusterNames)]);
    for (const v of Object.values(views)) for (const f of v.fields) if (!views[f.table]) tableNames.push(f.table);
    const tables = [...new Set(tableNames)].filter((t) => /^[A-Z0-9_/]+$/.test(t)).sort();
    log(`[config] ${Object.keys(views).length} views, ${Object.keys(clusters).length} clusters, ${tables.length} tables`);
    const { tables: tableData, trkorrs } = await readTables(c, o, tables);
    // Tables the module's check rules compare against (number ranges, org units …).
    const rules = loadRules(join(ROOT, 'configs', o.module, 'config-checks.json'));
    // Whole tables no IMG activity names (account determination C001…): read like activity
    // tables, with DDIC fields and customer transports.
    const whole = [...new Set(rules.reads.filter((r) => !r.where && !tableData[r.table]).map((r) => r.table))];
    if (whole.length) {
      const extra = await readTables(c, o, whole);
      for (const [t, d] of Object.entries(extra.tables)) tableData[t] = { ...d, source: 'check' };
      trkorrs.push(...extra.trkorrs);
    }
    for (const r of rules.reads) {
      if (tableData[r.table]) continue;
      const res = await readTable(c, r.table, { where: r.where || '' });
      tableData[r.table] = { name: r.table, title: '', fields: [], rows: res.rows, truncated: !!res.truncated, error: res.ok ? '' : res.error, source: 'check', customerKeys: 0, transports: [] };
    }
    const numberRanges = await readNumberRanges(c, o, activities, trkorrs);
    const transports = await readTransports(c, o, trkorrs);
    const rolls = new Set(), doms = new Set();
    for (const t of Object.values(tableData)) for (const f of t.fields) { if (f.rollname) rolls.add(f.rollname); if (f.domname) doms.add(f.domname); }
    for (const v of Object.values(views)) for (const f of v.fields) if (f.rollname) rolls.add(f.rollname);
    const { labels, domains } = await readLabels(c, o, [...rolls], [...doms]);
    const docs = o.docs ? await readDocs(c, o, activities) : {};
    const fieldDocs = o.docs ? await readFieldDocs(c, o, columnRolls({ tables: tableData, views })) : {};
    const badi = await readBadiImpls(c, [...new Set(Object.values(activities).flatMap((a) => a.badis || []))]);
    const env = readActiveSapEnv(cwd)?.env || {};
    const snapshot = {
      meta: {
        module: o.module, rootText: o.rootText, areas: tree.map((a) => a.textEn), lang: o.lang,
        system: readActiveAlias(cwd) || env.SAP_SYSTEM_ID || '', client: env.SAP_CLIENT || '', sapVersion: env.SAP_VERSION || '',
        extractedAt: new Date().toISOString(), maxRows: o.maxRows,
        counts: { activities: actIds.length, views: Object.keys(views).length, tables: tables.length, transports: Object.keys(transports).length, docs: Object.keys(docs).length },
      },
      tree, activities, views, clusters, clusterTitles, tables: tableData, numberRanges, transports, labels, domains, docs, fieldDocs, badiImpls: badi.impls, badiErrors: badi.errors,
    };
    const file = join(outDir, 'snapshot.json');
    writeWithRetry(file, JSON.stringify(snapshot));
    saveCache();
    process.stdout.write(JSON.stringify({ ok: true, file, counts: snapshot.meta.counts }) + '\n');
  } finally {
    clearInterval(timer);
    saveCache();
    await c.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { log(`[config] failed: ${e?.stack || e}`); process.exit(1); });
}
