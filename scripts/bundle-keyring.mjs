#!/usr/bin/env node
/**
 * Bundle keyring script.
 *
 * Copies @napi-rs/keyring and its platform-specific native binaries from the
 * development node_modules into runtime-deps/keyring/node_modules/ so that
 * end users receive a working keychain integration via plain `git clone`
 * (Claude Code's plugin installer does not run `npm install`).
 *
 * Usage:
 *   node scripts/bundle-keyring.mjs                     # refresh from current node_modules
 *   node scripts/bundle-keyring.mjs --check             # verify bundle completeness, exit 0/1
 *   node scripts/bundle-keyring.mjs --refresh-integrity # regenerate integrity.json from package-lock + bundle
 *   node scripts/bundle-keyring.mjs --verify            # offline tamper check against integrity.json
 *
 * Platforms the bundle should cover (full list):
 *   - @napi-rs/keyring-win32-x64-msvc
 *   - @napi-rs/keyring-darwin-x64
 *   - @napi-rs/keyring-darwin-arm64
 *   - @napi-rs/keyring-linux-x64-gnu
 *
 * Each platform binary must be installed locally BEFORE running the default
 * bundle/refresh-integrity modes. On Windows, only keyring-win32-x64-msvc is
 * installed by a plain `npm install`. To fetch the others:
 *
 *   npm install --no-save --force \
 *     @napi-rs/keyring-darwin-x64 \
 *     @napi-rs/keyring-darwin-arm64 \
 *     @napi-rs/keyring-linux-x64-gnu
 *
 * (The --force is required because each sub-package declares a specific
 * os/cpu combination and npm would otherwise skip non-matching ones.)
 *
 * Integrity model:
 *   - integrity.json captures two kinds of hashes per bundled package:
 *       npmIntegrity  sha512 copied verbatim from package-lock.json
 *                     (provenance — proves the bundle originated from a
 *                     specific npm registry tarball the maintainer installed)
 *       files         per-file sha256 of the bytes currently on disk in
 *                     runtime-deps/keyring/node_modules/@napi-rs/<pkg>/
 *                     (tamper detection — --verify recomputes and compares)
 *   - --verify runs entirely offline and fails if any file was added,
 *     removed, or modified since the last --refresh-integrity run.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC_NAPI = join(ROOT, 'node_modules', '@napi-rs');
const DST_NAPI = join(ROOT, 'runtime-deps', 'keyring', 'node_modules', '@napi-rs');
const INTEGRITY_PATH = join(ROOT, 'runtime-deps', 'keyring', 'integrity.json');
const LOCK_PATH = join(ROOT, 'package-lock.json');

const REQUIRED_CORE = 'keyring';
const PLATFORMS = [
  'keyring-win32-x64-msvc',
  'keyring-darwin-x64',
  'keyring-darwin-arm64',
  'keyring-linux-x64-gnu',
];
const ALL_PACKAGES = [REQUIRED_CORE, ...PLATFORMS];

const args = process.argv.slice(2);
const mode = args.includes('--verify')
  ? 'verify'
  : args.includes('--refresh-integrity')
    ? 'refresh-integrity'
    : args.includes('--check')
      ? 'check'
      : 'bundle';

function has(pkg) {
  return existsSync(join(SRC_NAPI, pkg));
}
function hasBundled(pkg) {
  return existsSync(join(DST_NAPI, pkg));
}

function sha256File(path) {
  const buf = readFileSync(path);
  return `sha256-${createHash('sha256').update(buf).digest('base64')}`;
}

function listBundleFiles(bundleDir) {
  const out = [];
  (function walk(dir, rel) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, relPath);
      else if (entry.isFile()) out.push(relPath);
    }
  })(bundleDir, '');
  out.sort();
  return out;
}

function loadPackageLock() {
  try {
    return JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
  } catch (e) {
    console.error(`[bundle-keyring] cannot read package-lock.json: ${e.message}`);
    process.exit(4);
  }
}

function lockLookup(lock, pkg) {
  const entry = lock.packages?.[`node_modules/@napi-rs/${pkg}`];
  if (!entry) return null;
  return {
    version: entry.version,
    npmIntegrity: entry.integrity || null,
    resolved: entry.resolved || null,
  };
}

if (mode === 'check') {
  const missing = ALL_PACKAGES.filter((p) => !hasBundled(p));
  if (missing.length === 0) {
    console.log('[bundle-keyring] Bundle OK — all packages present.');
    process.exit(0);
  }
  console.error(`[bundle-keyring] Bundle INCOMPLETE — missing: ${missing.join(', ')}`);
  console.error(
    '[bundle-keyring] Fix: npm install --no-save --force <missing> && node scripts/bundle-keyring.mjs',
  );
  process.exit(1);
}

if (mode === 'verify') {
  if (!existsSync(INTEGRITY_PATH)) {
    console.error(`[bundle-keyring] integrity.json not found: ${INTEGRITY_PATH}`);
    console.error('[bundle-keyring] Fix: node scripts/bundle-keyring.mjs --refresh-integrity');
    process.exit(7);
  }
  const doc = JSON.parse(readFileSync(INTEGRITY_PATH, 'utf8'));
  const problems = [];
  let filesChecked = 0;
  for (const [key, meta] of Object.entries(doc.entries || {})) {
    const atIdx = key.lastIndexOf('@');
    const pkg = key.slice('@napi-rs/'.length, atIdx);
    const bundleDir = join(DST_NAPI, pkg);
    if (!existsSync(bundleDir)) {
      problems.push(`${key}: bundle dir missing`);
      continue;
    }
    const actualFiles = new Set(listBundleFiles(bundleDir));
    const expectedFiles = new Set(Object.keys(meta.files || {}));
    for (const f of expectedFiles) {
      if (!actualFiles.has(f)) problems.push(`${key}: missing file ${f}`);
    }
    for (const f of actualFiles) {
      if (!expectedFiles.has(f)) problems.push(`${key}: unexpected file ${f}`);
    }
    for (const f of expectedFiles) {
      if (!actualFiles.has(f)) continue;
      filesChecked += 1;
      const actual = sha256File(join(bundleDir, f));
      if (actual !== meta.files[f]) {
        problems.push(
          `${key}: hash mismatch for ${f}\n      expected ${meta.files[f]}\n      actual   ${actual}`,
        );
      }
    }
  }
  if (problems.length === 0) {
    console.log(
      `[bundle-keyring] Integrity OK — ${filesChecked} files verified across ${Object.keys(doc.entries || {}).length} packages.`,
    );
    process.exit(0);
  }
  console.error(`[bundle-keyring] Integrity FAILED — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '[bundle-keyring] If the mismatch is intended (bundle updated), run: node scripts/bundle-keyring.mjs --refresh-integrity',
  );
  process.exit(8);
}

if (mode === 'refresh-integrity') {
  const lock = loadPackageLock();
  const entries = {};
  for (const pkg of ALL_PACKAGES) {
    const bundleDir = join(DST_NAPI, pkg);
    if (!existsSync(bundleDir)) {
      console.error(`[bundle-keyring] bundle missing package: ${pkg}`);
      console.error('[bundle-keyring] Run the bundler (default mode) first.');
      process.exit(5);
    }
    const lockEntry = lockLookup(lock, pkg);
    if (!lockEntry) {
      console.error(`[bundle-keyring] package-lock.json has no entry for @napi-rs/${pkg}`);
      process.exit(6);
    }
    const files = {};
    for (const rel of listBundleFiles(bundleDir)) {
      files[rel] = sha256File(join(bundleDir, rel));
    }
    const key = `@napi-rs/${pkg}@${lockEntry.version}`;
    entries[key] = {
      npmIntegrity: lockEntry.npmIntegrity,
      resolved: lockEntry.resolved,
      files,
    };
    console.log(`[bundle-keyring] recorded: ${key} (${Object.keys(files).length} files)`);
  }
  const doc = {
    schema: 1,
    generated: new Date().toISOString(),
    source: 'package-lock.json + runtime-deps/keyring/node_modules/',
    entries,
  };
  writeFileSync(INTEGRITY_PATH, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  console.log(`[bundle-keyring] wrote: ${INTEGRITY_PATH}`);
  process.exit(0);
}

// mode === 'bundle' (default)
if (!existsSync(SRC_NAPI)) {
  console.error(`[bundle-keyring] Source not found: ${SRC_NAPI}`);
  console.error('[bundle-keyring] Run `npm install` in the plugin root first.');
  process.exit(1);
}

mkdirSync(DST_NAPI, { recursive: true });

function copyPackage(pkg, { required }) {
  const src = join(SRC_NAPI, pkg);
  const dst = join(DST_NAPI, pkg);
  if (!has(pkg)) {
    if (required) {
      console.error(`[bundle-keyring] MISSING required package: ${pkg}`);
      process.exit(2);
    }
    console.warn(`[bundle-keyring] skip (not installed): ${pkg}`);
    return false;
  }
  if (existsSync(dst)) rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true, dereference: true });
  console.log(`[bundle-keyring] copied: ${pkg}`);
  return true;
}

copyPackage(REQUIRED_CORE, { required: true });
let platformsCopied = 0;
for (const p of PLATFORMS) {
  if (copyPackage(p, { required: false })) platformsCopied += 1;
}

if (platformsCopied === 0) {
  console.error('[bundle-keyring] ERROR: no platform binaries copied — bundle would be useless');
  process.exit(3);
}

if (platformsCopied < PLATFORMS.length) {
  console.warn(
    `[bundle-keyring] WARNING: ${platformsCopied}/${PLATFORMS.length} platforms bundled. ` +
      `Missing platforms will fall back to plaintext at runtime.`,
  );
}

console.log('[bundle-keyring] Done.');
console.log(
  '[bundle-keyring] Next: node scripts/bundle-keyring.mjs --refresh-integrity to update integrity.json',
);
