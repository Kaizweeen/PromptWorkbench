import { describe, expect, it } from 'vitest';
import { MODELS, estimateCost, formatCost, isModelId } from './config';

describe('estimateCost', () => {
  it('prices plain input and output at the base rates', () => {
    // 1M in at $5 + 1M out at $25 on Opus 5.
    const cost = estimateCost(
      { input_tokens: 1_000_000, output_tokens: 1_000_000 },
      'claude-opus-5',
    );
    expect(cost).toBeCloseTo(30, 10);
  });

  it('prices cache reads at their own rate, not as base input', () => {
    const cached = estimateCost(
      { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 },
      'claude-opus-5',
    );
    const asPlainInput = estimateCost(
      { input_tokens: 1_000_000, output_tokens: 0 },
      'claude-opus-5',
    );
    expect(cached).toBeCloseTo(0.5, 10);
    // Pricing a cached run as plain input would overstate it tenfold.
    expect(asPlainInput / cached).toBeCloseTo(10, 10);
  });

  it('prices cache writes above base input', () => {
    const cost = estimateCost(
      { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 },
      'claude-opus-5',
    );
    expect(cost).toBeCloseTo(6.25, 10);
  });

  it('treats absent cache fields as zero', () => {
    const withNulls = estimateCost(
      {
        input_tokens: 1000,
        output_tokens: 1000,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
      },
      'claude-sonnet-5',
    );
    const without = estimateCost(
      { input_tokens: 1000, output_tokens: 1000 },
      'claude-sonnet-5',
    );
    expect(withNulls).toBe(without);
  });

  it('differs per model', () => {
    const usage = { input_tokens: 100_000, output_tokens: 10_000 };
    expect(estimateCost(usage, 'claude-haiku-4-5')).toBeLessThan(
      estimateCost(usage, 'claude-sonnet-5'),
    );
    expect(estimateCost(usage, 'claude-opus-5')).toBeLessThan(
      estimateCost(usage, 'claude-fable-5'),
    );
  });
});

describe('formatCost', () => {
  it('never rounds a real cost down to zero', () => {
    expect(formatCost(0.00042)).toBe('$0.0004');
    expect(formatCost(0)).toBe('$0');
    expect(formatCost(1.239)).toBe('$1.24');
  });
});

describe('model roster', () => {
  it('marks prefill unsupported on every model that 400s on it', () => {
    // Prefill was removed across the current lineup; only Haiku 4.5 accepts it.
    expect(MODELS['claude-opus-5'].supportsPrefill).toBe(false);
    expect(MODELS['claude-sonnet-5'].supportsPrefill).toBe(false);
    expect(MODELS['claude-fable-5'].supportsPrefill).toBe(false);
    expect(MODELS['claude-haiku-4-5'].supportsPrefill).toBe(true);
  });

  it('keeps ids and keys in sync', () => {
    for (const [key, spec] of Object.entries(MODELS)) {
      expect(spec.id).toBe(key);
    }
  });

  it('narrows unknown model strings', () => {
    expect(isModelId('claude-opus-5')).toBe(true);
    expect(isModelId('gpt-4')).toBe(false);
  });
});
