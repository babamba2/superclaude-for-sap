#!/usr/bin/env node
/**
 * sc4sap PreToolUse hook — Tier Readonly Guard
 *
 * Blocks mutation / code-execution MCP tool calls when the currently active
 * SAP profile is QA or PRD. Layer 1 of the two-layer defense (MCP server is
 * Layer 2).
 *
 * Resolution:
 *   1. Walk up from cwd to find `.sc4sap/active-profile.txt`.
 *   2. If found, read `$SC4SAP_HOME_DIR/profiles/<alias>/sap.env` (falls back
 *      to `~/.sc4sap/profiles/<alias>/sap.env`) and extract `SAP_TIER`.
 *   3. If no pointer is found, fall back to `<projectDir>/.sc4sap/sap.env`
 *      (legacy single-profile mode) and extract `SAP_TIER` (default DEV).
 *
 * Block matrix (Strict) — same as MCP server readonlyGuard:
 *   PRD: Create_, Update_, Delete_, RunUnitTest, RuntimeRun{Program,Class}WithProfiling
 *   QA:  Create_, Update_, Delete_, RuntimeRun{Program,Class}WithProfiling  (RunUnitTest allowed)
 *   DEV: nothing blocked.
 *
 * Failure mode: fails OPEN on any parse/IO error. MCP server L2 guard still
 * enforces, so missing hook = slower UX but not unsafe.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const MUTATION_PREFIXES = ['Create', 'Update', 'Delete'];
const RUNTIME_EXEC = new Set([
  'RunUnitTest',
  'RuntimeRunProgramWithProfiling',
  'RuntimeRunClassWithProfiling',
]);
const QA_ALLOW = new Set(['RunUnitTest']);

function sc4sapHome() {
  return process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');
}

function walkUpForProject(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, '.sc4sap'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function readActiveAlias(projectDir) {
  const p = join(projectDir, '.sc4sap', 'active-profile.txt');
  if (!existsSync(p)) return null;
  try {
    const a = readFileSync(p, 'utf8').trim();
    return a.length > 0 ? a : null;
  } catch {
    return null;
  }
}

function parseDotenvTier(envFilePath) {
  if (!existsSync(envFilePath)) return null;
  try {
    const raw = readFileSync(envFilePath, 'utf8');
    for (const rawLine of raw.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (key !== 'SAP_TIER') continue;
      const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      const v = value.toUpperCase();
      if (v === 'DEV' || v === 'QA' || v === 'PRD') return v;
      return 'DEV';
    }
  } catch {
    return null;
  }
  return null;
}

function resolveTier(projectDir) {
  const alias = readActiveAlias(projectDir);
  if (alias) {
    const envPath = join(sc4sapHome(), 'profiles', alias, 'sap.env');
    const tier = parseDotenvTier(envPath);
    return { alias, tier: tier ?? 'DEV', source: envPath, legacy: false };
  }
  const legacy = join(projectDir, '.sc4sap', 'sap.env');
  const tier = parseDotenvTier(legacy);
  return { alias: null, tier: tier ?? 'DEV', source: legacy, legacy: true };
}

function shortToolName(toolName) {
  // MCP tools are delivered as `mcp__<server>__<tool>` in Claude Code.
  const parts = String(toolName || '').split('__');
  return parts[parts.length - 1] || '';
}

function isMutation(name) {
  return MUTATION_PREFIXES.some((p) => name.startsWith(p));
}

function checkAllowed(toolName, tier) {
  if (tier === 'DEV') return null;
  if (toolName === 'ReloadProfile') return null;

  if (isMutation(toolName)) {
    return `${toolName} mutates SAP objects; only DEV profiles may mutate.`;
  }
  if (RUNTIME_EXEC.has(toolName)) {
    if (tier === 'QA' && QA_ALLOW.has(toolName)) return null;
    return `${toolName} executes ABAP code on the server and is blocked on ${tier} profiles.`;
  }
  return null;
}

function readStdin() {
  return new Promise((done) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => done(data));
    process.stdin.on('error', () => done(data));
    setTimeout(() => done(data), 1500).unref?.();
  });
}

async function main() {
  const raw = await readStdin();
  if (!raw) process.exit(0);

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const toolNameRaw = payload.tool_name || payload.toolName || '';
  const tool = shortToolName(toolNameRaw);
  if (!tool) process.exit(0);

  // Only SAP ADT mutation / runtime tools are in scope. Bail on anything else.
  if (
    !isMutation(tool) &&
    !RUNTIME_EXEC.has(tool) &&
    tool !== 'ReloadProfile'
  ) {
    process.exit(0);
  }

  const projectDir = walkUpForProject(process.cwd());
  let ctx;
  try {
    ctx = resolveTier(projectDir);
  } catch {
    process.exit(0);
  }

  const reason = checkAllowed(tool, ctx.tier);
  if (!reason) process.exit(0);

  const aliasLabel = ctx.alias ?? '(legacy)';
  const message =
    `sc4sap tier-readonly-guard — DENIED\n` +
    `  tool:    ${tool}\n` +
    `  profile: ${aliasLabel}\n` +
    `  tier:    ${ctx.tier}\n` +
    `  reason:  ${reason}\n\n` +
    `Switch to a DEV profile via /sc4sap:sap-option, then retry.\n` +
    `(This check is backed by the MCP server-side guard — bypassing this hook does not bypass enforcement.)`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: message,
      },
    }),
  );
  process.exit(0);
}

main();
