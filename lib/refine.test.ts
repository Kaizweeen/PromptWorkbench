import { describe, expect, it } from 'vitest';
import {
  RefineParseError,
  applyAccepted,
  extractJson,
  parseRefineResponse,
  proposedKeys,
  variableDrift,
} from './refine';
import { emptySections, type PromptSections } from './sections';

function make(over: Partial<PromptSections> = {}): PromptSections {
  return { ...emptySections(), ...over };
}

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses a fenced block, since models add fences even when told not to', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses an unlabelled fence', () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recovers an object wrapped in stray prose', () => {
    expect(extractJson('Here you go:\n{"a":1}\nHope that helps.')).toEqual({ a: 1 });
  });

  it('returns undefined for unparseable text', () => {
    expect(extractJson('not json at all')).toBeUndefined();
    expect(extractJson('')).toBeUndefined();
  });
});

describe('parseRefineResponse', () => {
  it('reads sections and notes', () => {
    const result = parseRefineResponse(
      JSON.stringify({
        sections: { task_context: 'Tighter context.', rules: ['One.', 'Two.'] },
        notes: ['Unclear what an empty input means.'],
      }),
    );
    expect(result.sections.task_context).toBe('Tighter context.');
    expect(result.sections.rules).toEqual(['One.', 'Two.']);
    expect(result.notes).toEqual(['Unclear what an empty input means.']);
  });

  it('omits sections the model did not return', () => {
    const result = parseRefineResponse(JSON.stringify({ sections: { tone: 'Terse.' } }));
    expect(Object.keys(result.sections)).toEqual(['tone']);
  });

  it('defaults notes to an empty array', () => {
    expect(parseRefineResponse('{"sections":{}}').notes).toEqual([]);
  });

  it('reads structured examples and documents', () => {
    const result = parseRefineResponse(
      JSON.stringify({
        sections: {
          examples: [{ input: 'in', output: 'out' }],
          background: [{ title: 'spec.md', content: 'body' }],
        },
      }),
    );
    expect(result.sections.examples).toEqual([{ input: 'in', output: 'out' }]);
    expect(result.sections.background).toEqual([{ title: 'spec.md', content: 'body' }]);
  });

  it('ignores a prefill key — refinement must never add one', () => {
    const result = parseRefineResponse(
      JSON.stringify({ sections: { prefill: '{"a":', tone: 'Terse.' } }),
    );
    expect(result.sections).not.toHaveProperty('prefill');
    expect(result.sections.tone).toBe('Terse.');
  });

  it('ignores unknown keys', () => {
    const result = parseRefineResponse(
      JSON.stringify({ sections: { nonsense: 'x', tone: 'ok' } }),
    );
    expect(Object.keys(result.sections)).toEqual(['tone']);
  });

  it('drops a section whose type is wrong rather than corrupting the editor', () => {
    const result = parseRefineResponse(
      JSON.stringify({ sections: { task_context: { not: 'a string' }, rules: 'not an array' } }),
    );
    expect(result.sections).toEqual({});
  });

  it('drops malformed entries inside a collection but keeps the good ones', () => {
    const result = parseRefineResponse(
      JSON.stringify({ sections: { examples: [{ input: 'a', output: 'b' }, null, 42] } }),
    );
    expect(result.sections.examples).toEqual([{ input: 'a', output: 'b' }]);
  });

  it('fills a missing half of a pair rather than dropping it', () => {
    const result = parseRefineResponse(
      JSON.stringify({ sections: { examples: [{ input: 'only input' }] } }),
    );
    expect(result.sections.examples).toEqual([{ input: 'only input', output: '' }]);
  });

  it('throws a readable error on unusable output', () => {
    expect(() => parseRefineResponse('sorry, I cannot help')).toThrow(RefineParseError);
  });

  it('rejects a JSON array root, which typeof reports as an object', () => {
    expect(() => parseRefineResponse('[]')).toThrow(RefineParseError);
    expect(() => parseRefineResponse('[{"sections":{}}]')).toThrow(RefineParseError);
  });

  it('rejects a sections field that is not an object', () => {
    expect(() => parseRefineResponse('{"sections":[]}')).toThrow(RefineParseError);
    expect(() => parseRefineResponse('{"sections":"nope"}')).toThrow(RefineParseError);
  });
});

describe('proposedKeys', () => {
  it('lists only sections that actually differ', () => {
    const current = make({ task_context: 'Same.', tone: 'Old.' });
    const proposed = { task_context: 'Same.', tone: 'New.' };
    expect(proposedKeys(current, proposed)).toEqual(['tone']);
  });

  it('counts a newly filled empty section as a change', () => {
    expect(proposedKeys(make(), { rules: ['A rule.'] })).toEqual(['rules']);
  });

  it('is empty when nothing was proposed', () => {
    expect(proposedKeys(make({ tone: 'x' }), {})).toEqual([]);
  });
});

describe('applyAccepted', () => {
  const current = make({ task_context: 'Mine.', tone: 'My tone.' });
  const proposed = { task_context: 'Theirs.', tone: 'Their tone.' };

  it('applies only the accepted sections', () => {
    const out = applyAccepted(current, proposed, ['tone']);
    expect(out.tone).toBe('Their tone.');
    expect(out.task_context).toBe('Mine.');
  });

  it('changes nothing when nothing is accepted', () => {
    expect(applyAccepted(current, proposed, [])).toEqual(current);
  });

  it('ignores an accepted key the model never proposed', () => {
    expect(applyAccepted(current, proposed, ['rules'])).toEqual(current);
  });

  it('does not mutate the current sections or the proposal', () => {
    const currentSnapshot = structuredClone(current);
    const proposedSnapshot = structuredClone(proposed);
    const out = applyAccepted(current, proposed, ['task_context', 'tone']);
    out.tone = 'mutated';
    expect(current).toEqual(currentSnapshot);
    expect(proposed).toEqual(proposedSnapshot);
  });

  it('deep-clones collections so later edits do not alias the proposal', () => {
    const withExamples = { examples: [{ input: 'a', output: 'b' }] };
    const out = applyAccepted(make(), withExamples, ['examples']);
    out.examples[0].input = 'changed';
    expect(withExamples.examples[0].input).toBe('a');
  });
});

describe('variableDrift', () => {
  it('reports a variable the refinement dropped', () => {
    const current = make({ immediate_task: 'Review {{diff}}.' });
    const merged = make({ immediate_task: 'Review the diff.' });
    expect(variableDrift(current, merged)).toEqual({ added: [], removed: ['diff'] });
  });

  it('reports a variable the refinement invented', () => {
    const current = make({ immediate_task: 'Review {{diff}}.' });
    const merged = make({ immediate_task: 'Review {{diff}} for {{repo}}.' });
    expect(variableDrift(current, merged)).toEqual({ added: ['repo'], removed: [] });
  });

  it('reports a rename as both an add and a remove', () => {
    const current = make({ immediate_task: '{{old_name}}' });
    const merged = make({ immediate_task: '{{new_name}}' });
    expect(variableDrift(current, merged)).toEqual({
      added: ['new_name'],
      removed: ['old_name'],
    });
  });

  it('is clean when variables are preserved', () => {
    const current = make({ immediate_task: 'Review {{diff}}.' });
    const merged = make({ immediate_task: 'Carefully review {{diff}} now.' });
    expect(variableDrift(current, merged)).toEqual({ added: [], removed: [] });
  });
});
