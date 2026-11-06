/**
 * DD* metadata query check for the permission-approver hook.
 *
 * `/sc4sap:analyze-cbo-obj` Step G3a runs the statements printed by
 * `scripts/graph/ddic-queries.mjs` through GetSqlQuery. They read DDIC repository
 * tables only — the same metadata GetTable / GetDataElement return, never business
 * rows. A large package needs hundreds of them, so the hook auto-approves a
 * GetSqlQuery call only when it has exactly that shape:
 *
 *   - output: "file", no acknowledge_risk
 *   - one statement (no ';'), SELECT <explicit column list> FROM <one DD table> WHERE <condition>
 *   - the table is one of DD_METADATA_TABLES
 *   - the condition holds only column names, '=', '<>', IN ( … ), AND / OR and string literals
 *     (no sub-query, JOIN, UNION, host variables, functions)
 *
 * Anything else returns false and stays prompt-gated (common/data-extraction-policy.md).
 */

export const DD_METADATA_TABLES = new Set([
  'DD01L', 'DD03L', 'DD04L', 'DD05S', 'DD08L', 'DD26S', 'DD30L', 'DD31S', 'DD35L', 'DD40L',
]);

const FORBIDDEN_WORDS = /\b(SELECT|FROM|JOIN|UNION|INTO|EXISTS|UP|ORDER|GROUP|HAVING|DISTINCT|LIKE|BETWEEN|NOT|IS|NULL|CASE|AS)\b/;

/** @param {Record<string, unknown> | undefined} toolInput GetSqlQuery arguments */
export function isDdMetadataQuery(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return false;
  if (toolInput.output !== 'file') return false;
  if (toolInput.acknowledge_risk) return false;
  const sql = toolInput.sql_query;
  if (typeof sql !== 'string' || sql.length > 20000) return false;

  // String literals → '' so their content cannot carry keywords or punctuation.
  if ((sql.match(/'/g) || []).length % 2 !== 0) return false;
  const bare = sql.replace(/'(?:[^']|'')*'/g, "''").trim().toUpperCase();
  if (bare.includes(';')) return false;

  const m = bare.match(/^SELECT\s+([A-Z0-9_]+(?:\s*,\s*[A-Z0-9_]+)*)\s+FROM\s+([A-Z0-9_]+)\s+WHERE\s+([\s\S]+)$/);
  if (!m) return false;
  const [, , table, where] = m;
  if (!DD_METADATA_TABLES.has(table)) return false;
  if (!/^[A-Z0-9_\s=<>(),']+$/.test(where)) return false;
  if (FORBIDDEN_WORDS.test(where)) return false;
  return true;
}
