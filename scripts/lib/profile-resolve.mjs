// sc4sap multi-profile resolver — shared helper for HUD, hooks, scripts.
//
// Resolves the active SAP profile's env file, config JSON, and work-artifact
// base directory. Legacy fallback (pre-0.6.0 single-profile) is preserved so
// users who haven't migrated yet still see the same behaviour as before.
//
// Resolution order for config.json and sap.env:
//   1. <workspace>/.sc4sap/active-profile.txt → <alias>
//      → $SC4SAP_HOME_DIR/profiles/<alias>/{sap.env, config.json}
//      (fallback: ~/.sc4sap/profiles/<alias>/...)
//   2. Legacy: <workspace>/.sc4sap/{sap.env, config.json}
//
// Callers pass the workspace directory (usually `process.cwd()`). Returning
// `null` means neither multi-profile nor legacy state exists.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export function sc4sapHome() {
  return process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');
}

export function profilesDir() {
  return join(sc4sapHome(), 'profiles');
}

// Walk up from `startDir` looking for the effective `.sc4sap/` directory.
// Users often launch Claude Code from a subdirectory of their workspace
// (e.g., the plugin dev repo inside a larger project), so resolving profile
// state only at the exact cwd diverges from the MCP server's walk-up
// behaviour and leaves the HUD showing "SAP not configured" while the MCP
// connection is alive.
//
// Nested-.sc4sap handling: a subdirectory may contain its own `.sc4sap/`
// holding only artifact folders (e.g. `comparisons/`, `test-reports/`) while
// the real profile state (active-profile.txt, sap.env, config.json) lives
// at a higher ancestor. Prefer the first `.sc4sap/` on the chain that
// actually contains profile state; fall back to the first `.sc4sap/` seen
// when no ancestor has state. Returns null only when no `.sc4sap/` exists
// anywhere on the chain. Depth-limited as a paranoia guard.
function hasProfileState(dotSc4sapDir) {
  return (
    existsSync(join(dotSc4sapDir, 'active-profile.txt')) ||
    existsSync(join(dotSc4sapDir, 'sap.env')) ||
    existsSync(join(dotSc4sapDir, 'config.json'))
  );
}

function findDotSc4sapDir(startDir) {
  let cur = startDir;
  let firstHit = null;
  for (let i = 0; i < 64; i++) {
    const candidate = join(cur, '.sc4sap');
    if (existsSync(candidate)) {
      if (hasProfileState(candidate)) return candidate;
      if (!firstHit) firstHit = candidate;
    }
    const parent = dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  return firstHit;
}

// The directory that *contains* the effective `.sc4sap/` — i.e., the
// workspace root as the plugin sees it. Falls back to `startDir` when no
// `.sc4sap/` exists anywhere on the ancestry chain.
export function resolveWorkspaceRoot(startDir) {
  const hit = findDotSc4sapDir(startDir);
  return hit ? dirname(hit) : startDir;
}

// Returns the active alias (reading the nearest ancestor's
// .sc4sap/active-profile.txt), or null when the pointer is missing /
// empty / unreadable.
export function readActiveAlias(startDir) {
  const root = resolveWorkspaceRoot(startDir);
  const pointer = join(root, '.sc4sap', 'active-profile.txt');
  if (!existsSync(pointer)) return null;
  try {
    const raw = readFileSync(pointer, 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

// Returns { path, source: 'profile' | 'legacy' } or null.
export function resolveSapEnvPath(startDir) {
  const alias = readActiveAlias(startDir);
  if (alias) {
    const p = join(profilesDir(), alias, 'sap.env');
    if (existsSync(p)) return { path: p, source: 'profile', alias };
  }
  const root = resolveWorkspaceRoot(startDir);
  const legacy = join(root, '.sc4sap', 'sap.env');
  if (existsSync(legacy)) return { path: legacy, source: 'legacy', alias: null };
  return null;
}

// Returns { path, source: 'profile' | 'legacy' } or null.
export function resolveConfigJsonPath(startDir) {
  const alias = readActiveAlias(startDir);
  if (alias) {
    const p = join(profilesDir(), alias, 'config.json');
    if (existsSync(p)) return { path: p, source: 'profile', alias };
  }
  const root = resolveWorkspaceRoot(startDir);
  const legacy = join(root, '.sc4sap', 'config.json');
  if (existsSync(legacy)) return { path: legacy, source: 'legacy', alias: null };
  return null;
}

// Returns the base directory for per-profile artifacts.
// - Multi-profile: <workspace-root>/.sc4sap/work/<alias>/
// - Legacy:        <workspace-root>/.sc4sap/
// Always returns a string (never null) — callers may need to create it.
export function resolveArtifactBase(startDir) {
  const root = resolveWorkspaceRoot(startDir);
  const alias = readActiveAlias(startDir);
  if (alias) return join(root, '.sc4sap', 'work', alias);
  return join(root, '.sc4sap');
}

// Parse a minimal KEY=VALUE dotenv file into a plain object.
// Returns null if file is missing or unreadable. Values are unquoted.
export function readDotenv(path) {
  if (!existsSync(path)) return null;
  try {
    const out = {};
    for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

// Convenience: read and parse the active profile's sap.env. Returns null when
// the env cannot be resolved.
export function readActiveSapEnv(workspaceDir) {
  const hit = resolveSapEnvPath(workspaceDir);
  if (!hit) return null;
  const env = readDotenv(hit.path);
  return env ? { env, ...hit } : null;
}

// Convenience: read and parse the active profile's config.json. Returns null
// when the config cannot be resolved.
export function readActiveConfigJson(workspaceDir) {
  const hit = resolveConfigJsonPath(workspaceDir);
  if (!hit) return null;
  try {
    const parsed = JSON.parse(readFileSync(hit.path, 'utf8'));
    return { config: parsed, ...hit };
  } catch {
    return null;
  }
}

// Normalize SAP_TIER — enum DEV | QA | PRD. Non-canonical values default to DEV.
export function normalizeTier(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'DEV' || v === 'QA' || v === 'PRD') return v;
  return 'DEV';
}
