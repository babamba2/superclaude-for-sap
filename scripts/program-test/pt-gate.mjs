#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — program-test read gate.
 *
 * While a program-test run is active (`.sc4sap/program-test/active.json`), a table read
 * (GetTableContents / GetSqlQuery / GetRemoteTableContents) must ask the MCP server to
 * mask the rows itself: `mask: { salt: <the run's salt>, extra_fields: <the run's
 * mask_extra> }`. A read without it is denied before it runs, so personal values never
 * reach the model on the way to the capture hook.
 *
 * A production run (`source: prd`) is stricter: its reads go through only after this run
 * has seen at least one read that came back masked by the server for its salt (the
 * capture line `server_masked: true`) — proof that the connected MCP server masks at all.
 * An older server ignores `mask` and would answer with raw rows.
 *
 * Outside a run the hook allows everything. Inside a run it fails closed: an unreadable
 * marker or state, or an error while deciding, denies the read.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../evidence/lib.mjs';
import { readStdin } from '../lib/stdin.mjs';
import { activePath } from './pt-capture.mjs';

const DATA_TOOLS = new Set(['GetTableContents', 'GetSqlQuery', 'GetRemoteTableContents']);
const NAMESPACES = ['mcp__plugin_sc4sap_sap__', 'mcp__mcp-abap-adt__'];
const up = (s) => String(s ?? '').trim().toUpperCase();

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** Whether this run has already seen a server-masked read for its salt. */
export function serverMaskingProven(runDir) {
  const file = join(runDir, 'capture.jsonl');
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf-8')
    .split(/\r?\n/)
    .some((line) => {
      try {
        const l = JSON.parse(line);
        return l.kind === 'data' && l.server_masked === true && !l.error;
      } catch {
        return false;
      }
    });
}

/**
 * The gate's decision for one tool call: null = allow, else the deny reason.
 * @param {{tool_name?: string, tool_input?: object, cwd?: string}} payload
 */
export function gate(payload) {
  const ns = NAMESPACES.find((n) => String(payload?.tool_name || '').startsWith(n));
  if (!ns) return null;
  const tool = payload.tool_name.slice(ns.length);
  if (!DATA_TOOLS.has(tool)) return null;
  const root = projectRoot(payload.cwd);
  const marker = activePath(root);
  if (!existsSync(marker)) return null;
  // From here a run is active: anything unreadable denies (fail closed).
  const active = readJson(marker);
  if (!active?.run_dir) return 'program-test run marker unreadable — reads are denied until the run is closed (pt.mjs close) or repaired';
  if (!existsSync(active.run_dir)) return null; // marker of a deleted run folder: no run
  const state = readJson(join(active.run_dir, 'state.json'));
  if (!state?.salt) return 'program-test run state unreadable — reads are denied while the run is active';
  const input = payload.tool_input || {};
  const mask = input.mask && typeof input.mask === 'object' ? input.mask : null;
  const want = { salt: state.salt, extra_fields: state.mask_extra || [] };
  const how = `pass mask: ${JSON.stringify(want)}`;
  if (!mask || mask.salt !== state.salt) {
    return `program-test run ${state.program} is active: table reads must be masked by the MCP server — ${how}`;
  }
  const given = new Set((Array.isArray(mask.extra_fields) ? mask.extra_fields : []).map(up));
  const missing = (state.mask_extra || []).map(up).filter((f) => !given.has(f));
  if (missing.length) return `mask.extra_fields lacks ${missing.join(', ')} — ${how}`;
  if (state.source === 'prd' && !serverMaskingProven(active.run_dir)) {
    return 'production reads need proof that the MCP server masks: first one masked probe read on DEV (e.g. GetSqlQuery "SELECT mandt FROM t000 UP TO 1 ROWS" with the same mask). An MCP server older than the masking release cannot run production tests.';
  }
  return null;
}

async function main() {
  let reason = null;
  if (process.env.DISABLE_SC4SAP !== '1') {
    let payload = null;
    try {
      payload = JSON.parse(await readStdin());
    } catch {
      payload = null; // nothing to decide on
    }
    if (payload) {
      try {
        reason = gate(payload);
      } catch (e) {
        const ns = NAMESPACES.find((n) => String(payload?.tool_name || '').startsWith(n));
        reason = ns && DATA_TOOLS.has(payload.tool_name.slice(ns.length)) ? `gate error (${String(e?.message || e).slice(0, 120)}) — read denied` : null;
      }
    }
  }
  if (!reason) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    return;
  }
  console.log(
    JSON.stringify({
      continue: true,
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `sc4sap program-test gate: ${reason}` },
    }),
  );
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/program-test/pt-gate.mjs')) main();
