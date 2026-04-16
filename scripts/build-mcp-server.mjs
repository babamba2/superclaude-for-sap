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
const DEFAULT_PINNED_SHA = 'f21b3428fc3c9fc08cf9450e480c1e7dec2a52fc';
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

function checkInstallation() {
  if (!existsSync(LAUNCHER)) {
    console.error('[sc4sap] abap-mcp-adt is NOT installed.');
    return false;
  }
  console.log('[sc4sap] abap-mcp-adt is installed and built.');
  return true;
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
    const ok = checkInstallation();
    process.exit(ok ? 0 : 1);
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
