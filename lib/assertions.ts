/**
 * Assertion evaluation for the test runner.
 *
 * Everything except llm_judge is deterministic and pure. The judge is
 * injected so the suite can be tested without a model call.
 */

import type { AssertionSpec } from './db/schema';

export interface AssertionResult {
  passed: boolean;
  /** Shown in the matrix cell tooltip — say why, not just that it failed. */
  detail: string;
}

/** JSON Schema keywords this validator understands. */
const SUPPORTED_KEYWORDS = new Set([
  'type', 'properties', 'required', 'items', 'enum',
  'minimum', 'maximum', 'minLength', 'maxLength',
  'minItems', 'maxItems', 'additionalProperties', 'nullable',
]);

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function matchesType(value: unknown, expected: string): boolean {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  return actual === expected;
}

/**
 * Validate against a useful subset of JSON Schema.
 *
 * Unsupported keywords are reported rather than silently ignored — quietly
 * passing a schema you did not actually check is worse than not checking.
 */
export function validateSchema(
  value: unknown,
  schema: unknown,
  path = '$',
): { errors: string[]; unsupported: string[] } {
  const errors: string[] = [];
  const unsupported: string[] = [];

  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return { errors: [`${path}: schema is not an object`], unsupported };
  }

  const s = schema as Record<string, unknown>;

  for (const key of Object.keys(s)) {
    if (!SUPPORTED_KEYWORDS.has(key)) unsupported.push(key);
  }

  if (typeof s.type === 'string') {
    const nullable = s.nullable === true;
    if (!(nullable && value === null) && !matchesType(value, s.type)) {
      errors.push(`${path}: expected ${s.type}, got ${typeOf(value)}`);
      return { errors, unsupported };
    }
  }

  if (Array.isArray(s.enum) && !s.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`);
  }

  if (typeof value === 'number') {
    if (typeof s.minimum === 'number' && value < s.minimum) {
      errors.push(`${path}: ${value} < minimum ${s.minimum}`);
    }
    if (typeof s.maximum === 'number' && value > s.maximum) {
      errors.push(`${path}: ${value} > maximum ${s.maximum}`);
    }
  }

  if (typeof value === 'string') {
    if (typeof s.minLength === 'number' && value.length < s.minLength) {
      errors.push(`${path}: length ${value.length} < minLength ${s.minLength}`);
    }
    if (typeof s.maxLength === 'number' && value.length > s.maxLength) {
      errors.push(`${path}: length ${value.length} > maxLength ${s.maxLength}`);
    }
  }

  if (Array.isArray(value)) {
    if (typeof s.minItems === 'number' && value.length < s.minItems) {
      errors.push(`${path}: ${value.length} items < minItems ${s.minItems}`);
    }
    if (typeof s.maxItems === 'number' && value.length > s.maxItems) {
      errors.push(`${path}: ${value.length} items > maxItems ${s.maxItems}`);
    }
    if (s.items) {
      value.forEach((item, i) => {
        const child = validateSchema(item, s.items, `${path}[${i}]`);
        errors.push(...child.errors);
        unsupported.push(...child.unsupported);
      });
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;

    if (Array.isArray(s.required)) {
      for (const key of s.required) {
        if (typeof key === 'string' && !(key in obj)) {
          errors.push(`${path}: missing required property "${key}"`);
        }
      }
    }

    const props = (s.properties ?? {}) as Record<string, unknown>;
    for (const [key, sub] of Object.entries(props)) {
      if (!(key in obj)) continue;
      const child = validateSchema(obj[key], sub, `${path}.${key}`);
      errors.push(...child.errors);
      unsupported.push(...child.unsupported);
    }

    if (s.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) errors.push(`${path}: unexpected property "${key}"`);
      }
    }
  }

  return { errors, unsupported: [...new Set(unsupported)] };
}

/** Evaluate every assertion type except llm_judge, which needs a model. */
export function evaluateDeterministic(
  spec: AssertionSpec,
  output: string,
): AssertionResult {
  switch (spec.type) {
    case 'contains': {
      const haystack = spec.caseSensitive ? output : output.toLowerCase();
      const needle = spec.caseSensitive ? spec.value : spec.value.toLowerCase();
      const passed = haystack.includes(needle);
      return {
        passed,
        detail: passed
          ? `Output contains "${spec.value}".`
          : `Output does not contain "${spec.value}".`,
      };
    }

    case 'not_contains': {
      const haystack = spec.caseSensitive ? output : output.toLowerCase();
      const needle = spec.caseSensitive ? spec.value : spec.value.toLowerCase();
      const found = haystack.includes(needle);
      return {
        passed: !found,
        detail: found
          ? `Output contains "${spec.value}", which it must not.`
          : `Output does not contain "${spec.value}".`,
      };
    }

    case 'regex': {
      let re: RegExp;
      try {
        re = new RegExp(spec.pattern, spec.flags);
      } catch (e) {
        return { passed: false, detail: `Invalid regex: ${(e as Error).message}` };
      }
      const match = re.exec(output);
      return {
        passed: match !== null,
        detail: match
          ? `Matched "${match[0].slice(0, 80)}".`
          : `No match for /${spec.pattern}/${spec.flags ?? ''}.`,
      };
    }

    case 'valid_json': {
      try {
        JSON.parse(output.trim());
        return { passed: true, detail: 'Output parses as JSON.' };
      } catch (e) {
        return { passed: false, detail: `Not valid JSON: ${(e as Error).message}` };
      }
    }

    case 'json_schema': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(output.trim());
      } catch (e) {
        return { passed: false, detail: `Not valid JSON: ${(e as Error).message}` };
      }

      const { errors, unsupported } = validateSchema(parsed, spec.schema);
      const note =
        unsupported.length > 0
          ? ` (ignored unsupported keywords: ${unsupported.join(', ')})`
          : '';

      return errors.length === 0
        ? { passed: true, detail: `Matches schema.${note}` }
        : { passed: false, detail: `${errors.slice(0, 3).join('; ')}${note}` };
    }

    case 'llm_judge':
      return { passed: false, detail: 'llm_judge requires a model call.' };
  }
}

export function isDeterministic(spec: AssertionSpec): boolean {
  return spec.type !== 'llm_judge';
}

export type JudgeFn = (
  rubric: string,
  output: string,
  threshold: number,
) => Promise<AssertionResult>;

/**
 * Evaluate any assertion. `judge` is injected so the suite runner can be
 * tested end to end without a model call.
 */
export async function evaluateAssertion(
  spec: AssertionSpec | null | undefined,
  output: string,
  judge?: JudgeFn,
): Promise<AssertionResult> {
  // A case with no assertion is a smoke test: it passes if the run produced
  // anything at all.
  if (!spec) {
    const passed = output.trim() !== '';
    return {
      passed,
      detail: passed ? 'Produced output.' : 'Produced no output.',
    };
  }

  if (spec.type === 'llm_judge') {
    if (!judge) return { passed: false, detail: 'No judge available.' };
    return judge(spec.rubric, output, spec.threshold ?? 3);
  }

  return evaluateDeterministic(spec, output);
}
