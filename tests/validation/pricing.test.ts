import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
// @ts-expect-error — plain .mjs script, no type declarations
import { PRICING, priceFor, costOf } from '../../scripts/hud/lib/pricing.mjs';

const M = 1_000_000;
const ROOT = resolve(__dirname, '../..');

describe('pricing.mjs — 5.5 generation rows', () => {
  it('resolves the exact 5.5 rows, not the family fallbacks', () => {
    expect(priceFor('claude-opus-5-5')).toMatchObject({ input: 4, output: 20, cacheRead: 0.2 });
    expect(priceFor('claude-sonnet-5-5')).toMatchObject({ input: 2, output: 10, cacheRead: 0.2 });
    expect(priceFor('claude-haiku-5-5')).toMatchObject({ input: 0.1, output: 0.5 });
    expect(priceFor('claude-haiku-5-5')).not.toBe(PRICING['claude-haiku']);
  });

  it('handles the [1m] suffix and unknown ids', () => {
    expect(priceFor('claude-haiku-5-5[1m]')).toBe(PRICING['claude-haiku-5-5']);
    expect(priceFor('claude-haiku-9')).toBe(PRICING['claude-haiku']);
    expect(priceFor('gpt-x')).toMatchObject({ input: 3, output: 15 });
  });

  it('prices Haiku 5.5 prompts up to 100K at $0.10 / $0.50', () => {
    const p = priceFor('claude-haiku-5-5');
    expect(costOf({ input_tokens: 100_000, output_tokens: M }, p)).toBeCloseTo(0.01 + 0.5, 10);
  });

  it('switches the whole Haiku 5.5 request to $0.50 / $2.50 above 100K prompt tokens', () => {
    const p = priceFor('claude-haiku-5-5');
    // 60K fresh + 50K cache read = 110K prompt tokens → long-prompt tier
    const usage = { input_tokens: 60_000, cache_read_input_tokens: 50_000, output_tokens: 10_000 };
    const expected = (60_000 * 0.5 + 50_000 * 0.05 + 10_000 * 2.5) / M;
    expect(costOf(usage, p)).toBeCloseTo(expected, 10);
  });

  it('has no long-prompt tier on Opus / Sonnet 5.5', () => {
    const usage = { input_tokens: 500_000, output_tokens: 0 };
    expect(costOf(usage, priceFor('claude-opus-5-5'))).toBeCloseTo(2, 10);
    expect(costOf(usage, priceFor('claude-sonnet-5-5'))).toBeCloseTo(1, 10);
  });

  it('splits cache writes by TTL', () => {
    const p = priceFor('claude-sonnet-5-5');
    const usage = { cache_creation_input_tokens: M, cache_creation: { ephemeral_1h_input_tokens: 400_000 } };
    expect(costOf(usage, p)).toBeCloseTo((600_000 * 2.5 + 400_000 * 4) / M, 10);
    expect(costOf(undefined, p)).toBe(0);
  });

  it('model-routing-rule.md quotes the same input / output prices', () => {
    const rule = readFileSync(resolve(ROOT, 'common/model-routing-rule.md'), 'utf8');
    expect(rule).toContain('scripts/hud/lib/pricing.mjs');
    for (const [id, label] of [['claude-opus-5-5', 'Opus 5.5'], ['claude-sonnet-5-5', 'Sonnet 5.5'], ['claude-haiku-5-5', 'Haiku 5.5']]) {
      const p = PRICING[id];
      const row = rule.split(/\r?\n/).find((l) => l.startsWith(`| ${label} |`));
      expect(row, label).toBeDefined();
      expect(row).toContain(`| ${p.input.toFixed(2)} | ${p.output.toFixed(2)} |`);
    }
  });
});
