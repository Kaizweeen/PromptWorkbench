import { describe, expect, it } from 'vitest';
import { renderFullText, renderPrompt, renderTechStack } from './render';
import { emptySections, type PromptSections } from './sections';

function make(overrides: Partial<PromptSections> = {}): PromptSections {
  return { ...emptySections(), ...overrides };
}

describe('renderPrompt — omission', () => {
  it('returns empty turns for a wholly empty prompt', () => {
    const out = renderPrompt(make());
    expect(out.system).toBe('');
    expect(out.user).toBe('');
    expect(out.prefill).toBeUndefined();
  });

  it('omits empty sections entirely, leaving no dangling tags', () => {
    const out = renderPrompt(make({ task_context: 'You are a reviewer.' }));
    expect(out.system).toBe('You are a reviewer.');
    expect(out.system).not.toContain('<instructions>');
    expect(out.system).not.toContain('<examples>');
    expect(out.system).not.toContain('<documents>');
  });

  it('treats whitespace-only sections as empty', () => {
    const out = renderPrompt(make({ task_context: 'Role.', tone: '   \n  \t ' }));
    expect(out.system).toBe('Role.');
    expect(out.system).not.toContain('tone_and_style');
  });

  it('drops blank entries inside collections', () => {
    const out = renderPrompt(
      make({ rules: ['  ', 'Keep it short.', ''] }),
    );
    expect(out.system).toBe('<instructions>\n1. Keep it short.\n</instructions>');
  });

  it('omits a collection whose entries are all blank', () => {
    const out = renderPrompt(make({ task_context: 'Role.', rules: ['', '   '] }));
    expect(out.system).toBe('Role.');
  });
});

describe('renderPrompt — XML tagging', () => {
  it('wraps multi-line text sections in their semantic tag', () => {
    const out = renderPrompt(make({ tone: 'Line one.\nLine two.' }));
    expect(out.system).toBe('<tone_and_style>\nLine one.\nLine two.\n</tone_and_style>');
  });

  it('leaves single-line text sections bare', () => {
    const out = renderPrompt(make({ tone: 'Terse and technical.' }));
    expect(out.system).toBe('Terse and technical.');
  });

  it('always tags collections, even with one short entry', () => {
    const out = renderPrompt(make({ rules: ['Be brief.'] }));
    expect(out.system).toContain('<instructions>');
    expect(out.system).toContain('</instructions>');
  });

  it('numbers rules in order', () => {
    const out = renderPrompt(make({ rules: ['First.', 'Second.', 'Third.'] }));
    expect(out.system).toBe(
      '<instructions>\n1. First.\n2. Second.\n3. Third.\n</instructions>',
    );
  });

  it('wraps each example in its own <example> tag', () => {
    const out = renderPrompt(
      make({
        examples: [
          { input: 'in-a', output: 'out-a' },
          { input: 'in-b', output: 'out-b' },
        ],
      }),
    );
    expect(out.system).toBe(
      [
        '<examples>',
        '<example>',
        '<input>',
        'in-a',
        '</input>',
        '<output>',
        'out-a',
        '</output>',
        '</example>',
        '<example>',
        '<input>',
        'in-b',
        '</input>',
        '<output>',
        'out-b',
        '</output>',
        '</example>',
        '</examples>',
      ].join('\n'),
    );
  });

  it('indexes documents and carries their source title', () => {
    const out = renderPrompt(
      make({
        background: [
          { title: 'spec.md', content: 'Body one.' },
          { title: '', content: 'Body two.' },
        ],
      }),
    );
    expect(out.system).toContain('<document index="1">');
    expect(out.system).toContain('<source>spec.md</source>');
    expect(out.system).toContain('<document index="2">');
    // A document with no title renders without an empty <source> tag.
    expect(out.system).not.toContain('<source></source>');
  });
});

describe('renderPrompt — ordering', () => {
  it('puts long documents near the top and the immediate task at the bottom', () => {
    const out = renderPrompt(
      make({
        task_context: 'Role.',
        background: [{ title: 'doc', content: 'Long content.' }],
        rules: ['A rule.'],
        immediate_task: 'Do the thing.',
      }),
    );
    const docsAt = out.system.indexOf('<documents>');
    const rulesAt = out.system.indexOf('<instructions>');
    expect(docsAt).toBeGreaterThan(-1);
    expect(docsAt).toBeLessThan(rulesAt);
    // The immediate task is the last thing Claude reads.
    expect(out.user.trimEnd().endsWith('Do the thing.')).toBe(true);
  });

  it('renders in canonical order regardless of object key order', () => {
    const scrambled = {
      output_format: 'JSON.',
      task_context: 'Role.',
      tone: 'Terse.',
    } as Partial<PromptSections>;
    const out = renderPrompt(make(scrambled));
    expect(out.system.indexOf('Role.')).toBeLessThan(out.system.indexOf('Terse.'));
    expect(out.system.indexOf('Terse.')).toBeLessThan(out.system.indexOf('JSON.'));
  });

  it('separates blocks with a blank line', () => {
    const out = renderPrompt(make({ task_context: 'Role.', tone: 'Terse.' }));
    expect(out.system).toBe('Role.\n\nTerse.');
  });
});

