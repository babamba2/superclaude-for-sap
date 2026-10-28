// sc4sap:module-to-process — read a customer BPH / BPML workbook and reconcile it with the process model.
//
//   node bph-import.mjs read <bph.xlsx> [--sheet NAME] --out <bph-skeleton.json>
//   node bph-import.mjs reconcile <process-model.json> <bph-skeleton.json> [--sheet NAME] [--write]
//
// read: finds the header row of each sheet (cells like "L1 ID", "L2 Desc.(KO)", "L4 ID", "Variant ID",
// "Variant Desc", "System", "Remark"), forward-fills the hierarchy columns (merged cells leave them
// blank), fixes float artefacts in numeric IDs (8.1999999999999993 → 8.2) and writes
//   { source, sheets: [{ name, columns, rows: [{ id, level, label, labelAlt?, system?, remark?, variants: [{ id, label }] }] }] }
// reconcile: matches model L4 rows to BPH L4 rows by label similarity (character bigrams without action words, 0.75 task + 0.25 L3 context, ≥ 0.4) and
// returns { source, sheet, matched: [{ code, bph, score }], bphOnly: [...], modelOnly: [...] };
// --write stores it as model.reconcile (shown in the page appendix).
// The workbook is the customer's own document: its IDs may appear in the customer's page, never in the plugin.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipEntries } from '../spec/xlsx-zip.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const unxml = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
const colNo = (ref) => [...String(ref).replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** All sheets as arrays of row arrays (cell text). Shared strings, inline strings and numbers. */
export function readXlsx(buf) {
  const files = new Map(unzipEntries(buf).map(e => [e.name, e.data.toString('utf8')]));
  const shared = [];
  const ss = files.get('xl/sharedStrings.xml') || '';
  for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unxml([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
  const wb = files.get('xl/workbook.xml') || '';
  const rels = files.get('xl/_rels/workbook.xml.rels') || '';
  const relMap = new Map([...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map(m => [m[1], m[2]]));
  const sheets = [];
  for (const sh of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const target = (relMap.get(sh[2]) || '').replace(/^\//, '');
    const xml = files.get(target.startsWith('xl/') ? target : `xl/${target}`) || '';
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*?(?:r="(\d+)")?[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells = [];
      for (const c of r[2].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /r="([A-Z]+\d+)"/.exec(c[1])?.[1];
        const t = /t="([^"]+)"/.exec(c[1])?.[1];
        const body = c[2] || '';
        const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let text = '';
        if (t === 's' && v != null) text = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') text = unxml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
        else if (v != null) text = unxml(v);
        cells[ref ? colNo(ref) : cells.length] = text.replace(/\r?\n/g, ' ').trim();
      }
      rows[Number(r[1] || rows.length + 1) - 1] = cells;
    }
    sheets.push({ name: unxml(sh[1]), rows: rows.map(r => arr(r).map(x => x ?? '')) });
  }
  return sheets;
}

/** "8.1999999999999993" → "8.2"; "8.1.2.2" stays; numbers with ≤ 4 decimals kept as written. */
export function fixId(id) {
  const s = String(id ?? '').trim();
  if (!/^\d+\.\d{6,}$/.test(s)) return s;
  return String(Math.round(Number(s) * 10000) / 10000);
}

const HEAD = [
  [/^L([1-4])\s*ID$/i, (m) => ({ key: 'id', level: Number(m[1]) })],
  [/^L([1-4])\s*(?:Desc\.?|Name|명|설명)\s*\(?\s*(KO|KR|EN|JA)?\s*\)?$/i, (m) => ({ key: 'label', level: Number(m[1]), lang: (m[2] || '').toLowerCase().replace('kr', 'ko') })],
  [/^Variant\s*ID$/i, () => ({ key: 'vid' })],
  [/^Variant\s*(?:Desc\.?|Name|명)/i, () => ({ key: 'vlabel' })],
  [/System/i, () => ({ key: 'system' })],
  [/^(?:Remark|비고|Note)/i, () => ({ key: 'remark' })],
];

/** Header row (the first row naming at least an L-level ID and its description) and its column map. */
export function detectColumns(rows) {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cols = [];
    arr(rows[i]).forEach((cell, c) => {
      for (const [re, f] of HEAD) { const m = re.exec(String(cell).trim()); if (m) { cols.push({ col: c, ...f(m) }); break; } }
    });
    if (cols.some(x => x.key === 'id') && cols.some(x => x.key === 'label')) return { headerRow: i, cols };
  }
  return null;
}

/** BPH rows with forward-filled hierarchy; one entry per distinct ID, variants under their L4. */
export function parseBph(sheet, { lang = 'ko' } = {}) {
  const det = detectColumns(sheet.rows);
  if (!det) return null;
  const idCol = (lv) => det.cols.find(c => c.key === 'id' && c.level === lv)?.col;
  const labelCol = (lv, want) => (det.cols.find(c => c.key === 'label' && c.level === lv && c.lang === want) || det.cols.find(c => c.key === 'label' && c.level === lv))?.col;
  const altCol = (lv, main) => det.cols.find(c => c.key === 'label' && c.level === lv && c.col !== main)?.col;
  const one = (k) => det.cols.find(c => c.key === k)?.col;
  const out = [];
  const seen = new Map();
  const cur = {};
  for (const r of sheet.rows.slice(det.headerRow + 1)) {
    if (!r || !r.some(x => String(x).trim())) continue;
    for (let lv = 1; lv <= 4; lv++) {
      const c = idCol(lv);
      const id = c == null ? '' : fixId(r[c]);
      if (id && id !== cur[lv]?.id) {
        const lc = labelCol(lv, lang);
        cur[lv] = { id, level: lv, label: lc == null ? '' : r[lc] || '', labelAlt: altCol(lv, lc) == null ? '' : r[altCol(lv, lc)] || '' };
        for (let d = lv + 1; d <= 4; d++) delete cur[d];
        if (!seen.has(id)) {
          const e = { ...cur[lv], variants: [] };
          if (lv === 4) { if (one('system') != null && r[one('system')]) e.system = r[one('system')]; if (one('remark') != null && r[one('remark')]) e.remark = r[one('remark')]; }
          seen.set(id, e); out.push(e);
        }
      }
    }
    const vid = one('vid') == null ? '' : r[one('vid')];
    if (vid && cur[4] && seen.get(cur[4].id)) seen.get(cur[4].id).variants.push({ id: vid, label: one('vlabel') == null ? '' : r[one('vlabel')] || '' });
  }
  return { name: sheet.name, columns: det.cols, rows: out.filter(e => e.label || e.level === 4) };
}

// Action words every task shares ("create / change", "생성/변경") would match unrelated tasks; they are dropped.
const STOP = /(생성|변경|삭제|관리|처리|조회|등록|작성|수립|create|change|delete|display|manage(?:ment)?|process(?:ing)?|maintain|maintenance)/giu;
const bigrams = (s) => {
  const t = String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(STOP, ' ').replace(/[^\p{L}\p{N}]+/gu, '');
  const g = new Set();
  for (let i = 0; i < t.length - 1; i++) g.add(t.slice(i, i + 2));
  if (t.length === 1) g.add(t);
  return g;
};
export function similarity(a, b) {
  const x = bigrams(a), y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let n = 0; for (const g of x) if (y.has(g)) n++;
  return (2 * n) / (x.size + y.size);
}

/** Model L4 ↔ BPH L4 by best label similarity (greedy, highest scores first). */
export function reconcile(model, sheet, { min = 0.4 } = {}) {
  const tasks = arr(model.rows).filter(r => r.level === 4);
  const bph = arr(sheet.rows).filter(r => r.level === 4);
  const parentOf = (rows, key, lvl) => (r) => { const p = rows.find(x => x.level === 3 && String(r[key]).startsWith(`${x[key]}.`)); return p ? p.label : ''; };
  const mParent = parentOf(arr(model.rows), 'code'), bParent = parentOf(arr(sheet.rows), 'id');
  const pairs = [];
  for (const t of tasks) for (const b of bph) {
    // the task label decides; the L3 labels add context (0.25) so "create" under different processes separates
    const own = Math.max(similarity(t.label, b.label), similarity(t.label, b.labelAlt));
    const s = 0.75 * own + 0.25 * similarity(mParent(t), bParent(b));
    if (s >= min) pairs.push({ code: t.code, id: b.id, s });
  }
  pairs.sort((a, b) => b.s - a.s);
  const usedT = new Set(), usedB = new Set(), matched = [];
  for (const p of pairs) {
    if (usedT.has(p.code) || usedB.has(p.id)) continue;
    usedT.add(p.code); usedB.add(p.id);
    const b = bph.find(x => x.id === p.id);
    matched.push({ code: p.code, label: tasks.find(t => t.code === p.code).label, bph: p.id, bphLabel: b.label, score: Math.round(p.s * 100) / 100 });
  }
  return {
    sheet: sheet.name,
    matched: matched.sort((a, b) => (a.code < b.code ? -1 : 1)),
    bphOnly: bph.filter(b => !usedB.has(b.id)).map(b => ({ bph: b.id, bphLabel: b.label, system: b.system || '' })),
    modelOnly: tasks.filter(t => !usedT.has(t.code)).map(t => ({ code: t.code, label: t.label, kind: t.kind || '' })),
  };
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const [cmd, a, b, ...rest] = process.argv.slice(2);
  const args = [a, b, ...rest];
  const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  try {
    if (cmd === 'read' && a) {
      const sheets = readXlsx(readFileSync(a)).filter(s => !get('--sheet') || s.name === get('--sheet')).map(s => parseBph(s)).filter(Boolean);
      if (!sheets.length) throw new Error('no sheet with a BPH header (L1 ID / L1 Desc …) found');
      const res = { source: basename(a), sheets };
      writeFileSync(get('--out') || 'bph-skeleton.json', `${JSON.stringify(res, null, 2)}\n`, 'utf8');
      console.log(JSON.stringify({ out: resolve(get('--out') || 'bph-skeleton.json'), sheets: sheets.map(s => ({ name: s.name, rows: s.rows.length, l4: s.rows.filter(r => r.level === 4).length })) }));
    } else if (cmd === 'reconcile' && a && b) {
      const model = JSON.parse(readFileSync(a, 'utf8'));
      const sk = JSON.parse(readFileSync(b, 'utf8'));
      const sheet = sk.sheets.find(s => s.name === get('--sheet')) || sk.sheets.find(s => s.name.toUpperCase() === String(model.module).toUpperCase()) || sk.sheets[0];
      const res = { source: sk.source, ...reconcile(model, sheet) };
      if (args.includes('--write')) { model.reconcile = res; writeFileSync(a, `${JSON.stringify(model, null, 2)}\n`, 'utf8'); }
      console.log(JSON.stringify({ sheet: res.sheet, matched: res.matched.length, bphOnly: res.bphOnly.length, modelOnly: res.modelOnly.length, written: args.includes('--write') }));
    } else {
      console.error('Usage: node bph-import.mjs read <bph.xlsx> [--sheet NAME] --out <skeleton.json>\n       node bph-import.mjs reconcile <process-model.json> <skeleton.json> [--sheet NAME] [--write]');
      process.exit(2);
    }
  } catch (e) {
    console.error(`bph-import: ${e.message}`);
    process.exit(1);
  }
}
