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
import { join } from 'node:path';

export function sc4sapHome() {
  return process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');
}

export function profilesDir() {
  return join(sc4sapHome(), 'profiles');
}

// Returns the active alias (reading <workspace>/.sc4sap/active-profile.txt),
// or null when the pointer is missing / empty / unreadable.
export function readActiveAlias(workspaceDir) {
  const pointer = join(workspaceDir, '.sc4sap', 'active-profile.txt');
  if (!existsSync(pointer)) return null;
  try {
    const raw = readFileSync(pointer, 'utf8').trim();
    return raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

// Returns { path, source: 'profile' | 'legacy' } or null.
export function resolveSapEnvPath(workspaceDir) {
  const alias = readActiveAlias(workspaceDir);
  if (alias) {
    const p = join(profilesDir(), alias, 'sap.env');
    if (existsSync(p)) return { path: p, source: 'profile', alias };
  }
  const legacy = join(workspaceDir, '.sc4sap', 'sap.env');
  if (existsSync(legacy)) return { path: legacy, source: 'legacy', alias: null };
  return null;
}

// Returns { path, source: 'profile' | 'legacy' } or null.
export function resolveConfigJsonPath(workspaceDir) {
  const alias = readActiveAlias(workspaceDir);
  if (alias) {
    const p = join(profilesDir(), alias, 'config.json');
    if (existsSync(p)) return { path: p, source: 'profile', alias };
  }
  const legacy = join(workspaceDir, '.sc4sap', 'config.json');
  if (existsSync(legacy)) return { path: legacy, source: 'legacy', alias: null };
  return null;
}

// Returns the base directory for per-profile artifacts.
// - Multi-profile: <workspace>/.sc4sap/work/<alias>/
// - Legacy:        <workspace>/.sc4sap/
// Always returns a string (never null) — callers may need to create it.
export function resolveArtifactBase(workspaceDir) {
  const alias = readActiveAlias(workspaceDir);
  if (alias) return join(workspaceDir, '.sc4sap', 'work', alias);
  return join(workspaceDir, '.sc4sap');
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
