import { describe, expect, it } from 'vitest';
import { changedSections, diffSections, summarizeDiff } from './diff';
import { emptySections, type PromptSections } from './sections';

function make(overrides: Partial<PromptSections> = {}): PromptSections {
  return { ...emptySections(), ...overrides };
}

function find(diffs: ReturnType<typeof diffSections>, key: string) {
  const d = diffs.find((x) => x.key === key);
  if (!d) throw new Error(`no diff entry for ${key}`);
  return d;
}

describe('diffSections', () => {
  it('returns one entry per section, in canonical order', () => {
    const diffs = diffSections(make(), make());
    expect(diffs).toHaveLength(10);
    expect(diffs[0].key).toBe('task_context');
    expect(diffs.at(-1)!.key).toBe('prefill');
  });

  it('marks everything unchanged for identical versions', () => {
    const sections = make({ task_context: 'Role.', rules: ['A.'] });
    const diffs = diffSections(sections, structuredClone(sections));
    expect(diffs.every((d) => d.status === 'unchanged')).toBe(true);
    expect(summarizeDiff(diffs).identical).toBe(true);
  });

  it('detects an added section', () => {
    const diffs = diffSections(make(), make({ tone: 'Terse.' }));
    const tone = find(diffs, 'tone');
    expect(tone.status).toBe('added');
    expect(tone.before).toBe('');
    expect(tone.after).toBe('Terse.');
  });

  it('detects a removed section', () => {
    const diffs = diffSections(make({ tone: 'Terse.' }), make());
    expect(find(diffs, 'tone').status).toBe('removed');
  });

  it('detects a changed section and produces word-level hunks', () => {
    const diffs = diffSections(
      make({ task_context: 'You are a reviewer.' }),
      make({ task_context: 'You are a security reviewer.' }),
    );
    const ctx = find(diffs, 'task_context');
    expect(ctx.status).toBe('changed');

    const added = ctx.hunks.filter((h) => h.added).map((h) => h.value).join('');
    expect(added).toContain('security');
    // Unchanged words are not reported as edits.
    expect(ctx.hunks.some((h) => !h.added && !h.removed && h.value.includes('You'))).toBe(
      true,
    );
  });

  it('produces no hunks for sections that did not change', () => {
    const diffs = diffSections(make({ tone: 'Same.' }), make({ tone: 'Same.' }));
    expect(find(diffs, 'tone').hunks).toEqual([]);
  });

  it('compares rendered text, so a reordered rule shows as a change', () => {
    const diffs = diffSections(
      make({ rules: ['First.', 'Second.'] }),
      make({ rules: ['Second.', 'First.'] }),
    );
    expect(find(diffs, 'rules').status).toBe('changed');
  });

  it('treats a whitespace-only edit as no change, since it renders identically', () => {
    const diffs = diffSections(
      make({ task_context: 'Role.' }),
      make({ task_context: '  Role.  ' }),
    );
    expect(find(diffs, 'task_context').status).toBe('unchanged');
  });

  it('reports a rule appended to an existing list as a change, not an addition', () => {
    const diffs = diffSections(
      make({ rules: ['One.'] }),
      make({ rules: ['One.', 'Two.'] }),
    );
    const rules = find(diffs, 'rules');
    expect(rules.status).toBe('changed');
    expect(rules.after).toContain('2. Two.');
  });

  it('detects a document swapped for another', () => {
    const diffs = diffSections(
      make({ background: [{ title: 'a.md', content: 'A' }] }),
      make({ background: [{ title: 'b.md', content: 'B' }] }),
    );
    expect(find(diffs, 'background').status).toBe('changed');
  });
});

describe('changedSections', () => {
  it('drops unchanged entries', () => {
    const diffs = diffSections(
      make({ task_context: 'Role.', tone: 'Terse.' }),
      make({ task_context: 'Role.', tone: 'Warm.' }),
    );
    const changed = changedSections(diffs);
    expect(changed).toHaveLength(1);
    expect(changed[0].key).toBe('tone');
  });
});

describe('summarizeDiff', () => {
  it('counts each status', () => {
    const diffs = diffSections(
      make({ task_context: 'Role.', tone: 'Terse.' }),
      make({ task_context: 'New role.', rules: ['A.'] }),
    );
    const s = summarizeDiff(diffs);
    expect(s.changed).toBe(1); // task_context
    expect(s.removed).toBe(1); // tone
    expect(s.added).toBe(1); // rules
    expect(s.unchanged).toBe(7);
    expect(s.identical).toBe(false);
  });
});
