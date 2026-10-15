#!/usr/bin/env node
// config-to-document — build the HTML document from a snapshot.
//
// Usage:
//   node scripts/config/build-config-doc.mjs --module MM [--snapshot <file>] [--lang ko] [--out <file>] [--import <edited.html>]
//
// Reads <artifactBase>/config-docs/<MODULE>/snapshot.json (extract-config.mjs),
// runs the module's check rules, draws an SM30-style overview (and a detail
// screen for wide views) with the real values through the shared screen
// renderer, and writes one self-contained HTML file next to the snapshot:
// <MODULE>-config-v<n>-<lang>.html.
//
// Edit mode (config-doc-editor.mjs) saves the page with the edited notes embedded;
// --import merges them into notes/edits.json, and every build lays those edits
// over the generated notes, so they carry into the next version.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { renderAlvScreenSVG, renderProcessFlowHorizontalSVG, approxTextWidthPx } from '../spec/screen-image-renderer.mjs';
import { resolveArtifactBase, readScreenTheme, readActiveSapEnv } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync, ensureDirSync } from '../lib/atomic-write.mjs';
import { loadRules, runChecks, attachActivities } from './config-checks.mjs';
import { pageHtml } from './config-doc-page.mjs';
import { loadNotes, loadTerms } from './notes.mjs';
import { loadFieldMeanings } from './fields.mjs';
import { loadBadiNotes, methodKey } from './badi-notes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOCK_COLS = 8;
const MOCK_ROWS = 5;
const TABLE_COLS = 30;
const FLAG_DOMAINS = /^(XFELD|FLAG|XFLAG|BOOLE|BOOLEAN|BOOLE_D|CHAR1_X)$/;

function args(argv) {
  const o = { module: '', snapshot: '', lang: '', out: '', import: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') o.module = String(argv[++i]).toUpperCase();
    else if (a === '--snapshot') o.snapshot = argv[++i];
    else if (a === '--lang') o.lang = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--import') o.import = argv[++i];
  }
  if (!o.module && !o.snapshot) throw new Error('--module or --snapshot is required');
  return o;
}

const T = {
  ko: { overview: (t) => `보기 "${t}" 변경: 개요`, detail: (t) => `보기 "${t}" 변경: 세부사항`, newEntries: '새 항목', nr: (o) => `번호 범위 간격 유지보수: ${o}`, interval: '간격' },
  en: { overview: (t) => `Change View "${t}": Overview`, detail: (t) => `Change View "${t}": Details`, newEntries: 'New Entries', nr: (o) => `Maintain Number Range Intervals: ${o}`, interval: 'Interval' },
};

const show = (v) => (v === true ? 'X' : v === false || v == null ? '' : String(v));
// A customer request is named <SID>K<6 characters> (digits, then letters once
// 999999 is used up: HKDK9A2OEJ). SAP's own delivery records (SAPK…, command
// files like P30A_C_SFC, /SPE/100_CUST) are not customer changes.
export const isCustomerTr = (t) => /^[A-Z][A-Z0-9]{2}K[A-Z0-9]{6}$/.test(String(t)) && !String(t).startsWith('SAP');
const custTr = (r) => (r._tr || []).filter(isCustomerTr);

