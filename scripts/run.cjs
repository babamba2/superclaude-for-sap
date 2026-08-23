#!/usr/bin/env node
/**
 * Script runner for sc4sap hook scripts.
 * Executes the specified ESM script, forwarding the hook payload (stdin)
 * to the child and streaming its stdout/stderr straight through so
 * Claude Code receives the hook output.
 * Usage: node run.cjs <script-path> [args...]
 */
'use strict';

const { spawn } = require('child_process');
const path = require('path');

const scriptPath = process.argv[2];
if (!scriptPath) {
  process.exit(0);
}

const args = process.argv.slice(3);
const resolved = path.resolve(scriptPath);

// stdio: 'inherit' wires the child directly to our stdin/stdout/stderr.
// This is critical: hook scripts read their JSON payload from stdin, and
// Claude Code reads their result from stdout. Buffering via execFile (the
// previous implementation) never forwarded stdin, so every stdin-reading
// hook stalled until its internal readStdin() timeout and then received an
// empty payload.
const child = spawn('node', ['--experimental-vm-modules', resolved, ...args], {
  env: { ...process.env },
  stdio: 'inherit',
});

// Safety net: never let a hung child block the session indefinitely.
const killer = setTimeout(() => {
  try { child.kill(); } catch {}
}, 30000);
if (typeof killer.unref === 'function') killer.unref();

child.on('exit', () => {
  clearTimeout(killer);
  // Hook scripts should not block the user's workflow on failure.
  process.exit(0);
});

child.on('error', (error) => {
  clearTimeout(killer);
  if (process.env.SC4SAP_DEBUG) {
    console.error(`[sc4sap] Script error: ${error.message}`);
  }
  process.exit(0);
});
