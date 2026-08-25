import 'server-only';

/**
 * Executing a single prompt against the API, without streaming.
 *
 * The test runner needs the whole response before it can assert on it, so it
 * uses this rather than the streaming path the editor uses.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { getClient } from './client';
import { buildRequest } from './request';
import { withRetry } from './retry';
import { JUDGE_SYSTEM_PROMPT, buildJudgeUserContent, parseJudgeVerdict } from '../prompts/judge';
import { MODELS, SUITE_MODEL, estimateCost, type Effort, type ModelId } from '../config';
import type { RenderedPrompt } from '../render';
import type { AssertionResult } from '../assertions';

/** Concatenate the text blocks of a message, ignoring thinking blocks. */
function textFromMessage(message: Anthropic.Message): string {
  let out = '';
  for (const block of message.content) {
    if (block.type === 'text') out += block.text;
  }
  return out;
}

export interface ExecuteResult {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  };
  costUsd: number;
  durationMs: number;
  warnings: string[];
}

export async function executePrompt(input: {
  rendered: RenderedPrompt;
  model: ModelId;
  effort?: Effort;
}): Promise<ExecuteResult> {
  const { request, warnings } = buildRequest(input);
  const client = getClient();
  const startedAt = Date.now();

  const message = await withRetry(async () => {
    const stream = client.messages.stream(request);
    return await stream.finalMessage();
  });

  const text = textFromMessage(message);

  const usage = {
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cache_read_input_tokens: message.usage.cache_read_input_tokens,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
  };

  return {
    text,
    usage,
    costUsd: estimateCost(usage, input.model),
    durationMs: Date.now() - startedAt,
    warnings,
  };
}

/**
 * An llm_judge assertion: a second call scoring the output against a rubric.
 * Judged on a cheap model by default — the judge runs once per case per run.
 */
export function makeJudge(model: ModelId = SUITE_MODEL) {
  return async function judge(
    rubric: string,
    output: string,
    threshold: number,
  ): Promise<AssertionResult> {
    const client = getClient();
    const spec = MODELS[model];

    const message = await withRetry(async () => {
      const stream = client.messages.stream({
        model,
        max_tokens: Math.min(1_000, spec.maxOutput),
        system: JUDGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildJudgeUserContent(rubric, output) }],
      });
      return await stream.finalMessage();
    });

    const verdict = parseJudgeVerdict(textFromMessage(message));
    if (!verdict) {
      // A judge that returned nonsense fails the assertion rather than
      // silently passing it.
      return { passed: false, detail: 'Judge did not return a usable verdict.' };
    }

    return {
      passed: verdict.score >= threshold,
      detail: `Scored ${verdict.score}/5 (needs ${threshold}). ${verdict.reason}`.trim(),
    };
  };
}
