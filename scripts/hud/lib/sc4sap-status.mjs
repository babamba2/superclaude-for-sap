// Lightweight sc4sap-specific status: SAP version, ABAP release, MCP build, sap.env presence.
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  resolveConfigJsonPath,
  resolveSapEnvPath,
  resolveArtifactBase,
} from '../../lib/profile-resolve.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

export function pluginRoot() { return PLUGIN_ROOT; }

// Claude Code installs the same plugin in two separate trees:
//   ~/.claude/plugins/marketplaces/<plugin>/...
//   ~/.claude/plugins/cache/<plugin>/<plugin>/<version>/...
// When the HUD loads from one, artifacts (vendor build, sap.env) may live in
// the other. This returns every plausible plugin root so callers can search
// all of them before giving up.
function pluginRootCandidates() {
  const out = [PLUGIN_ROOT];
  const normalized = PLUGIN_ROOT.replace(/\\/g, '/');
  const marketIdx = normalized.indexOf('/plugins/marketplaces/');
  if (marketIdx !== -1) {
    const base = normalized.slice(0, marketIdx) + '/plugins/cache';
    const slug = normalized.slice(marketIdx + '/plugins/marketplaces/'.length);
    const root = join(base, slug, slug);
    try {
      for (const v of readdirSync(root)) out.push(join(root, v));
    } catch { /* ignore */ }
  }
  const cacheMatch = normalized.match(/^(.*)\/plugins\/cache\/([^/]+)\/([^/]+)\/[^/]+$/);
  if (cacheMatch) {
    out.push(join(cacheMatch[1], 'plugins', 'marketplaces', cacheMatch[2]));
  }
  return [...new Set(out)];
}

const ROOTS = pluginRootCandidates();

function firstExisting(paths) {
  for (const p of paths) if (existsSync(p)) return p;
  return null;
}

// Resolve the active profile's config.json (pointer → profile) before falling
// back to any legacy project-local or plugin-root config.
export function readConfig(workspaceDir) {
  const hit = resolveConfigJsonPath(workspaceDir);
  if (hit) {
    try { return JSON.parse(readFileSync(hit.path, 'utf8')); } catch { /* ignore */ }
  }
  const candidates = ROOTS.map((r) => join(r, '.sc4sap', 'config.json'));
  const pluginHit = firstExisting(candidates);
  if (!pluginHit) return null;
  try { return JSON.parse(readFileSync(pluginHit, 'utf8')); } catch { return null; }
}

// True when the ACTIVE profile has an sap.env, or when a legacy project-local
// sap.env exists, or when a plugin-root install snapshot has one.
export function sapEnvPresent(workspaceDir) {
  if (resolveSapEnvPath(workspaceDir)) return true;
  const candidates = ROOTS.map((r) => join(r, '.sc4sap', 'sap.env'));
  return !!firstExisting(candidates);
}

export function mcpInstalled() {
  const candidates = ROOTS.map((r) => join(r, 'vendor', 'abap-mcp-adt', 'dist', 'server', 'launcher.js'));
  return !!firstExisting(candidates);
}

// SPRO cache lives under the per-profile artifact base (`work/<alias>/`) in
// multi-profile mode, or directly under `.sc4sap/` in legacy mode. The shared
// resolver returns the correct base without us needing to know which.
export function sproCacheAge(workspaceDir) {
  const p = join(resolveArtifactBase(workspaceDir), 'spro-config.json');
  if (!existsSync(p)) return null;
  try {
    const ageMs = Date.now() - statSync(p).mtimeMs;
    const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    return days;
  } catch { return null; }
}

// Parse a minimal KEY=VALUE dotenv file into an object. Ignores comments/blank.
function readDotenv(path) {
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
  } catch { return null; }
}

// Resolve the pinned active transport (TRKORR + description) for HUD line 2.
// Source priority: active-profile's config.json → legacy project config.json
// → plugin-root snapshot. Returns null when not pinned or unreadable.
export function activeTransport(workspaceDir) {
  const hit = resolveConfigJsonPath(workspaceDir);
  if (hit) {
    try {
      const at = JSON.parse(readFileSync(hit.path, 'utf8')).activeTransport;
      if (at && at.trkorr) return { trkorr: at.trkorr, description: at.description || null };
    } catch { /* ignore */ }
  }
  const candidates = ROOTS.map((r) => join(r, '.sc4sap', 'config.json'));
  const pluginHit = firstExisting(candidates);
  if (!pluginHit) return null;
  try {
    const at = JSON.parse(readFileSync(pluginHit, 'utf8')).activeTransport;
    if (!at || !at.trkorr) return null;
    return { trkorr: at.trkorr, description: at.description || null };
  } catch { return null; }
}

