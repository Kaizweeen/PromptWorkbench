/** Runs, test cases, and results — everything the test runner persists. */

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

/* ------------------------------------------------------------------- runs */

export interface RunRecord {
  versionId: string;
  testCaseId?: string | null;
  model: ModelId;
  effort?: Effort | null;
  /** The exact prompt that was sent, not the one currently on screen. */
  rendered: RenderedPrompt;
  response?: string | null;
  usage?: TokenUsage | null;
  durationMs?: number | null;
  costUsd?: number | null;
  error?: string | null;
}

/** Persist a run. Returns the new run id. */
export function recordRun(run: RunRecord): string {
  const id = newId();

  db.insert(runs)
    .values({
      id,
      versionId: run.versionId,
      testCaseId: run.testCaseId ?? null,
      model: run.model,
      effort: run.effort ?? null,
      rendered: run.rendered,
      response: run.response ?? null,
      usage: run.usage ?? null,
      durationMs: run.durationMs ?? null,
      costUsd: run.costUsd ?? null,
      error: run.error ?? null,
    })
    .run();

  return id;
}

/** Runs for a prompt, newest first. */
export function listRunsForVersion(versionId: string, limit = 50): Run[] {
  return db
    .select()
    .from(runs)
    .where(eq(runs.versionId, versionId))
    .orderBy(desc(runs.createdAt))
    .limit(limit)
    .all();
}

/* ------------------------------------------------------------- test cases */

export function listTestCases(promptId: string): TestCase[] {
  return db
    .select()
    .from(testCases)
    .where(eq(testCases.promptId, promptId))
    .orderBy(testCases.createdAt)
    .all();
}

export function createTestCase(input: {
  promptId: string;
  name: string;
  inputs?: Record<string, string>;
  expected?: string | null;
  assertion?: AssertionSpec | null;
}): string {
  const id = newId();
  db.insert(testCases)
    .values({
      id,
      promptId: input.promptId,
      name: input.name,
      inputs: input.inputs ?? {},
      expected: input.expected ?? null,
      assertion: input.assertion ?? null,
    })
    .run();
  return id;
}

export function updateTestCase(
  id: string,
  patch: {
    name?: string;
    inputs?: Record<string, string>;
    expected?: string | null;
    assertion?: AssertionSpec | null;
  },
): void {
  db.update(testCases).set(patch).where(eq(testCases.id, id)).run();
}

export function deleteTestCase(id: string): void {
  db.delete(testCases).where(eq(testCases.id, id)).run();
}

/* ---------------------------------------------------------------- results */

export function recordResult(input: {
  runId: string;
  testCaseId: string;
  versionId: string;
  passed: boolean;
  detail?: string | null;
}): string {
  const id = newId();
  db.insert(results)
    .values({
      id,
      runId: input.runId,
      testCaseId: input.testCaseId,
      versionId: input.versionId,
      passed: input.passed,
      detail: input.detail ?? null,
    })
    .run();
  return id;
}

export interface MatrixCell {
  testCaseId: string;
  versionId: string;
  passed: boolean;
  detail: string | null;
  createdAt: number;
}

/**
 * The pass/fail matrix: rows are test cases, columns are versions.
 *
 * Only the latest result per (case, version) is returned — re-running a case
 * against a version should replace what you see, not stack up behind it.
 */
export function resultMatrix(promptId: string): MatrixCell[] {
  const rows = db
    .select({
      testCaseId: results.testCaseId,
      versionId: results.versionId,
      passed: results.passed,
      detail: results.detail,
      createdAt: results.createdAt,
    })
    .from(results)
    .innerJoin(versions, eq(versions.id, results.versionId))
    .where(eq(versions.promptId, promptId))
    .orderBy(desc(results.createdAt))
    .all();

  const latest = new Map<string, MatrixCell>();
  for (const row of rows) {
    const key = `${row.testCaseId}::${row.versionId}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  return [...latest.values()];
}
