/**
 * Retry with exponential backoff for rate limits and overloaded errors.
 *
 * The sleep function is injectable so the backoff schedule can be asserted in
 * tests without actually waiting.
 */

import { toReadableError, type ReadableError } from './errors';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** 0 disables jitter, which makes the schedule deterministic under test. */
  jitter?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  /** Called before each retry, for surfacing "retrying in 2s…" in the UI. */
  onRetry?: (info: { attempt: number; delayMs: number; error: ReadableError }) => void;
}

const DEFAULTS = {
  maxAttempts: 4,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitter: 0.25,
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Delay before the given retry attempt (1-based).
 *
 * A server-sent Retry-After always wins — guessing shorter than what the API
 * told us just earns another 429.
 */
export function backoffDelay(
  attempt: number,
  error: ReadableError,
  options: RetryOptions = {},
): number {
  const base = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const max = options.maxDelayMs ?? DEFAULTS.maxDelayMs;
  const jitter = options.jitter ?? DEFAULTS.jitter;
  const random = options.random ?? Math.random;

  if (error.retryAfterMs !== undefined) return Math.min(error.retryAfterMs, max);

  const exponential = Math.min(base * 2 ** (attempt - 1), max);
  if (jitter <= 0) return exponential;

  // Full-width jitter around the exponential point, clamped at the ceiling.
  const spread = exponential * jitter;
  const delta = (random() * 2 - 1) * spread;
  return Math.min(max, Math.max(0, Math.round(exponential + delta)));
}

export class RetriesExhaustedError extends Error {
  readonly readable: ReadableError;
  readonly attempts: number;

  constructor(readable: ReadableError, attempts: number) {
    super(`${readable.message} Gave up after ${attempts} attempts.`);
    this.name = 'RetriesExhaustedError';
    this.readable = { ...readable, message: `${readable.message} Gave up after ${attempts} attempts.` };
    this.attempts = attempts;
  }
}

/**
 * Run `fn`, retrying only failures the API says are transient. A non-retryable
 * error is rethrown immediately — retrying a 400 just wastes time.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULTS.maxAttempts;
  const sleep = options.sleep ?? defaultSleep;

  let lastReadable: ReadableError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      const readable = toReadableError(error);
      lastReadable = readable;

      if (!readable.retryable) throw error;
      if (attempt === maxAttempts) break;

      const delayMs = backoffDelay(attempt, readable, options);
      options.onRetry?.({ attempt, delayMs, error: readable });
      await sleep(delayMs);
    }
  }

  throw new RetriesExhaustedError(lastReadable!, maxAttempts);
}
