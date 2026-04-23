// Fetch the user's actual rate-limit utilization from Anthropic's OAuth endpoint.
// Adapted from oh-my-claudecode's hud/usage-api.ts — same endpoint, same auth flow,
// trimmed to sync read + disk cache for a lightweight statusline subprocess.
//
// Endpoint: GET https://api.anthropic.com/api/oauth/usage
//   Headers: Authorization: Bearer <token>, anthropic-beta: oauth-2025-04-20
//   Response: { five_hour: { utilization, resets_at },
//               seven_day: { utilization, resets_at },
//               seven_day_opus?: {...}, seven_day_sonnet?: {...} }
//
// Credentials: ~/.claude/.credentials.json (macOS Keychain fallback NOT implemented —
// most users have .credentials.json written out by Claude Code regardless of OS).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import https from 'node:https';
import { hudCacheDir } from './cache.mjs';

const API_HOST = 'api.anthropic.com';
const API_PATH = '/api/oauth/usage';
const TIMEOUT_MS = 1500;
const CACHE_TTL_OK_MS = 60_000;
const CACHE_TTL_ERR_MS = 15_000;

function credsPath() {
  return join(homedir(), '.claude', '.credentials.json');
}

function readAccessToken() {
  try {
    const p = credsPath();
    if (!existsSync(p)) return null;
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    const c = parsed.claudeAiOauth || parsed;
    return c.accessToken || null;
  } catch { return null; }
}

function fetchUsage(token, signal) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: API_HOST,
      path: API_PATH,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT_MS,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try { resolve({ ok: true, data: JSON.parse(buf) }); }
          catch { resolve({ ok: false, err: 'parse' }); }
        } else {
          resolve({ ok: false, err: `http-${res.statusCode}` });
        }
      });
    });
    req.on('error', () => resolve({ ok: false, err: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, err: 'timeout' }); });
    req.end();
  });
}

// Cache path is per-USER, not per-workspace (see cache.mjs § hudCacheDir for rationale).
// `workspaceDir` args below are kept only for caller signature compatibility.
function cachePath() {
  return join(hudCacheDir(), '.hud-usage.json');
}

function readCache(_workspaceDir) {
  try {
    const p = cachePath();
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch { return null; }
}

function writeCache(_workspaceDir, obj) {
  try {
    const p = cachePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(obj), 'utf8');
  } catch { /* ignore */ }
}

// Normalize the API response into { fiveHour, sevenDay, sevenDayOpus, sevenDaySonnet }
// where each is a number 0..100 (utilization %) or null.
function normalize(raw) {
  const pct = (v) => (typeof v?.utilization === 'number' ? v.utilization : null);
  return {
    fiveHour:        pct(raw?.five_hour),
    sevenDay:        pct(raw?.seven_day),
    sevenDayOpus:    pct(raw?.seven_day_opus),
    sevenDaySonnet:  pct(raw?.seven_day_sonnet),
    fiveHourResetsAt: raw?.five_hour?.resets_at || null,
    sevenDayResetsAt: raw?.seven_day?.resets_at || null,
  };
}

// Return cached utilization (or freshly fetched when cache is stale).
// The caller is inside a statusline render, so we MUST respond fast:
// - If cache is fresh → return it (no network).
// - If cache is stale or missing → do a bounded-timeout fetch.
// - If fetch fails → write short-TTL error cache and return whatever stale data we had.
export async function getUsage(workspaceDir) {
  const cached = readCache(workspaceDir);
  const now = Date.now();
  if (cached) {
    const ttl = cached.ok ? CACHE_TTL_OK_MS : CACHE_TTL_ERR_MS;
    if (now - cached.t < ttl) return cached;
  }

  const token = readAccessToken();
  if (!token) {
    const entry = { t: now, ok: false, err: 'no-token', data: null };
    writeCache(workspaceDir, entry);
    return entry;
  }

  const res = await fetchUsage(token);
  if (res.ok) {
    const entry = { t: now, ok: true, data: normalize(res.data) };
    writeCache(workspaceDir, entry);
    return entry;
  }
  const entry = { t: now, ok: false, err: res.err, data: cached?.data || null };
  writeCache(workspaceDir, entry);
  return entry;
}
