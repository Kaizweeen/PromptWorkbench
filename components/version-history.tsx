'use client';

/**
 * Version history with a section-level diff between any two versions.
 * Restore and fork both create new versions — nothing here is destructive.
 */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { diffSections } from '@/lib/diff';
import type { PromptSections, SectionKey, Channel } from '@/lib/sections';
import type { TechStack } from '@/lib/render';
import { forkPromptAction, restoreVersionAction } from '@/app/actions';
import { DiffView } from './diff-view';
import { Button, Empty, PaneTitle, relativeTime } from './ui';

export interface VersionSummary {
  id: string;
  number: number;
  message: string | null;
  createdAt: number;
  sections: PromptSections;
  stack: TechStack | null;
  channelOverrides: Partial<Record<SectionKey, Channel>> | null;
}

export function VersionHistory({
  promptId,
  versions,
}: {
  promptId: string;
  versions: VersionSummary[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Default to comparing the two most recent versions.
  const [left, setLeft] = useState(() => versions[1]?.id ?? versions[0]?.id ?? '');
  const [right, setRight] = useState(() => versions[0]?.id ?? '');

  const leftVersion = versions.find((v) => v.id === left);
  const rightVersion = versions.find((v) => v.id === right);

  const diffs = useMemo(
    () =>
      leftVersion && rightVersion
        ? diffSections(leftVersion.sections, rightVersion.sections)
        : [],
    [leftVersion, rightVersion],
  );

  function restore(versionId: string) {
    startTransition(async () => {
      await restoreVersionAction(promptId, versionId);
      router.refresh();
    });
  }

  function fork(versionId: string) {
    startTransition(async () => {
      await forkPromptAction(versionId);
    });
  }

  if (versions.length === 0) return <Empty>No versions yet.</Empty>;

  return (
    <>
      <PaneTitle
        right={
          <span className="font-mono text-[10px] text-[var(--color-faint)]">
            {versions.length} version{versions.length === 1 ? '' : 's'}
          </span>
        }
      >
        history
      </PaneTitle>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ul className="divide-y divide-[var(--color-border)]">
          {versions.map((v) => (
            <li key={v.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[var(--color-accent)]">
                  v{v.number}
                </span>
                <span className="truncate text-[12px] text-[var(--color-text)]">
                  {v.message ?? <span className="text-[var(--color-faint)]">no message</span>}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--color-faint)]">
                  {relativeTime(v.createdAt)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1">
                <SelectPill active={left === v.id} onClick={() => setLeft(v.id)}>
                  A
                </SelectPill>
                <SelectPill active={right === v.id} onClick={() => setRight(v.id)}>
                  B
                </SelectPill>
                <div className="ml-auto flex gap-1">
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => restore(v.id)}
                    title="Restore as a new version"
                  >
                    restore
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => fork(v.id)}
                    title="Fork into a new prompt"
                  >
                    fork
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {leftVersion && rightVersion && (
          <div className="border-t border-[var(--color-border-strong)]">
            <div className="bg-[var(--color-panel-2)] px-3 py-1.5 font-mono text-[10px] text-[var(--color-muted)]">
              diff v{leftVersion.number} → v{rightVersion.number}
            </div>
            <DiffView diffs={diffs} />
          </div>
        )}
      </div>
    </>
  );
}

function SelectPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border px-1.5 font-mono text-[10px]"
      style={{
        color: active ? 'var(--color-accent)' : 'var(--color-faint)',
        borderColor: active ? 'var(--color-accent)' : 'var(--color-border)',
      }}
    >
      {children}
    </button>
  );
}
