/**
 * Model roster, pricing, and cost estimation.
 *
 * This is the single place a model ID or a price appears. Everything else in
 * the app reads from here.
 *
 * IDs and prices verified against platform.claude.com/docs/en/about-claude/models/overview
 * and /about-claude/pricing on 2026-08-25 — not recalled from memory.
 */

export type ModelId =
  | 'claude-opus-5'
  | 'claude-sonnet-5'
  | 'claude-haiku-4-5'
  | 'claude-fable-5';

/** USD per million tokens. */
export interface Pricing {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
}

export interface ModelSpec {
  id: ModelId;
  label: string;
  /** One-line guidance shown in the run picker. */
  blurb: string;
  contextWindow: number;
  maxOutput: number;
  pricing: Pricing;
  /**
   * Assistant-turn prefill was removed across the current lineup — it returns a
   * 400 on everything except Haiku 4.5. The run layer checks this before
   * sending a prompt that has a prefill section.
   */
  supportsPrefill: boolean;
  /** Adaptive thinking + the `effort` knob. Haiku 4.5 supports neither. */
  supportsEffort: boolean;
  /**
   * Models from the 4.7 generation on use a newer tokenizer that produces
   * roughly 30% more tokens for the same text. Cross-model token counts are
   * not comparable; the UI labels them when they are shown side by side.
   */
  tokenizer: 'current' | 'legacy';
}

export const MODELS: Record<ModelId, ModelSpec> = {
  'claude-opus-5': {
    id: 'claude-opus-5',
    label: 'Opus 5',
    blurb: 'Strongest. Use for final checks.',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { input: 5, output: 25, cacheWrite5m: 6.25, cacheWrite1h: 10, cacheRead: 0.5 },
    supportsPrefill: false,
    supportsEffort: true,
    tokenizer: 'current',
  },
  'claude-sonnet-5': {
    id: 'claude-sonnet-5',
    label: 'Sonnet 5',
    blurb: 'Balanced. Use while iterating.',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
    supportsPrefill: false,
    supportsEffort: true,
    tokenizer: 'current',
  },
  'claude-haiku-4-5': {
    id: 'claude-haiku-4-5',
    label: 'Haiku 4.5',
    blurb: 'Cheapest and fastest. Use for bulk suite runs.',
    contextWindow: 200_000,
    maxOutput: 64_000,
    pricing: { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
    supportsPrefill: true,
    supportsEffort: false,
    tokenizer: 'legacy',
  },
  'claude-fable-5': {
    id: 'claude-fable-5',
    label: 'Fable 5',
    blurb: 'Highest capability, 2x Opus pricing. Not a default.',
    contextWindow: 1_000_000,
    maxOutput: 128_000,
    pricing: { input: 10, output: 50, cacheWrite5m: 12.5, cacheWrite1h: 20, cacheRead: 1 },
    supportsPrefill: false,
    supportsEffort: true,
    tokenizer: 'current',
  },
};

/** The model used unless a run overrides it. */
export const DEFAULT_MODEL: ModelId = 'claude-opus-5';

/** Offered first when iterating, where turnaround matters more than depth. */
export const ITERATION_MODEL: ModelId = 'claude-sonnet-5';

/** Default for whole-suite test runs, where volume makes price dominate. */
export const SUITE_MODEL: ModelId = 'claude-haiku-4-5';

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];
export const DEFAULT_EFFORT: Effort = 'high';

/** Models offered in the run picker, in display order. */
export const MODEL_ORDER: ModelId[] = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
  'claude-fable-5',
];

export function isModelId(value: string): value is ModelId {
  return value in MODELS;
}

/**
 * Token usage as reported by the API. Cache reads and writes are billed at
 * different rates from base input, and are *not* included in `input_tokens` —
 * pricing them as plain input would misreport any cached run.
 */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

const PER_MILLION = 1_000_000;

/** Estimated USD cost of a single run. */
export function estimateCost(usage: TokenUsage, model: ModelId): number {
  const { pricing } = MODELS[model];
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  const cost =
    (usage.input_tokens * pricing.input +
      usage.output_tokens * pricing.output +
      cacheRead * pricing.cacheRead +
      cacheWrite * pricing.cacheWrite5m) /
    PER_MILLION;

  return cost;
}

/** Cost formatted for a dense UI: never rounds a real cost down to $0.00. */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
