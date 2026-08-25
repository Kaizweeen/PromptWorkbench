import { describe, expect, it } from 'vitest';
import {
  applyDraft,
  buildDraft,
  sectionsDraftWouldFill,
  sectionsReplaceWouldOverwrite,
} from './generate';
import { TEMPLATES, TEMPLATE_LIST, getTemplate, isArchetypeId } from './templates';
import { emptySections, type PromptSections } from './sections';
import { renderPrompt } from './render';

function make(overrides: Partial<PromptSections> = {}): PromptSections {
  return { ...emptySections(), ...overrides };
}

const BASE = { archetype: 'code_generation', goal: 'review pull requests', requirements: [] };

describe('buildDraft', () => {
  it('is deterministic', () => {
    expect(buildDraft(BASE)).toEqual(buildDraft(BASE));
  });

  it('substitutes the goal into the task context', () => {
    const draft = buildDraft({ ...BASE, goal: 'triage inbound support tickets' });
    expect(draft.sections.task_context).toContain('triage inbound support tickets');
    expect(draft.sections.task_context).not.toContain('[[goal]]');
  });

  it('falls back to readable wording when no goal is given', () => {
    const draft = buildDraft({ ...BASE, goal: '   ' });
    expect(draft.sections.task_context).not.toContain('[[goal]]');
    expect(draft.sections.task_context).toContain('carry out the task described below');
  });

  it('appends requirements after the archetype rules', () => {
    const draft = buildDraft({
      ...BASE,
      requirements: ['Never touch the migrations directory.'],
    });
    const template = getTemplate('code_generation');
    expect(draft.sections.rules).toHaveLength(template.rules.length + 1);
    expect(draft.sections.rules.at(-1)).toBe('Never touch the migrations directory.');
    expect(draft.sections.rules[0]).toBe(template.rules[0]);
  });

  it('drops blank requirements and de-duplicates', () => {
    const draft = buildDraft({
      ...BASE,
      archetype: 'custom',
      requirements: ['  ', 'One.', 'One.', ''],
    });
    expect(draft.sections.rules).toEqual(['One.']);
  });

  it('carries the stack through without aliasing the caller’s array', () => {
    const stack = [{ category: 'Language / runtime', items: ['TypeScript'] }];
    const draft = buildDraft({ ...BASE, stack });
    expect(draft.stack).toEqual(stack);
    draft.stack[0].items.push('mutated');
    expect(stack[0].items).toEqual(['TypeScript']);
  });

  it('never mutates the shared template singleton', () => {
    const before = structuredClone(TEMPLATES.code_generation);
    const draft = buildDraft({ ...BASE, requirements: ['Extra rule.'] });
    draft.sections.rules.push('another');
    draft.sections.examples.push({ input: 'x', output: 'y' });
    expect(TEMPLATES.code_generation).toEqual(before);
  });

  it('rejects an unknown archetype rather than silently producing junk', () => {
    expect(() => buildDraft({ ...BASE, archetype: 'nonsense' })).toThrow(/Unknown archetype/);
  });

  it('leaves {{runtime variables}} in the template intact', () => {
    const draft = buildDraft({ ...BASE, goal: 'x' });
    expect(draft.sections.immediate_task).toContain('{{code}}');
  });

  it('produces an empty-but-valid draft for the custom archetype', () => {
    const draft = buildDraft({ archetype: 'custom', goal: 'do a thing', requirements: [] });
    expect(draft.sections.task_context).toContain('do a thing');
    expect(draft.sections.rules).toEqual([]);
    expect(draft.sections.output_format).toBe('');
  });
});

describe('archetype templates', () => {
  it('exposes all six archetypes', () => {
    expect(TEMPLATE_LIST).toHaveLength(6);
  });

  it('keeps registry keys and template ids in sync', () => {
    for (const [key, template] of Object.entries(TEMPLATES)) {
      expect(template.id).toBe(key);
    }
  });

  it('narrows archetype strings', () => {
    expect(isArchetypeId('classification')).toBe(true);
    expect(isArchetypeId('not_a_thing')).toBe(false);
  });

  it('leaves prefill empty everywhere — it 400s on all current models but Haiku', () => {
    for (const template of TEMPLATE_LIST) {
      expect(template.prefill).toBe('');
    }
  });

  it('renders every archetype into a usable prompt with no leftover tokens', () => {
    for (const template of TEMPLATE_LIST) {
      const draft = buildDraft({
        archetype: template.id,
        goal: 'do the thing',
        requirements: [],
      });
      const rendered = renderPrompt(draft.sections);
      const all = rendered.system + rendered.user;
      expect(all).not.toContain('[[');
      expect(rendered.system.length).toBeGreaterThan(0);
    }
  });
});

describe('applyDraft', () => {
  const draft = make({
    task_context: 'Generated context.',
    tone: 'Generated tone.',
    rules: ['Generated rule.'],
  });

  it('fill-empty leaves authored text untouched', () => {
    const current = make({ task_context: 'My own words.' });
    const out = applyDraft(current, draft, 'fill-empty');
    expect(out.task_context).toBe('My own words.');
    expect(out.tone).toBe('Generated tone.');
    expect(out.rules).toEqual(['Generated rule.']);
  });

  it('fill-empty is the default mode', () => {
    const current = make({ task_context: 'Mine.' });
    expect(applyDraft(current, draft)).toEqual(applyDraft(current, draft, 'fill-empty'));
  });

  it('replace overwrites everything', () => {
    const current = make({ task_context: 'Mine.' });
    const out = applyDraft(current, draft, 'replace');
    expect(out).toEqual(draft);
  });

  it('does not mutate the current sections or the draft', () => {
    const current = make({ task_context: 'Mine.' });
    const currentSnapshot = structuredClone(current);
    const draftSnapshot = structuredClone(draft);
    const out = applyDraft(current, draft);
    out.rules.push('mutation');
    expect(current).toEqual(currentSnapshot);
    expect(draft).toEqual(draftSnapshot);
  });
});

describe('apply previews', () => {
  it('reports which empty sections a draft would fill', () => {
    const current = make({ task_context: 'Mine.' });
    const draft = make({ task_context: 'Gen.', tone: 'Gen tone.', rules: ['R.'] });
    expect(sectionsDraftWouldFill(current, draft)).toEqual(['tone', 'rules']);
  });

  it('reports which authored sections a replace would destroy', () => {
    const current = make({ task_context: 'Mine.', tone: 'My tone.' });
    const draft = make({ task_context: 'Gen.', tone: 'My tone.' });
    // tone is identical in both, so replacing loses nothing there.
    expect(sectionsReplaceWouldOverwrite(current, draft)).toEqual(['task_context']);
  });
});
