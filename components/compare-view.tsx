'use client';

/**
 * A/B compare: two versions side by side, with a section-level diff and a
 * dual run against the same input.
 */

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decodeEvents } from '@/lib/api/events';
import { diffSections } from '@/lib/diff';
import { MODELS, MODEL_ORDER, formatCost, type ModelId } from '@/lib/config';
import { detectVariables } from '@/lib/variables';
import type { PromptSections } from '@/lib/sections';
import type { VersionChoice } from '@/lib/repo';
import { setComparisonWinnerAction } from '@/app/actions';
import { DiffView } from './diff-view';
import { Button, Chip, Empty, PaneTitle } from './ui';
import { Notice } from './run-controls';

export interface SideData extends VersionChoice {
  sections: PromptSections;
}

interface SideState {
  output: string;
  usage?: { input_tokens: number; output_tokens: number };
  costUsd?: number;
  durationMs?: number;
  error?: string;
}

const EMPTY: SideState = { output: '' };

export function CompareView({
  choices,
  left,
  right,
}: {
  choices: VersionChoice[];
  left: SideData | null;
  right: SideData | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [model, setModel] = useState<ModelId>('claude-sonnet-5');
  const [values, setValues] = useState<Record<string, string>>({});
  const [sides, setSides] = useState<{ left: SideState; right: SideState }>({
    left: EMPTY,
    right: EMPTY,
  });
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [winner, setWinner] = useState<'left' | 'right' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variables = useMemo(() => {
    if (!left || !right) return [];
    const names = new Map<string, ReturnType<typeof detectVariables>[number]>();
    for (const v of [...detectVariables(left.sections), ...detectVariables(right.sections)]) {
      if (!names.has(v.name)) names.set(v.name, v);
    }
    return [...names.values()];
  }, [left, right]);

  const diffs = useMemo(
    () => (left && right ? diffSections(left.sections, right.sections) : []),
    [left, right],
  );

  const missing = variables.filter((v) => (values[v.name] ?? '').trim() === '');

  const runBoth = useCallback(async () => {
    if (!left || !right) return;
    setBusy(true);
    setError(null);
    setWinner(null);
    setComparisonId(null);
    setSides({ left: EMPTY, right: EMPTY });

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leftVersionId: left.versionId,
          rightVersionId: right.versionId,
          variables: values,
          model,
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({ message: 'Compare failed.' }));
        setError(detail.message ?? 'Compare failed.');
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
          const e = raw as unknown as Record<string, unknown>;
          const side = e.side as 'left' | 'right' | undefined;

          if (e.type === 'delta' && side) {
            setSides((prev) => ({
              ...prev,
              [side]: { ...prev[side], output: prev[side].output + String(e.text) },
            }));
          } else if (e.type === 'side_done' && side) {
            setSides((prev) => ({
              ...prev,
              [side]: {
                ...prev[side],
                usage: e.usage as SideState['usage'],
                costUsd: Number(e.costUsd),
                durationMs: Number(e.durationMs),
              },
            }));
          } else if (e.type === 'compare_done') {
            setComparisonId(String(e.comparisonId));
          } else if (e.type === 'error') {
            if (side) {
              setSides((prev) => ({
                ...prev,
                [side]: { ...prev[side], error: String(e.message) },
              }));
            } else setError(String(e.message));
          }
        }
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [left, right, values, model, router]);

  function chooseWinner(side: 'left' | 'right') {
    const next = winner === side ? null : side;
    setWinner(next);
    if (comparisonId) {
      startTransition(async () => {
        await setComparisonWinnerAction(comparisonId, next);
      });
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3">
        <a
          href="/"
          className="font-mono text-[11px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
        >
          workbench
        </a>
        <span className="text-[var(--color-faint)]">/</span>
        <span className="text-[13px] font-medium text-[var(--color-text)]">compare</span>
        <div className="ml-auto flex items-center gap-1">
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
        </div>
      </header>

      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3 py-2">
        <Picker choices={choices} value={left?.versionId} param="left" label="A" />
        <Picker choices={choices} value={right?.versionId} param="right" label="B" />
        <Button
          variant="primary"
          disabled={!left || !right || busy || missing.length > 0}
          onClick={runBoth}
          title={
            missing.length > 0
              ? `Fill ${missing.map((v) => `{{${v.name}}}`).join(', ')} first`
              : 'Run both against the same input'
          }
        >
          {busy ? 'running…' : 'run both'}
        </Button>
      </div>

      {variables.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-1.5">
          {variables.map((v) => (
            <span key={v.name} className="flex items-center gap-1">
              <label className="font-mono text-[10px] text-[var(--color-accent)]">
                {`{{${v.name}}}`}
              </label>
              <input
                value={values[v.name] ?? ''}
                onChange={(e) => setValues((p) => ({ ...p, [v.name]: e.target.value }))}
                placeholder="shared input"
                className="w-44 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
            </span>
          ))}
        </div>
      )}

      {error && <Notice color="#f0757a">{error}</Notice>}

      {!left || !right ? (
        <Empty>Pick two versions to compare.</Empty>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden">
          <OutputSide
            label={`A · ${left.promptName} v${left.number}`}
            state={sides.left}
            winner={winner === 'left'}
            onWin={() => chooseWinner('left')}
            canChoose={comparisonId !== null}
          />
          <OutputSide
            label={`B · ${right.promptName} v${right.number}`}
            state={sides.right}
            winner={winner === 'right'}
            onWin={() => chooseWinner('right')}
            canChoose={comparisonId !== null}
            borderless
          />
        </div>
      )}

      {left && right && (
        <div className="max-h-[38vh] shrink-0 overflow-y-auto border-t border-[var(--color-border-strong)]">
          <div className="bg-[var(--color-panel-2)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
            prompt diff — A to B
          </div>
          <DiffView diffs={diffs} />
        </div>
      )}
    </div>
  );
}

