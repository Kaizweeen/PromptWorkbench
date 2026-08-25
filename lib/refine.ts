/**
 * Stage B: parsing and applying AI refinements.
 *
 * The model returns JSON. Everything here treats that JSON as untrusted:
 * a malformed field is dropped rather than allowed to corrupt the editor.
 */

import { SECTION_KEYS, type PromptSections, type SectionKey } from './sections';
import { variableNames } from './variables';

export interface RefineResult {
  sections: Partial<PromptSections>;
  notes: string[];
}

/** Sections the model may return. Prefill is deliberately not refinable. */
const REFINABLE: readonly SectionKey[] = SECTION_KEYS.filter((k) => k !== 'prefill');

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string');
  return out.length === value.length ? out : out;
}

/**
 * Read an array of two-field objects, dropping malformed entries. A field
 * present but of the wrong type becomes '' rather than failing the whole
 * refinement.
 */
function asPairs<A extends string, B extends string>(
  value: unknown,
  keyA: A,
  keyB: B,
): Array<Record<A | B, string>> | undefined {
  if (!Array.isArray(value)) return undefined;

  const out: Array<Record<A | B, string>> = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const a = asString(record[keyA]);
    const b = asString(record[keyB]);
    if (a === undefined && b === undefined) continue;
    out.push({ [keyA]: a ?? '', [keyB]: b ?? '' } as Record<A | B, string>);
  }

  return out;
}

/**
 * Pull the JSON object out of a response.
 *
 * Tolerates a fenced block or stray prose around it, because a model that
 * was told "no fences" will occasionally add them anyway.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  try {
    return JSON.parse(candidate);
  } catch {
    // Fall back to the outermost brace pair.
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) return undefined;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

export class RefineParseError extends Error {
  constructor() {
    super('Could not read the refinement — the model did not return usable JSON.');
    this.name = 'RefineParseError';
  }
}

/** A JSON object, excluding arrays and null — `typeof []` is also 'object'. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse a refine response into validated sections plus notes. */
export function parseRefineResponse(text: string): RefineResult {
  const parsed = extractJson(text);
  if (!isPlainObject(parsed)) throw new RefineParseError();

  const root = parsed;
  const raw = root.sections ?? {};
  if (!isPlainObject(raw)) throw new RefineParseError();

  const sections: Partial<PromptSections> = {};

  for (const key of REFINABLE) {
    const value = raw[key];
    if (value === undefined || value === null) continue;

    if (key === 'rules') {
      const rules = asStringArray(value);
      if (rules) sections.rules = rules;
    } else if (key === 'background') {
      const docs = asPairs(value, 'title', 'content');
      if (docs) sections.background = docs;
    } else if (key === 'examples') {
      const pairs = asPairs(value, 'input', 'output');
      if (pairs) sections.examples = pairs;
    } else {
      const str = asString(value);
      if (str !== undefined) (sections[key] as string) = str;
    }
  }

  return { sections, notes: asStringArray(root.notes) ?? [] };
}

/**
 * Apply only the sections the author accepted.
 *
 * Rejected and untouched sections keep their current value — this is the
 * guarantee that refinement never silently overwrites the author's text.
 */
export function applyAccepted(
  current: PromptSections,
  proposed: Partial<PromptSections>,
  accepted: readonly SectionKey[],
): PromptSections {
  const out = structuredClone(current);

  for (const key of accepted) {
    const value = proposed[key];
    if (value === undefined) continue;
    (out[key] as PromptSections[SectionKey]) = structuredClone(value);
  }

  return out;
}

/** Sections the model actually proposed changing. */
export function proposedKeys(
  current: PromptSections,
  proposed: Partial<PromptSections>,
): SectionKey[] {
  return REFINABLE.filter(
    (key) =>
      proposed[key] !== undefined &&
      JSON.stringify(proposed[key]) !== JSON.stringify(current[key]),
  );
}

/**
 * Variables the refinement would add or drop.
 *
 * The meta-prompt forbids touching them, but a model can still slip — and a
 * renamed variable silently breaks every saved test case.
 */
export function variableDrift(
  current: PromptSections,
  merged: PromptSections,
): { added: string[]; removed: string[] } {
  const before = new Set(variableNames(current));
  const after = new Set(variableNames(merged));

  return {
    added: [...after].filter((v) => !before.has(v)),
    removed: [...before].filter((v) => !after.has(v)),
  };
}