export function buildModel(snap, lang, { drawScreens = true } = {}) {
  const L = T[lang] || T.en;
  const langKey = { ko: '3', en: 'E', ja: 'J', de: 'D', zh: '1' }[lang] || 'E';
  const label = (rollname, fallback) => {
    const l = snap.labels[rollname];
    return (l && (l.m || l.s || l.l || l.h || l.d)) || fallback;
  };
  const fieldDef = (table, name) => snap.tables[table]?.fields.find((f) => f.name === name);

  // Secondary table lookup (text tables): match on the shared key fields,
  // prefer the document language, then English.
  const secondaryIndex = new Map();
  const secondaryRow = (table, rootRow) => {
    const def = snap.tables[table];
    if (!def) return null;
    let idx = secondaryIndex.get(table);
    if (!idx) {
      const keys = def.fields.filter((f) => f.key && f.type !== 'CLNT' && f.type !== 'LANG').map((f) => f.name);
      const lang = def.fields.find((f) => f.key && f.type === 'LANG')?.name;
      idx = { keys, lang, map: new Map() };
      // Text rows only in the document language or English — never a third language.
      const rank = (x) => (!lang ? 1 : x[lang] === langKey ? 3 : x[lang] === 'E' ? 2 : 0);
      for (const r of def.rows) {
        if (!rank(r)) continue;
        const k = keys.map((n) => show(r[n])).join('\u0001');
        const prev = idx.map.get(k);
        if (!prev || rank(r) > rank(prev)) idx.map.set(k, r);
      }
      secondaryIndex.set(table, idx);
    }
    if (idx.keys.some((n) => !(n in rootRow))) return null;
    return idx.map.get(idx.keys.map((n) => show(rootRow[n])).join('\u0001')) || null;
  };

  const views = {};
  const addView = (key, title, root, cols, conds = []) => {
    const def = snap.tables[root];
    if (!def) return null;
    // View variants restrict the root table (e.g. BSTYP = 'F'); keep the original row index for _tr.
    // SAP compares CHAR values without trailing blanks: INAKTIV = ' ' matches an empty field.
    // NUMC values arrive as numbers (REGGB 1 for '001'). Conditions on the same field are
    // OR-ed (FOFUN = '02' OR '05' OR '06'), different fields AND-ed.
    const same = (a, b) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? Number(a) === Number(b) : a === b);
    const groups = {};
    for (const c of conds.filter((x) => x.table === root)) (groups[c.field] ??= []).push(String(c.value).trim());
    const keep = def.rows.map((r, i) => i).filter((i) => Object.entries(groups).every(([f, vals]) => vals.some((v) => same(show(def.rows[i][f]).trim(), v))));
    const src = keep.map((i) => def.rows[i]);
    const rows = src.map((r) => {
      const sec = {};
      return cols.map((c) => {
        if (c.table === root) return show(r[c.tabField]);
        sec[c.table] ??= secondaryRow(c.table, r);
        return show(sec[c.table]?.[c.tabField]);
      });
    });
    const cust = src.map((r, i) => (custTr(r).length ? i : -1)).filter((i) => i >= 0);
    const trOf = Object.fromEntries(cust.map((i) => [i, custTr(src[i])]));
    views[key] = {
      key, title, root, cols: cols.map((c) => ({ name: c.field, label: c.label, key: c.key, dom: c.dom, de: c.de || '' })),
      rows, cust, trOf, truncated: def.truncated, error: def.error || '', tableTitle: def.title,
      history: (def.transports || []).filter(isCustomerTr), historyTruncated: def.historyTruncated,
    };
    return views[key];
  };

  const viewModel = (name, title) => {
    const v = snap.views[name];
    if (!v) return null;
    let root = v.root;
    const conds = [...(v.conds || [])];
    for (let i = 0; snap.views[root] && i < 5; i++) { conds.push(...(snap.views[root].conds || [])); root = snap.views[root].root; }
    // A secondary-table field listed twice (V460A: NAME1 for WERKS and again as
    // NAME11 next to WRK02) is filled by screen logic in SM30, not by the view
    // join — the table value would be wrong, so the repeat is left out.
    const seen = new Set();
    const cols = v.fields.filter((f) => {
      if (snap.views[f.table] || fieldDef(f.table, f.tabField)?.type === 'CLNT') return false;
      const k = `${f.table}-${f.tabField}`;
      if (f.table !== root && seen.has(k)) return false;
      seen.add(k);
      return true;
    }).map((f) => {
      const d = fieldDef(f.table, f.tabField);
      const de = snap.labels[f.rollname] ? f.rollname : d?.rollname || f.rollname;
      return { field: f.field, table: f.table, tabField: f.tabField, key: f.key, dom: d?.domname || '', de, label: label(de, f.field) };
    });
    return addView(name, title || v.title, root, cols, conds);
  };
  const tableModel = (name, title) => {
    const def = snap.tables[name];
    if (!def) return null;
    const cols = def.fields.filter((f) => f.type !== 'CLNT').slice(0, TABLE_COLS)
      .map((f) => ({ field: f.name, table: name, tabField: f.name, key: f.key, dom: f.domname, de: f.rollname, label: label(f.rollname, f.name) }));
    return addView(name, title || def.title, name, cols);
  };

  // Number range intervals (NRIV) of a "Define number ranges" activity, drawn like SNUM.
  const NR_COLS = {
    ko: ['하위 객체', '번호 범위', '연도', '시작 번호', '종료 번호', '현재 번호', '외부'],
    en: ['Subobject', 'No.', 'Year', 'From number', 'To number', 'Current number', 'Ext'],
  };
  const NR_FIELDS = ['SUBOBJECT', 'NRRANGENR', 'TOYEAR', 'FROMNUMBER', 'TONUMBER', 'NRLEVEL', 'EXTERNIND'];
  const nrModel = (obj) => {
    const nr = snap.numberRanges?.[obj];
    if (!nr) return null;
    const key = `NR:${obj}`;
    const names = NR_COLS[lang] || NR_COLS.en;
    const rows = nr.rows.map((r) => NR_FIELDS.map((f) => show(r[f])));
    const cust = nr.rows.map((r, i) => (custTr(r).length ? i : -1)).filter((i) => i >= 0);
    views[key] = {
      key, title: nr.title || obj, root: 'NRIV', tableTitle: obj, nr: true,
      cols: NR_FIELDS.map((f, i) => ({ name: f, label: names[i], key: i < 3, dom: '' })),
      rows, cust, trOf: Object.fromEntries(cust.map((i) => [i, custTr(nr.rows[i])])), truncated: false, error: '', history: (nr.transports || []).filter(isCustomerTr),
    };
    return views[key];
  };

  // Objects of one activity → [{ kind, key, title, members? }]
  const objectsOf = (a) => {
    const out = [];
    for (const obj of a.numberRanges || []) if (nrModel(obj)) out.push({ kind: 'view', key: `NR:${obj}` });
    for (const ob of a.objects) {
      if (ob.type === 'V' && snap.views[ob.name]) { viewModel(ob.name, a.title); out.push({ kind: 'view', key: ob.name }); }
      else if (ob.type === 'S' && snap.tables[ob.name]) { tableModel(ob.name, a.title); out.push({ kind: 'table', key: ob.name }); }
      else if (ob.type === 'C' && snap.clusters[ob.name]) {
        const members = snap.clusters[ob.name].map((m) => ({ ...m, ok: !!viewModel(m.view, m.title) }));
        out.push({ kind: 'cluster', key: ob.name, title: snap.clusterTitles[ob.name] || a.title, members });
      } else if (ob.type === 'T' || ob.type === 'D') out.push({ kind: 'tcode', key: ob.tcode || ob.name, name: ob.name });
    }
    return out;
  };
  const tablesOf = (objs) => objs.flatMap((o) => (o.kind === 'cluster' ? o.members.filter((m) => views[m.view]).map((m) => views[m.view].root) : views[o.key] ? [views[o.key].root] : []));

  const acts = {};
  for (const [id, a] of Object.entries(snap.activities)) {
    const objs = objectsOf(a);
    const keys = objs.flatMap((o) => (o.kind === 'cluster' ? o.members.filter((m) => views[m.view]).map((m) => m.view) : views[o.key] ? [o.key] : []));
    const vs = keys.map((k) => views[k]);
    const rows = vs.reduce((n, v) => n + v.rows.length, 0);
    const cust = vs.reduce((n, v) => n + v.cust.length, 0);
    const blocked = vs.some((v) => v.error);
    const status = blocked ? 'blocked' : !vs.length ? 'none' : cust ? 'custom' : rows ? 'standard' : 'empty';
    acts[id] = { id, title: a.title || a.titleEn || id, titleEn: a.titleEn, tcode: a.tcode, objects: objs, viewKeys: keys, tables: [...new Set(tablesOf(objs))], rows, cust, status, docuId: a.docuId, ...(a.badis ? { badis: a.badis } : {}) };
    // An enhancement activity with an active customer implementation counts as customer-changed.
    if (a.badis?.some((b) => (snap.badiImpls?.[b] || []).some((x) => x.active)) && ['none', 'empty'].includes(status)) acts[id].status = 'custom';
  }

  // SM30 screens drawn with the real values: overview grid, plus a detail
  // screen of one row when the view is wider than the grid shows.
  const svgs = {};
  for (const v of drawScreens ? Object.values(views) : []) Object.assign(svgs, drawView(v, lang, snap.__theme));
  return { views, acts, svgs };
}

