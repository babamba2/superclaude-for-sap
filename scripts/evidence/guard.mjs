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

import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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

const PROTECTED_BASE = /\.sc4sap[\\/]+(?:evidence(?:[\\/]|\b)|program[\\/]+[^\\/\s"']+[\\/]+receipt\.json|(?:work[\\/]+[^\\/\s"']+[\\/]+)?program[\\/]+[^\\/\s"']+[\\/]+test[\\/]+[^\\/\s"']+[\\/]+(?:state\.json|capture\.jsonl|fingerprints\.json|pt-receipt\.json|rows(?:[\\/]|\b)|src(?:[\\/]|\b)|ddic(?:[\\/]|\b)|harness(?:[\\/]|\b))|program-test[\\/]+active\.json)/i;
// A program-test run under any base folder (`pt.mjs init --base`, e.g. a web run's own output folder):
// program/<PROG>/test/<yyyymmdd-hhmmss>/<script- or hook-written file>.
const PROTECTED_RUN = /(?:^|[\\/])program[\\/]+[^\\/\s"']+[\\/]+test[\\/]+\d{8}-\d{6}[\\/]+(?:state\.json|capture\.jsonl|fingerprints\.json|pt-receipt\.json|rows(?:[\\/]|\b)|src(?:[\\/]|\b)|ddic(?:[\\/]|\b)|harness(?:[\\/]|\b))/i;
const PROTECTED = { test: (s) => PROTECTED_BASE.test(s) || PROTECTED_RUN.test(s) };
const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

// ── the MCP server's masking key (profiles/<alias>/mask.key) ─────────────────
// Tokens of masked test-data reads are HMAC under this key; a model that could read it could
// test guessed values against the tokens. Denied: any tool input naming mask.key; Grep over a
// folder that holds profile folders (the key file would be searched); shell commands that read
// the sc4sap home with a wildcard or recursively. Moving / deleting a profile stays possible.
const MASK_KEY = /mask\.key/i;
const SC4SAP_HOME_REF = /\.sc4sap(?:[\\/]|\b)|SC4SAP_HOME_DIR/i;
const WIDE_READ = /[*?]|(?:^|\s)-[a-zA-Z]*[rR][a-zA-Z]*\b|-Recurse\b|\s\/s\b|\btar\b|\bzip\b|\brobocopy\b|\bxcopy\b/;
const MOVE_ONLY = /^\s*(?:rm|mv|mkdir|rmdir|Remove-Item|Move-Item|New-Item)\b/i;
const sc4sapHome = () => resolve(process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap'));
const within = (child, parent) => {
  const c = normPath(child);
  const p = normPath(parent);
  return c === p || c.startsWith(`${p}/`);
};

/** Deny reason when a call would read the MCP server's masking key, else null. */
export function maskKeyRefusal(payload) {
  const tool = payload?.tool_name;
  const input = payload?.tool_input || {};
  const texts = ['file_path', 'notebook_path', 'path', 'pattern', 'glob', 'command'].map((k) => input[k]).filter((v) => typeof v === 'string');
  const reason = 'the MCP masking key (profiles/<alias>/mask.key) is never read by the model';
  if (texts.some((t) => MASK_KEY.test(t))) return reason;
  if (tool === 'Grep') {
    const root = resolve(payload?.cwd || process.cwd(), typeof input.path === 'string' && input.path ? input.path : '.');
    const profiles = join(sc4sapHome(), 'profiles');
    // a search root at or above the profile folders, or inside one of them
    if (within(profiles, root) || within(root, profiles)) return `${reason}; grep a single file such as config.json instead`;
  }
  if (SHELL_TOOLS.has(tool)) {
    const cmd = String(input.command || '');
    if (SC4SAP_HOME_REF.test(cmd) && WIDE_READ.test(cmd) && !MOVE_ONLY.test(cmd)) return `${reason}; name the one file you need (sap.env / config.json)`;
  }
  return null;
}

export function decide(payload) {
  const tool = payload?.tool_name;
  const input = payload?.tool_input || {};
  const keyRefusal = maskKeyRefusal(payload);
  if (keyRefusal) return keyRefusal;
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
