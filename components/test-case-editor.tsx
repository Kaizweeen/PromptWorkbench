'use client';

/** Editing one test case: name, variable values, and its assertion. */

import type { AssertionSpec } from '@/lib/db/schema';
import type { DetectedVariable } from '@/lib/variables';
import { Button, Chip } from './ui';

const ASSERTION_TYPES = [
  'none', 'contains', 'not_contains', 'regex',
  'valid_json', 'json_schema', 'llm_judge',
] as const;

export interface TestCaseDraft {
  id: string;
  name: string;
  inputs: Record<string, string>;
  assertion: AssertionSpec | null;
}

const INPUT =
  'min-w-0 flex-1 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]';

export function TestCaseEditor({
  testCase,
  variables,
  status,
  onChange,
  onDelete,
  onRun,
  busy,
}: {
  testCase: TestCaseDraft;
  variables: DetectedVariable[];
  status?: { passed: boolean; detail: string };
  onChange: (next: TestCaseDraft) => void;
  onDelete: () => void;
  onRun: () => void;
  busy: boolean;
}) {
  const type = testCase.assertion?.type ?? 'none';

  function setType(next: string) {
    if (next === 'none') return onChange({ ...testCase, assertion: null });
    if (next === 'contains' || next === 'not_contains') {
      return onChange({ ...testCase, assertion: { type: next, value: '' } });
    }
    if (next === 'regex') {
      return onChange({ ...testCase, assertion: { type: 'regex', pattern: '' } });
    }
    if (next === 'valid_json') {
      return onChange({ ...testCase, assertion: { type: 'valid_json' } });
    }
    if (next === 'json_schema') {
      return onChange({ ...testCase, assertion: { type: 'json_schema', schema: {} } });
    }
    return onChange({
      ...testCase,
      assertion: { type: 'llm_judge', rubric: '', threshold: 4 },
    });
  }

  function patchAssertion(patch: Record<string, unknown>) {
    if (!testCase.assertion) return;
    onChange({
      ...testCase,
      assertion: { ...testCase.assertion, ...patch } as AssertionSpec,
    });
  }

  return (
    <div className="border-b border-[var(--color-border)] px-3 py-2">
      <div className="mb-1.5 flex items-center gap-1.5">
        <input
          value={testCase.name}
          onChange={(e) => onChange({ ...testCase, name: e.target.value })}
          placeholder="case name"
          className={INPUT}
        />
        {status && (
          <Chip
            color={status.passed ? 'var(--color-system)' : '#f0757a'}
            title={status.detail}
          >
            {status.passed ? 'pass' : 'fail'}
          </Chip>
        )}
        <Button onClick={onRun} disabled={busy}>
          run
        </Button>
        <Button variant="ghost" onClick={onDelete}>
          ×
        </Button>
      </div>

      {variables.map((v) => (
        <div key={v.name} className="mb-1 flex items-center gap-1.5">
          <label className="w-28 shrink-0 truncate font-mono text-[10px] text-[var(--color-accent)]">
            {`{{${v.name}}}`}
          </label>
          <input
            value={testCase.inputs[v.name] ?? ''}
            onChange={(e) =>
              onChange({
                ...testCase,
                inputs: { ...testCase.inputs, [v.name]: e.target.value },
              })
            }
            placeholder="value"
            className={INPUT}
          />
        </div>
      ))}

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {ASSERTION_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className="border px-1.5 py-0.5 font-mono text-[10px]"
            style={{
              color: type === t ? 'var(--color-accent)' : 'var(--color-faint)',
              borderColor: type === t ? 'var(--color-accent)' : 'var(--color-border)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <AssertionFields assertion={testCase.assertion} patch={patchAssertion} />

      {status && (
        <p
          className="mt-1 font-mono text-[10px] leading-relaxed"
          style={{ color: status.passed ? 'var(--color-system)' : '#f0757a' }}
        >
          {status.detail}
        </p>
      )}
    </div>
  );
}

function AssertionFields({
  assertion,
  patch,
}: {
  assertion: AssertionSpec | null;
  patch: (p: Record<string, unknown>) => void;
}) {
  if (!assertion) {
    return (
      <p className="mt-1 font-mono text-[10px] text-[var(--color-faint)]">
        No assertion — passes if the run produces any output.
      </p>
    );
  }

  if (assertion.type === 'contains' || assertion.type === 'not_contains') {
    return (
      <div className="mt-1 flex items-center gap-1.5">
        <input
          value={assertion.value}
          onChange={(e) => patch({ value: e.target.value })}
          placeholder="text the output must contain"
          className={INPUT}
        />
        <label className="flex shrink-0 items-center gap-1 font-mono text-[10px] text-[var(--color-faint)]">
          <input
            type="checkbox"
            checked={assertion.caseSensitive ?? false}
            onChange={(e) => patch({ caseSensitive: e.target.checked })}
          />
          case
        </label>
      </div>
    );
  }

  if (assertion.type === 'regex') {
    return (
      <div className="mt-1 flex items-center gap-1.5">
        <input
          value={assertion.pattern}
          onChange={(e) => patch({ pattern: e.target.value })}
          placeholder="pattern"
          className={INPUT}
        />
        <input
          value={assertion.flags ?? ''}
          onChange={(e) => patch({ flags: e.target.value })}
          placeholder="flags"
          className="w-16 shrink-0 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
      </div>
    );
  }

  if (assertion.type === 'json_schema') {
    return (
      <textarea
        rows={3}
        value={JSON.stringify(assertion.schema ?? {}, null, 2)}
        onChange={(e) => {
          try {
            patch({ schema: JSON.parse(e.target.value) });
          } catch {
            // Keep the last valid schema while the user is mid-edit.
          }
        }}
        className="mt-1 w-full resize-y border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
      />
    );
  }

  if (assertion.type === 'llm_judge') {
    return (
      <div className="mt-1 flex items-start gap-1.5">
        <textarea
          rows={2}
          value={assertion.rubric}
          onChange={(e) => patch({ rubric: e.target.value })}
          placeholder="rubric — what makes this output good?"
          className={`${INPUT} resize-y`}
        />
        <select
          value={assertion.threshold ?? 4}
          onChange={(e) => patch({ threshold: Number(e.target.value) })}
          className="shrink-0 border border-[var(--color-border)] bg-[var(--color-bg)] px-1 py-1 font-mono text-[10px] text-[var(--color-text)]"
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              ≥{n}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <p className="mt-1 font-mono text-[10px] text-[var(--color-faint)]">
      Passes when the output parses as JSON.
    </p>
  );
}
