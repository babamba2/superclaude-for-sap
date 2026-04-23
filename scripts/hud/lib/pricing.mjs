// Pricing per 1M tokens (USD). Update when Anthropic changes rates.
// Keys match model.id prefix match (longest-first lookup).
// The [1m] suffix in model IDs (e.g. `claude-opus-4-7[1m]`) is transparently handled
// by startsWith() — the entry matches regardless of whether the 1M indicator is present.
export const PRICING = {
  'claude-opus-4-7':    { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5,  ctx: 1_000_000 },
  'claude-opus-4-6':    { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5,  ctx: 1_000_000 },
  'claude-opus-4':      { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5,  ctx: 200_000 },
  'claude-sonnet-4-6':  { input: 3,  output: 15, cacheWrite: 3.75,  cacheRead: 0.3,  ctx: 1_000_000 },
  'claude-sonnet-4-5':  { input: 3,  output: 15, cacheWrite: 3.75,  cacheRead: 0.3,  ctx: 1_000_000 },
  'claude-sonnet-4':    { input: 3,  output: 15, cacheWrite: 3.75,  cacheRead: 0.3,  ctx: 200_000 },
  'claude-haiku-4-5':   { input: 1,  output: 5,  cacheWrite: 1.25,  cacheRead: 0.1,  ctx: 200_000 },
  'claude-3-5-sonnet':  { input: 3,  output: 15, cacheWrite: 3.75,  cacheRead: 0.3,  ctx: 200_000 },
  'claude-3-5-haiku':   { input: 0.8,output: 4,  cacheWrite: 1.0,   cacheRead: 0.08, ctx: 200_000 },
};

const DEFAULT = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3, ctx: 200_000 };

export function priceFor(modelId = '') {
  const keys = Object.keys(PRICING).sort((a, b) => b.length - a.length);
  for (const k of keys) if (modelId.startsWith(k)) return PRICING[k];
  return DEFAULT;
}

export function costOf(usage, price) {
  if (!usage) return 0;
  const inTok  = (usage.input_tokens || 0);
  const outTok = (usage.output_tokens || 0);
  const cw     = (usage.cache_creation_input_tokens || 0);
  const cr     = (usage.cache_read_input_tokens || 0);
  return (inTok * price.input + outTok * price.output + cw * price.cacheWrite + cr * price.cacheRead) / 1_000_000;
}
