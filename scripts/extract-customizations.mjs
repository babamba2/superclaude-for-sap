#!/usr/bin/env node
//
// Customization (Enhancement + Extension) Extraction Script
//
// Parses standard exit / BAdI / append-structure definitions from
// configs/{MODULE}/enhancements.md, then queries the live SAP system
// (via the MCP server) to find which ones the customer has actually
// implemented with Z-namespace or Y-namespace objects.
//
// Outputs:
//   .sc4sap/customizations/{MODULE}/enhancements.json   (BAdI impl, SMOD -> CMOD Z-namespace)
//   .sc4sap/customizations/{MODULE}/extensions.json     (Append Structures + Custom Fields)
//
// Persistence rules requested by user:
//   - BAdI  -> record only when at least one Z/Y implementation exists
//   - SMOD  -> record only when a CMOD project includes this enhancement AND
//             the CMOD project is Z/Y  (proof that the customer turned it on)
//   - Append structures / Custom fields -> always recorded when any Z/Y
//             append or field exists on the base table; written to the
//             separate extensions.json
//
// Usage:
//   node scripts/extract-customizations.mjs [modules...]
//   node scripts/extract-customizations.mjs SD MM FI CO
//   node scripts/extract-customizations.mjs all
//
// Requires the MCP server bridge (bridge/mcp-server.cjs) to be runnable
// with a populated .sc4sap/sap.env — same prerequisites as extract-spro.mjs.
//

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIGS_DIR = resolve(ROOT, 'configs');
const OUTPUT_DIR = resolve(process.cwd(), '.sc4sap', 'customizations');
const BRIDGE = resolve(ROOT, 'bridge', 'mcp-server.cjs');

const Z_PATTERN = /^[ZY]/i;

let selectedModules = process.argv.slice(2);
if (selectedModules.length === 0 || selectedModules[0] === 'all') {
  selectedModules = readdirSync(CONFIGS_DIR).filter((d) => {
    try { return statSync(resolve(CONFIGS_DIR, d)).isDirectory() && d !== 'common'; } catch { return false; }
  });
}

console.log(`[cust] Modules: ${selectedModules.join(', ')}`);

/* ──────────────────── enhancements.md parser ──────────────────── */

/**
 * Parse `configs/{MODULE}/enhancements.md` into structured section buckets.
 * Section detection is heuristic — based on the `##` / `###` headers used
 * across the existing files (CMOD/SMOD, BAdIs, Enhancement Spots, Form-based
 * user exits, VOFM, Custom Fields / Append Structures).
 */
function parseEnhancementsMd(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf-8');
  const lines = text.split(/\r?\n/);

  const sections = {
    smod: [],         // classic SMOD enhancement names (e.g. V45A0001)
    badi: [],         // BAdI / Enhancement Spot names (BADI_SD_SALES, ES_SAPLV45A)
    formExits: [],    // include programs (MV45AFZZ, RV60AFZZ, ZXRSRU01…)
    appends: [],      // { append, baseTable }
  };

  let mode = null; // 'smod' | 'badi' | 'formExits' | 'appends' | null

  for (const raw of lines) {
    const line = raw.trim();
    if (/^##\s+/.test(raw)) {
      const h = raw.toLowerCase();
      if (/\bcustomer exits\b|\bcmod\/smod\b|\bclassic\b/.test(h)) mode = 'smod';
      else if (/\bbadi\b|\benhancement spots\b/.test(h)) mode = 'badi';
      else if (/\bform[\s-]?based\b|\binclude programs\b|\bmodule-specific\b/.test(h)) mode = 'formExits';
      else if (/\bcustom fields\b|\bappend structures\b/.test(h)) mode = 'appends';
      else mode = null;
      continue;
    }
    if (/^###\s+/.test(raw)) {
      const h = raw.toLowerCase();
      if (/\bform[\s-]?based\b|\binclude\b/.test(h)) mode = 'formExits';
      else if (/\bappend\b|\bcustom fields\b/.test(h)) mode = 'appends';
      else if (/\bbadi\b/.test(h)) mode = 'badi';
      continue;
    }

    const m = line.match(/^\|([^|]+)\|([^|]+)\|([^|]+)\|/);
    if (!m) continue;
    const col1 = m[1].trim().replace(/\*+/g, '').trim();
    const col2 = m[2].trim().replace(/\*+/g, '').trim();
    const col3 = m[3].trim().replace(/\*+/g, '').trim();
    if (!col1 || col1 === 'Name' || col1 === 'Include' || col1 === 'Append' || col1.startsWith('---')) continue;

    if (mode === 'smod') {
      if (/^[A-Z][A-Z0-9_]{5,}$/.test(col1)) sections.smod.push({ name: col1, description: col3 });
    } else if (mode === 'badi') {
      if (/^[A-Z][A-Z0-9_]+$/.test(col1)) sections.badi.push({ name: col1, description: col3 });
    } else if (mode === 'formExits') {
      if (/^[A-Z][A-Z0-9_]{3,}$/.test(col1)) sections.formExits.push({ include: col1, routines: col3 });
    } else if (mode === 'appends') {
      // In SD the header row is | Append | Table | System | Description |
      // col2 may contain the base table; otherwise skip
      if (/^[A-Z][A-Z0-9_]+$/.test(col1)) sections.appends.push({ append: col1, baseTable: col2, description: col3 });
    }
  }

  return sections;
}

