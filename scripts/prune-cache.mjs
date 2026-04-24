#!/usr/bin/env node
/**
 * Cache hygiene for sc4sap plugin installs.
 *
 * Claude Code keeps one directory per plugin version under
 *   ~/.claude/plugins/cache/<marketplace>/sc4sap/<version>/
 * and never auto-removes old ones. Each version carries its own
 * vendor/abap-mcp-adt/node_modules/ (~500–800 MB on a full install), so the
 * cache grows unbounded with every plugin update.
 *
 * This script:
 *   1. Resolves the ACTIVE plugin version from the marketplace manifest
 *      (~/.claude/plugins/marketplaces/sc4sap/.claude-plugin/plugin.json).
 *   2. Walks the cache directory for every sc4sap marketplace entry.
 *   3. Lists any cache version directories that do NOT match the active
 *      version ("stale") with their size in MB.
 *   4. In dry-run mode (default) reports only. With `--yes` deletes every
 *      stale directory.
 *
 * Safety rails:
 *   - Never touches the marketplace directory.
 *   - Never touches the active version's cache directory.
 *   - Refuses to run if no active version can be resolved.
 *   - Every delete is logged with its pre-delete size.
 *
 * Exit codes:
 *   0  success (dry-run or delete, with or without findings)
 *   2  cache layout unexpected / active version not resolvable
 *   3  delete error (partial cleanup may have occurred; see stderr)
 *
 * Usage:
 *   node scripts/prune-cache.mjs              # dry-run, human output
 *   node scripts/prune-cache.mjs --json       # dry-run, JSON output
 *   node scripts/prune-cache.mjs --yes        # DELETE stale dirs
 *   node scripts/prune-cache.mjs --yes --json # delete, JSON output
 */

import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = new Set(process.argv.slice(2));
const doDelete = args.has('--yes');
const jsonOut = args.has('--json');

const CLAUDE_ROOT = join(homedir(), '.claude', 'plugins');
const MARKETPLACES_ROOT = join(CLAUDE_ROOT, 'marketplaces');
const CACHE_ROOT = join(CLAUDE_ROOT, 'cache');

function readPluginVersion(pluginDir) {
  const manifest = join(pluginDir, '.claude-plugin', 'plugin.json');
  if (!existsSync(manifest)) return null;
  try {
    const v = JSON.parse(readFileSync(manifest, 'utf8'))?.version;
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function dirSizeBytes(dir) {
  let total = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    try {
      if (e.isDirectory()) total += dirSizeBytes(full);
      else if (e.isFile()) total += statSync(full).size;
    } catch {
      /* broken symlink / permission — ignore */
    }
  }
  return total;
}

function fmtMB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function findActiveVersion() {
  const marketplacePlugin = join(MARKETPLACES_ROOT, 'sc4sap');
  if (!existsSync(marketplacePlugin)) {
    return { error: `marketplace path missing: ${marketplacePlugin}` };
  }
  const version = readPluginVersion(marketplacePlugin);
  if (!version) {
    return {
      error:
        'could not read version from ' +
        join(marketplacePlugin, '.claude-plugin', 'plugin.json'),
    };
  }
  return { version };
}

// Cache layout: ~/.claude/plugins/cache/<marketplace-name>/sc4sap/<version>/
// We match by plugin name "sc4sap" (directory 2) to stay agnostic of how the
// marketplace was registered.
function findCacheVersions() {
  if (!existsSync(CACHE_ROOT)) return [];
  const results = [];
  for (const marketplace of readdirSync(CACHE_ROOT, { withFileTypes: true })) {
    if (!marketplace.isDirectory()) continue;
    const pluginRoot = join(CACHE_ROOT, marketplace.name, 'sc4sap');
    if (!existsSync(pluginRoot)) continue;
    for (const ver of readdirSync(pluginRoot, { withFileTypes: true })) {
      if (!ver.isDirectory()) continue;
      results.push({
        marketplace: marketplace.name,
        version: ver.name,
        path: join(pluginRoot, ver.name),
      });
    }
  }
  return results;
}

function main() {
  const { version: activeVersion, error } = findActiveVersion();
  if (error) {
    if (jsonOut) {
      process.stdout.write(JSON.stringify({ ok: false, error }) + '\n');
    } else {
      process.stderr.write(`[prune-cache] ERROR: ${error}\n`);
      process.stderr.write(
        `[prune-cache] refusing to prune without a resolved active version.\n`,
      );
    }
    process.exit(2);
  }

  const cacheVersions = findCacheVersions();

  const rows = cacheVersions.map((c) => {
    const sizeBytes = dirSizeBytes(c.path);
    const stale = c.version !== activeVersion;
    return { ...c, sizeBytes, stale };
  });

  const stale = rows.filter((r) => r.stale);
  const totalStaleBytes = stale.reduce((s, r) => s + r.sizeBytes, 0);

  const summary = {
    ok: true,
    activeVersion,
    cacheVersions: rows.map((r) => ({
      marketplace: r.marketplace,
      version: r.version,
      sizeBytes: r.sizeBytes,
      stale: r.stale,
      path: r.path,
    })),
    staleCount: stale.length,
    totalStaleBytes,
    deleted: [],
    deleteErrors: [],
  };

  if (!doDelete) {
    if (jsonOut) {
      process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    } else {
      printHuman(summary, { dryRun: true });
    }
    process.exit(0);
  }

  // Delete phase.
  for (const r of stale) {
    try {
      rmSync(r.path, { recursive: true, force: true });
      summary.deleted.push({ version: r.version, reclaimedBytes: r.sizeBytes });
    } catch (e) {
      summary.deleteErrors.push({ version: r.version, error: e.message });
    }
  }

  if (jsonOut) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    printHuman(summary, { dryRun: false });
  }
  process.exit(summary.deleteErrors.length > 0 ? 3 : 0);
}

function printHuman(summary, { dryRun }) {
  const bar = '─'.repeat(62);
  console.log(bar);
  console.log(`sc4sap cache hygiene`);
  console.log(bar);
  console.log(`Active version:        ${summary.activeVersion}`);
  console.log(`Cache entries:         ${summary.cacheVersions.length}`);
  console.log(`Stale versions:        ${summary.staleCount}`);
  console.log(`Total stale size:      ${fmtMB(summary.totalStaleBytes)}`);
  console.log(bar);
  for (const c of summary.cacheVersions) {
    const tag = c.stale ? 'STALE' : 'ACTIVE';
    console.log(`  [${tag.padEnd(6)}] ${c.version.padEnd(10)} ${fmtMB(c.sizeBytes).padStart(10)}  ${c.path}`);
  }
  console.log(bar);

  if (summary.staleCount === 0) {
    console.log('Cache is clean — nothing to prune.');
    return;
  }

  if (dryRun) {
    console.log('This was a DRY RUN. Nothing was deleted.');
    console.log('To actually delete the stale versions above:');
    console.log('  node scripts/prune-cache.mjs --yes');
  } else {
    console.log(`Deleted ${summary.deleted.length} of ${summary.staleCount} stale version(s).`);
    for (const d of summary.deleted) {
      console.log(`  ✓ ${d.version} — reclaimed ${fmtMB(d.reclaimedBytes)}`);
    }
    for (const e of summary.deleteErrors) {
      console.log(`  ✗ ${e.version} — ${e.error}`);
    }
  }
}

main();
