#!/usr/bin/env node
/**
 * sc4sap install-hooks — register the data-extraction PreToolUse hook in the
 * user's Claude Code `settings.json`.
 *
 * Usage:
 *   node scripts/install-hooks.mjs              # install into user settings (~/.claude/settings.json)
 *   node scripts/install-hooks.mjs --project    # install into project .claude/settings.json
 *   node scripts/install-hooks.mjs --uninstall  # remove the hook
 *
 * Idempotent: detects the sc4sap hook by command substring and upserts it.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve the hook script path. Prefer the marketplace path (~/.claude/plugins/
// marketplaces/sc4sap/...) because it is version-stable — the per-version cache
// (plugins/cache/sc4sap/sc4sap/<version>/) rotates on every plugin upgrade and
// leaves behind dead paths in users' settings.json, causing the hook to crash
// with MODULE_NOT_FOUND and silently fall through ("non-blocking").
//
// If this script was invoked from a path that already sits under the marketplace
// tree, or if the marketplace plugin-root can be located, anchor to that.
// Otherwise, fall back to the script-relative path (legacy behaviour).
function resolveHookScript() {
  const scriptRelative = resolve(__dirname, 'hooks', 'block-forbidden-tables.mjs');

  // Try the well-known marketplace path first.
  const candidates = [
    resolve(homedir(), '.claude', 'plugins', 'marketplaces', 'sc4sap', 'scripts', 'hooks', 'block-forbidden-tables.mjs'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return scriptRelative;
}

const HOOK_SCRIPT = resolveHookScript();
const HOOK_MATCHER = 'mcp__.*__(GetTableContents|GetSqlQuery)';
const HOOK_MARKER = 'block-forbidden-tables.mjs';

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
  writeFileSync(settingsPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

const settings = loadSettings();
settings.hooks ||= {};
settings.hooks.PreToolUse ||= [];

// Find existing sc4sap group (by matcher + marker).
let group = settings.hooks.PreToolUse.find(
  (g) =>
    g && g.matcher === HOOK_MATCHER &&
    Array.isArray(g.hooks) &&
    g.hooks.some((h) => typeof h?.command === 'string' && h.command.includes(HOOK_MARKER)),
);

if (uninstall) {
  if (!group) {
    console.log('[sc4sap] No sc4sap hook found — nothing to remove.');
    process.exit(0);
  }
  settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter((g) => g !== group);
  saveSettings(settings);
  console.log(`[sc4sap] Removed hook from ${settingsPath}`);
  process.exit(0);
}

const command = `node "${HOOK_SCRIPT.replace(/\\/g, '/')}"`;

if (group) {
  // Update the command path in case the plugin moved.
  for (const h of group.hooks) {
    if (typeof h?.command === 'string' && h.command.includes(HOOK_MARKER)) {
      h.command = command;
    }
  }
} else {
  settings.hooks.PreToolUse.push({
    matcher: HOOK_MATCHER,
    hooks: [{ type: 'command', command }],
  });
}

saveSettings(settings);
console.log(`[sc4sap] Installed PreToolUse hook in ${settingsPath}`);
console.log(`        matcher: ${HOOK_MATCHER}`);
console.log(`        command: ${command}`);
console.log('');
console.log('Test it with a dry-run MCP GetTableContents on BNKA — the call should be denied.');
