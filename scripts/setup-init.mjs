#!/usr/bin/env node

/**
 * sc4sap Setup Init Hook (Setup, matcher: "init")
 * Runs initial setup when a new sc4sap project is initialized.
 * Creates .sc4sap directory structure and default configuration.
 *
 * Fires only on `claude --init-only` / `claude -p --init`, never on a normal
 * session start. Setup discards JSON output and none of its stdout reaches
 * Claude, so the result is printed as plain text for the stream-json log.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { readStdin } from './lib/stdin.mjs';

async function main() {
  try {
    const input = await readStdin();
    let data = {};
    try { data = JSON.parse(input); } catch {}

    const directory = data.cwd || data.directory || process.cwd();

    // Create .sc4sap directory structure
    const dirs = [
      join(directory, '.sc4sap'),
      join(directory, '.sc4sap', 'state'),
      join(directory, '.sc4sap', 'skills'),
      join(directory, '.sc4sap', 'research'),
      join(directory, '.sc4sap', 'logs'),
    ];

    for (const dir of dirs) {
      if (!existsSync(dir)) {
        try { mkdirSync(dir, { recursive: true }); } catch {}
      }
    }

    // Create default notepad if it doesn't exist
    const notepadPath = join(directory, '.sc4sap', 'notepad.md');
    if (!existsSync(notepadPath)) {
      try {
        writeFileSync(notepadPath, `# SC4SAP Project Notepad

## Priority Context
<!-- High-priority context that survives compaction -->

## Working Memory
<!-- Transient notes from the current work session -->

## SAP Objects
<!-- Track SAP objects being worked on -->

## Transport Requests
<!-- Active transport requests -->
`, { mode: 0o600 });
      } catch {}
    }

    // Create default project memory if it doesn't exist
    const memoryPath = join(directory, '.sc4sap', 'project-memory.json');
    if (!existsSync(memoryPath)) {
      try {
        writeFileSync(memoryPath, JSON.stringify({
          techStack: { languages: ['ABAP'], frameworks: ['SAP'] },
          sapModules: [],
          userDirectives: [],
          customNotes: [],
          scannedAt: new Date().toISOString()
        }, null, 2), { mode: 0o600 });
      } catch {}
    }

    console.log('[SC4SAP] Project initialized. .sc4sap directory structure created.');
  } catch (error) {
    console.log(`[SC4SAP] Project init failed: ${error?.message ?? error}`);
  }
}

main();
