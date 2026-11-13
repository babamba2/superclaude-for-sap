#!/usr/bin/env node

/**
 * sc4sap Session Start Hook
 * Injects the SAP development reminder and notepad Priority Context on session start.
 * Adapted from OMC session-start.mjs.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readStdin } from './lib/stdin.mjs';
import { offlineReminder } from './lib/offline-reminder.mjs';

const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// Plain-chat → skill routing digest; single source is common/skill-router.md.
function skillRouterDigest(root = PLUGIN_ROOT) {
  try {
    const md = readFileSync(join(root, 'common', 'skill-router.md'), 'utf-8');
    const m = md.match(/<!-- skill-router:start -->\r?\n([\s\S]*?)\r?\n<!-- skill-router:end -->/);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

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

    const router = skillRouterDigest();
    if (router) messages.push(`<system-reminder>\n${router}\n</system-reminder>\n`);

    const offline = offlineReminder(directory);
    if (offline) messages.push(offline);

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
