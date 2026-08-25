/**
 * Prompt persistence.
 *
 * The invariant this file exists to protect: versions are immutable. Every
 * save inserts a new numbered version. Restore and fork both create new
 * versions rather than rewriting old ones, so history is never lost.
 */

import 'server-only';
import { and, count, desc, eq, max } from 'drizzle-orm';
import { db } from './db';
import {
  prompts,
  results,
  runs,
  testCases,
  stackPresets,
  versions,
  type AssertionSpec,
  type Prompt,
  type Result,
  type Run,
  type TestCase,
  type StackPreset,
  type Version,
} from './db/schema';
import { emptySections, type Channel, type PromptSections, type SectionKey } from './sections';
import type { TechStack, RenderedPrompt } from './render';
import type { ModelId, Effort, TokenUsage } from './config';

export interface VersionContent {
  sections: PromptSections;
  stack?: TechStack | null;
  channelOverrides?: Partial<Record<SectionKey, Channel>> | null;
}

export interface PromptListItem {
  id: string;
  name: string;
  archetype: string;
  tags: string[];
  updatedAt: number;
  versionCount: number;
  latestVersionNumber: number;
}

function newId(): string {
  return crypto.randomUUID();
}

/** Library view: name, archetype, tags, last modified, version count. */
export function listPrompts(): PromptListItem[] {
  const rows = db
    .select({
      id: prompts.id,
      name: prompts.name,
      archetype: prompts.archetype,
      tags: prompts.tags,
      updatedAt: prompts.updatedAt,
      versionCount: count(versions.id),
      latestVersionNumber: max(versions.number),
    })
    .from(prompts)
    .leftJoin(versions, eq(versions.promptId, prompts.id))
    .groupBy(prompts.id)
    .orderBy(desc(prompts.updatedAt))
    .all();

  return rows.map((r) => ({
    ...r,
    tags: r.tags ?? [],
    versionCount: Number(r.versionCount ?? 0),
    latestVersionNumber: Number(r.latestVersionNumber ?? 0),
  }));
}

export function getPrompt(id: string): Prompt | undefined {
  return db.select().from(prompts).where(eq(prompts.id, id)).get();
}

/** All versions of a prompt, newest first. */
export function listVersions(promptId: string): Version[] {
  return db
    .select()
    .from(versions)
    .where(eq(versions.promptId, promptId))
    .orderBy(desc(versions.number))
    .all();
}

export function getVersion(versionId: string): Version | undefined {
  return db.select().from(versions).where(eq(versions.id, versionId)).get();
}

export function getLatestVersion(promptId: string): Version | undefined {
  return db
    .select()
    .from(versions)
    .where(eq(versions.promptId, promptId))
    .orderBy(desc(versions.number))
    .limit(1)
    .get();
}

export function getVersionByNumber(promptId: string, number: number): Version | undefined {
  return db
    .select()
    .from(versions)
    .where(and(eq(versions.promptId, promptId), eq(versions.number, number)))
    .get();
}

/**
 * Create a prompt and its first version in one transaction — a prompt with no
 * versions has nothing to edit and would be a broken row in the library.
 */
export function createPrompt(input: {
  name: string;
  archetype?: string;
  tags?: string[];
  content?: VersionContent;
}): { promptId: string; versionId: string } {
  const promptId = newId();
  const versionId = newId();
  const content = input.content ?? { sections: emptySections() };

  db.transaction((tx) => {
    tx.insert(prompts)
      .values({
        id: promptId,
        name: input.name,
        archetype: input.archetype ?? 'custom',
        tags: input.tags ?? [],
        lineageId: promptId,
      })
      .run();

    tx.insert(versions)
      .values({
        id: versionId,
        promptId,
        number: 1,
        message: 'Initial version',
        sections: content.sections,
        stack: content.stack ?? null,
        channelOverrides: content.channelOverrides ?? null,
      })
      .run();
  });

  return { promptId, versionId };
}

