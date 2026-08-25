/**
 * The Anthropic canonical prompt structure.
 *
 * A prompt is stored as ten structured sections, never as a blob of text.
 * Rendering to final text is a pure function of these sections (see lib/render.ts).
 *
 * The `hint` on each section is user-facing teaching copy: the editor shows it
 * inline so the app explains *why* a section exists, not just what to type in it.
 */

export const SECTION_KEYS = [
  'task_context',
  'tone',
  'background',
  'rules',
  'examples',
  'history',
  'immediate_task',
  'thinking',
  'output_format',
  'prefill',
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/** Which turn a section is rendered into. */
export type Channel = 'system' | 'user' | 'prefill';

/** A single background document. Long content sits near the top of the prompt. */
export interface DocumentEntry {
  title: string;
  content: string;
}

/** A few-shot pair. Each renders inside its own <example> tag. */
export interface ExamplePair {
  input: string;
  output: string;
}

/**
 * The stored shape of a prompt. Structured, not stringly-typed: rules are a
 * list because they render as a numbered do/don't list, documents and examples
 * are collections because they render as repeated tagged blocks.
 */
export interface PromptSections {
  task_context: string;
  tone: string;
  background: DocumentEntry[];
  rules: string[];
  examples: ExamplePair[];
  history: string;
  immediate_task: string;
  thinking: string;
  output_format: string;
  prefill: string;
}

export interface SectionSpec {
  key: SectionKey;
  /** Canonical position. Render order is fixed by this, never by insertion order. */
  order: number;
  label: string;
  /** Why this section exists — shown inline in the editor. */
  hint: string;
  placeholder: string;
  /** Semantic XML wrapper. Applied when the section is multi-line. */
  tag?: string;
  /** Default turn. Overridable per-prompt. */
  channel: Channel;
  kind: 'text' | 'documents' | 'rules' | 'examples';
  optional?: boolean;
}

export const SECTIONS: readonly SectionSpec[] = [
  {
    key: 'task_context',
    order: 1,
    label: 'Task context',
    hint: 'Who Claude is and what it is doing. This is system-prompt material — set the role and the job before anything else, so every later instruction is read in that frame.',
    placeholder: 'You are a senior security engineer reviewing pull requests for a payments API.',
    channel: 'system',
    kind: 'text',
  },
  {
    key: 'tone',
    order: 2,
    label: 'Tone / style guidance',
    hint: 'How the output should sound. Kept separate from the task so you can change voice without touching behaviour.',
    placeholder: 'Terse and technical. No preamble, no summary of what you are about to do.',
    tag: 'tone_and_style',
    channel: 'system',
    kind: 'text',
  },
  {
    key: 'background',
    order: 3,
    label: 'Background data & documents',
    hint: 'Long reference content — specs, schemas, transcripts, source files. Placed near the top because Claude attends better to long documents that precede the instructions about them.',
    placeholder: 'Paste the schema, spec, or source document Claude needs to reason over.',
    tag: 'documents',
    channel: 'system',
    kind: 'documents',
  },
  {
    key: 'rules',
    order: 4,
    label: 'Detailed task rules',
    hint: 'The numbered do/don\'t list. Specific, checkable rules beat one long paragraph — each line becomes something you can point at when the output is wrong.',
    placeholder: 'Flag any user input that reaches a query without parameterisation.',
    tag: 'instructions',
    channel: 'system',
    kind: 'rules',
  },
  {
    key: 'examples',
    order: 5,
    label: 'Examples',
    hint: 'Few-shot input/output pairs, each wrapped in its own <example> tag. The single highest-leverage section: one good example usually outperforms three paragraphs describing the same thing.',
    placeholder: 'Show a representative input and exactly the output you want back.',
    tag: 'examples',
    channel: 'system',
    kind: 'examples',
  },
  {
    key: 'history',
    order: 6,
    label: 'Conversation history',
    hint: 'Optional placeholder for prior turns in a multi-turn app. Goes in the user turn because it varies per invocation.',
    placeholder: '{{conversation_history}}',
    tag: 'conversation_history',
    channel: 'user',
    kind: 'text',
    optional: true,
  },
  {
    key: 'immediate_task',
    order: 7,
    label: 'Immediate task',
    hint: 'The actual request, restated at the very bottom. After a long prompt this is what Claude acts on — repeating it here materially improves instruction-following.',
    placeholder: 'Review the diff above and report every security issue you find.',
    channel: 'user',
    kind: 'text',
  },
  {
    key: 'thinking',
    order: 8,
    label: 'Thinking instructions',
    hint: 'Step-by-step reasoning guidance. Tell Claude how to work the problem before answering — and where to put that reasoning so it does not contaminate the output.',
    placeholder: 'Before answering, work through each changed file in turn and note what it touches.',
    tag: 'thinking_instructions',
    channel: 'system',
    kind: 'text',
  },
  {
    key: 'output_format',
    order: 9,
    label: 'Output format',
    hint: 'Schema, tags, and length constraints. Be explicit about the exact shape — an unconstrained format is the most common cause of output you have to post-process.',
    placeholder: 'Return a JSON array of findings. Each has: file, line, severity, description.',
    tag: 'output_format',
    channel: 'system',
    kind: 'text',
  },
  {
    key: 'prefill',
    order: 10,
    label: 'Prefill',
    hint: 'Optional assistant-turn prefill. Note: current models (Opus 5, Sonnet 5, Fable 5, and the 4.6–4.8 family) reject prefill with a 400 — only Haiku 4.5 still accepts it. Use Output format instead for shape control.',
    placeholder: '{"findings": [',
    channel: 'prefill',
    kind: 'text',
    optional: true,
  },
] as const;

export const SECTION_BY_KEY: Record<SectionKey, SectionSpec> = Object.fromEntries(
  SECTIONS.map((s) => [s.key, s]),
) as Record<SectionKey, SectionSpec>;

/** Sections in canonical render order. */
export function orderedSections(): readonly SectionSpec[] {
  return [...SECTIONS].sort((a, b) => a.order - b.order);
}

export function emptySections(): PromptSections {
  return {
    task_context: '',
    tone: '',
    background: [],
    rules: [],
    examples: [],
    history: '',
    immediate_task: '',
    thinking: '',
    output_format: '',
    prefill: '',
  };
}

/** True when a section holds nothing worth rendering (empty or whitespace-only). */
export function isSectionEmpty(sections: PromptSections, key: SectionKey): boolean {
  const value = sections[key];
  if (typeof value === 'string') return value.trim() === '';
  if (!Array.isArray(value) || value.length === 0) return true;
  return value.every((entry) =>
    typeof entry === 'string'
      ? entry.trim() === ''
      : Object.values(entry).every((v) => String(v).trim() === ''),
  );
}
