/**
 * The wire format between the run route and the browser.
 *
 * Newline-delimited JSON rather than EventSource, because a run is a POST
 * (the prompt body is far too large for a query string).
 */

import type { ErrorKind } from './errors';
import type { TokenUsage } from '../config';
import type { PromptSections } from '../sections';

export type RunEvent =
  | { type: 'warning'; messages: string[] }
  | { type: 'delta'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'retry'; attempt: number; delayMs: number; message: string }
  | {
      type: 'done';
      runId: string;
      usage: TokenUsage;
      costUsd: number;
      durationMs: number;
      stopReason: string | null;
    }
  | {
      type: 'refined';
      sections: Partial<PromptSections>;
      notes: string[];
    }
  | { type: 'error'; kind: ErrorKind; message: string; retryable: boolean };

export function encodeEvent(event: RunEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Split a growing buffer into complete events, returning the unparsed
 * remainder — a chunk boundary can land mid-line.
 */
export function decodeEvents(buffer: string): { events: RunEvent[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events: RunEvent[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      events.push(JSON.parse(trimmed) as RunEvent);
    } catch {
      // A malformed line is dropped rather than killing the stream.
    }
  }

  return { events, rest };
}
