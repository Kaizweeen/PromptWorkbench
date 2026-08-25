'use client';

/**
 * Run panel: fill variables, pick a model and effort, stream the response.
 *
 * The API key never reaches here — this posts to /api/run, which owns the
 * client and the key.
 */

import { useCallback, useRef, useState } from 'react';
import { decodeEvents, type RunEvent } from '@/lib/api/events';
import { MODELS, formatCost, type Effort, type ModelId } from '@/lib/config';
import type { Channel, PromptSections, SectionKey } from '@/lib/sections';
import type { TechStack } from '@/lib/render';
import type { DetectedVariable } from '@/lib/variables';
import { Button, Chip, PaneTitle } from './ui';
import { Notice, RunControls, VariableInputs } from './run-controls';

interface RunStats {
  usage: { input_tokens: number; output_tokens: number };
  costUsd: number;
  durationMs: number;
  stopReason: string | null;
}

export function RunPanel({
  versionId,
  sections,
  stack,
  channelOverrides,
  variables,
  dirty,
}: {
  versionId: string;
  sections: PromptSections;
  stack: TechStack;
  channelOverrides: Partial<Record<SectionKey, Channel>> | null;
  variables: DetectedVariable[];
  dirty: boolean;
}) {
  const [model, setModel] = useState<ModelId>('claude-opus-5');
  const [effort, setEffort] = useState<Effort>('high');
  const [values, setValues] = useState<Record<string, string>>({});
  const [output, setOutput] = useState('');
  const [thinking, setThinking] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [running, setRunning] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const missing = variables.filter((v) => (values[v.name] ?? '').trim() === '');
  const supportsEffort = MODELS[model].supportsEffort;

  const run = useCallback(async () => {
    setOutput('');
    setThinking('');
    setWarnings([]);
    setRetryNote(null);
    setError(null);
    setStats(null);
    setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          versionId,
          sections,
          stack,
          channelOverrides,
          model,
          effort: supportsEffort ? effort : undefined,
          variables: values,
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({ message: 'Run failed.' }));
        setError(detail.message ?? 'Run failed.');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = decodeEvents(buffer);
        buffer = rest;
        for (const event of events) apply(event);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message || 'Run failed.');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }

    function apply(event: RunEvent) {
      switch (event.type) {
        case 'delta':
          setOutput((prev) => prev + event.text);
          break;
        case 'thinking':
          setThinking((prev) => prev + event.text);
          break;
        case 'warning':
          setWarnings(event.messages);
          break;
        case 'retry':
          setRetryNote(
            `${event.message} Attempt ${event.attempt + 1} in ${Math.round(event.delayMs / 1000)}s…`,
          );
          break;
        case 'done':
          setRetryNote(null);
          setStats({
            usage: event.usage,
            costUsd: event.costUsd,
            durationMs: event.durationMs,
            stopReason: event.stopReason,
          });
          break;
        case 'error':
          setError(event.message);
          break;
      }
    }
  }, [versionId, sections, stack, channelOverrides, model, effort, supportsEffort, values]);

  return (
    <>
      <PaneTitle
        right={
          running ? (
            <Button onClick={() => abortRef.current?.abort()}>stop</Button>
          ) : (
            <Button
              variant="primary"
              onClick={run}
              disabled={missing.length > 0}
              title={
                missing.length > 0
                  ? `Fill ${missing.map((v) => `{{${v.name}}}`).join(', ')} first`
                  : 'Run this prompt'
              }
            >
              run
            </Button>
          )
        }
      >
        run
      </PaneTitle>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <RunControls
          model={model}
          onModel={setModel}
          effort={effort}
          onEffort={setEffort}
          supportsEffort={supportsEffort}
        />

        <VariableInputs variables={variables} values={values} onChange={setValues} />

        {dirty && (
          <Notice color="var(--color-user)">
            Unsaved edits — this run uses what is on screen, but is recorded against
            the last saved version.
          </Notice>
        )}
        {warnings.map((w) => (
          <Notice key={w} color="var(--color-prefill)">
            {w}
          </Notice>
        ))}
        {retryNote && <Notice color="var(--color-user)">{retryNote}</Notice>}
        {error && <Notice color="#f0757a">{error}</Notice>}

        {thinking !== '' && (
          <details className="border-b border-[var(--color-border)] px-3 py-2">
            <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
              thinking
            </summary>
            <pre className="mt-1.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--color-muted)]">
              {thinking}
            </pre>
          </details>
        )}

        <pre className="whitespace-pre-wrap break-words px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--color-text)]">
          {output ||
            (running ? (
              <span className="text-[var(--color-faint)]">waiting for first token…</span>
            ) : (
              <span className="text-[var(--color-faint)]">
                No output yet. Press run.
              </span>
            ))}
        </pre>
      </div>

      {stats && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[var(--color-border-strong)] bg-[var(--color-panel)] px-3 py-1.5">
          <Chip color="var(--color-muted)">
            {stats.usage.input_tokens} in / {stats.usage.output_tokens} out
          </Chip>
          <Chip color="var(--color-system)">{formatCost(stats.costUsd)}</Chip>
          <Chip color="var(--color-muted)">{(stats.durationMs / 1000).toFixed(1)}s</Chip>
          {stats.stopReason && stats.stopReason !== 'end_turn' && (
            <Chip color="var(--color-user)">{stats.stopReason}</Chip>
          )}
          <span className="ml-auto font-mono text-[10px] text-[var(--color-faint)]">
            {MODELS[model].id}
          </span>
        </div>
      )}
    </>
  );
}
