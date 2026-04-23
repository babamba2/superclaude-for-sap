// Tiny TTL cache on disk. Used to avoid re-scanning many JSONL files per keystroke.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

// Shared HUD cache directory — per-USER, NOT per-workspace. HUD caches (Anthropic
// usage, MCP probe, weekly spend) are workspace-independent; pinning them to
// `<cwd>/.sc4sap/` sprinkles .sc4sap/ folders across every directory Claude Code
// happens to run in, including unrelated third-party projects.
//
// Resolution order:
//   1. SC4SAP_HUD_CACHE_DIR  — explicit override (power users, tests)
//   2. ${SC4SAP_HOME_DIR|~/.sc4sap}/hud-cache  — default (matches profile layout)
export function hudCacheDir() {
  if (process.env.SC4SAP_HUD_CACHE_DIR) return process.env.SC4SAP_HUD_CACHE_DIR;
  const home = process.env.SC4SAP_HOME_DIR || join(homedir(), '.sc4sap');
  return join(home, 'hud-cache');
}

export function readCache(path, ttlMs) {
  if (!existsSync(path)) return null;
  try {
    const { t, v } = JSON.parse(readFileSync(path, 'utf8'));
    if (Date.now() - t > ttlMs) return null;
    return v;
  } catch { return null; }
}

export function writeCache(path, value) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ t: Date.now(), v: value }));
  } catch { /* best-effort */ }
}
