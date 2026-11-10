#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — Evidence guard.
 *
 * Denies agent writes to the evidence ledger (`.sc4sap/evidence/`) and to
 * `receipt.json` files, so the receipt can only come from build-receipt.mjs.
 *
 *   Write / Edit / MultiEdit / NotebookEdit → deny when the target path is protected.
 *   Bash / PowerShell → deny when the command names a protected path, unless the
 *   command only runs build-receipt.mjs. Reading these files goes through Read.
 *
 * Limit: a determined agent could still write a script elsewhere and run it.
 * The guard stops the easy paths; the user's check in the TCode stays the final gate.
 * Fails open on parse errors.
 */

import { readStdin } from '../lib/stdin.mjs';

const PROTECTED = /\.sc4sap[\\/]+(?:evidence(?:[\\/]|\b)|program[\\/]+[^\\/\s"']+[\\/]+receipt\.json)/i;
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

export function decide(payload) {
  const tool = payload?.tool_name;
  const input = payload?.tool_input || {};
  if (FILE_TOOLS.has(tool)) {
    const p = String(input.file_path || input.notebook_path || '');
    return PROTECTED.test(p) ? `${p} is written only by the sc4sap evidence hook / build-receipt.mjs` : null;
  }
  if (SHELL_TOOLS.has(tool)) {
    const cmd = String(input.command || '');
    if (!PROTECTED.test(cmd)) return null;
    const onlyBuilder = /^\s*node\s+("[^"]*build-receipt\.mjs"|\S*build-receipt\.mjs)(\s+[\w\-,.:\\/"]+)*\s*$/.test(cmd);
    return onlyBuilder ? null : 'evidence ledger and receipt.json are protected; use the Read tool to read them and build-receipt.mjs to write the receipt';
  }
  return null;
}

async function main() {
  let reason = null;
  if (process.env.DISABLE_SC4SAP !== '1') {
    try {
      reason = decide(JSON.parse(await readStdin()));
    } catch {
      reason = null;
    }
  }
  if (!reason) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  console.log(
    JSON.stringify({
      continue: true,
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `sc4sap evidence guard: ${reason}` },
    })
  );
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/evidence/guard.mjs')) main();
