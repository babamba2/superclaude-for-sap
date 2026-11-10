// sc4sap:graph — Step G3 read plan: the GetSqlQuery statements that collect a package's DDIC relations.
//
//   node ddic-queries.mjs --dir <inventory dir> [--sap-version ECC|S4] [--out <plan file>] [--chunk n] [--fields-chunk n]
//                         [--lang <logon language: ISO EN / KO / … or SAP 1-char>] [--only ddic|texts]
//
// Reads <dir>/walk.json (plus <dir>/graph.json nodes for the texts, when present) and prints one JSON array: [{ id, table, sql, row_number }]. With --out it writes that array
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
//
// Texts (the object descriptions the relation map shows), logon language + English:
//   DD02T  TABL / STRU / VIEW   DD04T DTEL   DD01T DOMA   DD40T TTYP   DD30T SHLP   DD25T VIEW / ENQU
//   TRDIRT PROG                 TSTCT TRAN   TFTIT FUNC   TLIBT FUGR   SEOCLASSTX CLAS / INTF
// --only texts plans the texts alone (refresh of an older inventory: write ddic-text-plan.json and collect with
// collect-ddic-reads.mjs --plan ddic-text-plan.json --out ddic-texts.json).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCustomName } from './ddic-edges.mjs';

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

/** repository short texts → object descriptions. lang = language column; as4local = has an active-version column */
export const TEXT_READS = [
  { table: 'DD02T', key: 'TABNAME', lang: 'DDLANGUAGE', text: 'DDTEXT', types: ['TABL', 'STRU', 'VIEW'], as4local: true },
  { table: 'DD04T', key: 'ROLLNAME', lang: 'DDLANGUAGE', text: 'DDTEXT', types: ['DTEL'], as4local: true },
  { table: 'DD01T', key: 'DOMNAME', lang: 'DDLANGUAGE', text: 'DDTEXT', types: ['DOMA'], as4local: true },
  { table: 'DD40T', key: 'TYPENAME', lang: 'DDLANGUAGE', text: 'DDTEXT', types: ['TTYP'], as4local: true },
  { table: 'DD30T', key: 'SHLPNAME', lang: 'DDLANGUAGE', text: 'DDTEXT', types: ['SHLP'], as4local: true },
  { table: 'DD25T', key: 'VIEWNAME', lang: 'DDLANGUAGE', text: 'DDTEXT', types: ['VIEW', 'ENQU'], as4local: true },
  { table: 'TRDIRT', key: 'NAME', lang: 'SPRSL', text: 'TEXT', types: ['PROG'] },
  { table: 'TSTCT', key: 'TCODE', lang: 'SPRSL', text: 'TTEXT', types: ['TRAN'] },
  { table: 'TFTIT', key: 'FUNCNAME', lang: 'SPRAS', text: 'STEXT', types: ['FUNC'] },
  { table: 'TLIBT', key: 'AREA', lang: 'SPRAS', text: 'AREAT', types: ['FUGR'] },
  { table: 'SEOCLASSTX', key: 'CLSNAME', lang: 'LANGU', text: 'DESCRIPT', types: ['CLAS', 'INTF'] },
];

/** ISO 639-1 → SAP 1-character language key (the usual logon languages) */
const SAP_LANG = { EN: 'E', KO: '3', DE: 'D', JA: 'J', ZH: '1', FR: 'F', ES: 'S', IT: 'I', PT: 'P', RU: 'R', NL: 'N', TH: '2', PL: 'L', TR: 'T', CS: 'C', HU: 'H', SV: 'V', DA: 'K', FI: 'U', NO: 'O' };

/** --lang value → SAP language keys to read: the logon language, then English */
export function textLangs(lang) {
  const v = String(lang ?? '').trim();
  const k = v.length === 1 ? v.toUpperCase() : SAP_LANG[v.toUpperCase()];
  return [...new Set([k, 'E'].filter((x) => x && /^[A-Z0-9]$/.test(x)))];
}

