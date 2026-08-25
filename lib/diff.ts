/**
 * Section-level diffing between two prompt versions.
 *
 * Diffs compare the *rendered* text of each section, not the raw editor
 * content, so what you see in the diff is what actually changed in the prompt
 * Claude receives.
 */

import { diffWordsWithSpace, type Change } from 'diff';
import { renderSection } from './render';
import { type PromptSections, type SectionKey, orderedSections } from './sections';

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface SectionDiff {
  key: SectionKey;
  label: string;
  status: DiffStatus;
  before: string;
  after: string;
  /** Word-level hunks. Empty unless status is 'changed'. */
  hunks: Change[];
}

function statusFor(before: string, after: string): DiffStatus {
  if (before === after) return 'unchanged';
  if (before === '') return 'added';
  if (after === '') return 'removed';
  return 'changed';
}

/**
 * Diff every section between two versions, in canonical order.
 * Always returns one entry per section so the viewer can show or hide
 * unchanged sections without re-deriving anything.
 */
export function diffSections(
  before: PromptSections,
  after: PromptSections,
): SectionDiff[] {
  return orderedSections().map((spec) => {
    const beforeText = renderSection(spec, before);
    const afterText = renderSection(spec, after);
    const status = statusFor(beforeText, afterText);

    return {
      key: spec.key,
      label: spec.label,
      status,
      before: beforeText,
      after: afterText,
      hunks: status === 'changed' ? diffWordsWithSpace(beforeText, afterText) : [],
    };
  });
}

/** Only the sections that actually differ. */
export function changedSections(diffs: SectionDiff[]): SectionDiff[] {
  return diffs.filter((d) => d.status !== 'unchanged');
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  /** True when the two versions render identically. */
  identical: boolean;
}

export function summarizeDiff(diffs: SectionDiff[]): DiffSummary {
  const summary: DiffSummary = {
    added: 0,
    removed: 0,
    changed: 0,
    unchanged: 0,
    identical: true,
  };

  for (const d of diffs) {
    summary[d.status] += 1;
    if (d.status !== 'unchanged') summary.identical = false;
  }

  return summary;
}
