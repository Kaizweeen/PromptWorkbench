import { describe, expect, it } from 'vitest';
import {
  applyVariables,
  applyVariablesToSections,
  detectVariables,
  missingVariables,
  orphanedValues,
  variableNames,
} from './variables';
import { emptySections, type PromptSections } from './sections';

function make(overrides: Partial<PromptSections> = {}): PromptSections {
  return { ...emptySections(), ...overrides };
}

describe('detectVariables', () => {
  it('finds a placeholder in a plain text section', () => {
    const vars = detectVariables(make({ immediate_task: 'Review {{diff}}.' }));
    expect(vars).toHaveLength(1);
    expect(vars[0].name).toBe('diff');
    expect(vars[0].total).toBe(1);
    expect(vars[0].occurrences).toEqual([{ section: 'immediate_task', count: 1 }]);
  });

  it('tolerates inner whitespace', () => {
    expect(variableNames(make({ tone: '{{  spaced  }}' }))).toEqual(['spaced']);
  });

  it('deduplicates a name used more than once and counts every use', () => {
    const vars = detectVariables(
      make({ task_context: '{{x}} and {{x}}', immediate_task: 'again {{x}}' }),
    );
    expect(vars).toHaveLength(1);
    expect(vars[0].total).toBe(3);
    expect(vars[0].occurrences).toEqual([
      { section: 'task_context', count: 2 },
      { section: 'immediate_task', count: 1 },
    ]);
  });

  it('scans inside documents, rules, and examples', () => {
    const vars = variableNames(
      make({
        background: [{ title: '{{doc_name}}', content: 'body {{doc_body}}' }],
        rules: ['Never mention {{secret}}.'],
        examples: [{ input: '{{ex_in}}', output: '{{ex_out}}' }],
      }),
    );
    expect(vars).toEqual(['doc_name', 'doc_body', 'secret', 'ex_in', 'ex_out']);
  });

  it('orders by first appearance in canonical section order, not object order', () => {
    // immediate_task (7) is written first but renders after task_context (1).
    const vars = variableNames(
      make({ immediate_task: '{{second}}', task_context: '{{first}}' }),
    );
    expect(vars).toEqual(['first', 'second']);
  });

  it('ignores malformed or non-identifier placeholders', () => {
    const vars = variableNames(
      make({ tone: '{{9bad}} {{ }} {single} {{with-dash}} {{ok_1}}' }),
    );
    expect(vars).toEqual(['ok_1']);
  });

  it('returns nothing for a prompt with no placeholders', () => {
    expect(variableNames(make({ task_context: 'No placeholders here.' }))).toEqual([]);
  });
});

describe('missingVariables', () => {
  it('lists variables with no value', () => {
    const sections = make({ immediate_task: '{{a}} {{b}}' });
    expect(missingVariables(sections, { a: 'set' })).toEqual(['b']);
  });

  it('treats a blank value as missing — a run must not send an empty slot', () => {
    const sections = make({ immediate_task: '{{a}}' });
    expect(missingVariables(sections, { a: '   ' })).toEqual(['a']);
  });

  it('is empty when everything is supplied', () => {
    const sections = make({ immediate_task: '{{a}}' });
    expect(missingVariables(sections, { a: 'x' })).toEqual([]);
  });
});

describe('orphanedValues', () => {
  it('flags values whose placeholder no longer exists', () => {
    const sections = make({ immediate_task: '{{a}}' });
    expect(orphanedValues(sections, { a: '1', gone: '2' })).toEqual(['gone']);
  });
});

describe('applyVariables', () => {
  it('substitutes known values', () => {
    expect(applyVariables('Hello {{name}}!', { name: 'world' })).toBe('Hello world!');
  });

  it('leaves unknown placeholders untouched rather than blanking them', () => {
    expect(applyVariables('{{a}} {{b}}', { a: 'x' })).toBe('x {{b}}');
  });

  it('substitutes an explicitly empty value', () => {
    expect(applyVariables('[{{a}}]', { a: '' })).toBe('[]');
  });

  it('handles repeated placeholders', () => {
    expect(applyVariables('{{a}}-{{a}}', { a: 'z' })).toBe('z-z');
  });

  it('does not treat a value containing braces as a further placeholder', () => {
    expect(applyVariables('{{a}}', { a: '{{b}}' })).toBe('{{b}}');
  });
});

describe('applyVariablesToSections', () => {
  it('substitutes across every section shape', () => {
    const out = applyVariablesToSections(
      make({
        task_context: 'Role {{r}}',
        background: [{ title: '{{t}}', content: '{{c}}' }],
        rules: ['Rule {{r}}'],
        examples: [{ input: '{{i}}', output: '{{o}}' }],
      }),
      { r: 'reviewer', t: 'spec', c: 'body', i: 'in', o: 'out' },
    );

    expect(out.task_context).toBe('Role reviewer');
    expect(out.background[0]).toEqual({ title: 'spec', content: 'body' });
    expect(out.rules[0]).toBe('Rule reviewer');
    expect(out.examples[0]).toEqual({ input: 'in', output: 'out' });
  });

  it('does not mutate the input', () => {
    const sections = make({ task_context: '{{a}}' });
    const snapshot = structuredClone(sections);
    applyVariablesToSections(sections, { a: 'x' });
    expect(sections).toEqual(snapshot);
  });
});
