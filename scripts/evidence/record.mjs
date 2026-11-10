#!/usr/bin/env node
/**
 * sc4sap PostToolUse hook — Evidence recorder.
 *
 * Appends one line to `.sc4sap/evidence/ledger.jsonl` for every SAP MCP call that
 * is either a Done Criteria check (ActivateObjects, GetInactiveObjects,
 * RunUnitTest, GetUnitTestResult) or a write (Create* / Update* / Patch* / Write*).
 * The line is derived from the MCP response Claude Code passes to the hook — no
 * agent writes it. build-receipt.mjs reads it; guard.mjs blocks agent edits to it.
 *
 * Runs for main-thread and sub-agent calls. Fails open: never blocks a tool call,
 * never prints to the transcript.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readStdin } from '../lib/stdin.mjs';
import { ledgerEntry, ledgerPath, projectRoot } from './lib.mjs';

async function main() {
  if (process.env.DISABLE_SC4SAP === '1') return;
  try {
    const payload = JSON.parse(await readStdin());
    const entry = ledgerEntry(payload);
    if (!entry) return;
    const file = ledgerPath(projectRoot(payload.cwd));
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // fail open — a missing ledger line makes the receipt say NOT RUN, never PASS
  }
}

main().finally(() => {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
});
