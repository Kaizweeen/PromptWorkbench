/**
 * Rendering a prompt to final text.
 *
 * This is a pure function of the stored sections — same input, same bytes out.
 * What it produces is exactly what gets sent to the API: no post-processing
 * happens downstream, so the preview the user reads is the prompt Claude sees.
 *
 * Rules enforced here:
 *   - multi-line sections are wrapped in semantic XML tags
 *   - long documents render near the top, the immediate task at the bottom
 *   - empty sections are omitted entirely — no dangling headers, no empty tags
 *   - output splits into system / user / optional assistant prefill
 */

import {
  type Channel,
  type DocumentEntry,
  type ExamplePair,
  type PromptSections,
  type SectionKey,
  type SectionSpec,
  isSectionEmpty,
  orderedSections,
} from './sections';

/** Target-project stack metadata, injected as a <tech_stack> block. */
export interface TechStackEntry {
  category: string;
  items: string[];
}

export type TechStack = TechStackEntry[];

export interface RenderOptions {
  /** Stack of the *target* project the prompt is written for. */
  stack?: TechStack;
  /** Per-prompt overrides of the default system/user placement. */
  channelOverrides?: Partial<Record<SectionKey, Channel>>;
}

export interface RenderedPrompt {
  system: string;
  user: string;
  /** Present only when a non-empty prefill section exists. */
  prefill?: string;
}

const BLOCK_SEPARATOR = '\n\n';

function isMultiline(value: string): boolean {
  return value.trim().includes('\n');
}

/** Wrap content in a semantic XML tag, content on its own lines. */
function tagged(tag: string, content: string): string {
  return `<${tag}>\n${content.trim()}\n</${tag}>`;
}

function renderDocuments(entries: DocumentEntry[], tag: string): string {
  const kept = entries.filter(
    (d) => d.content.trim() !== '' || d.title.trim() !== '',
  );
  if (kept.length === 0) return '';

  const blocks = kept.map((doc, i) => {
    const parts = [`<document index="${i + 1}">`];
    if (doc.title.trim() !== '') parts.push(`<source>${doc.title.trim()}</source>`);
    parts.push('<document_content>');
    parts.push(doc.content.trim());
    parts.push('</document_content>');
    parts.push('</document>');
    return parts.join('\n');
  });

  return tagged(tag, blocks.join('\n'));
}

function renderRules(rules: string[], tag: string): string {
  const kept = rules.map((r) => r.trim()).filter((r) => r !== '');
  if (kept.length === 0) return '';
  const numbered = kept.map((rule, i) => `${i + 1}. ${rule}`).join('\n');
  return tagged(tag, numbered);
}

function renderExamples(examples: ExamplePair[], tag: string): string {
  const kept = examples.filter(
    (e) => e.input.trim() !== '' || e.output.trim() !== '',
  );
  if (kept.length === 0) return '';

  const blocks = kept.map((ex) => {
    const parts = ['<example>'];
    if (ex.input.trim() !== '') {
      parts.push('<input>', ex.input.trim(), '</input>');
    }
    if (ex.output.trim() !== '') {
      parts.push('<output>', ex.output.trim(), '</output>');
    }
    parts.push('</example>');
    return parts.join('\n');
  });

  return tagged(tag, blocks.join('\n'));
}

/** Free text: tagged when multi-line, bare when it is a single line. */
function renderText(value: string, tag?: string): string {
  const trimmed = value.trim();
  if (trimmed === '') return '';
  if (tag && isMultiline(trimmed)) return tagged(tag, trimmed);
  return trimmed;
}

export function renderTechStack(stack: TechStack): string {
  const kept = stack
    .map((entry) => ({
      category: entry.category.trim(),
      items: entry.items.map((i) => i.trim()).filter((i) => i !== ''),
    }))
    .filter((entry) => entry.category !== '' && entry.items.length > 0);

  if (kept.length === 0) return '';

  const lines = kept.map((entry) => `${entry.category}: ${entry.items.join(', ')}`);
  return tagged('tech_stack', lines.join('\n'));
}

/** Render one section to text, or '' when it holds nothing. */
function renderSection(spec: SectionSpec, sections: PromptSections): string {
  if (isSectionEmpty(sections, spec.key)) return '';

  switch (spec.kind) {
    case 'documents':
      return renderDocuments(sections.background, spec.tag ?? 'documents');
    case 'rules':
      return renderRules(sections.rules, spec.tag ?? 'instructions');
    case 'examples':
      return renderExamples(sections.examples, spec.tag ?? 'examples');
    case 'text':
      return renderText(sections[spec.key] as string, spec.tag);
  }
}

/**
 * Render sections into the system / user / prefill turns.
 *
 * Default placement: everything stable and reusable goes in the system turn
 * (which keeps the cacheable prefix intact), everything that varies per
 * invocation — conversation history and the immediate task — goes in the user
 * turn. Overridable per-prompt via `channelOverrides`.
 */
export function renderPrompt(
  sections: PromptSections,
  options: RenderOptions = {},
): RenderedPrompt {
  const { stack, channelOverrides = {} } = options;

  const systemBlocks: string[] = [];
  const userBlocks: string[] = [];
  let prefill = '';

  for (const spec of orderedSections()) {
    const channel = channelOverrides[spec.key] ?? spec.channel;

    if (channel === 'prefill') {
      // Trailing whitespace in a prefill is rejected by the API.
      prefill = (sections[spec.key] as string).trimEnd();
      continue;
    }

    const rendered = renderSection(spec, sections);
    if (rendered === '') continue;

    (channel === 'system' ? systemBlocks : userBlocks).push(rendered);

    // Stack metadata describes the target project, so it belongs with the
    // task context that frames it.
    if (spec.key === 'task_context' && stack) {
      const stackBlock = renderTechStack(stack);
      if (stackBlock !== '') {
        (channel === 'system' ? systemBlocks : userBlocks).push(stackBlock);
      }
    }
  }

  // A stack with no task context still needs somewhere to land.
  if (stack && !systemBlocks.some((b) => b.startsWith('<tech_stack>'))) {
    const stackBlock = renderTechStack(stack);
    const alreadyInUser = userBlocks.some((b) => b.startsWith('<tech_stack>'));
    if (stackBlock !== '' && !alreadyInUser) systemBlocks.unshift(stackBlock);
  }

  const result: RenderedPrompt = {
    system: systemBlocks.join(BLOCK_SEPARATOR),
    user: userBlocks.join(BLOCK_SEPARATOR),
  };
  if (prefill.trim() !== '') result.prefill = prefill;
  return result;
}

/**
 * Flatten a rendered prompt into one copyable block. Display only — the API
 * always receives the structured turns from `renderPrompt`.
 */
export function renderFullText(rendered: RenderedPrompt): string {
  const parts: string[] = [];
  if (rendered.system !== '') parts.push(`===== SYSTEM =====\n${rendered.system}`);
  if (rendered.user !== '') parts.push(`===== USER =====\n${rendered.user}`);
  if (rendered.prefill) {
    parts.push(`===== ASSISTANT (prefill) =====\n${rendered.prefill}`);
  }
  return parts.join('\n\n');
}
