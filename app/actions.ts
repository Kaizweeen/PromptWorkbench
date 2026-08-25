'use server';

/**
 * Server Actions for prompt mutations.
 *
 * Single-user local app: there is no auth to check, but every action still
 * validates its inputs — Server Actions are reachable by direct POST, not only
 * through the UI.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createPrompt,
  createTestCase,
  deleteStackPreset,
  deleteTestCase,
  saveStackPreset,
  updateTestCase,
  forkPrompt,
  restoreVersion,
  saveVersion,
  updatePromptMeta,
  deletePrompt,
  type VersionContent,
} from '@/lib/repo';
import { emptySections } from '@/lib/sections';
import type { TechStack } from '@/lib/render';
import type { AssertionSpec } from '@/lib/db/schema';

function requireId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`);
  }
  return value;
}

export async function createPromptAction(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  if (name === '') throw new Error('Name is required');

  const archetype = String(formData.get('archetype') ?? 'custom');
  const { promptId } = createPrompt({
    name,
    archetype,
    content: { sections: emptySections() },
  });

  revalidatePath('/');
  redirect(`/prompts/${promptId}`);
}

export async function saveVersionAction(
  promptId: string,
  content: VersionContent,
  message?: string,
) {
  requireId(promptId, 'promptId');
  if (!content?.sections) throw new Error('Sections are required');

  const version = saveVersion(promptId, content, message);

  revalidatePath('/');
  revalidatePath(`/prompts/${promptId}`);
  return { id: version.id, number: version.number, createdAt: version.createdAt };
}

export async function updateMetaAction(
  promptId: string,
  meta: { name?: string; archetype?: string; tags?: string[] },
) {
  requireId(promptId, 'promptId');
  updatePromptMeta(promptId, meta);

  revalidatePath('/');
  revalidatePath(`/prompts/${promptId}`);
}

export async function restoreVersionAction(promptId: string, versionId: string) {
  requireId(promptId, 'promptId');
  requireId(versionId, 'versionId');

  const version = restoreVersion(versionId);

  revalidatePath('/');
  revalidatePath(`/prompts/${promptId}`);
  return { id: version.id, number: version.number };
}

export async function forkPromptAction(versionId: string, name?: string) {
  requireId(versionId, 'versionId');

  const { promptId } = forkPrompt(versionId, name);

  revalidatePath('/');
  redirect(`/prompts/${promptId}`);
}

export async function deletePromptAction(formData: FormData) {
  const promptId = requireId(formData.get('promptId'), 'promptId');
  deletePrompt(promptId);

  revalidatePath('/');
  redirect('/');
}

export async function saveStackPresetAction(name: string, stack: TechStack) {
  const preset = saveStackPreset(name, stack);
  revalidatePath('/');
  return { id: preset.id, name: preset.name };
}

export async function deleteStackPresetAction(id: string) {
  requireId(id, 'presetId');
  deleteStackPreset(id);
  revalidatePath('/');
}

export async function createTestCaseAction(
  promptId: string,
  input: { name: string; inputs?: Record<string, string>; expected?: string | null; assertion?: AssertionSpec | null },
) {
  requireId(promptId, 'promptId');
  if (!input.name?.trim()) throw new Error('Test case name is required');

  const id = createTestCase({ promptId, ...input, name: input.name.trim() });
  revalidatePath(`/prompts/${promptId}`);
  return { id };
}

export async function updateTestCaseAction(
  promptId: string,
  id: string,
  patch: { name?: string; inputs?: Record<string, string>; expected?: string | null; assertion?: AssertionSpec | null },
) {
  requireId(id, 'testCaseId');
  updateTestCase(id, patch);
  revalidatePath(`/prompts/${promptId}`);
}

export async function deleteTestCaseAction(promptId: string, id: string) {
  requireId(id, 'testCaseId');
  deleteTestCase(id);
  revalidatePath(`/prompts/${promptId}`);
}