/** walk.json objects (+ graph.json nodes) → Map type → sorted names */
export function membersByType(walk, graph = null) {
  const by = new Map();
  const add = (t, n) => {
    const type = up(String(t || '').split('/')[0]);
    const name = up(n);
    if (!type || !name) return;
    if (!by.has(type)) by.set(type, new Set());
    by.get(type).add(name);
  };
  for (const o of walk?.objects || []) add(o.type, o.name);
  for (const n of graph?.nodes || []) if (isCustomName(n.name)) add(n.type, n.name);
  return new Map([...by].map(([t, s]) => [t, [...s].sort()]));
}

// ZMCP_ADT_DISPATCH TABLE_READ (ECC) refuses a condition containing SELECT / JOIN / ' FROM ' anywhere, string
// literals included — a name like ZMM_RFC_..._JOIN02 would fail its whole statement. Such names are left out on ECC.
export const ECC_UNSAFE_NAME = /SELECT|JOIN/;

function chunked(r, names, size, where, cols, ecc = false) {
  const out = [];
  for (let i = 0, part = 1; i < names.length; i += size, part++) {
    // filtered inside the chunk, so the other statements keep their name lists (and their earlier results)
    const slice = names.slice(i, i + size).filter((n) => !ecc || !ECC_UNSAFE_NAME.test(n));
    if (!slice.length) continue;
    out.push({
      id: `${r.table.toLowerCase()}-${part}`,
      table: r.table,
      sql: `SELECT ${cols} FROM ${r.table} WHERE ${where}${r.key} IN (${slice.map(quote).join(',')})`,
      row_number: MAX_ROWS,
    });
  }
  return out;
}

/** text statements for the members; graph nodes add FUNC and objects the walk did not list */
export function textQueries(walk, { chunk = 50, lang = 'E', graph = null, ecc = false } = {}) {
  const by = membersByType(walk, graph);
  const langs = textLangs(lang);
  const out = [];
  for (const r of TEXT_READS) {
    const names = [...new Set(r.types.flatMap((t) => by.get(t) || []))].sort();
    const where = `${r.as4local ? "AS4LOCAL = 'A' AND " : ''}${r.lang} IN (${langs.map(quote).join(',')}) AND `;
    out.push(...chunked(r, names, chunk, where, `${r.key}, ${r.lang}, ${r.text}`, ecc));
  }
  return out;
}

/** only: 'ddic' = relations alone, 'texts' = texts alone, else both */
export function ddicQueries(walk, { chunk = 50, fieldsChunk = 20, lang, graph = null, only, ecc = false } = {}) {
  const out = [];
  if (only !== 'texts') {
    const by = membersByType(walk);
    for (const r of DD_READS) {
      const names = [...new Set(r.types.flatMap((t) => by.get(t) || []))].sort();
      out.push(...chunked(r, names, r.fields ? fieldsChunk : chunk, "AS4LOCAL = 'A' AND ", r.cols, ecc));
    }
  }
  if (only !== 'ddic') out.push(...textQueries(walk, { chunk, lang, graph, ecc }));
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
    else if (k === '--lang') a.lang = argv[++i];
    else if (k === '--only') {
      a.only = argv[++i];
      if (!['ddic', 'texts'].includes(a.only)) throw new Error('--only ddic|texts');
    }
  }
  if (!a.dir) throw new Error('usage: ddic-queries.mjs --dir <inventory dir> [--sap-version ECC|S4] [--out <plan file>] [--chunk n] [--fields-chunk n] [--lang L] [--only ddic|texts]');
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
    const g = join(a.dir, 'graph.json');
    const graph = existsSync(g) ? JSON.parse(readFileSync(g, 'utf8')) : null;
    const plan = ddicQueries(JSON.parse(readFileSync(p, 'utf8')), { ...a, graph, ecc: a.sapVersion !== 'S4' });
    if (a.out) {
      writeFileSync(a.out, `${JSON.stringify(plan, null, 1)}\n`);
      process.stdout.write(`${JSON.stringify({ plan: a.out, statements: plan.length, slices: slices(plan.length) })}\n`);
    } else process.stdout.write(`${JSON.stringify(plan)}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
