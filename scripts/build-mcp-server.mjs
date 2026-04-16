#!/usr/bin/env node
/**
 * Build script: installs abap-mcp-adt from GitHub into vendor/
 *
 * Usage:
 *   node scripts/build-mcp-server.mjs          # clone + install + build
 *   node scripts/build-mcp-server.mjs --update  # git pull + rebuild
 *   node scripts/build-mcp-server.mjs --check   # verify installation only
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

const args = process.argv.slice(2);
const isUpdate = args.includes('--update');
const isCheck = args.includes('--check');

function run(cmd, cwd) {
  console.log(`[sc4sap] $ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
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
    console.log('[sc4sap] Updating abap-mcp-adt...');
    run('git pull --ff-only', VENDOR_DIR);
    run('npm install', VENDOR_DIR);
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

  console.log('[sc4sap] Installing abap-mcp-adt from GitHub...');
  mkdirSync(resolve(ROOT, 'vendor'), { recursive: true });

  if (existsSync(resolve(VENDOR_DIR, '.git'))) {
    console.log('[sc4sap] Repo exists but not built. Running install + build...');
  } else {
    run(`git clone ${REPO_URL} "${VENDOR_DIR}"`, ROOT);
  }

  run('npm install', VENDOR_DIR);
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
