/** Prompt library: the leftmost pane. Server-rendered. */

import Link from 'next/link';
import type { PromptListItem } from '@/lib/repo';
import { createPromptAction } from '@/app/actions';
import { Chip, Empty, Pane, PaneTitle, relativeTime } from './ui';

export function LibraryPane({
  prompts,
  activeId,
}: {
  prompts: PromptListItem[];
  activeId?: string;
}) {
  return (
    <Pane className="bg-[var(--color-panel)]">
      <PaneTitle
        right={
          <span className="font-mono text-[10px] text-[var(--color-faint)]">
            {prompts.length}
          </span>
        }
      >
        library
      </PaneTitle>

      <form action={createPromptAction} className="flex gap-1 border-b border-[var(--color-border)] p-2">
        <input
          name="name"
          required
          placeholder="new prompt name"
          className="min-w-0 flex-1 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          className="border border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] px-2 font-mono text-[11px] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_25%,transparent)]"
        >
          +
        </button>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {prompts.length === 0 ? (
          <Empty>No prompts yet.</Empty>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {prompts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/prompts/${p.id}`}
                  className="block border-l-2 px-3 py-2 transition-colors hover:bg-[var(--color-panel-2)]"
                  style={{
                    borderColor:
                      p.id === activeId ? 'var(--color-accent)' : 'transparent',
                    background:
                      p.id === activeId ? 'var(--color-panel-2)' : undefined,
                  }}
                >
                  <div className="truncate text-[12px] text-[var(--color-text)]">
                    {p.name}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <Chip color="var(--color-faint)">{p.archetype}</Chip>
                    <Chip color="var(--color-muted)">v{p.latestVersionNumber}</Chip>
                    {p.tags.map((tag) => (
                      <Chip key={tag} color="var(--color-accent)">
                        {tag}
                      </Chip>
                    ))}
                    <span className="ml-auto font-mono text-[10px] text-[var(--color-faint)]">
                      {relativeTime(p.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Pane>
  );
}
