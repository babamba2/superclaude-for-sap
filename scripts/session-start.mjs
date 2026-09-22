#!/usr/bin/env node

/**
 * sc4sap Session Start Hook
 * Injects the SAP development reminder and notepad Priority Context on session start.
 * Adapted from OMC session-start.mjs.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { readStdin } from './lib/stdin.mjs';

async function main() {
  try {
    const input = await readStdin();
    let data = {};
    try { data = JSON.parse(input); } catch {}

    const directory = data.cwd || data.directory || process.cwd();
    const sessionId = data.session_id || data.sessionId || '';
    const messages = [];

    // Inject SAP development context reminder
    messages.push(`<system-reminder>
[SC4SAP] SuperClaude for SAP is active. SAP development standards enforced:
- Custom objects require Z/Y prefix
- All changes must be assigned to transport requests
- Objects must be activated after creation/modification
- Use MCP ABAP ADT tools for all SAP system interactions
- Follow ABAP Clean Code guidelines
</system-reminder>

---
`);

    // Check for notepad Priority Context
    const notepadPath = join(directory, '.sc4sap', 'notepad.md');
    if (existsSync(notepadPath)) {
      try {
        const notepadContent = readFileSync(notepadPath, 'utf-8');
        const priorityMatch = notepadContent.match(/## Priority Context\n([\s\S]*?)(?=## |$)/);
        if (priorityMatch && priorityMatch[1].trim()) {
          const cleanContent = priorityMatch[1].trim().replace(/<!--[\s\S]*?-->/g, '').trim();
          if (cleanContent) {
            messages.push(`<notepad-context>
[NOTEPAD - Priority Context]
${cleanContent}
</notepad-context>`);
          }
        }
      } catch {}
    }

    if (messages.length > 0) {
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: messages.join('\n')
        }
      }));
    } else {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  } catch (error) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
