#!/usr/bin/env node
/**
 * Called by .github/workflows/ci-diagnose.yml when the main CI workflow
 * (.github/workflows/ci.yml) fails. Reads the failed-step log, sends it
 * to the Anthropic API with project-specific context, and writes a
 * markdown diagnosis intended to be posted as a PR comment.
 *
 * Environment inputs:
 *   ANTHROPIC_API_KEY   required      API key (repo secret)
 *   ANTHROPIC_MODEL     optional      model id, default claude-sonnet-4-6
 *   CI_LOG_PATH         required      path to failed-step log file
 *   OUTPUT_PATH         required      where to write the markdown diagnosis
 *   RUN_URL             optional      link to the failed CI run
 *   PR_NUMBER           optional      PR number (for header only)
 *   TRIGGER_SHA         optional      commit SHA that triggered CI
 *
 * Exit codes:
 *   0   success — diagnosis written
 *   1   API call failed — a stub diagnosis is still written so the PR
 *       comment step can post something actionable about the failure
 *   2   argument / input error (no key, no log file, etc.)
 *
 * Log handling:
 *   The raw failed log can be hundreds of MB. We tail to the last N lines
 *   with a byte cap so the prompt stays well under model context limits.
 */

import { readFileSync, writeFileSync } from 'node:fs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const LOG_PATH = process.env.CI_LOG_PATH;
const OUTPUT_PATH = process.env.OUTPUT_PATH;
const RUN_URL = process.env.RUN_URL || '';
const PR_NUMBER = process.env.PR_NUMBER || '';
const TRIGGER_SHA = process.env.TRIGGER_SHA || '';

const MAX_LOG_LINES = 500;
const MAX_LOG_BYTES = 50_000;
const MAX_OUTPUT_TOKENS = 1200;

function die(msg, code = 2) {
  process.stderr.write(`[diagnose] ${msg}\n`);
  process.exit(code);
}

function writeOutput(text) {
  if (!OUTPUT_PATH) die('OUTPUT_PATH is required');
  writeFileSync(OUTPUT_PATH, text);
}

function stubDiagnosis(reason) {
  const parts = [
    '<!-- ci-diagnose:auto -->',
    '### CI failure diagnosis',
    '',
    '## Verdict',
    'Diagnostic agent could not complete — manual review required.',
    '',
    '## Root cause',
    `Automated diagnosis failed: ${reason}`,
    '',
    '## Proposed fix',
    RUN_URL ? `Open the failed run at ${RUN_URL} and inspect the failed step manually.` : 'Open the failed CI run in the Actions tab and inspect the failed step manually.',
    '',
    '---',
    `_Automated by ci-diagnose.yml · model: ${MODEL} · stub response_`,
    '',
  ];
  return parts.join('\n');
}

if (!API_KEY) die('ANTHROPIC_API_KEY is required');
if (!LOG_PATH) die('CI_LOG_PATH is required');
if (!OUTPUT_PATH) die('OUTPUT_PATH is required');

let rawLog;
try {
  rawLog = readFileSync(LOG_PATH, 'utf8');
} catch (e) {
  writeOutput(stubDiagnosis(`cannot read log at ${LOG_PATH}: ${e.message}`));
  process.exit(1);
}

if (!rawLog.trim()) {
  writeOutput(stubDiagnosis('log file was empty — no failed-step output captured'));
  process.exit(1);
}

function tailLog(text, maxLines, maxBytes) {
  const lines = text.split('\n');
  const lineTrim = lines.length > maxLines;
  const trimmed = lineTrim ? lines.slice(-maxLines) : lines;
  let joined = trimmed.join('\n');
  const byteTrim = joined.length > maxBytes;
  if (byteTrim) joined = '...[truncated]...\n' + joined.slice(-maxBytes);
  return { text: joined, truncated: lineTrim || byteTrim };
}

const { text: logExcerpt, truncated } = tailLog(rawLog, MAX_LOG_LINES, MAX_LOG_BYTES);

