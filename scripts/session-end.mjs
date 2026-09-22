#!/usr/bin/env node

/**
 * sc4sap Session End Hook
 * Performs cleanup tasks when a session ends.
 * Adapted from OMC session-end.mjs.
 *
 * Logs a session summary to .sc4sap/logs/.
 */

import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { readStdin } from './lib/stdin.mjs';

async function main() {
  try {
    const input = await readStdin(1000);
    let data = {};
    try { data = JSON.parse(input); } catch {}

    const directory = data.cwd || data.directory || process.cwd();
    const sessionId = data.session_id || data.sessionId || '';

    // Log session summary
    const logsDir = join(directory, '.sc4sap', 'logs');
    if (!existsSync(logsDir)) {
      try { mkdirSync(logsDir, { recursive: true }); } catch {}
    }

    const sessionLog = {
      session_id: sessionId,
      ended_at: new Date().toISOString(),
      directory,
    };

    // Append to daily log
    const today = new Date().toISOString().split('T')[0];
    const logFile = join(logsDir, `sessions-${today}.jsonl`);
    try {
      const logLine = JSON.stringify(sessionLog) + '\n';
      const { appendFileSync } = await import('fs');
      appendFileSync(logFile, logLine);
    } catch {}

    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch (error) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
