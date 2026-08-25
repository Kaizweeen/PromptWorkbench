/** Saved tech-stack presets, e.g. "my default web stack". */

import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { stackPresets, type StackPreset } from '../db/schema';
import type { TechStack } from '../render';
import { newId } from './ids';

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