/** SM30 overview of one view, plus a detail screen of one row when the view is wider than the grid. */
export function drawView(v, lang, theme) {
  const L = T[lang] || T.en;
  const svgs = {};
  if (!v.rows.length) return svgs;
  const order = [...v.cust, ...v.rows.map((_, i) => i).filter((i) => !v.cust.includes(i))].slice(0, MOCK_ROWS);
  // Columns as wide as their longest shown value (ZMM_PO_RELEASE), within 80–240 px;
  // the renderer cuts anything longer with '…'.
  const cols = v.cols.slice(0, MOCK_COLS).map((c, i) => ({
    name: `c${i}`, header: c.label,
    width: Math.min(240, Math.max(80, ...order.map((r) => approxTextWidthPx(String(v.rows[r][i] ?? '')) + 28))),
  }));
  const sampleRows = order.map((i) => Object.fromEntries(cols.map((c, j) => [c.name, v.rows[i][j]])));
  try {
    svgs[v.key] = renderAlvScreenSVG({
      screen: v.nr ? { title: L.nr(v.tableTitle), buttons: [{ code: 'INS', label: L.interval, icon: 'create', flow: false }, { code: 'DEL', icon: 'delete', flow: false }] } : { title: L.overview(v.title || v.key), buttons: [{ code: 'NEW', label: L.newEntries, icon: 'create', flow: false }, { code: 'COPY', icon: 'copy', flow: false }, { code: 'DEL', icon: 'delete', flow: false }, { code: 'UNDO', icon: 'undo', flow: false }] },
      columns: cols, sampleRows, maxRows: MOCK_ROWS,
    }, { lang, theme });
    if (v.cols.length > MOCK_COLS) {
      const r = order[0];
      svgs[`${v.key}#detail`] = renderAlvScreenSVG({
        screen: { title: L.detail(v.title || v.key), buttons: [{ code: 'NEW', label: L.newEntries, icon: 'create', flow: false }, { code: 'COPY', icon: 'copy', flow: false }, { code: 'DEL', icon: 'delete', flow: false }],
          fields: v.cols.slice(0, 40).map((c, j) => (FLAG_DOMAINS.test(c.dom)
            ? { type: 'checkbox', label: c.label, checked: v.rows[r][j] === 'X' }
            : { type: 'input', label: c.label, value: v.rows[r][j] })) },
      }, { lang, theme });
    }
  } catch (e) {
    svgs[v.key] = '';
  }
  return svgs;
}

