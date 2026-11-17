#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — Evidence guard.
 *
 * Denies agent writes to the evidence ledger (`.sc4sap/evidence/`) and to
 * `receipt.json` files, so the receipt can only come from build-receipt.mjs; and to the
 * program-test run files the capture hook / pt.mjs write (state, captured rows and source,
 * generated harness, pt-receipt).
 *
 *   Write / Edit / MultiEdit / NotebookEdit → deny when the target path is protected.
 *   Bash / PowerShell → deny when the command names a protected path, unless the
 *   command only runs build-receipt.mjs or program-test/pt.mjs. Reading these files goes through Read.
 *
 * Limit: a determined agent could still write a script elsewhere and run it.
 * The guard stops the easy paths; the user's check in the TCode stays the final gate.
 * Fails open on parse errors.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readStdin } from '../lib/stdin.mjs';

// The one pt.mjs allowed to write program-test run files: this plugin's own copy, resolved from
// this file's location — a copy written elsewhere does not pass.
const PT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'program-test', 'pt.mjs');
const normPath = (p) => resolve(p).replace(/\\/g, '/').toLowerCase();

/** True when the command only runs the plugin's own pt.mjs (absolute, or relative to the cwd) with plain arguments. */
export function onlyPluginPt(cmd, cwd) {
  const m = String(cmd).match(/^\s*node\s+(?:"([^"]+)"|(\S+))((?:\s+[\w\-,.:\\/"]+)*)\s*$/);
  if (!m) return false;
  const script = m[1] ?? m[2];
  if (!/pt\.mjs$/i.test(script)) return false;
  return normPath(resolve(cwd || process.cwd(), script)) === normPath(PT_PATH);
}

const PROTECTED = /\.sc4sap[\\/]+(?:evidence(?:[\\/]|\b)|program[\\/]+[^\\/\s"']+[\\/]+receipt\.json|(?:work[\\/]+[^\\/\s"']+[\\/]+)?program[\\/]+[^\\/\s"']+[\\/]+test[\\/]+[^\\/\s"']+[\\/]+(?:state\.json|capture\.jsonl|fingerprints\.json|pt-receipt\.json|rows(?:[\\/]|\b)|src(?:[\\/]|\b)|ddic(?:[\\/]|\b)|harness(?:[\\/]|\b))|program-test[\\/]+active\.json)/i;
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
    return onlyBuilder || onlyPluginPt(cmd, payload?.cwd) ? null : 'evidence ledger, receipt.json and program-test run files are protected; use the Read tool to read them, build-receipt.mjs / the plugin\'s program-test/pt.mjs to write them';
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
