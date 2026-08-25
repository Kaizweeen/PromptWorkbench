/** A/B comparisons and the version pickers that feed them. */

import 'server-only';
import { and, count, desc, eq, max } from 'drizzle-orm';
import { db } from '../db';
import {
  comparisons,
  prompts,
  results,
  runs,
  stackPresets,
  testCases,
  versions,
  type AssertionSpec,
  type Comparison,
  type Prompt,
  type Result,
  type Run,
  type StackPreset,
  type TestCase,
  type Version,
} from '../db/schema';
import { emptySections, type Channel, type PromptSections, type SectionKey } from '../sections';
import type { TechStack, RenderedPrompt } from '../render';
import type { ModelId, Effort, TokenUsage } from '../config';
import { newId } from './ids';

/* ----------------------------------------------------------- comparisons */

export interface VersionChoice {
  versionId: string;
  promptId: string;
  promptName: string;
  number: number;
  createdAt: number;
}

/** Every version in the library, for the A/B pickers. */
export function listVersionChoices(): VersionChoice[] {
  return db
    .select({
      versionId: versions.id,
      promptId: prompts.id,
      promptName: prompts.name,
      number: versions.number,
      createdAt: versions.createdAt,
    })
    .from(versions)
    .innerJoin(prompts, eq(prompts.id, versions.promptId))
    .orderBy(prompts.name, desc(versions.number))
    .all();
}

export function createComparison(input: {
  leftVersionId: string;
  rightVersionId: string;
  inputs?: Record<string, string> | null;
  leftRunId?: string | null;
  rightRunId?: string | null;
}): string {
  const id = newId();
  db.insert(comparisons)
    .values({
      id,
      leftVersionId: input.leftVersionId,
      rightVersionId: input.rightVersionId,
      inputs: input.inputs ?? null,
      leftRunId: input.leftRunId ?? null,
      rightRunId: input.rightRunId ?? null,
    })
    .run();
  return id;
}

/** Record which side you preferred. Null clears an earlier choice. */
export function setComparisonWinner(
  id: string,
  winner: 'left' | 'right' | null,
  note?: string | null,
): void {
  db.update(comparisons)
    .set({ winner, ...(note !== undefined ? { note } : {}) })
    .where(eq(comparisons.id, id))
    .run();
}

export function getComparison(id: string): Comparison | undefined {
  return db.select().from(comparisons).where(eq(comparisons.id, id)).get();
}

export interface ComparisonSummary {
  id: string;
  createdAt: number;
  winner: 'left' | 'right' | null;
  leftLabel: string;
  rightLabel: string;
}

/** Past comparisons, so a recorded preference can be looked back at. */
export function listComparisons(limit = 30): ComparisonSummary[] {
  const rows = db.select().from(comparisons).orderBy(desc(comparisons.createdAt)).limit(limit).all();
  const choices = new Map(listVersionChoices().map((c) => [c.versionId, c]));

  const label = (versionId: string) => {
    const c = choices.get(versionId);
    return c ? `${c.promptName} v${c.number}` : 'deleted version';
  };

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    winner: row.winner,
    leftLabel: label(row.leftVersionId),
    rightLabel: label(row.rightVersionId),
  }));
}
