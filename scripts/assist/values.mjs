#!/usr/bin/env node
// Customizing value lists for /sc4sap:assist — the codes a write action asks for (delivery block reason,
// payment block key, document type …) read from the connected system and offered as numbered choices.
//
// The map is the "## Value tables (assistant choices)" section of configs/<M>/spro.md:
//   | Value | System | Table/View | Key field | Filter | Text table | Text field | Text filter | Class | Used by | Description |
// Filter narrows the key read (T685: KVEWE / KAPPL); Text filter narrows the text read when the text table holds
// those fields too (T685T) — empty reads every text of the language and merge drops texts without a key.
// Class = DD02L-CONTFLAG of both tables; only C / G (customizing) is allowed — the same rule as the ECC
// dispatcher's TABLE_READ. Used by = <ACTION.ID>.<param>; the clarify entry of that action carries
// "values": "<Value>". One generic read path: no handler per value set, nothing installed in SAP.
//
// Usage (offline — never calls SAP; the main thread runs the statements with GetSqlQuery output "file"):
//   node scripts/assist/values.mjs list  [--module SD] [--family ECC|S4]
//   node scripts/assist/values.mjs show  <Value | ACTION.ID.param>
//   node scripts/assist/values.mjs plan  <Value | ACTION.ID.param> [--lang KO|3] [--family ECC|S4]
//   node scripts/assist/values.mjs merge <Value | ACTION.ID.param> --keys <result.json> --texts <result.json>
//                                        [--lang KO|3] [--find-file <words.txt>] [--max 30]
//   The user's words never go on the command line (a shell would run $(…) or backticks inside quotes): the
//   caller writes them to a file with its file tool and passes --find-file. The file must sit directly in an MCP
//   output sql folder (<…>/.sc4sap/work/<alias>/mcp-output/sql/<file>); --max is 1–3 digits. Else exit 2.
//
// plan prints { value, statements: [{ role: "keys", sql }, { role: "texts", sql }] }.
// merge reads the two GetSqlQuery results (inline answer saved to a file, or the file of output "file") and
// prints { value, total, shown, choices: [{ n, key, text, textEn }] } — text in the logon language, English
// beside it when it differs (texts maintained in only one language are common), keys without a text kept.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textLangs } from '../graph/ddic-queries.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONFIGS = join(ROOT, 'configs');
const SECTION = /^##\s+Value tables \(assistant choices\)\s*$/i;
const NAME = /^[A-Z][A-Z0-9_\/]{1,29}$/;
const FIELD = /^[A-Z][A-Z0-9_]{0,29}$/;
// Filter: FIELD = 'literal' joined by AND — nothing else reaches the SQL text
const FILTER = /^[A-Z][A-Z0-9_]{0,29} = '[A-Z0-9_ ]{1,20}'( AND [A-Z][A-Z0-9_]{0,29} = '[A-Z0-9_ ]{1,20}')*$/;
const CUSTOMIZING = new Set(['C', 'G']);

/** true when the file sits directly in <…>/.sc4sap/work/<alias>/mcp-output/sql/ (symlinks resolved) */
export function inMcpSqlDir(file) {
  let p = resolve(String(file || ''));
  try { p = realpathSync(p); } catch { /* not there yet: judge the path as given */ }
  return /[\\/]\.sc4sap[\\/]work[\\/][^\\/]+[\\/]mcp-output[\\/]sql[\\/][^\\/]+$/.test(p);
}

const cells = (line) => line.trim().slice(1, -1).split('|').map((c) => c.trim());

