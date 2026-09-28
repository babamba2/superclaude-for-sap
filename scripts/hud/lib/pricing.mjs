// Pricing per 1M tokens (USD), Anthropic first-party rates. Update when Anthropic changes rates.
// Last checked 2026-09-28 against the claude-api skill's model table (cached 2026-06-24).
// Context-window size is NOT here — it depends on the plan; see context-window.mjs.
// Keys match model.id by prefix (longest-first lookup), so `claude-opus-5-5` wins over
// `claude-opus-5`, and the bare family keys (`claude-opus`, …) only catch versions not listed.
// The [1m] suffix in model IDs (e.g. `claude-opus-5-5[1m]`) is transparently handled
// by startsWith() — the entry matches regardless of whether the 1M indicator is present.
// cacheWrite is the 5-minute TTL rate (1.25× input); 1-hour writes are priced in costOf().

const rates = (input, output, cacheRead = input * 0.1) =>
  ({ input, output, cacheWrite: input * 1.25, cacheWrite1h: input * 2, cacheRead });

export const PRICING = {
  'claude-fable-5-1':   rates(10, 50, 0.25),
  'claude-mythos-5-1':  rates(10, 50, 0.25),
  'claude-fable-5':     rates(10, 50),
  'claude-mythos-5':    rates(10, 50),
  'claude-opus-5-5':    rates(4, 20, 0.20),
  'claude-opus-5':      rates(5, 25),
  'claude-opus-4-8':    rates(5, 25),
  'claude-opus-4-7':    rates(5, 25),
  'claude-opus-4-6':    rates(5, 25),
  'claude-opus-4-5':    rates(5, 25),
  'claude-opus-4-1':    rates(15, 75),
  'claude-opus-4':      rates(15, 75),   // Opus 4.0
  'claude-sonnet-5':    rates(2, 10),
  'claude-sonnet-4-6':  rates(3, 15),
  'claude-sonnet-4-5':  rates(3, 15),
  'claude-sonnet-4':    rates(3, 15),
  'claude-haiku-4-5':   rates(1, 5),
  'claude-3-5-sonnet':  rates(3, 15),
  'claude-3-5-haiku':   rates(0.8, 4),
  // Family fallbacks for versions released after this table was last updated.
  'claude-fable':       rates(10, 50),
  'claude-opus':        rates(5, 25),
  'claude-sonnet':      rates(3, 15),
  'claude-haiku':       rates(1, 5),
};

const DEFAULT = rates(3, 15);

export function priceFor(modelId = '') {
  const keys = Object.keys(PRICING).sort((a, b) => b.length - a.length);
  for (const k of keys) if (modelId.startsWith(k)) return PRICING[k];
  return DEFAULT;
}

export function costOf(usage, price) {
  if (!usage) return 0;
  const inTok  = (usage.input_tokens || 0);
  const outTok = (usage.output_tokens || 0);
  const cr     = (usage.cache_read_input_tokens || 0);
  // Split cache writes by TTL when the breakdown is present; otherwise treat all as 5-minute.
  const cwTotal = (usage.cache_creation_input_tokens || 0);
  const cw1h    = Math.min(usage.cache_creation?.ephemeral_1h_input_tokens || 0, cwTotal);
  const cw5m    = cwTotal - cw1h;
  const write1h = price.cacheWrite1h ?? price.cacheWrite;
  return (inTok * price.input + outTok * price.output + cw5m * price.cacheWrite + cw1h * write1h + cr * price.cacheRead) / 1_000_000;
}
