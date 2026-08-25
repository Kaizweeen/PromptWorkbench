'use client';

/** The version pickers and one output column of the A/B compare view. */

import { formatCost } from '@/lib/config';
import type { VersionChoice } from '@/lib/repo';
import { Button, Chip, PaneTitle } from './ui';
import { Notice } from './run-controls';

export interface SideState {
  output: string;
  usage?: { input_tokens: number; output_tokens: number };
  costUsd?: number;
  durationMs?: number;
  error?: string;
}

export function Picker({
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

export function OutputSide({
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
