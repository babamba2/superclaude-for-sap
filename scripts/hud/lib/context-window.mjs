// Context-window resolution for the HUD `ctx` segment.
//
// The window is NOT a property of the model alone: the same Opus / Sonnet
// model runs with 1M context on Max / Team / Enterprise plans and 200K on
// Pro / Free. Resolution order (first hit wins):
//   1. SC4SAP_CONTEXT_WINDOW env            — explicit override (e.g. 200000)
//   2. statusLine payload context window    — authoritative when Claude Code sends it
//   3. `[1m]` in model.id / "1M" in display — session explicitly runs 1M
//   4. model cannot do 1M (Haiku, Claude 3, Opus/Sonnet 4.0–4.1) → 200K
//   5. subscription plan from ~/.claude/.credentials.json
//      (claudeAiOauth.subscriptionType): max / team / enterprise → 1M, else 200K
//   6. 200K fallback (no credentials file, e.g. API-key users)

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CTX_200K = 200_000;
export const CTX_1M = 1_000_000;

const LARGE_CONTEXT_PLANS = new Set(['max', 'team', 'enterprise']);

// Families that never get 1M regardless of plan.
const SMALL_ONLY = [
  /^claude-haiku/,
  /^claude-3/,
  /^claude-(opus|sonnet)-4(-[01])?(-\d{8})?(\[|$)/, // Opus 4 / 4.1, Sonnet 4 (4.0)
];

export function readSubscription() {
  try {
    const p = join(homedir(), '.claude', '.credentials.json');
    if (!existsSync(p)) return null;
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    const c = parsed.claudeAiOauth || parsed;
    const type = typeof c.subscriptionType === 'string' ? c.subscriptionType.toLowerCase() : null;
    return type ? { type, tier: c.rateLimitTier || null } : null;
  } catch {
    return null;
  }
}

function payloadWindow(payload) {
  const cw = payload?.context_window;
  const n = typeof cw === 'number' ? cw : cw?.context_window_size ?? cw?.size;
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function resolveContextWindow({ payload = {}, modelId = '', displayName = '' } = {}, subscription = readSubscription()) {
  const override = Number(process.env.SC4SAP_CONTEXT_WINDOW || 0);
  if (override > 0) return { size: override, source: 'env' };

  const fromPayload = payloadWindow(payload);
  if (fromPayload) return { size: fromPayload, source: 'payload' };

  const id = String(modelId).toLowerCase();
  if (id.includes('[1m]') || /\b1m\b/i.test(displayName)) return { size: CTX_1M, source: 'model-1m' };

  if (SMALL_ONLY.some((re) => re.test(id))) return { size: CTX_200K, source: 'model-limit' };

  if (subscription?.type) {
    return LARGE_CONTEXT_PLANS.has(subscription.type)
      ? { size: CTX_1M, source: `plan:${subscription.type}` }
      : { size: CTX_200K, source: `plan:${subscription.type}` };
  }
  return { size: CTX_200K, source: 'default' };
}
