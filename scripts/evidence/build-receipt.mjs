#!/usr/bin/env node
/**
 * Build `.sc4sap/program/{PROG}/receipt.json` from the evidence ledger.
 *
 *   node scripts/evidence/build-receipt.mjs <PROG> [--also ZCL_A,ZFG_B] [--unit-test required] [--root <dir>]
 *
 * --also        extra objects of this run whose names do not start with <PROG> (classes, FGs, tables)
 * --unit-test   `required` when spec.md Done Criteria lists unit tests (NOT RUN then makes the verdict INCOMPLETE)
 *
 * Prints the Evidence lines (Markdown) for the Phase 8 report and exits
 * 0 = PASS, 1 = FAIL, 2 = INCOMPLETE, 3 = usage / I/O error.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildReceipt, ledgerPath, projectRoot, receiptMarkdown, receiptPath, sha256 } from './lib.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const prog = process.argv[2];
if (!prog || prog.startsWith('--')) {
  console.error('usage: build-receipt.mjs <PROG> [--also A,B] [--unit-test required] [--root <dir>]');
  process.exit(3);
}

const root = projectRoot(arg('--root'));
const ledger = ledgerPath(root);
const raw = existsSync(ledger) ? readFileSync(ledger, 'utf-8') : '';
const entries = [];
let bad = 0;
for (const line of raw.split(/\r?\n/)) {
  if (!line.trim()) continue;
  try {
    entries.push(JSON.parse(line));
  } catch {
    bad += 1;
  }
}

const receipt = buildReceipt(entries, prog, {
  also: (arg('--also') || '').split(',').map((s) => s.trim()).filter(Boolean),
  unitTestRequired: arg('--unit-test') === 'required',
});
receipt.created_at = new Date().toISOString();
receipt.ledger = { path: '.sc4sap/evidence/ledger.jsonl', sha256: sha256(raw), unreadable_lines: bad };
receipt.written_by = 'scripts/evidence/build-receipt.mjs (from the PostToolUse ledger; agents do not write this file)';

const out = receiptPath(root, prog);
try {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', 'utf-8');
} catch (e) {
  console.error(`cannot write ${out}: ${e.message}`);
  process.exit(3);
}

console.log(receiptMarkdown(receipt));
if (!existsSync(ledger)) console.log('\n(no ledger found — the evidence hook did not record any call in this project)');
process.exit(receipt.verdict === 'PASS' ? 0 : receipt.verdict === 'FAIL' ? 1 : 2);
