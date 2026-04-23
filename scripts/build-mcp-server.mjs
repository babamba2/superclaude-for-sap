#!/usr/bin/env node
/**
 * Build script: installs abap-mcp-adt from GitHub into vendor/ at a pinned commit SHA.
 *
 * Usage:
 *   node scripts/build-mcp-server.mjs          # clone + checkout pinned SHA + install + build
 *   node scripts/build-mcp-server.mjs --update # fetch + checkout pinned SHA + rebuild
 *   node scripts/build-mcp-server.mjs --check  # verify installation only
 *
 * Supply-chain notes:
 *   - DEFAULT_PINNED_SHA below is the only vendor revision sc4sap installs. Bump
 *     it (and document the change in release notes) when shipping a vetted vendor
 *     upgrade; end users pick up the new vendor on the next sc4sap update.
 *   - Override with env SC4SAP_MCP_ADT_PIN=<40-hex SHA> for maintainer testing.
 *   - npm is invoked with --ignore-scripts so a compromised transitive dep cannot
 *     run arbitrary code at install time. `npm run build` is still invoked
 *     explicitly because the vendor launcher must be built.
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VENDOR_DIR = resolve(ROOT, 'vendor', 'abap-mcp-adt');
const REPO_URL = 'https://github.com/babamba2/abap-mcp-adt-powerup.git';
const LAUNCHER = resolve(VENDOR_DIR, 'dist', 'server', 'launcher.js');

// Pinned upstream commit of abap-mcp-adt-powerup. Every sc4sap installation
// checks out exactly this SHA so a compromised upstream main cannot push code
// into user machines. Bump this on a vetted vendor upgrade, cut a new sc4sap
// release, document the old → new SHA in release notes.
const DEFAULT_PINNED_SHA = 'b41d4df546e2cccfa3f6693b656e16868b6facb6';
// Env override for maintainers / CI testing an unreleased vendor commit. Must
// be a 40-hex SHA; anything else is rejected so the override cannot be an
// accidental branch name like "main".
const SHA_RE = /^[0-9a-f]{40}$/;
const PINNED_SHA = (() => {
  const override = process.env.SC4SAP_MCP_ADT_PIN;
  if (!override) return DEFAULT_PINNED_SHA;
  if (!SHA_RE.test(override)) {
    console.error(`[sc4sap] SC4SAP_MCP_ADT_PIN must be a 40-hex commit SHA (got ${JSON.stringify(override)}).`);
    process.exit(1);
  }
  console.warn(`[sc4sap] WARNING: using override pin ${override} (default is ${DEFAULT_PINNED_SHA}).`);
  return override;
})();

const args = process.argv.slice(2);
const isUpdate = args.includes('--update');
const isCheck = args.includes('--check');

function run(cmd, cwd) {
  console.log(`[sc4sap] $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function capture(cmd, cwd) {
  return execSync(cmd, { cwd, encoding: 'utf-8' }).trim();
}

// Fetch the pinned SHA (no ref update), hard-checkout to it, verify HEAD matches.
// Uses `git -c advice.detachedHead=false` to suppress the detached-HEAD hint — a
// detached HEAD is exactly what we want here.
function checkoutPinnedSha() {
  run(`git fetch --depth 1 origin ${PINNED_SHA}`, VENDOR_DIR);
  run(`git -c advice.detachedHead=false checkout --detach ${PINNED_SHA}`, VENDOR_DIR);
  const head = capture('git rev-parse HEAD', VENDOR_DIR);
  if (head !== PINNED_SHA) {
    console.error(`[sc4sap] Vendor HEAD mismatch after checkout. expected=${PINNED_SHA} got=${head}`);
    process.exit(1);
  }
  console.log(`[sc4sap] Vendor pinned to ${PINNED_SHA}.`);
}

// Install dependencies without running lifecycle scripts (preinstall / install /
// postinstall). A compromised transitive dep cannot execute arbitrary code during
// install; the vendor's own `npm run build` is still invoked explicitly below.
function installVendorDeps() {
  const hasLock = existsSync(resolve(VENDOR_DIR, 'package-lock.json'));
  if (hasLock) {
    run('npm ci --ignore-scripts --no-audit --no-fund', VENDOR_DIR);
  } else {
    console.warn('[sc4sap] No package-lock.json in vendor — falling back to npm install --ignore-scripts.');
    run('npm install --ignore-scripts --no-audit --no-fund', VENDOR_DIR);
  }
}

// Verify both the launcher AND the pinned SHA. Returns one of:
//   'ok'            — launcher present, HEAD matches PINNED_SHA
//   'drift'         — launcher present, HEAD != PINNED_SHA (user needs --update)
//   'unverified'    — launcher present, vendor has no .git (packaged cache install);
//                     we cannot cryptographically confirm the pin but the install
//                     is likely intact. Treated as a non-fatal WARN by callers.
//   'not_installed' — launcher missing
function checkInstallation() {
  if (!existsSync(LAUNCHER)) {
    console.error('[sc4sap] abap-mcp-adt is NOT installed.');
    console.error('[sc4sap] Fix: node scripts/build-mcp-server.mjs');
    return 'not_installed';
  }

  const gitDir = resolve(VENDOR_DIR, '.git');
  if (!existsSync(gitDir)) {
    console.warn('[sc4sap] abap-mcp-adt launcher present, but vendor has no .git — pin cannot be verified.');
    console.warn(`[sc4sap]   This is normal for packaged cache installs that strip .git.`);
    console.warn(`[sc4sap]   Expected pin: ${PINNED_SHA}`);
    console.warn(`[sc4sap]   To force a verified reinstall: node scripts/build-mcp-server.mjs --update`);
    return 'unverified';
  }

  let head;
  try {
    head = capture('git rev-parse HEAD', VENDOR_DIR);
  } catch (e) {
    console.warn(`[sc4sap] abap-mcp-adt launcher present, but git HEAD read failed (${e.message}).`);
    return 'unverified';
  }

  if (head !== PINNED_SHA) {
    console.error('[sc4sap] abap-mcp-adt vendor drift detected.');
    console.error(`[sc4sap]   expected: ${PINNED_SHA}`);
    console.error(`[sc4sap]   current:  ${head}`);
    console.error('[sc4sap] Fix: node scripts/build-mcp-server.mjs --update');
    return 'drift';
  }

  console.log(`[sc4sap] abap-mcp-adt is installed and pinned to ${PINNED_SHA} ✓`);
  return 'ok';
}

// The plugin-root package.json has "type": "module" because several
// bridge/script files are ESM. The vendor launcher is CommonJS — if vendor's
// own package.json is missing (plugin-pack step can strip files), Node
// inherits "type": "module" and crashes. Write a minimal sentinel to pin
// the vendor subtree to CommonJS.
function ensureVendorPackageJson() {
  const vendorPkg = resolve(VENDOR_DIR, 'package.json');
  if (existsSync(vendorPkg)) return;
  writeFileSync(
    vendorPkg,
    JSON.stringify(
      {
        type: 'commonjs',
        _comment:
          'sc4sap sentinel — overrides parent plugin-root "type": "module" so the CommonJS vendor launcher at dist/server/launcher.js loads correctly under Node 20+.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log('[sc4sap] Wrote vendor/abap-mcp-adt/package.json CommonJS sentinel.');
}

async function main() {
  if (isCheck) {
    const status = checkInstallation();
    // Exit codes consumed by /sc4sap:sap-doctor and /sc4sap:mcp-setup:
    //   0 — ok or unverified (non-fatal; `unverified` surfaces as WARN upstream)
    //   1 — vendor not installed at all
    //   2 — vendor installed but pinned SHA drift
    const exitCode = status === 'not_installed' ? 1 : status === 'drift' ? 2 : 0;
    process.exit(exitCode);
  }

  if (isUpdate) {
    if (!existsSync(resolve(VENDOR_DIR, '.git'))) {
      console.error('[sc4sap] vendor/abap-mcp-adt is not a git repo. Run without --update first.');
      process.exit(1);
    }
    console.log(`[sc4sap] Updating abap-mcp-adt to pinned SHA ${PINNED_SHA}...`);
    const currentHead = capture('git rev-parse HEAD', VENDOR_DIR);
    if (currentHead === PINNED_SHA && existsSync(LAUNCHER)) {
      console.log('[sc4sap] Already at pinned SHA with build artifacts present. Nothing to do.');
      return;
    }
    checkoutPinnedSha();
    installVendorDeps();
    run('npm run build', VENDOR_DIR);
    ensureVendorPackageJson();
    console.log('[sc4sap] Update complete.');
    return;
  }

  // Fresh install
  if (existsSync(LAUNCHER)) {
    console.log('[sc4sap] abap-mcp-adt already installed. Use --update to refresh.');
    return;
  }

  console.log(`[sc4sap] Installing abap-mcp-adt from GitHub (pinned ${PINNED_SHA})...`);
  mkdirSync(resolve(ROOT, 'vendor'), { recursive: true });

  if (existsSync(resolve(VENDOR_DIR, '.git'))) {
    console.log('[sc4sap] Repo exists but not built. Running checkout + install + build...');
  } else {
    // --no-checkout so we never have upstream HEAD on disk; checkoutPinnedSha
    // below fetches and checks out exactly the pinned SHA.
    run(`git clone --no-checkout ${REPO_URL} "${VENDOR_DIR}"`, ROOT);
  }

  checkoutPinnedSha();
  installVendorDeps();
  run('npm run build', VENDOR_DIR);

  if (!existsSync(LAUNCHER)) {
    console.error('[sc4sap] Build completed but launcher not found at expected path.');
    console.error(`[sc4sap] Expected: ${LAUNCHER}`);
    process.exit(1);
  }

  ensureVendorPackageJson();
  console.log('[sc4sap] abap-mcp-adt installed successfully.');
}

main().catch((e) => {
  console.error('[sc4sap] Build failed:', e.message);
  process.exit(1);
});
