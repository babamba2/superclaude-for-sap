// sc4sap:graph — Step G3a collector: match the GetSqlQuery result files to the read plan and write ddic-reads.json.
//
//   node collect-ddic-reads.mjs --dir <inventory dir> --sql-dir <MCP output sql dir>
//
// The plan is <dir>/ddic-plan.json (ddic-queries.mjs --out). The sap-checker workers run the statements with
// GetSqlQuery { output: "file" }; each call writes <sql-dir>/<table>-<time>.json holding the executed
// `sql_query`. A plan entry is matched by exact SQL text (newest file written after the plan wins), so the
// main thread never carries SQL text or results. No file for an entry → { error } — the statement failed,
// was skipped, or was altered on the way; G3b covers it like any failed read.

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @param plan    [{ id, table, sql, row_number }]
 * @param results [{ path, mtimeMs, sql_query, rows, row_number }] — parsed result files
 * @param since   only results written at or after this time count (plan file mtime)
 */
export function matchReads(plan, results, since = 0) {
  const bySql = new Map();
  for (const r of results) {
    if (typeof r.sql_query !== 'string' || r.mtimeMs < since) continue;
    const prev = bySql.get(r.sql_query);
    if (!prev || r.mtimeMs > prev.mtimeMs) bySql.set(r.sql_query, r);
  }
  return plan.map((q) => {
    const r = bySql.get(q.sql);
    if (!r) return { id: q.id, table: q.table, error: 'no result file (statement failed, skipped or altered)' };
    const rows = Array.isArray(r.rows) ? r.rows.length : Number(r.total_rows ?? 0);
    const cap = Number(r.row_number ?? q.row_number ?? 0);
    return { id: q.id, table: q.table, path: r.path, rows, truncated: cap > 0 && rows >= cap };
  });
}

function readResults(sqlDir) {
  if (!existsSync(sqlDir)) return [];
  const out = [];
  for (const f of readdirSync(sqlDir)) {
    if (!/^dd\d\d[a-z]-.*\.json$/i.test(f)) continue;
    const path = join(sqlDir, f);
    try {
      const j = JSON.parse(readFileSync(path, 'utf8'));
      out.push({ path, mtimeMs: statSync(path).mtimeMs, sql_query: j.sql_query, rows: j.rows, total_rows: j.total_rows, row_number: j.row_number });
    } catch {
      // unreadable file: ignore — its entry ends as "no result file"
    }
  }
  return out;
}

function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') a.dir = resolve(argv[++i]);
    else if (argv[i] === '--sql-dir') a.sqlDir = resolve(argv[++i]);
  }
  if (!a.dir || !a.sqlDir) throw new Error('usage: collect-ddic-reads.mjs --dir <inventory dir> --sql-dir <MCP output sql dir>');
  return a;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  try {
    const a = parseArgs(process.argv.slice(2));
    const planPath = join(a.dir, 'ddic-plan.json');
    if (!existsSync(planPath)) throw new Error(`ddic-plan.json not found in ${a.dir}`);
    const plan = JSON.parse(readFileSync(planPath, 'utf8'));
    // 2 s slack: the plan file and the first result can share a timestamp on coarse file systems
    const reads = matchReads(plan, readResults(a.sqlDir), statSync(planPath).mtimeMs - 2000);
    writeFileSync(join(a.dir, 'ddic-reads.json'), `${JSON.stringify(reads, null, 1)}\n`);
    const errors = reads.filter((r) => r.error).map((r) => r.id);
    const truncated = reads.filter((r) => r.truncated).map((r) => r.id);
    process.stdout.write(`${JSON.stringify({ reads: reads.length, ok: reads.length - errors.length, errors, truncated })}\n`);
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}