/** Append a new immutable version. Returns the created version. */
export function saveVersion(
  promptId: string,
  content: VersionContent,
  message?: string,
): Version {
  return db.transaction((tx) => {
    const current = tx
      .select({ n: max(versions.number) })
      .from(versions)
      .where(eq(versions.promptId, promptId))
      .get();

    const nextNumber = Number(current?.n ?? 0) + 1;
    const versionId = newId();

    tx.insert(versions)
      .values({
        id: versionId,
        promptId,
        number: nextNumber,
        message: message?.trim() || null,
        sections: content.sections,
        stack: content.stack ?? null,
        channelOverrides: content.channelOverrides ?? null,
      })
      .run();

    tx.update(prompts)
      .set({ updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(prompts.id, promptId))
      .run();

    return tx.select().from(versions).where(eq(versions.id, versionId)).get()!;
  });
}

/** Update prompt metadata. Does not touch version history. */
export function updatePromptMeta(
  promptId: string,
  meta: { name?: string; archetype?: string; tags?: string[] },
): void {
  db.update(prompts)
    .set({ ...meta, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(prompts.id, promptId))
    .run();
}

/**
 * Restore a previous version by appending its content as a new version.
 * Never destructive — the intervening versions stay in history.
 */
export function restoreVersion(versionId: string): Version {
  const source = getVersion(versionId);
  if (!source) throw new Error('Version not found');

  return saveVersion(
    source.promptId,
    {
      sections: source.sections,
      stack: source.stack,
      channelOverrides: source.channelOverrides,
    },
    `Restored from v${source.number}`,
  );
}

/**
 * Fork a version into a new prompt, keeping the shared lineage so related
 * prompts can be found later.
 */
export function forkPrompt(versionId: string, name?: string): { promptId: string } {
  const source = getVersion(versionId);
  if (!source) throw new Error('Version not found');

  const parent = getPrompt(source.promptId);
  if (!parent) throw new Error('Prompt not found');

  const promptId = newId();

  db.transaction((tx) => {
    tx.insert(prompts)
      .values({
        id: promptId,
        name: name?.trim() || `${parent.name} (fork)`,
        archetype: parent.archetype,
        tags: parent.tags,
        lineageId: parent.lineageId,
        forkedFromVersionId: versionId,
      })
      .run();

    tx.insert(versions)
      .values({
        id: newId(),
        promptId,
        number: 1,
        message: `Forked from ${parent.name} v${source.number}`,
        sections: source.sections,
        stack: source.stack,
        channelOverrides: source.channelOverrides,
      })
      .run();
  });

  return { promptId };
}

export function deletePrompt(promptId: string): void {
  db.delete(prompts).where(eq(prompts.id, promptId)).run();
}

/* ---------------------------------------------------------------- presets */

/** Saved stack presets, e.g. "my default web stack". */
export function listStackPresets(): StackPreset[] {
  return db.select().from(stackPresets).orderBy(stackPresets.name).all();
}

/**
 * Save a preset. Re-saving under an existing name replaces that preset's
 * stack rather than erroring on the unique constraint.
 */
export function saveStackPreset(name: string, stack: TechStack): StackPreset {
  const trimmed = name.trim();
  if (trimmed === '') throw new Error('Preset name is required');

  const existing = db
    .select()
    .from(stackPresets)
    .where(eq(stackPresets.name, trimmed))
    .get();

  if (existing) {
    db.update(stackPresets)
      .set({ stack })
      .where(eq(stackPresets.id, existing.id))
      .run();
    return { ...existing, stack };
  }

  const id = newId();
  db.insert(stackPresets).values({ id, name: trimmed, stack }).run();
  return db.select().from(stackPresets).where(eq(stackPresets.id, id)).get()!;
}

export function deleteStackPreset(id: string): void {
  db.delete(stackPresets).where(eq(stackPresets.id, id)).run();
}

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
