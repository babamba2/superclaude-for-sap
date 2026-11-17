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
 * During an active program-test run it also hands table reads and source reads to
 * scripts/program-test/pt-capture.mjs (masked rows, source as read).
 *
 * Runs for main-thread and sub-agent calls. Fails open: never blocks a tool call,
 * never prints to the transcript.
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { readStdin } from '../lib/stdin.mjs';
import { capture } from '../program-test/pt-capture.mjs';
import { handlerName, isErrorResponse, ledgerEntry, ledgerPath, projectRoot, responseText } from './lib.mjs';

async function main() {
  if (process.env.DISABLE_SC4SAP === '1') return;
  try {
    const payload = JSON.parse(await readStdin());
    const root = projectRoot(payload.cwd);
    try {
      // program-test: masked rows / source of reads made during an active test run
      const handler = handlerName(payload.tool_name);
      if (handler) capture(root, handler, payload.tool_input || {}, responseText(payload.tool_response), isErrorResponse(payload.tool_response));
    } catch {
      // fail open — a missing capture makes the program-test verdict INCOMPLETE, never PASS
    }
    const entry = ledgerEntry(payload);
    if (!entry) return;
    const file = ledgerPath(root);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // fail open — a missing ledger line makes the receipt say NOT RUN, never PASS
  }
}

main().finally(() => {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
});
