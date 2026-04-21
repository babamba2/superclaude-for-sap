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
 *   4. Vendor node_modules self-heal
 *      - Launcher present but production deps missing (Claude Code's plugin
 *        install sometimes drops node_modules entries) → run
 *        `npm install --omit=dev` inside vendor/abap-mcp-adt automatically.
 *        Safe and idempotent; no opt-in required so first-time users connect
 *        without manual setup.
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
  // Pull SC4SAP_MCP_AUTOBUILD from sap.env so users can toggle it there.
  // sap.env takes precedence over .mcp.json-injected process.env.
  try {
    const envText = fs.readFileSync(ENV_FILE, 'utf8');
    const m = envText.match(/^\s*SC4SAP_MCP_AUTOBUILD\s*=\s*(.+?)\s*$/m);
    if (m) {
      const v = m[1].replace(/^["']|["']$/g, '').trim();
      process.env.SC4SAP_MCP_AUTOBUILD = v;
    }
  } catch { /* ignore parse errors; fall back to process.env */ }
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

// --- 2b. Vendor module-type sentinel --------------------------------------
// The vendor launcher at dist/server/launcher.js is CommonJS. If vendor's own
// package.json is missing from the cache (Claude Code's plugin-pack step can
// strip files not listed in package.json → "files"), Node walks up the tree,
// finds the plugin-root package.json with "type": "module", and loads the
// launcher as ESM — crashing with `ReferenceError: exports is not defined`.
// Drop a minimal sentinel to override module type for the vendor subtree.
(function ensureVendorPackageJson() {
  const vendorPkg = path.join(VENDOR_DIR, 'package.json');
  if (fs.existsSync(vendorPkg)) return;
  if (!fs.existsSync(VENDOR_DIR)) return; // launcher preflight will handle
  try {
    fs.writeFileSync(
      vendorPkg,
      JSON.stringify(
        {
          type: 'commonjs',
          _comment:
            'sc4sap sentinel — overrides parent plugin-root "type": "module" so the CommonJS vendor launcher at dist/server/launcher.js loads correctly under Node 20+. Auto-written by bridge/mcp-server.cjs when the cache is missing vendor/abap-mcp-adt/package.json.',
        },
        null,
        2,
      ) + '\n',
    );
    console.error('[sc4sap] vendor package.json was missing — wrote CommonJS sentinel to ' + vendorPkg);
  } catch (e) {
    console.error(`[sc4sap] Could not write vendor sentinel package.json: ${e.message}`);
  }
})();

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

// --- 4. Vendor node_modules self-heal -------------------------------------

/**
 * Verify that vendor's production deps are physically present in node_modules.
 * Checks for the dep's package.json rather than just the directory: Claude Code's
 * plugin-pack step on some setups leaves empty node_modules/<dep>/ stubs, which
 * a plain fs.existsSync(dir) would treat as "installed" and skip the self-heal
 * below (issue #27). package.json is the minimum marker of a real install.
 * Returns the first missing package name, or null if all present.
 */
function findMissingDep() {
  const pkgPath = path.join(VENDOR_DIR, 'package.json');
  const pkg = readJsonSafe(pkgPath);
  if (!pkg || !pkg.dependencies) return null;
  const nm = path.join(VENDOR_DIR, 'node_modules');
  for (const dep of Object.keys(pkg.dependencies)) {
    if (!fs.existsSync(path.join(nm, ...dep.split('/'), 'package.json'))) return dep;
  }
  return null;
}

/**
 * Locate the marketplace vendor dir that mirrors this cache vendor.
 * Returns absolute path to .../marketplaces/<plugin>/vendor/abap-mcp-adt or null.
 */
function findMarketplaceVendorDir() {
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
        'vendor',
        'abap-mcp-adt',
      );
      return fs.existsSync(mp) ? mp : null;
    }
  }
  return null;
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isSymbolicLink()) {
      const target = fs.readlinkSync(s);
      try { fs.symlinkSync(target, d); } catch { /* ignore */ }
    } else if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function listAllMissingDeps() {
  const pkg = readJsonSafe(path.join(VENDOR_DIR, 'package.json'));
  if (!pkg || !pkg.dependencies) return [];
  const nm = path.join(VENDOR_DIR, 'node_modules');
  return Object.keys(pkg.dependencies).filter(
    (d) => !fs.existsSync(path.join(nm, ...d.split('/'), 'package.json')),
  );
}

function attemptDepInstall(initialMissing) {
  console.error('');
  console.error(`[sc4sap] Vendor dependency missing: ${initialMissing}`);
  console.error(`[sc4sap] Self-healing vendor in ${VENDOR_DIR}`);
  console.error('  (one-time install, ~30-60s — please wait)');

  // Pass 1: lockfile-based install (cheap, fixes most cases).
  try {
    cp.execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund', {
      cwd: VENDOR_DIR,
      stdio: 'inherit',
    });
  } catch (e) {
    console.error(`[sc4sap] Pass 1 (npm install) failed: ${e.message}`);
  }

  // Pass 2: leftovers from npm-cache/lockfile drift → copy from marketplace
  // vendor if available (it has the full node_modules tree).
  let missing = listAllMissingDeps();
  if (missing.length > 0) {
    const mpVendor = findMarketplaceVendorDir();
    if (mpVendor) {
      console.error(`[sc4sap] Pass 2 — copying ${missing.length} dep(s) from marketplace vendor`);
      const mpNm = path.join(mpVendor, 'node_modules');
      const cacheNm = path.join(VENDOR_DIR, 'node_modules');
      for (const dep of missing) {
        const src = path.join(mpNm, ...dep.split('/'));
        const dest = path.join(cacheNm, ...dep.split('/'));
        if (fs.existsSync(src)) {
          try {
            copyDirSync(src, dest);
            console.error(`  ✓ ${dep}`);
          } catch (e) {
            console.error(`  ✗ ${dep}: ${e.message}`);
          }
        } else {
          console.error(`  ✗ ${dep}: not in marketplace vendor either`);
        }
      }
    } else {
      console.error('[sc4sap] Pass 2 skipped — marketplace vendor not found.');
    }
  }

  missing = listAllMissingDeps();
  if (missing.length > 0) {
    console.error(`[sc4sap] Self-heal incomplete — still missing: ${missing.join(', ')}`);
    return false;
  }
  console.error('[sc4sap] Vendor dependencies installed. Starting MCP server...');
  console.error('');
  return true;
}

const missingDep = findMissingDep();
if (missingDep) {
  if (!attemptDepInstall(missingDep)) {
    console.error('');
    console.error('[sc4sap] Manual recovery:');
    console.error(`  cd "${VENDOR_DIR}"`);
    console.error('  npm install --omit=dev');
    process.exit(1);
  }
}

// --- 5. Launch vendor MCP server ------------------------------------------

require(LAUNCHER);