describe('renderPrompt — turn split', () => {
  it('puts stable sections in system and per-invocation sections in user', () => {
    const out = renderPrompt(
      make({
        task_context: 'Role.',
        rules: ['A rule.'],
        history: 'Earlier turns.',
        immediate_task: 'Do it.',
      }),
    );
    expect(out.system).toContain('Role.');
    expect(out.system).toContain('<instructions>');
    expect(out.system).not.toContain('Do it.');

    expect(out.user).toContain('Earlier turns.');
    expect(out.user).toContain('Do it.');
    expect(out.user).not.toContain('<instructions>');
  });

  it('honours per-prompt channel overrides', () => {
    const out = renderPrompt(
      make({ task_context: 'Role.', immediate_task: 'Do it.' }),
      { channelOverrides: { task_context: 'user' } },
    );
    expect(out.system).toBe('');
    expect(out.user).toContain('Role.');
    expect(out.user).toContain('Do it.');
  });
});

describe('renderPrompt — prefill', () => {
  it('returns prefill as its own turn, not inside system or user', () => {
    const out = renderPrompt(make({ task_context: 'Role.', prefill: '{"findings": [' }));
    expect(out.prefill).toBe('{"findings": [');
    expect(out.system).not.toContain('findings');
    expect(out.user).not.toContain('findings');
  });

  it('strips trailing whitespace, which the API rejects on a prefill', () => {
    const out = renderPrompt(make({ prefill: '{"a":   \n  ' }));
    expect(out.prefill).toBe('{"a":');
  });

  it('omits the prefill key entirely when the section is blank', () => {
    const out = renderPrompt(make({ task_context: 'Role.', prefill: '   ' }));
    expect(out).not.toHaveProperty('prefill');
  });
});

describe('renderTechStack', () => {
  it('renders selected stack as a <tech_stack> block', () => {
    const block = renderTechStack([
      { category: 'Language / runtime', items: ['TypeScript', 'Node.js'] },
      { category: 'Database / ORM', items: ['PostgreSQL'] },
    ]);
    expect(block).toBe(
      [
        '<tech_stack>',
        'Language / runtime: TypeScript, Node.js',
        'Database / ORM: PostgreSQL',
        '</tech_stack>',
      ].join('\n'),
    );
  });

  it('omits categories with no selections', () => {
    const block = renderTechStack([
      { category: 'Auth', items: [] },
      { category: 'Testing', items: ['Vitest'] },
    ]);
    expect(block).toBe('<tech_stack>\nTesting: Vitest\n</tech_stack>');
  });

  it('renders nothing when no category has a selection', () => {
    expect(renderTechStack([{ category: 'Auth', items: ['  '] }])).toBe('');
  });

  it('places the stack block directly after the task context', () => {
    const out = renderPrompt(make({ task_context: 'Role.', tone: 'Terse.' }), {
      stack: [{ category: 'Auth', items: ['Clerk'] }],
    });
    expect(out.system).toBe('Role.\n\n<tech_stack>\nAuth: Clerk\n</tech_stack>\n\nTerse.');
  });

  it('still emits the stack when there is no task context to anchor it', () => {
    const out = renderPrompt(make({ tone: 'Terse.' }), {
      stack: [{ category: 'Auth', items: ['Clerk'] }],
    });
    expect(out.system.startsWith('<tech_stack>')).toBe(true);
    expect(out.system).toContain('Terse.');
  });
});

describe('renderPrompt — purity', () => {
  it('is deterministic across calls', () => {
    const sections = make({
      task_context: 'Role.',
      rules: ['One.', 'Two.'],
      immediate_task: 'Go.',
    });
    expect(renderPrompt(sections)).toEqual(renderPrompt(sections));
  });

  it('does not mutate the sections it is given', () => {
    const sections = make({ task_context: '  Role.  ', rules: ['  A.  '] });
    const snapshot = structuredClone(sections);
    renderPrompt(sections);
    expect(sections).toEqual(snapshot);
  });
});

describe('renderFullText', () => {
  it('labels each turn and omits absent ones', () => {
    const text = renderFullText(renderPrompt(make({ task_context: 'Role.' })));
    expect(text).toBe('===== SYSTEM =====\nRole.');
    expect(text).not.toContain('USER');
  });

  it('includes the prefill turn when present', () => {
    const text = renderFullText(
      renderPrompt(make({ task_context: 'Role.', immediate_task: 'Go.', prefill: '{' })),
    );
    expect(text).toContain('===== SYSTEM =====');
    expect(text).toContain('===== USER =====');
    expect(text).toContain('===== ASSISTANT (prefill) =====');
  });
});
