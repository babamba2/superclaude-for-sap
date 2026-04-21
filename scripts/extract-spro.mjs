#!/usr/bin/env node
/**
 * SPRO Config Extraction Script
 *
 * Reads SPRO table lists from configs/{MODULE}/spro.md,
 * queries each table via the running MCP server's GetSqlQuery tool,
 * and writes results to .sc4sap/spro-config.json.
 *
 * Usage:
 *   node scripts/extract-spro.mjs [modules...]
 *   node scripts/extract-spro.mjs SD MM FI CO
 *   node scripts/extract-spro.mjs all
 *
 * Requires: MCP server running (bridge/mcp-server.cjs) —
 * this script connects to it via the MCP client SDK.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { resolveArtifactBase, resolveSapEnvPath } from './lib/profile-resolve.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIGS_DIR = resolve(ROOT, 'configs');
// Output under the active profile's artifact base (`.sc4sap/work/<alias>/`) in
// multi-profile mode, or `.sc4sap/` in legacy mode. The shared resolver walks
// `<cwd>/.sc4sap/active-profile.txt` to determine the right folder.
const OUTPUT_DIR = resolveArtifactBase(process.cwd());
// Single module → per-module file; multiple/all → merged file
const isSingleModule = () => selectedModules.length === 1;
const getOutputFile = () => isSingleModule()
  ? resolve(OUTPUT_DIR, `spro-config-${selectedModules[0]}.json`)
  : resolve(OUTPUT_DIR, 'spro-config.json');
const BRIDGE = resolve(ROOT, 'bridge', 'mcp-server.cjs');

// Parse args
let selectedModules = process.argv.slice(2);
if (selectedModules.length === 0 || selectedModules[0] === 'all') {
  selectedModules = readdirSync(CONFIGS_DIR).filter(d => {
    try { return require('fs').statSync(resolve(CONFIGS_DIR, d)).isDirectory(); } catch { return false; }
  });
}

console.log(`[spro] Modules: ${selectedModules.join(', ')}`);

// SAP DDIC table name whitelist — uppercase letter start, A-Z / 0-9 / _ only, 2..30 chars.
// Anything else is refused before reaching GetSqlQuery. Defends against malicious or
// malformed entries in configs/{MODULE}/spro.md flowing into a raw SQL string.
const TABLE_NAME_RE = /^[A-Z][A-Z0-9_]{1,29}$/;

function isValidTableName(name) {
  return typeof name === 'string' && TABLE_NAME_RE.test(name);
}

// Resolve active SAP version (S4 | ECC | null) from the active profile's
// sap.env (multi-profile) or the legacy project sap.env. Used to filter rows
// in modules whose spro.md has a System column (e.g. MM) so that ECC-only
// rows are skipped on S/4 and vice versa.
function resolveSapVersion() {
  if (process.env.SAP_VERSION) return process.env.SAP_VERSION.trim().toUpperCase();
  const hit = resolveSapEnvPath(process.cwd());
  const fallback = resolve(ROOT, '.sc4sap', 'sap.env');
  const candidates = [];
  if (hit) candidates.push(hit.path);
  if (existsSync(fallback)) candidates.push(fallback);
  for (const p of candidates) {
    try {
      const text = readFileSync(p, 'utf-8');
      const m = text.match(/^\s*SAP_VERSION\s*=\s*(.+?)\s*$/m);
      if (m) return m[1].replace(/^["']|["']$/g, '').trim().toUpperCase();
    } catch { /* ignore */ }
  }
  return null;
}
const SAP_VERSION = resolveSapVersion();
console.log(`[spro] SAP_VERSION: ${SAP_VERSION ?? '(unset — no System-column filtering)'}`);

// Row matches the active system if:
//   - no System column present (legacy 3-col layout), OR
//   - System cell lists both ECC and S4 (universal), OR
//   - SAP_VERSION is unset (can't filter → include), OR
//   - cell contains a token matching SAP_VERSION.
function systemMatches(systemCell) {
  if (!systemCell) return true;
  const tokens = systemCell
    .split(/[\/,]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const hasEcc = tokens.includes('ECC');
  const hasS4 = tokens.includes('S4') || tokens.includes('S4HANA') || tokens.includes('S/4');
  if (hasEcc && hasS4) return true;
  if (!SAP_VERSION) return true;
  if (SAP_VERSION === 'ECC') return hasEcc;
  if (SAP_VERSION === 'S4' || SAP_VERSION === 'S4HANA') return hasS4;
  return tokens.includes(SAP_VERSION);
}

// Parse table names from spro.md.
// Column layout is inferred from the most recent header row so modules can
// use either 3-col (| Config | Table/View | Description |) or 4-col
// (| Config | System | Table/View | Description |) tables without a hard-
// coded index — previously the parser assumed column 2 was always the table
// name, which on MM's 4-col layout captured 'System' and 'ECC' as tables.
function parseTablesFromSproMd(modulePath) {
  const content = readFileSync(modulePath, 'utf-8');
  const tables = new Map(); // tableName -> description
  const lines = content.split('\n');

  // Defaults matching the common 3-col layout (reset each time a header is seen).
  let tableIdx = 1;
  let systemIdx = -1;
  let descIdx = 2;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.startsWith('|') || !line.endsWith('|')) continue;
    const cells = line.slice(1, -1).split('|').map((c) => c.trim());
    if (cells.length < 3) continue;

    // Separator row: |---|---|---|
    if (cells.every((c) => c === '' || /^:?-+:?$/.test(c))) continue;

    // Header row — recompute column roles.
    const lower = cells.map((c) => c.toLowerCase());
    const hdrTable = lower.findIndex((c) => c === 'table/view' || c === 'table');
    const hdrDesc = lower.findIndex((c) => c === 'description');
    if (hdrTable >= 0 && hdrDesc >= 0) {
      tableIdx = hdrTable;
      descIdx = hdrDesc;
      systemIdx = lower.findIndex((c) => c === 'system');
      continue;
    }

    const tableCol = cells[tableIdx] ?? '';
    const descCol = cells[descIdx] ?? '';
    const systemCol = systemIdx >= 0 ? (cells[systemIdx] ?? '') : '';

    if (!systemMatches(systemCol)) continue;

    // Handle entries like "T077D / TONR" — take first valid table name.
    // Skip transaction codes (VN01, KANK, KONK) and pure number ranges.
    const parts = tableCol.split('/').map((p) => p.trim());
    for (const part of parts) {
      // Strip V_ prefix for the query — we'll query the base table.
      const raw = part.startsWith('V_') ? part.slice(2) : part;
      if (/^[A-Z]{2,4}\d{2}$/.test(part)) continue; // e.g., VN01
      const tableName = raw.toUpperCase();
      if (!isValidTableName(tableName)) {
        if (raw) console.warn(`[spro] Rejected invalid table name from ${modulePath}: ${JSON.stringify(raw)}`);
        break;
      }
      if (!tables.has(tableName)) {
        tables.set(tableName, descCol);
      }
      break; // Take only the first valid table
    }
  }

  return tables;
}