/** Value-table rows of one spro.md text */
export function parseValueTables(text, module = '') {
  const rows = [];
  let inSection = false, head = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('## ')) { inSection = SECTION.test(line); head = null; continue; }
    if (!inSection || !line.startsWith('|') || !line.endsWith('|')) continue;
    const c = cells(line);
    if (c.every((x) => x === '' || /^:?-+:?$/.test(x))) continue;
    if (!head) { head = c.map((x) => x.toLowerCase()); continue; }
    const get = (h) => c[head.indexOf(h)] ?? '';
    const strip = (s) => s.replace(/`/g, '').trim();
    rows.push({
      module,
      value: strip(get('value')).toUpperCase(),
      system: strip(get('system')),
      table: strip(get('table/view')).toUpperCase(),
      key: strip(get('key field')).toUpperCase(),
      filter: strip(get('filter')),
      textTable: strip(get('text table')).toUpperCase(),
      textField: strip(get('text field')).toUpperCase(),
      textFilter: strip(get('text filter')),
      class: strip(get('class')).toUpperCase(),
      usedBy: strip(get('used by')).split(/[,\s]+/).filter(Boolean),
      description: get('description'),
    });
  }
  return rows;
}

/** Problems of one map row (empty = fine). Enforces customizing tables only. */
export function rowProblems(r) {
  const p = [];
  if (!/^[A-Z][A-Z0-9_]+$/.test(r.value)) p.push('value id');
  if (!NAME.test(r.table)) p.push('table');
  if (!FIELD.test(r.key)) p.push('key field');
  if (r.filter && !FILTER.test(r.filter)) p.push('filter (only FIELD = \'X\' joined by AND)');
  if (r.textFilter && !FILTER.test(r.textFilter)) p.push('text filter (only FIELD = \'X\' joined by AND)');
  if (r.textTable && (!NAME.test(r.textTable) || !FIELD.test(r.textField))) p.push('text table / field');
  const classes = r.class.split('/').map((x) => x.trim());
  if (!classes.length || !classes.every((x) => CUSTOMIZING.has(x))) p.push(`class ${r.class || '?'} — only customizing tables (C / G)`);
  if (!r.usedBy.length || r.usedBy.some((u) => !/^[A-Z]+\.[A-Z_]+\.[A-Z_]+\.[a-z_]+$/.test(u))) p.push('used by (<ACTION.ID>.<param>)');
  return p;
}

export function loadValueTables(dir = CONFIGS) {
  const out = [];
  for (const m of readdirSync(dir)) {
    const f = join(dir, m, 'spro.md');
    if (existsSync(f)) out.push(...parseValueTables(readFileSync(f, 'utf8'), m));
  }
  return out;
}

const familyOk = (r, family) => !family || !r.system || r.system.toUpperCase().includes(family);

/** a value id or an ACTION.ID.param */
export function findValue(rows, ref, family) {
  const k = String(ref || '').trim();
  const hits = rows.filter((r) => familyOk(r, family) && (r.value === k.toUpperCase() || r.usedBy.includes(k) || r.usedBy.map((u) => u.toUpperCase()).includes(k.toUpperCase())));
  return hits[0] || null;
}

/** the two single-table SELECTs: keys of the value table, texts in the logon language and English */
export function planValue(r, lang) {
  const bad = rowProblems(r);
  if (bad.length) throw new Error(`${r.value}: ${bad.join('; ')}`);
  const statements = [{ role: 'keys', table: r.table, sql: `SELECT ${r.key} FROM ${r.table}${r.filter ? ` WHERE ${r.filter}` : ''}` }];
  if (r.textTable) {
    const langs = textLangs(lang).map((l) => `'${l}'`).join(',');
    statements.push({ role: 'texts', table: r.textTable, sql: `SELECT SPRAS, ${r.key}, ${r.textField} FROM ${r.textTable} WHERE SPRAS IN (${langs})${r.textFilter ? ` AND ${r.textFilter}` : ''}` });
  }
  return { value: r.value, statements };
}

const rowsOf = (file) => {
  const j = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(j) ? j : j.rows || j.data || [];
};

/** numbered choices from the key rows and the text rows */
export function mergeValues(r, keyRows, textRows, { lang, find = '', max = 30 } = {}) {
  const [logon] = textLangs(lang);
  const pick = (row, f) => String(row[f] ?? row[f.toLowerCase()] ?? '').trim();
  const texts = new Map();
  for (const t of textRows) {
    const k = pick(t, r.key), l = pick(t, 'SPRAS').toUpperCase();
    if (!texts.has(k)) texts.set(k, {});
    texts.get(k)[l] = pick(t, r.textField);
  }
  const keys = [...new Set(keyRows.map((x) => pick(x, r.key)).filter((k) => k !== ''))].sort();
  let all = keys.map((key) => {
    const t = texts.get(key) || {};
    const text = t[logon] || t.E || '';
    return { key, text, textEn: t.E && t.E !== text ? t.E : '' };
  });
  const words = String(find).toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length) all = all.filter((c) => words.every((w) => `${c.key} ${c.text} ${c.textEn}`.toLowerCase().includes(w)));
  const choices = all.slice(0, max).map((c, i) => ({ n: i + 1, ...c }));
  return { value: r.value, total: all.length, shown: choices.length, choices };
}

function arg(argv, name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : dflt;
}

export function main(argv, { out = console.log, err = console.error } = {}) {
  const [cmd, ref] = argv;
  const family = arg(argv, '--family', '');
  const rows = loadValueTables();
  try {
    if (cmd === 'list') {
      const mod = arg(argv, '--module', '');
      out(JSON.stringify(rows.filter((r) => (!mod || r.module === mod.toUpperCase()) && familyOk(r, family.toUpperCase()))
        .map((r) => ({ value: r.value, module: r.module, table: r.table, textTable: r.textTable, usedBy: r.usedBy, problems: rowProblems(r) }))));
      return 0;
    }
    if (!['show', 'plan', 'merge'].includes(cmd) || !ref) {
      err('usage: values.mjs list [--module M] | show <Value|ACTION.ID.param> | plan <ref> [--lang KO] | merge <ref> --keys <file> --texts <file> [--lang KO] [--find-file f] [--max 30]');
      return 2;
    }
    const r = findValue(rows, ref, family.toUpperCase());
    if (!r) { err(`no value table for ${ref} — ask the user plainly`); return 1; }
    if (cmd === 'show') { out(JSON.stringify({ ...r, problems: rowProblems(r) })); return 0; }
    const lang = arg(argv, '--lang', 'E');
    if (cmd === 'plan') { out(JSON.stringify(planValue(r, lang))); return 0; }
    const keys = arg(argv, '--keys', ''), texts = arg(argv, '--texts', '');
    if (!keys) { err('merge needs --keys <file>'); return 2; }
    if (argv.includes('--find')) { err('--find is not accepted: write the words to a file and pass --find-file'); return 2; }
    const findFile = arg(argv, '--find-file', '');
    if (findFile && !inMcpSqlDir(findFile)) { err('--find-file must be a file in .sc4sap/work/<alias>/mcp-output/sql/'); return 2; }
    const maxArg = arg(argv, '--max', '30');
    if (!/^\d{1,3}$/.test(maxArg)) { err('--max must be 1–3 digits'); return 2; }
    const find = findFile ? readFileSync(findFile, 'utf8').slice(0, 200) : '';
    out(JSON.stringify(mergeValues(r, rowsOf(keys), texts ? rowsOf(texts) : [], { lang, find, max: Number(maxArg) })));
    return 0;
  } catch (e) {
    err(e.message);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = main(process.argv.slice(2));
}
