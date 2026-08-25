import { describe, expect, it, vi } from 'vitest';
import { EmptyPromptError, buildRequest } from './request';
import {
  MissingApiKeyError,
  parseRetryAfter,
  toReadableError,
} from './errors';
import { RetriesExhaustedError, backoffDelay, withRetry } from './retry';
import type { RenderedPrompt } from '../render';

const rendered = (over: Partial<RenderedPrompt> = {}): RenderedPrompt => ({
  system: 'You are a reviewer.',
  user: 'Review this.',
  ...over,
});

describe('buildRequest', () => {
  it('maps the rendered turns onto the request', () => {
    const { request } = buildRequest({ rendered: rendered(), model: 'claude-opus-5' });
    expect(request.system).toBe('You are a reviewer.');
    expect(request.messages).toEqual([{ role: 'user', content: 'Review this.' }]);
  });

  it('omits an empty system turn rather than sending an empty string', () => {
    const { request } = buildRequest({
      rendered: rendered({ system: '' }),
      model: 'claude-opus-5',
    });
    expect(request.system).toBeUndefined();
  });

  it('refuses to send a prompt with nothing in the user turn', () => {
    expect(() =>
      buildRequest({ rendered: rendered({ user: '   ' }), model: 'claude-opus-5' }),
    ).toThrow(EmptyPromptError);
  });

  it('drops prefill on models that reject it, and says so', () => {
    const { request, warnings } = buildRequest({
      rendered: rendered({ prefill: '{"a":' }),
      model: 'claude-opus-5',
    });
    expect(request.messages).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/Prefill was dropped/);
    expect(warnings.join(' ')).toMatch(/400/);
  });

  it('keeps prefill on Haiku 4.5, which still accepts it', () => {
    const { request, warnings } = buildRequest({
      rendered: rendered({ prefill: '{"a":' }),
      model: 'claude-haiku-4-5',
    });
    expect(request.messages).toEqual([
      { role: 'user', content: 'Review this.' },
      { role: 'assistant', content: '{"a":' },
    ]);
    expect(warnings).toEqual([]);
  });

  it('sets adaptive thinking and effort on models that support them', () => {
    const { request } = buildRequest({
      rendered: rendered(),
      model: 'claude-opus-5',
      effort: 'xhigh',
    });
    expect(request.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(request.output_config).toEqual({ effort: 'xhigh' });
  });

  it('never sends thinking or effort to Haiku 4.5, which 400s on effort', () => {
    const { request, warnings } = buildRequest({
      rendered: rendered(),
      model: 'claude-haiku-4-5',
      effort: 'high',
    });
    expect(request.thinking).toBeUndefined();
    expect(request.output_config).toBeUndefined();
    expect(warnings.join(' ')).toMatch(/does not support the effort setting/);
  });

  it('clamps max_tokens to the model output ceiling', () => {
    const opus = buildRequest({
      rendered: rendered(),
      model: 'claude-opus-5',
      maxTokens: 999_999,
    });
    expect(opus.request.max_tokens).toBe(128_000);

    const haiku = buildRequest({ rendered: rendered(), model: 'claude-haiku-4-5' });
    expect(haiku.request.max_tokens).toBe(64_000);
  });
});

describe('parseRetryAfter', () => {
  it('reads a seconds value', () => {
    expect(parseRetryAfter(new Headers({ 'retry-after': '3' }))).toBe(3000);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    const headers = new Headers({ 'retry-after': 'Thu, 01 Jan 2026 00:00:10 GMT' });
    expect(parseRetryAfter(headers, now)).toBe(10_000);
  });

  it('never returns a negative delay for a date in the past', () => {
    const now = Date.parse('2026-01-01T00:01:00Z');
    const headers = new Headers({ 'retry-after': 'Thu, 01 Jan 2026 00:00:00 GMT' });
    expect(parseRetryAfter(headers, now)).toBe(0);
  });

  it('returns undefined when absent or unparseable', () => {
    expect(parseRetryAfter(new Headers())).toBeUndefined();
    expect(parseRetryAfter(new Headers({ 'retry-after': 'soon' }))).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });

  it('accepts a plain object of headers', () => {
    expect(parseRetryAfter({ 'retry-after': '2' })).toBe(2000);
  });
});

