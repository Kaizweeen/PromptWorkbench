/** Archetype registry. One file per archetype, all data. */

import agenticToolUse from './agentic-tool-use';
import classification from './classification';
import codeGeneration from './code-generation';
import custom from './custom';
import dataExtraction from './data-extraction';
import writingEditing from './writing-editing';
import { ARCHETYPE_IDS, type ArchetypeId, type ArchetypeTemplate } from './types';

export const TEMPLATES: Record<ArchetypeId, ArchetypeTemplate> = {
  code_generation: codeGeneration,
  data_extraction: dataExtraction,
  classification,
  agentic_tool_use: agenticToolUse,
  writing_editing: writingEditing,
  custom,
};

/** Display order for the archetype picker. */
export const TEMPLATE_LIST: readonly ArchetypeTemplate[] = ARCHETYPE_IDS.map(
  (id) => TEMPLATES[id],
);

export function isArchetypeId(value: string): value is ArchetypeId {
  return (ARCHETYPE_IDS as readonly string[]).includes(value);
}

export function getTemplate(id: string): ArchetypeTemplate {
  if (!isArchetypeId(id)) throw new Error(`Unknown archetype: ${id}`);
  return TEMPLATES[id];
}

export { ARCHETYPE_IDS, type ArchetypeId, type ArchetypeTemplate };
