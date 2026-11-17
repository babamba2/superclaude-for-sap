/**
 * program-test capture — called by the PostToolUse evidence recorder (scripts/evidence/record.mjs).
 *
 * While a program-test run is active (`.sc4sap/program-test/active.json`), the rows of every
 * table read (GetTableContents / GetSqlQuery on DEV, GetRemoteTableContents on QA / PRD) are
 * masked here and saved under the run folder, and the source of GetProgram / GetInclude is
 * saved as read. So test data and source come from the MCP response, never from agent text,
 * and unmasked personal values never reach disk (only salted fingerprints, to find leaks).
 *
 * Masking is default-deny: rows are saved only for a table whose DDIC (GetTable during the run)
 * is captured; a column is kept only when it maps to a non-personal field of that table (by name,
 * data element or domain — aliases resolved from the SELECT list), everything else is masked.
 * Personal / credential tables (FROM or JOIN, sub-queries included) are discarded at capture, and a
 * GetSqlQuery is saved only when it parses under the strict SELECT grammar of parseSelect (allow-list).
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ddicFromGetTable, extractRows, isRefusedTable, maskRows, parseSelect, sha, tablesInSql } from './pt-lib.mjs';

const DATA_TOOLS = new Set(['GetTableContents', 'GetSqlQuery', 'GetRemoteTableContents']);
const SRC_TOOLS = new Set(['GetProgram', 'GetInclude']);
const DDIC_TOOLS = new Set(['GetTable']);
const up = (s) => String(s ?? '').trim().toUpperCase();

export const activePath = (root) => join(root, '.sc4sap', 'program-test', 'active.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

/**
 * @param {string} root project root
 * @param {string} handler MCP handler name (namespace stripped)
 * @param {object} input tool_input
 * @param {string} text response text
 * @param {boolean} isError response flagged as error
 * @param {Date} now
 * @returns {object|null} the capture line written, or null
 */
export function capture(root, handler, input, text, isError, now = new Date()) {
  if (!DATA_TOOLS.has(handler) && !SRC_TOOLS.has(handler) && !DDIC_TOOLS.has(handler)) return null;
  const active = readJson(activePath(root), null);
  if (!active?.run_dir || !existsSync(active.run_dir)) return null;
  const state = readJson(join(active.run_dir, 'state.json'), null);
  if (!state?.salt) return null;
  const log = (line) => {
    appendFileSync(join(active.run_dir, 'capture.jsonl'), JSON.stringify(line) + '\n', 'utf-8');
    return line;
  };
  const base = { t: now.toISOString(), tool: handler, sha256: sha(text) };
  if (isError) return log({ ...base, error: true });

  if (DDIC_TOOLS.has(handler)) {
    // field → data element / domain of a planned table: masking decides by the source field's DDIC
    const name = up(input.table_name);
    const fields = ddicFromGetTable(text);
    if (!name || !fields) return log({ ...base, kind: 'ddic', name, error: 'no fields parsed' });
    mkdirSync(join(active.run_dir, 'ddic'), { recursive: true });
    writeFileSync(join(active.run_dir, 'ddic', `${name.replace(/\//g, '#')}.json`), JSON.stringify({ table: name, fields }, null, 2) + '\n', 'utf-8');
    return log({ ...base, kind: 'ddic', name, fields: Object.keys(fields).length });
  }

  if (SRC_TOOLS.has(handler)) {
    const name = up(input.include_name || input.program_name);
    let src = text;
    if (handler === 'GetProgram') {
      try {
        const d = JSON.parse(text);
        if (typeof d.program_data !== 'string') return log({ ...base, name, error: 'no program_data (file output?)' });
        src = d.program_data;
      } catch {
        return log({ ...base, name, error: 'unparsed' });
      }
    }
    mkdirSync(join(active.run_dir, 'src'), { recursive: true });
    writeFileSync(join(active.run_dir, 'src', `${name.replace(/\//g, '#')}.abap`), src, 'utf-8');
    return log({ ...base, kind: 'src', name, lines: src.split('\n').length });
  }

  const sqlText = handler === 'GetSqlQuery' ? String(input.sql_query || input.query || '') : null;
  const sql = sqlText !== null ? parseSelect(sqlText) : null;
  const tables = sqlText !== null ? tablesInSql(sqlText) : [up(input.table_name)].filter(Boolean);
  const table = sql?.ok ? sql.table : tables[0];
  const source = handler === 'GetRemoteTableContents' ? (String(input.destination || '') === String(state.destination || '') ? state.source : `remote:${input.destination}`) : 'dev';
  const refused = tables.filter(isRefusedTable);
  if (refused.length) return log({ ...base, kind: 'data', table, source, refused, error: `personal / credential table ${refused.join(', ')} — rows discarded` });
  // allow-list: rows of a SELECT are saved only when it parses under the strict grammar
  if (sql && !sql.ok) return log({ ...base, kind: 'data', table, source, error: `SELECT not saved — ${sql.why}; use one table, plain fields, a simple WHERE` });
  if (!table) return log({ ...base, kind: 'data', source, error: 'no table — nothing saved' });
  const ddic = readJson(join(active.run_dir, 'ddic', `${table.replace(/\//g, '#')}.json`), null)?.fields;
  if (!ddic) return log({ ...base, kind: 'data', table, source, error: `no DDIC for ${table} — call GetTable ${table} first (masking needs it); nothing saved` });
  const parsed = extractRows(text);
  if (!parsed) return log({ ...base, kind: 'data', table, source, error: 'rows not parsed — nothing saved' });
  const { rows, masked, fingerprints } = maskRows(parsed.rows, state.salt, state.mask_extra || [], { ddic, columns: sql ? sql.columns : null, star: sql ? sql.star : false });
  const dir = join(active.run_dir, 'rows');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${table.replace(/\//g, '#')}.json`);
  const prev = readJson(file, { table, sources: [], reads: [], rows: [], masked: [] });
  const seen = new Set(prev.rows.map((r) => JSON.stringify(r)));
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (!seen.has(k)) { prev.rows.push(r); seen.add(k); }
  }
  prev.sources = [...new Set([...prev.sources, source])];
  prev.masked = [...new Set([...prev.masked, ...masked])].sort();
  prev.reads.push({ t: base.t, tool: handler, destination: input.destination || null, where: input.where || input.sql_query || null, count: rows.length, sha256: base.sha256 });
  writeFileSync(file, JSON.stringify(prev, null, 2) + '\n', 'utf-8');
  if (fingerprints.length) {
    const fpFile = join(active.run_dir, 'fingerprints.json');
    const fp = new Set(readJson(fpFile, []));
    for (const f of fingerprints) fp.add(f);
    writeFileSync(fpFile, JSON.stringify([...fp].slice(-20000)) + '\n', 'utf-8');
  }
  return log({ ...base, kind: 'data', table, source, count: rows.length, masked });
}