describe('toReadableError', () => {
  it('marks 429 retryable and carries retry-after through', () => {
    const e = toReadableError({
      status: 429,
      headers: new Headers({ 'retry-after': '5' }),
    });
    expect(e.kind).toBe('rate_limit');
    expect(e.retryable).toBe(true);
    expect(e.retryAfterMs).toBe(5000);
  });

  it('treats 529 as overloaded and retryable', () => {
    const e = toReadableError({ status: 529 });
    expect(e.kind).toBe('overloaded');
    expect(e.retryable).toBe(true);
  });

  it('treats 500 as retryable but 400 as not', () => {
    expect(toReadableError({ status: 500 }).retryable).toBe(true);
    expect(toReadableError({ status: 400 }).retryable).toBe(false);
  });

  it('surfaces the API message for a non-retryable error', () => {
    const e = toReadableError({
      status: 400,
      error: { error: { message: 'messages: roles must alternate' } },
    });
    expect(e.message).toContain('roles must alternate');
  });

  it('maps auth failures without suggesting a retry', () => {
    const e = toReadableError({ status: 401 });
    expect(e.kind).toBe('auth');
    expect(e.retryable).toBe(false);
    expect(e.message).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('treats a connection failure as retryable', () => {
    const e = toReadableError({ name: 'APIConnectionError', message: 'socket hang up' });
    expect(e.kind).toBe('connection');
    expect(e.retryable).toBe(true);
  });

  it('reports a missing key as its own non-retryable kind', () => {
    const e = toReadableError(new MissingApiKeyError());
    expect(e.kind).toBe('no_key');
    expect(e.retryable).toBe(false);
    expect(e.message).toMatch(/\.env\.local/);
  });

  it('never leaks a stack trace into the message, but keeps the first line', () => {
    const e = toReadableError(new Error('boom\n  at foo (bar.ts:1:1)'));
    expect(e.message).toBe('The run failed: boom');
    expect(e.message).not.toContain('at foo');
  });

  it('truncates an absurdly long API message', () => {
    const e = toReadableError({ status: 400, message: 'x'.repeat(500) });
    expect(e.message.length).toBeLessThan(360);
    expect(e.message.endsWith('…')).toBe(true);
  });
});

describe('backoffDelay', () => {
  const noJitter = { jitter: 0, baseDelayMs: 1000, maxDelayMs: 30_000 };
  const err = { kind: 'rate_limit' as const, message: '', retryable: true };

  it('doubles each attempt', () => {
    expect(backoffDelay(1, err, noJitter)).toBe(1000);
    expect(backoffDelay(2, err, noJitter)).toBe(2000);
    expect(backoffDelay(3, err, noJitter)).toBe(4000);
    expect(backoffDelay(4, err, noJitter)).toBe(8000);
  });

  it('caps at the maximum delay', () => {
    expect(backoffDelay(20, err, noJitter)).toBe(30_000);
  });

  it('prefers a server-sent retry-after over its own schedule', () => {
    const withHeader = { ...err, retryAfterMs: 7000 };
    expect(backoffDelay(1, withHeader, noJitter)).toBe(7000);
  });

  it('still caps a very long retry-after', () => {
    const withHeader = { ...err, retryAfterMs: 600_000 };
    expect(backoffDelay(1, withHeader, noJitter)).toBe(30_000);
  });

  it('keeps jittered delays within the spread and never negative', () => {
    for (const random of [() => 0, () => 0.5, () => 1]) {
      const d = backoffDelay(2, err, { baseDelayMs: 1000, jitter: 0.25, random });
      expect(d).toBeGreaterThanOrEqual(1500);
      expect(d).toBeLessThanOrEqual(2500);
    }
  });
});

describe('withRetry', () => {
  const opts = { jitter: 0, baseDelayMs: 1000, sleep: async () => {} };

  it('returns the first successful result without sleeping', async () => {
    const sleep = vi.fn(async () => {});
    const result = await withRetry(async () => 'ok', { ...opts, sleep });
    expect(result).toBe('ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a rate limit and then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 429 };
        return 'recovered';
      },
      opts,
    );
    expect(result).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('sleeps on the documented exponential schedule', async () => {
    const delays: number[] = [];
    await withRetry(
      async (attempt) => {
        if (attempt < 4) throw { status: 529 };
        return 'ok';
      },
      { ...opts, sleep: async (ms) => void delays.push(ms) },
    );
    expect(delays).toEqual([1000, 2000, 4000]);
  });

  it('rethrows a non-retryable error immediately', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw { status: 400, error: { error: { message: 'bad' } } };
      }, opts),
    ).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });

  it('gives up after maxAttempts with a readable message', async () => {
    const promise = withRetry(async () => { throw { status: 529 }; }, {
      ...opts,
      maxAttempts: 3,
    });
    await expect(promise).rejects.toBeInstanceOf(RetriesExhaustedError);
    await promise.catch((e: RetriesExhaustedError) => {
      expect(e.attempts).toBe(3);
      expect(e.readable.message).toMatch(/Gave up after 3 attempts/);
      expect(e.readable.kind).toBe('overloaded');
    });
  });

  it('reports each retry so the UI can show what is happening', async () => {
    const seen: number[] = [];
    await withRetry(
      async (attempt) => {
        if (attempt < 3) throw { status: 429 };
        return 'ok';
      },
      { ...opts, onRetry: ({ attempt }) => void seen.push(attempt) },
    );
    expect(seen).toEqual([1, 2]);
  });
});
