#!/usr/bin/env node
// config-to-document — build the HTML document from a snapshot.
//
// Usage:
//   node scripts/config/build-config-doc.mjs --module MM [--snapshot <file>] [--lang ko] [--out <file>]
//
// Reads <artifactBase>/config-docs/<MODULE>/snapshot.json (extract-config.mjs),
// runs the module's check rules, draws an SM30-style overview (and a detail
// screen for wide views) with the real values through the shared screen
// renderer, and writes one self-contained HTML file next to the snapshot:
// <MODULE>-config-v<n>-<lang>.html.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { renderAlvScreenSVG, renderProcessFlowHorizontalSVG } from '../spec/screen-image-renderer.mjs';
import { resolveArtifactBase, readScreenTheme, readActiveSapEnv } from '../lib/profile-resolve.mjs';
import { atomicWriteFileSync } from '../lib/atomic-write.mjs';
import { loadRules, runChecks, attachActivities } from './config-checks.mjs';
import { pageHtml } from './config-doc-page.mjs';
import { loadNotes, loadTerms } from './notes.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOCK_COLS = 8;
const MOCK_ROWS = 5;
const TABLE_COLS = 30;
const FLAG_DOMAINS = /^(XFELD|FLAG|XFLAG|BOOLE|BOOLEAN|BOOLE_D|CHAR1_X)$/;

function args(argv) {
  const o = { module: '', snapshot: '', lang: '', out: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--module') o.module = String(argv[++i]).toUpperCase();
    else if (a === '--snapshot') o.snapshot = argv[++i];
    else if (a === '--lang') o.lang = argv[++i];
    else if (a === '--out') o.out = argv[++i];
  }
  if (!o.module && !o.snapshot) throw new Error('--module or --snapshot is required');
  return o;
}

const T = {
  ko: { overview: (t) => `보기 "${t}" 변경: 개요`, detail: (t) => `보기 "${t}" 변경: 세부사항`, newEntries: '새 항목', nr: (o) => `번호 범위 간격 유지보수: ${o}`, interval: '간격' },
  en: { overview: (t) => `Change View "${t}": Overview`, detail: (t) => `Change View "${t}": Details`, newEntries: 'New Entries', nr: (o) => `Maintain Number Range Intervals: ${o}`, interval: 'Interval' },
};

const show = (v) => (v === true ? 'X' : v === false || v == null ? '' : String(v));

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
    const keep = def.rows.map((r, i) => i).filter((i) => conds.every((c) => c.table !== root || show(def.rows[i][c.field]) === c.value));
    const src = keep.map((i) => def.rows[i]);
    const rows = src.map((r) => {
      const sec = {};
      return cols.map((c) => {
        if (c.table === root) return show(r[c.tabField]);
        sec[c.table] ??= secondaryRow(c.table, r);
        return show(sec[c.table]?.[c.tabField]);
      });
    });
    const cust = src.map((r, i) => (r._tr ? i : -1)).filter((i) => i >= 0);
    const trOf = Object.fromEntries(cust.map((i) => [i, src[i]._tr]));
    views[key] = {
      key, title, root, cols: cols.map((c) => ({ name: c.field, label: c.label, key: c.key, dom: c.dom })),
      rows, cust, trOf, truncated: def.truncated, error: def.error || '', tableTitle: def.title,
      history: def.transports, historyTruncated: def.historyTruncated,
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
      return { field: f.field, table: f.table, tabField: f.tabField, key: f.key, dom: d?.domname || '', label: label(snap.labels[f.rollname] ? f.rollname : d?.rollname, f.field) };
    });
    return addView(name, title || v.title, root, cols, conds);
  };
  const tableModel = (name, title) => {
    const def = snap.tables[name];
    if (!def) return null;
    const cols = def.fields.filter((f) => f.type !== 'CLNT').slice(0, TABLE_COLS)
      .map((f) => ({ field: f.name, table: name, tabField: f.name, key: f.key, dom: f.domname, label: label(f.rollname, f.name) }));
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
    const cust = nr.rows.map((r, i) => (r._tr ? i : -1)).filter((i) => i >= 0);
    views[key] = {
      key, title: nr.title || obj, root: 'NRIV', tableTitle: obj, nr: true,
      cols: NR_FIELDS.map((f, i) => ({ name: f, label: names[i], key: i < 3, dom: '' })),
      rows, cust, trOf: Object.fromEntries(cust.map((i) => [i, nr.rows[i]._tr])), truncated: false, error: '', history: nr.transports,
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
    acts[id] = { id, title: a.title || a.titleEn || id, titleEn: a.titleEn, tcode: a.tcode, objects: objs, viewKeys: keys, tables: [...new Set(tablesOf(objs))], rows, cust, status, docuId: a.docuId };
  }

  // SM30 screens drawn with the real values: overview grid, plus a detail
  // screen of one row when the view is wider than the grid shows.
  const theme = snap.__theme;
  const svgs = {};
  for (const v of drawScreens ? Object.values(views) : []) {
    if (!v.rows.length) continue;
    const order = [...v.cust, ...v.rows.map((_, i) => i).filter((i) => !v.cust.includes(i))].slice(0, MOCK_ROWS);
    const cols = v.cols.slice(0, MOCK_COLS).map((c, i) => ({ name: `c${i}`, header: c.label }));
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
  }
  return { views, acts, svgs };
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

  const rules = loadRules(join(ROOT, 'configs', module, 'config-checks.json'));
  const checks = attachActivities(runChecks(snap, rules, (a) => (acts[a.id] ? acts[a.id].viewKeys.map((k) => ({ tables: [views[k].root] })) : []), lang), rules, acts);

  const data = {
    meta: snap.meta, lang, tree: snap.tree, acts, views, checks,
    transports: snap.transports, domains: snap.domains, docs: snap.docs,
    notes: withCaseDiagrams(loadNotes(dir), lang),
  };
  const ver = nextVersion(dir, `${module}-config`);
  const out = o.out || join(dir, `${module}-config-v${ver}-${lang}.html`);
  atomicWriteFileSync(out, pageHtml(data, svgs));
  const counts = Object.values(acts).reduce((m, a) => ((m[a.status] = (m[a.status] || 0) + 1), m), {});
  const notes = Object.values(data.notes).reduce((m, n) => ((m[n.review] = (m[n.review] || 0) + 1), m), {});
  process.stdout.write(JSON.stringify({ ok: true, file: out, activities: Object.keys(acts).length, status: counts, checks: checks.filter((c) => c.items.length).length, notes }) + '\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { process.stderr.write(`[config-doc] failed: ${e?.stack || e}\n`); process.exit(1); });
}
