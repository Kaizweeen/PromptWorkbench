'use client';

/**
 * Test runner: cases, assertions, concurrent runs, and the pass/fail matrix
 * across versions.
 */

import { useCallback, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decodeEvents } from '@/lib/api/events';
import { MODELS, MODEL_ORDER, formatCost, type ModelId } from '@/lib/config';
import { DEFAULT_CONCURRENCY } from '@/lib/concurrency';
import type { MatrixCell } from '@/lib/repo';
import type { DetectedVariable } from '@/lib/variables';
import {
  createTestCaseAction,
  deleteTestCaseAction,
  updateTestCaseAction,
} from '@/app/actions';
import { ResultMatrix, type MatrixVersion } from './result-matrix';
import { TestCaseEditor, type TestCaseDraft } from './test-case-editor';
import { Button, Chip, PaneTitle } from './ui';
import { Notice } from './run-controls';

interface CaseStatus {
  passed: boolean;
  detail: string;
}

export function TestPanel({
  promptId,
  versionId,
  cases,
  versions,
  cells,
  variables,
  dirty,
}: {
  promptId: string;
  versionId: string;
  cases: TestCaseDraft[];
  versions: MatrixVersion[];
  cells: MatrixCell[];
  variables: DetectedVariable[];
  dirty: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(cases);
  const [model, setModel] = useState<ModelId>('claude-haiku-4-5');
  const [statuses, setStatuses] = useState<Record<string, CaseStatus>>({});
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState(0);
  const [busy, setBusy] = useState(false);

  const runSuite = useCallback(
    async (testCaseIds?: string[]) => {
      setError(null);
      setBusy(true);
      setProgress(null);
      setCost(0);

      try {
        const res = await fetch('/api/suite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            promptId,
            versionId,
            testCaseIds,
            model,
            concurrency: DEFAULT_CONCURRENCY,
          }),
        });

        if (!res.ok || !res.body) {
          const detail = await res.json().catch(() => ({ message: 'Suite failed.' }));
          setError(detail.message ?? 'Suite failed.');
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

          for (const raw of events) {
            const event = raw as unknown as Record<string, unknown>;
            if (event.type === 'suite_start') {
              setProgress({ completed: 0, total: Number(event.total) });
            } else if (event.type === 'progress') {
              setProgress({
                completed: Number(event.completed),
                total: Number(event.total),
              });
            } else if (event.type === 'case_done') {
              setStatuses((prev) => ({
                ...prev,
                [String(event.testCaseId)]: {
                  passed: Boolean(event.passed),
                  detail: String(event.detail ?? ''),
                },
              }));
              setCost((c) => c + Number(event.costUsd ?? 0));
            } else if (event.type === 'error') {
              setError(String(event.message ?? 'Suite failed.'));
            }
          }
        }

        router.refresh();
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [promptId, versionId, model, router],
  );

  function persist(next: TestCaseDraft) {
    setDrafts((prev) => prev.map((c) => (c.id === next.id ? next : c)));
    startTransition(async () => {
      await updateTestCaseAction(promptId, next.id, {
        name: next.name,
        inputs: next.inputs,
        assertion: next.assertion,
      });
    });
  }

  function addCase() {
    startTransition(async () => {
      const { id } = await createTestCaseAction(promptId, {
        name: `case ${drafts.length + 1}`,
        inputs: Object.fromEntries(variables.map((v) => [v.name, ''])),
      });
      setDrafts((prev) => [...prev, { id, name: `case ${prev.length + 1}`, inputs: {}, assertion: null }]);
      router.refresh();
    });
  }

  function removeCase(id: string) {
    setDrafts((prev) => prev.filter((c) => c.id !== id));
    startTransition(async () => {
      await deleteTestCaseAction(promptId, id);
      router.refresh();
    });
  }

  const passed = Object.values(statuses).filter((s) => s.passed).length;
  const failed = Object.values(statuses).filter((s) => !s.passed).length;

  return (
    <>
      <PaneTitle
        right={
          <div className="flex items-center gap-1.5">
            {cost > 0 && <Chip color="var(--color-muted)">{formatCost(cost)}</Chip>}
            <Button
              variant="primary"
              disabled={busy || drafts.length === 0}
              onClick={() => runSuite()}
            >
              {busy ? 'running…' : 'run suite'}
            </Button>
          </div>
        }
      >
        tests
      </PaneTitle>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-3 py-2">
          {MODEL_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setModel(id)}
              className="border px-1.5 py-0.5 font-mono text-[10px]"
              style={{
                color: model === id ? 'var(--color-accent)' : 'var(--color-muted)',
                borderColor: model === id ? 'var(--color-accent)' : 'var(--color-border)',
              }}
            >
              {MODELS[id].label}
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-[var(--color-faint)]">
            {DEFAULT_CONCURRENCY} at a time
          </span>
        </div>

        {progress && (
          <div className="border-b border-[var(--color-border)] px-3 py-1.5">
            <div className="mb-1 flex items-center justify-between font-mono text-[10px] text-[var(--color-muted)]">
              <span>
                {progress.completed} / {progress.total}
              </span>
              <span>
                <span style={{ color: 'var(--color-system)' }}>{passed} pass</span>
                {failed > 0 && (
                  <span style={{ color: '#f0757a' }}> · {failed} fail</span>
                )}
              </span>
            </div>
            <div className="h-0.5 w-full bg-[var(--color-border)]">
              <div
                className="h-full bg-[var(--color-accent)] transition-all"
                style={{ width: `${(progress.completed / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {dirty && (
          <Notice color="var(--color-user)">
            Unsaved edits — the suite runs the last saved version, not what is on screen.
          </Notice>
        )}
        {error && <Notice color="#f0757a">{error}</Notice>}

        {drafts.map((testCase) => (
          <TestCaseEditor
            key={testCase.id}
            testCase={testCase}
            variables={variables}
            status={statuses[testCase.id]}
            busy={busy}
            onChange={persist}
            onDelete={() => removeCase(testCase.id)}
            onRun={() => runSuite([testCase.id])}
          />
        ))}

        <div className="px-3 py-2">
          <Button variant="ghost" onClick={addCase}>
            + test case
          </Button>
        </div>

        <div className="border-t border-[var(--color-border-strong)]">
          <div className="bg-[var(--color-panel-2)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
            pass / fail across versions
          </div>
          <ResultMatrix cases={drafts} versions={versions} cells={cells} />
        </div>
      </div>
    </>
  );
}
