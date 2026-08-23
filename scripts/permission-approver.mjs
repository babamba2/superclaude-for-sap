#!/usr/bin/env node

/**
 * sc4sap PreToolUse Hook: SAP MCP Permission Approver
 *
 * Auto-approves SAP MCP handler calls so automated pipelines (create-program,
 * create-object, analyze-*, team, …) and their sub-agents run without per-call
 * permission prompts.
 *
 * Why a hook (and not the old trust-session mechanism):
 *   - The Agent-tool `mode: "dontAsk"` parameter that the pipelines relied on is
 *     deprecated/ignored in current Claude Code — sub-agents inherit the parent
 *     session's permission mode instead. (docs: code.claude.com/docs/en/sub-agents)
 *   - A PreToolUse hook runs for MCP tools in BOTH the main thread and sub-agents,
 *     and its decision is honored regardless of session mode or settings reload
 *     timing. (docs: code.claude.com/docs/en/hooks — permissionDecision)
 *
 * Policy:
 *   - `mcp__plugin_sc4sap_sap__*` and `mcp__mcp-abap-adt__*`  → permissionDecision "allow"
 *   - EXCEPT the two row-data extraction tools, which are never auto-approved and
 *     fall through to normal prompting + the block-forbidden-tables safeguard:
 *       · GetTableContents
 *       · GetSqlQuery
 *   - Every other tool → no decision (normal permission flow preserved).
 *
 * Kill switch: DISABLE_SC4SAP=1 disables auto-approval.
 */

import { readStdin } from './lib/stdin.mjs';

const SAP_NAMESPACES = ['mcp__plugin_sc4sap_sap__', 'mcp__mcp-abap-adt__'];

// Row-level data extraction — must always remain an explicit user decision.
const GATED_TOOLS = ['GetTableContents', 'GetSqlQuery'];

function extractJsonField(input, field, defaultValue = '') {
  try {
    const data = JSON.parse(input);
    return data[field] ?? defaultValue;
  } catch {
    const match = input.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i'));
    return match ? match[1] : defaultValue;
  }
}

function passthrough() {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}

async function main() {
  if (process.env.DISABLE_SC4SAP === '1') {
    passthrough();
    return;
  }

  try {
    const input = await readStdin();
    const toolName =
      extractJsonField(input, 'tool_name') ||
      extractJsonField(input, 'toolName', 'unknown');

    const namespace = SAP_NAMESPACES.find((ns) => toolName.startsWith(ns));
    if (!namespace) {
      passthrough();
      return;
    }

    const handler = toolName.slice(namespace.length);
    if (GATED_TOOLS.includes(handler)) {
      // Never auto-approve row-data extraction — leave to normal prompt + safeguard.
      passthrough();
      return;
    }

    console.log(
      JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
          permissionDecisionReason:
            'sc4sap: SAP MCP handler auto-approved (row-data extraction stays prompt-gated).',
        },
      })
    );
  } catch {
    // Never block the workflow on hook failure — fall back to normal prompting.
    passthrough();
  }
}

main();
