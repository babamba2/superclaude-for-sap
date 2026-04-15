#!/usr/bin/env node
/**
 * sc4sap MCP Server Bridge
 *
 * Thin launcher that delegates to the vendor-installed abap-mcp-adt server.
 * Performs preflight checks so that drift between the marketplace source and
 * the running cache, or a missing vendor install, fails fast with a clear
 * message instead of showing a "connected" MCP server that cannot actually
 * answer tool calls.
 *
 * Preflight order:
 *   1. Env file resolution (.sc4sap/sap.env)
 *   2. Plugin version drift warning (cache vs marketplace plugin.json)
 *   3. Vendor launcher existence
 *      - Missing + SC4SAP_MCP_AUTOBUILD=1 → run build script then retry
 *      - Missing + no opt-in            → exit(1) with remediation steps
 *
 * The external server is installed via `/sc4sap:setup` or
 * `node scripts/build-mcp-server.mjs`.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const cp = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const VENDOR_DIR = path.join(PLUGIN_ROOT, 'vendor', 'abap-mcp-adt');
const LAUNCHER = path.join(VENDOR_DIR, 'dist', 'server', 'launcher.js');
const BUILD_SCRIPT = path.join(PLUGIN_ROOT, 'scripts', 'build-mcp-server.mjs');
const PLUGIN_JSON = path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json');

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * Locate the marketplace (source-of-truth) plugin.json that corresponds to
 * this cached plugin. Claude Code's standard layout is:
 *   .../plugins/cache/<plugin>/<plugin>/<version>/  (this file)
 *   .../plugins/marketplaces/<plugin>/              (source)
 * Returns the absolute path to the marketplace plugin.json if found.
 */
function findMarketplacePluginJson() {
  const parts = PLUGIN_ROOT.split(path.sep);
  for (let i = parts.length - 1; i > 0; i--) {
    if (parts[i] === 'cache' && parts[i - 1] === 'plugins') {
      const pluginName = parts[i + 1];
      if (!pluginName) return null;
      const rootSegments = parts.slice(0, i);
      const mp = path.join(
        rootSegments.join(path.sep),
        'marketplaces',
        pluginName,
        '.claude-plugin',
        'plugin.json'
      );
      return fs.existsSync(mp) ? mp : null;
    }
  }
  return null;
}

// --- 1. Resolve env file ---------------------------------------------------

const CWD_ENV = path.join(process.cwd(), '.sc4sap', 'sap.env');
const PLUGIN_ENV = path.join(PLUGIN_ROOT, '.sc4sap', 'sap.env');
const ENV_FILE = fs.existsSync(CWD_ENV) ? CWD_ENV : PLUGIN_ENV;

if (fs.existsSync(ENV_FILE)) {
  process.env.MCP_ENV_PATH = ENV_FILE;
} else {
  console.error('[sc4sap] Config not found. Looked in:');
  console.error(`  - ${CWD_ENV}`);
  console.error(`  - ${PLUGIN_ENV}`);
  console.error('[sc4sap] Run "/sc4sap:setup" in your project directory to configure SAP connection.');
  process.exit(1);
}

// --- 2. Version drift warning (non-fatal) ---------------------------------

const cacheVer = (readJsonSafe(PLUGIN_JSON) || {}).version || 'unknown';
const mpJsonPath = findMarketplacePluginJson();
const mpVer = mpJsonPath ? ((readJsonSafe(mpJsonPath) || {}).version || 'unknown') : null;

if (mpVer && mpVer !== cacheVer) {
  console.error('[sc4sap] ⚠ Plugin version drift detected:');
  console.error(`  Cache (running):    v${cacheVer}   (${PLUGIN_ROOT})`);
  console.error(`  Marketplace (HEAD): v${mpVer}   (${path.dirname(path.dirname(mpJsonPath))})`);
  console.error('  Run /reload-plugins (or restart Claude Code) to pick up the newer source.');
  console.error(`  Continuing with cached v${cacheVer}...`);
  console.error('');
}

// --- 3. Vendor launcher preflight -----------------------------------------

function attemptAutoBuild() {
  console.error('');
  console.error('[sc4sap] SC4SAP_MCP_AUTOBUILD=1 — running build-mcp-server.mjs...');
  console.error('  (this clones abap-mcp-adt-powerup and runs npm install, ~1 minute)');
  try {
    cp.execSync(`node "${BUILD_SCRIPT}"`, { stdio: 'inherit' });
  } catch (e) {
    console.error(`[sc4sap] Auto-build failed: ${e.message}`);
    return false;
  }
  if (!fs.existsSync(LAUNCHER)) {
    console.error('[sc4sap] Auto-build completed but launcher still missing. Check build output above.');
    return false;
  }
  console.error('[sc4sap] Auto-build succeeded. Starting MCP server...');
  console.error('');
  return true;
}

if (!fs.existsSync(LAUNCHER)) {
  console.error('[sc4sap] MCP server cannot start — vendor launcher missing.');
  console.error(`  Plugin version: v${cacheVer}`);
  console.error(`  Expected:       ${LAUNCHER}`);
  console.error('');
  console.error('  Likely cause: the plugin was upgraded without rebuilding vendor/.');
  console.error('  Fix options:');
  console.error(`    1. node "${BUILD_SCRIPT}"`);
  console.error('    2. Run /sc4sap:setup mcp');
  console.error('    3. Set env SC4SAP_MCP_AUTOBUILD=1 and retry');

  if (process.env.SC4SAP_MCP_AUTOBUILD === '1') {
    if (!attemptAutoBuild()) process.exit(1);
  } else {
    process.exit(1);
  }
}

// --- 4. Launch vendor MCP server ------------------------------------------

require(LAUNCHER);
