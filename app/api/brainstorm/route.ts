import { NextRequest } from 'next/server';
import { getClient } from '@/lib/api/client';
import { encodeEvent, type RunEvent } from '@/lib/api/events';
import { toReadableError } from '@/lib/api/errors';
import { withRetry } from '@/lib/api/retry';
import { BRAINSTORM_SYSTEM_PROMPT } from '@/lib/prompts/brainstorm';
import { ITERATION_MODEL, MODELS, estimateCost, isModelId, type ModelId } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BrainstormBody {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  model?: string;
}

/**
 * The brainstorm interview. Streams Claude's reply, including the
 * <requirements> block the client parses out of it.
 */
export async function POST(req: NextRequest) {
  let body: BrainstormBody;
  try {
    body = (await req.json()) as BrainstormBody;
  } catch {
    return jsonError('Malformed request body.');
  }

  const messages = (body.messages ?? []).filter(
    (m) => typeof m.content === 'string' && m.content.trim() !== '',
  );
  if (messages.length === 0) return jsonError('Say something to start the interview.');

  const model: ModelId = isModelId(body.model ?? '')
    ? (body.model as ModelId)
    : ITERATION_MODEL;

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) =>
        controller.enqueue(encoder.encode(encodeEvent(event)));

      let text = '';

      try {
        const client = getClient();

        const request = {
          model,
          max_tokens: Math.min(8_000, MODELS[model].maxOutput),
          system: BRAINSTORM_SYSTEM_PROMPT,
          messages,
          ...(MODELS[model].supportsEffort
            ? { thinking: { type: 'adaptive' as const }, output_config: { effort: 'medium' as const } }
            : {}),
        };

        const finalMessage = await withRetry(
          async () => {
            if (text !== '') {
              throw Object.assign(new Error('Stream failed after partial output.'), {
                status: 499,
              });
            }

            const messageStream = client.messages.stream(request);

            for await (const event of messageStream) {
              if (
                event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta'
              ) {
                text += event.delta.text;
                send({ type: 'delta', text: event.delta.text });
              }
            }

            return await messageStream.finalMessage();
          },
          {
            onRetry: ({ attempt, delayMs, error }) =>
              send({ type: 'retry', attempt, delayMs, message: error.message }),
          },
        );

        const usage = {
          input_tokens: finalMessage.usage.input_tokens,
          output_tokens: finalMessage.usage.output_tokens,
          cache_read_input_tokens: finalMessage.usage.cache_read_input_tokens,
          cache_creation_input_tokens: finalMessage.usage.cache_creation_input_tokens,
        };

        send({
          type: 'done',
          runId: '',
          usage,
          costUsd: estimateCost(usage, model),
          durationMs: Date.now() - startedAt,
          stopReason: finalMessage.stop_reason,
        });
      } catch (error) {
        const readable = toReadableError(error);
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

function jsonError(message: string) {
  return new Response(JSON.stringify({ type: 'error', message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
