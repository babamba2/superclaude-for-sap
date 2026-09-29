#!/usr/bin/env node

/**
 * sc4sap Setup Maintenance Hook (Setup, matcher: "maintenance")
 * Performs maintenance tasks: cleanup stale state, verify configs.
 *
 * Fires only on `claude -p --maintenance`. Setup discards JSON output and
 * none of its stdout reaches Claude, so the summary is printed as plain text
 * for the stream-json log.
 */

import { existsSync, readFileSync, readdirSync, unlinkSync, statSync } from 'fs';
import { join } from 'path';
import { readStdin } from './lib/stdin.mjs';

const STALE_STATE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function main() {
  try {
    const input = await readStdin();
    let data = {};
    try { data = JSON.parse(input); } catch {}

    const directory = data.cwd || data.directory || process.cwd();
    const messages = [];

    // Clean up stale state files
    const stateDir = join(directory, '.sc4sap', 'state');
    if (existsSync(stateDir)) {
      try {
        const now = Date.now();
        const files = readdirSync(stateDir, { withFileTypes: true });
        let cleanedCount = 0;

        for (const file of files) {
          if (!file.isFile() || !file.name.endsWith('.json')) continue;

          const filePath = join(stateDir, file.name);
          try {
            const stat = statSync(filePath);
            const age = now - stat.mtimeMs;

            if (age > STALE_STATE_AGE_MS) {
              // Check if the state is inactive before removing
              const content = JSON.parse(readFileSync(filePath, 'utf-8'));
              if (!content.active) {
                unlinkSync(filePath);
                cleanedCount++;
              }
            }
          } catch {}
        }

        if (cleanedCount > 0) {
          messages.push(`Cleaned ${cleanedCount} stale state file(s).`);
        }
      } catch {}
    }

    // Verify plugin config integrity
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
    if (pluginRoot) {
      const hooksPath = join(pluginRoot, 'hooks', 'hooks.json');
      if (!existsSync(hooksPath)) {
        messages.push('WARNING: hooks.json not found. Plugin hooks may not be active.');
      }

      const claudeMdPath = join(pluginRoot, 'CLAUDE.md');
      if (!existsSync(claudeMdPath)) {
        messages.push('WARNING: CLAUDE.md not found. SAP development rules may not be enforced.');
      }
    }

    const summary = messages.length > 0
      ? `[SC4SAP Maintenance]\n${messages.join('\n')}`
      : '[SC4SAP] Maintenance check complete. No issues found.';

    console.log(summary);
  } catch (error) {
    console.log(`[SC4SAP] Maintenance failed: ${error?.message ?? error}`);
  }
}

main();
