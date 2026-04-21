#!/usr/bin/env node
/**
 * sc4sap install-hooks — register sc4sap PreToolUse hooks in Claude Code
 * `settings.json`. Installs two hooks:
 *
 *   1. block-forbidden-tables   — row-extraction safety for
 *      `GetTableContents` / `GetSqlQuery`.
 *   2. tier-readonly-guard      — tier-based readonly enforcement (QA/PRD)
 *      for mutation + runtime-execution MCP tools.
 *
 * Usage:
 *   node scripts/install-hooks.mjs              # install into user settings (~/.claude/settings.json)
 *   node scripts/install-hooks.mjs --project    # install into project .claude/settings.json
 *   node scripts/install-hooks.mjs --uninstall  # remove both sc4sap hooks
 *
 * Idempotent: detects each hook by marker (basename) and upserts it. Existing
 * single-hook installs (block-forbidden-tables only) are preserved — the new
 * tier-readonly-guard hook is appended without disturbing them.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a hook script path. Prefers the version-stable marketplace location
 * so upgrades don't leave dead paths in users' settings.json.
 */
function resolveHookScript(basename) {
  const scriptRelative = resolve(__dirname, 'hooks', basename);
  const candidates = [
    resolve(
      homedir(),
      '.claude',
      'plugins',
      'marketplaces',
      'sc4sap',
      'scripts',
      'hooks',
      basename,
    ),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return scriptRelative;
}

const HOOKS = [
  {
    marker: 'block-forbidden-tables.mjs',
    matcher: 'mcp__.*__(GetTableContents|GetSqlQuery)',
    testHint:
      'Test it with a dry-run MCP GetTableContents on BNKA — the call should be denied.',
  },
  {
    marker: 'tier-readonly-guard.mjs',
    matcher:
      'mcp__.*__(Create|Update|Delete|RunUnitTest|RuntimeRunProgramWithProfiling|RuntimeRunClassWithProfiling)',
    testHint:
      'Test it by switching to a QA/PRD profile via /sc4sap:sap-option, then calling an Update* tool — the call should be denied.',
  },
];

const args = new Set(process.argv.slice(2));
const useProject = args.has('--project');
const uninstall = args.has('--uninstall');

const settingsPath = useProject
  ? resolve(process.cwd(), '.claude', 'settings.json')
  : resolve(homedir(), '.claude', 'settings.json');

function loadSettings() {
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch (err) {
    console.error(`[sc4sap] Could not parse ${settingsPath}: ${err.message}`);
    process.exit(1);
  }
}

function saveSettings(obj) {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function findGroup(settings, { marker, matcher }) {
  return settings.hooks.PreToolUse.find(
    (g) =>
      g &&
      g.matcher === matcher &&
      Array.isArray(g.hooks) &&
      g.hooks.some(
        (h) => typeof h?.command === 'string' && h.command.includes(marker),
      ),
  );
}

function installOne(settings, spec) {
  const scriptPath = resolveHookScript(spec.marker);
  const command = `node "${scriptPath.replace(/\\/g, '/')}"`;

  const existing = findGroup(settings, spec);
  if (existing) {
    for (const h of existing.hooks) {
      if (typeof h?.command === 'string' && h.command.includes(spec.marker)) {
        h.command = command;
      }
    }
    return { action: 'updated', command };
  }

  settings.hooks.PreToolUse.push({
    matcher: spec.matcher,
    hooks: [{ type: 'command', command }],
  });
  return { action: 'installed', command };
}

function uninstallOne(settings, spec) {
  const before = settings.hooks.PreToolUse.length;
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
    (g) => !findGroup({ hooks: { PreToolUse: [g] } }, spec),
  );
  return before !== settings.hooks.PreToolUse.length;
}

const settings = loadSettings();
settings.hooks ||= {};
settings.hooks.PreToolUse ||= [];

if (uninstall) {
  let removed = 0;
  for (const spec of HOOKS) {
    if (uninstallOne(settings, spec)) {
      console.log(`[sc4sap] Removed ${spec.marker} hook.`);
      removed++;
    }
  }
  if (removed === 0) {
    console.log('[sc4sap] No sc4sap hooks found — nothing to remove.');
  } else {
    saveSettings(settings);
    console.log(`[sc4sap] Updated ${settingsPath}`);
  }
  process.exit(0);
}

const results = [];
for (const spec of HOOKS) {
  results.push({ spec, result: installOne(settings, spec) });
}
saveSettings(settings);

console.log(`[sc4sap] Updated ${settingsPath}`);
for (const { spec, result } of results) {
  console.log('');
  console.log(`  ${result.action}: ${spec.marker}`);
  console.log(`    matcher: ${spec.matcher}`);
  console.log(`    command: ${result.command}`);
  console.log(`    ${spec.testHint}`);
}