const SYSTEM_PROMPT = `You are a CI failure diagnostician for the sc4sap repo — a Claude Code plugin for SAP On-Premise S/4HANA development.

The CI workflow (.github/workflows/ci.yml) runs these steps sequentially on ubuntu-latest:
  1. npm ci --ignore-scripts                 install deps, skip postinstall scripts
  2. node scripts/bundle-keyring.mjs --verify  offline SHA-256 tamper detection against runtime-deps/keyring/integrity.json
  3. node scripts/bundle-keyring.mjs --check   platform binary completeness (expects win32-x64-msvc, darwin-x64, darwin-arm64, linux-x64-gnu)
  4. npx tsc --noEmit                          TypeScript typecheck across src/
  5. npm run test:run                          vitest — 4 validation tests under tests/validation/

Known failure patterns and their typical fixes:

  - vitest assertion mismatch (most common after structural PRs):
    The test fixtures enumerate agents/skills/configs and compare against actual file counts.
    When a PR adds or removes files under agents/, skills/, configs/, etc., the hardcoded
    expectations in tests/validation/*.test.ts go stale. Fix is almost always to update the
    expected value in the test, not the source of truth.

  - tsc TS#### error in src/:
    Regression from a changed .ts file. Report the error code, file, and line.

  - bundle-keyring.mjs --verify SHA-256 mismatch:
    Should NOT happen under normal operation — the bundle directory has .gitattributes
    "runtime-deps/** -text" to prevent CRLF drift on cross-platform checkout, and the
    runtime-deps/keyring/integrity.json records per-file sha256. If this fires, suspect:
      (a) someone modified the committed bundle by hand,
      (b) .gitattributes is not being honored by the CI runner's checkout, or
      (c) the integrity.json is stale and needs "bundle-keyring.mjs --refresh-integrity".

  - bundle-keyring.mjs --check missing platform:
    A platform binary directory was removed. Fix: trigger the rebundle.yml workflow
    (Actions tab → Rebundle keyring → Run workflow) to restore the full 4-platform set.

  - npm ci lockfile mismatch:
    package.json and package-lock.json diverged. Fix: run "npm install" locally and
    commit the updated lockfile.

Output format — strict markdown, under 400 words total:

## Verdict
<one line: what failed, confidence level (high / medium / low)>

## Root cause
<2-4 sentences — explain the why, not just the what. Cite the log line(s) that prove it.>

## Proposed fix
<Specific file path and line number when possible. Include a unified-diff snippet or a command the maintainer can paste. If the fix requires inspecting context the log doesn't show, say which files to read first.>

## Relevant log excerpt
\`\`\`
<the most diagnostic 10-20 lines from the log — verbatim, no summarization>
\`\`\`

Hard rules:
- NEVER speculate beyond what the log supports. If uncertain, lower confidence and say so.
- If the log is truncated and the failure reason isn't visible, report "log truncated before the failure site" and recommend fetching the full run log.
- Focus on actionable fixes, not pedagogy.
- No em dashes in code blocks or identifiers.`;

const contextLines = [];
if (PR_NUMBER) contextLines.push(`PR: #${PR_NUMBER}`);
if (TRIGGER_SHA) contextLines.push(`commit: ${TRIGGER_SHA.slice(0, 7)}`);
if (RUN_URL) contextLines.push(`run: ${RUN_URL}`);

const userParts = [];
if (contextLines.length) userParts.push('Context: ' + contextLines.join(' · '));
userParts.push(
  'Failed CI log' +
    (truncated ? ` (last ${MAX_LOG_LINES} lines, ${MAX_LOG_BYTES} byte cap applied)` : '') +
    ':',
);
userParts.push('```\n' + logExcerpt + '\n```');

const requestBody = JSON.stringify({
  model: MODEL,
  max_tokens: MAX_OUTPUT_TOKENS,
  system: SYSTEM_PROMPT,
  messages: [{ role: 'user', content: userParts.join('\n\n') }],
});

let response;
try {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: requestBody,
  });
  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`HTTP ${r.status}: ${errText.slice(0, 400)}`);
  }
  response = await r.json();
} catch (e) {
  writeOutput(stubDiagnosis(`Claude API call failed — ${String(e).slice(0, 300)}`));
  process.exit(1);
}

const diagnosis = response?.content?.[0]?.text;
if (!diagnosis || typeof diagnosis !== 'string') {
  writeOutput(stubDiagnosis('Claude API returned no text content'));
  process.exit(1);
}

const headerLines = [
  '<!-- ci-diagnose:auto -->',
  '### CI failure diagnosis',
];
if (RUN_URL) headerLines.push(`Run: ${RUN_URL}`);
if (TRIGGER_SHA) headerLines.push(`Commit: \`${TRIGGER_SHA.slice(0, 7)}\``);
headerLines.push('');

const footerLines = [
  '',
  '---',
  `_Automated by ci-diagnose.yml · model: ${MODEL}_`,
  '',
];

writeOutput(headerLines.join('\n') + diagnosis + footerLines.join('\n'));
process.stderr.write(`[diagnose] OK — ${diagnosis.length} chars written to ${OUTPUT_PATH}\n`);
