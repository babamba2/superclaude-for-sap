// SAP table reader for config-to-document.
//
// Talks to the sc4sap MCP server (bridge/mcp-server.cjs) over stdio and reads
// customizing tables with GetSqlQuery. On BASIS < 7.50 the server answers
// through ZMCP_ADT_DISPATCH TABLE_READ, which only reads customizing / system
// tables (delivery class C, G, E, S, W) and the transport key tables, so this
// reader never touches business data.
//
// Reads always use SELECT * and drop columns on this side: the dispatcher
// cannot select single fields that sit inside an .INCLUDE.

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// SC4SAP_MCP_BRIDGE points at another bridge (e.g. the installed plugin's)
// when the script runs from a source checkout.
const BRIDGE = process.env.SC4SAP_MCP_BRIDGE || resolve(ROOT, 'bridge', 'mcp-server.cjs');

// Plain (T161) or namespaced (/BEV2/ED901) DDIC names, at most 30 characters.
export const TABLE_NAME_RE = /^(?=.{2,30}$)(\/[A-Z0-9_]+\/)?[A-Z][A-Z0-9_]*$/;
const MAX_ROWS = 5000;

// allowTables: audited one-off blocklist bypass for this server only. The SDK
// starts the server with a minimal environment, so it goes in explicitly.
export async function connect(name = 'config-to-document', { allowTables = [] } = {}) {
  const env = { ...getDefaultEnvironment(), ...(allowTables.length ? { MCP_ALLOW_TABLE: allowTables.join(',') } : {}) };
  const transport = new StdioClientTransport({ command: 'node', args: [BRIDGE], stderr: 'ignore', env });
  const client = new Client({ name, version: '1.0.0' });
  await client.connect(transport);
  return client;
}

function quote(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** WHERE text from { FIELD: value | [values] } — values are quoted, never spliced raw. */
export function whereOf(cond = {}) {
  const parts = [];
  for (const [field, value] of Object.entries(cond)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(field)) throw new Error(`bad field name ${field}`);
    if (Array.isArray(value)) {
      if (!value.length) return null;
      parts.push(`${field} IN (${value.map(quote).join(', ')})`);
    } else if (value && typeof value === 'object' && 'like' in value) {
      parts.push(`${field} LIKE ${quote(value.like)}`);
    } else {
      parts.push(`${field} = ${quote(value)}`);
    }
  }
  return parts.join(' AND ');
}

/**
 * Read rows of one table. `where` is an object (see whereOf) or a raw
 * condition string built by the caller from trusted values only.
 * Returns { ok, rows, truncated, error }.
 */
export async function readTable(client, table, { where = '', fields = null, maxRows = MAX_ROWS } = {}) {
  if (!TABLE_NAME_RE.test(table)) return { ok: false, rows: [], error: `invalid table name ${table}` };
  const cond = typeof where === 'string' ? where : whereOf(where);
  if (cond === null) return { ok: true, rows: [] };
  const sql = `SELECT * FROM ${table}${cond ? ` WHERE ${cond}` : ''}`;
  const key = `${maxRows}|${sql}`;
  let out = client.cache?.get(key);
  if (!out) {
    out = await runSql(client, sql, maxRows);
    if (out.ok) client.cache?.set(key, out);
  }
  if (!fields || !out.ok) return out;
  const keep = fields.map((f) => f.toUpperCase());
  return { ...out, rows: out.rows.map((r) => Object.fromEntries(keep.map((k) => [k, r[k] ?? '']))) };
}

async function runSql(client, sql, maxRows) {
  try {
    const res = await client.callTool({ name: 'GetSqlQuery', arguments: { sql_query: sql, row_number: maxRows } });
    const text = res?.content?.[0]?.text ?? '';
    if (res?.isError) return { ok: false, rows: [], error: text.slice(0, 400) };
    const data = JSON.parse(text);
    return { ok: true, rows: data.rows || [], truncated: !!data.truncated };
  } catch (e) {
    return { ok: false, rows: [], error: String(e?.message ?? e).slice(0, 400) };
  }
}

/** Read with an IN list split into chunks so the WHERE text stays short. */
// TABLE_READ refuses any condition containing SELECT, JOIN or " FROM " — even
// inside a quoted value. Such values are read one by one through LIKE patterns
// that do not spell the word, so they cannot sink a whole chunk.
const GUARD = /SELECT|JOIN| FROM /i;

export async function readIn(client, table, field, values, { extra = {}, fields = null, chunk = 40 } = {}) {
  const all = [...new Set(values.filter(Boolean))];
  const uniq = all.filter((v) => !GUARD.test(String(v)));
  const out = [];
  const errors = [];
  for (const v of all.filter((x) => GUARD.test(String(x)))) {
    const like = String(v).replace(/SELECT/gi, 'SELEC_').replace(/JOIN/gi, 'JOI_').replace(/ FROM /gi, ' FRO_ ');
    const r = await readTable(client, table, { where: { ...extra, [field]: { like } }, fields });
    if (r.ok) out.push(...r.rows.filter((row) => String(row[field]) === String(v)));
    else errors.push(r.error);
  }
  // A chunk that hits the row limit is read again in halves; a single value that still hits it is reported.
  const truncated = [];
  const grab = async (vals) => {
    const r = await readTable(client, table, { where: { ...extra, [field]: vals }, fields });
    if (!r.ok) { errors.push(r.error); return; }
    if (r.truncated && vals.length > 1) {
      const h = Math.ceil(vals.length / 2);
      await grab(vals.slice(0, h)); await grab(vals.slice(h));
      return;
    }
    if (r.truncated) truncated.push(vals[0]);
    out.push(...r.rows);
  };
  for (let i = 0; i < uniq.length; i += chunk) await grab(uniq.slice(i, i + chunk));
  return { ok: errors.length === 0, rows: out, errors, truncated };
}

/** DDIC definition of a table (fields with descriptions, delivery class). */
export async function tableDefinition(client, table) {
  try {
    const res = await client.callTool({ name: 'GetTable', arguments: { table_name: table } });
    const text = res?.content?.[0]?.text ?? '';
    if (res?.isError) return null;
    const outer = JSON.parse(text);
    return typeof outer.table_data === 'string' ? JSON.parse(outer.table_data) : outer.table_data;
  } catch {
    return null;
  }
}
