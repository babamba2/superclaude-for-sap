#!/usr/bin/env node
// sc4sap:graph — TCode / job usage measured on ANOTHER system (QA, PRD), submitted by the user as a file.
//
// The live tools (GetTcodeUsage / GetJobUsage) only see the connected system. On a DEV profile that is
// developer testing, not business use. This script takes whatever the user exported or pasted
// (ST03N transaction profile → spreadsheet / local file, SM37 list, or one name per line), keeps the
// names that are members of the package, and writes the `tcodes` (or `jobs`) side of usage.json.
//
//   node import-usage.mjs --dir <inventory dir> --file <export> --system <SID> [--months 12] [--kind tcodes|jobs]
//
// Formats: .xlsx (cell text), any text (.txt / .csv / .tsv / unconverted list). Names are matched
// case-insensitively against walk.json → objects[] (TRAN for tcodes, PROG for jobs); everything else
// in the file (column headers, numbers, other packages' TCodes) is ignored. Every member NOT in the
// file is written false — the file is taken as the complete list of used names for the window.
// Prints one JSON line { kind, members, used, notInPackage, usageJson }.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipEntries } from '../spec/xlsx-zip.mjs';

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => XML_ENT[e]);

/** All cell text of an .xlsx workbook (shared strings + inline strings + cached values). */
export function xlsxText(buf) {
  const parts = [];
  for (const { name, data } of unzipEntries(buf)) {
    if (name !== 'xl/sharedStrings.xml' && !/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    const xml = data.toString('utf8');
    for (const m of xml.matchAll(/<(t|v)(?:\s[^>]*)?>([^<]*)<\/\1>/g)) parts.push(unxml(m[2]));
  }
  return parts.join('\n');
}

/** Upper-case name tokens of a text: letters, digits, _ and /namespace/. */
export function nameTokens(text) {
  return new Set((text.toUpperCase().match(/[A-Z0-9_/]{2,40}/g) || []).map((t) => t.replace(/^\/+$/, '')).filter(Boolean));
}

export function importUsage({ walk, text, kind = 'tcodes', system, months = 12, file, today = new Date().toISOString().slice(0, 10) }) {
  const type = kind === 'jobs' ? 'PROG' : 'TRAN';
  const members = [...new Set((walk.objects || []).filter((o) => o.type === type).map((o) => o.name.toUpperCase()))].sort();
  const tokens = nameTokens(text);
  const result = Object.fromEntries(members.map((n) => [n, tokens.has(n)]));
  const used = members.filter((n) => result[n]);
  // Z/Y names in the file that are not package members — shown so a wrong file or package is noticed
  const notInPackage = [...tokens].filter((t) => /^[ZY]/.test(t) && !result.hasOwnProperty(t)).sort();
  const side = {
    months,
    coverage: months,
    result,
    source: { system, file: file ? basename(file) : null, importedAt: today, kind: 'user-file' },
  };
  if (kind === 'jobs') side.complete = true;
  return { side, members: members.length, used, notInPackage };
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) a[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.dir || !a.file || !a.system)
    throw new Error('usage: import-usage.mjs --dir <inventory dir> --file <export> --system <SID> [--months 12] [--kind tcodes|jobs]');
  const kind = a.kind === 'jobs' ? 'jobs' : 'tcodes';
  const months = Number(a.months || 12);
  if (!Number.isInteger(months) || months < 1 || months > 36) throw new Error(`--months must be 1-36, got ${a.months}`);
  const dir = resolve(a.dir);
  const walkPath = join(dir, 'walk.json');
  if (!existsSync(walkPath)) throw new Error(`walk.json not found in ${dir}`);
  const buf = readFileSync(a.file);
  const text = extname(a.file).toLowerCase() === '.xlsx' ? xlsxText(buf) : buf.toString('utf8');
  const r = importUsage({ walk: JSON.parse(readFileSync(walkPath, 'utf8')), text, kind, system: a.system, months, file: a.file });
  if (!r.used.length) {
    console.error(`import-usage: none of the ${r.members} package ${kind === 'jobs' ? 'programs' : 'TCodes'} occurs in ${a.file} — wrong file or package? usage.json not changed`);
    process.exit(2);
  }
  const usagePath = join(dir, 'usage.json');
  const prev = existsSync(usagePath) ? JSON.parse(readFileSync(usagePath, 'utf8')) : {};
  const next = { ...prev, measuredAt: r.side.source.importedAt, [kind]: r.side };
  if (!prev.system) next.system = a.system;
  writeFileSync(usagePath, `${JSON.stringify(next, null, 1)}\n`);
  console.log(JSON.stringify({ kind, members: r.members, used: r.used.length, notInPackage: r.notInPackage.length, usageJson: usagePath }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`import-usage: ${e.message}`);
    process.exit(1);
  }
}
