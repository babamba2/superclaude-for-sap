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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIGS_DIR = resolve(ROOT, 'configs');
// Output to project-root .sc4sap/ (cwd), matching the convention used by
// bridge/mcp-server.cjs and the block-forbidden-tables hook.
const OUTPUT_DIR = resolve(process.cwd(), '.sc4sap');
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

// Parse table names from spro.md
function parseTablesFromSproMd(modulePath) {
  const content = readFileSync(modulePath, 'utf-8');
  const tables = new Map(); // tableName -> description
  const lines = content.split('\n');

  for (const line of lines) {
    // Match markdown table rows: | Config Name | Table/View | Description |
    const match = line.match(/^\|([^|]+)\|([^|]+)\|([^|]+)\|/);
    if (!match) continue;

    const tableCol = match[2].trim();
    const descCol = match[3].trim();

    // Skip header rows
    if (tableCol === 'Table/View' || tableCol.startsWith('---')) continue;

    // Handle entries like "T077D / TONR" — take first valid table name
    // Skip transaction codes (VN01, KANK, KONK) and pure number ranges
    const parts = tableCol.split('/').map(p => p.trim());
    for (const part of parts) {
      // Strip V_ prefix for the query — we'll query the base table
      const raw = part.startsWith('V_') ? part.slice(2) : part;
      // Skip if it looks like a transaction code (2-4 chars, no numbers pattern)
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
    system: 'S4HANA',
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
