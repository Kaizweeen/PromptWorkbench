import 'server-only';

/**
 * The Anthropic client. Server-only by construction — this module imports
 * `server-only`, so importing it from a client component is a build error
 * rather than a key leaked into the browser bundle.
 */

import Anthropic from '@anthropic-ai/sdk';
import { MissingApiKeyError } from './errors';

let cached: Anthropic | undefined;

export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim() === '') throw new MissingApiKeyError();

  if (!cached) {
    cached = new Anthropic({
      apiKey,
      // Retries are ours: lib/api/retry.ts owns the backoff schedule so it is
      // observable in the UI and assertable in tests.
      maxRetries: 0,
    });
  }

  return cached;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}
