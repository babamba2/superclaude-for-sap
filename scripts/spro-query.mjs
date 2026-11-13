#!/usr/bin/env node
// spro-query.mjs — compact reader for the local SPRO cache (spro-config*.json).
//
// Consultant agents use it instead of ad-hoc python / full-file reads, so only the
// rows they need enter the context.
//
//   node spro-query.mjs --module SD                          list cached tables (rows, description)
//   node spro-query.mjs --module SD --table T683V             all rows (capped by --limit)
//   node spro-query.mjs --module SD --table T683V --where VKORG=1100,AUART=RE|RK --fields AUART,KALVG,KALSM
//   node spro-query.mjs --module SD --find KALSM              tables of the module that have this field
//   node spro-query.mjs --status SD,MM                        per module: SPRO cache file + customizations dir (or none)
//
// Options: --cwd <dir> (workspace, default process.cwd()), --limit <n> (default 200), --json.
// Filters: FIELD=v1|v2 (any of), FIELD!=v (not), FIELD~text (contains, case-insensitive); comma = AND.
// Exit 2 when no cache exists (the caller then follows common/spro-lookup.md Step 2+).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveArtifactBase, resolveWorkspaceRoot } from './lib/profile-resolve.mjs';

export function parseArgs(argv) {
  const out = { limit: 200 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--module') out.module = String(next() || '').toUpperCase();
    else if (a === '--table') out.table = String(next() || '').toUpperCase();
    else if (a === '--where') out.where = next();
    else if (a === '--fields') out.fields = String(next() || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    else if (a === '--find') out.find = String(next() || '').toUpperCase();
    else if (a === '--status') out.status = String(next() || '').toUpperCase().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--limit') out.limit = Number(next()) || 200;
    else if (a === '--cwd') out.cwd = next();
    else if (a === '--json') out.json = true;
  }
  return out;
}

export function parseWhere(where) {
  if (!where) return [];
  return where.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^([A-Za-z0-9_/]+)\s*(!=|=|~)\s*(.*)$/);
    if (!m) throw new Error(`bad --where term: ${part}`);
    return { field: m[1].toUpperCase(), op: m[2], values: m[3].split('|') };
  });
}

export function matchRow(row, terms) {
  return terms.every(({ field, op, values }) => {
    const v = row[field] == null ? '' : String(row[field]);
    if (op === '=') return values.includes(v);
    if (op === '!=') return !values.includes(v);
    return values.some((t) => v.toLowerCase().includes(t.toLowerCase()));
  });
}

// Returns { file, timestamp, tables } for the module, or null when no cache has it.
export function loadModule(cwd, module) {
  const bases = [resolveArtifactBase(cwd), join(resolveWorkspaceRoot(cwd), '.sc4sap')];
  const names = ['spro-config.json', `spro-config-${module}.json`];
  for (const base of bases) {
    for (const name of names) {
      const file = join(base, name);
      if (!existsSync(file)) continue;
      const doc = JSON.parse(readFileSync(file, 'utf8'));
      const tables = doc?.modules?.[module];
      if (tables) return { file, timestamp: doc.timestamp || '', tables };
    }
  }
  return null;
}

// One line per module: SPRO cache + customizations cache, with exact paths (for dispatch prompts).
export function status(cwd, modules, print = console.log) {
  const base = resolveArtifactBase(cwd);
  for (const m of modules) {
    const hit = loadModule(cwd, m);
    const custom = [join(base, 'customizations', m), join(resolveWorkspaceRoot(cwd), '.sc4sap', 'customizations', m)]
      .find((d) => existsSync(d));
    print(`${m}\tspro=${hit ? `${hit.file} (snapshot ${hit.timestamp})` : 'none'}\tcustomizations=${custom || 'none'}`);
  }
  return 0;
}

export function run(opts, print = console.log) {
  if (opts.status) return status(opts.cwd || process.cwd(), opts.status, print);
  if (!opts.module) throw new Error('--module is required');
  const hit = loadModule(opts.cwd || process.cwd(), opts.module);
  if (!hit) {
    print(`NO_CACHE module=${opts.module} — follow common/spro-lookup.md Step 2+`);
    return 2;
  }
  print(`# cache ${hit.file} · snapshot ${hit.timestamp}`);
  const entries = Object.entries(hit.tables).filter(([, v]) => v && typeof v === 'object');

  if (opts.find) {
    const found = entries.filter(([, v]) => Array.isArray(v.data) && v.data.some((r) => opts.find in r));
    print(found.length ? found.map(([k, v]) => `${k}\t${v.total_rows ?? v.data.length}`).join('\n') : `field ${opts.find} not in any cached ${opts.module} table`);
    return 0;
  }

  if (!opts.table) {
    for (const [k, v] of entries) {
      const rows = v.total_rows ?? (Array.isArray(v.data) ? v.data.length : 0);
      print(`${k}\t${rows}\t${String(v.description || '').slice(0, 90)}`);
    }
    return 0;
  }

  const t = hit.tables[opts.table];
  if (!t || !Array.isArray(t.data)) {
    print(`table ${opts.table} not cached for ${opts.module} — read it via MCP per common/spro-lookup.md Step 3`);
    return 0;
  }
  const terms = parseWhere(opts.where);
  const rows = t.data.filter((r) => matchRow(r, terms));
  const allFields = rows.length ? Object.keys(rows[0]) : Object.keys(t.data[0] || {});
  const fields = opts.fields?.length ? opts.fields : allFields.filter((f) => f !== 'MANDT');
  const shown = rows.slice(0, opts.limit);
  print(`# ${opts.table} · ${rows.length} of ${t.data.length} rows match${rows.length > shown.length ? ` · first ${shown.length} shown (--limit)` : ''}`);
  if (opts.json) {
    print(JSON.stringify(shown.map((r) => Object.fromEntries(fields.map((f) => [f, r[f]])))));
    return 0;
  }
  print(fields.join('\t'));
  for (const r of shown) print(fields.map((f) => (r[f] == null ? '' : String(r[f]))).join('\t'));
  return 0;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  try {
    process.exitCode = run(parseArgs(process.argv.slice(2)));
  } catch (e) {
    console.error(`spro-query: ${e.message}`);
    process.exitCode = 1;
  }
}
