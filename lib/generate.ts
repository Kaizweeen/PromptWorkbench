/**
 * Stage A: deterministic template fill. No API call, no network, no model.
 *
 * Given an archetype, a one-line goal, a list of requirements, and the target
 * stack, this produces a populated draft locally. Same input, same output —
 * it is a pure function so the result is reviewable and diffable before any
 * AI refinement (Stage B) touches it.
 */

import { getTemplate, type ArchetypeId } from './templates';
import { emptySections, isSectionEmpty, type PromptSections, type SectionKey } from './sections';
import type { TechStack } from './render';
import { SECTION_KEYS } from './sections';

/** Template placeholders use [[…]] so they never collide with {{runtime vars}}. */
const TOKEN_RE = /\[\[\s*([a-z_]+)\s*\]\]/gi;

export interface DraftInput {
  archetype: ArchetypeId | string;
  /** One line: what this prompt should get Claude to do. */
  goal: string;
  /** Requirements, appended to the archetype's own rules. */
  requirements: string[];
  stack?: TechStack;
}

export interface Draft {
  sections: PromptSections;
  stack: TechStack;
}

/** Reads naturally when the author has not written a goal yet. */
const GOAL_FALLBACK = 'carry out the task described below';

function fillTokens(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN_RE, (whole, name: string) => {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole;
  });
}

function cleanList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }

  return out;
}

/**
 * Build a populated draft from the archetype template.
 *
 * The template is treated as immutable — everything it contributes is cloned,
 * since templates are module singletons shared across every generation.
 */
export function buildDraft(input: DraftInput): Draft {
  const template = getTemplate(input.archetype);
  const goal = input.goal.trim();
  const tokens = { goal: goal === '' ? GOAL_FALLBACK : goal };

  const sections: PromptSections = {
    ...emptySections(),
    task_context: fillTokens(template.task_context, tokens),
    tone: fillTokens(template.tone, tokens),
    // The archetype's own rules come first; the author's requirements follow,
    // so a generated draft reads as "the general rules, then my specifics".
    rules: cleanList([...template.rules, ...input.requirements]),
    examples: template.examples.map((e) => ({ ...e })),
    thinking: fillTokens(template.thinking, tokens),
    output_format: fillTokens(template.output_format, tokens),
    immediate_task: fillTokens(template.immediate_task, tokens),
    prefill: template.prefill,
  };

  return { sections, stack: input.stack ? structuredClone(input.stack) : [] };
}

export type ApplyMode = 'replace' | 'fill-empty';

/**
 * Merge a draft into the working copy.
 *
 * 'fill-empty' is the safe default: it writes only sections you have not
 * written yourself, so generating over an in-progress prompt cannot destroy
 * your text. 'replace' is explicit and total.
 */
export function applyDraft(
  current: PromptSections,
  draft: PromptSections,
  mode: ApplyMode = 'fill-empty',
): PromptSections {
  if (mode === 'replace') return structuredClone(draft);

  const out = structuredClone(current);
  for (const key of SECTION_KEYS as readonly SectionKey[]) {
    if (isSectionEmpty(current, key)) {
      (out[key] as PromptSections[SectionKey]) = structuredClone(draft[key]);
    }
  }

  return out;
}

/** Sections a 'fill-empty' apply would overwrite — none, by definition. */
export function sectionsDraftWouldFill(
  current: PromptSections,
  draft: PromptSections,
): SectionKey[] {
  return (SECTION_KEYS as readonly SectionKey[]).filter(
    (key) => isSectionEmpty(current, key) && !isSectionEmpty(draft, key),
  );
}

/** Sections that hold your text and would be lost by a 'replace' apply. */
export function sectionsReplaceWouldOverwrite(
  current: PromptSections,
  draft: PromptSections,
): SectionKey[] {
  return (SECTION_KEYS as readonly SectionKey[]).filter(
    (key) =>
      !isSectionEmpty(current, key) &&
      JSON.stringify(current[key]) !== JSON.stringify(draft[key]),
  );
}
