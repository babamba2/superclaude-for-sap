#!/usr/bin/env node

/**
 * sc4sap Code Simplifier Stop Hook
 * Intercepts Stop events to suggest code review for recently modified files.
 * Adapted from OMC code-simplifier.mjs.
 *
 * Opt-in via .sc4sap/config.json: { "codeSimplifier": { "enabled": true } }
 * Default: disabled
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readStdin } from './lib/stdin.mjs';
import { readActiveConfigJson } from './lib/profile-resolve.mjs';

function readJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function readConfig(directory) {
  // Multi-profile: prefer the active profile's config.json (falls through to
  // legacy project `.sc4sap/config.json` when no active-profile.txt exists).
  const active = readActiveConfigJson(directory);
  if (active?.config?.codeSimplifier?.enabled) return active.config;

  // Global user-home fallback — `~/.sc4sap/config.json` — retained for users
  // who configured the opt-in there before the multi-profile migration.
  const globalConfig = readJsonFile(join(homedir(), '.sc4sap', 'config.json'));
  return globalConfig;
}

async function main() {
  try {
    const input = await readStdin();
    let data = {};
    try { data = JSON.parse(input); } catch {}

    const directory = data.cwd || data.directory || process.cwd();
    const config = readConfig(directory);

    if (!config?.codeSimplifier?.enabled) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    // Only suggest simplification, don't auto-execute
    console.log(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: '[SC4SAP] Code simplifier is enabled. Consider reviewing recently modified ABAP objects for clean code compliance before releasing transports.'
      }
    }));
  } catch (error) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
