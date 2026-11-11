#!/usr/bin/env node
// Area menu × usage × process model (module-to-process, see skills/module-to-process/workflow-menu.md).
//
//   node area-menu.mjs --menu <GetAreaMenu.json> [--menu …] --usage <usage.json|used.txt> [--usage …]
//                      [--model <process-model.json>] --out <menu.json> [--apply] [--hints <menu-hints.json>]
//                      [--add-scope <tcodes-all.json>]
//
// --menu       GetAreaMenu result (inline JSON or the file written with output: "file")
// --usage      saved usage list ({system, measuredAt, measured[], used[]}) or a plain used-TCode list (.txt);
//              TCodes in no `measured` list (and in no .txt) count as unmeasured
// --model      process model: every menu TCode is matched to the L4 rows carrying it (row / variant tcodes)
// --other-model process model of another module map (repeatable): a used menu TCode documented there counts as
//              "elsewhere", not as a gap
// --apply      write model.menu + row.menuPaths into the model (backup <model>.bak-menu first)
// --hints      write {tcode: [paths]} for the Step 4 analyst brief
// --add-scope  append menu TCodes missing from tcodes-all.json with packageName "_MENU" (Step 2)
//
// Quadrants: core (menu, used, in model) · gap (menu, used, not in model) · dead (menu, measured, unused)
// · unmeasured (menu, never measured) · offMenu (used model TCodes no menu carries).
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const arr = (v) => (Array.isArray(v) ? v : []);
const SEP = ' > ';

function args(argv) {
  const out = { menu: [], usage: [], 'other-model': [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--menu' || a === '--usage' || a === '--other-model') out[a.slice(2)].push(argv[++i]);
    else if (a.startsWith('--')) out[a.slice(2)] = argv[++i];
  }
  return out;
}

const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));

export function loadUsage(files) {
  const used = new Set();
  const measured = new Set();
  const sources = [];
  for (const f of files) {
    if (/\.txt$/i.test(f)) {
      for (const t of readFileSync(f, 'utf8').split(/\s+/).filter(Boolean)) {
        used.add(t.toUpperCase());
        measured.add(t.toUpperCase());
      }
      sources.push({ file: f });
      continue;
    }
    const j = readJson(f);
    for (const t of arr(j.measured)) measured.add(String(t).toUpperCase());
    for (const t of arr(j.used)) { used.add(String(t).toUpperCase()); measured.add(String(t).toUpperCase()); }
    // usage.json of a scope dir: {tcodes: {result: {TCODE: bool}}}
    for (const [t, v] of Object.entries(j.tcodes?.result ?? {})) {
      measured.add(t.toUpperCase());
      if (v) used.add(t.toUpperCase());
    }
    sources.push({ file: f, system: j.system, measuredAt: j.measuredAt, months: j.months, coverage: j.coverage });
  }
  return { used, measured, sources };
}

/** tcode → L4 row codes (row and variant TCodes). */
export function modelIndex(model) {
  const idx = new Map();
  for (const r of arr(model?.rows)) {
    if (r.level !== 4) continue;
    const tcs = [...arr(r.tcodes), ...arr(r.variants).flatMap((v) => arr(v.tcodes))];
    for (const t of tcs) {
      const k = String(t).toUpperCase();
      if (!idx.has(k)) idx.set(k, []);
      if (!idx.get(k).includes(r.code)) idx.get(k).push(r.code);
    }
  }
  return idx;
}