function Picker({
  choices,
  value,
  param,
  label,
}: {
  choices: VersionChoice[];
  value?: string;
  param: string;
  label: string;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="font-mono text-[10px] text-[var(--color-faint)]">{label}</span>
      <select
        value={value ?? ''}
        onChange={(e) => {
          const url = new URL(window.location.href);
          url.searchParams.set(param, e.target.value);
          window.location.href = url.toString();
        }}
        className="max-w-[260px] border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
      >
        <option value="">select a version…</option>
        {choices.map((c) => (
          <option key={c.versionId} value={c.versionId}>
            {c.promptName} v{c.number}
          </option>
        ))}
      </select>
    </label>
  );
}

function OutputSide({
  label,
  state,
  winner,
  onWin,
  canChoose,
  borderless,
}: {
  label: string;
  state: SideState;
  winner: boolean;
  onWin: () => void;
  canChoose: boolean;
  borderless?: boolean;
}) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col ${borderless ? '' : 'border-r border-[var(--color-border)]'}`}
      style={{
        background: winner
          ? 'color-mix(in srgb, var(--color-system) 5%, transparent)'
          : undefined,
      }}
    >
      <PaneTitle
        right={
          <Button
            variant={winner ? 'primary' : 'ghost'}
            disabled={!canChoose}
            onClick={onWin}
            title={canChoose ? 'Record this side as the winner' : 'Run both first'}
          >
            {winner ? 'winner' : 'pick winner'}
          </Button>
        }
      >
        {label}
      </PaneTitle>

      {state.error && <Notice color="#f0757a">{state.error}</Notice>}

      <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--color-text)]">
        {state.output || (
          <span className="text-[var(--color-faint)]">no output yet</span>
        )}
      </pre>

      {state.usage && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[var(--color-border)] px-3 py-1.5">
          <Chip color="var(--color-muted)">
            {state.usage.input_tokens} in / {state.usage.output_tokens} out
          </Chip>
          <Chip color="var(--color-system)">{formatCost(state.costUsd ?? 0)}</Chip>
          <Chip color="var(--color-muted)">
            {((state.durationMs ?? 0) / 1000).toFixed(1)}s
          </Chip>
        </div>
      )}
    </section>
  );
}
