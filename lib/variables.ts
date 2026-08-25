/**
 * {{variable}} placeholders.
 *
 * Variables are never stored — they are derived from section text every time,
 * so renaming a placeholder in the editor cannot leave a stale entry behind.
 * Every run requires a value for each detected variable.
 */

import {
  SECTION_BY_KEY,
  type PromptSections,
  type SectionKey,
  orderedSections,
} from './sections';

/**
 * Matches {{ name }} with optional inner whitespace. Names are identifier-like:
 * a letter or underscore, then letters, digits, underscores.
 */
const VARIABLE_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export interface VariableOccurrence {
  section: SectionKey;
  count: number;
}

export interface DetectedVariable {
  name: string;
  /** Where it appears, in canonical section order. */
  occurrences: VariableOccurrence[];
  /** Total appearances across the whole prompt. */
  total: number;
}

/** Every piece of author-written text in a section, flattened. */
function sectionText(sections: PromptSections, key: SectionKey): string[] {
  const value = sections[key];
  if (typeof value === 'string') return [value];
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (typeof entry === 'string') return [entry];
    // Documents contribute title + content; examples contribute input + output.
    return Object.values(entry).map((v) => String(v));
  });
}

/**
 * Detect every placeholder in the prompt, ordered by first appearance in
 * canonical section order.
 */
export function detectVariables(sections: PromptSections): DetectedVariable[] {
  const found = new Map<string, DetectedVariable>();

  for (const spec of orderedSections()) {
    for (const text of sectionText(sections, spec.key)) {
      for (const match of text.matchAll(VARIABLE_RE)) {
        const name = match[1];
        let entry = found.get(name);
        if (!entry) {
          entry = { name, occurrences: [], total: 0 };
          found.set(name, entry);
        }
        entry.total += 1;

        const existing = entry.occurrences.find((o) => o.section === spec.key);
        if (existing) existing.count += 1;
        else entry.occurrences.push({ section: spec.key, count: 1 });
      }
    }
  }

  return [...found.values()];
}

/** Just the names, in first-appearance order. */
export function variableNames(sections: PromptSections): string[] {
  return detectVariables(sections).map((v) => v.name);
}

/**
 * Variables with no value supplied. A run is blocked until this is empty —
 * sending a prompt with a literal {{placeholder}} in it wastes a call and
 * quietly corrupts the result.
 */
export function missingVariables(
  sections: PromptSections,
  values: Record<string, string>,
): string[] {
  return variableNames(sections).filter((name) => {
    const value = values[name];
    return value === undefined || value.trim() === '';
  });
}

/** Values supplied for placeholders that no longer exist in the prompt. */
export function orphanedValues(
  sections: PromptSections,
  values: Record<string, string>,
): string[] {
  const names = new Set(variableNames(sections));
  return Object.keys(values).filter((key) => !names.has(key));
}

/** Substitute values into a single string. Unknown placeholders are left as-is. */
export function applyVariables(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(VARIABLE_RE, (whole, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole,
  );
}

/** Substitute values across every section, preserving structure. */
export function applyVariablesToSections(
  sections: PromptSections,
  values: Record<string, string>,
): PromptSections {
  const out = structuredClone(sections);

  for (const key of Object.keys(out) as SectionKey[]) {
    const value = out[key];
    if (typeof value === 'string') {
      (out[key] as string) = applyVariables(value, values);
      continue;
    }
    if (!Array.isArray(value)) continue;

    (out[key] as unknown[]) = value.map((entry) => {
      if (typeof entry === 'string') return applyVariables(entry, values);
      return Object.fromEntries(
        Object.entries(entry).map(([k, v]) => [k, applyVariables(String(v), values)]),
      );
    });
  }

  return out;
}

/** Human label for a section, for use in variable-location chips. */
export function sectionLabel(key: SectionKey): string {
  return SECTION_BY_KEY[key].label;
}