// Query a table via MCP
async function queryTable(client, tableName) {
  // Defense-in-depth: re-validate even if parseTablesFromSproMd was bypassed.
  if (!isValidTableName(tableName)) {
    return { success: false, error: `invalid table name rejected: ${JSON.stringify(tableName)}` };
  }
  try {
    const result = await client.callTool({
      name: 'GetSqlQuery',
      arguments: {
        sql_query: `SELECT * FROM ${tableName}`,
        row_number: 9999,
      },
    });

    if (result.content && result.content[0] && result.content[0].text) {
      const data = JSON.parse(result.content[0].text);
      return {
        success: true,
        total_rows: data.total_rows || 0,
        columns: data.columns || [],
        rows: data.rows || [],
      };
    }
    return { success: false, error: 'Empty response' };
  } catch (e) {
    // If V_ prefixed view failed, it might be queried as base table already
    return { success: false, error: e.message };
  }
}

async function main() {
  // Collect all tables per module
  const moduleData = {};
  const allTables = new Map(); // tableName -> { modules: [], description }

  for (const mod of selectedModules) {
    const sproPath = resolve(CONFIGS_DIR, mod, 'spro.md');
    if (!existsSync(sproPath)) {
      console.error(`[spro] Warning: ${sproPath} not found, skipping ${mod}`);
      continue;
    }

    const tables = parseTablesFromSproMd(sproPath);
    moduleData[mod] = tables;

    for (const [name, desc] of tables) {
      if (!allTables.has(name)) {
        allTables.set(name, { modules: [mod], description: desc });
      } else {
        allTables.get(name).modules.push(mod);
      }
    }
  }

  const uniqueCount = allTables.size;
  console.log(`[spro] Total unique tables: ${uniqueCount}`);

  // Start MCP client
  console.log('[spro] Connecting to MCP server...');
  const transport = new StdioClientTransport({
    command: 'node',
    args: [BRIDGE],
  });

  const client = new Client({ name: 'spro-extractor', version: '1.0.0' });
  await client.connect(transport);
  console.log('[spro] Connected.');

  // Query tables in batches
  const BATCH_SIZE = 5;
  const tableNames = [...allTables.keys()];
  const results = {};
  const errors = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < tableNames.length; i += BATCH_SIZE) {
    const batch = tableNames.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(tableNames.length / BATCH_SIZE);
    console.log(`[spro] Batch ${batchNum}/${totalBatches}: ${batch.join(', ')}`);

    const batchResults = await Promise.all(
      batch.map(async (tableName) => {
        const result = await queryTable(client, tableName);
        return { tableName, result };
      })
    );

    for (const { tableName, result } of batchResults) {
      const info = allTables.get(tableName);
      if (result.success) {
        results[tableName] = {
          description: info.description,
          modules: info.modules,
          total_rows: result.total_rows,
          columns: result.columns,
          rows: result.rows,
        };
        successCount++;
        console.log(`  ✓ ${tableName}: ${result.total_rows} rows`);
      } else {
        errors.push({ table: tableName, modules: info.modules, error: result.error });
        failCount++;
        console.log(`  ✗ ${tableName}: ${result.error}`);
      }
    }
  }

  // Organize by module
  const moduleResults = {};
  for (const mod of selectedModules) {
    moduleResults[mod] = {};
    const tables = moduleData[mod];
    if (!tables) continue;

    for (const [tableName, desc] of tables) {
      if (results[tableName]) {
        moduleResults[mod][tableName] = {
          description: desc,
          total_rows: results[tableName].total_rows,
          data: results[tableName].rows,
        };
      }
    }
  }

  // Write output
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const output = {
    timestamp: new Date().toISOString(),
    system: SAP_VERSION ?? 'unknown',
    modules: moduleResults,
    errors,
    summary: {
      modules_processed: selectedModules.length,
      tables_success: successCount,
      tables_failed: failCount,
      total_tables: uniqueCount,
    },
  };

  const outputFile = getOutputFile();
  writeFileSync(outputFile, JSON.stringify(output, null, 2), 'utf-8');

  console.log('\n[spro] === Summary ===');
  console.log(`  Modules: ${selectedModules.join(', ')}`);
  console.log(`  Tables: ${successCount} success / ${failCount} failed / ${uniqueCount} total`);
  console.log(`  Output: ${outputFile}`);

  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('[spro] Fatal error:', e);
  process.exit(1);
});