// Names SAP has no document-language text for, from the reviewed glossary
// (notes.mjs terms): the translation becomes the text, English stays as textEn.
const hasKo = (t) => /[가-힣]/.test(String(t || ''));
export function applyTerms(snap, terms) {
  const walk = (nodes) => nodes.forEach((n) => {
    if (n.kind !== 'folder') return;
    const en = n.text || n.textEn;
    if (!hasKo(n.text) && hasKo(terms.folder[en])) { n.textEn = en; n.text = terms.folder[en]; }
    walk(n.children || []);
  });
  walk(snap.tree);
  for (const a of Object.values(snap.activities)) {
    const en = a.title || a.titleEn;
    if (!hasKo(a.title) && hasKo(terms.activity[en])) { a.titleEn = en; a.title = terms.activity[en]; }
  }
  for (const l of Object.values(snap.labels)) {
    const en = l.m || l.s || l.l || l.h || l.d;
    if (!hasKo(en) && hasKo(terms.label[en])) l.m = terms.label[en];
  }
}

// Case diagrams of the reference panel: each case's flow drawn with the shared renderer.
function withCaseDiagrams(notes, lang) {
  for (const n of Object.values(notes)) {
    for (const c of n.cases?.list || []) {
      try { c.svg = c.flow?.length ? renderProcessFlowHorizontalSVG(c.flow, { lang }) : ''; } catch { c.svg = ''; }
    }
  }
  return notes;
}

