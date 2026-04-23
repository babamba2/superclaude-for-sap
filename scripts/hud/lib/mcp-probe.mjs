// Active runtime probe for the sc4sap MCP server.
// The HUD's install-file check (sc4sap-status.mjs/mcpInstalled) only sees whether
// the vendor launcher exists on disk — it stays "green" even when Claude Code has
// disconnected. This module shells out (30s cache) to check whether the actual
// `bridge/mcp-server.cjs` child process is alive, so the HUD reflects runtime
// connection state rather than install state.
//
// Result states: 'ok' | 'error' | 'unknown'
//   - ok      → matching process found
//   - error   → probe ran and found no process
//   - unknown → probe tool missing / timed out (we can't distinguish)

import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { readCache, writeCache, hudCacheDir } from './cache.mjs';

const TTL_MS = 30_000;
const PROBE_TIMEOUT_MS = 3000;
const PATTERN = /bridge[\\\/]mcp-server|abap-mcp-adt[\\\/]dist[\\\/]server[\\\/]launcher/i;

// `workspaceDir` is accepted for signature compatibility but no longer used —
// the probe result (MCP bridge alive or not) is system-wide, not workspace-specific.
export function probeMcpState(workspaceDir) {
  const cachePath = join(hudCacheDir(), '.hud-mcp-probe.json');
  const cached = readCache(cachePath, TTL_MS);
  if (cached && (cached.state === 'ok' || cached.state === 'error' || cached.state === 'unknown')) {
    return cached.state;
  }
  const state = runProbe();
  writeCache(cachePath, { state });
  return state;
}

function runProbe() {
  try {
    if (process.platform === 'win32') return probeWindows();
    return probePosix();
  } catch {
    return 'unknown';
  }
}

function probeWindows() {
  // PowerShell's Get-CimInstance returns CommandLine for every node.exe process;
  // we grep for the MCP entrypoint path. wmic is deprecated on Win11, avoid it.
  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object -ExpandProperty CommandLine",
      ],
      { timeout: PROBE_TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return PATTERN.test(out) ? 'ok' : 'error';
  } catch {
    return 'unknown';
  }
}

function probePosix() {
  try {
    const out = execFileSync('pgrep', ['-af', 'node'], { timeout: PROBE_TIMEOUT_MS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return PATTERN.test(out) ? 'ok' : 'error';
  } catch {
    // pgrep exits non-zero when no match — interpret as error, not unknown.
    return 'error';
  }
}
