#!/usr/bin/env node
// Supplement an existing process model with newly placed entries (module-to-process, workflow-menu.md § Supplement mode).
//
//   node supplement-model.mjs --model <process-model.json> --supp <supplement.json> [--supp …]
//                             [--entries <list.txt>] [--out <file>] [--check]
//
// A supplement (one analyst part) holds:
//   new_l2    [{ key, label, desc? }]                         — under the L1 row
//   new_l3    [{ key, parent, label, desc? }]                 — parent = existing L2 code or a new_l2 key
//   new_tasks [{ key, parent, label, desc?, kind, system, owner, ownerEstimated?, usage?, tcodes?, objects?, variants?, task }]
//   row_patches [{ code, patch?: {tcodes_add, objects_add, …}, task_add?: {rules, objects, interfaces, links, conversion, tbd} }]
//   placements [{ entry, to }]   — every entry: an existing L4 code or a new_tasks key
//   unplaced [{ entry, reason }], lanes_added, systems_added, cross_module, open_questions
// New rows get the next free child number of their parent and are inserted after the parent's last descendant.
// --entries: space-separated entry list of the part; every entry must appear in placements or unplaced.
// The model is backed up once to <model>.bak-supp. Prints {added, patched, keys}.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRowPatch } from './assemble-model.mjs';

const arr = (v) => (Array.isArray(v) ? v : []);
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8').replace(/^﻿/, ''));
const uniq = (a) => [...new Set(a)];
const TASK_LISTS = ['rules', 'objects', 'interfaces', 'links', 'conversion', 'tbd', 'exits'];

function insertChild(rows, parentCode, row) {
  const pre = `${parentCode}.`;
  const kids = rows.filter((r) => r.code.startsWith(pre) && r.level === row.level);
  const next = kids.reduce((n, r) => Math.max(n, Number(r.code.slice(pre.length).split('.')[0]) || 0), 0) + 1;
  row.code = `${parentCode}.${next}`;
  let at = rows.findIndex((r) => r.code === parentCode);
  if (at < 0) throw new Error(`parent ${parentCode} not found`);
  while (at + 1 < rows.length && rows[at + 1].code.startsWith(pre)) at++;
  rows.splice(at + 1, 0, row);
  return row.code;
}

/** Apply supplements to the model in place. Returns {added, patched, keys, errors}. */
export function supplementModel(model, supps, entryLists = []) {
  const rows = model.rows;
  const errors = [];
  const keys = {};
  const byCode = () => new Map(rows.map((r) => [r.code, r]));
  const l1 = rows.find((r) => r.level === 1)?.code;
  const resolveParent = (p, level) => {
    const code = keys[p] ?? p;
    const r = byCode().get(code);
    if (!r) errors.push(`parent "${p}" not found`);
    else if (r.level !== level - 1) errors.push(`parent "${p}" is level ${r.level}, expected ${level - 1}`);
    return r ? code : null;
  };
  let added = 0;
  let patched = 0;
  model.openQuestions ||= [];
  model.crossModule ||= [];
  for (const s of supps) {
    for (const l of arr(s.lanes_added)) if (l?.id && !model.lanes.some((x) => x.id === l.id)) model.lanes.push(l);
    for (const y of arr(s.systems_added)) if (y?.id && !model.scope.systems.some((x) => x.id === y.id)) model.scope.systems.push(y);
    for (const n of arr(s.new_l2)) {
      if (!l1) { errors.push('model has no L1 row'); break; }
      keys[n.key] = insertChild(rows, l1, { code: '', level: 2, label: n.label, ...(n.desc ? { desc: n.desc } : {}) });
      added++;
    }
    for (const n of arr(s.new_l3)) {
      const p = resolveParent(n.parent, 3);
      if (!p) continue;
      keys[n.key] = insertChild(rows, p, { code: '', level: 3, label: n.label, ...(n.desc ? { desc: n.desc } : {}) });
      added++;
    }
    for (const n of arr(s.new_tasks)) {
      const p = resolveParent(n.parent, 4);
      if (!p) continue;
      const { key, parent, ...row } = n;
      row.level = 4;
      row.tcodes = uniq(arr(row.tcodes));
      row.objects = uniq(arr(row.objects));
      keys[key] = insertChild(rows, p, { code: '', ...row });
      added++;
    }
    const map = byCode();
    for (const rp of arr(s.row_patches)) {
      const r = map.get(keys[rp.code] ?? rp.code);
      if (!r) { errors.push(`row_patches: ${rp.code} not found`); continue; }
      if (rp.patch) applyRowPatch(r, rp.patch, model.openQuestions);
      if (rp.task_add) {
        r.task ||= {};
        for (const k of TASK_LISTS) if (arr(rp.task_add[k]).length) r.task[k] = [...arr(r.task[k]), ...rp.task_add[k]];
      }
      patched++;
    }
    for (const p of arr(s.placements)) {
      const r = map.get(keys[p.to] ?? p.to);
      if (!r) errors.push(`placement ${p.entry}: target ${p.to} not found`);
      else if (r.level !== 4) errors.push(`placement ${p.entry}: target ${p.to} is not an L4`);
    }
    if (s.overview?.summary && !model.overview?.summary) model.overview = { ...(model.overview || {}), summary: s.overview.summary };
    model.crossModule.push(...arr(s.cross_module));
    model.openQuestions.push(...arr(s.open_questions));
  }
  // every entry of a part placed once
  const placed = new Set(supps.flatMap((s) => [...arr(s.placements), ...arr(s.unplaced)].map((p) => String(p.entry).toUpperCase())));
  for (const e of entryLists.flat()) if (!placed.has(e.toUpperCase())) errors.push(`entry ${e} neither placed nor unplaced`);
  return { added, patched, keys, errors };
}

function main() {
  const argv = process.argv.slice(2);
  const a = { supp: [], entries: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--check') a.check = true;
    else if (k === '--supp' || k === '--entries') a[k.slice(2)].push(argv[++i]);
    else if (k.startsWith('--')) a[k.slice(2)] = argv[++i];
  }
  if (!a.model || !a.supp.length) {
    console.error('usage: supplement-model.mjs --model <process-model.json> --supp <file> [--supp …] [--entries <list.txt>] [--out <file>] [--check]');
    process.exit(2);
  }
  const model = readJson(a.model);
  const lists = a.entries.map((f) => readFileSync(f, 'utf8').split(/\s+/).filter(Boolean));
  const res = supplementModel(model, a.supp.map(readJson), lists);
  if (res.errors.length) {
    console.error(`${res.errors.length} error(s):\n  · ${res.errors.join('\n  · ')}`);
    process.exit(1);
  }
  if (!a.check) {
    const out = a.out || a.model;
    if (out === a.model && !existsSync(`${a.model}.bak-supp`)) copyFileSync(a.model, `${a.model}.bak-supp`);
    writeFileSync(out, JSON.stringify(model, null, 1));
  }
  console.log(JSON.stringify({ added: res.added, patched: res.patched, keys: res.keys }));
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) main();
