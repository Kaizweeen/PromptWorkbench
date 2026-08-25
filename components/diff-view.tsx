'use client';

/** Section-level diff between two versions, with word-level highlighting. */

import { useState } from 'react';
import { changedSections, summarizeDiff, type SectionDiff } from '@/lib/diff';
import { Chip } from './ui';

const STATUS_COLOR: Record<string, string> = {
  added: 'var(--color-system)',
  removed: '#f0757a',
  changed: 'var(--color-user)',
  unchanged: 'var(--color-faint)',
};

export function DiffView({ diffs }: { diffs: SectionDiff[] }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const summary = summarizeDiff(diffs);
  const visible = showUnchanged ? diffs : changedSections(diffs);

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
        {summary.identical ? (
          <span className="font-mono text-[10px] text-[var(--color-faint)]">
            these versions render identically
          </span>
        ) : (
          <>
            <Chip color={STATUS_COLOR.added}>+{summary.added}</Chip>
            <Chip color={STATUS_COLOR.changed}>~{summary.changed}</Chip>
            <Chip color={STATUS_COLOR.removed}>−{summary.removed}</Chip>
          </>
        )}
        <button
          type="button"
          onClick={() => setShowUnchanged((v) => !v)}
          className="ml-auto font-mono text-[10px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
        >
          {showUnchanged ? 'hide' : 'show'} unchanged ({summary.unchanged})
        </button>
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {visible.map((d) => (
          <SectionDiffBlock key={d.key} diff={d} />
        ))}
      </div>
    </div>
  );
}

function SectionDiffBlock({ diff }: { diff: SectionDiff }) {
  const color = STATUS_COLOR[diff.status];

  return (
    <div className="px-3 py-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[var(--color-text)]">{diff.label}</span>
        <Chip color={color}>{diff.status}</Chip>
      </div>

      {diff.status === 'unchanged' && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--color-faint)]">
          {diff.before || '(empty)'}
        </pre>
      )}

      {diff.status === 'added' && <Block body={diff.after} tone="add" />}
      {diff.status === 'removed' && <Block body={diff.before} tone="del" />}

      {diff.status === 'changed' && (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
          {diff.hunks.map((hunk, i) => (
            <span
              key={i}
              className={
                hunk.added
                  ? 'bg-[color-mix(in_srgb,var(--color-system)_22%,transparent)] text-[var(--color-system)]'
                  : hunk.removed
                    ? 'bg-[color-mix(in_srgb,#f0757a_18%,transparent)] text-[#f0757a] line-through'
                    : 'text-[var(--color-muted)]'
              }
            >
              {hunk.value}
            </span>
          ))}
        </pre>
      )}
    </div>
  );
}

function Block({ body, tone }: { body: string; tone: 'add' | 'del' }) {
  const cls =
    tone === 'add'
      ? 'bg-[color-mix(in_srgb,var(--color-system)_12%,transparent)] text-[var(--color-system)]'
      : 'bg-[color-mix(in_srgb,#f0757a_10%,transparent)] text-[#f0757a] line-through';

  return (
    <pre
      className={`overflow-x-auto whitespace-pre-wrap break-words px-2 py-1 font-mono text-[11px] leading-relaxed ${cls}`}
    >
      {body}
    </pre>
  );
}