const EDITS_RE = /<script type="application\/json" id="config-edits">([\s\S]*?)<\/script>/;
const stripSvg = (n) => (n?.cases ? { ...n, cases: { ...n.cases, list: n.cases.list.map(({ svg, ...c }) => c) } } : n);

/** notes/edits.json: { system, module, edits: { activity: note }, views: { view: { rows, cols, cust, trOf, cardTitle, histList, shots, edited } }, log: [{ author, at, note, activities, views }] } */
// Methods of the implementing classes keyed by their short name (after the interface ~).
function badiSrcOf(src) {
  const out = {};
  for (const [cls, s] of Object.entries(src)) out[cls] = { error: s.error || '', methods: (s.methods || []).map((m) => ({ ...m, key: methodKey(m.name) })), includes: s.includes || {} };
  return out;
}

export function readEdits(dir) {
  const f = join(dir, 'notes', 'edits.json');
  return existsSync(f) ? { views: {}, ...JSON.parse(readFileSync(f, 'utf8')) } : { edits: {}, views: {}, log: [] };
}

/**
 * Merge the edits embedded in a saved page into the stored ones. Per activity the newer edit wins
 * (a page built earlier still carries older copies of notes others edited since); null removes the
 * stored edit, so the generated note shows again.
 */
export function mergeEdits(stored, page, meta) {
  if (page.system && page.system !== meta.system) throw new Error(`edited page is from ${page.system}, this snapshot is ${meta.system}`);
  if (page.module && page.module !== meta.module) throw new Error(`edited page is module ${page.module}, this snapshot is ${meta.module}`);
  const out = { system: meta.system, module: meta.module, edits: { ...stored.edits }, views: { ...(stored.views || {}) }, log: [...(stored.log || [])] };
  const at = (n) => String(n?.edited?.at || '');
  const merge = (into, from, logKey, clean) => {
    for (const [id, n] of Object.entries(from || {})) {
      if (n == null) { if (page.log?.some((l) => l[logKey]?.includes(id))) delete into[id]; continue; }
      if (!into[id] || at(n) >= at(into[id])) into[id] = clean(n);
    }
  };
  merge(out.edits, page.edits, 'activities', stripSvg);
  merge(out.views, page.views, 'views', (v) => v);
  const seen = new Set(out.log.map((l) => `${l.at}|${l.author}`));
  for (const l of page.log || []) if (!seen.has(`${l.at}|${l.author}`)) out.log.push(l);
  return out;
}

/**
 * Lay one saved view edit over the extracted view. Rows saved with their column names follow
 * the columns by name, so a re-extracted view with added, dropped or reordered columns keeps
 * each value in its column.
 */
