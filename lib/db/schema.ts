/**
 * SQLite schema.
 *
 * Versions are immutable: every save inserts a new row. Restore-to-version
 * inserts a new version carrying the old sections forward. Nothing in this
 * schema is ever updated destructively.
 */

import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';
import type { PromptSections, SectionKey, Channel } from '../sections';
import type { TechStack } from '../render';
import type { ModelId, Effort, TokenUsage } from '../config';

const now = sql`(unixepoch())`;

export const prompts = sqliteTable('prompts', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  archetype: text('archetype').notNull().default('custom'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
  /** Shared by every prompt forked from a common ancestor. */
  lineageId: text('lineage_id').notNull(),
  /** The version this prompt was forked from, when it is a fork. */
  forkedFromVersionId: text('forked_from_version_id'),
  createdAt: integer('created_at').notNull().default(now),
  updatedAt: integer('updated_at').notNull().default(now),
}, (t) => [index('prompts_lineage_idx').on(t.lineageId)]);

export const versions = sqliteTable('versions', {
  id: text('id').primaryKey(),
  promptId: text('prompt_id')
    .notNull()
    .references(() => prompts.id, { onDelete: 'cascade' }),
  /** 1-based, monotonic per prompt. */
  number: integer('number').notNull(),
  message: text('message'),
  sections: text('sections', { mode: 'json' }).$type<PromptSections>().notNull(),
  stack: text('stack', { mode: 'json' }).$type<TechStack>(),
  channelOverrides: text('channel_overrides', { mode: 'json' })
    .$type<Partial<Record<SectionKey, Channel>>>(),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [
  unique('versions_prompt_number_unq').on(t.promptId, t.number),
  index('versions_prompt_idx').on(t.promptId),
]);

export const testCases = sqliteTable('test_cases', {
  id: text('id').primaryKey(),
  promptId: text('prompt_id')
    .notNull()
    .references(() => prompts.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** Values for the prompt's {{variable}} placeholders. */
  inputs: text('inputs', { mode: 'json' }).$type<Record<string, string>>().notNull(),
  expected: text('expected'),
  assertion: text('assertion', { mode: 'json' }).$type<AssertionSpec>(),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [index('test_cases_prompt_idx').on(t.promptId)]);

/** Assertion shapes are defined here so the schema and the evaluator agree. */
export type AssertionSpec =
  | { type: 'contains'; value: string; caseSensitive?: boolean }
  | { type: 'not_contains'; value: string; caseSensitive?: boolean }
  | { type: 'regex'; pattern: string; flags?: string }
  | { type: 'valid_json' }
  | { type: 'json_schema'; schema: unknown }
  | { type: 'llm_judge'; rubric: string; threshold?: number; model?: ModelId };

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  versionId: text('version_id')
    .notNull()
    .references(() => versions.id, { onDelete: 'cascade' }),
  /** Null for ad-hoc runs that are not part of a test case. */
  testCaseId: text('test_case_id').references(() => testCases.id, {
    onDelete: 'set null',
  }),
  model: text('model').$type<ModelId>().notNull(),
  effort: text('effort').$type<Effort>(),
  /** The exact rendered prompt that was sent — system, user, prefill. */
  rendered: text('rendered', { mode: 'json' })
    .$type<{ system: string; user: string; prefill?: string }>()
    .notNull(),
  response: text('response'),
  usage: text('usage', { mode: 'json' }).$type<TokenUsage>(),
  durationMs: integer('duration_ms'),
  costUsd: real('cost_usd'),
  /** Readable message when the run failed. Never a stack trace. */
  error: text('error'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [
  index('runs_version_idx').on(t.versionId),
  index('runs_test_case_idx').on(t.testCaseId),
]);

export const results = sqliteTable('results', {
  id: text('id').primaryKey(),
  runId: text('run_id')
    .notNull()
    .references(() => runs.id, { onDelete: 'cascade' }),
  testCaseId: text('test_case_id')
    .notNull()
    .references(() => testCases.id, { onDelete: 'cascade' }),
  /** Denormalised so the pass/fail matrix is one query. */
  versionId: text('version_id')
    .notNull()
    .references(() => versions.id, { onDelete: 'cascade' }),
  passed: integer('passed', { mode: 'boolean' }).notNull(),
  detail: text('detail'),
  createdAt: integer('created_at').notNull().default(now),
}, (t) => [
  index('results_version_idx').on(t.versionId),
  index('results_test_case_idx').on(t.testCaseId),
]);

export const comparisons = sqliteTable('comparisons', {
  id: text('id').primaryKey(),
  leftVersionId: text('left_version_id')
    .notNull()
    .references(() => versions.id, { onDelete: 'cascade' }),
  rightVersionId: text('right_version_id')
    .notNull()
    .references(() => versions.id, { onDelete: 'cascade' }),
  inputs: text('inputs', { mode: 'json' }).$type<Record<string, string>>(),
  leftRunId: text('left_run_id').references(() => runs.id, { onDelete: 'set null' }),
  rightRunId: text('right_run_id').references(() => runs.id, { onDelete: 'set null' }),
  /** Which side was preferred: 'left' | 'right' | null while undecided. */
  winner: text('winner').$type<'left' | 'right'>(),
  note: text('note'),
  createdAt: integer('created_at').notNull().default(now),
});

export const stackPresets = sqliteTable('stack_presets', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  stack: text('stack', { mode: 'json' }).$type<TechStack>().notNull(),
  createdAt: integer('created_at').notNull().default(now),
});

export type Prompt = typeof prompts.$inferSelect;
export type Version = typeof versions.$inferSelect;
export type TestCase = typeof testCases.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Result = typeof results.$inferSelect;
export type Comparison = typeof comparisons.$inferSelect;
export type StackPreset = typeof stackPresets.$inferSelect;
