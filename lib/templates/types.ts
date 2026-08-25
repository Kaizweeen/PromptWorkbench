/**
 * Archetype templates are data, not code: a declarative base for each kind of
 * prompt, filled deterministically by lib/generate.ts with no API call.
 *
 * Template placeholders use [[double square brackets]] so they cannot collide
 * with {{runtime variables}} — templates legitimately emit the latter, and a
 * shared syntax would make the fill step eat them.
 */

import type { ExamplePair } from '../sections';

export const ARCHETYPE_IDS = [
  'code_generation',
  'data_extraction',
  'classification',
  'agentic_tool_use',
  'writing_editing',
  'custom',
] as const;

export type ArchetypeId = (typeof ARCHETYPE_IDS)[number];

export interface ArchetypeTemplate {
  id: ArchetypeId;
  label: string;
  /** One line shown in the archetype picker. */
  blurb: string;
  /** Base section content. [[goal]] is substituted at fill time. */
  task_context: string;
  tone: string;
  rules: string[];
  examples: ExamplePair[];
  thinking: string;
  output_format: string;
  immediate_task: string;
  /**
   * Prefill is left empty by every built-in template: it returns a 400 on all
   * current models except Haiku 4.5. Output format carries shape control instead.
   */
  prefill: string;
}
