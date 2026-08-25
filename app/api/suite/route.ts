import { NextRequest } from 'next/server';
import { encodeEvent } from '@/lib/api/events';
import { toReadableError } from '@/lib/api/errors';
import { executePrompt, makeJudge } from '@/lib/api/execute';
import { evaluateAssertion } from '@/lib/assertions';
import { DEFAULT_CONCURRENCY, mapWithConcurrency } from '@/lib/concurrency';
import { SUITE_MODEL, isModelId, type Effort, type ModelId } from '@/lib/config';
import { renderPrompt } from '@/lib/render';
import { applyVariablesToSections } from '@/lib/variables';
import { getVersion, listTestCases, recordResult, recordRun } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SuiteBody {
  promptId: string;
  versionId: string;
  /** Omit to run the whole suite. */
  testCaseIds?: string[];
  model?: string;
  effort?: Effort;
  concurrency?: number;
}

/** Runs test cases concurrently against one version, streaming progress. */
export async function POST(req: NextRequest) {
  let body: SuiteBody;
  try {
    body = (await req.json()) as SuiteBody;
  } catch {
    return jsonError('Malformed request body.');
  }

  const version = getVersion(body.versionId);
  if (!version) return jsonError('Version not found.');

  const all = listTestCases(body.promptId);
  const cases = body.testCaseIds?.length
    ? all.filter((c) => body.testCaseIds!.includes(c.id))
    : all;

  if (cases.length === 0) return jsonError('No test cases to run.');

  const model: ModelId = isModelId(body.model ?? '')
    ? (body.model as ModelId)
    : SUITE_MODEL;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(encodeEvent(event as never)));

      send({ type: 'suite_start', total: cases.length, model });

      const judge = makeJudge();

      try {
        await mapWithConcurrency(
          cases,
          body.concurrency ?? DEFAULT_CONCURRENCY,
          async (testCase) => {
            send({ type: 'case_start', testCaseId: testCase.id, name: testCase.name });

            try {
              const filled = applyVariablesToSections(version.sections, testCase.inputs);
              const rendered = renderPrompt(filled, {
                stack: version.stack ?? undefined,
                channelOverrides: version.channelOverrides ?? undefined,
              });

              const result = await executePrompt({ rendered, model, effort: body.effort });

              const runId = recordRun({
                versionId: version.id,
                testCaseId: testCase.id,
                model,
                effort: body.effort ?? null,
                rendered,
                response: result.text,
                usage: result.usage,
                durationMs: result.durationMs,
                costUsd: result.costUsd,
              });

              const assertion = await evaluateAssertion(
                testCase.assertion,
                result.text,
                judge,
              );

              recordResult({
                runId,
                testCaseId: testCase.id,
                versionId: version.id,
                passed: assertion.passed,
                detail: assertion.detail,
              });

              send({
                type: 'case_done',
                testCaseId: testCase.id,
                name: testCase.name,
                passed: assertion.passed,
                detail: assertion.detail,
                costUsd: result.costUsd,
                durationMs: result.durationMs,
                output: result.text.slice(0, 2000),
              });
            } catch (error) {
              // One case failing must not abort the suite.
              const readable = toReadableError(error);

              try {
                const runId = recordRun({
                  versionId: version.id,
                  testCaseId: testCase.id,
                  model,
                  effort: body.effort ?? null,
                  rendered: { system: '', user: '' },
                  error: readable.message,
                });
                recordResult({
                  runId,
                  testCaseId: testCase.id,
                  versionId: version.id,
                  passed: false,
                  detail: readable.message,
                });
              } catch {
                // Bookkeeping failure must not mask the original error.
              }

              send({
                type: 'case_done',
                testCaseId: testCase.id,
                name: testCase.name,
                passed: false,
                detail: readable.message,
                costUsd: 0,
                durationMs: 0,
                output: '',
              });
            }

            return null;
          },
          (progress) => send({ type: 'progress', ...progress }),
        );

        send({ type: 'suite_done' });
      } catch (error) {
        send({ type: 'error', ...toReadableError(error) });
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
