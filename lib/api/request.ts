/**
 * Building a Messages API request from a rendered prompt.
 *
 * Pure and model-aware: several request features are gated by model, and
 * sending a gated field returns a 400 rather than being ignored. Those rules
 * live here so they are testable without touching the network.
 */

import { MODELS, type Effort, type ModelId } from '../config';
import type { RenderedPrompt } from '../render';

/** Streaming default. Clamped to the model's own output ceiling. */
const DEFAULT_MAX_TOKENS = 64_000;

export interface RunRequestInput {
  rendered: RenderedPrompt;
  model: ModelId;
  effort?: Effort;
  maxTokens?: number;
}

/** Shape passed to client.messages.stream(). */
export interface MessagesRequest {
  model: ModelId;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  thinking?: { type: 'adaptive'; display?: 'summarized' | 'omitted' };
  output_config?: { effort: Effort };
}

export interface BuiltRequest {
  request: MessagesRequest;
  /**
   * Things silently changed to keep the request legal, surfaced to the UI so
   * the user is never left wondering why the prompt they see is not the
   * prompt that ran.
   */
  warnings: string[];
}

export class EmptyPromptError extends Error {
  constructor() {
    super('This prompt renders to nothing — fill in the immediate task before running.');
    this.name = 'EmptyPromptError';
  }
}

export function buildRequest(input: RunRequestInput): BuiltRequest {
  const spec = MODELS[input.model];
  const warnings: string[] = [];

  const user = input.rendered.user.trim();
  const system = input.rendered.system.trim();

  // The API requires at least one message. A prompt whose content is all in
  // the system turn still needs something in the user turn to act on.
  if (user === '') {
    if (system === '') throw new EmptyPromptError();
    throw new EmptyPromptError();
  }

  const messages: MessagesRequest['messages'] = [{ role: 'user', content: user }];

  // Assistant-turn prefill returns a 400 on every current model except
  // Haiku 4.5. Drop it rather than letting the run fail, and say so.
  if (input.rendered.prefill) {
    if (spec.supportsPrefill) {
      messages.push({ role: 'assistant', content: input.rendered.prefill });
    } else {
      warnings.push(
        `Prefill was dropped: ${spec.label} rejects assistant-turn prefill with a 400. Use the Output format section instead.`,
      );
    }
  }

  const request: MessagesRequest = {
    model: input.model,
    max_tokens: Math.min(input.maxTokens ?? DEFAULT_MAX_TOKENS, spec.maxOutput),
    messages,
  };

  if (system !== '') request.system = system;

  if (spec.supportsEffort) {
    // Adaptive thinking with a summarized display, so a long think does not
    // look like a hung stream.
    request.thinking = { type: 'adaptive', display: 'summarized' };
    if (input.effort) request.output_config = { effort: input.effort };
  } else if (input.effort) {
    warnings.push(`${spec.label} does not support the effort setting; it was ignored.`);
  }

  return { request, warnings };
}
