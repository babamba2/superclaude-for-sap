// sc4sap:graph — Step G3 read plan: the GetSqlQuery statements that collect a package's DDIC relations.
//
//   node ddic-queries.mjs --dir <inventory dir> [--sap-version ECC|S4] [--out <plan file>] [--chunk n] [--fields-chunk n]
//
// Reads <dir>/walk.json and prints one JSON array: [{ id, table, sql, row_number }]. With --out it writes that array
// to the plan file and prints { plan, statements, slices: [{ from, to }] } instead — one slice of at most SLICE
// statements per sap-checker (MODE: dd-read), which runs them with GetSqlQuery { output: "file" };
// collect-ddic-reads.mjs then writes <dir>/ddic-reads.json, so neither SQL text nor results reach the main thread.
// Chunk sizes: ECC 50 names (DD03L 20 tables) — the TABLE_READ condition travels in the OData URL, so the IN list
// stays short; S4 200 names (DD03L 60 tables) — ADT data preview posts the statement in the request body.
// Only DD* repository tables are read (metadata, never business rows); every statement is a single-table
// SELECT with a WHERE … IN (…) list, so it runs both on ADT data preview (S/4, BASIS ≥ 7.50) and on the
// ZMCP_ADT_DISPATCH TABLE_READ fallback (ECC 7.40 / 7.31).
//
//   DD03L  fields of TABL / STRU / VIEW members   (typing, .INCLUDE / .APPEND, check table)
//   DD08L  foreign key headers                    DD05S  foreign key field map
//   DD35L  search helps attached to table fields  DD04L  data element → domain, search help
//   DD01L  domain value tables                    DD40L  table type row types
//   DD26S  view base tables                       DD30L  search help selection method
//   DD31S  collective search help → included search helps

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const up = (s) => String(s ?? '').trim().toUpperCase();
const MAX_ROWS = 5000; // ZMCP_ADT_DISPATCH TABLE_READ cap
export const CHUNKS = { ECC: { chunk: 50, fieldsChunk: 20 }, S4: { chunk: 200, fieldsChunk: 60 } };
export const SLICE = 60;

/** plan length → [{ from, to }] (1-based, inclusive), one per sap-checker */
export function slices(n, size = SLICE) {
  const out = [];
  for (let i = 0; i < n; i += size) out.push({ from: i + 1, to: Math.min(n, i + size) });
  return out;
}
const quote = (n) => `'${n.replace(/'/g, "''")}'`;

/** DD table → { cols, key, types, as4local } */
export const DD_READS = [
  { table: 'DD03L', key: 'TABNAME', types: ['TABL', 'STRU', 'VIEW'], cols: 'TABNAME, FIELDNAME, POSITION, KEYFLAG, ROLLNAME, CHECKTABLE, PRECFIELD, REFTABLE, REFFIELD, COMPTYPE', fields: true },
  { table: 'DD08L', key: 'TABNAME', types: ['TABL'], cols: 'TABNAME, FIELDNAME, CHECKTABLE, FRKART, CARD, CARDLEFT' },
  { table: 'DD05S', key: 'TABNAME', types: ['TABL'], cols: 'TABNAME, FIELDNAME, PRIMPOS, FORTABLE, FORKEY' }, // no CHECKFIELD column on ECC 7.31 / 7.40,
  { table: 'DD35L', key: 'TABNAME', types: ['TABL', 'STRU'], cols: 'TABNAME, FIELDNAME, SHLPNAME' },
  { table: 'DD04L', key: 'ROLLNAME', types: ['DTEL'], cols: 'ROLLNAME, DOMNAME, SHLPNAME, SHLPFIELD' },
  { table: 'DD01L', key: 'DOMNAME', types: ['DOMA'], cols: 'DOMNAME, ENTITYTAB' },
  { table: 'DD40L', key: 'TYPENAME', types: ['TTYP'], cols: 'TYPENAME, ROWTYPE, ROWKIND' },
  { table: 'DD26S', key: 'VIEWNAME', types: ['VIEW'], cols: 'VIEWNAME, TABNAME, TABPOS' },
  { table: 'DD30L', key: 'SHLPNAME', types: ['SHLP'], cols: 'SHLPNAME, SELMETHOD' },
  { table: 'DD31S', key: 'SHLPNAME', types: ['SHLP'], cols: 'SHLPNAME, SUBSHLP' },
];

/** walk.json objects → Map type → sorted names */
export function membersByType(walk) {
  const by = new Map();
  for (const o of walk?.objects || []) {
    const type = up(String(o.type || '').split('/')[0]);
    const name = up(o.name);
    if (!type || !name) continue;
    if (!by.has(type)) by.set(type, new Set());
    by.get(type).add(name);
  }
  return new Map([...by].map(([t, s]) => [t, [...s].sort()]));
}

export function ddicQueries(walk, { chunk = 50, fieldsChunk = 20 } = {}) {
  const by = membersByType(walk);
  const out = [];
  for (const r of DD_READS) {
    const names = [...new Set(r.types.flatMap((t) => by.get(t) || []))].sort();
    const size = r.fields ? fieldsChunk : chunk;
    for (let i = 0, part = 1; i < names.length; i += size, part++) {
      const slice = names.slice(i, i + size);
      out.push({
        id: `${r.table.toLowerCase()}-${part}`,
        table: r.table,
        sql: `SELECT ${r.cols} FROM ${r.table} WHERE AS4LOCAL = 'A' AND ${r.key} IN (${slice.map(quote).join(',')})`,
        row_number: MAX_ROWS,
      });
    }
  }
  return out;
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dir') a.dir = resolve(argv[++i]);
    else if (k === '--chunk') a.chunk = Number(argv[++i]);
    else if (k === '--fields-chunk') a.fieldsChunk = Number(argv[++i]);
    else if (k === '--sap-version') a.sapVersion = /^S/i.test(String(argv[++i])) ? 'S4' : 'ECC';
    else if (k === '--out') a.out = resolve(argv[++i]);
  }
  if (!a.dir) throw new Error('usage: ddic-queries.mjs --dir <inventory dir> [--sap-version ECC|S4] [--out <plan file>] [--chunk n] [--fields-chunk n]');
  const d = CHUNKS[a.sapVersion || 'ECC'];
  a.chunk ??= d.chunk;
  a.fieldsChunk ??= d.fieldsChunk;
  return a;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    const a = parseArgs(process.argv.slice(2));
    const p = join(a.dir, 'walk.json');
    if (!existsSync(p)) throw new Error(`walk.json not found in ${a.dir}`);
    const plan = ddicQueries(JSON.parse(readFileSync(p, 'utf8')), a);
    if (a.out) {
      writeFileSync(a.out, `${JSON.stringify(plan, null, 1)}\n`);
      process.stdout.write(`${JSON.stringify({ plan: a.out, statements: plan.length, slices: slices(plan.length) })}\n`);
    } else process.stdout.write(`${JSON.stringify(plan)}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