export function applyViewEdit(v, e) {
  if (e.rows) {
    const names = v.cols.map((c) => c.name);
    const from = e.cols || names;
    v.rows = e.rows.map((r) => names.map((n) => (from.indexOf(n) < 0 ? '' : String(r[from.indexOf(n)] ?? ''))));
  }
  for (const f of ['cust', 'trOf', 'cardTitle', 'histList', 'shots']) if (e[f] != null) v[f] = e[f];
  v.cust = (v.cust || []).filter((i) => i < v.rows.length);
  v.edited = e.edited;
  return v;
}

function importEdits(file, dir, meta) {
  const m = EDITS_RE.exec(readFileSync(file, 'utf8'));
  if (!m) throw new Error(`${file}: no edits found (not a page saved from edit mode)`);
  const merged = mergeEdits(readEdits(dir), JSON.parse(m[1] || '{}'), meta);
  ensureDirSync(join(dir, 'notes'));
  atomicWriteFileSync(join(dir, 'notes', 'edits.json'), JSON.stringify(merged, null, 1));
  return Object.keys(merged.edits).length + Object.keys(merged.views).length;
}

function nextVersion(dir, base) {
  const re = new RegExp(`^${base}-v(\\d+)-`);
  const n = existsSync(dir) ? readdirSync(dir).map((f) => Number(re.exec(f)?.[1] || 0)) : [];
  return Math.max(0, ...n) + 1;
}

