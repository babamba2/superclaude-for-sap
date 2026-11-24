#!/usr/bin/env node
// sc4sap:graph — batch plans for stock-cbo Step G1 / G1b / G3a, run by scripts/lib/sap-batch.mjs on the
// main thread instead of sap-checker fan-out (no names or SQL pass through the model).
//
//   node fetch-plan.mjs --sources <walk.json> [--skip-present <SRC>] --out <plan.json>   G1: GetProgFullCode per PROG / FUGR member
//   node fetch-plan.mjs --orphans <orphans.json>       --out <plan.json>   G1b: GetInclude per orphan include
//   node fetch-plan.mjs --ddic <ddic-plan.json> [--from n --to m] --out <plan.json>   G3a: the DD statements
//
// Every call reads with output "file"; sap-batch prints one line per call (OK + folder / ERROR + message).
// <orphans.json> is the stdout of `build-package-graph.mjs --orphans` ({ orphans: [names], alreadyRead }).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, ''));

/** G1: one GetProgFullCode per PROG (main programs, not PROG/I includes) and FUGR member */
export function sourceCalls(walk, skipPresent) {
  const calls = [];
  const seen = new Set();
  for (const o of walk.objects || []) {
    const full = String(o.type || '').toUpperCase();
    if (full === 'PROG/I') continue;
    const type = full.split('/')[0];
    if (type !== 'PROG' && type !== 'FUGR') continue;
    const name = String(o.name).toUpperCase();
    if (seen.has(`${type}:${name}`)) continue;
    // --skip-present <SRC>: the member folder is already there (cbo-relation-map, module-to-process reruns)
    if (skipPresent && existsSync(join(skipPresent, `${name.toLowerCase()}.${type.toLowerCase()}`))) continue;
    seen.add(`${type}:${name}`);
    calls.push({ id: name, tool: 'GetProgFullCode', args: { name, type: type === 'PROG' ? 'PROG/P' : 'FUGR', output: 'file' }, pick: 'folder' });
  }
  return calls;
}

/** G1b: one GetInclude per orphan include */
export function orphanCalls(orphans) {
  const names = Array.isArray(orphans) ? orphans : orphans.orphans || [];
  return [...new Set(names.map((n) => String(n).toUpperCase()))].map((name) => ({
    id: name, tool: 'GetInclude', args: { include_name: name, output: 'file' }, pick: 'path',
  }));
}

/** G3a: the DD statements of ddic-plan.json, entries from–to (1-based, inclusive) */
export function ddicCalls(plan, from = 1, to = plan.length) {
  return plan.slice(from - 1, to).map((e) => ({
    id: e.id, tool: 'GetSqlQuery', args: { sql_query: e.sql, row_number: e.row_number, output: 'file' }, pick: 'rows',
  }));
}

function main(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (['--sources', '--orphans', '--ddic', '--out', '--from', '--to', '--skip-present'].includes(k)) a[k.slice(2)] = argv[++i];
  }
  if (!a.out || [a.sources, a.orphans, a.ddic].filter(Boolean).length !== 1) {
    throw new Error('usage: fetch-plan.mjs (--sources <walk.json> [--skip-present <SRC>] | --orphans <orphans.json> | --ddic <ddic-plan.json> [--from n --to m]) --out <plan.json>');
  }
  let calls;
  if (a.sources) calls = sourceCalls(readJson(a.sources), a['skip-present']);
  else if (a.orphans) calls = orphanCalls(readJson(a.orphans));
  else {
    const plan = readJson(a.ddic);
    calls = ddicCalls(plan, Number(a.from || 1), Number(a.to || plan.length));
  }
  writeFileSync(a.out, `${JSON.stringify({ calls }, null, 1)}\n`);
  process.stdout.write(`${JSON.stringify({ plan: a.out, calls: calls.length })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    main(process.argv);
  } catch (e) {
    process.stderr.write(`fetch-plan: ${e.message}\n`);
    process.exit(1);
  }
}
