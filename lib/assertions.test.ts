import { describe, expect, it, vi } from 'vitest';
import { evaluateAssertion, evaluateDeterministic, validateSchema } from './assertions';
import { mapWithConcurrency } from './concurrency';
import type { AssertionSpec } from './db/schema';

const run = (spec: AssertionSpec, output: string) => evaluateDeterministic(spec, output);

describe('contains / not_contains', () => {
  it('is case-insensitive by default', () => {
    expect(run({ type: 'contains', value: 'HELLO' }, 'hello world').passed).toBe(true);
  });

  it('respects caseSensitive', () => {
    expect(
      run({ type: 'contains', value: 'HELLO', caseSensitive: true }, 'hello').passed,
    ).toBe(false);
  });

  it('not_contains inverts, and says which string was found', () => {
    const result = run({ type: 'not_contains', value: 'sorry' }, 'I am sorry');
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('sorry');
  });

  it('not_contains passes on absence', () => {
    expect(run({ type: 'not_contains', value: 'sorry' }, 'here you go').passed).toBe(true);
  });
});

describe('regex', () => {
  it('passes on a match and reports what matched', () => {
    const result = run({ type: 'regex', pattern: '\\d{3}-\\d{4}' }, 'call 555-1234 now');
    expect(result.passed).toBe(true);
    expect(result.detail).toContain('555-1234');
  });

  it('fails with no match', () => {
    expect(run({ type: 'regex', pattern: '^\\d+$' }, 'abc').passed).toBe(false);
  });

  it('honours flags', () => {
    expect(run({ type: 'regex', pattern: 'HELLO', flags: 'i' }, 'hello').passed).toBe(true);
  });

  it('fails readably on an invalid pattern instead of throwing', () => {
    const result = run({ type: 'regex', pattern: '([' }, 'anything');
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/Invalid regex/);
  });
});

describe('valid_json', () => {
  it('accepts an object and an array', () => {
    expect(run({ type: 'valid_json' }, '{"a":1}').passed).toBe(true);
    expect(run({ type: 'valid_json' }, '[1,2]').passed).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(run({ type: 'valid_json' }, '\n  {"a":1}  \n').passed).toBe(true);
  });

  it('rejects prose and half-written JSON with a reason', () => {
    expect(run({ type: 'valid_json' }, 'Here is your JSON: {"a":1}').passed).toBe(false);
    const result = run({ type: 'valid_json' }, '{"a":');
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/Not valid JSON/);
  });
});

describe('validateSchema', () => {
  const schema = {
    type: 'object',
    required: ['file', 'severity'],
    properties: {
      file: { type: 'string' },
      line: { type: 'integer', minimum: 1 },
      severity: { type: 'string', enum: ['low', 'high'] },
    },
  };

  it('accepts a conforming object', () => {
    expect(
      validateSchema({ file: 'a.ts', line: 4, severity: 'high' }, schema).errors,
    ).toEqual([]);
  });

  it('reports a missing required property by name', () => {
    const { errors } = validateSchema({ file: 'a.ts' }, schema);
    expect(errors.join(' ')).toContain('missing required property "severity"');
  });

  it('reports a type mismatch with the path', () => {
    const { errors } = validateSchema({ file: 1, severity: 'high' }, schema);
    expect(errors.join(' ')).toContain('$.file: expected string, got integer');
  });

  it('enforces enum, minimum, and additionalProperties', () => {
    expect(
      validateSchema({ file: 'a', severity: 'critical' }, schema).errors.join(' '),
    ).toContain('not one of');
    expect(
      validateSchema({ file: 'a', severity: 'low', line: 0 }, schema).errors.join(' '),
    ).toContain('minimum');
    expect(
      validateSchema(
        { a: 1, b: 2 },
        { type: 'object', properties: { a: { type: 'integer' } }, additionalProperties: false },
      ).errors.join(' '),
    ).toContain('unexpected property "b"');
  });

  it('validates array items with an indexed path', () => {
    const { errors } = validateSchema(
      [{ file: 'a', severity: 'low' }, { file: 2, severity: 'low' }],
      { type: 'array', items: schema },
    );
    expect(errors.join(' ')).toContain('$[1].file');
  });

  it('treats integer as a number but not the reverse', () => {
    expect(validateSchema(4, { type: 'number' }).errors).toEqual([]);
    expect(validateSchema(4.5, { type: 'integer' }).errors).toHaveLength(1);
  });

  it('allows null when nullable is set', () => {
    expect(validateSchema(null, { type: 'string', nullable: true }).errors).toEqual([]);
    expect(validateSchema(null, { type: 'string' }).errors).toHaveLength(1);
  });

  it('reports unsupported keywords rather than silently ignoring them', () => {
    const { unsupported } = validateSchema(
      { a: 1 },
      { type: 'object', patternProperties: {}, allOf: [] },
    );
    expect(unsupported).toEqual(['patternProperties', 'allOf']);
  });

  it('surfaces the unsupported note in the assertion detail', () => {
    const result = run(
      { type: 'json_schema', schema: { type: 'object', oneOf: [] } },
      '{"a":1}',
    );
    expect(result.passed).toBe(true);
    expect(result.detail).toContain('ignored unsupported keywords: oneOf');
  });
});

describe('json_schema assertion', () => {
  it('fails when the output is not JSON at all', () => {
    const result = run({ type: 'json_schema', schema: { type: 'object' } }, 'nope');
    expect(result.passed).toBe(false);
    expect(result.detail).toMatch(/Not valid JSON/);
  });
});

describe('evaluateAssertion', () => {
  it('treats a case with no assertion as a smoke test', async () => {
    expect((await evaluateAssertion(null, 'anything')).passed).toBe(true);
    expect((await evaluateAssertion(null, '   ')).passed).toBe(false);
  });

  it('delegates llm_judge to the injected judge', async () => {
    const judge = vi.fn(async () => ({ passed: true, detail: 'Scored 4/5.' }));
    const result = await evaluateAssertion(
      { type: 'llm_judge', rubric: 'Is it terse?', threshold: 4 },
      'output',
      judge,
    );
    expect(judge).toHaveBeenCalledWith('Is it terse?', 'output', 4);
    expect(result.detail).toBe('Scored 4/5.');
  });

  it('fails rather than silently passing when no judge is available', async () => {
    const result = await evaluateAssertion(
      { type: 'llm_judge', rubric: 'x' },
      'output',
    );
    expect(result.passed).toBe(false);
  });
});

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    const out = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms / 10));
      return ms;
    });
    expect(out).toEqual([30, 10, 20]);
  });

  it('never exceeds the concurrency cap', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('reports monotonic progress ending at the total', async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3, 4], 2, async (n) => n, (p) => seen.push(p.completed));
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('handles an empty list and a cap larger than the list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 99, async (n) => n * 2)).toEqual([2, 4]);
  });

  it('clamps a nonsensical cap to at least one', async () => {
    expect(await mapWithConcurrency([1, 2], 0, async (n) => n)).toEqual([1, 2]);
  });
});
