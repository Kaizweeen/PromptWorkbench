import { NextRequest } from 'next/server';
import { getClient } from '@/lib/api/client';
import { encodeEvent, type RunEvent } from '@/lib/api/events';
import { toReadableError } from '@/lib/api/errors';
import { buildRequest } from '@/lib/api/request';
import { withRetry } from '@/lib/api/retry';
import { DEFAULT_MODEL, estimateCost, isModelId, type Effort, type ModelId } from '@/lib/config';
import { renderPrompt } from '@/lib/render';
import { applyVariablesToSections, missingVariables } from '@/lib/variables';
import { recordRun } from '@/lib/repo';
import type { PromptSections } from '@/lib/sections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RunBody {
  versionId: string;
  sections: PromptSections;
  stack?: { category: string; items: string[] }[] | null;
  channelOverrides?: Record<string, 'system' | 'user'> | null;
  model?: string;
  effort?: Effort;
  variables?: Record<string, string>;
  testCaseId?: string | null;
}

/**
 * Streams a single run back to the browser as newline-delimited JSON.
 *
 * The API key is read here and nowhere else that the browser can reach.
 */
export async function POST(req: NextRequest) {
  let body: RunBody;
  try {
    body = (await req.json()) as RunBody;
  } catch {
    return jsonError('Malformed request body.', 400);
  }

  const model: ModelId = isModelId(body.model ?? '') ? (body.model as ModelId) : DEFAULT_MODEL;
  const variables = body.variables ?? {};

  // Variables must be resolved before a run — sending a literal {{placeholder}}
  // burns a call and quietly corrupts the result.
  const missing = missingVariables(body.sections, variables);
  if (missing.length > 0) {
    return jsonError(
      `Missing values for: ${missing.map((v) => `{{${v}}}`).join(', ')}`,
      400,
    );
  }

  const filled = applyVariablesToSections(body.sections, variables);
  const rendered = renderPrompt(filled, {
    stack: body.stack ?? undefined,
    channelOverrides: body.channelOverrides ?? undefined,
  });

  let built;
  try {
    built = buildRequest({ rendered, model, effort: body.effort });
  } catch (error) {
    return jsonError(toReadableError(error).message, 400);
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) =>
        controller.enqueue(encoder.encode(encodeEvent(event)));

      if (built.warnings.length > 0) {
        send({ type: 'warning', messages: built.warnings });
      }

      let text = '';

      try {
        const client = getClient();

        const finalMessage = await withRetry(
          async () => {
            // Retrying after tokens have reached the browser would duplicate
            // them, so a mid-stream failure is reported, never retried.
            if (text !== '') {
              throw Object.assign(new Error('Stream failed after partial output.'), {
                status: 499,
              });
            }

            const messageStream = client.messages.stream(built.request);

            for await (const event of messageStream) {
              if (event.type !== 'content_block_delta') continue;

              if (event.delta.type === 'text_delta') {
                text += event.delta.text;
                send({ type: 'delta', text: event.delta.text });
              } else if (event.delta.type === 'thinking_delta') {
                send({ type: 'thinking', text: event.delta.thinking });
              }
            }

            return await messageStream.finalMessage();
          },
          {
            onRetry: ({ attempt, delayMs, error }) =>
              send({ type: 'retry', attempt, delayMs, message: error.message }),
          },
        );

        const durationMs = Date.now() - startedAt;
        const usage = {
          input_tokens: finalMessage.usage.input_tokens,
          output_tokens: finalMessage.usage.output_tokens,
          cache_read_input_tokens: finalMessage.usage.cache_read_input_tokens,
          cache_creation_input_tokens: finalMessage.usage.cache_creation_input_tokens,
        };
        const costUsd = estimateCost(usage, model);

        const runId = recordRun({
          versionId: body.versionId,
          testCaseId: body.testCaseId ?? null,
          model,
          effort: body.effort ?? null,
          rendered,
          response: text,
          usage,
          durationMs,
          costUsd,
        });

        send({
          type: 'done',
          runId,
          usage,
          costUsd,
          durationMs,
          stopReason: finalMessage.stop_reason,
        });
      } catch (error) {
        const readable = toReadableError(error);

        // A failed run is still a run worth keeping — otherwise the history
        // silently omits everything that went wrong.
        try {
          recordRun({
            versionId: body.versionId,
            testCaseId: body.testCaseId ?? null,
            model,
            effort: body.effort ?? null,
            rendered,
            response: text || null,
            usage: null,
            durationMs: Date.now() - startedAt,
            costUsd: null,
            error: readable.message,
          });
        } catch {
          // Never let a bookkeeping failure mask the original error.
        }

        send({
          type: 'error',
          kind: readable.kind,
          message: readable.message,
          retryable: readable.retryable,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ type: 'error', message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
