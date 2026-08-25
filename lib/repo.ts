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
import { prompts, versions, type Prompt, type Version } from './db/schema';
import { emptySections, type Channel, type PromptSections, type SectionKey } from './sections';
import type { TechStack } from './render';

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
