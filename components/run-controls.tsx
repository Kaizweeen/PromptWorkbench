'use client';

/** Model, effort, and per-run variable inputs for the run panel. */

import {
  EFFORT_LEVELS,
  MODELS,
  MODEL_ORDER,
  type Effort,
  type ModelId,
} from '@/lib/config';
import type { DetectedVariable } from '@/lib/variables';

export function RunControls({
  model,
  onModel,
  effort,
  onEffort,
  supportsEffort,
}: {
  model: ModelId;
  onModel: (id: ModelId) => void;
  effort: Effort;
  onEffort: (e: Effort) => void;
  supportsEffort: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[var(--color-border)] px-3 py-2">
      {MODEL_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onModel(id)}
          title={MODELS[id].blurb}
          className="border px-1.5 py-0.5 font-mono text-[10px] transition-colors"
          style={{
            color: model === id ? 'var(--color-accent)' : 'var(--color-muted)',
            borderColor: model === id ? 'var(--color-accent)' : 'var(--color-border)',
          }}
        >
          {MODELS[id].label}
        </button>
      ))}
      <span className="ml-2 font-mono text-[10px] text-[var(--color-faint)]">effort</span>
      {EFFORT_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          disabled={!supportsEffort}
          onClick={() => onEffort(level)}
          title={supportsEffort ? undefined : `${MODELS[model].label} has no effort setting`}
          className="border px-1.5 py-0.5 font-mono text-[10px] transition-colors disabled:opacity-30"
          style={{
            color:
              supportsEffort && effort === level
                ? 'var(--color-accent)'
                : 'var(--color-faint)',
            borderColor:
              supportsEffort && effort === level
                ? 'var(--color-accent)'
                : 'var(--color-border)',
          }}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

export function VariableInputs({
  variables,
  values,
  onChange,
}: {
  variables: DetectedVariable[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  if (variables.length === 0) return null;

  return (
    <div className="space-y-1 border-b border-[var(--color-border)] px-3 py-2">
      <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
        variables
      </div>
      {variables.map((v) => (
        <div key={v.name} className="flex items-center gap-1.5">
          <label className="w-32 shrink-0 truncate font-mono text-[11px] text-[var(--color-accent)]">
            {`{{${v.name}}}`}
          </label>
          <input
            value={values[v.name] ?? ''}
            onChange={(e) => onChange({ ...values, [v.name]: e.target.value })}
            placeholder="value for this run"
            className="min-w-0 flex-1 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
        </div>
      ))}
    </div>
  );
}

export function Notice({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <p
      className="border-b border-[var(--color-border)] px-3 py-1.5 font-mono text-[10px] leading-relaxed"
      style={{ color, background: `color-mix(in srgb, ${color} 8%, transparent)` }}
    >
      {children}
    </p>
  );
}