/* ──────────────────── MCP helpers ──────────────────── */

async function callTool(client, name, args) {
  try {
    const r = await client.callTool({ name, arguments: args });
    const text = r?.content?.[0]?.text;
    if (!text) return { ok: false, error: 'empty response' };
    // Some tools return JSON; others return XML/text. Try parsing JSON, else return raw.
    try { return { ok: true, json: JSON.parse(text), raw: text }; }
    catch { return { ok: true, raw: text }; }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// BAdI — fetch enhancement spot and extract Z/Y implementations.
async function scanBadiImplementations(client, badiName) {
  const r = await callTool(client, 'GetEnhancementSpot', { enhancement_spot_name: badiName });
  if (!r.ok) {
    // Not every row in enhancements.md is a real enhancement spot — some are
    // BAdI definitions. Fall back to a SearchObject lookup and move on silently.
    const s = await callTool(client, 'SearchObject', { query: badiName, objectType: 'BADI', max_results: 5 });
    return { ok: r.ok || s.ok, implementations: [], spot: r.raw || s.raw || null };
  }
  // Try to extract implementation class names from the response text.
  const raw = r.raw || '';
  const impls = new Set();
  // Look for ZCL_IM_*, ZCL_*_IMPL, or Z*_IMPL patterns in the payload
  for (const m of raw.matchAll(/\b([ZY][A-Z0-9_]{2,30})\b/g)) impls.add(m[1]);
  return { ok: true, implementations: [...impls].filter((n) => Z_PATTERN.test(n)) };
}

// SMOD — find CMOD projects (Z/Y namespace) including this enhancement.
async function scanSmodCmod(client, smodName) {
  // MODSAP table maps SMOD enhancement → CMOD project membership.
  // This is metadata (not row business data) and is not in the blocklist.
  const sql = `SELECT NAME, MEMBER FROM MODSAP WHERE MEMBER = '${smodName}'`;
  const r = await callTool(client, 'GetSqlQuery', { sql_query: sql, row_number: 50 });
  if (!r.ok || !r.json) return { ok: false, error: r.error || 'no MODSAP data' };
  const rows = r.json.rows || [];
  const cmodProjects = rows
    .map((row) => row.NAME || row.name)
    .filter((n) => n && Z_PATTERN.test(n));
  return { ok: true, cmodProjects };
}

/** Form-based user exits — check if the include file contains Z forms or
 *  USEREXIT forms with non-empty bodies. Simple heuristic: if GetInclude
 *  returns source longer than a threshold, mark as "customized". */
async function scanFormExit(client, includeName) {
  const r = await callTool(client, 'GetInclude', { include_name: includeName });
  if (!r.ok) return { ok: false };
  const src = r.raw || '';
  // Strip comments; count non-empty, non-* lines
  const meaningful = src
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('*'))
    .length;
  // Heuristic: a "pristine" SAP include is typically a few dozen lines of FORM stubs.
  // Anything >150 lines strongly suggests customer code inside FORMs.
  return { ok: true, customized: meaningful > 150, lineCount: meaningful };
}

// Append structures / custom fields on a base table.
// GetTable returns CDS-DDL in modern systems: `include ci_vbak_zz;` / `include z_append_vbak;`
// Classic SE11 format: `.APPEND.CI_VBAK`
// Accept both.
async function scanTableExtensions(client, baseTable) {
  const r = await callTool(client, 'GetTable', { table_name: baseTable });
  if (!r.ok) return { ok: false, error: r.error };
  const raw = r.raw || '';
  const cdsIncludes = [...raw.matchAll(/\binclude\s+(\w+)/gi)].map((m) => m[1].toUpperCase());
  const seAppends = [...raw.matchAll(/\.APPEND\.\s*([A-Z_][A-Z0-9_]*)/gi)].map((m) => m[1].toUpperCase());
  const allIncludes = [...new Set([...cdsIncludes, ...seAppends])];
  const customAppends = allIncludes.filter((n) => Z_PATTERN.test(n) || /^CI_/.test(n));
  // ZZ_*/YY_* customer fields declared inside the table body
  const zzFields = [...new Set(
    [...raw.matchAll(/\b((?:ZZ?|YY?)_[A-Z0-9_]{2,})\b/gi)].map((m) => m[1].toUpperCase())
  )];
  return { ok: true, appendStructures: customAppends, customFields: zzFields };
}

/* ──────────────────── orchestration ──────────────────── */

async function extractForModule(client, mod) {
  const mdPath = resolve(CONFIGS_DIR, mod, 'enhancements.md');
  const parsed = parseEnhancementsMd(mdPath);
  if (!parsed) {
    console.warn(`[cust] ${mod}: enhancements.md not found — skipping`);
    return null;
  }
  console.log(`[cust] ${mod}: parsed ${parsed.smod.length} SMOD / ${parsed.badi.length} BAdI / ${parsed.formExits.length} form-exits / ${parsed.appends.length} appends`);

  const enhancements = {
    smodExits: [],
    badiImplementations: [],
    formBasedExits: [],
  };
  const extensions = {
    appendStructures: [],
  };

  // 1) BAdI implementations
  for (const b of parsed.badi) {
    const r = await scanBadiImplementations(client, b.name);
    if (r.ok && r.implementations && r.implementations.length > 0) {
      enhancements.badiImplementations.push({
        standardName: b.name,
        description: b.description,
        customs: r.implementations.map((n) => ({ name: n, type: 'CLAS' })),
      });
      console.log(`  ✓ BAdI ${b.name} — ${r.implementations.length} Z impl`);
    }
  }

  // 2) SMOD → CMOD
  for (const s of parsed.smod) {
    const r = await scanSmodCmod(client, s.name);
    if (r.ok && r.cmodProjects && r.cmodProjects.length > 0) {
      enhancements.smodExits.push({
        standardName: s.name,
        description: s.description,
        customs: r.cmodProjects.map((n) => ({ name: n, type: 'CMOD' })),
      });
      console.log(`  ✓ SMOD ${s.name} — CMOD(${r.cmodProjects.join(', ')})`);
    }
  }

  // 3) Form-based user exits
  for (const f of parsed.formExits) {
    const r = await scanFormExit(client, f.include);
    if (r.ok && r.customized) {
      enhancements.formBasedExits.push({
        include: f.include,
        routines: f.routines,
        lineCount: r.lineCount,
      });
      console.log(`  ✓ Form-exit ${f.include} — ${r.lineCount} lines (likely customized)`);
    }
  }

  // 4) Append structures / custom fields on base tables
  const baseTables = [...new Set(parsed.appends.map((a) => a.baseTable).filter((t) => /^[A-Z][A-Z0-9_]+$/.test(t)))];
  for (const tbl of baseTables) {
    const r = await scanTableExtensions(client, tbl);
    if (r.ok && ((r.appendStructures && r.appendStructures.length) || (r.customFields && r.customFields.length))) {
      extensions.appendStructures.push({
        baseTable: tbl,
        appendStructures: r.appendStructures || [],
        customFields: r.customFields || [],
      });
      console.log(`  ✓ Table ${tbl} — ${r.appendStructures.length} append / ${r.customFields.length} Z field`);
    }
  }

  return { enhancements, extensions };
}

async function main() {
  console.log('[cust] Connecting to MCP server...');
  const transport = new StdioClientTransport({ command: 'node', args: [BRIDGE] });
  const client = new Client({ name: 'customization-extractor', version: '1.0.0' });
  await client.connect(transport);
  console.log('[cust] Connected.');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const summary = { modules: [], total: { smod: 0, badi: 0, formExits: 0, extensions: 0 } };

  for (const mod of selectedModules) {
    const res = await extractForModule(client, mod);
    if (!res) continue;
    const modDir = resolve(OUTPUT_DIR, mod);
    mkdirSync(modDir, { recursive: true });

    const enhancementsPath = resolve(modDir, 'enhancements.json');
    const extensionsPath = resolve(modDir, 'extensions.json');

    writeFileSync(enhancementsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      module: mod,
      ...res.enhancements,
    }, null, 2), 'utf-8');
    writeFileSync(extensionsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      module: mod,
      ...res.extensions,
    }, null, 2), 'utf-8');

    summary.modules.push({
      module: mod,
      smodExits: res.enhancements.smodExits.length,
      badiImpls: res.enhancements.badiImplementations.length,
      formExits: res.enhancements.formBasedExits.length,
      tableExtensions: res.extensions.appendStructures.length,
    });
    summary.total.smod += res.enhancements.smodExits.length;
    summary.total.badi += res.enhancements.badiImplementations.length;
    summary.total.formExits += res.enhancements.formBasedExits.length;
    summary.total.extensions += res.extensions.appendStructures.length;
  }

  console.log('\n[cust] === Summary ===');
  for (const m of summary.modules) {
    console.log(`  ${m.module.padEnd(8)} SMOD:${m.smodExits}  BAdI:${m.badiImpls}  FormExit:${m.formExits}  TableExt:${m.tableExtensions}`);
  }
  console.log(`  TOTAL    SMOD:${summary.total.smod}  BAdI:${summary.total.badi}  FormExit:${summary.total.formExits}  TableExt:${summary.total.extensions}`);
  console.log(`  Output: ${OUTPUT_DIR}`);

  await client.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('[cust] Fatal error:', e);
  process.exit(1);
});