// Resolve the active sc4sap profile for HUD line 2. Reads the project-local
// pointer `<ws>/.sc4sap/active-profile.txt`, locates the user-level env file
// at `$SC4SAP_HOME_DIR/profiles/<alias>/sap.env` (or `~/.sc4sap/profiles/...`),
// and extracts SAP_TIER. Falls back to the legacy single-profile `sap.env` if
// no pointer exists.
//
// Returns { alias, tier, readonly, legacy } or null if no profile data at all.
export function activeProfile(workspaceDir) {
  const pointer = join(workspaceDir, '.sc4sap', 'active-profile.txt');
  let alias = null;
  if (existsSync(pointer)) {
    try {
      const raw = readFileSync(pointer, 'utf8').trim();
      if (raw.length > 0) alias = raw;
    } catch { /* ignore */ }
  }

  const sc4sapHome = process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');

  let envPath;
  let legacy;
  if (alias) {
    envPath = join(sc4sapHome, 'profiles', alias, 'sap.env');
    legacy = false;
  } else {
    envPath = join(workspaceDir, '.sc4sap', 'sap.env');
    legacy = true;
  }

  const env = readDotenv(envPath);
  if (!env) {
    // legacy path might live in plugin roots for cache installs
    if (legacy) {
      for (const r of ROOTS) {
        const fallback = readDotenv(join(r, '.sc4sap', 'sap.env'));
        if (fallback) {
          const tier = normalizeTier(fallback.SAP_TIER);
          return { alias: null, tier, readonly: tier !== 'DEV', legacy: true };
        }
      }
    }
    return null;
  }

  const tier = normalizeTier(env.SAP_TIER);
  return { alias, tier, readonly: tier !== 'DEV', legacy };
}

function normalizeTier(value) {
  const v = String(value || '').trim().toUpperCase();
  if (v === 'DEV' || v === 'QA' || v === 'PRD') return v;
  return 'DEV';
}

// Resolve system info (SID / client / user) for HUD line 2. Priority:
//   1. Active profile's config.json → systemInfo.{sid,client,user}
//      (set by /sc4sap:setup after a successful GetSession)
//   2. Active profile's sap.env → SAP_SID / SAP_CLIENT / SAP_USERNAME
//   3. Legacy project config.json → systemInfo
//   4. Legacy project sap.env → SAP_SID / SAP_CLIENT / SAP_USERNAME
//   5. Plugin root fallback (legacy installs under cache/marketplaces)
// Returns null if nothing is configured anywhere.
export function systemInfo(workspaceDir) {
  // 1–2. Active profile via shared resolver
  const cfgHit = resolveConfigJsonPath(workspaceDir);
  if (cfgHit) {
    try {
      const cfg = JSON.parse(readFileSync(cfgHit.path, 'utf8'));
      const si = cfg.systemInfo;
      if (si && (si.sid || si.client || si.user)) {
        return { sid: si.sid || null, client: si.client || null, user: si.user || null };
      }
    } catch { /* ignore */ }
  }
  const envHit = resolveSapEnvPath(workspaceDir);
  if (envHit) {
    const env = readDotenv(envHit.path);
    if (env && (env.SAP_SID || env.SAP_CLIENT || env.SAP_USERNAME)) {
      return {
        sid: env.SAP_SID || null,
        client: env.SAP_CLIENT || null,
        user: env.SAP_USERNAME || null,
      };
    }
  }
  // 5. Plugin root fallback (for cache/marketplaces snapshot installs)
  for (const r of ROOTS) {
    const cfgPath = join(r, '.sc4sap', 'config.json');
    if (existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
        const si = cfg.systemInfo;
        if (si && (si.sid || si.client || si.user)) {
          return { sid: si.sid || null, client: si.client || null, user: si.user || null };
        }
      } catch { /* ignore */ }
    }
    const env = readDotenv(join(r, '.sc4sap', 'sap.env'));
    if (env && (env.SAP_SID || env.SAP_CLIENT || env.SAP_USERNAME)) {
      return {
        sid: env.SAP_SID || null,
        client: env.SAP_CLIENT || null,
        user: env.SAP_USERNAME || null,
      };
    }
  }
  return null;
}
