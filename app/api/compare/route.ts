import { NextRequest } from 'next/server';
import { getClient } from '@/lib/api/client';
import { encodeEvent } from '@/lib/api/events';
import { toReadableError } from '@/lib/api/errors';
import { buildRequest } from '@/lib/api/request';
import { withRetry } from '@/lib/api/retry';
import { DEFAULT_MODEL, estimateCost, isModelId, type Effort, type ModelId } from '@/lib/config';
import { renderPrompt } from '@/lib/render';
import { applyVariablesToSections, missingVariables } from '@/lib/variables';
import { createComparison, getVersion, recordRun } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Side = 'left' | 'right';

interface CompareBody {
  leftVersionId: string;
  rightVersionId: string;
  variables?: Record<string, string>;
  model?: string;
  effort?: Effort;
}

/**
 * Runs two versions against the same input in one action, streaming both
 * outputs at once. Each event carries the side it belongs to.
 */
export async function POST(req: NextRequest) {
  let body: CompareBody;
  try {
    body = (await req.json()) as CompareBody;
  } catch {
    return jsonError('Malformed request body.');
  }

  const left = getVersion(body.leftVersionId);
  const right = getVersion(body.rightVersionId);
  if (!left || !right) return jsonError('Pick two versions to compare.');

  const model: ModelId = isModelId(body.model ?? '')
    ? (body.model as ModelId)
    : DEFAULT_MODEL;
  const variables = body.variables ?? {};

  // Both sides must have every variable they use, or the comparison is not
  // like-for-like.
  const missing = [
    ...new Set([
      ...missingVariables(left.sections, variables),
      ...missingVariables(right.sections, variables),
    ]),
  ];
  if (missing.length > 0) {
    return jsonError(`Missing values for: ${missing.map((v) => `{{${v}}}`).join(', ')}`);
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(encodeEvent(event as never)));

      async function runSide(side: Side, version: NonNullable<typeof left>) {
        const startedAt = Date.now();
        let text = '';

        const filled = applyVariablesToSections(version.sections, variables);
        const rendered = renderPrompt(filled, {
          stack: version.stack ?? undefined,
          channelOverrides: version.channelOverrides ?? undefined,
        });

        try {
          const { request, warnings } = buildRequest({ rendered, model, effort: body.effort });
          if (warnings.length > 0) send({ type: 'warning', side, messages: warnings });

          const client = getClient();

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
                  send({ type: 'delta', side, text: event.delta.text });
                }
              }
              return await messageStream.finalMessage();
            },
            {
              onRetry: ({ attempt, delayMs, error }) =>
                send({ type: 'retry', side, attempt, delayMs, message: error.message }),
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
            versionId: version.id,
            model,
            effort: body.effort ?? null,
            rendered,
            response: text,
            usage,
            durationMs,
            costUsd,
          });

          send({ type: 'side_done', side, usage, costUsd, durationMs });
          return runId;
        } catch (error) {
          const readable = toReadableError(error);
          send({ type: 'error', side, message: readable.message });
          return null;
        }
      }

      try {
        // Both sides run at once — the point is a like-for-like comparison,
        // and running them in sequence doubles the wait for no benefit.
        const [leftRunId, rightRunId] = await Promise.all([
          runSide('left', left),
          runSide('right', right),
        ]);

        const comparisonId = createComparison({
          leftVersionId: left.id,
          rightVersionId: right.id,
          inputs: variables,
          leftRunId,
          rightRunId,
        });

        send({ type: 'compare_done', comparisonId });
      } catch (error) {
        send({ type: 'error', message: toReadableError(error).message });
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
