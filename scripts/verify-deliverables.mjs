#!/usr/bin/env node

/**
 * sc4sap Deliverable Verification Hook (SubagentStop)
 * Checks that completing agents produced their expected deliverables.
 * Adapted from OMC verify-deliverables.mjs.
 *
 * ADVISORY (non-blocking) — returns warnings but never prevents agent stop.
 *
 * Note: additionalContext on SubagentStop is delivered to the subagent and
 * wakes it for another turn. So a warning must fire only for real, and at
 * most once per stop: the agent's text comes from `last_assistant_message`
 * (the field Claude Code actually sends — `output` / `result` never arrive,
 * which made every agent look empty and re-woke it in a loop), an unknown
 * length is not a short one, and `stop_hook_active` means this stop is
 * already the answer to a hook — never warn again there.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { join, normalize, isAbsolute } from 'path';
import { readStdin } from './lib/stdin.mjs';

// Sanitize file path to prevent directory traversal
function sanitizePath(filePath) {
  const normalized = normalize(filePath);
  if (isAbsolute(normalized) || normalized.startsWith('..')) return null;
  return normalized;
}

// Load deliverable requirements
function loadDeliverableConfig(directory) {
  const projectConfig = join(directory, '.sc4sap', 'deliverables.json');
  if (existsSync(projectConfig)) {
    try {
      return JSON.parse(readFileSync(projectConfig, 'utf-8'));
    } catch {}
  }

  // Default deliverables for SAP agents
  return {
    defaults: {
      minOutputLength: 50,
    },
    agentTypes: {
      'sap-executor': {
        description: 'SAP executor should produce code changes or SAP object modifications',
        minOutputLength: 100,
      },
      'sap-analyst': {
        description: 'SAP analyst should produce analysis or recommendations',
        minOutputLength: 200,
      },
    }
  };
}

async function main() {
  try {
    const input = await readStdin();
    const data = JSON.parse(input);

    const directory = data.cwd || data.directory || process.cwd();
    const agentType = data.subagent_type || data.agent_type || '';
    // Plugin agents arrive namespaced ("sc4sap:sap-analyst"); the config is
    // keyed by the bare name.
    const bareType = agentType.includes(':') ? agentType.slice(agentType.lastIndexOf(':') + 1) : agentType;
    const agentOutput = data.last_assistant_message ?? data.output ?? data.result;
    const success = data.success !== false;

    // Skip verification for failed agents, and for a stop that is already the
    // reply to a stop hook — warning again there is what looped.
    if (!success || data.stop_hook_active === true) {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
      return;
    }

    const config = loadDeliverableConfig(directory);
    const agentConfig = config.agentTypes?.[bareType] || config.agentTypes?.[agentType] || config.defaults || {};
    const minLength = agentConfig.minOutputLength || 50;

    const warnings = [];

    // Check minimum output length — only when the payload carries the text.
    const outputStr = agentOutput == null
      ? null
      : typeof agentOutput === 'string' ? agentOutput : JSON.stringify(agentOutput);
    if (outputStr !== null && outputStr.trim().length < minLength) {
      warnings.push(`Agent "${agentType}" produced minimal output (${outputStr.trim().length} chars, expected ${minLength}+). Verify task was completed.`);
    }

    // Check for required files if specified
    if (agentConfig.requiredFiles) {
      for (const file of agentConfig.requiredFiles) {
        const safePath = sanitizePath(file);
        if (!safePath) continue;

        const fullPath = join(directory, safePath);
        if (!existsSync(fullPath)) {
          warnings.push(`Expected deliverable "${file}" not found.`);
        } else {
          try {
            const stat = statSync(fullPath);
            if (stat.size === 0) {
              warnings.push(`Deliverable "${file}" exists but is empty.`);
            }
          } catch {}
        }
      }
    }

    if (warnings.length > 0) {
      console.log(JSON.stringify({
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'SubagentStop',
          additionalContext: `[SC4SAP DELIVERABLE CHECK]\n${warnings.join('\n')}`
        }
      }));
    } else {
      console.log(JSON.stringify({ continue: true, suppressOutput: true }));
    }
  } catch (error) {
    console.log(JSON.stringify({ continue: true, suppressOutput: true }));
  }
}

main();