export function crossMenu(menus, usage, model, others = []) {
  const idx = modelIndex(model);
  const oIdx = others.map((o) => ({ module: o.module, idx: modelIndex(o) }));
  const elsewhere = (t) => oIdx.flatMap((o) => (o.idx.get(t) || []).map((c) => `${o.module} ${c}`));
  const entries = [];
  for (const mres of menus) {
    for (const e of arr(mres.entries)) {
      const t = String(e.tcode).toUpperCase();
      const u = usage.used.has(t) ? 'used' : usage.measured.has(t) ? 'unused' : 'unmeasured';
      const rows = idx.get(t) || [];
      entries.push({ tcode: t, text: e.text || '', path: arr(e.path), menu: e.menu || mres.menu, usage: u, rows, ...(rows.length ? {} : { elsewhere: elsewhere(t) }) });
    }
  }
  const uniq = (xs) => [...new Set(xs)].sort();
  const menuSet = new Set(entries.map((e) => e.tcode));
  const pick = (f) => uniq(entries.filter(f).map((e) => e.tcode));
  const quadrants = {
    core: pick((e) => e.usage === 'used' && e.rows.length),
    gap: pick((e) => e.usage === 'used' && !e.rows.length && !arr(e.elsewhere).length),
    elsewhere: pick((e) => e.usage === 'used' && !e.rows.length && arr(e.elsewhere).length),
    dead: pick((e) => e.usage === 'unused'),
    unmeasured: pick((e) => e.usage === 'unmeasured'),
    offMenu: uniq([...idx.keys()].filter((t) => !menuSet.has(t) && usage.used.has(t))),
  };
  return {
    kind: 'area-menu',
    menus: menus.map((m) => ({ menu: m.menu, title: m.title || '', menusRead: arr(m.menus_read), links: arr(m.links) })),
    usage: usage.sources.map(({ system, measuredAt, months, coverage }) => ({ system, measuredAt, months, coverage })).filter((s) => s.system),
    counts: {
      entries: entries.length,
      tcodes: menuSet.size,
      ...Object.fromEntries(Object.entries(quadrants).map(([k, v]) => [k, v.length])),
    },
    quadrants,
    entries,
  };
}

/** model.menu (compact) + row.menuPaths. Returns the number of rows annotated. */
export function applyToModel(model, result) {
  const paths = new Map();
  for (const e of result.entries) {
    const p = [e.menu, ...e.path].join(SEP);
    for (const code of e.rows) {
      if (!paths.has(code)) paths.set(code, new Set());
      paths.get(code).add(`${p}${SEP}${e.tcode}`);
    }
  }
  let n = 0;
  for (const r of arr(model.rows)) {
    if (r.level !== 4) continue;
    const ps = paths.get(r.code);
    if (ps?.size) { r.menuPaths = [...ps]; n++; } else delete r.menuPaths;
  }
  model.menu = {
    menus: result.menus.map(({ menu, title, menusRead }) => ({ menu, title, menusRead })),
    usage: result.usage,
    counts: result.counts,
    quadrants: { gap: result.quadrants.gap, offMenu: result.quadrants.offMenu },
    entries: result.entries.map((e) => ({ t: e.tcode, x: e.text, p: e.path, m: e.menu, u: e.usage, r: e.rows, ...(arr(e.elsewhere).length ? { o: e.elsewhere } : {}) })),
  };
  return n;
}

function main() {
  const a = args(process.argv.slice(2));
  if (!a.menu.length || !a.out) {
    console.error('usage: area-menu.mjs --menu <GetAreaMenu.json> --usage <file> [--model <model>] --out <menu.json> [--apply] [--hints <file>] [--add-scope <tcodes-all.json>]');
    process.exit(2);
  }
  const menus = a.menu.map(readJson).map((j) => (j.output === 'file' && j.path ? readJson(j.path) : j));
  for (const m of menus) if (!Array.isArray(m.entries)) throw new Error(`${m.menu ?? '?'}: no entries — pass the full GetAreaMenu result`);
  const usage = loadUsage(a.usage);
  const model = a.model ? readJson(a.model) : null;
  const others = a['other-model'].map(readJson);
  const result = crossMenu(menus, usage, model, others);
  writeFileSync(a.out, JSON.stringify(result, null, 1));
  if (a.hints) {
    const hints = {};
    for (const e of result.entries) (hints[e.tcode] ||= []).push([e.menu, ...e.path].join(SEP));
    writeFileSync(a.hints, JSON.stringify(hints, null, 1));
  }
  if (a['add-scope']) {
    const all = readJson(a['add-scope']);
    const have = new Set(all.map((x) => String(x.name ?? x.tcode ?? '').toUpperCase()));
    const add = [...new Set(result.entries.map((e) => e.tcode))].filter((t) => !have.has(t));
    for (const t of add) all.push({ name: t, type: 'TRAN/T', packageName: '_MENU', description: '' });
    writeFileSync(a['add-scope'], JSON.stringify(all, null, 1));
    result.counts.addedToScope = add.length;
  }
  if (a.apply) {
    if (!model) throw new Error('--apply needs --model');
    if (!existsSync(`${a.model}.bak-menu`)) copyFileSync(a.model, `${a.model}.bak-menu`);
    result.counts.rowsAnnotated = applyToModel(model, result);
    writeFileSync(a.model, JSON.stringify(model, null, 1));
  }
  console.log(JSON.stringify(result.counts));
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) main();
