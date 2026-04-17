// Lightweight sc4sap-specific status: SAP version, ABAP release, MCP build, sap.env presence.
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export function readConfig(workspaceDir) {
  const candidates = [
    join(workspaceDir, '.sc4sap', 'config.json'),
    ...ROOTS.map((r) => join(r, '.sc4sap', 'config.json')),
  ];
  const hit = firstExisting(candidates);
  if (!hit) return null;
  try { return JSON.parse(readFileSync(hit, 'utf8')); } catch { return null; }
}

export function sapEnvPresent(workspaceDir) {
  const candidates = [
    join(workspaceDir, '.sc4sap', 'sap.env'),
    ...ROOTS.map((r) => join(r, '.sc4sap', 'sap.env')),
  ];
  return !!firstExisting(candidates);
}

export function mcpInstalled() {
  const candidates = ROOTS.map((r) => join(r, 'vendor', 'abap-mcp-adt', 'dist', 'server', 'launcher.js'));
  return !!firstExisting(candidates);
}

export function sproCacheAge(workspaceDir) {
  const p = join(workspaceDir, '.sc4sap', 'spro-config.json');
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
// Source: cwd/.sc4sap/config.json → activeTransport.{trkorr,description}.
// Returns null when not pinned or unreadable.
export function activeTransport(workspaceDir) {
  const candidates = [
    join(workspaceDir, '.sc4sap', 'config.json'),
    ...ROOTS.map((r) => join(r, '.sc4sap', 'config.json')),
  ];
  const hit = firstExisting(candidates);
  if (!hit) return null;
  try {
    const at = JSON.parse(readFileSync(hit, 'utf8')).activeTransport;
    if (!at || !at.trkorr) return null;
    return { trkorr: at.trkorr, description: at.description || null };
  } catch { return null; }
}

// Resolve system info (SID / client / user) for HUD line 2. Priority:
//   1. cwd/.sc4sap/config.json → systemInfo.{sid,client,user}
//      (set by /sc4sap:setup after a successful GetSession)
//   2. cwd/.sc4sap/sap.env → SAP_SID / SAP_CLIENT / SAP_USERNAME
//   3. plugin root fallback (legacy installs)
// Returns null if nothing is configured anywhere.
export function systemInfo(workspaceDir) {
  const candidates = [
    join(workspaceDir, '.sc4sap'),
    ...ROOTS.map((r) => join(r, '.sc4sap')),
  ];
  for (const dir of candidates) {
    const cfgPath = join(dir, 'config.json');
    if (existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
        const si = cfg.systemInfo;
        if (si && (si.sid || si.client || si.user)) {
          return { sid: si.sid || null, client: si.client || null, user: si.user || null };
        }
      } catch { /* ignore */ }
    }
    const env = readDotenv(join(dir, 'sap.env'));
    if (env) {
      const hasAny = env.SAP_SID || env.SAP_CLIENT || env.SAP_USERNAME;
      if (hasAny) {
        return {
          sid: env.SAP_SID || null,
          client: env.SAP_CLIENT || null,
          user: env.SAP_USERNAME || null,
        };
      }
    }
  }
  return null;
}
