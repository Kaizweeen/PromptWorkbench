import { NextRequest } from 'next/server';
import { getClient } from '@/lib/api/client';
import { encodeEvent, type RunEvent } from '@/lib/api/events';
import { toReadableError } from '@/lib/api/errors';
import { withRetry } from '@/lib/api/retry';
import { REFINE_SYSTEM_PROMPT } from '@/lib/prompts/refine';
import { parseRefineResponse } from '@/lib/refine';
import { DEFAULT_MODEL, MODELS, estimateCost, isModelId, type Effort, type ModelId } from '@/lib/config';
import { renderPrompt } from '@/lib/render';
import type { PromptSections } from '@/lib/sections';
import type { TechStack } from '@/lib/render';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RefineBody {
  sections: PromptSections;
  stack?: TechStack | null;
  model?: string;
  effort?: Effort;
}

/**
 * Stage B: send the draft to Claude and stream back a proposed revision.
 *
 * The response is JSON, so deltas are streamed only so the UI can show
 * progress — the parsed proposal arrives as a single `refined` event.
 */
export async function POST(req: NextRequest) {
  let body: RefineBody;
  try {
    body = (await req.json()) as RefineBody;
  } catch {
    return jsonError('Malformed request body.');
  }

  if (!body?.sections) return jsonError('Nothing to refine.');

  const model: ModelId = isModelId(body.model ?? '')
    ? (body.model as ModelId)
    : DEFAULT_MODEL;

  // Send the draft as its rendered text plus the raw sections, so the model
  // sees both what Claude would receive and the structure it must return.
  const rendered = renderPrompt(body.sections, { stack: body.stack ?? undefined });
  const userContent = [
    'Here is the current draft, rendered as it would be sent:',
    '',
    '<rendered_prompt>',
    `<system>\n${rendered.system}\n</system>`,
    `<user>\n${rendered.user}\n</user>`,
    '</rendered_prompt>',
    '',
    'And here are its structured sections, which is the shape you must return:',
    '',
    '<sections>',
    JSON.stringify(body.sections, null, 2),
    '</sections>',
    '',
    'Review it and return your revised sections as JSON.',
  ].join('\n');

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RunEvent) =>
        controller.enqueue(encoder.encode(encodeEvent(event)));

      let text = '';

      try {
        const client = getClient();
        const spec = MODELS[model];

        const request = {
          model,
          max_tokens: Math.min(16_000, spec.maxOutput),
          system: REFINE_SYSTEM_PROMPT,
          messages: [{ role: 'user' as const, content: userContent }],
          ...(spec.supportsEffort
            ? {
                thinking: { type: 'adaptive' as const },
                output_config: { effort: body.effort ?? ('high' as Effort) },
              }
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

        // A parse failure is the model's fault, not the user's — report it as
        // a readable error rather than throwing an unhandled exception.
        try {
          const result = parseRefineResponse(text);
          send({ type: 'refined', sections: result.sections, notes: result.notes });
        } catch (parseError) {
          send({
            type: 'error',
            kind: 'unknown',
            message: (parseError as Error).message,
            retryable: false,
          });
        }

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