async function main() {
  const o = args(process.argv.slice(2));
  const cwd = process.cwd();
  const dir = o.snapshot ? dirname(resolve(o.snapshot)) : join(resolveArtifactBase(cwd), 'config-docs', o.module);
  const snapFile = o.snapshot || join(dir, 'snapshot.json');
  const snap = JSON.parse(readFileSync(snapFile, 'utf8'));
  const module = snap.meta.module;
  const lang = o.lang || snap.meta.lang || 'ko';
  applyTerms(snap, loadTerms(dir));
  snap.__theme = readScreenTheme(cwd) ?? undefined;
  snap.meta.client ||= readActiveSapEnv(cwd)?.env?.SAP_CLIENT || '';
  const { views, acts, svgs } = buildModel(snap, lang);
  const imported = o.import ? importEdits(resolve(o.import), dir, snap.meta) : null;
  // Edit mode: edited notes replace the generated ones; edited views replace their values,
  // card title and change history, and their screens are drawn again from the edited rows.
  const edits = readEdits(dir);
  const editedActs = new Set();
  for (const [key, e] of Object.entries(edits.views)) {
    const v = views[key];
    if (!v || !e) continue;
    applyViewEdit(v, e);
    delete svgs[key];
    delete svgs[`${key}#detail`];
    Object.assign(svgs, drawView(v, lang, snap.__theme));
    for (const a of Object.values(acts)) if (a.viewKeys.includes(key)) editedActs.add(a);
  }
  for (const a of editedActs) {
    a.rows = a.viewKeys.reduce((n, k) => n + views[k].rows.length, 0);
    a.cust = a.viewKeys.reduce((n, k) => n + views[k].cust.length, 0);
    if (a.status !== 'blocked') a.status = a.cust ? 'custom' : a.rows ? 'standard' : 'empty';
  }

  const rules = loadRules(join(ROOT, 'configs', module, 'config-checks.json'));
  const checks = attachActivities(runChecks(snap, rules, (a) => (acts[a.id] ? acts[a.id].viewKeys.map((k) => ({ tables: [views[k].root] })) : []), lang), rules, acts);

  // Column meanings (reviewed, or from the knowledge base) and SAP F1 text for the columns that show values.
  const meanings = loadFieldMeanings(dir, lang);
  const fields = {};
  // The values a column can take, with SAP's text: the domain's fixed values, else the
  // keys of its check table with the text of the table (or its text table) when the
  // snapshot holds it — "BSTAR: 1 = unrestricted, 2 = quality inspection …".
  const deInfo = {};
  for (const t of Object.values(snap.tables)) for (const f of t.fields) if (f.rollname && !deInfo[f.rollname]) deInfo[f.rollname] = { dom: f.domname, check: f.checktable, name: f.name };
  const textTables = {};
  for (const [name, t] of Object.entries(snap.tables)) {
    const keys = t.fields.filter((f) => f.key && f.type !== 'CLNT' && f.type !== 'LANG');
    const txt = t.fields.find((f) => !f.key && f.type === 'CHAR' && f.leng >= 10);
    if (keys.length === 1 && txt && t.rows.length) (textTables[keys[0].domname || keys[0].name] ??= []).push({ name, key: keys[0].name, txt: txt.name, lang: t.fields.find((f) => f.key && f.type === 'LANG')?.name });
  }
  const VALUE_CAP = 60;
  const valueList = (de) => {
    const i = deInfo[de];
    if (!i) return null;
    const fixed = i.dom && snap.domains?.[i.dom];
    if (fixed && Object.keys(fixed).length) return Object.entries(fixed).slice(0, VALUE_CAP).map(([k, t]) => [k, t]);
    if (!i.check) return null;
    const cands = (textTables[i.dom] || textTables[i.name] || []).sort((a, b) => (b.name === i.check) - (a.name === i.check) || (b.name.startsWith(i.check)) - (a.name.startsWith(i.check)));
    const tt = cands[0];
    if (!tt) return null;
    const out = new Map();
    const rank = (r) => (!tt.lang ? 1 : r[tt.lang] === ({ ko: '3', en: 'E', ja: 'J', de: 'D', zh: '1' }[lang] || 'E') ? 3 : r[tt.lang] === 'E' ? 2 : 0);
    const best = new Map();
    for (const r of snap.tables[tt.name].rows) {
      const k = show(r[tt.key]);
      if (!rank(r) || (best.get(k) || 0) >= rank(r)) continue;
      best.set(k, rank(r));
      out.set(k, String(r[tt.txt] ?? ''));
    }
    return out.size ? [...out].sort((a, b) => a[0].localeCompare(b[0])).slice(0, VALUE_CAP) : null;
  };
  for (const v of Object.values(views)) if (v.rows.length) for (const c of v.cols) {
    if (!c.de || fields[c.de]) continue;
    const m = meanings[c.de] || '', f1 = (snap.fieldDocs?.[c.de]?.text || '').slice(0, 600);
    const v = valueList(c.de);
    if (m || f1 || v) fields[c.de] = { m, f1, ...(v ? { v } : {}) };
  }
  const data = {
    fields,
    meta: snap.meta, lang, tree: snap.tree, acts, views, checks,
    transports: snap.transports, domains: snap.domains, docs: snap.docs, badiImpls: snap.badiImpls || {}, badiErrors: snap.badiErrors || {}, badiSrc: badiSrcOf(snap.badiSources || {}), badiNotes: loadBadiNotes(dir),
    notes: withCaseDiagrams({ ...loadNotes(dir, { module, lang }), ...structuredClone(edits.edits) }, lang),
    edits,
  };
  const ver = nextVersion(dir, `${module}-config`);
  const out = o.out || join(dir, `${module}-config-v${ver}-${lang}.html`);
  atomicWriteFileSync(out, pageHtml(data, svgs));
  const counts = Object.values(acts).reduce((m, a) => ((m[a.status] = (m[a.status] || 0) + 1), m), {});
  const notes = Object.values(data.notes).reduce((m, n) => ((m[n.review] = (m[n.review] || 0) + 1), m), {});
  process.stdout.write(JSON.stringify({ ok: true, file: out, activities: Object.keys(acts).length, status: counts, checks: checks.filter((c) => c.items.length).length, notes, edited: Object.keys(edits.edits).length, editedViews: Object.keys(edits.views).length, ...(imported != null ? { imported } : {}) }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { process.stderr.write(`[config-doc] failed: ${e?.stack || e}\n`); process.exit(1); });
}
